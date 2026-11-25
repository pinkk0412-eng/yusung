'use strict';
/* ---------- 실비 청구 (시행사 부담 인건비 등) — 매출 청구 [+ 실비 청구] ----------
 * 청구 건 b (12b, k = 운영비 등 현장 손익 수익 항목) + b.exp = { ym(대상 월), ids(대상 직원), gross(총급여 세전 합), meal(식대공제 합) }
 * 공급가 = 대상 인원 총급여액(세전) 합 — 인건비 탭 payRows 의 c.gross 를 그대로 (식대공제 = 식대 단가가 음수인 캐터링 공제, 총급여에 이미 빠져 있음)
 * 대상 인원은 현장마다 다름 → site.expSel = { teams:[구분], on:[직원 id], off:[직원 id] } 로 기억 (처음엔 인건비 [부담] = 시행사인 사람)
 * 별첨(엑셀 시트 = 인쇄 쪽): 인건비내역 · 출근부(11 payAttSheet) · 인건비대장 · 연장근무 · 식대공제 */
const expRowsAll = ym => payRows(db.cur, ym, true).filter(r => r.rec.payType !== '제외' && r.s.kind !== '정직원' && payClaimable(r));   // 인건비 탭 '합계 (청구 대상)'과 같은 사람들
function expPicked(r, sel) {
  if (!sel) return r.rec.payer === '시행사';
  if ((sel.on || []).includes(r.s.id)) return true;
  if ((sel.off || []).includes(r.s.id)) return false;
  return (sel.teams || []).includes(r.s.team || '');
}
const expRows = (ym, ids) => expRowsAll(ym).filter(r => ids.includes(r.s.id));
const expMeal = r => (toNum(r.rec.mealRate) < 0 ? r.c.meal : 0);   // 식대공제 (음수)
const expNow = b => sum(payRows(db.cur, b.exp.ym, false).filter(r => r.rec.payType !== '제외' && r.s.kind !== '정직원' && payClaimable(r) && (b.exp.ids || []).includes(r.s.id)), r => r.c.gross);   // 지금 인건비 탭 기준 금액 (청구 뒤 바뀌었는지)
const expLand = h => h.replace('class="doc xt xt-land"', 'class="doc xt xt-land bfx"');   // 인쇄 가로

function expSheets(ym, rows) {
  const s = site(), m = monthNo(ym), T = f => sum(rows, f), D = v => (toNum(v) ? toNum(v) : { t: '-', c: 'c' });
  const head0 = `${s.name}현장 ${m}월`;
  const pay = xtHtml({ title: `${head0} 실비 청구 인건비내역`, sub: `${ym.replace('-', '.')}.01.~${ym.replace('-', '.')}.${daysIn(ym)}. · 금액 = 총급여액(세전)`, land: true,
    widths: [90, 64, 100, 56, 80, 50, 50, 90, 60, 50, 80, 76, 96],
    head: [['구분', '성명', '업체명', '지급형태', '급여단가', '근무일수', '연장시간', '급여계', '식대단가', '식대일수', '식대계', '인센티브', '총급여액']],
    rows: [...rows.map(({ s: p, rec, c }) => [p.team || '', p.name, rec.company || '', rec.payType, D(rec.rate), fmtQty(c.workDays) || '-', fmtQty(c.otHours) || '-', D(c.pay), D(rec.mealRate), fmtQty(c.mealDays) || '-', D(c.meal), D(rec.incentive), D(c.gross)]),
      [{ t: '합계', cs: 7, c: 'c' }, D(T(r => r.c.pay)), '', '', D(T(r => r.c.meal)), D(T(r => r.rec.incentive)), D(T(r => r.c.gross))]] });
  const ledger = xtHtml({ title: `${head0} 인건비대장`, sub: '※ 주민등록번호·은행·계좌는 프로그램에 저장하지 않습니다. 이 시트에 직접 입력하세요.', land: true,
    widths: [90, 64, 100, 96, 90, 76, 70, 96, 110, 70, 130],
    head: [['구분', '성명', '업체명', '총급여액', '세금구분', '소득세/부가세', '지방소득세', '실지급액', '주민등록번호', '은행', '계좌번호']],
    rows: [...rows.map(({ s: p, rec, c }) => [p.team || '', p.name, rec.company || '', D(c.gross), (TAX_TYPES[rec.taxType] || '') + (c.small ? ' (소액부징수)' : ''), D(c.tax), D(c.local), D(c.net), '', '', '']),
      [{ t: '합계', cs: 3, c: 'c' }, D(T(r => r.c.gross)), '', D(T(r => r.c.tax)), D(T(r => r.c.local)), D(T(r => r.c.net)), '', '', '']] });
  const otRows = rows.filter(r => r.c.otHours > 0), otAtt = (attOf(ym).__ot || {}), days = Array.from({ length: daysIn(ym) }, (_, i) => i + 1);
  const ot = otRows.length ? xtHtml({ title: `${head0} 연장근무 내역`, land: true, widths: [70, 56, 60, ...days.map(() => 26), 40, 80],
    head: [['구분', '성명', '연장시급', ...days.map(String), '계', '연장수당']],
    rows: [...otRows.map(({ s: p, rec, c }) => [p.team || '', p.name, D(rec.otRate), ...days.map(d => ({ t: fmtQty(toNum((otAtt[p.id] || {})[d])) || '', c: 'c' })), fmtQty(c.otHours), D(c.ot)]),
      [{ t: '합계', cs: 3, c: 'c' }, ...days.map(() => ''), fmtQty(T(r => (r.c.otHours > 0 ? r.c.otHours : 0))), D(T(r => (r.c.otHours > 0 ? r.c.ot : 0)))]] }) : '';
  const mealRows = rows.filter(r => expMeal(r));
  const meal = mealRows.length ? xtHtml({ title: `${head0} 식대공제 내역`, sub: '인건비 탭 식대 단가가 음수(캐터링 공제)인 사람 · 공제액 = 공제 단가 × 식대일수', widths: [90, 70, 90, 70, 100],
    head: [['구분', '성명', '공제 단가', '식대일수', '공제액']],
    rows: [...mealRows.map(({ s: p, rec, c }) => [p.team || '', p.name, D(rec.mealRate), fmtQty(c.mealDays) || '-', D(c.meal)]), [{ t: '합계', cs: 3, c: 'c' }, fmtQty(T(r => (expMeal(r) ? r.c.mealDays : 0))), D(T(expMeal))]] }) : '';
  return [['인건비내역', expLand(pay)], ['출근부', expLand(payAttSheet(ym, rows, `${head0} 출근부`))], ['인건비대장', expLand(ledger)], ['연장근무', ot && expLand(ot)], ['식대공제', meal]].filter(x => x[1]);
}

function billExpDialog(x, next) {
  const s = site(), edit = x && !next, b0 = edit ? x.b : {};
  const kinds = billKinds(), kDef = (kinds.find(([k]) => k === 'opex') || kinds.find(([k]) => k !== 'fee') || kinds[0] || [''])[0];
  let ym = edit ? b0.exp.ym : next ? ymAdd(x.b.exp.ym, 1) : state.ym;
  const k0 = edit || next ? x.b.k : kDef;
  const r = modal(edit ? `실비 청구 — ${monthNo(ym)}월분` : '실비 청구 추가', `
    <div class="form-grid">
      <label title="이 달 인건비·출근부로 별첨을 만듦">대상 월<input id="beYm" type="month" value="${ym}"></label>
      <label>손익 항목<select id="beK">${kinds.map(([k, l]) => `<option value="${esc(k)}" ${k === k0 ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
      <label title="이 달 현장 손익 수익으로 들어감">청구월<input id="beBy" type="month" value="${edit ? x.ym : todayStr().slice(0, 7)}"></label>
      <label>차수<input id="beR" class="num" value="${esc(edit ? b0.round ?? '' : billNextRound(k0))}"></label>
      <label>부가세<input id="beV" class="num" value="${edit ? fmt0(b0.vat) : ''}" placeholder="비우면 10%"></label>
      <label title="시행사·신탁사가 떼고 주는 비율">유보율 %<input id="beRr" class="num" value="${esc(edit ? b0.retainRate ?? '' : billRetainDef(k0))}" placeholder="0"></label>
    </div>
    <h4 style="margin:12px 0 4px">대상 인원 <span class="muted small">— 현장마다 다름 · 고른 것은 이 현장에 기억 (구분을 고르면 나중에 들어온 사람도 포함)</span></h4>
    <div id="bePick"></div>
    <div id="beInfo" class="banner info small" style="margin-top:8px"></div>`, [
    ...(edit ? [{ label: '삭제', cls: 'danger', onClick: () => { if (!confirm('이 실비 청구를 삭제할까요?')) return true; const l = billList(db.cur, x.ym); l.splice(l.indexOf(b0), 1); save(); render(); } }] : []),
    { label: '취소' },
    { label: '엑셀로 저장', onClick: () => { const rows = expRows(ym, ids()); if (!rows.length) { toast('대상 인원을 고르세요.'); return true; } saveXl(expSheets(ym, rows), `${pad2(monthNo(ym))}월 ${s.name}현장 실비 청구.xlsx`); return true; } },
    { label: '인쇄', onClick: () => { const rows = expRows(ym, ids()); if (!rows.length) { toast('대상 인원을 고르세요.'); return true; } printDocs(expSheets(ym, rows).map(z => z[1])); return true; } },
    { label: edit ? '저장' : '추가', cls: 'primary', onClick: () => store() }]);
  modalSize(r, 'm');
  const box = r.querySelector('.modal'), $r = id => $('#' + id, r);
  let sel = s.expSel ? JSON.parse(JSON.stringify(s.expSel)) : null, picked = new Set(edit ? b0.exp.ids || [] : []);
  const ids = () => [...picked];
  const draw = () => {
    const all = expRowsAll(ym);
    if (!edit || $r('bePick').dataset.done) all.forEach(rw => { if (expPicked(rw, sel)) picked.add(rw.s.id); else picked.delete(rw.s.id); });
    $r('bePick').dataset.done = '1';
    const teams = []; all.forEach(rw => { const k = rw.s.team || ''; let t = teams.find(z => z.k === k); if (!t) teams.push(t = { k, list: [] }); t.list.push(rw); });
    $r('bePick').innerHTML = teams.map(t => `<div style="margin:4px 0"><label class="small"><input type="checkbox" data-team="${esc(t.k)}" ${t.list.every(rw => picked.has(rw.s.id)) ? 'checked' : ''}> <b>${esc(t.k || '(구분 없음)')}</b></label>
      ${t.list.map(rw => `<label class="chip small" style="margin-left:6px"><input type="checkbox" data-id="${rw.s.id}" ${picked.has(rw.s.id) ? 'checked' : ''}> ${esc(rw.s.name)} <span class="muted">${fmt(rw.c.gross)}${rw.rec.payer === '시행사' ? ' · 시행사 부담' : ''}</span></label>`).join('')}</div>`).join('') || `<p class="muted small">${monthNo(ym)}월 인건비 청구 대상 인원이 없습니다. 출근부·인건비를 먼저 입력하세요.</p>`;
    info();
  };
  const info = () => {
    const rows = expRows(ym, ids()), g = sum(rows, rw => rw.c.gross), ml = sum(rows, expMeal), vat = $r('beV').value.trim() === '' ? Math.round(g * 0.1) : toNum($r('beV').value);
    const t = { amount: g, vat, retainRate: $r('beRr').value.trim() };
    $r('beInfo').innerHTML = `${rows.length}명 · 총급여액(세전) <b>${fmt(g)}원</b>${ml ? ` <span class="muted">(식대공제 ${fmt(ml)} 포함)</span>` : ''} = 공급가 · 부가세 ${fmt(vat)} · 합계 ${fmt(g + vat)}원${billRetain(t) ? ` · 유보금 ${fmt(billRetain(t))} → 입금 예정 ${fmt(billExpect(t))}원` : ''}
      <div class="muted">별첨: 인건비내역 · 출근부 · 인건비대장${rows.some(rw => rw.c.otHours > 0) ? ' · 연장근무' : ''}${ml ? ' · 식대공제' : ''} — 금액은 인건비 탭 계산 그대로</div>`;
  };
  box.addEventListener('change', ev => {
    const el = ev.target;
    if (el.id === 'beYm') { ym = el.value || ym; draw(); return; }
    if (el.dataset.team !== undefined || el.dataset.id) {
      sel = sel || { teams: [], on: [], off: [] }; ['teams', 'on', 'off'].forEach(k => { sel[k] = sel[k] || []; });
      const rm = (a, v) => { const i = a.indexOf(v); if (i >= 0) a.splice(i, 1); };
      if (el.dataset.team !== undefined) {   // 구분 전체: 그 구분 사람들의 개별 지정은 지움
        rm(sel.teams, el.dataset.team); if (el.checked) sel.teams.push(el.dataset.team);
        expRowsAll(ym).filter(rw => (rw.s.team || '') === el.dataset.team).forEach(rw => { rm(sel.on, rw.s.id); rm(sel.off, rw.s.id); });
      } else {
        const id = el.dataset.id; rm(sel.on, id); rm(sel.off, id);
        const rw = expRowsAll(ym).find(z => z.s.id === id), byTeam = rw && sel.teams.includes(rw.s.team || '');
        if (el.checked && !byTeam) sel.on.push(id); if (!el.checked && byTeam) sel.off.push(id);
      }
      draw(); return;
    }
    info();
  });
  box.addEventListener('input', ev => { if (/^be(V|Rr)$/.test(ev.target.id)) info(); });
  function store() {
    const rows = expRows(ym, ids()); if (!rows.length) { toast('대상 인원을 고르세요.'); return true; }
    const v = id => $r(id).value.trim(), g = sum(rows, rw => rw.c.gross), by = v('beBy') || todayStr().slice(0, 7);
    const b = edit ? b0 : { id: uid(), docDate: '', docNo: '', taxDate: '', dueDate: '', paidDate: '', paidAmount: '', memo: '' };
    Object.assign(b, { k: v('beK'), round: v('beR') === '' ? '' : toNum(v('beR')), period: `${ym.replace('-', '.')}.01.~${ym.replace('-', '.')}.${daysIn(ym)}.`, amount: g, vat: v('beV') === '' ? Math.round(g * 0.1) : toNum(v('beV')),
      retainRate: v('beRr') === '' ? '' : toNum(v('beRr')), exp: { ym, ids: ids(), gross: g, meal: sum(rows, expMeal) } });
    if (sel) s.expSel = sel;
    if (edit && by !== x.ym) { const l = billList(db.cur, x.ym); l.splice(l.indexOf(b0), 1); }
    if (!edit || by !== x.ym) billList(db.cur, by).push(b);
    save(); render(); toast(`${monthNo(ym)}월 실비 청구를 ${edit ? '저장' : '추가'}했습니다.`);
  }
  draw();
}
