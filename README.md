# Bug Bounty Automation Toolkit / 버그 바운티 자동화 툴킷

> Reconnaissance, monitoring, and targeted vulnerability hunting for responsible security research and bug bounty programs.
>
> 책임 있는 보안 연구 및 버그 바운티 프로그램을 위한 정찰, 모니터링, 표적형 취약점 헌팅 도구 모음입니다.

---

## Overview / 개요

A Go-orchestrated security toolkit that wraps external CLI tooling to cover the full bug-bounty lifecycle: initial asset discovery, diff-based change monitoring, targeted vulnerability scanning (IDOR, SSRF, …), and Playwright-driven lab exercises against scoped, isolated environments. The Go scripts depend only on the standard library and execute third-party tools (`subfinder`, `httpx`, `nuclei`, `waybackurls`, …) through `os/exec`, while a parallel pair of Node.js scripts handles browser-based lab workflows under Playwright. All entry points are exposed through a single `Makefile`, all artifacts are written to timestamped gitignored directories, and nothing leaves the operator's machine without an explicit forward step.

`os/exec`로 외부 CLI 도구(`subfinder`, `httpx`, `nuclei`, `waybackurls` 등)를 래핑하여 버그 바운티 전 과정을 다루는 Go 기반 보안 툴킷입니다 — 초기 자산 발견, 변경 사항의 diff 기반 모니터링, 표적형 취약점 스캔(IDOR, SSRF …), 격리된 실습 환경을 위한 Playwright 기반 실습 워크플로우까지 포함합니다. Go 스크립트는 표준 라이브러리에만 의존하며, 별도의 Node.js 스크립트 두 개가 Playwright로 브라우저 기반 실습을 처리합니다. 모든 진입점은 단일 `Makefile`로 노출되고, 모든 결과물은 타임스탬프가 붙은 gitignore 디렉터리에 기록되며, 명시적인 전파 단계 없이는 어떤 데이터도 운영자 머신을 떠나지 않습니다.

### Intended Audience / 대상 사용자

- **Bug bounty hunters** running structured engagements / 구조화된 업무를 진행하는 버그 바운티 헌터
- **Application security engineers** tracking asset changes over time / 자산 변화를 지속적으로 추적하는 애플리케이션 보안 엔지니어
- **CTF / lab participants** practicing exploitation in safe environments / 안전한 환경에서 익스플로잇을 연습하는 CTF · 실습 참여자

### Responsible Use / 책임 있는 사용

Run this toolkit only against systems you are explicitly authorized to test — your own assets, scoped bug bounty programs, or dedicated lab platforms such as PortSwigger Web Security Academy, HackTheBox, or TryHackMe. Unauthorized scanning may violate computer-misuse laws in your jurisdiction. Scripts default to conservative rate limits (`nuclei` capped at 100 req/s) and write results locally so no data is exfiltrated without an explicit forward step.

본 툴킷은 명시적으로 테스트 권한을 부여받은 시스템(자체 자산, 스코프가 정의된 버그 바운티 프로그램, PortSwigger Web Security Academy, HackTheBox, TryHackMe 같은 전용 실습 플랫폼)에서만 실행해야 합니다. 허가되지 않은 스캔은 관할 지역의 컴퓨터 오용 법률을 위반할 수 있습니다. 스크립트는 기본적으로 보수적인 속도 제한(`nuclei` 100 req/s 캡)을 사용하며, 명시적인 전파 단계 없이는 결과물이 로컬에 머무르도록 설계되어 있습니다.

---

## Features / 주요 기능

- **Multi-phase reconnaissance pipeline** — subdomain enumeration, HTTP probing, historical URL collection, template-based scanning / 서브도메인 열거, HTTP 프로빙, 과거 URL 수집, 템플릿 기반 스캔을 수행하는 다단계 정찰 파이프라인
- **Continuous diff-based monitoring** — detects new subdomains and endpoints via crt.sh and per-target baselines / crt.sh 와 타겟별 베이스라인을 통해 새로운 서브도메인과 엔드포인트를 감지하는 지속적 diff 기반 모니터링
- **Targeted vulnerability hunting** — focused modules for high-impact bug classes such as IDOR and SSRF / IDOR · SSRF 등 영향력이 큰 버그 클래스에 특화된 모듈
- **Browser-driven lab solver** — Playwright-based Node.js runner for walkthroughs and lab exercises / 워크스루와 실습을 위한 Playwright 기반 Node.js 러너
- **Single entry point** — every workflow routed through one `Makefile` for consistency across machines and CI runners / 모든 워크플로우가 단일 `Makefile`을 통해 라우팅되어 머신과 CI 러너 간 일관성 보장
- **Stdlib-only Go scripts** — no module management overhead, run with `go run` / 모듈 관리 오버헤드 없는 표준 라이브러리만 사용하는 Go 스크립트
- **Timestamped, gitignored output** — every run produces a unique output directory; the working tree stays clean / 모든 실행이 고유한 출력 디렉터리를 생성하며 작업 트리는 깨끗하게 유지됩니다

---

## Architecture / 아키텍처

### Repository layout / 저장소 레이아웃

```
.
├── AGENTS.md                # Operator knowledge base (project-internal docs)
├── CONTRIBUTING.md          # Contribution guidelines
├── LICENSE                  # ISC license
├── Makefile                 # Single entry point for every workflow
├── README.md                # This document
├── package-lock.json        # Pinned Node.js dependency lockfile
├── package.json             # Playwright dependency manifest
├── config/
│   └── targets.json         # Per-target configuration and notification routing
├── notes/
│   ├── phase2-checklist.md  # Learning checklist (operator notes)
│   ├── report-template.md   # Bug report template
│   └── vulnerability-study.md # Vulnerability study notes
└── scripts/
    ├── setup.go             # Tool verification + wordlist bootstrap
    ├── recon.go             # Multi-phase recon pipeline
    ├── monitor.go           # Diff monitoring + crt.sh + Discord alerts
    ├── hunt.go              # Targeted vulnerability hunting
    ├── lab-runner.mjs       # Playwright-based lab runner (Node.js)
    ├── lab-solver.mjs       # Playwright-based lab solver (Node.js)
    └── recon.go             # Multi-phase recon pipeline
```

> Runtime artifacts (`recon/`, `targets/`, `reports/`, `wordlists/`) are created on first execution and are excluded by `.gitignore`. They never appear in the working tree unless a script has been run locally.
>
> 실행 시점 산출물(`recon/`, `targets/`, `reports/`, `wordlists/`)은 최초 실행 시 생성되며 `.gitignore`로 제외됩니다. 스크립트를 로컬에서 실행하지 않는 한 작업 트리에 나타나지 않습니다.

### Components / 구성 요소

| Component | Language | Purpose | Entry point |
|-----------|----------|---------|-------------|
| `scripts/setup.go` | Go (stdlib) | Verify CLI tooling, fetch SecLists wordlists | `make setup` |
| `scripts/recon.go` | Go (stdlib) | 5-phase recon: subfinder → httpx → waybackurls → nuclei → summary | `make recon` |
| `scripts/monitor.go` | Go (stdlib) | Diff new subdomains/endpoints, push alerts via Discord webhook | `make monitor` |
| `scripts/hunt.go` | Go (stdlib) | 4-phase targeted vuln hunts (IDOR, SSRF, …) | `make hunt` |
| `scripts/lab-runner.mjs` | Node.js (Playwright) | Drive browser sessions for lab exercises | invoked via Node |
| `scripts/lab-solver.mjs` | Node.js (Playwright) | Solve lab challenges end-to-end via Playwright | invoked via Node |
| `config/targets.json` | JSON | Target registry, rate-limit overrides, notification routing | read by Go scripts |
| `Makefile` | Make | Single command surface, dependency-ordered targets | `make help` |
| `package.json` | npm | Declares Playwright runtime for the two lab scripts | `npm install` |

### Execution flow / 실행 흐름

1. **Operator invocation** — run `make <command> TARGET=<domain>` (or invoke a script directly with `go run` / `node`).
   **운영자 호출** — `make <command> TARGET=<domain>`을 실행합니다 (또는 `go run` / `node`로 스크립트를 직접 호출).
2. **Target resolution** — the Go script reads `config/targets.json` for any per-target overrides (rate limits, webhook URL, scope flags).
   **타겟 해석** — Go 스크립트가 `config/targets.json`을 읽어 타겟별 오버라이드(속도 제한, 웹훅 URL, 스코프 플래그)를 가져옵니다.
3. **CLI orchestration** — the Go script calls each external tool sequentially via `os/exec`, streaming output line-by-line to stdout.
   **CLI 오케스트레이션** — Go 스크립트가 외부 도구를 `os/exec`로 순차 호출하여 줄 단위 stdout 스트리밍을 수행합니다.
4. **Diff stage (monitor only)** — `monitor.go` compares fresh output against the persisted baseline under `targets/<domain>/` and reports deltas.
   **Diff 단계 (monitor 전용)** — `monitor.go`가 `targets/<domain>/` 아래의 영속 베이스라인과 새로 수집된 결과를 비교하여 델타를 보고합니다.
5. **Optional alerting** — when a webhook URL is configured for the target, `monitor.go` posts a Discord notification summarizing new findings.
   **선택적 알림** — 타겟에 웹훅 URL이 설정되어 있으면 `monitor.go`가 새로운 발견 사항을 요약한 Discord 알림을 게시합니다.
6. **Artifact write** — all stage outputs land in a single timestamped directory under `recon/<domain>-<timestamp>/` so multiple runs never collide.
   **산출물 기록** — 모든 단계 출력이 `recon/<domain>-<timestamp>/` 아래 단일 타임스탬프 디렉터리에 기록되어 여러 실행이 충돌하지 않습니다.
7. **Lab path (Node.js)** — for browser-driven workflows, the operator launches `node scripts/lab-runner.mjs` (or `lab-solver.mjs`) directly; Playwright manages the headless browser session locally.
   **실습 경로 (Node.js)** — 브라우저 기반 워크플로우의 경우 운영자가 `node scripts/lab-runner.mjs` (또는 `lab-solver.mjs`)를 직접 실행하며, Playwright가 로컬 헤드리스 브라우저 세션을 관리합니다.

---

## Quick Start / 빠른 시작

### Prerequisites / 사전 요구 사항

| Tool | Minimum | Used by |
|------|---------|---------|
| Go | 1.21+ | All `scripts/*.go` via `go run` |
| Node.js | 18+ (LTS) | `scripts/lab-*.mjs` via `node` |
| External CLI tools | varies | Each Go script verifies presence at startup (subfinder, httpx, nuclei, waybackurls, …) |
| `make` | any POSIX-compatible | Entry-point dispatcher |

### First-time setup / 최초 설정

```bash
# 1. Clone and enter the repository
git clone <repository-url> bug
cd bug

# 2. Install Node.js dependency (Playwright) and its browsers
npm install
npx playwright install --with-deps chromium

# 3. Verify all CLI tools are present and download seed wordlists
make setup
```

`make setup` runs `scripts/setup.go` which checks every required CLI binary, prints remediation hints if anything is missing, and bootstraps the `wordlists/` directory with curated SecLists releases.

`make setup`은 `scripts/setup.go`를 실행하여 필요한 모든 CLI 바이너리를 확인하고, 누락된 항목에 대한 해결 힌트를 출력하며, 선정된 SecLists 릴리스로 `wordlists/` 디렉터리를 부트스트랩합니다.

### First scan / 첫 스캔

```bash
# Full reconnaissance against a single target
make recon TARGET=example.com

# Continuous monitoring (diff vs. last baseline)
make monitor TARGET=example.com

# Targeted vulnerability hunting (all categories)
make hunt TARGET=example.com
```

---

## Configuration / 설정

All configuration lives in `config/targets.json` so the Go scripts can adjust per-target behavior without code edits. A minimal, illustrative shape:

`config/targets.json`에 모든 설정이 모여 있어 코드 수정 없이 타겟별 동작을 조정할 수 있습니다. 간략한 구조는 다음과 같습니다.

```json
{
  "targets": {
    "example.com": {
      "scope": ["example.com", "*.example.com"],
      "rate_limit_rps": 100,
      "notify_webhook_env": "DISCORD_WEBHOOK_EXAMPLE",
      "notes": "Authorized through HackerOne program #12345"
    }
  }
}
```

| Field | Purpose |
|-------|---------|
| `scope` | Array of in-scope domains passed to scanners so out-of-scope assets are filtered out / 스코프 내 자산만 남도록 스캐너에 전달되는 스코프 내 도메인 배열 |
| `rate_limit_rps` | Per-target override for the `nuclei` rate cap (default 100) / `nuclei` 속도 캡에 대한 타겟별 오버라이드 (기본값 100) |
| `notify_webhook_env` | Name of the environment variable holding the Discord webhook URL (value is never written to disk) / Discord 웹훅 URL을 담고 있는 환경 변수의 이름 (값은 디스크에 기록되지 않음) |
| `notes` | Free-form field for authorization reference numbers or program scope reminders / 권한 부여 번호나 프로그램 스코프 메모를 위한 자유 형식 필드 |

Secrets such as webhook URLs must be supplied through the environment; the scripts read them at runtime and never persist them.

웹훅 URL 같은 비밀 값은 환경 변수를 통해 제공되어야 하며, 스크립트는 실행 시점에 읽어들이고 절대 영속화하지 않습니다.

---

## Commands Reference / 명령어 레퍼런스

### `make` targets / `make` 타겟

| Command | Description |
|---------|-------------|
| `make help` | Print the command catalog / 명령어 카탈로그 출력 |
| `make setup` | Verify external tools, download seed wordlists / 외부 도구 확인 및 시드 워드리스트 다운로드 |
| `make recon TARGET=<domain>` | Run the full 5-phase reconnaissance pipeline / 5단계 정찰 파이프라인 전체 실행 |
| `make recon-fast TARGET=<domain>` | Skip the `nuclei` stage for quick asset discovery / 빠른 자산 발견을 위해 `nuclei` 단계 생략 |
| `make monitor TARGET=<domain>` | Diff new findings and push Discord alerts / 새로운 발견 사항을 diff하고 Discord 알림 게시 |
| `make hunt TARGET=<domain>` | Run all targeted vulnerability categories / 모든 표적형 취약점 카테고리 실행 |
| `make hunt-idor TARGET=<domain>` | Run only the IDOR module / IDOR 모듈만 실행 |
| `make hunt-ssrf TARGET=<domain>` | Run only the SSRF module / SSRF 모듈만 실행 |
| `make full-scan TARGET=<domain>` | Reconnaissance + hunting combined (see Makefile for the full definition) / 정찰 + 헌팅 결합 (Makefile의 전체 정의 참조) |

### Direct script invocation / 스크립트 직접 호출

When you need a flag the `Makefile` does not expose, invoke the scripts directly:

`Makefile`이 노출하지 않는 플래그가 필요할 때는 스크립트를 직접 호출하세요.

```bash
# Go scripts (stdlib only — no go.mod required)
go run scripts/recon.go -d example.com
go run scripts/recon.go -d example.com -skip-nuclei
go run scripts/monitor.go -d example.com
go run scripts/hunt.go -d example.com
go run scripts/hunt.go -d example.com -type idor

# Node.js lab scripts
node scripts/lab-runner.mjs
node scripts/lab-solver.mjs
```

---

## Local Development / 로컬 개발

### Working with Go scripts / Go 스크립트 작업

- The repository deliberately omits a `go.mod`; each script imports only the standard library. Run with `go run scripts/<file>.go` to match the `Makefile` behavior exactly.
  저장소는 의도적으로 `go.mod`를 생략하며, 각 스크립트는 표준 라이브러리만 임포트합니다. `Makefile` 동작과 정확히 일치시키려면 `go run scripts/<file>.go`로 실행하세요.
- External tools are invoked through `os/exec`. To add a new dependency, extend the verification table in `scripts/setup.go` first so `make setup` keeps the operator experience honest.
  외부 도구는 `os/exec`로 호출됩니다. 새 의존성을 추가하려면 먼저 `scripts/setup.go`의 검증 표를 확장하여 `make setup`이 운영자 경험을 그대로 유지하도록 하세요.
- Target domains must never be hardcoded — they always flow from the `TARGET` make variable or `-d` CLI flag.
  타겟 도메인은 코드에 하드코딩되어서는 안 되며, 항상 `TARGET` make 변수 또는 `-d` CLI 플래그에서流入합니다.

### Adding a hunt category / 헌팅 카테고리 추가

1. Append the new identifier to the `huntTypes` slice in `scripts/hunt.go`.
   `scripts/hunt.go`의 `huntTypes` 슬라이스에 새 식별자를 추가하세요.
2. Implement the corresponding dispatch branch and per-category runner in the same file.
   동일 파일에 해당 디스패치 분기와 카테고리별 러너를 구현하세요.
3. Add a granular `make hunt-<name>` target in the `Makefile` matching the existing convention.
   기존 컨벤션에 맞춰 `Makefile`에 세분화된 `make hunt-<name>` 타겟을 추가하세요.
4. Update `notes/vulnerability-study.md` so the rationale and references live next to the code change.
   코드 변경 옆에 근거와 참고 자료가 함께 있도록 `notes/vulnerability-study.md`를 업데이트하세요.

### Output structure / 출력 구조

Each invocation creates a timestamped directory so runs never overwrite one another:

각 호출은 타임스탬프 디렉터리를 생성하여 실행 간 덮어쓰기가 발생하지 않습니다.

```
recon/
└── example.com-20250115T0930Z/
    ├── 01-subfinder.txt
    ├── 02-httpx.txt
    ├── 03-waybackurls.txt
    ├── 04-nuclei.txt
    └── summary.json
```

Baselines for diff-based monitoring live under `targets/<domain>/`; submitted reports (when drafting locally before upload) live under `reports/<program>/`.

Diff 기반 모니터링의 베이스라인은 `targets/<domain>/` 아래에 있고, 로컬에서 작성 후 업로드할 보고서는 `reports/<program>/` 아래에 보관됩니다.

---

## Testing / 테스트

This project intentionally ships without a formal test runner: the `npm test` script is a placeholder, and the Go scripts are intentionally stdlib-only and have no automated coverage. Validation happens through **manual, scope-bounded smoke runs** plus **dry inspections** of the generated artifacts.

이 프로젝트는 의도적으로 정식 테스트 러너 없이 출하됩니다. `npm test` 스크립트는 자리표시자이며, Go 스크립트는 의도적으로 표준 라이브러리만 사용하며 자동화된 커버리지를 가지지 않습니다. 검증은 **수동, 스코프 제한 스모크 실행**과 생성된 산출물의 **건조 검사**를 통해 이루어집니다.

### Recommended validation steps / 권장 검증 단계

| Check | How |
|-------|-----|
| CLI toolchain health / CLI 툴체인 상태 | `make setup` — every required binary must report OK / 필요한 모든 바이너리가 OK를 보고해야 함 |
| Recon pipeline / 정찰 파이프라인 | Run `make recon-fast TARGET=<authorized-lab-domain>` and confirm files appear under `recon/` / `make recon-fast TARGET=<권한부여된-실습-도메인>`을 실행하고 파일이 `recon/` 아래에 나타나는지 확인 |
| Monitor deltas / 모니터 델타 | Run `make monitor TARGET=<authorized-lab-domain>` twice on different days; the second run should report zero or expected new findings / 다른 날 `make monitor TARGET=<권한부여된-실습-도메인>`을 두 번 실행하고, 두 번째 실행은 0개 또는 예상 가능한 새 발견을 보고해야 함 |
| Hunt modules / 헌팅 모듈 | Run `make hunt-idor TARGET=<authorized-lab-domain>` against a known-vulnerable lab endpoint and confirm detection / 알려진 취약 실습 엔드포인트에 `make hunt-idor TARGET=<권한부여된-실습-도메인>`을 실행하고 탐지 여부 확인 |
| Node.js lab scripts / Node.js 실습 스크립트 | `node scripts/lab-runner.mjs` against an isolated lab instance; verify Playwright boots a headless browser / 격리된 실습 인스턴스에 대해 `node scripts/lab-runner.mjs`를 실행하고 Playwright가 헤드리스 브라우저를 부팅하는지 확인 |

---

## Contribution Guide / 기여 가이드

- **House style** — Go scripts follow the existing `os/exec`-wrapped, stdout-streaming pattern; avoid pulling in third-party Go modules.
  **하우스 스타일** — Go 스크립트는 기존 `os/exec` 래핑 · stdout 스트리밍 패턴을 따르며, 서드 파티 Go 모듈을 끌어들이지 마세요.
- **Bilingual docs** — when adding a new Makefile target or a new hunt category, update both the English and Korean sections of this file so the operator knowledge base stays symmetric.
  **이중 언어 문서** — 새 Makefile 타겟이나 새 헌팅 카테고리를 추가할 때 운영자 지식 베이스의 대칭을 유지하기 위해 이 파일의 영어와 한국어 섹션 모두 업데이트하세요.
- **Never commit secrets** — webhook URLs and authorization tokens belong in environment variables, not in `config/targets.json` or commit history.
  **비밀 절대 커밋 금지** — 웹훅 URL과 권한 부여 토큰은 환경 변수에 속하며, `config/targets.json`이나 커밋 이력에 들어가서는 안 됩니다.
- **Respect scope** — before testing any new target, confirm written authorization and reflect it in `config/targets.json`'s `notes` field.
  **스코프 존중** — 새 타겟을 테스트하기 전에 서면 권한을 확인하고 `config/targets.json`의 `notes` 필드에 반영하세요.
- **Process** — see `CONTRIBUTING.md` for the full submission checklist (PR template, required checks, and review expectations).
  **프로세스** — 전체 제출 체크리스트(PR 템플릿, 필수 검사, 리뷰 기대치)는 `CONTRIBUTING.md`를 참조하세요.

---

## License / 라이선스

Released under the **ISC License**. See `LICENSE` for the full text.
**ISC 라이선스** 하에 배포됩니다. 전문은 `LICENSE`를 참조하세요.