/* 유성 현장 관리 프로그램 — 화면 이름표(VIEWS)·입력 변경(CH)·시작(init)
 * (원래 app.js 의 화면 부분. 모든 js/*.js 는 같은 전역 공간을 공유하며 html 에 적힌 순서대로 읽힘) */
'use strict';

/* 화면 이름 → 그리는 함수 (모든 파일이 읽힌 뒤라야 하므로 여기 둠) */
const VIEWS = { home: viewHome, card: viewCard, cash: viewCash, meal: viewMeal, cater: viewCater, pay: viewPay, monthly: viewMonthly, pl: viewPl, bill: viewBill, asset: viewAsset, pumui: viewPumui, budget: viewBudget, settings: viewSettings, help: viewHelp };

/* ================= 이벤트: 입력 변경 ================= */
const CH = {
  tx: el => {
    const t = db.tx.find(x => x.id === el.dataset.id); if (!t) return;
    const f = el.dataset.f;
    if (f === 'amount') t.amount = toNum(el.value);
    else if (f === 'claim') t.claim = el.checked;
    else if (f === 'noVat') { if (el.checked) t.noVat = true; else delete t.noVat; }
    else if (f === 'claimAmt') { const v = String(el.value).trim(); if (v === '') delete t.claimAmt; else t.claimAmt = toNum(v); }   // 청구 금액 (비우면 전액)
    else t[f] = el.value;
    if (f === 'cat' && t.cat) learn(t);
    if (f === 'kind' && t.kind === 'in') t.cat = '';
  },
  cardFilter: el => { state.cardFilter = el.value; },
  cardSel: el => { const s = state.cardSel || (state.cardSel = new Set()); el.checked ? s.add(el.dataset.id) : s.delete(el.dataset.id); },
  cardSelAll: el => { state.cardSel = new Set(el.checked ? state.cardListIds || [] : []); },
  done: el => {
    const key = el.dataset.key;
    if (el.checked) {
      const blockers = taskBlockers(db.cur, el.dataset.ym, key);   // 남은 항목이 있으면 한 번 묻고, 그래도 완료할 수 있음 (종이 영수증을 붙이는 경우 등)
      if (blockers.length && !confirm(`아직 남은 항목이 있습니다.\n\n${blockers.join('\n')}\n\n그래도 완료로 표시할까요?`)) { el.checked = false; return; }
    }
    nest(db.done, db.cur, el.dataset.ym)[key] = el.checked;
  },
  includeSnack: el => { state.includeSnack = el.checked; },
  payMore: el => { state.payMore = el.checked; },
  pmStatus: el => {
    const f = pmFind(el.dataset.id); if (!f) return;
    if (el.value === '결재완료' && !(f.x.scans || []).length) {
      const reason = prompt('연결된 스캔본이 없습니다. 결재 증빙을 별도로 보관한 위치나 예외 사유를 입력해 주세요. 취소하면 상태를 변경하지 않습니다.');
      if (!reason || !reason.trim()) { el.value = f.x.status; toast('예외 사유를 입력해야 스캔본 없이 결재완료 처리할 수 있습니다.'); return; }
      f.x.scanExceptionReason = reason.trim();
    } else if (el.value !== '결재완료') f.x.scanExceptionReason = '';
    f.x.status = el.value; el.className = `pm-st ${pmStCls(el.value)}`;
    pmFileSync(f.x.id);   // 15: 작성중 ↔ 작성 끝 → 엑셀을 A. 기안품의 ↔ C. 작성완료 로 옮김
  },
  pmFilter: el => { state.pmFilter = el.value; },
  pmQ: el => { state.pmQ = el.value; },
  cater: el => { const c = caterOf(state.ym); const r = c.days[el.dataset.d] = c.days[el.dataset.d] || {}; const f = el.dataset.f;
    if (f === 'plan' || f === 'ext') { const m = r[f] = r[f] || {}, v = toNum(el.value); if (v) m[el.dataset.l] = v; else delete m[el.dataset.l]; return; }   // 소속별 출근예정 · 외부 소속 실제
    r[f] = f === 'ok' ? el.checked : f === 'note' ? el.value : toNum(el.value); },
  caterSeg: el => {   // 캐터링 업체 표 (08 mealCater): k=0 첫 업체(c.vendor·단가), k≥1 달 중간 바뀐 업체 c.chg[k-1]
    const c = caterOf(state.ym), k = +el.dataset.k, f = el.dataset.f, v = f === 'vatEx' ? el.checked : f === 'name' ? el.value.trim() : toNum(el.value);
    const segs = caterSegs(c), g = segs[k]; if (!g) return;
    if (k === 0) { c[f === 'name' ? 'vendor' : f] = v; if (f === 'vatEx') site().caterVatEx = v; }
    else { const x = (c.chg || []).find(y => toNum(y.from) === g.from && (y.name || '') === g.name) || c.chg[k - 1]; x[f] = f === 'from' ? Math.min(daysIn(state.ym), Math.max(2, v || 2)) : v; }
    if (f === 'name' && v && k === segs.length - 1) site().caterVendor = v;   // 마지막 업체 = 다음에 새로 시작하는 달의 기본
  },
  vendor: el => { const v = db.vendors.find(x => x.id === el.dataset.id); if (!v) return; v[el.dataset.f] = el.type === 'checkbox' ? el.checked : el.value; },
  bgMeta: el => bgCh('meta', el), bgSup: el => bgCh('sup', el), bgPh: el => bgCh('ph', el), bgItem: el => bgCh('item', el),   // 14c 예산
  mrow: el => { const m = monthOf(db.cur, el.dataset.ym || state.ym); const r = m.rows[el.dataset.id] = m.rows[el.dataset.id] || {}; r[el.dataset.f] = ['period', 'qty', 'endDate', 'diffReason', 'ckNote'].includes(el.dataset.f) ? el.value.trim() : toNum(el.value); if (el.dataset.f === 'ckNote') { delete r.qty; delete r.diffReason; } if (/^(ys|sh)$/.test(el.dataset.f)) { delete r.caterAuto; r.caterManual = true; } if (el.dataset.f === 'period') delete r.caterManual; },   // 사용기간을 고치면 캐터링 금액은 그 기간으로 다시 자동 (09 caterAutoApply)   // 비고 = 예전 대수·인원 + 변동 사유를 합친 칸 · data-ym = 업체별 월 지출 표(여러 달)
  mck: el => { const m = monthOf(db.cur, state.ym), v = db.vendors.find(x => x.id === el.dataset.id); if (!v) return; const r = m.rows[v.id] = m.rows[v.id] || {}; r.ck = r.ck || {}; r.ck[el.dataset.k] = el.value; v.ckDef = v.ckDef || {}; v.ckDef[el.dataset.k] = el.value === 'na' ? 'na' : 'need'; },
  site: el => { const s = site(); s[el.dataset.f] = el.type === 'checkbox' ? el.checked : el.dataset.num ? toNum(el.value) : el.value; },
  appr: el => { site().approvers[+el.dataset.i][el.dataset.f] = el.value; },
  staff: el => { const p = db.staff.find(x => x.id === el.dataset.id); if (!p) return; p[el.dataset.f] = el.type === 'checkbox' ? el.checked : el.value.trim(); },
  payDoc: el => { const d = payDocsOf(state.ym); const c = d[el.dataset.co] = d[el.dataset.co] || {}; c[el.dataset.k] = el.checked; },
  staffDoc: el => { const p = db.staff.find(x => x.id === el.dataset.id); if (!p) return; p.docs = p.docs || {}; p.docs[el.dataset.k] = el.checked; },
  cardm: el => { const c = db.cards.find(x => x.id === el.dataset.id); if (!c) return; c[el.dataset.f] = el.dataset.f === 'last4' ? el.value.replace(/\D/g, '').slice(-4) : el.dataset.f === 'limit' ? toNum(el.value) || '' : el.value; },
  pay: el => {
    const p = db.staff.find(x => x.id === el.dataset.id); if (!p) return;
    const rec = payRec(db.cur, state.ym, p), f = el.dataset.f;
    let v = el.value;
    if (['rate', 'otRate', 'mealRate', 'otHours', 'mealDays', 'incentive'].includes(f)) v = toNum(v);
    else if (f === 'workDays' || f === 'prorate') v = String(v).trim() === '' ? null : toNum(v);
    if (f === 'rate' && toNum(rec.rate) && v && v !== toNum(rec.rate) && !rec.chg) { setTimeout(() => payRateAsk(p, v), 0); return; }   // 단가를 바꾸면 "언제부터 적용?" (11 payRateAsk) — 취소하면 그대로
    rec[f] = v;
    if (PAY_FIELDS.includes(f)) { p.pay = p.pay || {}; p.pay[f] = v; }
  },
  billF: el => { state.billF = el.value; },
  assetK: el => { state.assetK = el.value; },   // 12c 자산·집기 거르기
  assetS: el => { state.assetS = el.value.replace(/\s*\(\d+\)$/, ''); },
  pl: el => { const m = nest(db.pl, db.cur, el.dataset.ym); const v = String(el.value).trim(); if (v === '') delete m[el.dataset.k]; else m[el.dataset.k] = toNum(v); },
  teamPay: el => { if (!isAdmin()) return; const f = el.dataset.f, v = String(el.value).trim(); setTeamPay(el.dataset.key, f, f === 'rate' ? (v === '' ? '' : toNum(v)) : v); },
  teamOutChk: el => { const st = site(); st.outFree = st.outFree || {}; st.outFree[el.dataset.key] = !el.checked; },
  teamStart: el => { const st = site(), ws = st.workStarts = st.workStarts || {}, v = normHM(el.value); if (v) ws[el.dataset.key] = v; else { delete ws[el.dataset.key]; if (el.value.trim()) toast('시각은 10:00 처럼 입력하세요.'); } },
  mealTeamRate: el => { const v = String(el.value).trim(); setMealTeamRate(el.dataset.key, v === '' ? null : toNum(v)); },
  setting: el => { const f = el.dataset.f; db.settings[f] = f === 'teamOrder' ? el.value : Math.max(1, Math.min(31, parseInt(el.value, 10) || 1)); },   // 설정 › 정산 기한: 날짜 칸(1~31) · 직원 구분 정렬 순서(글자)
  secOpt: el => { if (!secOptEditable()) return; db.settings.sec = db.settings.sec || {}; const o = db.settings.sec.opt = secOpt(); o[el.dataset.f] = el.type === 'checkbox' ? el.checked : el.value.trim(); },
  secTab: el => { if (!secOptEditable()) return; db.settings.sec = db.settings.sec || {}; const o = db.settings.sec.opt = secOpt(); const t = new Set(o.tabs || []); if (el.checked) t.add(el.dataset.k); else t.delete(el.dataset.k); o.tabs = [...t]; },
  secRem: el => { secRemember(el.checked); },
  closeItem: el => { const s = site(); s.closeList = s.closeList || {}; const x = s.closeList[el.dataset.k] = s.closeList[el.dataset.k] || {}; x[el.dataset.f] = el.type === 'checkbox' ? el.checked : el.value; if (el.dataset.f === 'done' && el.checked && !x.date) x.date = todayStr(); },
  siteClosing: el => { site().closing = el.checked; },
};

/* ================= 시작 ================= */
/* ---------- 크롬·엣지가 아닌 브라우저로 열었을 때 경고 ----------
   네이버 웨일·오페라·브레이브 등은 크롬 계열이라도 폴더 저장이 막히거나 다르게 동작할 수 있어 같이 경고. */
function browserOk() {
  const ud = navigator.userAgentData;
  if (ud && ud.brands && ud.brands.length) return ud.brands.some(b => /Google Chrome|Microsoft Edge/.test(b.brand));
  const ua = navigator.userAgent;   // 예전 크롬·엣지 (userAgentData 없음)
  return /Chrome\/|Edg\//.test(ua) && !/OPR\/|Whale\/|SamsungBrowser|YaBrowser|Vivaldi|; wv\)/.test(ua) && !navigator.brave;
}
function browserWarn() {
  if (browserOk() && window.showDirectoryPicker) return;
  const el = document.createElement('div');
  el.id = 'browserWarn';
  el.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:16px';
  el.innerHTML = `<div style="background:#fff;color:#222;max-width:460px;width:100%;border-radius:10px;border-top:6px solid #d93025;padding:22px 24px;box-shadow:0 8px 30px rgba(0,0,0,.35);font-size:15px;line-height:1.6">
      <h2 style="margin:0 0 10px;font-size:19px;color:#d93025">⚠ 크롬 또는 엣지로 열어 주세요</h2>
      <p style="margin:0 0 8px">이 프로그램은 <b>PC의 크롬(Chrome)</b> 또는 <b>엣지(Edge)</b>에서만 제대로 동작합니다.</p>
      <p style="margin:0 0 16px">${browserOk() ? '지금 기기에서는 폴더 저장 기능을 쓸 수 없습니다 (휴대폰·태블릿 또는 오래된 버전).' : '지금 브라우저에서는 자료 저장·영수증 보관·인쇄가 안 되거나 자료가 저장되지 않을 수 있습니다.'}</p>
      <div style="text-align:right"><button type="button" style="padding:8px 16px;border:1px solid #bbb;border-radius:6px;background:#f3f4f6;cursor:pointer;font-size:14px">그래도 계속 보기</button></div>
    </div>`;
  el.querySelector('button').onclick = () => el.remove();
  document.body.appendChild(el);
}
async function init() {
  try { browserWarn(); } catch (e) { }
  db = defaultDb(); normalizeDb();
  const now = new Date();
  state.ym = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`; state.homeDay = todayStr();   // 처음 열면 이번 달 · 오늘 날짜 선택
  let savedView = null;
  try { savedView = JSON.parse(sessionStorage.getItem(VIEW_SESSION_KEY) || 'null'); } catch (e) { }
  if (savedView && typeof savedView === 'object') {
    if (savedView.tab && VIEWS[savedView.tab]) state.tab = savedView.tab;
    if (/^\d{4}-\d{2}$/.test(savedView.ym || '')) state.ym = savedView.ym;
    if (typeof savedView.setSub === 'string') state.setSub = savedView.setSub;
    if (typeof savedView.mealSub === 'string') state.mealSub = savedView.mealSub;
    if (typeof savedView.mealGroup === 'string') state.mealGroup = savedView.mealGroup;
    if (typeof savedView.caterSub === 'string') state.caterSub = savedView.caterSub;
  }
  const hp = new URLSearchParams(location.hash.slice(1));
  if (hp.get('tab') && VIEWS[hp.get('tab')]) state.tab = hp.get('tab');
  if (/^\d{4}-\d{2}$/.test(hp.get('ym') || '')) state.ym = hp.get('ym');
  if (hp.get('sub')) { if (hp.get('tab') === 'settings') state.setSub = hp.get('sub'); else state.mealSub = hp.get('sub'); }
  if (hp.get('grp')) state.mealGroup = hp.get('grp');
  if (hp.get('set')) state.setSub = hp.get('set');
  if (state.tab === 'meal' && (state.mealGroup === 'cater' || state.mealSub === 'cater')) { state.tab = 'cater'; state.caterSub = 'cater'; state.mealGroup = '현장'; state.mealSub = 'att'; }   // 예전 식대·출근부 안 캐터링 화면 → 식대·캐터링 탭
  if (state.tab === 'meal' && state.mealSub === 'meal') { state.tab = 'cater'; state.caterSub = 'meal'; state.mealSub = 'att'; }   // 예전 식대내역 화면 → 식대·캐터링 탭
  document.addEventListener('click', ev => {
    document.querySelectorAll('details.dd[open]').forEach(d => { if (!d.contains(ev.target) || ev.target.closest('.dd-i')) d.removeAttribute('open'); });
    const el = ev.target.closest('[data-act]');
    if (el && (view.contains(el))) { ACT[el.dataset.act] && ACT[el.dataset.act](el, ev); }
  });
  view.addEventListener('contextmenu', ev => { const el = ev.target.closest('[data-act="attCell"]'); if (el) attMenu(ev, el); });   // 출근부 칸: 사진·지각 사유
  view.addEventListener('contextmenu', ev => { const el = ev.target.closest('[data-ch="pl"]'); if (el) { ev.preventDefault(); plMemo(el); } });   // 현장 손익 칸: 메모
  view.addEventListener('contextmenu', ev => {   // 법인카드 목록 줄: 오른쪽 클릭 → 작은 메뉴 [🗑 삭제] (영수증 파일도 같이). 칸 안 글자를 선택해 둔 때는 원래 메뉴(복사)
    if (state.tab !== 'card' && state.tab !== 'cash') return;   // 전도금 목록도 같음
    const tr = ev.target.closest('tr[data-txid]'); if (!tr) return;
    const inp = ev.target.closest('input,textarea'); if (inp && typeof inp.selectionStart === 'number' && inp.selectionStart !== inp.selectionEnd) return;
    ev.preventDefault(); closeAttMenu();
    const id = tr.dataset.txid, t = db.tx.find(x => x.id === id); if (!t) return;
    const n = (t.receipts || []).length;
    const m = document.createElement('div'); m.id = 'attMenu'; m.className = 'no-print';   // 출근부 메뉴와 같은 id → 바깥 클릭·스크롤·Esc 로 닫힘
    m.style.cssText = `position:fixed;left:${ev.clientX}px;top:${ev.clientY}px;z-index:9000;background:#fff;color:#222;border:1px solid #ccd;border-radius:6px;box-shadow:0 4px 14px rgba(0,0,0,.18);padding:4px;min-width:170px;font-size:13px`;
    m.innerHTML = `<div style="padding:4px 8px;color:var(--muted);font-size:12px">${esc(t.date || '')} ${esc(t.merchant || '')} · ${fmt(t.amount)}원</div>`
      + `<button type="button" style="display:block;width:100%;text-align:left;border:0;background:none;padding:5px 8px;cursor:pointer;border-radius:4px;font:inherit;color:var(--bad)">🗑 삭제${n ? ` (영수증 ${n}개도)` : ''}</button>`;
    document.body.appendChild(m);
    const r = m.getBoundingClientRect();
    if (r.right > innerWidth) m.style.left = Math.max(4, innerWidth - r.width - 8) + 'px';
    if (r.bottom > innerHeight) m.style.top = Math.max(4, innerHeight - r.height - 8) + 'px';
    const b = m.querySelector('button');
    b.onmouseenter = () => { b.style.background = '#fff5f5'; }; b.onmouseleave = () => { b.style.background = 'none'; };
    b.onclick = () => { closeAttMenu(); if (state.cardSel) state.cardSel.delete(id); ACT.delTx({ dataset: { id }, noAsk: true }); };
  });
  document.addEventListener('mousedown', ev => { if (!ev.target.closest('#attMenu')) closeAttMenu(); });
  window.addEventListener('scroll', () => closeAttMenu(), true);
  document.addEventListener('keydown', ev => {   // Ctrl+Z 되돌리기 · Ctrl+Y(Ctrl+Shift+Z) 다시 실행 — 글자 입력 칸 안에서는 원래대로 글자 되돌리기
    if (!(ev.ctrlKey || ev.metaKey) || ev.altKey) return;
    const k = ev.code === 'KeyZ' ? 'z' : ev.code === 'KeyY' ? 'y' : String(ev.key || '').toLowerCase(); if (k !== 'z' && k !== 'y') return;   // code 로 판단 — 한글 입력 상태(ㅋ·ㅛ)에서도 됨
    const t = ev.target, typing = t && (t.isContentEditable || /^(INPUT|TEXTAREA)$/.test(t.tagName) && !/^(checkbox|radio|button|file|date|month)$/.test(t.type));
    if (typing && (t.isContentEditable || t._uv === undefined || t.value !== t._uv)) return;   // 칸에 들어와서 글자를 고친 중이면 그 칸의 글자 되돌리기 (안 고쳤으면 프로그램 되돌리기)
    if (document.querySelector('body > .modal-bg')) return;   // 품의서 미리보기 창
    const md = document.querySelector('#modalRoot .modal');
    if (md) {
      // [저장]·[취소] 가 있는 창: 아직 저장 전이라 되돌릴 것이 없음 → 안내만. [닫기] 뿐인 창(영수증 등 바로 저장되는 창): 창을 닫고 되돌림
      if ([...md.querySelectorAll('.actions [data-mi]')].some(b => /취소|저장|나중에/.test(b.textContent))) { ev.preventDefault(); toast('이 창 안에서는 되돌리기를 쓸 수 없습니다. 창을 닫은 뒤 Ctrl+Z 를 누르세요.'); return; }
      closeModal();
    }
    ev.preventDefault(); closeAttMenu();
    undoApply(k === 'y' || ev.shiftKey);
  });
  document.addEventListener('keydown', ev => {
    if (ev.key !== 'Escape') return;
    if ($('#attMenu')) { closeAttMenu(); return; }
    const ov = [...document.querySelectorAll('body > .modal-bg')].pop(); if (ov) { ov.remove(); return; }   // 품의서 미리보기 창
    // 팝업: 닫기 전에 저장 확인 (저장 버튼이 없으면 취소·닫기 버튼으로 닫음)
    const btns = [...document.querySelectorAll('#modalRoot .actions [data-mi]')]; if (!btns.length) return;
    const sv = btns.find(b => /저장/.test(b.textContent) && !/인쇄/.test(b.textContent)), cc = btns.find(b => /^(취소|닫기)/.test(b.textContent.trim()));
    ev.preventDefault();
    if (sv) { if (confirm('저장하시겠습니까?')) sv.click(); else closeModal(); }
    else if (cc) cc.click();
  });
  view.addEventListener('focusin', ev => { if (ev.target.dataset && ev.target.dataset.memo) state.lastMemo = ev.target.dataset.fid; });
  view.addEventListener('mousedown', ev => { if (ev.target.closest && ev.target.closest('[data-act="chip"]')) ev.preventDefault(); });   // 빠른 입력 칩: 사용내역 칸의 커서를 그대로 두고 넣음 (17 ACT.chip)
  // _uv: 칸에 들어올 때 값 (Ctrl+Z 판단) — 화면·팝업 어디든. 고친 값이 저장되면(change) 그 값이 새 기준 (저장하면서 1,000 처럼 모양을 바꾼 뒤 값까지)
  const uvSet = ev => { const t = ev.target; if (t && 'value' in t) { t._uv = t.value; setTimeout(() => { t._uv = t.value; }, 0); } };
  document.addEventListener('focusin', uvSet);
  document.addEventListener('change', uvSet, true);
  document.addEventListener('change', uvSet);
  view.addEventListener('change', ev => {
    const el = ev.target.closest('[data-ch]'); if (!el) return;
    CH[el.dataset.ch] && CH[el.dataset.ch](el);
    save(); scheduleRender();
  });
  view.addEventListener('keydown', ev => {
    if (ev.key === 'Enter' && (ev.target.tagName === 'INPUT' || ev.target.matches('textarea.memo2')) && ev.target.closest('table')) {
      // 엔터: 아래 행 같은 칸으로 이동
      const td = ev.target.closest('td'), tr = td.parentElement, idx = [...tr.children].indexOf(td);
      const next = tr.nextElementSibling && tr.nextElementSibling.children[idx];
      const inp = next && next.querySelector('input,select,textarea');
      ev.target.dispatchEvent(new Event('change', { bubbles: true }));
      if (inp) setTimeout(() => { const f = inp.dataset.fid; const el = f ? view.querySelector(`[data-fid="${CSS.escape(f)}"]`) : null; (el || inp).focus(); }, 10);
      ev.preventDefault();
    }
  });
  $('#tabs').addEventListener('click', ev => { const b = ev.target.closest('button'); if (!b) return; if (hiddenTab(b.dataset.tab)) { secUnlockDialog(b.dataset.tab); return; } state.tab = b.dataset.tab; render(); window.scrollTo(0, 0); });
  $('#settingsTopBtn').addEventListener('click', () => { state.tab = 'settings'; render(); window.scrollTo(0, 0); });
  $('#siteSelect').addEventListener('change', ev => { db.cur = ev.target.value; save(); render(); });
  $('#monthInput').addEventListener('change', ev => { if (ev.target.value) { state.ym = ev.target.value; render(); } });
  const verEl = $('#appVer'); if (verEl) verEl.textContent = 'v' + APP_VERSION;
  $('#prevMonth').onclick = () => { state.ym = ymAdd(state.ym, -1); render(); };
  $('#nextMonth').onclick = () => { state.ym = ymAdd(state.ym, 1); render(); };
  const todayBtn = $('#todayMonth'); if (todayBtn) todayBtn.onclick = () => { state.ym = todayStr().slice(0, 7); state.homeDay = todayStr(); render(); };   // 이번 달 + 홈 달력은 오늘 선택
  window.addEventListener('afterprint', () => { $('#printArea').innerHTML = ''; });
  window.addEventListener('beforeunload', ev => { if (FS.dirty || flushing) { flush(); ev.preventDefault(); ev.returnValue = ''; } });
  // 영수증: 파일을 내역 줄 위로 끌어다 놓기
  view.addEventListener('dragover', ev => { if (!ev.dataTransfer || ![...ev.dataTransfer.types].includes('Files')) return; const tr = ev.target.closest && ev.target.closest('tr[data-txid], tr[data-asid]'); if (tr) { ev.preventDefault(); tr.style.outline = '2px dashed var(--accent)'; } else if (state.tab === 'card' || state.tab === 'cash') ev.preventDefault(); });
  view.addEventListener('dragleave', ev => { const tr = ev.target.closest && ev.target.closest('tr[data-txid], tr[data-asid]'); if (tr) tr.style.outline = ''; });
  view.addEventListener('drop', ev => {
    const atr = ev.target.closest && ev.target.closest('tr[data-asid]');   // 12c 자산 줄: 증빙 사진
    if (atr) { ev.preventDefault(); atr.style.outline = ''; state.selAsset = atr.dataset.asid; assetAddPhotos(atr.dataset.asid, ev.dataTransfer.files); return; }
    const tr = ev.target.closest && ev.target.closest('tr[data-txid]');
    if (!tr) { if ((state.tab === 'card' || state.tab === 'cash') && ev.dataTransfer && ev.dataTransfer.files.length) { ev.preventDefault(); ocrReceipts(state.tab, [...ev.dataTransfer.files]); } return; }
    ev.preventDefault(); tr.style.outline = '';
    const t = db.tx.find(x => x.id === tr.dataset.txid); const files = [...ev.dataTransfer.files]; if (t && files.length) addReceipts(t, files);
  });
  // 영수증 붙여넣기 (Ctrl+V): 줄을 클릭해 두면 그 줄에, 아니면 여러 장 자동 인식
  view.addEventListener('mousedown', ev => { const tr = ev.target.closest && ev.target.closest('tr[data-txid], tr[data-asid]'); state.selTx = tr && tr.dataset.txid || null; state.selAsset = tr && tr.dataset.asid || null; view.querySelectorAll('tr.sel').forEach(x => x.classList.remove('sel')); if (tr) tr.classList.add('sel'); });
  document.addEventListener('paste', async ev => {
    if (!FS.ready || !ev.clipboardData) return;
    const files = [...ev.clipboardData.items].filter(i => i.kind === 'file' && /^image\//.test(i.type)).map(i => i.getAsFile()).filter(Boolean);
    if (!files.length) return;   // 글자 붙여넣기는 그대로
    const modalOpen = !!$('#modalRoot').innerHTML.trim();
    if (modalOpen && $('#modalRoot #asPhs') && state.assetPhAdd) { ev.preventDefault(); state.assetPhAdd(files); return; }   // 12c 자산 창
    if (!modalOpen && state.tab === 'asset') {   // 12c 자산 목록: 누른 줄에
      ev.preventDefault();
      if (state.selAsset && assetsOf().some(a => a.id === state.selAsset)) assetAddPhotos(state.selAsset, files);
      else toast('사진을 붙일 자산 줄을 먼저 누르세요 (또는 사진을 줄 위로 끌어다 놓기).');
      return;
    }
    if (modalOpen) {
      const t = state.rcModalTx && db.tx.find(x => x.id === state.rcModalTx);
      if (!t || !$('#modalRoot [data-fdel], #modalRoot .mbody')) return;
      ev.preventDefault(); closeModal(); await addReceipts(t, files); viewReceipts(t); return;
    }
    if (state.tab !== 'card' && state.tab !== 'cash') { toast('영수증 사진은 법인카드·전도금 탭에서 붙여넣으세요.'); return; }
    ev.preventDefault();
    const tr = (document.activeElement && document.activeElement.closest && document.activeElement.closest('tr[data-txid]')) || (state.selTx && view.querySelector(`tr[data-txid="${state.selTx}"]`));
    const t = tr && db.tx.find(x => x.id === tr.dataset.txid);
    if (t) { const r = await addReceipts(t, files, true); save(); render(); toast(r.bad ? rcWarnText(r.bad) : `${t.date.slice(5)} ${t.merchant || ''} ${fmt(t.amount)}원 줄에 영수증 ${files.length}장 붙임`); }
    else ocrReceipts(state.tab, files);
  });
  render();   // 폴더 연결 전 안내 화면 먼저 표시
  if (window.__mockRoot) { await openRoot(window.__mockRoot); }   // 점검용
  else {
    await rcInit();
    if (RC.want && !RC.ready) {   // 영수증 폴더 권한은 버튼을 눌러야 다시 받을 수 있음
      const b = document.createElement('button'); b.className = 'btn sm primary'; b.type = 'button'; b.textContent = '📁 영수증 폴더 열기'; b.title = RC.root.name;
      b.onclick = async () => { await rcReopen(); if (RC.ready) b.remove(); };
      $('#saveState').before(b);
    }
    await mbInit();   // 10c 휴대폰 사진함 (상단 [📱 휴대폰 영수증 N장])
    const h = await Promise.race([idb.get('root'), new Promise(r => setTimeout(() => r(null), 2000))]);
    if (h) {
      state.savedRootName = h.name;
      try { if (await h.queryPermission({ mode: 'readwrite' }) === 'granted') await openRoot(h); } catch (e) { }
    }
  }
  render();
  webUpdateWatch();

  if (hp.get('preview')) { // 인쇄 미리보기(점검용): #preview=cash|card|monthly
    const k = hp.get('preview'), d = todayStr(), no = `${site().docPrefix}-TEST`;
    const docs = k === 'cash' ? [docCashClaim(state.ym, no, d), docExpense({ date: d, items: [{ label: '전도금 청구', amount: 1234000, note: site().account }] }), docCashList(state.ym)]
      : k === 'card' ? [docCardSummary(state.ym)] : [docFundClaim(state.ym, no, d)];
    $('#printArea').innerHTML = docs.join('<hr>'); $('#printArea').style.display = 'block'; $('#printArea').style.padding = '20px'; $('#printArea').style.background = '#fff'; view.style.display = 'none';
    return;
  }
}
/* ---------- 웹 주소로 열었을 때: 오프라인 캐시 + 새 버전 안내 ----------
   웹에 올리기.bat 이 올릴 때 version.json 에 버전을 적음. 파일로 열면(file://) 아무것도 안 함. */
const IS_WEB = /^https?:$/.test(location.protocol);
function webUpdateWatch() {
  if (!IS_WEB) return;
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => { });
  if (/[?&]v=/.test(location.search)) history.replaceState(null, '', location.pathname + location.hash);   // [지금 적용]이 붙인 ?v= 는 주소창에서 지움
  let shown = false;
  const check = async () => {
    if (shown || document.hidden) return;
    try {
      const r = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' }); if (!r.ok) return;
      const v = (await r.json()).v; if (!v || v === APP_VERSION) return;
      shown = true;
      const bar = document.createElement('div'); bar.className = 'no-print';
      bar.style.cssText = 'position:fixed;left:50%;bottom:20px;transform:translateX(-50%);z-index:9999;background:#1f4e8c;color:#fff;padding:10px 14px;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.25);display:flex;gap:10px;align-items:center;font-size:14px';
      bar.innerHTML = `새 버전(v${esc(v)})이 나왔습니다. <button class="btn sm" type="button">지금 적용</button><button class="btn ghost sm" type="button" style="color:#fff">나중에</button>`;
      const [ok, later] = bar.querySelectorAll('button');
      ok.onclick = async () => { ok.disabled = true; try { if (FS.dirty) await flush(); } catch (e) { }
        location.replace(location.pathname + '?v=' + encodeURIComponent(v) + location.hash); };   // 그냥 새로고침하면 깃허브 서버가 10분 동안 예전 html 을 줄 수 있음 → 주소를 바꿔 새 html 을 받음
      later.onclick = () => { bar.remove(); setTimeout(() => { shown = false; }, 30 * 60 * 1000); };
      document.body.appendChild(bar);
    } catch (e) { }   // 오프라인이면 조용히 넘어감
  };
  setTimeout(check, 3000); setInterval(check, 5 * 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
}

init();
