package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

// Phase represents a recon pipeline phase
type Phase struct {
	Name    string
	Run     func(ctx *ReconCtx) error
	Depends []string // output files this phase needs
}

// ReconCtx holds the context for a recon run
type ReconCtx struct {
	Domain     string
	OutputDir  string
	StartTime  time.Time
	Severity   string
	SkipNuclei bool
}

func main() {
	domain := flag.String("d", "", "Target domain (required)")
	severity := flag.String("severity", "medium,high,critical", "Nuclei severity filter")
	skipNuclei := flag.Bool("skip-nuclei", false, "Skip nuclei vulnerability scan")
	listPhases := flag.Bool("list", false, "List available phases")
	flag.Parse()

	if *listPhases {
		printPhases()
		return
	}

	if *domain == "" {
		fmt.Fprintln(os.Stderr, "Usage: go run recon.go -d <domain>")
		fmt.Fprintln(os.Stderr, "")
		fmt.Fprintln(os.Stderr, "Flags:")
		flag.PrintDefaults()
		os.Exit(1)
	}

	ctx := &ReconCtx{
		Domain:     *domain,
		StartTime:  time.Now(),
		Severity:   *severity,
		SkipNuclei: *skipNuclei,
	}

	// Create timestamped output directory
	ts := ctx.StartTime.Format("20060102-150405")
	ctx.OutputDir = filepath.Join("recon", fmt.Sprintf("%s_%s", *domain, ts))
	if err := os.MkdirAll(ctx.OutputDir, 0o755); err != nil {
		fatal("Failed to create output dir: %v", err)
	}

	banner(ctx)

	phases := []Phase{
		{Name: "Subdomain Enumeration", Run: phaseSubdomains},
		{Name: "Live Host Probing", Run: phaseLiveHosts, Depends: []string{"subdomains.txt"}},
		{Name: "URL Collection", Run: phaseURLs, Depends: []string{"live.txt"}},
		{Name: "Vulnerability Scan", Run: phaseNuclei, Depends: []string{"live.txt"}},
		{Name: "Summary Report", Run: phaseSummary},
	}

	for i, p := range phases {
		if p.Name == "Vulnerability Scan" && ctx.SkipNuclei {
			info("[%d/%d] Skipping %s (--skip-nuclei)", i+1, len(phases), p.Name)
			continue
		}

		// Check dependencies
		for _, dep := range p.Depends {
			depPath := filepath.Join(ctx.OutputDir, dep)
			if _, err := os.Stat(depPath); os.IsNotExist(err) {
				warn("[%d/%d] Skipping %s — missing dependency: %s", i+1, len(phases), p.Name, dep)
				continue
			}
		}

		info("[%d/%d] %s", i+1, len(phases), p.Name)
		if err := p.Run(ctx); err != nil {
			warn("  Phase failed: %v", err)
		}
	}

	elapsed := time.Since(ctx.StartTime).Round(time.Second)
	info("Recon complete in %s — results: %s/", elapsed, ctx.OutputDir)
}

// --- Phases ---

func phaseSubdomains(ctx *ReconCtx) error {
	out := filepath.Join(ctx.OutputDir, "subdomains.txt")

	// Run subfinder
	if err := run("subfinder", "-d", ctx.Domain, "-silent", "-all", "-o", out); err != nil {
		warn("  subfinder failed: %v", err)
	}

	// Query crt.sh for additional subdomains
	info("  Querying crt.sh...")
	crtSubs := queryCrtSh(ctx.Domain)

	// Merge subfinder + crt.sh results
	existing := loadLines(out)
	seen := make(map[string]bool)
	var merged []string
	for _, s := range append(existing, crtSubs...) {
		s = strings.TrimSpace(strings.ToLower(s))
		if s != "" && !seen[s] {
			seen[s] = true
			merged = append(merged, s)
		}
	}
	sort.Strings(merged)
	os.WriteFile(out, []byte(strings.Join(merged, "\n")+"\n"), 0o644)

	count := lineCount(out)
	info("  Found %d subdomains (subfinder: %d, crt.sh: %d)", count, len(existing), len(crtSubs))
	return nil
}

func phaseLiveHosts(ctx *ReconCtx) error {
	subsFile := filepath.Join(ctx.OutputDir, "subdomains.txt")
	out := filepath.Join(ctx.OutputDir, "live.txt")
	detailOut := filepath.Join(ctx.OutputDir, "live-detail.txt")

	// httpx probe with tech detection
	if err := runPipe(subsFile, "httpx", "-silent", "-status-code", "-title", "-tech-detect", "-o", detailOut); err != nil {
		return fmt.Errorf("httpx detail: %w", err)
	}

	// Simple URL list for downstream tools
	if err := runPipe(subsFile, "httpx", "-silent", "-o", out); err != nil {
		return fmt.Errorf("httpx: %w", err)
	}

	count := lineCount(out)
	info("  %d live hosts detected", count)
	return nil
}

func phaseURLs(ctx *ReconCtx) error {
	liveFile := filepath.Join(ctx.OutputDir, "live.txt")
	allURLs := filepath.Join(ctx.OutputDir, "urls-all.txt")
	katanaOut := filepath.Join(ctx.OutputDir, "urls-katana.txt")
	gauOut := filepath.Join(ctx.OutputDir, "urls-gau.txt")

	// Katana crawl (depth 3)
	_ = runPipe(liveFile, "katana", "-silent", "-d", "3", "-jc", "-o", katanaOut)

	// gau (wayback + common crawl)
	_ = run("gau", "--subs", ctx.Domain, "--o", gauOut)

	// Merge and deduplicate
	mergeFiles(allURLs, katanaOut, gauOut)

	count := lineCount(allURLs)
	info("  Collected %d unique URLs", count)
	return nil
}

func phaseNuclei(ctx *ReconCtx) error {
	liveFile := filepath.Join(ctx.OutputDir, "live.txt")
	out := filepath.Join(ctx.OutputDir, "nuclei-results.txt")

	args := []string{
		"-l", liveFile,
		"-severity", ctx.Severity,
		"-silent",
		"-o", out,
		"-rate-limit", "100",
	}

	if err := run("nuclei", args...); err != nil {
		return fmt.Errorf("nuclei: %w", err)
	}

	count := lineCount(out)
	if count > 0 {
		success("  🎯 %d potential vulnerabilities found!", count)
	} else {
		info("  No vulnerabilities found at %s severity", ctx.Severity)
	}
	return nil
}

func phaseSummary(ctx *ReconCtx) error {
	reportPath := filepath.Join(ctx.OutputDir, "SUMMARY.md")

	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("# Recon Report: %s\n\n", ctx.Domain))
	sb.WriteString(fmt.Sprintf("**Date**: %s\n", ctx.StartTime.Format("2006-01-02 15:04:05")))
	sb.WriteString(fmt.Sprintf("**Duration**: %s\n\n", time.Since(ctx.StartTime).Round(time.Second)))
	sb.WriteString("## Results\n\n")
	sb.WriteString(fmt.Sprintf("| File | Lines | Description |\n"))
	sb.WriteString(fmt.Sprintf("|------|-------|-------------|\n"))

	files := []struct {
		name string
		desc string
	}{
		{"subdomains.txt", "Discovered subdomains"},
		{"live.txt", "Live HTTP hosts"},
		{"live-detail.txt", "Live hosts with status/title/tech"},
		{"urls-all.txt", "Collected URLs (katana + gau)"},
		{"nuclei-results.txt", "Nuclei vulnerability findings"},
	}

	for _, f := range files {
		path := filepath.Join(ctx.OutputDir, f.name)
		count := lineCount(path)
		sb.WriteString(fmt.Sprintf("| `%s` | %d | %s |\n", f.name, count, f.desc))
	}

	sb.WriteString("\n## Next Steps\n\n")
	sb.WriteString("1. Review `live-detail.txt` for interesting tech stacks\n")
	sb.WriteString("2. Check `nuclei-results.txt` for confirmed vulnerabilities\n")
	sb.WriteString("3. Manually test high-value endpoints from `urls-all.txt`\n")
	sb.WriteString("4. Run targeted scans: `nuclei -l live.txt -tags idor,ssrf,auth-bypass`\n")
	sb.WriteString("5. Open Burp Suite and import `live.txt` for manual testing\n")

	if err := os.WriteFile(reportPath, []byte(sb.String()), 0o644); err != nil {
		return err
	}

	info("  Report saved: %s", reportPath)
	return nil
}

// --- Helpers ---

func run(name string, args ...string) error {
	cmd := exec.Command(name, args...)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	return cmd.Run()
}

func runPipe(inputFile string, name string, args ...string) error {
	f, err := os.Open(inputFile)
	if err != nil {
		return err
	}
	defer f.Close()

	cmd := exec.Command(name, args...)
	cmd.Stdin = f
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	return cmd.Run()
}

func mergeFiles(output string, inputs ...string) {
	seen := make(map[string]bool)
	var lines []string

	for _, input := range inputs {
		data, err := os.ReadFile(input)
		if err != nil {
			continue
		}
		for _, line := range strings.Split(string(data), "\n") {
			line = strings.TrimSpace(line)
			if line != "" && !seen[line] {
				seen[line] = true
				lines = append(lines, line)
			}
		}
	}

	_ = os.WriteFile(output, []byte(strings.Join(lines, "\n")+"\n"), 0o644)
}

func queryCrtSh(domain string) []string {
	client := &http.Client{Timeout: 15 * time.Second}
	url := fmt.Sprintf("https://crt.sh/?q=%%25.%s&output=json", domain)
	resp, err := client.Get(url)
	if err != nil {
		return nil
	}
	defer resp.Body.Close()

	var entries []struct {
		NameValue string `json:"name_value"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&entries); err != nil {
		return nil
	}

	var subs []string
	for _, e := range entries {
		for _, name := range strings.Split(e.NameValue, "\n") {
			name = strings.TrimSpace(name)
			if name != "" && !strings.HasPrefix(name, "*") {
				subs = append(subs, name)
			}
		}
	}
	return subs
}

func loadLines(path string) []string {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil
	}
	var lines []string
	for _, l := range strings.Split(string(data), "\n") {
		l = strings.TrimSpace(l)
		if l != "" {
			lines = append(lines, l)
		}
	}
	return lines
}

func lineCount(path string) int {
	data, err := os.ReadFile(path)
	if err != nil {
		return 0
	}
	lines := strings.Split(strings.TrimSpace(string(data)), "\n")
	if len(lines) == 1 && lines[0] == "" {
		return 0
	}
	return len(lines)
}

func banner(ctx *ReconCtx) {
	fmt.Printf("\n")
	fmt.Printf("  ┌─────────────────────────────────────┐\n")
	fmt.Printf("  │       Bug Bounty Recon Pipeline      │\n")
	fmt.Printf("  │            jclee@dev/bug             │\n")
	fmt.Printf("  └─────────────────────────────────────┘\n")
	fmt.Printf("  Target:  %s\n", ctx.Domain)
	fmt.Printf("  Output:  %s/\n", ctx.OutputDir)
	fmt.Printf("  Time:    %s\n\n", ctx.StartTime.Format("2006-01-02 15:04:05"))
}

func printPhases() {
	fmt.Println("Recon Pipeline Phases:")
	fmt.Println("  1. Subdomain Enumeration  (subfinder + crt.sh)")
	fmt.Println("  2. Live Host Probing      (httpx)")
	fmt.Println("  3. URL Collection         (katana + gau)")
	fmt.Println("  4. Vulnerability Scan     (nuclei)")
	fmt.Println("  5. Summary Report         (markdown)")
}

func info(format string, a ...any)    { fmt.Printf("\033[34m[*]\033[0m "+format+"\n", a...) }
func success(format string, a ...any) { fmt.Printf("\033[32m[+]\033[0m "+format+"\n", a...) }
func warn(format string, a ...any)    { fmt.Printf("\033[33m[!]\033[0m "+format+"\n", a...) }
func fatal(format string, a ...any) {
	fmt.Fprintf(os.Stderr, "\033[31m[-]\033[0m "+format+"\n", a...)
	os.Exit(1)
}
