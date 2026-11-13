/* 유성 현장 관리 프로그램 — 품의서 엑셀 연동·편집기·인쇄
 * (원래 app.js 의 화면 부분. 모든 js/*.js 는 같은 전역 공간을 공유하며 html 에 적힌 순서대로 읽힘) */
'use strict';


/* ---------- 품의서 엑셀 연동 ----------
 * 회사 엑셀 양식(lib/기안품의서_양식.xlsx, 또는 데이터폴더/양식/기안품의서.xlsx)을 복사해 머리 칸만 채워 현장폴더/A. 기안품의/C. 작성완료/에 저장
 * → 엑셀(드롭박스·원드라이브 폴더면 Excel 온라인도)로 열어 작성·인쇄 → [엑셀·스캔본 다시 읽기]로 대장 갱신
 * 엑셀 파일은 셀 값만 바꾸고 서식·병합·그림·다른 시트는 그대로 둠 */
const xz = {
  open: bytes => XLSX.CFB.read(bytes, { type: 'array' }),
  get: (z, path) => { const i = z.FullPaths.findIndex(p => p.replace(/^Root Entry\//, '').replace(/^\//, '') === path); return i < 0 ? null : z.FileIndex[i]; },
  text: e => new TextDecoder().decode(e.content),
  put: (e, t) => { e.content = new TextEncoder().encode(t); e.size = e.content.length; },
  save: z => new Uint8Array(XLSX.CFB.write(z, { fileType: 'zip', type: 'array', compression: true })),
};
function xzSheetPath(z, prefer = '기안품의서') {
  const wb = xz.text(xz.get(z, 'xl/workbook.xml')), rels = xz.text(xz.get(z, 'xl/_rels/workbook.xml.rels'));
  const sheets = [...wb.matchAll(/<sheet [^>]*name="([^"]*)"[^>]*r:id="([^"]+)"[^>]*\/>/g)].map(m => ({ name: m[1], rid: m[2] }));
  const sh = sheets.find(x => x.name.replace(/\s/g, '') === prefer.replace(/\s/g, '')) || sheets[0];
  const tgt = (rels.match(new RegExp(`<Relationship [^>]*Id="${sh.rid}"[^>]*Target="([^"]+)"`)) || rels.match(new RegExp(`<Relationship [^>]*Target="([^"]+)"[^>]*Id="${sh.rid}"`)) || [])[1];
  return 'xl/' + String(tgt || 'worksheets/sheet1.xml').replace(/^\/?xl\//, '').replace(/^\//, '');
}
const xmlEsc = v => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const colNum = ref => ref.match(/^[A-Z]+/)[0].split('').reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0);
// 셀 값 넣기 (기존 서식 s= 유지, 없으면 행에 순서대로 끼워 넣기)
function xzSetCells(xml, map) {
  for (const [ref, val] of Object.entries(map)) {
    if (val === undefined || val === null) continue;
    const row = +ref.match(/\d+$/)[0];
    const isNum = typeof val === 'number';
    const cellRe = new RegExp(`<c r="${ref}"([^>]*?)(?:/>|>[\\s\\S]*?</c>)`);
    const m = xml.match(cellRe);
    const sAttr = m ? ((m[1].match(/\ss="\d+"/) || [''])[0]) : '';
    const cell = val === '' ? `<c r="${ref}"${sAttr}/>` : isNum ? `<c r="${ref}"${sAttr}><v>${val}</v></c>` : `<c r="${ref}"${sAttr} t="inlineStr"><is><t xml:space="preserve">${xmlEsc(val)}</t></is></c>`;
    if (m) { xml = xml.replace(cellRe, cell); continue; }
    const rowRe = new RegExp(`<row r="${row}"([^>]*?)(/>|>([\\s\\S]*?)</row>)`);
    const rm = xml.match(rowRe);
    if (rm) {
      const inner = rm[3] || '';
      const cells = [...inner.matchAll(/<c r="([A-Z]+)\d+"[\s\S]*?(?:\/>|<\/c>)/g)];
      const after = cells.find(c => colNum(c[1]) > colNum(ref));
      const newInner = after ? inner.slice(0, after.index) + cell + inner.slice(after.index) : inner + cell;
      xml = xml.replace(rowRe, `<row r="${row}"${rm[1]}>${newInner}</row>`);
    } else {
      const rows = [...xml.matchAll(/<row r="(\d+)"/g)];
      const next = rows.find(r => +r[1] > row);
      const rowXml = `<row r="${row}">${cell}</row>`;
      xml = next ? xml.slice(0, next.index) + rowXml + xml.slice(next.index) : xml.replace('</sheetData>', rowXml + '</sheetData>');
    }
  }
  return xml;
}
async function pmTemplateBytes() {
  try { const f = await (await fileAt('양식/기안품의서.xlsx', false)).getFile(); return new Uint8Array(await f.arrayBuffer()); } catch (e) { }   // 데이터폴더/양식/기안품의서.xlsx 가 있으면 그것
  if (!window.PUMUI_TEMPLATE_B64) throw new Error('기안품의서 양식 파일이 없습니다');
  return Uint8Array.from(atob(window.PUMUI_TEMPLATE_B64), c => c.charCodeAt(0));
}
const pmPayDateText = it => it.payDate || '자금집행일';
// 원본 양식 첨부서류 칸: 이름 → 확인(O) 칸
const PM_ATT_CELL = [[/세금계산서|계산서|현금영수증/, 'G39'], [/견적/, 'M39'], [/사업자등록증/, 'T39'], [/거래명세서/, 'G40'], [/계약서/, 'M40'], [/통장/, 'T40'], [/세부내역서/, 'G41'], [/시안|시행사진/, 'M41']];
function pmHeaderCells(it, mode) {
  const s = site(), ap = (s.approvers || []).slice(0, 3);
  const m = {
    C2: it.docNo, J2: it.firstNo || '', C4: s.fullName || s.name, J4: `${s.manager || ''}   (서명)`, C6: it.date ? String(it.date) : '', J6: it.period || '',
    C8: it.title || '', C9: it.vendor || '', C10: it.payMethod || '계좌이체', H10: pmPayDateText(it), M10: it.claim || '가능', S10: it.budget || '예산 심의 전',
  };
  ['P', 'R', 'T'].forEach((c, i) => { if (ap[i]) { m[`${c}2`] = ap[i].title || ''; m[`${c}3`] = ap[i].name || ''; } });
  if (mode !== 'new') return m;
  // 원본 양식: 13행 "1. 내용" 아래(14~30행) · 31행 "2. 기타사항" 아래(32~35행) · 38~41행 첨부서류
  const B = pmBlocks(it), texts = B.filter(b => b.type === 'text');
  const exLines = [...((pmTpl(it.tpl) || {}).compare ? ['※ 세부내역 표에 비교견적 3곳(업체별 단가·금액)과 확정 업체를 옆으로 함께 작성'] : []), ...pmExtraLines(it)];   // 비교견적 · 후품의 사유 · 보고 경위 → 기타사항 줄 끝에
  if (it.tpl && texts.length) {
    pmPlain(texts[0].text).split('\n').slice(0, 17).forEach((l, i) => { m[`B${14 + i}`] = l; });
    const etc = [...(texts[1] ? pmPlain(texts[1].text).split('\n').filter(l => l.trim()) : []), ...exLines];
    etc.slice(0, 4).forEach((l, i) => { m[`B${32 + i}`] = l; }); if (texts[1] && texts[1].title && texts[1].title !== '기타사항') m.B31 = texts[1].title;
    const att = (B.find(b => b.type === 'attach') || { items: [] }).items.filter(a => a.name);
    let extra = 0;
    att.forEach(a => { const hit = PM_ATT_CELL.find(([re]) => re.test(a.name)); const mk = a.ok ? 'O' : a.st || ''; if (hit) { if (mk) m[hit[1]] = mk; } else if (!extra++) { m.N41 = a.name; if (mk) m.T41 = mk; } });
  } else { Object.assign(m, { B14: `${s.fullName || s.name} 현장 ${String(it.title || '○○').replace(/의\s*건.*$/, '').replace(/에\s*관한.*$/, '')}에 관해 아래와 같이 품의합니다.`, B15: '가. ', B16: '나. ', B17: '다. ' }); exLines.forEach((l, i) => { m[`B${32 + i}`] = l; }); }
  return m;
}
// 같은 파일의 자금청구서·지출결의서 시트 머리 칸 (원본 양식 위치)
function pmOtherSheetCells(it, sheet, full) {
  const s = site(), ap = (s.approvers || []).slice(0, 3);
  if (sheet === '자금청구서') {
    const m = { C2: it.docNo, C6: it.date ? String(it.date) : undefined, C8: it.title || '' };
    if (full) Object.assign(m, { C4: s.fullName || s.name, C7: it.period || '', J7: `${s.manager || ''}   (서명)` });
    ['O', 'Q', 'S'].forEach((c, i) => { if (ap[i] && full) { m[`${c}2`] = ap[i].title || ''; m[`${c}3`] = ap[i].name || ''; } });
    return m;
  }
  if (sheet === '지출결의서') {
    const [y, mo, d] = String(it.date || todayStr()).split('-').map(Number);
    const m = { D4: y, G4: mo, I4: d };
    if (full) { m.A3 = `${s.name}현장 지출결의서`; m.N14 = `${s.manager || ''}   (서명)`; m.A17 = it.title || ''; ['K', 'N', 'Q'].forEach((c, i) => { if (ap[i]) { m[`${c}4`] = ap[i].title || ''; m[`${c}5`] = ap[i].name || ''; } }); }
    return m;
  }
  if (sheet === '결재란' && full) {
    const m = { L7: `${s.manager || ''}   (서명)` };
    ['J', 'L', 'N'].forEach((c, i) => { if (ap[i]) { m[`${c}1`] = ap[i].title || ''; m[`${c}2`] = ap[i].name || ''; } });
    return m;
  }
  if (sheet === '법인카드 사용내역서' && full) {
    const m = { Q25: `${s.manager || ''}` };
    ['P', 'R', 'T'].forEach((c, i) => { if (ap[i]) { m[`${c}21`] = ap[i].title || ''; m[`${c}22`] = ap[i].name || ''; } });
    return m;
  }
  return null;
}
// 엑셀 시트에 서명 그림 넣기 (시트에 그림(로고)이 이미 있을 때 같은 그림 묶음에 추가)
function xzAddSign(z, sheetName, col, row, cx, cy, png) {
  if (!new RegExp(`<sheet [^>]*name="${sheetName}"`).test(xz.text(xz.get(z, 'xl/workbook.xml')))) return false;
  const sp = xzSheetPath(z, sheetName), re = xz.get(z, sp.replace(/([^/]+)$/, '_rels/$1.rels')); if (!re) return false;
  const m = xz.text(re).match(/<Relationship [^>]*\/drawing"[^>]*Target="([^"]+)"/) || xz.text(re).match(/<Relationship [^>]*Target="([^"]+)"[^>]*\/drawing"/); if (!m) return false;
  const dp = 'xl/drawings/' + m[1].split('/').pop(), de = xz.get(z, dp); if (!de) return false;
  let d = xz.text(de); if (/name="yusungSign"/.test(d)) return true;   // 이미 들어 있음 (다음 회차 복사본)
  const drp = dp.replace(/([^/]+)$/, '_rels/$1.rels');
  if (!xz.get(z, 'xl/media/yusung_sign.png')) XLSX.CFB.utils.cfb_add(z, 'xl/media/yusung_sign.png', png);
  if (!xz.get(z, drp)) XLSX.CFB.utils.cfb_add(z, drp, new TextEncoder().encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>'));
  const dre = xz.get(z, drp); let dr = xz.text(dre);
  if (!/Id="rIdSign"/.test(dr)) xz.put(dre, dr.replace('</Relationships>', '<Relationship Id="rIdSign" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/yusung_sign.png"/></Relationships>'));
  d = d.replace('</xdr:wsDr>', `<xdr:oneCellAnchor><xdr:from><xdr:col>${col}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${row}</xdr:row><xdr:rowOff>15000</xdr:rowOff></xdr:from><xdr:ext cx="${cx}" cy="${cy}"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="9001" name="yusungSign" descr="서명"/><xdr:cNvPicPr><a:picLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr><xdr:blipFill><a:blip xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="rIdSign"/><a:stretch xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:xfrm xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor></xdr:wsDr>`);
  xz.put(de, d);
  const ce = xz.get(z, '[Content_Types].xml'), ct = xz.text(ce); if (!/Extension="png"/i.test(ct)) xz.put(ce, ct.replace('<Default ', '<Default Extension="png" ContentType="image/png"/><Default '));
  return true;
}
/* 엑셀 양식 속 회사 로고 → 원본 로고(lib/yusung_logo.jpg)로 갈아 끼움: 시트 왼쪽 위(1~4행·A~E열)에 붙은 가로로 긴 그림 (서명·이력서 사진 제외)
 * 가로 길이는 그대로, 높이는 원본 비율대로 (칸에 맞춰 늘어나는 그림도 크기 고정 그림으로 바꿔 찌그러지지 않게) */
async function xzSwapLogo(z) {
  try { if (!window.YUSUNG_LOGO_B64) await loadScript('lib/yusung_logo_b64.js'); } catch (e) { return; }
  const bytes = unb64(window.YUSUNG_LOGO_B64), img = new Image(); img.src = 'data:image/jpeg;base64,' + window.YUSUNG_LOGO_B64;
  try { await img.decode(); } catch (e) { return; }
  const ratio = img.naturalHeight / Math.max(1, img.naturalWidth), MEDIA = 'xl/media/yusung_logo_orig.jpeg';
  let added = false;
  z.FullPaths.map(p => p.replace(/^Root Entry\//, '').replace(/^\//, '')).filter(p => /^xl\/drawings\/[^/]+\.xml$/.test(p)).forEach(dp => {
    const de = xz.get(z, dp), re = xz.get(z, dp.replace(/([^/]+)$/, '_rels/$1.rels')); if (!de || !re) return;
    let d = xz.text(de), r = xz.text(re), hit = false;
    d = d.replace(/<xdr:(oneCellAnchor|twoCellAnchor)([^>]*)>([\s\S]*?)<\/xdr:\1>/g, (all, kind, attr, body) => {
      const col = +((body.match(/<xdr:from>[\s\S]*?<xdr:col>(\d+)<\/xdr:col>/) || [])[1] ?? 99), row = +((body.match(/<xdr:from>[\s\S]*?<xdr:row>(\d+)<\/xdr:row>/) || [])[1] ?? 99);
      const rid = (body.match(/r:embed="([^"]+)"/) || [])[1];
      if (!rid || !/<xdr:pic>/.test(body) || /yusungSign/.test(body) || row > 3 || col > 4) return all;
      const ext = body.match(/<a:ext cx="(\d+)" cy="(\d+)"/) || body.match(/<xdr:ext cx="(\d+)" cy="(\d+)"/), cx = +(ext || [])[1] || 0;
      if (!cx || cx < 2 * (+ext[2] || 1)) return all;   // 로고는 가로로 긴 그림 — 이력서 사진처럼 세로로 긴 그림은 그대로
      const cy = Math.round(cx * ratio);
      r = r.replace(new RegExp(`(<Relationship [^>]*Id="${rid}"[^>]*Target=")[^"]+(")`), `$1../media/yusung_logo_orig.jpeg$2`).replace(new RegExp(`(<Relationship [^>]*Target=")[^"]+("[^>]*Id="${rid}")`), `$1../media/yusung_logo_orig.jpeg$2`);
      hit = true;
      const from = (body.match(/<xdr:from>[\s\S]*?<\/xdr:from>/) || [''])[0], pic = (body.match(/<xdr:pic>[\s\S]*?<\/xdr:pic>/) || [''])[0].replace(/<a:ext cx="\d+" cy="\d+"\/>/, `<a:ext cx="${cx}" cy="${cy}"/>`);
      return `<xdr:oneCellAnchor>${from}<xdr:ext cx="${cx}" cy="${cy}"/>${pic}<xdr:clientData/></xdr:oneCellAnchor>`;
    });
    if (!hit) return;
    xz.put(de, d); xz.put(re, r);
    if (!added && !xz.get(z, MEDIA)) { XLSX.CFB.utils.cfb_add(z, MEDIA, bytes); added = true; }
  });
  if (added) { const ce = xz.get(z, '[Content_Types].xml'), ct = xz.text(ce); if (!/Extension="jpeg"/i.test(ct)) xz.put(ce, ct.replace('<Default ', '<Default Extension="jpeg" ContentType="image/jpeg"/><Default ')); }
}
async function signPng() {   // 서명 그림 → PNG 바이트 + 가로세로 비
  const d = signData(); if (!d) return null;
  const img = new Image(); img.src = d; try { await img.decode(); } catch (e) { return null; }
  return { bytes: unb64(d.split(',')[1]), ratio: img.naturalWidth / Math.max(1, img.naturalHeight) };
}
// mode: 'new' 양식에서 새로(머리+본문) · 'copy' 다른 품의서 복사(머리 칸 전체, 본문 유지) · 'next' 다음 회차(번호·날짜·제목만)
async function pmWriteExcel(bytes, it, mode, swap) {
  if (mode === true) mode = 'new'; else if (mode === false || !mode) mode = 'next';
  const withBody = mode !== 'next';
  const z = xz.open(bytes);
  if (swap) z.FullPaths.forEach((p, i) => { if (/xl\/(worksheets\/[^/]+|sharedStrings)\.xml$/.test(p)) { const fe = z.FileIndex[i]; xz.put(fe, swap(xz.text(fe))); } });   // 현장 이름 바꾸기
  const path = xzSheetPath(z), e = xz.get(z, path);
  const cells = withBody ? pmHeaderCells(it, mode) : { C2: it.docNo, J2: it.firstNo || '', C6: it.date ? String(it.date) : undefined, C8: it.title };   // 다음 회차: 나머지 칸은 지난 회차 그대로
  xz.put(e, xzSetCells(xz.text(e), cells));
  for (const sn of ['자금청구서', '지출결의서', '결재란', '법인카드 사용내역서']) {   // 원본 양식처럼 같은 파일에 있으면 같이 채움
    const wbx = xz.text(xz.get(z, 'xl/workbook.xml'));
    if (!new RegExp(`<sheet [^>]*name="${sn}"`).test(wbx)) continue;
    const pe = xz.get(z, xzSheetPath(z, sn)); const cells2 = pmOtherSheetCells(it, sn, withBody); if (!pe || !cells2) continue;
    xz.put(pe, xzSetCells(xz.text(pe), cells2));
  }
  await xzSwapLogo(z);   // 양식 속 로고 → 원본 로고
  if (withBody) { const sg = await signPng(); if (sg) { const cy = 330000, cx = Math.min(1200000, Math.round(cy * sg.ratio)); xzAddSign(z, '기안품의서', 12, 3, cx, cy, sg.bytes); xzAddSign(z, '지출결의서', 16, 13, Math.round(cx * 0.8), Math.round(cy * 0.8), sg.bytes); } }   // 실무책임자 서명 (이 PC에 등록된 그림)
  const wbE = xz.get(z, 'xl/workbook.xml');   // 열 때 수식 다시 계산
  let wb = xz.text(wbE); wb = /<calcPr/.test(wb) ? wb.replace(/<calcPr([^>]*?)\s*fullCalcOnLoad="[^"]*"/, '<calcPr$1').replace(/<calcPr/, '<calcPr fullCalcOnLoad="1"') : wb.replace('</workbook>', '<calcPr fullCalcOnLoad="1"/></workbook>');
  xz.put(wbE, wb);
  const name = safeName(`${it.no}. ${it.title || '기안품의서'}`).slice(0, 60) + '.xlsx';
  const to = pmXlDir(it.status), dir = await dirAt([site().folder, ...parts(to)]);   // 새 품의(작성중)는 A. 기안품의, 작성 끝난 것은 C. 작성완료
  let nm = name, i = 2; for (; ;) { try { await dir.getFileHandle(nm); nm = name.replace(/\.xlsx$/, `_${i++}.xlsx`); } catch (e2) { break; } }
  const h = await dir.getFileHandle(nm, { create: true }); const w = await h.createWritable(); await w.write(xz.save(z)); await w.close();
  return `${to}/${nm}`;
}
// 엑셀 → 대장 값 읽기
function pmReadExcel(buf) {
  const wb = XLSX.read(buf, { type: 'array', cellDates: false });
  const name = wb.SheetNames.find(n => n.replace(/\s/g, '') === '기안품의서') || wb.SheetNames[0];
  const ws = wb.Sheets[name]; const v = r => { const c = ws[r]; return c ? String(c.w ?? c.v ?? '').trim() : ''; };
  let date = '';
  const c6 = ws.C6; if (c6) { if (typeof c6.v === 'number') { const d = XLSX.SSF.parse_date_code(c6.v); date = `${d.y}-${pad2(d.m)}-${pad2(d.d)}`; } else { const p = parseDateCell(c6.v, todayStr().slice(0, 7)); date = p ? p.date : ''; } }
  const out = { docNo: v('C2'), firstNo: v('J2') === '-' ? '' : v('J2'), date, period: v('J6'), title: v('C8'), vendor: v('C9'), payMethod: v('C10'), payDate: v('H10'), claim: v('M10'), budget: v('S10'), amount: 0 };
  // 금액: 제목의 회차 열("7월분"→"7월", "9차"→"9차") → "금회" 열 → 누계를 뺀 마지막 숫자 … 모두 "합계" 줄에서
  const key = ((out.title.match(/(\d+)\s*월분/) || [])[1] ? `${out.title.match(/(\d+)\s*월분/)[1]}월` : '') || ((out.title.match(/(\d+)\s*차\)/) || [])[1] ? `${out.title.match(/(\d+)\s*차\)/)[1]}차` : '');
  for (const sn of [name, ...wb.SheetNames.filter(n => n !== name)]) {
    const aoa = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, raw: true, defval: '' });
    const sumIdx = aoa.findIndex(row => row.slice(0, 8).some(x => /^합\s*계$/.test(String(x).trim())));
    if (sumIdx < 0) continue;
    const sumRow = aoa[sumIdx], heads = aoa.slice(Math.max(0, sumIdx - 30), sumIdx);
    const colOf = re => { for (const hr of heads) { const c = hr.findIndex(x => re.test(String(x).replace(/\s/g, ''))); if (c >= 0) return c; } return -1; };
    const nCol = c => (c >= 0 && typeof sumRow[c] === 'number' && sumRow[c] > 0 ? sumRow[c] : 0);
    let n = 0;
    if (key) n = nCol(colOf(new RegExp(`^${key}`)));
    if (!n) n = nCol(colOf(/금회/));
    if (!n) { const ex = new Set(heads.flatMap(hr => hr.map((x, c) => (/누계|단가|수량/.test(String(x)) ? c : -1)).filter(c => c >= 0))); n = [...sumRow.keys()].reverse().map(c => (ex.has(c) ? 0 : nCol(c))).find(x => x) || 0; }
    if (n) { out.amount = Math.round(n); break; }
  }
  out.xlTable = pmXlTable(wb, name, out.title);
  // 지출결의서를 같이 올린 품의인가 (= 바로 지급 → 현장 손익). 월결제·인건비로 따로 나가는 품의는 지출결의서 시트가 없거나 비어 있음
  // 회사 양식 지출결의서: D12 금액, 17~28행 A열 적요 · K열 금액. 숨긴 시트는 제외
  out.hasExp = wb.SheetNames.some((sn, si) => {
    if (!/지출\s*결의서/.test(sn) || (((wb.Workbook || {}).Sheets || [])[si] || {}).Hidden) return false;
    const a = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, raw: true, defval: '' }), d12 = (a[11] || [])[3];
    return (typeof d12 === 'number' && d12 > 0) || a.slice(16, 28).some(r => String((r || [])[0] ?? '').trim() || (typeof (r || [])[10] === 'number' && r[10] > 0));
  });
  return out;
}
/* 엑셀 품의서의 세부내역 표 읽기 → { cols, rows } (프로그램 품의서의 표처럼 [반영]에 씀)
 * 회사 양식은 세부내역 표를 Sheet1 에 만들고 품의서 칸에는 그림으로 붙이는 경우가 많아, 품의서 시트(세부내역 아래) → 다른 시트 순으로 찾음 (이력서 시트 제외)
 * 채용: "550만원" → 5,500,000 · 급여(월)=월급 / 단가(일)=일급 · 직종은 제목에서 (기획직원 채용 → 기획) */
const pmTeamOfTitle = t => { const m = String(t || '').match(/([가-힣A-Za-z]+?)\s*(?:직원)?\s*채용/); return m ? m[1].replace(/직원$/, '') : ''; };
const pmWon = v => { const s = String(v ?? '').replace(/\s/g, ''); if (!s || /^無$|^없음$|^-$/.test(s)) return ''; const m = s.match(/^([\d,.]+)(만)?원?$/); return m ? String(Math.round(toNum(m[1]) * (m[2] ? 10000 : 1))) : String(v).trim(); };
function pmXlTable(wb, mainName, title) {
  const S = x => String(x ?? '').replace(/\s+/g, ' ').trim();
  const HEAD = /^(성명|직종|과목|품목|업체명|구분|내역)$/;
  const grab = (aoa, from) => {
    for (let h = from; h < Math.min(aoa.length, from + 40); h++) {
      const cells = (aoa[h] || []).map(S);
      if (h > from && cells.some(x => /기타\s*사항|첨부\s*서류/.test(x))) return null;   // 세부내역 칸이 비어 있음 (표가 그림으로 붙어 있음) → 다른 시트에서
      if (cells.filter(Boolean).length < 3 || !cells.some(x => HEAD.test(x.replace(/\s/g, '')))) continue;
      const idx = cells.map((x, c) => (x && !/^\d+\.$|세부\s*내역/.test(x) ? c : -1)).filter(c => c >= 0);
      const cols = idx.map(c => cells[c].replace(/\s/g, '') === '성명' ? '성명' : cells[c]), rows = [];
      for (let i = h + 1; i < aoa.length; i++) {
        const r = idx.map(c => S((aoa[i] || [])[c])), all = (aoa[i] || []).map(S).filter(Boolean);
        if (!all.length || /^(합\s*계|계|소계|총계)$/.test(r[0]) || all.some(x => /기타\s*사항|첨부\s*서류/.test(x))) break;
        rows.push(r);
      }
      if (rows.length) return { cols, rows };
    }
    return null;
  };
  let t = null;
  const main = XLSX.utils.sheet_to_json(wb.Sheets[mainName], { header: 1, raw: false, defval: '' });
  const at = main.findIndex(r => r.some(x => /세부\s*내역/.test(S(x))));
  if (at >= 0) t = grab(main, at);
  for (const sn of wb.SheetNames) {
    if (t) break; if (sn === mainName || /이력서/.test(sn)) continue;
    const aoa = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, raw: false, defval: '' });
    if (aoa.some(r => r.some(x => /이\s*력\s*서/.test(S(x))))) continue;
    t = grab(aoa, 0);
  }
  if (!t) return null;
  // 금액 칸 정리 (550만원 → 5500000)
  t.cols.forEach((c, j) => { if (/급여|단가|금액|수당|식대/.test(c)) t.rows.forEach(r => { r[j] = pmWon(r[j]); }); });
  // 채용 품의: 지급형태 · 직종(제목에서) 칸 채우기
  if (/채용/.test(title || '') && t.cols.includes('성명')) {
    if (!t.cols.some(c => /지급형태/.test(c))) { const rc = t.cols.find(c => /급여|단가/.test(c)) || ''; const pt = /일/.test(rc) ? '일급' : /월/.test(rc) ? '월급' : ''; if (pt) { t.cols.push('지급형태'); t.rows.forEach(r => r.push(pt)); } }
    // 직종: 줄의 "구분"이 직종이면 그대로(상담사·TM), 계약직·정규직 같은 고용형태면 제목에서 (기획직원 채용 → 기획)
    const team = pmTeamOfTitle(title), gi = t.cols.findIndex(c => c.replace(/\s/g, '') === '구분');
    if (!t.cols.some(c => /직종/.test(c))) { t.cols.unshift('직종'); t.rows.forEach(r => { const g = gi >= 0 ? r[gi] : ''; r.unshift(g && !/계약|정규|일용|파견|프리/.test(g) ? g : team); }); }
  }
  return t;
}
const pmScanDir = it => (DIR.scan[it.kind] || DIR.pmScan);   // 인건비·월결제·전도금 자금청구서 → B. 자금관련 스캔 폴더
const pmScanName = it => (DIR.scan[it.kind] ? safeName(it.docNo || `${site().name}${it.no}`) : safeName(`${pad2(it.no)}. ${it.title || ''}`));
const pmNoOfName = n => toNum((String(n).match(/^\D{0,6}?(\d{1,4})(?=[.\s_)\-]|$)/) || [])[1]);
// 현장폴더/A. 기안품의 를 훑어 엑셀·스캔본을 대장에 반영 (새 파일은 등록, 바뀐 엑셀은 다시 읽음)
/* 프로그램에서 쓴 품의(general)도 같은 번호 엑셀을 하나 만들어 둠 (회사 양식 · 머리글·1. 내용·첨부서류만, 자리는 상태대로 pmXlDir) — 폴더에서 번호가 비지 않게
   대장 연결은 x.xlFile (x.file 이 아님 → pmSyncFolder 가 엑셀 품의로 다시 읽지 않음). 한 번만 만들고, 뒤에 고쳐도 파일은 그대로 */
// 품의 엑셀 자리: 작성중 = A. 기안품의 (상위 폴더) · 결재중·결재완료 = C. 작성완료 — 품의서가 많아져도 헷갈리지 않게 나눠 둠
const pmXlDir = st => ((st || '작성중') === '작성중' ? DIR.pm : DIR.pmDraft);
async function pmPlaceFiles(id) {   // 상태에 맞는 폴더로 엑셀(file·xlFile)을 옮김 (A. 기안품의 ↔ C. 작성완료, 예전 "작성완료" 폴더 것도) → 옮긴 수
  const f = pmFind(id); if (!f || !FS.ready) return 0;
  const to = pmXlDir(f.x.status); let moved = 0;
  for (const k of ['file', 'xlFile']) {
    const rel = f.x[k]; if (!rel || !/\.xlsx?$/i.test(rel)) continue;
    const cut = rel.lastIndexOf('/'), from = rel.slice(0, cut), name = rel.slice(cut + 1);
    if (from === to || ![DIR.pm, DIR.pmDraft, DIR.pmDraftOld].includes(from)) continue;   // 결재완료 폴더 등 다른 곳에 둔 파일은 그대로
    let dst, nm = name;
    try {
      const src = await dirAt([site().folder, ...parts(from)], false); dst = await dirAt([site().folder, ...parts(to)]);
      const file = await (await src.getFileHandle(name)).getFile();
      for (let i = 2; ; i++) { try { await dst.getFileHandle(nm); nm = name.replace(/(\.xlsx?)$/i, `_${i}$1`); } catch (e) { break; } }
      const w = await (await dst.getFileHandle(nm, { create: true })).createWritable(); await w.write(file); await w.close();
      try { await src.removeEntry(name); } catch (e) { await dst.removeEntry(nm).catch(() => { }); throw e; }   // 원본을 못 지우면(엑셀로 열려 있음 등) 옮기지 않음
      f.x[k] = `${to}/${nm}`; if (k === 'file') f.x.fileMtime = (await (await dst.getFileHandle(nm)).getFile()).lastModified;
      moved++;
    } catch (e) { toast(`품의서 파일을 옮기지 못했습니다: ${name} (엑셀에서 열려 있으면 닫고 [엑셀·스캔본 다시 읽기]를 누르세요)`); }
  }
  if (moved) save();
  return moved;
}
const pmFileSync = id => pmEnsureXl(id).then(() => pmPlaceFiles(id));   // 저장·상태 바꿀 때: 엑셀이 없으면 만들고, 상태에 맞는 폴더로
const PM_XL_BUSY = new Set();
async function pmEnsureXl(id) {
  if (!FS.ready || PM_XL_BUSY.has(id)) return false;
  const f = pmFind(id); if (!f || f.x.kind !== 'general' || f.x.xlFile || !f.x.no) return false;
  PM_XL_BUSY.add(id);
  try { f.x.xlFile = await pmWriteExcel(await pmTemplateBytes(), f.x, 'new'); save(); return true; }
  catch (e) { toast('품의서 엑셀 파일을 만들지 못했습니다: ' + e.message); return false; }
  finally { PM_XL_BUSY.delete(id); }
}
async function pmSyncFolder(quiet) {
  if (!FS.ready) return;
  let made = 0; for (const p of pmAll().filter(p => p.kind === 'general' && !p.xlFile)) if (await pmEnsureXl(p.id)) made++;   // 예전에 프로그램에서 쓴 품의도 엑셀 파일 만들기
  if (made) toast(`프로그램에서 쓴 품의서 ${made}건의 엑셀 파일을 만들었습니다 (작성중 = ${DIR.pm}, 작성 끝 = ${DIR.pmDraft}).`);
  // 엑셀: A. 기안품의 · C. 작성완료(예전 작성완료) / 스캔본(PDF·사진): A. 결재완료 · B. 스캔본 (→ 결재완료), A. 기안품의 바로 아래 PDF는 연결만
  const files = [];
  for (const [d, done] of [[DIR.pm, false], [DIR.pmDraft, false], [DIR.pmDraftOld, false], [DIR.pmDone, true], [DIR.pmScan, true]]) {   // pmDraftOld = 예전 "작성완료" 폴더도 계속 읽음
    let dir; try { dir = await dirAt([site().folder, ...parts(d)], false); } catch (e) { continue; }
    for await (const [name, h] of dir.entries()) if (h.kind === 'file' && !/^~\$|^desktop\.ini$/i.test(name)) files.push({ name, h, rel: `${d}/${name}`, done });
  }
  if (!files.length) { if (!quiet) toast(`${site().folder}/${DIR.pm} 폴더에 품의서 파일이 없습니다. 엑셀 품의서를 만들거나, 기존 품의서 파일을 작성완료·결재완료·스캔본 폴더에 넣으세요.`); return; }
  let added = 0, updated = 0, scans = 0;
  const all = () => pmAll(), own = new Set(all().map(p => p.xlFile).filter(Boolean));
  for (const f of files.filter(x => /\.xlsx?$/i.test(x.name))) {
    const rel = f.rel; if (own.has(rel)) continue;   // 프로그램 품의의 엑셀(pmEnsureXl) — 대장에 따로 넣지 않음
    const file = await f.h.getFile();
    let it = all().find(p => p.file === rel);
    if (it && it.fileMtime === file.lastModified && it.xlParsed === 2 && (it.tpl || !/인건비\s*조정|급여\s*조정|단가\s*(조정|변경)/.test(it.title || ''))) continue;   // xlParsed: 2 = 세부내역 표 + 지출결의서 여부까지 읽은 판 (예전에 읽은 것은 한 번 더 읽음)
    let info; try { info = pmReadExcel(new Uint8Array(await file.arrayBuffer())); } catch (e) { continue; }
    const no = pmNoOfName(f.name) || toNum((String(info.docNo).match(/-(\d+)\s*$/) || [])[1]);
    if (!it) it = all().find(p => p.kind === 'excel' && !p.file && toNum(p.no) === no);
    const base = it ? { ...it } : pmNew({ kind: 'excel', no: no || pmNextNo(), blocks: [], status: f.rel.startsWith(DIR.pm + '/') && !f.rel.slice(DIR.pm.length + 1).includes('/') ? '작성중' : '결재중' });   // 새로 찾은 엑셀: 상위 폴더 = 작성중, 작성완료 폴더 = 작성 끝(결재중)
    delete base._ym;
    Object.entries(info).forEach(([k, val]) => { if (val !== '' && val !== 0) base[k] = val; });
    if (!base.title) base.title = f.name.replace(/^\d+\.\s*/, '').replace(/\.xlsx?$/i, '');
    if (!base.date) base.date = new Date(file.lastModified).toISOString().slice(0, 10);
    if (!base.docNo) base.docNo = pmDocNo(base.no, base.date);
    Object.assign(base, { kind: 'excel', file: rel, fileMtime: file.lastModified, xlParsed: 2 });
    if (info.xlTable) base.xlTable = info.xlTable; else delete base.xlTable;
    if (!base.tpl) { const tl = String(base.title || ''); base.tpl = /채용/.test(tl) ? 'hire' : /단가\s*품의/.test(tl) ? 'rate' : /인건비\s*조정|급여\s*조정|단가\s*(조정|변경)/.test(tl) ? 'hire' : base.tpl; if (!base.tpl) delete base.tpl; }   // 인건비 조정 = 채용 품의처럼 [직원 등록·단가 반영]   // 엑셀 품의도 [직원 반영]·[단가 반영] 버튼이 나오게
    pmPut(base); it ? updated++ : added++;
  }
  for (const f of files.filter(x => /\.(pdf|jpe?g|png)$/i.test(x.name))) {
    const rel = f.rel;
    if (all().some(p => (p.scans || []).includes(rel))) continue;
    const no = pmNoOfName(f.name); if (!no) continue;
    const hit = all().find(p => toNum(p.no) === no && p.kind !== 'cash'); if (!hit) continue;
    const fx = pmFind(hit.id).x; fx.scans = [...(fx.scans || []), rel]; if (f.done) fx.status = '결재완료'; scans++;
  }
  // 프로그램이 만든 엑셀(xlFile)만 상태에 맞는 폴더로 정리 — 사람이 넣어 둔 엑셀 품의(file)는 상태를 바꿀 때만 옮김 (예전 파일이 한꺼번에 움직이지 않게)
  let moved = 0; for (const p of all()) if (p.xlFile) moved += await pmPlaceFiles(p.id);
  if (moved) toast(`품의서 엑셀 ${moved}개를 상태에 맞는 폴더로 옮겼습니다 (작성중 = ${DIR.pm}, 결재중·결재완료 = ${DIR.pmDraft}).`);
  save(); render();
  if (!quiet || added || updated || scans) toast(`품의서 폴더를 반영했습니다: 새 엑셀 ${added}건 · 다시 읽음 ${updated}건 · 스캔본 연결 ${scans}건`);
}
const pmBump = t => String(t || '').replace(/\((\d+)차\)/, (m, n) => `(${+n + 1}차)`).replace(/\((\d+)월분\)/, (m, n) => `(${+n % 12 + 1}월분)`);   // 제목의 (9차)→(10차) · (7월분)→(8월분) — 엑셀·프로그램 품의 다음 회차 공통
async function pmNextExcel(src) {
  const bump = pmBump;
  let bytes; try { bytes = new Uint8Array(await (await (await fileAt(`${site().folder}/${src.file}`, false)).getFile()).arrayBuffer()); } catch (e) { toast('지난 품의 엑셀 파일을 찾을 수 없습니다: ' + src.file); return; }
  const it = pmNew({ kind: 'excel', blocks: [], title: bump(src.title), vendor: src.vendor, period: '', payMethod: src.payMethod, claim: src.claim, budget: src.budget, firstNo: (src.firstNo && src.firstNo !== '-' ? src.firstNo : '') || src.docNo, prevId: src.id, tpl: src.tpl, useCards: src.useCards });
  it.docNo = pmDocNo(it.no, it.date);
  try { it.file = await pmWriteExcel(bytes, it, false); } catch (e) { toast('엑셀 파일을 만들지 못했습니다: ' + e.message); return; }
  pmPut(it); save(); render(); pmFileInfo(it, '지난 회차 엑셀을 그대로 복사하고 번호·기안일자·제목·최초 기안번호만 바꿨습니다. 세부내역의 이번 회차 금액을 엑셀에서 고치세요.');
}
// 직원 선지급 칸 — 지금은 쓰지 않아 뺌 (사용자 요청). 예전에 적은 값(prepaidBy 등)은 자료에 그대로 남음
function pmUrgentFields() { return ''; }
/* 이 PC에서 데이터 폴더의 전체 주소 (예: C:\Users\○○\Dropbox) — 브라우저는 폴더의 실제 위치를 알려 주지 않아서 PC마다 한 번 넣어 둠 (이 브라우저에만, 데이터 폴더 이름별)
   → 품의서 엑셀의 [📂 폴더 열기] = 폴더 주소 복사 + 탐색기 검색 화면(search-ms) */
const ROOT_PATH_KEY = 'yusung_rootpath_v1';
// 자동: 프로그램(html)을 PC에서 열었으면(file://) 그 주소 안에 데이터 폴더 이름이 있으면 거기까지 = 데이터 폴더 (예: C:\…\Dropbox\…\경리업무\프로그램.html → C:\…\경리업무)
const rootPathGuess = () => {
  if (location.protocol !== 'file:' || !FS.root) return '';
  const seg = decodeURIComponent(location.pathname).replace(/^\/+/, '').split('/'), k = seg.slice(0, -1).lastIndexOf(FS.root.name);
  return k > 0 && /^[a-z]:$/i.test(seg[0]) ? seg.slice(0, k + 1).join('\\') : '';
};
const rootPath = () => { let v = ''; try { v = (JSON.parse(localStorage.getItem(ROOT_PATH_KEY)) || {})[FS.root.name] || ''; } catch (e) { } return v || rootPathGuess(); };
const rootPathSet = v => { try { const o = JSON.parse(localStorage.getItem(ROOT_PATH_KEY)) || {}; o[FS.root.name] = v; localStorage.setItem(ROOT_PATH_KEY, JSON.stringify(o)); } catch (e) { toast('이 브라우저에 저장하지 못했습니다.'); } };
function pmFileInfo(it, extra) {
  const rel = String(it.file || it.xlFile || ''), cut = rel.lastIndexOf('/');
  const winOf = (...p) => p.filter(Boolean).join('\\').replace(/\//g, '\\');
  const full = () => { const rp = rootPath(); return { dir: winOf(rp || FS.root.name, site().folder, rel.slice(0, cut)), file: winOf(rp || FS.root.name, site().folder, rel), ok: !!rp }; };
  const isCard = it.tpl === 'opencard';
  const r = modal(`엑셀 품의서 — ${it.no}번 ${it.title || ''}`, `<p>${extra ? esc(extra) + '<br><br>' : ''}아래 위치의 엑셀 파일을 열어 작성·인쇄하세요. 다 쓴 뒤 품의서 탭의 <b>[엑셀·스캔본 다시 읽기]</b>를 누르면 대장(제목·업체·금액)이 갱신됩니다.</p>
      <div class="row"><input id="xePath" value="${esc(full().file)}" readonly class="inp" style="flex:1;font-family:monospace"><button class="btn primary sm" id="xeDir" title="탐색기로 이 품의서 파일을 찾아 보여 줌 (폴더 주소도 복사)">📂 폴더 열기</button></div>
      <div id="xeRoot" class="banner ${rootPath() ? 'info' : 'warn'} small" style="margin-top:8px"><span id="xeRootMsg">${rootPath()
        ? `이 PC의 데이터 폴더: <b>${esc(rootPath())}</b>`
        : `<b>처음 한 번만:</b> 이 PC에서 데이터 폴더 <b>"${esc(FS.root.name)}"</b>의 전체 주소를 넣어 주세요. 파일 탐색기에서 그 폴더를 열고 → 위쪽 주소창을 누르면 나오는 주소(예: C:\\Users\\○○\\${esc(FS.root.name)})를 복사해 붙여넣기.`}</span> <button class="lnk" id="xeRootEd"${rootPath() ? '' : ' hidden'}>바꾸기</button>
        <div class="row" id="xeRootRow" style="margin-top:6px;${rootPath() ? 'display:none' : ''}"><input id="xeRootIn" class="inp" style="flex:1;font-family:monospace" value="${esc(rootPath())}" placeholder="C:\\Users\\○○\\${esc(FS.root.name)}"><button class="btn sm" id="xeRootSave">저장</button></div></div>
      <p class="muted small">[📂 폴더 열기] → 탐색기 검색 화면에 이 품의서 파일이 나옵니다 (두 번 누르면 엑셀). 처음 한 번은 크롬이 묻습니다 — <b>항상 허용</b>에 체크하고 열기. 폴더 주소도 복사되니, 안 열리면 탐색기 주소창(또는 Win+R)에 Ctrl+V → Enter.</p>
      ${isCard ? `<div class="form-grid"><label>카드 사용 시작일<input type="date" data-rng="from" data-pf="useFrom" value="${esc(it.useFrom || '')}"></label><label>카드 사용 종료일<input type="date" data-rng="to" data-pf="useTo" value="${esc(it.useTo || '')}"></label>
        <label>승인 금액<input class="num" data-pf="amount" value="${fmt0(it.amount)}"></label><label>카드 (쉼표, 비우면 전체)<input data-pf="useCards" value="${esc((it.useCards || []).join(', '))}"></label></div>` : ''}      ${pmUrgentFields(it)}`, [
    { label: '닫기' },
    { label: '저장', cls: 'primary', onClick: root => {
      const f = pmFind(it.id); if (!f) return;
      root.querySelectorAll('[data-pf]').forEach(el => { const k = el.dataset.pf; f.x[k] = ['amount', 'prepaidAmt'].includes(k) ? toNum(el.value) : k === 'useCards' ? el.value.split(/[,\s]+/).map(x => x.replace(/\D/g, '').slice(-4)).filter(Boolean) : el.value; });
      root.querySelectorAll('[data-pf-x]').forEach(el => { f.x[el.dataset.pfX] = el.checked; });
      save(); render(); toast('저장했습니다.');
    } }]);
  const copy = async (txt, msg) => { try { await navigator.clipboard.writeText(txt); toast(msg); } catch (e) { const inp = $('#xePath', r); inp.value = txt; inp.select(); document.execCommand('copy'); toast(msg); } };
  // 폴더 열기: 폴더 주소 복사 + Windows 탐색기 검색 링크(search-ms: 그 폴더에서 이 파일 이름으로 찾은 화면) — 브라우저는 일반 폴더 창을 직접 띄울 수 없음
  // 크롬이 처음에 "Windows 탐색기 열기?"를 물음 ("항상 허용"). 검색 화면 위쪽 경로를 누르면 일반 폴더 화면
  $('#xeDir', r).onclick = async () => {
    const p = full(); if (!p.ok) { $('#xeRootIn', r).focus(); toast('먼저 아래에 이 PC의 데이터 폴더 주소를 한 번 넣어 주세요.'); return; }
    try { await navigator.clipboard.writeText(p.dir); } catch (e) { }
    const a = document.createElement('a'), name = rel.slice(cut + 1).replace(/\.xlsx?$/i, '');
    a.href = `search-ms:displayname=${encodeURIComponent(`${it.no}번 품의서`)}&crumb=location:${encodeURIComponent(p.dir)}&query=${encodeURIComponent(name)}`;
    document.body.appendChild(a); a.click(); a.remove();
    toast('탐색기를 엽니다 (폴더 주소도 복사했습니다). 크롬이 물으면 [Windows 탐색기 열기]를 누르세요.');
  };
  $('#xeRootEd', r).onclick = () => { $('#xeRootRow', r).style.display = ''; $('#xeRootIn', r).focus(); };
  $('#xeRootSave', r).onclick = () => {
    const v = $('#xeRootIn', r).value.trim().replace(/^"|"$/g, '').replace(/[\\/]+$/, '');
    if (!/^([a-z]:|\\\\)/i.test(v)) { toast('C:\\ 처럼 드라이브부터 시작하는 전체 주소를 넣어 주세요.'); return; }
    rootPathSet(v); $('#xePath', r).value = full().file;
    $('#xeRoot', r).className = 'banner info small'; $('#xeRootMsg', r).innerHTML = `이 PC의 데이터 폴더: <b>${esc(v)}</b>`; $('#xeRootEd', r).hidden = false;
    $('#xeRootRow', r).style.display = 'none'; toast('이 PC의 데이터 폴더 주소를 저장했습니다. 이제 [📂 폴더 열기]를 누르세요.');
  };
}

/* 품의서 본문 = 블록 목록 (글 · 표 · 첨부서류 · 그림). 순서·개수·제목 자유, 번호(1. 2. 3.)는 자동 */
const PM_BLOCK = { text: '글', table: '표', attach: '첨부서류', image: '그림' };
function pmBlocks(it) {
  if (Array.isArray(it.blocks)) {   // 예전: 번호 없는 "별첨. ○○" 제목 표 → 별첨 블록 (제목은 번호 붙는 항목·별첨만 인쇄)
    it.blocks.forEach(b => { if (!b.num && !b.annex && /^별첨\s*\d*\s*[.:]?\s*/.test(b.title || '')) { b.annex = true; b.title = b.title.replace(/^별첨\s*\d*\s*[.:]?\s*/, ''); } });
    return it.blocks;
  }
  const b = [];   // 예전 형식(품의 내용·세부내역·첨부서류 고정) → 블록으로 옮김
  if (it.body !== undefined) b.push({ type: 'text', num: true, title: '', text: it.body || '' });
  if (it.detail) b.push({ type: 'table', num: true, title: '세부내역', cols: it.detail.cols || [], rows: it.detail.rows || [], sum: !!it.detail.sum, note: it.detailNote || '' });
  if (it.attach) b.push({ type: 'attach', num: true, title: '첨부서류', items: it.attach });
  return b;
}
const pmNewBlock = type => type === 'text' ? { type, num: true, title: '', text: '' }
  : type === 'table' ? { type, num: true, unit: PM_UNIT_DEF, title: '세부내역', cols: ['구분', '내역', '금액', '비고'], rows: [['', '', '', '']], sum: true, note: '' }
  : type === 'attach' ? { type, num: true, title: '첨부서류', items: [{ name: '', ok: true }, { name: '', ok: false }, { name: '', ok: false }] }
  : { type: 'image', num: false, title: '', rel: '', width: 100 };
/* 글 블록의 **굵게**: 인쇄(docPumui)는 굵게, 엑셀 양식에 쓸 때는 ** 를 뺌 */
/* 첨부서류 확인 칸: ok = 첨부함(○) · st = 그 밖의 표시 (후첨·예정·X) */
const PM_ATT_MARKS = ['○', '후첨', '예정', 'X', ''];
const pmAttMark = a => (a.ok ? '○' : a.st || '');
const pmPlain = s =>String(s || '').replace(/\*\*(.+?)\*\*/g, '$1');
const pmAmount = p =>toNum(p.amount) || (pmBlocks(p).filter(b => b.type === 'table').map(pmDetailTotal).find(v => v) || 0);
/* 지출결의서 적요: 세부내역 표에 업체 열이 있으면 업체별로 한 줄씩 (업체 칸이 빈 줄 = 바로 위 업체, 계·합계 줄은 뺌)
   업체가 하나뿐이거나 업체별 합이 품의 금액과 다르면 예전처럼 한 줄 (업체명 · 제목 · 품의 금액) */
/* 업체가 여러 곳이면 지출결의서는 업체별로 한 줄씩 (세부내역 표 중 업체 열이 있는 첫 표)
   업체 칸이 빈 줄 = 바로 위 업체 · 계·소계·합계 줄은 뺌 · 업체 없는 부가세 줄이 하나뿐이면 업체별 금액 비율로 나눔
   업체별 합이 품의 금액과 달라도 업체별로 나눔 (인쇄 전 확인 pmExpWarns 로 알림) */
function pmExpGroups(it) {
  const want = { item: /^(구분|품목|과목|직종|내역|품명)/, name: /업체|임대인|거래처/, amount: /금액/ };
  const tbs = pmBlocks(it).filter(b => b.type === 'table' && b.title !== '신규업체 등록사항');
  for (const tb of (tbs.length ? tbs : it.xlTable ? [it.xlTable] : [])) {
    const rows = pmTableRows(it, want, tb); if (!rows.some(r => r.name)) continue;
    const g = new Map(), vats = []; let last = '';
    rows.forEach(r => {
      if (/^(계|소계|합계|합\s*계|총계|VAT합계)$/.test(r.item.replace(/\s/g, ''))) return;
      const amt = toNum(r.amount); if (r.name) last = r.name;
      if (!amt) return;
      if (!r.name && /^(부가세|부가가치세|VAT)/i.test(r.item)) { vats.push({ last, amt }); return; }
      const key = last || it.vendor || '', x = g.get(key) || { a: key, items: [], amount: 0 };
      x.amount += amt; if (r.item && !x.items.includes(r.item)) x.items.push(r.item); g.set(key, x);
    });
    const list = [...g.values()]; if (list.length < 2) return list;
    if (vats.length === 1) {   // 표 맨 아래 부가세 한 줄 → 업체별 금액 비율로 (끝전은 마지막 업체)
      const V = vats[0].amt, S = sum(list, x => x.amount); let left = V;
      list.forEach((x, k) => { const v = k === list.length - 1 ? left : Math.round(V * x.amount / S); x.amount += v; left -= v; });
    } else vats.forEach(v => { const x = g.get(v.last); if (x) x.amount += v.amt; });   // 업체마다 부가세 줄 → 바로 위 업체
    return list;
  }
  return [];
}
function pmExpItems(it) {
  const total = pmAmount(it), one = [{ a: it.vendor || '', b: it.title || '', amount: total }];
  if (it.org) return [{ a: it.vendor || '', b: `${it.org.kind}(${it.org.round}차)`, amount: total }];   // 조직 지급: 계약축하금(2차) | ㈜○○ | 금액(VAT 포함)
  const list = pmExpGroups(it);
  if (list.length < 2) return one;
  return list.map(x => ({ a: x.a, b: x.items.join('·') || it.title || '', amount: x.amount }));
}
function pmExpWarns(it) {   // 인쇄 전 확인 (14 pmPrintWarns): 업체별 나누기가 안 되거나 합이 다를 때
  if (it.noExpense || it.org) return [];
  const list = pmExpGroups(it), many = String(it.vendor || '').split(/[,，、·\/]/).filter(s => s.trim()).length > 1;
  if (list.length < 2) return many ? ['업체명에 업체가 여러 곳인데 세부내역 표에 "업체명" 열이 없어 지출결의서가 한 줄로 나갑니다 — 표에 업체명 열을 넣고 줄마다 업체를 적으세요'] : [];
  const s = sum(list, x => x.amount), total = pmAmount(it);
  return Math.abs(s - total) > 1 ? [`지출결의서 업체별 합계 ${fmt(s)}원이 품의 금액 ${fmt(total)}원과 다릅니다 (${list.map(x => `${x.a} ${fmt(x.amount)}`).join(', ')}) — 표의 금액·부가세 줄 또는 품의 금액을 확인하세요`] : [];
}

/* 표의 부가세 줄 자동 (계·부가세·합계 줄이 있는 표 — 에메트 견적·조직 지급 등)
   계 = 품목 줄 합 · 부가세 = 부가세 없는 줄(어느 칸이든 "부가세 없음"·"면세")을 뺀 금액의 10% (원 미만 버림) · 합계 = 계 + 부가세 */
const PM_NOVAT = /면세|비과세|부가세\s*(없음|제외|미포함)|VAT\s*(없음|제외)/i;
const PM_TOT_LAB = /^(계|소계|공급가|공급가액|부가세|부가가치세|VAT|합계|총계)$/i;
const pmRowLab = r => String((r || [])[0] ?? '').replace(/\s/g, '');
const pmNoVat = r => !PM_TOT_LAB.test(pmRowLab(r)) && r.some(v => PM_NOVAT.test(String(v ?? '')));
const pmVatAuto = rows => rows.some(r => /^(부가세|부가가치세|VAT)$/i.test(pmRowLab(r))) && rows.some(r => /^(합계|총계)$/.test(pmRowLab(r)));
function pmVatRecalc(rows, edited) {   // rows 를 그 자리에서 고침 · edited = 지금 고치는 줄 (부가세 줄을 직접 고치면 합계만 맞춤)
  if (!pmVatAuto(rows)) return;
  const find = re => rows.find(r => re.test(pmRowLab(r)));
  const gr = find(/^(계|소계|공급가|공급가액)$/), vr = find(/^(부가세|부가가치세|VAT)$/i), hr = find(/^(합계|총계)$/);
  if (edited && (edited === gr || edited === hr)) return;   // 계·합계를 직접 고치면 그대로 둠
  const items = rows.filter(r => !PM_TOT_LAB.test(pmRowLab(r)) && r.some(v => String(v ?? '').trim()));
  const js = hr.map((v, j) => j).filter(j => j > 0 && [gr, vr, hr].some(r => r && /\d/.test(String(r[j] ?? ''))));
  js.forEach(j => {
    const supply = sum(items, r => toNum(r[j])), vat = edited === vr ? toNum(vr[j]) : Math.floor(sum(items.filter(r => !pmNoVat(r)), r => toNum(r[j])) / 10);
    if (gr) gr[j] = fmt(supply);
    if (edited !== vr) vr[j] = fmt(vat);
    hr[j] = fmt(supply + vat);
  });
}
function pmVatToggle(t, r) {   // 오른쪽 클릭 "이 줄 부가세 없음" — 비고 칸에 적음 (인쇄에도 보임) · 다시 누르면 지움
  const row = t.rows[r];
  if (pmNoVat(row)) { t.rows[r] = row.map(v => String(v ?? '').replace(new RegExp(`\\s*[·,/]?\\s*(${PM_NOVAT.source})`, 'gi'), '').trim()); return; }
  let k = t.cols.findIndex(c => /비고/.test(c));
  if (k < 0) { t.cols.push('비고'); t.rows.forEach(x => x.push('')); k = t.cols.length - 1; }
  row[k] = [String(row[k] ?? '').trim(), '부가세 없음'].filter(Boolean).join(' · ');
}

/* 기안품의서 작성 창 */
const pmAiWarnHtml = warns => (warns || []).length ? `<div class="banner warn small"><b>AI가 확인해 달라는 것</b><ul style="margin:4px 0 0;padding-left:18px">${warns.map(w => `<li>${esc(w)}</li>`).join('')}</ul></div>` : '';
function pmEditor(item, warns = []) {
  if (item.kind !== 'general') { state.tab = item.kind === 'monthly' ? 'monthly' : item.kind; state.ym = item.linkYm || state.ym; render(); toast('자금청구서는 이 탭에서 [자금청구서 인쇄]로 다시 인쇄합니다.'); return; }
  const it = JSON.parse(JSON.stringify(item)); delete it._ym;
  it.blocks = JSON.parse(JSON.stringify(pmBlocks(it)));
  delete it.body; delete it.detail; delete it.detailNote; delete it.attach;
  const B = it.blocks;
  const f = (label, k, type = 'text', extra = '') => `<label><span class="pm-lab">${label}</span><input ${type === 'date' ? 'type="date"' : ''} data-pf="${k}" value="${esc(it[k] ?? '')}" ${extra}></label>`;
  const numLike = c => /금액|단가|합계|누계|청구|수량|\d+월|\d+차|금회|요금/.test(c || '');
  /* 본문 = 문서 보기: 인쇄 모양 그대로 클릭해서 쓰기 (네이버 편집기처럼)
     글칸은 contenteditable (data-db=블록, data-df=칸) → readDoc 이 블록으로 읽음. 체크·선택·첨부 이름은 data-b 칸 */
  let curB = -1;   // 문서 보기에서 커서가 있는 블록 → [+ 항목] 등은 그 아래에 넣음
  const pdInline = l => esc(l).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  const pdLines = (t, bold) => String(t || '').split('\n').map(l => `<div>${(bold ? pdInline(l) : esc(l)) || '<br>'}</div>`).join('');
  const pdEd = (i, f, ph, html, cls = '') => `<div class="pd-${f}${cls}" contenteditable="true" spellcheck="false" data-db="${i}" data-df="${f}" data-ph="${esc(ph)}">${html}</div>`;
  const pdSumCols = b => b.sum && !(b.rows || []).some(r => /합계|합\s*계/.test(String(r[0] || ''))) ? b.cols.map((c, j) => j > 0 && numLike(c) && !/단가|수량|단위/.test(c)) : null;
  const pdTable = (b, i) => {
    const cols = b.cols, two = cols.some(c => c.includes('|')), grp = c => (c.includes('|') ? c.split('|')[0] : null);
    const th = (attr, txt, sp = '') => `<th contenteditable="true" spellcheck="false" data-db="${i}" ${attr}${sp}>${esc(txt)}</th>`;
    let h1 = '';
    cols.forEach((c, j) => {
      const [a, x] = c.split('|');
      if (!two || x === undefined) { h1 += th(`data-dh="${j}"`, c, two ? ' rowspan="2"' : ''); return; }
      if (j > 0 && grp(cols[j - 1]) === a) return;
      const js = []; for (let k = j; k < cols.length && grp(cols[k]) === a; k++) js.push(k);
      h1 += th(`data-dg="${js.join(',')}" data-c="${j}"`, a, ` colspan="${js.length}"`);
    });
    const h2 = two ? cols.map((c, j) => c.includes('|') ? th(`data-ds="${j}" data-c="${j}"`, c.split('|')[1]) : '').join('') : '';
    const rows = b.rows.map((r, ri) => `<tr class="${/^(계|소계|부가세|합계|합\s*계|총계|VAT)$/.test(String(r[0] || '').trim()) ? 'pd-tot' : ''}">${cols.map((c, j) => `<td contenteditable="true" spellcheck="false" data-db="${i}" data-r="${ri}" data-c="${j}" class="${numLike(c) ? 'num' : ''}">${esc(r[j] ?? '')}</td>`).join('')}</tr>`).join('');
    const sc = pdSumCols(b);
    const foot = sc ? `<tfoot data-sum="${i}"><tr>${cols.map((c, j) => j === 0 ? '<td>합계 <span class="muted">(자동)</span></td>' : `<td class="num" data-sj="${sc[j] ? j : ''}">${sc[j] ? fmt0(sum(b.rows, r => toNum(r[j]))) : ''}</td>`).join('')}</tr></tfoot>` : '';
    return `<table class="pd-tbl"><thead><tr>${h1}</tr>${two ? `<tr>${h2}</tr>` : ''}</thead><tbody>${rows}</tbody>${foot}</table>`;
  };
  const pdAttach = (b, i) => `<div class="pd-att">${b.items.map((a, k) => `<span class="pd-chip"><select class="pd-mark" data-b="${i}" data-am="${k}" title="확인 칸: ○ 첨부함 · 후첨 · 예정 · X">${PM_ATT_MARKS.map(m => `<option value="${m}" ${pmAttMark(a) === m ? 'selected' : ''}>${m || '　'}</option>`).join('')}</select><input data-b="${i}" data-ai="${k}" value="${esc(a.name)}" placeholder="서류 이름"><button class="btn ghost sm" data-battadd="${i}" data-k="${k}" title="이 서류 파일 올리기 (사진·PDF) — 인쇄할 때 품의서 뒤에 같이 인쇄">📎${(a.files || []).length ? ` ${a.files.length}` : ''}</button><button class="btn ghost sm" data-battrm="${i}" data-k="${k}" title="이 서류 빼기">✕</button></span>`).join('')}<button class="btn ghost sm" data-baddatt="${i}">+ 서류</button></div>
      ${b.items.some(a => (a.files || []).length) ? `<div class="small muted" style="margin-top:4px">${b.items.flatMap((a, k) => (a.files || []).map((rel, fi) => `<span class="pd-file">📄 ${esc(a.name || '첨부')} · ${esc(rel.split('/').pop())}<button class="lnk" data-battdel="${i}" data-k="${k}" data-fi="${fi}" title="목록에서 빼기 (파일은 폴더에 남음)">빼기</button></span>`)).join('')}</div>` : ''}`;
  const pdBlock = (b, i, no) => {
    const bar = `<div class="pd-bar" contenteditable="false"><span class="muted">${PM_BLOCK[b.type]}</span><select data-blvl="${i}" title="1. 번호 항목 / 번호 없이 / 안쪽(앞 항목 안의 가. 나. 같은 하위 항목)"><option value="num" ${b.num && !b.sub ? 'selected' : ''}>1. 번호</option><option value="plain" ${!b.num && !b.sub ? 'selected' : ''}>번호 없음</option><option value="sub" ${b.sub ? 'selected' : ''}>안쪽 (하위)</option></select><button class="btn ghost sm" data-bmove="${i}" data-d="-1" title="위로">▲</button><button class="btn ghost sm" data-bmove="${i}" data-d="1" title="아래로">▼</button><button class="btn ghost sm danger" data-bdel="${i}" title="이 항목 삭제">✕</button></div>`;
    const showT = (b.num && !b.sub) || b.annex;   // 제목은 번호 붙는 항목(과 별첨)만 — 번호 없는·안쪽 항목은 내용만
    const title = showT && (b.type !== 'text' || b.title) ? pdEd(i, 'title', b.type === 'text' ? '제목' : `제목 (예: ${b.type === 'table' ? '세부내역' : b.type === 'attach' ? '첨부서류' : '참고 그림'})`, esc(b.title || '')) : '';
    let main = '';
    const lead = b.num && !b.sub && !b.annex && !b.title;
    if (b.type === 'text') main = pdEd(i, 'text', lead ? '첫 줄은 굵게 제목처럼 인쇄됩니다. Enter 로 다음 줄 · Tab 으로 들여쓰기 (가. 나. 다. ※ …)' : '내용 (Tab 으로 들여쓰기)', pdLines(String(b.text || '').replace(/\n+$/, ''), true).replace(/^<div><br><\/div>$/, ''), lead ? ' lead' : '');
    if (b.type === 'table') main = `${pdEd(i, 'unit', '표 위 오른쪽 글 (예: (단위: 원 / VAT 포함))', esc(b.unit || ''))}${pdTable(b, i)}${pdEd(i, 'note', '표 아래 메모 (없으면 비워 두기)', b.note ? pdLines(b.note) : '')}
        <div class="pd-tools"><label><input type="checkbox" data-b="${i}" data-f="sum" ${b.sum ? 'checked' : ''}> 합계 줄 자동</label>
          ${pmCmpVendors(b).length ? `<button class="btn ghost sm" data-bgrpadd="${i}">+ 비교 업체</button>` : ''}
          ${b.cols.some(c => /수량/.test(c)) && !/판매내역/.test(b.title || '') ? `<button class="btn ghost sm" data-basset="${i}" title="이 표의 품목을 자산·집기 대장에 등록">📦 자산 대장에 등록</button>` : ''}
          ${it.tpl === 'opencard' ? `<button class="btn ghost sm" data-bcard="${i}" data-each="">💳 카드 내역 불러오기 (구분별)</button><button class="btn ghost sm" data-bcard="${i}" data-each="1">💳 한 건씩</button>` : ''}
          <span class="muted">칸에서 오른쪽 클릭 = 행·열 추가/삭제 · Tab = 다음 칸 · 엑셀 표를 칸에 붙여넣기 가능</span></div>`;
    if (b.type === 'attach') main = pdAttach(b, i) + pdEd(i, 'note', '첨부서류 아래 메모 (예: 후첨 사유)', b.note ? pdLines(b.note) : '');
    if (b.type === 'image') main = `${b.rel ? `<img data-bpreview="${i}" style="width:${b.width || 100}%;max-width:100%;display:block">` : ''}
        <div class="${b.rel ? 'pd-tools' : 'pd-tools on'}"><button class="btn sm" data-bimg="${i}">${b.rel ? '그림 바꾸기' : '그림 넣기 (사진·캡처)'}</button><label>너비 <select data-b="${i}" data-f="width">${[100, 80, 60, 50, 40].map(w => `<option ${+b.width === w ? 'selected' : ''} value="${w}">${w}%</option>`).join('')}</select></label><span class="muted">Ctrl+V 로 캡처 붙여넣기도 됨</span></div>`;
    return `<div class="pd-blk pd-${b.type}${b.sub ? ' pd-sub' : ''}${b.annex ? ' pd-annex' : ''}" data-blk="${i}">${bar}<span class="pd-no">${b.annex ? '<span class="pd-annex-tag">별첨</span>' : no}</span><div class="pd-main">${title}${main}</div></div>`;
  };
  const docHtml = () => {
    let n = 0;
    return `<div class="pd-toolbar"><button class="btn sm" data-pdbold title="굵게 (Ctrl+B)"><b>B</b></button><span class="pd-sep"></span>
        ${Object.entries(PM_BLOCK).map(([k, l]) => `<button class="btn sm" data-badd="${k}" title="커서가 있는 항목 아래에 넣음">+ ${k === 'text' ? '항목(글)' : l}</button>`).join('')}
        <span class="muted small">인쇄 모양 그대로 클릭해서 쓰세요 · 번호는 자동</span></div>
      <div class="pd-page">${B.map((b, i) => pdBlock(b, i, b.num && !b.sub && !b.annex ? `${++n}.` : '')).join('') || '<div class="muted" style="padding:20px;text-align:center">위 [+ 항목(글)] [+ 표] 로 내용을 넣으세요</div>'}</div>`;
  };
  // 문서 보기 글칸 → 글 (줄 = div/br, 굵게 = **…**)
  const pdRead = el => {
    let out = '';
    const walk = (nd, bold) => {
      if (nd.nodeType === 3) { const t = nd.nodeValue.replace(/ /g, ' '); out += bold && t.trim() ? `**${t}**` : t; return; }
      if (nd.nodeType !== 1) return;
      if (nd.tagName === 'BR') { out += '\n'; return; }
      const blk = /^(DIV|P|LI|H\d)$/.test(nd.tagName), b = bold || /^(B|STRONG)$/.test(nd.tagName) || /bold|[6-9]00/.test(nd.style && nd.style.fontWeight || '');
      if (blk && out && !out.endsWith('\n')) out += '\n';
      nd.childNodes.forEach(c => walk(c, b));
      if (blk && !out.endsWith('\n')) out += '\n';
    };
    el.childNodes.forEach(c => walk(c, false));
    return out.replace(/\*\*\*\*/g, '').replace(/\n$/, '');
  };
  function readDoc(r) {
    r.querySelectorAll('[data-db][data-df]').forEach(el => { const b = B[+el.dataset.db], f = el.dataset.df; if (!b) return; b[f] = f === 'text' ? pdRead(el) : f === 'note' ? pmPlain(pdRead(el)) : el.textContent.replace(/\s+/g, ' ').trim(); });
    r.querySelectorAll('[data-db][data-dh]').forEach(el => { B[+el.dataset.db].cols[+el.dataset.dh] = el.textContent.trim(); });
    r.querySelectorAll('[data-db][data-dg]').forEach(el => { const i = +el.dataset.db, g = el.textContent.trim(); el.dataset.dg.split(',').forEach(j => { const s = r.querySelector(`[data-db="${i}"][data-ds="${j}"]`); B[i].cols[+j] = `${g}|${s ? s.textContent.trim() : ''}`; }); });
    r.querySelectorAll('td[data-db][data-r]').forEach(el => { const t = B[+el.dataset.db]; (t.rows[+el.dataset.r] = t.rows[+el.dataset.r] || [])[+el.dataset.c] = el.textContent.trim(); });
  }
  const body = `<div class="pm-ed">
      <div id="pmAiWarn">${pmAiWarnHtml(warns)}</div>
      <section class="pm-ed-sec"><h4>기본 정보<span class="grow"></span><button class="btn ghost sm" id="pmAiBtn" title="메모·견적서를 넣어 지금 내용을 AI 초안으로 다시 채움">✨ AI로 다시 쓰기</button></h4>
      <div class="form-grid pm-ed-g3">
        <label class="pm-ed-title">제목<input data-pf="title" value="${esc(it.title)}" placeholder="예) 미화 용품 및 소모품 구입의 건(9차)"></label>
        ${f('업체명', 'vendor')}
      </div>
      <div class="form-grid pm-ed-g4" style="margin-top:10px">
        ${f('기안일자', 'date', 'date')}${f('시행기간', 'period', 'text', 'data-rng="text" autocomplete="off" placeholder="예) 2026.08.16.~2026.08.31."')}
        <label>결제방법<select data-pf="payMethod">${['계좌이체', '법인카드', '전도금', '현금', '기타'].map(x => `<option ${x === it.payMethod ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
        ${f('결제일', 'payDate', 'text', 'placeholder="비우면 \'자금집행일\'"')}
        <label title="대장·지출결의서에 쓰는 금액. 비우면 첫 표의 금회·금액 합계"><span class="pm-lab">품의 금액 <span class="muted">(비우면 표 합계)</span></span><input data-pf="amount" class="num" value="${fmt0(it.amount)}"></label>
        <label>청구여부<select data-pf="claim">${['가능', '불가', '청구'].map(x => `<option ${x === it.claim ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
        <label>번호<input data-pf="no" value="${esc(it.no)}" class="num"></label>
        ${f('기안번호', 'docNo')}
        ${it.tpl === 'opencard' ? `${f('카드 사용 시작일', 'useFrom', 'date')}${f('카드 사용 종료일', 'useTo', 'date')}<label><span class="pm-lab">카드 <span class="muted">(쉼표, 비우면 전체)</span></span><input data-pf="useCards" value="${esc((it.useCards || []).join(', '))}" placeholder="예) 0889, 9192"></label>` : ''}
      </div>
      <details class="pm-ed-more"${it.firstNo || (it.budget && it.budget !== '-') || it.noExpense || it.noAttPrint || it.noCardPrint || it.expNote ? ' open' : ''}><summary>더보기 <span class="muted">최초 기안번호 · 예산심의한도 · 지출결의서 비고 · 첨부${it.tpl === 'opencard' ? '·카드 내역' : ''} 인쇄</span></summary>
        <div class="form-grid pm-ed-g4" style="margin-top:8px">
          ${f('최초 기안번호 <span class="muted">(연속 품의)</span>', 'firstNo', 'text', 'placeholder="예) YS-○○현장2512-24"')}
          ${f('예산심의한도', 'budget', 'text', 'placeholder="예) 예산 심의 전"')}
          <label style="grid-column:span 2" title="같이 인쇄되는 지출결의서의 비고 칸 (줄마다 같은 글). 비우면 빈칸"><span class="pm-lab">지출결의서 비고 <span class="muted">(비우면 빈칸)</span></span><input data-pf="expNote" value="${esc(it.expNote || '')}" placeholder="예) 기안품의서 YS-○○현장2512-24 참고"></label>
        </div>
        <div class="pm-ed-opts">
          <label><input type="checkbox" data-pf-x="noExpense" ${it.noExpense ? '' : 'checked'}> 지출결의서 같이 올림 <span class="muted">(바로 지급 → 손익 반영 · 끄면 월결제 등으로 지급)</span></label>
          <label><input type="checkbox" data-pf-x="noAttPrint" ${it.noAttPrint ? '' : 'checked'}> 첨부서류 파일 같이 인쇄 (📎)</label>
          ${it.tpl === 'opencard' ? `<label><input type="checkbox" data-pf-x="noCardPrint" ${it.noCardPrint ? '' : 'checked'}> 사용기간의 법인카드 사용내역 같이 인쇄 <span class="muted">(지출결의서 뒤, 카드마다 한 장)</span></label>` : ''}</div></details></section>
      ${pmUrgentFields(it, 'pf')}
      <section class="pm-ed-sec pm-ed-body"><h4>본문</h4>
      <div id="pmBlocks">${docHtml()}</div></section></div>`;
  const root = modal(`기안품의서 ${it.no}번`, body, [
    { label: '취소' },
    { label: '미리보기', onClick: async r => { collect(r); await pmPrintDoc(it, true); return true; } },
    { label: '저장', onClick: r => { collect(r); pmPut(it); save(); render(); pmFileSync(it.id); toast('저장했습니다.'); } },
    { label: '저장 후 인쇄', cls: 'primary', onClick: async r => { collect(r); pmPut(it); save(); render(); pmFileSync(it.id); if (await pmPrintDoc(it) === false) { toast('저장했습니다. 고친 뒤 다시 인쇄하세요.'); } } }]);
  modalSize(root, 'xl');
  function readBlocks(r) {
    readDoc(r);
    r.querySelectorAll('[data-b][data-f]').forEach(el => { const b = B[+el.dataset.b]; if (!b) return; const k = el.dataset.f; b[k] = el.type === 'checkbox' ? el.checked : k === 'width' ? +el.value : el.value; });
    r.querySelectorAll('[data-b][data-ai]').forEach(el => { B[+el.dataset.b].items[+el.dataset.ai].name = el.value.trim(); });
    r.querySelectorAll('[data-b][data-am]').forEach(el => { const a = B[+el.dataset.b].items[+el.dataset.am]; a.ok = el.value === '○'; if (a.ok || !el.value) delete a.st; else a.st = el.value; });
  }
  function collect(r) {
    r.querySelectorAll('[data-pf]').forEach(el => { const k = el.dataset.pf; it[k] = ['no', 'amount', 'prepaidAmt'].includes(k) ? toNum(el.value) : k === 'useCards' ? el.value.split(/[,\s]+/).map(x => x.replace(/\D/g, '').slice(-4)).filter(Boolean) : el.value; });
    r.querySelectorAll('[data-pf-x]').forEach(el => { const k = el.dataset.pfX; it[k] = k === 'noExpense' || k === 'noAttPrint' || k === 'noCardPrint' ? !el.checked : el.checked; });
    readBlocks(r);
  }
  const redraw = () => { root.querySelector('#pmBlocks').innerHTML = docHtml(); bind(); };
  const op = fn => () => { readBlocks(root); fn(); redraw(); };
  async function setImage(i, file) {
    if (!FS.ready || !file) return;
    try { B[i].rel = await storeFile(parts(DIR.pmImg), safeName(`${site().name}${it.no}_그림`), file); } catch (e) { toast('그림을 저장하지 못했습니다: ' + e.message); }
    redraw();
  }
  /* ---------- 문서 보기 동작 ---------- */
  function pdFocus(el) {   // 표 칸은 글자 전체 선택 (바로 덮어쓰기), 글칸은 끝으로
    if (!el) return; el.focus();
    const rg = document.createRange(), s = getSelection(); rg.selectNodeContents(el); if (!/^T[DH]$/.test(el.tagName)) rg.collapse(false);
    s.removeAllRanges(); s.addRange(rg);
  }
  const pdGrid = text => { const L = text.replace(/\r/g, '').split('\n'); while (L.length && !L[L.length - 1].trim()) L.pop(); return L.map(l => l.split('\t').map(v => v.trim())); };
  function pdMenuClose() { const m = document.getElementById('pdMenu'); if (m) m.remove(); document.removeEventListener('mousedown', pdMenuOut, true); }
  function pdMenuOut(e) { if (!(e.target.closest && e.target.closest('#pdMenu'))) pdMenuClose(); }
  function pdBind(q) {
    q('[data-pdbold]').forEach(b => { b.onmousedown = ev => ev.preventDefault(); b.onclick = () => document.execCommand('bold'); });
    q('.pd-tools [data-f="sum"], .pd-tools [data-f="width"]').forEach(el => el.onchange = op(() => { }));
    q('[data-blvl]').forEach(el => el.onchange = op(() => { const b = B[+el.dataset.blvl]; b.num = el.value === 'num'; b.sub = el.value === 'sub'; if (!b.sub) delete b.sub; }));
    q('[data-battrm]').forEach(b => b.onclick = op(() => B[+b.dataset.battrm].items.splice(+b.dataset.k, 1)));
    // 표 칸: 엑셀에서 복사한 표 → 그 칸부터 채움 (행·열 자동 추가) · 그냥 글은 서식 없이
    q('.pd-tbl [contenteditable]').forEach(c => c.onpaste = ev => {
      ev.preventDefault(); ev.stopPropagation();
      const text = (ev.clipboardData && ev.clipboardData.getData('text')) || '';
      if (c.tagName !== 'TD' || !/[\t\n]/.test(text.trim())) { document.execCommand('insertText', false, text.replace(/\s+/g, ' ').trim()); return; }
      readBlocks(root);
      const t = B[+c.dataset.db], grid = pdGrid(text), r0 = +c.dataset.r, c0 = +c.dataset.c;
      grid.forEach((cells, k) => cells.forEach((v, m) => {
        const cc = c0 + m, r = r0 + k;
        while (t.cols.length <= cc) { t.cols.push(''); t.rows.forEach(x => x.push('')); }
        while (t.rows.length <= r) t.rows.push(t.cols.map(() => ''));
        t.rows[r][cc] = v.replace(/^₩/, '');
      }));
      pmVatRecalc(t.rows); redraw(); toast(`표 ${grid.length}줄을 붙여넣었습니다.`);
    });
    // 글칸: 서식 없이 붙여넣기 · 글 칸에 엑셀 표를 붙여넣으면 바로 아래에 새 표 · 그림만 있으면 그림 붙여넣기(root.onpaste)로
    q('.pd-main > [data-df]').forEach(c => c.onpaste = ev => {
      const text = (ev.clipboardData && ev.clipboardData.getData('text')) || '';
      if (!text) return;
      ev.preventDefault(); ev.stopPropagation();
      if (c.dataset.df === 'text' && /\t/.test(text) && /\n/.test(text.trim())) {
        readBlocks(root);
        const grid = pdGrid(text), nb = pmNewBlock('table'), n = Math.max(...grid.map(r => r.length));
        nb.cols = grid[0].concat(Array(n - grid[0].length).fill(''));
        nb.rows = grid.slice(1).map(r => nb.cols.map((x, j) => (r[j] || '').replace(/^₩/, ''))); if (!nb.rows.length) nb.rows = [nb.cols.map(() => '')];
        curB = +c.dataset.db + 1; B.splice(curB, 0, nb); redraw(); toast('엑셀 표를 새 표로 넣었습니다.'); return;
      }
      document.execCommand('insertText', false, /^(text|note)$/.test(c.dataset.df) ? text.replace(/\r/g, '') : text.replace(/\s+/g, ' ').trim());
    });
  }
  root.addEventListener('focusin', ev => { const bk = ev.target.closest && ev.target.closest('[data-blk]'); if (bk) curB = +bk.dataset.blk; });
  root.addEventListener('input', ev => {   // 문서 보기 표: 수량 × 단가 → 금액 (비교 업체는 업체별), 합계(자동) 줄 다시 계산
    const td = ev.target.closest && ev.target.closest('td[data-db][data-r]'); if (!td) return;
    const i = +td.dataset.db, b = B[i]; if (!b) return;
    const cols = b.cols, tr = td.closest('tr'), cell = j => tr.querySelector(`[data-c="${j}"]`);
    const qj = cols.findIndex(c => /수량/.test(c) && !c.includes('|')), c0 = cols[+td.dataset.c] || '';
    if (qj >= 0 && /수량|단가/.test(c0)) cols.forEach((c, j) => {
      if (!/단가/.test(c) || (/단가/.test(c0) && j !== +td.dataset.c)) return;
      const k = cols.indexOf(c.replace('단가', '금액')); if (k < 0 || !cell(k)) return;
      const qv = cell(qj).textContent.trim(), pv = cell(j).textContent.trim();
      if (qv && pv) cell(k).textContent = fmt(Math.round(toNum(qv) * toNum(pv)));
    });
    const tds = [...root.querySelectorAll(`td[data-db="${i}"][data-r]`)], grid = [];   // 계·부가세·합계 줄 다시 계산 (고치는 칸은 건드리지 않음)
    tds.forEach(x => { (grid[+x.dataset.r] = grid[+x.dataset.r] || [])[+x.dataset.c] = x.textContent.trim(); });
    if (pmVatAuto(grid)) {
      pmVatRecalc(grid, grid[+td.dataset.r]);
      tds.forEach(x => { const v = grid[+x.dataset.r][+x.dataset.c]; if (x !== td && x.textContent.trim() !== v) x.textContent = v; });
    }
    root.querySelectorAll(`tfoot[data-sum="${i}"] td[data-sj]`).forEach(f => { const j = f.dataset.sj; if (j !== '') f.textContent = fmt0(sum([...root.querySelectorAll(`td[data-db="${i}"][data-r][data-c="${j}"]`)], x => toNum(x.textContent))); });
  });
  root.addEventListener('keydown', ev => {   // 표 칸: Tab = 다음 칸 (마지막 칸이면 새 줄), Enter = 아래 칸 (마지막 줄이면 새 줄)
    if (ev.key === 'Tab' && !ev.isComposing && ev.target.matches && ev.target.matches('[data-df="text"],[data-df="note"]')) {   // 글칸 Tab = 들여쓰기 (인쇄도 그대로)
      ev.preventDefault();
      if (!ev.shiftKey) { document.execCommand('insertText', false, '    '); return; }
      const s = getSelection(), nd = s.anchorNode, m = nd && nd.nodeType === 3 && nd.nodeValue.match(/^[  ]{1,4}/);   // Shift+Tab = 줄 앞 칸 빼기
      if (m) { const off = s.anchorOffset; nd.nodeValue = nd.nodeValue.slice(m[0].length); const rg = document.createRange(); rg.setStart(nd, Math.max(0, off - m[0].length)); s.removeAllRanges(); s.addRange(rg); }
      return;
    }
    const one = ev.target.matches && ev.target.matches('[data-df="title"],[data-df="unit"]');
    if (one && ev.key === 'Enter' && !ev.isComposing) {   // 한 줄 칸: Enter = 다음 칸으로
      ev.preventDefault();
      const eds = [...root.querySelectorAll('.pd-page [contenteditable="true"]')]; pdFocus(eds[eds.indexOf(ev.target) + 1]); return;
    }
    const td = ev.target.closest && ev.target.closest('.pd-tbl [contenteditable]');
    if (!td || (ev.key !== 'Tab' && ev.key !== 'Enter') || ev.isComposing) return;
    ev.preventDefault();
    const cells = [...td.closest('table').querySelectorAll('[contenteditable="true"]')], k = cells.indexOf(td), i = +td.dataset.db;
    const addRow = col => { readBlocks(root); const t = B[i]; t.rows.push(t.cols.map(() => '')); redraw(); pdFocus(root.querySelector(`td[data-db="${i}"][data-r="${t.rows.length - 1}"][data-c="${col}"]`)); };
    if (ev.key === 'Enter') {
      if (td.tagName !== 'TD') { pdFocus(cells.find(c => c.tagName === 'TD')); return; }
      const nx = td.closest('tr').nextElementSibling;
      if (nx) pdFocus(nx.querySelector(`[data-c="${td.dataset.c}"]`)); else addRow(td.dataset.c);
      return;
    }
    const to = cells[k + (ev.shiftKey ? -1 : 1)];
    if (to) pdFocus(to); else if (!ev.shiftKey) addRow(0);
  });
  root.addEventListener('contextmenu', ev => {   // 표 칸 오른쪽 클릭 → 행·열 추가/삭제
    const c = ev.target.closest && ev.target.closest('.pd-tbl [data-db]'); if (!c) return;
    ev.preventDefault(); readBlocks(root); pdMenuClose();
    const i = +c.dataset.db, t = B[i], r = c.dataset.r !== undefined ? +c.dataset.r : -1, j = +(c.dataset.c !== undefined ? c.dataset.c : c.dataset.dh);
    const blank = () => t.cols.map(() => '');
    const acts = [
      r >= 0 && ['위에 행 추가', () => t.rows.splice(r, 0, blank())],
      [r >= 0 ? '아래에 행 추가' : '맨 위에 행 추가', () => t.rows.splice(r + 1, 0, blank())],
      r >= 0 && ['행 삭제', () => { t.rows.splice(r, 1); if (!t.rows.length) t.rows.push(blank()); }],
      ['왼쪽에 열 추가', () => { t.cols.splice(j, 0, '새 열'); t.rows.forEach(x => x.splice(j, 0, '')); }],
      ['오른쪽에 열 추가', () => { t.cols.splice(j + 1, 0, '새 열'); t.rows.forEach(x => x.splice(j + 1, 0, '')); }],
      t.cols.length > 1 && !c.dataset.dg && ['이 열 삭제', () => { t.cols.splice(j, 1); t.rows.forEach(x => x.splice(j, 1)); }],
      c.dataset.dg && !/^확정/.test(String(t.cols[j]).split('|')[0]) && ['이 업체 칸 빼기 (단가·금액)', () => pmCmpDel(t, String(t.cols[j]).split('|')[0])],
      r >= 0 && pmVatAuto(t.rows) && !PM_TOT_LAB.test(pmRowLab(t.rows[r])) && [pmNoVat(t.rows[r]) ? '이 줄 부가세 있음으로 되돌리기' : '이 줄 부가세 없음 (면세 등)', () => pmVatToggle(t, r)],
    ].filter(Boolean);
    const m = document.createElement('div'); m.className = 'pd-menu'; m.id = 'pdMenu';
    m.innerHTML = acts.map(([l], k) => `<button type="button" data-k="${k}"${/삭제/.test(l) ? ' class="danger"' : ''}>${l}</button>`).join('');
    document.body.appendChild(m);
    m.style.left = Math.max(4, Math.min(ev.clientX, innerWidth - m.offsetWidth - 8)) + 'px'; m.style.top = Math.max(4, Math.min(ev.clientY, innerHeight - m.offsetHeight - 8)) + 'px';
    m.onclick = e => { const b = e.target.closest('[data-k]'); if (!b) return; acts[+b.dataset.k][1](); pmVatRecalc(t.rows); pdMenuClose(); redraw(); };
    document.addEventListener('mousedown', pdMenuOut, true);
  });
  function bind() {
    const q = s => root.querySelectorAll(s);
    q('[data-badd]').forEach(b => b.onclick = () => {   // 문서 보기: 커서가 있는 항목 바로 아래에 넣고 커서를 옮김
      readBlocks(root);
      const nb = pmNewBlock(b.dataset.badd);
      if (curB >= 0 && curB < B.length) B.splice(++curB, 0, nb); else { B.push(nb); curB = B.length - 1; }
      redraw(); pdFocus(root.querySelector(`[data-blk="${curB}"] [contenteditable="true"]`));
    });
    pdBind(q);
    q('[data-bdel]').forEach(b => b.onclick = op(() => B.splice(+b.dataset.bdel, 1)));
    q('[data-bmove]').forEach(b => b.onclick = op(() => { const i = +b.dataset.bmove, j = i + +b.dataset.d; if (j >= 0 && j < B.length) [B[i], B[j]] = [B[j], B[i]]; }));
    q('[data-bgrpadd]').forEach(b => b.onclick = op(() => pmCmpAdd(B[+b.dataset.bgrpadd])));
    q('[data-bcard]').forEach(b => b.onclick = () => {   // 오픈기간 법인카드: 사용기간·카드의 카드 내역 → 이 표
      collect(root);
      if (!it.useFrom) { toast('먼저 위에 "카드 사용 시작일"(과 종료일)을 넣으세요.'); return; }
      const n = pmFillCard(it, [B[+b.dataset.bcard]], !!b.dataset.each);
      if (!n) { toast('그 기간·카드의 법인카드 사용내역이 없습니다. 법인카드 탭에 카드 엑셀을 먼저 가져오세요.'); return; }
      redraw(); toast(`카드 사용내역 ${n}건 (${fmt(sum(pmCardTx(it), t => t.amount))}원)으로 표를 채웠습니다.`);
    });
    q('[data-basset]').forEach(b => b.onclick = () => {   // 12c 자산 대장: 품의를 저장한 뒤 등록 창 (작성 창은 닫힘)
      collect(root);
      const rows = assetRowsFromTable(B[+b.dataset.basset], it.vendor, it);
      if (!rows.length) { toast('표에 품목(품명·구분)과 수량이 있는 줄이 없습니다.'); return; }
      pmPut(it); save(); render();
      assetPasteDialog(rows, assetKindOf(it), pmFind(it.id) ? pmFind(it.id).x : it);
      toast('품의서를 저장했습니다. 자산 대장에 넣을 품목을 확인하세요.');
    });
    q('[data-baddatt]').forEach(b => b.onclick = op(() => B[+b.dataset.baddatt].items.push({ name: '', ok: true })));
    q('[data-battadd]').forEach(b => b.onclick = async () => {   // 첨부서류 파일 올리기 → A. 기안품의/첨부
      readBlocks(root);
      const a = B[+b.dataset.battadd].items[+b.dataset.k]; if (!a || !FS.ready) return;
      const files = await pickFile('image/*,.pdf', true); if (!files.length) return;
      a.files = a.files || []; let n = 0;
      try { for (const f of files) { a.files.push(await storeFile(parts(`${DIR.pm}/첨부`), safeName(`${site().name}${it.no}_${a.name || '첨부'}`), f)); n++; } }
      catch (e) { toast('첨부를 저장하지 못했습니다: ' + e.message); }
      if (n) { a.ok = true; toast(`${a.name || '첨부'} 파일 ${n}개 올림 (인쇄할 때 품의서 뒤에 같이 인쇄)`); }
      redraw();
    });
    q('[data-battdel]').forEach(b => b.onclick = op(() => { const a = B[+b.dataset.battdel].items[+b.dataset.k]; if (a && a.files) { a.files.splice(+b.dataset.fi, 1); if (!a.files.length) delete a.files; } }));
    q('[data-bimg]').forEach(b => b.onclick = async () => { readBlocks(root); const [file] = await pickFile('image/*', false); await setImage(+b.dataset.bimg, file); });
    q('[data-bpreview]').forEach(async img => { try { img.src = (await fileURL(B[+img.dataset.bpreview].rel)).url; } catch (e) { } });
    // 그림 블록: 모달이 열려 있을 때 Ctrl+V 이미지 → 마지막(또는 비어 있는) 그림 블록에
    root.onpaste = ev => {
      const file = [...(ev.clipboardData || {}).items || []].find(x => x.kind === 'file' && /^image\//.test(x.type));
      if (!file) return;
      const i = B.findIndex(b => b.type === 'image' && !b.rel) >= 0 ? B.findIndex(b => b.type === 'image' && !b.rel) : B.map(b => b.type).lastIndexOf('image');
      ev.preventDefault(); ev.stopPropagation(); readBlocks(root);
      if (i < 0) { B.push(pmNewBlock('image')); setImage(B.length - 1, file.getAsFile()); } else setImage(i, file.getAsFile());
    };
  }
  bind();
  root.querySelector('#pmAiBtn').onclick = () => {   // AI 초안 → it·B 를 고친 뒤 위쪽 칸과 블록을 다시 그림
    collect(root);
    pmAiDialog(it, warns => {
      root.querySelectorAll('[data-pf]').forEach(el => { const k = el.dataset.pf; if (['title', 'vendor', 'period', 'payDate', 'payMethod'].includes(k)) el.value = it[k] ?? ''; });
      root.querySelector('#pmAiWarn').innerHTML = pmAiWarnHtml(warns);
      redraw();
    });
  };
  const noEl = root.querySelector('[data-pf=no]'), dtEl = root.querySelector('[data-pf=date]'), dnEl = root.querySelector('[data-pf=docNo]');
  const sync = () => { if (dnEl.value === '' || /-\d+$/.test(dnEl.value) && dnEl.dataset.auto !== '0') dnEl.value = pmDocNo(toNum(noEl.value), dtEl.value); };
  dnEl.oninput = () => { dnEl.dataset.auto = '0'; };
  noEl.onchange = sync; dtEl.onchange = sync;
}

/* ---------- AI 품의서 초안 (03 aiAsk) ----------
 * 메모 + 견적서·계약서(사진·PDF) + 이 현장 지난 품의서(본보기) → 제목·본문·세부내역 표·첨부서류 이름
 * 금액·날짜·업체는 메모/서류에 있는 것만 (지어내지 않음). 넣은 파일은 첨부서류(📎)에 바로 등록 */
const PM_AI_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['tpl', 'title', 'vendor', 'period', 'payMethod', 'payDate', 'body', 'table', 'attachments', 'warnings'],
  properties: {
    tpl: { type: 'string', enum: ['', ...PM_TPL.filter(t => !t.hidden).map(t => t.id)], description: '가장 맞는 양식 id (양식 고르기 요청이 없으면 빈 문자열)' },
    title: { type: 'string', description: '품의 제목. "~의 건"으로 끝남' },
    vendor: { type: 'string', description: '업체명 (확정 업체 하나, 모르면 빈 문자열)' },
    period: { type: 'string', description: '시행기간 예) 2026.12.01.~PJT 종료 시, 모르면 빈 문자열' },
    payMethod: { type: 'string', enum: ['', '계좌이체', '법인카드', '전도금', '현금', '기타'] },
    payDate: { type: 'string', description: '결제일 예) 매월 25일, 모르면 빈 문자열' },
    body: { type: 'string', description: '본문. 줄마다 \\n 으로 구분' },
    table: {
      type: 'object', additionalProperties: false, required: ['cols', 'rows', 'unit', 'note'],
      properties: {
        cols: { type: 'array', items: { type: 'string' } },
        rows: { type: 'array', items: { type: 'array', items: { type: 'string' } } },
        unit: { type: 'string', description: '표 위 오른쪽 글 예) (단위: 원 / VAT 포함)' },
        note: { type: 'string', description: '표 아래 메모 (업체 선정 사유 등), 없으면 빈 문자열' },
      },
    },
    attachments: { type: 'array', items: { type: 'string' }, description: '넣은 파일 순서대로 각 파일의 서류 이름 예) 견적서(○○상사)' },
    warnings: { type: 'array', items: { type: 'string' }, description: '작성자가 확인하거나 보완할 것' },
  },
};
/* AI 작성 지침 (고정 · 요금 절약용): 회사 샘플(품의서 01·03·05·07·11·15·22·31·33)에서 뽑은 문체·항목 순서·첨부서류.
 * 매번 지난 품의서를 통째로 보내는 대신 이 짧은 지침을 system 으로 보냄 (캐시됨). 지난 품의서 본보기는 체크할 때만. */
const PM_AI_GUIDE = `당신은 분양대행사 (주)유성 현장의 경리 담당자로, 회사 "기안품의서" 초안을 씁니다. 결과는 JSON 형식으로만.

[문체]
- 본문 첫 줄: "{현장명} 현장 {내용}에 관하여(관해/관련하여) 아래와 같이 품의합니다."
- 다음 줄부터 "가. 항목 : 값", "나. …", "다. …" (보통 2~5줄). 끝에 "※ …" 줄로 변동 가능성·참고 (예: "※ 현장 상황에 따라 일정 변동 가능성 있음.").
- 공문체, 짧게: ~함 / ~예정 / ~조건임 / ~가능성 있음. 꾸밈말·인사말 없음.
- 날짜는 2025.12.22.(월) 형식, 기간은 2025.10.27.~2026.04.26.(6개월) 또는 "~ PJT 종료 시". 금액은 1,250,000 (쉼표 정수).
- 제목은 "~의 건" (예: 현장 초기 세팅의 건, 미화 용품 및 소모품 구입의 건, 주유업체 선정 및 영업팀 유류비 지원의 건). 회차가 있으면 끝에 (2차).
- 업체가 여럿이면 업체명 칸에 쉼표로 (예: 동해유통, 리레코, 코파스).
- 결제방법은 계좌이체 또는 법인카드. 결제일은 "매월 25일"(월 결제), "자금집행일"(일시 지급), "매월 10일"(인건비), 또는 날짜.

[양식별 본문 항목 — 샘플 그대로의 순서]
- 업체 섭외·구입·렌탈(vendor): 가. 목적(구입 사유) / 나. 업체명 / 다. 이용(렌탈) 기간 / 라. 입고·설치일자. 세부내역 표 아래에 "-. 단가 변동 가능성 …", "-. 구입 품목 리스트 세부내역 별첨." 같은 줄. 업체 선정 사유 필수(최저가·위치·대응 용이 등). 첨부: 견적서, (신규 업체) 사업자등록증·통장사본, 비교견적서.
- 임차(lease, 숙소·사무실·홍보관): 가. 사용인원(용도) / 나. 소재지(호실, 총 n개 호실) / 다. 계약일자 / 라. 임차기간. 기타 ※ 줄: 계약 조건(중도퇴실·연장), 관리비 포함 여부, 보증금·첫 달 임차료 입금 요청 등. 표: 호실별 보증금·임차료 + 중개수수료(부동산). 첨부: 임대차계약서, 중개대상물확인설명서, 건축물대장, 등기사항전부증명서, 임대인 사업자등록증·통장사본, 중개업소 사업자등록증·통장사본·공제증서, 중개수수료 세금계산서.
- 채용·영업팀 단가(hire): 가. 채용인원(총 n명) : 이름 / 나. 근무지 / 다. 근무기간 : 0000.00.00.(예정)~당 PJT 종료 시. 단가 품의면 가. 최초 출근일자 / 나. 채용인력(직종_업체). ※ 석식 : 야근 시에 한해 제공함. ※ 출퇴근 관리 프로그램(오션) 기준으로 출근일자 산정 후 인건비 결제일에 지급 예정. 첨부: 이력서(사람), 견적서(업체).
- 오픈기간 법인카드(opencard): 가. 사용기간 : 0000.00.00.~0000.00.00.(00/00 오픈) / 나. 간식(상담사, TM, 도우미, 탕비실 간식 포함) 및 필요비품 구입. 결제방법 법인카드, 결제일 "-". 첨부: 영수증.
- 시행 후에 올리는 품의면 본문 끝에 "※ 후품의사유 : …". 시행사 부담 비용이면 "당사 선집행 후 청구 예정" 문장과 청구여부 가능.

[세부내역 표]
- 열은 내용에 맞게: 구입·렌탈 = 구분 | 규격 | 수량 | 단위 | 단가 | 금액 | 비고, 임차 = 구분 | 호실(소재지) | 업체명(임대인) | 수량(개월) | 단가 | 금액 | 비고, 인력 = 직종 | 업체명 | 지급형태 | 급여단가 | 식대 | 예정 인원 | 비고.
- 견적서가 2곳 이상이면 비교견적: 구분 | 규격 | 수량 | 단위 | 업체A|단가 | 업체A|금액 | 업체B|단가 | 업체B|금액 | … | 확정(확정업체)|단가 | 확정(확정업체)|금액 | 비고 ("이름|단가" 처럼 | 로 두 줄 머리글). 확정 = 메모에서 정한 곳, 없으면 합계 최저가. 표아래 "※ 업체 선정 사유 : …", vendor = 확정 업체.
- 계·합계 줄은 넣지 않음(프로그램이 붙임). 부가세가 따로면 "부가세" 줄. 각 줄의 칸 수 = 열 수.
- unit: 견적 금액이 부가세 포함이면 "(단위: 원 / VAT 포함)", 별도면 "(단위: 원 / VAT 별도)", 모르면 "" (비우면 VAT 포함으로 들어감).

[반드시]
- 금액·수량·날짜·업체명·소재지·이름은 메모나 첨부 서류에 있는 것만. 없으면 ○○ 또는 빈칸 — 절대 지어내지 않음.
- 메모에 없는 칸은 "지금 내용"이 있으면 살리고, 없으면 "".
- attachments: 첨부한 파일 순서대로 각 서류 이름 (예: 견적서(○○상사), 임대차계약서). 파일이 없으면 [].
- warnings: 경영지원팀이 지적할 것만 짧게 — 비교견적 3곳 미만, 업체 선정 사유 없음, 시행기간·결제일 없음, 신규 업체 사업자등록증·통장사본, 흐려서 확실하지 않은 금액(어느 칸), 메모와 서류 금액이 다름, 시행 후 품의(후품의 사유). 없으면 [].
- tpl: 요청에 "양식 고르기"가 있을 때만 hire / vendor / lease / opencard 중 맞는 것, 아니면 "".`;
function pmAiExamples(it) {   // (체크할 때만) 같은 양식의 지난 품의서 1건 → 이 현장 말투 본보기
  const all = pmAll().filter(p => p.id !== it.id && p.kind === 'general' && pmBlocks(p).some(b => b.type === 'text' && String(b.text || '').trim()));
  const same = all.filter(p => p.tpl && p.tpl === it.tpl);
  const pick = (same.length ? same : all).sort((a, b) => toNum(b.no) - toNum(a.no)).slice(0, 1);
  return pick.map(p => ({ 제목: p.title, 업체명: p.vendor || '', 시행기간: p.period || '', 블록: pmBlocks(p).map(b => b.type === 'text' ? { 본문: String(b.text || '').slice(0, 1500) } : b.type === 'table' ? { 표: { 열: b.cols, 줄: (b.rows || []).slice(0, 8), 표아래: b.note || '' } } : b.type === 'attach' ? { 첨부서류: (b.items || []).map(a => a.name).filter(Boolean) } : null).filter(Boolean) }));
}
function pmAiPrompt(it, memo, files, examples) {
  const s = site(), S = s.fullName || s.name, tp = pmTpl(it.tpl);
  const B = pmBlocks(it), tb = B.find(b => b.type === 'table' && b.title !== '신규업체 등록사항'), tx = B.find(b => b.type === 'text');
  // 요금 절약: 새 품의(양식 기본값뿐)는 "지금 내용"을 보내지 않음, 다시 쓰기는 사람이 고친 칸만 짧게
  const now = it.aiPickTpl ? null : Object.fromEntries(Object.entries({ 양식: tp ? tp.label : '', 제목: it.title, 업체명: it.vendor, 시행기간: it.period, 결제방법: it.payMethod, 결제일: it.payDate, 본문: tx && tx.text, 표: tb && (tb.rows || []).some(r => r.some(v => String(v ?? '').trim())) ? { 열: tb.cols, 줄: tb.rows.filter(r => r.some(v => String(v ?? '').trim())) } : null }).filter(([, v]) => v && String(v).trim()));
  return `현장명: ${S}${it.aiPickTpl ? '\n양식 고르기: 예' : ''}
${files.length ? `첨부 파일: ${files.map((f, i) => `${i + 1}. ${f.name}`).join(' / ')}\n` : ''}
[메모]
${memo || '(메모 없음 — 첨부 서류만 보고 작성)'}
${now && Object.keys(now).length ? `\n[지금 내용]\n${JSON.stringify(now)}\n` : ''}${examples.length ? `\n[이 현장 지난 품의서 — 말투 본보기]\n${JSON.stringify(examples)}\n` : ''}`;
}
// 서류 없이 메모만이면 Haiku (글쓰기는 충분 · 요금 약 1/5), 견적서를 읽을 때만 설정의 모델(기본 Opus)
const pmAiModel = files => files.length ? aiCfg.model : 'claude-haiku-5-5';
/* 새 품의서 → [✨ AI로 작성]: AI 가 양식까지 고른 뒤 작성 창을 채워서 엶 */
function pmAiNew() {
  if (!FS.ready) return;
  const it = pmNew(); it.aiPickTpl = true;
  pmAiDialog(it, warns => pmEditor(it, warns));
}
function pmAiDialog(it, onDone) {
  if (!aiCfg.key) { toast('설정 화면의 "Claude API 키"를 먼저 넣으세요 (영수증 AI 인식과 같은 키).'); return; }
  let files = [];
  const ov = document.createElement('div'); ov.className = 'modal-bg'; ov.style.zIndex = '2000';
  ov.innerHTML = `<div class="modal" style="max-width:720px"><h3>✨ AI 품의서 초안</h3><div class="mbody">
      <div class="banner warn small" style="margin-bottom:10px">⚠ <b>AI는 초안 작성을 돕는 보조 기능입니다. 결재 올리기 전에 내용을 반드시 직접 확인하고 고쳐 주세요.</b><br>금액·날짜·업체명이 틀릴 수 있으니 견적서 등 원본 서류와 꼭 대조해 주세요.</div>
      <label class="small muted" for="pmAiMemo">무엇을, 왜, 얼마에, 언제부터 — 생각나는 대로 적으세요</label>
      <textarea id="pmAiMemo" rows="6" style="width:100%;box-sizing:border-box;font:inherit;font-size:14px;line-height:1.5;padding:8px 10px;border:1px solid var(--line);border-radius:6px;margin-top:4px" placeholder="예) ○○현장 숙소 2호실 추가 임차. 보증금 500만, 월세 60만, 부동산 수수료 30만. 12월 1일부터 PJT 종료까지. 임대인 김○○&#10;예) 사무용 의자 10개 구입. 견적 3곳 받음, 제일 싼 곳으로">${esc(it.aiMemo || '')}</textarea>
      <div class="row small" style="gap:8px;margin-top:10px;flex-wrap:wrap"><button class="btn sm" id="pmAiAdd">📎 견적서·계약서 넣기 (사진·PDF)</button><span id="pmAiFiles" class="muted">넣은 서류 없음</span></div>
      <label class="small" style="display:flex;gap:6px;align-items:center;margin-top:10px"><input type="checkbox" id="pmAiEx"> 이 현장 지난 품의서 1건도 본보기로 보냄 <span class="muted">(회사 샘플 지침은 늘 적용 · 체크하면 요금 조금 더)</span></label>
      <p class="small muted" style="margin:10px 0 0">지금 작성 창의 제목·본문·세부내역 표가 초안으로 바뀝니다 (저장하기 전까지는 [취소]로 되돌릴 수 있음). 주민번호·계좌번호는 적지 마세요. 요금: 메모만 = 저렴한 모델(Haiku), 서류를 넣으면 정확한 모델로 서류 한 장(PDF는 앞 3쪽까지)마다 영수증 인식 정도가 더 듭니다.</p>
    </div><div class="actions"><button class="btn" id="pmAiCancel">취소</button><button class="btn primary" id="pmAiGo">초안 만들기</button></div></div>`;
  document.body.appendChild(ov);
  const q = s => ov.querySelector(s), showFiles = () => { q('#pmAiFiles').innerHTML = files.length ? files.map((f, i) => `<span class="badge" style="margin-right:4px">${esc(f.name)} <button class="lnk" data-rm="${i}">빼기</button></span>`).join('') : '넣은 서류 없음'; ov.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { files.splice(+b.dataset.rm, 1); showFiles(); }); };
  q('#pmAiMemo').focus();
  q('#pmAiCancel').onclick = () => ov.remove();
  q('#pmAiAdd').onclick = async () => { const fs = await pickFile('image/*,.pdf', true); files.push(...fs); showFiles(); };
  ov.addEventListener('paste', ev => { const fs = [...(ev.clipboardData || {}).items || []].filter(x => x.kind === 'file').map(x => x.getAsFile()).filter(Boolean); if (fs.length) { ev.preventDefault(); files.push(...fs); showFiles(); } });
  q('#pmAiGo').onclick = async () => {
    const memo = q('#pmAiMemo').value.trim();
    if (!memo && !files.length) { toast('메모를 적거나 서류를 넣으세요.'); return; }
    const go = q('#pmAiGo'); go.disabled = true; go.textContent = '만드는 중… (10~40초)';
    try {
      const parts = []; for (const f of files) parts.push(...await aiFileParts(f));
      const ex = q('#pmAiEx').checked ? pmAiExamples(it) : [];
      const out = await aiAsk([...parts, { type: 'text', text: pmAiPrompt(it, memo, files, ex) }], PM_AI_SCHEMA, { maxTokens: 3000, effort: 'low', model: pmAiModel(files), system: PM_AI_GUIDE });
      if (it.aiPickTpl) {   // 새 품의: AI 가 고른 양식의 기본 구조(첨부서류 목록·결제일·결재 후 반영)로 바꾼 뒤 채움
        const tp = pmTpl(out.tpl);
        if (tp) { const keep = { id: it.id, no: it.no, date: it.date, docNo: it.docNo }; Object.assign(it, pmFromTpl(tp), keep); }
        delete it.aiPickTpl;
      }
      it.aiMemo = memo;
      const n = await pmAiApply(it, out, files);
      ov.remove();
      onDone((out.warnings || []).map(w => String(w).trim()).filter(Boolean));
      toast(`AI 초안을 넣었습니다${n ? ` · 서류 ${n}개를 첨부서류에 등록` : ''}. 결재 올리기 전에 내용을 직접 확인해 주세요.`);
    } catch (e) { toast('AI 초안을 만들지 못했습니다: ' + e.message); go.disabled = false; go.textContent = '초안 만들기'; }
  };
}
async function pmAiApply(it, out, files) {   // AI 결과 → it (블록 배열은 그대로 두고 안을 고침 — 작성 창이 같은 배열을 씀)
  const B = it.blocks, str = v => String(v ?? '').trim();
  ['title', 'vendor', 'period', 'payDate'].forEach(k => { if (str(out[k])) it[k] = str(out[k]); });
  if (str(out.payMethod)) it.payMethod = out.payMethod;
  if (str(out.body)) { let tx = B.find(b => b.type === 'text'); if (!tx) { tx = pmNewBlock('text'); tx.num = true; B.unshift(tx); } tx.text = String(out.body).replace(/\r/g, '').trim(); }
  const t = out.table || {}, cols = (t.cols || []).map(str);
  if (cols.length) {
    let tb = B.find(b => b.type === 'table' && b.title !== '신규업체 등록사항');
    if (!tb) { const at = B.findIndex(b => b.type === 'attach'); tb = { type: 'table', num: true, unit: PM_UNIT_DEF, title: '세부내역', cols: [], rows: [], sum: true, note: '' }; B.splice(at < 0 ? B.length : at, 0, tb); }
    tb.cols = cols;
    tb.rows = (t.rows || []).map(r => cols.map((c, j) => str((r || [])[j]))).filter(r => r.some(Boolean)).filter(r => !/^(계|소계|합계|합\s*계|총계)$/.test(r[0]));
    if (!tb.rows.length) tb.rows.push(cols.map(() => ''));
    tb.sum = true; tb.unit = str(t.unit) || PM_UNIT_DEF; if (str(t.note)) tb.note = str(t.note);
  }
  if (!files.length || !FS.ready) return 0;
  let at = B.find(b => b.type === 'attach');
  if (!at) { at = { type: 'attach', num: true, title: '첨부서류', items: [] }; B.push(at); }
  let n = 0;
  for (let i = 0; i < files.length; i++) {
    const name = str((out.attachments || [])[i]) || files[i].name.replace(/\.[^.]+$/, '');
    const base = name.replace(/\(.*\)$/, '').trim();
    let a = at.items.find(x => !(x.files || []).length && x.name && (x.name === name || x.name === base || base.startsWith(x.name)));
    if (!a) { a = at.items.find(x => !x.name); if (a) a.name = name; else at.items.push(a = { name, ok: true }); }
    try { (a.files = a.files || []).push(await storeFile(parts(`${DIR.pm}/첨부`), safeName(`${site().name}${it.no}_${name}`), files[i])); a.ok = true; n++; }
    catch (e) { toast('첨부를 저장하지 못했습니다: ' + e.message); }
  }
  if (!at.items.some(x => !x.name)) at.items.push({ name: '', ok: false });
  return n;
}

/* ---------- 에메트(임차 집기 업체) 렌탈 견적서 엑셀 → 사무집기 임차 품의서 (AI 없이 바로) ----------
 * 견적서 모양(늘 같음): "품 목 | 규격 | 기간 | 수량 | 단가 | 금액 | 사양/OPTION" 머리글 아래
 * "[3개월연장 26-08-11~26-11-10]" 같은 기간 줄 → 품목 줄들 … "총 액" 줄, 아래쪽 "* 설치 장소 : …"
 * 단가 = 기간 전체 단가 (금액 = 수량 × 단가), 금액은 VAT 별도 → 표 끝에 계·부가세·합계 */
function pmEmetRead(wb) {
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' }).map(r => r.map(v => String(v ?? '').replace(/\s+/g, ' ').trim()));
  const flat = rows.map(r => r.join(' ')).join('\n');
  if (!/EMET|에메트/i.test(flat)) return null;
  const nsp = v => v.replace(/\s/g, '');
  const hi = rows.findIndex(r => r.some(v => nsp(v) === '품목') && r.some(v => nsp(v) === '금액'));
  if (hi < 0) return null;
  const col = re => rows[hi].findIndex(v => re.test(nsp(v)));
  const C = { name: col(/^품목$/), spec: col(/^규격$/), mon: col(/^기간$/), qty: col(/^수량$/), price: col(/^단가$/), amt: col(/^금액$/), opt: col(/사양|OPTION/i) };
  const ymd = (y, m, d) => `${y.length === 2 ? '20' + y : y}.${pad2(m)}.${pad2(d)}.`;
  const groups = []; let g = null, total = 0;
  for (let i = hi + 1; i < rows.length; i++) {
    const r = rows[i], name = r[C.name] || '';
    if (/^총액$/.test(nsp(name)) || /^총액$/.test(nsp(r[0] || ''))) { total = toNum(r[C.amt]) || toNum(r.filter(Boolean).pop()); break; }
    if (/^\[.*\]$/.test(name)) {   // 기간 줄
      const m = name.match(/(\d{2,4})[-.\/](\d{1,2})[-.\/](\d{1,2})\s*~\s*(\d{2,4})[-.\/](\d{1,2})[-.\/](\d{1,2})/);
      groups.push(g = { label: name.replace(/^\[\s*|\s*\]$/g, ''), from: m ? ymd(m[1], m[2], m[3]) : '', to: m ? ymd(m[4], m[5], m[6]) : '', items: [] });
      continue;
    }
    if (!name && !r[C.spec] && !r[C.qty] && !r[C.amt]) continue;
    if (!g) groups.push(g = { label: '', from: '', to: '', items: [] });
    g.items.push({ name, spec: r[C.spec] || '', mon: r[C.mon] || '', qty: r[C.qty] || '', price: r[C.price] || '', amt: r[C.amt] || '', opt: C.opt >= 0 ? (r[C.opt] || '').replace(/^\*\s*/, '') : '' });
  }
  const after = rows.slice(hi);   // 아래쪽 "* 항목 : 값" 줄 (왼쪽 칸만)
  const field = re => { const r = rows.find(x => re.test(nsp(x[0] || ''))); return r ? r.slice(1).find(v => v && v !== ':') || '' : ''; };
  const dateRow = after.find(x => /일\/시간/.test(nsp(x[0] || '')));
  const qd = (flat.match(/견적일자[^\n]*?(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/) || []);
  return {
    groups: groups.filter(x => x.items.length), total,
    months: field(/^사용기간$/), place: field(/설치장소/), dateLabel: dateRow ? nsp(dateRow[0]).replace(/^\*|\/시간$/g, '') : '', dateVal: dateRow ? dateRow.slice(1).find(v => v && v !== ':') || '' : '',
    quoteDate: qd[1] ? ymd(qd[1], qd[2], qd[3]) : '',
    ext: /연장/.test(wb.SheetNames[0] + ' ' + groups.map(x => x.label).join(' ')),
  };
}
async function pmEmetNew() {
  if (!FS.ready) return;
  const [file] = await pickFile('.xlsb,.xlsx,.xls', false); if (!file) return;
  let q; try { q = pmEmetRead(XLSX.read(await file.arrayBuffer(), { type: 'array' })); } catch (e) { toast('엑셀을 읽지 못했습니다: ' + e.message); return; }
  if (!q || !q.groups.length) { toast('에메트 렌탈 견적서 모양이 아닙니다 (품목·금액 머리글을 찾지 못함).'); return; }
  const s = site(), S = s.fullName || s.name, tp = pmTpl('rent');
  // 지난 에메트 품의 → 회차(n차)·최초 기안번호 이어감
  const prev = pmAll().filter(p => p.kind === 'general' && (/에메트|EMET/i.test(p.vendor || '') || p.tpl === 'rent' || /사무집기\s*임차/.test(p.title || ''))).sort((a, b) => toNum(b.no) - toNum(a.no))[0];
  const round = prev ? (+((String(prev.title || '').match(/\((\d+)차\)/) || [])[1] || 1)) + 1 : 0;
  const it = pmFromTpl(tp, { title: `사무집기 임차의 건${round ? `(${round}차)` : ''}`, vendor: '에메트', payMethod: '계좌이체', payDate: '자금집행일', claim: '불가' });
  if (prev) it.firstNo = prev.firstNo || prev.docNo || '';
  const G = q.groups, md = d => d ? d.slice(5, 10).replace(/^0/, '').replace('.0', '.').replace('.', '/') : '';
  const months = String(q.months).replace(/\D/g, '') || G.map(x => x.items.find(i => i.mon)?.mon).find(Boolean) || '';
  // 회사 샘플(영종128 사무집기 임차(6차)) 모양: 가. 기간 = 가장 먼저 시작하는 기간(n개월) + 기간이 여럿이면 "외", 시작일이 지났으면 ※ 후품의 사유
  const first = G.filter(x => x.from).sort((a, b) => a.from < b.from ? -1 : 1)[0];
  const multi = new Set(G.map(x => x.from + x.to)).size > 1;
  it.period = first ? `${first.from}~${first.to}${months ? `(${months}개월)` : ''}${multi ? '외' : ''}` : '';
  const late = first && first.from.replace(/\./g, '') < it.date.replace(/-/g, '');
  const body = [`${S} 현장 사무집기 ${q.ext ? '임차기간 연장' : '임차'}에 관해 아래와 같이 품의합니다`, `가. 기간 : ${it.period}`];
  if (!q.ext && q.dateVal) body.push(`나. 입고일 : ${q.dateVal}`);
  if (late) body.push('※ 후품의 사유 : ');
  const B = it.blocks; B.find(b => b.type === 'text').text = body.join('\n');
  // 세부내역: No. | 구분(기간) | 품명 | 규격 | 기간 | 수량 | 에메트 단가·금액 | 비고 → 계·부가세·합계 (구분·품명 빈 칸은 인쇄 때 위 칸과 합침)
  const rows = [], ship = []; let supply = 0, no = 0, last = '';
  G.forEach(x => {
    x.items.filter(i => { if (/배송|설치|회수/.test(i.name)) { ship.push(i); return false; } return true; }).forEach((i, k) => {
      const amt = toNum(i.amt); supply += amt;
      const name = i.name || (k ? '' : last); last = i.name || last;   // 기간 첫 줄 품명이 비면 앞 품명을 채움 (위 기간과 합쳐지지 않게)
      rows.push([String(++no), k ? '' : (x.from ? `${md(x.from)}~${md(x.to)}` : x.label), name, i.spec || '-', i.mon, i.qty, i.price || (amt ? '' : '-'), i.amt || '-', i.opt]);
    });
  });
  ship.forEach(i => { supply += toNum(i.amt); rows.push([String(++no), i.name, '', i.spec, i.mon, i.qty, i.price || '-', i.amt || '-', i.opt]); });   // 배송/설치/회수 (보통 무상 "-")
  const vat = Math.floor(supply / 10), tot = (l, v) => [l, '', '', '', '', '', '', fmt(v), ''];
  rows.push(tot('계', supply), tot('부가세', vat), tot('합계', supply + vat));
  const tb = B.find(b => b.type === 'table');
  Object.assign(tb, { title: '세부내역', cols: ['No.', '구분', '품명', '규격', '기간', '수량', '에메트|단가', '에메트|금액', '비고'], rows, merge: [1, 2], sum: true, unit: '', note: '' });
  const at = B.find(b => b.type === 'attach');
  at.items = q.ext ? [{ name: '견적서', ok: true }, { name: '집기 임차 현황표', ok: false }, { name: '', ok: false }] : at.items;
  const qa = at.items.find(a => a.name === '견적서') || at.items[0];
  try { (qa.files = qa.files || []).push(await storeFile(parts(`${DIR.pm}/첨부`), safeName(`${s.name}${it.no}_견적서(에메트)${(file.name.match(/\.[^.]+$/) || [''])[0]}`), file)); qa.ok = true; }
  catch (e) { toast('견적서 첨부를 저장하지 못했습니다: ' + e.message); }
  const warns = [];
  if (q.total && q.total !== supply) warns.push(`견적서 총액 ${fmt(q.total)}원과 품목 금액 합 ${fmt(supply)}원이 다릅니다 — 표를 확인하세요.`);
  if (late) warns.push(`시작일(${first.from})이 기안일보다 앞섭니다 — 본문 "※ 후품의 사유"를 적으세요.`);
  if (q.ext) warns.push('연장 품의 — 집기 임차 현황표를 첨부하면 ○ 표시하세요.');
  if (!prev) warns.push('이 현장 첫 에메트 품의 — 신규 업체면 사업자등록증·통장사본도 첨부하세요.');
  pmEditor(it, warns);
  toast(`에메트 견적서로 품의서를 채웠습니다 · 품목 ${G.reduce((a, x) => a + x.items.length, 0)}줄, 공급가 ${fmt(supply)}원 + 부가세 ${fmt(vat)}원.`);
}

/* 다음 회차: (9차)→(10차), (7월분)→(8월분), 최초 기안번호 이어감 */
function pmNextRound(src) {
  if (src.org) return orgNext(src);   // 조직 지급: 같은 종류 다음 차수 창 (판매내역은 새로 붙여넣기, 14b)
  const bump = pmBump;
  const copy = JSON.parse(JSON.stringify(src)); copy.blocks = JSON.parse(JSON.stringify(pmBlocks(src)));
  const it = pmNew({ ...copy, id: uid(), no: pmNextNo(), date: todayStr(), status: '작성중', scans: [], title: bump(src.title), firstNo: src.firstNo || src.docNo, prevId: src.id });
  delete it._ym; delete it.body; delete it.detail; delete it.attach; delete it.detailNote;
  ['urgent', 'dueDate', 'paid', 'prepaidBy', 'prepaidAmt', 'prepaidDone', 'linkedAt', 'useFrom', 'useTo', 'lateReason', 'reportLine', 'xlFile'].forEach(k => delete it[k]);   // 긴급·선지급·반영 표시·엑셀 파일(pmEnsureXl)은 새 회차에 넘기지 않음
  it.docNo = pmDocNo(it.no, it.date);
  it.blocks.forEach(b => { if (b.type === 'table') b.cols = b.cols.map(c => c.replace(/\(금회\)/, '')); if (b.type === 'attach') (b.items || []).forEach(a => { delete a.files; }); });   // 다음 회차: 📎 첨부 파일은 새로
  pmEditor(it);
  toast('지난 품의를 복사했습니다. 표에 이번 회차 열·금액을 넣고 저장하세요.');
}

/* 인쇄 (그림 블록 주소를 먼저 준비) */
async function pmPrintDoc(it, preview) {
  if (!preview) { const w = pmPrintWarns(it); if (w.length && !confirm(`인쇄 전에 확인하세요 (경영지원 기준):\n- ${w.join('\n- ')}\n\n그래도 인쇄할까요?`)) return false; }
  const urls = {};
  for (const b of pmBlocks(it)) if (b.type === 'image' && b.rel) { try { urls[b.rel] = (await fileURL(b.rel)).url; } catch (e) { } }
  const attPages = it.noAttPrint ? [] : await pmAttachPages(it);   // 📎 첨부서류 파일 → 맨 뒤 (기타 서류)
  // 회사 순서: 품의서 갑지 → 지출결의서 → 기타 서류(오픈기간 카드 사용내역 · 📎 첨부) · 지출결의서 비고 = 작성 창 "지출결의서 비고" (자동으로 채우지 않음)
  const html = docPumui(it, urls) + (it.noExpense ? '' : docExpense({ date: it.date || todayStr(), items: pmExpItems(it).map(x => ({ ...x, note: x.note || it.expNote || '' })), minRows: 4 })) + pmCardPages(it) + attPages.join('');
  if (preview) {   // 작성 창 위에 겹쳐 띄움 (닫으면 작성 창 그대로)
    const ov = document.createElement('div'); ov.className = 'modal-bg'; ov.style.zIndex = '2000';
    ov.innerHTML = `<div class="modal" style="max-width:880px"><h3>미리보기</h3><div class="mbody"><div class="pm-preview">${html}</div></div><div class="actions"><button class="btn primary">닫기 (작성 창으로)</button></div></div>`;
    ov.querySelector('.actions button').onclick = () => ov.remove(); document.body.appendChild(ov); return;
  }
  printDocs([html]);
}

/* 첨부서류 파일(사진·PDF 각 쪽)을 A4 한 장에 하나씩, 위에 "첨부 n. 서류 이름" */
async function pmAttachPages(it) {
  const list = pmBlocks(it).filter(b => b.type === 'attach').flatMap(b => (b.items || []).flatMap(a => (a.files || []).map(rel => ({ name: a.name || '첨부', rel }))));
  if (!list.length) return [];
  const pages = []; let miss = 0, k = 0;
  for (const x of list) {
    k++; if (list.length > 2) toast(`첨부 준비 중… ${k} / ${list.length}`);
    if (/\.(xls[xbm]?|csv)$/i.test(x.rel)) continue;   // 엑셀 첨부(에메트 견적서 등)는 보관만 — 품의서 뒤에 붙여 인쇄하지 않음 (회사 샘플: 갑지 한 장 + 첨부서류 ○ 표시)
    let canv = []; try { canv = await fileCanvases(await (await fileAt(`${site().folder}/${x.rel}`, false)).getFile()); } catch (e) { canv = []; }
    if (!canv.length) { miss++; continue; }
    for (let p = 0; p < canv.length; p++) {
      const url = await canvasURL(scaledCanvas(canv[p], 2000), 0.88);
      pages.push(`<div class="doc" style="font-family:'Malgun Gothic',sans-serif;color:#000"><div style="font-size:9pt;margin-bottom:2mm">첨부 ${k}. ${esc(x.name)}${canv.length > 1 ? ` (${p + 1}/${canv.length})` : ''}</div>
        <div style="display:flex;justify-content:center;align-items:flex-start"><img src="${url}" style="max-width:100%;max-height:255mm;object-fit:contain"></div></div>`);
    }
  }
  if (miss) toast(`첨부 파일 ${miss}개를 찾을 수 없어 빼고 인쇄합니다.`);
  return pages;
}
/* 인쇄: 기안품의서 — 회사 엑셀 양식(21칸 격자)을 그대로 옮김 */
function docPumui(it, urls = {}) {
  const s = site(), ap = (s.approvers || []).slice(0, 6);
  const apCols = apCols6(ap.length);   // 13: 결재 6칸을 결재자 수로 나눔 (자금청구서와 같음)
  const td = (cls, cs, rs, html) => `<td class="${cls}"${cs > 1 ? ` colspan="${cs}"` : ''}${rs > 1 ? ` rowspan="${rs}"` : ''}>${html}</td>`;
  const L = (txt, cs, rs) => td('pf-l', cs, rs, txt), V = (txt, cs, rs, c = '') => td('pf-v ' + c, cs, rs, txt);
  const head = `<table class="pf-grid"><colgroup>${'<col style="width:4.7619%">'.repeat(21)}</colgroup>
      <tr class="r-title"><td colspan="4" class="pf-logo"><img src="lib/yusung_logo.jpg" alt=""></td><td colspan="17" class="pf-title">기 안 품 의 서</td></tr>
      <tr class="r-h">${L('기안 번호', 2, 2)}${V(esc(it.docNo), 5, 2, 'b')}${L('최초<br>기안번호', 2, 2)}${V(esc(it.firstNo || ''), 5, 2, 'b')}<td rowspan="6" class="pf-gyeol"><span>결</span><span>재</span></td>${ap.map((a, i) => td('pf-at', apCols[i], 1, esc(a.title))).join('')}</tr>
      <tr class="r-h">${ap.map((a, i) => td('pf-an', apCols[i], 1, esc(a.name))).join('')}</tr>
      <tr class="r-h">${L('프로젝트명', 2, 2)}${V(esc(s.fullName || s.name), 5, 2, 'b')}${L('실무책임자', 2, 2)}${V(`${esc(s.manager || '')} ${signHtml()}`, 5, 2, 'b')}${ap.map((a, i) => td('pf-sg' + (a.name ? '' : ' x'), apCols[i], 4, '')).join('')}</tr>
      <tr class="r-h"></tr>
      <tr class="r-h">${L('기안일자', 2, 2)}${V(esc(it.date || ''), 5, 2, 'b')}${L('시행기간', 2, 2)}${V(esc(it.period || ''), 5, 2, 'b')}</tr>
      <tr class="r-h"></tr>
      <tr class="r-b">${L('제목', 2)}${V(esc(it.title || ''), 13, 1, 'left b')}${ap.map((a, i) => td('pf-sg2', apCols[i], 2, '')).join('')}</tr>
      <tr class="r-b">${L('업체명', 2)}${V(esc(it.vendor || ''), 13, 1, 'left')}</tr>
      <tr class="r-b">${L('결제방법', 2)}${V(esc(it.payMethod || ''), 3)}${L('결제일', 2)}${V(esc(pmPayDateText(it)), 3)}${L('청구여부', 2)}${V(esc(it.claim || ''), 4)}${L('예산심의한도', 2)}${V(esc(it.budget || '-'), 3)}</tr>
    </table>`;
  let n = 0;
  const secHead = (b, html) => `<div class="pf-sec"><span class="pf-no">${b.num ? `${++n}.` : ''}</span><span>${html}</span></div>`;
  const lineDivs = arr => arr.filter(l => l.trim()).map(l => `<div class="pf-line">${esc(l).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')}</div>`).join('');
  const tableHtml = b => {
    const cols = (b.cols || []).map(c => String(c || ''));
    if (!cols.length) return '';
    const two = cols.some(c => c.includes('|'));
    const isNum = j => /금액|지급액|단가|합계|누계|청구|수량|\d+월|\d+차|계(?!약)|요금|금회/.test(cols[j]);   // 계약일자·계약자는 숫자 칸 아님
    // 두 줄 머리글: 같은 윗칸(업체명 등)이 이어지면 하나로 합침 · "확정" 칸은 굵게 테두리
    const grp = c => (c.includes('|') ? c.split('|')[0] : null), pick = j => /^확정/.test(grp(cols[j]) || '');
    const h1 = cols.map((c, j) => { const [a, x] = c.split('|');
      if (!two) return `<th>${esc(a)}</th>`;
      if (x === undefined) return `<th rowspan="2">${esc(a)}</th>`;
      if (j > 0 && grp(cols[j - 1]) === a) return '';
      let n = 1; while (grp(cols[j + n] || '') === a) n++;
      return `<th colspan="${n}"${pick(j) ? ' class="pick"' : ''}>${esc(a)}</th>`; }).join('');
    const h2 = two ? cols.map((c, j) => { const x = c.split('|')[1]; return x !== undefined ? `<th${pick(j) ? ' class="pick"' : ''}>${esc(x)}</th>` : ''; }).join('') : '';
    const firstNum = Math.max(1, cols.findIndex((c, j) => j > 0 && isNum(j) && !/수량|단위/.test(c)));
    const labSpan = (() => { const q = cols.findIndex((c, j) => j > 0 && /수량/.test(c)); return q > 0 ? q : firstNum; })();
    const cell = (v, j, sp = '') => { const t = String(v ?? '').trim(); const num = isNum(j) && /^-?[\d,.]+$/.test(t); return `<td${sp} class="${num ? 'num' : 'center'}${pick(j) ? ' pick' : ''}">${num ? fmt(toNum(t)) : esc(t)}</td>`; };
    const isTot = r => /^(계|소계|부가세|합계|합\s*계|총계|VAT)$/.test(String(r[0] || '').trim());
    const R = (b.rows || []).filter(r => r.some(v => String(v ?? '').trim()));
    // b.merge = [열 번호…] (에메트 견적 표의 구분·품명): 빈 칸은 위 칸과 세로로 합침 (왼쪽 열이 합쳐진 줄만), 아니면 왼쪽 칸과 가로로 합침 (예: 배송/설치/회수)
    const M = b.merge || [], rs = R.map(() => cols.map(() => 1)), cs = R.map(() => cols.map(() => 1)), hid = R.map(() => cols.map(() => ''));
    R.forEach((r, i) => {
      if (isTot(r)) return;
      let up = true;
      M.forEach(j => {
        if (String(r[j] ?? '').trim()) { up = false; return; }
        let k = i - 1; while (k >= 0 && hid[k][j] === 'r') k--;
        if (up && k >= 0 && !hid[k][j] && !isTot(R[k])) { rs[k][j]++; hid[i][j] = 'r'; return; }
        up = false;
        if (M.includes(j - 1)) { let l = j - 1; while (l > 0 && hid[i][l] === 'c') l--; if (!hid[i][l]) { cs[i][l]++; hid[i][j] = 'c'; } }
      });
    });
    const totSpan = M.length ? Math.max(labSpan, cols.findIndex(c => /금액/.test(c))) : labSpan;   // 합칠 표는 계·부가세·합계 글자를 금액 열 앞까지
    const body = R.map((r, i) => isTot(r)
      ? `<tr class="pf-tot"><td colspan="${totSpan}" class="center">${esc(r[0])}</td>${cols.slice(totSpan).map((c, k) => cell(r[totSpan + k], totSpan + k)).join('')}</tr>`
      : `<tr>${cols.map((c, j) => hid[i][j] ? '' : cell(r[j], j, `${rs[i][j] > 1 ? ` rowspan="${rs[i][j]}"` : ''}${cs[i][j] > 1 ? ` colspan="${cs[i][j]}"` : ''}`)).join('')}</tr>`).join('');
    const sumRow = b.sum && !(b.rows || []).some(r => /합계|합\s*계/.test(String(r[0] || '')))
      ? `<tr class="pf-tot"><td colspan="${labSpan}" class="center">합계</td>${cols.slice(labSpan).map((c, k) => { const j = labSpan + k; return isNum(j) && !/단가|수량|단위/.test(c) ? `<td class="num${pick(j) ? ' pick' : ''}">${fmt0(sum(b.rows || [], r => toNum(r[j])))}</td>` : `<td${pick(j) ? ' class="pick"' : ''}></td>`; }).join('')}</tr>` : '';
    return `<table class="pf-detail${cols.length > 9 ? ' wide' : ''}"><thead><tr>${h1}</tr>${two ? `<tr>${h2}</tr>` : ''}</thead><tbody>${body}${sumRow}</tbody></table>`;
  };
  const attachHtml = b => {
    const att = (b.items || []).filter(a => a.name);
    const rows = []; for (let i = 0; i < Math.max(1, att.length); i += 3) rows.push(att.slice(i, i + 3));
    return `<table class="pf-att"><colgroup>${[5, 1, 5, 1, 6, 1].map(w => `<col style="width:${(w / 19 * 100).toFixed(2)}%">`).join('')}</colgroup>
        <tr><th>구분</th><th>확인</th><th>구분</th><th>확인</th><th>구분</th><th>확인</th></tr>
        ${rows.map(r => `<tr>${[0, 1, 2].map(i => r[i] ? `<td>${esc(r[i].name)}</td><td>${esc(pmAttMark(r[i]))}</td>` : '<td></td><td></td>').join('')}</tr>`).join('')}</table>`;
  };
  // 블록 → 인쇄 html. 제목·번호는 번호 붙는 항목만 (번호 없는·안쪽 항목은 내용만)
  // b.sub = 안쪽(하위) 항목: 앞 항목 안으로 들여 씀 (가. 식당용 컨테이너 글 → 표 → 메모 → 나. …)
  const blockHtml = b => {
    const noteHtml = b.note ? `<div class="pf-note">${esc(b.note)}</div>` : '';
    const numd = b.num && !b.sub, t = numd ? b.title : '';
    if (b.type === 'text') {
      const lines = String(b.text || '').split('\n');
      if (t) return secHead(b, `<b>${esc(t)}</b>`) + lineDivs(lines);
      const first = lines.findIndex(l => l.trim());
      if (first < 0) return numd ? secHead(b, '') : '';
      return (numd ? secHead(b, `<b>${esc(lines[first])}</b>`) + lineDivs(lines.slice(first + 1)) : lineDivs(lines));
    }
    const title = numd ? secHead(b, t ? `<b>${esc(t)}</b>` : '') : '';
    if (b.type === 'table') return title + `<div class="pf-in">${b.unit ? `<div class="pf-unit">${esc(b.unit)}</div>` : ''}${tableHtml(b)}${noteHtml}</div>`;
    if (b.type === 'attach') return title + `<div class="pf-in">${attachHtml(b)}${noteHtml}</div>`;
    if (b.type === 'image') return title + (b.rel && urls[b.rel] ? `<div class="pf-in"><img src="${urls[b.rel]}" style="width:${b.width || 100}%;max-width:100%;display:block"></div>` : '');
    return '';
  };
  const wrap = b => (b.sub ? `<div class="pf-sub">${blockHtml(b)}</div>` : blockHtml(b));
  const all = pmBlocks(it), main = all.filter(b => !b.annex), annex = all.filter(b => b.annex);
  const bodyHtml = main.map(wrap).join('');
  const ex = pmExtraLines(it);
  // 별첨 블록: 품의서 다음 쪽부터 한 장씩 ("별첨1. 대비표")
  const annexHtml = annex.map((b, k) => `<div class="doc pf pf-annex"><div class="pf-annex-h">별첨${annex.length > 1 ? k + 1 : ''}. ${esc(b.title || PM_BLOCK[b.type])}</div>${blockHtml({ ...b, title: '', num: false, sub: false })}</div>`).join('');
  return `<div class="doc pf"><div class="pf-frame">${head}<div class="pf-body">${bodyHtml}${ex.length ? `<div class="pf-in">${ex.map(l => `<div class="pf-note">${esc(l)}</div>`).join('')}</div>` : ''}<div class="pf-in"><div class="pf-note">끝.</div></div></div></div></div>${annexHtml}`;
}
function pmExport() {
  const a = [[`${site().name}현장 품의서 대장`], ['번호', '기안번호', '최초 기안번호', '기안일자', '구분', '양식', '제목', '업체명', '결제방법', '결제일', '금액', '상태', '스캔본']];
  pmAll().sort((x, y) => toNum(x.no) - toNum(y.no)).forEach(p => a.push([p.no, p.docNo, p.firstNo || '', p.date, PM_KIND[p.kind] || '', (pmTpl(p.tpl) || {}).label || '', p.title, p.vendor || '', p.payMethod || '', p.payDate || '', pmAmount(p), p.status,
    (p.scans || []).map(x => x.split('/').pop()).join(', ')]));
  saveBook([['품의서 대장', sheet(a, [6, 22, 22, 11, 16, 14, 44, 20, 10, 10, 13, 9, 40])]], `${site().name}현장 품의서 대장.xlsx`);
}
