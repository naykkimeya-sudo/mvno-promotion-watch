# 알뜰폰 프로모션 감시

[알뜰폰 프로모션 구글시트](https://mvno-promotion.hinori.mmv.kr) 목록이 바뀌면 텔레그램으로 알려줍니다.

- **감시 대상**: `https://mvno-promotion.hinori.mmv.kr/api/data` (페이지가 목록을 받아오는 JSON)
- **감지 항목**: 프로모션 신규 등록 / 제목·기간·링크 수정 / 삭제
- **알림**: 변경이 있을 때만. 조회 실패는 3회 재시도 후 조용히 넘어갑니다.

## 왜 GitHub Actions로 돌리지 않나

이 사이트는 Cloudflare 봇 차단 뒤에 있고 `robots.txt`가 `Disallow: /` 입니다.
클라우드(Azure/GitHub 러너) IP에서는 헤더를 브라우저와 동일하게 맞춰도 전부
`HTTP 403 "Just a moment..."` 를 받습니다. 그래서 감시는 **가정용 IP를 쓰는 기기**
(안드로이드 폰 또는 집 PC)에서 실행합니다. `.github/workflows/watch.yml` 은
그 진단 기록으로 남겨둔 것이며 비활성화 상태입니다.

## 안드로이드(Termux) 설치

Termux에서:

```sh
bash <(curl -fsSL https://raw.githubusercontent.com/naykkimeya-sudo/mvno-promotion-watch/main/termux/setup.sh)
```

패키지 설치 → 텔레그램 토큰 입력 → 테스트 알림 → 30분 주기 cron 등록까지 진행합니다.
설치 후 안드로이드 설정에서 Termux의 배터리 최적화를 꺼야 계속 동작합니다.

| 파일 | 역할 |
| --- | --- |
| `termux/watch.js` | 조회 → 비교 → 텔레그램 전송. `--test` 로 알림 설정만 시험 가능 |
| `termux/setup.sh` | Termux 설치 스크립트 |
| `check.js`, `.github/` | GitHub Actions 시도의 잔재 (차단 확인됨, 비활성) |
