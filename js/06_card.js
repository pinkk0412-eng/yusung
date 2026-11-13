/* 유성 현장 관리 프로그램 — 법인카드 탭, 카드 엑셀 가져오기, 중복 정리
 * (원래 app.js 의 화면 부분. 모든 js/*.js 는 같은 전역 공간을 공유하며 html 에 적힌 순서대로 읽힘) */
'use strict';


/* ================= 법인카드 ================= */
/* 시행사 청구: t.claim(청구 가능) · t.claimAmt(청구 금액, 비우면 전액) → 미청구 = 금액 − 청구 (소모품 등 청구 못 하는 부분)
 * 공급가·부가세 = 금액 ÷ 11 자동, t.noVat(면세)이면 부가세 0 · 카드 월 한도 = db.cards[].limit (비우면 200만원) */
const CARD_LIMIT = 2000000;
const cardVat = t => (t.noVat ? 0 : Math.round(toNum(t.amount) / 11));
const cardClaim = t => (!t.claim ? 0 : String(t.claimAmt ?? '').trim() !== '' ? toNum(t.claimAmt) : toNum(t.amount));
const cardUnclaim = t => toNum(t.amount) - cardClaim(t);
const cardLimit = id => toNum((siteCards().find(c => c.last4 === id) || {}).limit) || CARD_LIMIT;
function cardLimitInfo(all, cardIds) {   // 카드별 이번 사용기간 사용액 / 한도
  return cardIds.filter(Boolean).map(id => { const used = sum(all.filter(t => t.card === id && t.kind !== 'in'), t => t.amount), lim = cardLimit(id); return { id, used, lim, pct: lim ? used / lim : 0 }; });
}
function viewCard() {
  const ym = state.ym, cards = siteCards();
  let list = txOf(ym, 'card');
  const all = list;
  if (state.cardFilter) list = list.filter(t => t.card === state.cardFilter);
  const issues = issueCount(list);
  if (state.cardIssue && ISSUE[state.cardIssue]) list = list.filter(ISSUE[state.cardIssue].f);
  list.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  const cardIds = [...new Set([...cards.map(c => c.last4), ...all.map(t => t.card).filter(Boolean)])];
  // 삭제 선택: 지금 보이는 줄만 남김 (달·현장·필터를 바꾸면 안 보이는 선택은 풀림)
  const sel = state.cardSel = new Set(list.map(t => t.id).filter(id => state.cardSel && state.cardSel.has(id)));
  state.cardListIds = list.map(t => t.id);

  const rows = list.map((t, i) => `<tr class="${t.cat ? '' : 'unset'}${(t.receipts || []).length ? '' : ' norc'}" data-txid="${t.id}" ${(t.receipts || []).length ? '' : 'title="영수증 없음"'}>
      <td class="center muted">${i + 1}</td>
      <td><input type="date" value="${t.date}" data-ch="tx" data-id="${t.id}" data-f="date" data-fid="d${t.id}"></td>
      <td class="muted small">${esc(t.time)}</td>
      <td><select data-ch="tx" data-id="${t.id}" data-f="card" data-fid="c${t.id}">${cardIds.map(c => `<option ${c === t.card ? 'selected' : ''}>${c}</option>`).join('')}${t.card ? '' : '<option selected value="">?</option>'}</select></td>
      <td><input value="${esc(t.merchant)}" data-ch="tx" data-id="${t.id}" data-f="merchant" data-fid="m${t.id}"></td>
      <td><input class="num" value="${fmt(t.amount)}" data-ch="tx" data-id="${t.id}" data-f="amount" data-fid="a${t.id}"></td>
      <td><select data-ch="tx" data-id="${t.id}" data-f="cat" data-fid="k${t.id}">${catOptions(t.cat)}</select></td>
      <td style="min-width:260px"><textarea class="memo2" rows="1" data-ch="tx" data-id="${t.id}" data-f="memo" data-memo="1" data-fid="o${t.id}" placeholder="예) 중식/홍길동,김철수">${esc(t.memo)}</textarea>${txNote(t)}</td>
      ${claimOn() ? `<td class="center nowrap"><input type="checkbox" ${t.claim ? 'checked' : ''} data-ch="tx" data-id="${t.id}" data-f="claim" title="시행사 청구 가능">${t.claim ? `<input class="num" style="width:78px;margin-left:3px" value="${String(t.claimAmt ?? '').trim() !== '' ? fmt(t.claimAmt) : ''}" placeholder="${fmt(t.amount)}" data-ch="tx" data-id="${t.id}" data-f="claimAmt" data-fid="ca${t.id}" title="청구 금액 (비우면 전액) — 일부만 청구하면 나머지는 미청구"><label class="small muted" style="margin-left:3px" title="면세 — 부가세 0 (엑셀 공급가·부가세 칸)"><input type="checkbox" ${t.noVat ? 'checked' : ''} data-ch="tx" data-id="${t.id}" data-f="noVat">면세</label>` : ''}</td>` : ''}
      ${rcCell(t)}
      <td class="center nowrap"><input type="checkbox" ${sel.has(t.id) ? 'checked' : ''} data-ch="cardSel" data-id="${t.id}" title="삭제할 내역 선택"></td></tr>`).join('');
  const selN = list.filter(t => sel.has(t.id)).length, selAll = list.length && selN === list.length;

  // 집계
  const agg = cardAggregate(all, cardIds);
  const used = s => sum(cardIds, id => agg[id][s]);   // 화면에는 사용한 과목만 (인쇄본은 전체)
  const aggRows = CATS.filter(c => c.s.some(used)).map(c => {
    const subRows = c.s.filter(used).map(s => `<tr><td>${c.s.length > 1 ? '' : c.g}</td><td>${c.s.length > 1 ? s : ''}</td>${cardIds.map(id => `<td class="num">${fmt0(agg[id][s])}</td>`).join('')}<td class="num"><b>${fmt0(sum(cardIds, id => agg[id][s]))}</b></td></tr>`);
    if (c.s.length > 1) subRows.unshift(`<tr class="sub"><td colspan="2">${c.g}</td>${cardIds.map(id => `<td class="num">${fmt0(sum(c.s, s => agg[id][s]))}</td>`).join('')}<td class="num">${fmt0(sum(c.s, s => sum(cardIds, id => agg[id][s])))}</td></tr>`);
    return subRows.join('');
  }).join('');
  const unsetAgg = cardIds.map(id => agg[id]['']);
  const limits = cardLimitInfo(all, cardIds), over = limits.filter(x => x.pct >= 0.9);
  const limitBanner = over.length ? `<div class="banner warn small">카드 월 한도 ${over.map(x => `<b>${esc(x.id)}</b> 사용 ${fmt(x.used)}원 / 한도 ${fmt(x.lim)}원 (${x.used > x.lim ? `초과 ${fmt(x.used - x.lim)}원` : `남은 ${fmt(x.lim - x.used)}원`})`).join(' · ')} — 사용기간 ${cardPeriod(ym)}</div>` : '';

  return `
    ${pageHead(`${ymLabel(ym)} 법인카드 ${cardCalView() ? '사용내역' : '정산'}`, `사용기간 ${cardPeriod(ym)} ${(() => { const st = cardStartSet(db.cur); return st > 1 ? `<span class="subtabs" style="display:inline-flex;margin:0 0 0 8px;vertical-align:middle">
        <button class="${cardCalView() ? '' : 'active'}" data-act="cardCal" data-v="" title="정산·집계표 기준 (20일쯤 받는 엑셀)">${st}일~익월${st - 1}일 (정산)</button><button class="${cardCalView() ? 'active' : ''}" data-act="cardCal" data-v="1" title="월초에 받는 엑셀">1일~말일</button></span>` : ''; })()}`,
    BTN('importCard', '카드사 엑셀 불러오기', '', 'primary') + BTN('ocrRc', '영수증 사진 올리기', 'data-src="card" title="영수증 사진 여러 장을 한 번에 올리면 금액·날짜로 맞는 내역에 자동으로 붙입니다"') + BTN('addTx', '+ 직접 입력', 'data-src="card"') + BTN('autoCat', '자동 분류')
    + MENU('인쇄', [MI('printCard', '집계표 인쇄', '', '카드별 월별 사용집계표 · 사용내역 명세'), MI('rcPrint', '증빙철 인쇄', 'data-src="card"', '사진 영수증 + 사진 없는 내역의 붙임 칸'), MI('prepayDoc', '선결제 지출결의서', '', '카드·기간 사용 합계 한 줄 (회사 양식)'), MI('photoPrint', '입고사진 정리 (인쇄·PDF)', '', '날짜별 소모품·비품 사진')])
    + MENU('저장', [MI('exportCard', '엑셀로 저장', '', '집계표 · 카드별 지출내역'), MI('photoPpt', '입고사진 PPT 파일', '', '파워포인트 (슬라이드마다 1건)')]))}
    ${dupBanner('card')}${limitBanner}${cardPmBanner(ym)}
    <div class="sumbar">
      <div class="sb"><span>건수</span><b>${list.length}건</b></div>
      <div class="sb"><span>사용 합계</span><b>${fmt(sum(list, t => t.amount))}</b></div>
      ${claimOn() ? `<div class="sb"><span>시행사 청구</span><b>${fmt(sum(list, cardClaim))}</b></div><div class="sb"><span>미청구</span><b>${fmt(sum(list, cardUnclaim))}</b></div>` : ''}      <label class="sb sb-sel">카드 <select data-ch="cardFilter"><option value="">전체</option>${cardIds.map(c => `<option ${c === state.cardFilter ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
    </div>
    <div class="issuebar">${(() => { const on = Object.entries(ISSUE).filter(([k]) => issues[k] || state.cardIssue === k);
    return on.length ? `<span class="ib-l">남은 일</span><button class="ib ${state.cardIssue ? '' : 'active'}" data-act="cardIssue" data-v="">전체 보기</button>${on.map(([k, v]) => `<button class="ib warn ${state.cardIssue === k ? 'active' : ''}" data-act="cardIssue" data-v="${k}" ${v.title ? `title="${v.title}"` : ''}>${v.label} <b>${issues[k]}</b></button>`).join('')}`
      : '<span class="ib ok">✓ 남은 일 없음 — 정산 준비 끝</span>'; })()}</div>
    ${quickBar(['중식/', '석식/', '간식/'], list.length ? `<button class="btn sm danger" data-act="delSelTx" style="margin-left:8px;flex:none;${selN ? '' : 'visibility:hidden'}" title="오른쪽 끝 칸에서 체크한 내역 삭제">선택한 ${selN}건 삭제</button>` : '')}
    <div class="tbl-wrap"><table class="t tight"><thead><tr><th>#</th><th>일자</th><th>시간</th><th>카드</th><th>가맹점</th><th>금액</th><th>세목</th><th>사용내역 (구분/사용자)</th>${claimOn() ? '<th title="시행사 청구 가능">청구</th>' : ''}<th>영수증</th><th class="center nowrap">${list.length ? `<input type="checkbox" ${selAll ? 'checked' : ''} data-ch="cardSelAll" title="전체 선택 / 해제">` : ''}</th></tr></thead>
      <tbody>${rows || `<tr><td colspan="${claimOn() ? 11 : 10}" class="center muted" style="padding:30px">이 달의 카드 내역이 없습니다. 카드사 홈페이지에서 받은 엑셀 파일을 <b>카드사 엑셀 불러오기</b>로 넣으세요.</td></tr>`}</tbody></table></div>
    <p class="hint">🧾 영수증: 줄 선택 후 <b>Ctrl+V</b> (선택 안 하면 자동 연결) · 끌어다 놓기 가능 · 줄에서 <b>오른쪽 클릭</b> = 그 한 건 삭제 메뉴</p>
    ${(() => {   // 20만원 이상 사용내역서: 건마다 작성·인쇄 (인쇄 메뉴에서 옮겨 옴)
      const u2 = all.filter(isU200).sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
      if (!u2.length) return '';
      return `<h3>20만원 이상 사용내역서 <span class="muted small">${u2.length}건 · 작성 ${u2.filter(u200Done).length}건 — 회사 양식 + 영수증, 한 건씩 인쇄</span></h3>
    <div class="tbl-wrap" style="max-width:900px"><table class="t"><thead><tr><th>일자</th><th>카드</th><th>가맹점</th><th>금액</th><th>사용목적</th><th>상태</th><th></th></tr></thead><tbody>
      ${u2.map(t => `<tr><td class="nowrap">${esc(t.date.slice(5).replace('-', '.'))}</td><td>${esc(t.card || '')}</td><td>${esc(t.merchant || '')}</td><td class="num">${fmt(t.amount)}</td><td class="small">${esc((t.u200 || {}).purpose || '')}</td>
        <td class="center nowrap">${u200Done(t) ? '<span class="mw ok">작성됨</span>' : '<span class="mw warn">작성 필요</span>'}</td>
        <td class="nowrap"><button class="btn sm" data-act="u200Edit" data-id="${t.id}">${u200Done(t) ? '고치기' : '작성'}</button> <button class="btn sm primary" data-act="u200One" data-id="${t.id}">인쇄</button></td></tr>`).join('')}
    </tbody></table></div>`; })()}
    ${filesPanel('card', '카드사 명세서 PDF·거래명세서 등', ['card', 'card200', 'prepay'])}
    <h3>법인카드 월별 사용 집계표 <span class="muted small">사용한 과목만 표시 (인쇄하면 전체 과목)</span></h3>
    <div class="tbl-wrap"><table class="t"><thead><tr><th colspan="2">계정과목</th>${cardIds.map(c => `<th>카드 ${c}</th>`).join('')}<th>합계</th></tr></thead>
      <tbody>${aggRows}
      ${sum(unsetAgg) ? `<tr class="unset"><td colspan="2">미분류</td>${unsetAgg.map(v => `<td class="num">${fmt0(v)}</td>`).join('')}<td class="num">${fmt0(sum(unsetAgg))}</td></tr>` : ''}
      <tr class="sum"><td colspan="2">합계</td>${cardIds.map(id => `<td class="num">${fmt(agg[id].total)}</td>`).join('')}<td class="num">${fmt(sum(cardIds, id => agg[id].total))}</td></tr></tbody></table></div>
    ${limits.length ? `<h3>카드 월 한도 <span class="muted small">사용기간 ${cardPeriod(ym)} · 한도는 설정 → 법인카드</span></h3>
    <div class="tbl-wrap" style="max-width:560px"><table class="t"><thead><tr><th>카드</th><th>한도</th><th>사용</th><th>남은 금액</th></tr></thead><tbody>
      ${limits.map(x => `<tr><td>${esc(x.id)}</td><td class="num">${fmt(x.lim)}</td><td class="num">${fmt(x.used)}</td><td class="num ${x.used > x.lim ? 'neg' : ''}" ${x.pct >= 0.9 && x.used <= x.lim ? 'style="color:var(--warn);font-weight:700"' : ''}>${x.used > x.lim ? `초과 ${fmt(x.used - x.lim)}` : fmt(x.lim - x.used)}</td></tr>`).join('')}</tbody></table></div>` : ''}`;
}
/* 법인카드 선결제 지출결의서 (회사 정산 파일 "선결제 - 지출결의서" 시트): 적요 "○○현장 법인카드(1858) 선결제" 한 줄 = 고른 카드·기간 사용 합계
 * 결재받은 스캔본은 B. 자금관련/C. 법인카드 선결제 스캔 (아래 파일 칸) */
function prepayDialog() {
  const ym = state.ym, st = cardStart(db.cur), ids = [...new Set([...siteCards().map(c => c.last4), ...txOf(ym, 'card').map(t => t.card).filter(Boolean)])];
  if (!ids.length) { toast('등록된 카드가 없습니다. 설정 → 법인카드에서 카드를 넣으세요.'); return; }
  const p0 = st > 1 ? `${ym}-${pad2(st)}` : `${ym}-01`, p1 = st > 1 ? `${ymAdd(ym, 1)}-${pad2(st - 1)}` : `${ym}-${pad2(daysIn(ym))}`;
  const r = modal('법인카드 선결제 지출결의서', `<div class="form-grid">
      <label>카드<select id="ppC">${ids.map(c => `<option>${esc(c)}</option>`).join('')}</select></label>
      <label>사용 시작일<input id="ppF" type="date" data-rng="from" value="${p0}"></label><label>사용 종료일<input id="ppT" type="date" data-rng="to" value="${p1 > todayStr() ? todayStr() : p1}"></label>
      <label>기안일자<input id="ppD" type="date" value="${todayStr()}"></label>
      <label>선결제 금액 <span class="muted">(비우면 기간 사용 합계)</span><input id="ppA" class="num"></label></div>
    <div id="ppInfo" class="banner info small" style="margin-top:8px"></div>
    <p class="small muted">적요: "${esc(site().name)}현장 법인카드(카드) 선결제" · 결재받은 스캔본은 아래 파일 칸 "법인카드 선결제"에 올리세요.</p>`, [
    { label: '취소' },
    { label: '엑셀로 저장', onClick: root => { const x = read(root); if (!x.amount) { toast('금액이 없습니다.'); return true; } saveXl([['선결제 - 지출결의서', doc(x)]], fname(`법인카드(${x.card}) 선결제 지출결의서`)); } },
    { label: '인쇄', cls: 'primary', onClick: root => { const x = read(root); if (!x.amount) { toast('금액이 없습니다.'); return true; } printDocs([doc(x)]); } }], 'm');
  const used =(c, f, t) => sum(db.tx.filter(x => x.siteId === db.cur && x.src === 'card' && x.kind !== 'in' && x.card === c && x.date >= f && x.date <= t), x => x.amount);
  const read = root => { const v = id => $('#' + id, root).value.trim(), card = v('ppC'), from = v('ppF'), to = v('ppT') || from, u = used(card, from, to); return { card, from, to, date: v('ppD') || todayStr(), used: u, amount: toNum(v('ppA')) || u }; };
  const doc = x => docExpense({ date: x.date, items: [{ label: `${site().name}현장 법인카드(${x.card}) 선결제`, amount: x.amount, note: `${x.from.slice(5).replace('-', '/')}~${x.to.slice(5).replace('-', '/')}` }], note: '', minRows: 4 });
  const info = () => { const x = read(r); $('#ppInfo', r).innerHTML = `카드 ${esc(x.card)} · ${x.from.replace(/-/g, '.')}~${x.to.replace(/-/g, '.')} 사용 <b>${fmt(x.used)}원</b>${x.amount !== x.used ? ` · 선결제 금액 <b>${fmt(x.amount)}원</b>` : ''}`; };
  r.querySelectorAll('#ppC,#ppF,#ppT,#ppA').forEach(el => { el.oninput = info; el.onchange = info; });
  info();
}
// 오픈기간 법인카드 사용 품의: 품의 기간 안의 카드 사용액 ↔ 승인 금액
function cardPmBanner(ym) {
  const st = cardStart(db.cur), p0 = st > 1 ? `${ym}-${pad2(st)}` : `${ym}-01`, p1 = st > 1 ? `${ymAdd(ym, 1)}-${pad2(st - 1)}` : `${ym}-${daysIn(ym)}`;
  const items = pmAll().filter(p => p.tpl === 'opencard' && p.useFrom && (p.useTo || p.useFrom) >= p0 && p.useFrom <= p1);
  return items.map(p => {
    const to = p.useTo || p.useFrom, cards = p.useCards || [];
    const used = sum(db.tx.filter(t => t.siteId === db.cur && t.src === 'card' && t.kind !== 'in' && t.date >= p.useFrom && t.date <= to && (!cards.length || cards.includes(t.card))), t => t.amount);
    const ok = toNum(p.amount), left = ok - used;
    return `<div class="banner ${ok && left < 0 ? 'warn' : 'info'} small">오픈기간 법인카드 품의 <a href="#" data-act="goto" data-tab="pumui">${esc(p.no)}번</a> (${p.useFrom.slice(5).replace('-', '/')}~${to.slice(5).replace('-', '/')}${cards.length ? ` · 카드 ${esc(cards.join(','))}` : ''} · ${esc(p.status)})
        — 사용 <b>${fmt(used)}원</b>${ok ? ` / 승인 ${fmt(ok)}원 · ${left >= 0 ? `남은 금액 ${fmt(left)}원` : `<b>초과 ${fmt(-left)}원</b>`}` : ' (품의 금액을 넣으면 남은 금액이 표시됩니다)'} <button class="btn sm" data-act="pmEdit" data-id="${p.id}" title="품의서 작성 창 → 세부내역 [💳 카드 내역 불러오기]로 이 사용내역을 표에 채움">품의서 열기</button></div>`;
  }).join('');
}
function cashIssueBanner(list) {   // 전도금: 사용내역·식대·입고사진 점검 요약
  const c = issueCount(list), keys = ['memo', 'over', 'cater', 'photo'].filter(k => c[k]);
  return keys.length ? `<div class="issuebar"><span class="ib-l">남은 일</span>${keys.map(k => `<span class="ib warn" style="cursor:default" ${ISSUE[k].title ? `title="${ISSUE[k].title}"` : ''}>${ISSUE[k].label} <b>${c[k]}</b></span>`).join('')}<span class="muted small">— 사용내역 칸 아래 표시를 확인하세요</span></div>` : '';   // 법인카드 탭의 "남은 일" 줄과 같은 모양
}
function cardAggregate(list, cardIds) {
  const agg = {};
  for (const id of cardIds) { agg[id] = { total: 0, '': 0 }; SUBS.forEach(s => agg[id][s] = 0); }
  for (const t of list) { const a = agg[t.card]; if (!a) continue; a[t.cat || ''] = (a[t.cat || ''] || 0) + t.amount; a.total += t.amount; }
  return agg;
}

async function importCardFiles() {
  const files = await pickFile('.xls,.xlsx,.csv', true);
  if (!files.length) return;
  const T0 = performance.now(), sec = ms => (ms / 1000).toFixed(1) + '초';   // 느린 PC 점검용: 단계별 걸린 시간을 끝난 알림에 표시
  const parsed = [];
  for (const f of files) {
    try {
      const buf = await f.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array', cellDates: false });
      // 카드사 엑셀은 보통 시트 1개. 현장 장부처럼 카드별 시트(법인카드_3248 …)가 여러 개면 시트마다 따로 가져옴
      const ok = [];
      for (const [si, name] of wb.SheetNames.entries()) {
        if (/전도금|집계|청구|결의|요약|출근|식대내역/.test(name)) continue;
        if (((wb.Workbook || {}).Sheets || [])[si] && wb.Workbook.Sheets[si].Hidden) continue;   // 숨긴 시트 제외
        const aoa = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: '' });
        const r = parseCardSheet(aoa, state.ym);
        if (r.ok && r.rows.length) ok.push({ ...r, sheet: name });
      }
      const cardSheets = ok.filter(r => /\d{4}/.test(r.sheet));
      const use = cardSheets.length > 1 ? cardSheets : ok.length ? [ok.reduce((a, b) => (b.rows.length > a.rows.length ? b : a))] : [null];
      use.forEach(r => parsed.push({ file: f.name + (r && use.length > 1 ? ` › ${r.sheet}` : ''), res: r, guessCard: ((r && use.length > 1 ? r.sheet : f.name).match(/(\d{4})/) || [])[1] || (f.name.match(/(\d{4})/) || [])[1] || '' }));
    } catch (e) { parsed.push({ file: f.name, res: { ok: false, error: e.message } }); }
  }
  const tRead = performance.now() - T0;
  const cards = siteCards().map(c => c.last4);
  // 지금 보는 기간 안의 내역인지 ([1일~말일] 보기면 달력 월, 아니면 정산 기간·귀속월)
  const inView = x => (cardCalView() ? ymOf(x.date) : x.bm || cardYm(x.date, cardStartSet(db.cur))) === state.ym;
  const body = parsed.map((p, i) => {
    if (!p.res || !p.res.ok) return `<div class="banner warn">${esc(p.file)} — 읽을 수 없습니다. ${esc(p.res && p.res.error || '')}</div>`;
    const r = p.res;
    const noCard = r.rows.some(x => !x.card);
    const inMonth = r.rows.filter(inView).length;
    return `<div class="panel"><b>${esc(p.file)}</b> <span class="muted small">(시트: ${esc(r.sheet)})</span>
        <div class="small">${r.rows.length}건 인식 · 지금 보는 기간(${cardPeriod(state.ym)}) ${inMonth}건 · 다른 기간 ${r.rows.length - inMonth}건 ${r.skipped ? `· 제외 ${r.skipped}행` : ''}${r.cols.bm >= 0 ? ' · <b>귀속월 칸 사용</b>' : ''}</div>
        ${noCard ? `<div class="row small" style="margin-top:6px">카드번호가 없는 행의 카드: <input data-imp-card="${i}" value="${esc(cards.includes(p.guessCard) ? p.guessCard : (p.guessCard || cards[0] || ''))}" style="width:80px" maxlength="4"> <span class="muted">(뒤 4자리)</span></div>` : ''}
        <div class="tbl-wrap" style="margin-top:6px;max-height:200px"><table class="t"><thead><tr><th>일자</th><th>카드</th><th>가맹점</th><th>금액</th><th>세목</th><th>내역</th></tr></thead><tbody>
        ${r.rows.slice(0, 8).map(x => `<tr><td>${x.date} ${x.time}</td><td>${esc(x.card)}</td><td>${esc(x.merchant)}</td><td class="num">${fmt(x.amount)}</td><td>${esc(x.cat)}</td><td>${esc(x.memo)}</td></tr>`).join('')}
        </tbody></table></div></div>`;
  }).join('');
  modal('카드사 엑셀 불러오기', body + `
      <label class="small"><input type="checkbox" id="impAuto" checked> 가져온 뒤 자동 분류 실행</label>
      <p class="muted small">이미 있는 내역(같은 일자·카드·금액)은 건너뜁니다.</p>`, [
    { label: '취소' },
    {
      label: '가져오기', cls: 'primary', onClick: (root) => {
        const T1 = performance.now();
        const auto = $('#impAuto', root).checked;   // 엑셀에 있는 내역은 기간과 상관없이 모두 가져옴
        let added = 0, dup = 0, filled = 0;
        const rules = parseMemoRules(db.settings.memoRules);
        // 이미 있는 내역과 맞추기: 같은 날·카드·금액 (가맹점 이름은 카드사·장부마다 달라서 참고만). 한 건은 한 번만 맞춤
        // → 같은 날·카드·금액이 여러 건이면 건수대로 맞춤 (있는 2건 + 엑셀 3건 = 1건만 새로). 둘 다 시간이 있는데 다르면 다른 건
        const pool = {}, key = t => [t.date, t.card, Math.round(t.amount)].join('|'), hm = v => String(v || '').slice(0, 5);
        const toPool = t => (pool[key(t)] = pool[key(t)] || []).push(t);
        db.tx.filter(t => t.siteId === db.cur && t.src === 'card').forEach(toPool);
        parsed.forEach((p, i) => {
          if (!p.res || !p.res.ok) return;
          const cardInp = root.querySelector(`[data-imp-card="${i}"]`);
          const fallback = cardInp ? cardInp.value.replace(/\D/g, '').slice(-4) : '';
          const fresh = [];   // 이 파일에서 새로 넣은 건: 파일이 끝난 뒤에야 맞추기 대상 (같은 파일 안의 똑같은 줄은 서로 다른 건, 겹치는 다른 파일과는 같은 건)
          for (const x of p.res.rows) {
            if (x.kind === 'in') continue;
            const card = x.card || fallback;
            const cands = (pool[key({ ...x, card })] || []).filter(t => !(t.time && x.time && hm(t.time) !== hm(x.time)));
            const mk = merchantKey(x.merchant);
            const hit = cands.find(t => x.time && hm(t.time) === hm(x.time)) || cands.find(t => mk && merchantKey(t.merchant) === mk) || cands[0];
            if (hit) { const all = pool[key(hit)]; all.splice(all.indexOf(hit), 1); }
            if (hit) {
              dup++;
              let f = false;
              if (!hit.time && x.time) { hit.time = x.time; f = true; }
              if (!String(hit.memo || '').trim() && x.memo) { hit.memo = x.memo; f = true; }
              if (!hit.cat && x.cat) { hit.cat = x.cat; f = true; }
              if (f) filled++;
              continue;
            }
            const t = { id: uid(), siteId: db.cur, src: 'card', kind: 'out', ...x, card, claim: false };
            if (!t.bm || t.bm === cardYm(t.date, cardStartSet(db.cur))) delete t.bm;   // 사용기간과 같으면 따로 저장 안 함
            if (auto) applyMemoRule(t, rules);
            if (auto && !t.cat) t.cat = guessCat(t, db.merchantMap);
            if (t.cat) learn(t);
            db.tx.push(t); fresh.push(t); added++;
            if (card && !db.cards.find(c => c.siteId === db.cur && c.last4 === card)) db.cards.push({ id: uid(), siteId: db.cur, last4: card, issuer: '', holder: '' });
          }
          fresh.forEach(toPool);
        });
        const tProc = performance.now() - T1, T2 = performance.now();
        save(); render();
        console.log('[카드 엑셀 불러오기] 파일 읽기', sec(tRead), '· 정리', sec(tProc), '· 화면', sec(performance.now() - T2));   // 느린 PC 점검용 (F12 콘솔에만)
        toast(`${added}건을 가져왔습니다${dup ? ` · 이미 있는 ${dup}건 건너뜀${filled ? `(그중 ${filled}건 시간·사용내역 채움)` : ''}` : ''}`);
      }
    }]);
}
/* ---------- 중복 정리: 일자·카드·금액·가맹점·사용내역·세목까지 똑같은 내역 ---------- */
const dupKey = t => [t.src, t.kind, t.date, t.card || '', Math.round(t.amount), merchantKey(t.merchant), String(t.memo || '').replace(/\s+/g, ''), t.cat || ''].join('|');
function findDups(sid) {
  const g = {};
  db.tx.filter(t => t.siteId === sid).forEach(t => { (g[dupKey(t)] = g[dupKey(t)] || []).push(t); });
  return Object.values(g).filter(a => a.length > 1 && !a.every(t => t.dupOk)).sort((a, b) => a[0].date.localeCompare(b[0].date));   // dupOk: "실제로 여러 번 결제"로 남긴 건
}
function dupBanner(src) {
  const n = findDups(db.cur).filter(g => g[0].src === src).length;
  return n ? `<div class="banner warn small">똑같은 내역(일자·카드·금액·가맹점·사용내역)이 <b>${n}묶음</b> 있습니다. 같은 파일을 두 번 불러왔다면 정리하세요. <button class="btn sm" data-act="dedupe">중복 정리</button></div>` : '';
}
function dedupeDialog() {
  const groups = findDups(db.cur);
  const staffDup = {}; siteStaff(true).forEach(p => { (staffDup[p.name] = staffDup[p.name] || []).push(p); });
  const sdups = Object.values(staffDup).filter(a => a.length > 1);
  const cardDup = {}; siteCards().forEach(c => { (cardDup[c.last4] = cardDup[c.last4] || []).push(c); });
  const cdups = Object.values(cardDup).filter(a => a.length > 1);
  if (!groups.length && !sdups.length && !cdups.length) { toast('중복된 내역이 없습니다.'); return; }
  // 대부분이 2배로 들어갔으면(같은 파일 두 번) 묶음마다 절반을 남김, 아니면 1건만 남김
  const total = db.tx.filter(t => t.siteId === db.cur).length, inDup = groups.reduce((a, g) => a + g.length, 0);
  const doubled = inDup > total * 0.5;
  const keepOf = g => doubled ? Math.max(1, Math.floor(g.length / 2)) : 1;
  const body = `<p class="small">${doubled ? '<b>거의 모든 내역이 2번씩 들어가 있습니다</b> (같은 자료를 두 번 불러온 것으로 보임). 묶음마다 절반을 남기는 것으로 골라 두었습니다.' : '묶음마다 1건만 남기는 것으로 골라 두었습니다.'}
        원래 장부에 실제로 2번 결제한 건이면 "남길 건수"를 늘리세요. 영수증이 붙은 건이 우선 남고, 지워지는 건의 영수증은 남는 건으로 옮깁니다.</p>
      ${groups.length ? `<div class="tbl-wrap" style="max-height:52vh"><table class="t"><thead><tr><th>구분</th><th>일자</th><th>카드</th><th>가맹점</th><th>금액</th><th>사용내역</th><th>건수</th><th>남길 건수</th></tr></thead><tbody>
      ${groups.map((g, i) => { const t = g[0]; return `<tr><td>${t.src === 'card' ? '카드' : t.kind === 'in' ? '전도금 입금' : '전도금'}</td><td>${t.date}</td><td>${esc(t.card || '')}</td><td>${esc(t.merchant)}</td><td class="num">${fmt(t.amount)}</td><td class="small">${esc(String(t.memo || '').slice(0, 40))}</td><td class="num">${g.length}</td>
        <td><select data-keep="${i}">${Array.from({ length: g.length }, (_, k) => k + 1).map(k => `<option ${k === keepOf(g) ? 'selected' : ''}>${k}</option>`).join('')}</select></td></tr>`; }).join('')}
      </tbody></table></div>` : ''}
      ${sdups.length ? `<p class="small">같은 이름 직원 ${sdups.length}명 → 하나로 합칩니다 (출근부·인건비 기록 포함): ${sdups.map(a => esc(a[0].name)).join(', ')}</p>` : ''}
      ${cdups.length ? `<p class="small">같은 번호 카드 ${cdups.length}장 → 하나로 합칩니다: ${cdups.map(a => a[0].last4).join(', ')}</p>` : ''}`;
  modal(`중복 정리 — ${site().name}`, body, [{ label: '취소' }, {
    label: '정리하기', cls: 'primary', onClick: root => {
      let removed = 0;
      groups.forEach((g, i) => {
        const keep = +(root.querySelector(`[data-keep="${i}"]`) || { value: 1 }).value;
        const sorted = [...g].sort((a, b) => ((b.receipts || []).length - (a.receipts || []).length) || ((b.time ? 1 : 0) - (a.time ? 1 : 0)));
        const stay = sorted.slice(0, keep), drop = sorted.slice(keep);
        if (stay.length > 1) stay.forEach(t => { t.dupOk = true; });   // 다음부터 중복으로 묻지 않음
        drop.forEach(t => { (t.receipts || []).forEach(r => { if (!(stay[0].receipts || []).includes(r)) (stay[0].receipts = stay[0].receipts || []).push(r); }); });
        const ids = new Set(drop.map(t => t.id)); db.tx = db.tx.filter(t => !ids.has(t.id)); removed += drop.length;
      });
      sdups.forEach(a => {
        const [main, ...rest] = a;
        rest.forEach(p => {
          for (const k of ['attendance', 'payroll']) Object.values((db[k] || {})[db.cur] || {}).forEach(m => {
            if (!m || typeof m !== 'object') return;
            if (m[p.id] && !m[main.id]) m[main.id] = m[p.id];
            delete m[p.id];
            ['__time', '__ot', '__lateOk', '__photo', '__lateWhy'].forEach(x => { if (m[x] && m[x][p.id]) { if (!m[x][main.id]) m[x][main.id] = m[x][p.id]; delete m[x][p.id]; } });
          });
          ['faceId', 'title', 'team'].forEach(f => { if (!main[f] && p[f]) main[f] = p[f]; });
        });
        const ids = new Set(rest.map(p => p.id)); db.staff = db.staff.filter(p => !ids.has(p.id));
      });
      cdups.forEach(a => { const ids = new Set(a.slice(1).map(c => c.id)); db.cards = db.cards.filter(c => !ids.has(c.id)); });
      save(); render(); toast(`중복 ${removed}건을 삭제했습니다${sdups.length ? ` · 직원 ${sdups.length}명 합침` : ''}${cdups.length ? ` · 카드 ${cdups.length}장 합침` : ''}`);
    }
  }]);
}
/* 출근부 표(엑셀) → 출근부 반영 */
function importAttGrid(grids) {
  const g = grids.find(x => /출근/.test(x.sheet)) || grids[0];
  let ym = g.ym || state.ym;
  if (g.month && +ym.slice(5) !== g.month) ym = `${state.ym.slice(0, 4)}-${pad2(g.month)}`;
  const staffAll = siteStaff(true);
  const list = g.people.map(p => ({ ...p, staff: staffAll.find(s => s.name === p.name) }));
  const body = `<p>${esc(g.file)} › <b>${esc(g.sheet)}</b> · ${list.length}명</p>
      <label class="small">넣을 달 <input type="month" id="agYm" value="${ym}"></label>
      <div class="tbl-wrap" style="max-height:340px;margin-top:8px"><table class="t"><thead><tr><th>성명</th><th>구분</th><th>직책</th><th>출근(1)</th><th>기타 표시</th><th>직원 목록</th></tr></thead><tbody>
      ${list.map((p, i) => { const vals = Object.values(p.days); const etc = [...new Set(vals.filter(v => v !== '1'))];
      return `<tr><td><b>${esc(p.name)}</b></td><td>${esc(p.team)}</td><td>${esc(p.title)}</td><td class="num">${vals.filter(v => v === '1').length}</td><td class="small">${etc.map(v => `${esc(v)} ${vals.filter(x => x === v).length}`).join(', ')}</td>
        <td>${p.staff ? `<span class="badge ok">연결됨</span> <span class="small muted">${p.staff.kind === '정직원' ? '유성 정직원' : '현장 인건비'}</span>` : `<label class="small"><input type="checkbox" data-agreg="${i}" checked> 새로 등록</label> <select data-agkind="${i}"><option value="정직원" ${/기획/.test(p.team) ? 'selected' : ''}>유성 정직원</option><option value="현장" ${/기획/.test(p.team) ? '' : 'selected'}>현장 인건비</option></select>`}</td></tr>`; }).join('')}
      </tbody></table></div>
      <label class="small"><input type="checkbox" id="agOver"> 이미 입력한 칸도 엑셀 값으로 덮어쓰기</label>`;
  modal('출근부 엑셀 불러오기', body, [{ label: '취소' }, {
    label: '출근부에 반영', cls: 'primary', onClick: root => {
      const ym2 = $('#agYm', root).value || ym, over = $('#agOver', root).checked;
      const att = nest(db.attendance, db.cur, ym2); let n = 0, added = 0;
      list.forEach((p, i) => {
        let st = p.staff;
        if (!st) {
          const reg = root.querySelector(`[data-agreg="${i}"]`); if (!reg || !reg.checked) return;
          st = { id: uid(), siteId: db.cur, name: p.name, team: p.team, title: p.title, active: true, kind: root.querySelector(`[data-agkind="${i}"]`).value };
          db.staff.push(st); added++;
        } else { if (!st.title && p.title) st.title = p.title; if (!st.team && p.team) st.team = p.team; }
        const rec = att[st.id] = att[st.id] || {};
        Object.entries(p.days).forEach(([d, v]) => { if (over || rec[d] === undefined || rec[d] === '') { rec[d] = v; n++; } });
      });
      state.ym = ym2; state.tab = 'meal'; state.mealSub = 'att';
      save(); render(); toast(`${ymLabel(ym2)} 출근부 ${n}칸을 반영했습니다${added ? ` · 직원 ${added}명 등록` : ''}`);
    }
  }]);
}
function learn(t) {
  const k = merchantKey(t.merchant);
  if (k && t.cat) db.merchantMap[k] = t.cat;
}
