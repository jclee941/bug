```markdown
# bug — Bug Bounty Automation Toolkit

버그 바운티 및 웹 보안 테스트를 위한 자동화 도구 모음입니다.  
Reconnaissance, 취약점 헌팅, 지속적 모니터링, 그리고 웹 보안 학습 랩 자동화를 하나의 워크플로우로 통합합니다.

## 주요 기능

- **통합 Recon 파이프라인** — 서브도메인, 엔드포인트 등 자산 수집 및 정리 (Go 기반)
- **타겟형 취약점 헌팅** — IDOR, SSRF 등 특정 취약 유형 집중 탐지
- **변화 탐지 모니터링** — 타겟의 신규 서브도메인·엔드포인트를 Diff 방식으로 감지
- **웹 자동화 & 랩 솔버** — Playwright 기반 브라우저 자동화 및 웹 보안 학습 환경 Solver 스크립트 제공
- **OOB 테스트 지원** — interactsh 연동을 통한 Out-of-Band 취약점 검증
- **GitHub 네이티브 통합** — GitHub App / Action 실행을 위한 Docker 이미지 및 봇 스크립트 포함 (`_bot-scripts/`)
- **Makefile 인터페이스** — `make recon`, `make hunt` 등 단일 명령어로 전체 워크플로우 실행

## 설치 방법

> **필수 환경**: Node.js, Go, Make  
> **선택 환경**: Docker (`_bot-scripts/` 사용 시)

```bash
# 저장소 클론
git clone https://github.com/jclee941/bug.git
cd bug

# Node.js 의존성 설치 (Playwright 등)
npm install

# 초기 환경 설정 (도구 및 워드리스트 확인)
make setup
```

## 사용 방법

### Makefile 명령어

```bash
# 사용 가능한 명령어 확인
make help

# 타겟 리콘 수행
make recon TARGET=target.com

# 빠른 리콘 (Nuclei 스킵)
make recon-fast TARGET=target.com

# 신규 자산 모니터링
make monitor TARGET=target.com

# 취약점 헌팅
make hunt TARGET=target.com

# 특정 유형 헌팅 (IDOR / SSRF)
make hunt-idor TARGET=target.com
make hunt-ssrf TARGET=target.com

# 전체 스캔 (Recon + Hunt)
make full-scan TARGET=target.com
```

### 랩 Solver 및 보조 스크립트

`scripts/` 디렉터리 내 `.mjs`, `.cjs`, `.go` 스크립트를 통해 웹 자동화 및 랩 Solver를 개별 실행할 수 있습니다.

```bash
# Playwright 기반 랩 일괄 실행 예시
node scripts/lab-batch-solver.mjs

# Go 기반 리콘 개별 실행 예시
go run scripts/recon.go scripts/lib.go -d target.com
```

## 프로젝트 구조

```
bug/
├── scripts/              # 핵심 자동화 스크립트
│   ├── *.go              # Recon, Monitor, Hunt 엔진
│   ├── *.mjs / *.cjs     # Playwright 기반 웹 자동화 및 랩 Solver
│   ├── *.py / *.sh       # 보조 유틸리티 및 Wrapper
│   └── interactsh-wrapper.sh
├── _bot-scripts/         # GitHub App / Action 봇 인프라
│   ├── Dockerfile.github_action
│   ├── Dockerfile.github_app
│   ├── docker-compose.github_app.yml
│   └── pyproject.toml    # Python 봇 패키지 설정
├── Makefile              # 워크플로우 명령어 오케스트레이션
├── package.json          # Node.js 의존성 (Playwright)
├── AGENTS.md             # 에이전트 가이드
├── CONTRIBUTING.md       # 기여 가이드
└── LICENSE               # 라이선스
```

## 기여하기

기여는 언제든 환영합니다.  
코드 기여, 버그 리포트, 기능 제안은 [CONTRIBUTING.md](CONTRIBUTING.md)를 참고해 주세요.

## 라이선스

이 프로젝트는 [LICENSE](LICENSE) 파일에 명시된 라이선스를 따릅니다.
```