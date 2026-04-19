package main

import (
	"bytes"
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

func main() {
	domain := flag.String("d", "", "Target domain (required)")
	webhook := flag.String("webhook", "", "Discord webhook URL for alerts")
	flag.Parse()

	if *domain == "" {
		fmt.Fprintln(os.Stderr, "Usage: go run monitor.go -d <domain> [-webhook <discord-url>]")
		os.Exit(1)
	}

	fmt.Println()
	fmt.Println("  ┌─────────────────────────────────────┐")
	fmt.Println("  │     Diff Monitor — New Findings      │")
	fmt.Println("  └─────────────────────────────────────┘")
	fmt.Printf("  Target: %s\n", *domain)
	fmt.Printf("  Time:   %s\n\n", time.Now().Format("2006-01-02 15:04:05"))

	baseDir := filepath.Join("targets", *domain)
	os.MkdirAll(baseDir, 0o755)

	// --- Step 1: Scan current subdomains ---
	info("Scanning subdomains...")
	currentSubs := scanSubdomains(*domain)
	info("  Found %d subdomains", len(currentSubs))

	// --- Step 2: Probe live hosts ---
	info("Probing live hosts...")
	currentLive := probeLiveHosts(currentSubs, baseDir)
	info("  %d live hosts", len(currentLive))

	// --- Step 3: Load previous baseline ---
	subsBaseline := filepath.Join(baseDir, "baseline-subdomains.txt")
	liveBaseline := filepath.Join(baseDir, "baseline-live.txt")

	prevSubs := loadLines(subsBaseline)
	prevLive := loadLines(liveBaseline)

	// --- Step 4: Compute diffs ---
	newSubs := diff(currentSubs, prevSubs)
	goneSubs := diff(prevSubs, currentSubs)
	newLive := diff(currentLive, prevLive)
	goneLive := diff(prevLive, currentLive)

	// --- Step 5: Report ---
	hasChanges := len(newSubs) > 0 || len(goneSubs) > 0 || len(newLive) > 0 || len(goneLive) > 0

	if !hasChanges && len(prevSubs) > 0 {
		info("No changes detected since last scan.")
		saveBaseline(subsBaseline, currentSubs)
		saveBaseline(liveBaseline, currentLive)
		return
	}

	if len(prevSubs) == 0 {
		info("First scan — saving baseline. Run again later to detect changes.")
		saveBaseline(subsBaseline, currentSubs)
		saveBaseline(liveBaseline, currentLive)
		return
	}

	// Print changes
	var report strings.Builder
	report.WriteString(fmt.Sprintf("# Monitor Report: %s\n", *domain))
	report.WriteString(fmt.Sprintf("**Time**: %s\n\n", time.Now().Format("2006-01-02 15:04:05")))

	if len(newSubs) > 0 {
		success("🆕 %d NEW subdomains:", len(newSubs))
		report.WriteString(fmt.Sprintf("## 🆕 New Subdomains (%d)\n", len(newSubs)))
		for _, s := range newSubs {
			fmt.Printf("    \033[32m+ %s\033[0m\n", s)
			report.WriteString(fmt.Sprintf("- `%s`\n", s))
		}
		report.WriteString("\n")
	}

	if len(goneSubs) > 0 {
		warn("🗑️  %d subdomains disappeared:", len(goneSubs))
		report.WriteString(fmt.Sprintf("## 🗑️ Removed Subdomains (%d)\n", len(goneSubs)))
		for _, s := range goneSubs {
			fmt.Printf("    \033[31m- %s\033[0m\n", s)
			report.WriteString(fmt.Sprintf("- `%s`\n", s))
		}
		report.WriteString("\n")
	}

	if len(newLive) > 0 {
		success("🌐 %d NEW live hosts:", len(newLive))
		report.WriteString(fmt.Sprintf("## 🌐 New Live Hosts (%d)\n", len(newLive)))
		for _, s := range newLive {
			fmt.Printf("    \033[32m+ %s\033[0m\n", s)
			report.WriteString(fmt.Sprintf("- `%s`\n", s))
		}
		report.WriteString("\n")
	}

	if len(goneLive) > 0 {
		warn("🔌 %d live hosts went offline:", len(goneLive))
		report.WriteString(fmt.Sprintf("## 🔌 Offline Hosts (%d)\n", len(goneLive)))
		for _, s := range goneLive {
			fmt.Printf("    \033[31m- %s\033[0m\n", s)
			report.WriteString(fmt.Sprintf("- `%s`\n", s))
		}
	}

	// Save report
	reportFile := filepath.Join(baseDir, fmt.Sprintf("diff-%s.md", time.Now().Format("20060102-150405")))
	os.WriteFile(reportFile, []byte(report.String()), 0o644)
	info("Report saved: %s", reportFile)

	// --- Step 6: Discord notification ---
	if *webhook != "" && (len(newSubs) > 0 || len(newLive) > 0) {
		notifyDiscord(*webhook, *domain, newSubs, newLive)
	}

	// --- Step 7: Auto-scan new live hosts ---
	if len(newLive) > 0 {
		info("Running quick Nuclei scan on %d new live hosts...", len(newLive))
		newLiveFile := filepath.Join(baseDir, "new-live.txt")
		os.WriteFile(newLiveFile, []byte(strings.Join(newLive, "\n")+"\n"), 0o644)

		nucleiOut := filepath.Join(baseDir, fmt.Sprintf("nuclei-new-%s.txt", time.Now().Format("20060102-150405")))
		cmd := exec.Command("nuclei", "-l", newLiveFile, "-severity", "medium,high,critical",
			"-silent", "-rate-limit", "100", "-o", nucleiOut)
		cmd.Stdout = os.Stdout
		cmd.Stderr = os.Stderr
		cmd.Run()

		count := countLines(nucleiOut)
		if count > 0 {
			success("🎯 %d vulnerabilities found on new hosts!", count)
		}
	}

	// --- Step 8: Update baseline ---
	saveBaseline(subsBaseline, currentSubs)
	saveBaseline(liveBaseline, currentLive)
	success("Baseline updated.")
}

// --- Core functions ---

func scanSubdomains(domain string) []string {
	tmpFile := filepath.Join(os.TempDir(), fmt.Sprintf("monitor-subs-%d.txt", time.Now().UnixNano()))
	defer os.Remove(tmpFile)

	cmd := exec.Command("subfinder", "-d", domain, "-silent", "-all", "-o", tmpFile)
	cmd.Stderr = os.Stderr
	cmd.Run()

	// Also query crt.sh
	crtSubs := queryCrtSh(domain)

	lines := loadLines(tmpFile)
	seen := make(map[string]bool)
	var result []string
	for _, l := range append(lines, crtSubs...) {
		l = strings.TrimSpace(strings.ToLower(l))
		if l != "" && !seen[l] {
			seen[l] = true
			result = append(result, l)
		}
	}
	sort.Strings(result)
	return result
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

func probeLiveHosts(subs []string, baseDir string) []string {
	tmpIn := filepath.Join(os.TempDir(), fmt.Sprintf("monitor-in-%d.txt", time.Now().UnixNano()))
	tmpOut := filepath.Join(os.TempDir(), fmt.Sprintf("monitor-out-%d.txt", time.Now().UnixNano()))
	defer os.Remove(tmpIn)
	defer os.Remove(tmpOut)

	os.WriteFile(tmpIn, []byte(strings.Join(subs, "\n")+"\n"), 0o644)

	f, _ := os.Open(tmpIn)
	defer f.Close()

	cmd := exec.Command("httpx", "-silent", "-o", tmpOut)
	cmd.Stdin = f
	cmd.Stderr = os.Stderr
	cmd.Run()

	lines := loadLines(tmpOut)
	sort.Strings(lines)
	return lines
}

func diff(current, previous []string) []string {
	prevSet := make(map[string]bool, len(previous))
	for _, s := range previous {
		prevSet[s] = true
	}
	var result []string
	for _, s := range current {
		if !prevSet[s] {
			result = append(result, s)
		}
	}
	return result
}

func notifyDiscord(webhookURL, domain string, newSubs, newLive []string) {
	var msg strings.Builder
	msg.WriteString(fmt.Sprintf("**🔍 Bug Bounty Monitor — %s**\n", domain))

	if len(newSubs) > 0 {
		msg.WriteString(fmt.Sprintf("\n🆕 **%d new subdomains:**\n", len(newSubs)))
		for _, s := range newSubs {
			if msg.Len() > 1800 {
				msg.WriteString("... and more\n")
				break
			}
			msg.WriteString(fmt.Sprintf("```%s```\n", s))
		}
	}

	if len(newLive) > 0 {
		msg.WriteString(fmt.Sprintf("\n🌐 **%d new live hosts:**\n", len(newLive)))
		for _, s := range newLive {
			if msg.Len() > 1800 {
				msg.WriteString("... and more\n")
				break
			}
			msg.WriteString(fmt.Sprintf("```%s```\n", s))
		}
	}

	payload, _ := json.Marshal(map[string]string{"content": msg.String()})
	http.Post(webhookURL, "application/json", bytes.NewReader(payload))
	info("Discord notification sent")
}

// --- Helpers ---

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

func saveBaseline(path string, lines []string) {
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

func info(f string, a ...any)    { fmt.Printf("\033[34m[*]\033[0m "+f+"\n", a...) }
func success(f string, a ...any) { fmt.Printf("\033[32m[+]\033[0m "+f+"\n", a...) }
func warn(f string, a ...any)    { fmt.Printf("\033[33m[!]\033[0m "+f+"\n", a...) }
