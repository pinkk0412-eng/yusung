'use strict';
/* ---------- 자산·집기·소모품 대장 (1단계) + 철수 회수 리스트 ----------
 * site.assets = [{ id, kind('구입'·'임차'·'소모품'), name, spec, vendor, qty, price, round(차수, 소모품), inDate, outDate, place(배치 장소),
 *                  status('사용'·'반납'·'회수'·'회수불가'), reason, pmNo(품의 번호), photos:[rel], memo }]   (현장설정.txt 에 같이 저장)
 * 출력: ① 집기 임차 현황표(품의 91 형식) ② 소모품 차수별 단가표(품의 90 형식, 같은 품명을 차수 열로) ③ 철수 회수 리스트
 * 품의 작성 창 표 → [📦 자산 대장에 등록] (15 pmEditor) */
const ASSET_KINDS = ['구입', '임차', '소모품'];
const ASSET_ST = ['사용', '반납', '회수', '회수불가'];
const ASSET_DIR = 'D. 기타(휴가계 등)/자산·집기 사진';
const assetsOf = (s = site()) => (s.assets = Array.isArray(s.assets) ? s.assets : []);
const assetAmt = a => toNum(a.qty) * toNum(a.price);
const assetDot = d => (d ? String(d).slice(2).replace(/-/g, '.') : '');
/* 품의서 연동: a.pmId(품의 id) — 예전 자료·붙여넣기는 pmNo(번호)로 찾음 · 품의 대장에 "자산 N" 표시, ⋯ → 자산 대장에 등록 */
const assetPmOpts = () => pmAll().filter(p => p.kind === 'general' || p.kind === 'excel').sort((a, b) => toNum(b.no) - toNum(a.no));
const assetPm = a => (a.pmId ? pmAll().find(p => p.id === a.pmId) : a.pmNo ? pmAll().find(p => String(p.no) === String(a.pmNo) && (p.kind === 'general' || p.kind === 'excel')) : null) || null;
const pmAssets = p => assetsOf().filter(a => a.pmId === p.id || (!a.pmId && a.pmNo && String(a.pmNo) === String(p.no)) || (a.hist || []).some(h => h.pmId === p.id));   // 연장 이력의 품의도 포함
const assetPmSelect = (id, cur) => `<select id="${id}"><option value="">— 없음 —</option>${assetPmOpts().map(p => `<option value="${p.id}" ${p.id === cur ? 'selected' : ''}>${esc(`${p.no}. ${String(p.title || '').slice(0, 34)} · ${p.status}`)}</option>`).join('')}</select>`;
const assetSetPm = (a, pid) => { const p = pmAll().find(x => x.id === pid); if (p) { a.pmId = p.id; a.pmNo = String(p.no); } else { delete a.pmId; delete a.pmNo; } };
const assetKindOf = p => (/임차|렌탈|대여/.test(p.title || '') ? '임차' : /소모품|미화|비품|용품/.test(p.title || '') ? '소모품' : '구입');
function pmAssetRows(p) {   // 품의서 표(수량 열 있는 표 · 엑셀 품의는 읽어 둔 세부내역 표) → 자산 행
  const tbs = [...pmBlocks(p).filter(b => b.type === 'table'), ...(p.xlTable ? [p.xlTable] : [])].filter(b => (b.cols || []).some(c => /수량/.test(c)) && !/판매내역/.test(b.title || ''));
  return tbs.flatMap(b => assetRowsFromTable(b, p.vendor, p));
}
function pmAssetDialog(p) {
  const rows = pmAssetRows(p);
  if (!rows.length) { toast(p.kind === 'excel' ? '엑셀 품의서에서 수량이 있는 세부내역 표를 읽지 못했습니다. [엑셀·스캔본 다시 읽기] 뒤 다시 해 보거나, 자산·집기 탭에서 직접 넣으세요.' : '이 품의서 표에 품목·수량이 있는 줄이 없습니다.'); return; }
  assetPasteDialog(rows, assetKindOf(p), p);
}
function assetDialog(a0) {
  const a = a0 || { kind: '구입', status: '사용', inDate: todayStr() };
  const f = (id, label, v, extra = '') => `<label>${label}<input id="${id}" value="${esc(v ?? '')}" ${extra}></label>`;
  const r = modal(a0 ? `자산 — ${a.name || ''}` : '자산·집기 추가', `<div class="form-grid">
      <label>종류<select id="asK">${ASSET_KINDS.map(k => `<option ${k === a.kind ? 'selected' : ''}>${k}</option>`).join('')}</select></label>
      ${f('asN', '품명', a.name)}${f('asS', '규격', a.spec)}${f('asV', '업체', a.vendor)}
      ${f('asQ', '수량', fmt0(a.qty), 'class="num"')}${f('asP', '단가', fmt0(a.price), 'class="num"')}
      ${f('asR', '차수 (소모품)', a.round || '', 'class="num" placeholder="예) 6"')}<label>품의서${assetPmSelect('asPm', (assetPm(a) || {}).id)}</label>
      <label style="grid-column:span 2">기간 (입고일 ~ 반납일)<input readonly data-rng="one" data-a="asI" data-b="asO" data-la="입고일" data-lb="반납일" data-none="반납 전" value="${esc(rngShow(a.inDate, a.outDate, '반납 전'))}" placeholder="눌러서 입고일 → 반납일 선택"></label>
      <input type="hidden" id="asI" value="${esc(a.inDate || '')}"><input type="hidden" id="asO" value="${esc(a.outDate || '')}">
      ${f('asL', '배치 장소', a.place, 'placeholder="예) 홍보관 1층 상담석"')}
      <label>상태<select id="asSt">${ASSET_ST.map(k => `<option ${k === (a.status || '사용') ? 'selected' : ''}>${k}</option>`).join('')}</select></label>
      <label style="grid-column:span 2">회수불가 사유 · 메모<input id="asM" value="${esc(a.reason || a.memo || '')}" placeholder="예) 소모 · 파손 · 시행사 인계"></label>
    </div>
    ${(a.hist || []).length > 1 ? `<div class="small" style="margin-top:10px"><b>기간 이력</b> <span class="muted">(연장 ${a.hist.length - 1}회)</span><div class="muted">${a.hist.map((h, i) => `${i + 1}차 ${assetDot(h.from)} ~ ${assetDot(h.to)} · ${fmt0(h.qty)}개${h.pmNo ? ` · 품의 ${esc(h.pmNo)}번` : ''}`).join('<br>')}</div></div>` : ''}
    <div style="margin-top:10px"><div class="row small" style="gap:8px;align-items:center"><b>증빙 사진</b><button class="btn sm" id="asPhoto">📷 사진 추가</button><span class="muted">구입·임차 집기는 사진으로 증빙 · 여러 장 가능 · Ctrl+V 로 붙여넣기 · 사진을 누르면 크게</span></div>
      <div id="asPhs" style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px"></div></div>`, [
    ...(a0 ? [{ label: '삭제', cls: 'danger', onClick: () => { if (!confirm(`${a.name || '이 자산'}을(를) 대장에서 삭제할까요?`)) return true; const l = assetsOf(); l.splice(l.indexOf(a0), 1); save(); render(); } }] : []),
    { label: '취소' },
    { label: a0 ? '저장' : '추가', cls: 'primary', onClick: root => {
      const v = id => $('#' + id, root).value.trim(), x = a0 || { id: uid(), photos: phs };
      Object.assign(x, { kind: v('asK'), name: v('asN'), spec: v('asS'), vendor: v('asV'), qty: toNum(v('asQ')), price: toNum(v('asP')), round: toNum(v('asR')) || '',
        inDate: v('asI'), outDate: v('asO'), place: v('asL'), status: v('asSt'), reason: v('asM') });
      delete x.memo; assetSetPm(x, v('asPm'));
      if (!x.name) { toast('품명을 넣으세요.'); return true; }
      if (!a0) assetsOf().push(x);
      save(); render(); toast(a0 ? '저장했습니다.' : `${x.name} 추가`);
    } }]);
  // 증빙 사진: 창을 다시 열지 않고 그 자리에서 작은 그림으로 (새 자산도 [추가] 전에 넣을 수 있음 — [추가] 때 같이 저장)
  const phs = a0 ? (a0.photos = a0.photos || []) : [], box = $('#asPhs', r);
  const drawPh = async () => {
    if (!phs.length) { box.innerHTML = `<span class="small ${['구입', '임차'].includes(a.kind) ? 'bad' : 'muted'}">등록한 사진 없음</span>`; return; }
    box.innerHTML = phs.map((p, i) => `<div style="position:relative;width:96px;height:96px;border:1px solid var(--line);border-radius:6px;overflow:hidden;background:#f4f4f4"><img data-asphv="${i}" alt="" style="width:100%;height:100%;object-fit:cover;cursor:zoom-in"><a href="#" data-asphdel="${i}" title="사진 빼기" style="position:absolute;top:2px;right:2px;background:#fff;border-radius:50%;width:20px;height:20px;line-height:20px;text-align:center;text-decoration:none">✕</a></div>`).join('');
    box.querySelectorAll('[data-asphdel]').forEach(el => el.onclick = ev => { ev.preventDefault(); if (!confirm('이 사진을 뺄까요? (파일은 폴더에 남음)')) return; phs.splice(+el.dataset.asphdel, 1); if (a0) save(); drawPh(); });
    for (const img of box.querySelectorAll('[data-asphv]')) {
      try { const u = (await fileURL(phs[+img.dataset.asphv])).url; img.src = u; img.onclick = () => window.open(u, '_blank'); } catch (e) { img.alt = '파일 없음'; img.title = phs[+img.dataset.asphv]; }
    }
  };
  const addPh = async files => {
    if (!FS.ready || !files.length) return;
    const nm = $('#asN', r).value.trim() || a.name || '자산';
    try { for (const file of files) phs.push(await storeFile(parts(ASSET_DIR), safeName(`${site().name}_${nm}`), file)); } catch (e) { toast('사진을 저장하지 못했습니다: ' + e.message); }
    if (a0) save(); drawPh(); toast(`사진 ${files.length}장을 추가했습니다${a0 ? '.' : ' — [추가]를 눌러야 대장에 저장됩니다.'}`);
  };
  $('#asPhoto', r).onclick = async () => addPh(await pickFile('image/*', true));
  state.assetPhAdd = addPh;   // 창이 열려 있을 때 Ctrl+V (어디서 눌러도) → 이 창에 (18 붙여넣기)
  drawPh();
}
/* 목록에서 줄을 눌러 두고 Ctrl+V, 또는 사진을 줄 위로 끌어다 놓기 → 그 자산에 바로 (영수증과 같은 방식, 18 init) */
async function assetAddPhotos(id, files) {
  const a = assetsOf().find(x => x.id === id); files = [...files].filter(f => /^image\//.test(f.type) || /\.(jpe?g|png|webp|heic|gif|bmp)$/i.test(f.name || ''));
  if (!a || !files.length || !FS.ready) return;
  a.photos = a.photos || [];
  try { for (const file of files) a.photos.push(await storeFile(parts(ASSET_DIR), safeName(`${site().name}_${a.name || '자산'}`), file)); } catch (e) { toast('사진을 저장하지 못했습니다: ' + e.message); }
  save(); render(); toast(`${a.name}${a.spec ? ` (${a.spec})` : ''}에 사진 ${files.length}장을 붙였습니다 · 지금 ${a.photos.length}장`);
}
/* 엑셀에서 복사해 붙여넣기 (머리글 줄이 있으면 열 이름으로) */
const ASSET_FIELDS = [['kind', /종류|구분/], ['name', /품명|품목|내역/], ['spec', /규격/], ['vendor', /업체|거래처/], ['qty', /수량/], ['price', /단가/], ['round', /차수/], ['inDate', /입고|구입일|시작/], ['outDate', /반납|종료/], ['place', /배치|장소|비고/], ['pmNo', /품의/]];
function assetPaste(text, kind0) {
  const lines = String(text || '').replace(/\r/g, '').split('\n').map(l => l.split('\t').map(x => x.trim())).filter(c => c.some(Boolean));
  if (!lines.length) return 0;
  let map = ['name', 'spec', 'vendor', 'qty', 'price', 'inDate', 'place'];
  if (lines[0].filter(h => h && ASSET_FIELDS.some(f => f[1].test(h)) && !/^[\d,.\-\/\s]+$/.test(h)).length >= 2) {
    const used = new Set(); map = lines.shift().map(h => { const f = h && ASSET_FIELDS.find(x => !used.has(x[0]) && x[1].test(h)); if (f) used.add(f[0]); return f ? f[0] : null; });
  }
  let n = 0;
  lines.forEach(c => {
    const o = {}; map.forEach((k, j) => { if (k && c[j]) o[k] = c[j]; });
    if (!o.name || /^(계|소계|합계|합\s*계|부가세)$/.test(o.name)) return;
    ['qty', 'price', 'round'].forEach(k => { if (o[k] !== undefined) o[k] = toNum(o[k]); });
    ['inDate', 'outDate'].forEach(k => { if (o[k]) { const d = parseDateCell(o[k]); o[k] = d ? d.date : ''; } });
    o.kind = ASSET_KINDS.find(k => String(o.kind || '').includes(k)) || kind0 || '구입';
    assetsOf().push({ id: uid(), status: '사용', photos: [], ...o }); n++;
  });
  return n;
}
/* 연장 찾기: 대장에 이미 있는 임차 자산 중 품명·규격이 같고 업체가 같거나(빈 칸 포함) 사용 중인 것 → 새로 만들지 않고 반납일만 늘림
 * a.hist = [{ from, to, qty, pmId, pmNo }] 기간 이력 (1차 = 처음 등록, 2차~ = 연장) */
const assetKey = s => String(s ?? '').replace(/\s|^-$/g, '').toLowerCase();
function assetExtMatch(rows, pm) {
  const used = new Set();
  return rows.map(x => {
    const c = assetsOf().filter(a => a.kind === '임차' && (a.status || '사용') === '사용' && !used.has(a.id) && !(pm && a.pmId === pm.id)
      && assetKey(a.name) === assetKey(x.name) && assetKey(a.spec) === assetKey(x.spec) && (!a.vendor || !x.vendor || assetKey(a.vendor) === assetKey(x.vendor)))
      .sort((a, b) => String(b.outDate || '').localeCompare(String(a.outDate || '')))[0];
    if (c) used.add(c.id);
    return c || null;
  });
}
function assetExtend(m, x, pmId, inD, outD) {   // 연장 반영 → 늘어난 수량은 새 자산으로 돌려줌 (없으면 null)
  const p = pmAll().find(q => q.id === pmId), to = x.outDate || outD || '', from = x.inDate || inD || '';
  if (!m.hist || !m.hist.length) m.hist = [{ from: m.inDate || '', to: m.outDate || '', qty: toNum(m.qty), pmId: m.pmId || '', pmNo: m.pmNo || '' }];
  const q = toNum(x.qty) || toNum(m.qty), had = toNum(m.qty);
  let extra = null;
  if (q < had) {   // 일부만 연장: 나머지는 원래 종료일로 반납
    assetsOf().push({ ...JSON.parse(JSON.stringify(m)), hist: undefined, id: uid(), qty: had - q, status: '반납', reason: `연장 제외 (${p ? `품의 ${p.no}번` : '연장'} 때 ${q}개만 연장)` });
    m.qty = q;
  } else if (q > had) extra = { id: uid(), kind: '임차', status: '사용', photos: [], ...x, qty: q - had, inDate: from, outDate: to };
  m.hist.push({ from, to, qty: Math.min(q, had), pmId: p ? p.id : '', pmNo: p ? String(p.no) : '' });
  if (to) m.outDate = to;
  if (toNum(x.price)) m.price = toNum(x.price);
  if (x.place && !m.place) m.place = x.place;
  assetSetPm(m, pmId);
  return extra;
}
function assetPasteDialog(rows, kind0, pm) {   // rows 가 있으면 품의 표에서 (확인 후 등록) · pm = 품의서
  const had = pm ? pmAssets(pm).length : 0;
  const ext = rows ? assetExtMatch(rows, pm) : [], nExt = ext.filter(Boolean).length;
  const extCell = (m, x, i) => !m ? '<span class="muted small">새로 등록</span>'
    : `<select data-apx="${i}"><option value="ext">연장</option><option value="new">새로 등록</option></select>
       <div class="small muted" style="white-space:nowrap">기존 ${assetDot(m.inDate)}~${assetDot(m.outDate)} · ${fmt0(m.qty)}개${(m.photos || []).length ? ` · 📷${m.photos.length}` : ''}${toNum(x.qty) && toNum(x.qty) !== toNum(m.qty) ? ` · <b style="color:var(--bad)">${toNum(x.qty) < toNum(m.qty) ? `${toNum(m.qty) - toNum(x.qty)}개 반납` : `${toNum(x.qty) - toNum(m.qty)}개 추가`}</b>` : ''}</div>`;
  modal(rows ? `자산 대장에 등록 — 품의 ${pm ? `${pm.no}번 ${pm.title || ''}` : ''}` : '엑셀에서 붙여넣기', `${had ? `<div class="banner warn small">이 품의서로 이미 <b>${had}건</b> 등록되어 있습니다 — 같은 품목을 두 번 넣지 않도록 확인하세요.</div>` : ''}${nExt ? `<div class="banner small">대장에 이미 있는 임차 품목 <b>${nExt}건</b> → <b>연장</b>으로 처리합니다 (새로 만들지 않고 반납일만 늘림 · 사진·이력 유지 · 수량이 줄면 나머지는 반납, 늘면 늘어난 만큼만 새로 등록). 다른 물건이면 그 줄을 "새로 등록"으로 바꾸세요.</div>` : ''}
    <div class="form-grid"><label>종류<select id="apK">${ASSET_KINDS.map(k => `<option ${k === (kind0 || '구입') ? 'selected' : ''}>${k}</option>`).join('')}</select></label>
      <label>품의서${assetPmSelect('apPm', pm && pm.id)}</label><label style="grid-column:span 2">기간 (입고일 ~ 반납일) <span class="muted small">반납일은 모르면 비움</span><input readonly data-rng="one" data-a="apI" data-b="apO" data-la="입고일" data-lb="반납일" data-none="반납 전" value="${esc(rngShow(todayStr(), '', '반납 전'))}"></label>
      <input type="hidden" id="apI" value="${todayStr()}"><input type="hidden" id="apO" value=""></div>
    ${rows ? `<div class="tbl-wrap" style="max-height:45vh;margin-top:8px"><table class="t"><thead><tr><th></th><th>품명</th><th>규격</th><th>수량</th><th>단가</th><th>입고 ~ 반납</th><th>비고(배치 장소)</th><th>처리</th></tr></thead><tbody>${rows.map((x, i) => `<tr><td><input type="checkbox" data-apr="${i}" checked></td><td>${esc(x.name)}</td><td>${esc(x.spec || '')}</td><td class="num">${fmt0(x.qty)}</td><td class="num">${fmt0(x.price)}</td><td class="small" style="white-space:nowrap">${x.inDate ? `${assetDot(x.inDate)} ~ ${x.outDate ? assetDot(x.outDate) : ''}` : '<span class="muted">위 기간</span>'}</td><td>${esc(x.place || '')}</td><td>${extCell(ext[i], x, i)}</td></tr>`).join('')}</tbody></table></div>`
      : `<p class="small muted" style="margin:8px 0 4px">머리글 줄까지 복사하면 열 이름(종류·품명·규격·업체·수량·단가·차수·입고일·반납일·배치 장소)으로 맞춥니다. 머리글이 없으면 품명·규격·업체·수량·단가·입고일·배치 장소 순서.</p><textarea id="apT" rows="8" style="width:100%"></textarea>`}`, [
    { label: '취소' },
    { label: '등록', cls: 'primary', onClick: root => {
      const kind = $('#apK', root).value, pm = $('#apPm', root).value.trim(), inD = $('#apI', root).value, outD = $('#apO', root).value;
      let n = 0, ne = 0;
      if (rows) rows.forEach((x, i) => {
        if (!$(`[data-apr="${i}"]`, root).checked) return;
        const sel = $(`[data-apx="${i}"]`, root);
        if (ext[i] && sel && sel.value === 'ext') { const extra = assetExtend(ext[i], x, pm, inD, outD); ne++; if (extra) { assetSetPm(extra, pm); assetsOf().push(extra); n++; } return; }
        const a = { id: uid(), kind, status: '사용', photos: [], inDate: inD, ...x }; if (!a.outDate && outD) a.outDate = outD; assetSetPm(a, pm); assetsOf().push(a); n++;
      });
      else { const before = assetsOf().length; n = assetPaste($('#apT', root).value, kind); assetsOf().slice(before).forEach(a => { if (pm && !a.pmNo) assetSetPm(a, pm); else if (a.pmNo) { const p = assetPm(a); if (p) assetSetPm(a, p.id); } if (!a.inDate && inD) a.inDate = inD; if (!a.outDate && outD) a.outDate = outD; }); }
      if (!n && !ne) { toast('등록할 품목이 없습니다.'); return true; }
      save(); render(); toast(`자산 대장에 반영했습니다${ne ? ` · 연장 ${ne}건` : ''}${n ? ` · 새로 ${n}건 등록` : ''}`);
    } }]);
}
// 품의 작성 창 표 블록 → 자산 행 (품목·구분 / 규격 / 수량 / 단가 / 비고 · 업체) — 비교견적 표면 확정 업체 단가
/* "8/17~11/16" · "26.08.17~26.11.16" · "2026.08.11.~2026.11.10.(3개월)" · "8월 17일 ~ 11월 16일" → { inDate, outDate } (반납일 없는 "~PJT 종료 시"는 입고일만) */
function assetRng(t, Y) {
  const D = String.raw`(?:(\d{2,4})\s*[./\-년]\s*)?(\d{1,2})\s*[./\-월]\s*(\d{1,2})\s*일?\.?`;
  const s = String(t ?? ''), m = s.match(new RegExp(D + String.raw`\s*~\s*` + D));
  const yr = y => (!y ? 0 : y.length === 2 ? 2000 + +y : +y);
  if (m) {
    const y1 = yr(m[1]) || Y, y2 = yr(m[4]) || (+m[5] < +m[2] ? y1 + 1 : y1);
    return { inDate: `${y1}-${pad2(m[2])}-${pad2(m[3])}`, outDate: `${y2}-${pad2(m[5])}-${pad2(m[6])}` };
  }
  const o = s.match(new RegExp(D + String.raw`\s*~`));
  return o && o[1] ? { inDate: `${yr(o[1])}-${pad2(o[2])}-${pad2(o[3])}` } : null;
}
function assetRowsFromTable(b, vendor, pm) {   // pm = 품의서 (구분 "8/17~11/16" 의 연도는 시행기간·기안일에서)
  const cols = (b.cols || []).map(c => String(c).replace(/\s/g, '')), at = re => cols.findIndex(c => re.test(c) && !c.includes('|'));
  const fixP = cols.findIndex(c => /^확정/.test(c) && /단가/.test(c));
  const pickName = [/품명/, /품목/, /내역/, /구분/].map(at).find(j => j >= 0) ?? -1;   // 품명 열을 먼저 (에메트 표: 구분 = 기간 "8/17~11/16")
  const grpCols = [...new Set((b.cols || []).filter(c => String(c).includes('|')).map(c => String(c).split('|')[0]))];
  const onlyP = grpCols.length === 1 ? cols.findIndex(c => c.startsWith(grpCols[0].replace(/\s/g, '') + '|') && /단가/.test(c)) : -1;   // 업체가 하나뿐인 두 줄 머리글 (에메트|단가)
  const ci = { name: pickName, gubun: pickName !== at(/구분/) ? at(/구분/) : -1, spec: at(/규격/), qty: at(/수량/), price: fixP >= 0 ? fixP : at(/단가/) >= 0 ? at(/단가/) : onlyP, place: at(/비고|배치|장소/), vendor: at(/업체/) };
  const fixV = ((b.cols || []).find(c => /^확정/.test(String(c))) || '').match(/^확정\s*\((.+?)\)/);
  const Y = +(String(pm && (pm.period || pm.date) || todayStr()).match(/20\d\d/) || [new Date().getFullYear()])[0];
  const def = assetRng(pm && pm.period, Y) || {};   // 줄에 기간이 없으면 품의서 시행기간
  let lastName = '', lastRng = null;
  return (b.rows || []).map(r => {
    const g = k => (ci[k] >= 0 ? String(r[ci[k]] ?? '').trim() : '');
    if (/^(계|소계|합계|합\s*계|부가세|총계|VAT)$/.test(String(r[0] ?? '').trim())) return { name: '' };   // 계·부가세·합계 줄 (첫 칸이 No. 인 표)
    const gb = g('gubun'), own = r.map(v => assetRng(v, Y)).find(Boolean);   // 줄 어느 칸이든 "8/17~11/16"·"2026.08.17.~2026.11.16." 같은 기간
    if (own) lastRng = own; else if (gb) lastRng = null;
    let name = g('name');
    if (!name && !gb && lastName && ci.gubun >= 0) name = lastName;   // 품명 칸이 비면 위 품명 (같은 품목 다른 규격 — 인쇄 때 합쳐진 칸)
    if (name) lastName = name;
    return { name, spec: g('spec').replace(/^-$/, ''), qty: toNum(g('qty')), price: toNum(g('price')), place: g('place'), vendor: g('vendor') || (fixV ? fixV[1] : '') || vendor || '', ...def, ...(lastRng || {}) };
  }).filter(x => x.name && !/^(계|소계|합계|합\s*계|부가세|총계)$/.test(x.name) && !/업체명/.test(x.vendor) && !/배송|설치|회수/.test(x.name));
}

/* 화면 */
function viewAsset() {
  const s = site(), all = assetsOf(s), K = state.assetK || '', S2 = state.assetS || '';
  const list = all.filter(a => (!K || a.kind === K) && (!S2 || (a.status || '사용') === S2)).sort((a, b) => ASSET_KINDS.indexOf(a.kind) - ASSET_KINDS.indexOf(b.kind) || String(a.inDate || '').localeCompare(String(b.inDate || '')) || String(a.name).localeCompare(String(b.name)));
  const cnt = f => all.filter(f).length, stCls = st => (st === '회수불가' ? 'bad' : st === '사용' ? '' : 'ok');
  const rows = list.map(a => `<tr data-act="assetEdit" data-id="${a.id}" data-asid="${a.id}" class="${state.selAsset === a.id ? 'sel' : ''}" style="cursor:pointer" title="눌러서 고치기 · 사진 · 상태 — 줄을 누른 뒤 Ctrl+V 또는 사진을 줄 위로 끌어다 놓으면 사진 등록">
      <td class="small">${esc(a.kind)}${a.round ? ` <span class="muted">${esc(a.round)}차</span>` : ''}</td><td><b>${esc(a.name)}</b>${a.spec ? ` <span class="muted small">${esc(a.spec)}</span>` : ''}${(a.photos || []).length ? ` <span class="small" title="증빙 사진">📷${a.photos.length}</span>` : ['구입', '임차'].includes(a.kind) ? ' <span class="badge warn" title="구입·임차 집기는 사진 증빙 필요 — 줄을 눌러 [📷 사진 추가]">사진 없음</span>' : ''}</td>
      <td class="num">${fmt0(a.qty)}</td><td class="num">${fmt0(a.price)}</td><td class="num">${fmt0(assetAmt(a))}</td>
      <td class="small" style="white-space:nowrap">${assetDot(a.inDate)}${a.outDate ? ` ~ ${assetDot(a.outDate)}` : ''}</td><td class="small">${esc(a.place || '')}</td>
      <td class="small" style="white-space:nowrap">${(p => (p ? `<a href="#" data-act="pmEdit" data-id="${p.id}" title="${esc(p.title || '')} — 눌러서 품의서 열기">${esc(p.no)}번</a> <span class="badge ${p.status === '결재완료' ? 'ok' : 'warn'}">${esc(p.status)}</span>` : a.pmNo ? `<span class="muted" title="이 번호의 품의서가 대장에 없음">${esc(a.pmNo)}번</span>` : ''))(assetPm(a))}${(a.hist || []).length > 1 ? ` <span class="badge" title="${esc(a.hist.map((h, i) => `${i + 1}차 ${assetDot(h.from)}~${assetDot(h.to)} ${h.qty}개${h.pmNo ? ` (품의 ${h.pmNo}번)` : ''}`).join('\n'))}">연장 ${a.hist.length - 1}회</span>` : ''}</td>
      <td><span class="badge ${stCls(a.status || '사용')}">${esc(a.status || '사용')}</span>${a.reason ? `<div class="small muted">${esc(a.reason)}</div>` : ''}</td></tr>`).join('');
  return `${pageHead('자산·집기', `${esc(s.fullName || s.name)} · 구입 ${cnt(a => a.kind === '구입')} · 임차 ${cnt(a => a.kind === '임차')} · 소모품 ${cnt(a => a.kind === '소모품')}`,
    BTN('assetAdd', '+ 추가', '', 'primary') + BTN('assetPaste', '엑셀에서 붙여넣기')
    + MENU('인쇄·엑셀', [MI('assetOut', '집기 임차 현황표', 'data-k="rent"', '품명·규격·기간·수량·단가·금액·배치 장소'), MI('assetOut', '소모품 차수별 단가표', 'data-k="supply"', '같은 품명을 차수 열로 · 누계'), MI('assetOut', '철수 회수 리스트', 'data-k="close"', '품목·수량·회수/회수불가·사유'), MI('assetPhotos', '자산 사진 대장 (증빙)', '', '등록한 사진을 A4 한 장에 4장씩 · 품명·규격·수량·기간·배치 장소·품의 번호 · 위 종류·상태 거르기 그대로')]))}
    <div class="row small" style="margin-bottom:8px;gap:6px"><select data-ch="assetK"><option value="">종류 전체 (${all.length})</option>${ASSET_KINDS.map(k => `<option ${k === K ? 'selected' : ''}>${k}</option>`).join('')}</select>
      <select data-ch="assetS"><option value="">상태 전체</option>${ASSET_ST.map(k => `<option ${k === S2 ? 'selected' : ''}>${k}${cnt(a => (a.status || '사용') === k) ? ` (${cnt(a => (a.status || '사용') === k)})` : ''}</option>`).join('')}</select></div>
    ${all.length ? `<div class="tbl-wrap"><table class="t"><thead><tr><th>종류</th><th>품명 · 규격</th><th>수량</th><th>단가</th><th>금액</th><th>입고 ~ 반납</th><th>배치 장소</th><th>품의서</th><th>상태</th></tr></thead><tbody>${rows || '<tr><td colspan="9" class="center muted">해당하는 자산이 없습니다.</td></tr>'}
      <tr class="sum"><td colspan="4">합계</td><td class="num">${fmt(sum(list, assetAmt))}</td><td colspan="4"></td></tr></tbody></table></div>`
      : '<div class="panel muted" style="padding:24px;text-align:center">아직 등록한 자산이 없습니다. [+ 추가], [엑셀에서 붙여넣기], 또는 품의서 작성 창 표의 [📦 자산 대장에 등록]으로 넣으세요.</div>'}
    <p class="muted small">📷 증빙 사진: 영수증처럼 <b>줄을 누른 뒤 Ctrl+V</b> (창이 열려도 그대로 붙음), 또는 사진 파일을 <b>줄 위로 끌어다 놓기</b>. 줄을 누르면 고치기·사진·상태(사용 → 반납·회수·회수불가). 철수 때는 [인쇄·엑셀 → 철수 회수 리스트].</p>`;
}
/* 출력 3종 (엑셀 · 인쇄 같은 표) */
function assetDoc(k) {
  const s = site(), S = s.name, A = assetsOf(s);   // 제목은 다른 출력물처럼 약칭 + 현장
  if (k === 'rent') {   // 품의 91 사무집기 임차 형식
    const l = A.filter(a => a.kind === '임차');
    return ['집기 임차 현황', xtHtml({ title: `${S}현장 사무집기 임차 현황`, widths: [130, 90, 150, 50, 80, 90, 150], head: [['품명', '규격', '기간', '수량', '단가', '금액', '비고(배치 장소)']],
      rows: [...l.map(a => [a.name, a.spec || '', { t: `${assetDot(a.inDate)} ~ ${a.outDate ? assetDot(a.outDate) : 'PJT 종료 시'}`, c: 'c' }, toNum(a.qty), toNum(a.price), assetAmt(a), a.place || '']), ['합계', '', '', sum(l, a => toNum(a.qty)), '', sum(l, assetAmt), '']] }), l.length];
  }
  if (k === 'supply') {   // 품의 90 미화물품 차수별 단가표: 품명·규격·단가 | N차 수량·금액 … | 누계 수량·금액
    const l = A.filter(a => a.kind === '소모품'), rounds = [...new Set(l.map(a => toNum(a.round)))].sort((a, b) => a - b);
    const items = [...new Map(l.map(a => [`${a.name}|${a.spec || ''}`, { name: a.name, spec: a.spec || '' }])).values()];
    const of = (it, r) => l.filter(a => a.name === it.name && (a.spec || '') === it.spec && toNum(a.round) === r);
    const rowsX = items.map(it => { const mine = l.filter(a => a.name === it.name && (a.spec || '') === it.spec), lastP = toNum((mine[mine.length - 1] || {}).price);
      return [it.name, it.spec, lastP, ...rounds.flatMap(r => { const x = of(it, r); return [sum(x, a => toNum(a.qty)) || '', sum(x, assetAmt) || '']; }), sum(mine, a => toNum(a.qty)), sum(mine, assetAmt)]; });
    const rl = r => (r ? `${r}차` : '차수 없음');
    return ['소모품 차수별 단가표', xtHtml({ title: `${S}현장 소모품 차수별 단가표`, land: true, widths: [130, 80, 70, ...rounds.flatMap(() => [44, 74]), 50, 84],
      head: [[{ t: '품명', rs: 2 }, { t: '규격', rs: 2 }, { t: '단가', rs: 2 }, ...rounds.map(r => ({ t: rl(r), cs: 2 })), { t: '누계', cs: 2 }], [...rounds.flatMap(() => ['수량', '금액']), '수량', '금액']],
      rows: [...rowsX, ['합계', '', '', ...rounds.flatMap(r => { const x = l.filter(a => toNum(a.round) === r); return [sum(x, a => toNum(a.qty)), sum(x, assetAmt)]; }), sum(l, a => toNum(a.qty)), sum(l, assetAmt)]] }), l.length];
  }
  // 철수 회수 리스트 (2026-10-02 요청: 투입부터 산 소모품 전체 — 품목·수량·회수/회수불가·사유)
  const l = A.slice().sort((a, b) => ASSET_KINDS.indexOf(a.kind) - ASSET_KINDS.indexOf(b.kind) || String(a.name).localeCompare(String(b.name)));
  const n = st => l.filter(a => (a.status || '사용') === st).length;
  return ['철수 회수 리스트', xtHtml({ title: `${S}현장 철수 회수 리스트`, sub: `전체 ${l.length}건 · 회수 ${n('회수')} · 반납 ${n('반납')} · 회수불가 ${n('회수불가')} · 미정리(사용 중) ${n('사용')}`, widths: [56, 130, 90, 50, 110, 150, 70, 180],
    head: [['종류', '품명', '규격', '수량', '업체', '배치 장소', '회수 여부', '사유']],
    rows: l.map(a => [{ t: a.kind, c: 'c' }, a.name, a.spec || '', toNum(a.qty), a.vendor || '', a.place || '', { t: (a.status || '사용') === '사용' ? '' : a.status, c: 'c' }, a.reason || '']) }), l.length];
}
/* 자산 사진 대장 (증빙): 화면의 종류·상태 거르기 그대로 · 사진 한 장마다 칸 하나 (A4 한 장에 2×2), 아래에 그 자산 정보 */
async function assetPhotoPrint() {
  const s = site(), K = state.assetK || '', S2 = state.assetS || '';
  const list = assetsOf(s).filter(a => (!K || a.kind === K) && (!S2 || (a.status || '사용') === S2))
    .sort((a, b) => ASSET_KINDS.indexOf(a.kind) - ASSET_KINDS.indexOf(b.kind) || String(a.inDate || '').localeCompare(String(b.inDate || '')) || String(a.name).localeCompare(String(b.name)));
  const items = list.flatMap(a => (a.photos || []).map((rel, i) => ({ a, rel, i, n: a.photos.length })));
  const noPh = list.filter(a => ['구입', '임차'].includes(a.kind) && !(a.photos || []).length);
  if (!items.length) { toast(`사진을 등록한 자산이 없습니다${noPh.length ? ` (사진 없는 구입·임차 ${noPh.length}건)` : ''}. 줄을 눌러 [📷 사진 추가]로 넣으세요.`); return; }
  if (noPh.length && !confirm(`사진이 없는 구입·임차 자산이 ${noPh.length}건 있습니다:\n- ${noPh.slice(0, 8).map(a => a.name + (a.spec ? ` (${a.spec})` : '')).join('\n- ')}${noPh.length > 8 ? `\n… 외 ${noPh.length - 8}건` : ''}\n\n사진 있는 것만 인쇄할까요?`)) return;
  const prog = modal('자산 사진 인쇄 준비', '<p id="asProg">사진 준비 중…</p>', [], 's');
  const pics = []; let miss = 0;
  for (let k = 0; k < items.length; k++) {
    const x = items[k], p = $('#asProg', prog); if (p) p.textContent = `사진 준비 중… ${k + 1} / ${items.length}`;
    let canv = []; try { canv = await fileCanvases(await (await fileAt(`${s.folder}/${x.rel}`, false)).getFile()); } catch (e) { canv = []; }
    if (!canv.length) { miss++; continue; }
    pics.push({ ...x, url: await canvasURL(scaledCanvas(canv[0], 1400), 0.85) });
  }
  closeModal();
  if (!pics.length) { toast('사진 파일을 찾을 수 없습니다.'); return; }
  const cap = ({ a, i, n }) => { const pm = assetPm(a);
    return `<b>${esc(a.name)}</b>${a.spec ? ` · ${esc(a.spec)}` : ''} · 수량 ${fmt0(a.qty) || '-'}${n > 1 ? ` <span style="color:#555">(사진 ${i + 1}/${n})</span>` : ''}
      <br>${esc(a.kind)}${a.vendor ? ` · ${esc(a.vendor)}` : ''} · ${a.inDate ? `${assetDot(a.inDate)} ~ ${a.outDate ? assetDot(a.outDate) : (a.kind === '임차' ? 'PJT 종료 시' : '')}` : ''}${a.place ? ` · ${esc(a.place)}` : ''}${pm ? ` · 품의 ${esc(pm.no)}번` : a.pmNo ? ` · 품의 ${esc(a.pmNo)}번` : ''}${(a.status || '사용') !== '사용' ? ` · <b>${esc(a.status)}</b>` : ''}`; };
  const N = Math.ceil(pics.length / 4), pages = [], ttl = `${esc(s.name)}현장 자산·집기 사진 대장${K ? ` (${esc(K)})` : ''}`;
  for (let p = 0; p < N; p++) {
    const cells = pics.slice(p * 4, p * 4 + 4).map(x => `<div style="border:1px solid #888;display:flex;flex-direction:column;overflow:hidden;min-height:0">
        <div style="flex:1;display:flex;align-items:center;justify-content:center;min-height:0;padding:2mm"><img src="${x.url}" style="max-width:100%;max-height:100mm;object-fit:contain"></div>
        <div style="font-size:9.5pt;line-height:1.4;padding:1.5mm 2.5mm;border-top:1px solid #888">${cap(x)}</div></div>`).join('');
    pages.push(`<div class="doc" style="font-family:'Malgun Gothic',sans-serif;color:#000">
      <div style="display:flex;justify-content:space-between;align-items:flex-end;border-bottom:1.5px solid #000;padding-bottom:2mm;margin-bottom:3mm"><b style="font-size:13pt">${ttl}</b><span style="font-size:9pt">인쇄 ${assetDot(todayStr())} · ${p + 1} / ${N}</span></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;grid-template-rows:122mm 122mm;gap:4mm">${cells}</div></div>`);
  }
  if (miss) toast(`사진 ${miss}장은 파일을 찾지 못해 뺐습니다.`);
  await printDocs(pages);
}
function assetOutDialog(k) {
  const [name, html, n] = assetDoc(k);
  if (!n) { toast(k === 'rent' ? '임차 자산이 없습니다.' : k === 'supply' ? '소모품이 없습니다.' : '자산이 없습니다.'); return; }
  modal(name, `<p class="small">${n}건 — 엑셀 파일로 저장하거나 인쇄합니다.</p>`, [
    { label: '취소' },
    { label: '엑셀로 저장', onClick: () => { saveXl([[name, html]], `${site().name}현장 ${name}.xlsx`); } },
    { label: '인쇄', cls: 'primary', onClick: () => { printDocs([html]); } }], 's');   // 버튼 순서는 다른 창과 같게: 취소 · 엑셀로 저장 · 인쇄
}
