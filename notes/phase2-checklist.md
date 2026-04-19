# Phase 2: Recon 파이프라인 — 실전 체크리스트

## 도구 설치 상태

- [x] subfinder v2.13.0 — 서브도메인 열거
- [x] httpx — 라이브 호스트 프로빙 + 기술 스택 감지
- [x] nuclei v3.8.0 — 템플릿 기반 취약점 스캐닝 (9000+ 템플릿)
- [x] katana — 웹 크롤러 (JS 렌더링 지원)
- [x] ffuf — 디렉토리/파라미터 퍼징
- [x] gau — Wayback Machine + Common Crawl URL 수집
- [x] anew — 중복 제거 유틸리티
- [ ] Burp Suite Community — 수동 테스팅 프록시 (https://portswigger.net/burp/communitydownload)
- [ ] nmap — 포트 스캐닝 (`sudo apt install nmap`)

## 자동 파이프라인 사용법

```bash
cd ~/dev/bug

# 기본 실행 (전체 파이프라인)
go run scripts/recon.go -d target.com

# 취약점 스캔 건너뛰기 (recon만)
go run scripts/recon.go -d target.com -skip-nuclei

# 심각도 필터
go run scripts/recon.go -d target.com -severity critical,high
```

### 출력 구조
```
recon/target.com_20260419-143000/
├── subdomains.txt       ← 발견된 서브도메인
├── live.txt             ← 살아있는 HTTP 호스트 (URL만)
├── live-detail.txt      ← 상태코드 + 타이틀 + 기술스택
├── urls-all.txt         ← 수집된 전체 URL
├── nuclei-results.txt   ← Nuclei 취약점 결과
└── SUMMARY.md           ← 결과 요약 리포트
```

## 수동 Recon 명령어 (파이프라인 외 추가 작업)

### 서브도메인 심층 탐색
```bash
# Certificate Transparency 로그에서 서브도메인
curl -s "https://crt.sh/?q=%25.target.com&output=json" | jq -r '.[].name_value' | sort -u

# DNS 브루트포스 (공격적 — 허가된 타겟만)
ffuf -w /path/to/wordlist.txt -u "https://FUZZ.target.com" -mc 200,301,302,403
```

### 특정 취약점 타겟 스캔
```bash
# IDOR 관련 템플릿
nuclei -l live.txt -tags idor -o idor-results.txt

# SSRF 관련
nuclei -l live.txt -tags ssrf -o ssrf-results.txt

# 인증 우회
nuclei -l live.txt -tags auth-bypass -o auth-results.txt

# 노출된 시크릿 (.env, .git, backup)
nuclei -l live.txt -tags exposure -o exposure-results.txt

# 특정 CVE
nuclei -l live.txt -tags cve -severity critical -o cve-results.txt
```

### API 엔드포인트 발견
```bash
# URL에서 API 엔드포인트만 필터
cat urls-all.txt | grep -iE '/api/|/v[0-9]+/' | sort -u > api-endpoints.txt

# Swagger/OpenAPI 스펙 탐색
ffuf -w live.txt -u "FUZZ/swagger.json" -mc 200
ffuf -w live.txt -u "FUZZ/openapi.json" -mc 200
ffuf -w live.txt -u "FUZZ/api-docs" -mc 200
```

## Phase 2 완료 기준

- [ ] `go run scripts/recon.go -d <test-target>` 정상 실행
- [ ] 결과 디렉토리 구조 이해
- [ ] 수동 명령어 3개 이상 직접 실행해봄
- [ ] Nuclei 템플릿 카테고리 파악 (`ls ~/nuclei-templates/`)
- [ ] live-detail.txt 읽고 기술 스택 분석 가능

---

## Phase 3으로 넘어가기 전

1. PortSwigger Academy IDOR 랩 완료
2. PortSwigger Academy SSRF 랩 완료
3. HackerOne Hacktivity에서 공개 리포트 20개 읽기
4. HackerOne + Bugcrowd 계정 생성
