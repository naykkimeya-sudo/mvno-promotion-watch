# 알뜰폰 프로모션 감시

[알뜰폰 프로모션 구글시트](https://mvno-promotion.hinori.mmv.kr) 목록이 바뀌면 텔레그램으로 알려줍니다.

- **감시 대상**: `https://mvno-promotion.hinori.mmv.kr/api/data` (페이지가 목록을 받아오는 JSON)
- **주기**: 30분마다 (GitHub Actions 예약 실행, 혼잡 시 5~15분 지연될 수 있음)
- **감지 항목**: 프로모션 신규 등록 / 제목·기간·링크 수정 / 삭제
- **알림**: 변경이 있을 때만 전송. 변경이 없거나 사이트 조회에 실패한 실행은 조용히 넘어갑니다.

## 구성

| 파일 | 역할 |
| --- | --- |
| `check.js` | API 조회 → `snapshot.json`과 비교 → `telegram.txt` 작성. 종료 코드 0=변경없음, 1=변경있음, 2=조회실패 |
| `.github/workflows/watch.yml` | 30분마다 `check.js` 실행, 변경 시 텔레그램 전송, 스냅샷 커밋 |
| `snapshot.json` | 직전 확인 시점의 전체 목록 (비교 기준, 매 실행 후 자동 갱신) |
| `last_checked.txt` | 마지막 확인 날짜. 하루 한 번 커밋되어 예약 워크플로가 비활성화되지 않게 유지 |

## 필요한 시크릿

저장소 Settings → Secrets and variables → Actions:

- `TELEGRAM_BOT_TOKEN` — @BotFather에서 발급한 봇 토큰
- `TELEGRAM_CHAT_ID` — 알림을 받을 채팅 ID

## 수동 실행

Actions 탭 → "알뜰폰 프로모션 감시" → Run workflow.
