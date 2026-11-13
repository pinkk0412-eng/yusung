/* 유성 현장 관리 프로그램 — 휴대폰 영수증 앱(m/) PC 쪽
 * 현장마다 현장 경리가 자기 드롭박스 계정을 씀 → 사진은 그 현장 경리의 드롭박스로 바로 감.
 * ⓪ (관리자 한 번) 드롭박스에 "앱 전용 폴더" 앱 등록 → 앱 키를 MB_APP_KEY 에 넣음 (넣기 전에는 설정 화면에서 임시로 입력 가능)
 * ① (현장 PC 한 번) [드롭박스 연결] → 드롭박스 창에서 [허용] → m/auth.html 이 코드를 이 창으로 보내 줌 (안 되면 코드 붙여넣기)
 *    → 올리기 전용 토큰(files.content.write, PKCE) 을 db.settings.mb 에 저장 (공통설정.txt)
 * ② 휴대폰 사진함 = 데이터 폴더(드롭박스) 안 Apps(앱)\<앱 이름> — connected.txt 가 있는 폴더를 자동으로 찾음 (못 찾으면 직접 선택: idb 'mbRoot')
 * ③ 설치 링크: 현장마다 하나 (+ 전체 현장). 링크 # 뒤에 { 앱 키, 토큰, 링크 id, 현장 } — 직원은 로그인 없이 사진만 보냄
 * ④ 받기: 상단 [📱 휴대폰 영수증 N장] → 확인 → 현장·결제별로 03 ocrReceipts → 저장된 사진은 사진함에서 지움
 * 막은 링크로 온 사진은 기본으로 받지 않음. [모든 링크 막기] = 토큰을 끊어 드롭박스에서 막음. */
'use strict';

const MB_APP_KEY = 'x9smy0u0ljcumr7';   // 드롭박스 앱 yusung-receipts (2026-11-13 등록) — 모든 현장이 같은 키
const MB_URL = 'https://pinkk0412-eng.github.io/yusung/m/';
const MB = { root: null, manual: false, want: false, ready: false, n: 0, scanning: false };
const mbCfg = () => { const s = db.settings; if (!s.mb) s.mb = { appKey: '', token: '', links: [], url: '' }; if (!s.mb.links) s.mb.links = []; return s.mb; };
const mbKey = () => MB_APP_KEY || mbCfg().appKey;
const mbUrlBase = () => mbCfg().url || MB_URL;
const mbRedirect = () => mbUrlBase() + 'auth.html';
const b64urlBytes = u => btoa(String.fromCharCode(...u)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64urlText = s => b64urlBytes(new TextEncoder().encode(s));

/* ---------- 휴대폰 사진함 폴더 ---------- */
async function mbInit() {   // 시작할 때: 직접 고른 폴더가 있으면 그것, 아니면 데이터 폴더를 연 뒤 자동으로 찾음 (01 openRoot → mbRefind)
  const h = await Promise.race([idb.get('mbRoot'), new Promise(r => setTimeout(() => r(null), 2000))]).catch(() => null);
  if (h) { MB.root = h; MB.manual = true; MB.want = true; try { MB.ready = (await h.queryPermission({ mode: 'readwrite' })) === 'granted'; } catch (e) { MB.ready = false; } }
  mbBtn();
  // 자동 확인 없음 — 프로그램을 열 때 한 번 세고, 그 뒤엔 [📱 휴대폰 영수증 확인] 을 누를 때만 (사용자 요청 11/13)
}
async function mbAutoFind() {   // 데이터 폴더 안 Apps\* 또는 앱\* 중 connected.txt 가 있는 폴더
  if (!FS.ready || !FS.root) return null;
  for (const a of ['Apps', '앱']) {
    let apps; try { apps = await FS.root.getDirectoryHandle(a); } catch (e) { continue; }
    for await (const [, d] of apps.entries()) {
      if (d.kind !== 'directory') continue;
      try { await d.getFileHandle('connected.txt'); return d; } catch (e) { }
    }
  }
  return null;
}
function mbRefind() { if (!MB.manual) { MB.root = null; MB.ready = false; } mbScanCount(); }
/* 드롭박스는 연결했는데 사진함을 못 찾음 = 데이터 폴더가 드롭박스 맨 위 폴더가 아님 → 직접 한 번 골라야 함 (연결 직후 2분은 동기화 기다림) */
const mbLost = () => !MB.ready && !MB.manual && FS.ready && !!mbCfg().token && Date.now() - (mbCfg().atMs || 0) > 2 * 60 * 1000;
function mbBtn() {   // 상단바: 사진함이 있으면 늘 보임 — 받을 사진이 있으면 파란 [📱 휴대폰 영수증 N장], 없으면 [📱 휴대폰 영수증 확인] (누르면 바로 확인) · 권한이 풀렸거나 못 찾으면 그 안내
  const st = $('#saveState'); if (!st) return;
  let b = $('#mbBtn');
  if (!b) { b = document.createElement('button'); b.id = 'mbBtn'; b.type = 'button'; b.className = 'btn sm'; b.onclick = () => (MB.ready ? mbInbox() : MB.manual ? mbReopen() : mbPick()); st.before(b); }
  const lost = mbLost();
  b.style.display = MB.ready || (MB.manual && !MB.ready) || lost ? '' : 'none';
  b.classList.toggle('primary', MB.ready && MB.n > 0);
  b.textContent = MB.ready ? (MB.n > 0 ? `📱 휴대폰 영수증 ${MB.n}장` : '📱 휴대폰 영수증 확인') : lost ? '📱 휴대폰 사진함 고르기' : '📱 휴대폰 사진함 열기';
  b.title = MB.ready ? (MB.n > 0 ? '직원들이 휴대폰 앱으로 보낸 영수증 받기' : '휴대폰 앱으로 새로 보낸 영수증이 있는지 지금 확인') : lost ? '사진함을 자동으로 찾지 못했습니다 — 드롭박스\\앱\\yusung-receipts 폴더를 한 번 골라 주세요' : '휴대폰 사진함 폴더 권한이 필요합니다';
}
async function mbPick() {   // 자동으로 못 찾을 때만 (드롭박스 폴더 밖에 데이터 폴더가 있는 경우 등)
  if (!window.showDirectoryPicker) { toast('이 브라우저는 폴더 선택을 지원하지 않습니다. 크롬 또는 엣지로 여세요.'); return; }
  let h; try { h = await showDirectoryPicker({ id: 'yusung-mobile', mode: 'readwrite' }); } catch (e) { return; }
  let ok = false; for (const n of ['inbox', 'connected.txt']) { try { await (n === 'inbox' ? h.getDirectoryHandle(n) : h.getFileHandle(n)); ok = true; } catch (e) { } }
  if (!ok && !confirm(`📁 ${h.name} 폴더에는 휴대폰 사진함 표시(connected.txt)가 없습니다.\n보통 드롭박스\\앱(Apps)\\yusung… 폴더입니다. 그래도 이 폴더를 사용할까요?`)) return;
  await idb.set('mbRoot', h); Object.assign(MB, { root: h, manual: true, want: true, ready: true });
  await mbScanCount(); render(); toast(`휴대폰 사진함으로 📁 ${h.name} 폴더를 사용합니다.`);
}
async function mbReopen() {
  if (!MB.manual) return mbScanCount();
  try { MB.ready = (await MB.root.requestPermission({ mode: 'readwrite' })) === 'granted'; } catch (e) { MB.ready = false; }
  if (MB.ready) await mbScanCount(); else toast('휴대폰 사진함 폴더 권한이 필요합니다.');
  mbBtn(); if (state.tab === 'settings') render();
}
async function mbAuto() {   // 직접 고른 폴더 그만 쓰고 자동으로 찾기
  await idb.set('mbRoot', null); Object.assign(MB, { root: null, manual: false, want: false, ready: false, n: 0 });
  await mbScanCount(); render();
}
async function mbInboxDir() {
  if (!MB.ready) return null;
  try { return await MB.root.getDirectoryHandle('inbox'); } catch (e) { return MB.root.name === 'inbox' ? MB.root : null; }
}
/* 사진함 읽기: 정보(.json)와 사진이 둘 다 내려온 것만. 정보 없이 30분 넘은 사진은 orphan (직접 현장을 골라 받거나 삭제) */
async function mbScan() {
  const dir = await mbInboxDir(); if (!dir) return [];
  const files = new Map(); for await (const [n, h] of dir.entries()) if (h.kind === 'file' && !/^[.~]/.test(n)) files.set(n, h);
  const out = [], used = new Set();
  for (const [n, h] of files) {
    if (!/\.json$/i.test(n)) continue;
    const base = n.slice(0, -5), img = [...files.keys()].find(x => x !== n && x.slice(0, x.lastIndexOf('.')) === base);
    if (!img) continue;   // 사진이 아직 동기화 안 됨
    let meta; try { meta = JSON.parse(await (await h.getFile()).text()); } catch (e) { continue; }
    used.add(n); used.add(img); out.push({ base, meta, json: n, img, dir });
  }
  for (const [n, h] of files) {
    if (used.has(n) || /\.json$/i.test(n) || !/\.(jpe?g|png|heic|heif|webp)$/i.test(n)) continue;
    try { if (Date.now() - (await h.getFile()).lastModified < 30 * 60 * 1000) continue; } catch (e) { continue; }
    out.push({ base: n, meta: {}, json: '', img: n, dir, orphan: true });
  }
  return out.sort((a, b) => a.base.localeCompare(b.base));
}
async function mbScanCount() {
  if (MB.scanning) return;
  MB.scanning = true;
  try {
    if (!MB.manual && !MB.root) { const d = await mbAutoFind(); if (d) Object.assign(MB, { root: d, want: true, ready: true }); }
    MB.n = MB.ready ? (await mbScan()).length : 0;
  } catch (e) { MB.n = 0; }
  MB.scanning = false; mbBtn();
}
async function mbRemove(it) { for (const n of [it.img, it.json]) if (n) { try { await it.dir.removeEntry(n); } catch (e) { } } }

/* ---------- 받기 ---------- */
async function mbInbox() {
  if (!MB.ready) return mbReopen();
  if (!FS.ready) { toast('먼저 데이터 폴더를 여세요.'); return; }
  let items; try { items = await mbScan(); } catch (e) { toast('휴대폰 사진함을 읽지 못했습니다: ' + e.message); return; }
  MB.n = items.length; mbBtn();
  if (!items.length) { toast('새로 온 휴대폰 영수증이 없습니다. (방금 보냈으면 드롭박스가 PC로 내려받는 중일 수 있습니다 — 잠시 뒤 다시 누르세요)'); return; }
  const c = mbCfg();
  for (const it of items) {
    const m = it.meta, link = c.links.find(l => l.id === m.l);
    it.warn = it.orphan ? '정보 없는 사진' : !link ? '모르는 링크' : link.off ? '막은 링크' : '';
    const sid = link && link.siteId ? link.siteId : m.site;
    it.site = db.sites.some(s => s.id === sid) ? sid : '';
    it.kind = m.kind === 'cash' ? 'cash' : 'card';
    try { it.file = await (await it.dir.getFileHandle(it.img)).getFile(); it.url = URL.createObjectURL(it.file); } catch (e) { it.file = null; }
  }
  const list = items.filter(it => it.file);
  const free = () => list.forEach(it => URL.revokeObjectURL(it.url));
  const at = s => { const d = new Date(s); return isNaN(d) ? '' : `${pad2(d.getMonth() + 1)}/${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
  const rows = list.map((it, i) => `<tr>
      <td><input type="checkbox" data-mbi="${i}" ${!it.warn && it.site ? 'checked' : ''}></td>
      <td><img src="${it.url}" data-mbimg="${i}" style="width:60px;max-height:80px;object-fit:contain;border:1px solid var(--line);cursor:zoom-in" title="크게 보기"></td>
      <td><select data-mbs="${i}" style="min-width:120px"><option value="">— 현장 —</option>${db.sites.map(s => `<option value="${s.id}" ${s.id === it.site ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></td>
      <td><select data-mbk="${i}"><option value="card" ${it.kind === 'card' ? 'selected' : ''}>법인카드</option><option value="cash" ${it.kind === 'cash' ? 'selected' : ''}>전도금</option></select></td>
      <td>${esc(it.meta.date || '')}</td><td class="num">${it.meta.amount ? fmt(it.meta.amount) : ''}</td><td>${esc(it.meta.memo || '')}</td>
      <td>${esc(it.meta.by || '')}<div class="muted small">${at(it.meta.at)}</div></td>
      <td>${it.warn ? `<span class="bad small">${esc(it.warn)}</span>` : ''}</td></tr>`).join('');
  const root = modal(`휴대폰 영수증 ${list.length}장`, `<p class="small">직원들이 휴대폰 앱으로 보낸 영수증입니다. 받을 사진을 고르고 [받기]를 누르면 현장·결제별로 <b>영수증 읽기</b> 창이 차례로 열립니다 (금액·날짜가 맞는 내역에 자동 연결).
      저장한 사진은 휴대폰 사진함에서 지웁니다.${list.some(it => it.warn) ? '<br><span class="bad">빨간 표시</span>: 막은 링크·모르는 링크로 온 사진은 확인 후에만 받으세요.' : ''}</p>
    <div class="tbl-wrap" style="max-height:60vh"><table class="t"><thead><tr><th><input type="checkbox" id="mbAll" title="모두 선택"></th><th>사진</th><th>현장</th><th>결제</th><th>날짜</th><th>금액</th><th>사용 내역</th><th>보낸 사람</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`, [
    { label: '취소', onClick: free },
    { label: '선택 삭제', cls: 'danger', onClick: async r => {
      const sel = list.filter((it, i) => r.querySelector(`[data-mbi="${i}"]`).checked);
      if (!sel.length) { toast('삭제할 사진을 고르세요.'); return true; }
      if (!confirm(`선택한 사진 ${sel.length}장을 휴대폰 사진함에서 삭제할까요? (받지 않음)`)) return true;
      for (const it of sel) await mbRemove(it);
      free(); await mbScanCount(); toast(`휴대폰 영수증 ${sel.length}장을 삭제했습니다.`);
    } },
    { label: '받기', cls: 'primary', onClick: async r => {
      const sel = [];
      list.forEach((it, i) => { if (!r.querySelector(`[data-mbi="${i}"]`).checked) return; it.site = r.querySelector(`[data-mbs="${i}"]`).value; it.kind = r.querySelector(`[data-mbk="${i}"]`).value; sel.push(it); });
      if (!sel.length) { toast('받을 사진을 고르세요.'); return true; }
      if (sel.some(it => !it.site)) { toast('현장을 고르세요.'); return true; }
      const groups = [];
      for (const it of sel) { let g = groups.find(x => x.site === it.site && x.kind === it.kind); if (!g) groups.push(g = { site: it.site, kind: it.kind, items: [] }); g.items.push(it); }
      list.filter(it => !sel.includes(it)).forEach(it => URL.revokeObjectURL(it.url));
      setTimeout(() => mbRunGroups(groups), 0);   // 이 창이 닫힌 뒤에 영수증 읽기 창을 엶
    } }], 'xl');
  root.querySelectorAll('[data-mbimg]').forEach(img => img.onclick = () => window.open(img.src, '_blank'));
  const all = $('#mbAll', root); if (all) all.onchange = () => root.querySelectorAll('[data-mbi]').forEach(x => { x.checked = all.checked; });
}
function mbRunGroups(groups) {   // 현장·결제별로 차례로 03 ocrReceipts → 저장된 사진만 사진함에서 지움
  const g = groups.shift(); if (!g) { mbScanCount(); return; }
  const yms = g.items.map(it => String(it.meta.date || '').slice(0, 7)).filter(Boolean).sort();
  db.cur = g.site; state.tab = g.kind; if (yms.length) state.ym = yms[yms.length - 1];
  save(); render();
  const byFile = new Map(g.items.map(it => [it.file, it]));
  if (groups.length) toast(`${site().name}현장 ${g.kind === 'card' ? '법인카드' : '전도금'} 영수증부터 엽니다 (남은 묶음 ${groups.length}개).`);
  ocrReceipts(g.kind, g.items.map(it => it.file), {
    hintOf: f => { const it = byFile.get(f); return it && { date: it.meta.date || '', amount: +it.meta.amount || 0, memo: it.meta.memo || '' }; },
    onSaved: async done => {
      for (const f of done) { const it = byFile.get(f); if (it) await mbRemove(it); }
      g.items.forEach(it => URL.revokeObjectURL(it.url));
      await mbScanCount();
      if (groups.length) mbRunGroups(groups);
    },
  });
}

/* ---------- 드롭박스 연결 (이 PC 드롭박스 계정 → 올리기 전용 토큰) ---------- */
async function mbToken() {   // PC 에서 쓰는 짧은 토큰 (모든 링크 막기에 필요)
  const c = mbCfg();
  const r = await fetch('https://api.dropboxapi.com/oauth2/token', { method: 'POST', body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: c.token, client_id: c.key || mbKey() }) });
  if (!r.ok) throw new Error(`드롭박스 응답 ${r.status}`);
  return (await r.json()).access_token;
}
async function mbUploadText(at, path, text) {
  const r = await fetch('https://content.dropboxapi.com/2/files/upload', { method: 'POST', body: new Blob([text]), headers: { Authorization: 'Bearer ' + at, 'Dropbox-API-Arg': JSON.stringify({ path, mode: 'overwrite', mute: true }), 'Content-Type': 'application/octet-stream' } });
  if (!r.ok) throw new Error(`올리기 시험 실패 (${r.status}) — 관리자: 앱 권한에 files.content.write 가 체크됐는지 확인`);
}
let mbAuthWait = null;   // 드롭박스 허용 창(m/auth.html)이 보내 주는 코드를 기다림
window.addEventListener('message', e => { const d = e.data; if (mbAuthWait && d && d.ysmAuth && d.state === mbAuthWait.state) { try { e.source && e.source.postMessage({ ysmAuthOk: 1 }, '*'); } catch (x) { } mbAuthWait.done(d.ysmAuth); } });
try { new BroadcastChannel('ysm-auth').onmessage = e => { const d = e.data; if (mbAuthWait && d && d.ysmAuth && d.state === mbAuthWait.state) mbAuthWait.done(d.ysmAuth); }; } catch (e) { }
async function mbConnect() {
  const key = mbKey(); if (!key) { mbAdminDialog(); return; }
  const a = new Uint8Array(48); crypto.getRandomValues(a);
  const ver = b64urlBytes(a), chal = b64urlBytes(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ver))));
  const st = b64urlBytes(crypto.getRandomValues(new Uint8Array(12)));
  const url = `https://www.dropbox.com/oauth2/authorize?${new URLSearchParams({ client_id: key, response_type: 'code', code_challenge: chal, code_challenge_method: 'S256', token_access_type: 'offline', scope: 'files.content.write', redirect_uri: mbRedirect(), state: st })}`;
  let busy = false;
  const finish = async code => {
    if (busy || !code) return; busy = true;
    try {
      const res = await fetch('https://api.dropboxapi.com/oauth2/token', { method: 'POST', body: new URLSearchParams({ code: code.trim(), grant_type: 'authorization_code', code_verifier: ver, client_id: key, redirect_uri: mbRedirect() }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.refresh_token) throw new Error(j.error_description || j.error || `응답 ${res.status}`);
      await mbUploadText(j.access_token, '/connected.txt', `유성 현장 관리 프로그램 — 휴대폰 영수증 사진함 (연결: ${new Date().toLocaleString('ko-KR')})\r\n직원들이 휴대폰 앱으로 보낸 영수증이 inbox 폴더에 들어옵니다. 프로그램이 알아서 읽고 지웁니다.`);
      const c = mbCfg(); c.token = j.refresh_token; c.key = key; c.at = todayStr(); c.atMs = Date.now();
      mbAuthWait = null; closeModal(); save(); render();
      toast('드롭박스에 연결했습니다. 이제 설치 링크를 만들어 직원들에게 보내세요.');
      setTimeout(mbRefind, 5000); setTimeout(mbRefind, 30000);   // 드롭박스가 사진함 폴더를 내려받을 때까지
    } catch (e) { busy = false; toast('드롭박스에 연결하지 못했습니다: ' + e.message); }
  };
  mbAuthWait = { state: st, done: finish };
  window.open(url, 'ysmAuth', 'width=560,height=760');
  modal('드롭박스 연결', `<p>열린 드롭박스 창에서 <b>이 PC 드롭박스와 같은 계정</b>으로 로그인한 뒤 <b>[허용]</b>을 누르세요. 끝나면 자동으로 연결됩니다.</p>
    <p class="muted small">창이 안 열리면 <a href="${esc(url)}" target="ysmAuth">여기</a>를 누르세요. 자동으로 연결되지 않으면, 드롭박스 창 마지막에 나온 <b>연결 코드</b>를 복사해 아래에 붙여 넣으세요.</p>
    <input id="mbCode" class="inp" style="width:100%" placeholder="연결 코드 (자동으로 안 될 때만)" autocomplete="off">`, [
    { label: '취소', onClick: () => { mbAuthWait = null; } },
    { label: '연결', cls: 'primary', onClick: async r => { const v = $('#mbCode', r).value.trim(); if (!v) { toast('연결 코드를 붙여 넣으세요.'); return true; } await finish(v); return true; } }], 's');
}
function mbAdminDialog() {   // 관리자 한 번: 드롭박스 앱 등록 (MB_APP_KEY 를 넣기 전까지 임시로 이 데이터 폴더에 저장)
  const root = modal('관리자: 드롭박스 앱 등록 (처음 한 번)', `
    <p class="small">현장 경리들이 [드롭박스 연결]만 누르면 되도록, 관리자가 <b>처음 한 번</b> 드롭박스에 앱을 등록합니다. (아무 드롭박스 계정이나 가능)</p>
    <ol class="small" style="padding-left:18px">
      <li><a href="https://www.dropbox.com/developers/apps/create" target="_blank" rel="noopener">드롭박스 앱 만들기</a> → <b>Scoped access</b> → <b>App folder</b> → 이름 <code>yusung-receipts</code> (이미 있으면 뒤에 숫자) → Create app.</li>
      <li><b>Permissions</b> 탭 → <b>files.content.write</b> 체크 → 아래 <b>Submit</b>.</li>
      <li><b>Settings</b> 탭 → <b>Redirect URIs</b>에 <code>${esc(mbRedirect())}</code> 넣고 Add.</li>
      <li>같은 화면 <b>Development users</b> → <b>Enable additional users</b> (다른 현장 계정도 연결할 수 있게).</li>
      <li><b>App key</b>를 복사해 아래에 붙여 넣기. 이 키를 Claude에게 알려 주면 프로그램에 넣어 <b>모든 현장에서 자동으로</b> 씁니다.</li>
    </ol>
    <label class="small muted" style="display:block">App key<input id="mbKey" class="inp" style="width:100%;margin-top:4px" value="${esc(mbCfg().appKey)}" autocomplete="off"></label>`, [
    { label: '취소' },
    { label: '저장하고 연결', cls: 'primary', onClick: r => { const v = $('#mbKey', r).value.trim(); if (!/^[a-z0-9]{8,}$/i.test(v)) { toast('App key를 붙여 넣으세요.'); return true; } mbCfg().appKey = v; save(); setTimeout(mbConnect, 0); } }], 'm');
  return root;
}
async function mbRevokeAll() {
  const c = mbCfg();
  if (!confirm('이 PC에서 만든 설치 링크를 모두 막을까요?\n드롭박스 연결을 끊어서, 지금까지 보낸 링크로는 더 이상 사진을 보낼 수 없게 됩니다.\n그 뒤 [드롭박스 연결]을 다시 하고 새 링크를 직원들에게 보내야 합니다.')) return;
  let ok = false;
  try { const at = await mbToken(); const r = await fetch('https://api.dropboxapi.com/2/auth/token/revoke', { method: 'POST', headers: { Authorization: 'Bearer ' + at } }); ok = r.ok; } catch (e) { }
  c.token = ''; c.links.forEach(l => { if (!l.off) { l.off = true; l.offAt = todayStr(); } });
  save(); render();
  toast(ok ? '모든 설치 링크를 막았습니다. 다시 연결한 뒤 새 링크를 보내세요.' : '드롭박스 연결을 끊지 못했습니다 — 드롭박스 → 설정 → 연결된 앱에서 이 앱을 직접 끊으세요. (링크는 프로그램에서 막아 두었습니다)');
}

/* ---------- 설치 링크 ---------- */
const mbLinkOf = siteId => mbCfg().links.find(l => !l.off && l.siteId === siteId);
function mbLinkUrl(l) {
  const c = mbCfg(), sites = l.siteId ? db.sites.filter(s => s.id === l.siteId) : db.sites;
  return `${mbUrlBase()}#k=${b64urlText(JSON.stringify({ v: 1, a: c.key || mbKey(), t: c.token, l: l.id, s: sites.map(s => [s.id, s.name]) }))}`;
}
function mbNewLink(siteId) {
  const c = mbCfg();
  c.links.forEach(l => { if (!l.off && l.siteId === siteId) { l.off = true; l.offAt = todayStr(); } });
  const l = { id: uid(), siteId, at: todayStr() }; c.links.push(l); save(); return l;
}
async function mbCopy(siteId) {
  const c = mbCfg(); if (!c.token) { toast('먼저 [드롭박스 연결]을 하세요.'); return; }
  const l = mbLinkOf(siteId) || mbNewLink(siteId), s = db.sites.find(x => x.id === siteId);
  const who = s ? `${s.name}현장` : '전체 현장';
  const text = `[유성 영수증] ${who} 영수증 보내기 앱\n① 아래 링크를 누르고 이름을 적어 주세요.\n② 홈 화면에 추가하면 앱처럼 쓸 수 있습니다. (카톡 안에서 열리면 [크롬/Safari로 열기])\n※ 이 링크는 회사 직원에게만 — 밖으로 보내지 마세요.\n${mbLinkUrl(l)}`;
  try { await navigator.clipboard.writeText(text); toast(`${who} 설치 링크를 복사했습니다. 카카오톡 단톡방에 붙여 넣으세요.`); }
  catch (e) { prompt('아래 글을 복사해 카카오톡에 붙여 넣으세요.', text); }
  render();
}
function mbPanel() {
  const c = mbCfg(), linked = !!c.token;
  const row = (siteId, name) => {
    const l = mbLinkOf(siteId);
    return `<tr><td>${esc(name)}</td><td>${l ? esc(l.at) : '<span class="muted">아직 없음</span>'}</td>
      <td><button class="btn sm ${l ? '' : 'primary'}" data-act="mbCopy" data-v="${siteId}">${l ? '링크 복사' : '링크 만들기·복사'}</button>
        ${l ? `<button class="btn sm ghost" data-act="mbRenew" data-v="${siteId}" title="이 링크를 막고 새 링크를 만듭니다 (퇴사자·링크 유출 때)">새 링크로 바꾸기</button>
        <button class="btn sm ghost danger" data-act="mbBlock" data-v="${siteId}" title="이 링크로 오는 사진을 받지 않습니다 (링크가 회사 밖으로 퍼졌으면 드롭박스 설정 → [연결된 앱]에서 연결을 끊고 [드롭박스 연결]을 다시 하세요 — 모든 링크에 같은 연결 열쇠가 들어 있음)">막기</button>` : ''}</td></tr>`;
  };
  const off = c.links.filter(l => l.off).length;
  const box = MB.ready ? `📁 ${esc(MB.root.name)}${MB.manual ? '' : ' (자동으로 찾음)'} · 받을 사진 ${MB.n}장`
    : MB.manual ? '직접 고른 폴더 — 권한 필요 <button class="btn sm primary" data-act="mbReopen">권한 허용</button>'
    : mbLost() ? `<span class="bad">못 찾음</span></p><div class="banner warn small" style="margin:0 0 8px">데이터 폴더(📁 ${esc(FS.root ? FS.root.name : '')})가 드롭박스 맨 위 폴더가 아니라서 사진함을 자동으로 찾지 못했습니다.
        <b>드롭박스 → 앱 → yusung-receipts</b> 폴더를 한 번만 골라 주세요.<div class="row" style="margin-top:6px"><button class="btn sm primary" data-act="mbPick">사진함 폴더 고르기</button></div></div><p style="display:none">`
    : '찾는 중… (드롭박스가 앱\\yusung… 폴더를 내려받으면 자동으로 찾습니다)';
  return `<div class="panel"><h3 style="margin-top:0">휴대폰 영수증 앱 <span class="muted small">— 직원이 휴대폰으로 찍은 영수증을 로그인 없이 바로 받기</span></h3>
      ${!linked ? `<div class="banner warn small" style="margin:0 0 8px"><b>처음 한 번</b>: [드롭박스 연결]을 누르고, 열린 창에서 이 PC 드롭박스 계정으로 <b>[허용]</b>만 누르면 됩니다.
          <div class="row" style="margin-top:6px"><button class="btn sm primary" data-act="mbConnect">드롭박스 연결</button></div></div>`
        : `<p class="small">✔ 드롭박스 연결됨 (${esc(c.at || '')}) · 사진함: ${box}${MB.ready ? ' <button class="btn sm" data-act="mbInbox">지금 받기</button>' : ''}</p>
      <b class="small">설치 링크</b> <span class="muted small">— 현장 단톡방에 [링크 복사]한 글을 붙여 넣으세요. 직원은 링크를 누르고 이름만 적으면 됩니다.</span>
      <div class="tbl-wrap" style="margin-top:6px"><table class="t"><thead><tr><th>현장</th><th>링크 만든 날</th><th></th></tr></thead><tbody>
        ${db.sites.map(s => row(s.id, `${s.name}현장`)).join('')}${db.sites.length > 1 ? row('', '전체 현장 (현장을 골라서 보냄)') : ''}</tbody></table></div>
      <p class="muted small">링크를 가진 사람은 사진을 <b>보내기만</b> 할 수 있고, 회사 자료나 보낸 영수증은 볼 수 없습니다. 받은 사진은 [받기]에서 확인한 뒤에만 장부에 들어갑니다.
        퇴사자가 생기면 [새 링크로 바꾸기] → 새 링크를 단톡방에 다시 올리세요.${off ? ` · 막은 링크 ${off}개` : ''}</p>`}
      <details class="small muted"><summary style="cursor:pointer">문제 해결 · 관리자</summary>
        <div class="row" style="margin-top:6px">
          ${linked ? '<button class="btn sm" data-act="mbConnect">드롭박스 다시 연결</button><button class="btn sm ghost danger" data-act="mbRevoke" title="드롭박스 연결을 끊어 이 PC에서 만든 모든 링크를 한 번에 막음">모든 링크 막기</button>' : ''}
          <button class="btn sm" data-act="mbPick" title="사진함을 자동으로 못 찾을 때: 드롭박스\\앱(Apps)\\yusung… 폴더">사진함 폴더 직접 고르기</button>
          ${MB.manual ? `${!MB.ready ? '<button class="btn sm primary" data-act="mbReopen">권한 허용</button>' : ''}<button class="btn sm ghost" data-act="mbAuto">자동으로 찾기</button>` : ''}
          <button class="btn sm ghost" data-act="mbAdmin">관리자: 드롭박스 앱 등록${MB_APP_KEY ? ' (프로그램에 들어 있음)' : ''}</button></div>
        <label style="display:block;margin-top:8px">휴대폰 앱 주소<input class="inp" style="width:100%" id="mbUrl" value="${esc(mbUrlBase())}"></label>
        <button class="btn sm" data-act="mbUrlSave" style="margin-top:6px">주소 저장</button></details></div>`;
}
const MB_ACT = {
  mbConnect: () => mbConnect(),
  mbAdmin: () => mbAdminDialog(),
  mbRevoke: () => mbRevokeAll(),
  mbPick: () => mbPick(),
  mbReopen: () => mbReopen(),
  mbAuto: () => mbAuto(),
  mbInbox: () => mbInbox(),
  mbCopy: el => mbCopy(el.dataset.v || ''),
  mbRenew: el => { const id = el.dataset.v || ''; if (!confirm('지금 링크를 막고 새 링크를 만들까요?\n예전 링크로 보낸 사진은 받을 때 "막은 링크"로 표시됩니다. 새 링크를 단톡방에 다시 올려 주세요.')) return; mbNewLink(id); mbCopy(id); },
  mbBlock: el => { const l = mbLinkOf(el.dataset.v || ''); if (!l || !confirm('이 링크를 막을까요? 이 링크로 오는 사진은 받지 않습니다.')) return; l.off = true; l.offAt = todayStr(); save(); render(); toast('링크를 막았습니다.'); },
  mbUrlSave: () => { const v = ($('#mbUrl').value || '').trim(); if (!/^https:\/\/.+\/$/.test(v)) { toast('https:// 로 시작하고 / 로 끝나는 주소를 넣으세요.'); return; } mbCfg().url = v === MB_URL ? '' : v; save(); render(); toast('앱 주소를 저장했습니다.'); },
};
