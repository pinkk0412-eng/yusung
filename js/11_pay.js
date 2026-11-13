/* 유성 현장 관리 프로그램 — 인건비 탭
 * (원래 app.js 의 화면 부분. 모든 js/*.js 는 같은 전역 공간을 공유하며 html 에 적힌 순서대로 읽힘) */
'use strict';


/* ================= 인건비 ================= */
// 영업팀 단가 품의로 반영해 둔 구분별 단가 (현장 정보 rateTable)
function siteRate(s) {
  const st = db.sites.find(x => x.id === s.siteId) || {}, t = normLabel(s.team); if (!t) return {};
  const r = (st.rateTable || []).find(x => x.job && (t.includes(normLabel(x.job)) || normLabel(x.job).includes(t))) || {};
  const v = x => (x === '' || x === undefined || x === null ? undefined : x);
  return { company: v(r.company), payType: PAY_TYPES.includes(r.payType) ? r.payType : undefined, rate: v(r.rate), meal: v(r.meal) };
}
function payDefaults(s) {
  const p = s.pay || {}, rt = siteRate(s);
  const mc = mealCfgOf(s.siteId), meal = mealRateFor(s.team, mc.rules) ?? mc.def;   // 식대 단가(현장별) = 법인카드 식대 기준과 같음
  return {
    company: p.company ?? rt.company ?? '사업소득자', payType: p.payType ?? rt.payType ?? '일급', rate: p.rate ?? rt.rate ?? 0, otRate: p.otRate ?? 0, mealRate: p.mealRate ?? rt.meal ?? meal ?? 0,
    taxType: p.taxType ?? '3.3', payer: p.payer ?? '유성', plGroup: p.plGroup ?? guessPlGroup(s.team),
  };
}
function payRec(sid, ym, s) {
  const m = nest(db.payroll, sid, ym);
  if (!m[s.id]) {
    const prev = ((db.payroll[sid] || {})[ymAdd(ym, -1)] || {})[s.id];
    const base = payDefaults(s);
    if (prev) PAY_FIELDS.forEach(f => { if (prev[f] !== undefined) base[f] = prev[f]; });
    const pc = prev && payChg(prev, daysIn(ymAdd(ym, -1)));   // 지난달 중간에 단가가 바뀌었으면 바뀐 값부터
    if (pc) { base.payType = pc.payType; base.rate = pc.rate; }
    m[s.id] = { ...base, workDays: null, prorate: null, otHours: null, mealDays: null, incentive: 0, note: '' };
  }
  return m[s.id];
}
function payRows(sid, ym, create) {
  const att = ((db.attendance[sid] || {})[ym]) || {};
  const dim = daysIn(ym);
  const staff = sortStaff(db.staff.filter(s => s.siteId === sid && s.kind !== '외부' && (s.active !== false || ((db.payroll[sid] || {})[ym] || {})[s.id])));
  const out = [];
  for (const s of staff) {
    if (!isAdmin() && isSecretStaff(s)) continue;   // 경리 모드: 비공개 급여 인원은 계산·표시하지 않음
    const existing = ((db.payroll[sid] || {})[ym] || {})[s.id];
    // 그 달 출근 기록·기존 기록·단가가 없는 사람은 표시하지 않음 (근태기록으로 등록된 알바 등)
    if (!existing && !(attCount(att[s.id]) > 0 || (s.pay && toNum(s.pay.rate)) || ((db.payroll[sid] || {})[ymAdd(ym, -1)] || {})[s.id])) continue;
    const rec = create ? payRec(sid, ym, s) : existing;
    if (!rec) continue;
    if (s.kind === '정직원') rec.payType = '정직원(손익만)';
    else if (rec.payType === '정직원(손익만)') rec.payType = '월급';
    const autoOt = sum(Object.values((att.__ot || {})[s.id] || {}));
    const pc = payChg(rec, dim), a = att[s.id] || {};
    const attSplit = pc ? { before: sum(Object.entries(a).filter(([d]) => +d < pc.day), ([, v]) => attValue(v)), after: sum(Object.entries(a).filter(([d]) => +d >= pc.day), ([, v]) => attValue(v)) } : null;
    out.push({ s, rec, c: payCalc(rec, dim, attCount(a), autoOt, attSplit) });
  }
  return out;
}
// 특이사항 자동 글자: 출근부(사진대체·체크누락). 단가 변경은 비고가 아니라 세부내역·엑셀에서 두 줄로 나옴
const payNoteAuto = (ym, s) => attNoteAuto(db.cur, ym, s.id);
/* 단가 변경 적용 (인건비 [변경] 창 · 품의서 [인건비 반영] 공통): date(YYYY-MM-DD)부터 type·rate
 * 1일이면 그 달 기록을 바로 바꾸고, 2일~말일이면 그 달은 나눠 계산(rec.chg). 직원 기본값·이미 만든 다음 달 기록(예전 값 그대로인 것)도 새 값으로
 * extra: { company, mealRate } 등 같이 바꿀 값 (다음 달·기본값에만, 나눠 계산하는 달은 그대로) */
function payApplyChange(p, date, type, rate, extra = {}) {
  const ym = String(date).slice(0, 7), day = toNum(String(date).slice(8, 10)) || 1;
  const rec = payRec(db.cur, ym, p), old = { payType: rec.payType, rate: toNum(rec.rate) };   // 변경 전 값 (나눠 계산하는 달이면 앞부분 값)
  if (day <= 1) { rec.payType = type; rec.rate = rate; delete rec.chg; Object.assign(rec, extra); }
  else rec.chg = { day, payType: type, rate };
  p.pay = Object.assign(p.pay || {}, { payType: type, rate }, extra);   // 새로 만드는 달의 기본값
  Object.entries(db.payroll[db.cur] || {}).filter(([m]) => /^\d{4}-\d{2}$/.test(m) && m > ym).forEach(([, mm]) => {
    const r2 = mm[p.id]; if (r2 && !r2.chg && r2.payType === old.payType && toNum(r2.rate) === old.rate) Object.assign(r2, { payType: type, rate }, extra);
  });
  return day <= 1 ? `${ymLabel(ym)}부터` : `${monthNo(ym)}/${day}부터`;
}
/* 급여단가 칸을 고치면 → "언제부터 적용?" (1일 = 이 달 전체 · 달 중간 = 그 달은 앞뒤로 나눠 계산 · 다음 달부터 새 단가)
 * 처음 넣는 단가(지금 0)와 이미 달 중간 변경이 있는 달(변경 전 단가 고치기)은 묻지 않고 바로 */
function payRateAsk(p, rate) {
  const ym = state.ym, dim = daysIn(ym), rec = payRec(db.cur, ym, p);
  const r = modal(`단가 변경 — ${p.name} (${ymLabel(ym)})`, `
    <p>지금 <b>${esc(rec.payType)} ${fmt(rec.rate)}원</b> → <b>${fmt(rate)}원</b></p>
    <div class="form-grid">
      <label>적용일 (이 날부터)<input id="prDay" type="date" min="${ym}-01" value="${ym}-01"></label>
      <label>지급형태<select id="prType">${['일급', '월급'].map(x => `<option ${x === (rec.payType === '월급' ? '월급' : '일급') ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
    </div>
    <div class="row small" style="gap:6px;margin-top:6px"><span class="muted">빠른 선택</span>${[1, 11, 16, 21].filter(d => d <= dim).map(d => `<button class="chip" data-prd="${d}">${monthNo(ym)}/${d}부터</button>`).join('')}</div>
    <p id="prInfo" class="small" style="margin-top:8px"></p>`, [
    { label: '취소' },
    { label: '저장', cls: 'primary', onClick: root => {
      const date = $('#prDay', root).value || `${ym}-01`;
      if (date < `${ym}-01`) { toast(`${ymLabel(ym)} 1일 이후로 고르세요.`); return true; }
      const when = payApplyChange(p, date, $('#prType', root).value, rate);
      save(); render(); toast(`${p.name}: ${when} ${$('#prType', root).value} ${fmt(rate)}원으로 바꿨습니다.`);
    } }], 's');
  const info = () => { const ds = $('#prDay', r).value || `${ym}-01`, d = +ds.slice(8, 10), same = ds.slice(0, 7) === ym;
    $('#prInfo', r).innerHTML = !same ? `${ds.slice(0, 7).replace('-', '년 ')}월 ${d}일부터 새 단가 (이 달은 그대로)` : d <= 1 ? `<b>${ymLabel(ym)} 전체</b>를 새 단가로 계산합니다.` : `<b>${monthNo(ym)}/1~${d - 1}</b>은 지금 단가, <b>${monthNo(ym)}/${d}~${dim}</b>은 새 단가로 나눠 계산합니다 (일급 = 출근일 × 일급, 월급 = 월급 × 일수 / ${dim}일). 다음 달부터는 새 단가.`; };
  $('#prDay', r).onchange = info;
  r.querySelectorAll('[data-prd]').forEach(b => b.onclick = () => { $('#prDay', r).value = `${ym}-${pad2(+b.dataset.prd)}`; info(); });
  info();
}
/* 달 중간 단가 변경 창:변경일·새 지급형태·새 단가 → 그 달은 나눠 계산, 다음 달부터 새 값 (직원 기본값·이미 만든 다음 달 기록도 예전 값 그대로인 것은 새 값으로) */
function payChangeDialog(sid) {
  const ym = state.ym, dim = daysIn(ym), p = db.staff.find(x => x.id === sid); if (!p) return;
  const rec = payRec(db.cur, ym, p), c0 = rec.chg || {};
  modal(`단가 변경 — ${p.name} (${ymLabel(ym)})`, `
    <p class="small">지금 <b>${esc(rec.payType)} ${fmt(rec.rate)}원</b> → 변경일부터 새 값 (그 달은 나눠 계산)</p>
    <div class="form-grid">
      <label>변경일 (이 날부터)<input id="pcDay" type="date" min="${ym}-02" max="${ym}-${pad2(dim)}" value="${c0.day ? `${ym}-${pad2(c0.day)}` : ''}"></label>
      <label>새 지급형태<select id="pcType">${['일급', '월급'].map(x => `<option ${x === (c0.payType || (rec.payType === '일급' ? '월급' : rec.payType === '월급' ? '월급' : '일급')) ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
      <label>새 단가 (일급이면 하루, 월급이면 한 달)<input id="pcRate" class="num" value="${fmt0(c0.rate)}"></label></div>
    <p class="muted small">일급 = 기간 출근일 × 일급 · 월급 = 월급 × 기간 일수 / ${dim}일 · 1일부터 바뀌면 표에서 바로 고치세요.</p>`, [
    { label: '취소' },
    ...(rec.chg ? [{ label: '변경 삭제', cls: 'danger', onClick: () => {
      if (p.pay && p.pay.payType === rec.chg.payType && toNum(p.pay.rate) === toNum(rec.chg.rate)) { p.pay.payType = rec.payType; p.pay.rate = rec.rate; }
      delete rec.chg; save(); render(); toast('단가 변경을 삭제했습니다.'); } }] : []),
    { label: '저장', cls: 'primary', onClick: root => {
      const day = toNum(String($('#pcDay', root).value).slice(8, 10)), type = $('#pcType', root).value, rate = toNum($('#pcRate', root).value);
      if (String($('#pcDay', root).value).slice(0, 7) !== ym || day < 2) { toast(`변경일은 ${ymLabel(ym)} 2일~말일 중에서 고르세요.`); return true; }
      if (!rate) { toast('새 단가를 넣으세요.'); return true; }
      const when = payApplyChange(p, `${ym}-${pad2(day)}`, type, rate);
      save(); render(); toast(`${p.name}: ${when} ${type} ${fmt(rate)}원으로 바꿨습니다.`);
    } }], 's');
}
const payClaimable = r =>r.rec.payType !== '제외' && r.rec.payType !== '정직원(손익만)';
function payGroups(rows) {
  const g = {};
  rows.filter(payClaimable).forEach(r => {
    const k = (r.rec.company || '') + '|' + (r.s.team || '');
    const x = g[k] = g[k] || { company: r.rec.company || '', team: r.s.team || '', names: [], ys: 0, sh: 0, gross: 0 };
    if (r.c.net) x.names.push(r.s.name);
    x[r.rec.payer === '시행사' ? 'sh' : 'ys'] += r.c.net; x.gross += r.c.gross;
  });
  return Object.values(g);
}
function viewPay() {
  const ym = state.ym;
  const all = payRows(db.cur, ym, true);
  const rows = all.filter(r => r.rec.payType !== '제외' && r.s.kind !== '정직원');
  const regular = all.filter(r => r.s.kind === '정직원');
  const excluded = all.filter(r => r.rec.payType === '제외' && r.s.kind !== '정직원');
  const claim = rows.filter(payClaimable);
  const inp = (r, f, v, w, ph) => `<input class="num" style="width:${w || 80}px" value="${v === null || v === undefined ? '' : fmt0(v)}" ${ph !== undefined ? `placeholder="${esc(ph)}"` : ''} data-ch="pay" data-id="${r.s.id}" data-f="${f}" data-fid="p${f}${r.s.id}">`;
  const sel = (r, f, opts) => `<select data-ch="pay" data-id="${r.s.id}" data-f="${f}" data-fid="p${f}${r.s.id}">${opts.map(([v, l]) => `<option value="${esc(v)}" ${String(r.rec[f]) === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  const forced = rows.some(r => toNum(r.rec.otRate) || r.c.otHours || toNum(r.rec.incentive)), more = state.payMore || forced;
  const M = html => more ? html : '';
  let lastTeam = null;
  const body = rows.map(r => {
    const { s, rec, c } = r; const monthly = rec.payType !== '일급';
    const showTeam = s.team !== lastTeam; lastTeam = s.team;
    return `<tr>
        <td class="lbl pay-c1" title="${esc(s.team || '')}">${showTeam ? esc(s.team || '') : ''}</td><td class="lbl pay-c2"><b>${esc(s.name)}</b></td>
        <td><input style="width:92px" value="${esc(rec.company)}" data-ch="pay" data-id="${s.id}" data-f="company" data-fid="pcompany${s.id}"></td>
        <td>${sel(r, 'payType', PAY_TYPES.map(x => [x, x]))}</td>
        <td style="white-space:nowrap">${inp(r, 'rate', rec.rate, 84)}
          ${c.split ? `<div class="small" style="color:var(--accent);white-space:nowrap">→ ${monthNo(ym)}/${c.split.day}부터 ${c.split.b.type} ${fmt(c.split.b.rate)} <button class="lnk" data-act="payChange" data-id="${s.id}">고치기</button></div>` : ''}</td>
        ${c.split ? `<td colspan="2" class="small muted" style="white-space:nowrap" title="변경 있는 달은 출근부 날짜로 나눠 계산">${c.split.a.type === '일급' ? `${c.split.a.days}일` : `${c.split.a.days}/${daysIn(ym)}`} + ${c.split.b.type === '일급' ? `${c.split.b.days}일` : `${c.split.b.days}/${daysIn(ym)}`}</td>`
        : `<td>${inp(r, 'workDays', rec.workDays, 44, String(c.workDays))}</td>
        <td>${monthly ? inp(r, 'prorate', rec.prorate, 44, String(daysIn(ym))) : ''}</td>`}
        ${M(`<td>${inp(r, 'otRate', rec.otRate, 64)}</td><td>${inp(r, 'otHours', rec.otHours, 44, c.otHours ? String(+c.otHours.toFixed(2)) : '')}</td>`)}
        <td class="num">${fmt(c.pay)}</td>
        <td>${inp(r, 'mealRate', rec.mealRate, 60)}</td><td>${inp(r, 'mealDays', rec.mealDays, 44, c.mealDays ? String(c.mealDays) : '')}</td>
        <td class="num">${fmt0(c.meal)}</td>
        ${M(`<td>${inp(r, 'incentive', rec.incentive, 76)}</td>`)}
        <td class="num"><b>${fmt(c.gross)}</b></td>
        <td>${sel(r, 'taxType', Object.entries(TAX_TYPES))}</td>
        <td class="num">${fmt0(c.tax)}</td><td class="num">${fmt0(c.local)}</td>
        <td class="num pay-net"><b>${fmt(c.net)}</b></td>
        <td>${sel(r, 'payer', [['유성', '유성'], ['시행사', '시행사']])}</td>
        ${M(`<td>${sel(r, 'plGroup', PL_GROUPS.map(x => [x, x]))}</td>`)}
        <td><input style="width:150px" value="${esc(rec.note || '')}" placeholder="${esc(payNoteAuto(ym, s))}" title="비우면 회색 글자(단가 변경·출근부의 사진대체·체크누락)가 들어갑니다" data-ch="pay" data-id="${s.id}" data-f="note" data-fid="pnote${s.id}"></td></tr>`;
  }).join('');
  const groups = payGroups(rows);
  const T = k => sum(claim, r => r.c[k]);
  return `
    ${pageHead(`${ymLabel(ym)} 인건비 ${pmBadge('pay', ym)}`, `${ym}-01 ~ ${ym}-${daysIn(ym)} · ${(() => { const d = payFundDay(ymAdd(ym, 1), db.settings); return `${mdw(d)} 자금집행${d.getDate() !== db.settings.payrollDay ? ` (${db.settings.payrollDay}일이 휴일 → 전 영업일)` : ''}`; })()}`,
    BTN('printPay', `${payLocked() ? '🔒 ' : ''}자금청구서·지출결의서 인쇄`, payLocked() ? 'title="관리자 모드에서만"' : '', payLocked() ? 'lockbtn' : 'primary') + BTN('exportPay', `${payLocked() ? '🔒 ' : ''}엑셀로 저장`, payLocked() ? 'title="관리자 모드에서만"' : '', payLocked() ? 'lockbtn' : '')
    + MENU('식대', [MI('payMealRate', '식대 단가 적용', '', '출근부에 적은 구분별 식대 단가를 이 달 인원에게'), MI('payMealFill', '식대일수 채우기', '', '식대일수가 빈 사람 = 근무일수')]) + BTN('goto', '출근부 입력 →', 'data-tab="meal"'))}
    ${!isAdmin() ? `<div class="banner warn small">🔒 경리 모드 — 비공개 급여 인원 ${db.staff.filter(x => x.siteId === db.cur && x.active !== false && isSecretStaff(x)).length}명(유성 정직원${secOpt().teams ? '·' + esc(secOpt().teams) : ''})은 표·합계에서 빠져 있습니다.${payLocked() ? ' 인건비 자금청구서·세부내역 인쇄와 엑셀 저장은 관리자 모드에서 하세요.' : ''}</div>` : ''}
    <div class="banner info small">회색 = 출근부 자동 (입력하면 우선) · 식대: 지급 + / 캐터링 공제 − · 월급 중도 입·퇴사는 일할일수에 재직일수</div>
    <div class="stats">
      <div class="stat"><div class="k">총급여 (세전)</div><div class="v">${fmt(T('gross'))}</div></div>
      <div class="stat"><div class="k">원천세·부가세</div><div class="v">${fmt(T('tax') + T('local'))}</div></div>
      <div class="stat"><div class="k">실지급액 합계</div><div class="v">${fmt(T('net'))}</div></div>
      <div class="stat"><div class="k">유성 / 시행사</div><div class="v">${fmt(sum(groups, g => g.ys))} / ${fmt(sum(groups, g => g.sh))}</div></div>
    </div>
    <div class="tbl-wrap"><table class="t tight pay-tbl"><thead><tr><th class="pay-c1">구분</th><th class="pay-c2">성명</th><th>업체명</th><th>지급형태</th><th>급여단가</th><th>근무<br>일수</th><th>일할<br>일수</th>${M('<th>연장<br>시급</th><th>연장<br>시간</th>')}<th>급여계</th><th>식대<br>단가(±)</th><th>식대<br>일수</th><th>식대계</th>${M('<th>인센티브</th>')}<th>총급여액</th><th>세금구분</th><th>원천세/<br>부가세</th><th>주민세</th><th class="pay-net">실지급액</th><th>부담</th>${M('<th>손익 구분</th>')}<th>특이사항</th></tr></thead>
    <tbody>${body || `<tr><td colspan="22" class="center muted" style="padding:30px">이 달 출근 기록이 있는 현장 인원이 없습니다. 출근부를 먼저 입력하세요.</td></tr>`}
    <tr class="sum"><td colspan="${more ? 9 : 7}">합계 (청구 대상)</td><td class="num">${fmt(T('pay'))}</td><td></td><td></td><td class="num">${fmt0(T('meal'))}</td>${M(`<td class="num">${fmt0(sum(claim, r => r.rec.incentive))}</td>`)}<td class="num">${fmt(T('gross'))}</td><td></td><td class="num">${fmt(T('tax'))}</td><td class="num">${fmt(T('local'))}</td><td class="num pay-net">${fmt(T('net'))}</td><td colspan="${more ? 3 : 2}"></td></tr></tbody></table></div>
    <label class="small muted"><input type="checkbox" data-ch="payMore" ${more ? 'checked' : ''} ${forced ? 'disabled title="입력된 값이 있어 항상 표시됩니다"' : ''}> 연장·인센티브·손익 구분 칸 보기</label>
    ${regular.length ? (() => { const md = mealData(ym); return `<h3>유성 정직원 — 본사 지급 <span class="muted small">(현장 인건비 청구에서 제외 · 출근부·식대만 반영)</span></h3>
    <div class="tbl-wrap" style="max-width:900px"><table class="t"><thead><tr><th>구분</th><th>성명</th><th>출근일수</th><th>법카·전도금 식사횟수</th><th>식대 (1인분 합계)</th><th title="현장 손익의 '유성 정직원' 항목에만 쓰입니다">월 급여 (손익 반영용)</th></tr></thead><tbody>
    ${regular.map(r => `<tr><td>${esc(r.s.team || '')}</td><td><b>${esc(r.s.name)}</b></td><td class="num">${r.c.workDays}</td><td class="num">${sum(Object.values(md.cnt[r.s.name] || {}))}</td><td class="num">${fmt(sum(Object.values(md.per[r.s.name] || {})))}</td><td>${inp(r, 'rate', r.rec.rate, 110)}</td></tr>`).join('')}
    </tbody></table></div>`; })() : ''}
    ${excluded.length ? `<p class="small muted">인건비 제외: ${excluded.map(r => `<button class="chip" data-act="payInclude" data-id="${r.s.id}">${esc(r.s.name)} ↩</button>`).join(' ')} (눌러서 다시 포함)</p>` : ''}
    <h3>인건비 집계표</h3>
    <div class="tbl-wrap" style="max-width:900px"><table class="t"><thead><tr><th>업체명</th><th>구분</th><th>유성</th><th>시행사</th><th>실지급액 계</th></tr></thead><tbody>
    ${groups.map(g => `<tr><td>${esc(g.company)}</td><td>${esc(g.team)}${g.names.length ? ` (${esc(g.names.length > 3 ? g.names[0] + ' 외 ' + (g.names.length - 1) + '명' : g.names.join(','))})` : ''}</td><td class="num">${fmt0(g.ys)}</td><td class="num">${fmt0(g.sh)}</td><td class="num"><b>${fmt(g.ys + g.sh)}</b></td></tr>`).join('')}
    <tr class="sum"><td colspan="2">합계</td><td class="num">${fmt(sum(groups, g => g.ys))}</td><td class="num">${fmt(sum(groups, g => g.sh))}</td><td class="num">${fmt(sum(groups, g => g.ys + g.sh))}</td></tr></tbody></table></div>
    ${payDocsPanel(ym, claim)}`;
}
// 업체·직원 서류 체크 (경영지원: 인건비 업체 세금계산서·거래명세서, 상담사 이력서·서류)
/* 직원 서류 — 직종별 필요 서류 (현장_계약 양식 통일_2026.04.30: 업무플로우_정리.md 2-4)
 * 직종 = 구분(팀) 이름으로: 기획(계약직 기획) · 경리 · 상담사·TM · 알바·도우미 · 조직(본부장·영업팀)
 * 저장 키 p.docs[k] — 예전 키(resume·idcard·bank·pledge) 그대로, 이력서는 선택 서류(빠진 서류로 세지 않음) */
const DOC_JOBS = { plan: '기획', acc: '경리', tm: '상담사·TM', alba: '알바·도우미', org: '조직' };
const docJob = p => { const t = String(p.team || ''); return /조직|본부|영업팀/.test(t) ? 'org' : /경리/.test(t) ? 'acc' : /상담|TM|텔레/i.test(t) ? 'tm' : /알바|아르바이트|도우미|홍보|미화|경호|인포|큐레이터/.test(t) ? 'alba' : 'plan'; };
const STAFF_DOCS = [
  ['contract', '업무위탁계약서', j => j !== 'org'],
  ['pledge', '근무이행각서', j => j === 'tm' || j === 'org', j => (j === 'org' ? '조직용' : '일반용')],
  ['privacy', '보안서약서', () => true],
  ['consent', '수집·이용 동의서', () => true],
  ['edu', '교육이수 확인', j => j === 'plan' || j === 'tm' || j === 'org'],
  ['destroy', '파기확인서', j => j === 'org'],
  ['resident', '등본(3개월)', j => j !== 'org'],
  ['idcard', '신분증', j => j !== 'org'],
  ['bank', '통장', j => j !== 'org'],
  ['resume', '이력서(선택)', () => false]];
const staffDocNeed = p => { const j = docJob(p); return STAFF_DOCS.filter(([, , need]) => need(j)).map(([k]) => k); };
const staffDocMiss = p => staffDocNeed(p).filter(k => !(p.docs || {})[k]);
const payDocsOf = ym => { const m = nest(db.payroll, db.cur, ym); m.__docs = m.__docs || {}; return m.__docs; };
const needCoDocs = c => c && !/사업소득|개인|프리/.test(c);
function payDocsPanel(ym, claim) {
  const docs = payDocsOf(ym), cos = [...new Set(claim.map(r => r.rec.company).filter(needCoDocs))];
  const people = claim.map(r => r.s);
  const miss = cos.filter(c => !(docs[c] || {}).tax || !(docs[c] || {}).stmt).length + people.filter(p => staffDocMiss(p).length).length;
  const ck = (on, attrs) => `<input type="checkbox" ${on ? 'checked' : ''} ${attrs}>`;
  const docCell = (p, [k, , need, sub]) => { const j = docJob(p), on = need(j) || k === 'resume';
    return on ? `<td class="center" ${need(j) && !(p.docs || {})[k] ? 'style="background:var(--warn-soft)"' : ''} title="${esc(sub ? sub(j) : '')}">${ck((p.docs || {})[k], `data-ch="staffDoc" data-id="${p.id}" data-k="${k}"`)}</td>` : '<td class="center muted">-</td>'; };
  return `<details class="panel" style="margin-top:12px" ${miss ? '' : ''}><summary style="cursor:pointer"><b>업체·직원 서류 체크</b> <span class="small ${miss ? '' : 'muted'}" ${miss ? 'style="color:var(--warn)"' : ''}>${miss ? `빠진 서류 있음 ${miss}곳/명` : '모두 받음 ✓'}</span> <span class="muted small">— 인건비 업체 세금계산서·거래명세서, 직원 이력서·서류</span></summary>
      <div style="margin-top:8px;max-width:520px"><table class="t"><thead><tr><th>업체 (${monthNo(ym)}월분)</th><th>세금계산서</th><th>거래명세서</th></tr></thead><tbody>
        ${cos.map(c => `<tr><td>${esc(c)}</td>${['tax', 'stmt'].map(k => `<td class="center">${ck((docs[c] || {})[k], `data-ch="payDoc" data-co="${esc(c)}" data-k="${k}"`)}</td>`).join('')}</tr>`).join('') || '<tr><td colspan="3" class="muted small">업체로 지급하는 인원이 없습니다 (사업소득자 제외)</td></tr>'}</tbody></table></div>
      <div class="tbl-wrap" style="margin-top:10px"><table class="t"><thead><tr><th>구분</th><th>성명</th><th>직종</th>${STAFF_DOCS.map(([, l]) => `<th class="small">${l}</th>`).join('')}<th>빠진 서류</th></tr></thead><tbody>
        ${people.map(p => { const m = staffDocMiss(p).length; return `<tr><td class="small">${esc(p.team || '')}</td><td>${esc(p.name)}</td><td class="small">${DOC_JOBS[docJob(p)]}</td>${STAFF_DOCS.map(x => docCell(p, x)).join('')}<td class="center ${m ? '' : 'muted'}" ${m ? 'style="color:var(--warn);font-weight:700"' : ''}>${m || '✓'}</td></tr>`; }).join('')}</tbody></table></div>
      <p class="muted small">직종은 구분(팀) 이름으로 정합니다 (조직·본부 → 조직 / 경리 / 상담·TM / 알바·도우미·홍보·미화·경호 / 그 밖 → 기획). <b>-</b> = 그 직종은 필요 없는 서류 · 근무이행각서: 상담사·TM 일반용, 조직 조직용 · 이력서는 선택<br>직원 서류 체크는 다음 달에도 유지 · 주민번호·계좌는 저장하지 않음</p></details>`;
}
/* 인건비 세부내역 — 회사 양식 ("영종 현장 영업팀 인건비 세부내역(5월)", A4 가로): 구분(팀)별 묶음 + 소계, 맨 아래 합계, ①~⑭ 칸
 * 달 중간 단가 변경(c.split)은 두 줄: 윗줄 = 변경 전 단가·일수·급여계, 아랫줄 = 변경 후. 식대~실지급액은 두 줄을 합친 칸에 한 번 */
function docPayDetail(ym) {
  const s = site(), dim = daysIn(ym), rows = payRows(db.cur, ym, true).filter(payClaimable);
  const D = dashN, Q = v => fmtQty(v) || '-';   // D = 금액 · Q = 일수·시간 (0.5일·1.5시간을 반올림하지 않음)
  const teams = []; rows.forEach(r => { const k = r.s.team || ''; let t = teams.find(x => x.k === k); if (!t) teams.push(t = { k, list: [] }); t.list.push(r); });
  const T = (list, f) => sum(list, f);
  const sumRow = (cls, label, cs, list) => `<tr class="${cls}"><td colspan="${cs}" class="c">${label}</td><td></td><td class="c">${Q(T(list, r => r.c.workDays))}</td><td class="n">-</td><td class="n">${Q(T(list, r => r.c.otHours))}</td><td class="n">${D(T(list, r => r.c.pay))}</td><td></td><td class="c">-</td><td class="n">${D(T(list, r => r.c.meal))}</td><td class="n">${D(T(list, r => r.rec.incentive))}</td>
      <td class="n pd-l">${D(T(list, r => r.c.gross))}</td><td class="n pd-l">${D(T(list, r => r.c.tax))}</td><td class="n">${D(T(list, r => r.c.local))}</td><td class="n">${D(T(list, r => r.c.tax + r.c.local))}</td><td class="n pd-l">${D(T(list, r => r.c.net))}</td></tr>`;
  let body = '';
  teams.forEach(t => {
    const span = sum(t.list, r => (r.c.split ? 2 : 1)) + 1;   // 사람 줄 + 소계
    t.list.forEach((r, i) => {
      const { s: p, rec, c } = r, red = rec.taxType === 'vat' ? '' : ' red';   // 원천세(빼는 세금)는 빨간 글씨
      const parts = c.split ? [c.split.a, c.split.b] : [{ type: rec.payType === '일급' ? '일급' : '월급', rate: toNum(rec.rate), days: c.workDays, base: c.base }];
      const rs = parts.length > 1 ? ' rowspan="2"' : '';
      parts.forEach((x, j) => {
        const days = c.split && x.type === '월급' ? `${x.days}/${dim}` : Q(x.days);   // 나눈 달의 월급 부분은 일할 일수
        body += `<tr>${i === 0 && j === 0 ? `<td class="pd-team" rowspan="${span}">${[...(t.k || ' ')].map(esc).join('<br>')}</td>` : ''}${j === 0 ? `<td class="pd-no"${rs}>${i + 1}</td><td class="c"${rs}>${esc(p.name)}</td>` : ''}
          <td class="n">${D(x.rate)}</td><td class="c">${days}</td>${j === 0 ? `<td class="n"${rs}>${D(rec.otRate)}</td><td class="n"${rs}>${Q(c.otHours)}</td>` : ''}<td class="n">${D(x.base + (j === 0 ? c.ot : 0))}</td>
          ${j === 0 ? `<td class="n${toNum(rec.mealRate) < 0 ? ' red' : ''}"${rs}>${D(rec.mealRate)}</td><td class="c"${rs}>${Q(c.mealDays)}</td><td class="n"${rs}>${D(c.meal)}</td><td class="n"${rs}>${D(rec.incentive)}</td>
          <td class="n pd-l"${rs}>${D(c.gross)}</td><td class="n pd-l${red}"${rs}>${D(c.tax)}</td><td class="n${red}"${rs}>${D(c.local)}</td><td class="n${red}"${rs}>${D(c.tax + c.local)}</td><td class="n pd-l"${rs}>${D(c.net)}</td>` : ''}</tr>`;
      });
    });
    body += sumRow('pd-sub', '소계', 2, t.list);
  });
  const H = (t, attr = '') => `<th${attr}>${t}</th>`;
  return `<div class="doc pd"><div class="pd-title">${esc(s.name)}현장 영업팀 인건비 세부내역(${monthNo(ym)}월)</div>
    <table class="pd-tbl"><colgroup>${[3, 2.4, 5.4, 7, 4.4, 5, 5, 8.6, 5.4, 4.4, 6.4, 6.4, 8.4, 7.4, 6, 6.4, 8].map(w => `<col style="width:${w}%">`).join('')}</colgroup>
      <thead><tr>${H('구분', ' colspan="2" rowspan="2"')}${H('성명', ' rowspan="2"')}${H('급여', ' colspan="2"')}${H('연장수당', ' colspan="2"')}${H('⑤급여계<br>((①×②)+(③×④))', ' rowspan="2"')}${H('⑥<br>식대<br>적용액', ' rowspan="2"')}${H('⑦<br>식대<br>일수', ' rowspan="2"')}${H('⑧<br>식대계<br>(⑥×⑦)', ' rowspan="2"')}${H('⑨<br>인센티브', ' rowspan="2"')}${H('⑩<br>총급여액<br>(⑤+⑧+⑨)', ' rowspan="2" class="pd-l"')}${H('부가세(10%)/원천세(3.3%)', ' colspan="3" class="pd-l"')}${H('⑭<br>실지급액<br>(⑩+⑬)<br>(⑩-⑬)', ' rowspan="2" class="pd-l"')}</tr>
      <tr>${H('①<br>급여단가')}${H('②<br>근무<br>일수')}${H('③<br>연장<br>시급')}${H('④<br>연장<br>시간')}${H('⑪<br>부가세(10%)<br>원천세(3%)', ' class="pd-l"')}${H('⑫<br>주민세<br>(⑪×10%)')}${H('⑬<br>합계<br>(⑪+⑫)')}</tr></thead>
      <tbody>${body || '<tr><td colspan="17" class="c">-</td></tr>'}${sumRow('pd-tot', '합계', 3, rows)}</tbody></table></div>`;
}
/* 인건비 엑셀: 자금청구서 · 지출결의서 · 세부내역 (인쇄 양식 그대로) + 출근부(구분별 소계·주말 빨간 글씨) · 집계표 · 지급 정보(본사 제출용) */
async function exportPay() {
  const ym = state.ym, s = site(), { no, date } = docInfo('pay');
  const rows = payRows(db.cur, ym, true).filter(r => r.rec.payType !== '제외');
  // 주민등록번호·주소·은행·계좌는 프로그램에 저장하지 않음 → 빈 칸으로 내보내 엑셀에서 직접 입력 (본사 요청 양식)
  const a1 = [];
  rows.forEach(({ s: p, rec, c }) => {
    if (c.split) {   // 달 중간 단가 변경: 두 줄 (윗줄 = 변경 전 + 합계 칸들, 아랫줄 = 변경 후 단가·일수·급여계만)
      const { a, b } = c.split, dd = x => (x.type === '일급' ? x.days : ''), pr = x => (x.type === '일급' ? '' : x.days);
      a1.push([p.team || '', p.name, rec.company, a.type, a.rate, dd(a), pr(a), toNum(rec.otRate), toNum(rec.otHours), a.base + c.ot, toNum(rec.mealRate), toNum(rec.mealDays), c.meal, toNum(rec.incentive), c.gross, TAX_TYPES[rec.taxType] || '', c.tax, c.local, payClaimable({ rec }) ? c.net : '', rec.payer, rec.plGroup, rec.note || payNoteAuto(ym, p), '', '', '', '']);
      a1.push([p.team || '', p.name, rec.company, b.type, b.rate, dd(b), pr(b), '', '', b.base]);
      return;
    }
    a1.push([p.team || '', p.name, rec.company, rec.payType, toNum(rec.rate), c.workDays, rec.payType === '일급' ? '' : c.prorate, toNum(rec.otRate), toNum(rec.otHours), c.pay, toNum(rec.mealRate), toNum(rec.mealDays), c.meal, toNum(rec.incentive), c.gross, TAX_TYPES[rec.taxType] || '', c.tax, c.local, payClaimable({ rec }) ? c.net : '', rec.payer, rec.plGroup, rec.note || payNoteAuto(ym, p), '', '', '', '']);
  });
  const cl = rows.filter(payClaimable);
  a1.push(['합계', '', '', '', '', '', '', '', '', sum(cl, r => r.c.pay), '', '', sum(cl, r => r.c.meal), '', sum(cl, r => r.c.gross), '', sum(cl, r => r.c.tax), sum(cl, r => r.c.local), sum(cl, r => r.c.net), '', '', '', '', '', '', '']);
  // 월별 집계표 (현장 시작월부터)
  const months = []; for (let x = s.startYm && s.startYm <= ym ? s.startYm : ym; x <= ym; x = ymAdd(x, 1)) months.push(x);
  if (months.length > 18) months.splice(0, months.length - 18);
  const keys = {}; months.forEach(x => payGroups(payRows(db.cur, x, false)).forEach(g => { keys[g.company + '|' + g.team] = g; }));
  const a2 = Object.values(keys).map(k => {
    const row = [{ t: k.company, c: 'c' }, k.team];
    months.forEach(x => { const g = payGroups(payRows(db.cur, x, false)).find(y => y.company === k.company && y.team === k.team) || { ys: 0, sh: 0 }; row.push(g.ys || '-', g.sh || '-', g.ys + g.sh || '-'); });
    return row;
  });
  const tot = [{ t: '합계', cs: 2, c: 'c' }]; months.forEach(x => { const gs = payGroups(payRows(db.cur, x, false)); tot.push(sum(gs, g => g.ys), sum(gs, g => g.sh), sum(gs, g => g.ys + g.sh)); }); a2.push(tot);
  // 출근부: 회사 양식처럼 구분(팀)별로 묶고 소계, 맨 아래 합계 · 요일 줄 · 주말 빨간 글씨
  const att = attOf(ym), days = Array.from({ length: daysIn(ym) }, (_, i) => i + 1), wk = d => weekday(ym, d), hol = d => (wk(d) === 0 || wk(d) === 6 ? 'c red' : 'c');
  const teams = []; rows.forEach(r => { const k = r.s.team || ''; let t = teams.find(x => x.k === k); if (!t) teams.push(t = { k, list: [] }); t.list.push(r); });
  const dayCnt = (list, d) => sum(list, r => attValue((att[r.s.id] || {})[d]));
  const a3 = teams.flatMap(t => [...t.list.map((r, i) => [i === 0 ? { t: t.k, rs: t.list.length + 1, c: 'c' } : null, { t: i + 1, c: 'c' }, { t: r.s.name, c: 'c' }, ...days.map(d => ({ t: String((att[r.s.id] || {})[d] ?? ''), c: hol(d) })), attCount(att[r.s.id])].filter(x => x !== null)),
    [{ t: '소계', cs: 2, c: 'c' }, ...days.map(d => ({ t: dayCnt(t.list, d) || '', c: 'c' })), sum(t.list, r => attCount(att[r.s.id]))]]);
  a3.push([{ t: '합계', cs: 3, c: 'c' }, ...days.map(d => ({ t: dayCnt(rows, d) || '', c: 'c' })), sum(rows, r => attCount(att[r.s.id]))]);
  const PH = ['구분', '성명', '업체명', '지급형태', '급여단가', '근무일수', '일할일수', '연장시급', '연장시간', '급여계', '식대단가', '식대일수', '식대계', '인센티브', '총급여액', '세금구분', '원천세/부가세', '주민세', '실지급액', '부담', '손익구분', '특이사항', '주민등록번호', '주소', '은행', '계좌번호'];
  await saveXl([['자금청구서', docPayClaim(ym, no, date)], ['지출결의서', payExpDoc(ym, date)], ['세부내역', docPayDetail(ym)],
    ['출근부', xtHtml({ title: `${s.name}현장 출근부 (${monthNo(ym)}월)`, land: true, widths: [40, 24, 56, ...days.map(() => 24), 34], head: [[{ t: '구분', cs: 2, rs: 2 }, { t: '성명', rs: 2 }, ...days.map(d => ({ t: d, c: hol(d) })), { t: '계', rs: 2 }], days.map(d => ({ t: WEEK[wk(d)], c: hol(d) }))], rows: a3 })],
    ['집계표', xtHtml({ title: `${s.name}현장 인건비 집계표`, land: months.length > 3, widths: [90, 120, ...months.flatMap(() => [84, 80, 88])], head: [[{ t: '업체명', rs: 2 }, { t: '구분', rs: 2 }, ...months.map(x => ({ t: `${monthNo(x)}월`, cs: 3 }))], months.flatMap(() => ['유성', '시행사', '실지급액 계'])], rows: a2 })],
    ['지급 정보(본사 제출용)', xtHtml({ title: `${s.name}현장 ${monthNo(ym)}월 인건비 지급 정보`, sub: '※ 주민등록번호·주소·계좌는 프로그램에 저장하지 않습니다. 이 시트에 직접 입력하거나 따로 받은 자료와 합쳐 보내세요.', land: true,
      widths: [60, 56, 84, 52, 76, 44, 44, 52, 44, 80, 56, 44, 66, 66, 84, 84, 76, 56, 84, 44, 90, 160, 110, 200, 60, 120], head: [PH], rows: a1 })]], fname('인건비'));
}
