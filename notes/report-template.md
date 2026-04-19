# Bug Report Template

## Title
[Vulnerability Type] in [Feature/Endpoint] allows [Impact]

예시: IDOR in /api/v1/users/{id}/profile allows unauthorized access to other users' PII

## Severity
- [ ] Critical (P1) — Account takeover, RCE, full data breach
- [ ] High (P2) — Significant data exposure, auth bypass
- [ ] Medium (P3) — Limited data exposure, stored XSS
- [ ] Low (P4) — Information disclosure, reflected XSS
- [ ] Informational — Best practice violation

## Summary
[1-2문장으로 취약점 요약. 무엇이 문제이고, 공격자가 무엇을 할 수 있는지]

## Steps to Reproduce
1. [로그인/설정 상태]
2. [어떤 요청을 보내는지 — 정확한 URL, 메소드, 파라미터]
3. [어떤 응답이 오는지]
4. [취약점이 발생하는 지점]

## HTTP Request (PoC)

```http
GET /api/v1/users/12345/profile HTTP/1.1
Host: target.com
Authorization: Bearer eyJ...
```

## HTTP Response

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "id": 12345,
  "email": "victim@example.com",
  "ssn": "123-45-6789"
}
```

## Impact
[비즈니스 관점에서 영향도 설명]
- 공격자가 할 수 있는 것:
- 영향 받는 사용자 수:
- 데이터 유형:

## Remediation Suggestion
[수정 방법 제안 — 선택사항이지만 좋은 인상]

## Environment
- Browser/Tool: [Burp Suite / Chrome / curl]
- Target: [URL]
- Account: [test account used]
- Date: [YYYY-MM-DD]

---

## 리포트 작성 팁

1. **재현 가능해야 함** — 누구나 따라할 수 있는 단계별 설명
2. **스크린샷/비디오** — 복잡한 플로우는 영상이 효과적
3. **비즈니스 임팩트** — 기술 설명보다 비즈니스 영향이 보상을 결정
4. **최소 데이터** — PoC에 불필요한 개인정보 포함하지 말 것
5. **공손한 톤** — 트리아지 팀과의 관계가 프라이빗 프로그램 초대에 영향
