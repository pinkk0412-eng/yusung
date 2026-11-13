/* 유성 현장 관리 프로그램 — 영수증·증빙 파일, 사진 보정·품질 점검, 영수증철 인쇄
 * (원래 app.js 의 화면 부분. 모든 js/*.js 는 같은 전역 공간을 공유하며 html 에 적힌 순서대로 읽힘) */
'use strict';


/* ---------- 영수증 · 증빙 파일 ---------- */
async function shrinkImage(file, maxSide = 2000, q = 0.85, maxPx = 0) {
  const bmp = await createImageBitmap(file);
  let sc = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  if (maxPx) sc = Math.min(sc, Math.sqrt(maxPx / (bmp.width * bmp.height)));   // 긴 영수증도 글자가 읽히게 넓이 기준
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * sc); c.height = Math.round(bmp.height * sc);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return await new Promise(r => c.toBlob(r, 'image/jpeg', q));
}
/* 용량 정리: 현장 폴더의 폴더별 용량 + 큰 사진(600KB 넘는 JPG)을 긴 변 1800픽셀로 줄이기 */
async function walkFiles(dir, path, out) {
  for await (const [name, h] of dir.entries()) {
    const p = path ? `${path}/${name}` : name;
    if (h.kind === 'directory') await walkFiles(h, p, out);
    else { try { const f = await h.getFile(); out.push({ path: p, name, size: f.size, h }); } catch (e) { } }
  }
  return out;
}
const fmtSize = b => (b >= 1048576 ? `${(b / 1048576).toFixed(1)}MB` : `${Math.max(1, Math.round(b / 1024))}KB`);
async function storageDialog() {
  if (!FS.ready) return;
  const s = site(); let files;
  try { files = await walkFiles(await dirAt([s.folder], false), '', []); } catch (e) { toast('현장 폴더를 읽을 수 없습니다.'); return; }
  const big = f => /\.jpe?g$/i.test(f.name) && f.size > 600 * 1024;
  const groups = {};
  files.forEach(f => { const ps = f.path.split('/'); const k = ps.length < 2 ? '(설정 파일)' : ps[0] === DIR.fund && ps.length > 2 ? ps[1] : ps[0]; const g = groups[k] = groups[k] || { n: 0, size: 0, big: 0 }; g.n++; g.size += f.size; if (big(f)) g.big++; });
  const bigs = files.filter(big), tot = sum(files, f => f.size);
  const rows = Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0])).map(([k, g]) => `<tr><td>${esc(k)}</td><td class="num">${g.n}</td><td class="num">${fmtSize(g.size)}</td><td class="num">${g.big || ''}</td></tr>`).join('');
  modal(`용량 정리 — ${s.name}현장 폴더`, `<div class="tbl-wrap" style="max-height:50vh"><table class="t"><thead><tr><th>폴더</th><th>파일</th><th>용량</th><th>큰 사진</th></tr></thead><tbody>${rows}
      <tr class="sum"><td>합계</td><td class="num">${files.length}</td><td class="num">${fmtSize(tot)}</td><td class="num">${bigs.length || ''}</td></tr></tbody></table></div>
      <p class="small">${bigs.length ? `600KB가 넘는 사진 <b>${bigs.length}개</b>(${fmtSize(sum(bigs, f => f.size))})를 긴 변 1,800픽셀로 줄이면 보통 절반 이하로 줄어듭니다. 인쇄·확인에는 충분한 크기이고, 같은 파일에 덮어씁니다.` : '줄일 큰 사진이 없습니다.'}</p>
      <p class="muted small">사진은 작게 줄여 저장합니다 · 용량이 부족하면 설정 → <b>영수증 보관 폴더</b></p>`, [
    { label: '닫기' },
    ...(bigs.length ? [{ label: `큰 사진 ${bigs.length}개 줄이기`, cls: 'primary', onClick: async () => {
      let saved = 0, n = 0, fail = 0;
      for (const f of bigs) {
        try { const file = await f.h.getFile(); const blob = await shrinkImage(file, 1800, 0.82); if (blob && blob.size < file.size * 0.9) { const w = await f.h.createWritable(); await w.write(blob); await w.close(); saved += file.size - blob.size; n++; } }
        catch (e) { fail++; }
        if ((n + fail) % 10 === 0) toast(`사진 줄이는 중… ${n + fail} / ${bigs.length}`);
      }
      toast(`사진 ${n}개를 줄여 ${fmtSize(saved)} 아꼈습니다${fail ? ` · ${fail}개 실패(드롭박스 동기화 중일 수 있음 — 잠시 후 다시)` : ''}.`);
    } }] : [])]);
}
/* 영수증·증빙·입고사진은 작게 저장 (긴 변 2400 · 약 250만 화소 · 화질 75%) — 한 장 0.15~0.3MB */
const PHOTO_OPT = { lim: 300000, side: 2400, q: 0.75, px: 2500000 };
const shrinkPhoto = f => shrinkImage(f, PHOTO_OPT.side, PHOTO_OPT.q, PHOTO_OPT.px);
async function storeFile(subParts, baseName, file) {
  const photo = isPhotoPath([site().folder, ...subParts].join('/'));
  let blob = file, ext = ((file.name || '').match(/\.[A-Za-z0-9]+$/) || ['.jpg'])[0].toLowerCase();
  if (/^image\/(jpeg|png|webp)/.test(file.type) && file.size > (photo ? PHOTO_OPT.lim : 900000)) {
    try { const b = photo ? await shrinkPhoto(file) : await shrinkImage(file); if (b && b.size < file.size) { blob = b; ext = '.jpg'; } } catch (e) { blob = file; } }
  const dir = await dirAt([site().folder, ...subParts]);
  let name = baseName + ext, i = 2;   // 같은 이름 확인은 영수증 폴더·데이터 폴더 둘 다
  for (; ;) { try { await fileAt([site().folder, ...subParts, name].join('/'), false); name = `${baseName}_${i++}${ext}`; } catch (e) { break; } }
  const h = await dir.getFileHandle(name, { create: true }); const w = await h.createWritable(); await w.write(blob); await w.close();
  return [...subParts, name].join('/');
}
/* ---------- 영수증 사진: 인쇄용 보정 · 품질 점검 · PDF → 그림 ---------- */
const loadScript = src => new Promise((ok, no) => {
  if (document.querySelector(`script[data-src="${src}"]`)) return ok();
  const s = document.createElement('script'); s.src = src; s.dataset.src = src; s.onload = ok; s.onerror = () => no(new Error(`${src} 파일이 없습니다`)); document.head.appendChild(s);
});
async function pdfLib() {   // lib/pdf (pdf.js) — 처음 쓸 때만 불러옴. 작업 파일을 먼저 읽어 두면 별도 작업자 없이 이 창에서 처리
  if (!window.pdfjsLib) { await loadScript('lib/pdf/pdf.worker.min.js'); await loadScript('lib/pdf/pdf.min.js'); }
  if (!window.pdfjsLib) throw new Error('PDF 읽기 파일(lib/pdf)이 없습니다');
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'lib/pdf/pdf.worker.min.js';
  return window.pdfjsLib;
}
const newCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };
async function pdfPages(blob, maxPages = 20) {   // PDF 각 쪽 → 그림(canvas)
  const lib = await pdfLib();
  const doc = await lib.getDocument({ data: new Uint8Array(await blob.arrayBuffer()), isEvalSupported: false }).promise;
  const out = [];
  for (let i = 1; i <= Math.min(doc.numPages, maxPages); i++) {
    const pg = await doc.getPage(i); const v1 = pg.getViewport({ scale: 1 });
    const vp = pg.getViewport({ scale: Math.min(3, 2400 / Math.max(v1.width, v1.height)) });
    const c = newCanvas(vp.width, vp.height), g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    await pg.render({ canvasContext: g, viewport: vp }).promise; out.push(c);
  }
  doc.destroy(); return out;
}
async function toCanvas(blob, maxSide = 2400) {
  const bmp = await createImageBitmap(blob);
  const sc = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const c = newCanvas(bmp.width * sc, bmp.height * sc), g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(bmp, 0, 0, c.width, c.height); if (bmp.close) bmp.close();
  return c;
}
async function fileCanvases(file) {   // 사진 1장 또는 PDF 여러 쪽
  if (/pdf/i.test(file.type) || /\.pdf$/i.test(file.name || '')) return (await pdfPages(file)).map(trimCanvas);
  if (/^image\//.test(file.type) || /\.(jpe?g|png|webp|gif|bmp)$/i.test(file.name || '')) return [await toCanvas(file)];
  return [];
}
function grayOf(c) {
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data, g = new Float32Array(c.width * c.height);
  for (let i = 0, j = 0; j < g.length; i += 4, j++) g[j] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  return g;
}
function pctOf(arr, p, max = 256) {   // 히스토그램 백분위
  const h = new Uint32Array(max); for (let i = 0; i < arr.length; i++) h[Math.min(max - 1, Math.max(0, arr[i] | 0))]++;
  let acc = 0; const need = arr.length * p / 100; for (let v = 0; v < max; v++) { acc += h[v]; if (acc >= need) return v; } return max - 1;
}
function scaledCanvas(c, maxSide) { const sc = Math.min(1, maxSide / Math.max(c.width, c.height)); if (sc === 1) return c; const o = newCanvas(c.width * sc, c.height * sc); o.getContext('2d').drawImage(c, 0, 0, o.width, o.height); return o; }
// 빈 여백 잘라내기 (PDF 쪽 등)
function trimCanvas(c) {
  const s = scaledCanvas(c, 500), g = grayOf(s), w = s.width, h = s.height;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (g[y * w + x] < 200) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return c;
  const k = c.width / w, m = 8;
  const sx = Math.max(0, x0 * k - m), sy = Math.max(0, y0 * k - m), sw = Math.min(c.width, (x1 + 1) * k + m) - sx, sh = Math.min(c.height, (y1 + 1) * k + m) - sy;
  if (sw > c.width * 0.95 && sh > c.height * 0.95) return c;
  const o = newCanvas(sw, sh); o.getContext('2d').drawImage(c, sx, sy, sw, sh, 0, 0, o.width, o.height); return o;
}
/* 품질 점검 — 인쇄했을 때 안 보일 사진을 미리 알려 줌 (어두움·대비·흐림·해상도) */
function rcQuality(c) {
  const warn = [];
  if (Math.min(c.width, c.height) < 400) warn.push('해상도 낮음');
  const s = scaledCanvas(c, 1000), g = grayOf(s), w = s.width, h = s.height;
  const p5 = pctOf(g, 5), p95 = pctOf(g, 95);
  if (p95 < 80) warn.push('너무 어두움');
  if (p95 - p5 < 30) { warn.push('글자가 흐릿함'); return warn; }
  const lap = new Float32Array(Math.max(1, (w - 2) * (h - 2))); let k = 0;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const i = y * w + x; lap[k++] = Math.abs(4 * g[i] - g[i - 1] - g[i + 1] - g[i - w] - g[i + w]); }
  const sharp = pctOf(lap, 99, 1024);
  if (sharp / (p95 - p5) < 0.2) warn.push('흐림(초점 안 맞음)');
  return warn;
}
/* 인쇄용 보정 — 종이 배경 밝기를 추정해 나눠서 그림자·어두움을 없애고, 글자는 진하게 (흑백 문서 모드) */
function rcEnhance(c) {
  const w = c.width, h = c.height, g = grayOf(c);
  const sw = Math.max(1, Math.round(w / 16)), sh = Math.max(1, Math.round(h / 16));
  const sc = newCanvas(sw, sh); sc.getContext('2d').drawImage(c, 0, 0, sw, sh);
  let b = grayOf(sc);
  const filt = (a, r, fn) => { const o = new Float32Array(a.length); for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) { let v = fn === 'max' ? 0 : 0, n = 0; for (let dy = -r; dy <= r; dy++) { const yy = Math.min(sh - 1, Math.max(0, y + dy)); for (let dx = -r; dx <= r; dx++) { const xx = Math.min(sw - 1, Math.max(0, x + dx)); const q = a[yy * sw + xx]; if (fn === 'max') { if (q > v) v = q; } else { v += q; n++; } } } o[y * sw + x] = fn === 'max' ? v : v / n; } return o; };
  b = filt(filt(filt(b, 1, 'max'), 1, 'max'), 2, 'avg');
  const bc = newCanvas(sw, sh), bctx = bc.getContext('2d'), bi = bctx.createImageData(sw, sh);
  for (let i = 0; i < b.length; i++) { const v = Math.max(1, Math.min(255, b[i])); bi.data[i * 4] = bi.data[i * 4 + 1] = bi.data[i * 4 + 2] = v; bi.data[i * 4 + 3] = 255; }
  bctx.putImageData(bi, 0, 0);
  const fc = newCanvas(w, h), fctx = fc.getContext('2d'); fctx.imageSmoothingEnabled = true; fctx.imageSmoothingQuality = 'high'; fctx.drawImage(bc, 0, 0, w, h);
  const bf = grayOf(fc);
  const o = new Float32Array(w * h); for (let i = 0; i < o.length; i++) o[i] = Math.min(255, g[i] / Math.max(1, bf[i]) * 255);
  const lo = Math.min(200, pctOf(o, 1)), hi = 235;
  const lut = new Uint8ClampedArray(256); for (let v = 0; v < 256; v++) lut[v] = Math.round(Math.pow(Math.min(1, Math.max(0, (v - lo) / (hi - lo))), 1.25) * 255);
  const out = fctx.createImageData(w, h);
  for (let i = 0; i < o.length; i++) { const v = lut[o[i] | 0]; out.data[i * 4] = out.data[i * 4 + 1] = out.data[i * 4 + 2] = v; out.data[i * 4 + 3] = 255; }
  fctx.putImageData(out, 0, 0);
  return fc;
}
const canvasURL = (c, q = 0.9) => new Promise(r => c.toBlob(b => r(URL.createObjectURL(b)), 'image/jpeg', q));
async function checkReceipt(t, rel, file) {   // 올린 영수증 사진 점검 → t.rcCheck[rel] = '흐림,…' (괜찮음 처리하면 '')
  if (!/^image\//.test(file.type || '')) return [];
  try { const warn = rcQuality(await toCanvas(file, 1600)); t.rcCheck = t.rcCheck || {}; t.rcCheck[rel] = warn.join(', '); if (!warn.length) delete t.rcCheck[rel]; return warn; } catch (e) { return []; }
}
const rcWarnText = n => `⚠ 영수증 ${n}장이 인쇄하면 잘 안 보일 수 있습니다 (어둡거나 흐림) — 다시 찍어 받거나, 영수증 보기에서 확인하세요`;
async function addReceipts(t, files, quiet) {
  if (!FS.ready) return { bad: 0 };
  const ym = txYm(t) || state.ym;
  const base = `${t.date.replace(/-/g, '')}_${t.src === 'card' ? (t.card || '카드') : '전도금'}_${safeName(t.merchant || '내역').replace(/ /g, '').slice(0, 16)}_${Math.round(t.amount)}`;
  t.receipts = t.receipts || [];
  let bad = 0;
  try { for (const f of files) { const rel = await storeFile([...parts(monthPath(ym)), '영수증'], base, f); t.receipts.push(rel); if ((await checkReceipt(t, rel, f)).length) bad++; } }
  catch (e) { toast('영수증을 저장하지 못했습니다: ' + e.message); }
  if (quiet) return { bad };
  save(); render(); toast(bad ? rcWarnText(bad) : `영수증 ${files.length}개 저장`);
  return { bad };
}
async function fileURL(rel) { const f = await (await fileAt(`${site().folder}/${rel}`, false)).getFile(); return { url: URL.createObjectURL(f), type: f.type || '', name: f.name }; }
async function removeFile(rel) { RM_Q.push({ folder: site().folder, rel, at: Date.now() }); rmQSave(); }   // 바로 지우지 않고 30분 뒤에 (01 rmQRun · Ctrl+Z 로 되살릴 수 있게)
async function showFiles(title, list, onDelete, onAdd) {
  const items = [];
  for (const rel of list) { try { items.push({ rel, ...(await fileURL(rel)) }); } catch (e) { items.push({ rel, missing: true, name: rel.split('/').pop() }); } }
  const body = items.length ? items.map((x, i) => `<div class="panel"><div class="row small"><b class="grow">${esc(x.name)}</b>${onDelete ? `<button class="btn sm danger" data-fdel="${i}">삭제</button>` : ''}</div>
      ${x.missing ? '<p class="muted">파일을 찾을 수 없습니다 (폴더에서 지워졌을 수 있음)</p>' : /^image\//.test(x.type) ? `<img src="${x.url}" style="max-width:100%;max-height:70vh;display:block;margin:6px auto">` : /pdf/.test(x.type) ? `<iframe src="${x.url}" style="width:100%;height:70vh;border:0"></iframe>` : `<p class="muted">미리보기를 지원하지 않는 파일입니다. 폴더에서 직접 여세요.</p>`}</div>`).join('') : '<p class="muted">등록된 파일이 없습니다.</p>';
  const where = list.length ? list[0].split('/').slice(0, -1).join('/') : '';
  const root = modal(title, body + `<p class="muted small">저장 위치: 📁 ${esc(FS.root.name)}/${esc(site().folder)}/${esc(where)}</p>`, [
    ...(onAdd ? [{ label: '+ 파일 추가', onClick: () => { onAdd(); } }] : []), { label: '닫기' }]);
  root.querySelectorAll('[data-fdel]').forEach(b => b.onclick = async () => { const x = items[+b.dataset.fdel]; if (!confirm(`${x.name} 파일을 삭제할까요?`)) return; closeModal(); await onDelete(x.rel); });
}
/* 영수증 보기 + 그 자리에서 내역 작성 (왼쪽 사진, 오른쪽 입력칸, 이전/다음 이동) */
async function viewReceipts(t) {
  const nav = db.tx.filter(x => x.siteId === db.cur && x.src === t.src && x.kind !== 'in' && txYm(x) === txYm(t) && (x.receipts || []).length)
    .sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
  const pos = nav.findIndex(x => x.id === t.id);
  const items = [];
  for (const rel of t.receipts || []) { try { items.push({ rel, ...(await fileURL(rel)) }); } catch (e) { items.push({ rel, missing: true, name: rel.split('/').pop() }); } }
  const warnOf = rel => (t.rcCheck || {})[rel];
  const pics = items.length ? items.map((x, i) => `<div style="margin-bottom:10px"><div class="row small"><span class="grow muted">${esc(x.name)}</span>${/^image\//.test(x.type || '') ? `<button class="btn sm edit" data-fscan="${i}" title="모서리를 맞춰 반듯하게 펴고 깨끗하게 (스캔 앱처럼)">✂ 스캔 편집</button>` : ''}<button class="btn sm del" data-fdel="${i}" style="margin-left:4px">🗑 사진 삭제</button></div>
      ${warnOf(x.rel) ? `<div class="banner warn small" style="margin:4px 0">⚠ 인쇄하면 잘 안 보일 수 있음: <b>${esc(warnOf(x.rel))}</b> — 다시 찍어 받는 것을 권장 <button class="btn sm" data-rcok="${i}" title="확인해 보니 읽을 수 있으면 경고를 지웁니다">괜찮음</button></div>` : ''}
      ${x.missing ? '<p class="muted">파일을 찾을 수 없습니다 (폴더에서 지워졌을 수 있음)</p>' : /^image\//.test(x.type) ? `<img src="${x.url}" style="max-width:100%;display:block;margin:4px auto">` : /pdf/.test(x.type) ? `<iframe src="${x.url}" style="width:100%;height:65vh;border:0"></iframe>` : '<p class="muted">미리보기를 지원하지 않는 파일입니다.</p>'}</div>`).join('') : '<p class="muted">등록된 영수증이 없습니다. Ctrl+V로 붙여넣거나 [+ 사진 추가]를 누르세요.</p>';
  const isCard = t.src === 'card';
  const cardIds = [...new Set([...siteCards().map(c => c.last4), t.card].filter(Boolean))];
  const form = `
      <label>일자<input type="date" value="${esc(t.date)}" data-rcf="date"></label>
      ${isCard ? `<label>카드<select data-rcf="card">${cardIds.map(c => `<option ${c === t.card ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label>` : ''}
      <label>${isCard ? '가맹점' : '거래처'}<input value="${esc(t.merchant)}" data-rcf="merchant"></label>
      <label>금액<input class="num" value="${fmt(t.amount)}" data-rcf="amount"></label>
      <label>세목<select data-rcf="cat">${catOptions(t.cat)}</select></label>
      <label>${isCard ? '사용내역 (구분/사용자)' : '거래내용'}<input value="${esc(t.memo)}" data-rcf="memo" placeholder="예) 중식/홍길동,김철수"></label>
      <div class="chips small">${['중식/', '석식/', '간식/', '커피/', '회식/'].map(x => `<button class="chip tpl" data-rchip="${x}">${x}</button>`).join('')}${siteStaff().filter(isQuick).map(s => `<button class="chip" data-rchip="${esc(s.name)}">${esc(s.name)}</button>`).join('')}</div>
      ${isCard && claimOn() ? `<label class="small" style="margin-top:6px"><input type="checkbox" data-rcf="claim" ${t.claim ? 'checked' : ''}> 시행사 청구 가능</label>` : ''}
      ${CONV_STORE.test(t.merchant || '') ? `<label class="small" style="margin-top:6px;display:block"><input type="checkbox" data-rcf="noItems" ${t.noItems ? 'checked' : ''}> 품목 내역이 없는 영수증 (편의점·마트 — 부가세 신고 불가)</label>` : ''}
      <p class="muted small" style="margin-top:10px">입력하면 바로 저장됩니다 · Enter = 다음 영수증 · Ctrl+V = 사진 추가</p>`;
  const go = x => { if (x) viewReceipts(x); return true; };
  const root = modal(`영수증${pos >= 0 ? ` ${pos + 1}/${nav.length}` : ''} — ${t.date} ${t.merchant || ''} ${fmt(t.amount)}원`,
    `<div class="rc-edit"><div class="rc-img">${pics}</div><div class="rc-form">${form}</div></div>`, [
    ...(pos > 0 ? [{ label: '◀ 이전', onClick: () => go(nav[pos - 1]) }] : []),
    ...(pos >= 0 && pos < nav.length - 1 ? [{ label: '다음 ▶', cls: 'primary', onClick: () => go(nav[pos + 1]) }] : []),
    { label: '+ 사진 추가', onClick: async () => { const files = await pickFile('image/*,.pdf', true); if (files.length) { await addReceipts(t, files, true); save(); } viewReceipts(t); return true; } },
    { label: '닫기', onClick: () => { render(); } }]);
  state.rcModalTx = t.id;   // 이 창이 열려 있을 때 Ctrl+V → 이 내역에 추가
  modalSize(root, 'xl');
  const set = el => {
    const f = el.dataset.rcf;
    if (f === 'amount') t.amount = toNum(el.value); else if (f === 'claim' || f === 'noItems') t[f] = el.checked; else t[f] = el.value;
    if (f === 'cat' && t.cat) learn(t);
    if (f === 'memo' && !t.cat) { const c = guessCat(t, db.merchantMap); if (c) { t.cat = c; root.querySelector('[data-rcf=cat]').value = c; } }
    save();
  };
  root.querySelectorAll('[data-rcf]').forEach(el => {
    el.onchange = () => set(el);
    if (el.tagName === 'INPUT' && el.type !== 'checkbox') el.onkeydown = ev => { if (ev.key === 'Enter') { ev.preventDefault(); set(el); const nx = nav[pos + 1]; if (nx) viewReceipts(nx); else { closeModal(); render(); toast('마지막 영수증입니다.'); } } };
  });
  const memo = root.querySelector('[data-rcf=memo]');
  root.querySelectorAll('[data-rchip]').forEach(b => b.onclick = () => {
    const v = b.dataset.rchip; let cur = memo.value;
    if (v.endsWith('/')) cur = v + cur.replace(/^[^/]{1,6}\//, ''); else cur = cur + (cur && !cur.endsWith('/') && !cur.endsWith(',') ? ',' : '') + v;
    memo.value = cur; set(memo); memo.focus();
  });
  root.querySelectorAll('[data-fdel]').forEach(b => b.onclick = async () => {
    const x = items[+b.dataset.fdel]; if (!confirm(`${x.name} 사진을 삭제할까요?`)) return;
    await removeFile(x.rel); t.receipts = (t.receipts || []).filter(r => r !== x.rel); if (t.rcCheck) delete t.rcCheck[x.rel]; save(); viewReceipts(t);
  });
  root.querySelectorAll('[data-rcok]').forEach(b => b.onclick = () => { const x = items[+b.dataset.rcok]; t.rcCheck = t.rcCheck || {}; t.rcCheck[x.rel] = ''; save(); viewReceipts(t); });
  root.querySelectorAll('[data-fscan]').forEach(b => b.onclick = async () => { const x = items[+b.dataset.fscan]; if (await rcScanEdit(t, x.rel)) viewReceipts(t); });
  setTimeout(() => { if (!t.memo && memo) memo.focus(); }, 0);
}
/* 저장된 영수증 사진 스캔 편집 (m/scan.js) → 새 파일 '…_스캔.jpg' 로 저장하고 내역의 사진을 바꿈.
 * 원본은 removeFile(30분 뒤 지움) — 그 전에 Ctrl+Z 하면 원래 사진으로 돌아감 */
async function rcScanEdit(t, rel) {
  if (typeof Scan === 'undefined') { toast('스캔 편집 파일(m/scan.js)이 없습니다.'); return false; }
  let f; try { f = await (await fileAt(`${site().folder}/${rel}`, false)).getFile(); } catch (e) { toast('사진을 열지 못했습니다: ' + e.message); return false; }
  let r; try { r = await Scan.open(f, null, { delLabel: '취소' }); } catch (e) { toast('스캔 편집을 열지 못했습니다: ' + e.message); return false; }
  if (!r || !r.blob) return false;
  const ps = rel.split('/'), name = ps.pop(), base = name.replace(/\.[^.]+$/, '').replace(/_스캔(_\d+)?$/, '') + '_스캔';
  let nrel; try { nrel = await storeFile(ps, base, new File([r.blob], base + '.jpg', { type: 'image/jpeg' })); } catch (e) { toast('편집한 사진을 저장하지 못했습니다: ' + e.message); return false; }
  t.receipts = (t.receipts || []).map(x => (x === rel ? nrel : x));
  if (t.rcCheck) delete t.rcCheck[rel];
  await checkReceipt(t, nrel, r.blob);
  await removeFile(rel); save(); toast('영수증 사진을 반듯하게 고쳤습니다. (Ctrl+Z = 되돌리기)');
  return true;
}
const attachOf = ym => { const a = nest(db.attach, db.cur); a[ym] = a[ym] || []; return a[ym]; };
// 증빙 저장 위치: kind 'scan_카드…' = B. 자금관련 의 스캔 폴더, 그 밖 = 그 달 서류철/증빙
const attachDir = (kind, ym) => { const sk = String(kind).startsWith('scan_') ? kind.slice(5) : ''; return DIR.scan[sk] || `${monthPath(ym)}/증빙`; };
async function addAttach(ym, kind, files) {
  try { for (const f of files) { const rel = await storeFile(parts(attachDir(kind, ym)), safeName(f.name.replace(/\.[^.]+$/, '')), f); attachOf(ym).push({ rel, kind, name: rel.split('/').pop() }); } }
  catch (e) { toast('증빙을 저장하지 못했습니다: ' + e.message); }
  save(); render(); toast(`증빙 ${files.length}개를 저장했습니다.`);
}
/* 영수증 모아 인쇄 — A4 가로, 한 장에 영수증 3칸.
 * 긴 영수증은 자르지 않고 가로로 돌려 장 너비 전체에 (경영지원팀 요청 기준) — 한 장에 여러 줄로 쌓음 */
const RC_LONG = 3.5;            // 세로 ÷ 가로가 이보다 크면 "아주 긴" 영수증 → 가로로 (보통 카드 영수증은 2~3배라 한 칸에 그대로)
const RC_BAND_W = 264, RC_BAND_H = 140, RC_BAND_MAX = 155;   // 가로로 돌린 영수증: 그림 너비·최대 높이, 한 장에 쌓을 수 있는 높이 (mm)
function rotCanvas(c) {   // 왼쪽으로 90° 회전 (영수증 위쪽이 왼쪽으로)
  const o = newCanvas(c.height, c.width), g = o.getContext('2d');
  g.translate(0, o.height); g.rotate(-Math.PI / 2); g.drawImage(c, 0, 0); return o;
}
function printReceipts(src) {
  const list = db.tx.filter(t => t.siteId === db.cur && t.src === src && txYm(t) === state.ym && t.kind !== 'in');   // 사진 없는 내역도 = 영수증 붙임 칸 (카드·전도금 같음)
  if (!list.length) { toast(src === 'card' ? '이 달에 인쇄할 법인카드 사용내역이 없습니다.' : '이 달에 인쇄할 전도금 사용내역이 없습니다.'); return; }
  let o = {}; try { o = JSON.parse(localStorage.getItem('gyeongri_rcprint') || '{}'); } catch (e) { }
  const isCard = src === 'card';
  const ck = (id, on, html) => `<label class="small" style="display:block;margin:6px 0"><input type="checkbox" id="${id}" ${on !== false ? 'checked' : ''}> ${html}</label>`;
  modal(isCard ? '증빙철 인쇄 (법인카드)' : '증빙철 인쇄 (전도금)', `
      ${ck('rpEnh', o.enh, '<b>인쇄용 보정</b> — 사진을 흑백 문서처럼 밝고 선명하게 (어둡거나 그림자 진 사진도 잘 보이게)')}
      ${ck('rpDocs', o.docs, isCard ? '카드마다 맨 앞에 <b>사용집계표 · 사용내역서</b> 같이 인쇄' : '맨 앞에 <b>전도금 집행내역</b> 같이 인쇄')}
      <p class="muted small">현재 작업월의 ${isCard ? '법인카드' : '전도금'} 사용내역을 인쇄합니다. 사진이 없는 내역은 영수증 붙임 공간과 사용내역만 인쇄합니다. 영수증은 한 칸에 하나씩 넣고, <b>긴 영수증은 가로로 돌려 장 너비 전체에</b> 인쇄합니다 (자르지 않음).</p>`, [
    { label: '취소' },
    { label: '인쇄', cls: 'primary', onClick: root => { const opt = { enh: $('#rpEnh', root).checked, docs: $('#rpDocs', root).checked }; try { localStorage.setItem('gyeongri_rcprint', JSON.stringify(opt)); } catch (e) { } setTimeout(() => buildReceiptBook(src, list, opt), 0); } }], 'm');
}
async function buildReceiptBook(src, list, opt) {
  const ym = state.ym, s = site(), isCard = src === 'card';
  const prog = modal('증빙철 만드는 중', '<p id="rpProg">영수증 준비 중…</p>', [], 's');
  const say = txt => { const p = $('#rpProg', prog); if (p) p.textContent = txt; };
  const catIdx = c => { const i = SUBS.indexOf(c); return i < 0 ? 99 : i; };
  list.sort((a, b) => (isCard ? String(a.card).localeCompare(String(b.card)) : 0) || catIdx(a.cat) - catIdx(b.cat) || (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
  const pieces = []; let skipped = 0, bad = 0, done = 0;
  const total = list.length;
  for (const t of list) {
    const rels = t.receipts || [];
    say(`사용내역 준비 중… ${++done} / ${total}`);
    const transactionReceipts = [];
    if (!rels.length) pieces.push({ t, k: 0, n: 1, empty: true });
    for (let ri = 0; ri < rels.length; ri++) {
      const rel = rels[ri];
      say(`사용내역 ${done} / ${total} · 영수증 ${ri + 1} / ${rels.length}`);
      let canv = [];
      try { const f = await (await fileAt(`${s.folder}/${rel}`, false)).getFile(); canv = await fileCanvases(f); } catch (e) { canv = []; }
      if (!canv.length) { skipped++; continue; }
      for (let c of canv) {
        if (t.rcCheck === undefined || t.rcCheck[rel] === undefined) { const w = rcQuality(c); if (w.length) { t.rcCheck = t.rcCheck || {}; t.rcCheck[rel] = w.join(', '); } }
        if ((t.rcCheck || {})[rel]) bad++;
        if (opt.enh) c = rcEnhance(c);
        const wide = c.height / c.width > RC_LONG;
        if (wide) c = rotCanvas(c);
        transactionReceipts.push({ t, url: await canvasURL(c), wide, ar: c.height / c.width });
      }
    }
    if (rels.length && !transactionReceipts.length) pieces.push({ t, k: 0, n: 1, empty: true });
    else transactionReceipts.forEach((x, k) => pieces.push({ ...x, k, n: transactionReceipts.length }));
  }
  save();
  if (!pieces.length) { closeModal(); toast('인쇄할 수 있는 영수증이 없습니다.'); return; }
  const st = isCard ? cardStart(db.cur) : 1, m = monthNo(ym), nm = monthNo(ymAdd(ym, 1));
  const period = st > 1 ? `${m}/${st} ~ ${nm}/${st - 1}` : `${m}/1 ~ ${m}/${daysIn(ym)}`;
  // 배치: 카드·세목이 바뀌면 새 장. 보통 영수증은 한 장에 3칸, 긴 영수증(가로로 돌린 것)은 장 너비 전체로 위에서부터 쌓음
  const bandH = x => Math.min(RC_BAND_H, RC_BAND_W * x.ar);
  const pages = [];
  for (let i = 0; i < pieces.length; i++) {
    const x = pieces[i], key = (isCard ? x.t.card : '') + '|' + (x.t.cat || '');
    let pg = pages[pages.length - 1];
    const newPage = type => { pg = { key, type, card: x.t.card, cat: x.t.cat || '', items: [], h: 0 }; pages.push(pg); };
    if (x.wide) {
      const h = bandH(x) + (x.k === x.n - 1 ? 12 : 0) + 3;   // 그림 + 사용내역 + 간격
      if (!pg || pg.key !== key || pg.type !== 'band' || (pg.items.length && pg.h + h > RC_BAND_MAX)) newPage('band');
      pg.items.push(x); pg.h += h;
      continue;
    }
    const need = x.k === 0 ? Math.min(3, x.n) : 1;
    if (!pg || pg.key !== key || pg.type !== 'slot' || pg.items.length + need > 3) newPage('slot');
    pg.items.push(x);
  }
  const title = isCard ? '법인카드 정산 증빙철' : '전도금 정산 증빙철';
  const transactionDetails = x => {
    if (x.k !== x.n - 1) return '';
    return `<div class="rcmemo">${esc(x.t.memo || '')}</div>`;
  };   // 사용내역만 사진 아래 또는 사진이 없으면 붙임 칸 아래에 인쇄
  const pageHtml = pg => `<div class="doc rcpage">
      <table class="rchead"><tr>
        <td class="rcsite">${esc(s.name)}현장</td>
        <td class="rctitle"><div class="t1">${title}${isCard ? ` [ ${esc(pg.card || '')} ]` : ''}</div><div class="t2">[ ${period} ]</div></td>
        <td class="rccat"><div>${esc(GROUP_OF[pg.cat] || (pg.cat ? '' : '미분류'))}</div><div class="sub">${esc(pg.cat || '')}</div></td>
      </tr></table>
      ${pg.type === 'band'
      ? `<div class="rcbands">${pg.items.map(x => `<div class="rcband"><img src="${x.url}" style="width:100%;max-height:${bandH(x).toFixed(1)}mm">${transactionDetails(x)}</div>`).join('')}</div>`
      : `<div class="rcslots">${[0, 1, 2].map(i => { const x = pg.items[i]; if (!x) return '<div class="rcslot"></div>';
      return `<div class="rcslot${x.empty ? ' empty' : ''}">${x.empty ? '<div class="rcimg rcimg-empty"></div>' : `<div class="rcimg"><img src="${x.url}"></div>`}${transactionDetails(x)}</div>`; }).join('')}</div>`}
    </div>`;
  let html;
  if (isCard) {   // 카드마다: 집계표 → 사용내역서 → 영수증
    const ids = [...new Set(pages.map(p => p.card))];
    html = ids.map(id => (opt.docs ? docCardSummary(ym, id) + docCardDetail(ym, id) : '') + pages.filter(p => p.card === id).map(pageHtml).join('')).join('');
  } else html = (opt.docs ? docCashList(ym) : '') + pages.map(pageHtml).join('');
  closeModal(); render();
  printDocs([html]);
  toast(`증빙철 ${pages.length}장을 만들었습니다 (영수증 ${pieces.filter(x => !x.empty).length}장${pieces.some(x => x.wide) ? ` · 긴 영수증 ${pieces.filter(x => x.wide).length}장은 가로로` : ''} · 사진 없는 내역 ${pieces.filter(x => x.empty).length}건)${skipped ? ` · 읽을 수 없는 파일 ${skipped}개는 붙임 칸으로 인쇄` : ''}${bad ? ` · ${rcWarnText(bad)}` : ''}`);
}
