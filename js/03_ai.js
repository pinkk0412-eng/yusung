/* 유성 현장 관리 프로그램 — 영수증 AI 인식 (Claude API)·글자 인식
 * (원래 app.js 의 화면 부분. 모든 js/*.js 는 같은 전역 공간을 공유하며 html 에 적힌 순서대로 읽힘) */
'use strict';

/* ---------- 영수증 AI 인식 (Claude API) ----------
 * API 키·모델은 이 PC에만 저장 (드롭박스 데이터 폴더에 넣지 않음 — 공유 폴더라 다른 사람이 쓸 수 있기 때문)
 * 키가 없거나 인터넷이 안 되면 오프라인 글자 인식(lib/ocr)으로 자동 전환 */
const AI_MODELS = [['claude-opus-5-5', 'Claude Opus 5.5 (기본 · 가장 정확)'], ['claude-haiku-5-5', 'Claude Haiku 5.5 (저렴 · 빠름)']];
const aiCfg = {
  get key() { try { return localStorage.getItem('gyeongri_ai_key') || ''; } catch (e) { return ''; } },
  set key(v) { try { v ? localStorage.setItem('gyeongri_ai_key', v) : localStorage.removeItem('gyeongri_ai_key'); } catch (e) { } },
  get model() { try { return localStorage.getItem('gyeongri_ai_model') || AI_MODELS[0][0]; } catch (e) { return AI_MODELS[0][0]; } },
  set model(v) { try { localStorage.setItem('gyeongri_ai_model', v); } catch (e) { } },
};
const AI_HEADERS = () => ({ 'content-type': 'application/json', 'x-api-key': aiCfg.key, 'anthropic-version': '2026-10-21', 'anthropic-dangerous-direct-browser-access': 'true' });
const RECEIPT_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['receipts'],
  properties: {
    receipts: {
      type: 'array', items: {
        type: 'object', additionalProperties: false, required: ['date', 'time', 'amount', 'merchant', 'card4', 'memo', 'items_listed'],
        properties: {
          date: { type: 'string', description: 'YYYY-MM-DD, 모르면 빈 문자열' },
          time: { type: 'string', description: 'HH:MM (24시간), 모르면 빈 문자열' },
          amount: { type: 'integer', description: '최종 결제 합계 금액(원), 모르면 0' },
          merchant: { type: 'string', description: '가맹점명(상호)' },
          card4: { type: 'string', description: '카드번호 뒤 4자리 숫자, 없으면 빈 문자열' },
          memo: { type: 'string', description: '영수증 위에 손으로 쓴 메모 그대로 (예: 중식/홍길동,김철수), 없으면 빈 문자열' },
          items_listed: { type: 'boolean', description: '산 물건의 품목(상품명·수량) 내역이 영수증에 인쇄되어 있으면 true, 합계만 있으면 false' },
        },
      },
    },
  },
};
const RECEIPT_PROMPT = `이 사진은 한국 회사의 법인카드·현금 영수증(카드 매출전표, 앱 결제 화면, 간이영수증 등)입니다.
사진에 있는 영수증마다 아래 값을 읽어 주세요. 한 사진에 영수증이 여러 장 있으면 각각 따로, 영수증이 아니면 빈 목록을 돌려주세요.
- amount: 세금·봉사료가 아니라 실제로 결제된 최종 합계 금액
- date/time: 거래(승인) 일시
- merchant: 가맹점명(상호). 주소·대표자명은 넣지 마세요
- card4: 카드번호 마지막 4자리
- memo: 영수증 여백에 손글씨로 적힌 사용 내역을 보이는 그대로 (예: "중식/홍길동, 김철수, ○○건설(이영희)"). 인쇄된 글자는 넣지 마세요
- items_listed: 상품명(품목) 내역이 찍혀 있는지 (편의점·마트 영수증은 품목이 있어야 부가세 신고에 쓸 수 있음)
읽을 수 없는 값은 지어내지 말고 비워 두세요.`;
async function jpegB64(file, maxSide) {
  const bmp = await createImageBitmap(file);
  const sc = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * sc); c.height = Math.round(bmp.height * sc);
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(bmp, 0, 0, c.width, c.height);
  const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.88));
  const buf = new Uint8Array(await blob.arrayBuffer()); let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
  return btoa(bin);
}
async function aiReadReceipt(file) {
  const model = aiCfg.model;
  const out = await aiJson(file, RECEIPT_PROMPT, RECEIPT_SCHEMA, 1568);
  return (out.receipts || []).map(x => ({
    date: /^\d{4}-\d{2}-\d{2}$/.test(x.date || '') ? x.date : '', time: /^\d{1,2}:\d{2}/.test(x.time || '') ? x.time.slice(0, 5).padStart(5, '0') : '',
    amount: Math.max(0, Math.round(Number(x.amount) || 0)), merchant: String(x.merchant || '').trim().slice(0, 40),
    card4: (String(x.card4 || '').match(/\d{4}/) || [''])[0], memo: String(x.memo || '').trim().slice(0, 100), bizNo: '', noItems: x.items_listed === false,
    text: `AI 인식 (${model})\n` + JSON.stringify(x, null, 1),
  }));
}
async function aiJson(file, prompt, schema, maxSide) {
  return aiAsk([{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: await jpegB64(file, maxSide) } }, { type: 'text', text: prompt }], schema);
}
/* 파일 → AI 에 보낼 그림 조각들 (요금 절약: 긴 변 1568px JPEG, PDF 는 앞 maxPages 쪽만 그림으로 — PDF 통째로 보내면 글자+그림 둘 다 요금) */
async function aiFileParts(file, { maxSide = 1568, maxPages = 3 } = {}) {
  const img = data => ({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } });
  if (/pdf$/i.test(file.type) || /\.pdf$/i.test(file.name || '')) {
    let cs = []; try { cs = await fileCanvases(file); } catch (e) { cs = []; }
    if (!cs.length) throw new Error(`${file.name}: PDF를 열 수 없습니다`);
    return cs.slice(0, maxPages).map(c => img(scaledCanvas(c, maxSide).toDataURL('image/jpeg', 0.85).split(',')[1]));
  }
  try { return [img(await jpegB64(file, maxSide))]; }
  catch (e) { throw new Error(`${file.name}: 사진을 열 수 없습니다 (JPG·PNG·PDF만)`); }
}
async function aiAsk(content, schema, { maxTokens = 4000, effort = 'low', model: m, system } = {}) {
  const model = m || aiCfg.model;
  const body = {
    model, max_tokens: maxTokens,
    output_config: { effort, format: { type: 'json_schema', schema } },
    messages: [{ role: 'user', content }],
  };
  if (system) body.system = [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }];   // 고정 지침 = 캐시 (같은 지침을 연달아 쓰면 그 부분 요금 할인)
  const headers = AI_HEADERS();
  if (model === 'claude-opus-5-5') { body.fallbacks = 'default'; headers['anthropic-beta'] = 'server-side-fallback-2026-07-01'; }   // 안전 필터로 거절되면 다른 모델로 자동 재시도
  let res;
  try { res = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers, body: JSON.stringify(body) }); }
  catch (e) { throw new Error('인터넷 연결을 확인하세요'); }
  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    const m = (j.error && j.error.message) || res.statusText;
    throw new Error(res.status === 401 ? 'API 키가 올바르지 않습니다' : res.status === 429 ? '요청이 너무 많습니다. 잠시 후 다시 시도하세요' : res.status === 402 || /credit|billing/i.test(m) ? 'API 사용 잔액(크레딧)이 부족합니다' : `AI 오류 (${res.status}): ${m}`);
  }
  if (j.stop_reason === 'refusal') throw new Error('AI가 이 사진을 처리하지 않았습니다');
  if (j.stop_reason === 'max_tokens') throw new Error('AI 응답이 잘렸습니다');
  const txt = (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
  try { return JSON.parse(txt); } catch (e) { throw new Error('AI 응답을 읽을 수 없습니다'); }
}
async function aiTest() {
  if (!aiCfg.key) return '키를 먼저 입력하세요';
  try {
    const r = await fetch(`https://api.anthropic.com/v1/models/${aiCfg.model}`, { headers: AI_HEADERS() });
    if (r.ok) return 'ok';
    return r.status === 401 ? 'API 키가 올바르지 않습니다' : `연결 실패 (${r.status})`;
  } catch (e) { return '인터넷 연결을 확인하세요'; }
}

/* 영수증 사진 여러 장 → 글자 인식 → 내역에 자동 연결 / 새 내역 추가 (확인 후 저장) */
/* opt (10c 휴대폰 영수증): hintOf(file) → { date, amount, memo } 사진을 못 읽은 칸만 채움 · onSaved(저장한 파일들) — [저장] 뒤 */
async function ocrReceipts(src, files, opt = {}) {
  if (!FS.ready) return;
  const useAI = !!aiCfg.key;
  if (!useAI && !window.ReceiptOCR) { toast('글자 인식 파일(lib/ocr)이 없습니다.'); return; }
  if (!files) files = await pickFile('image/*,.pdf', true);
  const imgs = files.filter(f => /^image\//.test(f.type));
  for (const f of files.filter(x => /pdf/i.test(x.type) || /\.pdf$/i.test(x.name || ''))) {   // PDF 영수증 → 쪽마다 사진으로
    try { const pages = await pdfPages(f, 30); for (let i = 0; i < pages.length; i++) { const b = await new Promise(r => trimCanvas(pages[i]).toBlob(r, 'image/jpeg', 0.9)); imgs.push(new File([b], `${f.name.replace(/\.pdf$/i, '')}_${i + 1}쪽.jpg`, { type: 'image/jpeg' })); } }
    catch (e) { toast(`${f.name}: PDF를 읽을 수 없습니다 (${e.message})`); }
  }
  if (files.length && !imgs.length) { toast('사진 또는 PDF 영수증만 인식할 수 있습니다.'); return; }
  if (!imgs.length) return;
  const prog = modal('영수증 읽는 중', `<p id="ocrProg">${useAI ? 'AI로 읽는 중…' : '글자 인식 준비 중… (처음 한 번은 몇 초 걸립니다)'}</p>`, [], 's');
  const list = []; let aiErr = '';
  // 오프라인 인식: 편의점·마트 영수증에 "수량 금액" 품목 줄이 하나도 없으면 품목 없음으로 봄
  const itemLines = text => String(text || '').split(/\r?\n/).filter(l => /(^|\s)\d{1,3}\s+[\d,]{3,}\s*$/.test(l.trim()) && !/합\s*계|금\s*액|부가|과세|면세|받을|카드|승인|거스름/.test(l)).length;
  const offline = async f => { await ReceiptOCR.warm(); const text = await ReceiptOCR.read(f); const r = parseReceiptText(text); return [{ text, memo: '', ...r, noItems: CONV_STORE.test(r.merchant || '') && !itemLines(text) }]; };
  // AI 는 여러 장을 동시에 읽음 (한 장씩이면 장당 20~30초 → 6장 3분). 오프라인 인식은 한 번에 하나씩
  const PAR = useAI ? 4 : 1, results = new Array(imgs.length), t0 = Date.now();
  let next = 0, nDone = 0, offQ = Promise.resolve();
  const offlineOne = f => (offQ = offQ.catch(() => { }).then(() => offline(f)));
  const showProg = () => { const p = $('#ocrProg', prog); if (p) p.textContent = `${nDone} / ${imgs.length}장 읽음 — ${useAI && !aiErr ? `AI로 ${Math.min(PAR, imgs.length)}장씩 동시에 읽는 중…` : '읽는 중…'} (${Math.round((Date.now() - t0) / 1000)}초)`; };
  const tick = setInterval(showProg, 1000);
  const readOne = async i => {
    let found = null;
    for (let tryN = 0; useAI && !aiErr && !found && tryN < 2; tryN++) {
      try { found = await aiReadReceipt(imgs[i]); }
      catch (e) { if (tryN === 0 && /너무 많습니다|529|overloaded/i.test(e.message)) await new Promise(r => setTimeout(r, 3000 + Math.random() * 3000)); else { aiErr = e.message; } }   // 한꺼번에 보내서 밀리면 잠깐 쉬고 한 번 더
    }
    if (!found && window.ReceiptOCR) { try { found = await offlineOne(imgs[i]); } catch (e) { found = null; } }
    results[i] = found; nDone++; showProg();
  };
  try {
    showProg();
    await Promise.all(Array.from({ length: Math.min(PAR, imgs.length) }, async () => { while (next < imgs.length) await readOne(next++); }));
  } finally { clearInterval(tick); }
  try {
    for (let i = 0; i < imgs.length; i++) {
      let found = results[i];
      if (!found || !found.length) found = [{ date: '', time: '', amount: 0, merchant: '', card4: '', memo: '', text: '(영수증을 찾지 못함)' }];
      const hint = opt.hintOf && opt.hintOf(imgs[i]);
      if (hint) found.forEach(rc => { if (!rc.date && hint.date) rc.date = hint.date; if (!rc.amount && hint.amount && found.length === 1) rc.amount = hint.amount; if (!rc.memo && hint.memo) rc.memo = hint.memo; });
      const url = URL.createObjectURL(imgs[i]);
      found.forEach(rc => list.push({ file: imgs[i], url, ...rc }));
    }
  } catch (e) { closeModal(); toast('글자 인식을 시작할 수 없습니다: ' + e.message); return; }
  // 후보: 같은 종류(카드/전도금) 지출, 작업월 앞뒤 한 달
  const yms = [ymAdd(state.ym, -1), state.ym, ymAdd(state.ym, 1)];
  const pool = db.tx.filter(t => t.siteId === db.cur && t.src === src && t.kind !== 'in' && yms.includes(txYm(t)));
  const used = new Set();
  const candsOf = rc => pool.map(t => ({ t, s: receiptScore(rc, t) - ((t.receipts || []).length ? 15 : 0) })).filter(x => x.s > 0).sort((a, b) => b.s - a.s).slice(0, 6);
  list.forEach(rc => { rc.cands = candsOf(rc); });
  [...list].sort((a, b) => ((b.cands[0] || {}).s || 0) - ((a.cands[0] || {}).s || 0)).forEach(rc => {
    const best = rc.cands.find(x => x.s >= 60 && !used.has(x.t.id));
    if (best) { rc.pick = best.t.id; used.add(best.t.id); } else rc.pick = 'new';
  });
  const label = t => `${t.date.slice(5)} ${t.merchant || '(가맹점 없음)'} ${fmt(t.amount)}원${t.src === 'card' ? ' · ' + t.card : ''}${(t.receipts || []).length ? ' · 영수증 있음' : ''}`;
  const pickOpts = rc => `${rc.cands.map(x => `<option value="${x.t.id}" ${rc.pick === x.t.id ? 'selected' : ''}>연결: ${esc(label(x.t))}</option>`).join('')}
        <option value="new" ${rc.pick === 'new' ? 'selected' : ''}>새 ${src === 'card' ? '카드 ' : '지출 '}내역으로 추가</option>
        <option value="skip" ${rc.pick === 'skip' ? 'selected' : ''}>건너뛰기</option>`;
  const noCandNote = rc => (rc.cands.length ? '' : `금액이 같은 내역이 없습니다${src === 'card' ? ' (카드사 엑셀을 먼저 불러오세요)' : ''}`);
  const canScan = rc => typeof Scan !== 'undefined' && /^image\//.test((rc.orig || rc.file).type || '');   // m/scan.js
  const rows = list.map((rc, i) => `<tr data-orow="${i}">
      <td style="text-align:center;min-width:130px"><img src="${rc.url}" style="width:110px;max-height:140px;object-fit:contain;border:1px solid var(--line);border-radius:4px;cursor:pointer;display:block;margin:0 auto" data-ocrimg="${i}" title="${canScan(rc) ? '누르면 스캔 편집 (크게 보고 모서리 맞추기)' : '크게 보기'}">
        <div class="ph-acts">${canScan(rc) ? `<button class="btn sm edit" data-ocrscan="${i}" title="모서리를 맞춰 반듯하게 펴고 깨끗하게 (저장할 때 이 사진으로)">✂ 편집</button>` : ''}<button class="btn sm del" data-ocroff="${i}" title="이 영수증은 저장하지 않고 목록에서 뺍니다">🗑 빼기</button></div></td>
      <td><input type="date" value="${esc(rc.date)}" data-o="date" data-i="${i}" style="width:130px"><div class="muted small">${esc(rc.time || '')}${rc.card4 ? ' · 카드 ' + esc(rc.card4) : ''}</div></td>
      <td><input value="${esc(rc.merchant)}" data-o="merchant" data-i="${i}" style="min-width:150px">${rc.noItems && CONV_STORE.test(rc.merchant || '') ? '<div class="small" style="color:var(--bad)">⚠ 품목 내역 없음 — 부가세 신고 불가, 품목 영수증 다시 받기</div>' : ''}</td>
      <td><input class="num" value="${fmt0(rc.amount)}" data-o="amount" data-i="${i}" style="width:90px"></td>
      <td><input value="${esc(rc.memo || '')}" data-o="memo" data-i="${i}" style="min-width:170px" placeholder="손글씨 메모" title="연결할 내역의 사용내역이 비어 있을 때만 채웁니다"></td>
      <td><select data-o="pick" data-i="${i}" style="min-width:260px">${pickOpts(rc)}</select>
        <div class="small" data-onote="${i}" style="color:var(--warn)">${noCandNote(rc)}</div>
        <details class="small muted"><summary style="cursor:pointer">인식된 글자</summary><pre style="white-space:pre-wrap;max-height:160px;overflow:auto;font-size:11px">${esc(rc.text || '(글자를 찾지 못함)')}</pre></details></td>
      <td><select data-o="cat" data-i="${i}">${catOptions(guessCat({ merchant: rc.merchant, memo: rc.memo || '' }, db.merchantMap))}</select></td></tr>`).join('');
  const nLink = list.filter(rc => rc.pick !== 'new' && rc.pick !== 'skip').length;
  const root = modal(`영수증 ${list.length}건 인식 결과`, `${aiErr ? `<div class="banner warn small">AI 인식 실패: ${esc(aiErr)} → 오프라인 글자 인식으로 대신 읽었습니다.</div>` : ''}
      <p class="small">${useAI && !aiErr ? 'AI로 읽었습니다. ' : ''}자동으로 <b>${nLink}건</b>을 금액·날짜가 맞는 내역에 연결했습니다. 틀린 곳만 고치고 [저장]을 누르세요.
        <span class="muted">(금액·날짜는 꼭 확인)</span><br>잘못 읽은 날짜·가맹점·금액을 고쳐 쓰면 <b>고친 값으로 다시 찾아 연결</b>합니다.</p>
      <div class="tbl-wrap" style="max-height:60vh"><table class="t"><thead><tr><th>사진</th><th>날짜</th><th>가맹점</th><th>금액</th><th>사용내역(손글씨)</th><th>처리</th><th title="새 내역으로 추가할 때만 사용">세목(새 내역)</th></tr></thead><tbody>${rows}</tbody></table></div>`, [
    { label: '취소', onClick: () => { list.forEach(rc => URL.revokeObjectURL(rc.url)); } },
    {
      label: '저장', cls: 'primary', onClick: async r => {
        const val = (o, i) => r.querySelector(`[data-o="${o}"][data-i="${i}"]`).value;
        let linked = 0, added = 0, bad = 0; const done = new Set();
        for (let i = 0; i < list.length; i++) {
          const pick = val('pick', i); if (pick === 'skip') continue;
          let t = db.tx.find(x => x.id === pick);
          if (pick === 'new') {
            const rc = list[i], card = src === 'card' ? (siteCards().find(c => c.last4 === rc.card4) || siteCards()[0] || {}).last4 || rc.card4 || '' : '';
            t = { id: uid(), siteId: db.cur, src, kind: 'out', date: val('date', i) || `${state.ym}-01`, time: rc.time || '', card, merchant: val('merchant', i).trim(), amount: toNum(val('amount', i)), cat: val('cat', i), memo: val('memo', i).trim(), claim: false };
            applyMemoRule(t, parseMemoRules(db.settings.memoRules));
            if (!t.cat) t.cat = guessCat(t, db.merchantMap);
            db.tx.push(t); if (t.cat) learn(t); added++;
          } else { linked++; const m = val('memo', i).trim(); if (t && m && !String(t.memo || '').trim()) { t.memo = m; if (!t.cat) t.cat = guessCat(t, db.merchantMap); } }
          if (t) { bad += (await addReceipts(t, [list[i].file], true)).bad; done.add(list[i].orig || list[i].file); }
          if (t && list[i].noItems && CONV_STORE.test(t.merchant || list[i].merchant || '')) t.noItems = true;
        }
        list.forEach(rc => URL.revokeObjectURL(rc.url));
        save(); render(); toast(`영수증을 저장했습니다 — 연결 ${linked}건${added ? ` · 새 내역 ${added}건` : ''}${bad ? ` · ${rcWarnText(bad)}` : ''}`);
        if (opt.onSaved) setTimeout(() => opt.onSaved([...done]), 0);   // 이 창이 닫힌 뒤 (다음 창을 열 수 있게)
      }
    }]);
  // [🗑 빼기] = 처리를 '건너뛰기'로 (흐리게) · 다시 누르면 되살리기. 처리 칸에서 건너뛰기를 골라도 같게 보임
  const offSync = i => {
    const sel = root.querySelector(`[data-o="pick"][data-i="${i}"]`), off = sel.value === 'skip', b = root.querySelector(`[data-ocroff="${i}"]`);
    root.querySelector(`[data-orow="${i}"]`).classList.toggle('ocr-off', off);
    b.textContent = off ? '↺ 되살리기' : '🗑 빼기'; b.classList.toggle('del', !off);
  };
  root.querySelectorAll('[data-ocroff]').forEach(b => b.onclick = () => {
    const i = +b.dataset.ocroff, rc = list[i], sel = root.querySelector(`[data-o="pick"][data-i="${i}"]`);
    if (sel.value !== 'skip') { rc.back = sel.value; sel.value = 'skip'; } else sel.value = rc.back && rc.back !== 'skip' ? rc.back : (rc.cands[0] && rc.cands[0].s >= 60 ? rc.cands[0].t.id : 'new');
    offSync(i);
  });
  root.querySelectorAll('[data-o="pick"]').forEach(sel => sel.addEventListener('change', () => offSync(+sel.dataset.i)));
  root.querySelectorAll('[data-ocrimg]').forEach(img => img.onclick = () => { const b = root.querySelector(`[data-ocrscan="${img.dataset.ocrimg}"]`); if (b) b.click(); else window.open(img.src, '_blank'); });
  root.querySelectorAll('[data-ocrscan]').forEach(b => b.onclick = async () => {   // 스캔 편집 → 같은 사진을 쓰는 줄 모두 편집한 사진으로 (rc.orig = 원래 파일: 10c 휴대폰 사진함에서 지울 때 씀)
    const rc0 = list[+b.dataset.ocrscan], old = rc0.file, src0 = rc0.orig || old;   // 다시 고칠 때도 원래 사진에서 (모서리 위치는 원래 사진 기준)
    let r; try { r = await Scan.open(src0, rc0.scanEdit, { delLabel: '취소' }); } catch (e) { toast('스캔 편집을 열지 못했습니다: ' + e.message); return; }
    if (!r || !r.blob) return;
    const nf = new File([r.blob], (src0.name || '영수증').replace(/\.[^.]+$/, '') + '_스캔.jpg', { type: 'image/jpeg' }), url = URL.createObjectURL(nf);
    list.forEach((rc, i) => { if (rc.file !== old) return; rc.orig = rc.orig || old; rc.file = nf; rc.url = url; rc.scanEdit = r.edit; const im = root.querySelector(`[data-ocrimg="${i}"]`); if (im) im.src = url; });
  });
  // OCR 이 틀렸을 때: 날짜·가맹점·금액을 고쳐 쓰면 그 값으로 후보를 다시 찾고, 다른 줄이 고르지 않은 가장 맞는 내역에 연결
  root.querySelectorAll('[data-o="date"],[data-o="merchant"],[data-o="amount"]').forEach(el => el.addEventListener('change', () => {
    const i = +el.dataset.i, rc = list[i], get = o => root.querySelector(`[data-o="${o}"][data-i="${i}"]`);
    rc.date = get('date').value; rc.merchant = get('merchant').value.trim(); rc.amount = toNum(get('amount').value);
    rc.cands = candsOf(rc);
    const sel = get('pick'), taken = new Set([...root.querySelectorAll('[data-o="pick"]')].filter(s => s !== sel).map(s => s.value));
    const best = rc.cands.find(x => x.s >= 60 && !taken.has(x.t.id));
    rc.pick = sel.value === 'skip' ? 'skip' : best ? best.t.id : 'new';   // 뺀 줄은 그대로 빼 둠
    sel.innerHTML = pickOpts(rc);
    root.querySelector(`[data-onote="${i}"]`).textContent = noCandNote(rc);
    if (el.dataset.o === 'merchant') get('cat').innerHTML = catOptions(guessCat({ merchant: rc.merchant, memo: get('memo').value }, db.merchantMap));
  }));
}
