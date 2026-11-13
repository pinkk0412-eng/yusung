/* 유성 현장 관리 프로그램 — 현장/카드/직원 도우미, 경영지원 점검, IndexedDB, 공통 UI·화면 부품
 * (원래 app.js 의 화면 부분. 모든 js/*.js 는 같은 전역 공간을 공유하며 html 에 적힌 순서대로 읽힘) */
'use strict';

function rcCell(t) {
  const n = (t.receipts || []).length;
  return `<td class="center" style="white-space:nowrap">${n ? `<button class="btn sm" data-act="rcView" data-id="${t.id}" title="영수증 보기">🧾 ${n}</button>` : `<button class="btn ghost sm" data-act="rcAdd" data-id="${t.id}" title="영수증 사진 올리기 (파일을 이 줄에 끌어다 놓아도 됩니다)">＋</button>`}</td>`;
}

const site = () => db.sites.find(s => s.id === db.cur);
const siteCards = () => db.cards.filter(c => c.siteId === db.cur);
// 분류별 정렬: 유성 정직원 → 현장 인건비 → 시행사·시공사, 같은 분류 안에서는 구분(팀)끼리 모아서 (팀 순서·사람 순서는 등록 순)
const KIND_ORDER = { '정직원': 0, '현장': 1, '외부': 2 };
const DEFAULT_TEAM_ORDER = '기획, 상담사, TM, 경리, 아르바이트, 큐레이터';
function sortStaff(list) {
  // 설정의 "구분 정렬 순서"에 적힌 구분이 먼저 (이름에 포함되면 일치: 상담사팀 → 상담사), 나머지 구분은 그 뒤에 등록 순
  const order = String(db.settings.teamOrder ?? DEFAULT_TEAM_ORDER).split(/[,，>→\n-]+/).map(x => x.trim()).filter(Boolean);
  const rank = team => { const t = String(team || ''); const i = order.findIndex(o => t === o); const j = i >= 0 ? i : order.findIndex(o => t.includes(o)); return j >= 0 ? j : order.length; };
  const teamIdx = {}; list.forEach((s, i) => { const k = (s.kind || '') + '|' + (s.team || ''); if (teamIdx[k] === undefined) teamIdx[k] = i; });
  return list.map((s, i) => ({ s, i, k: KIND_ORDER[s.kind] ?? 1, r: rank(s.team), t: teamIdx[(s.kind || '') + '|' + (s.team || '')] }))
    .sort((a, b) => a.k - b.k || a.r - b.r || a.t - b.t || a.i - b.i).map(x => x.s);
}
const siteStaff = (all) => sortStaff(db.staff.filter(s => s.siteId === db.cur && (all || s.active !== false)));
// 빠른 입력 버튼: 직접 체크한 값 우선, 없으면 정직원·시행사/시공사·기획·경리만
const isQuick = s => s.quick !== undefined ? !!s.quick : (s.kind === '정직원' || s.kind === '외부' || /기획|경리|시행|시공/.test(s.team || ''));
const quickChips = () => { const q = siteStaff().filter(isQuick); return q.map(s => `<button class="chip" data-act="chip" data-v="${esc(s.name)}">${esc(s.name)}</button>`).join('') || '<span class="muted">설정 → 직원에서 "빠른입력"을 체크한 사람이 여기 나옵니다.</span>'; };
// 시행사 청구(법인카드 "청구" 체크): 현장 설정값 우선, 없으면 이미 체크한 내역이 있는 현장만
const claimOn = () => { const s = site(); return s.claimOn !== undefined ? !!s.claimOn : db.tx.some(t => t.siteId === db.cur && t.claim); };
const workStaff = all =>siteStaff(all).filter(s => s.kind !== '외부');   // 출근부·인건비 대상 (시행사·시공사 제외)
// 법인카드는 사용기간(설정의 시작일, 예: 3일~다음달 2일) 기준 귀속월. 장부에서 가져온 귀속월(t.bm)이 있으면 그것 우선
const cardStartSet = sid => Math.min(28, Math.max(1, toNum((db.sites.find(s => s.id === sid) || {}).cardStartDay) || 3));   // 정산 기준(설정). 기본: 3일 ~ 다음달 2일
// 카드사 엑셀은 한 달에 두 번 받음 (월초: 1일~말일, 20일쯤: 3일~익월2일). 법인카드 탭의 [1일~말일] 보기를 켜면 그 탭(목록·집계·인쇄·가져오기)만 달력 월로 봄
const cardCalView = () => !!state.cardCal && state.tab === 'card';
const cardStart = sid => (cardCalView() ? 1 : cardStartSet(sid));
const txYm = t => (t.src === 'card' && cardCalView() ? ymOf(t.date) : t.bm || (t.src === 'card' ? cardYm(t.date, cardStart(t.siteId)) : ymOf(t.date)));
const cardPeriod = (ym, sid = db.cur) => { const st = cardStart(sid); return st > 1 ? `${ym}-${pad2(st)} ~ ${ymAdd(ym, 1)}-${pad2(st - 1)}` : `${ym}-01 ~ ${ym}-${daysIn(ym)}`; };
const txOf = (ym, src, sid = db.cur) => db.tx.filter(t => t.siteId === sid && t.src === src && txYm(t) === ym);
const txById = id => db.tx.find(x => x.id === id);

/* ---------- 경영지원 점검: 사용내역 규칙 · 식대 초과 · 캐터링 중복 · 입고사진 · 20만원 이상 ---------- */
const memoWarns = t => (t.warnOk ? [] : memoRuleWarnings(t));
/* 구분별 식대 단가 하나로: 인건비 식대단가 기본값 = 식대 1인 한도 (예전 "구분별 식대 단가"(mealRates)는 normalizeDb 에서 합침) */
/* 현장마다 다름: 현장 정보(st.mealLimits · mealLimitDefault · mealLimitStaff)에 저장 → 현장설정.txt. 없으면 예전 공통 설정값 */
function mealCfg(st) {
  st = st || site(); const g = db.settings;
  return { rules: parseRateRules(st.mealLimits ?? g.mealLimits ?? DEFAULT_MEAL_LIMITS), def: toNum(st.mealLimitDefault ?? g.mealLimitDefault ?? 9000), staff: toNum(st.mealLimitStaff ?? g.mealLimitStaff ?? 12000) };
}
const mealCfgOf = sid => mealCfg(db.sites.find(x => x.id === sid));
const mealRules = st => mealCfg(st).rules;
function mealInfo(t) {   // 식대 1인 한도: 사용내역의 이름마다 (유성 정직원 1만2천 · 기획·경리 9천 · 상담사·알바 7천), 이름을 모르는 인원은 기본 한도
  if (t.kind === 'in' || t.cat !== '식대' || !toNum(t.amount)) return null;
  const staff = db.staff.filter(x => x.siteId === t.siteId), p = parseMeal(t.memo, staff.map(x => x.name));
  const mc = mealCfgOf(t.siteId), rules = mc.rules, def = mc.def;
  let limit = 0;
  const hq = mc.staff;   // 유성 정직원(본사) = 1만2천
  // 시행사·시공사 동석 식사(예: ○○건설(이영희) · 시행사·시공사로 등록한 사람)는 한도 확인 안 함 (전 현장 공통 규칙)
  const guest = /[^/,，]+\([^)]*\)/.test(String(t.memo || '').replace(/^[^/]{1,6}\//, '')) || p.matched.some(n => (staff.find(y => y.name === n) || {}).kind === '외부');
  if (guest) return { count: p.count, share: t.amount / p.count, limit: 0, over: false, guest: true, overAmt: 0 };
  p.matched.forEach(n => { const x = staff.find(y => y.name === n); const r = x ? (x.kind === '정직원' || x.kind === '외부' ? hq : mealRateFor(x.team, rules)) : null; limit += r !== null && r > 0 ? r : def; });
  limit += Math.max(0, p.count - p.matched.length) * def;
  return { count: p.count, share: t.amount / p.count, limit, over: limit > 0 && Math.round(t.amount) > limit, overAmt: Math.round(t.amount - limit) };
}
function caterDup(t) {   // 캐터링 중식을 주문한 날 법카·전도금으로 중식
  if (t.kind === 'in' || t.cat !== '식대' || !t.date) return false;
  const kind = (String(t.memo || '').match(/^([^/]{1,6})\//) || [])[1] || '';
  const hh = t.time ? +String(t.time).slice(0, 2) : -1;
  if (!(/중식|점심/.test(kind) || (!kind && hh >= 10 && hh < 15))) return false;
  const c = ((db.catering[t.siteId] || {})[ymOf(t.date)] || {}).days || {};
  return toNum((c[+t.date.slice(8, 10)] || {}).l) > 0;
}
const PHOTO_CATS = ['소모품비'];   // 입고 사진이 필요한 세목 (비품·소모품)
const needPhoto = t => t.kind !== 'in' && PHOTO_CATS.includes(t.cat) && !t.photoNa;
const U200 = 200000;
const isU200 = t => t.src === 'card' && t.kind !== 'in' && toNum(t.amount) >= U200;
const u200Done = t => !!(t.u200 && String(t.u200.purpose || '').trim() && String(t.u200.attendees || '').trim());
// 내역 줄 아래 점검 표시 (사용내역 칸 아래)
function txNote(t) {
  if (t.kind === 'in') return '';
  const out = [], id = t.id;
  const w = memoWarns(t);
  if (w.length) out.push(`<span class="mw warn" title="${esc(w.join('\n'))}">⚠ ${esc(w[0])}${w.length > 1 ? ` 외 ${w.length - 1}건` : ''}</span><button class="lnk" data-act="txWarnOk" data-id="${id}" title="확인했으면 경고를 지웁니다">괜찮음</button>`);
  const m = mealInfo(t);
  if (m && m.over) out.push(`<span class="mw ${t.overReason ? 'ok' : 'warn'}" title="1인 ${fmt(m.share)}원 · ${m.count}명 식대 단가 합계 ${fmt(m.limit)}원">식대 초과 ${fmt(m.overAmt)}원${t.overReason ? ` · 사유: ${esc(t.overReason)}` : ''}</span><button class="lnk" data-act="txOver" data-id="${id}">${t.overReason ? '사유 고치기' : '초과 사유 쓰기'}</button>`);
  if (caterDup(t)) out.push(`<span class="mw ${t.caterOk ? 'ok' : 'warn'}" title="같은 날 캐터링 중식을 주문했습니다 — 같은 사람이 두 번 먹지 않았는지 확인">캐터링 주문한 날 중식${t.caterOk ? ` · ${esc(t.caterOk)}` : ''}</span><button class="lnk" data-act="txCater" data-id="${id}">${t.caterOk ? '고치기' : '확인'}</button>`);
  if (isU200(t)) out.push(`<span class="mw ${u200Done(t) ? 'ok' : 'warn'}">20만원 이상 · 사용내역서 ${u200Done(t) ? '작성됨' : '필요'}</span><button class="lnk" data-act="u200Edit" data-id="${id}">${u200Done(t) ? '보기·인쇄' : '작성'}</button>`);
  const np = (t.photos || []).length;
  if (needPhoto(t) || np) out.push(`<span class="mw ${np ? 'ok' : 'warn'}">입고사진 ${np ? np + '장' : '없음'}</span>${np ? `<button class="lnk" data-act="photoView" data-id="${id}">보기</button>` : ''}<button class="lnk" data-act="photoAdd" data-id="${id}">+ 사진</button>${np ? '' : `<button class="lnk" data-act="photoNa" data-id="${id}" title="비품·소모품이 아니면">필요 없음</button>`}`);
  else if (t.photoNa && PHOTO_CATS.includes(t.cat)) out.push(`<span class="mw">입고사진 해당 없음</span><button class="lnk" data-act="photoNa" data-id="${id}">되돌리기</button>`);
  return out.length ? `<div class="txnote">${out.map(x => `<span class="mwg">${x}</span>`).join('')}</div>` : '';
}

/* ---------- IndexedDB (데이터 파일 핸들 보관) ---------- */
const idb = {
  open() { return new Promise((res, rej) => { const r = indexedDB.open('gyeongri', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); },
  async get(k) { try { const d = await this.open(); return await new Promise(res => { const q = d.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => res(q.result); q.onerror = () => res(undefined); }); } catch (e) { return undefined; } },
  async set(k, v) { try { const d = await this.open(); await new Promise(res => { const t = d.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = res; t.onerror = res; }); } catch (e) { } },
};

/* ---------- 공통 UI ---------- */
function toast(msg) {
  const el = document.createElement('div'); el.className = 'toast'; el.textContent = msg;
  document.body.appendChild(el); setTimeout(() => el.remove(), 2600);
}
/* 창 크기(size): 's' 560px = 확인·짧은 입력 · 'm' 720px = 입력칸 몇 개 · 안 적으면 960px = 표·긴 내용 · 'xl' 1150px = 편집기·사진
   (창마다 폭을 따로 정하지 말고 이 네 가지 중에서 고름 — 이미 연 창은 modalSize(root, 'm')) */
function modal(title, bodyHtml, buttons, size) {
  const root = $('#modalRoot');
  root.innerHTML = `<div class="modal-bg"><div class="modal${size ? ` sz-${size}` : ''}"><h3>${esc(title)}</h3><div class="mbody">${bodyHtml}</div>
      <div class="actions">${buttons.map((b, i) => `<button class="btn ${b.cls || ''}" data-mi="${i}">${esc(b.label)}</button>`).join('')}</div></div></div>`;
  root.querySelectorAll('[data-mi]').forEach(btn => btn.onclick = async () => {
    const b = buttons[+btn.dataset.mi];
    const keep = b.onClick ? await b.onClick(root) : false;
    if (keep !== true) { root.innerHTML = ''; state.rcModalTx = null; }
  });
  return root;
}
const modalSize = (root, size) => { const m = root && root.querySelector('.modal'); if (m) m.classList.add(`sz-${size}`); return root; };
const closeModal = () => { $('#modalRoot').innerHTML = ''; state.rcModalTx = null; };
function pickFile(accept, multiple) {
  if (window.__testPick) return Promise.resolve(window.__testPick(accept));   // 점검용
  return new Promise(res => {
    const inp = $('#fileInput'); inp.value = ''; inp.accept = accept || ''; inp.multiple = !!multiple;
    inp.onchange = () => res([...inp.files]); inp.click();
  });
}
function download(name, text, type = 'application/json') {
  const a = document.createElement('a'), blob = new Blob([text], { type }); window.__lastDownload = { name, blob };   // __lastDownload: 점검용
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
const catOptions = (cur) => `<option value="">— 미분류 —</option>` + CATS.map(c =>
  `<optgroup label="${c.g}">${c.s.map(s => `<option ${s === cur ? 'selected' : ''}>${s}</option>`).join('')}</optgroup>`).join('');

/* ---------- 기간 달력 (항공권처럼 시작일 → 종료일 차례로 누름) ----------
   <input type="date" data-rng="from"> … <input type="date" data-rng="to"> : 둘이 짝 (from 바로 뒤의 to)
   <input data-rng="text"> : 한 칸에 "2026.09.16.~2026.09.30." 로 넣음 */
const RNG = { el: null, st: null };
const rngYmd = s => { const m = String(s || '').match(/(20\d{2}|\d{2})\D{1,3}(\d{1,2})\D{1,3}(\d{1,2})/); return m ? `${m[1].length === 2 ? '20' + m[1] : m[1]}-${pad2(+m[2])}-${pad2(+m[3])}` : ''; };
const rngDot = s => s ? s.replace(/-/g, '.') + '.' : '';
const rngYy = s => s ? `'${s.slice(2).replace(/-/g, '.')}` : '';   // data-rng-fmt="yy" : '26.08.01 (월결제 사용기간)
const rngWd = s => '일월화수목금토'[new Date(s + 'T00:00').getDay()];
// <input data-rng="one" data-a="숨은 시작 id" data-b="숨은 끝 id" readonly> : 한 칸에 "시작 ~ 끝" 보여 주고 값은 숨은 칸 둘에 (자산 입고~반납)
const rngShow = (a, b, none = '') => a ? `${rngDot(a)} ~ ${b ? rngDot(b) : none}` : '';
function rngPair(inp) {
  const k = inp.dataset.rng; if (k === 'text') return { text: inp };
  if (k === 'one') { const box = inp.closest('.modal, form, .panel') || document; return { from: box.querySelector('#' + inp.dataset.a), to: box.querySelector('#' + inp.dataset.b), show: inp }; }
  const all = [...document.querySelectorAll('input[data-rng]')], i = all.indexOf(inp);
  if (k === 'from') { const t = all[i + 1]; return { from: inp, to: t && t.dataset.rng === 'to' ? t : null }; }
  const f = all[i - 1]; return { from: f && f.dataset.rng === 'from' ? f : null, to: inp };
}
function rngOpen(inp) {
  rngClose();
  const p = rngPair(inp); let a, b;
  if (p.text) { const m = String(inp.value || '').split('~'); a = rngYmd(m[0]); b = rngYmd(m[1]); }
  else { a = (p.from || {}).value || ''; b = (p.to || {}).value || ''; }
  const phase = (inp.dataset.rng === 'to' || inp.dataset.rng === 'one' && !b) && a ? 'b' : 'a', base = (phase === 'b' ? b || a : a) || todayStr();
  RNG.st = { p, inp, a, b, phase, hover: '', y: +base.slice(0, 4), m: +base.slice(5, 7) - 1 };
  const el = RNG.el = document.createElement('div'); el.className = 'rng-pop';
  el.onmousedown = e => e.preventDefault();
  el.onclick = rngClick;
  el.onmouseover = e => { const d = e.target.closest('[data-d]'); const h = d ? d.dataset.d : ''; if (RNG.st.phase === 'b' && h !== RNG.st.hover) { RNG.st.hover = h; rngDraw(); } };
  document.body.appendChild(el); rngDraw();
}
function rngClose() { if (RNG.el) RNG.el.remove(); RNG.el = null; RNG.st = null; }
function rngMonth(y, m) {
  const s = RNG.st, first = new Date(y, m, 1), dim = new Date(y, m + 1, 0).getDate(), lo = s.a, hi = s.b || (s.phase === 'b' && s.hover > s.a ? s.hover : '');
  let h = `<div class="rng-mon"><div class="rng-mt">${y}년 ${m + 1}월</div><div class="rng-g">${[...'일월화수목금토'].map((w, i) => `<b class="${i === 0 ? 'sun' : i === 6 ? 'sat' : ''}">${w}</b>`).join('')}`;
  h += '<i></i>'.repeat(first.getDay());
  for (let d = 1; d <= dim; d++) {
    const ds = `${y}-${pad2(m + 1)}-${pad2(d)}`, wd = (first.getDay() + d - 1) % 7, hol = holidayName(ds);
    const c = [wd === 0 || hol ? 'sun' : wd === 6 ? 'sat' : '', ds === todayStr() ? 'today' : '', ds === lo ? 'sa' : '', ds === hi ? 'sb' : '', lo && hi && ds > lo && ds < hi ? 'in' : ''].filter(Boolean).join(' ');
    h += `<button type="button" data-d="${ds}" class="${c}" title="${esc(hol || '')}">${d}</button>`;
  }
  return h + '</div></div>';
}
function rngDraw() {
  const s = RNG.st, el = RNG.el; if (!s || !el) return;
  const two = innerWidth >= 640, y2 = s.m === 11 ? s.y + 1 : s.y, m2 = (s.m + 1) % 12;
  const L = s.p.show ? [s.p.show.dataset.la || '시작일', s.p.show.dataset.lb || '종료일'] : ['시작일', '종료일'];
  const box = (k, label, v) => `<div class="rng-box ${s.phase === k ? 'on' : ''}" data-ph="${k}"><span>${label}</span><b>${v ? `${rngDot(v)} (${rngWd(v)})` : '선택'}</b></div>`;
  const days = s.a && s.b ? Math.round((new Date(s.b) - new Date(s.a)) / 864e5) + 1 : 0;
  el.innerHTML = `<div class="rng-head">${box('a', L[0], s.a)}<span class="rng-arr">→</span>${box('b', L[1], s.b)}${days ? `<span class="muted small">${days}일</span>` : ''}</div>
    <div class="rng-body"><button type="button" class="rng-nav" data-nav="-1" title="이전 달">‹</button>${rngMonth(s.y, s.m)}${two ? rngMonth(y2, m2) : ''}<button type="button" class="rng-nav" data-nav="1" title="다음 달">›</button></div>
    <div class="rng-foot"><span class="muted small">${s.phase === 'a' ? L[0] + '을 누르세요' : L[1] + '을 누르세요 (같은 날을 누르면 하루)'}</span><span class="grow"></span>
      <button type="button" class="btn sm" data-q="m0">이번 달</button><button type="button" class="btn sm" data-q="m-1">지난 달</button><button type="button" class="btn sm" data-q="h1">1~15일</button><button type="button" class="btn sm" data-q="h2">16일~말일</button>
      ${s.p.show && s.a ? `<button type="button" class="btn sm" data-q="nob">${L[1]} 없음</button>` : ''}<button type="button" class="btn sm" data-q="clr">지우기</button><button type="button" class="btn sm" data-q="x">닫기</button></div>`;
  rngPlace();
}
function rngPlace() {
  const s = RNG.st, el = RNG.el; if (!s || !el) return;
  if (!s.inp.isConnected) return rngClose();
  const r = s.inp.getBoundingClientRect(), w = el.offsetWidth, h = el.offsetHeight;
  let top = r.bottom + 4; if (top + h > innerHeight - 8 && r.top - h - 4 > 8) top = r.top - h - 4;
  el.style.top = Math.max(8, top) + 'px'; el.style.left = Math.max(8, Math.min(r.left, innerWidth - w - 8)) + 'px';
}
function rngClick(e) {
  const s = RNG.st, t = e.target.closest('[data-d],[data-nav],[data-q],[data-ph]'); if (!s || !t) return;
  if (t.dataset.nav) { const n = new Date(s.y, s.m + +t.dataset.nav, 1); s.y = n.getFullYear(); s.m = n.getMonth(); return rngDraw(); }
  if (t.dataset.ph) { if (t.dataset.ph === 'a' || s.a) s.phase = t.dataset.ph; return rngDraw(); }
  if (t.dataset.d) {
    const d = t.dataset.d;
    if (s.phase === 'a' || d < s.a) { s.a = d; s.b = ''; s.phase = 'b'; if (s.p.show) { s.p.from.value = d; s.p.to.value = ''; s.p.show.value = rngShow(d, '', s.p.show.dataset.none || ''); } return rngDraw(); }   // 한 칸(one): 시작만 골라도 저장
    s.b = d; return rngApply();
  }
  const q = t.dataset.q; if (q === 'x') return rngClose();
  if (q === 'nob') { s.b = ''; return rngApply(); }
  if (q === 'clr') { s.a = s.b = ''; return rngApply(); }
  const y = s.y, m = s.m + (q === 'm-1' ? -1 : 0), f = new Date(y, m, 1), ym = `${f.getFullYear()}-${pad2(f.getMonth() + 1)}`, end = new Date(f.getFullYear(), f.getMonth() + 1, 0).getDate();
  if (q === 'm0' || q === 'm-1') { if (q === 'm0' && !(s.a || s.b)) { const t0 = todayStr().slice(0, 7); s.a = t0 + '-01'; s.b = t0 + '-' + pad2(new Date(+t0.slice(0, 4), +t0.slice(5, 7), 0).getDate()); } else { s.a = ym + '-01'; s.b = ym + '-' + pad2(end); } }
  if (q === 'h1') { s.a = ym + '-01'; s.b = ym + '-15'; }
  if (q === 'h2') { s.a = ym + '-16'; s.b = ym + '-' + pad2(end); }
  rngApply();
}
function rngApply() {
  const s = RNG.st, fire = el => { el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
  const set = (el, v) => { if (el) { el.value = v; fire(el); } };
  const f = s.p.text && s.p.text.dataset.rngFmt === 'yy' ? rngYy : rngDot;
  if (s.p.text) set(s.p.text, !s.a ? '' : !s.b || s.b === s.a ? f(s.a) : `${f(s.a)}~${f(s.b)}`);   // 하루면 날짜 하나만
  else if (s.p.show) { set(s.p.from, s.a); set(s.p.to, s.b); s.p.show.value = rngShow(s.a, s.b, s.p.show.dataset.none || ''); }
  else { set(s.p.from, s.a); set(s.p.to, s.p.from ? s.b : s.b || s.a); }
  rngClose();
}
document.addEventListener('click', e => { const inp = e.target.closest && e.target.closest('input[data-rng]'); if (inp && !inp.disabled && (!inp.readOnly || inp.dataset.rng === 'one') && (!RNG.st || RNG.st.inp !== inp)) rngOpen(inp); }, true);
document.addEventListener('mousedown', e => { if (RNG.el && !RNG.el.contains(e.target) && e.target !== (RNG.st || {}).inp) rngClose(); }, true);
document.addEventListener('keydown', e => { if (e.key === 'Escape' && RNG.el) { e.stopPropagation(); rngClose(); } }, true);
addEventListener('scroll', () => rngPlace(), true); addEventListener('resize', () => rngDraw());

/* ---------- 화면 부품 ---------- */
// 머리: 제목·부제 왼쪽, 버튼 오른쪽 (자주 쓰는 것만 버튼, 나머지는 "인쇄 ▾" 같은 메뉴로)
const TAB_GUIDE = {
  card: '엑셀 불러오기 → 세목·사용내역 → 영수증',
  cash: '지출 입력 → 영수증·사진 → 청구서',
  meal: '출근부 → 인건비 반영 요약',
  cater: '식대: 카드·전도금 식대 확인 · 캐터링: 주문 수량 → 월결제 반영',
  pay: '출근·식대 확인 → 청구서 인쇄',
  monthly: '금액 입력 → 증빙 확인 → 마감',
  pumui: '작성 → 결재 → 스캔본 올리기',
  bill: '청구 추가 → 공문 → 세금계산서 → 입금 확인',
  asset: '구입·임차·소모품 등록 → 상태 관리 → 철수 때 회수 리스트',
  settings: '현장 정보 → 직원·카드 → 정산 기한',
};
const pageHead = (title, sub, actions) => `<div class="phd"><div class="phd-t"><h2>${title}</h2>${sub ? `<div class="phd-sub">${sub}</div>` : ''}${TAB_GUIDE[state.tab] ? `<div class="phd-guide">${TAB_GUIDE[state.tab]}</div>` : ''}</div><div class="phd-a">${actions || ''}</div></div>`;
const BTN = (act, label, attrs = '', cls = '') => `<button class="btn ${cls}" data-act="${act}" ${attrs}>${label}</button>`;
const MENU = (label, items) => `<details class="dd"><summary class="btn">${label} <span class="dd-car">▾</span></summary><div class="dd-m">${items.filter(Boolean).join('')}</div></details>`;
const MI = (act, label, attrs = '', hint = '') => `<button class="dd-i" data-act="${act}" ${attrs}><span>${label}</span>${hint ? `<small>${hint}</small>` : ''}</button>`;
/* 빠른 입력 버튼 — 사람마다(이 PC 브라우저에만) 고침: tpls = 버튼 글 목록 (끝이 / 면 말머리), names = 직원 이름 버튼도 보이기 (17 ACT.qbSet) */
const QB_KEY = 'yusung_quickbar_v1';
const qbOpt = () => { try { const o = JSON.parse(localStorage.getItem(QB_KEY)); if (o && Array.isArray(o.tpls)) return o; } catch (e) { } return null; };
const qbSave = o => { try { if (o) localStorage.setItem(QB_KEY, JSON.stringify(o)); else localStorage.removeItem(QB_KEY); } catch (e) { toast('이 브라우저에 저장하지 못했습니다.'); } };
const quickBar = (tpls, right = '') => {   // right: 오른쪽 끝에 붙일 버튼 (법인카드 선택 삭제)
  const o = qbOpt(), T = o ? o.tpls : tpls;
  return `<div class="quickbar"><span class="qb-l">빠른 입력</span>${T.map(x => `<button class="chip tpl" data-act="chip" data-v="${esc(x)}">${esc(x)}</button>`).join('')}${!o || o.names !== false ? `<span class="qb-sep"></span>${quickChips()}` : ''}
    <button class="btn ghost sm" data-act="qbSet" title="빠른 입력 버튼 고치기 (이 PC에서 나만)">⚙</button><span class="qb-h" title="사용내역 칸에 커서가 있으면 그 줄에 넣고, 아무 칸도 안 골랐으면 새 지출을 만듭니다">사용내역 칸을 누른 뒤 클릭 · 안 고르면 새 지출</span>${right}</div>`;
};
// 증빙 파일 + 결재받은 스캔본 → "파일 보관" 한 칸 (접기)
function filesPanel(kind, hint, scanKeys) {
  const all = (db.attach[db.cur] || {})[state.ym] || [];
  const list = all.filter(a => a.kind === kind), sc = scanKeys.map(k => [k, all.filter(a => a.kind === 'scan_' + k).length]), ns = sum(sc, x => x[1]);
  return `<details class="panel files"${list.length || ns ? ' open' : ''}><summary><b>파일 보관</b> <span class="muted small">증빙 ${list.length}개 · 결재받은 스캔본 ${ns}개 — 눌러서 열기</span></summary>
      <div class="files-g">
        <div><div class="fg-h">증빙 파일 <span class="muted">${esc(hint)}</span></div><div class="muted small">${esc(site().folder || '')}/${esc(attachDir(kind, state.ym))}</div>
          <div class="row" style="margin-top:6px">${BTN('attAdd', '+ 파일 올리기', `data-kind="${kind}"`, 'sm')}${list.length ? BTN('attView', `보기 ${list.length}`, `data-kind="${kind}"`, 'sm') : ''}</div></div>
        <div><div class="fg-h">결재받은 스캔본</div><div class="muted small">${esc(site().folder || '')}/${esc(DIR.fund)}/ 스캔 폴더</div>
          <div class="row" style="margin-top:6px">${sc.map(([k, c]) => BTN('attAdd', `+ ${esc(SCAN_LABEL[k])}`, `data-kind="scan_${k}" title="${esc(DIR.scan[k])}"`, 'sm') + (c ? BTN('attView', `보기 ${c}`, `data-kind="scan_${k}"`, 'sm ghost') : '')).join('')}</div></div></div></details>`;
}

/* 표 머리줄 틀 고정 (전체 화면 공통): 화면을 내려도 위 막대 바로 아래에 머리줄이 보이게.
   표가 가로 스크롤 상자(.tbl-wrap) 안에 있으면 그 상자 기준으로 붙으므로, 상자 위쪽이 화면 위로 지나가면 그만큼 내려 줌 (--sh) */
function stickyHeads() {
  if (!view) return;
  let cover = 0;   // 화면 위에 붙어 있는 막대(위 막대·휴대폰 메뉴·빠른 입력)의 아래 끝
  document.querySelectorAll('.topbar, #tabs, .quickbar').forEach(el => {
    const p = getComputedStyle(el).position; if (p !== 'sticky' && p !== 'fixed') return;
    const r = el.getBoundingClientRect(); if (r.width < innerWidth / 2 || r.top > cover + 1 || r.bottom <= cover) return;
    cover = r.bottom;
  });
  view.querySelectorAll('table.t > thead').forEach(h => {
    const t = h.parentElement;
    if (t._sc === undefined) { t._sc = null; for (let c = t.parentElement; c && c !== view; c = c.parentElement) { const s = getComputedStyle(c); if (/auto|scroll|hidden/.test(s.overflowX + s.overflowY)) { t._sc = c; break; } } }
    const c = t._sc, sh = c ? Math.max(0, cover - c.getBoundingClientRect().top - c.clientTop) : cover, v = `${Math.round(sh)}px`;
    if (t.style.getPropertyValue('--sh') !== v) t.style.setProperty('--sh', v);
  });
}
/* 화면 나누기 (data-frame 표 상자): 위 = 메뉴(제목·탭·버튼, 그대로) / 아래 = 표 상자가 창 바닥까지 채우고 그 안에서 위아래·옆으로 넘김
   → 페이지는 안 넘어가고, 가로·세로 스크롤 막대가 늘 창 안에 보임 (body.frame-view = 아래 여백 없앰) */
function frameWraps() {
  const w = view.querySelector('.tbl-wrap[data-frame]');
  document.body.classList.toggle('frame-view', !!w);
  if (!w) return;
  const top = w.getBoundingClientRect().top + scrollY;
  w.style.height = `${Math.max(260, Math.floor(innerHeight - top - 10))}px`;
}
window.addEventListener('resize', () => frameWraps());
let stickyRaf = 0;
const stickyLater = () => { if (!stickyRaf) stickyRaf = requestAnimationFrame(() => { stickyRaf = 0; stickyHeads(); }); };
window.addEventListener('scroll', stickyLater, { passive: true });
window.addEventListener('resize', stickyLater);
