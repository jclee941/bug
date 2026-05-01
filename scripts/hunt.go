package main

import (
	"bufio"
	"context"
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
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
	{"ssti", "ssti", "Server-Side Template Injection", "medium,high,critical"},
	{"lfi", "lfi,file-inclusion", "Local File Inclusion", "medium,high,critical"},
	{"redirect", "redirect,open-redirect", "Open Redirect", "low,medium"},
	{"cors", "cors,misconfiguration", "CORS Misconfiguration", "medium,high"},
	{"graphql", "graphql", "GraphQL Vulnerabilities", "medium,high,critical"},
	{"prototype", "prototype-pollution", "Prototype Pollution", "medium,high,critical"},
	{"cache", "cache-poisoning,cache-deception", "Cache Poisoning/Deception", "medium,high,critical"},
	{"race", "race-condition", "Race Condition", "medium,high"},
}

func main() {
	signalCtx, cancel := SetupSignalContext()
	defer cancel()

	domain := flag.String("d", "", "Target domain (required)")
	reconDir := flag.String("recon-dir", "", "Path to existing recon results (auto-detect if empty)")
	vulnType := flag.String("type", "all", "Vulnerability type to hunt (idor,ssrf,auth,exposure,xss,sqli,rce,cve,takeover,token,ssti,lfi,redirect,cors,graphql,prototype,cache,race,all)")
	useConfig := flag.Bool("config", false, "Read target from config/targets.json")
	listTypes := flag.Bool("list", false, "List available hunt types")
	flag.Parse()

	if *listTypes {
		printHuntTypes()
		return
	}

	resolvedDomain := *domain
	resolvedRateLimit := 100
	configuredSeverity := ""

	if *useConfig {
		cfg, err := loadConfig(filepath.Join("config", "targets.json"))
		if err != nil {
			logFatal("Failed to load config: %v", err)
		}

		activeTarget := cfg.ActiveTarget()
		if activeTarget == nil {
			logFatal("No active target found in config/targets.json")
		}

		if resolvedDomain == "" {
			resolvedDomain = activeTarget.Domain
		}
		switch {
		case activeTarget.Severity != "":
			configuredSeverity = activeTarget.Severity
		case cfg.Defaults.Severity != "":
			configuredSeverity = cfg.Defaults.Severity
		}
		switch {
		case activeTarget.RateLimit > 0:
			resolvedRateLimit = activeTarget.RateLimit
		case cfg.Defaults.RateLimit > 0:
			resolvedRateLimit = cfg.Defaults.RateLimit
		}
	}

	if resolvedDomain == "" {
		fmt.Fprintln(os.Stderr, "Usage: go run hunt.go lib.go -d <domain> [-type idor] [-recon-dir path/]")
		fmt.Fprintln(os.Stderr, "\nFlags:")
		flag.PrintDefaults()
		fmt.Fprintln(os.Stderr, "\nTypes: idor, ssrf, auth, exposure, xss, sqli, rce, cve, takeover, token, ssti, lfi, redirect, cors, graphql, prototype, cache, race, all")
		os.Exit(1)
	}

	// Find recon directory
	rd := *reconDir
	if rd == "" {
		rd = findLatestRecon(resolvedDomain)
		if rd == "" {
			logFatal("No recon results found for %s. Run recon first: go run scripts/recon.go -d %s", resolvedDomain, resolvedDomain)
		}
	}

	liveFile := filepath.Join(rd, "live.txt")
	urlsFile := filepath.Join(rd, "urls-all.txt")

	if _, err := os.Stat(liveFile); os.IsNotExist(err) {
		logFatal("live.txt not found in %s. Run recon first.", rd)
	}

	liveCount := countLines(liveFile)

	fmt.Println()
	fmt.Println("  ┌─────────────────────────────────────┐")
	fmt.Println("  │     Targeted Vulnerability Hunter    │")
	fmt.Println("  └─────────────────────────────────────┘")
	fmt.Printf("  Target:    %s\n", resolvedDomain)
	fmt.Printf("  Recon:     %s\n", rd)
	fmt.Printf("  Live:      %d hosts\n", liveCount)
	fmt.Printf("  Hunt type: %s\n", *vulnType)
	fmt.Printf("  Time:      %s\n\n", time.Now().Format("2006-01-02 15:04:05"))

	// Create hunt output directory
	ts := time.Now().Format("20060102-150405")
	huntDir := filepath.Join("recon", fmt.Sprintf("%s_hunt_%s", resolvedDomain, ts))
	os.MkdirAll(huntDir, 0o755)

	// Phase 1: Nuclei targeted scans
	if signalCtx.Err() != nil {
		logWarn("Interrupted — skipping remaining phases")
		generateHuntSummary(huntDir, resolvedDomain)
		return
	}
	logInfo("[Phase 1] Nuclei Targeted Scans")
	stop := Progress("[Phase 1] Nuclei Targeted Scans")
	runNucleiHunts(signalCtx, liveFile, huntDir, *vulnType, configuredSeverity, resolvedRateLimit)
	stop()

	// Phase 2: API endpoint discovery
	if signalCtx.Err() != nil {
		logWarn("Interrupted — skipping remaining phases")
		generateHuntSummary(huntDir, resolvedDomain)
		return
	}
	logInfo("[Phase 2] API Endpoint Discovery")
	stop = Progress("[Phase 2] API Endpoint Discovery")
	discoverAPIs(signalCtx, liveFile, urlsFile, huntDir, resolvedDomain)
	stop()

	// Phase 3: JS file analysis
	if signalCtx.Err() != nil {
		logWarn("Interrupted — skipping remaining phases")
		generateHuntSummary(huntDir, resolvedDomain)
		return
	}
	logInfo("[Phase 3] JavaScript Analysis")
	stop = Progress("[Phase 3] JavaScript Analysis")
	analyzeJS(signalCtx, urlsFile, huntDir)
	stop()

	// Phase 4: Exposure detection
	if signalCtx.Err() != nil {
		logWarn("Interrupted — skipping remaining phases")
		generateHuntSummary(huntDir, resolvedDomain)
		return
	}
	logInfo("[Phase 4] Sensitive File Probing")
	stop = Progress("[Phase 4] Sensitive File Probing")
	probeExposures(signalCtx, liveFile, huntDir)
	stop()

	// Summary
	logInfo("[Summary]")
	generateHuntSummary(huntDir, resolvedDomain)
}

// --- Phase 1: Nuclei targeted scans ---

func runNucleiHunts(ctx context.Context, liveFile, huntDir, vulnType, severityFilter string, rateLimit int) {
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
		logWarn("  No valid hunt types selected. Use -list to see options.")
		return
	}

	totalFindings := 0
	for _, ht := range selected {
		if ctx.Err() != nil {
			logWarn("  Interrupted — saved partial Nuclei results")
			return
		}

		outFile := filepath.Join(huntDir, fmt.Sprintf("nuclei-%s.txt", ht.Name))
		logInfo("  Scanning: %s (%s)", ht.Name, ht.Desc)
		severity := ht.Severity
		if severityFilter != "" {
			severity = intersectSeverityFilters(ht.Severity, severityFilter)
		}

		cmd := exec.CommandContext(ctx, "nuclei",
			"-l", liveFile,
			"-tags", ht.Tags,
			"-severity", severity,
			"-silent",
			"-rate-limit", fmt.Sprintf("%d", rateLimit),
			"-o", outFile,
		)
		cmd.Stderr = os.Stderr
		cmd.Run()

		count := countLines(outFile)
		if count > 0 {
			logSuccess("    🎯 %d findings for %s", count, ht.Name)
			totalFindings += count
		} else {
			os.Remove(outFile) // clean up empty files
		}
	}

	if totalFindings > 0 {
		logSuccess("  Total Nuclei findings: %d", totalFindings)
	} else {
		logInfo("  No Nuclei findings (this is normal — manual testing recommended)")
	}
}

func intersectSeverityFilters(base, override string) string {
	if override == "" {
		return base
	}

	allowed := make(map[string]bool)
	for _, level := range strings.Split(override, ",") {
		level = strings.TrimSpace(level)
		if level != "" {
			allowed[level] = true
		}
	}

	var result []string
	for _, level := range strings.Split(base, ",") {
		level = strings.TrimSpace(level)
		if level != "" && allowed[level] {
			result = append(result, level)
		}
	}

	if len(result) == 0 {
		return base
	}

	return strings.Join(result, ",")
}

// --- Phase 2: API endpoint discovery ---

func discoverAPIs(ctx context.Context, liveFile, urlsFile, huntDir, domain string) {
	apiFile := filepath.Join(huntDir, "api-endpoints.txt")
	swaggerFile := filepath.Join(huntDir, "swagger-found.txt")

	// Extract API patterns from collected URLs
	if _, err := os.Stat(urlsFile); err == nil {
		urls := loadLines(urlsFile)
		apiPattern := regexp.MustCompile(`(?i)/api/|/v[0-9]+/|/graphql|/rest/|/json/|/ajax/`)
		var apiURLs []string
		seen := make(map[string]bool)

		for _, u := range urls {
			if ctx.Err() != nil {
				if len(apiURLs) > 0 {
					writeLines(apiFile, apiURLs)
				}
				logWarn("  Interrupted — saved partial API endpoint results")
				return
			}
			if apiPattern.MatchString(u) && !seen[u] {
				seen[u] = true
				apiURLs = append(apiURLs, u)
			}
		}

		if len(apiURLs) > 0 {
			writeLines(apiFile, apiURLs)
			logSuccess("  Found %d API endpoints", len(apiURLs))
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
	sem := make(chan struct{}, 10)
	var wg sync.WaitGroup
	var mu sync.Mutex

	for _, host := range hosts {
		if ctx.Err() != nil {
			if len(found) > 0 {
				writeLines(swaggerFile, found)
			}
			logWarn("  Interrupted — saved partial Swagger/OpenAPI results")
			return
		}
		for _, path := range specPaths {
			if ctx.Err() != nil {
				if len(found) > 0 {
					writeLines(swaggerFile, found)
				}
				logWarn("  Interrupted — saved partial Swagger/OpenAPI results")
				return
			}
			url := strings.TrimRight(host, "/") + path
			sem <- struct{}{}
			wg.Add(1)
			go func(url string) {
				defer wg.Done()
				defer func() { <-sem }()
				if ctx.Err() != nil {
					return
				}

				req, err := http.NewRequestWithContext(ctx, http.MethodHead, url, nil)
				if err != nil {
					return
				}
				resp, err := client.Do(req)
				if err != nil {
					return
				}
				resp.Body.Close()
				if resp.StatusCode == 200 {
					mu.Lock()
					found = append(found, url)
					mu.Unlock()
					logSuccess("    📋 Swagger/OpenAPI: %s", url)
				}
			}(url)
		}
	}

	// Probe for GraphQL introspection
	graphqlPaths := []string{"/graphql", "/api/graphql", "/graphql/v1", "/gql"}
	limit := len(hosts)
	if limit > 50 {
		limit = 50
	}
	for _, host := range hosts[:limit] {
		if ctx.Err() != nil {
			if len(found) > 0 {
				writeLines(swaggerFile, found)
			}
			logWarn("  Interrupted — saved partial Swagger/OpenAPI results")
			return
		}
		for _, gpath := range graphqlPaths {
			if ctx.Err() != nil {
				if len(found) > 0 {
					writeLines(swaggerFile, found)
				}
				logWarn("  Interrupted — saved partial Swagger/OpenAPI results")
				return
			}
			url := strings.TrimRight(host, "/") + gpath
			sem <- struct{}{}
			wg.Add(1)
			go func(url string) {
				defer wg.Done()
				defer func() { <-sem }()
				if ctx.Err() != nil {
					return
				}

				body := strings.NewReader(`{"query":"{ __schema { types { name } } }"}`)
				req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, body)
				if err != nil {
					return
				}
				req.Header.Set("Content-Type", "application/json")
				resp, err := client.Do(req)
				if err != nil {
					return
				}
				respBody, _ := io.ReadAll(resp.Body)
				resp.Body.Close()
				if resp.StatusCode == 200 && strings.Contains(string(respBody), "__schema") {
					mu.Lock()
					found = append(found, url+" [GraphQL introspection ENABLED]")
					mu.Unlock()
					logSuccess("    📊 GraphQL introspection: %s", url)
				}
			}(url)
		}
	}
	wg.Wait()

	if len(found) > 0 {
		writeLines(swaggerFile, found)
	} else {
		logInfo("  No Swagger/OpenAPI specs found")
	}
}

// --- Phase 3: JS analysis ---

func analyzeJS(ctx context.Context, urlsFile, huntDir string) {
	if _, err := os.Stat(urlsFile); os.IsNotExist(err) {
		logInfo("  Skipping — no URLs file")
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
		logInfo("  No JavaScript files found in URLs")
		return
	}

	logInfo("  Analyzing %d JS files for secrets and endpoints...", len(jsURLs))

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
		{"GitHub Token", regexp.MustCompile(`ghp_[A-Za-z0-9_]{36}|gho_[A-Za-z0-9_]{36}|github_pat_[A-Za-z0-9_]{82}`)},
		{"Stripe Key", regexp.MustCompile(`sk_live_[0-9a-zA-Z]{24,}`)},
		{"Twilio", regexp.MustCompile(`SK[0-9a-fA-F]{32}`)},
		{"SendGrid", regexp.MustCompile(`SG\.[a-zA-Z0-9_-]{22}\.[a-zA-Z0-9_-]{43}`)},
		{"Firebase", regexp.MustCompile(`AAAA[A-Za-z0-9_-]{7}:[A-Za-z0-9_-]{140}`)},
		{"Mailgun", regexp.MustCompile(`key-[0-9a-zA-Z]{32}`)},
		{"Heroku", regexp.MustCompile(`[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}`)},
		{"Base64 Creds", regexp.MustCompile(`(?i)(basic\s+)[A-Za-z0-9+/]{20,}={0,2}`)},
	}

	apiExtractPattern := regexp.MustCompile(`['"/](api/[a-zA-Z0-9/_\-{}]+)['"]`)

	secretsFile := filepath.Join(huntDir, "js-secrets.txt")
	jsApiFile := filepath.Join(huntDir, "js-api-endpoints.txt")

	var secrets []string
	apiEndpoints := make(map[string]bool)
	client := &http.Client{Timeout: 10 * time.Second}
	sem := make(chan struct{}, 5)
	var wg sync.WaitGroup
	var mu sync.Mutex

	limit := len(jsURLs)
	if limit > 100 {
		limit = 100 // cap to avoid excessive requests
	}

	for _, jsURL := range jsURLs[:limit] {
		if ctx.Err() != nil {
			break
		}
		sem <- struct{}{}
		wg.Add(1)
		go func(jsURL string) {
			defer wg.Done()
			defer func() { <-sem }()
			if ctx.Err() != nil {
				return
			}

			req, err := http.NewRequestWithContext(ctx, http.MethodGet, jsURL, nil)
			if err != nil {
				return
			}
			resp, err := client.Do(req)
			if err != nil {
				return
			}
			defer resp.Body.Close()

			scanner := bufio.NewScanner(resp.Body)
			buf := make([]byte, 0, 256*1024)
			scanner.Buffer(buf, 1024*1024)

			lineNum := 0
			var localSecrets []string
			localEndpoints := make(map[string]bool)
			for scanner.Scan() {
				if ctx.Err() != nil {
					return
				}
				lineNum++
				line := scanner.Text()

				for _, sp := range secretPatterns {
					if sp.pattern.MatchString(line) {
						finding := fmt.Sprintf("[%s] %s (line %d): %s",
							sp.name, jsURL, lineNum,
							truncate(strings.TrimSpace(line), 200))
						localSecrets = append(localSecrets, finding)
					}
				}

				matches := apiExtractPattern.FindAllStringSubmatch(line, -1)
				for _, m := range matches {
					if len(m) > 1 {
						localEndpoints["/"+m[1]] = true
					}
				}
			}

			mu.Lock()
			secrets = append(secrets, localSecrets...)
			for ep := range localEndpoints {
				apiEndpoints[ep] = true
			}
			mu.Unlock()
		}(jsURL)
	}
	wg.Wait()
	if ctx.Err() != nil {
		if len(secrets) > 0 {
			writeLines(secretsFile, secrets)
		}
		if len(apiEndpoints) > 0 {
			var apis []string
			for ep := range apiEndpoints {
				apis = append(apis, ep)
			}
			writeLines(jsApiFile, apis)
		}
		logWarn("  Interrupted — saved partial JavaScript analysis results")
		return
	}

	if len(secrets) > 0 {
		writeLines(secretsFile, secrets)
		logSuccess("  🔑 %d potential secrets found!", len(secrets))
		for _, s := range secrets {
			fmt.Printf("    \033[31m%s\033[0m\n", truncate(s, 120))
		}
	} else {
		logInfo("  No secrets detected")
	}

	if len(apiEndpoints) > 0 {
		var apis []string
		for ep := range apiEndpoints {
			apis = append(apis, ep)
		}
		writeLines(jsApiFile, apis)
		logSuccess("  📡 %d API endpoints extracted from JS", len(apis))
	}
}

// --- Phase 4: Exposure detection ---

func probeExposures(ctx context.Context, liveFile, huntDir string) {
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
		"/api/v1/health", "/api/debug", "/metrics", "/prometheus",
		"/.env.local", "/.env.production", "/.env.development",
		"/wp-admin/", "/wp-login.php", "/administrator/",
		"/api/v1/users", "/api/v1/admin", "/internal/",
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
	sem := make(chan struct{}, 10)
	var wg sync.WaitGroup
	var mu sync.Mutex

	for _, host := range hosts[:limit] {
		if ctx.Err() != nil {
			break
		}
		for _, path := range sensitivePaths {
			if ctx.Err() != nil {
				break
			}
			url := strings.TrimRight(host, "/") + path
			sem <- struct{}{}
			wg.Add(1)
			go func(url string) {
				defer wg.Done()
				defer func() { <-sem }()
				if ctx.Err() != nil {
					return
				}

				req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
				if err != nil {
					return
				}
				resp, err := client.Do(req)
				if err != nil {
					return
				}
				resp.Body.Close()

				if resp.StatusCode == 200 && resp.ContentLength > 0 {
					finding := fmt.Sprintf("[%d] %s (%d bytes)", resp.StatusCode, url, resp.ContentLength)
					mu.Lock()
					findings = append(findings, finding)
					mu.Unlock()
				}
			}(url)
		}
	}
	wg.Wait()
	if ctx.Err() != nil {
		if len(findings) > 0 {
			writeLines(exposureFile, findings)
		}
		logWarn("  Interrupted — saved partial exposure results")
		return
	}

	if len(findings) > 0 {
		writeLines(exposureFile, findings)
		logSuccess("  🔓 %d exposed files/endpoints found:", len(findings))
		for _, f := range findings {
			fmt.Printf("    \033[33m%s\033[0m\n", f)
		}
	} else {
		logInfo("  No sensitive files exposed")
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
	logInfo("Hunt summary: %s", reportPath)

	if totalFindings > 0 {
		logSuccess("🎯 Total findings across all categories: %d", totalFindings)
	} else {
		logInfo("No automated findings. Manual testing with Burp Suite recommended.")
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
