# Bug Bounty Automation Toolkit / 버그 바운티 자동화 툴킷

> Reconnaissance, change monitoring, and targeted vulnerability hunting for responsible security research and bug bounty programs.
>
> 책임 있는 보안 연구 및 버그 바운티 프로그램을 위한 정찰, 변경 모니터링, 표적형 취약점 헌팅 도구 모음입니다.

---

## Overview / 개요

A Go-orchestrated security toolkit that wraps external CLI tooling to cover the full bug-bounty lifecycle: initial asset discovery, diff-based change monitoring, targeted vulnerability scanning (IDOR, SSRF, …), and Playwright-driven lab exercises against scoped, isolated environments. The Go scripts depend only on the standard library and execute third-party tools (`subfinder`, `httpx`, `nuclei`, `waybackurls`, …) through `os/exec`, while a parallel pair of Node.js scripts handles browser-based lab workflows under Playwright. All entry points are exposed through a single `Makefile`, all artifacts are written to timestamped gitignored directories, and nothing leaves the operator's machine without an explicit forward step.

`os/exec`로 외부 CLI 도구(`subfinder`, `httpx`, `nuclei`, `waybackurls` 등)를 래핑하여 버그 바운티 전 과정을 다루는 Go 기반 보안 툴킷입니다 — 초기 자산 발견, 변경 사항의 diff 기반 모니터링, 표적형 취약점 스캔(IDOR, SSRF …), 격리된 실습 환경을 위한 Playwright 기반 실습 워크플로우까지 포함합니다. Go 스크립트는 표준 라이브러리에만 의존하며, 별도의 Node.js 스크립트 두 개가 Playwright로 브라우저 기반 실습을 처리합니다. 모든 진입점은 단일 `Makefile`로 노출되고, 모든 결과물은 타임스탬프가 붙은 gitignore 디렉터리에 기록되며, 명시적인 전파 단계 없이는 어떤 데이터도 운영자 머신을 떠나지 않습니다.

### Intended Audience / 대상 사용자

- **Bug bounty hunters** running structured engagements / 구조화된 업무를 진행하는 버그 바운티 헌터
- **Application security engineers** tracking asset changes over time / 자산 변화를 지속적으로 추적하는 애플리케이션 보안 엔지니어
- **CTF / lab participants** practicing exploitation in safe environments / 안전한 환경에서 익스플로잇을 연습하는 CTF · 실습 참여자

---

## Features / 기능

| Area | Capability | 비고 |
|------|------------|------|
| Setup | Tool verification + SecLists wordlist download | `scripts/setup.go` |
| Recon | 5-phase pipeline (subdomain enum → HTTP probe → URL harvest → nuclei scan → aggregation) | `scripts/recon.go` |
| Monitoring | Baseline diffing against crt.sh + Discord alerting on new subdomains/endpoints | `scripts/monitor.go` |
| Hunting | Targeted vulnerability scanning by category (IDOR, SSRF, …) | `scripts/hunt.go` |
| Labs | Browser automation for PortSwigger / HTB / THM-style exercises | `scripts/lab-runner.mjs`, `scripts/lab-solver.mjs` |
| Reporting | Markdown report template bundled with the toolkit | `notes/report-template.md` |
| Orchestration | Single `Makefile` exposes every entry point with `--help` discoverability | root `Makefile` |

### Design Principles / 설계 원칙

- **Stdlib-only Go** — scripts are standalone files run via `go run`, no `go.mod`, no external Go deps. / 표준 라이브러리만 사용하는 Go — 단독 파일로 `go run` 실행, `go.mod` 없음, 외부 Go 의존성 없음.
- **External tools via `os/exec`** — the toolkit orchestrates, it does not re-implement, security scanners. / `os/exec`를 통한 외부 도구 호출 — 툴킷은 오케스트레이션만 수행하며 보안 스캐너를 다시 구현하지 않습니다.
- **Local-first artifacts** — every scan is written to a timestamped, gitignored directory; nothing is uploaded automatically. / 로컬 우선 결과물 — 모든 스캔은 타임스탬프가 붙은 gitignore 디렉터리에 기록되며 자동 업로드되지 않습니다.
- **Explicit operator forwarding** — Discord/webhook delivery only fires when a target is configured. / 명시적인 운영자 전파 — Discord/webhook 알림은 대상이 설정된 경우에만 발송됩니다.

---

## Repository Layout / 저장소 구성

```
.
├── AGENTS.md                  # Knowledge base for contributors / 기여자용 지식 베이스
├── CONTRIBUTING.md            # Contribution guide / 기여 가이드
├── LICENSE                    # ISC license / ISC 라이선스
├── Makefile                   # Single entry point for every command / 모든 명령의 단일 진입점
├── README.md                  # This file / 본 문서
├── package.json               # Playwright dependency for lab scripts / 실습 스크립트의 Playwright 의존성
├── package-lock.json          # Locked Playwright tree / 고정된 Playwright 트리
├── config/
│   └── targets.json           # Target + notification configuration / 대상 + 알림 설정
├── notes/
│   ├── phase2-checklist.md    # Learning checklist / 학습 체크리스트
│   ├── report-template.md     # Bug report template / 버그 리포트 템플릿
│   └── vulnerability-study.md # Vulnerability study notes / 취약점 연구 노트
└── scripts/
    ├── setup.go               # Tool verification + wordlist download / 도구 검증 + 워드리스트 다운로드
    ├── recon.go               # 5-phase recon pipeline / 5단계 정찰 파이프라인
    ├── monitor.go             # Diff monitoring + crt.sh + Discord alerts / diff 모니터링 + crt.sh + Discord 알림
    ├── hunt.go                # 4-phase vulnerability hunting / 4단계 취약점 헌팅
    ├── lab-runner.mjs         # Playwright lab automation runner / Playwright 실습 자동화 러너
    └── lab-solver.mjs         # Playwright lab challenge solver / Playwright 실습 챌린지 솔버
```

The following runtime directories are created on demand and excluded from version control: / 다음 런타임 디렉터리는 필요 시 생성되며 버전 관리에서 제외됩니다:

| Directory | Purpose | 목적 |
|-----------|---------|------|
| `recon/` | Timestamped scan results | 타임스탬프가 붙은 스캔 결과 |
| `targets/` | Per-target baselines for diffing | diff를 위한 대상별 베이스라인 |
| `reports/` | Submitted bug report drafts | 제출한 버그 리포트 초안 |
| `wordlists/` | Downloaded SecLists archives | 다운로드한 SecLists 아카이브 |

---

## Architecture / 아키텍처

The toolkit is a thin orchestrator on top of proven open-source scanners. Each Go script owns one phase of the workflow; Node.js scripts cover the browser side. / 본 툴킷은 검증된 오픈소스 스캐너 위의 얇은 오케스트레이터입니다. 각 Go 스크립트는 워크플로우의 한 단계를 담당하며, Node.js 스크립트는 브라우저 측을 다룹니다.

### Request flow / 요청 흐름

1. Operator runs a `make` target with `TARGET=example.com` (and optional flags). / 운영자가 `TARGET=example.com`과 선택적 플래그로 `make` 타겟을 실행합니다.
2. `Makefile` invokes the corresponding Go script via `go run scripts/<phase>.go`. / `Makefile`이 `go run scripts/<phase>.go`로 해당 Go 스크립트를 호출합니다.
3. The Go script validates the target, then shells out to external tools (`subfinder`, `httpx`, `nuclei`, …) using `os/exec`. / Go 스크립트가 대상을 검증한 뒤 `os/exec`로 외부 도구(`subfinder`, `httpx`, `nuclei` …)를 호출합니다.
4. Tool output is normalized and written to a timestamped subdirectory under `recon/` (or `targets/` for baselines). / 도구 출력이 정규화되어 `recon/`(또는 베이스라인은 `targets/`) 아래 타임스탬프 하위 디렉터리에 기록됩니다.
5. On monitoring runs, `monitor.go` diffs the new snapshot against the stored baseline and posts alerts to Discord when configured. / 모니터링 실행 시 `monitor.go`가 새 스냅샷과 저장된 베이스라인을 diff하고, 설정되어 있으면 Discord로 알림을 보냅니다.
6. For browser-based labs, `lab-runner.mjs` / `lab-solver.mjs` drive Playwright through a Chromium browser to walk or solve exercises locally. / 브라우저 기반 실습의 경우 `lab-runner.mjs` / `lab-solver.mjs`가 Playwright로 Chromium 브라우저를 구동하여 로컬에서 실습을 진행하거나 풀이합니다.

### Component map / 구성 요소 맵

| Component | Runtime | Responsibilities | 책임 |
|-----------|---------|------------------|------|
| `Makefile` | GNU Make | Discoverable entry points, flag forwarding | 진입점 노출, 플래그 전달 |
| `setup.go` | Go stdlib | Verify scanner binaries, fetch SecLists | 스캐너 바이너리 검증, SecLists 다운로드 |
| `recon.go` | Go stdlib | 5-phase recon pipeline orchestration | 5단계 정찰 파이프라인 오케스트레이션 |
| `monitor.go` | Go stdlib | Baseline diff + crt.sh polling + Discord webhooks | 베이스라인 diff + crt.sh 폴링 + Discord 웹훅 |
| `hunt.go` | Go stdlib | Category-based vulnerability scanning | 카테고리 기반 취약점 스캔 |
| `lab-runner.mjs` | Node.js + Playwright | Drive a Chromium browser through lab steps | Chromium 브라우저로 실습 단계 진행 |
| `lab-solver.mjs` | Node.js + Playwright | Targeted lab challenge solving | 표적형 실습 챌린지 풀이 |
| `config/targets.json` | Static JSON | Per-target config: scope, hooks, options | 대상별 설정: 스코프, 훅, 옵션 |
| `notes/` | Markdown | Checklists and report templates | 체크리스트 및 리포트 템플릿 |

---

## Quick Start / 빠른 시작

### Prerequisites / 사전 요구 사항

| Tool | Required by | Install hint |
|------|-------------|--------------|
| Go ≥ 1.21 | All `make` targets | https://go.dev/dl/ |
| Node.js ≥ 18 | `lab-runner.mjs`, `lab-solver.mjs` | https://nodejs.org/ |
| `subfinder` | `recon`, `monitor` | `go install github.com/projectdiscovery/subfinder/v2/cmd/subfinder@latest` |
| `httpx` | `recon`, `hunt` | `go install github.com/projectdiscovery/httpx/cmd/httpx@latest` |
| `nuclei` | `recon`, `hunt` | `go install github.com/projectdiscovery/nuclei/v3/cmd/nuclei@latest` |
| `waybackurls` | `recon` | `go install github.com/tomnomnom/waybackurls@latest` |
| Chromium | Lab scripts | Installed automatically by `npx playwright install chromium` |

### First run / 첫 실행

```bash
# Clone the repository / 저장소 클론
git clone https://github.com/jclee941/jclee-bot
cd bug

# Install Node dependencies for the Playwright lab scripts / Playwright 실습 스크립트 의존성 설치
npm install
npx playwright install chromium

# Verify all external tools and download wordlists / 외부 도구 검증 및 워드리스트 다운로드
make setup

# Run a full recon pipeline against an authorized target / 승인된 대상에 대해 전체 정찰 실행
make recon TARGET=example.com
```

> ⚠️ **Authorization required / 권한 필요** — Only run scans against systems you own or have explicit written permission to test. 본 스캔은 본인이 소유하거나 명시적인 서면 허가를 받은 시스템에서만 실행하세요.

---

## Configuration / 설정

All per-target configuration lives in `config/targets.json`. Add or update entries there before invoking any `make` target. The structure typically captures scope, notification webhooks, and per-target overrides. / 모든 대상별 설정은 `config/targets.json`에 위치합니다. `make` 타겟을 호출하기 전에 항목을 추가하거나 갱신하세요. 일반적으로 스코프, 알림 웹훅, 대상별 재정의를 포함합니다.

```jsonc
{
  "targets": {
    "example.com": {
      "scope": ["example.com", "*.example.com"],
      "out_of_scope": ["blog.example.com"],
      "rate_limit_rps": 100,
      "discord_webhook_url": "https://discord.com/api/webhooks/<id>/<token>",
      "notes": "Authorized via program X"
    }
  }
}
```

| Field | Type | Description | 설명 |
|-------|------|-------------|------|
| `scope` | string[] | Domains / wildcards explicitly authorized | 명시적으로 승인된 도메인 / 와일드카드 |
| `out_of_scope` | string[] | Subdomains to exclude | 제외할 서브도메인 |
| `rate_limit_rps` | number | Per-tool rate ceiling (default 100) | 도구당 요청 상한 (기본 100) |
| `discord_webhook_url` | string | Optional Discord alert target | 선택적 Discord 알림 대상 |
| `notes` | string | Free-form authorization note | 자유 형식의 승인 메모 |

The Go scripts never hardcode domains; they read this file or accept `-d` on the command line. / Go 스크립트는 도메인을 하드코딩하지 않으며, 이 파일을 읽거나 명령줄에서 `-d`로 받습니다.

---

## Commands Reference / 명령어 레퍼런스

Run `make help` to print an interactive list at any time. All commands requiring a target take `TARGET=domain.com`. / 언제든 `make help`로 대화형 목록을 출력할 수 있습니다. 대상이 필요한 모든 명령은 `TARGET=domain.com`을 인자로 받습니다.

| Command | Purpose | 목적 |
|---------|---------|------|
| `make help` | Print the command catalog | 명령 카탈로그 출력 |
| `make setup` | Verify tools, download wordlists | 도구 검증, 워드리스트 다운로드 |
| `make recon TARGET=x.com` | Full 5-phase recon pipeline | 5단계 정찰 파이프라인 |
| `make recon-fast TARGET=x.com` | Recon without nuclei scan | nuclei를 제외한 정찰 |
| `make monitor TARGET=x.com` | Diff vs. baseline, alert on new findings | 베이스라인 대비 diff, 신규 발견 알림 |
| `make hunt TARGET=x.com` | All vulnerability categories | 전체 취약점 카테고리 |
| `make hunt-idor TARGET=x.com` | IDOR scan only | IDOR만 스캔 |
| `make hunt-ssrf TARGET=x.com` | SSRF scan only | SSRF만 스캔 |
| `make full-scan TARGET=x.com` | Recon + hunt combined | 정찰 + 헌팅 결합 |
| `make clean` | Remove local scan results | 로컬 스캔 결과 제거 |

### Go script flags / Go 스크립트 플래그

Each Go script accepts its own flags. The `Makefile` wraps the most common ones; invoke the script directly for advanced options. / 각 Go 스크립트는 자체 플래그를 받습니다. `Makefile`이 가장 흔히 쓰는 플래그를 래핑하며, 고급 옵션은 스크립트를 직접 호출하세요.

```bash
go run scripts/recon.go   -d example.com -skip-nuclei -out ./recon/custom
go run scripts/monitor.go -d example.com -baseline ./targets/example.com.json
go run scripts/hunt.go    -d example.com -type idor -rate 50
```

### Lab scripts / 실습 스크립트

The Node.js lab scripts are not wired into the `Makefile`; invoke them directly. / Node.js 실습 스크립트는 `Makefile`에 연결되어 있지 않으므로 직접 호출하세요.

```bash
# Walk through lab steps with the runner / 러너로 실습 단계 진행
node scripts/lab-runner.mjs --lab "https://<lab-url>"

# Solve a specific challenge / 특정 챌린지 풀이
node scripts/lab-solver.mjs --challenge <id>
```

---

## Output Directories / 출력 디렉터리

Every scan produces a timestamped directory so runs are diffable and never collide. / 모든 스캔은 타임스탬프가 붙은 디렉터리를 생성하여 실행 결과를 비교 가능하고 충돌 없이 관리합니다.

| Directory | Created by | Contents | 내용 |
|-----------|-----------|----------|------|
| `recon/<target>/<timestamp>/` | `recon.go`, `hunt.go` | Raw + normalized scanner output | 원본 + 정규화된 스캐너 출력 |
| `targets/<target>.json` | `monitor.go` | Latest baseline snapshot | 최신 베이스라인 스냅샷 |
| `reports/<id>/` | Operator | Drafted bug reports from `notes/report-template.md` | 작성 중인 버그 리포트 |
| `wordlists/` | `setup.go` | SecLists archives | SecLists 아카이브 |

All four are gitignored — never commit scan artifacts. / 네 디렉터리 모두 gitignore 처리되어 있으며 스캔 결과물을 커밋해서는 안 됩니다.

---

## Local Development / 로컬 개발

### Working on Go scripts / Go 스크립트 작업

- Each Go script is standalone: no `go.mod`, no `go.sum`. Just `go run scripts/<file>.go`. / 각 Go 스크립트는 단독 실행 파일입니다: `go.mod`, `go.sum` 없음. 그냥 `go run scripts/<file>.go`.
- Stay on the stdlib. Pull requests that introduce external Go dependencies will be rejected. / 표준 라이브러리만 사용하세요. 외부 Go 의존성을 추가하는 PR은 거부됩니다.
- External tools are invoked through `os/exec`. Wrap each call in a small helper so stdout/stderr capture and exit-code handling stay consistent. / 외부 도구는 `os/exec`로 호출합니다. 각 호출을 작은 헬퍼로 감싸 stdout/stderr 캡처와 종료 코드 처리를 일관되게 유지하세요.
- Results must always flow through the timestamped-directory convention. / 결과는 항상 타임스탬프 디렉터리 규약을 따라야 합니다.

### Working on lab scripts / 실습 스크립트 작업

- Both `lab-runner.mjs` and `lab-solver.mjs` are plain ESM JavaScript. / `lab-runner.mjs`와 `lab-solver.mjs`는 일반 ESM JavaScript입니다.
- The only Node dependency is `playwright`; keep it that way unless absolutely necessary. / 유일한 Node 의존성은 `playwright`이며, 꼭 필요한 경우가 아니면 그대로 유지하세요.
- Run `npx playwright install chromium` after fresh clones to ensure the browser binary is present. / 새로 클론한 후에는 `npx playwright install chromium`을 실행해 브라우저 바이너리를 확보하세요.

### Adding a new hunt category / 새 헌팅 카테고리 추가

1. Append the new type identifier to the `huntTypes` slice in `scripts/hunt.go`. / 새 타입 식별자를 `scripts/hunt.go`의 `huntTypes` 슬라이스에 추가합니다.
2. Add a corresponding `-type` branch in the hunt dispatcher. / 헌팅 디스패처에 해당 `-type` 분기를 추가합니다.
3. Wire a `make hunt-<name>` target in `Makefile` if you want a dedicated entry point. / 전용 진입점을 원한다면 `Makefile`에 `make hunt-<name>` 타겟을 연결합니다.
4. Update the `hunt` row in the commands table in this README. / 본 README의 명령어 표에 헌팅 행을 갱신합니다.

---

## Testing / 테스트

This toolkit orchestrates external tools, so unit tests live alongside the scripts they exercise. Currently no automated test suite is wired into the `Makefile`; the `npm test` script is a placeholder. / 본 툴킷은 외부 도구를 오케스트레이션하므로 단위 테스트는 해당 스크립트와 함께 위치합니다. 현재 자동화 테스트 스위트는 `Makefile`에 연결되어 있지 않으며 `npm test` 스크립트는 자리표시자입니다.

Recommended manual checks before submitting changes: / 변경 사항을 제출하기 전 권장되는 수동 점검:

| Check | How |
|-------|-----|
| Tool verification passes | `make setup` |
| Help output stays current | `make help` |
| Each `make` target accepts and rejects bad targets correctly | e.g. `make recon` (no `TARGET`) should fail with a clear error |
| `recon`, `monitor`, `hunt` produce timestamped output directories | Run against an authorized scope and inspect `recon/` |
| Lab scripts launch Chromium and navigate without errors | `node scripts/lab-runner.mjs --help` then a known lab |

---

## Contribution Guide / 기여 가이드

- Read `AGENTS.md` before opening a PR — it documents the conventions, structure, and anti-patterns. / PR을 열기 전에 `AGENTS.md`를 읽으세요. 규약, 구조, 안티 패턴이 정리되어 있습니다.
- Keep changes scoped: one phase, one tool, or one hunt category per PR. / 변경 범위를 좁게 유지하세요: PR당 한 단계, 한 도구, 또는 한 헌팅 카테고리.
- Do not commit scan artifacts under `recon/`, `targets/`, `reports/`, or `wordlists/`. / `recon/`, `targets/`, `reports/`, `wordlists/` 아래의 스캔 결과물을 커밋하지 마세요.
- Do not hardcode target domains, API keys, or webhook URLs in scripts. / 스크립트에 대상 도메인, API 키, 웹훅 URL을 하드코딩하지 마세요.
- Respect rate limits (default 100 req/s for nuclei) and the scope declared in `config/targets.json`. / 속도 제한(nuclei 기본 100 req/s)과 `config/targets.json`에 선언된 스코프를 준수하세요.
- Never add upstream-facing automation such as auto-submitting reports or auto-filing issues. / 리포트 자동 제출이나 이슈 자동 생성 같은 상류 자동화를 추가하지 마세요.

See `CONTRIBUTING.md` for the full process, code review expectations, and sign-off requirements. / 전체 절차, 코드 리뷰 기대치, 서명 요건은 `CONTRIBUTING.md`를 참조하세요.

---

## Responsible Use / 책임 있는 사용

This toolkit must only be used against systems you are explicitly authorized to test — your own assets, scoped bug bounty programs, or dedicated lab platforms such as PortSwigger Web Security Academy, HackTheBox, or TryHackMe. Unauthorized scanning may violate computer-misuse laws (e.g. the U.S. CFAA, the EU Directive on attacks against information systems, Korea의 정보통신망법) and almost certainly violates the target's terms of service.

본 툴킷은 본인이 소유한 자산, 스코프가 명시된 버그 바운티 프로그램, 또는 PortSwigger Web Security Academy, HackTheBox, TryHackMe 같은 전용 실습 플랫폼 등 명시적으로 테스트 권한을 부여받은 시스템에만 사용해야 합니다. 무단 스캔은 컴퓨터 오용 관련 법규(예: 미국 CFAA, EU 정보시스템 공격에 관한 지침, 한국 정보통신망법)를 위반할 수 있으며 대상의 서비스 이용약관을 거의 확실히 위반합니다.

Before every engagement: / 모든 업무 시작 전:

1. Confirm written authorization and capture the scope. / 서면 허가를 확인하고 스코프를 기록하세요.
2. Respect rate limits and exclude `out_of_scope` entries. / 속도 제한을 준수하고 `out_of_scope` 항목을 제외하세요.
3. Stop immediately and report responsibly if you encounter sensitive data (PII, credentials, financial records). / 민감 데이터(PII, 자격증명, 금융 기록)를 발견하면 즉시 중단하고 책임감 있게 보고하세요.

---

## License / 라이선스

ISC — see the `LICENSE` file in the repository root. / ISC — 저장소 루트의 `LICENSE` 파일을 참조하세요.

- Repository / 저장소: https://github.com/jclee941/bug
- Issues / 이슈: https://github.com/jclee941/bug/issues