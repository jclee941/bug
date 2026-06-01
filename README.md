# Bug Bounty Automation Toolkit

A comprehensive, production-grade automation framework for full-spectrum bug bounty hunting — from passive reconnaissance and continuous target monitoring to structured vulnerability hunting and automated lab solving.

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Automation Inventory](#automation-inventory)
- [Quick Start](#quick-start)
- [Local Development](#local-development)
- [Commands Reference](#commands-reference)
- [Contribution Guide](#contribution-guide)

---

## Overview

This toolkit orchestrates a complete bug bounty workflow across three runtime environments:

| Layer | Language | Purpose |
|-------|----------|---------|
| **Pipeline Scripts** | Go 1.21+ | Recon, monitoring, and vulnerability hunting orchestration |
| **Lab Solvers** | Node.js (ESM) | Interactive PortSwigger Web Security Academy solving |
| **Automation Runners** | Python 3.11+ | PR review, README generation, and bridge logic |

The framework is target-agnostic and configured entirely via `config/targets.json`. All scan artifacts are stored locally and gitignored.

---

## Features

- **5-Phase Recon Pipeline** — PassiveDNS → Subdomain enumeration → Port scanning → HTTP probing → Vulnerability templating
- **Real-time Diff Monitoring** — Continuous comparison against stored baselines with Discord webhook alerting
- **4-Category Vulnerability Hunting** — IDOR, SSRF, Access Control, and Information Disclosure
- **PortSwigger Lab Automation** — Multi-script solver stack with Playwright, Python bridges, and batch orchestration
- **GitHub Workflow Automation** — 29 workflows covering PR lifecycle, security scanning, release management, and bot operations
- **Bot Auto-Fix System** — Automated issue → branch → fix → PR pipeline for critical vulnerabilities

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           LOCAL HUNTING STACK                           │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐               │
│  │  setup.go    │    │  recon.go    │    │  monitor.go  │               │
│  │  (208L)      │    │  (282L)      │    │  (254L)      │               │
│  └──────────────┘    └──────────────┘    └──────────────┘               │
│         │                   │                   │                       │
│         └───────────────────┴───────────────────┘                       │
│                             │                                           │
│                      ┌──────┴──────┐                                   │
│                      │  lib.go     │                                   │
│                      │  (114L)     │                                   │
│                      └─────────────┘                                   │
│                             │                                           │
│  ┌──────────────┐    ┌──────┴──────┐    ┌──────────────┐               │
│  │  hunt.go     │    │  CLI Tools  │    │   nuclei     │               │
│  │  (464L)      │    │  (subfinder │    │   ffuf       │               │
│  │              │    │   amass     │    │   sqlmap     │               │
│  │              │    │   nmap      │    │   dalfox     │               │
│  │              │    │   httpx)    │    │   nuclei     │               │
│  └──────────────┘    └─────────────┘    └──────────────┘               │
│                                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│                          LAB SOLVING STACK                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌──────────────────┐  ┌─────────────────────┐                         │
│  │  lab-runner.mjs  │──│  portswigger-solver │                         │
│  │  (262L)          │  │  -wrapper.py        │                         │
│  └────────┬─────────┘  └─────────────────────┘                         │
│           │                                                           │
│  ┌────────┴─────────┐  ┌─────────────────────┐                         │
│  │  lab-solver.mjs  │──│  lab-gap-solver.mjs │                         │
│  │  (559L)          │  │  (1236L)            │                         │
│  └──────────────────┘  └─────────────────────┘                         │
│                                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│                        GITHUB AUTOMATION LAYER                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                   │
│  │ PR Workflows │  │ Sec Workflows│  │ Bot Workflows│                   │
│  │              │  │              │  │              │                   │
│  │ • branch-pr  │  │ • gitleaks   │  │ • issue-mgmt │                   │
│  │ • issue-branch│ │ • codeql     │  │ • bot-fix    │                   │
│  │ • pr-checks  │  │ • dependency │  │ • auto-merge │                   │
│  │ • auto-merge │  │   review     │  │              │                   │
│  │ • semantic-pr│  │ • scorecard  │  │              │                   │
│  └──────────────┘  └──────────────┘  └──────────────┘                   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Key Libraries (Go stdlib only)

All Go scripts depend solely on `lib.go` for shared operations:

| Function | Purpose |
|----------|---------|
| `loadLines(path)` | Read file into slice |
| `countLines(path)` | Fast line counting |
| `queryCrtSh(domain)` | Certificate transparency lookup |
| `mergeFiles(out, files...)` | Stream-merge multiple files |
| `writeLines(path, lines)` | Atomic write with sync |
| `truncate(path, maxLines)` | Tail a file |
| `logPrint(format, args...)` | Timestamped console output |

---

## Automation Inventory

### GitHub Workflows (29 total)

#### PR Lifecycle (7 workflows)

| Workflow | File | Purpose |
|----------|------|---------|
| Branch → PR | `01_branch-to-pr.yml` | Auto-create PR from branch |
| Issue → Branch | `02_issue-to-branch.yml` | Create branch from issue label |
| PR Checks | `03_pr-checks.yml` | Combined CI gate (lint + test + build) |
| Semantic PR | `09_semantic-pr.yml` | Enforce conventional commit format |
| PR Auto-Merge | `13_pr-auto-merge.yml` | Auto-merge on green CI |
| Bot Auto-Fix | `14_bot-auto-fix.yml` | Automated fix pipeline |
| Merged PR Cleanup | `15_merged-pr-cleanup.yml` | Post-merge branch/tag cleanup |

#### Security Scanning (5 workflows)

| Workflow | File | Purpose |
|----------|------|---------|
| Gitleaks | `05_gitleaks.yml` | Secret detection in commits |
| CodeQL | `06_codeql.yml` | Static analysis for Go/JS/Python |
| Dependency Review | `07_dependency-review.yml` | License/vulnerability check |
| Scorecard | `08_scorecard.yml` | Supply chain security posture |
| PR Review (Security) | `security/11_pr-review.yml` | Security-specific PR review |

#### Automation & Bot (6 workflows)

| Workflow | File | Purpose |
|----------|------|---------|
| Issue Management | `18_issue-management.yml` | Label triage and state management |
| Issue Backfill | `19_issue-backfill.yml` | Sync issues with external state |
| README Gen | `20_readme-gen.yml` | Auto-generate documentation |
| Docs Sync | `21_docs-sync.yml` | Cross-repo documentation sync |
| CI Auto-Heal | `60_ci-auto-heal.yml` | Self-healing CI failures |
| CI Failure Issues | `37_ci-failure-issues.yml` | Auto-file issues for failing CI |

#### Release & Downstream (3 workflows)

| Workflow | File | Purpose |
|----------|------|---------|
| Release Notes | `24_release-notes.yml` | Auto-generate changelog |
| Release Publish | `25_release-publish.yml` | Publish to distribution渠道 |
| Downstream Health | `29_downstream-health-check.yml` | Monitor dependency health |

#### Reusable Workflows (4 workflows)

| Workflow | File | Purpose |
|----------|------|---------|
| Docs Sync | `42_reusable-docs-sync.yml` | Reusable documentation sync |
| Issue Management | `43_reusable-issue-management.yml` | Reusable issue triage |
| PR Checks | `44_reusable-pr-checks.yml` | Reusable CI gate |
| Gitleaks | `45_reusable-gitleaks.yml` | Reusable secret scanning |

#### Tooling & Dependabot (2 workflows)

| Workflow | File | Purpose |
|----------|------|---------|
| Actionlint | `04_actionlint.yml` | Workflow syntax validation |
| Dependabot Auto-Merge | `12_dependabot-auto-merge.yml` | Auto-merge dependency updates |

### External Tools Integrated

| Category | Tools |
|----------|-------|
| **Recon** | `subfinder`, `amass`, `nmap`, `httpx` |
| **Fuzzing** | `ffuf`, `nuclei` |
| **Vulnerability** | `sqlmap`, `dalfox`, `nuclei` |
| **Lab Solving** | `playwright`, `python3` |
| **SBOM/Scanning** | `grype`, `trivy`, `tfsec`, `checkov` |
| **GH Actions** | `actionlint`, `codeql-action`, `github/scorecard-action` |

### README Generation

Documentation is auto-generated using:

| Model | Provider | Fallback |
|-------|----------|----------|
| `minimax-m2.7` | Primary | `gpt-5.5` |
| Gateway | CLIProxyAPI | — |

**Note:** This repository does not host CLIProxyAPI. External integrations are via the documented API endpoints only.

---

## Quick Start

### Prerequisites

- Go 1.21+
- Node.js 18+ (ESM)
- Python 3.11+
- GitHub CLI (`gh`)

### First-Time Setup

```bash
# Clone and enter repository
git clone <repo-url>
cd bug-bounty-automation

# Run setup (verifies tools, downloads SecLists)
make setup

# Configure targets
vim config/targets.json
```

### Basic Workflow

```bash
# Full recon pipeline
make recon TARGET=example.com

# Monitor for changes (run periodically via cron)
make monitor TARGET=example.com

# Hunt vulnerabilities
make hunt TARGET=example.com

# Combined scan
make full-scan TARGET=example.com
```

---

## Local Development

### Project Structure

```
.
├── Makefile                  # All orchestration commands
├── config/
│   └── targets.json          # Target + webhook configuration
├── scripts/
│   ├── setup.go              # Tool verification + wordlist download
│   ├── recon.go              # 5-phase recon pipeline
│   ├── monitor.go            # Diff monitoring + crt.sh + Discord alerts
│   ├── hunt.go                # 4-phase vulnerability hunting
│   ├── lib.go                # Shared Go utilities (114L)
│   ├── lab-runner.mjs         # PortSwigger lab entry point
│   ├── lab-solver.mjs         # Custom Playwright solvers
│   ├── lab-gap-solver.mjs     # Gap-based lab solving
│   ├── lab-batch-*.mjs        # Batch orchestration scripts
│   ├── portswigger-solver-wrapper.py  # Python bridge
│   └── pr_review_runner.py    # PR review automation
├── notes/
│   ├── phase2-checklist.md    # Learning checklist
│   └── report-template.md     # Bug report template
├── _bot-scripts/             # Bot management scripts
├── recon/                    # Scan results (gitignored)
├── targets/                  # Target baselines (gitignored)
├── reports/                  # Submitted reports (gitignored)
└── wordlists/                # SecLists (gitignored)
```

### Running Individual Scripts

All Go scripts are standalone and use only stdlib:

```bash
go run scripts/setup.go
go run scripts/recon.go -target example.com
go run scripts/monitor.go -target example.com
go run scripts/hunt.go -target example.com -category idor
```

### Lab Solving

```bash
# Solve a single lab
node scripts/lab-runner.mjs lab-id

# Run batch labs
node scripts/lab-batch-solver.mjs --category xss

# Gap solving (no existing solver)
node scripts/lab-gap-solver.mjs --target lab-id
```

### Configuration

Edit `config/targets.json`:

```json
{
  "targets": [
    {
      "domain": "target.com",
      "program": "Bug Bounty Program",
      "rateLimit": 100,
      "discordWebhook": "https://discord.com/api/webhooks/..."
    }
  ]
}
```

---

## Commands Reference

Run `make help` for the full list.

### Core Commands

| Command | Description |
|---------|-------------|
| `make help` | Display all available targets |
| `make setup` | First-time environment setup |
| `make clean` | Remove all scan artifacts |

### Recon Commands

| Command | Description |
|---------|-------------|
| `make recon TARGET=x.com` | Full 5-phase recon pipeline |
| `make recon-fast TARGET=x.com` | Recon without nuclei templates |

### Monitoring Commands

| Command | Description |
|---------|-------------|
| `make monitor TARGET=x.com` | Diff-based baseline monitoring |

### Hunt Commands

| Command | Description |
|---------|-------------|
| `make hunt TARGET=x.com` | All vulnerability categories |
| `make hunt-idor TARGET=x.com` | IDOR only |
| `make hunt-ssrf TARGET=x.com` | SSRF only |

### Combined Commands

| Command | Description |
|---------|-------------|
| `make full-scan TARGET=x.com` | Recon + hunt in sequence |

### PortSwigger Lab Commands

```bash
# Single lab
node scripts/lab-runner.mjs SQLI-LAB-ID

# Batch by category
node scripts/lab-batch-sql.mjs

# Custom solver development
node scripts/lab-solver.mjs --help
```

---

## Contribution Guide

### Adding a New Vulnerability Category

1. Add the category to `huntTypes` slice in `scripts/hunt.go`:

```go
var huntTypes = []string{"idor", "ssrf", "access-control", "new-category"}
```

2. Implement the `huntNewCategory` function following the pattern of existing hunters.
3. Add corresponding nuclei templates or ffuf wordlists.
4. Update `notes/phase2-checklist.md` with the new category.

### Adding a New GitHub Workflow

1. Create the workflow file under `.github/workflows/`
2. Follow naming convention: `##_short-description.yml`
3. Add corresponding reusable workflow if applicable
4. Update this README's automation inventory

### Adding a New Lab Solver

1. Create solver script under `scripts/` following `lab-solver.mjs` pattern
2. Register in `lab-runner.mjs` exports
3. Add wrapper if Python bridge needed (see `portswigger-solver-wrapper.py`)
4. Document in notes/phase2-checklist.md

### Code Standards

- **Go**: stdlib only, no external dependencies
- **Node.js**: ESM modules (`*.mjs`), no CommonJS
- **Python**: 3.11+ syntax, type hints preferred
- **Workflows**: Must pass `actionlint` validation
- **Secrets**: Use GitHub encrypted secrets, never hardcode

### Pull Request Process

1. Create branch from issue or use `02_issue-to-branch.yml` automation
2. Run `make recon-fast` locally to validate changes
3. Open PR with conventional commit message (enforced by `09_semantic-pr.yml`)
4. Ensure all CI checks pass (CodeQL, Gitleaks, dependency review)
5. Request review from maintainers

### Reporting Security Issues

For vulnerabilities in this toolkit itself:

1. **Do not** open a public GitHub issue
2. Email maintainers directly (if contact available)
3. Allow 48-hour response window before any disclosure

---

## License

This project is for authorized bug bounty hunting only. Ensure you have explicit authorization before scanning any target. See individual tool licenses for their respective terms.

---

*Last auto-generated by `minimax-m2.7` with fallback to `gpt-5.5` via CLIProxyAPI.*
