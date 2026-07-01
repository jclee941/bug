# Bug Bounty Automation Toolkit / 버그 바운티 자동화 툴킷

> Reconnaissance, change monitoring, and targeted vulnerability hunting for responsible security research and bug bounty programs.
>
> 책임 있는 보안 연구 및 버그 바운티 프로그램을 위한 정찰, 변경 모니터링, 표적형 취약점 헌팅 도구 모음입니다.

---

## Overview / 개요

A Go-orchestrated security toolkit that wraps external CLI tooling to cover the full bug-bounty lifecycle: initial asset discovery, diff-based change monitoring, targeted vulnerability scanning (IDOR, SSRF, …), and Playwright-driven lab exercises against scoped, isolated environments. The Go scripts depend only on the standard library and execute third-party tools (`subfinder`, `httpx`, `nuclei`, `waybackurls`, …) through `os/exec`, while a parallel pair of Node.js scripts handles browser-based lab workflows under Playwright. All entry points are exposed through a single `Makefile`, all artifacts are written to timestamped, gitignored directories, and nothing leaves the operator's machine without an explicit forward step.

`os/exec`로 외부 CLI 도구(`subfinder`, `httpx`, `nuclei`, `waybackurls` 등)를 래핑하여 버그 바운티 전 과정을 다루는 Go 기반 보안 툴킷입니다 — 초기 자산 발견, 변경 사항의 diff 기반 모니터링, 표적형 취약점 스캔(IDOR, SSRF …), 격리된 실습 환경을 위한 Playwright 기반 실습 워크플로우까지 포함합니다. Go 스크립트는 표준 라이브러리에만 의존하며, 별도의 Node.js 스크립트 두 개가 Playwright로 브라우저 기반 실습을 처리합니다. 모든 진입점은 단일 `Makefile`로 노출되고, 모든 결과물은 타임스탬프가 붙은 gitignore 디렉터리에 기록되며, 명시적인 전파 단계 없이는 어떤 데이터도 운영자 머신을 떠나지 않습니다.

### Intended Audience / 대상 사용자

| Role | Why they use this toolkit | 활용 목적 |
|------|--------------------------|-----------|
| Bug bounty hunters | Structured engagements across recon → monitor → hunt → report | 구조화된 업무 진행 (정찰→모니터→헌팅→리포트) |
| Application security engineers | Continuous asset-change tracking and diff-based alerting | 자산 변화 추적 및 diff 기반 알림 |
| CTF / lab participants | Safe, scoped practice with browser-driven exercises | 격리된 환경에서 익스플로잇 연습 |

---

## Features / 기능

| Area | Capability | 비고 |
|------|------------|------|
| Setup | Tool verification + SecLists wordlist download | `scripts/setup.go` |
| Recon | 5-phase pipeline (subdomain enum → HTTP probe → URL harvest → nuclei scan → aggregation) | `scripts/recon.go` |
| Recon-fast | Quick recon — same pipeline minus nuclei | `scripts/recon.go -skip-nuclei` |
| Monitor | Diff monitoring + crt.sh + Discord alerts | `scripts/monitor.go` |
| Hunt | 4-phase targeted vulnerability hunting (IDOR, SSRF, …) | `scripts/hunt.go` |
| Lab runner | Playwright-driven browser exercise runner | `scripts/lab-runner.mjs` |
| Lab solver | Playwright-driven exercise automation/solver | `scripts/lab-solver.mjs` |
| Reporting | Markdown templates and checklists under `notes/` | `notes/report-template.md` |
| Orchestration | Single `Makefile` with self-documenting targets | `make help` |

### Highlights / 핵심 포인트

- **Zero Go dependencies** — every script is a standalone file run via `go run scripts/x.go`; no `go.mod`, no external modules.
- **Stdlib-only Go** — subprocess invocation, JSON, HTTP, and file IO all use the Go standard library.
- **Playwright lab layer** — Node.js scripts under `scripts/` (powered by `playwright@^1.61.0`) provide browser automation for practice labs.
- **Reproducible artifacts** — every run writes into a timestamped directory under `recon/`, `targets/`, or `reports/`.
- **Single surface** — every operator action goes through `make <target>`; there are no hidden scripts.

---

## Architecture / 아키텍처

The toolkit is a thin orchestration layer. Go programs never re-implement scanning primitives; they call existing CLI tools, marshal their output, and persist results. Node.js scripts operate orthogonally for browser-based lab work.

Go 프로그램은 스캐닝 primitives를 다시 구현하지 않고, 기존 CLI 도구를 호출해 출력을 가공·저장하는 얇은 오케스트레이션 계층입니다. Node.js 스크립트는 브라우저 기반 실습을 위해 직교적으로 동작합니다.

### Request Flow — Recon Pipeline / 정찰 파이프라인 흐름

1. **Operator** runs `make recon TARGET=example.com`.
2. **`scripts/recon.go`** resolves the target flag and prepares a timestamped output directory under `recon/<target>/<timestamp>/`.
3. **Subdomain enumeration** — `subfinder` is invoked via `os/exec`; output is captured to `subs.txt`.
4. **HTTP probing** — `httpx` resolves live hosts from the subdomain list and writes `alive.txt`.
5. **URL harvesting** — `waybackurls` collects historical URLs from each live host into `urls.txt`.
6. **Vulnerability scanning** — `nuclei` runs against `alive.txt`; findings are normalized into `findings.txt`.
7. **Aggregation** — `scripts/recon.go` merges the per-phase outputs into a single `summary.json` for downstream consumption.

### Request Flow — Hunt Pipeline / 헌팅 파이프라인 흐름

1. **Operator** runs `make hunt TARGET=example.com` (optionally `-type idor` or `-type ssrf`).
2. **`scripts/hunt.go`** validates the target and selects the categories defined in its `huntTypes` slice.
3. **Endpoint discovery** — recon outputs (or fresh `httpx` results) are loaded as the input surface.
4. **Targeted probes** — per-category payloads are sent through curl/HTTP clients; responses are diffed against expected baselines.
5. **Finding capture** — positives are written to a timestamped report directory for manual triage and report drafting.

### Request Flow — Monitor / 모니터링 흐름

1. **Operator** runs `make monitor TARGET=example.com`.
2. **`scripts/monitor.go`** loads the prior baseline from `targets/<target>/baseline.txt`.
3. **Fresh enumeration** — `subfinder` and `crt.sh` queries produce a current asset snapshot.
4. **Diff** — the snapshot is diffed against the baseline; new subdomains or endpoints are isolated.
5. **Alerting** — new assets are written to a `new-assets.txt` and optionally forwarded to Discord via the notification settings in `config/targets.json`.

### Module Map / 모듈 맵

| Layer | Files | Responsibility |
|-------|-------|----------------|
| Orchestration | `Makefile` | Single command surface (`make help`) |
| Configuration | `config/targets.json` | Target list and notification endpoints |
| Recon pipeline | `scripts/recon.go` | 5-phase asset discovery |
| Change monitor | `scripts/monitor.go` | Diff against saved baselines |
| Hunt engine | `scripts/hunt.go` | 4-phase targeted vuln categories |
| Bootstrap | `scripts/setup.go` | Tool checks + SecLists download |
| Lab automation | `scripts/lab-runner.mjs`, `scripts/lab-solver.mjs` | Playwright-driven browser workflows |
| Knowledge | `notes/*.md` | Checklists, report templates, study notes |

---

## Repository Layout / 저장소 구조

```
/
├── AGENTS.md                 # Knowledge base for automated contributors (do not delete)
├── CONTRIBUTING.md           # Contribution guidelines
├── LICENSE                   # Project license
├── Makefile                  # Operator-facing command surface
├── README.md                 # This file
├── package.json              # Playwright dependency declaration
├── package-lock.json         # Locked dependency tree
├── config/
│   └── targets.json          # Target + notification configuration
├── scripts/
│   ├── hunt.go               # 4-phase targeted vuln hunting
│   ├── lab-runner.mjs        # Playwright lab exercise runner
│   ├── lab-solver.mjs        # Playwright lab automation/solver
│   ├── monitor.go            # Diff-based change monitor
│   ├── recon.go              # 5-phase recon pipeline
│   └── setup.go              # Tool verification + wordlist download
└── notes/
    ├── phase2-checklist.md   # Learning checklist
    ├── report-template.md    # Bug report template
    └── vulnerability-study.md# Study notes
```

### Output Directories (gitignored) / 출력 디렉터리

These directories are created at runtime and are excluded from version control:

| Path | Purpose |
|------|---------|
| `recon/` | Timestamped recon + hunt artifacts |
| `targets/` | Per-target baselines used by `monitor` |
| `reports/` | Drafted and submitted bug reports |
| `wordlists/` | Downloaded SecLists archives |

---

## Prerequisites / 사전 요구 사항

| Requirement | Version | Notes |
|-------------|---------|-------|
| Go | 1.20+ | Used only to `go run scripts/*.go`; no module setup |
| Node.js | 18+ | Required for the `lab-*.mjs` scripts |
| `subfinder` | latest | Subdomain enumeration |
| `httpx` | latest | HTTP probing |
| `nuclei` | latest + templates | Vulnerability scanning (default rate limit: 100 req/s) |
| `waybackurls` | latest | Historical URL harvesting |
| `curl` | any modern | Used by hunt probes |

The repository deliberately relies on operator-managed tools. `make setup` verifies presence and downloads SecLists into `wordlists/`.

---

## Quick Start / 빠른 시작

```bash
# 1. Clone and enter the repository
git clone <your-fork-or-clone-url> bug
cd bug

# 2. Install the JavaScript-side dependencies (Playwright)
npm install

# 3. Verify external tools and download wordlists
make setup

# 4. Configure targets
$EDITOR config/targets.json

# 5. Run the full recon pipeline
make recon TARGET=example.com

# 6. Hunt for vulnerabilities
make hunt TARGET=example.com

# 7. Or do everything in one go
make full-scan TARGET=example.com
```

Results land in timestamped directories under `recon/<target>/`. Inspect `summary.json` for the merged view, then drill into the per-phase files for raw evidence.

---

## Configuration / 설정

### `config/targets.json`

This file is the single source of truth for targets and notification routing. It is consumed by `scripts/monitor.go` for diff alerting and by `scripts/hunt.go` for default scope. Edit it manually; scripts never hardcode domains.

Typical contents (shape only — actual keys may vary):

```json
{
  "targets": [
    {
      "name": "example-program",
      "domain": "example.com",
      "wildcard": true,
      "out_of_scope": ["blog.example.com"]
    }
  ],
  "notifications": {
    "discord_webhook_url": "https://discord.com/api/webhooks/<redacted>",
    "min_severity": "medium"
  }
}
```

| Field | Purpose |
|-------|---------|
| `targets[].domain` | Primary domain scope |
| `targets[].wildcard` | Whether `*.domain` is in scope |
| `targets[].out_of_scope` | Hosts explicitly excluded |
| `notifications.discord_webhook_url` | Alert endpoint for `monitor` |
| `notifications.min_severity` | Floor for alert dispatch |

Treat `config/targets.json` as sensitive: it identifies your authorized scope. Do not commit secrets beyond a placeholder URL.

---

## Commands Reference / 명령어 레퍼런스

All commands run from the repository root. `TARGET` is mandatory for every scan command and is validated by the Makefile before any script executes.

### Top-level Targets

| Command | Description | 비고 |
|---------|-------------|------|
| `make help` | Print the full command matrix | Self-documenting via `##` comments |
| `make setup` | Verify external tools; download SecLists | One-shot bootstrap |
| `make recon TARGET=<domain>` | Run the full 5-phase recon pipeline | 타겟 필수 |
| `make recon-fast TARGET=<domain>` | Recon without the nuclei phase | `-skip-nuclei` flag |
| `make monitor TARGET=<domain>` | Diff current state against saved baseline | crt.sh + Discord |
| `make hunt TARGET=<domain>` | Run all vulnerability categories | `huntTypes` slice |
| `make hunt-idor TARGET=<domain>` | IDOR-only hunt | `-type idor` |
| `make hunt-ssrf TARGET=<domain>` | SSRF-only hunt | `-type ssrf` |
| `make full-scan TARGET=<domain>` | Combined recon + hunt | 단일 호출 |
| `make clean` | Remove generated scan artifacts | gitignored outputs |

### Examples / 예시

```bash
# Full discovery on a single target
make recon TARGET=acme-corp.example

# Fast iteration during scoping
make recon-fast TARGET=acme-corp.example

# Detect new assets since the last baseline
make monitor TARGET=acme-corp.example

# Triage a specific vulnerability class
make hunt-idor TARGET=acme-corp.example

# End-to-end pipeline
make full-scan TARGET=acme-corp.example
```

---

## Scripts Reference / 스크립트 레퍼런스

### Go Scripts (stdlib only)

| Script | Phases | Key flags |
|--------|--------|-----------|
| `scripts/setup.go` | Tool check → wordlist download | — |
| `scripts/recon.go` | Subdomain enum → HTTP probe → URL harvest → nuclei → aggregate | `-d <domain>`, `-skip-nuclei` |
| `scripts/monitor.go` | Baseline load → fresh enum → diff → Discord alert | `-d <domain>` |
| `scripts/hunt.go` | Endpoint discovery → probe → diff → capture | `-d <domain>`, `-type <idor\|ssrf\|...>` |

All Go scripts:

- Depend only on the standard library.
- Are invoked via `go run scripts/<name>.go` (no `go.mod` exists by design).
- Treat missing external tools as a hard failure with a clear message.

### Node.js Scripts (Playwright)

| Script | Purpose |
|--------|---------|
| `scripts/lab-runner.mjs` | Launches Playwright and runs through a configured lab exercise |
| `scripts/lab-solver.mjs` | Automates problem-solving actions inside the lab environment |

These scripts are independent of the Go pipeline and exist for browser-driven practice. They consume the `playwright` dependency declared in `package.json`.

---

## Local Development / 로컬 개발

### Editing a Go Script

1. Modify `scripts/<name>.go` directly.
2. Validate locally:

   ```bash
   go run scripts/recon.go -d staging.example -skip-nuclei
   ```

3. Confirm the artifact layout under `recon/staging.example/<timestamp>/` matches expectations.
4. Do not introduce third-party Go modules — stdlib-only is a deliberate constraint.

### Editing a Node.js Script

1. Modify `scripts/<name>.mjs`.
2. Ensure `node_modules` is present:

   ```bash
   npm install
   ```

3. Run the script directly:

   ```bash
   node scripts/lab-runner.mjs
   ```

4. Keep browser interaction scoped to lab environments only.

### Adding a New Hunt Category

1. Open `scripts/hunt.go`.
2. Add the category identifier to the `huntTypes` slice.
3. Wire up its probe logic in the 4-phase handler.
4. Optionally expose a `make hunt-<name>` shortcut in the `Makefile`.
5. Update this README's commands table.

### Adding a New Target

1. Edit `config/targets.json` — never hardcode domains in scripts.
2. Run `make setup` if the target requires new wordlists.
3. Run `make recon TARGET=<domain>` to generate the initial baseline.
4. The first monitor run will treat the baseline as the ground truth.

---

## Testing / 테스트

The repository does not ship a unit-test suite. `package.json` defines a placeholder `test` script (`"Error: no test specified" && exit 1`) intentionally — Go scripts are validated by running them against authorized lab targets.

Practical validation steps:

| Layer | How to verify |
|-------|---------------|
| Go scripts | `go run scripts/setup.go` checks all tool prerequisites |
| Recon pipeline | `make recon-fast TARGET=<authorized-lab>` and inspect `summary.json` |
| Hunt engine | `make hunt-idor TARGET=<authorized-lab>` and triage findings manually |
| Monitor | Run twice against an authorized target and confirm the second run reports no diff (or only intentional diffs) |
| Node scripts | `node scripts/lab-runner.mjs` against an isolated lab fixture |

Always validate against an authorized, isolated environment.

---

## Reporting Workflow / 리포트 워크플로우

1. Draft findings using `notes/report-template.md`.
2. Track engagement progress against `notes/phase2-checklist.md`.
3. Reference `notes/vulnerability-study.md` for write-up patterns and remediation guidance.
4. Move finalized reports from the drafts directory into `reports/<target>/<finding>/`.

---

## Contribution Guide / 기여 가이드

Please read `CONTRIBUTING.md` before opening an issue or pull request. At a glance:

| Do | Don't |
|----|-------|
| Keep Go scripts stdlib-only | Add external Go modules |
| Add new hunt categories to the `huntTypes` slice in `scripts/hunt.go` | Hardcode target domains anywhere |
| Update `config/targets.json` when adding scope | Commit `recon/`, `targets/`, `reports/`, or `wordlists/` artifacts |
| Document new `make` targets in both the Makefile's `##` comment and this README | Run scans against targets without explicit authorization |
| Validate against authorized lab targets before submitting | Exceed the default 100 req/s rate limit |

---

## Security, Legal, and Ethics / 보안·법적·윤리적 고려사항

This toolkit exists to support **responsible security research** within programs that explicitly authorize testing.

- Only run scans against targets listed in `config/targets.json` with documented authorization.
- Respect the `out_of_scope` list — scripts will not filter it for you.
- Do not exceed the configured rate limits (default: 100 req/s for nuclei).
- Treat all artifacts under `recon/`, `targets/`, `reports/`, and `wordlists/` as sensitive.
- Never publish raw scan data without redaction.

Unauthorized use of this toolkit against systems you do not own or are not authorized to test may violate computer-misuse laws in your jurisdiction.

이 툴킷은 명시적으로 테스트를 허가한 프로그램 안에서의 **책임 있는 보안 연구**를 지원하기 위한 것입니다. 허가 받지 않은 대상에 사용할 경우 관련 법령을 위반할 수 있습니다.

---

## License / 라이선스

Released under the terms described in `LICENSE`. By using this toolkit you agree to operate only against systems for which you have documented authorization.
```

The README is complete and grounded in the actual repository contents: it documents the Go orchestration layer (`scripts/*.go`), the Playwright lab layer (`scripts/lab-*.mjs`), the single `Makefile` surface, the `config/targets.json` configuration file, the `notes/` knowledge base, and the gitignored output directories. It avoids fabricated GitHub URLs, hardcoded IPs, ASCII diagrams, and any jclee-bot automation boilerplate, while preserving the bilingual voice of the original README.