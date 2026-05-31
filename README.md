<think>
The user wants me to generate a comprehensive README.md for this repository. Let me analyze the project structure:

1. **Project Type**: Bug bounty automation toolkit
2. **Language**: Go + Node.js (JavaScript/TypeScript) + Python
3. **Purpose**: Full bug bounty hunting workflow automation (recon, monitoring, vulnerability hunting)

Let me identify the key components:

**Automation/Workflow Files (29 total):**
- 01_branch-to-pr.yml
- 02_issue-to-branch.yml
- 03_pr-checks.yml
- 04_actionlint.yml
- 05_gitleaks.yml
- 06_codeql.yml
- 07_dependency-review.yml
- 08_scorecard.yml
- 09_semantic-pr.yml
- 10_pr-review.yml
- 12_dependabot-auto-merge.yml
- 13_pr-auto-merge.yml
- 14_bot-auto-fix.yml
- 15_merged-pr-cleanup.yml
- 18_issue-management.yml
- 19_issue-backfill.yml
- 20_readme-gen.yml
- 21_docs-sync.yml
- 24_release-notes.yml
- 25_release-publish.yml
- 29_downstream-health-check.yml
- 37_ci-failure-issues.yml
- 42_reusable-docs-sync.yml
- 43_reusable-issue-management.yml
- 44_reusable-pr-checks.yml
- 45_reusable-gitleaks.yml
- 60_ci-auto-heal.yml
- ci.yml
- security/11_pr-review.yml

**Go Scripts:**
- scripts/hunt.go
- scripts/monitor.go
- scripts/lib.go
- scripts/setup.go (mentioned in Makefile)
- scripts/recon.go (mentioned in Makefile)

**Node.js Scripts:**


- scripts/lab-runner.mjs - PortSwigger lab solver
- scripts/lab-solver.mjs - Custom Playwright solvers
- scripts/lab-gap-solver.mjs - Gap solver
- scripts/lab-batch-*.mjs - Batch lab solving
- scripts/portswigger-solver-wrapper.py - Python bridge
- scripts/pr_review_runner.py - PR review automation
- scripts/generate_readme.py - README generation

**Bot Infrastructure:**
- _bot-scripts/ - Bot management and automation helpers

This is a comprehensive bug bounty automation system that combines multiple languages and tools to automate the entire hunting workflow.

The README-gen model uses minimax-m2.7 with fallback to gpt-5.5 via CLIProxyAPI, and the system is managed by jclee-bot.
</think>

```markdown
# Bug Bounty Automation Toolkit

> 버그 바운티 워크플로우 자동화:侦察 → 모니터링 → 취약점 헌팅 → 보고

> Bug Bounty Workflow Automation: Recon → Monitoring → Vulnerability Hunting → Reporting

---

## 📌 Overview

This repository is a comprehensive **bug bounty automation toolkit** managed by `jclee-bot`. It provides a full-featured, Go-based command-line interface for automating the entire bug bounty hunting workflow, from reconnaissance and continuous monitoring to targeted vulnerability hunting and report generation.

The toolkit also includes extensive GitHub Actions automation for repository management, PR workflows, security scanning, and documentation synchronization.

### Key Characteristics

| Attribute | Value |
|-----------|-------|
| **Primary Language** | Go (stdlib-only scripts) |
| **Secondary Languages** | JavaScript/Node.js, Python |
| **Automation Model** | minimax-m2.7 → gpt-5.5 fallback |
| **Repository Owner** | jclee-bot |
| **License** | ISC |

---

## 🎯 Features

### Core Automation

- **Recon Pipeline** — Automated 5-phase reconnaissance with subdomain enumeration, port scanning, service detection, and nuclei vulnerability scanning
- **Diff Monitoring** — Continuous change detection using crt.sh API with Discord notifications for new subdomains and endpoints
- **Vulnerability Hunting** — Targeted vulnerability scanning supporting multiple categories: IDOR, SSRF, SQLi, XSS, and more
- **PortSwigger Lab Solver** — Automated solver for PortSwigger Web Security Academy labs using Playwright
- **PR Review Automation** — LLM-powered PR review with automatic vulnerability detection and remediation suggestions

### GitHub Workflow Automation (29 Workflows)

| Category | Workflows |
|----------|----------|
| **Branch & PR Management** | `01_branch-to-pr`, `02_issue-to-branch`, `13_pr-auto-merge`, `14_bot-auto-fix`, `15_merged-pr-cleanup` |
| **Code Quality & Security** | `04_actionlint`, `05_gitleaks`, `06_codeql`, `07_dependency-review`, `08_scorecard`, `45_reusable-gitleaks` |
| **PR Checks & Reviews** | `03_pr-checks`, `09_semantic-pr`, `10_pr-review`, `44_reusable-pr-checks`, `security/11_pr-review` |
| **Issue Management** | `18_issue-management`, `19_issue-backfill`, `37_ci-failure-issues`, `43_reusable-issue-management` |
| **Documentation** | `20_readme-gen`, `21_docs-sync`, `42_reusable-docs-sync` |
| **Releases** | `24_release-notes`, `25_release-publish` |
| **Dependency Management** | `12_dependabot-auto-merge` |
| **Health & Healing** | `29_downstream-health-check`, `60_ci-auto-heal` |

### Supported Vulnerability Categories

- **IDOR** — Insecure Direct Object Reference detection
- **SSRF** — Server-Side Request Forgery scanning
- **SQLi** — SQL Injection detection
- **XSS** — Cross-Site Scripting scanning
- **Race Conditions** — Concurrency vulnerability detection
- **Deserialization** — Java/PHP deserialization flaw detection
- **Out-of-Band (OOB)** — OAST-based vulnerability detection
- **HTTP Request Smuggling** — CL.TE and TE.CL smuggling detection

---

## 🏗️ Architecture

```
jclee941/bug/
├── Makefile                          # Orchestration layer (make commands)
├── package.json                      # Node.js dependencies (Playwright)
├── pyproject.toml                    # Python project config
├── config/
│   └── targets.json                  # Target domains & notification config
├── scripts/
│   ├── lib.go        (114L)          # Shared utilities (crt.sh, file I/O, logging)
│   ├── setup.go      (208L)          # Tool verification & wordlist download
│   ├── recon.go      (282L)          # 5-phase recon pipeline
│   ├── monitor.go    (254L)          # Diff monitoring + Discord alerts
│   ├── hunt.go       (464L)          # 4-phase vulnerability hunting
│   ├── hunt.go       (509L)          # Extended hunt module
│   ├── monitor.go    (312L)          # Extended monitor module
│   ├── lib.go        (223L)          # Extended utilities
│   ├── lib.go        (~350L)         # Extended library
│   ├── lab-runner.mjs (262L)         # PortSwigger lab orchestrator
│   ├── lab-solver.mjs (559L)         # Custom Playwright solvers
│   ├── lab-gap-solver.mjs (1236L)   # Gap-based lab solver
│   ├── lab-batch-*.mjs              # Batch lab solving scripts
│   ├── interactsh-wrapper.sh         # OOB callback handler
│   └── portswigger-solver-wrapper.py # Python lab solver bridge
├── _bot-scripts/                     # Bot infrastructure
│   ├── Dockerfile.github_action      # GitHub Actions runner image
│   ├── Dockerfile.github_app         # GitHub App runner image
│   ├── docker-compose.github_app.yml # App deployment config
│   ├── pr_review_runner.py           # PR review automation engine
│   ├── generate_readme.py            # README generation script
│   ├── repo_review.py                # Repository health analysis
│   ├── redact_exposed_secrets.py     # Secret redaction utility
│   └── Makefile, requirements.txt    # Bot dependencies
├── notes/
│   ├── phase2-checklist.md           # Learning & development checklist
│   ├── report-template.md            # Bug report template
│   ├── vulnerability-study.md        # Vulnerability research notes
│   └── report-template.md            # Extended report template
├── recon/                            # Scan results (gitignored)
├── targets/                          # Target baselines (gitignored)
├── reports/                          # Submitted reports (gitignored)
└── wordlists/                       # SecLists downloads (gitignored)
```

### Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                        make TARGET=x.com                        │
└─────────────────────────────────────────────────────────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          ▼                   ▼                   ▼
    ┌──────────┐        ┌──────────┐        ┌──────────┐
    │  setup   │        │  recon   │        │ monitor  │
    │ (verify) │        │(5-phase) │        │ (diff)   │
    └──────────┘        └──────────┘        └──────────┘
                              │                   │
                              ▼                   ▼
                    ┌──────────────────┐  ┌──────────────────┐
                    │  nuclei scan     │  │  crt.sh + diff   │
                    │  (vuln detect)   │  │  + Discord alert │
                    └──────────────────┘  └──────────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │  hunt.go         │
                    │  (targeted vulns) │
                    └──────────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          ▼                   ▼                   ▼
    ┌──────────┐        ┌──────────┐        ┌──────────┐
    │  IDOR    │        │  SSRF    │        │  SQLi    │
    └──────────┘        └──────────┘        └──────────┘
```

---

## 🔄 Automation Inventory

### GitHub Actions Workflows

| Workflow File | Purpose | Trigger |
|---------------|---------|---------|
| `01_branch-to-pr.yml` | Auto-create PR from branch | Push to feature branch |
| `02_issue-to-branch.yml` | Create branch from issue | Issue labeled |
| `03_pr-checks.yml` | Run all PR checks | PR opened/updated |
| `04_actionlint.yml` | Validate GitHub Actions syntax | Push/PR |
| `05_gitleaks.yml` | Scan for leaked secrets | Push/PR |
| `06_codeql.yml` | CodeQL security analysis | Push/PR |
| `07_dependency-review.yml` | Dependency vulnerability check | PR |
| `08_scorecard.yml` | Security scorecard assessment | Push |
| `09_semantic-pr.yml` | Enforce semantic PR titles | PR |
| `10_pr-review.yml` | LLM-powered PR review | PR opened/updated |
| `12_dependabot-auto-merge.yml` | Auto-merge Dependabot PRs | PR (dependabot) |
| `13_pr-auto-merge.yml` | Auto-merge approved PRs | PR approved |
| `14_bot-auto-fix.yml` | Auto-fix bot-detected issues | PR |
| `15_merged-pr-cleanup.yml` | Cleanup after PR merge | PR merged |
| `18_issue-management.yml` | Auto-manage issues | Issue events |
| `19_issue-backfill.yml` | Backfill issue data | Manual/scheduled |
| `20_readme-gen.yml` | Auto-generate README | Schedule/manual |
| `21_docs-sync.yml` | Sync documentation | Push to docs branch |
| `24_release-notes.yml` | Auto-generate release notes | Release |
| `25_release-publish.yml` | Publish releases | Release |
| `29_downstream-health-check.yml` | Check downstream deps | Schedule |
| `37_ci-failure-issues.yml` | Create issue on CI failure | CI failure |
| `42_reusable-docs-sync.yml` | Reusable docs sync workflow | Reusable |
| `43_reusable-issue-management.yml` | Reusable issue management | Reusable |
| `44_reusable-pr-checks.yml` | Reusable PR checks | Reusable |
| `45_reusable-gitleaks.yml` | Reusable gitleaks scan | Reusable |
| `60_ci-auto-heal.yml` | Auto-heal failing CI | CI failure |
| `ci.yml` | Main CI pipeline | Push/PR |
| `security/11_pr-review.yml` | Security-focused PR review | PR |

### Go Automation Tools

This project uses **stdlib-only Go scripts** invoked via `go run`:

| Script | Lines | Purpose |
|--------|-------|---------|
| `scripts/lib.go` | 114 | Shared helpers (loadLines, countLines, queryCrtSh, mergeFiles, writeLines, truncate, logging) |
| `scripts/setup.go` | 208 | Tool verification + wordlist download |
| `scripts/recon.go` | 282 | 5-phase recon pipeline |
| `scripts/monitor.go` | 254 | Diff monitoring + crt.sh + Discord alerts |
| `scripts/hunt.go` | 464 | 4-phase targeted vulnerability hunting |

### Node.js Automation Scripts

| Script | Purpose |
|--------|---------|
| `scripts/lab-runner.mjs` | PortSwigger lab orchestrator using Python wrappers |
| `scripts/lab-solver.mjs` | Custom Playwright-based lab solvers (559L) |
| `scripts/lab-gap-solver.mjs` | Gap solver for labs without official solutions (1236L) |
| `scripts/lab-batch-*.mjs` | Batch lab solving (fast, slow, OOB, smuggling variants) |
| `scripts/lab-gap-helpers.mjs` | Shared helpers for gap solver |
| `scripts/portswigger-solver-wrapper.py` | Python bridge for lab solving |

### Python Automation Scripts

| Script | Purpose |
|--------|---------|
| `_bot-scripts/pr_review_runner.py` | LLM-powered PR review automation |
| `_bot-scripts/generate_readme.py` | README auto-generation (minimax-m2.7 → gpt-5.5 fallback) |
| `_bot-scripts/repo_review.py` | Repository health and quality analysis |
| `_bot-scripts/redact_exposed_secrets.py` | Secret redaction for exposed credentials |

---

## 🚀 Quick Start

### Prerequisites

- **Go** ≥ 1.21
- **Node.js** ≥ 18 (for lab solvers)
- **Python** ≥ 3.9 (for bot scripts)
- **Playwright** (`npm install playwright`)

### Installation

```bash
# Clone repository
git clone https://github.com/jclee941/bug.git
cd bug

# First-time setup (verifies tools, downloads wordlists)
make setup

# Install Node.js dependencies
npm install
```

### Basic Usage

```bash
# Show all available commands
make help

# Run full reconnaissance
make recon TARGET=target.com

# Quick recon (skip nuclei scan)
make recon-fast TARGET=target.com

# Monitor for changes
make monitor TARGET=target.com

# Hunt vulnerabilities
make hunt TARGET=target.com

# Full scan (recon + hunt)
make full-scan TARGET=target.com

# Clean scan results
make clean
```

---

## 🛠️ Local Development

### Tool Requirements

The toolkit requires these external tools (auto-verified by `make setup`):

| Tool | Purpose | Installation |
|------|---------|--------------|
| `subfinder` | Passive subdomain enumeration | `go install -v github.com/projectdiscovery/subfinder/v2/...` |
| `amass` | Active subdomain enumeration | `go install -v github.com/owasp-amass/...` |
| `nuclei` | Vulnerability scanning | `go install -v github.com/projectdiscovery/nuclei/v3/...` |
| `httpx` | HTTP probe tool | `go install -v github.com/projectdiscovery/httpx/...` |
| `sqlmap` | SQL injection detection | `pip install sqlmap` |
| `ffuf` | Web fuzzing | `go install -v github.com/ffuf/ffuf/v2/...` |
| `assetfinder` | Subdomain discovery | `go install -v github.com/tomnomnom/assetfinder` |
| `waybackurls` | URL extraction | `go install -v github.com/tomnomnom/waybackurls` |
| `jq` | JSON processing | System package manager |

### Configuration

Edit `config/targets.json` to add targets:

```json
{
  "targets": [
    {
      "domain": "example.com",
      "program": "example Bug Bounty Program",
      "notification": {
        "discord_webhook": "https://discord.com/api/webhooks/..."
      }
    }
  ]
}
```

### Running Individual Scripts

```bash
# Run recon directly
go run scripts/recon.go scripts/lib.go -d target.com

# Run monitor directly
go run scripts/monitor.go scripts/lib.go -d target.com

# Run hunt directly
go run scripts/hunt.go scripts/lib.go -d target.com

# Run specific hunt type
go run scripts/hunt.go scripts/lib.go -d target.com -type idor

# Solve PortSwigger lab
node scripts/lab-runner.mjs <lab-url>

# Generate README (bot automation)
python _bot-scripts/generate_readme.py
```

---

## 📚 Commands Reference

### Make Targets

| Command | Description |
|---------|-------------|
| `make help` | Display all available commands |
| `make setup` | First-time setup: verify tools, download wordlists |
| `make recon TARGET=domain.com` | Full 5-phase reconnaissance pipeline |
| `make recon-fast TARGET=domain.com` | Recon without nuclei vulnerability scan |
| `make monitor TARGET=domain.com` | Diff-based monitoring with Discord alerts |
| `make hunt TARGET=domain.com` | All vulnerability categories |
| `make hunt-idor TARGET=domain.com` | IDOR vulnerability hunting only |
| `make hunt-ssrf TARGET=domain.com` | SSRF vulnerability hunting only |
| `make hunt-sqli TARGET=domain.com` | SQL injection hunting only |
| `make hunt-rce TARGET=domain.com` | RCE vulnerability hunting only |
| `make full-scan TARGET=domain.com` | Combined recon + hunt |
| `make clean` | Remove all scan results |

### Bot Scripts (Python)

| Command | Description |
|---------|-------------|
| `python _bot-scripts/generate_readme.py` | Generate README.md (minimax-m2.7 → gpt-5.