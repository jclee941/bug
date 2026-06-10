package main

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

type tool struct {
	Name     string
	Binary   string
	Install  string
	Required bool
}

var tools = []tool{
	{"Subfinder", "subfinder", "go install github.com/projectdiscovery/subfinder/v2/cmd/subfinder@latest", true},
	{"httpx", "httpx", "go install github.com/projectdiscovery/httpx/cmd/httpx@latest", true},
	{"Nuclei", "nuclei", "go install github.com/projectdiscovery/nuclei/v3/cmd/nuclei@latest", true},
	{"Katana", "katana", "go install github.com/projectdiscovery/katana/cmd/katana@latest", true},
	{"ffuf", "ffuf", "go install github.com/ffuf/ffuf/v2@latest", true},
	{"gau", "gau", "go install github.com/lc/gau/v2/cmd/gau@latest", true},
	{"anew", "anew", "go install github.com/tomnomnom/anew@latest", true},
	{"nmap", "nmap", "sudo apt install -y nmap", false},
	{"jq", "jq", "sudo apt install -y jq", false},
	{"Go", "go", "https://go.dev/dl/", true},
	{"curl", "curl", "sudo apt install -y curl", true},
}

func main() {
	ctx, cancel := SetupSignalContext()
	defer cancel()

	fmt.Println()
	fmt.Println("  ┌─────────────────────────────────────┐")
	fmt.Println("  │      Bug Bounty Setup Checker        │")
	fmt.Println("  └─────────────────────────────────────┘")
	fmt.Println()

	runSetupStep(ctx, "Checking tools", checkTools)
	runSetupStep(ctx, "Checking directories", checkDirs)
	runSetupStep(ctx, "Checking Nuclei templates", checkNucleiTemplates)
	runSetupStep(ctx, "Checking wordlists", checkWordlists)
	runSetupStep(ctx, "Checking Subfinder config", checkSubfinderConfig)

	fmt.Println()
	logSuccess("Setup verification complete")
	fmt.Println()
}

func runSetupStep(ctx context.Context, label string, fn func(context.Context)) {
	if ctx.Err() != nil {
		logWarn("Interrupted — skipping remaining setup checks")
		return
	}
	stop := Progress(label)
	fn(ctx)
	stop()
}

func checkTools(ctx context.Context) {
	logInfo("Checking installed tools...")
	missing := 0

	for _, t := range tools {
		if ctx.Err() != nil {
			logWarn("  Interrupted — partial tool check complete")
			return
		}
		path, err := exec.LookPath(t.Binary)
		if err != nil {
			if t.Required {
				fail("  %-12s NOT FOUND — install: %s", t.Name, t.Install)
				missing++
			} else {
				logWarn("  %-12s not found (optional) — install: %s", t.Name, t.Install)
			}
		} else {
			ok("  %-12s %s", t.Name, path)
		}
	}

	if missing > 0 {
		logWarn("\n  %d required tools missing. Install them before proceeding.", missing)
	}
}

func checkDirs(ctx context.Context) {
	logInfo("Checking directory structure...")
	dirs := []string{"recon", "reports", "targets", "wordlists", "scripts", "notes", "config"}

	for _, d := range dirs {
		if ctx.Err() != nil {
			logWarn("  Interrupted — partial directory check complete")
			return
		}
		if _, err := os.Stat(d); os.IsNotExist(err) {
			os.MkdirAll(d, 0o755)
			ok("  Created %s/", d)
		} else {
			ok("  %s/ exists", d)
		}
	}
}

func checkNucleiTemplates(ctx context.Context) {
	logInfo("Checking Nuclei templates...")
	home, _ := os.UserHomeDir()
	tmplDir := filepath.Join(home, "nuclei-templates")

	if _, err := os.Stat(tmplDir); os.IsNotExist(err) {
		logWarn("  Templates not found. Installing...")
		cmd := exec.CommandContext(ctx, "nuclei", "-update-templates")
		cmd.Stdout = os.Stdout
		cmd.Stderr = os.Stderr
		if err := cmd.Run(); err != nil {
			fail("  Failed to install templates: %v", err)
			return
		}
	}

	count := 0
	filepath.Walk(tmplDir, func(path string, info os.FileInfo, err error) error {
		if err == nil && strings.HasSuffix(path, ".yaml") {
			count++
		}
		return nil
	})
	ok("  %d templates available at %s", count, tmplDir)
}

func checkWordlists(ctx context.Context) {
	logInfo("Checking wordlists...")
	wlDir := "wordlists"

	entries := []struct {
		path string
		url  string
		name string
	}{
		{filepath.Join(wlDir, "dns-subdomains.txt"), "https://raw.githubusercontent.com/danielmiessler/SecLists/master/Discovery/DNS/subdomains-top1million-5000.txt", "DNS wordlist"},
		{filepath.Join(wlDir, "dirb-common.txt"), "https://raw.githubusercontent.com/danielmiessler/SecLists/master/Discovery/Web-Content/common.txt", "Directory wordlist"},
		{filepath.Join(wlDir, "params-common.txt"), "https://raw.githubusercontent.com/danielmiessler/SecLists/master/Discovery/Web-Content/burp-parameter-names.txt", "Parameters wordlist"},
	}

	for _, entry := range entries {
		if ctx.Err() != nil {
			logWarn("  Interrupted — partial wordlist check complete")
			return
		}
		if _, err := os.Stat(entry.path); os.IsNotExist(err) {
			logWarn("  %s not found. Downloading...", entry.name)
			downloadFile(ctx, entry.url, entry.path)
			continue
		}
		ok("  %s: %s (%d lines)", entry.name, entry.path, countLines(entry.path))
	}
}

func checkSubfinderConfig(ctx context.Context) {
	if ctx.Err() != nil {
		logWarn("  Interrupted — skipping Subfinder config check")
		return
	}
	logInfo("Checking Subfinder API keys...")
	home, _ := os.UserHomeDir()
	configPath := filepath.Join(home, ".config", "subfinder", "provider-config.yaml")

	if _, err := os.Stat(configPath); os.IsNotExist(err) {
		logWarn("  No API keys configured. Subfinder works without them but finds fewer subdomains.")
		logWarn("  Configure at: %s", configPath)
		logWarn("  Get free API keys from: SecurityTrails, VirusTotal, Shodan, Censys")
	} else {
		data, _ := os.ReadFile(configPath)
		sources := strings.Count(string(data), ":")
		ok("  Config found with ~%d sources configured", sources/2)
	}
}

func downloadFile(ctx context.Context, url, dest string) {
	client := &http.Client{Timeout: 30 * time.Second}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		fail("  Download failed: %v", err)
		return
	}
	resp, err := client.Do(req)
	if err != nil {
		fail("  Download failed: %v", err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		fail("  Download failed: HTTP %d", resp.StatusCode)
		return
	}

	data, err := io.ReadAll(resp.Body)
	if err != nil {
		fail("  Download failed: %v", err)
		return
	}

	if err := os.WriteFile(dest, data, 0o644); err != nil {
		fail("  Write failed: %v", err)
		return
	}
	ok("  Downloaded %s (%d bytes)", dest, len(data))
}

func ok(f string, a ...any)   { fmt.Printf("\033[32m[✓]\033[0m "+f+"\n", a...) }
func fail(f string, a ...any) { fmt.Printf("\033[31m[✗]\033[0m "+f+"\n", a...) }
