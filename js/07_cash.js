/* 유성 현장 관리 프로그램 — 전도금 탭
 * (원래 app.js 의 화면 부분. 모든 js/*.js 는 같은 전역 공간을 공유하며 html 에 적힌 순서대로 읽힘) */
'use strict';


/* ================= 전도금 ================= */
function cashSummary(sid, ym) {
  const before = db.tx.filter(t => t.siteId === sid && t.src === 'cash' && ymOf(t.date) < ym);
  const cur = db.tx.filter(t => t.siteId === sid && t.src === 'cash' && ymOf(t.date) === ym);
  const carry = sum(before.filter(t => t.kind === 'in'), t => t.amount) - sum(before.filter(t => t.kind !== 'in'), t => t.amount);
  const inn = sum(cur.filter(t => t.kind === 'in'), t => t.amount);
  const out = sum(cur.filter(t => t.kind !== 'in'), t => t.amount);
  const total = sum(db.tx.filter(t => t.siteId === sid && t.src === 'cash' && t.kind !== 'in' && ymOf(t.date) <= ym), t => t.amount);
  return { carry, inn, out, balance: carry + inn - out, total, list: cur };
}
function cashClaim(ym) {
  const c = nest(db.cashClaim, db.cur, ym);
  c.req = c.req || {}; c.extra = c.extra || 0; c.extraMemo = c.extraMemo || '';
  return c;
}
function viewCash() {
  if (state.pmSynced !== db.cur && FS.ready) { state.pmSynced = db.cur; setTimeout(() => pmSyncFolder(true), 50); }   // 청구 대장 스캔본 (14 viewPumui 와 같이)
  const ym = state.ym;
  const cs = cashSummary(db.cur, ym);
  const list = cs.list.slice().sort((a, b) => (a.date + (a.kind === 'in' ? '0' : '1')).localeCompare(b.date + (b.kind === 'in' ? '0' : '1')));
  let bal = cs.carry;
  // 여러 건 선택 삭제 (법인카드와 같은 state.cardSel · 17 delSelTx) · 줄 오른쪽 클릭 = 한 건 삭제 (18 contextmenu)
  const sel = state.cardSel = new Set(list.map(t => t.id).filter(id => state.cardSel && state.cardSel.has(id)));
  state.cardListIds = list.map(t => t.id);
  const rows = list.map((t, i) => {
    bal += t.kind === 'in' ? t.amount : -t.amount;
    return `<tr class="${t.kind !== 'in' && !t.cat ? 'unset' : ''}" data-txid="${t.id}">
      <td class="center muted">${i + 1}</td>
      <td><input type="date" value="${t.date}" data-ch="tx" data-id="${t.id}" data-f="date" data-fid="d${t.id}"></td>
      <td><select data-ch="tx" data-id="${t.id}" data-f="kind" data-fid="n${t.id}"><option value="out" ${t.kind !== 'in' ? 'selected' : ''}>지출</option><option value="in" ${t.kind === 'in' ? 'selected' : ''}>입금</option></select></td>
      <td style="min-width:96px">${t.kind === 'in' ? '<span class="muted small">-</span>' : `<select data-ch="tx" data-id="${t.id}" data-f="cat" data-fid="k${t.id}">${catOptions(t.cat)}</select>`}</td>
      <td style="min-width:80px"><input value="${esc(t.merchant)}" data-ch="tx" data-id="${t.id}" data-f="merchant" data-fid="m${t.id}"></td>
      <td style="min-width:150px"><input value="${esc(t.memo)}" data-ch="tx" data-id="${t.id}" data-f="memo" data-memo="1" data-fid="o${t.id}">${txNote(t)}</td>
      <td class="num" style="min-width:84px"><input class="num${t.kind === 'in' ? ' cash-in' : ''}" value="${fmt(t.amount)}" data-ch="tx" data-id="${t.id}" data-f="amount" data-fid="a${t.id}" title="${t.kind === 'in' ? '입금' : '사용'} 금액"></td>
      <td class="num">${fmt(bal)}</td>
      ${t.kind === 'in' ? '<td></td>' : rcCell(t)}
      <td class="center nowrap"><input type="checkbox" ${sel.has(t.id) ? 'checked' : ''} data-ch="cardSel" data-id="${t.id}" title="삭제할 내역 선택"></td></tr>`;
  }).join('');
  const selN = list.filter(t => sel.has(t.id)).length, selAll = list.length && selN === list.length;

  const cc = cashClaim(ym), claimAmt = cashClaimAmt(ym);
  const unsetAmt = sum(cs.list.filter(t => t.kind !== 'in' && !t.cat), t => t.amount);
  const chg = cc.closed && cc.closedAmt !== undefined && Math.round(cc.closedAmt) !== Math.round(claimAmt);
  // 월초 정산 (1일~말일 사용분, 매달) + 잔액이 적으면 추가 신청 (cashAddOn)
  const low = cs.balance < cashLowOf(), add = cashAddOn(ym);
  const claimBar = `<div class="banner ${chg || (!cc.closed && low) ? 'warn' : cc.closed ? 'ok' : 'info'} row" style="align-items:center;gap:10px">
      <div class="grow"><b>${monthNo(ym)}월 전도금 정산</b> · 사용 ${fmt(cs.out)}원 · 잔액 <b>${fmt(cs.balance)}원${cs.balance < 0 ? ' (마이너스)' : ''}</b>
        · 추가 신청 ${add ? `<b>${fmt(claimAmt)}원</b>` : '<span class="muted">안 함</span>'}
        ${cc.closed ? `<span class="badge ok">정산 마감 ${esc(cc.closedAt || '')}</span>` : '<span class="badge warn">정산 전</span>'} ${pmBadge('cash', ym)}
        ${!cc.closed && low && cc.add === undefined ? `<div class="small">잔액이 ${fmt(cashLowOf())}원보다 적습니다 — 정산하면서 추가 신청하세요.</div>` : ''}
        ${chg ? `<div class="small">마감한 뒤 내역이 바뀌어 추가 신청 금액이 ${fmt(cc.closedAmt)}원 → ${fmt(claimAmt)}원이 되었습니다. 정산 창에서 확인 후 다시 인쇄하세요.</div>` : ''}</div>
      <button class="btn primary" data-act="cashClaimOpen">📝 전도금 정산${cc.closed ? ' (보기·인쇄)' : ''}</button></div>`;

  return `
    ${pageHead(`${ymLabel(ym)} 전도금 정산`, `${ym}-01 ~ ${ym}-${daysIn(ym)}`,
    BTN('addTx', '+ 지출', 'data-src="cash" data-kind="out"', 'primary') + BTN('addTx', '+ 전도금 입금', 'data-src="cash" data-kind="in"') + BTN('ocrRc', '영수증 사진으로 입력', 'data-src="cash" title="영수증 사진을 올리면 날짜·가맹점·금액을 읽어 지출 내역을 만들어 줍니다"')
    + BTN('importCash', '엑셀 불러오기', 'title="기존 전도금 장부(엑셀)를 옮겨 올 때"')
    + MENU('인쇄', [MI('rcPrint', '증빙철 인쇄', 'data-src="cash"', '사진 영수증 + 사진 없는 내역의 붙임 칸'), MI('photoPrint', '입고사진 정리 (인쇄·PDF)', '', '날짜별 소모품·비품 사진')])
    + MENU('저장', [MI('exportCash', '엑셀로 저장', '', '집행내역 · 청구서'), MI('photoPpt', '입고사진 PPT 파일', '', '파워포인트 (슬라이드마다 1건)')]))}
    ${dupBanner('cash')}
    <div class="stats">
      <div class="stat"><div class="k">전월 이월 잔액</div><div class="v">${fmt(cs.carry)}</div></div>
      <div class="stat"><div class="k">당월 입금</div><div class="v">${fmt(cs.inn)}</div></div>
      <div class="stat"><div class="k">당월 사용</div><div class="v">${fmt(cs.out)}</div></div>
      <div class="stat"><div class="k">현재 잔액</div><div class="v">${fmt(cs.balance)}</div></div>
      ${unsetAmt ? `<div class="stat warn"><div class="k">세목 미지정</div><div class="v">${fmt(unsetAmt)}</div></div>` : ''}
      ${(() => { const n = cs.list.filter(t => t.kind !== 'in' && !(t.receipts || []).length).length; return n ? `<div class="stat warn"><div class="k">영수증 없음</div><div class="v">${n}건</div></div>` : ''; })()}
    </div>
    ${cashIssueBanner(cs.list.filter(t => t.kind !== 'in'))}
    ${claimBar}
    <div>
        ${quickBar(['중식/', '석식/', '간식/'], list.length ? `<button class="btn sm danger" data-act="delSelTx" style="margin-left:8px;flex:none;${selN ? '' : 'visibility:hidden'}" title="오른쪽 끝 칸에서 체크한 내역 삭제">선택한 ${selN}건 삭제</button>` : '')}
        <div class="tbl-wrap"><table class="t cash-tx"><thead><tr><th>#</th><th>일자</th><th>구분</th><th>세목</th><th>거래처</th><th>거래내용</th><th title="입금은 파란 글씨">금액</th><th>잔액</th><th>영수증</th><th class="center nowrap">${list.length ? `<input type="checkbox" ${selAll ? 'checked' : ''} data-ch="cardSelAll" title="전체 선택 / 해제">` : ''}</th></tr></thead>
        <tbody><tr class="sub"><td></td><td colspan="6">전월 이월</td><td class="num">${fmt(cs.carry)}</td><td colspan="2"></td></tr>${rows}
        <tr class="sum"><td></td><td colspan="5">합계</td><td class="num">${fmt(cs.out)}${cs.inn ? `<div class="small cash-in">입금 ${fmt(cs.inn)}</div>` : ''}</td><td class="num">${fmt(cs.balance)}</td><td colspan="2"></td></tr></tbody></table></div>
        <p class="hint">🧾 영수증: 줄 선택 후 <b>Ctrl+V</b> (선택 안 하면 새 줄로) · 끌어다 놓기 가능 · 줄에서 <b>오른쪽 클릭</b> = 그 한 건 삭제 · 여러 건은 오른쪽 끝 칸 체크 → [선택한 N건 삭제]</p>
        ${(() => {   // 전도금 청구 대장 (J번호 자금청구서 — 품의서 대장에서 뺐음, 14 pmListTable)
          const J = pmAll().filter(p => p.kind === 'cash').sort((a, b) => pmJNo(b) - pmJNo(a));
          return `<h3 style="margin:18px 0 6px">전도금 청구 대장 <span class="muted small" style="font-weight:400">다음 번호 J${pad2(pmNextJ())} · [📝 전도금 정산]에서 인쇄하면 등록됩니다</span></h3>
            ${pmListTable(J, '아직 등록된 전도금 청구서가 없습니다.')}`;
        })()}
        ${filesPanel('cash', '거래명세서·계좌 내역 등', ['cash'])}
    </div>`;
}
/* 전도금 정산 (매달 월초, 1일~말일 사용분) — 잔액이 적으면 추가 신청 (cc.add)
   추가 신청 금액 = 세목별 신청 금액 − 잔액 (안 하면 0) · cc.closed = 정산 마감 (closedAmt = 마감 때 추가 신청 금액)
   (예전 "전도금 외 결제내역" cc.extra 는 쓰지 않음) */
const cashLowOf = () => (site().cashLow ?? 100000);   // 이 금액보다 잔액이 적으면 추가 신청 안내 (현장별, 정산 창에서 고침)
function cashAddOn(ym) {   // 추가 신청 여부: 정산 창에서 고른 값, 안 골랐으면 잔액이 적거나 신청 금액을 적어 둔 경우
  const cc = cashClaim(ym);
  return cc.add !== undefined ? !!cc.add : (cashSummary(db.cur, ym).balance < cashLowOf() || sum(SUBS, s => cc.req[s]) > 0);
}
function cashClaimAmt(ym) {
  const cc = cashClaim(ym);
  return cashAddOn(ym) ? sum(SUBS, s => cc.req[s]) - cashSummary(db.cur, ym).balance : 0;
}
function cashClaimDialog() {
  const ym = state.ym, cs = cashSummary(db.cur, ym), cc = cashClaim(ym), lock = !!cc.closed, dis = lock ? 'disabled' : '';
  const d = nest(db.docs, db.cur, ym, 'cash'), date = d.date || todayStr(), no = d.no || pmDocNoFor('cash', ym, date);
  const by = {}; SUBS.forEach(s => by[s] = 0);
  cs.list.filter(t => t.kind !== 'in').forEach(t => { by[t.cat || '기타'] = (by[t.cat || '기타'] || 0) + t.amount; });
  const pm = pmAll().find(x => x.kind === 'cash' && x.linkYm === ym), add = cashAddOn(ym), low = cs.balance < cashLowOf();
  const rows = CATS.map(c => c.s.map((s, i) => `<tr><td class="muted">${i === 0 ? c.g : ''}</td><td>${s}</td><td class="num">${fmt0(by[s]) || '-'}</td>
      ${add ? `<td style="width:140px"><input class="num" value="${fmt0(cc.req[s])}" data-cq="${s}" placeholder="-" ${dis}></td>` : ''}</tr>`).join('')).join('');
  const body = `<div class="cq">
    <div class="row small muted" style="gap:14px;flex-wrap:wrap;margin-bottom:8px"><span>${esc(site().name)} · ${ymLabel(ym)} 사용분 (${ym}-01 ~ ${ym}-${daysIn(ym)})</span>
      ${lock ? `<span class="badge ok">정산 마감 ${esc(cc.closedAt || '')}</span>` : '<span class="badge warn">정산 전</span>'}
      ${pm ? `<span class="badge ${pm.status === '결재완료' ? 'ok' : 'warn'}">결재 ${esc(pm.status)}</span>` : '<span class="badge">결재 전 (인쇄하면 품의 대장에 등록)</span>'}</div>
    <div class="stats" style="margin:0 0 10px">
      <div class="stat"><div class="k">전월 이월</div><div class="v">${fmt(cs.carry)}</div></div>
      <div class="stat"><div class="k">당월 입금</div><div class="v">${fmt(cs.inn)}</div></div>
      <div class="stat"><div class="k">당월 사용</div><div class="v">${fmt(cs.out)}</div></div>
      <div class="stat"><div class="k">잔액</div><div class="v">${fmt(cs.balance)}</div></div>
      <div class="stat"><div class="k">총 누계(사용)</div><div class="v">${fmt(cs.total)}</div></div></div>
    <div class="cq-add ${low ? 'low' : ''}">
      <div class="grow"><b>추가 신청</b> <span class="small">${low ? `잔액 ${fmt(cs.balance)}원 — 기준 ${fmt(cashLowOf())}원보다 적어 추가 신청이 필요해 보입니다.` : `잔액 ${fmt(cs.balance)}원이 남아 있어 보통은 추가 신청하지 않습니다.`}</span></div>
      <span class="my-seg"><button class="btn sm ${add ? 'ghost' : 'primary'}" data-cqadd="0" ${dis}>안 함</button><button class="btn sm ${add ? 'primary' : 'ghost'}" data-cqadd="1" ${dis}>추가 신청</button></span></div>
    ${add ? `<div class="row" style="gap:8px;margin:8px 0 6px"><b class="grow">세목별 신청 금액</b>
      <button class="btn sm" data-cqf="used" ${dis} title="빈 칸에 이번 달 사용 금액을 넣습니다">빈 칸 = 이번 달 사용액</button>
      <button class="btn sm ghost" data-cqf="prev" ${dis} title="빈 칸에 지난달 신청 금액을 넣습니다">빈 칸 = 지난달 신청액</button></div>` : '<div style="margin-top:8px"><b>세목별 정산 (사용 금액)</b></div>'}
    <div class="tbl-wrap"><table class="t tight"><thead><tr><th>계정과목</th><th>세목</th><th>당월 정산(사용)</th>${add ? '<th>신청 금액</th>' : ''}</tr></thead>
      <tbody>${rows}<tr class="sum"><td colspan="2">소계</td><td class="num">${fmt(cs.out)}</td>${add ? '<td class="num" id="cqReq"></td>' : ''}</tr></tbody></table></div>
    <div class="form-grid" style="margin-top:10px">
      <label>문서번호<input id="docNo" value="${esc(no)}"></label>
      <label>기안일자<input id="docDate" type="date" value="${esc(date)}"></label>
      <label>추가 신청 안내 기준 <span class="muted small">(잔액이 이보다 적으면)</span><input class="num" id="cqLow" value="${fmt(cashLowOf())}"></label></div>
    ${add ? `<div class="cq-total">추가 신청 금액 <span class="muted small">(신청 소계 − 잔액 ${fmt(cs.balance)})</span> <b id="cqAmt"></b></div>` : ''}
    <div class="small" style="margin-top:8px">인쇄할 양식: <label><input type="checkbox" id="pClaim" checked> 전도금 청구서</label> <label><input type="checkbox" id="pExp" ${add ? 'checked' : ''}> 지출결의서${add ? '' : ' <span class="muted">(추가 신청할 때)</span>'}</label> <label><input type="checkbox" id="pList" checked> 전도금 집행내역</label></div>
    <p class="muted small">순서: 사용 내역 확인 → ${add ? '신청 금액 입력 → ' : ''}<b>인쇄</b>해서 결재 받기 → <b>정산 마감</b> (마감하면 잠깁니다. 결재 스캔본은 품의서 탭에 올리세요.)</p></div>`;
  const keepInfo = root => { d.no = $('#docNo', root).value.trim(); d.date = $('#docDate', root).value || todayStr(); site().cashLow = toNum($('#cqLow', root).value); };
  const root = modal(`${ymLabel(ym)} 전도금 정산`, body, [
    { label: '닫기', onClick: r => { keepInfo(r); save(); render(); } },
    { label: lock ? '마감 해제' : '정산 마감', cls: lock ? 'danger' : '', onClick: r => {
      keepInfo(r);
      if (lock) { delete cc.closed; delete cc.closedAmt; delete cc.closedAt; toast('전도금 정산 마감을 해제했습니다.'); }
      else { cc.add = cashAddOn(ym); cc.closed = true; cc.closedAmt = cashClaimAmt(ym); cc.closedAt = todayStr(); toast(`${monthNo(ym)}월 전도금 정산을 마감했습니다 · ${cc.add ? `추가 신청 ${fmt(cc.closedAmt)}원` : '추가 신청 없음'}`); }
      save(); render(); setTimeout(cashClaimDialog, 0); } },
    { label: '인쇄 (결재용)', cls: 'primary', onClick: r => {
      keepInfo(r); save();
      const docs = [];
      if ($('#pClaim', r).checked) docs.push(docCashClaim(ym, d.no, d.date));
      if ($('#pExp', r).checked) docs.push(cashExpDoc(ym, d.date));
      if ($('#pList', r).checked) docs.push(docCashList(ym));
      if (!docs.length) { toast('인쇄할 양식을 고르세요.'); return true; }
      printDocs(docs);
      const [amt, title] = pmLinkInfo('cash', ym); pmRegisterDoc('cash', ym, d.no, d.date, amt, title);
      setTimeout(render, 0); toast(`품의 대장에 ${d.no} 로 등록했습니다. 결재 후 스캔본을 올리세요.`); } }]);
  root.querySelector('.modal').classList.add('cq-modal');
  const calc = () => { if (!$('#cqAmt', root)) return; $('#cqReq', root).textContent = fmt(sum(SUBS, s => cc.req[s])); $('#cqAmt', root).textContent = `${fmt(cashClaimAmt(ym))}원`; };
  root.querySelectorAll('[data-cqadd]').forEach(b => b.addEventListener('click', () => { keepInfo(root); cc.add = b.dataset.cqadd === '1'; save(); cashClaimDialog(); }));
  root.querySelectorAll('[data-cq]').forEach(el => el.addEventListener('change', () => { cc.req[el.dataset.cq] = toNum(el.value); el.value = fmt0(cc.req[el.dataset.cq]); save(); calc(); }));
  root.querySelectorAll('[data-cqf]').forEach(b => b.addEventListener('click', () => {
    keepInfo(root); const prev = ((db.cashClaim[db.cur] || {})[ymAdd(ym, -1)] || {}).req || {}; let n = 0;
    SUBS.forEach(s => { const v = b.dataset.cqf === 'used' ? by[s] : toNum(prev[s]); if (!toNum(cc.req[s]) && v) { cc.req[s] = v; n++; } });
    save(); toast(n ? `${n}개 세목을 채웠습니다.` : '채울 빈 칸이 없습니다.'); cashClaimDialog();
  }));
  calc();
}

async function importCashFile() {
  const files = await pickFile('.xls,.xlsx,.csv', false);
  if (!files.length) return;
  const buf = await files[0].arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  let best = null;
  const names = wb.SheetNames.filter(n => /전도금/.test(n) && !/청구|결의/.test(n));   // 카드·전도금이 한 파일이면 전도금 시트만
  for (const name of (names.length ? names : wb.SheetNames)) {
    const aoa = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: '' });
    const r = parseCardSheet(aoa, state.ym);
    if (r.ok && (!best || r.rows.length > best.rows.length)) best = r;
  }
  if (!best) { toast('머리글(일자/금액)을 찾지 못했습니다.'); return; }
  const inMonth = best.rows.filter(x => ymOf(x.date) === state.ym);
  const all = await new Promise(res => modal('전도금 엑셀 불러오기', `<p>${best.rows.length}건을 인식했습니다. (${ymLabel(state.ym)} ${inMonth.length}건)</p>
      <p class="muted small">처음 옮길 때는 <b>전체 가져오기</b> (이월 잔액이 맞게 계산됨)</p>`,
    [{ label: '취소', onClick: () => res(null) }, { label: `${monthNo(state.ym)}월분만`, onClick: () => res(false) }, { label: '전체 가져오기', cls: 'primary', onClick: () => res(true) }]));
  if (all === null) return;
  const rows = all ? best.rows : inMonth;
  const pool = {}; db.tx.filter(t => t.siteId === db.cur && t.src === 'cash').forEach(t => { const k = [t.date, t.kind, Math.round(t.amount)].join('|'); (pool[k] = pool[k] || []).push(t); });
  let added = 0, dup = 0; const rules = parseMemoRules(db.settings.memoRules);
  rows.forEach(x => {
    const kind = x.kind === 'in' || /전도금\s*입금/.test(x.memo) ? 'in' : 'out';
    const c = pool[[x.date, kind, Math.round(x.amount)].join('|')];
    if (c && c.length) { c.shift(); dup++; return; }
    const t = { id: uid(), siteId: db.cur, src: 'cash', kind, date: x.date, time: '', card: '', merchant: x.merchant, amount: x.amount, cat: kind === 'in' ? '' : x.cat, memo: x.memo };
    if (kind !== 'in') { applyMemoRule(t, rules); if (!t.cat) t.cat = guessCat(t, db.merchantMap); }
    db.tx.push(t); added++;
  });
  save(); render(); toast(`${added}건을 가져왔습니다${dup ? ` · 이미 있는 ${dup}건 건너뜀` : ''}`);
}
