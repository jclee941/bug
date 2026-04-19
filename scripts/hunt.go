package main

import (
	"bufio"
	"flag"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

type huntType struct {
	Name     string
	Tags     string
	Desc     string
	Severity string
}

var huntTypes = []huntType{
	{"idor", "idor,bola", "Insecure Direct Object Reference", "low,medium,high,critical"},
	{"ssrf", "ssrf", "Server-Side Request Forgery", "medium,high,critical"},
	{"auth", "auth-bypass,default-login,weak-credentials", "Authentication Bypass", "medium,high,critical"},
	{"exposure", "exposure,config,backup-file", "Sensitive File Exposure", "low,medium,high,critical"},
	{"xss", "xss", "Cross-Site Scripting", "medium,high,critical"},
	{"sqli", "sqli", "SQL Injection", "high,critical"},
	{"rce", "rce", "Remote Code Execution", "critical"},
	{"cve", "cve", "Known CVEs", "high,critical"},
	{"takeover", "takeover", "Subdomain Takeover", "high,critical"},
	{"token", "token,api-key,secret", "Exposed Tokens & API Keys", "medium,high,critical"},
}

func main() {
	domain := flag.String("d", "", "Target domain (required)")
	reconDir := flag.String("recon-dir", "", "Path to existing recon results (auto-detect if empty)")
	vulnType := flag.String("type", "all", "Vulnerability type to hunt (idor,ssrf,auth,exposure,xss,sqli,rce,cve,takeover,token,all)")
	listTypes := flag.Bool("list", false, "List available hunt types")
	flag.Parse()

	if *listTypes {
		printHuntTypes()
		return
	}

	if *domain == "" {
		fmt.Fprintln(os.Stderr, "Usage: go run hunt.go -d <domain> [-type idor] [-recon-dir path/]")
		fmt.Fprintln(os.Stderr, "\nFlags:")
		flag.PrintDefaults()
		fmt.Fprintln(os.Stderr, "\nTypes: idor, ssrf, auth, exposure, xss, sqli, rce, cve, takeover, token, all")
		os.Exit(1)
	}

	// Find recon directory
	rd := *reconDir
	if rd == "" {
		rd = findLatestRecon(*domain)
		if rd == "" {
			fatal("No recon results found for %s. Run recon first: go run scripts/recon.go -d %s", *domain, *domain)
		}
	}

	liveFile := filepath.Join(rd, "live.txt")
	urlsFile := filepath.Join(rd, "urls-all.txt")

	if _, err := os.Stat(liveFile); os.IsNotExist(err) {
		fatal("live.txt not found in %s. Run recon first.", rd)
	}

	liveCount := countLines(liveFile)

	fmt.Println()
	fmt.Println("  ┌─────────────────────────────────────┐")
	fmt.Println("  │     Targeted Vulnerability Hunter    │")
	fmt.Println("  └─────────────────────────────────────┘")
	fmt.Printf("  Target:    %s\n", *domain)
	fmt.Printf("  Recon:     %s\n", rd)
	fmt.Printf("  Live:      %d hosts\n", liveCount)
	fmt.Printf("  Hunt type: %s\n", *vulnType)
	fmt.Printf("  Time:      %s\n\n", time.Now().Format("2006-01-02 15:04:05"))

	// Create hunt output directory
	ts := time.Now().Format("20060102-150405")
	huntDir := filepath.Join("recon", fmt.Sprintf("%s_hunt_%s", *domain, ts))
	os.MkdirAll(huntDir, 0o755)

	// Phase 1: Nuclei targeted scans
	info("[Phase 1] Nuclei Targeted Scans")
	runNucleiHunts(liveFile, huntDir, *vulnType)

	// Phase 2: API endpoint discovery
	info("[Phase 2] API Endpoint Discovery")
	discoverAPIs(liveFile, urlsFile, huntDir, *domain)

	// Phase 3: JS file analysis
	info("[Phase 3] JavaScript Analysis")
	analyzeJS(urlsFile, huntDir)

	// Phase 4: Exposure detection
	info("[Phase 4] Sensitive File Probing")
	probeExposures(liveFile, huntDir)

	// Summary
	info("[Summary]")
	generateHuntSummary(huntDir, *domain)
}

// --- Phase 1: Nuclei targeted scans ---

func runNucleiHunts(liveFile, huntDir, vulnType string) {
	var selected []huntType

	if vulnType == "all" {
		selected = huntTypes
	} else {
		for _, t := range strings.Split(vulnType, ",") {
			for _, ht := range huntTypes {
				if ht.Name == strings.TrimSpace(t) {
					selected = append(selected, ht)
				}
			}
		}
	}

	if len(selected) == 0 {
		warn("  No valid hunt types selected. Use -list to see options.")
		return
	}

	totalFindings := 0
	for _, ht := range selected {
		outFile := filepath.Join(huntDir, fmt.Sprintf("nuclei-%s.txt", ht.Name))
		info("  Scanning: %s (%s)", ht.Name, ht.Desc)

		cmd := exec.Command("nuclei",
			"-l", liveFile,
			"-tags", ht.Tags,
			"-severity", ht.Severity,
			"-silent",
			"-rate-limit", "100",
			"-o", outFile,
		)
		cmd.Stderr = os.Stderr
		cmd.Run()

		count := countLines(outFile)
		if count > 0 {
			success("    🎯 %d findings for %s", count, ht.Name)
			totalFindings += count
		} else {
			os.Remove(outFile) // clean up empty files
		}
	}

	if totalFindings > 0 {
		success("  Total Nuclei findings: %d", totalFindings)
	} else {
		info("  No Nuclei findings (this is normal — manual testing recommended)")
	}
}

// --- Phase 2: API endpoint discovery ---

func discoverAPIs(liveFile, urlsFile, huntDir, domain string) {
	apiFile := filepath.Join(huntDir, "api-endpoints.txt")
	swaggerFile := filepath.Join(huntDir, "swagger-found.txt")

	// Extract API patterns from collected URLs
	if _, err := os.Stat(urlsFile); err == nil {
		urls := loadLines(urlsFile)
		apiPattern := regexp.MustCompile(`(?i)/api/|/v[0-9]+/|/graphql|/rest/|/json/|/ajax/`)
		var apiURLs []string
		seen := make(map[string]bool)

		for _, u := range urls {
			if apiPattern.MatchString(u) && !seen[u] {
				seen[u] = true
				apiURLs = append(apiURLs, u)
			}
		}

		if len(apiURLs) > 0 {
			writeLines(apiFile, apiURLs)
			success("  Found %d API endpoints", len(apiURLs))
		}
	}

	// Probe for Swagger/OpenAPI specs
	hosts := loadLines(liveFile)
	specPaths := []string{
		"/swagger.json", "/openapi.json", "/api-docs", "/swagger-ui.html",
		"/v2/api-docs", "/v3/api-docs", "/.well-known/openapi.yaml",
		"/swagger/v1/swagger.json", "/api/swagger.json",
	}

	var found []string
	client := &http.Client{Timeout: 5 * time.Second}

	for _, host := range hosts {
		for _, path := range specPaths {
			url := strings.TrimRight(host, "/") + path
			resp, err := client.Head(url)
			if err != nil {
				continue
			}
			resp.Body.Close()
			if resp.StatusCode == 200 {
				found = append(found, url)
				success("    📋 Swagger/OpenAPI: %s", url)
			}
		}
	}

	if len(found) > 0 {
		writeLines(swaggerFile, found)
	} else {
		info("  No Swagger/OpenAPI specs found")
	}
}

// --- Phase 3: JS analysis ---

func analyzeJS(urlsFile, huntDir string) {
	if _, err := os.Stat(urlsFile); os.IsNotExist(err) {
		info("  Skipping — no URLs file")
		return
	}

	urls := loadLines(urlsFile)
	jsPattern := regexp.MustCompile(`(?i)\.js(\?|$)`)
	var jsURLs []string
	for _, u := range urls {
		if jsPattern.MatchString(u) && !strings.Contains(u, ".json") {
			jsURLs = append(jsURLs, u)
		}
	}

	if len(jsURLs) == 0 {
		info("  No JavaScript files found in URLs")
		return
	}

	info("  Analyzing %d JS files for secrets and endpoints...", len(jsURLs))

	secretPatterns := []struct {
		name    string
		pattern *regexp.Regexp
	}{
		{"AWS Key", regexp.MustCompile(`AKIA[0-9A-Z]{16}`)},
		{"Google API", regexp.MustCompile(`AIza[0-9A-Za-z\-_]{35}`)},
		{"Slack Token", regexp.MustCompile(`xox[baprs]-[0-9a-zA-Z-]+`)},
		{"JWT", regexp.MustCompile(`eyJ[A-Za-z0-9-_]+\.eyJ[A-Za-z0-9-_]+`)},
		{"Private Key", regexp.MustCompile(`-----BEGIN (RSA |EC )?PRIVATE KEY-----`)},
		{"Bearer Token", regexp.MustCompile(`[Bb]earer\s+[A-Za-z0-9\-_.~+/]+=*`)},
		{"Generic Secret", regexp.MustCompile(`(?i)(api[_-]?key|api[_-]?secret|password|token|secret[_-]?key)\s*[:=]\s*['"][A-Za-z0-9+/=\-_.]{8,}['"]`)},
	}

	apiExtractPattern := regexp.MustCompile(`['"/](api/[a-zA-Z0-9/_\-{}]+)['"]`)

	secretsFile := filepath.Join(huntDir, "js-secrets.txt")
	jsApiFile := filepath.Join(huntDir, "js-api-endpoints.txt")

	var secrets []string
	apiEndpoints := make(map[string]bool)
	client := &http.Client{Timeout: 10 * time.Second}

	limit := len(jsURLs)
	if limit > 100 {
		limit = 100 // cap to avoid excessive requests
	}

	for _, jsURL := range jsURLs[:limit] {
		resp, err := client.Get(jsURL)
		if err != nil {
			continue
		}

		scanner := bufio.NewScanner(resp.Body)
		buf := make([]byte, 0, 256*1024)
		scanner.Buffer(buf, 1024*1024)

		lineNum := 0
		for scanner.Scan() {
			lineNum++
			line := scanner.Text()

			// Check secrets
			for _, sp := range secretPatterns {
				if sp.pattern.MatchString(line) {
					finding := fmt.Sprintf("[%s] %s (line %d): %s",
						sp.name, jsURL, lineNum,
						truncate(strings.TrimSpace(line), 200))
					secrets = append(secrets, finding)
				}
			}

			// Extract API endpoints
			matches := apiExtractPattern.FindAllStringSubmatch(line, -1)
			for _, m := range matches {
				if len(m) > 1 {
					apiEndpoints["/"+m[1]] = true
				}
			}
		}
		resp.Body.Close()
	}

	if len(secrets) > 0 {
		writeLines(secretsFile, secrets)
		success("  🔑 %d potential secrets found!", len(secrets))
		for _, s := range secrets {
			fmt.Printf("    \033[31m%s\033[0m\n", truncate(s, 120))
		}
	} else {
		info("  No secrets detected")
	}

	if len(apiEndpoints) > 0 {
		var apis []string
		for ep := range apiEndpoints {
			apis = append(apis, ep)
		}
		writeLines(jsApiFile, apis)
		success("  📡 %d API endpoints extracted from JS", len(apis))
	}
}

// --- Phase 4: Exposure detection ---

func probeExposures(liveFile, huntDir string) {
	hosts := loadLines(liveFile)
	exposureFile := filepath.Join(huntDir, "exposures.txt")

	sensitivePaths := []string{
		"/.env", "/.git/config", "/.git/HEAD", "/wp-config.php.bak",
		"/config.php.bak", "/.DS_Store", "/backup.sql", "/database.sql",
		"/.htpasswd", "/server-status", "/phpinfo.php", "/.svn/entries",
		"/crossdomain.xml", "/clientaccesspolicy.xml", "/robots.txt",
		"/sitemap.xml", "/.well-known/security.txt", "/debug",
		"/actuator/health", "/actuator/env", "/graphql",
		"/console", "/admin", "/_debug", "/trace",
	}

	client := &http.Client{
		Timeout: 5 * time.Second,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			return http.ErrUseLastResponse // don't follow redirects
		},
	}

	var findings []string
	limit := len(hosts)
	if limit > 50 {
		limit = 50
	}

	for _, host := range hosts[:limit] {
		for _, path := range sensitivePaths {
			url := strings.TrimRight(host, "/") + path
			resp, err := client.Get(url)
			if err != nil {
				continue
			}
			resp.Body.Close()

			if resp.StatusCode == 200 && resp.ContentLength > 0 {
				finding := fmt.Sprintf("[%d] %s (%d bytes)", resp.StatusCode, url, resp.ContentLength)
				findings = append(findings, finding)
			}
		}
	}

	if len(findings) > 0 {
		writeLines(exposureFile, findings)
		success("  🔓 %d exposed files/endpoints found:", len(findings))
		for _, f := range findings {
			fmt.Printf("    \033[33m%s\033[0m\n", f)
		}
	} else {
		info("  No sensitive files exposed")
	}
}

// --- Summary ---

func generateHuntSummary(huntDir, domain string) {
	reportPath := filepath.Join(huntDir, "HUNT-SUMMARY.md")
	var sb strings.Builder

	sb.WriteString(fmt.Sprintf("# Hunt Report: %s\n\n", domain))
	sb.WriteString(fmt.Sprintf("**Date**: %s\n\n", time.Now().Format("2006-01-02 15:04:05")))
	sb.WriteString("## Findings\n\n")
	sb.WriteString("| File | Count | Category |\n")
	sb.WriteString("|------|-------|----------|\n")

	totalFindings := 0
	entries, _ := os.ReadDir(huntDir)
	for _, e := range entries {
		if e.IsDir() || e.Name() == "HUNT-SUMMARY.md" {
			continue
		}
		count := countLines(filepath.Join(huntDir, e.Name()))
		if count > 0 {
			sb.WriteString(fmt.Sprintf("| `%s` | %d | %s |\n", e.Name(), count, categorize(e.Name())))
			totalFindings += count
		}
	}

	sb.WriteString(fmt.Sprintf("\n**Total findings**: %d\n\n", totalFindings))
	sb.WriteString("## Next Steps\n\n")
	sb.WriteString("1. Review each finding file for false positives\n")
	sb.WriteString("2. Manually verify critical findings in Burp Suite\n")
	sb.WriteString("3. Write detailed PoC for confirmed vulnerabilities\n")
	sb.WriteString("4. Draft report using `notes/report-template.md`\n")
	sb.WriteString("5. Submit via HackerOne/Bugcrowd\n")

	os.WriteFile(reportPath, []byte(sb.String()), 0o644)
	info("Hunt summary: %s", reportPath)

	if totalFindings > 0 {
		success("🎯 Total findings across all categories: %d", totalFindings)
	} else {
		info("No automated findings. Manual testing with Burp Suite recommended.")
	}
}

// --- Helpers ---

func findLatestRecon(domain string) string {
	pattern := filepath.Join("recon", domain+"_2*")
	matches, _ := filepath.Glob(pattern)
	if len(matches) == 0 {
		return ""
	}
	// Already sorted lexicographically, last = newest
	return matches[len(matches)-1]
}

func printHuntTypes() {
	fmt.Println("Available hunt types:")
	for _, ht := range huntTypes {
		fmt.Printf("  %-12s %s (nuclei tags: %s)\n", ht.Name, ht.Desc, ht.Tags)
	}
}

func categorize(filename string) string {
	switch {
	case strings.Contains(filename, "nuclei"):
		return "Nuclei Scan"
	case strings.Contains(filename, "api"):
		return "API Discovery"
	case strings.Contains(filename, "js-secret"):
		return "Secret Detection"
	case strings.Contains(filename, "swagger"):
		return "OpenAPI Spec"
	case strings.Contains(filename, "exposure"):
		return "Sensitive Files"
	default:
		return "Other"
	}
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

func writeLines(path string, lines []string) {
	os.WriteFile(path, []byte(strings.Join(lines, "\n")+"\n"), 0o644)
}

func countLines(path string) int {
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

func truncate(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max] + "..."
}

func info(f string, a ...any)    { fmt.Printf("\033[34m[*]\033[0m "+f+"\n", a...) }
func success(f string, a ...any) { fmt.Printf("\033[32m[+]\033[0m "+f+"\n", a...) }
func warn(f string, a ...any)    { fmt.Printf("\033[33m[!]\033[0m "+f+"\n", a...) }
func fatal(f string, a ...any) {
	fmt.Fprintf(os.Stderr, "\033[31m[-]\033[0m "+f+"\n", a...)
	os.Exit(1)
}
