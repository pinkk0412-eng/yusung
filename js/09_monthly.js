/* 유성 현장 관리 프로그램 — 월결제 탭
 * (원래 app.js 의 화면 부분. 모든 js/*.js 는 같은 전역 공간을 공유하며 html 에 적힌 순서대로 읽힘) */
'use strict';


/* ================= 월결제 ================= */
function monthOf(sid, ym) { const m = nest(db.monthly, sid, ym); m.rows = m.rows || {}; return m; }
// 사용기간: 이 달에 안 적었으면 전월 기간을 한 달 뒤로 ('26.08.01~'26.08.31 → '26.09.01~'26.09.30 · 말일은 말일로)
const mPeriodShift = s => String(s || '').replace(/(20\d{2}|\d{2})([.\-\/])(\d{1,2})\2(\d{1,2})/g, (all, y, sep, mo, d) => {
  const Y = y.length === 2 ? 2000 + +y : +y, last = +d === new Date(Y, +mo, 0).getDate(), n = new Date(Y, +mo, 1), dim = new Date(n.getFullYear(), n.getMonth() + 1, 0).getDate();
  const ny = n.getFullYear(), D = last ? dim : Math.min(+d, dim);
  return `${y.length === 2 ? String(ny).slice(2) : ny}${sep}${pad2(n.getMonth() + 1)}${sep}${pad2(D)}`;
});
function mPeriod(sid, ym, vid, depth = 0) {
  const r = ((db.monthly[sid] || {})[ym] || {}).rows || {}, own = (r[vid] || {}).period;
  if (own || depth > 24) return own || '';
  const p = mPeriod(sid, ymAdd(ym, -1), vid, depth + 1);
  return p ? mPeriodShift(p) : '';
}
function monthlyTotals(sid, ym) {
  const m = db.monthly[sid] && db.monthly[sid][ym];
  if (!m) return { ys: 0, sh: 0, total: 0, closed: false };
  const rows = Object.values(m.rows || {});
  const ys = sum(rows, r => r.ys), sh = sum(rows, r => r.sh);
  return { ys, sh, total: ys + sh, closed: !!m.closed };
}
function vendorsFor(ym) {
  const m = (db.monthly[db.cur] || {})[ym] || { rows: {} };
  return db.vendors.filter(v => v.siteId === db.cur && (v.active !== false || (m.rows && m.rows[v.id] && (toNum(m.rows[v.id].ys) || toNum(m.rows[v.id].sh)))))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}
const MCK = [['tax', '세금계산서'], ['stmt', '거래명세서'], ['use', '사용내역'], ['pic', '사진']];
function mckNeed(v, k) {   // 거래처별 필요 서류 (한 번 고르면 다음 달부터 그대로)
  const d = (v.ckDef || {})[k]; if (d) return d === 'need';
  const t = `${v.subject || ''} ${v.name || ''} ${v.desc || ''}`;
  if (k === 'tax') return v.vat !== false;
  if (k === 'stmt') return /생수|리레코|사무용품|소모품|유류|주유|캐터링|미화|용달/.test(t);
  if (k === 'use') return /복합기|오션|코파스|근태|CRM|문자|캐터링|생수|에스원|세콤|인터넷|전화/.test(t);
  if (k === 'pic') return /집기|렌탈|에어컨|컨테이너|차량|렌터카|정수기|복합기|임차/.test(t) && !/임차료/.test(v.subject || '');
  return false;
}
// 전월과 금액이 같아도 증빙은 모두 받음 (예전 "전월과 같으면 세금계산서만" 옵션은 없앰)
const mckVal = (v, r, k) => ((r || {}).ck || {})[k] || (mckNeed(v, k) ? 'miss' : 'na');
const mTot = r => toNum((r || {}).ys) + toNum((r || {}).sh);
// 증빙 체크 비고 (대수·인원 · 전월 대비 변동 사유 등 한 칸). 예전 qty·diffReason 은 합쳐서 보여 줌 (고치면 ckNote 로)
const mNote = r => { r = r || {}; return r.ckNote !== undefined ? r.ckNote : [r.qty, r.diffReason].filter(Boolean).join(' / '); };
function monthlyCheck(ym) {
  const m = monthOf(db.cur, ym), prev = (db.monthly[db.cur] || {})[ymAdd(ym, -1)] || { rows: {} };
  const vs = vendorsFor(ym).filter(v => mTot(m.rows[v.id]));
  if (!vs.length) return '';
  const opt = (val, cur, l) => `<option value="${val}" ${cur === val ? 'selected' : ''}>${l}</option>`;
  const rows = vs.map(v => {
    const r = m.rows[v.id] || {}, tot = mTot(r), ptot = mTot(prev.rows[v.id]), diff = ptot && tot !== ptot, nf = (r.files || []).length;
    return `<tr><td><b>${esc(v.name || '(이름 없음)')}</b> <span class="muted small">${esc(v.desc || v.subject || '')}</span></td>
        ${MCK.map(([k]) => { const val = mckVal(v, r, k); return `<td class="center"><select class="ck-${val}" data-ch="mck" data-id="${v.id}" data-k="${k}">${opt('ok', val, '✓ 받음')}${opt('miss', val, '✕ 누락')}${opt('na', val, '− 해당없음')}</select></td>`; }).join('')}
        <td><input type="date" value="${esc(r.endDate || '')}" data-ch="mrow" data-id="${v.id}" data-f="endDate" title="반납·해지(예정)일"></td>
        <td><input class="${(diff || mckNeed(v, 'use')) && !mNote(r) ? 'needbox' : ''}" value="${esc(mNote(r))}" data-ch="mrow" data-id="${v.id}" data-f="ckNote" data-fid="mq${v.id}" placeholder="${[mckNeed(v, 'use') ? '대수·인원 (예: 복합기 2대 / 80명)' : '', diff ? `전월 ${fmt(ptot)} → ${fmt(tot)} 변동 사유` : ''].filter(Boolean).join(' · ') || (ptot ? '변동 없음 · 메모' : '메모')}" title="${diff ? `전월 ${fmt(ptot)} → 이번 달 ${fmt(tot)} — 변동 사유를 적으세요` : ''}" style="width:300px"></td>
        <td style="white-space:nowrap"><button class="btn ghost sm" data-act="mckFile" data-id="${v.id}" title="세금계산서·거래명세서·사용내역·사진 파일 (서류철/증빙/월결제)">+ 파일</button>${nf ? `<button class="btn sm" data-act="mckView" data-id="${v.id}">📎 ${nf}</button>` : ''}</td></tr>`;
  }).join('');
  const miss = vs.filter(v => MCK.some(([k]) => mckVal(v, m.rows[v.id], k) === 'miss')).length;
  return `<div class="panel" style="margin-top:12px"><div class="row"><h3 class="grow" style="margin:0">증빙 체크 <span class="muted small">— 경영지원 월 경비 확인 (세금계산서·거래명세서·사용내역·사진 · 반납일 · 비고: 대수/인원·변동 사유)</span></h3>
      ${miss ? `<span class="badge warn">누락 있는 거래처 ${miss}곳</span>` : '<span class="badge ok">누락 없음</span>'}<button class="btn sm" data-act="mckText">경비 점검 메모 만들기</button></div>
      <div class="tbl-wrap" style="margin-top:8px"><table class="t"><thead><tr><th>거래처</th>${MCK.map(([, l]) => `<th>${l}</th>`).join('')}<th>반납·해지일</th><th>비고 <span class="muted small">(대수·인원 · 변동 사유)</span></th><th>파일</th></tr></thead><tbody>${rows}</tbody></table></div>
      <p class="muted small">필요 없는 서류는 "해당없음" — 다음 달에도 기억합니다.</p></div>`;
}
function monthlyCheckText(ym) {
  const m = monthOf(db.cur, ym), prev = (db.monthly[db.cur] || {})[ymAdd(ym, -1)] || { rows: {} };
  const vs = vendorsFor(ym).filter(v => mTot(m.rows[v.id])), lines = [];
  MCK.forEach(([k, l]) => { const miss = vs.filter(v => mckVal(v, m.rows[v.id], k) === 'miss'); if (miss.length) lines.push(`${l} 누락 : ${miss.map(v => v.name).join(', ')}`); });
  const df = vs.filter(v => { const p0 = mTot(prev.rows[v.id]); return p0 && p0 !== mTot(m.rows[v.id]); });
  if (df.length) lines.push(`전월 대비 금액 변동 : ${df.map(v => `${v.name} ${fmt(mTot(prev.rows[v.id]))}→${fmt(mTot(m.rows[v.id]))}${mNote(m.rows[v.id]) ? ` (${mNote(m.rows[v.id])})` : ' (사유 미기재)'}`).join(', ')}`);
  const q = vs.filter(v => !df.includes(v) && mNote(m.rows[v.id])); if (q.length) lines.push(`비고 : ${q.map(v => `${v.name} ${mNote(m.rows[v.id])}`).join(', ')}`);
  const nq = vs.filter(v => mckNeed(v, 'use') && !mNote(m.rows[v.id])); if (nq.length) lines.push(`대수·인원 미기재 : ${nq.map(v => v.name).join(', ')}`);
  const e = vs.filter(v => (m.rows[v.id] || {}).endDate); if (e.length) lines.push(`반납·해지(예정) : ${e.map(v => `${v.name} ${m.rows[v.id].endDate}`).join(', ')}`);
  return `<${monthNo(ym)}월 경비 증빙 점검> ${site().name}\n` + (lines.length ? lines.map((l, i) => `${i + 1}. ${l}`).join('\n') : '누락 없음');
}
/* 캐터링 → 월결제: 지난달 캐터링(캐터링 탭 08 viewCater, 업체별 08 caterByVendor)을 이번 달 거래처에 업체 이름으로 맞춰 넣음
   체크 없이 이름만으로 맞춤 · 이름 없는 캐터링 = 현장 기본 업체 이름 → 그래도 없으면 이름·과목·내역에 "캐터링"이 든 거래처 · 이름이 있는데 맞는 거래처가 없으면 missing (월결제 화면에 [거래처로 추가]) */
// 거래처의 캐터링 기간 = 사용기간 칸(직접 적은 값 또는 전월에서 넘어온 값)을 읽을 수 있으면 그 기간, 아니면 지난달 1일~말일
function caterRangeOf(ym, v) {
  const p = ymAdd(ym, -1);
  return caterPeriodParse(mPeriod(db.cur, ym, v.id)) || { from: `${p}-01`, to: `${p}-${String(daysIn(p)).padStart(2, '0')}`, def: true };
}
function caterPlan(ym) {
  const p = ymAdd(ym, -1), all = vendorsFor(ym), rows = [], missing = [];
  const match = nm => nm ? all.find(x => caterKey(x.name) === caterKey(nm)) || all.find(x => caterSame(x.name, nm))
    : all.find(x => /캐터링|케이터링/.test(`${x.name || ''} ${x.subject || ''} ${x.desc || ''}`));   // 이름 없는 예전 자료 = 캐터링 거래처
  const rng = new Map(all.map(v => [v.id, caterRangeOf(ym, v)])), done = new Set();
  [...rng.values()].forEach(R => {
    const key = R.from + R.to; if (done.has(key)) return; done.add(key);
    caterByRange(db.cur, R.from, R.to).forEach(g => {
      const nm = g.name || site().caterVendor || '';   // 업체 이름이 비었으면 현장 기본 캐터링 업체
      const v = match(nm);
      if (!v) { if (R.def && !missing.some(x => caterKey(x.name) === caterKey(nm))) missing.push({ ...g, name: nm }); return; }
      const vr = rng.get(v.id); if (vr.from + vr.to !== key) return;   // 이 거래처는 다른 기간으로 계산
      const o = rows.find(x => x.v === v); if (o) o.amt += g.amt; else rows.push({ v, amt: g.amt });
    });
  });
  return { p, rows, missing };
}
// 자동 반영 (화면 열 때마다): 캐터링 거래처 금액 = 사용기간의 캐터링 금액 · 금액 칸을 손으로 고친 경우(caterManual)만 그대로 (사용기간을 고치면 다시 자동)
function caterAutoApply(ym) {
  const m = monthOf(db.cur, ym); if (m.closed) return 0;
  const P = caterPlan(ym), p = P.p, per = `'${p.slice(2, 4)}.${p.slice(5, 7)}.01~'${p.slice(2, 4)}.${p.slice(5, 7)}.${daysIn(p)}`; let n = 0;
  P.rows.forEach(({ v, amt }) => {
    const r = m.rows[v.id] = m.rows[v.id] || {};
    if (r.caterManual) return;
    if (toNum(r.ys) === amt && r.caterAuto) return;
    r.ys = amt; r.caterAuto = true; if (!mPeriod(db.cur, ym, v.id)) r.period = per; if (!v.catering) v.catering = true; n++;
  });
  Object.entries(m.rows).forEach(([id, r]) => { if (r.caterAuto && !P.rows.some(x => x.v.id === id)) { delete r.ys; delete r.caterAuto; n++; } });   // 캐터링 금액이 없어진 업체 (자동으로 넣었던 칸만 비움)
  return n;
}
/* 업체별 월 지출: 거래처 × 달 (12개월) 한 표. 칸에 바로 입력 (유성 부담 금액 · 시행사 금액이 있는 칸은 월별 입력에서) */
const monthlyViewBtns = cur => `<div class="subtabs">${[['month', '월별 입력'], ['year', '업체별 월 지출']].map(([k, l]) => `<button class="${k === cur ? 'active' : ''}" data-act="monthlyView" data-v="${k}">${l}</button>`).join('')}</div>`;   // 보기 전환은 다른 탭과 같은 모양(검은 알약)으로 머리 아래에
function viewMonthlyYear() {
  const end = state.monthlyYEnd || state.ym, months = Array.from({ length: 12 }, (_, k) => ymAdd(end, k - 11));
  const M = db.monthly[db.cur] || {}, row = (v, ym) => ((M[ym] || {}).rows || {})[v.id] || {};
  const vs = db.vendors.filter(v => v.siteId === db.cur && (v.active !== false || months.some(ym => mTot(row(v, ym))))).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  let lastSubj = null;
  const body = vs.map(v => {
    const tots = months.map(ym => mTot(row(v, ym))), has = tots.filter(Boolean);
    const showSubj = v.subject !== lastSubj; lastSubj = v.subject;
    const cells = months.map((ym, k) => {
      const r = row(v, ym), tot = tots[k], prevT = k ? tots[k - 1] : mTot(row(v, ymAdd(ym, -1))), closed = (M[ym] || {}).closed;
      const cls = tot && prevT && tot !== prevT ? ' my-chg' : '', tip = tot && prevT && tot !== prevT ? `전월 ${fmt(prevT)} → ${fmt(tot)}` : '';
      if (toNum(r.sh)) return `<td class="num${cls}" title="유성 ${fmt(r.ys)} + 시행사 ${fmt(r.sh)} — [월별 입력]에서 고치세요">${fmt(tot)}</td>`;
      return `<td class="${cls.trim()}" title="${tip}"><input class="num" value="${fmt0(r.ys)}" data-ch="mrow" data-ym="${ym}" data-id="${v.id}" data-f="ys" data-fid="my${v.id}_${ym}" ${closed ? 'disabled title="마감된 달 — 월별 입력에서 마감 해제 후 수정"' : ''}></td>`;
    }).join('');
    return `<tr><td class="my-v"><span class="muted small" style="${showSubj ? '' : 'visibility:hidden'}">${esc(v.subject || '')}</span><br><b>${esc(v.name || '(이름 없음)')}</b> <span class="muted small">${esc(v.desc || '')}</span>${v.active === false ? ' <span class="badge">종료</span>' : ''}</td>
      ${cells}<td class="num"><b>${fmt0(sum(tots))}</b></td><td class="num muted">${has.length ? fmt(Math.round(sum(has) / has.length)) : ''}</td></tr>`;
  }).join('');
  const mt = months.map(ym => monthlyTotals(db.cur, ym));
  const head = months.map(ym => { const c = (M[ym] || {}).closed; return `<th class="${ym === state.ym ? 'my-cur' : ''}"><button class="lnk" data-act="monthlyView" data-v="month" data-ym="${ym}" title="이 달 월결제 열기">${ym.slice(2, 4)}.${ym.slice(5)}월</button>${c ? '<br><span class="muted small">마감</span>' : ''}</th>`; }).join('');
  return `${pageHead('업체별 월 지출', `${ymLabel(months[0])} ~ ${ymLabel(end)} · 거래처별 달마다 청구 금액 (VAT 포함, 유성+시행사)`,
      BTN('monthlyYShift', '◀ 이전 6개월', 'data-d="-6"', 'ghost') + BTN('monthlyYShift', '다음 6개월 ▶', 'data-d="6"', 'ghost'))}
    ${monthlyViewBtns('year')}
    <div class="banner info small">칸에 금액을 바로 넣으면 그 달 월결제에 저장됩니다 (유성 부담). 노란 칸 = 전월과 금액이 다름 · 달 이름을 누르면 그 달 월결제로 · 마감된 달은 고칠 수 없음</div>
    <div class="tbl-wrap" data-scroll-end><table class="t my-tbl"><thead><tr><th class="my-v">업체</th>${head}<th>합계</th><th>월평균</th></tr></thead>
    <tbody>${body || `<tr><td colspan="${months.length + 3}" class="center muted" style="padding:30px">거래처가 없습니다. [월별 입력]에서 "+ 거래처"로 등록하세요.</td></tr>`}
    <tr class="sum"><td class="my-v">합계</td>${mt.map(t => `<td class="num">${fmt0(t.total)}</td>`).join('')}<td class="num">${fmt0(sum(mt, t => t.total))}</td><td></td></tr></tbody></table></div>`;
}
function viewMonthly() {
  if (state.monthlyView === 'year') return viewMonthlyYear();
  if (caterAutoApply(state.ym)) save();   // 지난달 캐터링 금액 → 이름이 같은 거래처 (빈 칸·자동 칸만)
  const cmiss = caterPlan(state.ym).missing;
  const ym = state.ym, m = monthOf(db.cur, ym), prev = (db.monthly[db.cur] || {})[ymAdd(ym, -1)] || { rows: {} };
  const vs = vendorsFor(ym), dis = m.closed ? 'disabled' : '';
  const [y, mo] = ym.split('-').map(Number);
  const today = new Date();
  const closeDate = new Date(y, mo - 1, db.settings.monthlyClose), payDate = monthlyFundDay(ym, db.settings);   // 25일이 휴일이면 다음 영업일
  const dd = Math.ceil((closeDate - new Date(today.getFullYear(), today.getMonth(), today.getDate())) / 86400000);
  let lastSubj = null;
  const t = monthlyTotals(db.cur, ym);
  const pt = monthlyTotals(db.cur, ymAdd(ym, -1));
  const showSh = !!t.sh || !!state.monthlySh;   // 시행사 청구가 있을 때만 시행사 칸 (없으면 [+ 시행사 칸]으로 열기)
  const bgOn = !!bgMonthDoc(), bgIss = bgOn ? bgMonthlyIssues(ym) : [];   // 14c 예산 항목 연결 · 초과/예산 외 경고
  const rows = vs.map((v, i) => {
    const r = m.rows[v.id] || {}, p = prev.rows[v.id] || {};
    const tot = toNum(r.ys) + toNum(r.sh), ptot = toNum(p.ys) + toNum(p.sh);
    const diff = tot && ptot && tot !== ptot;
    const showSubj = v.subject !== lastSubj; lastSubj = v.subject;
    return `<tr>
        <td class="center muted">${i + 1}</td>
        <td><input value="${esc(v.subject)}" list="subjList" data-ch="vendor" data-id="${v.id}" data-f="subject" data-fid="vs${v.id}" ${dis} style="${showSubj ? '' : 'color:var(--muted)'}"></td>
        <td><input value="${esc(v.name)}" data-ch="vendor" data-id="${v.id}" data-f="name" data-fid="vn${v.id}" ${dis}></td>
        <td><input value="${esc(v.desc)}" data-ch="vendor" data-id="${v.id}" data-f="desc" data-fid="vd${v.id}" ${dis}></td>
        <td><input class="num" value="${fmt0(r.ys)}" data-ch="mrow" data-id="${v.id}" data-f="ys" data-fid="ry${v.id}" ${dis}></td>
        ${showSh ? `<td><input class="num" value="${fmt0(r.sh)}" data-ch="mrow" data-id="${v.id}" data-f="sh" data-fid="rs${v.id}" ${dis}></td>` : ''}
        <td class="num"><b>${fmt0(tot)}</b></td>
        <td class="num muted" style="white-space:nowrap;${diff ? 'color:var(--warn)' : ''}" ${diff ? 'title="전월과 금액이 다릅니다"' : ''}>${fmt0(ptot)}${ptot && !m.closed && tot !== ptot ? ` <button class="btn ghost sm" data-act="copyPrevOne" data-id="${v.id}" title="이 거래처만 전월 금액(${fmt(ptot)}) 불러오기">↙</button>` : ''}</td>
        <td><input value="${esc(mPeriod(db.cur, ym, v.id))}" ${r.period ? '' : 'style="color:var(--muted)" title="전월 기간에서 한 달 넘겨 자동으로 채움 (고치면 이 달 값으로 저장)"'} data-rng="text" data-rng-fmt="yy" autocomplete="off" placeholder="'26.08.01~'26.08.31" data-ch="mrow" data-id="${v.id}" data-f="period" data-fid="rp${v.id}" ${dis}></td>
        <td><input value="${esc(v.ref || '')}" data-ch="vendor" data-id="${v.id}" data-f="ref" data-fid="vr${v.id}" ${dis}></td>
        ${bgOn ? bgVendorCell(v, ym, dis) : ''}
        <td class="center"><input type="checkbox" title="부가세 포함 금액 (손익에는 ÷1.1 공급가로 반영)" ${v.vat !== false ? 'checked' : ''} data-ch="vendor" data-id="${v.id}" data-f="vat" ${dis}></td>
        <td class="center" style="white-space:nowrap">${r.caterAuto ? '<span class="badge ok" title="지난달 캐터링에서 자동 반영 (업체 이름이 같아서) · 금액을 고치면 그 값으로 고정">자동</span>' : ''}</td>
        <td class="center" style="white-space:nowrap"><button class="btn ghost sm" data-act="vendorMove" data-id="${v.id}" data-d="-1" ${dis}>▲</button><button class="btn ghost sm" data-act="vendorMove" data-id="${v.id}" data-d="1" ${dis}>▼</button>
          <button class="btn ghost sm danger" data-act="vendorOff" data-id="${v.id}" title="목록에서 빼기(종료된 거래처)" ${dis}>✕</button></td></tr>`;
  }).join('');
  return `
    <datalist id="subjList">${MONTHLY_SUBJECTS.map(s => `<option>${s}</option>`).join('')}</datalist>
    ${pageHead(`${ymLabel(ym)} 월결제 ${pmBadge('monthly', ym)}`, `마감 ${db.settings.monthlyClose}일 · 자금집행 ${mdw(payDate)}${payDate.getDate() !== db.settings.monthlyPay ? ` (${db.settings.monthlyPay}일이 휴일 → 다음 영업일)` : ''}`,
    BTN('toggleClose', m.closed ? '마감 해제' : '마감하기', '', m.closed ? '' : 'primary') + BTN('vendorAdd', '+ 거래처', dis) + BTN('copyPrevMonthly', '전월 금액 복사', dis) + (t.sh ? '' : BTN('monthlyShToggle', showSh ? '시행사 칸 숨기기' : '+ 시행사 칸', 'title="시행사 청구가 있을 때 시행사 부담 금액을 넣는 칸"', 'ghost'))
    + BTN('printMonthly', '자금청구서·지출결의서 인쇄') + BTN('exportMonthly', '엑셀로 저장', 'title="자금청구서 · 지출결의서 · 결제내역서 · 증빙 체크 시트"'))}
    ${monthlyViewBtns('month')}
    ${m.closed ? `<div class="banner ok">마감 완료 — ${mdw(payDate)} 정산 예정. 수정하려면 "마감 해제"를 누르세요.</div>`
      : `<div class="banner ${dd <= 3 ? 'warn' : 'info'}">마감까지 <b>${dd >= 0 ? `D-${dd}` : '기한 지남 · 아직 마감 안 됨'}</b> — 거래처별 청구 금액(VAT 포함)을 입력하고 마감하세요.</div>`}
    ${cmiss.length ? `<div class="banner warn">지난달 캐터링 업체 ${cmiss.map(g => `<b>${esc(g.name)}</b> ${fmt(g.amt)}원 <button class="btn sm" data-act="caterVendorAdd" data-name="${esc(g.name)}" ${dis}>거래처로 추가</button>`).join(' · ')} — 이름이 같은 월결제 거래처가 없어 반영하지 못했습니다. 거래처 이름을 캐터링 업체 이름과 같게 고치거나 추가하세요.</div>` : ''}
    <div class="stats">
      <div class="stat"><div class="k">유성 부담</div><div class="v">${fmt(t.ys)}</div></div>
      ${showSh ? `<div class="stat"><div class="k">시행사 부담</div><div class="v">${fmt(t.sh)}</div></div>` : ''}
      <div class="stat"><div class="k">합계</div><div class="v">${fmt(t.total)}</div></div>
      <div class="stat"><div class="k">전월 합계</div><div class="v">${fmt(pt.total)}</div></div>
    </div>
    ${bgIss.length ? `<div class="banner warn small">예산 확인 — <b>품의가 필요한 거래처 ${bgIss.length}곳</b>: ${bgIss.map(x => `${esc(x.v.name || '(이름 없음)')} (${esc(x.w.t)})`).join(' · ')} <button class="btn sm" data-act="goto" data-tab="budget">예산 탭</button></div>` : ''}
    <div class="tbl-wrap"><table class="t tight"><thead><tr><th>#</th><th>과목</th><th>업체명</th><th>거래내역</th><th>유성</th>${showSh ? '<th>시행사</th>' : ''}<th>합계</th><th>전월</th><th>사용기간/비고</th><th>참조문서</th>${bgOn ? '<th title="예산 항목 (품의로 지급하는 거래처는 비워 두고 참조문서에 품의 번호) · 예산 안에서 고른 업체는 구두보고 날짜">예산</th>' : ''}<th title="부가세 포함 여부 (손익 계산용)">VAT</th><th title="캐터링 연동">캐터링</th><th></th></tr></thead>
    <tbody>${rows || `<tr><td colspan="${(showSh ? 13 : 12) + (bgOn ? 1 : 0)}" class="center muted" style="padding:30px">거래처가 없습니다. "+ 거래처 추가"로 임차료·통신비·생수·캐터링 등 매월 결제처를 등록하세요.</td></tr>`}
    <tr class="sum"><td colspan="4">합계</td><td class="num">${fmt(t.ys)}</td>${showSh ? `<td class="num">${fmt(t.sh)}</td>` : ''}<td class="num">${fmt(t.total)}</td><td class="num muted">${fmt(pt.total)}</td><td colspan="${bgOn ? 6 : 5}"></td></tr></tbody></table></div>
    ${monthlyCheck(ym)}`;
}
