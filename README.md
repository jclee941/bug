# Bug Bounty Automation Toolkit / 버그 바운티 자동화 툴킷

> Go 기반 오케스트레이션으로 `subfinder` · `httpx` · `nuclei` · `waybackurls` 같은 외부 보안 도구를 래핑하고, Playwright 기반 격리 실습까지 함께 다루는 책임 있는 보안 연구용 자동화 툴킷입니다.
>
> A Go-orchestrated toolkit that wraps external security CLIs and pairs them with Playwright-driven lab exercises, intended for responsible security research and bug bounty programs only.

---

## 한눈에 보기 / At a Glance

이 저장소는 **설정 → 정찰 → 변경 모니터링 → 표적형 취약점 헌팅 → 실습(lab)** 까지 버그 바운티 1사이클을 단일 `Makefile`로 묶어둔 자동화 키트입니다. Go 스크립트는 표준 라이브러리만 사용하고 모든 외부 도구는 `os/exec`로 호출하며, Node.js + Playwright 스크립트 두 개는 격리된 실습 워크플로우를 담당합니다. 결과물은 타임스탬프가 붙은 디렉터리에 저장되며 `.gitignore` 처리되어 운영자 머신을 떠나지 않습니다.

This repository bundles the bug-bounty lifecycle — **setup → reconnaissance → change monitoring → targeted hunting → lab practice** — behind a single `Makefile`. The Go scripts depend only on the standard library and shell out to third-party tools via `os/exec`; a parallel pair of Node.js + Playwright scripts covers browser-based lab workflows. All artifacts land in timestamped, gitignored directories and never leave the operator's machine without an explicit forward step.

### Status / 운영 상태

| Area | State | 비고 |
|------|-------|------|
| Production readiness | Personal research toolkit — not a hosted service | 개인 연구용 키트, 호스팅 서비스 아님 |
| Go scripts | Stdlib-only, run via `go run scripts/*.go` | 외부 Go 모듈 없음 |
| Node scripts | `lab-runner.mjs` / `lab-solver.mjs` driven by Playwright | Playwright `^1.61.0` |
| External tooling | Wraps `subfinder`, `httpx`, `nuclei`, `waybackurls`, ... | 설치 책임은 운영자에게 있음 |
| Output scope | Local-only, gitignored | `recon/`, `targets/`, `reports/`, `wordlists/` |
| License | ISC (see `LICENSE`) | |

### Operator Flow / 운영 흐름 요약

1. `make setup` — 도구 확인 + SecLists 단어 목록 다운로드
2. `make recon TARGET=example.com` — 5단계 정찰 파이프라인 실행
3. `make monitor TARGET=example.com` — diff 기반 신규 자산/엔드포인트 탐지
4. `make hunt TARGET=example.com` — IDOR · SSRF 등 표적형 취약점 헌팅
5. `make hunt-idor` / `make hunt-ssrf` — 카테고리 단일 헌팅
6. `make full-scan TARGET=example.com` — recon + hunt 일괄 실행
7. Playwright 실습: `node scripts/lab-runner.mjs` / `node scripts/lab-solver.mjs`
8. 보고: `notes/report-template.md`로 결과 정리

---

## Purpose / 패키지 구성

### What this project does

- 정찰 자동화: 서브도메인 열거, 살아있는 호스트 확인, Wayback 수집, nuclei 템플릿 스캔을 한 번에 묶음
- 변경 모니터링: 이전 베이스라인 대비 신규 서브도메인 / 엔드포인트 / 노출면을 diff로 알림 (Discord 웹훅 옵션)
- 표적형 취약점 헌팅: IDOR, SSRF 등 카테고리별 점검 페이로드 실행
- 격리 실습: Playwright로 브라우저 기반 CTF/랩 워크플로우 재현
- 보고 지원: `notes/report-template.md`로 제출용 보고서 골격 제공

### Why it is useful

- 한 번에 호출 가능한 `Makefile` 진입점으로 도구 체이닝 학습 비용 절감
- 표준 라이브러리만 쓰는 Go 스크립트로 의존성 표면 최소화
- 결과물과 워드리스트가 모두 gitignore 처리되어 실수로 인한 데이터 노출 위험 감소
- 대상 도메인을 코드에 하드코딩하지 않고 `config/targets.json` 또는 `TARGET=` 인자로 주입

### Package Contents / 패키지 구성

| Path | Role | 비고 |
|------|------|------|
| `Makefile` | 단일 진입점 (orchestration) | `make help`로 전체 명령 확인 |
| `scripts/setup.go` | 도구 검증 + 단어 목록 다운로드 | 1회성 부트스트랩 |
| `scripts/recon.go` | 5단계 정찰 파이프라인 | `-skip-nuclei` 옵션 지원 |
| `scripts/monitor.go` | diff 기반 변경 모니터링 + crt.sh + Discord 알림 | 베이스라인 비교 |
| `scripts/hunt.go` | 4단계 표적형 취약점 헌팅 | `-type idor|ssrf` 등 카테고리 선택 |
| `scripts/lab-runner.mjs` | Playwright 기반 실습 러너 | 격리된 환경 대상 |
| `scripts/lab-solver.mjs` | Playwright 기반 실습 솔버 | 격리된 환경 대상 |
| `config/targets.json` | 대상 / 알림 설정 | 대상 도메인, Discord 웹훅 등 |
| `notes/phase2-checklist.md` | 학습 체크리스트 | 진행 상황 추적용 |
| `notes/report-template.md` | 버그 보고서 템플릿 | 제출용 골격 |
| `notes/vulnerability-study.md` | 취약점 학습 노트 | 개인 학습 자료 |
| `AGENTS.md` | AI/자동화 에이전트용 지식 베이스 | 운영 규약 |
| `CONTRIBUTING.md` | 기여 가이드 | PR 규약 |
| `LICENSE` | ISC 라이선스 | |

---

## First Files to Read / 먼저 읽을 파일

| Order | File | Reason |
|-------|------|--------|
| 1 | `AGENTS.md` | 저장소 운영 규약과 디렉터리 의미를 가장 압축적으로 설명 |
| 2 | `Makefile` | 사용 가능한 모든 명령과 예시 확인 |
| 3 | `config/targets.json` | 대상 / 알림 채널 설정 방식 확인 |
| 4 | `notes/report-template.md` | 최종 산출물인 보고서 형태 사전 인지 |
| 5 | `scripts/setup.go` | 도구 사전 조건 확인 |

---

## API or Entry Points / 진입점

이 프로젝트는 라이브러리 API를 노출하지 않으며, 다음 인터페이스를 통해 호출됩니다.

### Make 타깃

| Target | Description | Required args |
|--------|-------------|---------------|
| `help` | 사용 가능한 명령과 예시 출력 | — |
| `setup` | 도구 확인 + 단어 목록 다운로드 | — |
| `recon` | 5단계 정찰 파이프라인 | `TARGET=` |
| `recon-fast` | nuclei 생략 정찰 | `TARGET=` |
| `monitor` | diff 기반 신규 자산 탐지 | `TARGET=` |
| `hunt` | 전 카테고리 취약점 헌팅 | `TARGET=` |
| `hunt-idor` | IDOR 전용 헌팅 | `TARGET=` |
| `hunt-ssrf` | SSRF 전용 헌팅 | `TARGET=` |
| `full-scan` | recon + hunt 일괄 실행 | `TARGET=` |
| `clean` | 스캔 결과 정리 | — |

### 스크립트 직접 호출

| Command | Purpose |
|---------|---------|
| `go run scripts/setup.go` | 부트스트랩 |
| `go run scripts/recon.go -d <domain> [-skip-nuclei]` | 정찰 |
| `go run scripts/monitor.go -d <domain>` | 모니터링 |
| `go run scripts/hunt.go -d <domain> [-type idor|ssrf]` | 헌팅 |
| `node scripts/lab-runner.mjs` | Playwright 실습 |
| `node scripts/lab-solver.mjs` | Playwright 실습 |

---

## Quickstart / 빠른 시작

### 1. 사전 준비

| Requirement | Notes |
|-------------|-------|
| Go (1.21+ 권장) | `go run`으로 직접 실행 |
| Node.js (LTS) | Playwright 스크립트용 |
| `subfinder`, `httpx`, `nuclei`, `waybackurls` 등 | `make setup`이 존재 여부만 확인 |
| `git` | 결과물 gitignore 처리 |

### 2. 부트스트랩

```bash
git clone <repository-url> bug
cd bug
make setup
```

### 3. 첫 정찰

```bash
make recon TARGET=example.com
make hunt TARGET=example.com
make full-scan TARGET=example.com
```

### 4. 변경 모니터링

```bash
# 첫 실행은 베이스라인 생성
make monitor TARGET=example.com
# 이후 실행은 diff + 알림
make monitor TARGET=example.com
```

### 5. 격리 실습

```bash
npm install
node scripts/lab-runner.mjs
node scripts/lab-solver.mjs
```

---

## Configuration / 설정

### `config/targets.json`

대상 도메인, 알림 채널, 카테고리별 옵션을 보관합니다. 스크립트에는 도메인을 하드코딩하지 않습니다.

| Key (예시) | Purpose |
|------------|---------|
| 도메인 엔트리 | 허용된 정찰 대상 화이트리스트 |
| `discord.webhook_url` | monitor 단계 신규 자산 알림용 (선택) |
| 카테고리별 옵션 | nuclei 템플릿, rate limit, 페이로드 경로 등 |

> `config/targets.json`은 예시 구조이며 실제 키 이름은 저장소의 현재 파일을 따릅니다.

### 환경 변수 / 플래그

| Flag | Default | Description |
|------|---------|-------------|
| `-d` / `TARGET=` | (필수) | 대상 도메인 |
| `-skip-nuclei` | false | recon 단계에서 nuclei 생략 |
| `-type` | (전체) | hunt 카테고리 (`idor`, `ssrf` 등) |
| nuclei rate limit | 100 req/s | `AGENTS.md` 규약 |

---

## Architecture / 아키텍처

### 요청 흐름 (Recon 예시)

| Step | Component | Action |
|------|-----------|--------|
| 1 | `Makefile` | `recon` 타깃이 `TARGET`을 검증 후 `go run scripts/recon.go -d <TARGET>` 호출 |
| 2 | `scripts/recon.go` | 5단계 파이프라인을 순차 실행 — 서브도메인 열거 → 호스트 확인 → URL 수집 → nuclei 스캔 → 보고서 후보 정리 |
| 3 | 외부 CLI | `subfinder`, `httpx`, `waybackurls`, `nuclei` 등이 `os/exec`로 호출됨 |
| 4 | 로컬 디스크 | 모든 산출물이 타임스탬프가 붙은 `recon/` 하위 디렉터리에 기록 |
| 5 | 운영자 | `notes/report-template.md`로 결과 검토 후 보고서 작성 |

### 컴포넌트 책임

| Component | Responsibility |
|-----------|----------------|
| `Makefile` | 인자 검증, 스크립트 디스패치, 도움말 |
| `scripts/setup.go` | 도구 가용성 확인, SecLists 단어 목록 다운로드 |
| `scripts/recon.go` | 5단계 정찰 오케스트레이션 |
| `scripts/monitor.go` | 베이스라인 대비 diff 계산, crt.sh 조회, 알림 발송 |
| `scripts/hunt.go` | 카테고리별 페이로드/체크리스트 실행 (`huntTypes` 슬라이스로 확장) |
| `scripts/lab-*.mjs` | Playwright 기반 격리 실습 |
| `config/targets.json` | 대상 / 알림 설정의 단일 진실 공급원 |

### 디렉터리 레이아웃

| Path | Visibility | Purpose |
|------|------------|---------|
| `recon/` | gitignored | 스캔 결과 (타임스탬프별) |
| `targets/` | gitignored | 대상별 베이스라인 |
| `reports/` | gitignored | 제출된 보고서 |
| `wordlists/` | gitignored | 다운로드된 SecLists |

---

## Commands Reference / 명령 레퍼런스

전체 명령은 항상 다음으로 확인하세요.

```bash
make help
```

자주 쓰는 명령은 위 [Quickstart](#quickstart--빠른-시작)와 [API or Entry Points](#api-or-entry-points--진입점) 표를 참조하세요.

---

## Local Development / 로컬 개발

| Task | How |
|------|-----|
| 스크립트 수정 | `scripts/*.go`는 표준 라이브러리만 사용 — `go build` 없이 `go run`으로 검증 |
| 새 헌팅 카테고리 추가 | `scripts/hunt.go`의 `huntTypes` 슬라이스와 `make hunt-*` 타깃을 함께 추가 |
| nuclei 설정 변경 | 각 스크립트 상단의 플래그 기본값 수정 |
| 정찰 파이프라인 변경 | `scripts/recon.go`의 단계별 함수 수정 |
| 실습 워크플로우 추가 | `scripts/lab-runner.mjs` / `scripts/lab-solver.mjs`에 Playwright 시나리오 추가 |

### 코딩 컨벤션 (AGENTS.md 기준)

- 모든 스크립트는 단일 파일 standalone Go — `go.mod` 없음
- Go 스크립트는 표준 라이브러리만 사용 (외부 의존성 금지)
- 외부 도구는 `os/exec` CLI 래퍼로만 호출
- 결과는 타임스탬프가 붙은 디렉터리에 저장
- 민감 스캔 데이터는 모두 gitignore

### 안티 패턴

- 스캔 결과 커밋 금지 (`recon/`, `targets/`, `reports/`)
- 스크립트에 대상 도메인 하드코딩 금지
- 명시적 프로그램 권한 없는 스캔 금지
- 기본 rate limit(100 req/s)을 임의로 초과 금지

---

## Testing / 테스트

| Layer | Approach | Notes |
|-------|----------|-------|
| Go 스크립트 | `go run scripts/<name>.go -h`로 플래그 동작 확인 | 통합 테스트 위주 |
| Node 실습 | 격리된 lab 환경에서 `node scripts/lab-*.mjs` 수동 실행 | 자동화보다 재현성 우선 |
| Makefile | `make help`로 명령 노출 확인, `make setup` dry-run | dry-run 모드는 스크립트 구현에 따름 |

> 저장소에 자동화된 단위 테스트 스위트는 포함되어 있지 않습니다. 새 카테고리/스텝을 추가할 때는 격리된 lab에서 수동 검증 후 PR을 보내주세요.

---

## Contribution Guide / 기여 가이드

1. `CONTRIBUTING.md`의 규약을 우선 확인
2. `AGENTS.md`의 코딩 컨벤션 준수 (stdlib-only Go, `os/exec` 래퍼, gitignore 규약)
3. 대상 도메인 / 스캔 결과를 어떤 형태로도 커밋하지 않기
4. 새 명령을 추가하면 `Makefile`의 `##` 설명 라인과 `make help` 출력이 함께 갱신되도록 유지
5. PR 전 `make help`로 명령 노출 상태 재확인

---

## Security & Ethics / 보안과 윤리

- 이 툴킷은 **책임 있는 보안 연구와 자신이 권한을 받은 버그 바운티 프로그램 전용**입니다
- 명시적 허가 없이 임의의 대상을 스캔하지 마세요
- rate limit과 스코프를 항상 존중하세요
- 발견한 취약점은 공개 전 비공개로 보고하고, 조정된 공개 일정을 따르세요

---

## Maintainers / Points of Contact

| Role | Contact | Notes |
|------|---------|-------|
| Maintainer | `jclee941` (GitHub) | `package.json` `repository` 필드 기준 |
| Issues | 저장소 Issues 트래커 | 버그 리포트 / 기능 요청 |
| Internal knowledge | `AGENTS.md` | 저장소 규약 단일 진실 공급원 |

---

## Further Documentation / 추가 문서

| Document | Purpose |
|----------|---------|
| `AGENTS.md` | 저장소 운영 규약, 디렉터리 의미, 안티 패턴 |
| `CONTRIBUTING.md` | PR / 기여 절차 |
| `notes/phase2-checklist.md` | 학습 단계별 체크리스트 |
| `notes/report-template.md` | 버그 보고서 템플릿 |
| `notes/vulnerability-study.md` | 취약점별 학습 노트 |
| `LICENSE` | ISC 라이선스 전문 |

---

## License / 라이선스

ISC License — 자세한 내용은 [`LICENSE`](./LICENSE)를 참조하세요.