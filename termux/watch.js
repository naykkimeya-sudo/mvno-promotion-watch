// 알뜰폰 프로모션 구글시트 변경 감시 → 텔레그램 알림
// Windows 작업 스케줄러가 30분마다 실행(절전 중이면 PC를 깨워서 실행)
//
// 설정: 같은 폴더의 config.json { "bot_token": "...", "chat_id": "..." }
// 로그: watch.log (최근 기록만 유지)

const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const API = 'https://mvno-promotion.hinori.mmv.kr/api/data';
const SITE = 'https://mvno-promotion.hinori.mmv.kr';
const SNAP = path.join(DIR, 'snapshot.json');
const CONFIG = path.join(DIR, 'config.json');
const LOG = path.join(DIR, 'watch.log');
const HISTORY = path.join(DIR, 'history.log');

const keyOf = (r) => `${r.start_yymm}#${r.idx}`;
const stamp = () => new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function log(msg) {
  const line = `[${stamp()}] ${msg}\n`;
  process.stdout.write(line);
  try {
    // 로그가 커지면 뒤쪽 절반만 남긴다
    if (fs.existsSync(LOG) && fs.statSync(LOG).size > 512 * 1024) {
      const keep = fs.readFileSync(LOG, 'utf8').split('\n');
      fs.writeFileSync(LOG, keep.slice(keep.length >> 1).join('\n'), 'utf8');
    }
    fs.appendFileSync(LOG, line, 'utf8');
  } catch {}
}

async function fetchData() {
  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(API, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
          Accept: 'application/json, text/plain, */*',
          'Accept-Language': 'ko-KR,ko;q=0.9',
          Referer: SITE + '/',
        },
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) throw new Error('예상치 못한 응답 형식');
      return data;
    } catch (e) {
      lastErr = e;
      if (attempt < 3) await sleep(attempt * 10000);
    }
  }
  throw lastErr;
}

async function sendTelegram(html) {
  let cfg;
  try {
    cfg = JSON.parse(fs.readFileSync(CONFIG, 'utf8'));
  } catch {
    log('config.json 을 읽을 수 없습니다 — 텔레그램 전송을 건너뜁니다.');
    return false;
  }
  if (!cfg.bot_token || !cfg.chat_id || String(cfg.bot_token).startsWith('여기에')) {
    log('config.json 에 봇 토큰/채팅 ID가 채워져 있지 않습니다 — 텔레그램 전송을 건너뜁니다.');
    return false;
  }
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(`https://api.telegram.org/bot${cfg.bot_token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: cfg.chat_id,
          text: html,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
        }),
        signal: AbortSignal.timeout(30000),
      });
      const body = await res.json();
      if (body.ok) return true;
      throw new Error(`텔레그램 API 오류: ${body.description || JSON.stringify(body)}`);
    } catch (e) {
      log(`텔레그램 전송 실패(${attempt}/3): ${e.message}`);
      if (attempt < 3) await sleep(attempt * 10000);
    }
  }
  return false;
}

(async () => {
  // --test : 텔레그램 설정이 맞는지만 확인하고 종료
  if (process.argv.includes('--test')) {
    const ok = await sendTelegram(
      `📱 <b>알뜰폰 프로모션 감시 설치 완료</b>\n<i>${esc(stamp())}</i>\n\n` +
        `이 메시지가 보이면 알림 설정이 정상입니다.\n` +
        `앞으로 프로모션이 새로 올라오거나 바뀌면 여기로 알려드립니다.\n\n` +
        `<a href="${SITE}">전체 목록 열기</a>`
    );
    log(ok ? '테스트 알림 전송 성공' : '테스트 알림 전송 실패 — config.json 을 확인하세요');
    process.exitCode = ok ? 0 : 1;
    return;
  }

  let rows;
  try {
    rows = await fetchData();
  } catch (e) {
    log(`조회 실패(3회 시도): ${e.message} — 다음 실행에서 다시 시도합니다.`);
    return; // 알림 없이 조용히 종료
  }

  const now = new Map(rows.map((r) => [keyOf(r), r]));

  if (!fs.existsSync(SNAP)) {
    fs.writeFileSync(SNAP, JSON.stringify(rows, null, 2) + '\n', 'utf8');
    log(`기준선 생성: ${rows.length}건`);
    return;
  }

  const prev = new Map(JSON.parse(fs.readFileSync(SNAP, 'utf8')).map((r) => [keyOf(r), r]));

  const added = [];
  const removed = [];
  const changed = [];

  for (const [k, r] of now) {
    const old = prev.get(k);
    if (!old) {
      added.push(r);
    } else {
      const diffs = ['title', 'start_date', 'end_date', 'url', 'share_url']
        .filter((f) => old[f] !== r[f])
        .map((f) => `${f}: "${old[f]}" → "${r[f]}"`);
      if (diffs.length) changed.push({ row: r, diffs });
    }
  }
  for (const [k, r] of prev) if (!now.has(k)) removed.push(r);

  if (added.length + changed.length + removed.length === 0) {
    log(`변경 없음 (${rows.length}건)`);
    fs.writeFileSync(SNAP, JSON.stringify(rows, null, 2) + '\n', 'utf8');
    return;
  }

  const summary = `신규 ${added.length} / 수정 ${changed.length} / 삭제 ${removed.length}`;

  const tg = [`📱 <b>알뜰폰 프로모션 업데이트</b>`, `<i>${esc(stamp())} · ${esc(summary)}</i>`, ''];
  for (const r of added) {
    tg.push(`🆕 <a href="${esc(r.url)}">${esc(r.title)}</a>`);
    tg.push(`   기간: ${esc(r.start_date)} ~ ${esc(r.end_date)}`);
  }
  for (const c of changed) {
    tg.push(`✏️ <a href="${esc(c.row.url)}">${esc(c.row.title)}</a>`);
    for (const d of c.diffs) tg.push(`   ${esc(d)}`);
  }
  for (const r of removed) tg.push(`🗑 ${esc(r.title)} (${esc(r.start_date)} ~ ${esc(r.end_date)})`);
  tg.push('', `<a href="${SITE}">전체 목록 열기</a>`);
  let msg = tg.join('\n');
  if (msg.length > 3800) msg = msg.slice(0, 3800) + `\n…\n<a href="${SITE}">전체 목록 열기</a>`;

  const plain = [];
  for (const r of added) plain.push(`  [신규] ${r.title} (${r.start_date} ~ ${r.end_date}) ${r.url}`);
  for (const c of changed) plain.push(`  [수정] ${c.row.title} — ${c.diffs.join(' / ')}`);
  for (const r of removed) plain.push(`  [삭제] ${r.title}`);
  log(`${summary}\n${plain.join('\n')}`);
  fs.appendFileSync(HISTORY, `[${stamp()}] ${summary}\n${plain.join('\n')}\n\n`, 'utf8');

  const sent = await sendTelegram(msg);

  // 전송에 성공했을 때만 스냅샷을 갱신한다.
  // 실패한 변경분을 놓치지 않고 다음 실행에서 다시 알리기 위함.
  if (sent) {
    fs.writeFileSync(SNAP, JSON.stringify(rows, null, 2) + '\n', 'utf8');
    log('텔레그램 전송 완료');
  } else {
    log('전송 실패 — 스냅샷을 갱신하지 않고 다음 실행에서 다시 알립니다.');
  }
})();
