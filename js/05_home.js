/* 유성 현장 관리 프로그램 — 렌더 루프, 상단바, 업무 홈
 * (원래 app.js 의 화면 부분. 모든 js/*.js 는 같은 전역 공간을 공유하며 html 에 적힌 순서대로 읽힘) */
'use strict';


/* ---------- 렌더 ---------- */
let renderTimer = null;
const VIEW_SESSION_KEY = 'yusung_current_view';
function saveCurrentView() {
  try {
    const route = { tab: state.tab, ym: state.ym };
    if (state.tab === 'settings' && state.setSub) route.setSub = state.setSub;
    if (state.tab === 'meal' || state.tab === 'cater') { route.mealSub = state.mealSub; if (state.mealGroup) route.mealGroup = state.mealGroup; if (state.caterSub) route.caterSub = state.caterSub; }
    sessionStorage.setItem(VIEW_SESSION_KEY, JSON.stringify(route));
  } catch (e) { }
}
function scheduleRender() { clearTimeout(renderTimer); renderTimer = setTimeout(render, 0); }
function render() {
  const ae = document.activeElement;
  const fid = ae && ae.dataset ? ae.dataset.fid : null;
  const scrollY = window.scrollY;
  if (!FS.ready) { document.body.classList.add('data-gate'); view.innerHTML = state.bgSolo ? viewBudgetSolo() : gateView(); /* 14c 예산안만 작성 (폴더 없이) */ document.querySelector('#tabs').style.visibility = 'hidden'; document.querySelectorAll('.topbar .field-inline').forEach(x => x.style.visibility = 'hidden'); frameWraps(); stickyHeads(); return; }
  document.body.classList.remove('data-gate');
  document.querySelector('#tabs').style.visibility = '';
  document.querySelectorAll('.topbar .field-inline').forEach(x => x.style.visibility = '');
  if (state.tab === 'pl') { state.tab = 'budget'; state.bgSub = 'pl'; }   // 현장 손익은 14c 예산·손익 탭 안의 보기 (예전 링크·잠금 해제 후 이동)
  if (hiddenTab(state.tab)) state.tab = 'home';
  saveCurrentView();
  renderTop();
  const fn = VIEWS[state.tab] || VIEWS.home;
  // 넓은 표의 가로 스크롤: 같은 화면을 다시 그릴 때는 그 자리 그대로, 화면이 바뀌면 처음 위치 (data-scroll-end 표는 오른쪽 끝 = 최근 달)
  const vkey = [state.tab, db.cur, state.ym, state.mealGroup, state.mealSub, state.caterSub, state.monthlyView, state.monthlyYEnd, state.setSub, state.bgSub].join('|');
  const keepX = vkey === render.vkey ? [...view.querySelectorAll('.tbl-wrap')].map(w => [w.scrollLeft, w.scrollTop]) : null;   // 표 상자 안 위아래 위치도 그대로
  render.vkey = vkey;
  view.innerHTML = conflictBanner() + fn();
  frameWraps();   // 04 화면 나누기 (메뉴 / 표가 창 바닥까지)
  view.querySelectorAll('.tbl-wrap').forEach((w, i) => { if (keepX) { if (keepX[i]) { w.scrollLeft = keepX[i][0]; w.scrollTop = keepX[i][1]; } } else if (w.hasAttribute('data-scroll-end')) w.scrollLeft = w.scrollWidth; });
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === state.tab));
  if (fid) { const el = view.querySelector(`[data-fid="${CSS.escape(fid)}"]`); if (el) { el.focus(); if (el.select && el.type !== 'checkbox' && el.tagName === 'INPUT') try { el.select(); } catch (e) { } } }
  window.scrollTo(0, scrollY);
  stickyHeads();   // 04 머리줄 틀 고정
}
function gateView() {
  const api = !!window.showDirectoryPicker;
  let old = null; try { old = JSON.parse(localStorage.getItem(STORE_KEY)); } catch (e) { }
  return `<div class="panel" style="max-width:760px;margin:30px auto">
      <h2>데이터 폴더 연결</h2>
      <p>이 프로그램은 자료를 <b>PC의 폴더에 파일로</b> 저장합니다. <b>회사가 만들어 둔 현장 폴더</b>를 골라 연결하면, 월별 자료와 영수증 사진이 그 폴더 안에 보관됩니다.</p>
      <pre class="small" style="background:#f7f8fa;border:1px solid var(--line);border-radius:6px;padding:10px;overflow-x:auto">📁 데이터 폴더 = 현장 폴더들이 들어 있는 폴더 (예: Dropbox)
 ├ 공통설정.txt
 ├ 📁 132. 수지 자이 에디시온    (회사가 만든 현장 폴더 → 프로그램에서 연결)
 │  ├ 현장설정.txt               현장정보·결재라인·카드·직원·거래처
 │  ├ 📁 A. 기안품의             C. 작성완료(엑셀) · A. 결재완료 · B. 스캔본
 │  ├ 📁 B. 자금관련
 │  │  ├ 📁 26년 08월 서류철     데이터.txt · 📁 영수증 · 📁 증빙(카드 명세서 PDF 등)
 │  │  └ 📁 A~F. … 스캔         법인카드 사용내역서(20만원 이상)·법인카드 정산·선결제·월결제·인건비·전도금 정산
 │  ├ 📁 C. 근무이행각서  📁 D. 기타(휴가계 등)
 └ 📁 다른 현장 …</pre>
      ${api ? `<div class="row">${state.savedRootName ? `<button class="btn primary" data-act="fsReopen">📁 "${esc(state.savedRootName)}" 폴더 열기</button>` : ''}
        <button class="btn ${state.savedRootName ? '' : 'primary'}" data-act="fsPick">데이터 폴더 선택…</button></div>
        <p class="muted small">현장 폴더들이 들어 있는 폴더(예: <b>Dropbox</b>)를 고르세요. "파일 수정 허용"을 물으면 <b>허용</b>.</p>
        ${old && old.sites && old.sites.length ? `<div class="banner info small">이 PC에 예전 자료가 있습니다. 빈 폴더를 고르면 그리로 옮깁니다.</div>` : ''}`
      : `<div class="banner warn">이 브라우저는 폴더 저장을 지원하지 않습니다. <b>크롬</b> 또는 <b>엣지</b>로 "유성 현장 관리 프로그램.html"을 열어 주세요.</div>`}
    </div>
    <div class="panel" style="max-width:760px;margin:0 auto 30px"><div class="row"><div class="grow"><h3 style="margin:0">예산안만 작성</h3>
      <p class="muted small" style="margin:4px 0 0">데이터 폴더 없이 예산심의(案)만 쓰고 <b>파일(.xlsx)로 저장</b> → 실무자가 받아서 예산 탭에서 가져옵니다.</p></div>
      <button class="btn" data-act="bgSolo">📝 예산안 작성</button></div></div>`;
}
function conflictBanner() {
  if (!FS.conflict.length) return '';
  return `<div class="banner warn">다른 PC에서 먼저 수정된 파일이 있어 덮어쓰지 않았습니다: <b>${FS.conflict.map(esc).join(', ')}</b><br>
      <button class="btn sm" data-act="fsReload">폴더에서 다시 불러오기</button> <span class="small">(이 화면에서 그 뒤에 고친 내용은 사라집니다)</span>
      <button class="btn sm danger" data-act="fsForce">내 내용으로 덮어쓰기</button></div>`;
}
function renderTop() {
  document.querySelectorAll('#tabs button[data-tab]').forEach(b => {   // 경리 모드에서 잠긴 탭: 숨기지 않고 🔒 표시 (누르면 관리자 비밀번호 창 — 18 #tabs click)
    const h = hiddenTab(b.dataset.tab), lk = b.querySelector('.tab-lock');
    if (h && !lk) b.insertAdjacentHTML('beforeend', ' <span class="tab-lock">🔒</span>'); else if (!h && lk) lk.remove();
    b.style.opacity = h ? '.55' : ''; b.title = h ? '관리자 잠금 — 누르면 비밀번호를 넣고 열 수 있습니다' : '';
  });
  let sb = $('#secBtn');
  if (!sb) { sb = document.createElement('button'); sb.id = 'secBtn'; sb.className = 'btn sm secbtn'; const st = $('#saveState'); st.parentNode.insertBefore(sb, st.nextSibling); sb.onclick = () => (SEC.keys[db.cur] ? secLock() : secUnlockDialog()); }
  sb.style.display = secOn() ? '' : 'none';
  sb.textContent = SEC.keys[db.cur] ? '🔓 관리자' : '🔒 경리 모드';
  sb.title = SEC.keys[db.cur] ? '누르면 잠급니다 (푼 현장 모두 경리 모드로)' : '이 현장 관리자 비밀번호로 잠금 해제';
  const settingsBtn = $('#settingsTopBtn');
  if (settingsBtn) { settingsBtn.hidden = false; settingsBtn.classList.toggle('active', state.tab === 'settings'); }
  $('#siteSelect').innerHTML = db.sites.map(s => `<option value="${s.id}" ${s.id === db.cur ? 'selected' : ''}>${esc(s.name)}</option>`).join('');
  $('#monthInput').value = state.ym;
}

/* ================= 홈 ================= */
function isDone(sid, ym, key) {
  if (key === 'monthlyClose') return !!(db.monthly[sid] && db.monthly[sid][ym] && db.monthly[sid][ym].closed);
  return !!(db.done[sid] && db.done[sid][ym] && db.done[sid][ym][key]);
}
/* 정산 남은 일: 미분류 · 사용내역 없음 · 영수증 없음 */
const ISSUE = {
  unset: { label: '미분류', f: t => !t.cat },
  nomemo: { label: '사용내역 없음', f: t => !String(t.memo || '').trim() },
  norc: { label: '영수증 없음', f: t => !(t.receipts || []).length },
  rcbad: { label: '영수증 확인 필요', f: t => Object.values(t.rcCheck || {}).some(Boolean), title: '어둡거나 흐려서 인쇄하면 안 보일 수 있는 사진' },
  memo: { label: '사용내역 확인', f: t => memoWarns(t).length > 0, title: '인원수 대신 이름 · 소모품 사유 · 주문 수량≠인원 · 편의점 품목 없는 영수증' },
  over: { label: '식대 초과 사유', f: t => { const m = mealInfo(t); return !!(m && m.over && !String(t.overReason || '').trim()); }, title: '1인 식대 단가(출근부 → ⚙ 설정)를 넘은 식대 — 초과 사유 필요' },
  cater: { label: '캐터링 중복', f: t => caterDup(t) && !t.caterOk, title: '캐터링 중식을 주문한 날 법카·전도금으로 먹은 중식' },
  photo: { label: '입고사진 없음', f: t => needPhoto(t) && !(t.photos || []).length, title: '소모품·비품 입고 사진' },
  u200: { label: '20만원↑ 사용내역서', f: t => isU200(t) && !u200Done(t), title: '20만원 이상 법인카드 사용내역서 (사용목적·참석자)' },
};
const issueCount = list => Object.fromEntries(Object.entries(ISSUE).map(([k, v]) => [k, list.filter(v.f).length]));
function taskBlockers(sid, ym, key) {
  const sb = siteTaskBlockers(sid, ym, key); if (sb) return sb;   // 조직 지급·매출 청구 일정
  if (key === 'card' || key === 'cash') {
    const list = db.tx.filter(t => t.siteId === sid && t.src === key && txYm(t) === ym && t.kind !== 'in');
    return ['unset', 'nomemo', 'norc'].map(k => [k, list.filter(ISSUE[k].f).length]).filter(([, n]) => n > 0).map(([k, n]) => `${ISSUE[k].label} ${n}건`);   // 핵심 항목만 (참고용 경고는 제외)
  }
  if (key === 'meal' || key === 'payClose') {
    const staff = db.staff.filter(s => s.siteId === sid && s.active !== false && s.kind !== '외부');
    const att = ((db.attendance[sid] || {})[ym]) || {};
    const na = attNoInput(att, staff, ym), noAtt = na.n;
    const unknown = sid === db.cur ? Object.keys(mealData(ym).unknown).length : 0;
    return [noAtt ? `출근부 미입력(${na.d}일) ${noAtt}명` : '', unknown ? `사용내역 미인식 이름 ${unknown}건` : ''].filter(Boolean);
  }
  if (key === 'vat') {
    const prev = ymAdd(ym, -1);
    const missing = db.tx.filter(t => t.siteId === sid && t.src === 'card' && txYm(t) === prev && t.kind !== 'in' && !(t.receipts || []).length).length;
    return missing ? [`영수증 없음 ${missing}건`] : [];
  }
  return [];
}
/* 현장 자료에 따라 붙는 일정 (00 buildTasks 는 공통 일정만) — 조직 지급 마감(15일·말일) · 매출 청구(공문 20일·세금계산서·입금) · 말일 정리
 * 조직 지급은 조직 지급 품의(또는 제목에 판매수수료·조직)가 있는 현장만, 매출 청구는 청구가 하나라도 있는 현장만 */
const orgSite = (sid = db.cur) => pmAll(sid).some(p => p.org || /판매\s*수수료|조직/.test(p.title || ''));
const orgPmFor = (to, sid = db.cur) => pmAll(sid).filter(p => p.org && p.org.to === to);   // 그 마감일까지인 조직 지급 품의
const billOpen = (sid = db.cur) => billAll(sid).filter(x => billStatus(x.b)[0] !== '입금 완료');
function siteTasks(today, sid = db.cur) {
  const T = `${today.getFullYear()}-${pad2(today.getMonth() + 1)}`, end = daysIn(T);
  const due = day => new Date(+T.slice(0, 4), monthNo(T) - 1, Math.min(day, end));
  const out = [];
  if (orgSite(sid)) {
    out.push({ key: 'orgClose1', ym: T, tab: 'pumui', title: `조직 지급 마감 (${monthNo(T)}/1~15)`, desc: '1~15일 판매수수료 등 카운팅 마감 → 조직 지급 품의 (차수형)', due: due(15) });
    out.push({ key: 'orgClose2', ym: T, tab: 'pumui', title: `조직 지급 마감 (${monthNo(T)}/16~말일)`, desc: '16~말일 판매수수료 등 카운팅 마감 → 조직 지급 품의 (차수형)', due: due(end) });
  }
  if (billAll(sid).length) {
    out.push({ key: 'billDoc', ym: T, tab: 'bill', title: `${monthNo(T)}월 매출 청구 공문`, desc: '시행사·신탁사 청구 공문 (20일 이전 청구 시 당월 입금)', due: due(20) });
    out.push({ key: 'billTax', ym: T, tab: 'bill', title: `${monthNo(T)}월 세금계산서 발행`, desc: `청구분 세금계산서 발행${[12, 3, 6, 9].includes(monthNo(T)) ? ' · 다음 달 부가세 신고 전 발행' : ''}`, due: due(end) });
    const pay = billOpen(sid).filter(x => x.b.taxDate && String(x.b.dueDate || '').slice(0, 7) === T).map(x => x.b.dueDate).sort();
    if (pay.length) out.push({ key: 'billPaid', ym: T, tab: 'bill', title: `매출 입금 확인 (${pay.length}건)`, desc: '입금 예정일 — 통장 입금 확인 후 매출 청구에 입금일 입력', due: new Date(+pay[0].slice(0, 4), +pay[0].slice(5, 7) - 1, +pay[0].slice(8, 10)) });
  }
  out.push({ key: 'cashLeft', ym: T, tab: 'cash', title: `${monthNo(T)}월 말일 정리`, desc: '전도금 미출금분 출금 · 숙소 관리비 월말 정산', due: due(end) });
  out.push({ key: 'planNext', ym: T, tab: 'home', title: `${monthNo(ymAdd(T, 1))}월 인력운영계획 보고`, desc: '다음 달 인력운영계획·주요 일정 보고', due: due(end) });
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return out.map(t => ({ ...t, dday: Math.round((t.due - t0) / 86400000) }));
}
const homeTasks = (today, sid = db.cur) => [...buildTasks(today, db.settings), ...siteTasks(today, sid)];
function siteTaskBlockers(sid, ym, key) {
  if (key === 'orgClose1' || key === 'orgClose2') { const to = key === 'orgClose1' ? `${ym}-15` : `${ym}-${pad2(daysIn(ym))}`; return orgPmFor(to, sid).length ? [] : ['조직 지급 품의 미작성']; }
  if (key === 'billDoc') { const l = billAll(sid).filter(x => x.ym === ym); return !l.length ? ['이 달 청구 없음'] : l.some(x => !x.b.docDate) ? [`공문 미발송 ${l.filter(x => !x.b.docDate).length}건`] : []; }
  if (key === 'billTax') { const n = billAll(sid).filter(x => x.ym <= ym && !x.b.taxDate).length; return n ? [`세금계산서 미발행 ${n}건`] : []; }
  if (key === 'billPaid') { const n = billOpen(sid).filter(x => x.b.taxDate && x.b.dueDate && x.b.dueDate.slice(0, 7) <= ym).length; return n ? [`입금 미확인 ${n}건`] : []; }
  return null;
}
function pmBadge(kind, ym) {   // 이 달 자금청구서가 품의 대장에 있는지
  const p = pmAll().find(x => x.kind === kind && x.linkYm === ym);
  if (!p) return `<span class="badge warn" title="자금청구서를 인쇄하면 품의 대장에 번호가 등록됩니다">${kind === 'cash' ? '청구 미등록' : '품의 미등록'}</span>`;
  return `<a href="#" class="badge ${p.status === '결재완료' ? 'ok' : 'warn'}" data-act="goto" data-tab="${kind === 'cash' ? 'cash' : 'pumui'}" title="${kind === 'cash' ? '전도금 탭 아래 청구 대장' : '품의서 대장으로'}">${kind === 'cash' ? `청구 ${esc(p.no)}` : `품의 ${esc(p.no)}번`} · ${esc(p.status)}</a>`;
}
function taskChecks(t) {   // 홈 일정 줄마다 실제 남은 일
  const chip = (txt, warn, tab, extra = '') => `<button class="chip ${warn ? 'warn' : 'ok'}" data-act="goto" data-tab="${tab}" data-ym="${t.ym}" ${extra}>${txt}</button>`;
  const out = [];
  if (/^orgClose|^bill/.test(t.key)) {   // 조직 지급 마감 · 매출 청구
    if (/^orgClose/.test(t.key)) { const ps = orgPmFor(t.key === 'orgClose1' ? `${t.ym}-15` : `${t.ym}-${pad2(daysIn(t.ym))}`); if (ps.length) return ps.map(p => `<a href="#" class="chip ${p.status === '결재완료' ? 'ok' : 'warn'}" data-act="goto" data-tab="pumui">${esc(p.org.kind)} ${esc(p.org.round)}차 · ${esc(p.no)}번 ${esc(p.status)}</a>`); }
    const b = taskBlockers(db.cur, t.ym, t.key);
    return b.length ? b.map(x => chip(x, true, t.tab)) : ['<span class="chip ok">완료 ✓</span>'];
  }
  if (t.key === 'card' || t.key === 'cash') {
    const list = txOf(t.ym, t.key).filter(x => x.kind !== 'in');
    if (!list.length) return [`<span class="muted small">${t.key === 'card' ? '카드 내역 없음 — 카드사 엑셀을 불러오세요' : '지출 내역 없음'}</span>`];
    const c = issueCount(list);
    out.push(`<span class="small muted">${list.length}건</span>`);
    Object.entries(c).forEach(([k, n]) => { if (n) out.push(chip(`${ISSUE[k].label} ${n}`, true, t.key, `data-issue="${k}"`)); });
    if (!Object.values(c).some(n => n)) out.push('<span class="chip ok">정리 완료 ✓</span>');
    if (t.key === 'cash') out.push(pmBadge('cash', t.ym));
  } else if (t.key === 'meal' || t.key === 'payClose') {
    const st = workStaff(), att = (db.attendance[db.cur] || {})[t.ym] || {};
    const na = attNoInput(att, st, t.ym), noAtt = na.n;
    const unk = Object.keys(mealData(t.ym).unknown).length;
    out.push(noAtt ? chip(`출근부 미입력(${na.d}일) ${noAtt}명`, true, 'meal') : '<span class="chip ok">출근부 입력 ✓</span>');
    if (unk) out.push(chip(`사용내역 미인식 이름 ${unk}`, true, 'meal'));
    if (t.key === 'payClose') { const vals = st.flatMap(x => Object.values(att[x.id] || {})); const ph = vals.filter(v => v === ATT_PHOTO).length, ms = vals.filter(v => v === ATT_MISS).length; if (ph || ms) out.push(`<span class="small muted">사진대체 ${ph} · 체크누락 ${ms} (인건비 특이사항에 자동 기재)</span>`); }
  } else if (t.key === 'vat') {
    const pm = ymAdd(t.ym, -1), n = txOf(pm, 'card').filter(x => x.kind !== 'in' && !(x.receipts || []).length).length;
    out.push(n ? `<button class="chip warn" data-act="goto" data-tab="card" data-ym="${pm}" data-issue="norc">${monthNo(pm)}월 카드 영수증 없음 ${n}</button>` : `<span class="chip ok">${monthNo(pm)}월 카드 영수증 모두 있음 ✓</span>`);
  } else if (t.key === 'payroll') out.push(pmBadge('pay', t.ym));
  else if (t.key === 'monthlyPay' || t.key === 'monthlyClose') {
    if (t.key === 'monthlyClose') out.push(monthlyTotals(db.cur, t.ym).closed ? '<span class="chip ok">마감 ✓</span>' : chip('미마감', true, 'monthly'));
    else out.push(pmBadge('monthly', t.ym));
  }
  return out;
}
function viewHome() {
  const today = new Date();
  const s = site();
  const setupSteps = [
    { sub: 'site', label: '현장 정보', hint: '현장명·문서번호·담당자', done: !!s.fullName },
    { sub: 'staff', label: '직원 등록', hint: '출근부·인건비 대상자', done: db.staff.some(x => x.siteId === db.cur && x.active !== false && x.kind !== '외부') },
    { sub: 'staff', label: '법인카드 등록', hint: '카드 뒤 4자리와 사용처', done: siteCards().length > 0 },
  ];
  const setupDone = setupSteps.filter(x => x.done).length;
  const setupPanel = setupDone === setupSteps.length ? '' : `<section class="setup-card">
      <div class="setup-heading"><div><span class="eyebrow">처음 사용한다면</span><h2>먼저 기본 설정을 마쳐 주세요</h2><p>한 번 설정하면 이후 업무 입력과 정산에 계속 사용됩니다.</p></div><span class="setup-progress">${setupDone} / ${setupSteps.length} 완료</span></div>
      <div class="setup-steps">${setupSteps.map((x, i) => `<button class="setup-step ${x.done ? 'is-done' : ''}" data-act="goto" data-tab="settings" data-sub="${x.sub}"><span class="setup-number">${x.done ? '✓' : i + 1}</span><span><b>${x.label}</b><small>${x.hint}</small></span><span class="setup-arrow">${x.done ? '수정 →' : '설정 →'}</span></button>`).join('')}</div>
    </section>`;
  const taskRow = t => {   // 일정 한 줄 (D-day · 남은 항목 · 완료 체크 · 바로가기)
    const blockers = taskBlockers(db.cur, t.ym, t.key);
    const done = isDone(db.cur, t.ym, t.key);
    const cls = done ? 'done' : t.dday < 0 ? 'over' : t.dday <= 3 ? 'soon' : 'later';
    const dtxt = done ? '완료' : t.dday === 0 ? 'D-DAY' : t.dday > 0 ? `D-${t.dday}` : `D+${-t.dday}`;
    return `<div class="task"><span class="dday ${cls}">${dtxt}</span>
        <div class="grow"><b>${esc(t.title)}</b> <span class="muted small">· 기한 ${t.due.getMonth() + 1}/${t.due.getDate()}(${WEEK[t.due.getDay()]}) · ${esc(t.desc)}</span><div class="chips small" style="margin-top:4px">${taskChecks(t).join(' ')}</div></div>
        ${t.key === 'monthlyClose' ? `<span class="small muted">${done ? '마감됨' : '월결제 탭에서 마감'}</span>` : `<label class="small" title="${blockers.length ? `남은 항목: ${esc(blockers.join(', '))}` : ''}"><input type="checkbox" data-ch="done" data-ym="${t.ym}" data-key="${t.key}" ${done ? 'checked' : ''}> 완료${!done && blockers.length ? ` (남은 항목 ${blockers.length})` : ''}</label>`}
        <button class="btn sm" data-act="goto" data-tab="${t.tab}" data-ym="${t.ym}">바로가기 →</button></div>`;
  };
  /* ---------- 달력: 정산 일정(기한 날짜) + 매일 출퇴근보고 ---------- */
  const tStr = todayStr(), todayYm = tStr.slice(0, 7), day0 = d => new Date(d.getFullYear(), d.getMonth(), d.getDate()), T0 = day0(today);
  // 달력 = 상단바 작업월 (◀ ▶ · 오늘)
  const calYm = /^\d{4}-\d{2}$/.test(state.ym || '') ? state.ym : todayYm, [cy, cm] = calYm.split('-').map(Number), dim = daysIn(calYm);
  const tasksOf = ym => { const [y, m] = ym.split('-').map(Number); return homeTasks(new Date(y, m - 1, 1)).map(t => ({ ...t, dday: Math.round((day0(t.due) - T0) / 86400000) })); };
  const mTasks = tasksOf(calYm), dsOf = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const tCls = t => (isDone(db.cur, t.ym, t.key) ? 'done' : t.dday < 0 ? 'over' : t.dday <= 3 ? 'soon' : 'later');
  const sel = state.homeDay && state.homeDay.slice(0, 7) === calYm ? state.homeDay : calYm === todayYm ? tStr : `${calYm}-01`;
  const dOf = ds => new Date(+ds.slice(0, 4), +ds.slice(5, 7) - 1, +ds.slice(8, 10));
  const repOf = ds => { const done = isDone(db.cur, ds.slice(0, 7), `rep${ds.slice(8)}`); return { done, show: ds <= tStr && (done || !isOffDay(dOf(ds), db.settings)) }; };   // 주말·공휴일은 보고했을 때만 표시
  let cal = '';
  const lead = new Date(cy, cm - 1, 1).getDay();
  for (let i = 0; i < lead; i++) cal += '<div class="cal-d cal-blank"></div>';
  for (let d = 1; d <= dim; d++) {
    const ds = `${calYm}-${pad2(d)}`, dow = (lead + d - 1) % 7, ts = mTasks.filter(t => dsOf(t.due) === ds), hn = holidayName(ds);
    cal += `<div class="cal-d${dow === 0 || hn ? ' sun' : dow === 6 ? ' sat' : ''}${ds === tStr ? ' today' : ''}${ds === sel ? ' sel' : ''}" data-act="homeDay" data-d="${ds}" title="${[hn, ...ts.map(t => t.title)].filter(Boolean).map(esc).join('\n')}">
        <div class="cal-n">${d}${hn ? ` <span class="cal-hol">${esc(hn)}</span>` : ''}</div>${ts.map(t => `<div class="cal-ev ${tCls(t)}">${esc(t.title)}</div>`).join('')}</div>`;
  }
  for (let i = (lead + dim) % 7; i > 0 && i < 7; i++) cal += '<div class="cal-d cal-blank"></div>';   // 마지막 주의 남는 칸도 빈 칸으로 채워 표 모양 유지
  // 선택한 날: 그날 일정 · 출퇴근보고 · 밀린 일(지난달까지 기한이 지났는데 완료 안 한 것) · 다가오는 일정
  const selD = dOf(sel), selTasks = mTasks.filter(t => dsOf(t.due) === sel), selRep = repOf(sel);
  const overdue = [...tasksOf(ymAdd(todayYm, -1)), ...tasksOf(todayYm)].filter(t => t.dday < 0 && !isDone(db.cur, t.ym, t.key) && dsOf(t.due) !== sel
    && (!s.startYm || t.ym >= s.startYm));   // 현장 시작월(설정 › 현장 정보) 이전 달의 일은 밀린 일로 세지 않음 — 새 현장에 지난 일이 쌓여 보이지 않게
  const upcoming = mTasks.filter(t => dsOf(t.due) > sel && !isDone(db.cur, t.ym, t.key)).slice(0, 4);
  const upLine = t => { const n = taskBlockers(db.cur, t.ym, t.key).length; return `<button class="cal-up" data-act="homeDay" data-d="${dsOf(t.due)}"><span class="cal-ev ${tCls(t)}">${t.due.getMonth() + 1}/${t.due.getDate()}</span><span class="grow">${esc(t.title)}</span>${n ? `<span class="muted small">남은 항목 ${n}</span>` : ''}</button>`; };
  const repRow = sel <= tStr ? `<div class="task"><span class="dday ${selRep.done ? 'done' : sel < tStr ? 'over' : 'soon'}">${selRep.done ? '완료' : '매일'}</span><div class="grow"><b>출퇴근보고</b> <span class="muted small">· 경영지원에 출퇴근보고 (사진대체·정정 포함)</span></div>
      <button class="btn sm ${selRep.done ? '' : 'primary'}" data-act="repToggle" data-ym="${sel.slice(0, 7)}" data-key="rep${sel.slice(8)}">${selRep.done ? '보고 취소' : '보고함'}</button>${sel === tStr ? '<button class="btn sm" data-act="repOpen" title="출근부(근태기록)로 카톡 보고 문구 만들기">보고문 만들기</button>' : ''}</div>` : '';
  const dayPanel = `<div class="cal-side">
      <div class="cal-side-h"><b>${selD.getMonth() + 1}월 ${selD.getDate()}일 (${WEEK[selD.getDay()]})</b>${sel === tStr ? ' <span class="badge ok">오늘</span>' : ''}</div>
      <div class="tgroup"><div class="tg-h">이 날 할 일</div>${repRow}${selTasks.map(taskRow).join('') || (repRow ? '' : '<p class="muted small" style="margin:8px 2px">이 날 기한인 정산 일정이 없습니다.</p>')}</div>
      ${overdue.length ? `<div class="tgroup"><div class="tg-h" style="color:var(--bad)">밀린 일 ${overdue.length}건 <span class="muted" style="font-weight:400">— 누르면 그 날로</span></div>${overdue.map(upLine).join('')}</div>` : ''}
      ${upcoming.length ? `<div class="tgroup"><div class="tg-h">다가오는 일정</div>${upcoming.map(upLine).join('')}</div>` : ''}
    </div>`;
  const calPanel = `<div class="panel home-tasks"><div class="section-heading"><div><h2>업무 달력</h2><p>날짜를 누르면 할 일이 보입니다 · <span class="cal-ev done">완료</span> <span class="cal-ev soon">3일 안</span> <span class="cal-ev over">기한 지남</span> <span class="cal-ev later">예정</span></p></div></div>
      <div class="cal-wrap"><div class="cal"><div class="cal-w sun">일</div><div class="cal-w">월</div><div class="cal-w">화</div><div class="cal-w">수</div><div class="cal-w">목</div><div class="cal-w">금</div><div class="cal-w sat">토</div>${cal}</div>${dayPanel}</div></div>`;

  // 품의서 결재 대기
  const pend = pmAll().filter(p => p.status === '작성중' || p.status === '결재중').sort((a, b) => toNum(a.no) - toNum(b.no));
  const pmTask = pend.length ? `<div class="task"><span class="dday soon">품의</span><div class="grow"><b>품의서 결재 대기 ${pend.length}건</b> <span class="muted small">· 결재 받으면 스캔본을 올려 "결재완료"로</span>
        <div class="chips small" style="margin-top:4px">${pend.slice(0, 6).map(p => `<button class="chip warn" data-act="goto" data-tab="pumui">${esc(p.no)}번 ${esc(String(p.title || '').slice(0, 24))} · ${esc(p.status)}</button>`).join('')}${pend.length > 6 ? `<span class="muted small">외 ${pend.length - 6}건</span>` : ''}</div></div>
        <button class="btn sm" data-act="goto" data-tab="pumui">바로가기 →</button></div>` : '';
  const preTask = '';   // 직원 선지급 정산 대기 — 지금은 쓰지 않아 뺌
  // 현장 철수 체크리스트 (철수 진행 중일 때)
  const cl = s.closing ? closeItems(s) : null, clDone = cl ? cl.filter(x => x.done).length : 0;
  const closeTask = cl ? `<div class="task"><span class="dday ${clDone === cl.length ? 'done' : 'soon'}">철수</span><div class="grow"><b>현장 철수 체크리스트 ${clDone}/${cl.length}</b> <span class="muted small">· 남은 일: ${esc(cl.filter(x => !x.done).slice(0, 6).map(x => x.label).join(', '))}${cl.length - clDone > 6 ? ' …' : ''}</span></div><button class="btn sm" data-act="goto" data-tab="settings" data-sub="close">바로가기 →</button></div>` : '';
  const ym = state.ym, payCol = db.sites.some(x => isAdmin(x.id));   // 인건비 칸: 잠금 푼(또는 잠금 없는) 현장만 숫자
  const rows = db.sites.map(si => {
    const card = db.tx.filter(t => t.siteId === si.id && t.src === 'card' && txYm(t) === ym);
    const cash = cashSummary(si.id, ym);
    const mon = monthlyTotals(si.id, ym);
    const unset = card.filter(t => !t.cat).length;
    return `<tr><td><a href="#" data-act="switchSite" data-id="${si.id}">${esc(si.name)}</a></td>
        <td class="num">${fmt(sum(card, t => t.amount))}</td><td class="center">${unset ? `<span class="badge warn">${unset}건</span>` : '<span class="badge ok">0</span>'}</td>
        <td class="num">${fmt(cash.out)}</td><td class="num">${fmt(cash.balance)}</td>
        <td class="num">${fmt(mon.total)}</td><td class="center">${mon.closed ? '<span class="badge ok">마감</span>' : '<span class="badge warn">작성중</span>'}</td>
        ${payCol ? (isAdmin(si.id) ? `<td class="num">${fmt0(sum(payGroups(payRows(si.id, ym, false)), g => g.ys + g.sh))}</td>` : '<td class="center muted small">🔒</td>') : ''}
        ${['card', 'cash'].map(src => { const c = issueCount(db.tx.filter(t => t.siteId === si.id && t.src === src && t.kind !== 'in' && txYm(t) === ym)); const n = sum(Object.values(c));
        return `<td class="center small">${n ? `<span class="badge warn" title="${Object.entries(c).map(([k, v]) => `${ISSUE[k].label} ${v}`).join(' · ')}">${n}건</span>` : '<span class="badge ok">없음</span>'}</td>`; }).join('')}
        <td class="center">${(() => { const n = pmAll(si.id).filter(p => p.status === '작성중' || p.status === '결재중').length; return n ? `<span class="badge warn">${n}건</span>` : '<span class="badge ok">없음</span>'; })()}</td></tr>`;
  }).join('');

  return `
    <section class="home-hero"><div><span class="eyebrow">현장 업무 현황</span><h1>${esc(s.name)} 업무 홈</h1><p>오늘 할 일과 마감 일정</p></div></section>
    ${setupPanel}
    ${calPanel}
    ${pmTask || closeTask || preTask ? `<div class="panel home-tasks"><div class="tgroup"><div class="tg-h">품의 · 철수</div>${preTask}${pmTask}${closeTask}</div></div>` : ''}
    <div class="panel home-overview"><div class="section-heading"><div><h2>현장별 정산 현황</h2><p>각 현장의 이번 달 주요 금액과 남은 업무입니다.</p></div><span class="today-date">${ymLabel(ym)}</span></div>
      <div class="tbl-wrap"><table class="t"><thead><tr><th>현장</th><th>법인카드 합계</th><th>미분류</th><th>전도금 사용</th><th>전도금 잔액</th><th>월결제 합계</th><th>월결제</th>${payCol ? '<th>인건비 실지급</th>' : ''}<th title="미분류·사용내역 없음·영수증 없음">카드 남은 일</th><th title="미분류·사용내역 없음·영수증 없음">전도금 남은 일</th><th>품의 결재 대기</th></tr></thead>
      <tbody>${rows}</tbody></table></div>
    </div>`;
}
