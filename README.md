# Bug Bounty Automation Toolkit / 버그 바운티 자동화 툴킷

> 책임 있는 보안 연구와 버그 바운티 프로그램을 위한 개인용 자동화 키트 — Go 스크립트가 외부 보안 CLI를 오케스트레이션하고, Playwright 기반 격리 실습 워크플로우와 함께 동작합니다.
>
> A personal automation kit for responsible security research and bug bounty programs — Go scripts orchestrate third-party security CLIs and pair with Playwright-driven isolated lab workflows.

---

## 한눈에 보기 / At a Glance

이 저장소는 버그 바운티 1사이클(`setup → recon → monitor → hunt → lab`)을 단일 `Makefile`로 묶어 둔 개인 연구용 자동화 키트입니다. Go 스크립트는 표준 라이브러리만 사용하고 모든 외부 도구는 `os/exec`로 호출하며, 두 개의 Node.js + Playwright 스크립트(`lab-runner.mjs`, `lab-solver.mjs`)는 격리된 브라우저 기반 실습 워크플로우를 담당합니다. 결과물은 타임스탬프가 붙은 로컬 디렉터리에 저장되며 `.gitignore` 처리되어 운영자 머신을 자동으로 떠나지 않습니다.

This repository bundles a single bug-bounty cycle — `setup → recon → monitor → hunt → lab` — behind one `Makefile` for personal security research. The Go scripts depend only on the standard library and shell out to third-party CLIs via `os/exec`; the Node.js + Playwright pair (`lab-runner.mjs`, `lab-solver.mjs`) covers isolated browser-based lab workflows. All artifacts land in timestamped, gitignored directories and never leave the operator's machine without an explicit forward step.

## 운영 상태 / Status

| Area | State | 비고 / Notes |
|------|-------|--------------|
| Production readiness | Personal research toolkit — not a hosted service | 개인 연구용 키트, 호스팅 서비스 아님 |
| Go scripts | Stdlib-only, run via `go run scripts/*.go` | 외부 Go 모듈 없음, `go.mod` 불필요 |
| Node scripts | `lab-runner.mjs`, `lab-solver.mjs` driven by Playwright `^1.61.0` | 격리 실습 워크플로우 전담 |
| External tooling | Wraps `subfinder`, `httpx`, `nuclei`, `waybackurls`, `nuclei-templates`, `SecLists` | 설치 책임은 운영자에게 있음 |
| Output scope | Local-only, gitignored | `recon/`, `targets/`, `reports/`, `wordlists/` |
| Notifications | Discord webhook (opt-in via `config/targets.json`) | 모니터링 diff 발생 시 |
| Default rate limit | `100 req/s` for nuclei | 스크립트별 플래그로 조정 가능 |
| License | ISC (see [`LICENSE`](LICENSE)) | |
| Maintenance | Single-owner personal project | 이슈/PR 응답 SLA 없음 |

## 운영 흐름 요약 / Operator Flow

| Phase | 명령 / Command | 입력 / Input | 산출물 / Output |
|-------|----------------|--------------|-----------------|
| 1. Setup | `make setup` | (none) | 도구 검증, `wordlists/` 시드 |
| 2. Recon | `make recon TARGET=domain.com` | 도메인 | 타임스탬프 디렉터리, nuclei 결과 |
| 3. Monitor | `make monitor TARGET=domain.com` | 도메인 | diff 리포트, Discord 알림 (옵션) |
| 4. Hunt | `make hunt TARGET=domain.com` | 도메인 | 카테고리별 취약점 보고서 |
| 5. Lab | `node scripts/lab-runner.mjs` | lab 정의 | 격리 브라우저 세션 |
| 6. Cleanup | `make clean` | (none) | `recon/`, `targets/` 정리 |

**핵심 운영 원칙 / Operating principles**

- 모든 스크립트는 `go run scripts/<name>.go -d <target>` 형태로 단독 실행 가능합니다.
- 모든 스캔은 명시적 프로그램 권한 하에서만 실행해야 합니다.
- 결과물은 운영자 머신을 떠나지 않으며, 외부 공유는 의식적인 `cp` / 수동 업로드 단계로 분리되어 있습니다.
- Node.js 스크립트는 격리된 실습 워크플로우 전용이며 실 대상 스캔에 관여하지 않습니다.

---

## Features / 기능

| Capability | 구현 위치 / Location | 설명 |
|------------|----------------------|------|
| 도구 검증 + 워드리스트 다운로드 | `scripts/setup.go` | `subfinder`, `httpx`, `nuclei`, `waybackurls` 존재 확인 및 SecLists 초기화 |
| 5단계 recon 파이프라인 | `scripts/recon.go` | 서브도메인 → 라이브 호스트 → URL 수집 → nuclei 스캔 → 보고 |
| Diff 모니터링 + crt.sh + Discord 알림 | `scripts/monitor.go` | 신규 서브도메인/엔드포인트 발견 시 변경분만 보고 |
| 4단계 타깃형 취약점 헌팅 | `scripts/hunt.go` | IDOR, SSRF 등 카테고리별 오케스트레이션 |
| 격리 브라우저 실습 워크플로우 | `scripts/lab-runner.mjs`, `scripts/lab-solver.mjs` | Playwright 기반 단계별 실습 실행 |
| 단일 진입점 | `Makefile` | `make help`로 전체 명령 조회 |
| 타깃/알림 설정 | `config/targets.json` | JSON 기반 운영자 설정 |
| 보고서 템플릿 | `notes/report-template.md` | 버그 리포트 표준 양식 |
| 학습 체크리스트 | `notes/phase2-checklist.md` | 단계별 학습 진행 추적 |

---

## Architecture / 아키텍처

### 컴포넌트 구성 / Component layout

| Layer | 책임 / Responsibility | Files |
|-------|----------------------|-------|
| Operator interface | 단일 진입 명령 표면 | `Makefile` |
| Go orchestration | 외부 CLI 호출 + 결과 수집 + 타임스탬프 디렉터리 관리 | `scripts/setup.go`, `scripts/recon.go`, `scripts/monitor.go`, `scripts/hunt.go` |
| Node lab runtime | 격리 브라우저 세션, 단계별 워크플로우 실행 | `scripts/lab-runner.mjs`, `scripts/lab-solver.mjs` |
| Config | 타깃 / 알림 정책 | `config/targets.json` |
| Notes | 절차, 보고서, 학습 진척 | `notes/*.md` |
| Artifacts (gitignored) | 스캔 산출물, 베이스라인, 제출 보고서 | `recon/`, `targets/`, `reports/`, `wordlists/` |

### 데이터 흐름 / Request flow

1. 운영자가 `make <phase> TARGET=<domain>`을 호출합니다.
2. `Makefile`이 `go run scripts/<phase>.go -d <domain>` 형태로 위임합니다.
3. Go 스크립트가 `config/targets.json`을 읽어 타깃별 옵션(알림, 워드리스트 경로 등)을 병합합니다.
4. 각 단계의 Go 함수가 `os/exec`로 외부 CLI를 호출하고 stdout/stderr를 캡처합니다.
5. 결과는 `recon/<domain>/<timestamp>/` 하위에 카테고리별 파일로 저장됩니다.
6. `monitor` 단계는 이전 베이스라인(`targets/<domain>.json`)과 diff 후 신규 항목만 Discord 웹훅으로 전송합니다.
7. `hunt` 단계는 `notes/report-template.md`를 인스턴스화하여 `reports/`에 초안을 남깁니다.
8. 실습 단계는 별도로 `node scripts/lab-runner.mjs`로 호출되며 외부 스캔과 격리되어 동작합니다.

### 디렉터리 정책 / Directory policy

| Path | 형상관리 / VCS | 목적 / Purpose |
|------|----------------|----------------|
| `scripts/`, `config/`, `notes/`, `Makefile`, `package.json`, `LICENSE` | 추적됨 / tracked | 코드, 설정, 문서 |
| `recon/`, `targets/`, `reports/`, `wordlists/` | 무시됨 / gitignored | 운영자 산출물, 외부 공유 금지 |

---

## Repository Layout / 저장소 구조

```
.
├── AGENTS.md                 # 내부 지식 베이스 (기여자/에이전트용)
├── CONTRIBUTING.md           # 기여 절차
├── LICENSE                   # ISC
├── Makefile                  # 오케스트레이션 진입점
├── package.json              # Playwright 의존성 (lab 워크플로우용)
├── package-lock.json
├── config/
│   └── targets.json          # 타깃/알림 설정
├── scripts/
│   ├── hunt.go               # 4단계 타깃형 취약점 헌팅
│   ├── lab-runner.mjs        # Playwright 실습 러너
│   ├── lab-solver.mjs        # Playwright 실습 솔버
│   ├── monitor.go            # diff 모니터링 + crt.sh + Discord
│   ├── recon.go              # 5단계 recon 파이프라인
│   └── setup.go              # 도구 검증 + 워드리스트 다운로드
└── notes/
    ├── phase2-checklist.md   # 학습 체크리스트
    ├── report-template.md    # 버그 리포트 템플릿
    └── vulnerability-study.md
```

> 위 트리는 본 저장소의 실제 최상위 레이아웃만 반영합니다. `recon/`, `targets/`, `reports/`, `wordlists/`는 `.gitignore` 대상이며 초기 클론에는 존재하지 않습니다.

---

## Quickstart / 빠른 시작

### 사전 요구 사항 / Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| Go | 1.21+ | `go run`으로 stdlib 스크립트 실행 |
| Node.js | 18+ | Playwright lab 워크플로우 |
| `subfinder` | latest | 서브도메인 열거 |
| `httpx` | latest | 라이브 호스트 프로브 |
| `nuclei` | latest | 템플릿 기반 스캔 |
| `waybackurls` | latest | 히스토리컬 URL 수집 |
| `nuclei-templates` | latest | nuclei 템플릿셋 |
| `jq` | latest | `config/targets.json` 가공 (선택) |
| `curl` | latest | webhook 호출 (선택) |

### 설치 / Install

```bash
git clone <repo-url> bug
cd bug
make setup
```

`make setup`은 외부 CLI 존재 여부를 확인하고 `wordlists/`에 SecLists를 시드합니다. 외부 도구 설치는 운영자 책임입니다.

### 첫 스캔 / First scan

```bash
# 1) 권한 있는 타깃 설정
$EDITOR config/targets.json

# 2) 전체 recon
make recon TARGET=example.com

# 3) 취약점 헌팅
make hunt TARGET=example.com

# 4) 베이스라인 + 모니터링 (이후 변경분만 보고)
make monitor TARGET=example.com
```

### 실습 워크플로우 / Lab workflow

```bash
npm install
node scripts/lab-runner.mjs
# 또는
node scripts/lab-solver.mjs
```

lab 스크립트는 격리된 Playwright 브라우저 컨텍스트에서 단계별 과제를 실행하며, 실 대상 스캔과 분리되어 있습니다.

---

## Commands Reference / 명령 레퍼런스

`make help`로 항상 최신 목록을 조회할 수 있습니다. 아래는 Makefile이 노출하는 표면의 정적 정리입니다.

| Command | Required | Description |
|---------|----------|-------------|
| `make help` | — | 사용 가능한 명령과 예시 출력 |
| `make setup` | — | 도구 검증 + `wordlists/` 시드 |
| `make recon TARGET=<domain>` | yes | 5단계 recon 파이프라인 |
| `make recon-fast TARGET=<domain>` | yes | nuclei 단계를 건너뛴 빠른 recon |
| `make monitor TARGET=<domain>` | yes | 베이스라인 대비 diff 보고, Discord 알림 |
| `make hunt TARGET=<domain>` | yes | 모든 카테고리 취약점 헌팅 |
| `make hunt-idor TARGET=<domain>` | yes | IDOR 카테고리만 헌팅 |
| `make hunt-ssrf TARGET=<domain>` | yes | SSRF 카테고리만 헌팅 |
| `make full-scan TARGET=<domain>` | yes | recon + hunt 결합 |
| `make clean` | — | `recon/`, `targets/` 산출물 정리 |

### 스크립트 직접 호출 / Direct invocation

`Makefile` 우회가 필요할 때 동일한 Go 스크립트를 직접 호출할 수 있습니다.

```bash
go run scripts/setup.go
go run scripts/recon.go -d example.com
go run scripts/recon.go -d example.com -skip-nuclei
go run scripts/monitor.go -d example.com
go run scripts/hunt.go -d example.com
go run scripts/hunt.go -d example.com -type idor
go run scripts/hunt.go -d example.com -type ssrf
```

> 모든 Go 스크립트는 `go.mod` 없이 `go run`으로 실행되도록 설계되어 있습니다. 운영자가 별도 모듈을 도입하지 마십시오.

---

## Configuration / 설정

### `config/targets.json`

| Field | Type | Description |
|-------|------|-------------|
| `<target>.webhook` | string \| null | Discord webhook URL. `null`이면 알림 비활성 |
| `<target>.wordlist` | string | SecLists 하위 경로 (기본: `Discovery/Web-Content/raft-medium-directories.txt`) |
| `<target>.rateLimit` | number | nuclei 초당 요청 수 (기본: `100`) |
| `<target>.notes` | string | 운영자 메모, 자유 형식 |

`config/targets.json`은 단일 파일에 다수 타깃을 적을 수 있도록 객체 맵 구조를 사용합니다. 키는 도메인 문자열입니다.

### 핵 플래그 / Per-script flags

| Script | Flag | Default | 의미 |
|--------|------|---------|------|
| `recon.go` | `-d` | (required) | 타깃 도메인 |
| `recon.go` | `-skip-nuclei` | `false` | nuclei 단계 생략 |
| `hunt.go` | `-d` | (required) | 타깃 도메인 |
| `hunt.go` | `-type` | (all) | `huntTypes` 슬라이스의 카테고리 키 |
| `monitor.go` | `-d` | (required) | 타깃 도메인 |

### 헌팅 카테고리 추가 / Adding hunt categories

`scripts/hunt.go`의 `huntTypes` 슬라이스에 새 카테고리 키를 추가하고 동일 파일 내에 해당 키를 처리하는 함수를 작성합니다. 별도 의존성 추가는 권장하지 않습니다.

---

## Output Structure / 산출물 구조

| Path | 내용 / Contents |
|------|------------------|
| `recon/<domain>/<timestamp>/subdomains.txt` | 서브도메인 열거 결과 |
| `recon/<domain>/<timestamp>/live-hosts.txt` | httpx 프로브 결과 |
| `recon/<domain>/<timestamp>/urls.txt` | waybackurls 결과 |
| `recon/<domain>/<timestamp>/nuclei.txt` | nuclei 출력 (rate limit 적용) |
| `targets/<domain>.json` | 모니터링 베이스라인 |
| `reports/<domain>/<date>.md` | `report-template.md`에서 생성된 초안 |
| `wordlists/` | SecLists 캐시 |

모든 경로는 `.gitignore` 대상입니다.

---

## Local Development / 로컬 개발

### Go 스크립트 수정 / Editing Go scripts

```bash
# 단일 스크립트 빠른 실행
go run scripts/recon.go -d example.com

# 변경 후 dry run
go vet scripts/
```

Go 표준 라이브러리만 사용한다는 규칙은 의도적입니다. `go.mod` 도입, 외부 모듈 추가는 키트의 휴대성을 깨므로 금지합니다.

### Node lab 스크립트 수정 / Editing lab scripts

```bash
npm install
node scripts/lab-runner.mjs --help    # 옵션 확인
```

`package.json`의 `playwright`는 lab 워크플로우의 유일한 런타임 의존성입니다.

### 코드 컨벤션 / Conventions

- 각 Go 스크립트는 단독 실행 가능해야 합니다.
- 외부 도구 호출은 반드시 `os/exec` 경유이며 직접 시스템 호출을 회피합니다.
- 타깃 도메인은 스크립트에 하드코딩하지 않고 플래그 또는 `config/targets.json`을 경유합니다.
- 산출물 디렉터리는 항상 타임스탬프를 포함합니다.

### 안티패턴 / Anti-patterns

- 스캔 결과물(`recon/`, `targets/`, `reports/`)을 커밋하지 마십시오.
- 권한 없는 타깃에 스캔을 실행하지 마십시오.
- nuclei 기본 rate limit(`100 req/s`)을 무차별적으로 초과하지 마십시오.
- 운영자 머신을 떠나는 자동 전송 경로를 추가하지 마십시오.

---

## Testing / 테스트

이 저장소는 외부 보안 도구의 오케스트레이터이며 단위 테스트는 의도적으로 포함되어 있지 않습니다(`package.json`의 `test` 스크립트는 자리표시자입니다). 회귀 검증은 다음 절차로 대체합니다.

| Layer | 검증 절차 / Procedure |
|-------|-----------------------|
| `setup.go` | `make setup`을 더미 호스트에서 실행해 모든 외부 CLI가 검출되는지 확인 |
| `recon.go` | 권한 있는 스테이징 도메인에서 `make recon-fast`로 nuclei 제외 구간 검증 |
| `monitor.go` | 동일 타깃에 두 번 실행 후 diff가 안정화되는지 확인 |
| `hunt.go` | 카테고리별(`-type idor`, `-type ssrf`)로 1회 실행해 보고서 생성 경로 확인 |
| lab 스크립트 | 격리된 lab 환경에서 `node scripts/lab-runner.mjs` 수동 검증 |

자동화된 CI는 호스팅되지 않으며, 모든 검증은 운영자 머신에서 수동으로 수행합니다.

---

## Contribution Guide / 기여 절차

기여 절차는 [`CONTRIBUTING.md`](CONTRIBUTING.md)에 정리되어 있습니다. 핵심 규칙은 다음과 같습니다.

| Rule | 설명 |
|------|------|
| Scope | Go 스크립트는 stdlib만 사용 |
| Scope | 외부 의존성 추가는 거부됨 |
| Hygiene | 스캔 결과/타깃 베이스라인은 절대 커밋 금지 |
| Authorization | PR에 첨부되는 모든 PoC는 명시적 권한 하에서 수집된 것이어야 함 |
| Style | 커밋 메시지는 한국어/영문 혼용 가능, 명령형 |

PR 제출 전 `make clean`으로 로컬 산출물을 제거하고 `AGENTS.md`의 컨벤션 섹션과 일치하는지 확인하십시오.

---

## Maintainer & Contact / 유지보수자 및 연락처

| Role | Name | Contact |
|------|------|---------|
| Owner | jclee | <https://github.com/jclee941/bug/issues> |

이 저장소는 개인 연구 프로젝트이며, 이슈 응답 SLA는 없습니다. 보안 취약점 보고는 공개 이슈 대신 `config/targets.json` 운영 절차에 명시된 채널을 우선 사용하십시오.

---

## Further Documentation / 추가 문서

| 문서 / Doc | 위치 / Path | 용도 / Use |
|------------|-------------|------------|
| 내부 지식 베이스 | [`AGENTS.md`](AGENTS.md) | 구조 / 위치 / 컨벤션 요약 |
| 기여 절차 | [`CONTRIBUTING.md`](CONTRIBUTING.md) | PR / 리뷰 규칙 |
| 2단계 학습 체크리스트 | [`notes/phase2-checklist.md`](notes/phase2-checklist.md) | 학습 진척 |
| 버그 리포트 템플릿 | [`notes/report-template.md`](notes/report-template.md) | 제출용 보고서 양식 |
| 취약점 스터디 노트 | [`notes/vulnerability-study.md`](notes/vulnerability-study.md) | 카테고리별 메모 |

---

## License / 라이선스

본 저장소는 [ISC License](LICENSE) 하에 배포됩니다. 타깃 스캔 및 취약점 연구는 관련 법규와 대상 프로그램의 규약을 준수하여 수행되어야 합니다.