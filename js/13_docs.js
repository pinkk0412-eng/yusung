/* 유성 현장 관리 프로그램 — 20만원 사용내역서, 사진 PPT, 마감, 인쇄 양식(청구서·지출결의서 등)
 * (원래 app.js 의 화면 부분. 모든 js/*.js 는 같은 전역 공간을 공유하며 html 에 적힌 순서대로 읽힘) */
'use strict';


/* ================= 20만원 이상 법인카드 사용내역서 (회사 양식) ================= */
function u200Dialog(t) {
  const s = site(), u = t.u200 || {};
  const att0 = u.attendees ?? String(t.memo || '').replace(/^[^/]{1,6}\//, '').trim();
  const read = root => { t.u200 = { person: $('#u2Person', root).value.trim(), date: $('#u2Date', root).value || t.date, purpose: $('#u2Purpose', root).value.trim(), attendees: $('#u2Att', root).value.trim(), place: $('#u2Place', root).value.trim() }; if (t.u200.person) site().u200Person = t.u200.person; };
  modal(`법인카드 사용내역서 (20만원 이상) — ${t.date} ${t.merchant || ''} ${fmt(t.amount)}원`, `<div class="form-grid">
      <label>담당자 (직책 이름)<input id="u2Person" value="${esc(u.person ?? s.u200Person ?? '')}" placeholder="예) 대리 홍길동"></label>
      <label>사용일자<input id="u2Date" type="date" value="${esc(u.date || t.date)}"></label>
      <label style="grid-column:span 2">사용목적 (수집정보 등)<input id="u2Purpose" value="${esc(u.purpose || '')}" placeholder="예) 현장 단합을 위한 회식 진행"></label>
      <label style="grid-column:span 2">내용 (참석자 — 소속별로 이름·직책)<textarea id="u2Att" rows="3" placeholder="예) 시행사 : 홍길동 소장&#10;유성 : 김철수 상무, 이영희 대리">${esc(att0)}</textarea></label>
      <label>사용장소<input id="u2Place" value="${esc(u.place ?? t.merchant ?? '')}"></label>
      <label>지출금액<input class="num" value="${fmt(t.amount)}" disabled></label></div>
      <p class="muted small">회사 양식에 영수증이 붙어 한 장으로 인쇄됩니다 · 결재 스캔본은 법인카드 탭 아래에 올리세요.</p>`, [
    { label: '취소' },
    { label: '저장', onClick: root => { read(root); save(); render(); } },
    { label: '저장 후 인쇄', cls: 'primary', onClick: async root => { read(root); save(); render(); await printU200([t]); } }], 'm');
}
// 스캔본(결재 완료) 양식: 왼쪽 위 로고 · 가운데 제목 · 오른쪽 위 결재란(현장 결재라인 + 실무책임자), 영수증은 표 안, 별첨은 표 아래
function docU200(t, imgs) {
  const s = site(), u = t.u200 || {}, ap = (s.approvers || []).length ? s.approvers : [{ title: '', name: '' }];
  const sp = '&nbsp;&nbsp;', n = ap.length;
  return `<div class="doc u2">
      <div class="u2-top"><img class="u2-logo" src="lib/yusung_logo.jpg" alt=""><h1 class="u2-title">법인카드 사용내역서</h1>
        <table class="u2-appr">
          <tr>${ap.map(a => `<th>${esc(a.title)}</th>`).join('')}</tr>
          <tr>${ap.map(a => `<td class="nm">${esc(a.name)}</td>`).join('')}</tr>
          <tr>${ap.map(a => `<td class="sg ${a.name ? '' : 'x'}"></td>`).join('')}</tr>
          <tr>${ap.map(() => '<td class="sg"></td>').join('')}</tr>
          <tr><th class="mgr">실무책임자</th>${n > 1 ? `<td colspan="${n - 1}" class="mgrn">${esc(s.manager || '')} ${signHtml()}</td>` : ''}</tr></table></div>
      <table class="u2-tbl"><colgroup><col style="width:19%"><col style="width:26%"><col style="width:24%"><col style="width:31%"></colgroup>
        <tr class="u2-h"><th>항${sp}목</th><th colspan="3">지${sp}출${sp}내${sp}역 (20만원이상 사용내역)</th></tr>
        <tr><th>담 당 자</th><td class="c">${esc(u.person || '')}</td><th>사용일자</th><td class="c">${esc(u.date || t.date)}</td></tr>
        <tr class="u2-purp"><th>사용목적<br>(수집정보등)</th><td colspan="3" class="c">${esc(u.purpose || '')}</td></tr>
        <tr class="u2-att"><th>내용</th><td colspan="3" class="pre">${esc(u.attendees || '')}</td></tr>
        <tr><th>사용장소</th><td class="c">${esc(u.place || t.merchant || '')}</td><th>지출금액</th><td class="c">${fmt(t.amount)}</td></tr>
        <tr class="u2-rc"><td colspan="4"><div class="u2-imgs">${imgs.map(x => `<img src="${x}">`).join('') || '<span class="muted">(영수증 첨부)</span>'}</div></td></tr></table>
      <div class="u2-foot">* 별 첨 : 증빙영수증</div></div>`;
}
async function printU200(list) {
  if (!list.length) { toast('이 달에 20만원 이상 카드 사용 건이 없습니다.'); return; }
  const docs = [];
  for (const t of list) {
    const imgs = [];
    for (const rel of t.receipts || []) { try { const f = await (await fileAt(`${site().folder}/${rel}`, false)).getFile();
      for (const c of await fileCanvases(f)) imgs.push(await canvasURL(scaledCanvas(c, 1800)));
    } catch (e) { } }
    docs.push(docU200(t, imgs));
  }
  printDocs(docs);
}

/* ================= 소모품·비품 입고 사진 모아 인쇄 (날짜별) ================= */
async function printPhotos() {
  const ym = state.ym, s = site();
  const list = db.tx.filter(t => t.siteId === db.cur && t.kind !== 'in' && txYm(t) === ym && (t.photos || []).length).sort((a, b) => a.date.localeCompare(b.date));
  const miss = db.tx.filter(t => t.siteId === db.cur && txYm(t) === ym && needPhoto(t) && !(t.photos || []).length);
  if (!list.length) { toast(`이 달에 올린 입고 사진이 없습니다${miss.length ? ` (사진 없는 소모품 ${miss.length}건)` : ''}.`); return; }
  if (miss.length && !confirm(`입고 사진이 없는 소모품·비품이 ${miss.length}건 있습니다:\n${miss.slice(0, 8).map(t => `${t.date.slice(5)} ${t.merchant} ${fmt(t.amount)}원`).join('\n')}\n\n있는 것만 인쇄할까요?`)) return;
  const blocks = [];
  for (const t of list) {
    const urls = [];
    for (const rel of t.photos) { try { const f = await (await fileAt(`${s.folder}/${rel}`, false)).getFile(); for (const c of await fileCanvases(f)) urls.push(await canvasURL(scaledCanvas(c, 1400), 0.85)); } catch (e) { } }
    if (urls.length) blocks.push({ t, urls });
  }
  const head = `<div class="ph-head"><b>${esc(s.name)}현장 ${monthNo(ym)}월 소모품·비품 입고 사진</b><span>${ymLabel(ym)}</span></div>`;
  const sec = b => { const t = b.t, d = new Date(t.date + 'T00:00:00'); return `<div class="ph-sec"><div class="ph-cap"><b>${t.date.slice(5).replace('-', '/')} (${WEEK[d.getDay()]})</b> · ${esc(t.merchant || '')} · ${esc(t.memo || '')} · <b>${fmt(t.amount)}원</b> · ${t.src === 'card' ? `법인카드 ${esc(t.card || '')}` : '전도금'}</div>
      <div class="ph-imgs n${Math.min(4, b.urls.length)}">${b.urls.slice(0, 4).map(u => `<img src="${u}">`).join('')}</div></div>`; };
  const pages = []; for (let i = 0; i < blocks.length; i += 2) pages.push(`<div class="doc ph">${head}${blocks.slice(i, i + 2).map(sec).join('')}</div>`);
  printDocs(pages);
  toast(`입고 사진 ${blocks.length}건 · ${pages.length}장 — 인쇄 창에서 "PDF로 저장"을 고르면 파일로 보낼 수 있습니다.`);
}

/* 입고 사진 → 파워포인트 (슬라이드마다 내역 1건, 사진 최대 4장 · 많으면 다음 슬라이드) — lib/ppt_base.js 빈 파일에 슬라이드를 붙임 */
async function photoPpt() {
  const ym = state.ym, s = site();
  const list = db.tx.filter(t => t.siteId === db.cur && t.kind !== 'in' && txYm(t) === ym && (t.photos || []).length).sort((a, b) => a.date.localeCompare(b.date));
  if (!list.length) { toast('이 달에 올린 입고 사진이 없습니다.'); return; }
  try { if (!window.PPT_BASE_B64) await loadScript('lib/ppt_base.js'); } catch (e) { toast('PPT 기본 파일(lib/ppt_base.js)이 없습니다.'); return; }
  const prog = modal('입고사진 PPT 만드는 중', '<p id="pptProg">사진 준비 중…</p>', [], 's');
  const z = xz.open(unb64(window.PPT_BASE_B64)), add = (path, data) => XLSX.CFB.utils.cfb_add(z, path, typeof data === 'string' ? new TextEncoder().encode(data) : data);
  const W = 12192000, H = 6858000, M = 360000, GAP = 180000, TOP = 1150000;
  const NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
  const run = (t, sz, b, color) => `<a:r><a:rPr lang="ko-KR" altLang="en-US" sz="${sz}"${b ? ' b="1"' : ''} dirty="0">${color ? `<a:solidFill><a:srgbClr val="${color}"/></a:solidFill>` : ''}<a:latin typeface="맑은 고딕"/><a:ea typeface="맑은 고딕"/></a:rPr><a:t>${xmlEsc(t)}</a:t></a:r>`;
  let nSlide = 0, nImg = 0, done = 0; const ids = [], prels = [], cts = [];
  for (const t of list) {
    const pics = [];
    for (const rel of t.photos) { try { const f = await (await fileAt(`${s.folder}/${rel}`, false)).getFile(); for (const c of await fileCanvases(f)) { const cc = scaledCanvas(c, 1600); const blob = await new Promise(r => cc.toBlob(r, 'image/jpeg', 0.85)); pics.push({ w: cc.width, h: cc.height, data: new Uint8Array(await blob.arrayBuffer()) }); } } catch (e) { } }
    const p = $('#pptProg', prog); if (p) p.textContent = `사진 준비 중… ${++done} / ${list.length}`;
    if (!pics.length) continue;
    const d = new Date(t.date + 'T00:00:00');
    for (let i = 0; i < pics.length; i += 4) {
      const chunk = pics.slice(i, i + 4), k = chunk.length, cw = (W - 2 * M - GAP * (k - 1)) / k, ch = H - TOP - M;
      nSlide++; const rels = [`<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout7.xml"/>`];
      const picXml = chunk.map((pc, j) => { nImg++; add(`ppt/media/photo${nImg}.jpg`, pc.data); rels.push(`<Relationship Id="rId${j + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/photo${nImg}.jpg"/>`);
        const sc = Math.min(cw / pc.w, ch / pc.h), w = Math.round(pc.w * sc), h = Math.round(pc.h * sc), x = Math.round(M + j * (cw + GAP) + (cw - w) / 2), y = Math.round(TOP + (ch - h) / 2);
        return `<p:pic><p:nvPicPr><p:cNvPr id="${j + 10}" name="사진 ${j + 1}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rId${j + 2}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:ln w="6350"><a:solidFill><a:srgbClr val="BFBFBF"/></a:solidFill></a:ln></p:spPr></p:pic>`; }).join('');
      const title = `${t.date.slice(5).replace('-', '/')} (${WEEK[d.getDay()]})  ${t.merchant || ''}${pics.length > 4 ? `  (${Math.floor(i / 4) + 1}/${Math.ceil(pics.length / 4)})` : ''}`;
      const sub = `${t.memo || ''}  ·  ${fmt(t.amount)}원  ·  ${t.src === 'card' ? `법인카드 ${t.card || ''}` : '전도금'}  ·  ${s.name}현장 ${monthNo(ym)}월 입고 사진`;
      add(`ppt/slides/slide${nSlide}.xml`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<p:sld ${NS}><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
<p:sp><p:nvSpPr><p:cNvPr id="2" name="제목"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${M}" y="220000"/><a:ext cx="${W - 2 * M}" cy="850000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr><p:txBody><a:bodyPr wrap="square" lIns="0" rIns="0"><a:normAutofit/></a:bodyPr><a:lstStyle/><a:p>${run(title, 2400, true)}</a:p><a:p>${run(sub, 1400, false, '595959')}</a:p></p:txBody></p:sp>${picXml}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`);
      add(`ppt/slides/_rels/slide${nSlide}.xml.rels`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.join('')}</Relationships>`);
      ids.push(`<p:sldId id="${255 + nSlide}" r:id="rIdS${nSlide}"/>`); prels.push(`<Relationship Id="rIdS${nSlide}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${nSlide}.xml"/>`);
      cts.push(`<Override PartName="/ppt/slides/slide${nSlide}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`);
    }
  }
  closeModal();
  if (!nSlide) { toast('사진 파일을 읽지 못했습니다.'); return; }
  const pe = xz.get(z, 'ppt/presentation.xml'); xz.put(pe, xz.text(pe).replace('</p:sldMasterIdLst>', `</p:sldMasterIdLst><p:sldIdLst>${ids.join('')}</p:sldIdLst>`));
  const re = xz.get(z, 'ppt/_rels/presentation.xml.rels'); xz.put(re, xz.text(re).replace('</Relationships>', prels.join('') + '</Relationships>'));
  const ce = xz.get(z, '[Content_Types].xml'); xz.put(ce, xz.text(ce).replace('</Types>', `${/Extension="jpg"/.test(xz.text(ce)) ? '' : '<Default Extension="jpg" ContentType="image/jpeg"/>'}${cts.join('')}</Types>`));
  download(`${pad2(monthNo(ym))}월 ${s.name}현장 입고사진.pptx`, xz.save(z), 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
  toast(`입고사진 PPT — 슬라이드 ${nSlide}장 (다운로드 폴더)`);
}

/* ================= 현장 철수 체크리스트 ================= */
// 항목 이름이 저장 키 (s.closeList[이름]) — 이름을 바꾸면 체크가 풀리므로 새 항목은 뒤에 추가만
const CLOSE_ITEMS = ['법인카드 폐기·반납', '전도금 통장·도장 반납', '숙소·사무실 보증금 회수', 'KT 인터넷·일반전화 해지', 'CRM·대표번호 해지', '문자 발송 해지', '오션(근태 프로그램) 해지', '복합기·세절기 반납', '생수·정수기 회수', '사무집기 반납', '렌터카·홍보차량 반납', '캐터링 종료', '무인경비(세콤) 해지', '최종 월결제·인건비·전도금 정산',
  '캡스카드 반납', '조직계약서 등 원본 본사 송부', '소모품·집기 회수 리스트 (품목·수량·회수/회수불가·사유)', '해지합의서·정산합의서', '이행보증증권 환급', '숙소 관리비·장기수선충당금 정산', '그 밖의 불필요한 서비스 해지'];
function closeItems(s) {
  const cl = s.closeList || {};
  const vs = db.vendors.filter(v => v.siteId === s.id && v.active !== false && v.name).map(v => ({ key: 'v:' + v.id, label: `거래처 해지·반납 확인: ${v.name}${v.desc ? ` (${v.desc})` : ''}` }));
  const custom = (s.closeCustom || []).map(c => ({ key: 'c:' + c.id, label: c.label, customId: c.id }));
  return [...CLOSE_ITEMS.map(l => ({ key: l, label: l })), ...vs, ...custom].map(x => ({ ...x, ...(cl[x.key] || {}) }));
}
function closePanel(s) {
  const items = closeItems(s), done = items.filter(x => x.done).length;
  return `<details class="panel" open><summary style="cursor:pointer"><b>현장 철수 체크리스트</b> <span class="muted small">${done}/${items.length} 완료 — 카드 폐기·반납, 전도금 통장·도장, 보증금 회수, KT·CRM·복합기 해지, 집기 반납 …</span></summary>
      <label class="small" style="display:block;margin:8px 0"><input type="checkbox" data-ch="siteClosing" ${s.closing ? 'checked' : ''}> 이 현장 철수 진행 중 (홈 "오늘 할 일"에 남은 항목 표시)</label>
      <div class="tbl-wrap"><table class="t"><thead><tr><th>완료</th><th>항목</th><th>완료일</th><th>메모 (반납처·회수 금액 등)</th><th></th></tr></thead><tbody>
      ${items.map(x => `<tr><td class="center"><input type="checkbox" ${x.done ? 'checked' : ''} data-ch="closeItem" data-k="${esc(x.key)}" data-f="done"></td><td>${esc(x.label)}</td><td><input type="date" value="${esc(x.date || '')}" data-ch="closeItem" data-k="${esc(x.key)}" data-f="date"></td><td><input value="${esc(x.note || '')}" data-ch="closeItem" data-k="${esc(x.key)}" data-f="note" data-fid="cl_${esc(x.key)}" style="width:260px"></td><td>${x.customId ? `<button class="btn ghost sm danger" data-act="closeDel" data-id="${x.customId}">✕</button>` : ''}</td></tr>`).join('')}
      </tbody></table></div>
      <div class="row" style="margin-top:8px"><input id="closeNew" placeholder="항목 추가 (예: 홍보관 원상복구)" class="inp" style="width:280px"><button class="btn sm" data-act="closeAdd">추가</button></div></details>`;
}


/* ================= 인쇄 양식 ================= */
// 실무책임자 서명 그림: 현장마다 site.sign (현장 데이터 폴더 현장설정.txt 에 저장). 있으면 "(서명)" 자리에 인쇄
// 예전엔 이 PC 브라우저(localStorage)에만 저장 → 처음 읽을 때 현장 자료로 옮김
const signKey = () => `gyeongri_sign_${db.cur}`;
const signData = () => {
  const s = site(); if (!s) return '';
  if (!s.sign) { let old = ''; try { old = localStorage.getItem(signKey()) || ''; } catch (e) { }
    if (old) { s.sign = old; try { localStorage.removeItem(signKey()); } catch (e) { } setTimeout(save, 0); } }
  return s.sign || '';
};
const signHtml = () => { const d = signData(); return d ? `<img class="sign-img" src="${d}" alt="서명">` : '<span class="pf-sign">(서명)</span>'; };
async function signSet() {
  const [f] = await pickFile('image/*', false); if (!f) return;
  try {
    const c = await toCanvas(f, 1200), g = c.getContext('2d'), im = g.getImageData(0, 0, c.width, c.height), d = im.data;
    let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) { const i = (y * c.width + x) * 4, v = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      if (v > 170) d[i + 3] = 0; else { d[i] = d[i + 1] = d[i + 2] = Math.max(0, v - 60); d[i + 3] = 255; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } }   // 흰 배경 투명 · 글씨 진하게
    if (x1 < 0) { toast('서명을 찾지 못했습니다. 흰 종이에 진하게 쓴 서명 사진을 올리세요.'); return; }
    g.putImageData(im, 0, 0);
    const w = x1 - x0 + 1, h = y1 - y0 + 1, sc = Math.min(1, 160 / h), o = newCanvas(w * sc, h * sc);
    o.getContext('2d').drawImage(c, x0, y0, w, h, 0, 0, o.width, o.height);
    site().sign = o.toDataURL('image/png'); save(); render(); toast(`서명을 ${site().name}현장 데이터에 저장했습니다.`);
  } catch (e) { toast('서명 그림을 저장하지 못했습니다: ' + e.message); }
}
/* 전도금 청구서 — 회사 양식 (엑셀 "전도금 청구서" 시트 A1:T30 배치 · 결재 스캔본 J11 모양)
   열 10개 = 엑셀 A-B | C-F | G | H-I | J-K | L-M | N | O-P | Q-R | S-T */
const cashWeek = ym => `${monthNo(ym)}월 4주`;   // 회사 엑셀의 "월 주" 칸. 월 단위 정산이라 그 달 마지막 회차(4주)로 표시
const CASH_LABEL = { 간식대: '간식비' };   // 회사 양식 표기
function docCashClaim(ym, docNo, date) {
  const s = site(), cs = cashSummary(db.cur, ym), cc = cashClaim(ym);
  const by = {}; SUBS.forEach(x => by[x] = 0);
  cs.list.filter(t => t.kind !== 'in').forEach(t => { by[t.cat || '기타'] += t.amount; });
  const req = cashAddOn(ym) ? cc.req : {}, reqTotal = sum(SUBS, x => req[x]);   // 추가 신청 안 하는 달 = 정산만 (신청 칸 '-')
  const inTotal = sum(db.tx.filter(t => t.siteId === db.cur && t.src === 'cash' && t.kind === 'in' && ymOf(t.date) <= ym), t => t.amount);
  const ap = (s.approvers || []).slice(0, 3); while (ap.length < 3) ap.push({ title: '', name: '' });
  const [y, m] = ym.split('-'), per = `${y}.${m}.01.-${y}.${m}.${pad2(daysIn(ym))}.`;
  const rows = CATS.map(c => c.s.map((x, i) => `<tr class="r9">${i === 0 ? `<td rowspan="${c.s.length}">${c.g}</td>` : ''}<td>${CASH_LABEL[x] || x}</td><td colspan="3" class="n">${dashN(req[x])}</td><td colspan="3" class="n">${dashN(by[x])}</td><td colspan="2" class="l"></td></tr>`).join('')).join('');
  return `<div class="doc cc"><table class="cc-tbl">
      <colgroup><col style="width:11%"><col style="width:18.4%"><col style="width:4.8%"><col style="width:10.1%"><col style="width:11.2%"><col style="width:9.3%"><col style="width:3.3%"><col style="width:10.7%"><col style="width:10.7%"><col style="width:10.5%"></colgroup>
      <tr class="r1"><td colspan="10" class="cc-title"><img class="cc-logo" src="lib/yusung_logo.jpg" alt="">전 도 금 청 구 서</td></tr>
      <tr class="r2"><td rowspan="2">문서번호</td><td colspan="5" rowspan="2" class="l">${esc(docNo)}</td><td rowspan="4" class="cc-g">결<br><br>재</td>${ap.map(a => `<td>${esc(a.title)}</td>`).join('')}</tr>
      <tr class="r2">${ap.map(a => `<td>${esc(a.name)}</td>`).join('')}</tr>
      <tr class="r45"><td>현 장 명</td><td colspan="5" class="l">${esc(s.fullName || s.name)}</td>${ap.map(a => `<td rowspan="2" class="${a.name ? '' : 'x'}"></td>`).join('')}</tr>
      <tr class="r9"><td>기안일자</td><td colspan="2">${ymd(date)}</td><td class="cc-wk">${cashWeek(ym)}</td><td colspan="2">${per}</td></tr>
      <tr class="r45"><td>전도금입금액</td><td colspan="2">₩${fmt(inTotal)}</td><td>실무책임자</td><td colspan="3">${esc(s.manager || '')} ${signHtml()}</td>${ap.map(() => '<td rowspan="2"></td>').join('')}</tr>
      <tr class="r9"><td>제${'&nbsp;'.repeat(5)}목</td><td colspan="6" class="l">${cashAddOn(ym) ? '전도금 정산 및 신청의 건' : '전도금 정산의 건'}</td></tr>
      <tr class="r9"><td>계정과목</td><td>계정세목</td><td colspan="3">전도금신청</td><td colspan="3">전주정산</td><td colspan="2">비${'&nbsp;'.repeat(2)}고</td></tr>
      ${rows}
      <tr class="r9"><td colspan="2">주간소계</td><td colspan="3" class="n">${dashN(reqTotal)}</td><td colspan="3" class="n">${dashN(cs.out)}</td><td>잔액</td><td class="n">${dashN(cs.balance)}</td></tr>
      <tr class="r9"><td colspan="2">월간누계</td><td colspan="8" class="n">${dashN(cs.out)}</td></tr>
      <tr class="r9"><td colspan="2">총 누 계</td><td colspan="8" class="n">${dashN(cs.total)}</td></tr>
      <tr class="r9"><td colspan="2">합${'&nbsp;'.repeat(5)}계</td><td colspan="6" class="n">${dashN(cashClaimAmt(ym))}</td><td colspan="2"></td></tr></table></div>`;
}
/* 전도금 집행내역 — 회사 양식 (엑셀 "전도금지출내역" 시트 A~K열, A4 가로): 그 달 내역 + 노란 누계 줄 */
function docCashList(ym) {
  const cs = cashSummary(db.cur, ym);
  const list = cs.list.slice().sort((a, b) => (a.date + (a.kind === 'in' ? '0' : '1')).localeCompare(b.date + (b.kind === 'in' ? '0' : '1')));
  const upTo = db.tx.filter(t => t.siteId === db.cur && t.src === 'cash' && ymOf(t.date) <= ym);
  const cIn = sum(upTo.filter(t => t.kind === 'in'), t => t.amount), cOut = sum(upTo.filter(t => t.kind !== 'in'), t => t.amount);
  const md = d => `${d.slice(5, 7)}월 ${d.slice(8, 10)}일`, wk = cashWeek(ym);
  const rows = list.map(t => { const isIn = t.kind === 'in';
    return `<tr><td class="c">${wk}</td><td class="c">${md(t.date)}</td><td class="c">${isIn ? '' : esc(GROUP_OF[t.cat] || '')}</td><td class="c">${isIn ? '' : esc(t.cat || '')}</td><td class="c">${esc(t.merchant || '')}</td><td>${esc(isIn ? (t.memo || '전도금 입금') : (t.memo || ''))}</td>
      <td class="n">${isIn ? fmt(t.amount) : ''}</td><td class="n">${isIn ? '' : fmt(t.amount)}</td><td class="n">${isIn ? '' : fmt(t.amount)}</td><td class="n"></td><td class="n"></td></tr>`; }).join('');
  return `<div class="doc cl"><h1 class="cl-title">${esc(site().name)}현장 전도금 집행내역</h1>
      <table class="cl-tbl"><colgroup><col style="width:6.2%"><col style="width:6.1%"><col style="width:7.8%"><col style="width:7.8%"><col style="width:10%"><col style="width:26.3%"><col style="width:7.4%"><col style="width:7.8%"><col style="width:6.7%"><col style="width:7%"><col style="width:6.9%"></colgroup>
        <thead><tr class="cl-h"><th rowspan="2">월${'&nbsp;'.repeat(2)}주</th><th rowspan="2">월${'&nbsp;'.repeat(2)}일</th><th rowspan="2">과${'&nbsp;'.repeat(2)}목</th><th rowspan="2">세 목</th><th rowspan="2">거${'&nbsp;'.repeat(2)}래${'&nbsp;'.repeat(2)}처</th><th rowspan="2">거${'&nbsp;'.repeat(2)}래${'&nbsp;'.repeat(2)}내${'&nbsp;'.repeat(2)}용</th><th>A</th><th>B</th><th>C</th><th>D</th><th>E</th></tr>
        <tr class="cl-h"><th>전도금</th><th>사용금액</th><th>공급가액</th><th class="red">부가세</th><th>잔액</th></tr></thead>
        <tbody>${rows}
        <tr class="cl-sum"><td colspan="5"></td><td class="red">누계</td><td class="n red">${dashN(cIn)}</td><td class="n red">${dashN(cOut)}</td><td class="n red">${dashN(cOut)}</td><td class="n red">-</td><td></td></tr></tbody></table></div>`;
}
/* 법인카드 월별 사용집계표 — 카드마다 한 장 (샘플 양식: 결재란 + 계정과목/금액/비고, 소계 연두·합계 회색) */
function apprBoxCard(s) {
  const ap = s.approvers || [];
  return `<table class="cs-appr">
      <tr>${ap.map(a => `<th>${esc(a.title)}</th>`).join('')}</tr>
      <tr>${ap.map(a => `<td class="nm">${esc(a.name)}</td>`).join('')}</tr>
      <tr>${ap.map(a => `<td class="sg ${a.name ? '' : 'x'}"></td>`).join('')}</tr>
      <tr>${ap.map(a => `<td class="sg2 ${a.name ? '' : 'x2'}"></td>`).join('')}</tr>
      <tr><td colspan="${Math.max(1, ap.length)}" class="mgrn"><b class="mgr">실무책임자</b><span class="mgr-nm">${esc(s.manager || '')}</span>${signHtml()}</td></tr></table>`;   // 샘플 결재란 12행: 한 칸에 "실무책임자 직급 / 이름 (서명)"
}
function cardIdsOf(ym) {
  const all = txOf(ym, 'card');
  return { all, ids: [...new Set([...siteCards().map(c => c.last4), ...all.map(t => t.card)])].filter(id => all.some(t => t.card === id)) };
}
function docCardSummary(ym, onlyId) {
  const { all, ids } = cardIdsOf(ym);
  const agg = cardAggregate(all, ids);
  const s = site(), st = cardStart(db.cur);
  const p0 = st > 1 ? `${ym}-${pad2(st)}` : `${ym}-01`, p1 = st > 1 ? `${ymAdd(ym, 1)}-${pad2(st - 1)}` : `${ym}-${daysIn(ym)}`;
  const per = `( ${p0.replace(/-/g, '.')} ~ ${p1.replace(/-/g, '.')} )`;
  // 샘플과 같은 과목 순서. 건물관리비·수도광열비(주로 전도금)는 금액이 있을 때만
  const cats = CATS.filter(c => !['건물관리비', '수도광열비'].includes(c.g) || c.s.some(sb => ids.some(id => agg[id][sb])));
  const page = id => {
    const a = agg[id];
    const rows = cats.map(c => {
      if (c.s.length === 1) return `<tr><td class="g">${c.g}</td><td class="c">${c.s[0]}</td><td class="num">${dashN(a[c.s[0]])}</td><td></td></tr>`;
      return c.s.map((sb, i) => `<tr>${i === 0 ? `<td class="g" rowspan="${c.s.length + 1}">${c.g}</td>` : ''}<td class="c">${sb}</td><td class="num">${dashN(a[sb])}</td><td></td></tr>`).join('')
        + `<tr class="cs-sub"><td class="c"><b>소&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;계</b></td><td class="num"><b>${dashN(sum(c.s, sb => a[sb]))}</b></td><td></td></tr>`;
    }).join('');
    return `<div class="doc cs">
        <h1 class="cs-title">법인카드 월별 사용집계표</h1>
        <div class="cs-apprwrap">${apprBoxCard(s)}</div>
        <table class="cs-tbl">
          <colgroup><col style="width:21%"><col style="width:19%"><col style="width:27%"><col style="width:33%"></colgroup>
          <tr class="cs-h"><th colspan="2" rowspan="2">계&nbsp;&nbsp;&nbsp;&nbsp;정&nbsp;&nbsp;&nbsp;&nbsp;과&nbsp;&nbsp;&nbsp;&nbsp;목</th><th class="cardno">법인카드(${esc(id)})</th><th rowspan="2">비&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;고</th></tr>
          <tr class="cs-h"><td class="per">${per}</td></tr>
          ${rows}
          ${a[''] ? `<tr><td class="g">미분류</td><td class="c">미분류</td><td class="num">${dashN(a[''])}</td><td></td></tr>` : ''}
          <tr class="cs-tot"><td colspan="2" class="c"><b>합&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;계</b></td><td class="num"><b>${dashN(a.total)}</b></td><td></td></tr>
        </table></div>`;
  };
  return (onlyId ? [onlyId] : ids).map(page).join('') || `<div class="doc"><p>${ymLabel(ym)} 법인카드 사용 내역이 없습니다.</p></div>`;
}
/* 카드 사용내역 명세 — 카드마다 (A4 가로): 이용일자·카드번호·가맹점·이용금액·선결제·계정과목·내역 */
function docCardDetail(ym, id) {
  return docCardDetailOf(txOf(ym, 'card').filter(t => t.card === id), id);
}
// 카드 사용내역 명세 (회사 양식) — 내역 목록을 받아서 · cap = 표 위 제목 (품의서 오픈기간 카드: 14 pmCardPages)
function docCardDetailOf(list0, id, cap = '') {
  const list = list0.slice().sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
  if (!list.length) return '';
  const rows = list.map(t => `<tr><td class="c xs">${t.date.slice(5).replace('-', '.')}</td><td class="c">${esc(t.card)}</td><td>${esc(t.merchant)}</td><td class="num">${fmt(t.amount)}</td><td></td><td class="c">${esc(t.cat || '미분류')}</td><td class="c">${esc(t.memo || '')}${t.overReason ? ` (식대 초과: ${esc(t.overReason)})` : ''}</td></tr>`).join('');
  return `<div class="doc cd">${cap ? `<div style="font-size:15px;font-weight:700;margin:0 0 3mm">${esc(cap)}</div>` : ''}
      <table class="cd-tbl"><colgroup><col style="width:5%"><col style="width:5%"><col style="width:22%"><col style="width:9%"><col style="width:7%"><col style="width:9%"><col style="width:43%"></colgroup>
        <thead><tr class="cs-h"><th rowspan="2">이용<br>일자</th><th rowspan="2">카드<br>번호</th><th rowspan="2">이용가맹점(은행)명</th><th rowspan="2">이용금액</th><th rowspan="2">선결제</th><th colspan="2">이용내역</th></tr>
        <tr class="cs-h"><th>계정과목</th><th>내역</th></tr></thead><tbody>
        ${rows}
        <tr class="cs-foot"><td></td><td class="c"><b>${esc(id)}</b></td><td class="c"><b>소계(일시불이용분)</b></td><td class="num"><b>${fmt(sum(list, t => t.amount))}</b></td><td class="c">-</td><td colspan="2"></td></tr>
      </tbody></table></div>`;
}
function printCardDocs(withDetail) {
  const { ids } = cardIdsOf(state.ym);
  if (!ids.length) { toast('이 달의 법인카드 내역이 없습니다.'); return; }
  printDocs(ids.map(id => docCardSummary(state.ym, id) + (withDetail ? docCardDetail(state.ym, id) : '')));
}
/* ===== 회사 양식: 자금청구서 · 지출결의서 (원본 엑셀 "기안품의서외" 시트 배치 그대로) ===== */
const ymd = d => { const [y, m, dd] = String(d || todayStr()).split('-'); return `${y}년 ${+m}월 ${+dd}일`; };
const apCols6 = n => { const per = Math.floor(6 / Math.max(1, n)), ex = 6 - per * Math.max(1, n); return Array.from({ length: Math.max(1, n) }, (_, i) => per + (i === n - 1 ? ex : 0)); };
// 자금청구서 머리 (20칸: A~T, 결재 N열, 결재자 O~T)
function fcHead({ docNo, date, period, title }) {
  const s = site(), ap = (s.approvers || []).slice(0, 6), cw = apCols6(ap.length);
  const td = (cls, cs, rs, h) => `<td class="${cls}"${cs > 1 ? ` colspan="${cs}"` : ''}${rs > 1 ? ` rowspan="${rs}"` : ''}>${h}</td>`;
  const L = (t, cs, rs) => td('pf-l', cs, rs, t), V = (t, cs, rs) => td('pf-v b left', cs, rs, t);
  return `<table class="pf-grid fc"><colgroup>${'<col style="width:5%">'.repeat(20)}</colgroup>
      <tr class="r-title"><td colspan="4" class="pf-logo"><img src="lib/yusung_logo.jpg" alt=""></td><td colspan="16" class="pf-title">자 금 청 구 서</td></tr>
      <tr class="r-h">${L('기안 번호', 2, 2)}${V(esc(docNo || ''), 11, 2)}<td rowspan="5" class="pf-gyeol"><span>결</span><span>재</span></td>${ap.map((a, i) => td('pf-at', cw[i], 1, esc(a.title))).join('')}</tr>
      <tr class="r-h">${ap.map((a, i) => td('pf-an', cw[i], 1, esc(a.name))).join('')}</tr>
      <tr class="r-h">${L('프로젝트명', 2, 2)}${V(esc(s.fullName || s.name), 11, 2)}${ap.map((a, i) => td('pf-sg' + (a.name ? '' : ' x'), cw[i], 3, '')).join('')}</tr>
      <tr class="r-h"></tr>
      <tr class="r-b">${L('기안일자', 2)}${V(ymd(date), 11)}</tr>
      <tr class="r-b">${L('시행일자', 2)}${V(esc(period || ''), 5)}${L('실무책임자', 2)}${V(`${esc(s.manager || '')} ${signHtml()}`, 5)}${ap.map((a, i) => td('pf-sg2', cw[i], 2, '')).join('')}</tr>
      <tr class="r-b">${L('제목', 2)}${V(esc(title || ''), 12)}</tr>
    </table>`;
}
const fcPage = (head, body) => `<div class="doc pf"><div class="pf-frame">${head}<div class="pf-body fc-body">${body}</div></div></div>`;
const fcAttach = list => `<div class="pf-sec"><span class="pf-no">2.</span><span><b>첨부서류</b></span></div><div class="pf-line">- ${esc(list)}. -끝-</div>`;

// 인건비 자금청구서 (회사 양식 · 결재 스캔본 "98. 5월분 인건비"): 전전월 실지급액 계 · 전월 유성 + 이번 달(유성/시행사/실지급액 계)
// 칸에 안 들어가는 글자는 줄여서 한 칸에 (엑셀 "축소하여 전체 표시"): cap = 그 칸에 들어가는 한글 글자 수(영문·숫자는 0.55자) · base = 원래 글자 크기(px)
const fitStyle = (t, cap, base, min = 6.5) => { const n = [...String(t || '')].reduce((a, ch) => a + (/[\u0000-ÿ]/.test(ch) ? 0.55 : 1), 0); return n > cap ? ` style="font-size:${Math.max(min, base * cap / n).toFixed(1)}px"` : ''; };
function docPayClaim(ym, docNo, date) {
  const s = site(), m = monthNo(ym);
  const key = g => `${g.company}|${g.team}`;
  const cur = payGroups(payRows(db.cur, ym, true).filter(r => r.rec.payType !== '제외'));
  const prevs = [ymAdd(ym, -2), ymAdd(ym, -1)].map((p, pi) => { const gs = payGroups(payRows(db.cur, p, false).filter(r => r.rec.payType !== '제외')); return { ym: p, head: pi ? '유성' : '실지급액 계', map: Object.fromEntries(gs.map(g => [key(g), pi ? g.ys : g.ys + g.sh])) }; });
  const keys = [...new Set([...prevs.flatMap(p => Object.keys(p.map)), ...cur.map(key)])];
  const label = g => `${g.team}${g.names && g.names.length ? `(${g.names.length > 2 ? `${g.names[0]} 외 ${g.names.length - 1}명` : g.names.join(',')})` : ''}`;
  const fitTxt = t => fitStyle(t, 10, 12.5, 8);   // 칸에 안 들어가면 글자 줄임 (엑셀 "축소하여 전체 표시")
  const rows = keys.map((k, i) => {
    const g = cur.find(x => key(x) === k) || { company: k.split('|')[0], team: k.split('|')[1], names: [], ys: 0, sh: 0 };
    return `<tr><td class="center">${i + 1}</td><td class="center">${esc(g.company)}</td><td${fitTxt(label(g))}>${esc(label(g))}</td>${prevs.map(p => `<td class="num">${dashN(p.map[k])}</td>`).join('')}
        <td class="num cur l">${dashN(g.ys)}</td><td class="num cur">${dashN(g.sh)}</td><td class="num cur r">${dashN(g.ys + g.sh)}</td></tr>`;
  }).join('');
  const T = f => sum(cur, f);
  const body = `<div class="pf-sec"><span class="pf-no">1.</span><span><b>${esc(s.name)}현장 ${m}월분 인건비 청구내역 집계표</b></span></div>
      <div class="pf-in"><table class="fc-tbl fixed"><colgroup><col style="width:6%"><col style="width:13%"><col style="width:21%">${'<col style="width:12%">'.repeat(5)}</colgroup>
        <tr><th colspan="8" class="cap">${esc(s.name)}현장 인건비 집계표</th></tr>
        <tr><th rowspan="2">번호</th><th rowspan="2">업체명</th><th rowspan="2">구분</th>${prevs.map(p => `<th>${monthNo(p.ym)}월</th>`).join('')}<th colspan="3" class="cur t">${m}월</th></tr>
        <tr>${prevs.map(p => `<th>${p.head}</th>`).join('')}<th class="cur l">유성</th><th class="cur">시행사</th><th class="cur r">실지급액 계</th></tr>
        ${rows || '<tr><td colspan="8" class="center">-</td></tr>'}
        <tr class="fc-sum"><td colspan="3" class="center"><b>합계</b></td>${prevs.map(p => `<td class="num"><b>${fmt0(sum(Object.values(p.map)))}</b></td>`).join('')}<td class="num cur l b2"><b>${fmt0(T(g => g.ys))}</b></td><td class="num cur b2"><b>${fmt0(T(g => g.sh))}</b></td><td class="num cur r b2"><b>${fmt0(T(g => g.ys + g.sh))}</b></td></tr>
      </table></div>
      ${fcAttach('영업팀 출근부, 세부내역서, 자금청구서, 지출결의서')}`;
  return fcPage(fcHead({ docNo, date, period: `${ym.replace('-', '.')}.01.~${ym.replace('-', '.')}.${daysIn(ym)}.`, title: `${s.name}현장 ${m}월분 인건비 청구의 건` }), body);
}
// 월결제 자금청구서: 과목·업체·거래내역 + 전전월·전월 집행 + 이번 달(유성/시행사/합계) + 참조문서·비고
function docFundClaim(ym, docNo, date) {
  const s = site(), m = monthNo(ym), mo = monthOf(db.cur, ym);
  const prevYms = [ymAdd(ym, -2), ymAdd(ym, -1)];
  const prevRows = prevYms.map(p => ((db.monthly[db.cur] || {})[p] || { rows: {} }).rows || {});
  const tot = mTot;   // 09: 유성 + 시행사
  const vs = vendorsFor(ym).filter(v => tot(mo.rows[v.id]) || prevRows.some(pr => tot(pr[v.id])));
  const t = monthlyTotals(db.cur, ym), showSh = !!Math.round(t.sh || 0);   // 이번 달 시행사 청구가 없으면 시행사 칸 빼기
  // 같은 과목끼리 묶어 과목 칸 합치기
  const span = {}; vs.forEach((v, i) => { const k = v.subject || '기타'; if (i === 0 || (vs[i - 1].subject || '기타') !== k) span[i] = vs.slice(i).findIndex((x, j) => j > 0 && (x.subject || '기타') !== k); });
  const rows = vs.map((v, i) => {
    const r = mo.rows[v.id] || {};
    const sp = span[i] !== undefined ? (span[i] < 0 ? vs.length - i : span[i]) : 0;
    return `<tr><td class="center">${i + 1}</td>${sp ? `<td class="center" rowspan="${sp}"${fitStyle(v.subject || '기타', 4.5, 10)}>${esc(v.subject || '기타')}</td>` : ''}<td class="center"${fitStyle(v.name, showSh ? 6 : 7, 10)}>${esc(v.name)}</td><td class="small"${fitStyle(v.desc, showSh ? 11 : 16, 8.3)}>${esc(v.desc || '')}</td>
        ${prevRows.map(pr => `<td class="num">${dashN(tot(pr[v.id]))}</td>`).join('')}
        ${showSh ? `<td class="num cur l">${dashN(r.ys)}</td><td class="num cur">${dashN(r.sh)}</td><td class="num cur r">${dashN(tot(r))}</td>` : `<td class="num cur l r">${dashN(r.ys)}</td>`}
        <td class="small center"${fitStyle(v.ref, showSh ? 11.5 : 14, 8.3)}>${esc(v.ref || '')}</td><td class="small center wrap">${esc(mPeriod(db.cur, ym, v.id)).replace(/~/g, '~<wbr>')}</td></tr>`;   // 비고(기간)는 ~ 뒤에서 두 줄로
  }).join('');
  const widths = showSh ? [3.5, 7.5, 9.5, 13, 8.5, 8.5, 8.5, 8, 8.5, 13.5, 10.5] : [3.5, 7.5, 11, 19, 9.5, 9.5, 10, 16, 14];   // 시행사 없으면 유성 = 합계라 이번 달은 유성 한 칸만
  const body = `<div class="pf-sec"><span class="pf-no">1.</span><span><b>${esc(s.name)}현장 ${m}월분 집계표</b></span></div>
      <div class="pf-in"><table class="fc-tbl fc-mon fixed"><colgroup>${widths.map(w => `<col style="width:${w}%">`).join('')}</colgroup>
        ${showSh ? `<tr><th rowspan="2"></th><th rowspan="2">과목</th><th rowspan="2">업체명</th><th rowspan="2">거래내역</th>${prevYms.map(p => `<th>${monthNo(p)}월 집행</th>`).join('')}<th colspan="3" class="cur t">${m}월 집행</th><th rowspan="2" style="width:11%">참조문서</th><th rowspan="2" style="width:10%">비고</th></tr>
        <tr>${prevYms.map(() => '<th>합계</th>').join('')}<th class="cur l">유성</th><th class="cur">시행사</th><th class="cur r">합계</th></tr>`
        : `<tr><th></th><th>과목</th><th>업체명</th><th>거래내역</th>${prevYms.map(p => `<th>${monthNo(p)}월 집행</th>`).join('')}<th class="cur t">${m}월 집행</th><th>참조문서</th><th>비고</th></tr>`}
        ${rows || `<tr><td colspan="${widths.length}" class="center">-</td></tr>`}
        <tr class="fc-sum"><td colspan="4" class="center"><b>합계</b></td>${prevRows.map(pr => `<td class="num"><b>${fmt0(sum(Object.values(pr), tot))}</b></td>`).join('')}${showSh ? `<td class="num cur l b2"><b>${fmt0(t.ys)}</b></td><td class="num cur b2"><b>${fmt0(t.sh)}</b></td><td class="num cur r b2"><b>${fmt0(t.total)}</b></td>` : `<td class="num cur l r b2"><b>${fmt0(t.ys)}</b></td>`}<td></td><td></td></tr>
      </table></div>
      ${fcAttach('자금청구서, 지출결의서, 거래명세서, 세금계산서 등')}`;
  return fcPage(fcHead({ docNo, date, period: '', title: `${s.name}현장 ${m}월 경비 청구의 건` }), body);
}
// 지출결의서 (회사 양식, A4 세로). items: [{a: 업체, b: 구분·거래내역, amount, note}] 또는 {label, amount, note}
/* 지출결의서 — 회사 양식 (A4 가로, 왼쪽에 양식: 로고 · 현장 지출결의서 · 발의/결재/지출 · 결재란 · 일금 · 내역/실무책임자 · 적요/금액/비고 · 계 · 영수) */
function docExpense({ title, date, items, note, head, minRows = 12 }) {
  const s = site(), ap = (s.approvers || []).slice(0, 3), [y, mo, d] = String(date || todayStr()).split('-');
  const list = (items || []).filter(x => x && (x.amount || x.a || x.b || x.label)).map(x => ({ text: x.a !== undefined ? x.a || '' : '', text2: x.a !== undefined ? x.b || '' : (x.label || ''), amount: x.amount, note: x.note || '' }));   // 적요 A:D(좁은 칸) = 업체, E:J = 구분·거래내역 (업체 없으면 A:J 한 칸)
  if (head) list.unshift({ text: head, amount: 0, note: '', head: true });
  const total = sum(list, x => x.amount);
  // 원본 엑셀 "지출결의서" 시트(A1:S32)를 칸 그대로 옮김: 열 19개(px), 행 높이(pt), 맑은 고딕 10pt 굵게 · 제목 15pt.
  // 엑셀 인쇄 배율 74% 는 CSS(.ex-frame zoom)에서 적용
  const W = [37, 33, 33, 25, 33, 33, 33, 33, 33, 33, 33, 33, 33, 33, 33, 33, 33, 33, 33];
  const nA = Math.max(1, ap.length), apSpan = Array.from({ length: nA }, (_, i) => Math.floor(9 / nA) + (i < 9 % nA ? 1 : 0));   // 결재자 칸 K~S (9열)
  const td = (cs, rs, cls, h = '') => `<td${cs > 1 ? ` colspan="${cs}"` : ''}${rs > 1 ? ` rowspan="${rs}"` : ''}${cls ? ` class="${cls}"` : ''}>${h}</td>`;
  // 엑셀 "축소하여 전체 표시"(shrinkToFit) 흉내: 칸 너비(px)에 안 들어가면 글자 크기를 줄임 (한글 1em, 영문·숫자 약 0.55em 로 어림)
  const fit = (t, px) => { const em = [...String(t || '')].reduce((a, c) => a + (/[\u0000-ÿ]/.test(c) ? 0.55 : 1), 0) * 13.33, room = px - 8; return em > room ? ` style="font-size:${Math.max(5.5, 10 * room / em).toFixed(1)}pt"` : ''; };
  const tdF = (cs, cls, h, px) => `<td colspan="${cs}" class="${cls}"${fit(h, px)}>${esc(h)}</td>`;
  const sp6 = t => [...t].join('&nbsp;'.repeat(6));   // "내      역" 처럼 글자 사이 6칸
  const dateCells = (yy, mm, dd, rs) => td(2, rs, 'ex-nr', yy) + td(1, rs, 'ex-nl ex-nr', '년') + td(1, rs, 'ex-nl ex-nr', mm) + td(1, rs, 'ex-nl ex-nr', '월') + td(1, rs, 'ex-nl ex-nr', dd) + td(1, rs, 'ex-nl', '일');   // 원본처럼 날짜 칸 사이 세로선 없음   // D:E 년도 · F 년 · G 월 · H 월 · I 일 · J 일
  const n = Math.max(minRows, list.length);   // 원본: 17~28행 12줄 (품의서에 붙는 지출결의서는 빈 줄을 줄임)
  let rows = '';
  for (let i = 0; i < n; i++) {
    const x = list[i] || { text: '', amount: '', note: '' };
    const txt = x.head ? tdF(10, 'ex-t', x.text, 326) : x.text ? tdF(4, 'ex-t', x.text, 128) + tdF(6, 'ex-t', x.text2 || '', 198) : x.text2 ? tdF(10, 'ex-t', x.text2, 326) : td(4, 1, 'ex-t') + td(6, 1, 'ex-t');   // A:D | E:J
    rows += `<tr class="ex-i${x.head ? ' ex-head' : ''}">${txt}${td(5, 1, 'ex-n', x.amount === '' ? '' : fmt0(x.amount))}${tdF(4, 'ex-note', x.note, 132)}</tr>`;
  }
  return `<div class="doc ex"><div class="ex-frame">
      <table class="ex-tbl"><colgroup>${W.map(w => `<col style="width:${w}px">`).join('')}</colgroup>
        <tr class="ex-r12">${td(19, 1, 'ex-logo', '<img src="lib/yusung_logo.jpg" alt="">')}</tr>
        <tr class="ex-r3">${td(19, 1, 'ex-title', esc(title || `${s.name}현장 지출결의서`))}</tr>
        <tr class="ex-a">${td(3, 2, '', '발의')}${dateCells(y, +mo, +d, 2)}${ap.map((a, i) => td(apSpan[i], 1, '', esc(a.title))).join('')}</tr>
        <tr class="ex-a">${ap.map((a, i) => td(apSpan[i], 1, '', esc(a.name))).join('')}</tr>
        <tr class="ex-a2">${td(3, 1, '', '결재')}${dateCells(y, +mo, +d, 1)}${ap.map((a, i) => td(apSpan[i], 2, 'ex-sg' + (a.name ? '' : ' x'))).join('')}</tr>
        <tr class="ex-a2">${td(3, 1, '', '지출')}${dateCells(y, '', '', 1)}</tr>
        <tr class="ex-a2">${td(3, 2, '', '일금')}${td(6, 1, 'ex-kor ex-nr', numKor(total))}${td(1, 1, 'ex-nl', '원정')}${ap.map((a, i) => td(apSpan[i], 2, 'ex-sg2')).join('')}</tr>
        <tr class="ex-a2">${td(7, 1, 'ex-won', `<span>₩</span><span>${total ? fmt(total) : '-'}</span>`)}</tr>
        <tr class="ex-m">${td(10, 1, '', sp6('내역'))}${td(3, 1, '', '실무책임자')}${td(6, 1, 'ex-mgr', `${esc(s.manager || '')} ${signData() ? signHtml() : '<span>(서명)</span>'}`)}</tr>
        <tr class="ex-i">${td(10, 1, '', sp6('적요'))}${td(5, 1, '', sp6('금액'))}${td(4, 1, '', sp6('비고'))}</tr>
        ${rows}
        <tr class="ex-i">${td(10, 1, '', '계')}${td(5, 1, 'ex-n ex-tot', fmt0(total) || '-')}${td(4, 1, '', esc(note || 'VAT 포함'))}</tr>
        <tr class="ex-f">${td(19, 1, 'ex-fc', '위 금액을 영수합니다.')}</tr>
        <tr class="ex-f">${td(6, 1, 'ex-fc')}${td(2, 1, 'ex-fc right', y)}${td(1, 1, 'ex-fc', '년')}${td(1, 1, 'ex-fc right', +mo)}${td(1, 1, 'ex-fc', '월')}${td(1, 1, 'ex-fc right', +d)}${td(1, 1, 'ex-fc', '일')}${td(6, 1, 'ex-fc')}</tr>
        <tr class="ex-f">${td(6, 1, 'ex-fc')}${td(2, 1, 'ex-fc', '영수자')}${td(4, 1, 'ex-fc')}${td(3, 1, 'ex-fc', '(인)')}${td(4, 1, 'ex-fc')}</tr>
      </table>
    </div></div>`;
}
// 탭별 지출결의서 (인쇄·엑셀 저장 같이 씀)
function cashExpDoc(ym, date) {
  const amt = cashClaimAmt(ym);
  return docExpense({ date, items: [{ label: `전도금 청구 (${monthNo(ym)}월 정산)`, amount: amt, note: site().account || '' }], note: '' });
}
// 지출결의서 작성요령 6항: 기존 기안품의서가 있으면 "00월 00일 자 기안품의서 문서번호 ___ 참고" (품의 대장에서 기안일자를 찾음)
function pmRefNote(ref) {
  ref = String(ref || '').trim(); if (!ref) return '';
  const p = pmAll().find(x => x.docNo === ref || String(x.no) === ref), no = p && p.docNo ? p.docNo : ref;
  return `${p && p.date ? `${pad2(+p.date.slice(5, 7))}월 ${pad2(+p.date.slice(8, 10))}일 자 ` : ''}기안품의서 ${no} 참고`;
}
function monthlyExpDoc(ym, date) {
  const m = monthOf(db.cur, ym);
  const items = vendorsFor(ym).map(v => { const r = m.rows[v.id] || {}; return { a: v.name, b: v.desc || v.subject || '', amount: toNum(r.ys) + toNum(r.sh), note: [toNum(r.sh) && !toNum(r.ys) ? '시행사' : '', pmRefNote(v.ref)].filter(Boolean).join(' · ') }; }).filter(x => x.amount);
  return docExpense({ date, head: `${ym.slice(0, 4)}년 ${monthNo(ym)}월분 ${site().name}현장 월 경비`, items });
}
function payExpDoc(ym, date) {
  const groups = payGroups(payRows(db.cur, ym, true).filter(r => r.rec.payType !== '제외'));
  return docExpense({ date, head: `${ym.slice(0, 4)}년 ${monthNo(ym)}월분 ${site().name}현장 영업팀 인건비`, items: groups.filter(g => g.ys + g.sh).map(g => ({ a: g.company, b: `${g.team}${g.names && g.names.length ? `(${g.names.length > 2 ? `${g.names[0]} 외 ${g.names.length - 1}명` : g.names.join(',')})` : ''}`, amount: g.ys + g.sh, note: g.sh ? '시행사' : '' })), note: 'VAT 포함' });
}
// 엑셀 저장용 문서번호·기안일자: 인쇄 창에서 넣은 값, 없으면 인쇄 창 기본값
function docInfo(kind, ym = state.ym) {
  const d = (((db.docs || {})[db.cur] || {})[ym] || {})[kind] || {}, date = d.date || todayStr();
  return { no: d.no || (['pay', 'monthly', 'cash'].includes(kind) ? pmDocNoFor(kind, ym, date) : ''), date };
}
async function printDocs(htmls) {
  $('#printArea').innerHTML = htmls.join('');
  await Promise.all([...$('#printArea').querySelectorAll('img')].map(img => img.decode ? img.decode().catch(() => { }) : null));
  fitPfPages($('#printArea'));
  printPageName($('#printArea'));
  setTimeout(() => { window.print(); }, 50);
}
/* 크롬은 맨 끝 양식이 이름 붙은 쪽(@page rcland 등)이면 바깥(html·body)의 기본 쪽으로 빈 종이 한 장을 더 붙임
   → 바깥도 마지막 양식과 같은 쪽 이름으로. 이름 없는 양식은 기본 A4(a4p)로 고정해서 바깥 이름을 따라가지 않게 */
function printPageName(area) {
  const kids = [...area.children];
  kids.forEach(el => { el.style.page = ''; if (getComputedStyle(el).page === 'auto') el.style.page = 'a4p'; });
  const last = kids.length ? getComputedStyle(kids[kids.length - 1]).page : '';
  [document.documentElement, document.body, area].forEach(el => { el.style.page = last && last !== 'auto' ? last : ''; });
}
/* 회사 양식(.doc.pf: 품의서 등)이 A4 한 장을 넘으면 통째로 줄여서 한 장에 (A4 210×297, 여백 8·9mm) */
function fitPfPages(area) {
  const docs = [...area.querySelectorAll('.doc.pf')]; if (!docs.length) return;
  const mm = 96 / 25.4, W = 194, H = 278.5, old = area.style.cssText;
  area.style.cssText = `display:block;position:absolute;left:-10000px;top:0;width:${W}mm;visibility:hidden`;
  let minZ = 1;
  docs.forEach(d => {
    const fr = d.querySelector('.pf-frame'); if (!fr) return;
    fr.style.minHeight = '0';
    const h = fr.getBoundingClientRect().height / mm;
    fr.style.minHeight = '';
    if (h <= H - 4.5) return;   // 원래 최소 높이 274mm 안에 들어가면 그대로
    const z = H / h; minZ = Math.min(minZ, z);
    d.style.cssText += `;height:${H}mm;overflow:hidden`;
    fr.style.cssText += `;width:${100 / z}%;min-height:${H / z}mm;transform:scale(${z});transform-origin:0 0`;
  });
  area.style.cssText = old;
  if (minZ < 1) toast(`품의서 내용이 길어서 ${Math.round(minZ * 100)}% 크기로 줄여 한 장에 인쇄합니다.`);
}
function pmLinkInfo(kind, ym) {
  const m = monthNo(ym);
  if (kind === 'pay') return [sum(payGroups(payRows(db.cur, ym, true).filter(r => r.rec.payType !== '제외')), g => g.ys + g.sh), `${site().name}현장 ${m}월분 인건비 청구의 건`];
  if (kind === 'monthly') return [monthlyTotals(db.cur, ym).total, `${site().name}현장 ${m}월 월결제(경비 청구)의 건`];
  return [cashClaimAmt(ym), `${site().name}현장 ${m}월 전도금 정산 및 청구의 건`];
}
function docDialog(kind, defaults, onPrint) {
  const ym = state.ym;
  const d = nest(db.docs, db.cur, ym, kind);
  const seqGuess = ['pay', 'monthly', 'cash'].includes(kind) ? pmDocNoFor(kind, ym, d.date || todayStr()) : `${site().docPrefix}${ym.slice(2, 4)}${ym.slice(5, 7)}-`;
  modal({ pay: '인건비 자금청구서·지출결의서 인쇄', monthly: '월결제 자금청구서·지출결의서 인쇄', cash: '전도금 청구서 인쇄' }[kind] || '인쇄', `<div class="form-grid">
      <label>문서번호<input id="docNo" value="${esc(d.no || seqGuess)}"></label>
      <label>기안일자<input id="docDate" type="date" value="${esc(d.date || todayStr())}"></label></div>
      ${defaults || ''}<p class="muted small">인쇄 창에서 "PDF로 저장"을 고르면 PDF 파일로 저장할 수 있습니다.</p>`, [
    { label: '취소' },
    { label: '인쇄', cls: 'primary', onClick: (root) => { d.no = $('#docNo', root).value; d.date = $('#docDate', root).value || todayStr(); save(); onPrint(d.no, d.date, root);
      if (['pay', 'monthly', 'cash'].includes(kind)) { const [amt, title] = pmLinkInfo(kind, ym); pmRegisterDoc(kind, ym, d.no, d.date, amt, title); setTimeout(render, 0); toast(`품의 대장에 ${d.no} 로 등록했습니다. 결재 후 스캔본을 올리세요.`); } } }], 's');
}
