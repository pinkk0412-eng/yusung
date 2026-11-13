/* 유성 현장 관리 프로그램 — 출근부·출퇴근보고·식대·캐터링
 * (원래 app.js 의 화면 부분. 모든 js/*.js 는 같은 전역 공간을 공유하며 html 에 적힌 순서대로 읽힘) */
'use strict';


/* ================= 식대 · 출근부 ================= */
function attOf(ym) { return nest(db.attendance, db.cur, ym); }
function caterOf(ym) {
  const c = nest(db.catering, db.cur, ym);
  if (c.lunchPrice === undefined) {   // 새 달: 지난달 마지막 업체(이름·단가·VAT)로 시작 (업체가 바뀐 달 다음 달은 바뀐 업체로)
    const pc = (db.catering[db.cur] || {})[ymAdd(ym, -1)], last = pc && pc.lunchPrice !== undefined ? caterSegs(pc).pop() : null;
    if (last) { c.vendor = last.name; c.lunchPrice = last.lunchPrice; c.snackPrice = last.snackPrice; if (last.vatEx) c.vatEx = true; }
    else { c.lunchPrice = site().cateringLunch || 0; if (site().caterVendor) c.vendor = site().caterVendor; }
  }
  if (c.snackPrice === undefined) c.snackPrice = site().cateringSnack || 0;
  if (c.vatEx === undefined && site().caterVatEx) c.vatEx = true;   // 단가 부가세 별도 (마지막으로 고른 값을 다음 달에도)
  c.days = c.days || {};
  return c;
}
/* 캐터링 업체 (달 중간에 바뀔 수 있음): 첫 업체 = c.vendor · c.lunchPrice · c.snackPrice · c.vatEx (1일부터)
   바뀐 업체 = c.chg = [{ from: 일, name, lunchPrice, snackPrice, vatEx }] — 그날부터 그 업체·단가 */
function caterSegs(c) {
  const base = { from: 1, name: c.vendor || '', lunchPrice: toNum(c.lunchPrice), snackPrice: toNum(c.snackPrice), vatEx: !!c.vatEx };
  return [base, ...(c.chg || []).map(x => ({ ...x, from: Math.max(2, toNum(x.from) || 2), lunchPrice: toNum(x.lunchPrice), snackPrice: toNum(x.snackPrice), vatEx: !!x.vatEx })).sort((a, b) => a.from - b.from)];
}
const caterSegAt = (segs, d) => segs.reduce((a, s) => (s.from <= d ? s : a), segs[0]);
// 업체별 금액 (부가세 별도 업체는 10% 더함) — 월결제 자동 반영용 [{ name, amt }] (같은 이름은 합침)
function caterByVendor(sid, ym) { return caterByRange(sid, `${ym}-01`, `${ym}-${String(daysIn(ym)).padStart(2, '0')}`); }
// 기간(YYYY-MM-DD ~ YYYY-MM-DD, 여러 달 가능)의 업체별 캐터링 금액 — 월결제 사용기간에 날짜를 적으면 그 기간 금액
function caterByRange(sid, from, to) {
  const s = db.sites.find(x => x.id === sid) || {}, out = [];
  for (let ym = from.slice(0, 7), i = 0; ym <= to.slice(0, 7) && i < 36; ym = ymAdd(ym, 1), i++) {
    const c = db.catering[sid] && db.catering[sid][ym]; if (!c) continue;
    const segs = caterSegs({ ...c, lunchPrice: c.lunchPrice ?? s.cateringLunch ?? 0, snackPrice: c.snackPrice ?? s.cateringSnack ?? 0 }), amt = segs.map(() => 0);
    Object.entries(c.days || {}).forEach(([d, r]) => {
      const ds = `${ym}-${String(+d).padStart(2, '0')}`; if (ds < from || ds > to) return;
      const k = segs.indexOf(caterSegAt(segs, +d)); amt[k] += toNum(r.l) * segs[k].lunchPrice + toNum(r.s) * segs[k].snackPrice;
    });
    segs.forEach((g, k) => { const a = g.vatEx ? amt[k] + Math.round(amt[k] * 0.1) : amt[k]; const o = out.find(x => caterKey(x.name) === caterKey(g.name)); if (o) o.amt += a; else out.push({ name: g.name, amt: a }); });
  }
  return out.filter(x => x.amt);
}
// 사용기간 글자 → { from, to } ("'26.10.16~'26.11.15" · "2026-10-16~11-15" · "26.10.16~15") · 못 읽으면 null
function caterPeriodParse(t) {
  const [a, b] = String(t || '').split(/~|∼|–/); if (!a || !b) return null;
  const n1 = a.match(/\d+/g) || [], n2 = b.match(/\d+/g) || []; if (n1.length < 3 || !n2.length) return null;
  const yy = v => (+v < 100 ? 2000 + +v : +v), p2 = v => String(+v).padStart(2, '0');
  const y = yy(n1[0]), m = +n1[1], d = +n1[2];
  const [y2, m2, d2] = n2.length >= 3 ? [yy(n2[0]), +n2[1], +n2[2]] : n2.length === 2 ? [y, +n2[0], +n2[1]] : [y, m, +n2[0]];
  if (!m || m > 12 || !d || d > 31 || !m2 || m2 > 12 || !d2 || d2 > 31) return null;
  const f = `${y}-${p2(m)}-${p2(d)}`, e = `${y2 < y || (y2 === y && m2 < m) ? y + 1 : y2}-${p2(m2)}-${p2(d2)}`;
  return f <= e ? { from: f, to: e } : null;
}
const caterKey = s => String(s || '').replace(/\s|\(주\)|㈜|주식회사|\(유\)|\(株\)/g, '').toLowerCase();
const caterSame = (a, b) => { const x = caterKey(a), y = caterKey(b); return !!x && !!y && (x === y || (x.length >= 2 && y.length >= 2 && (x.includes(y) || y.includes(x)))); };
function attCount(rec) { return sum(Object.values(rec || {}), v => attValue(v)); }
/* 출근부 미입력: 그 달의 '확인할 날'(이번 달 = 오늘, 지난달 = 말일, 다음 달 이후 = 없음)에 칸이 빈 사람 수 */
function attNoInput(att, staff, ym) {
  const t = new Date(), cur = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`;
  const d = ym === cur ? t.getDate() : ym < cur ? daysIn(ym) : 0;
  if (!d) return { n: 0, d: 0 };
  return { n: staff.filter(s => { const v = (att[s.id] || {})[d]; return v === undefined || v === ''; }).length, d };
}

/* ---------- 출퇴근보고 (매일 아침 경영지원 출퇴근보고방에 올리는 카톡 문구) ----------
 * 【영종 현장】 / 전날 출퇴근 확인 (이상없음 · 사진대체 · 체크누락 · 출퇴근 미체크 · 연장) / ==== / 오늘 출근 확인 (구분별 인원 · 총원)
 * 보고한 인원은 done[현장][월].repLog[일] 에 남겨 다음 날 "보고 n명, 인식 m명 - 불인정" 비교에 씀 */
const REP_LINE = '====================';
const REP_ALIAS = [[/총괄|본부|조직/, '조직'], [/아르바이트|알바/, '알바'], [/상담/, '상담사'], [/^TM|텔레마/i, 'TM'], [/기획/, '기획'], [/경리/, '경리']];
function repGroup(s) { const t = String(s.team || '').trim(); for (const [re, g] of REP_ALIAS) if (re.test(t)) return g; return t || (s.kind === '정직원' ? '기획' : '기타'); }
function repOrder(groups) {   // 설정의 "직원 구분 정렬 순서" → 나머지 구분 → 조직은 항상 맨 끝 (지금까지 보고 순서)
  const order = String(db.settings.teamOrder ?? DEFAULT_TEAM_ORDER).split(/[,，>→\n-]+/).map(x => x.trim()).filter(Boolean).map(t => repGroup({ team: t }));
  const rank = g => g === '조직' ? 999 : order.indexOf(g) >= 0 ? order.indexOf(g) : 500;
  return [...groups].sort((a, b) => rank(a) - rank(b));
}
const repDateAdd = (date, n) => { const [y, m, d] = date.split('-').map(Number); const x = new Date(y, m - 1, d + n); return `${x.getFullYear()}-${pad2(x.getMonth() + 1)}-${pad2(x.getDate())}`; };
const repMD = date => `${Number(date.slice(5, 7))}월 ${Number(date.slice(8, 10))}일`;
const repToday = () => { const x = new Date(); return `${x.getFullYear()}-${pad2(x.getMonth() + 1)}-${pad2(x.getDate())}`; };
function repDay(date) {
  const ym = date.slice(0, 7), d = Number(date.slice(8, 10));
  const att = ((db.attendance[db.cur] || {})[ym]) || {}, times = att.__time || {}, ots = att.__ot || {};
  const people = siteStaff(true).filter(s => s.kind !== '외부').map(s => {
    const v = (att[s.id] || {})[d];
    return { s, g: repGroup(s), v: v === undefined || v === null ? '' : String(v), n: attValue(v), time: String((times[s.id] || {})[d] || ''), ot: toNum((ots[s.id] || {})[d]) };
  }).filter(p => p.n > 0);
  const groups = {}; people.forEach(p => { groups[p.g] = (groups[p.g] || 0) + 1; });
  return { date, people, groups, total: people.length };
}
const repByGroup = list => { const m = {}; list.forEach(p => (m[p.g] = m[p.g] || []).push(p)); return repOrder(Object.keys(m)).map(g => [g, m[g]]); };
const repCnt = list => repByGroup(list).map(([g, l]) => `${g}(${l.length}명)`).join(', ');
const repNames = list => repByGroup(list).map(([g, l]) => `${g}(${l.map(p => p.s.name).join(', ')})`).join(', ');
function repIssues(day) {   // 전날: 사진대체 · 체크누락 · 출근/퇴근 한쪽만 찍힘 · 연장
  const out = [];
  const photo = day.people.filter(p => p.v === ATT_PHOTO), miss = day.people.filter(p => p.v === ATT_MISS);
  if (photo.length) out.push(`※ ${repCnt(photo)} : 출퇴근 사진 대체`);
  if (miss.length) out.push(`※ ${repNames(miss)} : 출퇴근 체크누락`);
  const timed = day.people.filter(p => p.v !== ATT_PHOTO && p.v !== ATT_MISS && p.time);
  const noIn = timed.filter(p => /^--:--/.test(p.time) && !/~\s*--:--/.test(p.time));
  const noOut = timed.filter(p => !/^--:--/.test(p.time) && /~\s*--:--/.test(p.time) && !outFree(p.s));   // 퇴근 안 찍어도 되는 구분(기획 계약직 등)은 빼고
  if (noIn.length) out.push(`※ 출근 미체크 : ${repNames(noIn)}`);
  if (noOut.length) out.push(`※ 퇴근 미체크 : ${repNames(noOut)}`);
  // 지각: 출근 시각 · 지각 사유(출근부 오른쪽 클릭) · 출근 인정 여부
  const ym = day.date.slice(0, 7), dn = Number(day.date.slice(8, 10));
  const late = day.people.filter(p => p.v === ATT_LATE || (p.v === '1' && lateMin(p.s, p.time) > 0));
  if (late.length) out.push(`※ 지각 : ${repByGroup(late).map(([g, l]) => `${g}(${l.map(p => {
    const why = attWhy(ym, p.s.id, dn), tm = (String(p.time).match(/^\s*(\d{1,2}:\d{2})/) || [])[1];
    return `${p.s.name}${tm ? ' ' + tm : ''}${why ? ' - ' + why : ''}${attLateOk(p.s.id, ym, dn) ? ' · 출근 인정' : ''}`;
  }).join(', ')})`).join(', ')}`);
  const ot = day.people.filter(p => p.ot > 0);
  if (ot.length) out.push(`※ 연장근무 : ${ot.map(p => `${p.g}(${p.s.name}) ${Math.round(p.ot * 100) / 100}시간`).join(', ')}`);
  return out;
}
function repLog(date) { return ((((db.done[db.cur] || {})[date.slice(0, 7)]) || {}).repLog || {})[Number(date.slice(8, 10))] || null; }
function repText(date, note) {
  const nm = String(site().name || '').trim(), prev = repDateAdd(date, -1);
  const y = repDay(prev), t = repDay(date), issues = repIssues(y), log = repLog(prev);
  const L = [`【${/현장$/.test(nm) ? nm : nm + ' 현장'}】`, `${repMD(prev)} 출퇴근 확인`];
  const over = log && toNum(log.total) > 0 && y.total > toNum(log.total);   // 어제 보고한 인원보다 인식된 인원이 많음
  if (over) L.push(`보고 ${log.total}명, 인식 ${y.total}명 - 불인정 ${y.total - toNum(log.total)}명`, `최종 ${log.total}명`);
  L.push(...issues);
  if (!over && !issues.length) L.push('출퇴근 및 연장시간 이상없습니다.');
  L.push(REP_LINE, `${repMD(date)} 출근 확인`);
  repOrder(Object.keys(t.groups)).forEach(g => L.push(`${g} ${t.groups[g]}명`));
  L.push(`출근인원 총 ${t.total}명입니다.`);
  const tp = t.people.filter(p => p.v === ATT_PHOTO);
  if (tp.length) L.push(`※ ${repCnt(tp)} 출퇴근 사진 대체`);
  String(note || '').split('\n').map(x => x.trim()).filter(Boolean).forEach(x => L.push(/^[※\-*]/.test(x) ? x : `※ ${x}`));
  return { text: L.join('\n'), y, t, over, log };
}
function repDefaultDate() {   // 오늘 기록이 있으면 오늘, 없으면 보고 있는 달에서 기록이 있는 마지막 날
  const today = repToday(); if (repDay(today).total) return today;
  for (const ym of [today.slice(0, 7), state.ym]) {
    for (let d = daysIn(ym); d >= 1; d--) { const date = `${ym}-${pad2(d)}`; if (date <= today && repDay(date).total) return date; }
  }
  return today;
}
function repDialog(date) {
  const ta = 'class="inp"';
  const lg = repLog(date);
  const root = modal('출퇴근보고 (카톡 복사)', `
      <div class="form-grid" style="grid-template-columns:auto 1fr;align-items:center;gap:8px">
        <label class="small">보고 날짜 <input type="date" id="repDate" value="${esc(date)}"></label>
        <span class="small muted">전날 출퇴근 확인 + 이 날 출근 인원으로 작성 · 출근부(근태기록)를 기준으로 셉니다</span></div>
      <div id="repHint" style="margin-top:8px"></div>
      <label class="small" style="display:block;margin-top:8px">특이사항 (한 줄에 하나, 앞에 ※ 자동)
        <textarea id="repNote" rows="2" ${ta} placeholder="예) 홍보단(12명) : 출퇴근 사진 대체 예정(현장출퇴근)">${esc((lg && lg.note) || '')}</textarea></label>
      <label class="small" style="display:block;margin-top:8px">보고 문구 (복사 전에 직접 고쳐도 됩니다)
        <textarea id="repText" rows="16" ${ta}></textarea></label>`, [{ label: '닫기' }, {
    label: '복사', cls: 'primary', onClick: async r => {
      const d = $('#repDate', r).value || date, txt = $('#repText', r).value;
      try { await navigator.clipboard.writeText(txt); toast('복사했습니다. 카톡 출퇴근보고방에 붙여넣으세요.'); }
      catch (e) { const el = $('#repText', r); el.select(); document.execCommand && document.execCommand('copy'); toast('선택했습니다. Ctrl+C로 복사하세요.'); }
      const o = nest(db.done, db.cur, d.slice(0, 7)); o.repLog = o.repLog || {};
      o.repLog[Number(d.slice(8, 10))] = { total: repDay(d).total, note: $('#repNote', r).value, at: new Date().toISOString() };
      o[`rep${d.slice(8, 10)}`] = true;   // 홈 "출퇴근보고" 보고함 표시
      save(); render(); return false;
    }
  }]);
  modalSize(root, 'm');
  const fill = () => {
    const d = $('#repDate', root).value || date, R = repText(d, $('#repNote', root).value), hints = [];
    if (!R.t.total) hints.push(`${repMD(d)} 출근 기록이 없습니다. 오늘 근태기록 엑셀을 먼저 불러오세요.`);
    if (!R.y.total) hints.push(`${repMD(repDateAdd(d, -1))}(전날) 출근 기록이 없어 "이상없습니다"로 나옵니다. 전날 기록이 들어간 근태기록을 불러오면 미체크·연장을 같이 확인합니다.`);
    if (R.over) hints.push(`전날 보고 ${R.log.total}명보다 인식 인원이 ${R.y.total}명으로 많아 "불인정" 줄을 넣었습니다. 늦게 출근했지만 인정되는 경우면 지우세요.`);
    $('#repHint', root).innerHTML = hints.map(h => `<div class="banner warn small">${esc(h)}</div>`).join('');
    $('#repText', root).value = R.text;
  };
  $('#repDate', root).onchange = fill; $('#repNote', root).oninput = fill;
  fill();
}
// 인건비 특이사항 자동 문구: 사진대체 · 체크누락 날짜
function attNoteAuto(sid, ym, id) {
  const rec = (((db.attendance[sid] || {})[ym]) || {})[id] || {};
  const days = v => Object.keys(rec).filter(d => /^\d+$/.test(d) && rec[d] === v).map(Number).sort((a, b) => a - b);
  const ph = days(ATT_PHOTO), ms = days(ATT_MISS);
  return [ph.length ? `사진대체 ${ph.length}일(${ph.join(',')}일)` : '', ms.length ? `체크누락 ${ms.length}일(${ms.join(',')}일)` : ''].filter(Boolean).join(' · ');
}
function mealData(ym) {
  const staff = siteStaff(true);
  const names = staff.map(s => s.name);
  const cats = state.includeSnack ? ['식대', '간식대'] : ['식대'];
  const list = db.tx.filter(t => t.siteId === db.cur && ymOf(t.date) === ym && t.kind !== 'in' && cats.includes(t.cat))
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  const per = {}, cnt = {}; names.forEach(n => { per[n] = {}; cnt[n] = {}; });
  const unmatched = [], unknown = {};
  const parsed = list.map(t => {
    const p = parseMeal(t.memo, names);
    const share = t.amount / p.count;
    const day = Number(t.date.slice(8, 10));
    p.matched.forEach(n => { per[n][day] = (per[n][day] || 0) + share; cnt[n][day] = (cnt[n][day] || 0) + 1; });
    if (!p.matched.length) unmatched.push(t);
    p.unknown.forEach(u => unknown[u] = (unknown[u] || 0) + 1);
    return { t, p, share };
  });
  return { staff, per, cnt, unmatched, unknown, parsed, list };
}
// 직원 두 칸 [현장 인건비 직원] [유성 정직원] — 그 사람들만 출근부·식대내역·요약 (두 탭 공통 state.mealGroup)
// 탭: 출근부(meal = 출근부·인건비 반영 요약·설정) / 식대·캐터링(cater = 식대내역·캐터링, state.caterSub)
const MEAL_TOP = [['현장', '현장 인건비 직원', '기획계약직·업체·알바 — 현장 인건비 청구'], ['정직원', '유성 정직원', '본사 지급 — 출근부·식대만 반영']];
const MEAL_GROUPS = [['정직원', '유성 정직원', '본사 지급 · 출근부/식대만 반영'], ['현장', '현장 인건비', '기획계약직 · 업체 · 알바 등']];
function staffGroup(s) { return s.kind === '정직원' ? '정직원' : s.kind === '외부' ? '외부' : '현장'; }
function mealTop() {
  if (state.mealSub === 'cater') state.mealSub = 'att';   // 예전 화면 주소 (캐터링은 이제 식대·캐터링 탭)
  return MEAL_TOP.some(x => x[0] === state.mealGroup) ? state.mealGroup : '현장';
}
const groupStaff = (g, all) => (all ? siteStaff(true) : workStaff()).filter(s => staffGroup(s) === g);
const mealGroupSeg = g => `<div class="seg">${MEAL_TOP.map(([k, l, d]) => `<button class="seg-b ${k === g ? 'active' : ''}" data-act="mealGroup" data-v="${k}"><b>${l} <span class="seg-n">${groupStaff(k).length}명</span></b><small>${d}</small></button>`).join('')}</div>`;
const subTabs = (list, cur, act) => `<div class="subtabs">${list.map(([k, l]) => `<button class="${k === cur ? 'active' : ''}" data-act="${act}" data-v="${k}">${l}</button>`).join('')}</div>`;
function viewMeal() {   // 출근부 탭
  const g = mealTop(), ym = state.ym;
  const head = pageHead(`${ymLabel(ym)} 출근부`, '1일 ~ 말일 · 익월 초 정산 → 인건비 반영',
    BTN('importAtt', '출근부·근태기록 불러오기', 'title="얼굴인식 근태기록 엑셀 또는 기존 출근부 엑셀"', 'primary') + BTN('repOpen', '출퇴근보고 만들기', 'title="출근부로 카톡 출퇴근보고 문구 만들기"') + BTN('attPhotoPrint', `출근 사진 인쇄${attPhotoCount(ym) ? ` (${attPhotoCount(ym)}장)` : ''}`, 'title="출근부 칸에 오른쪽 클릭으로 등록한 이 달 사진을 A4 한 장에 4장씩 인쇄"') + BTN('exportMeal', '엑셀로 저장', 'title="출근부·식대내역·결제내역·캐터링·인건비 반영 요약"'));
  if (state.mealSub === 'meal') state.mealSub = 'att';   // 식대내역은 식대·캐터링 탭으로
  const subs = [['att', '출근부'], ...(g === '정직원' ? [] : [['sum', '인건비 반영 요약']]), ['set', '⚙ 설정 (출근 기준·식대 단가)']];   // 유성 정직원은 요약 없음 (본사 지급)
  const sub = subs.some(x => x[0] === state.mealSub) ? state.mealSub : 'att';
  const body = { att: mealAtt, sum: mealSum, set: mealSet }[sub]();
  return `${head}${mealGroupSeg(g)}${mealStats(g)}${subTabs(subs, sub, 'mealSub')}${body}`;
}
function viewCater() {   // 식대·캐터링 탭 — 식대내역(직원 칸별, 법인카드·전도금 식대 결제 → 1인분) · 캐터링(일자별 주문 수량·금액 → 월결제)
  const ym = state.ym, sub = state.caterSub === 'cater' ? 'cater' : 'meal';
  const head = pageHead(`${ymLabel(ym)} 식대 · 캐터링`, sub === 'cater' ? '일자별 주문 수량·금액 · 출근 인원은 출근부에서 자동 · 월결제 캐터링 업체에 반영' : '법인카드·전도금 식대 → 사람별·날짜별 · 출근 안 한 날 식대 확인',
    sub === 'cater' ? BTN('exportCater', '엑셀로 저장', 'title="캐터링 주문대장 (회사 양식)"') : BTN('exportMeal', '엑셀로 저장', 'title="출근부·식대내역·결제내역·캐터링·인건비 반영 요약"'));
  const tabs = subTabs([['meal', '식대내역'], ['cater', '캐터링']], sub, 'caterSub');
  if (sub === 'cater') return head + tabs + mealCater();
  const g = mealTop();
  return `${head}${tabs}${mealGroupSeg(g)}${mealStats(g)}<div class="small muted" style="margin:-4px 0 8px">식대 단가는 <a href="#" data-act="goto" data-tab="meal" data-msub="set">출근부 → ⚙ 설정</a>에서</div>${mealMeal()}`;
}
function mealStats(g) {   // 그 칸 사람들 요약
  const ym = state.ym, att = attOf(ym), md = mealData(ym), staff = groupStaff(g), all = groupStaff(g, true);
  const vals = staff.flatMap(s => Object.values(att[s.id] || {})), ph = vals.filter(v => v === ATT_PHOTO).length, ms = vals.filter(v => v === ATT_MISS).length;
  const na = attNoInput(att, staff, ym), noAtt = na.n, unk = Object.keys(md.unknown).length;
  const sb = (k, v, warn) => `<div class="sb${warn ? ' warn' : ''}"><span>${k}</span><b>${v}</b></div>`;
  return `<div class="sumbar">${sb('인원', `${staff.length}명`)}${sb('출근 합계', `${fmtQty(sum(staff, s => attCount(att[s.id]))) || 0}일`)}${sb('식대 (1인분 합계)', `${fmt(sum(all, s => sum(Object.values(md.per[s.name] || {}))))}원`)}${sb('식사 횟수', `${fmt(sum(all, s => sum(Object.values(md.cnt[s.name] || {}))))}회`)}
      ${noAtt ? sb(`출근부 미입력 (${na.d}일)`, `${noAtt}명`, true) : ''}${ph || ms ? sb('사진대체 · 체크누락', `${ph} · ${ms}`) : ''}${g === '현장' && unk ? sb('사용내역 미인식 이름', `${unk}개`, true) : ''}</div>`;
}
function dayHeads(ym) {
  const n = daysIn(ym); let h = '', w = '';
  for (let d = 1; d <= n; d++) { const wd = weekday(ym, d); const we = wd === 0 || wd === 6 ? 'we' : ''; h += `<th class="${we}">${d}</th>`; w += `<th class="${we} small muted">${WEEK[wd]}</th>`; }
  return { h, w, n };
}
/* 식대 단가 규칙의 열쇠: 구분 이름에 규칙 글자가 들어 있으면 그 규칙 (예: 기획팀 → 기획) */
const mealRuleKey = team => { const t = normLabel(team); const r = t && mealRules().find(x => t.includes(normLabel(x.key))); return r ? r.key : String(team || "").trim(); };
function setMealTeamRate(key, v) {   // 식대 단가 규칙 고치기 + 이 달 인건비에 반영 (직접 넣은 다른 값은 그대로)
  const rules = mealRules(), r = rules.find(x => x.key === key), old = r ? r.rate : null;
  if (v === null) { if (r) rules.splice(rules.indexOf(r), 1); } else if (r) r.rate = v; else rules.push({ key, rate: v });
  site().mealLimits = rules.map(x => `${x.key} ${x.rate}`).join(', ');   // 이 현장만
  let n = 0; const nv = v ?? 0;
  payRows(db.cur, state.ym, true).forEach(row => {
    if (row.s.kind === '정직원' || row.s.kind === '외부' || mealRuleKey(row.s.team) !== key) return;
    const cur = toNum(row.rec.mealRate);
    if (row.rec.mealRate === undefined || row.rec.mealRate === '' || cur === 0 || cur === old) { row.rec.mealRate = nv; row.s.pay = row.s.pay || {}; row.s.pay.mealRate = nv; n++; }
  });
  toast(`${key} 식대 단가를 ${v === null ? '삭제했습니다 (기본값 적용)' : fmt(v) + '원으로 바꿨습니다'}${n ? ` · ${ymLabel(state.ym)} 인건비 ${n}명 반영` : ''}`);
}
/* ---------- 출근 기준 시각 · 지각 ----------
 * 현장마다: 기본 기준(site.workStart, 없으면 09:00) + 구분별 기준(site.workStarts = { "상담사": "10:00", … }).
 * 근태기록 출근 시각이 기준보다 늦으면 출근부에 "지"로 표시 (출근일수는 그대로 1). 시각이 없으면 손으로 "지각" 입력 가능.
 * 지각 칸을 한 번 누르면 출근으로 인정(첫 출근 등) → 빨간 1 (attendance[..].__lateOk[직원][일]) */
const DEF_WORK_START = '09:00';
function normHM(v) { const m = String(v || '').trim().match(/^(\d{1,2})(?:[:시.]\s*(\d{1,2}))?/); if (!m) return ''; const h = +m[1], mi = +(m[2] || 0); return h > 23 || mi > 59 ? '' : `${pad2(h)}:${pad2(mi)}`; }
const siteWorkStart = () => normHM(site().workStart) || DEF_WORK_START;
const teamKey = s => String((s && s.team) || '').trim() || '(구분 없음)';
const workStartOf = s => (s && normHM((site().workStarts || {})[teamKey(s)])) || siteWorkStart();
function lateMin(s, timeStr) {   // 근태기록 "08:52 ~ 18:03" → 기준보다 늦은 분 (0 = 정상·시각 없음)
  const m = String(timeStr || '').match(/^\s*(\d{1,2}):(\d{2})/); if (!m) return 0;
  const [h, mi] = workStartOf(s).split(':').map(Number);
  return Math.max(0, (+m[1] * 60 + +m[2]) - (h * 60 + mi));
}
const attLateOk = (sid, ym, d) => !!(((attOf(ym).__lateOk || {})[sid] || {})[d]);   // 지각했지만 출근으로 인정 (첫 출근 등)
function attLate(s, ym, d) {   // -1 = 손으로 "지각" 표시, n = 지각 n분, 0 = 아님(인정 포함)
  const att = attOf(ym), v = (att[s.id] || {})[d];
  if (attLateOk(s.id, ym, d)) return 0;
  return v === ATT_LATE ? -1 : String(v ?? '') === '1' ? lateMin(s, ((att.__time || {})[s.id] || {})[d]) : 0;
}
/* 식대·출근부 → [설정] 칸: 이 현장의 구분별 출근 기준 시각 · 식대 단가를 표로 (세로 = 구분, 가로 = 항목)
 * 식대 단가 = 인건비 식대단가 = 법인카드 식대 초과 기준 (현장마다 다름). 출근 기준은 지각 표시에 씀 */
/* ---------- 출근부 칸 오른쪽 클릭: 사진 등록·보기 · 지각 사유 · 출근 인정 ----------
 * attendance[현장][월].__photo[직원][일] = [사진 경로…] (B. 자금관련/YY년 MM월 서류철/출근사진 — 영수증 폴더를 쓰면 그쪽)
 * attendance[현장][월].__lateWhy[직원][일] = '사유' */
const attPhotos = (ym, sid, d) => (((attOf(ym).__photo || {})[sid] || {})[d]) || [];
const attWhy = (ym, sid, d) => (((attOf(ym).__lateWhy || {})[sid] || {})[d]) || '';
function closeAttMenu() { const m = document.getElementById('attMenu'); if (m) m.remove(); }
/* 출근부 칸 오른쪽 클릭 → [직접 입력] (0.5 · 출장 · 연차 등). 빈 칸으로 저장하면 지움 */
function attEditDialog(sid, d) {
  const att = attOf(state.ym), s = db.staff.find(x => x.id === sid); if (!s) return;
  const cur = String((att[sid] || {})[d] ?? '');
  const put = v => {
    const rec = att[sid] = att[sid] || {}; v = String(v).trim();
    if (v === '') delete rec[d]; else rec[d] = v;
    const ok = att.__lateOk && att.__lateOk[sid]; if (ok) { delete ok[d]; if (!Object.keys(ok).length) delete att.__lateOk[sid]; }   // 값을 바꾸면 지각 인정 표시도 지움
    save(); render();
  };
  const r = modal(`출근부 — ${s.name} ${monthNo(state.ym)}/${d}`, `
    <label class="small">값 <input id="attV" class="inp" value="${esc(cur)}" placeholder="예: 1, 0.5, 출장, 연차" style="width:200px;margin-left:6px"></label>
    <div class="chips" style="margin-top:8px">${['0.5', ATT_PHOTO, ATT_MISS, ATT_LATE, '출장', '연차', '반차'].map(v => `<button class="chip" type="button" data-attv="${v}">${v}</button>`).join('')}<button class="chip" type="button" data-attv="">지우기</button></div>
    <p class="muted small">숫자는 출근일수로 셈 (0.5 = 반일) · 사진대체·체크누락·지각은 출근으로 셈</p>`, [
    { label: '취소' },
    { label: '저장', cls: 'primary', onClick: root => put($('#attV', root).value) }], 's');
  r.querySelectorAll('[data-attv]').forEach(b => b.onclick = () => { put(b.dataset.attv); closeModal(); });
  const inp = $('#attV', r); inp.focus(); inp.select();
  inp.onkeydown = e => { if (e.key === 'Enter') { put(inp.value); closeModal(); } };
}
function attMenu(ev, el) {
  ev.preventDefault(); closeAttMenu();
  const sid = el.dataset.sid, d = el.dataset.d, ym = state.ym, s = db.staff.find(x => x.id === sid); if (!s) return;
  const photos = attPhotos(ym, sid, d), why = attWhy(ym, sid, d), late = attLate(s, ym, d), ok = attLateOk(sid, ym, d);
  const cur = String((attOf(ym)[sid] || {})[d] ?? '');
  // 값 바꾸기 (클릭은 1 → 휴무 → 빈칸만) · 그 아래 사진·지각 사유
  const vals = [['1', '1 · 출근'], ['휴무', '휴 · 휴무']];   // 나머지(사진대체·체크누락·지각·0.5·출장 등)는 [직접 입력]
  const items = [...vals.map(([v, l]) => [`set:${v}`, `${cur === v ? '● ' : '　'}${l}`]), ['edit', '　✎ 직접 입력… (사진대체·0.5·출장 등)'], ...(cur ? [['set:', '　✕ 지우기']] : []), ['-'],
    ['photoAdd', '📷 사진 등록'], ...(photos.length ? [['photoView', `🖼 사진 보기 (${photos.length}장)`]] : []),
    ['why', why ? '✏ 지각 사유 고치기' : '✏ 지각 사유 적기'], ...(late ? [['ok', '✔ 출근으로 인정']] : ok ? [['unok', '↺ 인정 취소 (다시 지각으로)']] : [])];
  const m = document.createElement('div'); m.id = 'attMenu'; m.className = 'no-print';
  m.style.cssText = `position:fixed;left:${ev.clientX}px;top:${ev.clientY}px;z-index:9000;background:#fff;color:#222;border:1px solid #ccd;border-radius:6px;box-shadow:0 4px 14px rgba(0,0,0,.18);padding:4px;min-width:190px;font-size:13px`;
  m.innerHTML = `<div style="padding:4px 8px;color:var(--muted);font-size:12px">${esc(s.name)} · ${monthNo(ym)}월 ${d}일${late > 0 ? ` · 지각 ${late}분` : ''}${why ? `<br>사유: ${esc(why)}` : ''}</div>`
    + items.map(([k, l]) => (k === '-' ? '<div style="border-top:1px solid #e9ecef;margin:4px 0"></div>' : `<button type="button" data-k="${esc(k)}" style="display:block;width:100%;text-align:left;border:0;background:none;padding:5px 8px;cursor:pointer;border-radius:4px;font:inherit;color:inherit">${esc(l)}</button>`)).join('');
  document.body.appendChild(m);
  const r = m.getBoundingClientRect();
  if (r.right > innerWidth) m.style.left = Math.max(4, innerWidth - r.width - 8) + 'px';
  if (r.bottom > innerHeight) m.style.top = Math.max(4, innerHeight - r.height - 8) + 'px';
  m.querySelectorAll('button').forEach(b => { b.onmouseenter = () => { b.style.background = '#f1f3f5'; }; b.onmouseleave = () => { b.style.background = 'none'; }; b.onclick = () => { closeAttMenu(); attMenuDo(b.dataset.k, s, ym, d); }; });
}
async function attMenuDo(k, s, ym, d) {
  const att = attOf(ym), P = nest(att, '__photo', s.id);
  if (k.startsWith('set:')) {   // 값 바꾸기 (빈 값 = 지우기). 값을 바꾸면 지각 인정 표시도 지움
    const v = k.slice(4), rec = att[s.id] = att[s.id] || {};
    if (v) rec[d] = v; else delete rec[d];
    const o = (att.__lateOk || {})[s.id]; if (o) { delete o[d]; if (!Object.keys(o).length) delete att.__lateOk[s.id]; }
    save(); render(); return;
  }
  if (k === 'edit') { attEditDialog(s.id, d); return; }
  const add = async () => {
    const files = await pickFile('image/*,.pdf', true); if (!files.length) return;
    const base = `${ym.replace('-', '')}${pad2(d)}_${safeName(s.name).replace(/ /g, '')}_출근`; let n = 0;
    P[d] = P[d] || [];
    try { for (const f of files) { P[d].push(await storeFile([...parts(monthPath(ym)), '출근사진'], base, f)); n++; } } catch (e) { toast('사진을 저장하지 못했습니다: ' + e.message); }
    if (!P[d].length) delete P[d];
    save(); render(); if (n) toast(`${s.name} ${monthNo(ym)}월 ${d}일 사진 ${n}장을 등록했습니다.`);
  };
  if (k === 'photoAdd') await add();
  else if (k === 'photoView') showFiles(`${s.name} ${monthNo(ym)}월 ${d}일 출근 사진`, P[d] || [], async rel => { await removeFile(rel); P[d] = (P[d] || []).filter(r => r !== rel); if (!P[d].length) delete P[d]; save(); render(); }, add);
  else if (k === 'why') {
    const W = nest(att, '__lateWhy', s.id), v = prompt(`${s.name} ${monthNo(ym)}월 ${d}일 지각 사유\n예) 첫 출근 / 병원 들렀다 옴 / 교통 체증`, W[d] || '');
    if (v === null) return; if (v.trim()) W[d] = v.trim(); else delete W[d];
    save(); render(); toast(v.trim() ? '지각 사유를 적었습니다.' : '지각 사유를 지웠습니다.');
  }
  else if (k === 'ok') { nest(att, '__lateOk', s.id)[d] = true; (att[s.id] = att[s.id] || {})[d] = '1'; save(); render(); }
  else if (k === 'unok') { const o = (att.__lateOk || {})[s.id]; if (o) { delete o[d]; if (!Object.keys(o).length) delete att.__lateOk[s.id]; } save(); render(); }
}
/* 이 달 출근 사진 한 번에 출력: A4 한 장에 4장 (날짜 → 구분 → 이름 순), 사진마다 날짜·구분·이름·출근 시각·지각 사유 */
function attPhotoCount(ym) { return sum(Object.values(attOf(ym).__photo || {}), days => sum(Object.values(days || {}), l => (l || []).length)); }
async function printAttPhotos() {
  const ym = state.ym, att = attOf(ym), s0 = site(), times = att.__time || {};
  const items = [];
  for (const [sid, days] of Object.entries(att.__photo || {})) {
    const s = db.staff.find(x => x.id === sid); if (!s) continue;
    for (const [d, rels] of Object.entries(days || {})) (rels || []).forEach(rel => items.push({ s, d: +d, rel }));
  }
  if (!items.length) { toast(`${ymLabel(ym)}에 등록한 출근 사진이 없습니다. 출근부 칸을 오른쪽 클릭해 사진을 등록하세요.`); return; }
  const order = sortStaff(items.map(x => x.s)).map(x => x.id);
  items.sort((a, b) => a.d - b.d || order.indexOf(a.s.id) - order.indexOf(b.s.id));
  const prog = modal('출근 사진 인쇄 준비', '<p id="apProg">사진 준비 중…</p>', [], 's');
  const pics = []; let miss = 0;
  for (let i = 0; i < items.length; i++) {
    const x = items[i]; const p = $('#apProg', prog); if (p) p.textContent = `사진 준비 중… ${i + 1} / ${items.length}`;
    let canv = []; try { canv = await fileCanvases(await (await fileAt(`${s0.folder}/${x.rel}`, false)).getFile()); } catch (e) { canv = []; }
    if (!canv.length) { miss++; continue; }
    for (const c of canv) pics.push({ ...x, url: await canvasURL(scaledCanvas(c, 1400), 0.85) });
  }
  closeModal();
  if (!pics.length) { toast('사진 파일을 찾을 수 없습니다.'); return; }
  const cap = x => {
    const tm = (String(((times[x.s.id] || {})[x.d]) || '').match(/^\s*(\d{1,2}:\d{2})/) || [])[1], why = attWhy(ym, x.s.id, x.d), late = attLate(x.s, ym, x.d);
    return `<b>${monthNo(ym)}/${x.d}(${WEEK[weekday(ym, x.d)]})</b> · ${esc(x.s.team || '')} <b>${esc(x.s.name)}</b>${tm ? ` · 출근 ${tm}` : ''}${late ? ` · <b style="color:#c00">지각${late > 0 ? ` ${late}분` : ''}</b>` : attLateOk(x.s.id, ym, x.d) ? ' · 지각(출근 인정)' : ''}${why ? `<br>사유: ${esc(why)}` : ''}`;
  };
  const N = Math.ceil(pics.length / 4), pages = [];
  for (let p = 0; p < N; p++) {
    const cells = pics.slice(p * 4, p * 4 + 4).map(x => `<div style="border:1px solid #888;display:flex;flex-direction:column;overflow:hidden;min-height:0">
        <div style="flex:1;display:flex;align-items:center;justify-content:center;min-height:0;padding:2mm"><img src="${x.url}" style="max-width:100%;max-height:100mm;object-fit:contain"></div>
        <div style="font-size:9.5pt;line-height:1.35;padding:1.5mm 2.5mm;border-top:1px solid #888">${cap(x)}</div></div>`).join('');
    pages.push(`<div class="doc" style="font-family:'Malgun Gothic',sans-serif;color:#000">
      <div style="display:flex;justify-content:space-between;align-items:flex-end;border-bottom:1.5px solid #000;padding-bottom:2mm;margin-bottom:3mm"><b style="font-size:13pt">${esc(s0.name)}현장 ${monthNo(ym)}월 출근 사진</b><span style="font-size:9pt">${p + 1} / ${N}</span></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;grid-template-rows:122mm 122mm;gap:4mm">${cells}</div></div>`);
  }
  if (miss) toast(`사진 ${miss}개는 파일을 찾지 못해 뺐습니다.`);
  await printDocs(pages);
}
/* 구분별 급여 단가 = site.rateTable (11_pay siteRate 와 같은 맞춤: 구분 이름에 직종 글자가 들어 있으면) */
function teamRateEntry(team) { const t = normLabel(team); return t ? (site().rateTable || []).find(x => x.job && (t.includes(normLabel(x.job)) || normLabel(x.job).includes(t))) : null; }
function setTeamPay(team, f, v) {   // f = rate | payType | company · 같은 구분 직원의 기본값·이 달 인건비도 (개인별로 다르게 정한 값은 그대로)
  const st = site(); st.rateTable = st.rateTable || [];
  let r = teamRateEntry(team); const old = r ? r[f] : undefined;
  if (!r) { r = { job: team, company: '', payType: '', rate: '', meal: '' }; st.rateTable.push(r); }
  r[f] = v;
  const same = x => x === undefined || x === '' || x === null || x === old || (f === 'rate' && toNum(x) === toNum(old) && old !== '' && old !== undefined);
  let n = 0;
  siteStaff(true).filter(p => p.kind === '현장' && teamRateEntry(p.team) === r).forEach(p => {
    p.pay = p.pay || {}; let hit = false;
    if (same(p.pay[f])) { if (v === '') delete p.pay[f]; else p.pay[f] = v; hit = true; }
    const rec = ((db.payroll[db.cur] || {})[state.ym] || {})[p.id];
    if (rec && same(rec[f]) && v !== '') { rec[f] = v; hit = true; }
    if (hit) n++;
  });
  toast(`${team} ${f === 'rate' ? `급여 단가를 ${v === '' ? '삭제했습니다' : fmt(v) + '원으로 바꿨습니다'}` : f === 'company' ? `업체를 ${v || '(사람별)'}(으)로 바꿨습니다` : `지급형태를 ${v || '(사람별)'}(으)로 바꿨습니다`}${n ? ` · 직원 ${n}명 반영` : ''}`);
}
/* 퇴근 체크 안 해도 되는 구분: ⚙ 설정의 [퇴근 체크] (현장마다 site.outFree = { "기획": true }). 정하지 않았으면 현장 기획(계약직)만 면제 */
function outFree(s) { const o = site().outFree || {}, k = teamKey(s); return k in o ? !!o[k] : s.kind !== '정직원' && /기획/.test(k); }
function mealSet() {
  const g = mealTop(), staff = groupStaff(g, true), hq = g === '정직원';
  const mc = mealCfg(), ws = site().workStarts || {}, defStart = siteWorkStart();
  const teams = [...new Set(staff.map(teamKey))];
  const inp = (v, attrs, ph, wd = 80) => `<input class="num" style="width:${wd}px" value="${esc(v)}" placeholder="${esc(ph)}" ${attrs}>`;
  const shared = {};   // 같은 식대 단가 규칙을 쓰는 구분 (예: 기획 · 기획팀)
  teams.forEach(t => { const k = mealRuleKey(t); (shared[k] = shared[k] || []).push(t); });
  const payCols = !hq;   // 현장 인건비: 구분별 지급형태·급여 단가 (site.rateTable — 영업팀 단가 품의와 같은 표)
  const rows = teams.map(t => {
    const n = staff.filter(s => teamKey(s) === t).length, k = mealRuleKey(t), r = mc.rules.find(x => x.key === k);
    const meal = hq ? `<span class="muted small">기본과 같음</span>`
      : inp(r ? fmt(r.rate) : '', `data-ch="mealTeamRate" data-key="${esc(k)}" title="고치면 이 달 인건비의 같은 구분 인원에게도 반영"`, fmt0(mc.def))
        + (shared[k].length > 1 ? ` <span class="muted small">${esc(shared[k].join('·'))} 같은 단가</span>` : '');   // 여러 구분이 한 단가를 같이 쓸 때만 (고치면 함께 바뀜)
    const rt = payCols ? (teamRateEntry(t) || {}) : null;
    const pay = !payCols ? '' : !isAdmin() ? '<td class="muted small" colspan="3">🔒 관리자</td>'
      : `<td><input list="teamCoList" style="width:120px" value="${esc(rt.company || '')}" placeholder="(사람별)" data-ch="teamPay" data-key="${esc(t)}" data-f="company" title="이 구분 직원의 업체(소속) — 고치면 같은 구분 직원·이 달 인건비에 일괄 적용"></td>
        <td><select data-ch="teamPay" data-key="${esc(t)}" data-f="payType"><option value="">(사람별)</option>${['일급', '월급'].map(x => `<option ${rt.payType === x ? 'selected' : ''}>${x}</option>`).join('')}</select></td>
        <td>${inp(rt.rate !== undefined && rt.rate !== '' ? fmt(rt.rate) : '', `data-ch="teamPay" data-key="${esc(t)}" data-f="rate" title="고치면 이 구분 직원의 기본 단가와 이 달 인건비에도 반영 (사람마다 따로 정한 단가는 그대로)"`, '', 96)}</td>`;
    return `<tr><td class="name"><b>${esc(t)}</b></td><td class="num">${n}명</td>
      <td>${inp(normHM(ws[t]), `data-ch="teamStart" data-key="${esc(t)}"`, defStart, 64)}</td><td>${meal}</td>${pay}
      <td style="text-align:center"><input type="checkbox" data-ch="teamOutChk" data-key="${esc(t)}" ${outFree(staff.find(s => teamKey(s) === t)) ? '' : 'checked'} title="끄면 퇴근을 안 찍어도 출퇴근보고에 올리지 않음"></td></tr>`;
  }).join('');
  const coList = payCols ? `<datalist id="teamCoList">${[...new Set(['사업소득자', ...siteStaff(true).map(p => (p.pay || {}).company), ...(site().rateTable || []).map(x => x.company)].filter(Boolean))].map(c => `<option value="${esc(c)}">`).join('')}</datalist>` : '';
  return `${coList}<div class="panel" style="max-width:1000px"><h3 style="margin-top:0">${esc(site().name)}현장 — ${hq ? '유성 정직원' : '현장 인건비'} 출근부 설정</h3>
    <div class="tbl-wrap"><table class="t"><thead><tr><th>구분</th><th>인원</th><th>출근 기준 시각</th><th>식대 단가 (1인 1일)</th>${payCols ? '<th>업체명</th><th>지급형태</th><th>급여 단가</th>' : ''}<th title="끄면 출퇴근보고에 퇴근 미체크로 올리지 않음">퇴근 체크</th></tr></thead><tbody>
      <tr style="background:var(--accent-soft,#eef4ff)"><td class="name"><b>기본</b> <span class="muted small">${hq ? '' : '(단가를 안 적은 구분 · 이름 모르는 사람)'}</span></td><td></td>
        <td>${inp(normHM(site().workStart), 'data-ch="site" data-f="workStart" data-fid="workStart"', DEF_WORK_START, 64)}</td>
        <td>${hq ? inp(fmt(mc.staff), 'data-ch="site" data-f="mealLimitStaff" data-num="1" data-fid="mealLimitStaff"', '12,000') : inp(fmt(mc.def), 'data-ch="site" data-f="mealLimitDefault" data-num="1" data-fid="mealLimitDefault"', '9,000')}</td>${payCols ? '<td></td><td></td><td></td>' : ''}<td></td></tr>
      ${rows || `<tr><td colspan="${payCols ? 8 : 5}" class="muted" style="padding:14px">직원이 없습니다. 설정 → 직원·카드에서 소속을 지정하세요.</td></tr>`}</tbody></table></div>
    <p class="hint">빈 칸 = 기본값 · <b>출근 기준</b>보다 늦으면 <b style="color:var(--late)">지</b> · <b>식대 단가</b> = 인건비 식대 · 카드 식대 초과 기준 (0 = 없음) · <b>퇴근 체크</b>를 끄면 퇴근 미체크를 보고하지 않음</p></div>`;
}
function mealAtt() {
  const ym = state.ym, att = attOf(ym), md = mealData(ym);
  const times = att.__time || {}, ots = att.__ot || {};
  const { h, w, n } = dayHeads(ym);
  const table = staff => {
  const rows = staff.map(s => {
    const rec = att[s.id] || {}, start = workStartOf(s), nw = mealNoWork(ym, s, md, att);
    let cells = '', lates = 0;
    for (let d = 1; d <= n; d++) {
      const v = rec[d] ?? ''; const wd = weekday(ym, d);
      const tm = (times[s.id] || {})[d], ot = (ots[s.id] || {})[d];
      const late = attLate(s, ym, d); if (late) lates++;
      const okd = !late && String(v) === '1' && attLateOk(s.id, ym, d);   // 지각 인정 = 빨간 1
      const cls = v === '' ? '' : late ? 'late' : okd ? 'lateok' : String(v) === '1' ? 'on' : v === '휴무' ? 'off' : v === ATT_PHOTO ? 'ph' : v === ATT_MISS ? 'ms' : 'etc';
      const lt = late > 0 ? `지각 ${late}분 (출근 기준 ${start}) — 한 번 누르면 출근으로 인정\n` : late ? `지각 (출근 기준 ${start}) — 한 번 누르면 출근으로 인정\n` : okd ? '지각했지만 출근으로 인정 (첫 출근 등)\n' : '';
      const nph = attPhotos(ym, s.id, d).length, why = attWhy(ym, s.id, d);   // 오른쪽 클릭으로 넣은 사진(파란 점)·지각 사유(주황 점)
      const dots = [nph ? 'radial-gradient(circle at 82% 22%,#1c7ed6 2.6px,transparent 3.2px)' : '', why ? 'radial-gradient(circle at 18% 22%,#f76707 2.6px,transparent 3.2px)' : ''].filter(Boolean).join(',');
      const sty = [tm ? 'box-shadow:inset 0 -2px 0 #9cc3f5' : '', dots ? `background-image:${dots}` : '', nw[d] ? 'outline:2px solid var(--bad);outline-offset:-2px' : ''].filter(Boolean).join(';');
      const extra = `${nw[d] ? `⚠ 출근 안 한 날 식대 ${fmt(md.per[s.name][d])}원\n` : ''}${why ? `지각 사유: ${esc(why)}\n` : ''}${nph ? `사진 ${nph}장\n` : ''}`;
      cells += `<td class="cell ${cls} ${wd === 0 || wd === 6 ? 'we' : ''}" data-act="attCell" data-sid="${s.id}" data-d="${d}" title="${lt}${extra}${tm ? esc(tm) + (ot ? ` · 연장 ${ot}h` : '') + '\n' : ''}클릭: 1→휴무→빈칸 / 오른쪽 클릭: 출근·휴무·직접 입력·사진·지각 사유"${sty ? ` style="${sty}"` : ''}>${esc(late ? '지' : v === '1' ? '1' : v === '휴무' ? '휴' : v === ATT_PHOTO ? '사' : v === ATT_MISS ? '누' : String(v).slice(0, 3))}</td>`;
    }
    return `<tr><td class="name">${esc(s.team || '')}</td><td class="name"><b>${esc(s.name)}</b> <span class="muted small">${esc(s.title || '')}</span></td>${cells}<td class="num"><b>${attCount(rec)}</b></td><td class="num" style="color:var(--late)">${lates || ''}</td>
        <td><button class="btn ghost sm" data-act="attFill" data-sid="${s.id}" title="빈 칸을 평일=출근, 주말=휴무로 채우기">⇥</button></td></tr>`;
  }).join('');
  const totals = []; for (let d = 1; d <= n; d++) totals.push(sum(staff, s => (attValue((att[s.id] || {})[d]) > 0 ? 1 : 0)));
  const lateTot = sum(staff, s => { let c = 0; for (let d = 1; d <= n; d++) if (attLate(s, ym, d)) c++; return c; });
  return `<div class="tbl-wrap att-wrap"><table class="t grid att-tbl"><thead><tr><th rowspan="2">구분</th><th rowspan="2">성명</th>${h}<th rowspan="2">계</th><th rowspan="2" style="color:var(--late)">지각</th><th rowspan="2"></th></tr><tr>${w}</tr></thead>
      <tbody>${rows || `<tr><td colspan="${n + 5}" class="muted" style="padding:20px">해당 직원이 없습니다. (설정 → 직원 → 소속)</td></tr>`}
      <tr class="sum"><td colspan="2" class="name">출근 인원</td>${totals.map(v => `<td>${v || ''}</td>`).join('')}<td class="num">${sum(totals)}</td><td class="num" style="color:var(--late)">${lateTot || ''}</td><td></td></tr></tbody></table></div>`;
  };
  const staff = groupStaff(mealTop());
  return `
      ${staff.length ? table(staff) : `<p class="muted" style="padding:20px">${mealTop() === '정직원' ? '유성 정직원' : '현장 인건비'} 직원이 없습니다. 설정 → 직원·카드에서 소속을 지정하세요.</p>`}
      <p class="hint"><b>클릭</b> 1 → 휴무 → 빈칸 · <b>오른쪽 클릭</b> 출근·휴무·직접 입력(사진대체·0.5 등)·사진·지각 사유 · <b>⇥</b> 빈 칸 채우기 · <b style="color:var(--late)">지</b> = 지각 · 파란 밑줄 = 근태기록 · <b class="bad">빨간 테두리</b> = 출근 안 한 날(휴무·빈칸) 식대</p>`;
}
/* 출근 안 한 날 식대: 식대가 잡힌 날인데 출근부가 휴무·0(off) 이거나 비어 있음(blank) → 회사에서 문제 삼을 수 있음 */
function mealNoWork(ym, s, md, att) {
  if (s.kind === '외부') return {};
  const rec = att[s.id] || {}, per = md.per[s.name] || {}, out = {};
  for (const d of Object.keys(per)) {
    if (!per[d]) continue;
    const v = rec[d];
    if (v === undefined || v === '') out[d] = 'blank'; else if (attValue(v) <= 0) out[d] = 'off';
  }
  return out;
}
function mealMeal() {
  const ym = state.ym, md = mealData(ym), att = attOf(ym);
  const { h, w, n } = dayHeads(ym);
  const table = staff => {
    const rows = staff.map(s => {
      let cells = '';
      const nw = mealNoWork(ym, s, md, att);
      for (let d = 1; d <= n; d++) {
        const v = md.per[s.name][d], bad = nw[d];
        const sty = bad === 'off' ? ' style="background:#ffe3e3;color:var(--bad);font-weight:700"' : bad === 'blank' ? ' style="background:#fff3bf"' : '';
        const tip = bad === 'off' ? `\n⚠ 출근 안 한 날 식대 (출근부: ${esc(String((att[s.id] || {})[d]))})` : bad === 'blank' ? '\n⚠ 출근부가 비어 있는 날 식대' : '';
        cells += `<td class="small ${weekday(ym, d) % 6 === 0 ? 'we' : ''}" title="${md.cnt[s.name][d] || 0}회${tip}"${sty}>${v ? fmt(v) : ''}</td>`;
      }
      const tot = sum(Object.values(md.per[s.name]));
      return `<tr><td class="name">${esc(s.team || '')}</td><td class="name"><b>${esc(s.name)}</b></td>${cells}<td class="num"><b>${fmt0(tot)}</b></td><td class="num">${sum(Object.values(md.cnt[s.name])) || ''}</td></tr>`;
    }).join('');
    const dayTot = []; for (let d = 1; d <= n; d++) dayTot.push(sum(staff, s => md.per[s.name][d] || 0));
    return `<div class="tbl-wrap"><table class="t grid"><thead><tr><th rowspan="2">구분</th><th rowspan="2">성명</th>${h}<th rowspan="2">식대 계</th><th rowspan="2">횟수</th></tr><tr>${w}</tr></thead><tbody>${rows || `<tr><td colspan="${n + 4}" class="muted" style="padding:20px">해당 직원이 없습니다.</td></tr>`}
        <tr class="sum"><td colspan="2" class="name">소계</td>${dayTot.map(v => `<td class="small">${v ? fmt(v) : ''}</td>`).join('')}<td class="num">${fmt(sum(dayTot))}</td><td class="num">${sum(staff, s => sum(Object.values(md.cnt[s.name])))}</td></tr></tbody></table></div>`;
  };
  const g = mealTop(), staff = groupStaff(g, true), names = new Set(staff.map(s => s.name));
  // 이 칸 사람이 들어간 결제 (현장 칸에는 직원을 못 알아본 결제도 같이 — 확인용)
  const rowsP = md.parsed.filter(({ p }) => p.matched.some(n => names.has(n)) || (g === '현장' && !p.matched.length));
  const list = rowsP.map(x => x.t), unk = g === '현장' ? Object.entries(md.unknown).sort((a, b) => b[1] - a[1]) : [];
  const dup = list.filter(t => caterDup(t) && !t.caterOk), ov = list.filter(t => { const m = mealInfo(t); return m && m.over && !t.overReason; });
  const nwOff = [], nwBlank = [];
  for (const s of staff) { const nw = mealNoWork(ym, s, md, att); for (const [d, k] of Object.entries(nw)) (k === 'off' ? nwOff : nwBlank).push(`${esc(s.name)} ${d}일`); }
  const nwBanner = nwOff.length || nwBlank.length ? `<div class="banner warn small">${nwOff.length ? `<b class="bad">출근 안 한 날 식대 ${nwOff.length}건</b> (${nwOff.join(', ')}) ` : ''}${nwBlank.length ? `<b>출근부 빈 날 식대 ${nwBlank.length}건</b> (${nwBlank.join(', ')}) ` : ''}<span class="muted">— 회사에서 문제 삼을 수 있으니 출근부·사용내역을 확인하세요 (표에서 빨간 칸 = 휴무·0, 노란 칸 = 출근부 빈칸)</span></div>` : '';
  return `${nwBanner}<div class="toolbar"><label class="small"><input type="checkbox" data-ch="includeSnack" ${state.includeSnack ? 'checked' : ''}> 간식대 포함</label>
        <span class="muted small">법인카드·전도금의 세목 "식대" + 사용내역 "중식/이름,이름" → 1인분(결제금액 ÷ 인원)으로 나눠 집계</span></div>
      ${unk.length ? `<div class="banner warn small">직원 목록에 없는 이름: ${unk.map(([nm, c]) => `<button class="chip" data-act="addStaffName" data-v="${esc(nm)}">+ ${esc(nm)} (${c}회)</button>`).join(' ')} <span>— 눌러서 직원으로 등록</span></div>` : ''}
      ${dup.length || ov.length ? `<div class="banner warn small">${dup.length ? `<b>캐터링 중복 ${dup.length}건</b> (${dup.map(t => `${t.date.slice(5)} ${esc(t.merchant)}`).join(', ')}) ` : ''}${ov.length ? `<b>식대 초과 ${ov.length}건</b> 사유 없음 (${ov.map(t => `${t.date.slice(5)} ${esc(t.merchant)}`).join(', ')})` : ''} <span class="muted">— 법인카드·전도금 탭 사용내역 칸 아래에서 사유를 적으세요</span></div>` : ''}
      ${staff.length ? table(staff) : '<p class="muted" style="padding:20px">해당 직원이 없습니다.</p>'}
      <h3>식대 결제 내역 <span class="muted small">${g === '정직원' ? '유성 정직원이 들어간 결제' : '현장 직원이 들어간 결제 + 직원을 못 알아본 결제(노란 줄)'} · ${list.length}건 · ${fmt(sum(list, t => t.amount))}원</span></h3>
      <div class="tbl-wrap" style="max-height:420px"><table class="t"><thead><tr><th>일자</th><th>결제</th><th>가맹점</th><th>금액</th><th>사용내역</th><th>인원</th><th>1인분</th><th>직원 인식</th><th>점검</th></tr></thead><tbody>
      ${rowsP.map(({ t, p, share }) => { const mi = mealInfo(t); return `<tr class="${p.matched.length ? '' : 'unset'}"><td>${t.date.slice(5)} ${esc(t.time || '')}</td><td>${t.src === 'card' ? '카드 ' + esc(t.card) : '전도금'}</td><td>${esc(t.merchant)}</td><td class="num">${fmt(t.amount)}</td><td>${esc(t.memo)}</td><td class="num">${p.count}</td><td class="num">${fmt(share)}</td><td>${p.matched.map(n => names.has(n) ? `<b>${esc(n)}</b>` : esc(n)).join(', ') || '<span class="badge warn">없음</span>'}</td>
        <td class="small">${mi && mi.over ? `<span class="badge ${t.overReason ? 'ok' : 'warn'}" title="${esc(t.overReason || '사유 없음')}">초과 ${fmt(mi.overAmt)}</span> ` : ''}${caterDup(t) ? `<span class="badge ${t.caterOk ? 'ok' : 'warn'}" title="${esc(t.caterOk || '')}">캐터링 중복</span>` : ''}</td></tr>`; }).join('') || '<tr><td colspan="9" class="center muted" style="padding:20px">결제 내역이 없습니다.</td></tr>'}
      </tbody></table></div>`;
}
/* 캐터링 소속별 인원 (회사 주문대장 "캐터링취식" 시트: 출근예정인원 · 실제출근인원 소속별 열)
 * site.caterCols = [{ l, ext }] — ext = 외부 소속(시공사·시행사·모범운전자·광고사): 실제 인원도 직접 입력
 * 내부 소속 실제 = 출근부 (직원 구분 이름으로 열 찾기, 못 찾으면 '기타') · 예정 = c.days[d].plan[l] · 외부 실제 = c.days[d].ext[l]
 * c.vatEx = 단가 부가세 별도 → 월 합계에 부가세 줄, caterTotal(월결제 반영)은 부가세 포함 */
const CATER_COLS = [['시공사', 1], ['시행사', 1], ['유성', 0], ['기획계약', 0], ['경리', 0], ['상담사', 0], ['TM', 0], ['알바', 0], ['도우미', 0], ['경호', 0], ['미화', 0], ['홍보단', 0], ['모범운전자', 1], ['광고사', 1]];
const CATER_ALIAS = { 유성: /유성|정직원/, 기획계약: /기획/, 알바: /알바|아르바이트/, TM: /TM|텔레/i, 홍보단: /홍보/, 도우미: /도우미|인포|큐레이터/ };
const CATER_NOEAT = /알바|아르바이트|도우미/;   // 2026-10-06 경영지원: 알바·도우미는 중식 제공 안 함 (일비 포함) — 현장 설정 caterNoAlba
const caterCols = (s = site()) => (Array.isArray(s.caterCols) && s.caterCols.length ? s.caterCols : CATER_COLS.map(([l, e]) => ({ l, ext: !!e })));
function caterColOf(p, cols) {   // 직원 → 소속 열 이름
  const ins = cols.filter(c => !c.ext);
  if (p.kind === '정직원') { const c = ins.find(x => /유성|정직원/.test(x.l)); if (c) return c.l; }
  const t = normLabel(p.team).replace(/팀$/, '');
  const hit = t && ins.find(x => { const re = CATER_ALIAS[x.l]; if (re) return re.test(t); const k = normLabel(x.l).replace(/팀$/, ''); return k && (t.includes(k) || k.includes(t)); });
  return hit ? hit.l : '기타';
}
function caterPeople(ym) {   // 날마다 { plan: {열: n}, act: {열: n}, planSum, actSum } · cols(기타 포함)
  const c = caterOf(ym), att = attOf(ym), staff = workStaff(), base = caterCols(), n = daysIn(ym);
  const colOf = new Map(staff.map(p => [p.id, caterColOf(p, base)]));
  const days = {}; let other = false;
  for (let d = 1; d <= n; d++) {
    const r = c.days[d] || {}, act = {};
    staff.forEach(p => { if (attValue((att[p.id] || {})[d]) > 0) { const k = colOf.get(p.id); act[k] = (act[k] || 0) + 1; if (k === '기타') other = true; } });
    base.filter(x => x.ext).forEach(x => { const v = toNum((r.ext || {})[x.l]); if (v) act[x.l] = v; });
    const plan = Object.fromEntries(Object.entries(r.plan || {}).map(([k, v]) => [k, toNum(v)]).filter(([, v]) => v));
    const actSum = sum(Object.values(act)), noEat = site().caterNoAlba ? sum(Object.entries(act).filter(([k]) => CATER_NOEAT.test(k)), ([, v]) => v) : 0;
    days[d] = { plan, act, planSum: sum(Object.values(plan)), actSum, noEat, eat: actSum - noEat };   // eat = 캐터링 대상 (알바·도우미 제공 안 함이면 빼고)
  }
  return { days, cols: other ? [...base, { l: '기타', ext: false, auto: true }] : base };
}
const caterAmt = (g, r) => toNum(r.l) * toNum(g.lunchPrice) + toNum(r.s) * toNum(g.snackPrice);   // g = 그날 업체(caterSegAt)
function mealCater() {
  const ym = state.ym, c = caterOf(ym), n = daysIn(ym), wide = !!state.caterWide;
  const P = caterPeople(ym), cols = P.cols, segs = caterSegs(c), segAmt = segs.map(() => 0), multi = segs.length > 1;
  let acc = 0, totL = 0, totS = 0, totP = 0, totA = 0;
  const noAlba = !!site().caterNoAlba, overDays = [];   // 알바·도우미 제공 안 함: 중식 주문 > 대상 인원(실제출근 − 알바·도우미)인 날
  const numIn = (d, f, l, v, w = 34) => `<input class="num" style="width:${w}px" value="${fmt0(v)}" data-ch="cater" data-d="${d}" data-f="${f}"${l ? ` data-l="${esc(l)}"` : ''} data-fid="c${f}${d}${l || ''}">`;
  let rows = '';
  for (let d = 1; d <= n; d++) {
    const r = c.days[d] || {}, wd = weekday(ym, d), p = P.days[d];
    const g = caterSegAt(segs, d), gk = segs.indexOf(g), amt = caterAmt(g, r); acc += amt; segAmt[gk] += amt; totL += toNum(r.l); totS += toNum(r.s); totP += p.planSum; totA += p.actSum;
    const diff = toNum(r.l) && p.eat && toNum(r.l) !== p.eat;
    const albaOver = noAlba && p.noEat && toNum(r.l) > p.eat; if (albaOver) overDays.push(d);
    const byTxt = cols.map(x => (p.act[x.l] ? `${x.l} ${p.act[x.l]}` : '')).filter(Boolean).join(' · ');
    const peopleCells = wide
      ? cols.map(x => `<td>${x.auto ? '' : numIn(d, 'plan', x.l, p.plan[x.l])}</td>`).join('') + `<td class="num"><b>${fmt0(p.planSum)}</b></td>`
        + cols.map(x => `<td class="num">${x.ext ? numIn(d, 'ext', x.l, p.act[x.l]) : fmt0(p.act[x.l])}</td>`).join('') + `<td class="num" ${diff ? 'style="color:var(--warn)"' : ''}><b>${fmt0(p.actSum)}</b></td>`
      : `<td class="num">${fmt0(p.planSum)}</td><td class="num" title="${esc(byTxt)}" ${diff ? 'style="color:var(--warn);font-weight:700"' : ''}>${fmt0(p.actSum)}</td>`;
    const chgHere = multi && gk > 0 && d === g.from;   // 업체가 바뀐 날
    rows += `<tr class="${wd === 0 || wd === 6 ? 'sub' : ''}${chgHere ? ' cater-chg' : ''}"><td class="center" style="white-space:nowrap">${monthNo(ym)}/${d} (${WEEK[wd]})${chgHere ? `<br><span class="badge warn" title="이날부터 ${esc(g.name || '바뀐 업체')} 단가">${esc(g.name || '업체 변경')}부터</span>` : ''}</td>${peopleCells}
        <td ${albaOver ? `style="background:var(--bad-soft)" title="알바·도우미 ${p.noEat}명 빼면 대상 ${p.eat}명 — 주문 ${toNum(r.l)}식"` : ''}>${numIn(d, 'l', '', r.l, 60)}</td><td>${numIn(d, 's', '', r.s, 60)}</td>
        <td class="num" style="min-width:84px">${fmt0(amt)}</td><td class="num muted" style="min-width:84px">${fmt0(acc)}</td>
        <td class="center"><input type="checkbox" ${r.ok ? 'checked' : ''} data-ch="cater" data-d="${d}" data-f="ok"></td>
        <td><input style="width:140px" value="${esc(r.note || '')}" data-ch="cater" data-d="${d}" data-f="note" data-fid="cn${d}"></td>
        ${wide ? '' : `<td class="small muted" style="white-space:nowrap">${esc(byTxt)}</td>`}</tr>`;
  }
  const colSum = (f, l) => sum(Object.values(P.days), p => p[f][l] || 0);
  const anyVat = segs.some(g => g.vatEx), vat = segs.reduce((a, g, k) => a + (g.vatEx ? Math.round(segAmt[k] * 0.1) : 0), 0);
  const nPeople = wide ? (cols.length + 1) * 2 : 2;
  const head = wide
    ? `<tr><th rowspan="2">일자</th><th colspan="${cols.length + 1}">출근예정인원</th><th colspan="${cols.length + 1}">실제출근인원</th><th rowspan="2">중식</th><th rowspan="2">간식</th><th rowspan="2">금액</th><th rowspan="2">누계</th><th rowspan="2">업체확인</th><th rowspan="2">비고</th></tr>
       <tr>${cols.map(x => `<th class="small" title="${x.ext ? '외부 소속 — 직접 입력' : x.auto ? '구분이 열과 안 맞는 직원' : '출근부 자동'}">${esc(x.l)}</th>`).join('')}<th>계</th>${cols.map(x => `<th class="small">${esc(x.l)}${x.ext ? '✎' : ''}</th>`).join('')}<th>계</th></tr>`
    : '<tr><th>일자</th><th>출근예정</th><th>실제출근</th><th>중식 주문</th><th>간식 주문</th><th>금액</th><th>누계</th><th>업체확인</th><th>비고</th><th>소속별 실제출근</th></tr>';
  const sumPeople = wide ? cols.map(x => `<td class="num">${fmt0(colSum('plan', x.l))}</td>`).join('') + `<td class="num">${fmt0(totP)}</td>` + cols.map(x => `<td class="num">${fmt0(colSum('act', x.l))}</td>`).join('') + `<td class="num">${fmt0(totA)}</td>` : `<td class="num">${fmt0(totP)}</td><td class="num">${fmt0(totA)}</td>`;
  const tail = wide ? '<td></td><td></td>' : '<td></td><td></td><td></td>';
  const vatRows = anyVat ? `<tr class="sum"><td>부가세</td><td colspan="${nPeople + 2}"></td><td class="num">${fmt(vat)}</td><td></td>${tail}</tr><tr class="sum"><td>합계</td><td colspan="${nPeople + 2}"></td><td class="num">${fmt(acc + vat)}</td><td></td>${tail}</tr>` : '';
  // 캐터링 업체 표: 1일부터 업체 + 달 중간에 바뀐 업체(그날부터) · 업체 이름 = 월결제 거래처 이름 (같으면 다음 달 월결제에 업체별 자동 반영)
  const segIn = (k, f, v, attr = '') => `<input ${attr} value="${esc(v)}" data-ch="caterSeg" data-k="${k}" data-f="${f}" data-fid="cg${f}${k}">`;
  const segRows = segs.map((g, k) => `<tr><td class="center">${k ? `${segIn(k, 'from', g.from, `class="num" style="width:44px"`)}일부터` : '1일부터'}</td>
      <td>${segIn(k, 'name', g.name, 'placeholder="업체 이름 (월결제 거래처와 같게)" style="width:200px"')}</td>
      <td>${segIn(k, 'lunchPrice', fmt0(g.lunchPrice), 'class="num" style="width:80px"')}</td><td>${segIn(k, 'snackPrice', fmt0(g.snackPrice), 'class="num" style="width:80px"')}</td>
      <td class="center"><input type="checkbox" data-ch="caterSeg" data-k="${k}" data-f="vatEx" ${g.vatEx ? 'checked' : ''} title="단가 부가세 별도 (금액에 10% 추가)"></td>
      <td class="num">${fmt0(segAmt[k] + (g.vatEx ? Math.round(segAmt[k] * 0.1) : 0))}</td>
      <td>${k ? `<button class="btn ghost sm danger" data-act="caterSegDel" data-k="${k}" title="이 업체 변경 삭제 (그날부터 앞 업체 단가)">✕</button>` : ''}</td></tr>`).join('');
  return `<div class="panel cater-vendors" style="max-width:820px;margin-bottom:10px;padding:10px 12px"><div class="row" style="margin-bottom:6px"><b class="grow">캐터링 업체</b><button class="btn sm" data-act="caterSegAdd" title="달 중간에 캐터링 업체가 바뀐 경우 — 바뀐 날부터 새 업체·단가">+ 업체 변경 (중간부터)</button></div>
        <table class="t"><thead><tr><th>기간</th><th>업체명</th><th>중식 단가</th><th>간식 단가</th><th title="단가 부가세 별도">VAT 별도</th><th>이 달 금액</th><th></th></tr></thead><tbody>${segRows}</tbody></table>
        <div class="small muted" style="margin-top:6px">업체명이 월결제 거래처 이름과 같으면, 다음 달 월결제에 업체별 금액이 자동으로 들어갑니다 (월결제 표 "캐터링" 칸 체크). 새 달은 지난달 마지막 업체로 시작합니다.</div>
        <label class="small" style="display:block;margin-top:6px" title="경영지원 지침 (2026-10-06): 알바·도우미는 중식 제공 안 함 — 일비에 포함"><input type="checkbox" data-ch="site" data-f="caterNoAlba" ${noAlba ? 'checked' : ''}> 알바·도우미 캐터링 제공 안 함 (일비 포함)</label></div>
      ${overDays.length ? `<div class="banner warn small">알바·도우미를 빼면 중식 주문이 대상 인원보다 많은 날 <b>${overDays.length}일</b> (${overDays.slice(0, 10).map(d => `${monthNo(ym)}/${d}`).join(', ')}${overDays.length > 10 ? ' …' : ''}) — 알바·도우미 몫이 주문에 들어갔는지 확인하세요. 알바·도우미가 캐터링을 먹었다면 인건비에서 식대 공제 대상입니다.</div>` : ''}
      <div class="stats"><div class="stat"><div class="k">중식 주문</div><div class="v">${fmt(totL)}식</div></div><div class="stat"><div class="k">간식 주문</div><div class="v">${fmt(totS)}개</div></div><div class="stat"><div class="k">캐터링 금액${anyVat ? ' (부가세 포함)' : ''}</div><div class="v">${fmt(acc + vat)}</div></div></div>
      <div class="row small" style="margin-bottom:8px;flex-wrap:wrap"><button class="btn sm ${wide ? 'primary' : ''}" data-act="caterWide">${wide ? '소속별 접기' : '소속별 펼치기 (예정 입력)'}</button><button class="btn sm" data-act="caterFill">빈 날 중식 주문 = 실제출근</button><button class="btn sm" data-act="caterPlanFill" title="출근예정을 비워 둔 날만, 그날 실제출근 인원으로 (지난 날 정리용)">빈 날 출근예정 = 실제출근</button><button class="btn sm" data-act="caterColsEdit">소속 열 편집</button>
        <span class="muted">실제출근 = 출근부 자동 (외부 소속 ✎ 는 직접 입력) · 주문 수량과 다르면 주황색${noAlba ? ' (알바·도우미 뺀 인원과 비교)' : ''} · 금액은 다음 달 월결제에 업체별로 자동 반영됩니다.</span></div>
      <div class="tbl-wrap"><table class="t"><thead>${head}</thead><tbody>${rows}
      <tr class="sum"><td>계</td>${sumPeople}<td class="num">${fmt(totL)}</td><td class="num">${fmt(totS)}</td><td class="num">${fmt(acc)}</td><td></td>${tail}</tr>${vatRows}</tbody></table></div>`;
}
function caterTotal(sid, ym) { return sum(caterByVendor(sid, ym), x => x.amt); }   // 캐터링 금액 (업체 모두, 부가세 별도 업체는 10% 더함)
function caterColsDialog() {
  const s = site(), cols = caterCols(s);
  modal('캐터링 소속 열 편집', `<p class="small">한 줄에 소속 하나. 출근부에 없는 외부 소속(시공사·시행사·모범운전자·광고사 등)은 끝에 <b>*</b> 를 붙이면 실제 인원도 직접 입력합니다. 시공사는 현장 시공사 이름으로 바꿔 쓰세요 (예: ○○건설*).</p>
    <textarea id="ccTxt" rows="16" style="width:100%">${esc(cols.map(x => x.l + (x.ext ? '*' : '')).join('\n'))}</textarea>
    <p class="small muted">내부 소속은 직원 구분(팀) 이름으로 출근 인원을 셉니다 (예: "상담사팀" → 상담사, 정직원 → 유성). 맞는 열이 없는 직원은 "기타"로 나옵니다.</p>`, [
    { label: '기본값으로', onClick: () => { delete s.caterCols; save(); render(); } },
    { label: '취소' },
    { label: '저장', cls: 'primary', onClick: root => { const list = $('#ccTxt', root).value.split('\n').map(l => l.trim()).filter(Boolean).map(l => ({ l: l.replace(/\*$/, '').trim(), ext: /\*$/.test(l) })).filter(x => x.l); s.caterCols = list; save(); render(); toast(`소속 열 ${list.length}개를 저장했습니다.`); } }], 'm');
}
function mealSum() {
  const ym = state.ym, md = mealData(ym), att = attOf(ym);
  const table = staff => {
    const rows = staff.map(s => {
      const days = attCount(att[s.id]);
      const meals = sum(Object.values(md.cnt[s.name]));
      const amt = sum(Object.values(md.per[s.name]));
      return `<tr><td>${esc(s.team || '')}</td><td><b>${esc(s.name)}</b></td><td>${esc(s.title || '')}</td><td class="num">${days || ''}</td><td class="num">${meals || ''}</td><td class="num">${fmt0(amt)}</td></tr>`;
    }).join('');
    return `<div class="tbl-wrap" style="max-width:760px"><table class="t fixed"><colgroup><col style="width:16%"><col style="width:16%"><col style="width:14%"><col style="width:16%"><col style="width:18%"><col style="width:20%"></colgroup><thead><tr><th>구분</th><th>성명</th><th>직책</th><th>출근일수</th><th>식사횟수(법카·전도금)</th><th>식대 (1인분 합계)</th></tr></thead><tbody>${rows || '<tr><td colspan="6" class="muted">해당 직원이 없습니다.</td></tr>'}
        <tr class="sum"><td colspan="3">소계</td><td class="num">${sum(staff, s => attCount(att[s.id]))}</td><td class="num">${sum(staff, s => sum(Object.values(md.cnt[s.name])))}</td><td class="num">${fmt(sum(staff, s => sum(Object.values(md.per[s.name]))))}</td></tr></tbody></table></div>`;
  };
  const g = mealTop(), staff = groupStaff(g, true).filter(x => x.active !== false || attCount(att[x.id]) || sum(Object.values(md.cnt[x.name] || {})));
  return `<p class="hint" style="margin-top:0">${g === '정직원' ? '본사 급여 담당에게 보낼 출근일수·식대 요약' : `인건비 청구용 요약 — ${mdw(payFundDay(ymAdd(state.ym, 1), db.settings))} 자금집행 전에 확인`}</p>
      ${staff.length ? table(staff) : '<p class="muted" style="padding:20px">해당 직원이 없습니다.</p>'}
      ${g === '현장' ? `<div class="sumbar" style="margin-top:12px"><div class="sb"><span>캐터링 금액 (이 달)</span><b>${fmt(caterTotal(db.cur, ym))}</b></div><div class="sb${md.unmatched.length ? ' warn' : ''}"><span>직원 미인식 결제</span><b>${md.unmatched.length}건</b></div></div>` : ''}`;
}
