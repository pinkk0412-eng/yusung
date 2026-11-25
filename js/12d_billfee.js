'use strict';
/* ---------- 분양대행수수료 청구 (차수형) — 매출 청구 [+ 수수료 청구 (차수형)] ----------
 * 청구 건 b (12b, k = 현장 손익 수익 항목) + b.fee = {
 *   round, from, to(청구 기간), sold(판매세대 · 비우면 현장 손익 판매 세대수 누계), recv(수신), cc(참조),
 *   lines: [{ item(항목명), basis(청구 기준), base(기본 수수료), pct(비율 %), rateIn(세대당 직접 입력 · '' = 기본 × 비율), rate(세대당 · 계산값), retain(유보 적용),
 *             n·amt·ret(이번 차수 세대·공급가·유보금), keys(이번 차수에 청구한 동호수) }],
 *   raw: { 청구 기준: 붙여넣은 계약내역 글 }, adj: [{ key(항목|기준), n, amt, ret, from, to, why }] = 수동 보정 (사유 필수) }
 * 계산 = 00 feeCalc — 전회(기간·세대·금액)·누계는 다른 차수에 저장된 값 + 수동 보정으로만 정해지고 화면에서 고칠 수 없음
 * 저장하면 amount(금회 공급가)·vat·retain 이 채워져 매출 청구 목록 · 현장 손익 수익(청구월)으로
 * 현장 설정(10): site.retainRate(기본 유보율) · site.feeDoc = { recv, cc, title(공문 제목 앞부분), clause(계약 근거), account(입금계좌), attach(첨부서류) } */
const feeOthers = (exceptId, sid = db.cur) => billAll(sid).filter(x => x.b.fee && x.b.id !== exceptId).map(x => ({ ...x.b.fee, id: x.b.id, k: x.b.k, retainRate: x.b.retainRate })).sort((a, z) => toNum(a.round) - toNum(z.round));
const feeDocOf = () => site().feeDoc || {};
const feeSoldAuto = to => sum(Object.entries(db.pl[db.cur] || {}).filter(([ym]) => ym <= String(to || '9999-99').slice(0, 7)), ([, m]) => toNum((m || {}).units));   // 현장 손익 판매 세대수 누계 (기간 끝 달까지)
const feeMd = d => (d ? `${String(d).slice(2).replace(/-/g, '.')}` : '');   // 26.11.01
const feeRng = p => (p && p.from ? `${feeMd(p.from)}~${feeMd(p.to)}` : '');
const FEE_ATTACH = '분양대행수수료 총괄표 1부, 청구내역 1부, 계약내역 1부, 세금계산서 1부';
// xtHtml 표 하나에서 바깥 틀만 벗김 (총괄표 한 장에 표 두 개)
const feeX = spec => xtHtml(spec).replace(/^<div class="doc xt[^"]*">/, '').replace(/<\/div>\s*$/, '');

/* ===== 출력: 청구공문 · 총괄표(대비표 + 유보금) · 청구내역 · 계약내역 ===== */
function feeTitle(F) { const s = site(), d = feeDocOf(); return `${d.title || `${s.fullName || s.name} 공동주택`} 분양대행수수료 청구에 관한 건(${F.round}차)`; }
function feeLetter(F, c) {
  const s = site(), d = feeDocOf(), co = s.company || '㈜유성';
  const P = (t, cls = '') => `<div class="bfl-p ${cls}">${t}</div>`;
  const att = String(d.attach || FEE_ATTACH).split(/[,\n]/).map(x => x.trim()).filter(Boolean);
  return `<div class="doc bfl">
    <div class="bfl-top"><img src="lib/yusung_logo.jpg" alt=""><div class="bfl-co">${esc(co)}</div></div>
    <table class="bfl-h"><colgroup><col style="width:16%"><col></colgroup>
      <tr><td>문서번호</td><td>: ${esc(F.docNo || '')}</td></tr>
      <tr><td>시행일자</td><td>: ${ymd(F.docDate || todayStr())}</td></tr>
      <tr><td>수 신</td><td>: ${esc(F.recv || '')}</td></tr>
      <tr><td>참 조</td><td>: ${esc(F.cc || '')}</td></tr>
      <tr class="bfl-t"><td>제 목</td><td>: ${esc(feeTitle(F))}</td></tr></table>
    <div class="bfl-body">
      ${P('1. 귀사의 무궁한 발전을 기원합니다.')}
      ${P(`2. ${esc(d.clause || '분양대행 용역계약서 제○조(용역대금의 지급)')}에 의거하여 ${esc(s.fullName || s.name)} 분양대행수수료(${F.round}차)를 아래와 같이 청구하오니 확인 후 지급하여 주시기 바랍니다.`)}
      ${P('- 아 래 -', 'bfl-c')}
      ${P(`가. 청구 기간 : ${orgDot(F.from)} ~ ${orgDot(F.to)}`, 'bfl-in')}
      ${P(`나. 청구 금액 : 금 ${numKor(c.cur.amt)}원정 (₩${fmt(c.cur.amt)}, VAT 별도)`, 'bfl-in')}
      ${P(`&nbsp;&nbsp;&nbsp;- 부가세 ${fmt(c.cur.vat)}원 포함 ${fmt(c.cur.total)}원${c.cur.ret ? ` · 유보금 ${fmt(c.cur.ret)}원(${fmtQty(c.rr)}%) 제외 입금액 ${fmt(c.cur.expect)}원` : ''}`, 'bfl-in')}
      ${P(`다. 입금 계좌 : ${esc(d.account || '')}`, 'bfl-in')}
      ${P(`라. 첨부서류`, 'bfl-in')}
      ${att.map((a, i) => P(`&nbsp;&nbsp;&nbsp;${i + 1}. ${esc(a)}${i === att.length - 1 ? '. 끝.' : ''}`, 'bfl-in')).join('')}
    </div>
    <div class="bfl-sign">${esc(co)} 대표이사</div></div>`;
}
function feeCmp(F, c) {
  const S = site().fullName || site().name, P = `전회 (${feeRng(c.pp) || '-'})`, C = `금회 (${feeRng(F)})`;
  const memo = l => [(F.adj || []).filter(a => a.key === l.key).map(a => `보정: ${a.why}`).join(' / '), l.hold.length ? `보류 ${l.hold.length}세대` : ''].filter(Boolean).join(' · ');
  const H = () => [{ t: P, cs: 2 }, { t: C, cs: 2 }, { t: '누계', cs: 2 }];
  const z = v => (toNum(v) ? toNum(v) : { t: '-', c: 'c' });   // 0 → '-'
  const head = [[{ t: '구분', rs: 2 }, { t: '청구 기준', rs: 2 }, { t: '세대당 수수료', rs: 2 }, ...H(), { t: '비고', rs: 2 }], ['세대', '금액', '세대', '금액', '세대', '금액']];
  const rows = c.lines.map(l => [l.item, l.basis, z(l.rate), z(l.prev.n), z(l.prev.amt), z(l.cur.n), z(l.cur.amt), z(l.cum.n), z(l.cum.amt), { t: memo(l), c: 'l' }]);
  const tr = (label, f) => [{ t: label, cs: 3, c: 'c b' }, '', z(f(c.prev)), '', z(f(c.cur)), '', z(f(c.cum)), ''];
  rows.push(tr('청구금액 (VAT 별도)', t => t.amt), tr('부가세', t => t.vat), tr('총계', t => t.total));
  const W = [130, 150, 96, 50, 110, 50, 110, 50, 120, 150];
  let html = feeX({ title: `${S} 분양대행수수료 총괄표(${F.round}차)`, sub: '(단위: 원, VAT 별도)', widths: W, head, rows });
  const rl = c.lines.filter(l => l.retain || l.cum.ret);
  if (rl.length || c.cum.ret) {
    const r2 = rl.map(l => [l.item, l.basis, z(feeRet(l.rate, c.rr)), z(l.prev.n), z(l.prev.ret), z(l.cur.n), z(l.cur.ret), z(l.cum.n), z(l.cum.ret), '']);
    r2.push([{ t: '유보금 합계', cs: 3, c: 'c b' }, '', z(c.prev.ret), '', z(c.cur.ret), '', z(c.cum.ret), ''], [{ t: '입금 예정액 (총계 − 유보금)', cs: 3, c: 'c b' }, '', z(c.prev.expect), '', z(c.cur.expect), '', z(c.cum.expect), '']);
    html += `<div style="height:16px"></div>${feeX({ title: `유보금 (유보율 ${fmtQty(c.rr)}%, 부가세 포함 금액 기준)`, sub: '유보 적용 항목만 · 세대당 유보금 = 세대당 수수료 × 1.1 × 유보율', widths: W,
      head: [[{ t: '구분', rs: 2 }, { t: '청구 기준', rs: 2 }, { t: '세대당 유보금', rs: 2 }, ...H(), { t: '비고', rs: 2 }], ['세대', '금액', '세대', '금액', '세대', '금액']], rows: r2 })}`;
  }
  return `<div class="doc xt xt-land bfx">${html}</div>`;
}
function feeUnitsDoc(F, c) {   // 청구내역: 총세대수 · 판매세대 · 금회 · 기 청구 · 누적 (청구 기준별)
  const s = site(), total = toNum(s.totalUnits), sold = String(F.sold ?? '').trim() !== '' ? toNum(F.sold) : feeSoldAuto(F.to);
  return xtHtml({ title: `${s.fullName || s.name} 분양대행수수료 청구내역(${F.round}차)`, sub: `청구 기간 ${orgDot(F.from)} ~ ${orgDot(F.to)}`, widths: [170, 90, 90, 100, 100, 100],
    head: [['청구 기준', '총세대수', '판매세대', '금회 청구세대', '기 청구세대', '누적 청구세대']],
    rows: c.bases.map(b => [b.basis, total, sold, b.cur, b.prev, b.prev + b.cur]) });
}
function feeContractDoc(F, c) {   // 계약내역 별첨: 이번 차수 청구 세대 (뺀 세대는 번호 없이 비고)
  const rows = [];
  c.bases.forEach(b => {
    const ls = c.lines.filter(l => l.basis === b.basis); if (!b.units.length) return;
    const l0 = ls[0], payKeys = new Set(ls.flatMap(l => l.keys));
    rows.push([{ t: b.basis, cs: 8, c: 'b' }]);
    let i = 0;
    b.units.forEach(u => {
      const k = unitKey(u.dong), dup = ls.map(l => l.paid.get(k)).find(Boolean);
      const memo = u.status === '해지' ? '해지 — 제외' : dup ? `제외 — ${dup.src} 청구됨` : u.status === '보류' ? '보류' : u.memo || '';
      rows.push([payKeys.has(k) ? ++i : '', u.dong || '', u.type || '', orgDot(u.date), u.buyer || '', orgDot(u.done || u.paid2), { t: memo, c: 'l' }, payKeys.has(k) ? l0.rate : '']);
    });
    rows.push([{ t: `소계 ${i}세대`, cs: 7, c: 'c' }, i * l0.rate]);
  });
  return xtHtml({ title: `계약내역(${F.round}차)`, sub: '이번 차수 청구 대상 세대 · 세대당 금액은 그 기준의 첫 항목', widths: [44, 90, 60, 90, 80, 90, 170, 100],
    head: [['번호', '동호수', '타입', '계약일', '계약자', '완납일', '비고', '세대당 금액']], rows: rows.length ? rows : [['', '', '', '', '', '', '붙여넣은 세대 없음', '']] });
}
const feeFile = F => `${pad2(monthNo(F.ym || todayStr().slice(0, 7)))}월 ${site().name}현장 분양대행수수료 청구(${F.round}차).xlsx`;
const feeSheets = (F, c) => [['청구공문', feeLetter(F, c)], ['총괄표', feeCmp(F, c)], ['청구내역', feeUnitsDoc(F, c)], ['계약내역', feeContractDoc(F, c)]];

/* ===== 작성 창 ===== */
function billFeeDialog(x, next) {
  const s = site(), d = feeDocOf(), edit = x && !next, others = feeOthers(edit ? x.b.id : '');
  const last = edit ? null : others.slice(-1)[0];   // 새 차수 = 마지막 차수 다음 (항목 줄·수신·유보율을 이어받음)
  const src = edit ? x.b.fee : last, kinds = billKinds();
  const per = edit ? { from: src.from, to: src.to } : rndNextPeriod(last);
  const F = {
    id: edit ? x.b.id : '', k: edit ? x.b.k : (last && last.k) || 'fee', ym: edit ? x.ym : todayStr().slice(0, 7),
    round: edit ? src.round : last ? toNum(last.round) + 1 : 1, from: per.from, to: per.to,
    sold: edit ? src.sold ?? '' : '', retainRate: edit ? x.b.retainRate ?? '' : last ? last.retainRate ?? '' : s.retainRate ?? '',
    docNo: edit ? x.b.docNo || '' : '', docDate: edit ? x.b.docDate || '' : todayStr(),
    recv: edit ? src.recv ?? d.recv ?? '' : (last && last.recv) || d.recv || '', cc: edit ? src.cc ?? d.cc ?? '' : (last && last.cc) || d.cc || '',
    lines: (src && src.lines && src.lines.length ? src.lines : [{ item: '분양대행수수료', basis: '계약금 완납 시', base: '', pct: 100, retain: toNum(s.retainRate) > 0 }])
      .map(l => ({ item: l.item || '', basis: l.basis || '', base: l.base ?? '', pct: l.pct ?? '', rate: l.rateIn ?? '', retain: !!l.retain })),
    raw: edit ? { ...(src.raw || {}) } : {}, adj: edit ? (src.adj || []).map(a => ({ ...a })) : [],
  };
  const later = edit ? others.filter(o => toNum(o.round) > toNum(F.round)).length : 0;
  const kindOpts = kinds.map(([k, l]) => `<option value="${esc(k)}" ${k === F.k ? 'selected' : ''}>${esc(l)}</option>`).join('');
  const r = modal(`분양대행수수료 청구 (차수형)${edit ? ` — ${F.round}차` : ''}`, `
    <div class="form-grid">
      <label>손익 항목<select id="bfK">${kindOpts}</select></label>
      <label title="이 달 현장 손익 수익으로 들어감">청구월<input id="bfYm" type="month" value="${F.ym}"></label>
      <label>차수<input id="bfR" class="num" value="${esc(F.round)}"></label>
      <label>청구 기간 시작일<input id="bfFrom" type="date" value="${F.from}" title="지난 차수 다음 날부터 자동"></label>
      <label>청구 기간 종료일<input id="bfTo" type="date" value="${F.to}"></label>
      <label title="비우면 현장 손익의 판매 세대수 누계 (기간 끝 달까지)">판매세대<input id="bfSold" class="num" value="${esc(F.sold)}"></label>
      <label title="부가세 포함 금액 기준 · 기본값은 설정 › 현장 정보">유보율 %<input id="bfRr" class="num" value="${esc(F.retainRate)}" placeholder="0"></label>
      <label>공문번호<input id="bfNo" value="${esc(F.docNo)}"></label>
      <label>공문일<input id="bfDd" type="date" value="${esc(F.docDate)}"></label>
      <label>수신<input id="bfRecv" value="${esc(F.recv)}" placeholder="예) ○○신탁 주식회사"></label>
      <label>참조<input id="bfCc" value="${esc(F.cc)}" placeholder="예) ○○ 담당자"></label>
    </div>
    <h4 style="margin:12px 0 4px">수수료 항목 <span class="muted small">— 세대당 수수료를 비우면 기본 수수료 × 비율 · 유보 = 유보금을 떼는 항목</span></h4>
    <div class="tbl-wrap"><table class="t tight bf-tbl"><thead><tr><th>항목명</th><th>청구 기준</th><th>기본 수수료</th><th>비율 %</th><th>세대당 수수료</th><th>유보</th><th></th></tr></thead><tbody id="bfLines"></tbody></table></div>
    <button class="btn sm" data-bf="line+" style="margin-top:4px">+ 줄</button>
    <h4 style="margin:12px 0 4px">이번 차수 대상 세대 <span class="muted small">— 계약관리 엑셀에서 머리글 줄까지 복사해 붙여넣기 (동호수·타입·계약일·계약자·완납일·상태·비고) · 같은 항목·기준으로 다른 차수에 청구한 동호수는 뺍니다</span></h4>
    <div class="row small" style="margin-bottom:4px">청구 기준 <select id="bfBasis"></select> <span id="bfCnt" class="muted"></span></div>
    <textarea id="bfPaste" rows="5" style="width:100%" placeholder="동호수	타입	계약일	계약자	완납일&#10;101-1203	84A	2026.06.03	○○○	2026.11.10"></textarea>
    <details style="margin-top:8px" ${F.adj.length ? 'open' : ''}><summary class="small" style="cursor:pointer"><b>수동 보정</b> <span class="muted">— 프로그램 사용 전 차수(이월)나 지난 기록이 틀렸을 때만 · 사유 필수 · 전회·누계에 더해지고 총괄표 비고에 사유가 찍힘</span></summary>
      <div class="tbl-wrap" style="margin-top:6px"><table class="t tight bf-tbl"><thead><tr><th>항목 | 기준</th><th>세대</th><th>금액 (공급가)</th><th>유보금</th><th>기간 시작</th><th>기간 끝</th><th>사유</th><th></th></tr></thead><tbody id="bfAdj"></tbody></table></div>
      <button class="btn sm" data-bf="adj+" style="margin-top:4px">+ 보정</button></details>
    <div id="bfInfo" class="banner info small" style="margin-top:8px"></div>
    <div style="overflow:auto;max-height:360px;margin-top:8px;border:1px solid var(--line);padding:6px;background:#fff" id="bfPrev"></div>`, [
    ...(edit ? [{ label: '삭제', cls: 'danger', onClick: () => { if (!confirm(`${F.round}차 수수료 청구를 삭제할까요?${later ? `\n뒤 차수 ${later}건의 전회·누계가 바뀝니다.` : ''}`)) return true; const l = billList(db.cur, x.ym); l.splice(l.indexOf(x.b), 1); save(); render(); } }] : []),
    { label: '취소' },
    { label: '엑셀로 저장', onClick: () => { rd(); saveXl(feeSheets(F, calc()), feeFile(F)); return true; } },
    { label: '인쇄', onClick: () => { rd(); printDocs(feeSheets(F, calc()).map(z => z[1])); return true; } },
    { label: edit ? '저장' : '추가', cls: 'primary', onClick: () => store() }]);
  modalSize(r, 'xl');
  const $r = id => $('#' + id, r), val = id => $r(id).value.trim();
  let curBasis = '';
  const bases = () => [...new Set(F.lines.map(l => l.basis).filter(Boolean))];
  const lineRow = (l, i) => `<tr data-i="${i}"><td><input data-f="item" value="${esc(l.item)}" placeholder="분양대행수수료1"></td><td><input data-f="basis" value="${esc(l.basis)}" placeholder="계약금 완납 시"></td>
      <td><input class="num" data-f="base" value="${l.base === '' ? '' : fmt(l.base)}"></td><td><input class="num" data-f="pct" value="${esc(l.pct)}" style="width:56px"></td>
      <td><input class="num" data-f="rate" value="${String(l.rate ?? '').trim() === '' ? '' : fmt(l.rate)}" placeholder="${fmt0(feeRate({ ...l, rate: '' }))}"></td>
      <td class="center"><input type="checkbox" data-f="retain" ${l.retain ? 'checked' : ''}></td><td><button class="btn ghost sm" data-bf="line-" data-i="${i}" title="이 줄 빼기">✕</button></td></tr>`;
  const adjRow = (a, i) => `<tr data-i="${i}"><td><select data-f="key">${F.lines.map(l => feeKey(l)).filter(k => k !== '|').map(k => `<option value="${esc(k)}" ${k === a.key ? 'selected' : ''}>${esc(k.replace('|', ' | '))}</option>`).join('')}</select></td>
      <td><input class="num" data-f="n" value="${esc(a.n ?? '')}" style="width:56px"></td><td><input class="num" data-f="amt" value="${a.amt ? fmt(a.amt) : ''}"></td><td><input class="num" data-f="ret" value="${String(a.ret ?? '').trim() === '' ? '' : fmt(a.ret)}" placeholder="자동"></td>
      <td><input type="date" data-f="from" value="${esc(a.from || '')}"></td><td><input type="date" data-f="to" value="${esc(a.to || '')}"></td><td><input data-f="why" value="${esc(a.why || '')}" placeholder="예) 1~5차 프로그램 사용 전 이월" style="min-width:180px"></td>
      <td><button class="btn ghost sm" data-bf="adj-" data-i="${i}">✕</button></td></tr>`;
  const drawLines = () => { $r('bfLines').innerHTML = F.lines.map(lineRow).join(''); $r('bfAdj').innerHTML = F.adj.map(adjRow).join(''); drawBasis(); };
  const drawBasis = () => {
    const bs = bases(); if (!bs.includes(curBasis)) curBasis = bs.find(b => String(F.raw[b] || '').trim()) || bs[0] || '';
    $r('bfBasis').innerHTML = bs.map(b => `<option ${b === curBasis ? 'selected' : ''}>${esc(b)}</option>`).join('');
    $r('bfPaste').value = F.raw[curBasis] || ''; $r('bfPaste').disabled = !curBasis;
  };
  const cell = (tr, f) => { const el = tr.querySelector(`[data-f="${f}"]`); return el.type === 'checkbox' ? el.checked : el.value.trim(); };
  const numOr = v => (v === '' ? '' : toNum(v));
  function rd() {
    Object.assign(F, { k: val('bfK'), ym: val('bfYm') || F.ym, round: toNum(val('bfR')), from: val('bfFrom'), to: val('bfTo') || val('bfFrom'), sold: val('bfSold') === '' ? '' : toNum(val('bfSold')),
      retainRate: val('bfRr'), docNo: val('bfNo'), docDate: val('bfDd'), recv: val('bfRecv'), cc: val('bfCc') });
    F.lines = [...$r('bfLines').rows].map(tr => ({ item: cell(tr, 'item'), basis: cell(tr, 'basis'), base: numOr(cell(tr, 'base')), pct: numOr(cell(tr, 'pct')), rate: numOr(cell(tr, 'rate')), retain: cell(tr, 'retain') }));
    F.adj = [...$r('bfAdj').rows].map(tr => ({ key: cell(tr, 'key'), n: toNum(cell(tr, 'n')), amt: toNum(cell(tr, 'amt')), ret: numOr(cell(tr, 'ret')), from: cell(tr, 'from'), to: cell(tr, 'to'), why: cell(tr, 'why') }));
    if (curBasis) F.raw[curBasis] = $r('bfPaste').value;
  }
  const calc = () => feeCalc(F, feeOthers(F.id));
  const info = () => {
    const c = calc(), warn = [];
    c.lines.forEach(l => { if (l.dup.length) warn.push(`⚠ ${esc(l.item)} · ${esc(l.basis)}: 이미 청구된 세대 ${l.dup.length}개는 뺍니다 — ${l.dup.slice(0, 6).map(u => `${esc(u.dong)}(${l.paid.get(unitKey(u.dong)).src})`).join(', ')}${l.dup.length > 6 ? ' …' : ''}`); });
    if (others.some(o => toNum(o.round) === F.round)) warn.push(`⚠ ${F.round}차 청구가 이미 있습니다.`);
    if (F.adj.some(a => !a.why)) warn.push('⚠ 수동 보정에 사유를 넣으세요 (사유가 없으면 저장되지 않음).');
    if (later) warn.push(`뒤 차수 ${later}건이 있습니다 — 고치면 그 차수들의 전회·누계도 바뀝니다.`);
    const b = c.bases.find(z => z.basis === curBasis);
    $r('bfCnt').textContent = b ? `붙여넣은 ${b.units.length}세대 → 금회 ${b.cur}세대` : '';
    $r('bfInfo').innerHTML = `${orgDot(F.from)}~${orgDot(F.to)} · 전회 ${feeRng(c.pp) || '없음'} · 금회 공급가 <b>${fmt(c.cur.amt)}원</b> + 부가세 ${fmt(c.cur.vat)} = ${fmt(c.cur.total)}원${c.cur.ret ? ` · 유보금 ${fmt(c.cur.ret)} → <b>입금 예정 ${fmt(c.cur.expect)}원</b>` : ''} · 누계 공급가 ${fmt(c.cum.amt)}원`
      + warn.map(w => `<div ${/⚠/.test(w) ? 'style="color:var(--bad)"' : ''}>${w}</div>`).join('');
    $r('bfPrev').innerHTML = feeCmp(F, c);
  };
  const box = r.querySelector('.modal');   // #modalRoot 는 창마다 다시 쓰므로 이벤트는 이 창 안쪽에
  box.addEventListener('input', () => { rd(); info(); });
  box.addEventListener('change', ev => { rd(); if (ev.target.dataset.f === 'basis' || ev.target.dataset.f === 'item') { drawBasis(); $r('bfAdj').innerHTML = F.adj.map(adjRow).join(''); } info(); });
  $r('bfBasis').addEventListener('change', ev => { ev.stopPropagation(); rd(); curBasis = ev.target.value; $r('bfPaste').value = F.raw[curBasis] || ''; info(); });
  box.addEventListener('click', ev => {
    const bt = ev.target.closest('[data-bf]'); if (!bt) return;
    rd(); const i = +bt.dataset.i, a = bt.dataset.bf;
    if (a === 'line+') F.lines.push({ item: (F.lines[F.lines.length - 1] || {}).item || '', basis: '', base: '', pct: 100, rate: '', retain: toNum(F.retainRate) > 0 });
    if (a === 'line-') F.lines.splice(i, 1);
    if (a === 'adj+') F.adj.push({ key: feeKey(F.lines[0] || {}), n: '', amt: '', ret: '', from: '', to: '', why: '' });
    if (a === 'adj-') F.adj.splice(i, 1);
    drawLines(); info();
  });
  function store() {
    rd();
    if (!F.round) { toast('차수를 넣으세요.'); return true; }
    if (F.adj.some(a => !a.why)) { toast('수동 보정에는 사유를 넣으세요.'); return true; }
    const c = calc(), b = edit ? x.b : { id: uid() };
    const used = new Set(c.lines.map(l => l.basis)), raw = {}; Object.entries(F.raw).forEach(([k, t]) => { if (used.has(k) && String(t).trim()) raw[k] = t; });
    Object.assign(b, { k: F.k, round: F.round, period: `${orgDot(F.from)}~${orgDot(F.to)}`, amount: c.cur.amt, vat: c.cur.vat, retainRate: F.retainRate, retain: c.cur.ret, docNo: F.docNo, docDate: F.docDate,
      fee: { round: F.round, from: F.from, to: F.to, sold: F.sold, recv: F.recv, cc: F.cc, raw, adj: F.adj,
        lines: c.lines.map(l => ({ item: l.item, basis: l.basis, base: l.base, pct: l.pct, rateIn: l.rateIn, rate: l.rate, retain: !!l.retain, n: l.cur.n, amt: l.cur.amt, ret: l.cur.ret, keys: l.keys })) } });
    ['taxDate', 'dueDate', 'paidDate', 'paidAmount', 'memo'].forEach(f => { if (b[f] === undefined) b[f] = ''; });
    if (edit && F.ym !== x.ym) { const l = billList(db.cur, x.ym); l.splice(l.indexOf(x.b), 1); }
    if (!edit || F.ym !== x.ym) billList(db.cur, F.ym).push(b);
    save(); render(); toast(`분양대행수수료 ${F.round}차 청구를 ${edit ? '저장' : '추가'}했습니다.`);
  }
  drawLines(); info();
}
