<think>
The user wants me to generate a comprehensive README.md for a repository that appears to be a bug bounty automation toolkit. Let me analyze what I have:

1. **Project Structure**: Shows it's a bug bounty automation toolkit with:
   - Go-based scripts (setup.go, recon.go, monitor.go, hunt.go, lib.go)
   - Node.js scripts (lab-runner.mjs, lab-solver.mjs, lab-gap-solver.mjs, etc.)
   - PortSwigger lab solver scripts
   - Various batch solver scripts
   - GitHub Actions workflows (27 total)
   - Makefile for orchestration

2. **Workflow Files**: 27 total workflows with names like:
   - 01_branch-to-pr.yml, 02_issue-to-branch.yml, 03_pr-checks.yml
   - 04_actionlint.yml, 05_gitleaks.yml, 06_codeql.yml
   - 07_dependency-review.yml, 08_scorecard.yml, 09_semantic-pr.yml
   - 10_pr-review.yml, 12_dependabot-auto-merge.yml, 13_pr-auto-merge.yml
   - 14_bot-auto-fix.yml, 15_merged-pr-cleanup.yml, 18_issue-management.yml
   - 19_issue-backfill.yml, 20_readme-gen.yml, 21_docs-sync.yml
   - 24_release-notes.yml, 25_release-publish.yml, 29_downstream-health-check.yml
   - 37_ci-failure-issues.yml, 42_reusable-docs-sync.yml, 43_reusable-issue-management.yml
   - 44_reusable-pr-checks.yml, 60_ci-auto-heal.yml, ci.yml

3. **package.json**: Shows "bug" - bug bounty automation toolkit with playwright dependency

4. **Makefile**: Shows commands for setup, recon, monitor, hunt, full-scan, clean

5. **README.md**: Currently very minimal/stub
   
The automation layer spans 27 GitHub Actions workflows across multiple domains: code quality (actionlint, gitleaks, CodeQL, dependency review, Scorecard), pull request management (semantic PRs, auto-merge, bot fixes, cleanup), issue handling (management, backfill), documentation (README generation, sync), releases, health monitoring, and CI self-healing. There's also reusable workflow infrastructure for DRY configuration.

Looking at the existing README.md, it contains placeholder content and appears incomplete. I should leverage the AGENTS.md knowledge base to construct a bilingual README that provides comprehensive coverage of the project's structure, capabilities, and usage patterns.

</think>

```markdown
# Bug Bounty Automation Toolkit

> Automated vulnerability hunting toolkit for the full security research workflow: recon → monitoring → vulnerability hunting → reporting.

[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](LICENSE)
[![GitHub Actions: 27 Workflows](https://img.shields.io/badge/GitHub%20Actions-27%20Workflows-green.svg)](.github/workflows)
[![Go Based](https://img.shields.io/badge/Go-1.21+-00ADD8.svg)](https://go.dev/)
[![Node.js Solver](https://img.shields.io/badge/Node.js-18+-339933.svg)](https://nodejs.org/)

---

## Table of Contents / 목차

- [Overview](#overview--개요)
- [Features](#features--기능)
- [Architecture](#architecture--아키텍처)
- [Automation Inventory](#automation-inventory--자동화-인벤토리)
  - [GitHub Actions Workflows](#github-actions-workflows)
  - [Go Automation Tools](#go-automation-tools)
  - [Node.js / JavaScript Scripts](#nodejs--javascript-scripts)
- [Quick Start](#quick-start--빠른-시작)
- [Local Development](#local-development--로컬-개발)
- [Commands Reference](#commands-reference--명령어-참조)
- [Contributing](#contributing--기여하기)

---

## Overview / 개요

This repository is an automated bug bounty and security research toolkit that handles the complete vulnerability discovery lifecycle:

1. **Reconnaissance** — Subdomain enumeration, port scanning, screenshot capture, technology fingerprinting
2. **Monitoring** — Diff-based change detection to find NEW attack surface
3. **Vulnerability Hunting** — Targeted scanning for IDOR, SSRF, XSS, SQLi, Command Injection, and more
4. **Lab Solving** — Automated PortSwigger Web Security Academy lab solutions
5. **Reporting** — Structured vulnerability reports with evidence collection

The toolkit is orchestrated via **Make** and driven by:
- **Go** — Core recon/monitor/hunt scripts (stdlib-only, no external dependencies)
- **Node.js** — PortSwigger lab solvers using Playwright
- **GitHub Actions** — 27 workflows for CI/CD, automation, and bot operations

---

## Features / 기능

| Category | Details |
|----------|---------|
| **Reconnaissance** | Subdomain enumeration (amass, subfinder), port scanning (nmap), screenshot (aquatone), DNS brute-forcing |
| **Diff Monitoring** | Detect NEW subdomains/endpoints via periodic crt.sh scans + Discord webhook alerts |
| **Vulnerability Hunting** | Nuclei templates, nuclei-armed, custom Go hunters for: IDOR, SSRF, XSS, SQLi, Command Injection, Race Conditions |
| **PortSwigger Labs** | Automated solver for Web Security Academy labs (basic → advanced) using Playwright |
| **GitHub Automation** | Auto-PR reviews, auto-merge, issue management, docs sync, release publishing, CI self-healing |
| **Secret Detection** | Gitleaks pre-commit hooks, secret scanning in CI |
| **Code Quality** | CodeQL analysis, actionlint, dependency review, Scorecard |

---

## Architecture / 아키텍처

```
bug/
├── Makefile                  # Orchestration layer — 'make help' shows all commands
├── config/
│   └── targets.json          # Target domains + Discord webhook configuration
├── scripts/
│   ├── *.go                  # Core Go automation (setup, recon, monitor, hunt, lib)
│   ├── *.mjs                # Node.js lab runners (lab-runner, lab-solver, lab-gap-solver)
│   ├── *.cjs                # Batch solvers and diagnostic scripts
│   └── *.sh                 # Shell wrappers (interactsh, lab URL fetchers)
├── notes/
│   ├── phase2-checklist.md   # Learning checklist
│   └── report-template.md    # Bug report template
├── _bot-scripts/             # GitHub App / Actions automation
│   ├── pr_review_runner.py   # Auto PR reviewer (GPT-5.5 via CLIProxyAPI)
│   ├── repo_review.py        # Repository health checker
│   └── scripts/
│       ├── generate_readme.py
│       └── redact_exposed_secrets.py
├── .github/
│   └── workflows/           # 27 GitHub Actions workflows
├── recon/                    # Scan output (gitignored)
├── targets/                  # Target baselines (gitignored)
├── reports/                  # Submitted reports (gitignored)
└── wordlists/                # SecLists downloads (gitignored)
```

---

## Automation Inventory / 자동화 인벤토리

### GitHub Actions Workflows

| # | Workflow File | Purpose |
|---|---------------|---------|
| 1 | `01_branch-to-pr.yml` | Auto-create PR from branch |
| 2 | `02_issue-to-branch.yml` | Create branch from issue |
| 3 | `03_pr-checks.yml` | PR validation checks |
| 4 | `04_actionlint.yml` | Lint GitHub Actions YAML |
| 5 | `05_gitleaks.yml` | Secret scanning |
| 6 | `06_codeql.yml` | CodeQL security analysis |
| 7 | `07_dependency-review.yml` | Dependency vulnerability review |
| 8 | `08_scorecard.yml` | OpenSSF Scorecard assessment |
| 9 | `09_semantic-pr.yml` | Enforce semantic PR titles |
| 10 | `10_pr-review.yml` | Auto PR review (GPT-5.5 via CLIProxyAPI) |
| 12 | `12_dependabot-auto-merge.yml` | Auto-merge Dependabot PRs |
| 13 | `13_pr-auto-merge.yml` | Auto-merge qualifying PRs |
| 14 | `14_bot-auto-fix.yml` | Bot-triggered auto-fixes |
| 15 | `15_merged-pr-cleanup.yml` | Post-merge cleanup |
| 18 | `18_issue-management.yml` | Issue labeling and triage |
| 19 | `19_issue-backfill.yml` | Backfill issues from project data |
| 20 | `20_readme-gen.yml` | Auto-regenerate README |
| 21 | `21_docs-sync.yml` | Sync documentation |
| 24 | `24_release-notes.yml` | Auto-generate release notes |
| 25 | `25_release-publish.yml` | Publish releases |
| 29 | `29_downstream-health-check.yml` | Monitor downstream dependencies |
| 37 | `37_ci-failure-issues.yml` | Auto-create issues from CI failures |
| 42 | `42_reusable-docs-sync.yml` | Reusable docs sync workflow |
| 43 | `43_reusable-issue-management.yml` | Reusable issue management workflow |
| 44 | `44_reusable-pr-checks.yml` | Reusable PR checks workflow |
| 60 | `60_ci-auto-heal.yml` | Self-healing CI pipeline |
| — | `ci.yml` | Main CI pipeline |

### Go Automation Tools

| Script | Purpose |
|--------|---------|
| `scripts/setup.go` | Verify tools installed, download SecLists wordlists |
| `scripts/recon.go` | 5-phase recon pipeline (subdomain → port → screenshot → tech → nuclei) |
| `scripts/monitor.go` | Diff monitoring + crt.sh enumeration + Discord alerts |
| `scripts/hunt.go` | 4-phase vulnerability hunting (IDOR, SSRF, XSS, SQLi, more) |
| `scripts/lib.go` | Shared helpers: `loadLines`, `countLines`, `queryCrtSh`, `mergeFiles`, `writeLines`, `truncate`, logging |

> **Note**: All Go scripts use only stdlib. No `go.mod` — run via `go run scripts/x.go`.

### Node.js / JavaScript Scripts

| Script | Purpose |
|--------|---------|
| `lab-runner.mjs` | Main PortSwigger lab runner — invokes Python solvers via `portswigger-solver-wrapper.py` |
| `lab-solver.mjs` | Custom Playwright-based lab solvers (559 lines) |
| `lab-gap-solver.mjs` | Gap solver for labs without official Python scripts (1236 lines) |
| `lab-batch-*.mjs` | Batch lab solving scripts (fast, slow, OOB, smuggling variants) |
| `hunt.go` | (Go) Vulnerability hunting orchestrator |
| `hunt.go` | (Go) Vulnerability hunting orchestrator |

---

## Quick Start / 빠른 시작

### Prerequisites / 사전 요구사항

| Tool | Installation |
|------|-------------|
| Go 1.21+ | `go install` or [go.dev/dl](https://go.dev/dl/) |
| Node.js 18+ | [nodejs.org](https://nodejs.org/) |
| Playwright | `npx playwright install` |
| amass | `go install github.com/owasp-amass/amass/v3/...@latest` |
| subfinder | `go install -github.com/projectdiscovery/subfinder/v2/...@latest` |
| nuclei | `go install github.com/projectdiscovery/nuclei/v3/...@latest` |
| nmap | System package manager |

### Setup

```bash
# Clone the repository
git clone https://github.com/jclee941/bug.git
cd bug

# First-time setup — verify tools + download wordlists
make setup
```

### Basic Usage / 기본 사용법

```bash
# Show all available commands
make help

# Full recon on a target
make recon TARGET=example.com

# Quick recon (skip nuclei scan)
make recon-fast TARGET=example.com

# Monitor for NEW subdomains/endpoints (diff-based)
make monitor TARGET=example.com

# Hunt for all vulnerability types
make hunt TARGET=example.com

# Hunt specific vulnerability type
make hunt-idor TARGET=example.com
make hunt-ssrf TARGET=example.com

# Full scan: recon + hunt combined
make full-scan TARGET=example.com

# Clean up scan results
make clean
```

---

## Local Development / 로컬 개발

### Project Structure

```
bug/
├── Makefile              # Entry point — all orchestration via make
├── config/targets.json    # Add/edit targets here
├── scripts/              # Go + Node.js scripts
│   ├── recon.go          # Modify recon pipeline here
│   ├── hunt.go           # Add new vulnerability categories → edit huntTypes slice
│   ├── monitor.go        # Modify monitoring logic here
│   └── lib.go            # Shared utilities
├── notes/
│   └── report-template.md  # Customize bug report format
└── .github/workflows/    # 27 workflow files
```

### Adding a New Target

Edit `config/targets.json`:

```json
{
  "targets": [
    {
      "domain": "yourtarget.com",
      "program": "https://bugcrowd.com/yourprogram",
      "discord_webhook": "https://discord.com/api/webhooks/..."
    }
  ]
}
```

### Adding a Vulnerability Category

Edit `scripts/hunt.go` → find the `huntTypes` slice and add your category:

```go
var huntTypes = []string{
    "idor", "ssrf", "xss", "sqli", "command-injection", "your-new-type",
}
```

### Running Individual Scripts

```bash
# Run Go scripts directly
go run scripts/setup.go scripts/lib.go
go run scripts/recon.go scripts/lib.go -d example.com
go run scripts/monitor.go scripts/lib.go -d example.com
go run scripts/hunt.go scripts/lib.go -d example.com

# Run Node.js lab solver
node scripts/lab-runner.mjs --lab=xss/stored
node scripts/lab-solver.mjs --lab=sqli/blind
```

---

## Commands Reference / 명령어 참조

### Make Targets

| Command | Description |
|---------|-------------|
| `make help` | Display all available commands |
| `make setup` | First-time setup — verify tools, download wordlists |
| `make recon TARGET=domain.com` | Full 5-phase recon pipeline |
| `make recon-fast TARGET=domain.com` | Recon without nuclei scan |
| `make monitor TARGET=domain.com` | Diff-based change detection |
| `make hunt TARGET=domain.com` | All vulnerability categories |
| `make hunt-idor TARGET=domain.com` | IDOR vulnerabilities only |
| `make hunt-ssrf TARGET=domain.com` | SSRF vulnerabilities only |
| `make full-scan TARGET=domain.com` | Recon + hunt combined |
| `make clean` | Remove scan results |

### Go Script Flags

```bash
go run scripts/recon.go scripts/lib.go -d example.com [-skip-nuclei] [-rate=100]
go run scripts/monitor.go scripts/lib.go -d example.com [-interval=24h]
go run scripts/hunt.go scripts/lib.go -d example.com [-type=idor] [-rate=100]
```

---

## Contributing / 기여하기

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Development Workflow

1. **Fork** the repository
2. **Create a branch**: `git checkout -b feature/your-feature-name`
3. **Make changes** — follow existing conventions in `scripts/*.go`
4. **Run linting**: `actionlint` (via `04_actionlint.yml` locally or in CI)
5. **Commit** using semantic commit messages
6. **Open a PR** — auto-checks will run (`03_pr-checks.yml`, `06_codeql.yml`, `05_gitleaks.yml`)
7. **PR review** is automated via `10_pr-review.yml` (GPT-5.5 via CLIProxyAPI)

### Key Conventions

| Rule | Reason |
|------|--------|
| Go scripts = stdlib only | No dependency management overhead |
| No `go.mod` in root | Scripts run via `go run` |
| Never commit `recon/`, `targets/`, `reports/` | Sensitive scan data must be gitignored |
| Never hardcode target domains | Use `config/targets.json` |
| Respect rate limits | Default: 100 req/s for nuclei |

### Bot Automation

This repository is managed by **`jclee-bot`**:

- **Auto PR Review**: `10_pr-review.yml` → GPT-5.5 via CLIProxyAPI
- **Auto Merge**: `13_pr-auto-merge.yml` for qualifying PRs
- **Auto Fix**: `14_bot-auto-fix.yml` for bot-triggered patches
- **CI Self-Heal**: `60_ci-auto-heal.yml` for failing pipeline recovery
- **Issue Management**: `18_issue-management.yml`, `19_issue-backfill.yml`
- **Docs Sync**: `20_readme-gen.yml`, `21_docs-sync.yml`

---

## License / 라이선스

This project is licensed under the **ISC License**. See [LICENSE](LICENSE) for details.

---

## Acknowledgments /Acknowledgments

Built with: [amass](https://github.com/owasp-amass/amass), [subfinder](https://github.com/projectdiscovery/subfinder), [nuclei](https://github.com/projectdiscovery/nuclei), [Playwright](https://playwright.dev/), [PortSwigger Web Security Academy](https://portswigger.net/web-security)

---

> **This README is auto-generated by `jclee-bot`**
> 
> 한국어 README: [README.ko.md](docs/README.ko.md) (generated)
> 
> Last updated: `make generate-readme` or trigger `20_readme-gen.yml`
```