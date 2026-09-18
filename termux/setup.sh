#!/data/data/com.termux/files/usr/bin/bash
# 안드로이드(Termux)에 알뜰폰 프로모션 감시를 설치한다.
# 실행: curl -fsSL https://raw.githubusercontent.com/naykkimeya-sudo/mvno-promotion-watch/main/termux/setup.sh | bash
set -e

DIR="$HOME/mvno-watch"
RAW="https://raw.githubusercontent.com/naykkimeya-sudo/mvno-promotion-watch/main/termux"

echo
echo "===== 1/5 필요한 패키지 설치 (1~2분 걸립니다)"
yes | pkg update -y >/dev/null 2>&1 || true
pkg install -y nodejs-lts cronie termux-services >/dev/null
echo "     완료: node $(node -v)"

echo
echo "===== 2/5 감시 스크립트 내려받기"
mkdir -p "$DIR"
curl -fsSL "$RAW/watch.js" -o "$DIR/watch.js"
echo "     $DIR/watch.js"

echo
echo "===== 3/5 텔레그램 설정"
if [ -f "$DIR/config.json" ]; then
  echo "     기존 설정을 그대로 씁니다."
  echo "     (다시 입력하려면: rm $DIR/config.json 후 재실행)"
else
  echo "     BotFather에서 받은 봇 토큰을 붙여넣고 엔터:"
  printf "     토큰> "
  read -r TOKEN </dev/tty
  echo "     userinfobot이 알려준 Id 숫자를 붙여넣고 엔터:"
  printf "     채팅 ID> "
  read -r CHAT </dev/tty
  cat > "$DIR/config.json" <<EOF
{
  "bot_token": "$TOKEN",
  "chat_id": "$CHAT"
}
EOF
  chmod 600 "$DIR/config.json"
  echo "     저장했습니다 (이 폰 안에만 보관됩니다)"
fi

echo
echo "===== 4/5 테스트 알림 보내기"
if node "$DIR/watch.js" --test; then
  echo "     폰에 텔레그램 알림이 왔는지 확인하세요."
else
  echo
  echo "  !! 전송에 실패했습니다. 아래를 확인하세요:"
  echo "     - 봇에게 /start 를 보냈는지"
  echo "     - 토큰과 채팅 ID를 정확히 붙여넣었는지"
  echo "     다시 하려면: rm $DIR/config.json && bash <(curl -fsSL $RAW/setup.sh)"
  exit 1
fi

echo
echo "===== 5/5 30분마다 자동 실행 등록"
mkdir -p "$PREFIX/var/service"
sv-enable crond >/dev/null 2>&1 || true
sv up crond >/dev/null 2>&1 || true
CRON_LINE="*/30 * * * * $PREFIX/bin/node $DIR/watch.js >> $DIR/cron.log 2>&1"
( crontab -l 2>/dev/null | grep -v "mvno-watch/watch.js" ; echo "$CRON_LINE" ) | crontab -
echo "     등록된 예약:"
crontab -l | sed 's/^/       /'

# 첫 기준선 생성 (이 시점 목록을 기준으로 삼는다)
node "$DIR/watch.js" >/dev/null 2>&1 || true

# 화면이 꺼져도 Termux가 잠들지 않게 (알림줄에 자물쇠 표시가 생깁니다)
termux-wake-lock 2>/dev/null || true

echo
echo "===== 설치 완료"
echo "  감시 폴더 : $DIR"
echo "  로그 보기 : tail -20 $DIR/watch.log"
echo "  중지하기  : crontab -r"
echo
echo "  남은 설정 한 가지 — 안드로이드 설정 > 앱 > Termux > 배터리 를 열어"
echo "  '제한 없음'(또는 '최적화 안 함')으로 바꿔주세요. 이걸 안 하면"
echo "  안드로이드가 몇 시간 뒤 Termux를 재워버려 감시가 멈춥니다."
echo
