/* 유성 현장 관리 프로그램 — 상태·데이터 구조·폴더 저장·관리자 잠금·저장/불러오기
 * (원래 app.js 의 화면 부분. 모든 js/*.js 는 같은 전역 공간을 공유하며 html 에 적힌 순서대로 읽힘) */
'use strict';


const $ = (s, r = document) => r.querySelector(s);
const view = $('#view');
let db;
const state = { tab: 'home', ym: '', mealSub: 'att', cardFilter: '', includeSnack: false, lastMemo: null, savedRootName: '' };

/* ---------- 데이터 ---------- */
function defaultDb() {
  return {
    version: 1, savedAt: 0,
    settings: { settleDay: 5, payrollDay: 10, payrollClose: 2, monthlyClose: 20, monthlyPay: 25, memoRules: DEFAULT_MEMO_RULES, mealLimits: DEFAULT_MEAL_LIMITS, mealLimitDefault: 9000, mealLimitStaff: 12000 },
    sites: [], cur: null, cards: [], staff: [], tx: [], vendors: [],
    monthly: {}, attendance: {}, catering: {}, cashClaim: {}, done: {}, docs: {}, merchantMap: {}, payroll: {}, pl: {}, attach: {}, pumui: {}, fuel: {}, billing: {},
  };
}
function newSite(name) {
  return {
    id: uid(), name: name || '새 현장', fullName: '', docPrefix: 'YS-현장', company: '㈜유성',
    approvers: [{ title: '본부장', name: '' }, { title: '총괄', name: '' }, { title: '최종', name: '' }],
    manager: '', checker: '', account: '', startYm: ymAdd(todayStr().slice(0, 7), -1),
    cateringLunch: 8000, cateringSnack: 0,
  };
}
/* ---------- 폴더 저장 (현장별 폴더 / 텍스트 파일) — 본사 현장 폴더 구조와 같게 ----------
 * [데이터 폴더]/공통설정.txt
 * [현장]/현장설정.txt                                   ← 현장 정보·카드·직원·거래처
 * [현장]/A. 기안품의/C. 작성완료 · A. 결재완료 · B. 스캔본 · 그림   ← 품의서 엑셀 / 결재본 / 스캔본 / 프로그램 품의서 그림 (예전 "작성완료" 폴더도 읽음)
 * [현장]/B. 자금관련/26년 08월 서류철/데이터.txt         ← 그 달의 모든 입력 자료
 * [현장]/B. 자금관련/26년 08월 서류철/영수증 · 증빙       ← 영수증 사진 / 카드 명세서 PDF 등
 * [현장]/B. 자금관련/A~F. … 스캔                          ← 결재받은 법인카드·선결제·월결제·인건비·전도금 스캔본
 * [현장]/C. 근무이행각서 · D. 기타(휴가계 등)
 * (예전 방식 [현장]/2026-08/, [현장]/품의서/ 는 열 때 새 위치로 자동으로 옮김) */
const DIR = {
  pm: 'A. 기안품의', pmDraft: 'A. 기안품의/C. 작성완료', pmDraftOld: 'A. 기안품의/작성완료', pmDone: 'A. 기안품의/A. 결재완료', pmScan: 'A. 기안품의/B. 스캔본', pmImg: 'A. 기안품의/그림',
  fund: 'B. 자금관련',
  scan: { card200: 'B. 자금관련/A. 법인카드 사용내역서(20만원 이상) 스캔', card: 'B. 자금관련/B. 법인카드 정산 스캔', prepay: 'B. 자금관련/C. 법인카드 선결제 스캔', monthly: 'B. 자금관련/D. 월결제 스캔', pay: 'B. 자금관련/E. 인건비 스캔', cash: 'B. 자금관련/F. 전도금 정산 스캔' },
  etc: ['C. 근무이행각서', 'D. 기타(휴가계 등)'],
};
const SCAN_LABEL = { card200: '법인카드 사용내역서(20만원 이상)', card: '법인카드 정산', prepay: '법인카드 선결제', monthly: '월결제', pay: '인건비', cash: '전도금 정산' };
const monthDirName = ym => `${ym.slice(2, 4)}년 ${ym.slice(5, 7)}월 서류철`;
const monthPath = ym => `${DIR.fund}/${monthDirName(ym)}`;
const ymOfMonthDir = n => { const m = String(n).match(/^(\d{2})년 (\d{2})월 서류철$/); return m ? `20${m[1]}-${m[2]}` : null; };
const parts = path => path.split('/');
const MONTH_KEYS = ['monthly', 'attendance', 'catering', 'cashClaim', 'done', 'docs', 'payroll', 'pl', 'attach', 'pumui', 'fuel', 'billing'];   // fuel: 지금은 쓰는 화면이 없음 — 예전 자료가 있으면 지워지지 않게 저장·불러오기만 유지
const FS = { root: null, ready: false, written: new Map(), mtime: new Map(), conflict: [], dirty: false, failed: false, made: new Set(), legacy: [], secPlain: {} };
/* ---------- 관리자 잠금: 경리·실무 직원이 같은 데이터 폴더를 쓰므로 현장 손익·급여(유성 정직원·기획 등)는 비밀번호로 암호화 ----------
 * 데이터 파일에는 암호문만 남고(site.secretBlob), 비밀번호를 넣은 창에서만 풀어서 보여 줌. 잠긴 상태 = 경리 모드 */
/* 비밀번호는 현장별 (site.sec = { salt, check }), 숨길 범위(secOpt)는 전 현장 공통. 푼 키도 현장별 SEC.keys[현장 id] */
const SEC = { keys: {} };
const SECKEY_LS = 'gyeongri_sec_key';   // 이 PC에 기억한 키: { 현장 id: 키 } (예전엔 키 하나 문자열)
const siteSec = (sid = db && db.cur) => { const st = db && (db.sites || []).find(x => x.id === sid); return st && st.sec && st.sec.check ? st.sec : null; };
const secOn = (sid = db && db.cur) => !!siteSec(sid);
const isAdmin = (sid = db && db.cur) => !secOn(sid) || !!SEC.keys[sid];
const secOptEditable = () => db.sites.every(x => isAdmin(x.id));   // 공통 범위를 바꾸면 잠긴 현장 자료가 빠질 수 있어 모두 풀었을 때만
const secOpt = () => Object.assign({ pl: true, hq: true, teams: '', tabs: ['pl'] }, ((db.settings || {}).sec || {}).opt || {});   // 급여 비공개 = 유성 정직원만 (구분 추가는 설정 → 관리자 잠금)
function isSecretStaff(x) {
  if (!x || !secOn(x.siteId) || x.kind === '외부') return false;
  const o = secOpt(); if (x.secret === false) return false; if (x.secret) return true;   // 사람별 지정이 구분 기준보다 우선
  if (o.hq && x.kind === '정직원') return true;
  const t = normLabel(x.team); return !!t && String(o.teams || '').split(/[,，\s]+/).filter(Boolean).some(k => t.includes(normLabel(k)));
}
const hiddenTab = tab => !isAdmin() && (tab === 'budget' || (secOpt().tabs || []).includes(tab));   // 예산·손익(14c)은 경리 모드에서 늘 잠김
const payLocked = (sid = db.cur) => !isAdmin(sid) &&db.staff.some(x => x.siteId === sid && x.kind !== '정직원' && isSecretStaff(x));   // 비공개 급여가 청구에 들어가는 사람
const b64 = u8 => { let t = ''; for (let i = 0; i < u8.length; i += 0x8000) t += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(t); };
const unb64 = t => Uint8Array.from(atob(t), c => c.charCodeAt(0));
async function secDerive(pw, salt) { const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveKey']); return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 200000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']); }
async function secEnc(key, obj) { const iv = crypto.getRandomValues(new Uint8Array(12)); const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(obj)))); return { iv: b64(iv), d: b64(ct) }; }
async function secDec(key, blob) { const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(blob.iv) }, key, unb64(blob.d)); return JSON.parse(new TextDecoder().decode(pt)); }
const secHidden = sid => new Set(db.staff.filter(x => x.siteId === sid && isSecretStaff(x)).map(x => x.id));
function secCollect(st) {   // 이 현장의 비공개 자료 (평문 파일에서는 빠짐)
  const sid = st.id, hid = secHidden(sid), out = { staffPay: {}, payroll: {}, pl: secOpt().pl ? ((db.pl || {})[sid] || {}) : {}, budget: st.budget || null };   // budget = 14c 예산 (경리 비공개)
  db.staff.filter(x => hid.has(x.id) && x.pay).forEach(x => { out.staffPay[x.id] = x.pay; });
  Object.entries((db.payroll || {})[sid] || {}).forEach(([ym, m]) => Object.keys(m || {}).forEach(id => { if (hid.has(id)) nest(out.payroll, ym)[id] = m[id]; }));
  return out;
}
async function secRefresh() {   // 저장할 때: 잠금을 푼 현장만, 바뀐 비공개 자료를 다시 암호화 (잠긴 현장의 암호문은 그대로 둠)
  for (const st of db.sites) {
    const key = SEC.keys[st.id]; if (!key || !secOn(st.id)) continue;
    const plain = JSON.stringify(secCollect(st)); if (FS.secPlain[st.id] === plain && st.secretBlob) continue; st.secretBlob = await secEnc(key, JSON.parse(plain)); FS.secPlain[st.id] = plain;
  }
}
async function secMergeAll(sids) {   // 암호문 → 화면 자료에 합치기 (sids: 방금 푼 현장들)
  for (const st of db.sites.filter(x => sids.includes(x.id))) {
    const key = SEC.keys[st.id]; if (!key || !st.secretBlob) continue;
    let d; try { d = await secDec(key, st.secretBlob); } catch (e) { toast(`${st.name}: 비공개 자료를 풀 수 없습니다 (비밀번호가 바뀌었을 수 있음)`); continue; }
    Object.entries(d.staffPay || {}).forEach(([id, pay]) => { const x = db.staff.find(y => y.id === id); if (x) x.pay = Object.assign({}, x.pay || {}, pay); });
    Object.entries(d.payroll || {}).forEach(([ym, m]) => Object.entries(m || {}).forEach(([id, rec]) => { nest(db.payroll, st.id, ym)[id] = rec; }));
    Object.entries(d.pl || {}).forEach(([ym, v]) => { nest(db.pl, st.id)[ym] = Object.assign({}, v, ((db.pl[st.id] || {})[ym]) || {}); });
    if (d.budget && !st.budget) st.budget = d.budget;   // 14c 예산
    FS.secPlain[st.id] = JSON.stringify(secCollect(st));
  }
  // 예전 기본값 "기획"(계약직 기획까지 비공개) → 정직원만 비공개로. 풀린 상태(비공개 자료가 합쳐진 뒤)에서만 바꿔야 자료가 안 빠짐
  const o = (db.settings.sec || {}).opt;
  if (o && String(o.teams || '').trim() === '기획' && secOptEditable()) { o.teams = ''; save(); toast('급여 비공개를 유성 정직원만으로 바꿨습니다 (기획 계약직은 경리 모드에서도 보임).'); }
}
async function secTryKey(sid, key) { const s = siteSec(sid); if (!s || !key) return false; try { return (await secDec(key, s.check)) === 'ok'; } catch (e) { return false; } }
const secMem = () => { try { const r = localStorage.getItem(SECKEY_LS) || ''; return !r ? {} : r[0] === '{' ? JSON.parse(r) : { '*': r }; } catch (e) { return {}; } };
const secMemSet = m => { try { if (Object.keys(m).length) localStorage.setItem(SECKEY_LS, JSON.stringify(m)); else localStorage.removeItem(SECKEY_LS); } catch (e) { } };
async function secAuto() {   // 폴더를 열 때: 이 창에서 이미 풀었거나, 이 PC에 기억해 둔 키가 있는 현장은 자동 해제
  const m = secMem(), before = JSON.stringify(m), open = [];
  for (const st of db.sites) {
    const sid = st.id;
    if (!secOn(sid)) { delete SEC.keys[sid]; continue; }
    if (SEC.keys[sid] && !(await secTryKey(sid, SEC.keys[sid]))) delete SEC.keys[sid];
    if (!SEC.keys[sid]) {
      const raw = m[sid] || m['*']; let key = null;
      if (raw) { try { key = await crypto.subtle.importKey('raw', unb64(raw), 'AES-GCM', true, ['encrypt', 'decrypt']); } catch (e) { key = null; } }
      if (key && await secTryKey(sid, key)) { SEC.keys[sid] = key; m[sid] = raw; } else delete m[sid];
    }
    if (SEC.keys[sid]) open.push(sid);
  }
  delete m['*']; if (JSON.stringify(m) !== before) secMemSet(m);   // 예전 키 하나 → 현장별로 바꿔 저장
  await secMergeAll(open);
}
async function secRemember(on, sids = [db.cur]) {
  const m = secMem(); delete m['*'];
  for (const sid of sids) { try { if (on && SEC.keys[sid]) m[sid] = b64(new Uint8Array(await crypto.subtle.exportKey('raw', SEC.keys[sid]))); else delete m[sid]; } catch (e) { } }
  secMemSet(m);
}
const secRemembered = (sid = db.cur) => !!secMem()[sid];
async function secUnlockWith(pw, sids) {   // 이 비밀번호로 풀리는 현장 찾기 (같은 소금이면 한 번만 계산)
  const bySalt = {}, ok = [];
  for (const sid of sids) {
    const s = siteSec(sid); if (!s || SEC.keys[sid]) continue;
    const key = bySalt[s.salt] || (bySalt[s.salt] = await secDerive(pw, unb64(s.salt)));
    if (await secTryKey(sid, key)) { SEC.keys[sid] = key; ok.push(sid); }
  }
  return ok;
}
function pwDialog(title, html, onOk) {   // 비밀번호 입력 창
  const r = modal(title, `${html}<div class="form-grid" style="margin-top:8px"><label>비밀번호<input type="password" id="secPw" autocomplete="new-password"></label>${/secPw2/.test(title + html) ? '' : ''}</div>`, [{ label: '취소' }, { label: '확인', cls: 'primary', onClick: async root => { const ok = await onOk(root); return ok === false ? true : undefined; } }], 's');
  setTimeout(() => { const i = $('#secPw', r); if (i) { i.focus(); i.onkeydown = ev => { if (ev.key === 'Enter') $('[data-mi="1"]', r).click(); }; } }, 0);
  return r;
}
const siteNames = sids => sids.map(id => (db.sites.find(x => x.id === id) || {}).name || '').filter(Boolean).join(', ');
function secUnlockDialog(go) {   // go = 잠긴 탭을 눌러서 연 경우 → 풀리면 그 탭으로
  const sid = db.cur, others = db.sites.filter(x => x.id !== sid && secOn(x.id) && !SEC.keys[x.id]).length;
  pwDialog('관리자 잠금 해제', `<p class="small"><b>${esc(site().name)}</b> 현장의 손익·급여(유성 정직원·기획 등)를 보려면 이 현장 관리자 비밀번호를 넣으세요.${others ? ` 같은 비밀번호를 쓰는 다른 현장도 함께 풀립니다.` : ''}</p><label class="small"><input type="checkbox" id="secRem"> 이 PC에서 계속 풀어 두기 (실무책임자 전용 PC에서만)</label>`, async root => {
    const pw = $('#secPw', root).value; if (!pw) return false;
    const mine = await secUnlockWith(pw, [sid]);
    if (!mine.length) { toast('이 현장 비밀번호가 맞지 않습니다.'); return false; }
    const ok = mine.concat(await secUnlockWith(pw, db.sites.map(x => x.id).filter(x => x !== sid)));
    await secMergeAll(ok); await secRemember($('#secRem', root).checked, ok); if (typeof go === 'string') state.tab = go; render();
    toast(`관리자 모드 — ${siteNames(ok)} 현장 손익·급여가 보입니다.`);
  });
}
async function secLock() {   // 푼 현장을 모두 잠금 (자리를 비울 때 한 번에)
  const sids = Object.keys(SEC.keys); if (!sids.length) return;
  await flush(); SEC.keys = {}; await secRemember(false, sids); FS.secPlain = {};
  await openRoot(FS.root); toast('잠갔습니다 (경리 모드). 현장 손익·비공개 급여는 보이지 않습니다.');
}
function secSetupDialog(change) {
  const sid = db.cur;
  // 함께 걸 현장: 처음 켤 때 = 비밀번호가 없는 현장, 바꿀 때 = 지금 풀려 있는 다른 현장
  const more = db.sites.filter(x => x.id !== sid && (change ? secOn(x.id) && SEC.keys[x.id] : !secOn(x.id)));
  const r = modal(change ? `관리자 비밀번호 바꾸기 — ${site().name}` : `관리자 잠금 켜기 — ${site().name}`, `<p class="small">${change ? '이 현장의 새 비밀번호를 두 번 넣으세요. 저장된 비공개 자료를 새 비밀번호로 다시 암호화합니다.' : '이 현장의 손익과 비공개 급여를 이 비밀번호로 암호화해서 저장합니다. 비밀번호를 모르는 사람(경리)은 프로그램에서도, 데이터 폴더의 파일을 직접 열어도 숫자를 볼 수 없습니다.'}
      비밀번호는 <b>현장마다 따로</b>입니다.</p>
      <div class="banner warn small">비밀번호를 잊으면 숨긴 자료(손익 수익·급여)를 되살릴 수 없습니다. 종이 등에 따로 적어 두세요.</div>
      <div class="form-grid"><label>비밀번호 (4자 이상)<input type="password" id="secPw1" autocomplete="new-password"></label><label>한 번 더<input type="password" id="secPw2" autocomplete="new-password"></label></div>
      ${more.length ? `<label class="small" style="display:block;margin-top:8px"><input type="checkbox" id="secMore"> ${change ? '지금 풀려 있는' : '비밀번호가 없는'} 다른 현장에도 같은 비밀번호 쓰기 (${esc(more.map(x => x.name).join(', '))})</label>` : ''}`, [
    { label: '취소' },
    { label: change ? '바꾸기' : '잠금 켜기', cls: 'primary', onClick: async root => {
      const a = $('#secPw1', root).value, b = $('#secPw2', root).value;
      if (a.length < 4) { toast('비밀번호는 4자 이상이어야 합니다.'); return true; } if (a !== b) { toast('두 비밀번호가 다릅니다.'); return true; }
      if (change && !SEC.keys[sid]) { toast('먼저 이 현장 잠금을 푸세요.'); return true; }
      const all = [sid, ...(($('#secMore', root) || {}).checked ? more.map(x => x.id) : [])];
      const salt = crypto.getRandomValues(new Uint8Array(16)), key = await secDerive(a, salt), check = await secEnc(key, 'ok');
      db.settings.sec = Object.assign({}, db.settings.sec, { opt: secOpt() });   // 공통 범위 (비밀번호는 현장에)
      const rem = all.filter(id => secRemembered(id));
      for (const id of all) { const st = db.sites.find(x => x.id === id); st.sec = { salt: b64(salt), check }; SEC.keys[id] = key; delete FS.secPlain[id]; }
      if (rem.length) await secRemember(true, rem);
      save(); await flush(); render(); toast(`${siteNames(all)}: ${change ? '비밀번호를 바꿨습니다.' : '관리자 잠금을 켰습니다. 화면 위 🔓 버튼으로 잠그면 경리 모드가 됩니다.'}`);
    } }], 'm');
  setTimeout(() => { const i = $('#secPw1', r); if (i) i.focus(); }, 0);
}
async function secDisable() {   // 이 현장만 잠금 끄기
  const sid = db.cur, st = site();
  if (!SEC.keys[sid] || !confirm(`${st.name}현장의 관리자 잠금을 끌까요?\n이 현장 손익·급여가 다시 누구나 볼 수 있게 저장됩니다. (다른 현장 잠금은 그대로)`)) return;
  await secRemember(false, [sid]); delete st.sec; delete st.secretBlob; delete SEC.keys[sid]; delete FS.secPlain[sid];
  save(); await flush(); render(); toast(`${st.name}: 관리자 잠금을 껐습니다.`);
}
function secPanel() {
  const on = secOn(), adm = isAdmin(), o = secOpt();
  const hidN = db.staff.filter(x => x.siteId === db.cur && isSecretStaff(x)).length;
  const tabs = [['pl', '현장 손익'], ['bill', '매출 청구'], ['pay', '인건비 (전체)']];
  const edit = secOptEditable(), lockedOthers = db.sites.filter(x => !isAdmin(x.id)).map(x => x.name);
  const status = db.sites.length > 1 ? `<p class="small" style="margin:0 0 8px">현장별 잠금 (비밀번호는 현장마다 따로): ${db.sites.map(x => `<span class="badge ${!secOn(x.id) ? '' : SEC.keys[x.id] ? 'ok' : 'warn'}" style="margin-right:4px">${esc(x.name)} ${!secOn(x.id) ? '잠금 없음' : SEC.keys[x.id] ? '🔓' : '🔒'}</span>`).join('')}</p>` : '';
  return `<div class="panel"><h3 style="margin-top:0">관리자 잠금 <span class="muted small">— ${esc(site().name)}현장 · 경리·실무 직원이 같은 데이터 폴더를 쓸 때 현장 손익·급여 숨기기</span></h3>
      ${status}
      ${!on ? `<p class="small">이 현장은 잠금이 꺼져 있어 이 프로그램을 여는 누구나 이 현장 손익·급여를 볼 수 있습니다.</p>
        <ul class="small" style="margin:4px 0 10px 18px;padding:0"><li>관리자(실무책임자) 비밀번호를 정하면 <b>현장 손익 탭</b>과 <b>유성 정직원·기획 급여</b>가 암호화되어 저장됩니다</li>
        <li>비밀번호를 모르면 = <b>경리 모드</b>: 그 탭·사람이 보이지 않고, 데이터 폴더의 파일을 직접 열어도 숫자가 없습니다</li>
        <li>경리 모드에서도 출근부·식대·법인카드·전도금·월결제·품의서와 나머지 직원 인건비는 그대로 씁니다</li></ul>
        <button class="btn primary" data-act="secSetup">이 현장 관리자 비밀번호 정하기</button>`
    : !adm ? `<p class="small">🔒 <b>경리 모드</b>입니다. 이 현장 손익과 비공개 급여(${hidN}명)는 관리자만 볼 수 있습니다.</p><button class="btn primary" data-act="secUnlock">관리자 잠금 해제</button>`
    : `<p class="small">🔓 <b>관리자 모드</b> — 이 창에서 이 현장 잠금을 풀었습니다. 다 쓰면 화면 위 [🔓 관리자] 버튼(또는 아래 [잠그기])으로 잠그세요. 잠그면 푼 현장이 모두 잠깁니다.</p>
        <p class="small muted" style="margin:0 0 4px">아래 숨길 범위는 <b>전 현장 공통</b>입니다.${edit ? '' : ` 잠긴 현장(${esc(lockedOthers.join(', '))})까지 모두 풀어야 바꿀 수 있습니다 (잠긴 현장 자료가 빠지지 않도록).`}</p>
        <fieldset ${edit ? '' : 'disabled'} style="border:0;padding:0;margin:0"><div class="form-grid">
          <label class="small" style="align-self:end"><input type="checkbox" data-ch="secOpt" data-f="pl" ${o.pl ? 'checked' : ''}> 현장 손익 자료 암호화 (수익·직접 입력 값)</label>
          <label class="small" style="align-self:end"><input type="checkbox" data-ch="secOpt" data-f="hq" ${o.hq ? 'checked' : ''}> 유성 정직원 급여 비공개</label>
          <label>급여 비공개 구분 (쉼표로 여러 개 — 구분 이름에 들어 있으면)<input value="${esc(o.teams || '')}" data-ch="secOpt" data-f="teams" data-fid="secTeams" placeholder="비우면 유성 정직원만"></label>
          <label class="small" style="grid-column:span 2">경리 모드에서 잠글 탭 (메뉴에 🔒 표시):${tabs.map(([k, l]) => `<label style="display:inline;margin-right:12px"><input type="checkbox" data-ch="secTab" data-k="${k}" ${(o.tabs || []).includes(k) ? 'checked' : ''}> ${l}</label>`).join('')}</label>
        </div></fieldset>
        <p class="small muted" style="margin-top:6px">이 현장 비공개 급여: <b>${hidN}명</b> (${esc(db.staff.filter(x => x.siteId === db.cur && isSecretStaff(x)).map(x => x.name).join(', ') || '없음')}) · 사람별로는 설정 → 직원·카드의 "급여 비공개" 칸으로 더 지정할 수 있습니다.
          경리 모드에서는 비공개 급여가 들어가는 인건비 자금청구서·세부내역 인쇄와 엑셀 저장을 관리자만 할 수 있습니다.</p>
        <div class="row" style="margin-top:8px"><button class="btn primary" data-act="secLock">잠그기 (경리 모드로)</button>
          <label class="small"><input type="checkbox" data-ch="secRem" ${secRemembered() ? 'checked' : ''}> 이 PC에서 계속 풀어 두기 (실무책임자 전용 PC에서만)</label>
          <button class="btn sm" data-act="secChange">이 현장 비밀번호 바꾸기</button><button class="btn sm danger" data-act="secOff">이 현장 잠금 끄기</button></div>`}
      <p class="muted small" style="margin-top:10px">※ 엑셀로 저장한 파일, 품의서 엑셀(채용 품의의 급여 등)·스캔본은 암호화되지 않습니다. 급여가 들어간 파일은 관리자 PC에만 보관하세요.
        잠금을 켜기 전에 저장된 예전 파일은 드롭박스 "버전 기록"에 남아 있을 수 있습니다.</p></div>`;
}
const J = o => JSON.stringify(o, null, 1);
const safeName = v => String(v || '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 40) || '현장';
/* ---------- 영수증 보관 폴더 (이 PC 설정) ----------
 * 영수증·증빙·입고사진은 회사 드롭박스(용량 작음) 대신 따로 고른 폴더(예: 구글 드라이브\유성 영수증)에 저장.
 * 경로는 같음: [영수증 폴더]/[현장 폴더]/B. 자금관련/26년 11월 서류철/영수증/… — 자료 안의 파일 경로는 그대로.
 * 읽을 때는 영수증 폴더 → 없으면 데이터 폴더(예전에 저장한 것) 순서로 찾음. */
const RC = { root: null, ready: false, want: false };
const isPhotoPath = p => /^[^/]+\/B\. 자금관련\/\d{2}년 \d{2}월 서류철\/(영수증|증빙|입고사진|출근사진)(\/|$)/.test(p);
const RC_NEED = '영수증 보관 폴더 권한이 필요합니다 — 화면 위 [📁 영수증 폴더 열기]를 누르세요.';
async function walkDir(root, parts, create) { let d = root; for (const p of parts) d = await d.getDirectoryHandle(p, { create }); return d; }
async function dirAt(parts, create = true) {
  if (RC.want && isPhotoPath(parts.join('/'))) {
    if (!create) { if (RC.ready) { try { return await walkDir(RC.root, parts, false); } catch (e) { } } return walkDir(FS.root, parts, false); }
    if (!RC.ready) throw new Error(RC_NEED);
    return walkDir(RC.root, parts, true);
  }
  return walkDir(FS.root, parts, create);
}
async function fileAt(path, create) {
  const parts = path.split('/'); const name = parts.pop();
  if (!create && RC.want && isPhotoPath(parts.join('/'))) {
    if (RC.ready) { try { return await (await walkDir(RC.root, parts, false)).getFileHandle(name); } catch (e) { } }
    return (await walkDir(FS.root, parts, false)).getFileHandle(name);
  }
  return (await dirAt(parts, create)).getFileHandle(name, { create });
}
async function rcInit() {   // 시작할 때: 이 PC에 고른 영수증 폴더가 있으면 권한 확인
  const h = await Promise.race([idb.get('rcRoot'), new Promise(r => setTimeout(() => r(null), 2000))]).catch(() => null);
  if (!h) return;
  RC.root = h; RC.want = true;
  try { RC.ready = (await h.queryPermission({ mode: 'readwrite' })) === 'granted'; } catch (e) { RC.ready = false; }
}
async function rcReopen() {
  if (!RC.root) return rcPick();
  try { RC.ready = (await RC.root.requestPermission({ mode: 'readwrite' })) === 'granted'; } catch (e) { RC.ready = false; }
  toast(RC.ready ? `영수증 폴더 📁 ${RC.root.name} 사용` : '영수증 폴더 권한이 필요합니다.'); render();
}
async function rcPick() {
  if (!window.showDirectoryPicker) return;
  let h; try { h = await showDirectoryPicker({ id: 'yusung-receipts', mode: 'readwrite' }); } catch (e) { return; }
  if (FS.root && (await FS.root.isSameEntry(h) || await FS.root.resolve(h))) { toast('데이터 폴더(드롭박스)와 다른 곳을 고르세요. 예: 구글 드라이브 안에 "유성 영수증" 폴더'); return; }
  await idb.set('rcRoot', h); RC.root = h; RC.want = true; RC.ready = true;
  render(); toast(`이제 영수증·증빙 사진은 📁 ${h.name} 에 저장합니다.`);
  const n = await rcCount(); if (n && confirm(`데이터 폴더(드롭박스)에 영수증·증빙 파일이 ${n}개 있습니다.\n지금 영수증 폴더로 옮겨 드롭박스 용량을 비울까요? (사진은 작게 줄여서 옮김)`)) await rcMove();
}
async function rcOff() {
  if (!confirm('영수증 폴더 사용을 끌까요?\n앞으로 영수증은 다시 데이터 폴더(드롭박스)에 저장됩니다.\n영수증 폴더에 있는 사진은 이 PC에서 보이지 않게 됩니다 (폴더는 그대로 남음).')) return;
  await idb.set('rcRoot', null); RC.root = null; RC.want = false; RC.ready = false; render();
}
/* 데이터 폴더(드롭박스)에 있는 영수증·증빙·입고사진 → 영수증 폴더로 옮기기 (복사 확인 후 드롭박스에서 지움) */
async function rcPhotoFiles() {
  const out = [];
  const walk = async (dir, path) => { for await (const [n, h] of dir.entries()) { const p = `${path}/${n}`; if (h.kind === 'directory') await walk(h, p); else out.push({ dir, name: n, path: p }); } };
  for (const st of db.sites) {
    if (!st.folder) continue;
    let fund; try { fund = await walkDir(FS.root, [st.folder, DIR.fund], false); } catch (e) { continue; }
    for await (const [mn, mh] of fund.entries()) {
      if (mh.kind !== 'directory' || !ymOfMonthDir(mn)) continue;
      for (const sub of ['영수증', '증빙', '입고사진', '출근사진']) { let d; try { d = await mh.getDirectoryHandle(sub); } catch (e) { continue; } await walk(d, `${st.folder}/${DIR.fund}/${mn}/${sub}`); }
    }
  }
  return out;
}
const rcCount = async () => (FS.ready ? (await rcPhotoFiles()).length : 0);
async function rcMove() {
  if (!RC.ready || !FS.ready) { toast(RC_NEED); return; }
  const files = await rcPhotoFiles(); if (!files.length) { toast('옮길 영수증 파일이 없습니다.'); return; }
  let n = 0, fail = 0, freed = 0, saved = 0;
  toast(`영수증 ${files.length}개 옮기는 중… (창을 닫지 마세요)`);
  for (const f of files) {
    try {
      const file = await (await f.dir.getFileHandle(f.name)).getFile();
      const ps = f.path.split('/'); ps.pop();
      const dst = await walkDir(RC.root, ps, true);
      let exists = false; try { await dst.getFileHandle(f.name); exists = true; } catch (e) { }
      if (!exists) {
        let blob = file;   // 큰 JPG 는 줄여서 (이름이 같아야 하므로 JPG 만)
        if (/\.jpe?g$/i.test(f.name) && file.size > PHOTO_OPT.lim) { try { const b = await shrinkPhoto(file); if (b && b.size < file.size * 0.9) blob = b; } catch (e) { } }
        const w = await (await dst.getFileHandle(f.name, { create: true })).createWritable(); await w.write(blob); await w.close();
        const chk = await (await dst.getFileHandle(f.name)).getFile(); if (chk.size !== blob.size) throw new Error('복사 확인 실패');
        saved += file.size - blob.size;
      }
      await f.dir.removeEntry(f.name); freed += file.size; n++;
    } catch (e) { fail++; console.error(f.path, e); }
    if ((n + fail) % 20 === 0) toast(`영수증 옮기는 중… ${n + fail} / ${files.length}`);
  }
  toast(`영수증 ${n}개를 옮겨 드롭박스에서 ${fmtSize(freed)} 비웠습니다${saved > 0 ? ` (사진 줄여서 ${fmtSize(saved)} 절약)` : ''}${fail ? ` · ${fail}개 실패 — 드롭박스 동기화가 끝난 뒤 다시 누르세요` : ''}.`);
  render();
}
async function writeFile(path, data) { const h = await fileAt(path, true); const w = await h.createWritable(); await w.write(data); await w.close(); return h; }
async function readText(dir, name) { try { const f = await (await dir.getFileHandle(name)).getFile(); return { text: await f.text(), mtime: f.lastModified }; } catch (e) { return null; } }
function siteMonths(sid) {
  const set = new Set();
  db.tx.forEach(t => { if (t.siteId === sid) set.add(ymOf(t.date)); });
  MONTH_KEYS.forEach(k => Object.keys((db[k] || {})[sid] || {}).forEach(ym => set.add(ym)));
  return [...set].filter(ym => /^\d{4}-\d{2}$/.test(ym)).sort();
}
function buildChunks() {
  const out = new Map();
  out.set('공통설정.txt', J({ 종류: '경리업무 공통설정', version: 2, settings: db.settings, merchantMap: db.merchantMap, cur: db.cur, siteOrder: db.sites.map(x => x.id) }));
  for (const st of db.sites) {
    if (!st.folder) continue;   // 아직 회사 현장 폴더와 연결 안 됨 → 연결할 때까지 저장 안 함 (linkPending)
    const f = st.folder, sec = secOn(st.id), hid = sec ? secHidden(st.id) : new Set();
    const staffOut = db.staff.filter(x => x.siteId === st.id).map(x => (hid.has(x.id) && x.pay ? (({ pay, ...rest }) => rest)(x) : x));
    // 관리자 잠금 현장: 예산(금액)은 암호문(secretBlob)에만, 평문에는 항목 이름만(budgetPub — 경리가 월결제 거래처를 항목에 연결할 수 있게)
    const stOut = sec ? { ...st, budget: undefined, budgetPub: st.budget ? bgPub(st.budget) : st.budgetPub } : { ...st, budgetPub: undefined };
    out.set(`${f}/현장설정.txt`, J({ 종류: '경리업무 현장설정', site: stOut, cards: db.cards.filter(x => x.siteId === st.id), staff: staffOut, vendors: db.vendors.filter(x => x.siteId === st.id) }));
    for (const ym of siteMonths(st.id)) {
      const o = { 종류: '경리업무 월자료', 현장: st.name, ym, tx: db.tx.filter(t => t.siteId === st.id && ymOf(t.date) === ym) };
      MONTH_KEYS.forEach(k => { let v = ((db[k] || {})[st.id] || {})[ym];
        if (v !== undefined && sec) { if (k === 'pl' && secOpt().pl) v = undefined; else if (k === 'payroll' && hid.size) v = Object.fromEntries(Object.entries(v || {}).filter(([id]) => !hid.has(id))); }
        if (v !== undefined) o[k] = v; });
      out.set(`${f}/${monthPath(ym)}/데이터.txt`, J(o));
    }
  }
  // 자료가 모두 지워진 달은 빈 파일로 덮어씀 (다시 불러올 때 되살아나지 않도록)
  for (const path of FS.written.keys()) {
    const m = path.match(/^(.+)\/B\. 자금관련\/(\d{2})년 (\d{2})월 서류철\/데이터\.txt$/);
    if (m && !out.has(path) && db.sites.some(x => x.folder === m[1])) out.set(path, J({ 종류: '경리업무 월자료', ym: `20${m[2]}-${m[3]}`, tx: [] }));
  }
  return out;
}
let saveTimer = null, flushing = false, flushAgain = false;
function save() { db.savedAt = Date.now(); FS.dirty = true; clearTimeout(saveTimer); saveTimer = setTimeout(flush, 300); undoTick(); }

/* ================= 되돌리기 (Ctrl+Z / Ctrl+Y) =================
 * 저장(save)할 때마다 바뀌기 전 자료(db 전체 글자)를 쌓아 둠. 0.7초 안에 이어진 변경은 한 번으로 묶음.
 * 지운 영수증·사진 파일은 바로 지우지 않고 30분 뒤에 지움(RM_Q) → 그 사이 되돌리면 파일도 그대로 살아 있음 */
const UNDO = { last: null, stack: [], redo: [], timer: null, MAX: 30, MAXLEN: 80e6 };
function undoStr() { return JSON.stringify(db, function (k, v) { return this === db && (k === 'savedAt' || k === 'cur') ? undefined : v; }); }
function undoReset() { clearTimeout(UNDO.timer); UNDO.timer = null; UNDO.stack = []; UNDO.redo = []; try { UNDO.last = undoStr(); } catch (e) { UNDO.last = null; } }
function undoTick() { clearTimeout(UNDO.timer); UNDO.timer = setTimeout(undoCapture, 700); }
function undoCapture() {
  clearTimeout(UNDO.timer); UNDO.timer = null;
  let cur; try { cur = undoStr(); } catch (e) { return; }
  if (UNDO.last === null) { UNDO.last = cur; return; }
  if (cur === UNDO.last) return;
  UNDO.stack.push(UNDO.last); UNDO.redo = []; UNDO.last = cur;
  let len = UNDO.stack.reduce((a, s) => a + s.length, 0);
  while (UNDO.stack.length > UNDO.MAX || (UNDO.stack.length > 1 && len > UNDO.MAXLEN)) len -= UNDO.stack.shift().length;
}
function undoApply(redo) {
  if (UNDO.timer) undoCapture();   // 막 바꾼(아직 안 묶인) 변경부터 기록
  const from = redo ? UNDO.redo : UNDO.stack, to = redo ? UNDO.stack : UNDO.redo;
  if (!from.length) { toast(redo ? '다시 실행할 작업이 없습니다.' : '되돌릴 작업이 없습니다.'); return; }
  const s = from.pop(); to.push(UNDO.last);
  const keep = { cur: db.cur, savedAt: db.savedAt };
  db = Object.assign(JSON.parse(s), keep);
  if (!db.sites.some(x => x.id === db.cur)) db.cur = (db.sites[0] || {}).id || db.cur;
  UNDO.last = s;
  db.savedAt = Date.now(); FS.dirty = true; clearTimeout(saveTimer); saveTimer = setTimeout(flush, 300);   // save() 를 쓰면 되돌린 것이 새 변경으로 쌓이므로 직접
  render(); toast(redo ? '다시 실행했습니다. (Ctrl+Z 로 되돌리기)' : `되돌렸습니다. (남은 ${UNDO.stack.length}번 · Ctrl+Y 로 다시 실행)`);
}
// 지울 파일 대기열: { folder, rel, at } — 브라우저 저장소에도 적어 둬서 프로그램을 닫았다 열어도 나중에 지움
const RM_Q = (() => { try { return JSON.parse(localStorage.getItem('yusung_rmq') || '[]') || []; } catch (e) { return []; } })();
const RM_START = Date.now(), RM_WAIT = 30 * 60 * 1000;
function rmQSave() { try { localStorage.setItem('yusung_rmq', JSON.stringify(RM_Q)); } catch (e) { } }
async function rmQRun() {
  if (!FS.ready || !RM_Q.length) return;
  const now = Date.now(), all = undoStr(), hist = UNDO.stack.concat(UNDO.redo);
  for (let i = RM_Q.length - 1; i >= 0; i--) {
    const q = RM_Q[i];
    if (q.at >= RM_START && now - q.at < RM_WAIT) continue;   // 이번에 켠 뒤 30분이 안 된 것은 기다림
    if (q.at >= RM_START && hist.some(h => h.includes(q.rel))) continue;   // 아직 되돌리기 기록에 있으면 기다림
    RM_Q.splice(i, 1);
    if (all.includes(q.rel)) continue;   // 되돌려서 다시 쓰고 있는 파일 → 안 지움
    const parts = `${q.folder}/${q.rel}`.split('/'), name = parts.pop();
    for (const r of [RC.ready ? RC.root : null, FS.root]) { if (!r) continue; try { await (await walkDir(r, parts, false)).removeEntry(name); } catch (e) { } }
  }
  rmQSave();
}
setInterval(() => { rmQRun().catch(() => { }); }, 60 * 1000);
async function flush() {
  if (!FS.ready) return;
  if (flushing) { flushAgain = true; return; }
  flushing = true; FS.dirty = false;
  let fail = 0;
  try {
    try { await secRefresh(); } catch (e) { console.error('암호화 실패', e); }
    for (const [path, text] of buildChunks()) {
      if (FS.written.get(path) === text) continue;
      try {
        if (FS.mtime.has(path)) {
          let f = null; try { f = await (await fileAt(path, false)).getFile(); } catch (e) { f = null; }
          if (f && f.lastModified > FS.mtime.get(path) + 1500 && (await f.text()) !== FS.written.get(path)) { if (!FS.conflict.includes(path)) FS.conflict.push(path); continue; }
        }
        const h = await writeFile(path, text);
        FS.written.set(path, text); FS.mtime.set(path, (await h.getFile()).lastModified);
      } catch (e) { fail++; console.error(path, e); }
    }
    for (const st of db.sites) if (st.folder && !FS.made.has(st.folder)) {   // 현장 폴더 기본 구조 (빈 폴더 포함)
      try { for (const d of [DIR.pmDraft, DIR.pmDone, DIR.pmScan, ...Object.values(DIR.scan), ...DIR.etc]) await dirAt([st.folder, ...parts(d)]); FS.made.add(st.folder); } catch (e) { }
    }
  } finally { flushing = false; }
  FS.failed = !!fail;
  const unlinked = db.sites.filter(x => !x.folder).map(x => x.name);
  $('#saveState').textContent = fail ? '⚠ 저장 실패 — 폴더 권한을 확인하세요' : unlinked.length ? `⚠ 폴더 연결 안 됨: ${unlinked.join(', ')} (설정 → 현장 폴더 연결)` : `저장됨 ${new Date().toTimeString().slice(0, 5)} · 📁 ${FS.root.name}`;
  if (FS.conflict.length) scheduleRender();
  if (flushAgain) { flushAgain = false; flush(); }
}
async function loadFolder() {
  const nd = defaultDb();
  FS.written.clear(); FS.mtime.clear(); FS.conflict = []; FS.legacy = []; FS.made.clear();
  const mark = (path, r) => { FS.written.set(path, r.text); FS.mtime.set(path, r.mtime); };
  const common = await readText(FS.root, '공통설정.txt');
  let order = [];
  if (common) {
    try { const c = JSON.parse(common.text); nd.settings = Object.assign(nd.settings, c.settings || {}); nd.merchantMap = c.merchantMap || {}; nd.cur = c.cur; order = c.siteOrder || []; mark('공통설정.txt', common); }
    catch (e) { toast('공통설정.txt 파일 형식이 잘못되어 기본값을 사용합니다.'); }
  }
  for await (const [name, h] of FS.root.entries()) {
    if (h.kind !== 'directory') continue;
    const sf = await readText(h, '현장설정.txt'); if (!sf) continue;
    let sc; try { sc = JSON.parse(sf.text); } catch (e) { toast(`${name}/현장설정.txt 를 읽을 수 없습니다.`); continue; }
    if (!sc.site || !sc.site.id) continue;
    const st = sc.site; st.folder = name; nd.sites.push(st);
    ['cards', 'staff', 'vendors'].forEach(k => (sc[k] || []).forEach(x => nd[k].push({ ...x, siteId: st.id })));
    mark(`${name}/현장설정.txt`, sf);
    const readMonth = async (mh, ym, path) => {
      const mf = await readText(mh, '데이터.txt'); if (!mf) return false;
      let m; try { m = JSON.parse(mf.text); } catch (e) { toast(`${path} 를 읽을 수 없습니다.`); return false; }
      (m.tx || []).forEach(t => nd.tx.push({ ...t, siteId: st.id }));
      MONTH_KEYS.forEach(k => { if (m[k] !== undefined) nest(nd[k], st.id)[ym] = m[k]; });
      mark(path, mf); return true;
    };
    const seen = new Set();
    let fund = null; try { fund = await h.getDirectoryHandle(DIR.fund); } catch (e) { }
    if (fund) for await (const [mn, mh] of fund.entries()) {
      const ym = mh.kind === 'directory' && ymOfMonthDir(mn); if (!ym) continue;
      if (await readMonth(mh, ym, `${name}/${DIR.fund}/${mn}/데이터.txt`)) seen.add(ym);
    }
    const old = [];
    for await (const [mn, mh] of h.entries()) {   // 예전 구조 (현장/2026-08/, 현장/품의서/)
      if (mh.kind !== 'directory') continue;
      if (mn === '품의서') { old.push(mn); continue; }
      if (!/^\d{4}-\d{2}$/.test(mn)) continue;
      old.push(mn);
      if (!seen.has(mn)) await readMonth(mh, mn, `${name}/${mn}/데이터.txt`);
    }
    if (old.length) FS.legacy.push({ siteId: st.id, folder: name, dirs: old });
  }
  nd.sites.sort((a, b) => { const ia = order.indexOf(a.id), ib = order.indexOf(b.id); return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib); });
  db = nd;
}
function normalizeDb() {
  (db && db.staff || []).forEach(x => { if (!x.kind) x.kind = x.pay && x.pay.payType === '정직원(손익만)' ? '정직원' : '현장'; });
  (db && db.sites || []).forEach(x => { if (/강미진/.test(x.checker || '')) x.checker = ''; });   // 확인자 이름 삭제 요청 반영
  db = Object.assign(defaultDb(), db || {});
  db.settings = Object.assign(defaultDb().settings, db.settings || {});
  delete db.settings.abbrRules; delete db.settings.mealGuestSkip; delete db.settings.hqApprovers;   // 줄임말 점검 없앰 · 시행사·시공사 동석 식사 제외는 항상 (설정 없앰) · 본사 결재란 설정은 쓰는 곳이 없어 없앰
  if ('mealRates' in db.settings) {   // 예전 "구분별 식대 단가"를 식대 한도와 하나로 합침 (한도에 없는 구분만 더함, 같은 구분은 한도 값 유지)
    const lim = parseRateRules(db.settings.mealLimits ?? DEFAULT_MEAL_LIMITS), add = parseRateRules(db.settings.mealRates).filter(r => !lim.some(x => normLabel(x.key) === normLabel(r.key)));
    db.settings.mealLimits = [...lim, ...add].map(r => `${r.key} ${r.rate}`).join(', ');
    delete db.settings.mealRates;
  }
  // 식대 단가는 현장별: 아직 현장에 없으면 공통 설정값을 복사해 둠 (그 뒤로는 현장마다 따로)
  (db.sites || []).forEach(x => { for (const [k, d] of [['mealLimits', DEFAULT_MEAL_LIMITS], ['mealLimitDefault', 9000], ['mealLimitStaff', 12000]]) if (x[k] === undefined) x[k] = db.settings[k] ?? d; });
  (db.tx || []).forEach(t => { if (t.src === 'card' && t.merchant) { const m = stripBizNo(t.merchant); if (m && m !== t.merchant) t.merchant = m; } });   // 카드 가맹점명 뒤 사업자번호 빼기 (경영지원 요청)
  if (!db.sites.length) { const st = newSite('새 현장'); db.sites.push(st); db.cur = st.id; }
  // 관리자 비밀번호: 예전 전 현장 공용(settings.sec.salt/check) → 현장마다 같은 값으로 복사 (그 뒤로는 현장별로 바꿀 수 있음)
  const gs = db.settings.sec;
  if (gs && gs.check) { db.sites.forEach(x => { if (!(x.sec && x.sec.check)) x.sec = { salt: gs.salt, check: gs.check }; }); delete gs.salt; delete gs.check; }
  if (!db.sites.find(x => x.id === db.cur)) db.cur = db.sites[0].id;
  const seen = new Set();
  db.sites.forEach(x => { if (x.folder && seen.has(x.folder)) x.folder = ''; if (x.folder) seen.add(x.folder); });
}
/* 예전 폴더 구조 → 본사 현장 폴더 구조 (파일 복사 → 자료 안의 파일 경로 바꾸기 → 예전 폴더 삭제) */
function newRel(rel) {
  let m;
  if ((m = String(rel).match(/^(\d{4}-\d{2})\/(.+)$/))) return `${monthPath(m[1])}/${m[2]}`;
  if ((m = String(rel).match(/^품의서\/그림\/(.+)$/))) return `${DIR.pmImg}/${m[1]}`;
  if ((m = String(rel).match(/^품의서\/([^/]+\.xlsx?)$/i))) return `${DIR.pmDraft}/${m[1]}`;
  if ((m = String(rel).match(/^품의서\/(.+)$/))) return `${DIR.pmScan}/${m[1]}`;
  return rel;
}
async function migrateLayout() {
  let moved = 0, fail = 0;
  toast('폴더 구조를 본사 현장 폴더 방식(A. 기안품의 / B. 자금관련 …)으로 바꾸는 중…');
  for (const L of FS.legacy) {
    const sid = L.siteId; let siteFail = 0;
    for (const d of L.dirs) {
      let files = []; try { files = await walkFiles(await dirAt([L.folder, d], false), d, []); } catch (e) { continue; }
      for (const f of files) {
        if (/^\d{4}-\d{2}\/데이터\.txt$/.test(f.path)) continue;   // 자료 파일은 저장할 때 새 위치에 다시 씀
        const to = newRel(f.path); if (to === f.path) continue;
        try {
          const src = await f.h.getFile(), ps = parts(to), nm = ps.pop(), dir = await dirAt([L.folder, ...ps]);
          let exists = false; try { await dir.getFileHandle(nm); exists = true; } catch (e) { }
          if (!exists) { const h = await dir.getFileHandle(nm, { create: true }); const w = await h.createWritable(); await w.write(src); await w.close(); }
          moved++;
        } catch (e) { fail++; siteFail++; }
      }
    }
    // 자료 안의 파일 경로 바꾸기
    db.tx.filter(t => t.siteId === sid).forEach(t => { if (t.receipts) t.receipts = t.receipts.map(newRel); if (t.rcCheck) t.rcCheck = Object.fromEntries(Object.entries(t.rcCheck).map(([k, v]) => [newRel(k), v])); });
    Object.values((db.attach || {})[sid] || {}).forEach(list => (list || []).forEach(a => { a.rel = newRel(a.rel); }));
    Object.values((db.pumui || {})[sid] || {}).forEach(list => (list || []).forEach(p => { if (p.file) p.file = newRel(p.file); if (p.scans) p.scans = p.scans.map(newRel); (p.blocks || []).forEach(b => { if (b.rel) b.rel = newRel(b.rel); }); }));
    if (!siteFail) {   // 다 옮겼으면 예전 폴더 지움 (실패가 있으면 남겨 두고 다음에 열 때 다시 시도)
      for (const d of L.dirs) { try { await (await dirAt([L.folder], false)).removeEntry(d, { recursive: true }); } catch (e) { } }
      for (const k of [...FS.written.keys()]) if (k.startsWith(L.folder + '/') && /\/\d{4}-\d{2}\/데이터\.txt$/.test(k)) { FS.written.delete(k); FS.mtime.delete(k); }
    }
  }
  FS.legacy = [];
  save();
  toast(`폴더 구조를 바꿨습니다 (파일 ${moved}개 이동${fail ? ` · ${fail}개 실패 — 드롭박스 동기화 중일 수 있어 다음에 열 때 다시 시도` : ''}).`);
}
/* 폴더 연결: 비어 있으면 새로 시작(또는 예전 브라우저 자료를 옮김), 자료가 있으면 불러오기 */
async function openRoot(handle) {
  FS.root = handle; FS.ready = false;
  let inner = !!(await readText(handle, '현장설정.txt'));
  for (const d of [DIR.fund, DIR.pm]) { try { await handle.getDirectoryHandle(d); inner = true; } catch (e) { } }
  if (inner) { toast('현장 폴더 안쪽이 선택되었습니다. 현장 폴더들이 들어 있는 위 폴더(예: Dropbox)를 선택하세요.'); FS.root = null; render(); return; }
  await loadFolder();
  let migrated = false;
  if (!db.sites.length) {
    let old = null; try { old = JSON.parse(localStorage.getItem(STORE_KEY)); } catch (e) { }
    if (old && old.sites && old.sites.length && confirm(`이 PC 브라우저에 예전에 입력한 자료(${old.sites.map(x => x.name).join(', ')})가 있습니다.\n선택한 폴더로 옮길까요?`)) { db = old; migrated = true; }
  }
  normalizeDb();
  await secAuto();
  FS.ready = true; undoReset();
  if (FS.legacy.length) await migrateLayout();
  await flush();
  if (migrated && !FS.failed) { try { localStorage.removeItem(STORE_KEY); } catch (e) { } toast('예전 자료를 폴더로 옮겼습니다.'); }
  render();
  mbRefind();   // 10c 휴대폰 사진함: 이 데이터 폴더(드롭박스) 안 앱\… 폴더를 다시 찾음
  setTimeout(linkPending, 0);   // 폴더 연결 안 된 현장이 있으면 연결 창
}
async function pickRoot() {
  if (!window.showDirectoryPicker) { toast('이 브라우저는 폴더 저장을 지원하지 않습니다. 크롬 또는 엣지로 여세요.'); return; }
  try {
    const h = await showDirectoryPicker({ id: 'gyeongri-data', mode: 'readwrite' });
    const prev = FS.ready && FS.root ? { root: FS.root, db, keys: { ...SEC.keys } } : null;
    await idb.set('root', h); state.savedRootName = h.name; await openRoot(h);
    // 다른 데이터 폴더로 바꿨는데 새 폴더에 현장이 없으면 → 예전 폴더의 현장을 회사 현장 폴더로 가져오기
    if (prev && FS.ready && FS.root === h && !(await prev.root.isSameEntry(h)) && db.sites.every(x => !x.folder) && prev.db.sites.some(x => x.folder)
      && confirm(`예전 데이터 폴더(${prev.root.name})의 현장 ${prev.db.sites.length}개(${prev.db.sites.map(x => x.name).join(', ')})를 이 폴더로 가져올까요?\n현장마다 회사 현장 폴더를 고르면 자료·영수증을 그 폴더로 복사합니다. (예전 폴더는 그대로 남음)`)) {
      closeModal(); db = prev.db; SEC.keys = prev.keys; LINK_SRC.clear(); FS.made.clear();   // 관리자 키도 그대로 (암호화된 자료가 풀린 채로 옮겨 오므로)
      for (const st of db.sites) { if (st.folder) { try { LINK_SRC.set(st.id, await prev.root.getDirectoryHandle(st.folder)); } catch (e) { } } st.folder = ''; }
      render(); linkPending();
    }
  }
  catch (e) { if (e.name !== 'AbortError') toast('폴더를 열 수 없습니다: ' + e.message); }
}
/* ---------- 현장 ↔ 회사가 만들어 둔 현장 폴더 연결 ----------
 * 데이터 폴더(예: Dropbox) 바로 아래에 회사가 만든 "132. 수지 자이 에디시온" 같은 폴더를 골라 현장과 연결.
 * 프로그램은 폴더를 새로 만들지 않고, 연결한 폴더 안에 A. 기안품의 · B. 자금관련 … 구조로 저장. */
const LINK_SRC = new Map();   // 현장 id → 자료를 복사해 올 예전 폴더 (다른 데이터 폴더에서 가져올 때)
const siteTitleOf = folder => String(folder).replace(/^\s*\d+\s*[.)]\s*/, '').trim() || String(folder);
async function freeFolders() {
  const used = new Set(db.sites.map(x => x.folder).filter(Boolean)), out = [];
  for await (const [name, h] of FS.root.entries()) {
    if (h.kind !== 'directory' || used.has(name) || /^[.~$]/.test(name) || /^(Apps|앱)$/.test(name)) continue;   // Apps = 드롭박스 앱 폴더 (10c 휴대폰 사진함)
    if (await readText(h, '현장설정.txt')) continue;
    out.push(name);
  }
  return out.sort((a, b) => a.localeCompare(b, 'ko', { numeric: true }));
}
/* 폴더를 고르지 않았을 때: 데이터 폴더 바로 아래에 현장 이름(기본 '새 현장')으로 폴더를 새로 만듦 (같은 이름이 있으면 '새 현장 2' …) */
async function makeSiteFolder(name) {
  const base = String(name || '새 현장').replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '') || '새 현장';
  for (let i = 1; i < 100; i++) {
    const nm = i === 1 ? base : `${base} ${i}`;
    let exists = false; try { await FS.root.getDirectoryHandle(nm); exists = true; } catch (e) { }
    if (exists) continue;
    try { await FS.root.getDirectoryHandle(nm, { create: true }); return nm; } catch (e) { toast('폴더를 만들 수 없습니다: ' + e.message); return ''; }
  }
  return '';
}
async function folderDialog(title, intro, curName, onPick, autoNew) {
  if (!FS.ready) { toast('먼저 데이터 폴더를 선택하세요.'); return; }
  const list = await freeFolders();
  const makeNew = async nm => { const f = await makeSiteFolder(nm || curName); if (f) await onPick(f, nm || (curName && curName !== '새 현장' ? curName : f)); };
  const root = modal(title, `<p class="small">${intro}</p>
    ${list.length ? `<label class="small muted" style="display:block">회사 현장 폴더 (📁 ${esc(FS.root.name)})<select id="fdSel" class="inp" size="${Math.min(12, Math.max(4, list.length))}" style="display:block;width:100%;margin-top:4px;height:auto">${list.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('')}</select></label>`
      : `<p class="small bad">📁 ${esc(FS.root.name)} 안에 연결할 수 있는 폴더가 없습니다.${autoNew ? ' 아래 [새 폴더 만들기]를 누르면 현장 폴더를 자동으로 만듭니다.' : ' 회사에서 만든 현장 폴더가 이 폴더 바로 아래에 있는지 확인하세요.'}</p>`}
    <label class="small muted" style="display:block;margin-top:10px">현장 약칭 (프로그램에 표시될 이름)<input id="fdName" class="inp" style="display:block;width:100%;margin-top:4px" value="${esc(curName || '')}" placeholder="예: 수지 자이"></label>
    <p class="muted small">이미 다른 현장과 연결된 폴더는 목록에 나오지 않습니다.${autoNew ? ` 폴더를 고르지 않으면 📁 ${esc(FS.root.name)} 안에 <b>현장 약칭 이름(기본 '새 현장')</b>으로 폴더를 새로 만들어 연결합니다.` : ''}</p>`, [
    autoNew ? { label: '📁 새 폴더 만들기', onClick: async r => { await makeNew(($('#fdName', r).value || '').trim()); } } : { label: '나중에' },
    { label: '연결', cls: 'primary', onClick: async r => {
      const f = $('#fdSel', r) && $('#fdSel', r).value;
      if (!f) { if (autoNew) { await makeNew(($('#fdName', r).value || '').trim()); return; } toast('폴더를 고르세요.'); return true; }
      await onPick(f, ($('#fdName', r).value || '').trim() || siteTitleOf(f));
    } }], 'm');
  const sel = $('#fdSel', root), nm = $('#fdName', root); let auto = !curName || curName === '새 현장';
  if (sel) sel.onchange = () => { if (auto || !nm.value.trim()) { nm.value = siteTitleOf(sel.value); auto = true; } };
  if (nm) nm.oninput = () => { auto = false; };
}
async function copyTree(src, folder) {   // src 폴더 → 데이터 폴더의 folder (영수증은 영수증 폴더로). 같은 이름 파일이 이미 있으면 건너뜀
  let n = 0, fail = 0;
  for (const f of await walkFiles(src, '', [])) {
    try {
      const ps = f.path.split('/'), nm = ps.pop(); const d = await dirAt([folder, ...ps], true);
      try { await d.getFileHandle(nm); continue; } catch (e) { }
      const w = await (await d.getFileHandle(nm, { create: true })).createWritable(); await w.write(await f.h.getFile()); await w.close(); n++;
    } catch (e) { fail++; }
  }
  return { n, fail };
}
/* 폴더에서 프로그램 자료 파일(현장설정·월별 데이터.txt)만 지움 — 회사 폴더와 영수증·서류 파일은 그대로 둠 */
async function unlinkFolder(folder) {
  try { const d = await dirAt([folder], false); await d.removeEntry('현장설정.txt').catch(() => { });
    try { const fund = await d.getDirectoryHandle(DIR.fund); for await (const [mn, mh] of fund.entries()) if (mh.kind === 'directory' && ymOfMonthDir(mn)) await mh.removeEntry('데이터.txt').catch(() => { }); } catch (e) { }
  } catch (e) { }
  for (const k of [...FS.written.keys()]) if (k.startsWith(folder + '/')) { FS.written.delete(k); FS.mtime.delete(k); }
  FS.made.delete(folder);
}
/* 현장을 회사 폴더에 연결 (또는 다른 폴더로 바꾸기). 예전 폴더가 있으면 자료·영수증을 복사해 옴 */
async function linkSite(st, folder, name) {
  const fromSame = st.folder && st.folder !== folder ? st.folder : '';
  const src = LINK_SRC.get(st.id) || (fromSame ? await dirAt([fromSame], false).catch(() => null) : null);
  let r = { n: 0, fail: 0 }, rcOld = null;
  if (src) { toast('자료·영수증을 복사하는 중…'); r = await copyTree(src, folder); }
  if (fromSame && RC.ready) { try { rcOld = await RC.root.getDirectoryHandle(fromSame); } catch (e) { } }   // 영수증 폴더 쪽도 이름 바꾸기
  if (rcOld) { const r2 = await copyTree(rcOld, folder); r.n += r2.n; r.fail += r2.fail; }
  if (r.fail) { toast(`파일 ${r.fail}개를 복사하지 못해 연결을 멈췄습니다. ${RC.want && !RC.ready ? RC_NEED : '드롭박스 동기화가 끝난 뒤 다시 해 주세요.'}`); return false; }
  LINK_SRC.delete(st.id);
  if (fromSame) await unlinkFolder(fromSame);   // 예전 폴더가 다시 현장으로 읽히지 않게
  if (rcOld) { try { await RC.root.removeEntry(fromSame, { recursive: true }); } catch (e) { } }   // 영수증 폴더의 예전 현장 폴더는 프로그램 것이라 지움
  st.folder = folder; st.name = name || st.name; db.cur = st.id;
  save(); render();
  toast(`'${st.name}' 현장을 📁 ${folder} 폴더에 연결했습니다${r.n ? ` · 파일 ${r.n}개 복사` : ''}${fromSame ? ` (예전 폴더 '${fromSame}'의 영수증 등은 남아 있으니 확인 후 지워도 됩니다)` : ''}`);
  return true;
}
function linkPending() {
  if (!FS.ready || $('#modalRoot').innerHTML.trim()) return;
  const st = db.sites.find(x => !x.folder); if (!st) return;
  db.cur = st.id; render();
  folderDialog(`'${st.name}' 현장 폴더 연결`, `이 현장의 자료를 저장할 <b>회사 현장 폴더</b>를 고르세요.${LINK_SRC.has(st.id) ? ' 예전 폴더의 자료·영수증을 그 폴더로 복사합니다.' : ''}`, st.name,
    async (f, nm) => { if (await linkSite(st, f, nm)) setTimeout(linkPending, 0); }, true);
}
async function reopenRoot() {
  const h = await idb.get('root'); if (!h) return pickRoot();
  try { const p = await h.requestPermission({ mode: 'readwrite' }); if (p === 'granted') await openRoot(h); else toast('폴더 사용 권한이 필요합니다.'); }
  catch (e) { toast('폴더를 다시 열 수 없습니다. "데이터 폴더 선택"을 눌러 주세요.'); }
}
