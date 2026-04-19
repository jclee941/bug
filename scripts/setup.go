package main

import (
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
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
	fmt.Println()
	fmt.Println("  ┌─────────────────────────────────────┐")
	fmt.Println("  │      Bug Bounty Setup Checker        │")
	fmt.Println("  └─────────────────────────────────────┘")
	fmt.Println()

	checkTools()
	checkDirs()
	checkNucleiTemplates()
	checkWordlists()
	checkSubfinderConfig()

	fmt.Println()
	success("Setup verification complete")
	fmt.Println()
}

func checkTools() {
	info("Checking installed tools...")
	missing := 0

	for _, t := range tools {
		path, err := exec.LookPath(t.Binary)
		if err != nil {
			if t.Required {
				fail("  %-12s NOT FOUND — install: %s", t.Name, t.Install)
				missing++
			} else {
				warn("  %-12s not found (optional) — install: %s", t.Name, t.Install)
			}
		} else {
			ok("  %-12s %s", t.Name, path)
		}
	}

	if missing > 0 {
		warn("\n  %d required tools missing. Install them before proceeding.", missing)
	}
}

func checkDirs() {
	info("Checking directory structure...")
	dirs := []string{"recon", "reports", "targets", "wordlists", "scripts", "notes", "config"}

	for _, d := range dirs {
		if _, err := os.Stat(d); os.IsNotExist(err) {
			os.MkdirAll(d, 0o755)
			ok("  Created %s/", d)
		} else {
			ok("  %s/ exists", d)
		}
	}
}

func checkNucleiTemplates() {
	info("Checking Nuclei templates...")
	home, _ := os.UserHomeDir()
	tmplDir := filepath.Join(home, "nuclei-templates")

	if _, err := os.Stat(tmplDir); os.IsNotExist(err) {
		warn("  Templates not found. Installing...")
		cmd := exec.Command("nuclei", "-update-templates")
		cmd.Stdout = os.Stdout
		cmd.Stderr = os.Stderr
		if err := cmd.Run(); err != nil {
			fail("  Failed to install templates: %v", err)
			return
		}
	}

	// Count templates
	count := 0
	filepath.Walk(tmplDir, func(path string, info os.FileInfo, err error) error {
		if err == nil && strings.HasSuffix(path, ".yaml") {
			count++
		}
		return nil
	})
	ok("  %d templates available at %s", count, tmplDir)
}

func checkWordlists() {
	info("Checking wordlists...")
	wlDir := "wordlists"

	dnsWordlist := filepath.Join(wlDir, "dns-subdomains.txt")
	if _, err := os.Stat(dnsWordlist); os.IsNotExist(err) {
		warn("  DNS wordlist not found. Downloading...")
		downloadFile(
			"https://raw.githubusercontent.com/danielmiessler/SecLists/master/Discovery/DNS/subdomains-top1million-5000.txt",
			dnsWordlist,
		)
	} else {
		ok("  DNS wordlist: %s (%d lines)", dnsWordlist, lineCount(dnsWordlist))
	}

	dirbWordlist := filepath.Join(wlDir, "dirb-common.txt")
	if _, err := os.Stat(dirbWordlist); os.IsNotExist(err) {
		warn("  Directory wordlist not found. Downloading...")
		downloadFile(
			"https://raw.githubusercontent.com/danielmiessler/SecLists/master/Discovery/Web-Content/common.txt",
			dirbWordlist,
		)
	} else {
		ok("  Dir wordlist: %s (%d lines)", dirbWordlist, lineCount(dirbWordlist))
	}

	paramsWordlist := filepath.Join(wlDir, "params-common.txt")
	if _, err := os.Stat(paramsWordlist); os.IsNotExist(err) {
		warn("  Parameters wordlist not found. Downloading...")
		downloadFile(
			"https://raw.githubusercontent.com/danielmiessler/SecLists/master/Discovery/Web-Content/burp-parameter-names.txt",
			paramsWordlist,
		)
	} else {
		ok("  Params wordlist: %s (%d lines)", paramsWordlist, lineCount(paramsWordlist))
	}
}

func checkSubfinderConfig() {
	info("Checking Subfinder API keys...")
	home, _ := os.UserHomeDir()
	configPath := filepath.Join(home, ".config", "subfinder", "provider-config.yaml")

	if _, err := os.Stat(configPath); os.IsNotExist(err) {
		warn("  No API keys configured. Subfinder works without them but finds fewer subdomains.")
		warn("  Configure at: %s", configPath)
		warn("  Get free API keys from: SecurityTrails, VirusTotal, Shodan, Censys")
	} else {
		data, _ := os.ReadFile(configPath)
		sources := strings.Count(string(data), ":")
		ok("  Config found with ~%d sources configured", sources/2)
	}
}

func downloadFile(url, dest string) {
	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Get(url)
	if err != nil {
		fail("  Download failed: %v", err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		fail("  Download failed: HTTP %d", resp.StatusCode)
		return
	}

	buf := make([]byte, 0, 1024*1024)
	tmp := make([]byte, 32*1024)
	for {
		n, err := resp.Body.Read(tmp)
		if n > 0 {
			buf = append(buf, tmp[:n]...)
		}
		if err != nil {
			break
		}
	}

	if err := os.WriteFile(dest, buf, 0o644); err != nil {
		fail("  Write failed: %v", err)
		return
	}
	ok("  Downloaded %s (%d bytes)", dest, len(buf))
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

func info(f string, a ...any) { fmt.Printf("\033[34m[*]\033[0m "+f+"\n", a...) }
func ok(f string, a ...any)   { fmt.Printf("\033[32m[✓]\033[0m "+f+"\n", a...) }
func warn(f string, a ...any) { fmt.Printf("\033[33m[!]\033[0m "+f+"\n", a...) }
func fail(f string, a ...any) { fmt.Printf("\033[31m[✗]\033[0m "+f+"\n", a...) }
func success(f string, a ...any) {
	fmt.Printf("\033[32m[+]\033[0m "+f+"\n", a...)
	_ = runtime.GOOS // suppress unused import
}
