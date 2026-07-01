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
| 1. Setup | `make setup` | 외부 도구 점검, wordlist 다운로드 | `wordlists/`, 환경 검증 결과 |
| 2. Recon | `make recon TARGET=example.com` | 5단계 recon 파이프라인 | `recon/<target>/<ts>/` |
| 3. Recon (fast) | `make recon-fast TARGET=example.com` | nuclei 스킵 빠른 recon | 동일 경로, nuclei 결과만 제외 |
| 4. Monitor | `make monitor TARGET=example.com` | 이전 baseline 대비 diff 감지 | `targets/<target>/baseline.json`, Discord 알림 |
| 5. Hunt | `make hunt TARGET=example.com` | 4단계 취약점 헌팅 | `recon/<target>/<ts>/hunt/` |
| 6. Hunt (IDOR) | `make hunt-idor TARGET=example.com` | IDOR 카테고리 단독 실행 | `hunt/idor/` |
| 7. Hunt (SSRF) | `make hunt-ssrf TARGET=example.com` | SSRF 카테고리 단독 실행 | `hunt/ssrf/` |
| 8. Full scan | `make full-scan TARGET=example.com` | recon + hunt 일괄 | 위 두 결과의 결합 |
| 9. Lab | `node scripts/lab-runner.mjs` | 격리된 브라우저 실습 | 로컬 Playwright 세션 |
| 10. Report | `notes/report-template.md` 채우기 | 제출용 보고서 초안 | `reports/<finding>.md` |
| 11. Clean | `make clean` | 로컬 결과물 정리 | `recon/`, `targets/`, `reports/` |

---

## 기능 / Features

- **단일 진입점 / Single entry point** — `Makefile` 한 파일로 setup / recon / monitor / hunt / full-scan 호출
- **Go 표준 라이브러리 전용 / Go stdlib only** — `scripts/*.go`는 외부 의존성이 없어 `go.mod` 없이 `go run`으로 바로 실행
- **외부 CLI 오케스트레이션 / CLI orchestration** — `subfinder`, `httpx`, `nuclei`, `waybackurls` 등을 `os/exec`로 호출
- **5단계 recon 파이프라인 / 5-phase recon** — subdomain enumeration → HTTP probing → URL discovery → template scan → archive mining
- **4단계 취약점 헌팅 / 4-phase hunt** — IDOR, SSRF, XSS, SQLi 등 카테고리별 모듈식 실행 (`huntTypes` 슬라이스)
- **Diff 모니터링 / Diff monitoring** — `crt.sh` + 이전 baseline 비교로 신규 subdomain / endpoint 감지
- **선택적 알림 / Optional notifications** — `config/targets.json`의 Discord webhook으로 신규 발견 알림
- **격리 실습 환경 / Isolated lab environment** — Playwright 기반 `lab-runner.mjs` / `lab-solver.mjs`로 안전한 워크플로우 훈련
- **로컬 우선 데이터 거버넌스 / Local-first data governance** — 모든 결과는 gitignored 디렉터리에 저장, 운영자가 명시적으로 옮기지 않는 한 외부 유출 없음
- **학습 자료 동봉 / Learning materials included** — `notes/phase2-checklist.md`, `vulnerability-study.md`, `report-template.md`

## 대상 사용자 / Intended Audience

| 사용자 | 사용 시나리오 |
|--------|--------------|
| 개인 버그 바운티 헌터 | 자신의 책임 범위 내에서 recon → hunt 사이클 자동화 |
| 보안 학습자 | `notes/phase2-checklist.md`로 단계별 학습, lab 스크립트로 격리 실습 |
| 레드팀 개인 연구원 | 외부 프로그램 허가 범위 내 표적에 대한 점검 자동화 |

> ⚠️ **책임 있는 사용 / Responsible use** — 본 키트는 **명시적 허가 범위 안에서만** 사용해야 합니다. 허가 없는 대상을 스캔하는 행위는 관련 법규(컴퓨터 프로그램 보호법, CFAA 등) 위반에 해당할 수 있습니다.

---

## 패키지 구성 / Package Contents

| Path | Type | Role |
|------|------|------|
| `Makefile` | Build orchestration | 운영 명령의 단일 진입점, `make help`로 목록 확인 |
| `package.json` | Node manifest | Playwright `^1.61.0` 의존성 선언 |
| `package-lock.json` | Node lock | 의존성 트리 고정 |
| `scripts/setup.go` | Go script (223L) | 외부 도구 설치/검증, wordlist 다운로드 |
| `scripts/recon.go` | Go script (~350L) | 5단계 recon 파이프라인 |
| `scripts/monitor.go` | Go script (312L) | diff 모니터링 + crt.sh + Discord 알림 |
| `scripts/hunt.go` | Go script (509L) | 4단계 취약점 헌팅 |
| `scripts/lab-runner.mjs` | Node script | Playwright 기반 격리 실습 실행기 |
| `scripts/lab-solver.mjs` | Node script | Playwright 기반 격리 실습 솔버 |
| `config/targets.json` | Config | 타겟 / Discord webhook / nuclei 옵션 |
| `notes/phase2-checklist.md` | Doc | 학습 단계별 체크리스트 |
| `notes/vulnerability-study.md` | Doc | 취약점별 학습 노트 |
| `notes/report-template.md` | Doc | 버그 리포트 템플릿 |
| `CONTRIBUTING.md` | Doc | 기여 가이드 |
| `LICENSE` | License | ISC 라이선스 전문 |

## 먼저 읽을 파일 / First Files to Read

| Priority | File | 이유 |
|----------|------|------|
| 1 | [`Makefile`](Makefile) | 사용 가능한 모든 명령과 사용 예시 |
| 2 | [`config/targets.json`](config/targets.json) | 타겟 / 알림 설정 위치 |
| 3 | [`scripts/recon.go`](scripts/recon.go) | recon 파이프라인의 실제 동작 |
| 4 | [`scripts/hunt.go`](scripts/hunt.go) | 취약점 헌팅 모듈 추가 진입점 (`huntTypes` 슬라이스) |
| 5 | [`notes/report-template.md`](notes/report-template.md) | 제출용 리포트 작성 표준 |
| 6 | [`CONTRIBUTING.md`](CONTRIBUTING.md) | PR / 이슈 가이드라인 |

---

## 빠른 시작 / Quick Start

### 1. 사전 요구 사항 / Prerequisites

| Tool | Version | 비고 |
|------|---------|------|
| Go | 1.21+ | 표준 라이브러리만 사용 |
| Node.js | 18+ | lab 스크립트 실행용 |
| subfinder | latest | subdomain enumeration |
| httpx | latest | HTTP probing |
| nuclei | latest + nuclei-templates | template scanning |
| waybackurls | latest | archive URL mining |
| jq | latest | monitor / config 파싱 |

### 2. 설치 / Install

```bash
# 저장소 클론
git clone https://github.com/jclee941/jclee-bot
cd bug

# Node 의존성 설치
npm install

# Go 스크립트 + 외부 도구 검증
make setup
```

### 3. 첫 타겟 실행 / First Target Run

```bash
# 본인 소유 / 명시적 허가 받은 도메인만 사용
make full-scan TARGET=your-domain.com
```

### 4. 결과 확인 / Inspect Output

```bash
# 가장 최근 recon 결과 보기
ls -t recon/your-domain.com/ | head -1

# 모니터링 baseline 갱신
make monitor TARGET=your-domain.com
```

---

## 아키텍처 / Architecture

### 계층 구조 / Layers

| Layer | Component | Responsibility |
|-------|-----------|----------------|
| Operator | `Makefile` | 명령 노출, 플래그 정규화 |
| Orchestration (Go) | `scripts/setup.go`, `recon.go`, `monitor.go`, `hunt.go` | 단계별 파이프라인, 외부 CLI 호출, 결과 수집 |
| External CLIs | `subfinder`, `httpx`, `nuclei`, `waybackurls` | 실제 스캔 작업 |
| Config | `config/targets.json` | 타겟 / webhook / nuclei 옵션 |
| Lab (Node) | `scripts/lab-runner.mjs`, `scripts/lab-solver.mjs` | 격리된 Playwright 실습 |
| Storage | `recon/`, `targets/`, `reports/`, `wordlists/` | 타임스탬프 디렉터리에 로컬 저장 (gitignored) |
| Notifications | Discord webhook | 신규 발견 opt-in 알림 |

### 1사이클 흐름 / End-to-End Flow

1. **Setup** — `make setup` → `scripts/setup.go`가 외부 CLI 존재 확인 + `SecLists` 다운로드
2. **Recon** — `make recon TARGET=x.com` → `scripts/recon.go` 5단계 파이프라인 실행
3. **Baseline** — `make monitor TARGET=x.com` 1회차 호출이 `targets/<target>/baseline.json` 생성
4. **Diff** — 이후 `monitor` 호출이 `crt.sh` 조회 + baseline 대비 신규 항목 보고
5. **Hunt** — `make hunt TARGET=x.com` → `scripts/hunt.go`가 `huntTypes` 순회하며 모듈 실행
6. **Report** — 발견 사항을 `notes/report-template.md`로 정리해 `reports/`에 저장
7. **Lab (선택)** — 격리 환경에서 동일 카테고리를 `lab-runner.mjs`로 재현 / 학습

### Go 스크립트 내부 구조 / Inside Each Go Script

| Script | Entry | Notable Sections |
|--------|-------|------------------|
| `setup.go` | `main()` | CLI 점검, `SecLists` 다운로드, 환경 출력 |
| `recon.go` | `main()` | 5단계 함수 호출, `os/exec.Command` 래퍼, 타임스탬프 디렉터리 생성 |
| `monitor.go` | `main()` | `crt.sh` 조회, baseline 로드, diff 계산, Discord POST |
| `hunt.go` | `main()` | `huntTypes` 슬라이스 순회, 카테고리별 분기 (`-type idor|ssrf|...`) |

---

## 설정 / Configuration

### `config/targets.json` 스키마

```json
{
  "targets": [
    {
      "domain": "example.com",
      "out_of_scope": ["*.internal.example.com"],
      "rate_limit": 100,
      "discord_webhook": "https://discord.com/api/webhooks/...",
      "notify_on": ["new_subdomain", "new_endpoint", "nuclei_finding"]
    }
  ],
  "defaults": {
    "rate_limit": 100,
    "nuclei_severity": ["medium", "high", "critical"]
  }
}
```

### 플래그 / Flags

| Flag | Default | 설명 |
|------|---------|------|
| `-d` | (required) | 타겟 도메인 |
| `-type` | `all` | hunt 카테고리 (`idor`, `ssrf`, `xss`, `sqli`, `all`) |
| `-rate` | `100` | nuclei 초당 요청 수 |
| `-skip-nuclei` | `false` | recon에서 nuclei 단계 생략 (`recon.go`) |
| `-o` | `./recon` | 결과 출력 루트 |

---

## 명령 레퍼런스 / Commands Reference

| Command | What it does | Output |
|---------|--------------|--------|
| `make help` | 사용 가능한 명령과 예시 출력 | stdout |
| `make setup` | 외부 도구 / wordlist 1회성 준비 | `wordlists/`, 검증 로그 |
| `make recon TARGET=x.com` | 전체 recon 파이프라인 | `recon/x.com/<ts>/` |
| `make recon-fast TARGET=x.com` | nuclei 제외 빠른 recon | 동일 |
| `make monitor TARGET=x.com` | diff 모니터링, 최초 실행은 baseline 생성 | `targets/x.com/baseline.json`, Discord |
| `make hunt TARGET=x.com` | 모든 hunt 카테고리 | `recon/x.com/<ts>/hunt/` |
| `make hunt-idor TARGET=x.com` | IDOR만 | `hunt/idor/` |
| `make hunt-ssrf TARGET=x.com` | SSRF만 | `hunt/ssrf/` |
| `make full-scan TARGET=x.com` | recon + hunt | 결합 |
| `make clean` | 로컬 결과물 삭제 | `recon/`, `targets/`, `reports/` 비움 |
| `node scripts/lab-runner.mjs` | 격리된 Playwright 실습 | 로컬 브라우저 세션 |
| `node scripts/lab-solver.mjs` | 실습 워크플로우 솔버 | stdout / 캡처 |

### 사용 예시 / Example Session

```bash
# 새 타겟 등록 (config/targets.json 직접 편집)
$EDITOR config/targets.json

# 첫 스캔
make full-scan TARGET=example.com

# 이후 변경 감지
make monitor TARGET=example.com

# IDOR만 별도 점검
make hunt-idor TARGET=example.com

# 결과 정리
make clean
```

---

## 로컬 개발 / Local Development

### 새 hunt 카테고리 추가 / Add a Hunt Category

1. `scripts/hunt.go`의 `huntTypes` 슬라이스에 항목 추가
2. 해당 카테고리 핸들러 함수 작성 (다른 카테고리 함수 참고)
3. `-type` 플래그 분기에 매핑
4. `make hunt TYPE=<new> TARGET=x.com`으로 수동 검증
5. `notes/vulnerability-study.md`에 학습 노트 갱신

### 외부 도구 변경 / Change External Tooling

- `scripts/recon.go`, `hunt.go`의 `os/exec.Command` 호출 위치 수정
- 기본 플래그(severity, rate limit 등)도 각 스크립트 상단에서 조정
- 변경 후 `make setup`으로 환경 재검증

### 노드 의존성 갱신 / Update Node Dependencies

```bash
npm update playwright
# 잠금 파일도 함께 커밋
```

### 디버깅 팁 / Debugging Tips

| 증상 | 확인 위치 |
|------|-----------|
| 도구 미인식 | `make setup` 출력에서 `missing` 줄 |
| recon 결과 비어 있음 | `recon/<target>/<ts>/logs/` 확인, `-skip-nuclei`로 단계 분리 |
| Discord 미수신 | `config/targets.json`의 `discord_webhook` URL, `notify_on` 배열 |
| nuclei 과부하 | `-rate 50`으로 낮춤, `out_of_scope`에 내부 호스트 명시 |

---

## 테스트 / Testing

현재 자동화 테스트 스위트는 포함되어 있지 않습니다(`package.json`의 `test` 스크립트는 placeholder). 운영 중 검증 절차는 다음과 같습니다.

| Check | Command | 기대 결과 |
|-------|---------|-----------|
| 환경 점검 | `make setup` | 모든 외부 CLI `OK` |
| Dry recon | `make recon-fast TARGET=localhost` (허가된 로컬 자만) | `recon/localhost/<ts>/` 생성 |
| 모니터 dry run | `make monitor TARGET=localhost` | `baseline.json` 생성 또는 diff `[]` |
| 노드 스크립트 | `node scripts/lab-runner.mjs --help` | 옵션 출력 |
| Playwright 설치 | `npx playwright --version` | 설치된 버전 출력 |

> 향후 자동화 테스트를 추가할 경우, 권장 프레임워크: Go는 표준 `testing` 패키지, Node는 `vitest` 또는 Node 내장 `node:test`.

---

## 보고 워크플로우 / Reporting Workflow

1. `make hunt` 또는 `make monitor`에서 발견된 항목을 `reports/<finding-slug>.md`로 복사
2. [`notes/report-template.md`](notes/report-template.md)를 채워 다음 섹션 보장:
   - Title / Summary
   - Severity & CVSS 추정
   - Affected asset (범위 내)
   - Steps to reproduce
   - Impact
   - Remediation suggestions
3. 프로그램 정책(공개 범위, 응답 SLA)에 맞춰 제출
4. 제출 후 `reports/<finding-slug>.md`는 사본을 `reports/`에 보관

## 기여 / Contributing

기여 절차는 [`CONTRIBUTING.md`](CONTRIBUTING.md)를 따릅니다. 핵심 규칙:

| Rule | Detail |
|------|--------|
| 스캔 결과 커밋 금지 | `recon/`, `targets/`, `reports/`, `wordlists/`는 절대 커밋하지 않음 |
| 타겟 하드코딩 금지 | 모든 도메인은 `config/targets.json` 또는 `-d` 플래그로만 주입 |
| 허가 없는 스캔 금지 | 실 데모 시에도 자기 소유 / 명시 허가 자만 사용 |
| Rate limit 준수 | 기본 `100 req/s` 이상으로 임의 상향 금지 |

PR 시 다음을 포함해 주세요:

- 변경 요약 (1-2 문장)
- 영향받는 스크립트 / Make 타깃
- `make setup` 재실행 후 동작 확인 결과
- `notes/` 문서 갱신 (해당 시)

---

## 유지보수 / Maintainers

| Role | Contact | Notes |
|------|---------|-------|
| Primary maintainer | jclee941 (GitHub: `jclee941/bug`) | 이슈 트래커와 동일 계정 사용 |
| Issues | `https://github.com/jclee941/bug/issues` | 버그 리포트 / 기능 요청 |
| Discussions | `https://github.com/jclee941/bug/discussions` | 사용법 / 워크플로우 논의 |

> 보안 취약점을 본 키트 자체에서 발견했다면 공개 이슈 대신 비공개로 통지해 주세요.

## 추가 문서 / Further Documentation

| Topic | File |
|-------|------|
| 학습 체크리스트 | [`notes/phase2-checklist.md`](notes/phase2-checklist.md) |
| 취약점별 학습 노트 | [`notes/vulnerability-study.md`](notes/vulnerability-study.md) |
| 리포트 템플릿 | [`notes/report-template.md`](notes/report-template.md) |
| 기여 가이드 | [`CONTRIBUTING.md`](CONTRIBUTING.md) |
| 라이선스 전문 | [`LICENSE`](LICENSE) |
| Make 타깃 정의 | [`Makefile`](Makefile) |
| 설정 스키마 | [`config/targets.json`](config/targets.json) |

---

## 라이선스 / License

본 저장소는 [ISC License](LICENSE) 하에 배포됩니다. 포함된 외부 도구(`nuclei-templates`, `SecLists` 등)는 각자의 라이선스를 따릅니다 — `make setup` 출력에서 출처를 확인하세요.