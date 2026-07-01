# Bug Bounty Automation Toolkit / 버그 바운티 자동화 툴킷

> 책임 있는 보안 연구와 버그 바운티 프로그램을 위한 개인용 자동화 키트 — Go 스크립트가 외부 보안 CLI를 오케스트레이션하고, Playwright 기반 격리 실습 워크플로우와 함께 동작합니다.
>
> A personal automation kit for responsible security research and bug bounty programs — Go scripts orchestrate third-party security CLIs and pair with Playwright-driven isolated lab workflows.

[![Status: Personal Research](https://img.shields.io/badge/status-personal%20research-blue)](#운영-상태--status)
[![Go Scripts: Stdlib-only](https://img.shields.io/badge/go-stdlib--only-00ADD8)](#구성요소--package-contents)
[![Node: Playwright](https://img.shields.io/badge/node-playwright%201.61-339933)](#구성요소--package-contents)
[![License: ISC](https://img.shields.io/badge/license-ISC-green)](LICENSE)
[![Repo: local-only](https://img.shields.io/badge/outputs-local--only-lightgrey)](#운영-상태--status)

---

## 한눈에 보기 / At a Glance

이 저장소는 버그 바운티 1사이클(`setup → recon → monitor → hunt → lab`)을 단일 `Makefile`로 묶어 둔 개인 연구용 자동화 키트입니다. Go 스크립트는 표준 라이브러리만 사용하고 모든 외부 도구는 `os/exec`로 호출하며, 두 개의 Node.js + Playwright 스크립트(`lab-runner.mjs`, `lab-solver.mjs`)는 격리된 브라우저 기반 실습 워크플로우를 담당합니다. 결과물은 타임스탬프가 붙은 로컬 디렉터리에 저장되며 `.gitignore` 처리되어 운영자 머신을 자동으로 떠나지 않습니다.

This repository bundles a single bug-bounty cycle — `setup → recon → monitor → hunt → lab` — behind one `Makefile` for personal security research. Go scripts depend only on the standard library and shell out to third-party CLIs via `os/exec`; the Node.js + Playwright pair (`lab-runner.mjs`, `lab-solver.mjs`) covers isolated browser-based lab workflows. All artifacts land in timestamped, gitignored directories and never leave the operator's machine without an explicit forward step.

---

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
| Approval gate | Operator must hold written program authorization | 허용된 범위 내에서만 실행 |

---

## 운영 흐름 요약 / Operator Flow

| Phase | Command | Entrypoint | Outputs |
|-------|---------|-----------|---------|
| 1. Setup | `make setup` | `scripts/setup.go` | `wordlists/`, tool verification report |
| 2. Recon | `make recon TARGET=domain.com` | `scripts/recon.go` | `recon/<timestamp>/` — 5-phase recon artifacts |
| 3. Monitor | `make monitor TARGET=domain.com` | `scripts/monitor.go` | `targets/<domain>/baseline.json`, diff log |
| 4. Hunt | `make hunt TARGET=domain.com` | `scripts/hunt.go` | `recon/<timestamp>/hunt/` — finding candidates |
| 5. Lab | `node scripts/lab-runner.mjs` / `lab-solver.mjs` | node + Playwright | Browser session, isolated exercises |
| Combine | `make full-scan TARGET=domain.com` | recon + hunt | Both artifact trees |
| Cleanup | `make clean` | local rm | Clears `recon/`, `targets/`, `reports/` |

---

## 구성요소 / Package Contents

### 최상위 구조 / Top-level layout

| Path | Purpose |
|------|---------|
| `Makefile` | 단일 진입점 — 모든 단계를 `make <target>`으로 노출 |
| `package.json` | Playwright 의존성 선언 + npm 스크립트 슬롯 |
| `config/targets.json` | 대상 목록, 알림 채널, 플래그 |
| `scripts/setup.go` | 외부 도구 검증 + wordlist 다운로드 |
| `scripts/recon.go` | 5단계 정찰 파이프라인 |
| `scripts/monitor.go` | diff 모니터링 + crt.sh + Discord 알림 |
| `scripts/hunt.go` | 4단계 표적 취약점 헌팅 |
| `scripts/lab-runner.mjs` | Playwright 기반 격리 실습 러너 |
| `scripts/lab-solver.mjs` | Playwright 기반 격리 실습 솔버 |
| `scripts/monitor.go` 외 Go | 모두 `go run` 단일 파일 실행, `go.mod` 없음 |
| `notes/phase2-checklist.md` | 학습 체크리스트 |
| `notes/report-template.md` | 버그 리포트 템플릿 |
| `notes/vulnerability-study.md` | 취약점 학습 노트 |
| `LICENSE` | ISC 라이선스 전문 |

### 스크립트 책임 / Script responsibilities

| Script | Phase | Key flags (default) |
|--------|-------|---------------------|
| `setup.go` | Setup | (no flag) — verifies binaries, downloads `SecLists` |
| `recon.go` | Recon | `-d <domain>` (req), `-skip-nuclei` (off) |
| `monitor.go` | Monitor | `-d <domain>` (req) — diffs `targets/<domain>/baseline.json` |
| `hunt.go` | Hunt | `-d <domain>` (req), `-type idor|ssrf|<other>` |
| `lab-runner.mjs` | Lab | Node CLI args, Playwright `chromium` |
| `lab-solver.mjs` | Lab | Node CLI args, Playwright `chromium` |

### 산출물 디렉터리 / Artifact directories (gitignored)

| Directory | Producer | Content |
|-----------|----------|---------|
| `recon/` | `recon.go`, `hunt.go` | 타임스탬프 스캔 결과 |
| `targets/` | `monitor.go` | 도메인별 baseline + diff |
| `reports/` | 운영자 작성 | 제출한 리포트 사본 |
| `wordlists/` | `setup.go` | SecLists, nuclei-templates 다운로드본 |

---

## 진입점 및 API / Entry Points and Extensibility

| Surface | How to call | Notes |
|---------|-------------|-------|
| CLI orchestrator | `make help` | 모든 명령 + 사용 예시 출력 |
| Single-target recon | `make recon TARGET=domain.com` | `recon.go -d <domain>` |
| Fast recon | `make recon-fast TARGET=domain.com` | nuclei 단계 생략 |
| Change monitor | `make monitor TARGET=domain.com` | baseline diff + 선택적 Discord 알림 |
| Broad hunt | `make hunt TARGET=domain.com` | `hunt.go` 전체 카테고리 |
| Focused hunt | `make hunt-idor TARGET=domain.com`, `make hunt-ssrf TARGET=domain.com` | 단일 카테고리 |
| Combined run | `make full-scan TARGET=domain.com` | recon + hunt 직렬 |
| Lab exercise | `node scripts/lab-runner.mjs` / `lab-solver.mjs` | 격리 브라우저 세션 |
| Cleanup | `make clean` | 결과물만 삭제, 코드 보존 |

확장 지점 / Extension points:

| Goal | Edit here |
|------|-----------|
| 새 헌팅 카테고리 추가 | `scripts/hunt.go` → `huntTypes` slice |
| 정찰 단계 변경 | `scripts/recon.go` 본문 단계 함수 |
| 알림 채널 변경 | `scripts/monitor.go` + `config/targets.json` |
| nuclei 레이트 제한 | 각 스크립트의 flag default |
| 새 타겟 등록 | `config/targets.json` |

---

## 빠른 시작 / Quickstart

| 단계 | 명령 | 설명 |
|------|------|------|
| 1 | `git clone <repo>` | 저장소 클론 |
| 2 | 사전 요구 도구 설치: Go 1.20+, Node.js 18+, `subfinder`, `httpx`, `nuclei`, `waybackurls`, `Discord webhook URL` (선택) | 운영자가 시스템에 직접 설치 |
| 3 | `npm install` | Playwright 브라우저 다운로드 |
| 4 | `make setup` | wordlist 다운로드, 도구 검증 |
| 5 | `make recon TARGET=<authorized-domain>` | 첫 정찰 실행 |
| 6 | `make hunt TARGET=<authorized-domain>` | 발견된 표면에 대해 헌팅 |
| 7 | `node scripts/lab-runner.mjs` | 격리 실습 워크플로우 |

**운영자가 직접 충족해야 할 사전 조건 / Prerequisites owned by the operator:**

- 프로그램을 관리하는 측의 **서면 허가** (모든 스캔은 허가된 범위 내에서만)
- Go 툴체인, Node.js, 위에서 명시한 보안 CLI의 로컬 설치
- Discord webhook URL (모니터링 알림을 원할 경우, `config/targets.json`에 설정)
- 결과물을 외부로 보내지 않을 로컬 디스크 용량

---

## 구성 / Configuration

`config/targets.json`은 두 가지 책임을 가집니다: 대상 도메인/스코프 선언, 알림 설정.

| Key | Purpose | Example |
|-----|---------|---------|
| `targets` | 운영자가 명시적으로 등록한 대상 배열 | `[{ "domain": "example.com", "scope": ["*.example.com"] }]` |
| `discord.webhook` | 모니터링 diff 알림용 webhook URL (선택) | 환경변수 또는 평문 |
| `discord.rate_limit` | 알림 폭주 방지 | 초당 메시지 수 |
| `defaults.rate_limit` | nuclei 기본 레이트 | 기본 `100 req/s` |

스크립트 flag로 시점별 override 가능 (Make 타겟의 `TARGET=` 외에 환경변수/CLI flag로 전달).

---

## 명령어 레퍼런스 / Commands Reference

| Make target | Underlying | Use case |
|-------------|------------|----------|
| `help` | print + grep self-doc | 명령 목록 확인 |
| `setup` | `go run scripts/setup.go` | 최초 1회 환경 구축 |
| `recon TARGET=x` | `go run scripts/recon.go -d x` | 전체 정찰 |
| `recon-fast TARGET=x` | `go run scripts/recon.go -d x -skip-nuclei` | 빠른 정찰 |
| `monitor TARGET=x` | `go run scripts/monitor.go -d x` | 신규 발견 추적 |
| `hunt TARGET=x` | `go run scripts/hunt.go -d x` | 전 카테고리 헌팅 |
| `hunt-idor TARGET=x` | `go run scripts/hunt.go -d x -type idor` | IDOR만 |
| `hunt-ssrf TARGET=x` | `go run scripts/hunt.go -d x -type ssrf` | SSRF만 |
| `full-scan TARGET=x` | recon + hunt 직렬 | 한 번에 다 돌리기 |
| `clean` | 로컬 rm | 결과물 정리 |

---

## 로컬 개발 / Local Development

| 작업 | 방법 |
|------|------|
| 단일 스크립트 직접 실행 | `go run scripts/recon.go -d example.com` |
| Node 스크립트 직접 실행 | `node scripts/lab-runner.mjs` |
| 의존성 갱신 | `npm install` (Playwright만) |
| go.mod 관리 | 불필요 — 단일 파일 stdlib-only 정책 |
| 새 단계 추가 | 기존 스크립트의 단계 함수에 hook 추가 |
| 문서 갱신 | [`notes/phase2-checklist.md`](notes/phase2-checklist.md), [`notes/report-template.md`](notes/report-template.md) |
| 결과물 검토 | `recon/<timestamp>/`, `targets/<domain>/` |

코딩 규칙 / Conventions:

- 모든 Go 스크립트는 단독 파일, 표준 라이브러리만 사용
- 외부 도구는 `os/exec`로 호출
- 결과물은 `recon/<timestamp>/` 트리에 보관
- 스캔 결과는 커밋 금지 — `recon/`, `targets/`, `reports/`, `wordlists/`는 gitignore
- 도메인을 코드에 하드코딩하지 말 것 — 모두 `config/targets.json` 또는 `TARGET=` 플래그로 주입

---

## 책임 있는 사용 / Responsible Use

보안 자동화 툴킷이므로 다음 규칙을 엄격히 지킵니다.

| 규칙 | 이유 |
|------|------|
| 서면 허가된 프로그램/스코프 내에서만 실행 | 미허가 스캔은 법·정책 위반 |
| 기본 `100 req/s` nuclei 레이트를 무작정 올리지 않음 | 표적 서비스 보호 |
| 결과물은 외부로 자동 송신하지 않음 — 명시적 forward step 필요 | 데이터 유출 방지 |
| 도메인을 코드에 하드코딩하지 않음 | 범위 외 타겟 회피 |
| 발견 시 [`notes/report-template.md`](notes/report-template.md)를 따라 책임 있게 보고 | 조정 가능한 공개 경로 선호 |
| 알림 채널은 운영자가 의도적으로 켬 | 모니터링 폭주 방지 |

---

## 테스트 / Testing

이 저장소는 **자동화된 테스트 스위트를 포함하지 않습니다** — `package.json`의 `test` 스크립트는 의도적으로 placeholder입니다.

| 항목 | 정책 |
|------|------|
| Unit tests | 없음 (외부 보안 CLI 오케스트레이션 + 정찰 도구 특성상 실 타겟/모의 환경 필요) |
| Integration tests | 운영자 로컬에서 `make full-scan TARGET=<lab-domain>`으로 수동 검증 |
| Test target | 로컬 실습 도메인 또는 명시 허가된 자체 자산 |
| CI/CD | 없음 — 개인 연구용 키트 |

새 단계 추가 시 의도적으로 모의 타겟에서 dry-run을 먼저 수행하세요.

---

## 기여 / Contributing

개인 연구용 키트이지만 개선 PR은 환영합니다.

| 단계 | 가이드 |
|------|--------|
| Fork + 브랜치 | `git checkout -b feat/<scope>` |
| 규칙 준수 | stdlib-only Go, 단일 파일 스크립트 유지 |
| 새 카테고리 | `scripts/hunt.go`의 `huntTypes` 슬라이스에 등록 + 문서 갱신 |
| 문서 갱신 | [`CONTRIBUTING.md`](CONTRIBUTING.md), [`AGENTS.md`](AGENTS.md) 검토 후 동기화 |
| 결과물 첨부 금지 | `recon/`, `targets/`, `reports/`, `wordlists/`는 커밋에서 제외 |

상세 정책: [`CONTRIBUTING.md`](CONTRIBUTING.md).

---

## 유지보수 / Maintainers

| Role | Note |
|------|------|
| Owner | 개인 운영자 — `jclee@dev/bug` 식별자 |
| Contact | 이 저장소 인슈어 트래커 |
| Response time | Best-effort, 개인 시간 기준 |
| Escalation | 없음 (호스팅 서비스 아님) |

---

## 추가 문서 / Further Documentation

| Topic | Document |
|-------|----------|
| 운영자 지식 베이스 | [`AGENTS.md`](AGENTS.md) |
| 기여 가이드 | [`CONTRIBUTING.md`](CONTRIBUTING.md) |
| 학습 체크리스트 | [`notes/phase2-checklist.md`](notes/phase2-checklist.md) |
| 리포트 템플릿 | [`notes/report-template.md`](notes/report-template.md) |
| 취약점 학습 노트 | [`notes/vulnerability-study.md`](notes/vulnerability-study.md) |
| 외부 도구 (운영자 설치) | Project pages of `subfinder`, `httpx`, `nuclei`, `waybackurls`, `SecLists` |

---

## 라이선스 / License

ISC — 전문: [`LICENSE`](LICENSE). 본 키트는 **허가된 보안 연구와 학습**을 목적으로 하며, 남용에 대한 책임은 운영자에게 있습니다.