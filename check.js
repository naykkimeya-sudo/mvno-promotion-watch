// 알뜰폰 프로모션 구글시트(https://mvno-promotion.hinori.mmv.kr) 변경 감시
// 종료 코드: 0 = 변경 없음, 1 = 변경 있음, 2 = 조회 실패(네트워크/서버 오류)
//   - changes.txt   : 이번 실행의 변경 내역 (변경 없으면 빈 파일)
//   - telegram.txt  : 텔레그램으로 보낼 메시지 본문 (변경 있을 때만)
//   - snapshot.json : 최신 스냅샷 (다음 실행의 비교 기준)
//   - last_checked.txt : 마지막 확인 날짜(UTC). 저장소 활동 유지용.

const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const API = 'https://mvno-promotion.hinori.mmv.kr/api/data';
const SITE = 'https://mvno-promotion.hinori.mmv.kr';
const SNAP = path.join(DIR, 'snapshot.json');
const CHANGES = path.join(DIR, 'changes.txt');
const TELEGRAM = path.join(DIR, 'telegram.txt');
const LAST = path.join(DIR, 'last_checked.txt');

const keyOf = (r) => `${r.start_yymm}#${r.idx}`;
const stamp = () =>
  new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }) + ' KST';
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchData() {
  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(API, {
        headers: { 'User-Agent': 'Mozilla/5.0 mvno-promotion-watch' },
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) throw new Error('예상치 못한 응답 형식');
      return data;
    } catch (e) {
      lastErr = e;
      if (attempt < 3) await sleep(attempt * 5000);
    }
  }
  throw lastErr;
}

(async () => {
  fs.writeFileSync(CHANGES, '', 'utf8');
  fs.writeFileSync(TELEGRAM, '', 'utf8');

  let rows;
  try {
    rows = await fetchData();
  } catch (e) {
    console.error(`[${stamp()}] 조회 실패(3회 시도): ${e.message}`);
    process.exitCode = 2;
    return;
  }

  // 하루 한 번만 내용이 바뀌는 파일 — 저장소 활동을 유지해 예약 워크플로가 중지되지 않게 한다
  fs.writeFileSync(LAST, new Date().toISOString().slice(0, 10) + '\n', 'utf8');

  const now = new Map(rows.map((r) => [keyOf(r), r]));

  if (!fs.existsSync(SNAP)) {
    fs.writeFileSync(SNAP, JSON.stringify(rows, null, 2) + '\n', 'utf8');
    console.log(`기준선 생성: ${rows.length}건`);
    process.exitCode = 0;
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

  fs.writeFileSync(SNAP, JSON.stringify(rows, null, 2) + '\n', 'utf8');

  if (added.length + changed.length + removed.length === 0) {
    console.log(`변경 없음 (${rows.length}건)`);
    process.exitCode = 0;
    return;
  }

  // 로그/커밋 메시지용 평문
  const plain = [];
  for (const r of added) plain.push(`[신규] ${r.title} (${r.start_date} ~ ${r.end_date})\n        ${r.url}`);
  for (const c of changed) plain.push(`[수정] ${c.row.title}\n        ${c.diffs.join('\n        ')}`);
  for (const r of removed) plain.push(`[삭제] ${r.title} (${r.start_date} ~ ${r.end_date})`);
  const summary = `신규 ${added.length} / 수정 ${changed.length} / 삭제 ${removed.length}`;
  fs.writeFileSync(CHANGES, `[${stamp()}] ${summary}\n${plain.join('\n')}\n`, 'utf8');

  // 텔레그램용 HTML (parse_mode=HTML)
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
  // 텔레그램 메시지 상한(4096자) 보호
  let msg = tg.join('\n');
  if (msg.length > 3800) msg = msg.slice(0, 3800) + `\n…\n<a href="${SITE}">전체 목록 열기</a>`;
  fs.writeFileSync(TELEGRAM, msg, 'utf8');

  console.log(`${summary}\n${plain.join('\n')}`);
  process.exitCode = 1;
})();
