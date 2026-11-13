/* 유성 현장 관리 프로그램 — 엑셀 내보내기
 * (원래 app.js 의 화면 부분. 모든 js/*.js 는 같은 전역 공간을 공유하며 html 에 적힌 순서대로 읽힘) */
'use strict';


/* ================= 회사 양식 엑셀 (색·테두리·병합·로고) =================
 * 인쇄 양식(html)을 화면 밖에 그려서 칸마다 위치·색·테두리·글자를 재고 → 같은 모양의 엑셀 시트로.
 * 무료 SheetJS 는 서식을 못 써서, 빈 통합문서만 SheetJS 로 만들고 시트·서식(styles.xml)·그림은 XML 을 직접 씀 (15 xz 도구).
 * 시트 = [이름, html]. 인쇄 양식이 없는 표는 xtHtml() 로 회사 표 모양(회색 머리글·테두리·소계 색) html 을 만들어 같은 길로. */
const XL_EMU = 9525;   // 1px = 9525 EMU (그림 위치)
function xlColor(c) {
  const m = String(c || '').match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
  if (!m || (m[4] !== undefined && +m[4] < 0.05)) return null;
  return 'FF' + [m[1], m[2], m[3]].map(x => (Math.round(+x)).toString(16).padStart(2, '0')).join('').toUpperCase();
}
// "1,234,000" · "-10,000" · "24" → 숫자. 쉼표 없는 네 자리 이상("9168" 카드번호 · "2026" 연도)과 "0889" 처럼 0 으로 시작하는 것은 글자 그대로
function xlNum(t) {
  const s = String(t).trim();
  if (!/^-?(\d{1,3}(,\d{3})+|\d+)(\.\d+)?$/.test(s) || /^-?0\d/.test(s)) return null;
  if (!/,/.test(s) && s.replace(/^-|\..*$/g, '').length >= 4) return null;   // 금액은 늘 쉼표가 있음 → 쉼표 없는 큰 숫자는 번호

  const v = Number(s.replace(/,/g, '')); if (!isFinite(v)) return null;
  const dec = (s.split('.')[1] || '').length;
  return { v, fmt: /,/.test(s) || Math.abs(v) >= 1000 ? (dec ? 4 : 3) : 0 };   // 3 = #,##0 · 4 = #,##0.00 (엑셀 기본 서식 번호)
}
const xlCol = c => { let s = ''; c++; while (c) { const m = (c - 1) % 26; s = String.fromCharCode(65 + m) + s; c = Math.floor((c - 1) / 26); } return s; };
const xlTxt = v => xmlEsc(String(v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ''));

function xlStyleOf(el, cell) {
  const cs = getComputedStyle(el);
  let z = 1; for (let x = el; x && x !== document.body; x = x.parentElement) z *= parseFloat(getComputedStyle(x).zoom) || 1;   // 확대·축소(zoom) 된 양식
  const px = v => (parseFloat(v) || 0) * z;
  const side = s => {
    const w = px(cs[`border${s}Width`]), st = cs[`border${s}Style`];
    if (!w || st === 'none' || st === 'hidden') return null;
    return { s: w >= 2.6 ? 'thick' : w >= 1.4 ? 'medium' : st === 'dashed' ? 'dashed' : st === 'dotted' ? 'dotted' : st === 'double' ? 'double' : 'thin', c: xlColor(cs[`border${s}Color`]) || 'FF000000' };
  };
  let fill = xlColor(cs.backgroundColor);
  if (!fill && cell && el.parentElement) fill = xlColor(getComputedStyle(el.parentElement).backgroundColor);   // 칸 배경이 없으면 줄(tr) 배경
  const al = cs.textAlign;
  return {
    font: { sz: Math.max(5, Math.round(px(cs.fontSize) * 0.75 * 2) / 2), b: (parseInt(cs.fontWeight, 10) || 400) >= 600, i: cs.fontStyle === 'italic', u: /underline/.test(cs.textDecorationLine || ''), c: xlColor(cs.color) || 'FF000000' },
    fill, h: /center/.test(al) ? 'center' : /right|end/.test(al) ? 'right' : 'left',
    v: cs.verticalAlign === 'top' ? 'top' : cs.verticalAlign === 'bottom' ? 'bottom' : 'center',
    bd: cell ? { t: side('Top'), r: side('Right'), b: side('Bottom'), l: side('Left') } : null,
    diag: /linear-gradient\(to (top )?right/.test(cs.backgroundImage || ''),   // 결재란 빈 칸 사선
  };
}
async function xlImgBytes(im) {
  const src = im.getAttribute('src') || '';
  try {
    if (/yusung_logo/.test(src)) { if (!window.YUSUNG_LOGO_B64) await loadScript('lib/yusung_logo_b64.js'); return { bytes: unb64(window.YUSUNG_LOGO_B64), ext: 'jpeg' }; }   // 파일로 연 프로그램은 그림 파일을 캔버스로 못 읽음 → 글자로 바꿔 둔 로고
    const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight; c.getContext('2d').drawImage(im, 0, 0);
    return { bytes: unb64(c.toDataURL('image/png').split(',')[1]), ext: 'png' };
  } catch (e) { return null; }
}
// 화면 밖에 그려서 잼 → { boxes: 칸·글자 상자, pics: 그림 }
async function xlMeasure(html) {
  const host = document.createElement('div'); host.className = 'xl-host';
  host.style.cssText = 'position:fixed;left:-40000px;top:0;width:1047px;background:#fff';
  host.innerHTML = html; document.body.appendChild(host);
  try {
    const doc = host.firstElementChild;
    if (doc && !/\b(ex|cd|cl|pd|xt)\b/.test(doc.className)) host.style.width = '703px';   // 세로 양식 = A4 세로 폭 (186mm)
    await Promise.all([...host.querySelectorAll('img')].map(im => (im.decode ? im.decode().catch(() => { }) : null)));
    const B = host.getBoundingClientRect(), rel = r => ({ x0: r.left - B.left, y0: r.top - B.top, x1: r.right - B.left, y1: r.bottom - B.top });
    const boxes = [], pics = [];
    host.querySelectorAll('td,th').forEach(el => { if (el.querySelector('table')) return; const r = el.getBoundingClientRect(); if (r.width >= 1 && r.height >= 1) boxes.push({ ...rel(r), el, cell: true }); });
    const walk = el => { for (const ch of el.children) {
      if (/^(TABLE|IMG|STYLE|SCRIPT|BR|COLGROUP)$/.test(ch.tagName)) continue;
      const own = [...ch.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
      if (own && !ch.querySelector('table')) { const r = ch.getBoundingClientRect(); if (r.width >= 1) boxes.push({ ...rel(r), el: ch, cell: false }); } else walk(ch);
    } };
    walk(host);
    boxes.forEach(b => {
      b.text = (b.el.innerText || '').replace(/ /g, ' ').replace(/[ \t]+\n/g, '\n').replace(/\n{2,}/g, '\n').trim();
      b.str = b.el.classList.contains('xs');   // class="xs" 칸은 숫자로 바꾸지 않고 글자 그대로 (날짜 10.10 → 10.1 이 되지 않게)
      b.st = xlStyleOf(b.el, b.cell);
      if (b.cell) {   // 표 바깥 테두리(table 에 준 굵은 선)를 가장자리 칸에
        const t = b.el.closest('table'), tr = t.getBoundingClientRect(), tcs = getComputedStyle(t), tw = s => parseFloat(tcs[`border${s}Width`]) || 0;
        const up = (k, s, hit) => { const w = tw(s); if (hit && w && (!b.st.bd[k] || w >= 1.4)) b.st.bd[k] = { s: w >= 2.6 ? 'thick' : w >= 1.4 ? 'medium' : 'thin', c: xlColor(tcs[`border${s}Color`]) || 'FF000000' }; };
        const R = rel(tr);
        up('t', 'Top', Math.abs(b.y0 - R.y0) < 3); up('b', 'Bottom', Math.abs(b.y1 - R.y1) < 3); up('l', 'Left', Math.abs(b.x0 - R.x0) < 3); up('r', 'Right', Math.abs(b.x1 - R.x1) < 3);
      }
    });
    for (const im of host.querySelectorAll('img')) { const r = im.getBoundingClientRect(); if (r.width >= 2 && r.height >= 2) { const b = await xlImgBytes(im); if (b) pics.push({ ...rel(r), ...b }); } }
    // 표가 아닌 상자의 테두리 (자금청구서 바깥 틀 등) → 그 둘레 칸에 테두리
    const frames = [];
    host.querySelectorAll('div').forEach(el => { const st = xlStyleOf(el, true), bd = st.bd; if (!bd.t && !bd.b && !bd.l && !bd.r) return; const r = el.getBoundingClientRect(); if (r.width >= 4 && r.height >= 4) frames.push({ ...rel(r), bd }); });
    return { boxes, pics, frames };
  } finally { host.remove(); }
}
// 서식 목록 (styles.xml)
function xlStyleBook() {
  const F = '<name val="맑은 고딕"/><family val="3"/><charset val="129"/>';
  const fonts = [`<font><sz val="10"/><color rgb="FF000000"/>${F}</font>`], fills = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'];
  const borders = ['<border><left/><right/><top/><bottom/><diagonal/></border>'], xfs = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'];
  const idx = (arr, x) => { let i = arr.indexOf(x); if (i < 0) { arr.push(x); i = arr.length - 1; } return i; };
  const sd = (tag, s) => (s ? `<${tag} style="${s.s}"><color rgb="${s.c}"/></${tag}>` : `<${tag}/>`);
  return {
    id(st, pos) {
      const f = st.font, fontId = idx(fonts, `<font>${f.b ? '<b/>' : ''}${f.i ? '<i/>' : ''}${f.u ? '<u/>' : ''}<sz val="${f.sz}"/><color rgb="${f.c}"/>${F}</font>`);
      const fillId = st.fill ? idx(fills, `<fill><patternFill patternType="solid"><fgColor rgb="${st.fill}"/><bgColor indexed="64"/></patternFill></fill>`) : 0;
      const bd = st.bd || {}, dg = pos.diag;
      const borderId = idx(borders, `<border${dg ? ' diagonalUp="1"' : ''}>${sd('left', pos.l && bd.l)}${sd('right', pos.r && bd.r)}${sd('top', pos.t && bd.t)}${sd('bottom', pos.b && bd.b)}${dg ? '<diagonal style="thin"><color rgb="FF000000"/></diagonal>' : '<diagonal/>'}</border>`);
      const al = `<alignment horizontal="${st.h}" vertical="${st.v}"${pos.wrap ? ' wrapText="1"' : pos.shrink ? ' shrinkToFit="1"' : ''}/>`;
      return idx(xfs, `<xf numFmtId="${pos.fmt || 0}" fontId="${fontId}" fillId="${fillId}" borderId="${borderId}" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">${al}</xf>`);
    },
    xml: () => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="${fonts.length}">${fonts.join('')}</fonts><fills count="${fills.length}">${fills.join('')}</fills><borders count="${borders.length}">${borders.join('')}</borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${xfs.length}">${xfs.join('')}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`,
  };
}
// 잰 상자들 → 칸 격자(가까운 선 3px 안은 한 선으로) → 시트 XML + 그림 위치
function xlSheet(m, styles, landscape, hasPics) {
  const lines = vals => { const s = [...new Set(vals.map(v => Math.round(v)))].sort((a, b) => a - b), out = []; s.forEach(v => { if (!out.length || v - out[out.length - 1] > 3) out.push(v); }); return out; };
  const fr = m.frames || [];
  const xs = lines([...m.boxes.flatMap(b => [b.x0, b.x1]), ...fr.flatMap(f => [f.x0, f.x1])]), ys = lines([...m.boxes.flatMap(b => [b.y0, b.y1]), ...fr.flatMap(f => [f.y0, f.y1])]);
  if (xs.length < 2 || ys.length < 2) return { xml: null };
  const near = (arr, v) => { let k = 0; arr.forEach((a, i) => { if (Math.abs(a - v) < Math.abs(arr[k] - v)) k = i; }); return k; };
  const cells = new Map(), merges = [], key = (r, c) => r * 4096 + c;
  const free = (r0, r1, c0, c1) => { for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (cells.has(key(r, c))) return false; return true; };
  [...m.boxes.filter(b => b.cell), ...m.boxes.filter(b => !b.cell)].forEach(b => {
    let c0 = near(xs, b.x0), c1 = near(xs, b.x1) - 1, r0 = near(ys, b.y0), r1 = near(ys, b.y1) - 1;
    if (c1 < c0) c1 = c0; if (r1 < r0) r1 = r0;
    if (!free(r0, r1, c0, c1)) { if (b.cell || !b.text || !free(r0, r0, c0, c0)) return; r1 = r0; c1 = c0; }
    const num = b.text && !b.str ? xlNum(b.text) : null, wrap = /\n/.test(b.text || '');
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      const top = r === r0 && c === c0;
      cells.set(key(r, c), { st: b.st, pos: { t: r === r0, b: r === r1, l: c === c0, r: c === c1, diag: top && b.st.diag, wrap, shrink: b.cell && !wrap, fmt: top && num ? num.fmt : 0 }, v: top ? (num ? num.v : b.text) : '', n: top && !!num });
    }
    if (r1 > r0 || c1 > c0) merges.push(`${xlCol(c0)}${r0 + 1}:${xlCol(c1)}${r1 + 1}`);
  });
  // 상자 테두리: 둘레 칸의 그 쪽 테두리를 덧씀 (칸이 없으면 빈 칸을 만듦)
  const blank = { font: { sz: 10, b: false, i: false, u: false, c: 'FF000000' }, fill: null, h: 'left', v: 'center', bd: {}, diag: false };
  const edge = (r, c, k, s) => { let o = cells.get(key(r, c)); if (!o) { o = { st: { ...blank, bd: {} }, pos: {}, v: '' }; cells.set(key(r, c), o); } o.st = { ...o.st, bd: { ...(o.st.bd || {}), [k]: s } }; o.pos = { ...o.pos, [k]: true }; };
  fr.forEach(f => {
    const c0 = near(xs, f.x0), c1 = near(xs, f.x1) - 1, r0 = near(ys, f.y0), r1 = near(ys, f.y1) - 1; if (c1 < c0 || r1 < r0) return;
    for (let c = c0; c <= c1; c++) { if (f.bd.t) edge(r0, c, 't', f.bd.t); if (f.bd.b) edge(r1, c, 'b', f.bd.b); }
    for (let r = r0; r <= r1; r++) { if (f.bd.l) edge(r, c0, 'l', f.bd.l); if (f.bd.r) edge(r, c1, 'r', f.bd.r); }
  });
  cells.forEach(o => { o.s = styles.id(o.st, o.pos); });
  const nR = ys.length - 1, nC = xs.length - 1;
  let rows = '';
  for (let r = 0; r < nR; r++) {
    let cx = '';
    for (let c = 0; c < nC; c++) { const o = cells.get(key(r, c)); if (!o) continue; const ref = `${xlCol(c)}${r + 1}`;
      cx += o.v === '' || o.v === undefined ? `<c r="${ref}" s="${o.s}"/>` : o.n ? `<c r="${ref}" s="${o.s}"><v>${o.v}</v></c>` : `<c r="${ref}" s="${o.s}" t="inlineStr"><is><t xml:space="preserve">${xlTxt(o.v)}</t></is></c>`; }
    rows += `<row r="${r + 1}" ht="${Math.max(3, (ys[r + 1] - ys[r]) * 0.75).toFixed(2)}" customHeight="1">${cx}</row>`;
  }
  const cols = Array.from({ length: nC }, (_, c) => { const px = xs[c + 1] - xs[c], w = px >= 12 ? (px - 5) / 7 : px / 12; return `<col min="${c + 1}" max="${c + 1}" width="${Math.max(0.3, w).toFixed(2)}" customWidth="1"/>`; }).join('');
  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><dimension ref="A1:${xlCol(nC - 1)}${nR}"/><sheetViews><sheetView workbookViewId="0" showGridLines="0"/></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols>${cols}</cols><sheetData>${rows}</sheetData>${merges.length ? `<mergeCells count="${merges.length}">${merges.map(x => `<mergeCell ref="${x}"/>`).join('')}</mergeCells>` : ''}<printOptions horizontalCentered="1"/><pageMargins left="0.3" right="0.3" top="0.4" bottom="0.4" header="0.2" footer="0.2"/><pageSetup paperSize="9" orientation="${landscape ? 'landscape' : 'portrait'}" fitToWidth="1" fitToHeight="0"/>${hasPics ? '<drawing r:id="rIdXlDraw"/>' : ''}</worksheet>`;
  // 그림: 왼쪽 위 칸 + 칸 안 위치(EMU)
  const at = (arr, v) => { let k = 0; arr.forEach((a, i) => { if (a <= v + 0.5) k = i; }); return Math.min(k, arr.length - 2); };
  const pics = m.pics.map(p => { const c = at(xs, p.x0), r = at(ys, p.y0); return { ...p, c, r, dx: Math.max(0, Math.round((p.x0 - xs[c]) * XL_EMU)), dy: Math.max(0, Math.round((p.y0 - ys[r]) * XL_EMU)), cx: Math.round((p.x1 - p.x0) * XL_EMU), cy: Math.round((p.y1 - p.y0) * XL_EMU) }; });
  return { xml, pics };
}
// sheets: [[시트이름, html], …] → 회사 양식 엑셀 파일 저장
// hidden: [{ name, aoa }] = 숨긴 시트 (프로그램이 다시 읽을 원본 값 — 14c 예산안 '_예산데이터')
async function saveXl(sheets, filename, hidden) {
  try { await saveXlRun(sheets, filename, hidden); } catch (e) { console.error(e); toast('엑셀을 만들지 못했습니다: ' + e.message); }
}
async function saveXlRun(sheets, filename, hidden = []) {
  const list = sheets.filter(x => x && x[1]);
  if (!list.length) { toast('저장할 내용이 없습니다.'); return; }
  const used = new Set(), nm = n => { let b = String(n).replace(/[\[\]:*?\/\\]/g, ' ').slice(0, 31) || 'Sheet', x = b, i = 2; while (used.has(x)) x = `${b.slice(0, 28)}(${i++})`; used.add(x); return x; };
  const names = list.map(([n]) => nm(n));
  toast('엑셀 만드는 중…');
  const wb = XLSX.utils.book_new(); names.forEach(n => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['']]), n));
  if (hidden.length) { hidden.forEach(h => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(h.aoa), nm(h.name))); wb.Workbook = { Sheets: [...names.map(() => ({ Hidden: 0 })), ...hidden.map(() => ({ Hidden: 1 }))] }; }
  const z = xz.open(new Uint8Array(XLSX.write(wb, { bookType: 'xlsx', type: 'array' })));
  const styles = xlStyleBook(), add = (p, d) => XLSX.CFB.utils.cfb_add(z, p, typeof d === 'string' ? new TextEncoder().encode(d) : d);
  let ct = xz.text(xz.get(z, '[Content_Types].xml')), media = 0;
  for (let i = 0; i < list.length; i++) {
    const [, html] = list[i], land = /class="doc (ex|cd|cl|pd)\b|class="doc xt xt-land/.test(html);
    const m = await xlMeasure(html), sh = xlSheet(m, styles, land, m.pics.length > 0);
    if (!sh.xml) continue;
    const sp = xzSheetPath(z, names[i]);
    xz.put(xz.get(z, sp), sh.xml);
    if (sh.pics.length) {   // 그림 (로고·서명)
      const dn = `drawing${i + 1}.xml`, rels = [];
      const anchors = sh.pics.map((p, k) => { const f = `xlimg${++media}.${p.ext}`; add(`xl/media/${f}`, p.bytes); rels.push(`<Relationship Id="rIdImg${k}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${f}"/>`);
        return `<xdr:oneCellAnchor><xdr:from><xdr:col>${p.c}</xdr:col><xdr:colOff>${p.dx}</xdr:colOff><xdr:row>${p.r}</xdr:row><xdr:rowOff>${p.dy}</xdr:rowOff></xdr:from><xdr:ext cx="${p.cx}" cy="${p.cy}"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${k + 2}" name="그림 ${k + 1}"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="rIdImg${k}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${p.cx}" cy="${p.cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor>`; });
      add(`xl/drawings/${dn}`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${anchors.join('')}</xdr:wsDr>`);
      add(`xl/drawings/_rels/${dn}.rels`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.join('')}</Relationships>`);
      const srp = sp.replace(/([^/]+)$/, '_rels/$1.rels'), drel = `<Relationship Id="rIdXlDraw" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/${dn}"/>`;
      const se = xz.get(z, srp);
      if (se) xz.put(se, xz.text(se).replace('</Relationships>', `${drel}</Relationships>`));
      else add(srp, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${drel}</Relationships>`);
      ct = ct.replace('</Types>', `<Override PartName="/xl/drawings/${dn}" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>`);
    }
  }
  if (!/Extension="png"/i.test(ct)) ct = ct.replace('</Types>', '<Default Extension="png" ContentType="image/png"/></Types>');
  if (!/Extension="jpeg"/i.test(ct)) ct = ct.replace('</Types>', '<Default Extension="jpeg" ContentType="image/jpeg"/></Types>');
  xz.put(xz.get(z, '[Content_Types].xml'), ct);
  xz.put(xz.get(z, 'xl/styles.xml'), styles.xml());
  download(filename, xz.save(z), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}

/* 인쇄 양식이 없는 표 → 회사 표 모양 html (제목 · 회색 머리글 · 테두리 · 소계/합계 색 · 숫자 오른쪽)
 * spec: { title, sub, land, widths:[px], head:[[칸]], rows:[[칸]] } · 칸 = 값 또는 { t, cs, rs, c:'red n c …' } */
function xtHtml({ title, sub, land, widths, head = [], rows = [] }) {
  const cell = (x, th) => {
    const o = x !== null && typeof x === 'object' ? x : { t: x };
    let t = o.t ?? '', cls = o.c || '';
    if (typeof t === 'number') { if (!o.c) cls += ' n'; t = Number.isInteger(t) ? fmt(t) : String(Math.round(t * 100) / 100); }
    else if (!th && !o.c && /^-?[\d,]+(\.\d+)?$/.test(String(t).trim()) && !/^0\d/.test(String(t).trim())) cls += ' n';   // 숫자는 오른쪽 (정렬을 따로 정한 칸은 그대로)
    const tag = th ? 'th' : 'td';
    return `<${tag}${o.cs > 1 ? ` colspan="${o.cs}"` : ''}${o.rs > 1 ? ` rowspan="${o.rs}"` : ''}${cls.trim() ? ` class="${cls.trim()}"` : ''}>${esc(String(t)).replace(/\n/g, '<br>')}</${tag}>`;
  };
  const txt = r => r.map(x => String((x !== null && typeof x === 'object' ? x.t : x) ?? '').trim());
  const rowCls = r => { const f = r.find(Boolean) || ''; return /^(합\s*계|총\s*계|누\s*계)/.test(f) ? ' class="xt-tot"' : /소\s*계/.test(f) ? ' class="xt-sum"' : ''; };   // 첫 글자 칸이 합계·소계면 색
  return `<div class="doc xt${land ? ' xt-land' : ''}">${title ? `<div class="xt-title">${esc(title)}</div>` : ''}${sub ? `<div class="xt-sub">${esc(sub)}</div>` : ''}
    <table class="xt-tbl">${widths ? `<colgroup>${widths.map(w => `<col style="width:${w}px">`).join('')}</colgroup>` : ''}
    ${head.length ? `<thead>${head.map(r => `<tr>${r.map(x => cell(x, true)).join('')}</tr>`).join('')}</thead>` : ''}
    <tbody>${rows.map(r => `<tr${rowCls(txt(r))}>${r.map(x => cell(x, false)).join('')}</tr>`).join('')}</tbody></table></div>`;
}
const fname = (what) => `${pad2(monthNo(state.ym))}월 ${site().name}현장 ${what}.xlsx`;
/* 예전 방식(aoa 표) 저장도 회사 표 모양으로: sheet(aoa, 너비) → saveBook([[이름, sheet]]) (현장 손익·품의서 대장 등)
 * 첫 줄이 한 칸뿐이면 제목, 그 다음 줄을 머리글로 봄 */
function sheet(aoa, widths) { return { aoa, widths }; }
function saveBook(sheets, filename) {
  saveXl(sheets.map(([name, ws]) => {
    const a = (ws.aoa || []).map(r => (r || []).slice());
    let title = '', sub = '';
    if (a.length && a[0].filter(x => String(x ?? '').trim()).length === 1) title = String(a.shift().find(x => String(x ?? '').trim()));
    if (a.length && a[0].filter(x => String(x ?? '').trim()).length === 1 && a[1] && a[1].length > 2) sub = String(a.shift().find(x => String(x ?? '').trim()));
    while (a.length && !a[0].some(x => String(x ?? '').trim())) a.shift();
    const n = Math.max(1, ...a.map(r => r.length)), fill = r => Array.from({ length: n }, (_, i) => r[i] ?? '');
    const head = a.length ? [fill(a.shift())] : [];
    return [name, xtHtml({ title, sub, land: n > 9, widths: (ws.widths || []).map(w => Math.round(w * 7 + 5)), head, rows: a.filter(r => r.some(x => String(x ?? '').trim())).map(fill) })];
  }), filename);
}

/* 법인카드: 카드마다 "0000집계"(월별 사용집계표) + "법인카드_0000"(사용내역 명세) — 회사 정산 파일과 같은 시트 이름 */
// 회사 정산 엑셀 "법인카드_카드번호" 오른쪽 칸: 합계 · 공급가액 · 부가세 · 청구 가능 여부(구분 · 청구금액 · 미청구금액) — 카드 월 한도 머리글
function cardClaimSheet(ym, id) {
  const list = txOf(ym, 'card').filter(t => t.card === id && t.kind !== 'in').sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
  const rows = list.map(t => [{ t: t.date.slice(5).replace('-', '.'), c: 'c xs' }, t.merchant || '', { t: t.cat || '미분류', c: 'c' }, t.memo || '', toNum(t.amount), toNum(t.amount) - cardVat(t), cardVat(t), { t: t.claim ? (cardUnclaim(t) ? '일부' : '가능') : '불가', c: 'c' }, cardClaim(t) || '', cardUnclaim(t) || '']);
  const tot = f => sum(list, f);
  return xtHtml({ title: `${site().name}현장 법인카드(${id}) 청구 내역 (${ymLabel(ym)})`, sub: `사용기간 ${cardPeriod(ym)} · 월 한도 ${fmt(cardLimit(id))}원 · 사용 ${fmt(tot(t => t.amount))}원`, land: true,
    widths: [50, 150, 80, 220, 80, 80, 70, 50, 80, 80],
    head: [[{ t: '일자', rs: 2 }, { t: '가맹점', rs: 2 }, { t: '계정과목', rs: 2 }, { t: '사용내역', rs: 2 }, { t: '합계', rs: 2 }, { t: '공급가액', rs: 2 }, { t: '부가세', rs: 2 }, { t: '청구 가능 여부', cs: 3 }], ['구분', '청구금액', '미청구금액']],
    rows: [...rows, ['합계', '', '', '', tot(t => t.amount), tot(t => toNum(t.amount) - cardVat(t)), tot(cardVat), '', tot(cardClaim), tot(cardUnclaim)]] });
}
async function exportCard() {
  const ym = state.ym, { ids } = cardIdsOf(ym);
  if (!ids.length) { toast('이 달의 법인카드 내역이 없습니다.'); return; }
  const sheets = [];
  ids.forEach(id => { sheets.push([`${id}집계`, docCardSummary(ym, id)], [`법인카드_${id}`, docCardDetail(ym, id)]); if (claimOn()) sheets.push([`청구_${id}`, cardClaimSheet(ym, id)]); });
  await saveXl(sheets, fname(cardCalView() ? '법인카드 사용내역(1일~말일)' : '법인카드 정산'));
}
/* 전도금: 청구서 · 지출결의서 · 집행내역 (회사 정산 파일 시트 이름) */
async function exportCash() {
  const ym = state.ym, { no, date } = docInfo('cash');
  await saveXl([['전도금 청구서', docCashClaim(ym, no, date)], ['전도금 지출결의서', cashExpDoc(ym, date)], ['전도금지출내역', docCashList(ym)]], fname('전도금 정산'));
}
/* 식대·출근부: 구분별 출근부(요일 줄·주말 빨간 글씨) · 식대내역 · 결제내역 · 캐터링 · 인건비 반영 요약 */
async function exportMeal(only) {   // only = 'cater' → 캐터링 주문대장 시트만
  const ym = state.ym, n = daysIn(ym), att = attOf(ym), md = mealData(ym), staff = workStaff();
  const days = Array.from({ length: n }, (_, i) => i + 1), wk = d => weekday(ym, d), hol = d => (wk(d) === 0 || wk(d) === 6 ? 'c red' : 'c');
  const grp = (list, k) => list.filter(s => staffGroup(s) === k);
  const S = site().name;
  const attSheet = (list, label) => xtHtml({ title: `${S}현장 출근부 (${monthNo(ym)}월) — ${label}`, land: true, widths: [62, 58, 40, ...days.map(() => 24), 34],
    head: [[{ t: '구분', rs: 2 }, { t: '성명', rs: 2 }, { t: '직책', rs: 2 }, ...days.map(d => ({ t: d, c: hol(d) })), { t: '계', rs: 2 }], days.map(d => ({ t: WEEK[wk(d)], c: hol(d) }))],
    rows: [...list.map(s => [s.team || '', { t: s.name, c: 'c' }, s.title || '', ...days.map(d => ({ t: String((att[s.id] || {})[d] ?? ''), c: hol(d) })), attCount(att[s.id])]),
      ['합계', '', '', ...days.map(d => ({ t: sum(list, s => (attValue((att[s.id] || {})[d]) > 0 ? 1 : 0)) || '', c: 'c' })), sum(list, s => attCount(att[s.id]))]] });
  const mealSheet = (list, label) => xtHtml({ title: `${S}현장 식대내역 (${monthNo(ym)}월) — ${label}`, land: true, widths: [62, 58, ...days.map(() => 44), 66, 36],
    head: [['구분', '성명', ...days.map(d => ({ t: d, c: hol(d) })), '계', '횟수']],
    rows: [...list.map(s => [s.team || '', { t: s.name, c: 'c' }, ...days.map(d => Math.round(md.per[s.name][d] || 0) || ''), Math.round(sum(Object.values(md.per[s.name]))), sum(Object.values(md.cnt[s.name]))]),
      ['소계', '', ...days.map(d => Math.round(sum(list, s => md.per[s.name][d] || 0)) || ''), Math.round(sum(list, s => sum(Object.values(md.per[s.name])))), sum(list, s => sum(Object.values(md.cnt[s.name])))]] });
  const a5 = [];
  MEAL_GROUPS.forEach(([k, label]) => {
    const list = grp(md.staff, k); if (!list.length) return;
    list.forEach(s => a5.push([label, s.team || '', { t: s.name, c: 'c' }, s.title || '', attCount(att[s.id]), sum(Object.values(md.cnt[s.name])), Math.round(sum(Object.values(md.per[s.name])))]));
    a5.push([`${label} 소계`, '', '', '', sum(list, s => attCount(att[s.id])), sum(list, s => sum(Object.values(md.cnt[s.name]))), Math.round(sum(list, s => sum(Object.values(md.per[s.name]))))]);
  });
  const tm = att.__time || {}, a6 = [];
  days.forEach(d => staff.forEach(s => { const v = (att[s.id] || {})[d]; if (v === ATT_PHOTO || v === ATT_MISS) a6.push([{ t: `${ym}-${pad2(d)}`, c: 'c' }, s.team || '', { t: s.name, c: 'c' }, { t: v, c: 'c' }, (tm[s.id] || {})[d] || '']); }));
  const c = caterOf(ym);
  const sheets = [['인건비 반영 요약', xtHtml({ title: `${S}현장 ${monthNo(ym)}월 출근·식대 요약`, widths: [90, 80, 64, 56, 64, 64, 100], head: [['소속', '구분', '성명', '직책', '출근일수', '식사횟수', '식대(1인분 합계)']], rows: a5 })]];
  if (a6.length) sheets.push(['사진대체·체크누락', xtHtml({ title: `${S}현장 ${monthNo(ym)}월 출퇴근 사진대체 · 체크누락`, widths: [84, 80, 64, 70, 200], head: [['일자', '구분', '성명', '내용', '근태기록']], rows: a6 })]);
  MEAL_GROUPS.forEach(([k, label]) => { const list = grp(staff, k); if (list.length) sheets.push([`출근부(${label})`, attSheet(list, label)]); });
  MEAL_GROUPS.forEach(([k, label]) => { const list = grp(md.staff, k); if (list.length) sheets.push([`식대내역(${label})`, mealSheet(list, label)]); });
  sheets.push(['식대 결제내역', xtHtml({ title: `${S}현장 ${monthNo(ym)}월 식대 결제내역`, land: true, widths: [80, 80, 160, 76, 300, 40, 64, 160], head: [['일자', '결제', '가맹점', '금액', '사용내역', '인원', '1인분', '인식된 직원']],
    rows: [...md.parsed.map(({ t, p, share }) => [{ t: t.date, c: 'c' }, { t: t.src === 'card' ? '카드 ' + t.card : '전도금', c: 'c' }, t.merchant, t.amount, t.memo, p.count, Math.round(share), p.matched.join(', ')]), ['합계', '', '', sum(md.parsed, x => x.t.amount), '', '', '', '']] })]);
  // 카드별 식대 시트 (본사가 보던 모양 · 시트 이름 = 카드 뒤 4자리): 법인카드(카드번호) · 정산기간 · 월 일 | 현장명 | 현장카드 | 업체명 | 분류 | 사용자 | 금액 → 합계
  const yy = ym.slice(2, 4), mm = ym.slice(5, 7), period = `정산기간 : '${yy}.${mm}.01.~'${yy}.${mm}.${pad2(n)}.`;
  const byCard = new Map(); md.parsed.filter(({ t }) => t.src === 'card').forEach(x => { const k = x.t.card || '카드'; if (!byCard.has(k)) byCard.set(k, []); byCard.get(k).push(x.t); });
  [...byCard.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0]))).forEach(([card, list]) => {
    list.sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
    const split = m => { const s2 = String(m || ''), i = s2.indexOf('/'); return i < 0 ? ['', s2] : [s2.slice(0, i).trim(), s2.slice(i + 1).trim()]; };   // "중식/홍길동,김철수" → 분류 · 사용자
    sheets.push([String(card), xtHtml({ title: `법인카드(${card})`, sub: period, widths: [70, 70, 56, 150, 50, 220, 80], head: [['월 일', '현장명', '현장카드', '업체명', '분류', '사용자', '금액']],
      rows: [...list.map(t => { const [k, u] = split(t.memo); return [{ t: `${t.date.slice(5, 7)}월 ${t.date.slice(8, 10)}일`, c: 'c' }, { t: S, c: 'c' }, { t: card, c: 'c' }, t.merchant || '', { t: k, c: 'c' }, u, toNum(t.amount)]; }), ['합계', '', '', '', '', '', sum(list, t => toNum(t.amount))]] })]);
  });
  // 캐터링취식 (회사 주문대장 모양): 일자 | 출근예정인원 소속별·계 | 실제출근인원 소속별·계 | 중식 수량·단가·금액 | 간식 수량·단가·금액 | 누계 | 비고 → 계·부가세·합계
  const CP = caterPeople(ym), cc = CP.cols, segs = caterSegs(c), segAmt = segs.map(() => 0);   // 날마다 그날 업체 단가 (달 중간 업체 변경)
  let acc2 = 0, aL = 0, aS = 0;
  const cRows = days.map(d => { const r = c.days[d] || {}, p = CP.days[d], l = toNum(r.l), s2 = toNum(r.s), g = caterSegAt(segs, d), lp = g.lunchPrice, sp = g.snackPrice;
    acc2 += l * lp + s2 * sp; aL += l * lp; aS += s2 * sp; segAmt[segs.indexOf(g)] += l * lp + s2 * sp;
    const note = [segs.length > 1 && g !== segs[0] && d === g.from ? `${g.name || '업체 변경'}부터` : '', r.note || ''].filter(Boolean).join(' · ');
    return [{ t: `${monthNo(ym)}/${d}(${WEEK[wk(d)]})`, c: hol(d) }, ...cc.map(x => p.plan[x.l] || ''), p.planSum || '', ...cc.map(x => p.act[x.l] || ''), p.actSum || '', l || '', l ? lp : '', l * lp || '', s2 || '', s2 ? sp : '', s2 * sp || '', acc2 || '', note]; });
  const cs = f => cc.map(x => sum(days, d => CP.days[d][f][x.l] || 0) || '');
  const anyVat = segs.some(g => g.vatEx), vat2 = segs.reduce((a, g, k) => a + (g.vatEx ? Math.round(segAmt[k] * 0.1) : 0), 0);
  const tL = sum(days, d => toNum((c.days[d] || {}).l)), tS = sum(days, d => toNum((c.days[d] || {}).s)), blank = Array(cc.length * 2 + 2).fill('');
  const cTot = [['계', ...cs('plan'), sum(days, d => CP.days[d].planSum) || '', ...cs('act'), sum(days, d => CP.days[d].actSum) || '', tL, '', aL, tS, '', aS, acc2, ''],
    ...(anyVat ? [['부가세', ...blank, '', '', '', '', '', '', vat2, ''], ['합계', ...blank, '', '', '', '', '', '', acc2 + vat2, '']] : [])];
  const segTxt = segs.map(g => `${segs.length > 1 ? `${g.from}일~ ` : ''}${g.name ? `${g.name} ` : ''}중식 ${fmt(g.lunchPrice)}원 · 간식 ${fmt(g.snackPrice)}원 (VAT ${g.vatEx ? '별도' : '포함'})`).join(' / ');
  const caterSheet = ['캐터링', xtHtml({ title: `${S}현장 캐터링 주문대장 (${ymLabel(ym)})`, sub: segTxt, land: true,
    widths: [62, ...cc.map(() => 34), 36, ...cc.map(() => 34), 36, 40, 50, 70, 40, 50, 70, 80, 120],
    head: [[{ t: '일자', rs: 2 }, { t: '출근예정인원', cs: cc.length + 1 }, { t: '실제출근인원', cs: cc.length + 1 }, { t: '중식', cs: 3 }, { t: '간식', cs: 3 }, { t: '누계', rs: 2 }, { t: '비고', rs: 2 }],
      [...cc.map(x => x.l), '계', ...cc.map(x => x.l), '계', '수량', '단가', '금액', '수량', '단가', '금액']],
    rows: [...cRows, ...cTot] })];
  if (only === 'cater') { await saveXl([caterSheet], fname('캐터링 주문대장')); return; }   // 캐터링 탭 [엑셀로 저장]
  sheets.push(caterSheet);
  await saveXl(sheets, fname('식대내역'));
}
/* 월결제: 자금청구서 · 지출결의서 (인쇄 양식) + 결제내역서(현장 시작월부터) · 증빙 체크 */
async function exportMonthly() {
  const ym = state.ym, s = site(), { no, date } = docInfo('monthly');
  let start = s.startYm && s.startYm <= ym ? s.startYm : ym;
  const months = []; for (let x = start; x <= ym; x = ymAdd(x, 1)) months.push(x);
  if (months.length > 24) months.splice(0, months.length - 24);
  const vs = vendorsFor(ym);
  const showSh = months.some(x => Math.round(monthlyTotals(db.cur, x).sh || 0));   // 기간 내 시행사 청구가 없으면 시행사 칸 빼기
  const sub = showSh ? ['유성', '시행사', '합계'] : ['유성'];   // 시행사 없으면 유성 = 합계라 한 칸만
  const head = showSh ? [[{ t: '번호', rs: 2 }, { t: '과목', rs: 2 }, { t: '업체명', rs: 2 }, { t: '거래내역', rs: 2 }, ...months.map(x => ({ t: `${monthNo(x)}월 집행`, cs: sub.length })), { t: '사용기간/비고', rs: 2 }, { t: '참조문서', rs: 2 }], months.flatMap(() => sub)]
    : [['번호', '과목', '업체명', '거래내역', ...months.map(x => `${monthNo(x)}월 집행`), '사용기간/비고', '참조문서']];   // 시행사 없으면 한 줄 머리 (달 이름만)
  const rows = vs.map((v, i) => {
    const row = [{ t: i + 1, c: 'c' }, { t: v.subject || '', c: 'c' }, v.name, v.desc || ''];
    months.forEach(x => { const r = ((db.monthly[db.cur] || {})[x] || { rows: {} }).rows[v.id] || {}; row.push(toNum(r.ys) || '-', ...(showSh ? [toNum(r.sh) || '-', toNum(r.ys) + toNum(r.sh) || '-'] : [])); });
    row.push(mPeriod(db.cur, ym, v.id), v.ref || '');
    return row;
  });
  const tot = [{ t: '합계', cs: 4, c: 'c' }]; months.forEach(x => { const t = monthlyTotals(db.cur, x); tot.push(t.ys, ...(showSh ? [t.sh, t.total] : [])); }); tot.push('', ''); rows.push(tot);
  const mo = monthOf(db.cur, ym), ck = vs.filter(v => mTot(mo.rows[v.id])).map(v => { const r = mo.rows[v.id] || {}; return [v.name, v.desc || '', ...MCK.map(([k]) => ({ t: ({ ok: '받음', miss: '누락', na: '-' })[mckVal(v, r, k)], c: mckVal(v, r, k) === 'miss' ? 'c red' : 'c' })), r.endDate || '', mNote(r)]; });
  await saveXl([['자금청구서', docFundClaim(ym, no, date)], ['지출결의서', monthlyExpDoc(ym, date)],
    ['결제내역서', xtHtml({ title: `${s.name}현장 월결제 결제내역서`, land: months.length > 2, widths: [36, 76, 120, 170, ...months.flatMap(() => showSh ? [80, 80, 84] : [90]), 150, 150], head, rows })],
    ['증빙 체크', xtHtml({ title: `${s.name}현장 ${monthNo(ym)}월 월결제 증빙 체크`, widths: [120, 170, ...MCK.map(() => 70), 90, 280], head: [['업체명', '거래내역', ...MCK.map(x => x[1]), '반납·해지일', '비고 (대수·인원 · 변동 사유)']], rows: ck })]], fname('월결제'));
}
