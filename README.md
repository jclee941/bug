# Bug Bounty Automation Toolkit / 버그 바운티 자동화 툴킷

[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](./LICENSE)
[![Go Scripts](https://img.shields.io/badge/core-Go-00ADD8?logo=go&logoColor=white)](./scripts/)
[![Node: Playwright](https://img.shields.io/badge/node-playwright-339933?logo=node.js&logoColor=white)](./package.json)
![Platform: Linux](https://img.shields.io/badge/platform-linux-FCC624?logo=linux&logoColor=black)
![Maintained](https://img.shields.io/badge/maintained-yes-success.svg)
[![PRs: Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](./.github/workflows/welcome.yml)
[![Pipeline: recon → monitor → hunt → report](https://img.shields.io/badge/pipeline-recon→monitor→hunt→report-6f42c1)](#-architecture--아키텍처)

> A Go-driven bug bounty automation toolkit that orchestrates the **recon → monitor → hunt → report** lifecycle, paired with a GitHub-side automation layer that keeps the repository itself healthy.
>
> Go 표준 라이브러리 기반의 버그 바운티 자동화 툴킷. **정찰 → 모니터링 → 헌팅 → 리포트** 전 과정을 단일 인터페이스로 오케스트레이션하며, 저장소 자체의 건강 상태를 유지하는 GitHub 자동화 레이어를 함께 제공합니다.

---

## Table of Contents / 목차

- [Overview / 개요](#overview--개요)
- [Features / 주요 기능](#features--주요-기능)
- [Architecture / 아키텍처](#architecture--아키텍처)
- [Repository Structure / 저장소 구조](#repository-structure--저장소-구조)
- [Automation Inventory / 자동화 인벤토리](#automation-inventory--자동화-인벤토리)
  - [GitHub Workflows (10)](#github-workflows-10--github-워크플로-10)
  - [Local Go Tools (4)](#local-go-tools-4--로컬-go-도구-4)
  - [Local Node.js Tools (2)](#local-nodejs-tools-2--로컬-nodejs-도구-2)
- [Quick Start / 빠른 시작](#quick-start--빠른-시작)
- [Local Development / 로컬 개발](#local-development--로컬-개발)
- [Commands Reference / 명령어 참조](#commands-reference--명령어-참조)
- [Configuration / 설정](#configuration--설정)
- [Security & Ethics / 보안과 윤리](#security--ethics--보안과-윤리)
- [Contributing / 기여](#contributing--기여)
- [License / 라이선스](#license--라이선스)

---

## Overview / 개요

The **Bug Bounty Automation Toolkit** (`jclee941/bug`) is a personal security-research harness written almost entirely with Go's standard library. It wraps industry-standard reconnaissance and exploitation tooling — `subfinder`, `amass`, `httpx`, `nuclei`, and `crt.sh` — behind a single, opinionated `make` interface, and ships with a curated GitHub-side automation layer so the repository stays tidy while you hunt on real targets.

**Bug Bounty Automation Toolkit** (`jclee941/bug`)은 Go 표준 라이브러리만으로 작성된 개인 보안 연구용 하네스입니다. `subfinder`, `amass`, `httpx`, `nuclei`, `crt.sh` 등 업계 표준 정찰·침투 테스트 도구를 단일 `make` 인터페이스 뒤로 감추고, 동시에 저장소를 깔끔하게 유지하기 위한 GitHub 자동화 레이어를 함께 제공합니다.

The toolkit is designed around four operating modes plus a browser-lab surface:

툴킷은 네 가지 운영 모드와 브라우저 랩 표면으로 구성됩니다.

| Mode | Entry Point | Purpose |
|---|---|---|
| `setup` | `make setup` | One-time environment verification + SecLists download |
| `recon` | `make recon TARGET=domain` | 5-phase reconnaissance pipeline |
| `monitor` | `make monitor TARGET=domain` | Diff-based change detection with Discord alerting |
| `hunt` | `make hunt TARGET=domain` | Targeted vulnerability hunting (IDOR, SSRF, XSS, …) |
| Lab | `node scripts/lab-runner.mjs` | Playwright-driven browser verification |

| 모드 | 진입점 | 목적 |
|---|---|---|
| `setup` | `make setup` | 최초 환경 검증 + SecLists 다운로드 |
| `recon` | `make recon TARGET=domain` | 5단계 정찰 파이프라인 |
| `monitor` | `make monitor TARGET=domain` | 디프 기반 변경 감지 + Discord 알림 |
| `hunt` | `make hunt TARGET=domain` | 표적형 취약점 헌팅 (IDOR, SSRF, XSS 등) |
| Lab | `node scripts/lab-runner.mjs` | Playwright 기반 브라우저 검증 |

All scan output is timestamped and git-ignored, so you can iterate aggressively without polluting the working tree. The browser-lab is intentionally lightweight — `playwright` is the only npm dependency — and is meant for ad-hoc verification of findings rather than full automation.

모든 스캔 출력은 타임스탬프 디렉터리에 저장되고 `.gitignore`로 제외되므로, 작업 트리를 오염시키지 않고 공격적으로 반복 실행할 수 있습니다. 브라우저 랩은 의도적으로 가볍게 설계되었으며, 유일한 npm 의존성은 `playwright`입니다. 전체 자동화가 아닌 발견 항목의 임시 검증 용도입니다.

---

## Features / 주요 기능

### Reconnaissance Pipeline / 정찰 파이프라인

- 5-phase pipeline: **subdomain enumeration → resolution → probing → fingerprinting → nuclei scanning**
- Auto-fallback: if `amass` is missing the pipeline degrades gracefully to `subfinder` + `crt.sh`
- Timestamped output directories for snapshot comparison
- Configurable nuclei rate-limit (default `100` req/s) to stay within program ToS

5단계 파이프라인: **서브도메인 열거 → 해석 → 프로빙 → 핑거프린팅 → nuclei 스캔**. `amass`가 없을 경우 `subfinder` + `crt.sh`로 자동 폴백. 타임스탬프 출력 디렉터리로 스냅샷 비교 가능. nuclei rate-limit 설정 가능 (기본 `100` req/s).

### Change Monitoring / 변경 모니터링

- Snapshot-based diff detection for new subdomains, new HTTP endpoints, and new TLS issuers
- Discord webhook integration for real-time alerting
- Baseline files stored under `targets/<domain>/baseline.json`

스냅샷 기반 디프 감지로 신규 서브도메인, 신규 HTTP 엔드포인트, 신규 TLS 발급자 탐지. Discord 웹훅 통합 실시간 알림. 베이스라인은 `targets/<domain>/baseline.json`에 저장.

### Targeted Hunting / 표적형 헌팅

- Pluggable category system: IDOR, SSRF, XSS, … (extend via the `huntTypes` slice in `scripts/hunt.go`)
- Nuclei-template driven with category-specific severity filters
- Output reports land in `reports/<domain>/<timestamp>/` ready for submission

플러그형 카테고리 시스템: IDOR, SSRF, XSS 등 (`scripts/hunt.go`의 `huntTypes` 슬라이스로 확장). nuclei 템플릿 기반, 카테고리별 심각도 필터 적용. `reports/<domain>/<timestamp>/`에 제출 가능한 형태로 저장.

### Browser Lab / 브라우저 랩

- `scripts/lab-runner.mjs` — orchestrates a Playwright Chromium session against a local target
- `scripts/lab-solver.mjs` — replay-based solver harness for capture-the-flag style challenges
- Headless by default; `PLAYWRIGHT_HEADLESS=false` (or `--headed`) to debug interactively

`scripts/lab-runner.mjs`는 로컬 대상에 대해 Playwright Chromium 세션을 오케스트레이션. `scripts/lab-solver.mjs`는 CTF 스타일 챌린지를 위한 리플레이 기반 솔버 하네스. 기본 헤드리스, `PLAYWRIGHT_HEADLESS=false` (또는 `--headed`)로 대화형 디버그.

### GitHub-side Housekeeping / GitHub 측 정리 자동화

- New-issue welcome + auto-labeling
- PR review (general + security) via `qodo-ai/pr-agent`
- PR size linting, title/branch normalization
- Stale issue/PR auto-closure
- Auto-merge for patch / minor Dependabot updates

신규 이슈 환영 + 자동 라벨링. `qodo-ai/pr-agent` 기반 PR 리뷰 (일반 + 보안). PR 크기 검사, 제목·브랜치 정규화. 오래된 이슈·PR 자동 종료. Dependabot 패치·마이너 업데이트 자동 머지.

---

## Architecture / 아키텍처

```mermaid
flowchart TB
    OP([Operator / 운영자]) --