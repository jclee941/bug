# Bug Bounty Automation Toolkit / 버그 바운티 자동화 툴킷

> 책임 있는 보안 연구와 버그 바운티 프로그램을 위한 자동화 키트 — Go 스크립트가 외부 보안 CLI를 오케스트레이션하고 Playwright 기반 격리 실습 워크플로우와 함께 동작합니다.
>
> An automation kit for responsible security research and bug bounty programs — Go scripts orchestrate external security CLIs and pair with Playwright-driven isolated lab workflows.

---

## 한눈에 보기 / At a Glance

이 저장소는 버그 바운티 1사이클(setup → recon → monitor → hunt → lab)을 단일 `Makefile`로 묶어 둔 개인 연구용 자동화 키트입니다. Go 스크립트는 표준 라이브러리만 사용하고 모든 외부 도구는 `os/exec`로 호출하며, 두 개의 Node.js + Playwright 스크립트(`lab-runner.mjs`, `lab-solver.mjs`)는 격리된 브라우저 기반 실습 워크플로우를 담당합니다. 결과물은 타임스탬프가 붙은 로컬 디렉터리에 저장되며 `.gitignore` 처리되어 운영자 머신을 자동으로 떠나지 않습니다.

This repository bundles a single bug-bounty cycle — setup → recon → monitor → hunt → lab — behind one `Makefile` for personal security research. The Go scripts depend only on the standard library and shell out to third-party CLIs via `os/exec`; the Node.js + Playwright pair (`lab-runner.mjs`, `lab-solver.mjs`) covers isolated browser-based lab workflows. All artifacts land in timestamped, gitignored directories and never leave the operator's machine without an explicit forward step.

### Status / 운영 상태

| Area | State | 비고 |
|------|-------|------|
| Production readiness | Personal research toolkit — not a hosted service | 개인 연구용 키트, 호스팅 서비스 아님 |
| Go scripts | Stdlib-only, run via `go run scripts/*.go` | 외부 Go 모듈 없음, `go.mod` 불필요 |
| Node scripts | `lab-runner.mjs` / `lab-solver.mjs` driven by Playwright `^1.61.0` | 격리 실습 워크플로우 전담 |
| External tooling | Wraps `subfinder`, `httpx`, `nuclei`, `waybackurls`, `nuclei-templates`, `SecLists` | 설치 책임은 운영자에게 있음 |
| Output scope | Local-only, gitignored | `recon/`, `targets/`, `reports/`, `wordlists/` |
| Notifications | Discord webhook (opt-in via `config/targets.json`) | 모니터링 diff 발생 시 |
| Default rate limit | `100 req/s` for nuclei | 스크립트별 플래그로 조정 가능 |
| License | ISC (see [`LICENSE`](LICENSE)) | |

### Operator Flow / 운영 흐름 요약

| Step | Command | 목적 |
|------|---------|------|
| 1 | `make setup` | 도구 확인 + SecLists 단어 목록 다운로드 |
| 2 | `make recon TARGET=example.com` | 5단계 정찰 파이프라인 (subfinder → httpx → nuclei → waybackurls …) |
| 3 | `make recon-fast TARGET=example.com` | nuclei를 건너뛴 빠른 정찰 |
| 4 | `make monitor TARGET=example.com` | 기준선 대비 신규 자산/엔드포인트 diff 탐지 + Discord 알림 |
| 5 | `make hunt TARGET=example.com` | 4단계 표적형 취약점 헌팅 |
| 6 | `make hunt-idor` / `make hunt-ssrf` | 카테고리 단일 헌팅 |
| 7 | `make full-scan TARGET=example.com` | recon + hunt 통합 실행 |
| 8 | `npm run lab` (or node scripts) | 격리된 Playwright 실습 워크플로우 |
| 9 | `make clean` | 로컬 결과물 정리 |

---

## Purpose / 패키지 구성

이 키트는 다음 다섯 가지 사용자 시나리오를 지원합니다.

- **정찰(Reconnaissance)** — 단일 도메인에 대해 서브도메인 수집 → 프로빙 → 템플릿 스캔 → 아카이브 기반 엔드포인트 수집을 한 번에 실행합니다.
- **변경 모니터링(Diff Monitoring)** — 이전 스캔 결과와 비교하여 신규 서브도메인/엔드포인트가 등장하면 즉시 알립니다.
- **표적형 취약점 헌팅(Targeted Hunting)** — IDOR, SSRF 같은 카테고리별 헌팅 페이즈를 분리해 실행할 수 있습니다.
- **격리 실습(Lab Practice)** — Playwright로 통제된 환경에서 시나리오를 재생/검증합니다.
- **보고(Reporting)** — `notes/report-template.md`를 기반으로 표준화된 버그 리포트를 작성합니다.

### Package Contents / 디렉터리 구성

| Path | Role | 운영자 메모 |
|------|------|------------|
| `Makefile` | 단일 진입점 오케스트레이션 | `make help`로 사용 가능한 타깃 확인 |
| `scripts/setup.go` | 도구 확인 + 단어 목록 다운로드 | 첫 실행 시 1회 |
| `scripts/recon.go` | 5단계 정찰 파이프라인 | nuclei 스킵 옵션 제공 |
| `scripts/monitor.go` | diff 기반 변경 모니터링 | crt.sh 보조 + Discord 알림 |
| `scripts/hunt.go` | 4단계 표적형 헌팅 | 카테고리별 실행 가능 |
| `scripts/lab-runner.mjs` | Playwright 기반 격리 실습 러너 | Playwright `^1.61.0` 필요 |
| `scripts/lab-solver.mjs` | Playwright 기반 실습 솔버 | `lab-runner`와 페어링 |
| `config/targets.json` | 타깃/알림 설정 | 새 타깃 등록은 여기 |
| `notes/phase2-checklist.md` | 학습 체크리스트 | 진행 상황 추적용 |
| `notes/report-template.md` | 버그 리포트 템플릿 | 제출 전 표준화 |
| `notes/vulnerability-study.md` | 취약점 학습 노트 | 개인 학습 자료 |
| `recon/`, `targets/`, `reports/`, `wordlists/` | 결과물 (gitignored) | 커밋 금지 |

---

## First Files to Read / 먼저 읽을 파일

운영자가 처음 들어왔을 때 읽어야 할 파일 순서입니다.

| Order | File | 이유 |
|-------|------|------|
| 1 | [`Makefile`](Makefile) | 사용 가능한 모든 명령과 의존 관계를 한곳에서 확인 |
| 2 | [`AGENTS.md`](AGENTS.md) | 스크립트 구조와 작업 위치 매핑 |
| 3 | [`config/targets.json`](config/targets.json) | 타깃 등록 및 알림 채널 설정 |
| 4 | [`scripts/recon.go`](scripts/recon.go) | 정찰 파이프라인의 핵심 동작 확인 |
| 5 | [`scripts/hunt.go`](scripts/hunt.go) | 헌팅 카테고리(`huntTypes`) 추가/수정 위치 |
| 6 | [`notes/report-template.md`](notes/report-template.md) | 제출 전 표준 리포트 형식 |
| 7 | [`CONTRIBUTING.md`](CONTRIBUTING.md) | 기여 절차와 금지 행위 |

---

## Architecture / 아키텍처

키트는 두 개의 평행 런타임(Go · Node.js)과 그 위의 얇은 오케스트레이션 레이어(`Makefile`)로 구성됩니다.

### Runtime Layout

| Layer | 구성 요소 | 책임 |
|-------|-----------|------|
| Orchestration | `Makefile` | 명령 노출, 인자 검증(`TARGET` 필수), 결과 안내 |
| Go runtime | `scripts/setup.go`, `scripts/recon.go`, `scripts/monitor.go`, `scripts/hunt.go` | 정찰·모니터링·헌팅 파이프라인 실행 |
| Node runtime | `scripts/lab-runner.mjs`, `scripts/lab-solver.mjs` | Playwright 기반 격리 실습 |
| External CLIs | `subfinder`, `httpx`, `nuclei`, `waybackurls` 등 | `os/exec`로 호출되는 외부 도구 |
| Config | `config/targets.json` | 타깃 목록, 알림 webhook 등 |
| Output | `recon/`, `targets/`, `reports/`, `wordlists/` | 타임스탬프가 붙은 로컬 결과물 |

### Request Flow (recon 예시)

1. 운영자가 `make recon TARGET=example.com` 실행
2. `Makefile`이 `TARGET` 비어 있으면 에러로 즉시 종료
3. `go run scripts/recon.go -d example.com` 호출
4. `recon.go`가 내부 5단계를 순차 실행 (예: subfinder → httpx → nuclei → waybackurls → 보고)
5. 각 단계 결과가 `recon/<timestamp>/...`에 기록
6. 완료 시 요약 경로 출력, 운영자가 후속 단계(`monitor`, `hunt`, lab) 선택

### Conventions / 컨벤션

- 모든 Go 스크립트는 독립 실행 파일 — `go.mod` 없이 `go run scripts/x.go` 호출
- 외부 Go 모듈 의존성 없음 — 표준 라이브러리만 사용
- 외부 도구는 `os/exec`로 호출, 도구 부재 시 명확한 에러 메시지
- 결과는 타임스탬프가 붙은 디렉터리에 저장 (`recon/<YYYY-MM-DDTHH-MM-SS>/...`)
- 민감한 스캔 데이터는 `.gitignore`로 커밋 차단

### Anti-Patterns / 금지 행위

- 스캔 결과(`recon/`, `targets/`, `reports/`)를 커밋하지 말 것
- 스크립트에 타깃 도메인을 하드코딩하지 말 것
- 명시적 프로그램授权 없이 스캔을 실행하지 말 것
- 기본 rate limit(예: nuclei `100 req/s`)을 무차별적으로 초과하지 말 것

---

## Quickstart / 빠른 시작

### Prerequisites / 사전 준비

- **Go** (1.20+ 권장) — `go run`으로 스크립트 실행
- **Node.js** (18+ 권장) + npm — Playwright 스크립트 실행
- **External CLIs** — 운영자가 직접 설치 (예: `subfinder`, `httpx`, `nuclei`, `waybackurls`)
- **Discord webhook URL** (선택) — `config/targets.json`의 알림 채널 설정 시

### First Run / 최초 실행

```bash
# 1) 저장소 클론 후 진입
git clone <your-fork-or-clone-url>
cd bug

# 2) 사용 가능한 명령 확인
make help

# 3) 도구 확인 + 단어 목록 다운로드
make setup

# 4) 타깃 등록 (예시: config/targets.json 편집)
#    → 새 타깃 항목 추가

# 5) 첫 정찰 실행
make recon TARGET=example.com
```

### Typical Session / 일반적인 작업 흐름

```bash
# 빠른 정찰 (nuclei 건너뜀)
make recon-fast TARGET=example.com

# 변경 모니터링 — 기준선 대비 신규 자산 확인
make monitor TARGET=example.com

# 표적형 헌팅 (전체)
make hunt TARGET=example.com

# IDOR만 따로
make hunt-idor TARGET=example.com

# SSRF만 따로
make hunt-ssrf TARGET=example.com

# 정찰 + 헌팅을 한 번에
make full-scan TARGET=example.com
```

### Lab Practice / 격리 실습

```bash
# 의존성 설치
npm install

# Playwright 브라우저 바이너리 설치 (최초 1회)
npx playwright install

# 실습 워크플로우 실행
node scripts/lab-runner.mjs
node scripts/lab-solver.mjs
```

---

## Configuration / 설정

### `config/targets.json`

신규 타깃과 알림 채널은 이 파일에서 관리합니다. 하드코딩된 도메인을 스크립트에 직접 넣지 마세요.

| Key | Role | 예시 |
|-----|------|------|
| `targets` | 스캔 대상 목록 | `[{ "domain": "example.com", "scope": [...] }]` |
| `notifications.discord_webhook` | 모니터링 diff 알림용 webhook URL | 환경 변수로 주입 권장 |
| `notifications.rate_limit` | nuclei 등 외부 도구의 요청 상한 | 기본 `100 req/s` |

### Per-Script Flags

| Script | 주요 플래그 | 비고 |
|--------|-------------|------|
| `scripts/recon.go` | `-d <domain>`, `-skip-nuclei` | nuclei 단계 생략 가능 |
| `scripts/monitor.go` | `-d <domain>` | 기준선은 `targets/`에 저장 |
| `scripts/hunt.go` | `-d <domain>`, `-type <idor\|ssrf\|...>` | 카테고리 단일 실행 |
| `scripts/setup.go` | (플래그 없음) | 환경 점검 + 단어 목록 다운로드 |

---

## Commands Reference / 명령 레퍼런스

`make help`로 항상 최신 목록을 확인할 수 있습니다.

| Target | Usage | 설명 |
|--------|-------|------|
| `help` | `make help` | 사용 가능한 명령과 예시 출력 |
| `setup` | `make setup` | 도구 확인 + SecLists 다운로드 |
| `recon` | `make recon TARGET=domain.com` | 5단계 정찰 파이프라인 |
| `recon-fast` | `make recon-fast TARGET=domain.com` | nuclei 제외 정찰 |
| `monitor` | `make monitor TARGET=domain.com` | diff 기반 변경 모니터링 |
| `hunt` | `make hunt TARGET=domain.com` | 4단계 표적형 헌팅 |
| `hunt-idor` | `make hunt-idor TARGET=domain.com` | IDOR 헌팅만 실행 |
| `hunt-ssrf` | `make hunt-ssrf TARGET=domain.com` | SSRF 헌팅만 실행 |
| `full-scan` | `make full-scan TARGET=domain.com` | recon + hunt 통합 |
| `scan-target` | `make scan-target` | (예약 타깃 — 정의된 경우) |
| `clean` | `make clean` | 로컬 결과물 정리 |

`TARGET` 인자가 비어 있으면 각 타깃은 명확한 에러 메시지와 함께 즉시 종료됩니다.

---

## Local Development / 로컬 개발

### Repository Layout (실제 구조 반영)

```
.
├── AGENTS.md
├── CONTRIBUTING.md
├── LICENSE
├── Makefile
├── README.md
├── package-lock.json
├── package.json
├── config/
│   └── targets.json
├── notes/
│   ├── phase2-checklist.md
│   ├── report-template.md
│   └── vulnerability-study.md
└── scripts/
    ├── hunt.go
    ├── lab-runner.mjs
    ├── lab-solver.mjs
    ├── monitor.go
    ├── recon.go
    └── setup.go
```

### Where to Make Changes

| 작업 | 위치 | 메모 |
|------|------|------|
| 새 타깃 추가 | `config/targets.json` | 스크립트 수정 불필요 |
| 정찰 파이프라인 조정 | `scripts/recon.go` | 단계별 함수/플래그 확인 |
| 헌팅 카테고리 추가 | `scripts/hunt.go`의 `huntTypes` 슬라이스 | 카테고리 분기 확인 |
| nuclei 설정 변경 | 각 스크립트의 플래그 기본값 | rate limit 동시 확인 |
| 알림 채널 변경 | `config/targets.json` | webhook URL은 환경 변수 주입 권장 |
| 보고서 템플릿 갱신 | `notes/report-template.md` | 제출 형식 표준화 |
| 학습 체크리스트 갱신 | `notes/phase2-checklist.md` | 진행 추적용 |

### Editing the Go Scripts

- 외부 모듈 추가 없이 표준 라이브러리만 사용
- 실행은 항상 `go run scripts/<file>.go` 형태
- 출력 경로는 `recon/` 하위 타임스탬프 디렉터리 컨벤션 유지
- 에러 메시지는 운영자가 다음 행동을 알 수 있도록 작성

### Editing the Node Scripts

- `package.json`의 `playwright` 의존성(`^1.61.0`)만 사용
- `lab-runner.mjs` / `lab-solver.mjs`는 격리 환경에서만 실행 — 프로덕션 타깃에 직접 사용 금지
- 새 실습 시나리오 추가 시 두 스크립트의 페어링 구조 유지

---

## Testing / 테스트

이 저장소는 외부 보안 도구와의 통합이 핵심이라 단위 테스트 대신 **dry-run + 격리 실습** 패턴을 권장합니다.

| 검증 종류 | 방법 | 메모 |
|-----------|------|------|
| 스크립트 정합성 | `go vet scripts/*.go`, `go build scripts/*.go` | 컴파일 가능 여부 |
| CLI 스모크 | `go run scripts/setup.go` | 도구 점검 동작 확인 |
| 실습 워크플로우 | `node scripts/lab-runner.mjs` | 격리 환경에서만 실행 |
| 리포트 형식 | `notes/report-template.md` 기반 작성 테스트 | 수동 검증 |
| 모의 정찰 | 자신이 소유한 도메인에서 `make recon` | 실서버 금지 |

`npm test`는 현재 placeholder 스크립트(`"Error: no test specified"`)로 설정되어 있습니다.

---

## Maintainers / Points of Contact

| 역할 | 담당 | 채널 |
|------|------|------|
| Original author | jclee (repository owner per `package.json`) | 이슈 트래커 참조 |
| Contributions | CONTRIBUTING.md 절차 따름 | Pull Request |

개인 연구용 키트이므로 SLA나 24/7 지원은 제공되지 않습니다. 이슈 트래커는 `package.json`의 `bugs` 필드에 명시된 위치를 따릅니다.

---

## Further Documentation / 추가 문서

| 문서 | 위치 |
|------|------|
| 운영 지식 베이스 | [`AGENTS.md`](AGENTS.md) |
| 기여 절차 | [`CONTRIBUTING.md`](CONTRIBUTING.md) |
| 보고서 템플릿 | [`notes/report-template.md`](notes/report-template.md) |
| 학습 체크리스트 | [`notes/phase2-checklist.md`](notes/phase2-checklist.md) |
| 취약점 학습 노트 | [`notes/vulnerability-study.md`](notes/vulnerability-study.md) |
| 라이선스 전문 | [`LICENSE`](LICENSE) |

외부 도구의 상세 사용법은 각 프로젝트의 공식 문서를 참고하세요 (`subfinder`, `httpx`, `nuclei`, `waybackurls`, `SecLists`, `playwright`).

---

## Contribution Guide / 기여 가이드

기여 전 [`CONTRIBUTING.md`](CONTRIBUTING.md)를 반드시 읽어 주세요. 핵심 원칙은 다음과 같습니다.

- 모든 Go 스크립트는 표준 라이브러리만 사용 — 신규 외부 모듈 도입 시 사전 합의
- 새 헌팅 카테고리 추가는 `scripts/hunt.go`의 `huntTypes` 슬라이스에서 분기
- 스캔 결과물은 절대 커밋하지 않음 — `.gitignore` 갱신으로 차단
- 타깃 도메인 하드코딩 금지 — `config/targets.json` 경유
- PR 단위는 하나의 책임(스크립트 하나 / 카테고리 하나)에 한정

---

## License / 라이선스

이 프로젝트는 [`LICENSE`](LICENSE) 파일에 명시된 **ISC License** 하에 배포됩니다.

This project is released under the **ISC License** as described in [`LICENSE`](LICENSE).

> **책임 있는 사용에 대한 안내 / Responsible Use Notice**
> 이 키트는 합법적으로授权된 보안 연구와 버그 바운티 프로그램에서만 사용되어야 합니다. 운영자는 자신의 행동과 그 결과에 대한 모든 책임을 집니다. 허가 없이 타 시스템을 스캔하는 행위는 관련 법률에 따라 제재 대상이 될 수 있습니다.
>
> This toolkit must only be used in legally authorized security research and bug bounty programs. Operators bear full responsibility for their actions and their consequences. Scanning systems without explicit authorization may be punishable under applicable laws.