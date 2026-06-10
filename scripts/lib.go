package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"strings"
	"syscall"
	"time"
)

type TargetConfig struct {
	Domain     string   `json:"domain"`
	Platform   string   `json:"platform"`
	ProgramURL string   `json:"program_url"`
	Scope      []string `json:"scope"`
	OutOfScope []string `json:"out_of_scope"`
	Severity   string   `json:"severity_filter"`
	RateLimit  int      `json:"rate_limit"`
	Notes      string   `json:"notes"`
	Active     bool     `json:"active"`
}

type Config struct {
	Targets  []TargetConfig `json:"targets"`
	Defaults struct {
		Severity      string `json:"severity"`
		RateLimit     int    `json:"rate_limit"`
		NucleiThreads int    `json:"nuclei_threads"`
		KatanaDepth   int    `json:"katana_depth"`
	} `json:"defaults"`
	Notifications struct {
		DiscordWebhook string `json:"discord_webhook"`
		Enabled        bool   `json:"enabled"`
	} `json:"notifications"`
}

func loadConfig(path string) (*Config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}

	var cfg Config
	if err := json.Unmarshal(data, &cfg); err != nil {
		return nil, err
	}

	return &cfg, nil
}

func (c *Config) ActiveTarget() *TargetConfig {
	for i := range c.Targets {
		if c.Targets[i].Active {
			return &c.Targets[i]
		}
	}

	return nil
}

// SetupSignalContext creates a context that cancels on SIGINT/SIGTERM.
func SetupSignalContext() (context.Context, context.CancelFunc) {
	ctx, cancel := context.WithCancel(context.Background())
	sig := make(chan os.Signal, 1)
	signal.Notify(sig, os.Interrupt, syscall.SIGTERM)
	go func() {
		select {
		case <-sig:
			logWarn("Interrupted — saving partial results...")
			cancel()
		case <-ctx.Done():
		}
		signal.Stop(sig)
		close(sig)
	}()
	return ctx, cancel
}

// RunWithContext runs an exec.Command with context cancellation.
func RunWithContext(ctx context.Context, name string, args ...string) error {
	cmd := exec.CommandContext(ctx, name, args...)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	return cmd.Run()
}

// Progress prints a spinner-style progress indicator.
func Progress(label string) func() {
	done := make(chan bool)
	go func() {
		chars := []string{"⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"}
		i := 0
		for {
			select {
			case <-done:
				fmt.Printf("\r  %s ✓\n", label)
				return
			default:
				fmt.Printf("\r  %s %s", chars[i%len(chars)], label)
				i++
				time.Sleep(100 * time.Millisecond)
			}
		}
	}()
	return func() { done <- true }
}

// loadLines reads a file and returns non-empty lines (trimmed).
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

// countLines returns the number of lines in a file.
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

// queryCrtSh queries crt.sh for subdomains of the given domain.
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

// mergeFiles deduplicates and merges input files into output.
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

// writeLines writes lines to a file (one per line).
func writeLines(path string, lines []string) {
	os.WriteFile(path, []byte(strings.Join(lines, "\n")+"\n"), 0o644)
}

// truncate truncates a string to max length, appending "..." if truncated.
func truncate(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max] + "..."
}

func logInfo(format string, a ...any)    { fmt.Printf("\033[34m[*]\033[0m "+format+"\n", a...) }
func logSuccess(format string, a ...any) { fmt.Printf("\033[32m[+]\033[0m "+format+"\n", a...) }
func logWarn(format string, a ...any)    { fmt.Printf("\033[33m[!]\033[0m "+format+"\n", a...) }
func logFatal(format string, a ...any) {
	fmt.Fprintf(os.Stderr, "\033[31m[-]\033[0m "+format+"\n", a...)
	os.Exit(1)
}
