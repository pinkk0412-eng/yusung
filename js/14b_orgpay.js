'use strict';
/* ---------- 조직 지급 차수형 품의 ----------
 * 샘플: 영종 100. 계약축하금 지급의 건(3차) · 136. 조직 판매수수료 지급의 건(16차) — 기안품의서 + 대비표 + 판매내역(N차) + 지출결의서
 * 세대 목록은 따로 관리하지 않고 품의 작성 창에 이번 차수 판매내역을 붙여넣음 (엑셀 복사)
 * 품의: it.tpl = 'orgpay', it.org = { kind, round, ym(시작일 달), from, to(기간 시작·종료일), rate(세대당), supply(공급가), done(완납세대 누계) }
 * 지급된 세대 = 같은 종류 조직 지급 품의들의 "판매내역" 표(지급액 있는 동호수) → 중복 경고 · 대비표 전회/누계 */
const ORG_KINDS = [['판매수수료', true], ['계약축하금', true], ['인센티브', true], ['추가수수료', true], ['일비', false], ['광고비 선지급', false]];   // [종류, 세대별]
const orgPerUnit = k => (ORG_KINDS.find(x => x[0] === k) || [k, true])[1];
// 세대 붙여넣기·중복·기간 계산은 00_core 의 차수형 공통 함수(rnd*)를 씀 (12d 분양대행수수료 청구와 같이)
const orgDot = d => (d ? `${String(d).replace(/-/g, '.')}.` : '');
const orgMd = d => (d ? `${+d.slice(5, 7)}/${+d.slice(8, 10)}` : '');
const orgPms = (kind, exceptId, sid = db.cur) => pmAll(sid).filter(p => p.org && p.org.kind === kind && p.id !== exceptId);
// 품의의 판매내역 표 → [{ key(동호수), amt }] (지급액 0·'-' = 보류 줄은 뺌)
function orgSaleRows(p) {
  const tb = pmBlocks(p).find(b => b.type === 'table' && /판매내역/.test(b.title || '')); if (!tb) return [];
  const di = tb.cols.findIndex(c => /동호/.test(c)), ai = tb.cols.findIndex(c => /지급액|금액/.test(c)); if (di < 0 || ai < 0) return [];
  return (tb.rows || []).filter(r => unitKey(r[di]) && !RND_TOT.test(String(r[0] || '').trim())).map(r => ({ key: unitKey(r[di]), amt: toNum(r[ai]) })).filter(x => x.amt > 0);
}
// 동호수 → { r, amt, src } (같은 종류 다른 차수 품의들의 판매내역)
const orgPaidMap = (kind, exceptId, sid = db.cur) => rndPaidMap(orgPms(kind, exceptId, sid).map(p => ({ r: p.org.round, src: `품의 ${p.no}번`, units: orgSaleRows(p) })));
function orgNextRound(kind, sid = db.cur) {   // 같은 종류의 마지막 차수 + 1 (조직 지급 품의 · 예전 품의 제목 "(N차)")
  const k = kind.replace(/\s/g, ''); let mx = 0;
  pmAll(sid).forEach(p => {
    if (p.org) { if (p.org.kind === kind) mx = Math.max(mx, toNum(p.org.round)); return; }
    if (String(p.title || '').replace(/\s/g, '').includes(k)) { const m = String(p.title).match(/\((\d+)차\)/); if (m) mx = Math.max(mx, +m[1]); }
  });
  return mx + 1;
}
const orgLast = kind => orgPms(kind).sort((a, b) => toNum(b.org.round) - toNum(a.org.round))[0];

/* 대비표(전회·금회·누계) · 판매내역(N차) 계산 — o.units = 붙여넣은 세대 */
function orgCalc(o) {
  const per = orgPerUnit(o.kind), from = o.from, to = o.to || o.from, rate = toNum(o.rate);
  const paid = orgPaidMap(o.kind, o.id);
  const prevs = orgPms(o.kind, o.id).filter(p => toNum(p.org.round) < o.round), prevP = prevs.find(p => toNum(p.org.round) === o.round - 1);
  // 전회 = 지난 차수 모두의 누계 (회사 샘플 대비표: 전회(1/28~2/15) = 1·2차 · 금회(2/16~2/28) · 누계(1/28~2/28) = 전회 + 금회)
  // 전회 기간: 첫 차수 시작일 ~ 바로 앞 차수 종료일 → 지난 품의가 없으면 1~15일·16~말일이면 바로 앞 반달, 아니면 비움
  const d0 = +String(from).slice(8, 10), ym0 = String(from).slice(0, 7), first = prevs.map(p => p.org.from).filter(Boolean).sort()[0];
  const pp = prevP && prevP.org.to ? { from: first || prevP.org.from, to: prevP.org.to } : d0 === 1 ? rndPeriod(ymAdd(ym0, -1), 2) : d0 === 16 ? rndPeriod(ym0, 1) : { from: '', to: '' };
  const { pay, hold, dup } = rndUnits(o.units, paid);   // dup = 이미 다른 차수에 지급 → 뺌
  let prev, cur, cum;
  if (per) {
    const before = [...paid.values()].filter(x => x.r < o.round);
    const prevDone = prevP && prevP.org.done !== undefined && prevP.org.done !== '' ? toNum(prevP.org.done) : before.length;   // 완납세대 누계 (지난 차수 품의에 적어 둔 값)
    prev = { done: prevDone, n: before.length, amt: sum(before, x => x.amt) };
    const done = o.done !== undefined && o.done !== '' ? toNum(o.done) : before.length + pay.length + hold.length;   // 완납세대 누계 (비우면 지급 누계 + 보류)
    cur = { done: Math.max(0, done - prevDone), n: pay.length, amt: pay.length * rate, cumDone: done };   // 금회 칸 = 이번 기간 (누계 − 전회)
    cum = { done, n: before.length + pay.length, amt: prev.amt + cur.amt };
  } else {
    prev = { amt: sum(prevs, p => p.org.supply) };
    cur = { amt: toNum(o.supply) };
    cum = { amt: prev.amt + cur.amt };
  }
  return { per, from, to, pp, rate, pay, hold, dup, paid, prev, cur, cum, supply: cur.amt, vat: Math.round(cur.amt * 0.1) };
}
function orgBuild(o) {   // o = { kind, round, from, to, rate, supply, done, units, vendor, firstNo, date }
  const s = site(), S = s.fullName || s.name, c = orgCalc(o), K = o.kind;
  const P = c.pp.from ? `전회(${orgMd(c.pp.from)}~${orgMd(c.pp.to)})` : '전회', C = `금회(${orgMd(c.from)}~${orgMd(c.to)})`, Cm = `누계(${orgMd(c.pp.from || c.from)}~${orgMd(c.to)})`;
  const vat = v => Math.round(toNum(v) * 0.1);
  const cmp = c.per
    ? { cols: ['구분', '세대당 수수료', `${P}|완납세대`, `${P}|지급대상`, `${P}|금액`, `${C}|완납세대`, `${C}|지급대상`, `${C}|금액`, `${Cm}|완납세대`, `${Cm}|지급대상`, `${Cm}|금액`, '비고'],
      rows: [[K, fmt(c.rate), c.prev.done, c.prev.n, fmt(c.prev.amt), c.cur.done, c.cur.n, fmt(c.cur.amt), c.cum.done, c.cum.n, fmt(c.cum.amt), c.hold.length ? `보류 ${c.hold.length}세대` : ''],
        ['부가세', '', '', '', fmt(vat(c.prev.amt)), '', '', fmt(vat(c.cur.amt)), '', '', fmt(vat(c.cum.amt)), ''],
        ['합계', '', '', '', fmt(c.prev.amt + vat(c.prev.amt)), '', '', fmt(c.cur.amt + vat(c.cur.amt)), '', '', fmt(c.cum.amt + vat(c.cum.amt)), '']] }
    : { cols: ['구분', P.replace('전회', '전회 금액'), C.replace('금회', '금회 금액'), Cm.replace('누계', '누계 금액'), '비고'],
      rows: [[K, fmt(c.prev.amt), fmt(c.cur.amt), fmt(c.cum.amt), ''], ['부가세', fmt(vat(c.prev.amt)), fmt(vat(c.cur.amt)), fmt(vat(c.cum.amt)), ''], ['합계', fmt(c.prev.amt + vat(c.prev.amt)), fmt(c.cur.amt + vat(c.cur.amt)), fmt(c.cum.amt + vat(c.cum.amt)), '']] };
  const B = [{ type: 'text', num: true, title: '', text: [`${S} 현장 조직영업팀 ${K} 지급에 관하여 아래와 같이 품의합니다.`,
    `가. 기안품의 '${o.firstNo || '○○'}'에 의거하여 ${K} 지급`,
    `나. 지급기준 : ${c.per ? '기간 내 계약(2차계약금 완납)' : ''}`,
    `다. 지급금액 : ${fmt(c.supply)}원(VAT별도)${c.per && c.pay.length ? ` — ${c.pay.length}세대 × ${fmt(c.rate)}원` : ''}`,
    ...(c.hold.length ? [`※ 지급 보류 ${c.hold.length}세대 (판매내역 비고 참고)`] : [])].join('\n') },
  { type: 'table', num: true, title: '대비표', unit: '(단위: 원 / VAT 별도)', ...cmp, sum: false, note: '' }];
  if (c.per) {
    const row = (u, i, amt, memo) => [i, u.dong || '', u.type || '', orgDot(u.date), u.buyer || '', u.chief || '', u.hq || '', u.team || '', u.agent || '', orgDot(u.paid2), amt, memo];
    const blank = l => [l, '', '', '', '', '', '', '', '', '', '', ''];
    const rows = [...c.pay.map((u, i) => row(u, i + 1, fmt(c.rate), u.memo || '')), ...c.hold.map(u => row(u, '', '-', /보류/.test(u.memo || '') ? u.memo : `보류${u.memo ? ` : ${u.memo}` : ''}`))];
    if (!rows.length) rows.push(blank(''));
    rows.push(Object.assign(blank('소계'), { 10: fmt(c.supply) }), Object.assign(blank('부가세'), { 10: fmt(c.vat) }), Object.assign(blank('합계'), { 10: fmt(c.supply + c.vat) }));
    B.push({ type: 'table', num: false, annex: true, title: `판매내역(${o.round}차)`, cols: ['번호', '동호수', '타입', '계약일자', '계약자', '판매자|총괄', '판매자|본부', '판매자|팀', '판매자|담당자', '2차계약금 입금일', '지급액', '비고'], rows, sum: false, note: '※ 부가세는 마지막에 일괄 계산' });
  }
  B.push({ type: 'attach', num: true, title: '첨부서류', items: [['지출결의서', true], ['거래명세서', true], ['세금계산서', true], ['계약서 사본', c.per], ['입금내역서(후첨)', false]].map(([name, ok]) => ({ name, ok })) });
  const it = pmNew({ date: o.date || todayStr(), tpl: 'orgpay', title: `조직영업팀 ${K} 지급의 건(${o.round}차)`, vendor: o.vendor || '', firstNo: o.firstNo || '',
    period: `${orgDot(c.from)}~${orgDot(c.to)}`, payMethod: '계좌이체', payDate: '가까운 자금집행일', claim: '가능', budget: '예산 심의 전', amount: c.supply + c.vat, blocks: B,
    org: { kind: K, round: o.round, ym: String(c.from).slice(0, 7), from: c.from, to: c.to, rate: c.rate, supply: c.supply, ...(c.per ? { done: c.cum.done } : {}) } });   // done = 완납세대 누계 (다음 차수 전회 칸)
  it.docNo = pmDocNo(it.no, it.date);
  return it;
}
function orgDefaultPeriod(kind) {   // 같은 종류 지난 차수 다음 날부터 · 없으면 오늘 기준 (00 rndNextPeriod)
  const last = kind && orgLast(kind);
  return rndNextPeriod(last && last.org);
}
function orgPayForm(kind0) {
  if (!FS.ready) return;
  const dp = orgDefaultPeriod(kind0 || ORG_KINDS[0][0]), docs = pmAll().filter(p => p.docNo).sort((a, b) => toNum(b.no) - toNum(a.no));
  const r = modal('새 품의서 — 조직 지급 (차수형)', `<div class="form-grid">
      <label>지급 종류<select id="opKind">${ORG_KINDS.map(([k]) => `<option ${k === kind0 ? 'selected' : ''}>${k}</option>`).join('')}</select></label>
      <label>차수<input id="opRound" class="num"></label>
      <label>기간 시작일<input id="opFrom" type="date" data-rng="from" value="${dp.from}"></label>
      <label>기간 종료일<input id="opTo" type="date" data-rng="to" value="${dp.to}"></label>
      <label id="opRateL">세대당 금액 (VAT 별도)<input id="opRate" class="num"></label>
      <label id="opDoneL" title="대비표 '완납세대' 칸 — 비우면 지급 누계 + 보류 세대">완납세대 누계 <span class="muted">(비우면 자동)</span><input id="opDone" class="num"></label>
      <label id="opSupL">지급 금액 (공급가, VAT 별도)<input id="opSup" class="num"></label>
      <label>업체명 (조직 법인)<input id="opVendor" placeholder="예) ㈜○○컨설팅"></label>
      <label>최초 기안번호 (시행 품의)<input id="opFirst" list="opFirstL" placeholder="예) YS-○○현장2604-77"><datalist id="opFirstL">${docs.map(p => `<option value="${esc(p.docNo)}">${esc(`${p.no}. ${p.title || ''}`)}</option>`).join('')}</datalist></label>
      <label>기안일자<input id="opDate" type="date" value="${todayStr()}"></label>
    </div>
    <div id="opPasteBox" style="margin-top:8px"><div class="small"><b>이번 차수 판매내역</b> — 카운팅 엑셀에서 머리글 줄까지 복사해 붙여넣기 <span class="muted">(동호수·타입·계약일자·계약자·총괄·본부·팀·담당자·2차계약금 입금일·상태·비고 · 머리글이 없으면 이 순서. 상태·비고에 "보류" = 지급액 -, "해지" = 뺌)</span></div>
      <textarea id="opPaste" rows="6" style="width:100%" placeholder="동호수	타입	계약일자	계약자	총괄	본부	팀	담당자	2차계약금 입금일&#10;101-1203	84A	2026.09.03	홍길동	1총괄	2본부	3팀	김담당	2026.09.10"></textarea></div>
    <div id="opInfo" class="banner info small" style="margin-top:8px"></div>`, [
    { label: '취소' },
    { label: '프로그램에서 작성', cls: 'primary', onClick: () => { const o = read(); if (!o.round) { toast('차수를 넣으세요.'); return true; } setTimeout(() => pmEditor(orgBuild(o)), 0); } }]);
  const v = id => $('#' + id, r).value;
  const read = () => ({ kind: v('opKind'), round: toNum(v('opRound')), from: v('opFrom') || dp.from, to: v('opTo') || v('opFrom') || dp.to, rate: toNum(v('opRate')), supply: toNum(v('opSup')), done: v('opDone').trim(),
    units: rndParseUnits(v('opPaste'), (v('opFrom') || dp.from || '').slice(0, 7) || undefined),vendor: v('opVendor').trim(), firstNo: v('opFirst').trim(), date: v('opDate') || todayStr() });
  const info = () => {
    const o = read(), c = orgCalc(o);
    $('#opInfo', r).innerHTML = c.per
      ? `${orgDot(c.from)}~${orgDot(c.to)} · 붙여넣은 ${o.units.length}세대 → 지급 <b>${c.pay.length}세대</b>${c.hold.length ? ` · 보류 ${c.hold.length}` : ''}${o.units.length - c.pay.length - c.hold.length - c.dup.length ? ` · 해지 ${o.units.length - c.pay.length - c.hold.length - c.dup.length}` : ''} · 공급가 <b>${fmt(c.supply)}원</b> + 부가세 ${fmt(c.vat)}원 = ${fmt(c.supply + c.vat)}원 · 누계 ${c.cum.n}세대 ${fmt(c.cum.amt)}원
        ${c.dup.length ? `<div style="color:var(--bad,#c00)">⚠ 이미 지급된 세대 ${c.dup.length}개는 뺍니다: ${c.dup.slice(0, 6).map(u => { const p = c.paid.get(unitKey(u.dong)); return `${esc(u.dong)}(${p.src} ${p.r}차)`; }).join(', ')}${c.dup.length > 6 ? ' …' : ''}</div>` : ''}`
      : `${orgDot(c.from)}~${orgDot(c.to)} · 공급가 <b>${fmt(c.supply)}원</b> + 부가세 ${fmt(c.vat)}원 · 누계 ${fmt(c.cum.amt)}원 (세대별 아님 — 판매내역 표 없음)`;
  };
  const onKind = () => {   // 종류를 바꾸면 차수·단가·업체·최초 기안번호를 같은 종류 지난 품의에서
    const k = v('opKind'), last = orgLast(k), per = orgPerUnit(k);
    $('#opRound', r).value = orgNextRound(k);
    const p = orgDefaultPeriod(k); $('#opFrom', r).value = p.from; $('#opTo', r).value = p.to;
    $('#opRate', r).value = last && last.org.rate ? fmt(last.org.rate) : '';
    $('#opSup', r).value = '';
    const anyOrg = pmAll().find(p => p.org && p.vendor);
    $('#opVendor', r).value = (last && last.vendor) || (anyOrg && anyOrg.vendor) || '';
    $('#opFirst', r).value = (last && last.firstNo) || '';
    ['opRateL', 'opDoneL', 'opPasteBox'].forEach(id => { $('#' + id, r).style.display = per ? '' : 'none'; });
    $('#opSupL', r).style.display = per ? 'none' : '';
    info();
  };
  $('#opKind', r).onchange = onKind;
  $('#opFrom', r).addEventListener('change', () => { const h = rndHalfOf(v('opFrom')); if (h) $('#opTo', r).value = h.to; info(); });   // 1일·16일을 고르면 종료일 15일·말일
  r.querySelectorAll('#opRound,#opFrom,#opTo,#opRate,#opSup,#opDone,#opPaste').forEach(el => { el.oninput = info; el.onchange = info; });
  onKind();
}
// 다음 회차 (품의서 대장 ⋯ 메뉴): 같은 종류로 새 차수 창
const orgNext = src => orgPayForm(src.org.kind);
// 인쇄 전 확인: 이미 다른 차수에 지급된 세대
function orgPrintWarns(it) {
  if (!it.org) return [];
  const paid = orgPaidMap(it.org.kind, it.id), dup = orgSaleRows(it).filter(x => paid.has(x.key)).map(x => { const p = paid.get(x.key); return `${x.key}(${p.src} ${p.r}차)`; });
  return dup.length ? [`이미 지급된 세대가 판매내역에 있습니다: ${dup.slice(0, 8).join(', ')}${dup.length > 8 ? ` 외 ${dup.length - 8}세대` : ''}`] : [];
}

PM_TPL.push({ id: 'orgpay', group: '조직', label: '조직 지급(차수형)', hint: '판매수수료·계약축하금·인센티브·일비·광고비 선지급·추가수수료 (판매내역 붙여넣기)', title: '조직영업팀 판매수수료 지급의 건(1차)', payDate: '가까운 자금집행일', hidden: true,   // 새 품의 창에 따로 카드 (AI 양식 고르기에서는 뺌)
  body: S => [`${S} 현장 조직영업팀 ○○ 지급에 관하여 아래와 같이 품의합니다.`, "가. 기안품의 '○○'에 의거하여 ○○ 지급", '나. 지급기준 : 기간 내 계약(2차계약금 완납)', '다. 지급금액 : ○원(VAT별도)'],
  attach: [['지출결의서', true], ['거래명세서', true], ['세금계산서', true], ['계약서 사본', true], ['입금내역서(후첨)', false]] });
