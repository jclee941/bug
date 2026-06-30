# Bug Bounty Automation Toolkit / 버그 바운티 자동화 툴킷

> Reconnaissance, monitoring, and targeted vulnerability hunting for responsible security research and bug bounty programs.
>
> 책임 있는 보안 연구 및 버그 바운티 프로그램을 위한 정찰, 모니터링, 표적형 취약점 헌팅 도구 모음입니다.

---

## Overview / 개요

This toolkit orchestrates a complete bug-bounty workflow — from initial asset discovery and continuous monitoring to targeted vulnerability scanning (IDOR, SSRF, …) and browser-driven lab exercises. Performance-critical stages run as Go binaries that wrap external CLI tools through `os/exec`, while Playwright-based lab runners operate on safe, scoped platforms. A single `Makefile` exposes consistent entry points across operators and machines, and every artifact is written to timestamped, gitignored directories so the working tree stays clean.

이 툴킷은 초기 자산 발견과 지속적 모니터링부터 IDOR·SSRF 등 표적형 취약점 스캔, 브라우저 기반 실습까지 버그 바운티 워크플로우 전체를 오케스트레이션합니다. 성능이 중요한 단계는 `os/exec`로 외부 CLI 도구를 래핑하는 Go 바이너리로, 실습 플랫폼에서는 Playwright(Node.js)가 동작하며, 단일 `Makefile`을 통해 운영자와 머신 전체에서 일관된 진입점을 제공합니다. 모든 결과물은 타임스탬프가 붙은 gitignore 디렉터리에 저장되어 작업 트리를 깔끔하게 유지합니다.

### Intended Audience / 대상 사용자

- **Bug bounty hunters** running structured engagements / 구조화된 업무를 진행하는 버그 바운티 헌터
- **Application security engineers** tracking asset changes over time / 자산 변화를 지속적으로 추적하는 애플리케이션 보안 엔지니어
- **CTF / lab participants** practicing exploitation in safe environments / 안전한 환경에서 익스플로잇을 연습하는 CTF·실습 참여자

### Responsible Use / 책임 있는 사용

Run this toolkit only against systems you are explicitly authorized to test — your own assets, scoped bug bounty programs, or dedicated lab platforms such as PortSwigger Web Security Academy, HackTheBox, or TryHackMe. Unauthorized scanning may violate computer-misuse laws in your jurisdiction. All scripts default to conservative rate limits (`nuclei` capped at 100 req/s) and write results locally so nothing leaves your machine without an explicit forward step.

본 툴킷은 명시적으로 테스트 권한을 부여받은 시스템(자체 자산, 스코프가 정의된 버그 바운티 프로그램, PortSwigger Web Security Academy, HackTheBox, TryHackMe 같은 전용 실습 플랫폼)에서만 사용하십시오. 권한 없는 스캔은 관할 지역의 컴퓨터 오용 법규를 위반할 수 있습니다. 모든 스크립트는 보수적인 레이트 리밋(`nuclei` 기본 100 req/s)을 기본으로 사용하며, 별도 송출 단계 없이는 결과물이 로컬을 벗어나지 않습니다.

---

## Features / 기능

| Stage | Capability | Implementation |
|-------|------------|----------------|
| Setup / 설정 | Tool verification, SecLists download | `scripts/setup.go` |
| Recon / 정찰 | 5-phase asset discovery pipeline | `scripts/recon.go` |
| Monitoring / 모니터링 | Diff detection, crt.sh sync, alerts | `scripts/monitor.go` |
| Hunting / 헌팅 | IDOR, SSRF, and additional categories | `scripts/hunt.go` |
| Lab runner / 실습 러너 | Browser-driven automation (Playwright) | `scripts/lab-runner.mjs`, `scripts/lab-solver.mjs` |
| Orchestration / 오케스트레이션 | Single-entry `make` interface | `Makefile` |
| Reporting / 리포팅 | Markdown templates, structured artifacts | `notes/` |

각 단계는 독립적으로 실행되며, 결과물은 타임스탬프 디렉터리에 누적됩니다. 각 단계는 독립적으로 실행되며 결과물은 타임스탬프 디렉터리에 누적됩니다.

---

## Architecture / 아키텍처

### Repository Layout / 저장소 구조

```
.
├── AGENTS.md                 # Knowledge base for AI agents
├── CONTRIBUTING.md           # Contribution guide
├── LICENSE                   # License terms
├── Makefile                  # Orchestration entry point
├── README.md                 # This document
├── package.json              # Playwright (Node.js) metadata
├── package-lock.json         # Locked dependency versions
├── config/
│   └── targets.json          # Target + notification configuration
├── scripts/
│   ├── setup.go              # Tool verification + wordlist download
│   ├── recon.go              # 5-phase recon pipeline
│   ├── monitor.go            # Diff monitoring + crt.sh + Discord alerts
│   ├── hunt.go               # 4-phase targeted vulnerability hunting
│   ├── lab-runner.mjs        # Playwright lab automation (Node.js)
│   └── lab-solver.mjs        # Playwright lab solver (Node.js)
└── notes/
    ├── phase2-checklist.md   # Learning checklist
    ├── report-template.md    # Bug report template
    └── vulnerability-study.md # Vulnerability study notes
```

### Runtime Components / 런타임 구성 요소

| Component | Runtime | External Tools (via `os/exec`) | Output |
|-----------|---------|-------------------------------|--------|
| `setup.go` | Go stdlib | `go`, `curl`, `git` | `wordlists/` |
| `recon.go` | Go stdlib | `subfinder`, `amass`, `httpx`, `nuclei` | `recon/<timestamp>/` |
| `monitor.go` | Go stdlib | `subfinder`, `crt.sh`, `curl` | `targets/<domain>/`, alerts |
| `hunt.go` | Go stdlib | `ffuf`, `nuclei`, custom probes | `recon/<timestamp>/hunt/` |
| `lab-runner.mjs` | Node.js + Playwright | Chromium (Playwright-managed) | Session logs |
| `lab-solver.mjs` | Node.js + Playwright | Chromium (Playwright-managed) | Session logs |

### Request Flow / 요청 흐름

1. Operator invokes a `make` target such as `make recon TARGET=example.com`.
2. `Makefile` validates the `TARGET` variable, then executes `go run scripts/<phase>.go -d <domain>`.
3. The Go script initializes a timestamped output directory under `recon/` (gitignored).
4. Each pipeline stage shells out to a CLI tool with rate-limited flags; stdout/stderr are captured to per-stage logs.
5. Stage outputs feed the next stage (e.g., subdomains → HTTP probing → nuclei).
6. Final artifacts (JSON, TXT, Markdown) are written locally; nothing is transmitted without an explicit forward step.
7. For lab work, `lab-runner.mjs` / `lab-solver.mjs` are invoked directly via Node.js and drive a Playwright-managed browser session.

### Conventions / 컨벤션

- All Go scripts are standalone single-file programs — no `go.mod`, run via `go run scripts/<name>.go`.
- Each Go script depends only on the standard library.
- External tools are invoked as `os/exec` CLI wrappers, never as in-process libraries.
- Results are stored in timestamped directories under `recon/`.
- Sensitive scan data lives in gitignored directories (`recon/`, `targets/`, `reports/`, `wordlists/`).

---

## Quick Start / 빠른 시작

### Prerequisites / 사전 요구 사항

| Tool | Purpose | Install |
|------|---------|---------|
| Go ≥ 1.21 | Run pipeline scripts | https://go.dev/dl/ |
| Node.js ≥ 18 | Run Playwright lab tools | https://nodejs.org/ |
| `subfinder` | Subdomain enumeration | `go install -v github.com/projectdiscovery/subfinder/v2/cmd/subfinder@latest` |
| `httpx` | HTTP probing | `go install -v github.com/projectdiscovery/httpx/cmd/httpx@latest` |
| `nuclei` | Template-based scanning | `go install -v github.com/projectdiscovery/nuclei/v3/cmd/nuclei@latest` |
| `amass` (optional) | Additional recon | https://github.com/owasp-amass/amass |
| `ffuf` (optional) | Fuzzing | https://github.com/ffuf/ffuf |

### Installation / 설치

```bash
# Clone
git clone https://github.com/jclee941/jclee-bot
cd bug

# Install Node.js dependencies (Playwright)
npm install

# Verify external tools and download SecLists wordlists
make setup
```

### First Run / 첫 실행

```bash
# Inspect available commands
make help

# Full recon on an authorized target
make recon TARGET=your-target.example

# Monitor a target for new subdomains / endpoints
make monitor TARGET=your-target.example

# Targeted vulnerability hunting
make hunt TARGET=your-target.example

# Combined recon + hunt
make full-scan TARGET=your-target.example
```

Replace `your-target.example` with a domain you are explicitly authorized to test.

---

## Configuration / 설정

### `config/targets.json`

Stores per-target metadata (notification webhooks, scope notes, baseline paths) consumed by the recon and monitor scripts. See the in-repo file for the canonical schema; do not commit secrets — use a local override or environment variables.

| Field | Type | Purpose |
|-------|------|---------|
| `targets[]` | array | List of authorized target definitions |
| `targets[].domain` | string | FQDN to scan |
| `targets[].program` | string | Bug-bounty program identifier |
| `targets[].scope` | array | In-scope hosts / endpoints |
| `targets[].notifications` | object | Alert channels (e.g., Discord webhook env var) |

### Environment Variables / 환경 변수

| Variable | Consumed by | Description |
|----------|-------------|-------------|
| `DISCORD_WEBHOOK_URL` | `monitor.go` | Optional alert destination (never commit) |
| `NUCLEI_RATE_LIMIT` | `recon.go`, `hunt.go` | Requests/sec for nuclei (default `100`) |
| `WORDLISTS_DIR` | `setup.go` | Override SecLists download path (default `./wordlists`) |

### Per-Script Flags / 스크립트 플래그

Each Go script accepts domain + operational flags. Common examples:

| Script | Flag | Default | Description |
|--------|------|---------|-------------|
| `recon.go` | `-d` | (required) | Target domain |
| `recon.go` | `-skip-nuclei` | `false` | Skip the nuclei scanning phase |
| `recon.go` | `-rate` | `100` | Nuclei rate limit (req/s) |
| `monitor.go` | `-d` | (required) | Target domain |
| `hunt.go` | `-d` | (required) | Target domain |
| `hunt.go` | `-type` | (all) | Restrict hunt categories (`idor`, `ssrf`, …) |

Refer to each script's `flag` declarations for the authoritative list.

---

## Commands Reference / 명령어 레퍼런스

| Command | Description |
|---------|-------------|
| `make help` | List all available commands with descriptions |
| `make setup` | Verify installed tools; download SecLists wordlists |
| `make recon TARGET=<domain>` | Run the full 5-phase recon pipeline |
| `make recon-fast TARGET=<domain>` | Run recon without nuclei scanning |
| `make monitor TARGET=<domain>` | Diff monitoring — detect new subdomains / endpoints |
| `make hunt TARGET=<domain>` | Run all targeted vulnerability categories |
| `make hunt-idor TARGET=<domain>` | Hunt IDOR vulnerabilities only |
| `make hunt-ssrf TARGET=<domain>` | Hunt SSRF vulnerabilities only |
| `make full-scan TARGET=<domain>` | Recon + hunt combined |
| `make clean` | Remove generated scan results |

Every target that consumes `TARGET=` exits with a usage hint when the variable is empty.

### Direct Script Invocation / 스크립트 직접 실행

```bash
# Go pipelines
go run scripts/setup.go
go run scripts/recon.go -d example.com
go run scripts/recon.go -d example.com -skip-nuclei
go run scripts/monitor.go -d example.com
go run scripts/hunt.go -d example.com
go run scripts/hunt.go -d example.com -type idor

# Playwright lab automation (Node.js)
node scripts/lab-runner.mjs
node scripts/lab-solver.mjs
```

---

## Local Development / 로컬 개발

### Working Tree Hygiene / 작업 트리 관리

Generated artifacts are intentionally gitignored. The expected output directories are:

| Path | Contents |
|------|----------|
| `recon/` | Timestamped recon / hunt results |
| `targets/` | Per-domain baselines used by `monitor.go` |
| `reports/` | Submitted bug reports |
| `wordlists/` | Downloaded SecLists data |

Run `make clean` to wipe generated scan results between engagements.

### Editing a Pipeline / 파이프라인 수정

1. Identify the stage in the relevant `scripts/*.go` file (e.g., the subdomain enumeration phase of `recon.go`).
2. Update the CLI invocation; keep external-tool calls behind `os/exec` so behavior is observable and replaceable.
3. Maintain a stable per-stage log path so downstream stages can find prior outputs.
4. Re-run `make setup` only when introducing new external tools (it verifies presence and prints versions).

### Adding a Hunt Category / 헌팅 카테고리 추가

1. Append the category string to the `huntTypes` slice in `scripts/hunt.go`.
2. Implement the corresponding handler function and wire it into the phase dispatcher.
3. Expose a `make hunt-<category>` target in `Makefile` (mirror the `hunt-idor` / `hunt-ssrf` pattern).
4. Document the new flag and output format in `README.md` and `AGENTS.md`.

### Adding a Lab Tool / 실습 도구 추가

1. Create `scripts/<name>.mjs` and import Playwright from the local `node_modules`.
2. Keep browser contexts scoped to authorized lab hosts.
3. Update `package.json` if new dependencies are introduced.

---

## Testing / 테스트

The Go scripts depend only on the standard library and shell out to external CLI tools, so there is no in-process unit-test suite. Verify changes with the following checks:

| Check | Command | What it confirms |
|-------|---------|------------------|
| Toolchain presence | `make setup` | Required CLIs are installed and callable |
| Static sanity | `go vet ./...` (per script) | No obvious bugs in Go source |
| Pipeline smoke | `make recon-fast TARGET=localhost` (lab host) | Phases compose without errors |
| Hunt smoke | `make hunt-idor TARGET=localhost` (lab host) | Category handler executes |
| Lab automation | `node scripts/lab-runner.mjs --dry-run` (if supported) | Playwright bootstrap works |

Authorized lab hosts (PortSwigger Academy, HackTheBox, TryHackMe) are the recommended smoke-test environments.

---

## Contributing / 기여

1. Read `CONTRIBUTING.md` for the project's contribution policy.
2. Create a topic branch from the default branch.
3. Make focused changes — prefer small, reviewable diffs.
4. Keep generated scan artifacts out of commits (`recon/`, `targets/`, `reports/`, `wordlists/` are gitignored).
5. Never hardcode target domains, API keys, or webhook URLs in committed files.
6. Run `make help` after editing `Makefile` to confirm the target list is well-formed.
7. Open a pull request describing the motivation, behavior change, and any new external-tool requirements.

Report security issues privately through the channel described in `CONTRIBUTING.md` rather than as public issues.

---

## Anti-Patterns / 금지 사항

- Never commit scan results (`recon/`, `targets/`, `reports/`, `wordlists/`).
- Never hardcode target domains, API keys, or webhook URLs in scripts.
- Never run scans against systems without explicit program authorization.
- Never exceed the default rate limits (100 req/s for nuclei) without operator awareness.
- Never replace the external-tool wrapping with in-process libraries — the CLI boundary is intentional.

---

## License / 라이선스

Released under the terms described in `LICENSE`. By using this toolkit you agree to operate only against systems you are authorized to test.

`LICENSE` 파일에 명시된 조건에 따라 배포됩니다. 본 툴킷을 사용함으로써 권한을 부여받은 시스템에 대해서만 운영することに 동의하는 것으로 간주됩니다.