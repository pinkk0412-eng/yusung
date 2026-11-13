/* 유성 현장 관리 프로그램 — 오프라인 단일 프로그램
 * 데이터: 선택한 "데이터 폴더" 안에 현장별 폴더 (A. 기안품의 / B. 자금관련/YY년 MM월 서류철 …) 에 저장
 */
'use strict';
const APP_VERSION = '2026.11.13-6';   // 배포 만들기.bat 이 만들 때 날짜로 바꿈

/* ================= 기본 상수 ================= */
const CATS = [
  { g: '복리후생비', s: ['식대', '간식대', '회식비', '복리기타'] },
  { g: '차량유지비', s: ['유류비', '통행료외'] },
  { g: '소모품비', s: ['소모품비'] },
  { g: '여비교통비', s: ['여비교통비'] },
  { g: '건물관리비', s: ['건물관리비'] },
  { g: '지급수수료', s: ['지급수수료'] },
  { g: '수도광열비', s: ['수도광열비'] },
  { g: '통신비', s: ['통신비'] },
  { g: '광고홍보비', s: ['광고홍보비'] },
  { g: '기타', s: ['기타'] },
];
const SUBS = CATS.flatMap(c => c.s);
const GROUP_OF = Object.fromEntries(CATS.flatMap(c => c.s.map(s => [s, c.g])));
const CAT_ALIAS = {
  '간식비': '간식대', '간식': '간식대', '커피': '간식대', '식비': '식대', '중식': '식대', '석식': '식대',
  '회식': '회식비', '주유': '유류비', '주유비': '유류비', '톨비': '통행료외', '통행료': '통행료외', '주차비': '통행료외',
  '주차료': '통행료외', '교통비': '여비교통비', '출장비': '여비교통비', '소모품': '소모품비', '수수료': '지급수수료',
  '광고비': '광고홍보비', '홍보비': '광고홍보비', '복리후생비': '복리기타', '차량유지비': '유류비',
};
const MONTHLY_SUBJECTS = ['임차료', '통신비', '복리후생비', '차량유지비', '광고홍보비', '소모품비', '지급수수료', '수도광열비', '건물관리비', '기타'];
const KEYWORD_CAT = [
  [/주유|오일|에너지|충전소|칼텍스|S-?OIL|현대오일/i, '유류비'],
  [/주차|파킹|하이패스|도로공사|고속도로|영업소|톨게이트|대교/i, '통행료외'],
  [/커피|카페|메가엠지씨|컴포즈|스타벅스|이디야|빽다방|투썸|베이커리|제과|파리바게|뚜레쥬르|블랑제리|베이글|도넛|공차|아이스크림/i, '간식대'],
  [/다이소|쿠팡|마트|오피스|문구|알파|철물|열쇠|하이마트|이마트|홈플러스/i, '소모품비'],
  [/철도|코레일|에스알|SRT|KTX|버스|택시|카카오T|티머니|공항철도/i, '여비교통비'],
  [/우체국|우정사업|KT|SKT|LG\s?U|통신/i, '통신비'],
];
const WEEK = ['일', '월', '화', '수', '목', '금', '토'];
const STORE_KEY = 'gyeongri_db_v1';

/* ================= 유틸 ================= */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = n => { const v = Math.round(Number(n) || 0); return v.toLocaleString('ko-KR'); };
const fmt0 = n => (Math.round(Number(n) || 0) === 0 ? '' : fmt(n));
const dashN = n => (Math.round(Number(n) || 0) ? fmt(n) : '-');   // 금액 칸: 0 이면 '-' (인쇄 양식 공통)
const fmtQty = n => { const v = Math.round((Number(n) || 0) * 100) / 100; return v ? v.toLocaleString('ko-KR', { maximumFractionDigits: 2 }) : ''; };   // 일수·시간: 0.5 단위를 반올림하지 않음 (7.5 → "7.5")
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const toNum = v => { if (typeof v === 'number') return isFinite(v) ? v : 0; const n = parseFloat(String(v ?? '').replace(/[,\s원₩]/g, '')); return isNaN(n) ? 0 : n; };
const pad2 = n => String(n).padStart(2, '0');
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; };
const ymOf = date => String(date || '').slice(0, 7);
const ymAdd = (ym, k) => { let [y, m] = ym.split('-').map(Number); m += k; while (m > 12) { m -= 12; y++; } while (m < 1) { m += 12; y--; } return `${y}-${pad2(m)}`; };
const daysIn = ym => { const [y, m] = ym.split('-').map(Number); return new Date(y, m, 0).getDate(); };
const monthNo = ym => Number(ym.split('-')[1]);
const ymLabel = ym => `${ym.split('-')[0]}년 ${monthNo(ym)}월`;
const weekday = (ym, d) => { const [y, m] = ym.split('-').map(Number); return new Date(y, m - 1, d).getDay(); };
const nest = (o, ...keys) => { for (const k of keys) { if (!o[k] || typeof o[k] !== 'object') o[k] = {}; o = o[k]; } return o; };
const sum = (arr, f = x => x) => arr.reduce((a, x) => a + (Number(f(x)) || 0), 0);

/* 숫자 → 한글 금액 (엑셀 NUMBERSTRING 방식) */
function numKor(n) {
  n = Math.floor(Math.abs(Number(n) || 0));
  if (!n) return '영';
  const d = ['', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구'], u = ['', '십', '백', '천'], big = ['', '만', '억', '조'];
  let out = '', i = 0;
  while (n > 0) {
    let c = n % 10000;
    if (c) { let s = ''; for (let j = 0; j < 4; j++) { const x = c % 10; if (x) s = d[x] + u[j] + s; c = Math.floor(c / 10); } out = s + big[i] + out; }
    n = Math.floor(n / 10000); i++;
  }
  return out;
}

/* ================= 파싱 로직 (카드사 엑셀) ================= */
function normLabel(v) { return String(v ?? '').normalize('NFKC').replace(/\s+/g, ''); }

/* 날짜 셀 → {date:'YYYY-MM-DD', time:'HH:MM'} */
function parseDateCell(v, refYm) {
  if (v === null || v === undefined || v === '') return null;
  const refY = refYm ? Number(refYm.slice(0, 4)) : new Date().getFullYear();
  const refM = refYm ? monthNo(refYm) : new Date().getMonth() + 1;
  const mk = (y, m, d, hh, mm) => {
    if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
    return { date: `${y}-${pad2(m)}-${pad2(d)}`, time: hh !== undefined && hh !== null && hh !== '' ? `${pad2(hh)}:${pad2(mm || 0)}` : '' };
  };
  if (v instanceof Date && !isNaN(v)) return mk(v.getFullYear(), v.getMonth() + 1, v.getDate(), v.getHours() || v.getMinutes() ? v.getHours() : '', v.getMinutes());
  if (typeof v === 'number') {
    if (v > 20000 && v < 80000) {
      const ms = Math.round((v - 25569) * 86400000);
      const dt = new Date(ms);
      const frac = v % 1;
      return mk(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate(), frac > 0 ? dt.getUTCHours() : '', dt.getUTCMinutes());
    }
    v = String(v);
  }
  const s = String(v).normalize('NFKC').trim().replace(/\s+/g, ' ');
  let m = s.match(/^(\d{4})\s*[-./년]\s*(\d{1,2})\s*[-./월]\s*(\d{1,2})일?(?:[ T]+(\d{1,2}):(\d{2}))?/);
  if (m) return mk(+m[1], +m[2], +m[3], m[4], m[5]);
  m = s.match(/^(\d{2})[-./](\d{1,2})[-./](\d{1,2})(?:[ T]+(\d{1,2}):(\d{2}))?$/);
  if (m) return mk(2000 + +m[1], +m[2], +m[3], m[4], m[5]);
  m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) return mk(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})\s*[-./월]\s*(\d{1,2})일?(?:[ T]+(\d{1,2}):(\d{2}))?$/);
  if (m) {
    const mo = +m[1]; let y = refY;
    if (mo - refM > 6) y--; else if (refM - mo > 6) y++;
    return mk(y, mo, +m[2], m[3], m[4]);
  }
  return null;
}

function stripBizNo(s) {   // 가맹점명 뒤에 붙은 사업자번호(123-45-67890, 1234567890) 빼기
  return String(s ?? '').replace(/[\s(\[]*\d{3}-?\d{2}-?\d{5}[)\]]*/g, ' ').replace(/\s+/g, ' ').trim();
}
function cleanMerchant(s) {
  return stripBizNo(String(s ?? '').normalize('NFKC').split(/\s{2,}/)[0].replace(/\s+/g, ' ').trim());
}
function merchantKey(s) {
  return cleanMerchant(s).replace(/주식회사|\(주\)|㈜|\s/g, '').slice(0, 12);
}
function normCat(v) {
  const s = normLabel(v);
  if (!s) return '';
  if (SUBS.includes(s)) return s;
  if (CAT_ALIAS[s]) return CAT_ALIAS[s];
  for (const sub of SUBS) if (s.includes(sub)) return sub;
  return '';
}

const FIELD_SYNONYMS = {
  date: { exact: ['이용일자', '이용일', '월일', '일자', '거래일자', '거래일', '승인일자', '사용일자', '날짜', '매출일자', '이용일시', '거래일시', '승인일시'], contains: ['일자', '일시', '날짜'] },
  card: { exact: ['이용카드', '카드번호', '현장카드', '카드', '이용카드번호', '카드뒷자리'], contains: ['카드'] },
  merchant: { exact: ['이용가맹점(은행)명', '이용가맹점명', '이용가맹점', '가맹점명', '가맹점', '거래처', '업체명', '상호', '사용처'], contains: ['가맹점', '거래처', '업체', '상호'] },
  amount: { exact: ['이용금액', '금액', '합계', '사용금액', '승인금액', '매출금액', '이용금액(원)', '결제금액'], contains: ['이용금액', '승인금액', '결제금액'] },
  cat: { exact: ['세목', '계정과목', '분류', '계정'], contains: [] },
  memo: { exact: ['내역', '사용내역', '사용자', '적요', '거래내용', '사용용도', '비고내역'], contains: [] },
};

function detectColumns(labels) {
  const cols = {};
  labels = labels.map(l => { const b = String(l || '').replace(/\(.*?\)/g, ''); return b || l; });   // '사용금액(자원순환보증금액포함)' → '사용금액' (비씨카드 이용내역조회)
  const used = new Set();
  for (const f of ['amount', 'date', 'merchant', 'cat', 'memo', 'card']) {
    const syn = FIELD_SYNONYMS[f];
    let idx = -1;
    for (const e of syn.exact) { idx = labels.findIndex((l, i) => l === e && !used.has(i)); if (idx >= 0) break; }
    if (idx < 0) for (const c of syn.contains) {
      idx = labels.findIndex((l, i) => l && l.includes(c) && l.length <= 10 && !used.has(i) && !/청구|미청구|공급|부가/.test(l));
      if (idx >= 0) break;
    }
    if (idx < 0 && f === 'memo') idx = labels.findIndex((l, i) => l === '이용내역' && !used.has(i));
    if (idx >= 0) { cols[f] = idx; used.add(idx); }
  }
  return cols;
}

/* 카드 귀속월: 사용기간 시작일(start)이 3이면 8/3~9/2 → 8월 */
function cardYm(date, start) {
  const ym = ymOf(date); if (!ym) return '';
  return start > 1 && Number(String(date).slice(8, 10)) < start ? ymAdd(ym, -1) : ym;
}
/* 장부의 귀속월 칸(8, '11월', 25.8, '2025-08' …) → YYYY-MM. 연도가 없으면 일자와 가장 가까운 해 */
function labelYm(v, date) {
  if (v === null || v === undefined || v === '') return '';
  const s = String(v).trim().replace(/\s+/g, '');
  let m = s.match(/^(20\d{2})[-.\/년](\d{1,2})/);
  if (m) return `${m[1]}-${pad2(+m[2])}`;
  m = s.match(/^(\d{2})\.(\d{1,2})$/);   // 25.8 → 2025-08
  if (m && +m[2] >= 1 && +m[2] <= 12 && +m[1] >= 20) return `20${m[1]}-${pad2(+m[2])}`;
  m = s.match(/^(\d{1,2})(?:월)?$/) || (typeof v === 'number' && Number.isInteger(v) ? [0, String(v)] : null);
  if (!m || !date) return '';
  const mm = +m[1]; if (mm < 1 || mm > 12) return '';
  const y = +String(date).slice(0, 4), dm = +String(date).slice(5, 7);
  let best = null;
  for (const yy of [y - 1, y, y + 1]) { const diff = Math.abs((yy * 12 + mm) - (y * 12 + dm)); if (!best || diff < best[0]) best = [diff, yy]; }
  return `${best[1]}-${pad2(mm)}`;
}

/* 2차원 배열(시트) → 거래 행 목록 */
function parseCardSheet(aoa, refYm) {
  const rows = aoa.map(r => (r || []).map(v => v));
  let headerRow = -1, cols = null;
  const isDataRow = (row, c) => row && (parseDateCell(row[c.date], refYm) !== null || typeof row[c.amount] === 'number');
  for (let r = 0; r < Math.min(rows.length, 40); r++) {
    const labels = rows[r].map(normLabel);
    const nextRow = rows[r + 1] || [];
    const next = nextRow.map(normLabel);
    // 2단 머리글(예: 이용내역 → 계정과목/내역) 병합 시도
    if (next.some(l => ['계정과목', '내역', '공급가액', '부가세', '합계', '세목', '사용금액', '전도금'].includes(l))) {
      const merged = [];
      for (let i = 0; i < Math.max(labels.length, next.length); i++) merged[i] = next[i] || labels[i] || '';
      const c = detectColumns(merged);
      if (c.date !== undefined && c.amount !== undefined && !isDataRow(nextRow, c)) {
        headerRow = r + 1; cols = c; cols.inAmt = merged.findIndex(l => ['전도금', '입금', '입금액', '입금금액'].includes(l)); cols.bm = merged.findIndex(l => /^귀속/.test(l)); break;
      }
    }
    const c = detectColumns(labels);
    if (c.date !== undefined && c.amount !== undefined) {
      headerRow = r; cols = c; cols.inAmt = labels.findIndex(l => ['전도금', '입금', '입금액', '입금금액'].includes(l)); cols.bm = labels.findIndex(l => /^귀속/.test(l)); break;
    }
  }
  if (!cols) return { ok: false, error: '머리글(이용일자/금액)을 찾지 못했습니다.' };
  cols.cancel = rows[headerRow].map(normLabel).findIndex(l => /^(승인)?취소(일|일자|여부)?$/.test(l));
  const out = [];
  let skipped = 0;
  for (let r = headerRow + 1; r < rows.length; r++) {
    const row = rows[r];
    const rawDate = row[cols.date];
    const merchantRaw = cols.merchant !== undefined ? row[cols.merchant] : '';
    const joined = row.map(v => String(v ?? '')).join('');
    if (/합계|소계|총계|누계/.test(String(rawDate ?? '') + String(merchantRaw ?? ''))) { skipped++; continue; }
    const d = parseDateCell(rawDate, refYm);
    let amount = toNum(row[cols.amount]), kind = 'out';
    const inAmt = cols.inAmt >= 0 ? toNum(row[cols.inAmt]) : 0;
    if (!amount && inAmt) { amount = inAmt; kind = 'in'; }
    if (!d || !amount) { if (joined.trim()) skipped++; continue; }
    if (cols.cancel >= 0) { const cv = String(row[cols.cancel] ?? '').trim(); if (cv && (/취소|^Y$/i.test(cv) || parseDateCell(row[cols.cancel], refYm))) { skipped++; continue; } }   // 승인취소일이 적힌 줄(취소된 결제)은 빼기
    if (kind === 'out' && inAmt && d) out.push({ date: d.date, time: d.time, card: '', kind: 'in', merchant: '', amount: inAmt, cat: '', memo: '전도금 입금', bm: '' });   // 입금과 지출이 같은 줄
    let card = cols.card !== undefined ? String(row[cols.card] ?? '').replace(/\.0$/, '').replace(/\D/g, '').slice(-4) : '';
    if (card && card.length < 4) card = card.padStart(4, '0');
    out.push({
      date: d.date, time: d.time, card, kind,
      merchant: cleanMerchant(merchantRaw),
      amount,
      cat: cols.cat !== undefined ? normCat(row[cols.cat]) : '',
      memo: cols.memo !== undefined ? String(row[cols.memo] ?? '').trim() : '',
      bm: cols.bm >= 0 ? labelYm(row[cols.bm], d.date) : '',
    });
  }
  return { ok: true, rows: out, cols, headerRow, skipped };
}

/* 영수증 글자 인식 결과 → 날짜·시간·금액·가맹점·카드 뒤4자리 */
function parseReceiptText(text) {
  const raw = String(text || '');
  const lines = raw.split(/\r?\n/).map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const r = { date: '', time: '', amount: 0, merchant: '', card4: '', bizNo: '' };
  // 날짜: 2026/08/23, 2026-08-23, 2026.08.23, 2026년 8월 23일, 26.08.23
  const valid = (y, m, d) => m >= 1 && m <= 12 && d >= 1 && d <= 31 && y >= 2000 && y <= 2099;
  for (const l of lines) {
    let m = l.match(/(20\d{2})\s*[.\-\/년]\s*(\d{1,2})\s*[.\-\/월]\s*(\d{1,2})/);
    if (m && valid(+m[1], +m[2], +m[3])) { r.date = `${m[1]}-${pad2(+m[2])}-${pad2(+m[3])}`; }
    else if ((m = l.match(/(?:^|[^\d])(\d{2})[.\-\/](\d{2})[.\-\/](\d{2})(?:[^\d]|$)/)) && valid(2000 + +m[1], +m[2], +m[3])) r.date = `20${m[1]}-${m[2]}-${m[3]}`;
    if (r.date) { const t = l.slice((m.index || 0) + m[0].length).match(/(\d{1,2}):(\d{2})/) || l.match(/(\d{1,2}):(\d{2})/); if (t && +t[1] < 24) r.time = `${pad2(+t[1])}:${t[2]}`; break; }
  }
  if (!r.time) { for (const l of lines) { const t = l.match(/(?:^|[^\d])([01]?\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?(?:[^\d]|$)/); if (t && !/\d{3}-\d{3,4}-\d{4}/.test(l)) { r.time = `${pad2(+t[1])}:${t[2]}`; break; } } }
  // 금액: "합계/결제금액/승인금액…" 줄의 숫자 우선, 없으면 "원"이 붙은 가장 큰 금액
  const money = s => (String(s).match(/\d{1,3}(?:[,.]\d{3})+(?!\d)|\d+(?=\s*원)/g) || []).map(x => Number(x.replace(/[,.]/g, ''))).filter(n => n > 0 && n < 100000000);
  const KEYS = [/합\s*계|총\s*액|총\s*합계|받을\s*금액|결제\s*금액|승인\s*금액|청구\s*금액|판매\s*금액|총\s*결제|합계\s*금액/, /금\s*액|이용\s*금액|결제/];
  for (const re of KEYS) {
    for (let i = 0; i < lines.length && !r.amount; i++) {
      if (!re.test(lines[i]) || /세\s*금|부가세|과세|면세|봉사료|보증금|할인|거스름|받은\s*돈/.test(lines[i].replace(re, ''))) continue;
      const v = money(lines[i].replace(/^.*?(합\s*계|총\s*액|금\s*액|결제)/, '')); const n = v.length ? Math.max(...v) : money(lines[i + 1] || '')[0];
      if (n) r.amount = n;
    }
    if (r.amount) break;
  }
  if (!r.amount) { const all = lines.flatMap(l => (l.match(/[\d,]+\s*원/g) || [])).map(x => Number(x.replace(/[^\d]/g, ''))).filter(n => n > 0 && n < 100000000); if (all.length) r.amount = Math.max(...all); }
  // 가맹점: "가맹점명/상호" 뒤 글자 (없으면 바로 앞·뒤 줄)
  const clean = s => String(s || '').replace(/^[\s:：_.\-|]+|[\s:：_.\-|]+$/g, '').replace(/\s{2,}/g, ' ');
  const isLabel = s => /가맹점|대표자|사업자|주소|전화|연락처|카드|승인|금액|합계|번호|일시|유효/.test(s);
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/(?:가맹점\s*명|상\s*호\s*명?|가\s*맹\s*점|매장\s*명)\s*[:：]?\s*(.*)$/);
    if (!m || /주소|번호/.test(lines[i].slice(0, m.index + 6))) continue;
    let v = clean(m[1]);
    if (v.replace(/[^가-힣A-Za-z0-9]/g, '').length < 2) v = [lines[i - 1], lines[i + 1]].map(clean).find(x => x && !isLabel(x) && x.replace(/[^가-힣A-Za-z]/g, '').length >= 2) || '';
    if (v) { r.merchant = v.slice(0, 30); break; }
  }
  if (!r.merchant) { const first = lines.find(l => l.replace(/[^가-힣A-Za-z]/g, '').length >= 2 && !/영수증|매출표|전표|카드|receipt/i.test(l) && !isLabel(l)); if (first) r.merchant = clean(first).slice(0, 30); }
  // 카드 뒤 4자리, 사업자번호
  for (const l of lines) { if (/카드\s*번호|[*xX#]{3,}/.test(l)) { const m = l.match(/(\d{4})\s*$/) || l.match(/[*xX#]{2,}\s*(\d{4})/); if (m) { r.card4 = m[1]; break; } } }
  const b = raw.match(/\d{3}-\d{2}-\d{5}/); if (b) r.bizNo = b[0];
  return r;
}
/* 영수증 ↔ 내역 맞추기 점수 (금액이 같아야 후보, 날짜·카드·가맹점이 맞을수록 높음) */
function receiptScore(rc, t) {
  if (!rc.amount || Math.round(t.amount) !== Math.round(rc.amount)) return 0;
  let s = 50;
  if (rc.date && t.date) { const d = Math.abs((new Date(rc.date) - new Date(t.date)) / 86400000); s += d === 0 ? 30 : d <= 1 ? 15 : d <= 3 ? 5 : -20; }
  if (rc.card4 && t.card) s += rc.card4 === t.card ? 10 : -10;
  if (rc.time && t.time && rc.time === String(t.time).slice(0, 5)) s += 10;
  const a = merchantKey(rc.merchant), b = merchantKey(t.merchant);
  if (a && b && (a.includes(b.slice(0, 3)) || b.includes(a.slice(0, 3)))) s += 10;
  return s;
}

/* 자동 분류 */
function guessCat(t, map) {
  const k = merchantKey(t.merchant);
  if (k && map && map[k]) return map[k];
  const memo = String(t.memo || '').trim();
  if (/^(중식|석식|조식|야식|식사)\s*\//.test(memo)) return '식대';
  if (/^(간식|커피|음료)\s*\//.test(memo)) return '간식대';
  if (/^회식\s*\//.test(memo)) return '회식비';
  for (const [re, c] of KEYWORD_CAT) if (re.test(t.merchant || '')) return c;
  return '';
}

/* 가맹점·품목별 기본 사용내역 — "글자 = 세목 / 사용내역" 한 줄에 하나 (설정에서 고침) */
const DEFAULT_MEMO_RULES = '리레코 = 소모품비 / 사무용품 구입 (주문내역·거래명세서 첨부)\n복사용지 = 소모품비 / 현장 사무실 복사용지 구입';
function parseMemoRules(txt) {
  return String(txt || '').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#')).map(l => {
    const m = l.match(/^(.+?)\s*=\s*([^/]*?)\s*(?:\/\s*(.*))?$/); if (!m) return null;
    return { key: m[1].trim(), cat: normCat(m[2]), memo: (m[3] || '').trim() };
  }).filter(r => r && r.key);
}
function applyMemoRule(t, rules) {   // 비어 있는 세목·사용내역만 채움. 바뀌면 true
  const hay = normLabel(`${t.merchant || ''} ${t.memo || ''}`);
  const r = rules.find(x => hay.includes(normLabel(x.key))); if (!r) return false;
  let ch = false;
  if (!t.cat && r.cat) { t.cat = r.cat; ch = true; }
  if (!String(t.memo || '').trim() && r.memo) { t.memo = r.memo; ch = true; }
  return ch;
}
/* 구분(팀)별 식대 단가 — "기획 9000, 경리 9000, 아르바이트 8000" (구분 이름에 글자가 들어 있으면 적용) */
function parseRateRules(txt) {
  return [...String(txt || '').matchAll(/([^\d,\n:=-][^\d\n:=]*?)\s*[:=]?\s*(-?\d[\d,]*)/g)].map(m => ({ key: m[1].replace(/^[\s,]+|[\s,]+$/g, ''), rate: Number(m[2].replace(/,/g, '')) })).filter(x => x.key);
}
function mealRateFor(team, rules) {
  const t = normLabel(team); if (!t) return null;
  const r = rules.find(x => t.includes(normLabel(x.key)));
  return r ? r.rate : null;
}

/* 식대 1인 한도 (경영지원 기준: 기획·경리 9천, 상담사·아르바이트 7천) — 구분 이름에 글자가 들어 있으면 적용 */
const DEFAULT_MEAL_LIMITS = '기획 9000, 경리 9000, 상담 7000, TM 7000, 아르바이트 7000, 알바 7000, 홍보 7000';
const CONV_STORE = /GS25|지에스25|^CU|씨유|세븐일레븐|7-?ELEVEN|이마트24|미니스톱|편의점|마트|하나로|코스트코|트레이더스/i;
const MEAL_WORD = /조식|중식|석식|야식|간식|점심|저녁|아침/;
/* 사용내역 기재 규칙 점검 (경영지원 지적 사항) → 경고 글 목록 */
function memoRuleWarnings(t) {   // (회사 이름 줄임말 점검은 없앰 — 줄임말 써도 됨)
  const memo = String(t.memo || '').trim(), out = [];
  if (t.kind === 'in') return out;
  if (['식대', '간식대', '회식비', '복리기타'].includes(t.cat) && /\d+\s*명/.test(memo)) out.push('인원수 대신 이름으로 적으세요 (예: 여직원 2명 ✕ → 김OO, 이OO)');
  if (t.cat === '소모품비' && memo.replace(/\s/g, '').length < 5) out.push('소모품 구입 품목·사유를 적으세요 (예: 사무실 복사용지 부족분 구입)');
  if (t.cat === '식대') {
    const q = memo.match(/(\d+)\s*(개|인분|그릇|세트|판)/);
    if (q) { const rest = memo.replace(/\d+\s*(개|인분|그릇|세트|판)/g, ''); const c = rest.replace(/^[^/]{1,6}\//, '').trim() ? parseMeal(rest, []).count : 0; if (c && +q[1] !== c) out.push(`주문 ${q[1]}${q[2]} · 취식 ${c}명 — 수량과 인원이 다릅니다`); }
  }
  if (CONV_STORE.test(t.merchant || '') && t.noItems) out.push('품목 내역이 없는 영수증 — 편의점·마트는 품목이 나온 영수증이어야 부가세 신고 가능');
  // 사용내역 형식: 식대 = 식사구분(중식 등) + 이름만 들어 있으면 됨 (중식/홍길동 · 중식 홍길동 · 홍길동 중식 모두 OK)
  if (t.cat === '식대' && memo) {
    const k = MEAL_WORD.test(memo), who = /[가-힣A-Za-z]{2,}/.test(memo.replace(MEAL_WORD, ' '));
    if (!k || !who) out.push(`식대 사용내역에 ${!k ? '식사구분(중식·석식 등)' : '먹은 사람 이름'}을 적으세요 (예: 중식/홍길동,김철수 · 외부인 ○○건설(이영희))`);
  }
  if (/\d{3}-\d{2}-\d{5}/.test(t.merchant || '')) out.push('가맹점 이름에 사업자번호가 남아 있습니다 — 지우고 가게 이름만');
  return out;
}

/* ================= 식대 내역 파싱 ================= */
function splitTop(s) {
  const out = []; let depth = 0, cur = '';
  for (const ch of s) {
    if ('(（['.includes(ch)) depth++;
    if (')）]'.includes(ch)) depth = Math.max(0, depth - 1);
    if (depth === 0 && /[,，、·]/.test(ch)) { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur);
  return out.map(x => x.trim()).filter(Boolean);
}
function headCount(t) {
  const oe = t.match(/외\s*(\d+)\s*명/);
  if (oe) return 1 + Number(oe[1]);
  const mm = t.match(/(\d+)\s*명/);
  if (mm) return Number(mm[1]);
  return 0;
}
function parseMeal(memo, names) {
  let s = String(memo || '').normalize('NFKC').trim();
  let kind = '';
  const m = s.match(/^([^/]{1,6}?)\s*\/\s*(.*)$/);
  if (m) { kind = m[1].trim(); s = m[2]; }
  else { const k = s.match(MEAL_WORD); if (k) { kind = k[0]; s = s.replace(MEAL_WORD, ' ').replace(/^[\s,·:\-]+|[\s,·:\-]+$/g, '').trim(); } }   // "중식 홍길동,김철수" · "홍길동 중식" 처럼 / 없이 적어도
  const tokens = splitTop(s);
  let count = 0; const matched = []; const unknown = [];
  for (const t of tokens) {
    const p = t.match(/^(.*?)\((.*)\)\s*$/);
    let n;
    if (p) n = headCount(p[2]) || splitTop(p[2]).length || 1;
    else n = headCount(t) || 1;
    count += n;
    const hit = names.filter(nm => nm && t.includes(nm));
    if (hit.length) matched.push(...hit);
    else if (!p && /^[가-힣]{2,4}$/.test(t)) unknown.push(t);
  }
  return { kind, count: Math.max(count, 1), matched: [...new Set(matched)], unknown };
}

/* ================= 공휴일 · 자금집행일 =================
 * 자금집행일: 인건비 10일 → 휴일이면 그 전 영업일 / 월결제 25일 → 휴일이면 그 다음 영업일 (fundDay)
 * 공휴일 = 고정 공휴일 + 설날·추석·부처님오신날(음력, 해마다 표) + 선거일·임시공휴일 + 대체공휴일(규칙으로 계산)
 * 표에 없는 해나 새 임시공휴일은 이 표(HOLI_LUNAR 등)에 직접 추가 */
const HOLI_FIXED = [['01-01', '신정'], ['03-01', '삼일절'], ['05-05', '어린이날'], ['06-06', '현충일'], ['08-15', '광복절'], ['10-03', '개천절'], ['10-09', '한글날'], ['12-25', '성탄절']];
const HOLI_LUNAR = {   // 설날·추석 당일(앞뒤 하루씩 함께 쉼) · 부처님오신날
  2025: { seol: '2025-01-29', chu: '2025-10-06', budda: '2025-05-05' },
  2026: { seol: '2026-02-17', chu: '2026-09-25', budda: '2026-05-24' },
  2027: { seol: '2027-02-07', chu: '2027-09-15', budda: '2027-05-13' },
  2028: { seol: '2028-01-26', chu: '2028-10-03', budda: '2028-05-02' },
};
const HOLI_EXTRA = { '2025-01-27': '임시공휴일', '2025-06-03': '대통령선거', '2026-06-03': '지방선거', '2028-04-12': '국회의원선거' };
const holiCache = {};
const ymdOf = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
function holidaysOf(y) {   // { 'YYYY-MM-DD': 이름 }
  if (holiCache[y]) return holiCache[y];
  const h = {}, D = s => new Date(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)), add = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  HOLI_FIXED.forEach(([md, n]) => { h[`${y}-${md}`] = n; });
  const L = HOLI_LUNAR[y], groups = [];
  if (L) {
    [['seol', '설날'], ['chu', '추석']].forEach(([k, n]) => { const g = [-1, 0, 1].map(i => ymdOf(add(D(L[k]), i))); groups.push(g); g.forEach(ds => { h[ds] = h[ds] ? `${h[ds]}·${n}` : n; }); });
    h[L.budda] = h[L.budda] ? `${h[L.budda]}·부처님오신날` : '부처님오신날';
  }
  Object.entries(HOLI_EXTRA).forEach(([ds, n]) => { if (ds.startsWith(`${y}-`)) h[ds] = n; });
  const sub = from => { let d = add(D(from), 1); while (d.getDay() === 0 || d.getDay() === 6 || h[ymdOf(d)]) d = add(d, 1); h[ymdOf(d)] = '대체공휴일'; };
  // 설·추석: 연휴가 일요일이나 다른 공휴일과 겹치면 연휴 다음 첫 평일
  const inGroup = ds => groups.some(g => g.includes(ds));
  groups.forEach(g => { if (g.some(ds => D(ds).getDay() === 0 || HOLI_FIXED.some(([md]) => ds.endsWith(md)) || (L && ds === L.budda))) sub(g[2]); });
  // 삼일절·어린이날·광복절·개천절·한글날·성탄절·부처님오신날: 토·일요일이나 다른 공휴일과 겹치면 다음 첫 평일 (설·추석과 겹친 날은 위에서 한 번만)
  [...['03-01', '05-05', '08-15', '10-03', '10-09', '12-25'].map(md => `${y}-${md}`), ...(L ? [L.budda] : [])].forEach(ds => {
    if (inGroup(ds)) return;
    const dow = D(ds).getDay(), overlap = L && ds === L.budda && HOLI_FIXED.some(([md]) => ds.endsWith(md));
    if (ds === `${y}-05-05` && L && L.budda === ds) return;   // 어린이날 = 부처님오신날 → 부처님오신날 쪽에서 한 번
    if (dow === 0 || dow === 6 || overlap) sub(ds);
  });
  return (holiCache[y] = h);
}
const holidayName = ds => holidaysOf(+ds.slice(0, 4))[ds] || '';   // (예전 설정 "추가 휴일"은 없앰 — 공휴일 표만 사용)
const isOffDay = (d, st) => d.getDay() === 0 || d.getDay() === 6 || !!holidayName(ymdOf(d), st);
// 그 달 day일 → 휴일이면 dir(-1: 전 영업일, +1: 다음 영업일)로 옮긴 날
function fundDay(ym, day, dir, st) {
  const [y, m] = ym.split('-').map(Number), d = new Date(y, m - 1, Math.min(day, daysIn(ym)));
  for (let k = 0; k < 15 && isOffDay(d, st); k++) d.setDate(d.getDate() + dir);
  return d;
}
const payFundDay = (ym, st) => fundDay(ym, st.payrollDay, -1, st);   // 자금집행일 ① (ym 달 10일 기준 · 인건비 등, 휴일이면 앞으로)
const monthlyFundDay = (ym, st) => fundDay(ym, st.monthlyPay, 1, st);   // 자금집행일 ② (ym 달 25일 기준 · 월결제 등, 휴일이면 뒤로)
const mdw = d => `${d.getMonth() + 1}/${d.getDate()}(${'일월화수목금토'[d.getDay()]})`;

/* ================= 일정 ================= */
function buildTasks(today, settings) {
  const T = `${today.getFullYear()}-${pad2(today.getMonth() + 1)}`;
  const P = ymAdd(T, -1);
  const due = (ym, day) => { const [y, m] = ym.split('-').map(Number); return new Date(y, m - 1, Math.min(day, daysIn(ym))); };
  const st = settings, payD = payFundDay(T, st), monD = monthlyFundDay(T, st);
  const moved = (d, day, why) => (d.getDate() !== day ? ` (${day}일이 휴일 → ${why})` : '');
  return [
    { key: 'cash', ym: P, tab: 'cash', title: `${monthNo(P)}월 전도금 정산`, desc: `${monthNo(P)}월 1일~말일 전도금 사용분 정산 · 잔액이 적거나 마이너스면 전도금 신청`, due: due(T, st.settleDay) },
    { key: 'meal', ym: P, tab: 'meal', title: `${monthNo(P)}월 식대·출근부 정산`, desc: `${monthNo(P)}월 1일~말일 식대 · 출근부 정리 → 인건비 반영`, due: due(T, st.settleDay) },
    { key: 'payClose', ym: P, tab: 'pay', title: `${monthNo(P)}월분 인건비 자료 마감`, desc: `출근부·식대·사진대체 확정 → 경영지원 송부 (${mdw(payD)} 자금집행)`, due: due(T, st.payrollClose || 2) },
    { key: 'payroll', ym: P, tab: 'pay', title: `자금집행일 (${monthNo(P)}월분 인건비 등)`, desc: `${mdw(payD)} 자금집행${moved(payD, st.payrollDay, '전 영업일')} — 인건비 등 결재된 지출 집행`, due: payD },
    { key: 'card', ym: P, tab: 'card', title: `${monthNo(P)}월 법인카드 정산`, desc: '카드사 내역 불러오기 · 세목 분류 · 집계표', due: due(T, st.settleDay) },
    { key: 'monthlyClose', ym: T, tab: 'monthly', title: `${monthNo(T)}월 월결제 마감`, desc: `${st.monthlyClose}일 전까지 거래처 금액 확정`, due: due(T, st.monthlyClose) },
    { key: 'monthlyPay', ym: T, tab: 'monthly', title: `자금집행일 (${monthNo(T)}월 월결제 등)`, desc: `${mdw(monD)} 자금집행${moved(monD, st.monthlyPay, '다음 영업일')} — 월결제 등 결재된 지출 집행 · 자금청구서/지출결의서`, due: monD },
    ...([1, 4, 7, 10].includes(monthNo(T)) ? [{ key: 'vat', ym: T, tab: 'card', title: `부가세 신고 달 (${monthNo(T)}월)`, desc: '카드 영수증·승인내역 빨리 제출 · 세금계산서 취소·마이너스 발행은 본사에 먼저 문의', due: due(T, Math.min(st.settleDay, 5)) }] : []),
  ].map(t => ({ ...t, dday: Math.round((new Date(t.due.getFullYear(), t.due.getMonth(), t.due.getDate()) - new Date(today.getFullYear(), today.getMonth(), today.getDate())) / 86400000) }));
}

/* ================= 인건비 계산 ================= */
const PAY_TYPES = ['일급', '월급', '제외'];
const TAX_TYPES = { '3.3': '사업소득 3.3%', 'vat': '부가세 10% 별도', 'none': '공제 없음' };
const PL_GROUPS = ['유성 정직원', '기획계약직', '경리', '상담사/TM', '도우미/경호', '아르바이트/홍보단/미화'];
const PAY_FIELDS = ['company', 'payType', 'rate', 'otRate', 'mealRate', 'taxType', 'payer', 'plGroup'];
function guessPlGroup(team) {
  const t = String(team || '');
  if (/경리/.test(t)) return '경리';
  if (/상담|TM/i.test(t)) return '상담사/TM';
  if (/도우미|경호|인포|큐레이터/.test(t)) return '도우미/경호';
  if (/알바|아르바이트|홍보|미화|프로모션/.test(t)) return '아르바이트/홍보단/미화';
  return '기획계약직';
}
/* 달 중간 단가 변경: rec.chg = { day, payType, rate } → 1일~(day-1)일은 rec.payType·rate, day일~말일은 chg 값으로 나눠 계산
 * 일급 부분 = 그 기간 출근일 × 일급, 월급 부분 = 월급 × 그 기간 일수 / 그 달 일수 (달력 일수 기준) */
const payChg = (rec, dim) => { const c = rec && rec.chg; return c && toNum(c.day) >= 2 && toNum(c.day) <= dim && ['일급', '월급'].includes(c.payType) ? c : null; };
/* rec: 월별 인건비 기록, dim: 그 달 일수, attDays: 출근부 출근일수, attSplit: 변경일 앞·뒤 출근일수 { before, after } (단가 변경이 있을 때) */
function payCalc(rec, dim, attDays, autoOt, attSplit) {
  const workDays = rec.workDays === null || rec.workDays === undefined || rec.workDays === '' ? attDays : toNum(rec.workDays);
  const prorate = rec.prorate === null || rec.prorate === undefined || rec.prorate === '' ? dim : toNum(rec.prorate);
  let base = 0, split = null;
  const chg = ['일급', '월급', '정직원(손익만)'].includes(rec.payType) ? payChg(rec, dim) : null;
  if (chg) {   // 변경 있는 달: 출근부 날짜로 나눔 (근무일수·일할일수 칸은 쓰지 않음)
    const d = toNum(chg.day), sp = attSplit || { before: 0, after: attDays };
    const part = (type, rate, len, att) => ({ type, rate: toNum(rate), days: type === '일급' ? att : len, base: type === '일급' ? toNum(rate) * att : Math.round(toNum(rate) * len / dim) });
    split = { day: d, a: part(rec.payType === '일급' ? '일급' : '월급', rec.rate, d - 1, sp.before), b: part(chg.payType, chg.rate, dim - d + 1, sp.after) };
    base = split.a.base + split.b.base;
  }
  else if (rec.payType === '일급') base = toNum(rec.rate) * workDays;
  else if (rec.payType === '월급' || rec.payType === '정직원(손익만)') base = Math.round(toNum(rec.rate) * prorate / dim);
  const otHours = rec.otHours === null || rec.otHours === undefined || rec.otHours === '' ? (autoOt || 0) : toNum(rec.otHours);
  const ot = Math.round(toNum(rec.otRate) * otHours);
  const pay = base + ot;
  const mealDays = rec.mealDays === null || rec.mealDays === undefined || rec.mealDays === '' ? (toNum(rec.mealRate) < 0 ? workDays : 0) : toNum(rec.mealDays);
  const meal = toNum(rec.mealRate) * mealDays;
  const gross = pay + meal + toNum(rec.incentive);
  let tax = 0, local = 0, net = gross;
  if (rec.taxType === '3.3') { tax = Math.floor(gross * 0.03 / 10) * 10; local = Math.floor(tax * 0.1 / 10) * 10; net = gross - tax - local; }
  else if (rec.taxType === 'vat') { tax = Math.round(gross / 10); net = gross + tax; }
  return { workDays, prorate, otHours, mealDays, base, ot, pay, meal, gross, tax, local, net, split };
}

/* ================= 근태기록(얼굴인식 출근) 파싱 ================= */
const ROLE_WORDS = /(상담사|상담|도우미|큐레이터|스탭|스태프|운전자|아르바이트|알바|경호|미화|TM)/g;
function cleanPersonName(s) {
  return String(s || '').normalize('NFKC').replace(/\(.*?\)/g, ' ').replace(ROLE_WORDS, ' ').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean).sort((a, b) => b.length - a.length)[0] || '';
}
function parseHours(v) {
  const s = String(v ?? '').trim(); if (!s) return 0;
  const m = s.match(/^(\d{1,2}):(\d{2})/); if (m) return Number(m[1]) + Number(m[2]) / 60;
  const n = parseFloat(s); return isNaN(n) ? 0 : n;
}
/* 반환: [{date, name, rawName, id, dept, inT, outT, ot, note}] */
/* 출근부 표 엑셀: [구분][직책][성명][1][2]…[31][계] 형태 → 사람별 날짜 값 */
function parseAttGrid(aoa) {
  const rows = (aoa || []).map(r => (r || []));
  for (let h = 0; h < Math.min(rows.length, 15); h++) {
    const labels = rows[h].map(normLabel);
    const nameCol = labels.findIndex(l => l === '성명' || l === '이름');
    if (nameCol < 0) continue;
    const dayCol = {};
    labels.forEach((l, c) => { if (c > nameCol && /^\d{1,2}$/.test(l) && +l >= 1 && +l <= 31 && dayCol[+l] === undefined) dayCol[+l] = c; });
    if (Object.keys(dayCol).length < 28) continue;
    const teamCol = labels.findIndex((l, c) => c < nameCol && /^(구분|팀|부서|소속)$/.test(l));
    const titleCol = labels.findIndex((l, c) => c < nameCol && /^(직책|직급|직위)$/.test(l));
    const people = []; let team = '';
    for (let r = h + 1; r < rows.length; r++) {
      const row = rows[r];
      const name = String(row[nameCol] ?? '').normalize('NFKC').trim();
      if (teamCol >= 0 && String(row[teamCol] ?? '').trim()) team = String(row[teamCol]).trim();
      if (!name || /^(합계|계|소계|총계|인원)$/.test(name.replace(/\s/g, '')) || /^\d+$/.test(name)) continue;
      if (/합계|소계/.test(String(row[teamCol >= 0 ? teamCol : 0] ?? '')) && !name) continue;
      let title = titleCol >= 0 ? String(row[titleCol] ?? '').trim() : '';
      if (!title && nameCol - 1 >= 0 && nameCol - 1 !== teamCol) { const t = String(row[nameCol - 1] ?? '').trim(); if (/^[가-힣]{1,4}$/.test(t) && !/합계/.test(t)) title = t; }
      const days = {};
      Object.entries(dayCol).forEach(([d, c]) => {
        let v = row[c]; v = v === null || v === undefined ? '' : String(v).trim();
        if (v === '' || v === '0') return;
        if (/^1(\.0+)?$/.test(v)) v = '1';
        days[d] = v;
      });
      people.push({ team, title, name: cleanPersonName(name) || name, days });
    }
    // 몇 월 출근부인지: 제목의 "10월" 또는 머리글 근처 날짜
    let ym = '', mm = 0;
    for (let r = 0; r <= h + 1 && r < rows.length; r++) for (const v of rows[r]) {
      const t = String(v ?? '');
      const d = t.match(/^(20\d{2})-(\d{2})-\d{2}/); if (d && !ym) ym = `${d[1]}-${d[2]}`;
      const m = t.match(/(\d{1,2})\s*월\s*(기획|출근|근태|근무)?/); if (m && !mm && /출근|근태|근무/.test(t)) mm = +m[1];
    }
    return { ok: people.length > 0, people, ym, month: mm, dayCount: Object.keys(dayCol).length };
  }
  return { ok: false };
}
function parseAttendanceSheet(aoa) {
  let h = -1, c = {};
  for (let r = 0; r < Math.min(aoa.length, 20); r++) {
    const l = (aoa[r] || []).map(normLabel);
    if (l.includes('일자') && l.includes('성명') && (l.includes('출근') || l.includes('출근시간'))) {
      h = r;
      const f = (...names) => { for (const n of names) { const i = l.indexOf(n); if (i >= 0) return i; } return -1; };
      c = { date: f('일자', '날짜'), name: f('성명', '이름'), id: f('아이디', 'ID', '사번'), dept: f('부서', '소속'), inT: f('출근', '출근시간'), outT: f('퇴근', '퇴근시간'), ot: f('연장', '연장근무'), note: f('비고', '근태일정', '구분') };
      break;
    }
  }
  if (h < 0) return { ok: false, error: '머리글(일자/성명/출근)을 찾지 못했습니다.' };
  const out = [];
  for (let r = h + 1; r < aoa.length; r++) {
    const row = aoa[r] || []; const get = i => (i >= 0 ? String(row[i] ?? '').trim() : '');
    const d = parseDateCell(row[c.date]); const raw = get(c.name);
    if (!d || !raw) continue;
    const notes = [get(c.note)].concat(c.note >= 0 ? [] : []).filter(Boolean);
    const extraNote = (row.slice(c.note + 1) || []).map(x => String(x ?? '').trim()).filter(Boolean);
    out.push({ date: d.date, rawName: raw, name: cleanPersonName(raw), id: get(c.id), dept: get(c.dept).replace(/^-$/, ''), inT: get(c.inT), outT: get(c.outT), ot: parseHours(get(c.ot)), note: notes.concat(extraNote).join(' ') });
  }
  return { ok: true, rows: out };
}

/* 출근부 칸 값 → 출근 일수 (1, 0.5 … · 사진대체 · 체크누락 = 1) */
const ATT_PHOTO = '사진대체', ATT_MISS = '체크누락', ATT_LATE = '지각';   // 지각 = 출근으로 셈 (근태기록 시각이 없을 때 손으로 표시)
function attValue(v) { const s = String(v ?? '').trim(); if (/^\d+(\.\d+)?$/.test(s)) return Number(s); return s === ATT_PHOTO || s === ATT_MISS || s === ATT_LATE ? 1 : 0; }

/* ================= 노드 테스트용 내보내기 ================= */
if (typeof module !== 'undefined') {
  module.exports = { stripBizNo, memoRuleWarnings,attValue, parseDateCell, parseCardSheet, detectColumns, parseMeal, splitTop, numKor, guessCat, merchantKey, cleanMerchant, normCat, buildTasks, ymAdd, payCalc, guessPlGroup, parseAttendanceSheet, cleanPersonName, parseReceiptText, receiptScore, cardYm, labelYm, parseAttGrid, parseMemoRules, applyMemoRule, mealRateFor, parseRateRules };
}
