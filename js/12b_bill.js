'use strict';
/* ---------- 매출 청구 (시행사·신탁사 청구 공문 → 세금계산서 → 입금) ----------
 * db.billing[sid][ym] = [{ id, k(현장 손익 수익 항목 key: fee·mgm·opex·util·bonus·revEtc·rv_…), round, period, amount(공급가), vat,
 *                         docDate(공문일), docNo, taxDate(세금계산서 발행일), dueDate(입금 예정일), paidDate, paidAmount, memo }]
 *   ym = 청구월. 현장 손익 수익 = 청구월의 공급가 합 (손익 칸에 숫자를 넣으면 그 값 우선)
 * 목록은 청구월·항목·기간·금액·상태만, 줄을 누르면 나머지(공문·세금계산서·입금)를 넣는 창 */
const billList = (sid, ym) => { const m = nest(db.billing, sid); if (!Array.isArray(m[ym])) m[ym] = []; return m[ym]; };
const billAll = (sid = db.cur) => Object.entries((db.billing || {})[sid] || {}).flatMap(([ym, list]) => (Array.isArray(list) ? list : []).map(b => ({ b, ym })));
const billFind = id => billAll().find(x => x.b.id === id);
const billKinds = (sid = db.cur) => plRev(sid).filter(([k]) => k !== 'units');   // 현장 손익 표의 수익 항목 그대로 (판매 세대수 빼고) — 항목 추가는 손익 [+ 수익 항목]
const billLabel = k => (billKinds().find(x => x[0] === k) || [k, k])[1];
const billTotal = b => toNum(b.amount) + toNum(b.vat);
const billPaid = b => (String(b.paidAmount ?? '').trim() !== '' ? toNum(b.paidAmount) : b.paidDate ? billTotal(b) : 0);   // 입금일만 있으면 전액
function billStatus(b) {
  const t = billTotal(b), p = billPaid(b);
  if (t && p >= t) return ['입금 완료', 'ok'];
  if (p > 0) return ['부분 입금', 'warn'];
  if (b.taxDate) return b.dueDate && b.dueDate < todayStr() ? ['입금 지연', 'bad'] : ['입금 대기', ''];
  if (b.docDate) return ['발행 대기', 'warn'];
  return ['미청구', ''];
}
const BILL_ST = ['미청구', '발행 대기', '입금 대기', '입금 지연', '부분 입금', '입금 완료'];
function billPlAuto(sid, ym) {   // 현장 손익: 청구월 → { k: 공급가 합 }
  const v = {}; billAll(sid).forEach(({ b, ym: y }) => { if (y === ym) v[b.k] = (v[b.k] || 0) + toNum(b.amount); });
  return v;
}
// 손익 반영 표시: 청구월 수익 (그 달 손익 칸에 직접 넣은 숫자가 있으면 그 값이 우선이라 반영 안 됨)
function billPlState(b, ym, sid = db.cur) {
  const man = ((db.pl[sid] || {})[ym] || {})[b.k];
  if (!plRev(sid).some(([k]) => k === b.k)) return ['손익에 없는 항목', 'bad'];
  if (man !== undefined && man !== '' && man !== null) return [`${monthNo(ym)}월 손익에 직접 입력값 있음`, 'warn'];
  return [`${String(ym).slice(2, 4)}년 ${monthNo(ym)}월 수익`, 'ok'];
}
const billNextRound = k => Math.max(0, ...billAll().filter(x => x.b.k === k).map(x => toNum(x.b.round))) + 1;
/* 추가·고치기 창 (x = { b, ym } 고치기 · next = 다음 차수로 복사 · 없으면 새로) */
function billDialog(x, next) {
  const kinds = billKinds(), edit = x && !next, b0 = x ? x.b : {}, k0 = b0.k || (kinds[0] || [''])[0];
  const ym0 = edit ? x.ym : x ? ymAdd(x.ym, 1) : todayStr().slice(0, 7), round0 = edit ? b0.round || '' : billNextRound(k0);   // 새 청구월 = 오늘 달 (상단 작업월이 아니라)
  const val = f => (edit ? b0[f] ?? '' : '');
  const num = f => (edit ? fmt0(b0[f]) : '');
  const kindOpts = kinds.map(([k, l]) => `<option value="${esc(k)}" ${k === k0 ? 'selected' : ''}>${esc(l)}</option>`).join('') + (k0 && !kinds.some(([k]) => k === k0) ? `<option selected value="${esc(k0)}">${esc(k0)} (손익에 없는 항목)</option>` : '');
  const r = modal(edit ? `${billLabel(b0.k)}${b0.round ? ` ${b0.round}차` : ''} 청구` : next ? '다음 차수 청구' : '매출 청구 추가', `
    <div class="form-grid">
      <label>항목<select id="bkK">${kindOpts}</select></label>
      <label title="이 달 현장 손익 수익으로 들어감">청구월<input id="bkYm" type="month" value="${ym0}"></label>
      <label>차수<input id="bkR" class="num" value="${esc(round0)}"></label>
      <label>기간<input id="bkP" data-rng="text" autocomplete="off" placeholder="예) 2026.09.16.~2026.09.30." value="${esc(val('period'))}"></label>
      <label>공급가<input id="bkA" class="num" value="${x ? fmt0(b0.amount) : ''}"></label>
      <label>부가세<input id="bkV" class="num" value="${num('vat')}" placeholder="비우면 10%"></label>
    </div>
    <details ${edit ? 'open' : ''} style="margin-top:10px"><summary class="small" style="cursor:pointer"><b>공문 · 세금계산서 · 입금</b></summary>
    <div class="form-grid" style="margin-top:6px">
      <label>공문일<input id="bkD" type="date" value="${esc(val('docDate'))}"></label><label>공문번호<input id="bkN" value="${esc(val('docNo'))}"></label>
      <label>세금계산서 발행일<input id="bkT" type="date" value="${esc(val('taxDate'))}"></label><label>입금 예정일<input id="bkDue" type="date" value="${esc(val('dueDate'))}"></label>
      <label>입금일<input id="bkPd" type="date" value="${esc(val('paidDate'))}"></label><label>입금액<input id="bkPa" class="num" value="${num('paidAmount')}" placeholder="비우면 전액"></label>
      <label style="grid-column:span 2">메모<input id="bkM" value="${esc(val('memo'))}"></label>
    </div></details>
    <p class="small muted">항목은 현장 손익 표의 수익 항목과 같습니다 (없는 항목은 현장 손익 탭 [+ 수익 항목]). 청구월 달의 현장 손익 수익에 공급가로 들어갑니다.</p>`, [
    ...(edit ? [{ label: '삭제', cls: 'danger', onClick: () => { if (!confirm('이 청구를 삭제할까요?')) return true; const l = billList(db.cur, x.ym); l.splice(l.indexOf(b0), 1); save(); render(); } }] : []),
    { label: '취소' },
    { label: edit ? '저장' : '추가', cls: 'primary', onClick: root => {
      const v = id => $('#' + id, root).value.trim(), amt = toNum(v('bkA')), ym = v('bkYm') || ym0, opt = s => (s === '' ? '' : toNum(s));
      const b = edit ? b0 : { id: uid() };
      Object.assign(b, { k: v('bkK'), round: opt(v('bkR')), period: v('bkP'), amount: amt, vat: v('bkV') === '' ? Math.round(amt * 0.1) : toNum(v('bkV')),
        docDate: v('bkD'), docNo: v('bkN'), taxDate: v('bkT'), dueDate: v('bkDue'), paidDate: v('bkPd'), paidAmount: opt(v('bkPa')), memo: v('bkM') });
      if (edit && ym !== x.ym) { const l = billList(db.cur, x.ym); l.splice(l.indexOf(b0), 1); }
      if (!edit || ym !== x.ym) billList(db.cur, ym).push(b);
      save(); render(); toast(edit ? '저장했습니다.' : `${billLabel(b.k)} ${b.round ? b.round + '차 ' : ''}청구를 추가했습니다.`);
    } }]);
  modalSize(r, 'm');
  if (!edit) $('#bkK', r).onchange = ev => { $('#bkR', r).value = billNextRound(ev.target.value); };
  // 공급가를 고치면 부가세도 10% 로 (부가세를 따로 고친 게 아니면)
  const A = $('#bkA', r), V = $('#bkV', r);
  A.oninput = () => { if (!V.value.trim() || toNum(V.value) === Math.round(toNum(A.dataset.old ?? A.defaultValue) * 0.1)) V.value = fmt0(Math.round(toNum(A.value) * 0.1)); A.dataset.old = A.value; };
}
function billPlDialog(k) {   // 현장 손익 수익 항목 이름 클릭 → 이 항목 청구 내역 (작업 연도, 청구월 기준)
  const year = state.ym.slice(0, 4), yr = billAll().filter(x => x.b.k === k && String(x.ym).startsWith(year)).sort((a, z) => String(a.ym).localeCompare(String(z.ym)) || toNum(a.b.round) - toNum(z.b.round));
  const tr = ({ b, ym }) => { const [p, pc] = billPlState(b, ym); return `<tr><td>${esc(ym)}</td><td class="num">${esc(b.round || '')}</td><td>${esc(b.period || '')}</td><td class="num">${fmt0(b.amount)}</td><td><span class="badge ${billStatus(b)[1]}">${billStatus(b)[0]}</span></td><td class="small"><span class="badge ${pc}">${esc(p)}</span></td></tr>`; };
  const r = modal(`${billLabel(k)} — 매출 청구 내역`, `
    <p class="small"><b>${year}년 청구분</b> = 현장 손익 수익 (공급가, 청구월) · 합계 <b>${fmt(sum(yr, x => x.b.amount))}원</b></p>
    <div class="tbl-wrap"><table class="t"><thead><tr><th>청구월</th><th>차수</th><th>기간</th><th>공급가</th><th>상태</th><th>손익 반영</th></tr></thead><tbody>${yr.map(tr).join('') || '<tr><td colspan="6" class="center muted">없음</td></tr>'}</tbody></table></div>
    <p class="small muted">손익 칸에 숫자를 직접 넣은 달은 그 숫자가 우선입니다 — 칸을 지우면 청구 금액으로 자동.</p>`,
    [{ label: '매출 청구 탭으로', onClick: () => { state.tab = 'bill'; render(); } }, { label: '닫기' }]);
  modalSize(r, 'm');
}
function billSummary(list) {   // 항목별: 청구(공급가) · 발행 · 입금 · 미수 · 미청구
  const g = new Map();
  list.forEach(({ b }) => {
    const x = g.get(b.k) || { k: b.k, n: 0, amt: 0, issued: 0, paid: 0, recv: 0, notYet: 0 };
    x.n++; x.amt += toNum(b.amount);
    if (b.taxDate) { x.issued += toNum(b.amount); x.recv += billTotal(b) - billPaid(b); } else x.notYet += toNum(b.amount);
    x.paid += billPaid(b); g.set(b.k, x);
  });
  return [...g.values()];
}
function viewBill() {
  const s = site(), all = billAll().sort((a, z) => String(z.ym).localeCompare(String(a.ym)) || String(a.b.k).localeCompare(String(z.b.k)) || toNum(z.b.round) - toNum(a.b.round));
  const F = state.billF || '', list = all.filter(x => !F || billStatus(x.b)[0] === F);
  const cnt = st => all.filter(x => billStatus(x.b)[0] === st).length;
  const sm = billSummary(all), tot = k => sum(sm, x => x[k]);
  const rows = list.map(({ b, ym }) => { const [st, cls] = billStatus(b), [p, pc] = billPlState(b, ym), rest = billTotal(b) - billPaid(b);
    const sub = [b.taxDate ? `계산서 ${b.taxDate.slice(5).replace('-', '/')}` : b.docDate ? `공문 ${b.docDate.slice(5).replace('-', '/')}` : '', rest > 0 && b.taxDate ? `미수 ${fmt(rest)}` : '', b.memo || ''].filter(Boolean).join(' · ');
    return `<tr data-act="billEdit" data-id="${b.id}" style="cursor:pointer" title="눌러서 공문·세금계산서·입금 입력">
      <td style="white-space:nowrap"><b>${String(ym).slice(2, 4)}년 ${monthNo(ym)}월</b></td>
      <td>${esc(billLabel(b.k))}${b.round ? ` <span class="muted">${esc(b.round)}차</span>` : ''}</td>
      <td>${esc(b.period || '')}</td>
      <td class="num">${fmt0(b.amount)}</td><td class="num muted">${fmt0(billTotal(b))}</td>
      <td style="white-space:nowrap"><span class="badge ${cls}">${st}</span>${pc !== 'ok' ? ` <span class="badge ${pc}" title="현장 손익">${esc(p)}</span>` : ''}${sub ? `<div class="small muted">${esc(sub)}</div>` : ''}</td>
      <td>${MENU('⋯', [MI('billNext', '다음 차수', `data-id="${b.id}"`, '같은 항목 · 청구월 +1'), MI('billDel', '삭제', `data-id="${b.id}"`)])}</td></tr>`; }).join('');
  const late = cnt('입금 지연'), wait = cnt('발행 대기');
  return `${pageHead('매출 청구', `${esc(s.fullName || s.name)} · 시행사·신탁사 청구`, BTN('billAdd', '+ 청구 추가', '', 'primary') + BTN('exportBill', '엑셀로 저장'))}
    ${late || wait ? `<div class="banner warn small">${late ? `입금 예정일이 지난 청구 <b>${late}건</b> ` : ''}${wait ? `· 공문은 냈지만 세금계산서 미발행 <b>${wait}건</b>` : ''}</div>` : ''}
    <div class="tbl-wrap" style="margin-bottom:12px"><table class="t"><thead><tr><th>항목</th><th>건수</th><th>청구 (공급가)</th><th>세금계산서 발행</th><th>미발행</th><th>입금 (부가세 포함)</th><th>미수 (발행분)</th></tr></thead><tbody>
      ${sm.map(x => `<tr><td>${esc(billLabel(x.k))}</td><td class="num">${x.n}</td><td class="num">${fmt0(x.amt)}</td><td class="num">${fmt0(x.issued)}</td><td class="num">${fmt0(x.notYet)}</td><td class="num">${fmt0(x.paid)}</td><td class="num ${x.recv > 0 ? 'neg' : ''}">${fmt0(x.recv)}</td></tr>`).join('') || '<tr><td colspan="7" class="center muted" style="padding:16px">청구가 없습니다. [+ 청구 추가]로 넣으세요.</td></tr>'}
      ${sm.length > 1 ? `<tr class="sum"><td>합계</td><td class="num">${tot('n')}</td><td class="num">${fmt0(tot('amt'))}</td><td class="num">${fmt0(tot('issued'))}</td><td class="num">${fmt0(tot('notYet'))}</td><td class="num">${fmt0(tot('paid'))}</td><td class="num">${fmt0(tot('recv'))}</td></tr>` : ''}</tbody></table></div>
    <div class="row small" style="margin-bottom:8px"><select data-ch="billF"><option value="">전체 (${all.length}건)</option>${BILL_ST.map(x => `<option value="${x}" ${x === F ? 'selected' : ''}>${x}${cnt(x) ? ` (${cnt(x)})` : ''}</option>`).join('')}</select></div>
    ${all.length ? `<div class="tbl-wrap" style="overflow:visible"><table class="t"><thead><tr><th>청구월</th><th>항목</th><th>기간</th><th>공급가</th><th>합계</th><th>상태</th><th></th></tr></thead><tbody>${rows || '<tr><td colspan="7" class="center muted">해당 상태의 청구가 없습니다.</td></tr>'}</tbody></table></div>` : ''}
    <p class="muted small">줄을 누르면 공문·세금계산서·입금을 넣습니다. 청구월 달의 <b>현장 손익 수익</b>에 공급가로 자동으로 들어갑니다 (손익 칸에 숫자를 넣으면 그 값 우선). 20일 이전 청구 시 당월 입금.</p>`;
}
function exportBill() {
  const all = billAll().sort((a, z) => String(a.ym).localeCompare(String(z.ym)) || String(a.b.k).localeCompare(String(z.b.k)) || toNum(a.b.round) - toNum(z.b.round));
  const a1 = [[`${site().name}현장 매출 청구`], ['청구월', '항목', '차수', '기간', '공급가', '부가세', '합계', '공문일', '공문번호', '세금계산서 발행일', '입금 예정일', '입금일', '입금액', '미수', '상태', '메모']];
  all.forEach(({ b, ym }) => a1.push([ym, billLabel(b.k), b.round || '', b.period || '', toNum(b.amount), toNum(b.vat), billTotal(b), b.docDate || '', b.docNo || '', b.taxDate || '', b.dueDate || '', b.paidDate || '', billPaid(b), billTotal(b) - billPaid(b), billStatus(b)[0], b.memo || '']));
  const a2 = [[`${site().name}현장 매출 청구 항목별 집계`], ['항목', '건수', '청구(공급가)', '세금계산서 발행(공급가)', '미발행(공급가)', '입금(부가세 포함)', '미수(발행분)']];
  billSummary(all).forEach(x => a2.push([billLabel(x.k), x.n, x.amt, x.issued, x.notYet, x.paid, x.recv]));
  saveBook([['매출 청구', sheet(a1, [9, 14, 6, 22, 13, 11, 13, 11, 14, 12, 12, 11, 13, 13, 9, 30])], ['항목별 집계', sheet(a2, [16, 7, 15, 18, 15, 16, 15])]], `${site().name}현장 매출 청구.xlsx`);
}
