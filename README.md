# Bug Bounty Automation Toolkit / 버그 바운티 자동화 툴킷

> 책임 있는 보안 연구와 버그 바운티 프로그램을 위한 개인용 자동화 키트 — Go 스크립트가 외부 보안 CLI를 오케스트레이션하고, Playwright 기반 격리 실습 워크플로우와 함께 동작합니다.
>
> A personal automation kit for responsible security research and bug bounty programs — Go scripts orchestrate third-party security CLIs and pair with Playwright-driven isolated lab workflows.

---

## 한눈에 보기 / At a Glance

이 저장소는 버그 바운티 1사이클(`setup → recon → monitor → hunt → lab`)을 단일 `Makefile`로 묶어 둔 개인 연구용 자동화 키트입니다. Go 스크립트는 표준 라이브러리만 사용하고 모든 외부 도구는 `os/exec`로 호출하며, 두 개의 Node.js + Playwright 스크립트(`lab-runner.mjs`, `lab-solver.mjs`)는 격리된 브라우저 기반 실습 워크플로우를 담당합니다. 결과물은 타임스탬프가 붙은 로컬 디렉터리에 저장되며 `.gitignore` 처리되어 운영자 머신을 자동으로 떠나지 않습니다.

This repository bundles a single bug-bounty cycle — `setup → recon → monitor → hunt → lab` — behind one `Makefile` for personal security research. The Go scripts depend only on the standard library and shell out to third-party CLIs via `os/exec`; the Node.js + Playwright pair (`lab-runner.mjs`, `lab-solver.mjs`) covers isolated browser-based lab workflows. All artifacts land in timestamped, gitignored directories and never leave the operator's machine without an explicit forward step.

## 운영 상태 / Status

| Area | State | 비고 |
|------|-------|------|
| Production readiness | Personal research toolkit — not a hosted service | 개인 연구용 키트, 호스팅 서비스 아님 |
| Go scripts | Stdlib-only, run via `go run scripts/*.go` | 외부 Go 모듈 없음, `go.mod` 불필요 |
| Node scripts | `lab-runner.mjs`, `lab-solver.mjs` driven by Playwright `^1.61.0` | 격리 실습 워크플로우 전담 |
| External tooling | Wraps `subfinder`, `httpx`, `nuclei`, `waybackurls`, `nuclei-templates`, `SecLists` | 설치 책임은 운영자에게 있음 |
| Output scope | Local-only, gitignored | `recon/`, `targets/`, `reports/`, `wordlists/` |
| Notifications | Discord webhook (opt-in via `config/targets.json`) | 모니터링 diff 발생 시 |
| Default rate limit | `100 req/s` for nuclei | 스크립트별 플래그로 조정 가능 |
| License | ISC (see [`LICENSE`](LICENSE)) | |

## 운영 흐름 요약 / Operator Flow

| Step | Command | Purpose | Output |
|------|---------|---------|--------|
| 1 | `make setup` | 도구 검증 + SecLists 다운로드 | `wordlists/`, 사전 점검 결과 |
| 2 | `make recon TARGET=target.com` | 5단계 정찰 파이프라인 | `recon/<timestamp>/` |
| 3 | `make monitor TARGET=target.com` | 신규 서브도메인·엔드포인트 diff | `targets/<domain>/current.json`, Discord 알림 |
| 4 | `make hunt TARGET=target.com` | 카테고리별 취약점 스캔 | `recon/<timestamp>/hunt/` |
| 5 | `node scripts/lab-runner.mjs` | 격리 브라우저 실습 | 로컬 워크스페이스 |
| 6 | `node scripts/lab-solver.mjs` | 실습 자동 풀이 | 리포트, 스크린샷 |

## 주요 기능 / Features

- **단일 진입점 오케스트레이션**: `Makefile` 한 줄로 전체 사이클 실행, 운영자 기억 부담 최소화.
- **Go stdlib-only 스크립트**: 외부 Go 의존성 0개, `go.mod` 없이 `go run scripts/*.go`로 즉시 실행.
- **모듈식 정찰 파이프라인**: `scripts/recon.go`의 5단계(subfinder → httpx → waybackurls → nuclei → 정렬·중복 제거) 구조.
- **변분 모니터링**: `scripts/monitor.go`가 crt.sh + 기존 baseline을 비교하고 신규 자산을 Discord로 통지.
- **타깃 취약점 헌팅**: `scripts/hunt.go`가 `-type idor|ssrf|...` 플래그로 카테고리 단위 스캔 지원.
- **격리 실습 환경**: Playwright 기반 `lab-runner.mjs` / `lab-solver.mjs`로 안전한 로컬 실습 자동화.
- **로컬 우선 산출물**: 모든 결과는 타임스탬프 디렉터리에 저장, `.gitignore`로 운영자 머신을 벗어나지 않음.
- **설정 외부화**: `config/targets.json`에서 도메인, 알림, 정책 분리 — 코드 수정 없이 타깃 추가.

## 아키텍처 / Architecture

이 키트는 4개의 협력 레이어로 구성됩니다.

| Layer | 구성요소 | 역할 |
|-------|----------|------|
| Orchestration | `Makefile` | 운영자 명령 단일 진입점, 타깃 변수 주입 |
| Native orchestrators | `scripts/setup.go`, `recon.go`, `monitor.go`, `hunt.go` | Go stdlib + `os/exec`로 외부 CLI 호출, 결과 직렬화 |
| Lab automation | `scripts/lab-runner.mjs`, `scripts/lab-solver.mjs` | Playwright 헤드리스 브라우저로 격리 실습 |
| External CLIs | `subfinder`, `httpx`, `nuclei`, `waybackurls` 등 | 실제 트래픽·탐지·열람 담당 (운영자가 사전 설치) |

요청 흐름 (1사이클):

1. 운영자가 `make recon TARGET=target.com` 실행.
2. `Makefile`이 `go run scripts/recon.go -d target.com` 호출.
3. `recon.go`가 5단계로 외부 CLI 호출, 각 단계 stdout을 파싱·저장.
4. 결과는 `recon/<timestamp>/`에 파일 단위로 누적.
5. 후속 `make monitor`가 신규 자산을 diff하고, `config/targets.json`의 Discord webhook이 켜져 있으면 알림 발송.
6. `make hunt`가 같은 baseline 위에서 카테고리별 취약점 스캔을 추가 실행.

## 저장소 구조 / Repository Layout

| Path | 설명 |
|------|------|
| `Makefile` | 단일 진입점 오케스트레이터 (`make help`로 명령 목록 확인) |
| `package.json` | Playwright `^1.61.0` 의존성 선언 (lab 스크립트 전용) |
| `package-lock.json` | npm 잠금 파일 |
| `scripts/setup.go` | 도구 설치 검증 + SecLists 다운로드 |
| `scripts/recon.go` | 5단계 정찰 파이프라인 |
| `scripts/monitor.go` | Baseline diff + crt.sh + Discord 알림 |
| `scripts/hunt.go` | 카테고리별 취약점 헌팅 |
| `scripts/lab-runner.mjs` | Playwright 기반 격리 실습 러너 |
| `scripts/lab-solver.mjs` | Playwright 기반 실습 자동 풀이 |
| `config/targets.json` | 타깃·알림 정책 |
| `notes/phase2-checklist.md` | 학습 체크리스트 |
| `notes/report-template.md` | 버그 리포트 템플릿 |
| `notes/vulnerability-study.md` | 취약점 스터디 노트 |
| `AGENTS.md` | 자동화 에이전트 지식 베이스 |
| `CONTRIBUTING.md` | 기여 가이드 |
| `LICENSE` | ISC 라이선스 전문 |
| `recon/` (gitignored) | 스캔 결과 |
| `targets/` (gitignored) | 타깃 baseline |
| `reports/` (gitignored) | 제출 리포트 |
| `wordlists/` (gitignored) | SecLists 다운로드 |

## 빠른 시작 / Quickstart

### 사전 요구 사항

| Tool | Version | 비고 |
|------|---------|------|
| Go | 1.21+ | `go run scripts/*.go`용 |
| Node.js | 18+ | Playwright 런타임 |
| `subfinder` | latest | 서브도메인 열거 |
| `httpx` | latest | 살아있는 호스트 판별 |
| `nuclei` | v3+ | 취약점 스캔 |
| `waybackurls` | latest | 히스토리컬 엔드포인트 |
| `git`, `curl`, `unzip` | system | SecLists 다운로드용 |

### 설치

```bash
git clone <repo-url> bug
cd bug
make setup                 # 도구 검증 + wordlists/ 채우기
npm install                # Playwright 설치
npx playwright install chromium
```

### 첫 정찰

```bash
make recon TARGET=target.com          # 풀 파이프라인
make recon-fast TARGET=target.com     # nuclei 스킵, 빠른 1회용
```

### 모니터링 시작

```bash
make monitor TARGET=target.com        # baseline 대비 신규 자산 diff
```

### 취약점 헌팅

```bash
make hunt TARGET=target.com           # 모든 카테고리
make hunt-idor TARGET=target.com      # IDOR 전용
make hunt-ssrf TARGET=target.com      # SSRF 전용
```

### 격리 실습

```bash
node scripts/lab-runner.mjs           # 실습 환경 가동
node scripts/lab-solver.mjs           # 자동 풀이
```

## 설정 / Configuration

### `config/targets.json`

타깃 도메인, 알림 정책, 스캔 옵션을 코드 수정 없이 추가·변경합니다.

| Key | Type | 설명 |
|-----|------|------|
| `targets` | array | 운영자가 정식 허가받은 도메인 목록 |
| `notifications.discord.webhook_url` | string | opt-in 알림 webhook (비워두면 알림 비활성) |
| `scan.default_rate_limit` | number | nuclei 등 외부 스캔의 기본 초당 요청 수 |
| `monitor.crt_sh_poll_minutes` | number | crt.sh 폴링 주기 |

### 환경 변수

| Variable | Default | 설명 |
|----------|---------|------|
| `TARGET` | (required for most recipes) | 대상 도메인 |
| `RATE` | `100` | nuclei 등 초당 요청 상한 |
| `SKIP_NUCLEI` | `false` | recon에서 nuclei 단계 건너뛰기 |
| `DISCORD_WEBHOOK` | `config/targets.json` 값 | 알림 webhook 오버라이드 |

## 명령 레퍼런스 / Commands Reference

| Make target | 실제 호출 | 설명 |
|-------------|-----------|------|
| `make help` | `grep` + `awk` | 사용 가능한 명령·예시 출력 |
| `make setup` | `go run scripts/setup.go` | 도구 검증 + SecLists 다운로드 |
| `make recon TARGET=x` | `go run scripts/recon.go -d x` | 5단계 풀 정찰 |
| `make recon-fast TARGET=x` | `go run scripts/recon.go -d x -skip-nuclei` | nuclei 제외 빠른 정찰 |
| `make monitor TARGET=x` | `go run scripts/monitor.go -d x` | baseline diff + crt.sh + Discord |
| `make hunt TARGET=x` | `go run scripts/hunt.go -d x` | 카테고리 통합 헌팅 |
| `make hunt-idor TARGET=x` | `go run scripts/hunt.go -d x -type idor` | IDOR 전용 |
| `make hunt-ssrf TARGET=x` | `go run scripts/hunt.go -d x -type ssrf` | SSRF 전용 |
| `make full-scan TARGET=x` | `go run scripts/recon.go -d x && go run scripts/hunt.go -d x` | recon + hunt 체인 |
| `make clean` | (rm artifacts) | `recon/`, `targets/`, `reports/` 정리 |

## 로컬 개발 / Local Development

### 코드 수정 워크플로우

1. `scripts/*.go` 수정 — `go.mod` 없음, 표준 라이브러리만 사용.
2. 새 정찰 단계 추가: `scripts/recon.go`의 단계 슬라이스에 함수 등록.
3. 새 헌팅 카테고리 추가: `scripts/hunt.go`의 `huntTypes` 슬라이스에 항목 추가.
4. lab 스크립트 수정: `scripts/lab-*.mjs` 편집 후 `node scripts/lab-runner.mjs`로 즉시 검증.
5. `make help` 출력이 의도대로 갱신되는지 확인.

### 스크립트 간 일관성

- 모든 Go 스크립트는 `os/exec`로 외부 CLI를 호출하고, stdout을 파일로 저장.
- 결과는 항상 `recon/<RFC3339 타임스탬프>/` 아래에 단계별 서브디렉터리로 분리.
- `config/targets.json`을 통해 정책을 외부화 — 스크립트에 도메인 하드코딩 금지.
- rate limit은 각 스크립트 플래그 기본값(`100 req/s`)을 따르되, 환경 변수로 오버라이드.

## 테스트 / Testing

이 키트는 보안 자동화 도구 특성상 단위 테스트 스위트를 제공하지 않습니다. 회귀 검증은 다음 절차로 대체합니다.

| 검증 대상 | 방법 |
|-----------|------|
| 도구 가용성 | `make setup` 종료 코드 0 |
| 파이프라인 정상 종료 | `make recon TARGET=localhost` 종료 코드 0 |
| baseline 정확성 | `make monitor`를 동일 baseline에 2회 실행, 두 번째 diff가 0건인지 확인 |
| hunt 카테고리 동작 | `make hunt-idor` 등 개별 카테고리가 알려진 실습 타깃에서 플래그 출력 |
| lab 스크립트 | `node scripts/lab-runner.mjs` / `node scripts/lab-solver.mjs` 수동 검증 |

## 기여 가이드 / Contributing

1. 변경 전 `AGENTS.md`의 "WHERE TO LOOK" 표를 참고해 영향 범위를 확인합니다.
2. `CONTRIBUTING.md`의 가이드라인을 준수합니다.
3. 모든 Go 스크립트는 외부 의존성 추가 없이 stdlib만 사용합니다.
4. 결과 디렉터리(`recon/`, `targets/`, `reports/`, `wordlists/`)는 절대 커밋하지 않습니다.
5. 타깃 도메인은 스크립트에 하드코딩하지 않고 `config/targets.json`을 통해 주입합니다.
6. 헌팅 카테고리 추가 시 `scripts/hunt.go`의 `huntTypes` 슬라이스와 `Makefile`의 `hunt-*` 타깃을 함께 갱신합니다.

## 책임 있는 사용 / Responsible Use

- 이 키트는 운영자가 **사전에 정식 허가를 받은** 타깃에 대해서만 사용해야 합니다.
- 프로그램 범위(스코프)·rate limit·테스트 정책은 각 버그 바운티 프로그램의 규정을 따릅니다.
- 발견된 취약점은 비공개로 취급하고, [`notes/report-template.md`](notes/report-template.md)을 따라 책임감 있게 제보합니다.
- `config/targets.json`의 `scan.default_rate_limit`은 거절 시 빠르게 조정합니다.

## 운영자 / Maintainers

| Role | Contact |
|------|---------|
| Owner | jclee (`jclee941`) |
| Issues | GitHub Issues of this repository |
| Knowledge base | [`AGENTS.md`](AGENTS.md) |

## 추가 문서 / Further Documentation

| 문서 | 경로 | 용도 |
|------|------|------|
| 자동화 에이전트 지식 베이스 | [`AGENTS.md`](AGENTS.md) | 작업 위치·규약·안티패턴 요약 |
| 기여 가이드 | [`CONTRIBUTING.md`](CONTRIBUTING.md) | PR·이슈 규칙 |
| Phase 2 체크리스트 | [`notes/phase2-checklist.md`](notes/phase2-checklist.md) | 학습 단계 점검 |
| 리포트 템플릿 | [`notes/report-template.md`](notes/report-template.md) | 취약점 제보서 양식 |
| 취약점 스터디 | [`notes/vulnerability-study.md`](notes/vulnerability-study.md) | 카테고리별 학습 노트 |
| 타깃·알림 설정 | [`config/targets.json`](config/targets.json) | 정책 외부화 |
| 라이선스 | [`LICENSE`](LICENSE) | ISC 전문 |

## 라이선스 / License

이 프로젝트는 [`LICENSE`](LICENSE) 파일에 명시된 **ISC License** 하에 배포됩니다.