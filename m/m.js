/* 유성 영수증 — 휴대폰 앱 (로그인 없이 영수증 사진 보내기)
 * 설치 링크: …/m/#k=<열쇠>  (PC 프로그램 설정 → 휴대폰 앱 에서 만듦. # 뒤는 인터넷 서버로 전송되지 않고 이 휴대폰에만 저장)
 * 열쇠 = { v, a: 드롭박스 앱 키, t: 올리기 전용 토큰, l: 링크 id, s: [[현장 id, 이름], …] }
 * 사진은 회사 드롭박스의 앱 전용 폴더 /inbox 로 올라감: 사진(.jpg) + 같은 이름의 정보(.json).
 * 신호가 없으면 휴대폰에 모아 두었다가 앱을 다시 열거나 인터넷이 연결되면 다시 보냄. */
'use strict';
const M_VER = '2026.11.13-7';
const $ = (s, r = document) => r.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad2 = n => String(n).padStart(2, '0');
const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; };
const fmt = n => Math.round(n || 0).toLocaleString('ko-KR');
const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } };
const UA = navigator.userAgent;
const IS_IOS = /iPad|iPhone|iPod/.test(UA) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const IN_KAKAO = /KAKAOTALK/i.test(UA);
const STANDALONE = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
const KIND = { card: '법인카드', cash: '전도금' };
const PHOTO = { side: 2400, px: 2500000, q: 0.75 };   // PC 프로그램과 같은 크기 (한 장 0.15~0.3MB)

/* ---------- 설치 열쇠 ---------- */
function b64urlText(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '=';
  const bin = atob(s), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(u);
}
function parseKey(text) {
  const m = String(text || '').match(/[#&?]k=([A-Za-z0-9_-]{20,})/); if (!m) return null;
  try { const o = JSON.parse(b64urlText(m[1])); if (o && o.a && o.t && o.l && Array.isArray(o.s)) return o; } catch (e) { }
  return null;
}
let cfg = lsGet('ysm.cfg', null);
let me = lsGet('ysm.me', { name: '', site: '', kind: 'card' });
const S = { photos: [], date: today(), memo: '', amount: '', page: 'main', busy: false, linkBad: lsGet('ysm.bad', false), net: false, q: 0, prompt: null, pasteErr: '' };
function adoptHash() {   // 같은 링크로 다시 열리면(아이폰 홈 화면 앱) 처음 한 번만 받아들임 — 나중에 붙여 넣은 새 링크를 덮어쓰지 않게
  const h = location.hash; if (!/k=/.test(h)) return;
  if (h === lsGet('ysm.hash', '')) return;
  const k = parseKey(h); if (!k) return;
  setCfg(k); lsSet('ysm.hash', h);
  if (!IS_IOS) history.replaceState(null, '', location.pathname);   // 안드로이드는 앱 저장소가 브라우저와 같아서 주소에 남길 필요 없음
}
function setCfg(k) {
  cfg = k; TOK = null; lsSet('ysm.cfg', k); S.linkBad = false; lsSet('ysm.bad', false);
  if (!k.s.some(x => x[0] === me.site)) { me.site = k.s.length === 1 ? k.s[0][0] : ''; saveMe(); }
}
const saveMe = () => lsSet('ysm.me', me);
const siteName = id => ((cfg && cfg.s.find(x => x[0] === id)) || [, ''])[1];

/* ---------- 보낼 사진 모아 두기 (IndexedDB) ---------- */
const qdb = {
  open() { return new Promise((ok, no) => { const r = indexedDB.open('ysm', 1); r.onupgradeneeded = () => r.result.createObjectStore('q', { keyPath: 'id' }); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); }); },
  async tx(mode, fn) { const d = await this.open(); return new Promise((ok, no) => { const t = d.transaction('q', mode); const r = fn(t.objectStore('q')); t.oncomplete = () => ok(r && r.result); t.onerror = () => no(t.error); }); },
  add(v) { return this.tx('readwrite', s => s.put(v)); },
  del(id) { return this.tx('readwrite', s => s.delete(id)); },
  all() { return this.tx('readonly', s => s.getAll()); },
  clear() { return this.tx('readwrite', s => s.clear()); },
};

/* ---------- 드롭박스 ---------- */
let TOK = null, TOKP = null;
function token(force) {   // 여러 장을 동시에 보낼 때 열쇠는 한 번만 받음
  if (!force && TOK && TOK.exp > Date.now() + 60000) return Promise.resolve(TOK.v);
  return TOKP || (TOKP = tokenGet().finally(() => { TOKP = null; }));
}
async function tokenGet() {
  let r;
  try { r = await fetch('https://api.dropboxapi.com/oauth2/token', { method: 'POST', body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: cfg.t, client_id: cfg.a }) }); }
  catch (e) { throw new Error('NET'); }
  if (r.status === 400 || r.status === 401) throw new Error('LINK');
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const j = await r.json(); TOK = { v: j.access_token, exp: Date.now() + (j.expires_in || 14400) * 1000 };
  return TOK.v;
}
async function upload(path, body) {
  for (let a = 0, re401 = false; a < 6; a++) {
    let r;
    try {
      r = await fetch('https://content.dropboxapi.com/2/files/upload', { method: 'POST', body, headers: {
        Authorization: 'Bearer ' + await token(),
        'Dropbox-API-Arg': JSON.stringify({ path, mode: 'add', autorename: true, mute: true }),   // 경로는 영문·숫자만 (헤더에 한글 불가)
        'Content-Type': 'application/octet-stream' } });
    } catch (e) { if (e.message === 'LINK') throw e; throw new Error('NET'); }
    if (r.ok) return;
    if (r.status === 401 && !re401) { re401 = true; TOK = null; continue; }
    if ((r.status === 429 || r.status >= 500) && a < 5) {   // 동시에 보내서 밀림(429)·서버 잠깐 오류 → 조금 쉬고 다시
      const s = Math.min(10, +r.headers.get('Retry-After') || a + 1);
      await new Promise(ok => setTimeout(ok, s * 1000 + Math.random() * 700)); continue;
    }
    throw new Error(r.status === 401 ? 'LINK' : r.status === 429 || r.status >= 500 ? 'NET' : 'HTTP ' + r.status);
  }
  throw new Error('NET');
}

/* ---------- 사진 줄이기 (방향은 브라우저가 맞춰 줌) ---------- */
function loadImg(file) { return new Promise((ok, no) => { const u = URL.createObjectURL(file), im = new Image(); im.onload = () => ok({ im, u }); im.onerror = () => { URL.revokeObjectURL(u); no(new Error('사진을 열 수 없음')); }; im.src = u; }); }
async function shrink(file) {
  try {
    const { im, u } = await loadImg(file);
    const w = im.naturalWidth, h = im.naturalHeight;
    const sc = Math.min(1, PHOTO.side / Math.max(w, h), Math.sqrt(PHOTO.px / (w * h)));
    const c = document.createElement('canvas'); c.width = Math.round(w * sc); c.height = Math.round(h * sc);
    c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(u);
    const b = await new Promise(r => c.toBlob(r, 'image/jpeg', PHOTO.q));
    if (b && b.size > 1000) return { blob: b, ext: 'jpg' };
  } catch (e) { }
  const ext = /png/.test(file.type) ? 'png' : /hei[cf]/i.test(file.type + file.name) ? 'heic' : 'jpg';   // 못 줄이면 원본 그대로
  return { blob: file, ext };
}

/* ---------- 보내기 ---------- */
const stamp = () => { const d = new Date(); return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}-${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`; };
const rand = () => Math.random().toString(36).slice(2, 8);
async function send() {
  if (!S.photos.length || S.busy) return;
  const site = cfg.s.length === 1 ? cfg.s[0][0] : me.site;
  if (!site) { toast('현장을 고르세요.'); return; }
  if (!S.date) { toast('날짜를 넣으세요.'); return; }
  S.busy = true; render();
  const batch = `${stamp()}_${rand()}`, n = S.photos.length, amt = n === 1 ? Math.round(+String(S.amount).replace(/[^\d]/g, '') || 0) : 0;
  try {
    for (let i = 0; i < n; i++) {
      setBusy(`사진 준비 ${i + 1} / ${n}`);
      const ph = S.photos[i], { blob, ext } = ph.blob ? { blob: ph.blob, ext: 'jpg' } : (ph.prep && await ph.prep) || await shrink(ph.file);   // 편집한 사진은 이미 알맞은 크기 · 아니면 미리 줄여 둔 것
      const meta = { v: 1, l: cfg.l, site, siteName: siteName(site), kind: me.kind, date: S.date, amount: amt, memo: S.memo.trim(), by: me.name, at: new Date().toISOString(), batch, n: i + 1, of: n, ext };
      await qdb.add({ id: `${batch}_${i + 1}`, blob, meta });
    }
  } catch (e) { S.busy = false; toast('사진을 저장하지 못했습니다: ' + e.message); render(); return; }
  const log = lsGet('ysm.log', []); log.unshift({ b: batch, at: Date.now(), n, ok: 0, site, kind: me.kind, memo: S.memo.trim() }); lsSet('ysm.log', log.slice(0, 30));
  S.photos.forEach(p => URL.revokeObjectURL(p.url)); S.photos = []; S.memo = ''; S.amount = ''; S.date = today();
  S.busy = false; render();   // 화면은 바로 비움 → 보내는 동안 다음 영수증을 찍어도 됨
  await flushQ(true);
}
// 보내기: 3장씩 동시에 (한 장씩이면 사진·정보 파일 왕복이 장마다 두 번씩 쌓여 느림). 보내는 중에 또 보내면 끝난 뒤 이어서 보냄
const SEND_PAR = 3;
let flushing = false, flushAgain = false;
async function flushQ(loud) {
  if (!cfg) return;
  if (flushing) { flushAgain = true; return; }
  flushing = true; flushAgain = false;
  let items = []; try { items = await qdb.all(); } catch (e) { }
  items.sort((a, b) => a.id.localeCompare(b.id));
  let ok = 0, err = '', next = 0;
  const one = async it => {
    await upload(`/inbox/${it.id}.${it.meta.ext || 'jpg'}`, it.blob);
    await upload(`/inbox/${it.id}.json`, new Blob([JSON.stringify(it.meta)], { type: 'application/json' }));   // 정보는 사진 다음에 (PC 는 정보 파일을 보고 가져감)
    await qdb.del(it.id); ok++;
    const log = lsGet('ysm.log', []), lg = log.find(x => x.b === it.meta.batch); if (lg) { lg.ok++; lsSet('ysm.log', log); }
    if (ok < items.length) setBusy(`${ok} / ${items.length}장`);
  };
  if (items.length) setBusy(`0 / ${items.length}장`);
  await Promise.all(Array.from({ length: Math.min(SEND_PAR, items.length) }, async () => {
    while (!err && next < items.length) { const it = items[next++]; try { await one(it); } catch (e) { err = err || e.message; } }
  }));
  flushing = false; setBusy('');
  if (flushAgain && !err) { if (ok) toast(`영수증 ${ok}장을 보냈습니다.`); return flushQ(loud); }
  S.q = items.length - ok;
  if (err === 'LINK') { S.linkBad = true; lsSet('ysm.bad', true); }
  S.net = err === 'NET';
  if (ok && !err) toast(`영수증 ${ok}장을 보냈습니다.`);
  else if (err === 'NET' && loud) toast(`인터넷이 안 돼서 ${S.q}장을 휴대폰에 모아 두었습니다. 연결되면 자동으로 보냅니다.`);
  else if (err === 'LINK') toast('설치 링크가 막혔습니다. 경리에게 새 링크를 받으세요.');
  else if (err) toast('보내지 못했습니다: ' + err);
  render();
}
function setBusy(t) {   // 보내는 중 표시 (위 안내 줄) — 보내기 단추는 막지 않음
  S.sendTxt = t; const n = $('#sendNote');
  if (n) { n.style.display = t ? '' : 'none'; n.querySelector('b').textContent = t; }
}

/* ---------- 화면 ---------- */
let toastT = 0;
function toast(msg) { let el = $('.toast'); if (!el) { el = document.createElement('div'); el.className = 'toast'; document.body.appendChild(el); } el.textContent = msg; clearTimeout(toastT); toastT = setTimeout(() => el.remove(), 3200); }
function installNote() {
  if (STANDALONE || lsGet('ysm.noInstall', false)) return '';
  if (IN_KAKAO) return `<div class="note warn"><b>카카오톡 안에서 열렸습니다.</b><br>홈 화면에 앱으로 추가하려면 ${IS_IOS ? 'Safari' : '크롬'}로 여세요.
    <a class="btn" href="kakaotalk://web/openExternal?url=${encodeURIComponent(location.href)}">${IS_IOS ? 'Safari' : '크롬'}로 열기</a></div>`;
  const how = IS_IOS ? '화면 아래(또는 위)의 <b>공유 버튼 ⬆️</b> → <b>홈 화면에 추가</b>' : '오른쪽 위 <b>⋮ 메뉴</b> → <b>홈 화면에 추가</b>(또는 앱 설치)';
  return `<div class="note info"><b>홈 화면에 추가하면 앱처럼 바로 열 수 있습니다.</b><br>${how}
    ${S.prompt ? '<button class="btn pri" id="instBtn" type="button">홈 화면에 추가</button>' : ''}
    <button class="btn" id="noInstBtn" type="button">다시 보지 않기</button></div>`;
}
function setupView(msg) {
  return `${msg ? `<div class="note bad">${msg}</div>` : ''}
  <div class="card"><h2>처음 설정</h2>
    <p style="margin-top:0">경리에게 받은 <b>설치 링크</b>를 누르면 바로 시작됩니다.</p>
    <p class="muted">홈 화면 앱으로 열었는데 이 화면이 나오면: 카카오톡에서 설치 링크를 <b>길게 눌러 복사</b>한 뒤 아래에 붙여 넣으세요.</p>
    <label for="pasteIn">설치 링크</label><textarea id="pasteIn" placeholder="https://…/m/#k=…"></textarea>
    ${S.pasteErr ? `<p class="muted" style="color:var(--bad)">${esc(S.pasteErr)}</p>` : ''}
    <button class="btn pri" id="pasteBtn" type="button" style="margin-top:10px">시작하기</button></div>`;
}
function nameView() {
  return `<div class="card"><h2>내 이름</h2>
    <p style="margin-top:0">영수증을 누가 보냈는지 경리가 알 수 있게 이름을 적어 주세요. (처음 한 번)</p>
    <input id="nameIn" value="${esc(me.name)}" placeholder="예: 홍길동 소장" autocomplete="name">
    <button class="btn pri" id="nameBtn" type="button" style="margin-top:10px">저장</button></div>`;
}
function mainView() {
  const one = cfg.s.length === 1, log = lsGet('ysm.log', []);
  const thumbs = S.photos.map((p, i) => `<div class="th" data-pid="${p.id}"><span><img src="${p.url}" alt="" data-edit="${i}"><b>${i + 1}</b>${thLabel(p)}</span>
    <div><button type="button" class="ed" data-edit="${i}">✂ 편집</button><button type="button" class="dl" data-del="${i}">🗑 빼기</button></div></div>`).join('');
  return `${S.linkBad ? `<div class="note bad"><b>설치 링크가 막혔습니다.</b><br>경리에게 새 링크를 받아 누르세요. 보내지 못한 사진 ${S.q}장은 휴대폰에 남아 있고, 새 링크를 받으면 다시 보냅니다.<button class="btn" id="goSetBtn" type="button">새 링크 붙여 넣기</button></div>` : ''}
  ${!S.linkBad && S.q ? `<div class="note warn">보내지 못한 사진 <b>${S.q}장</b>이 휴대폰에 있습니다.${S.net ? ' (인터넷 연결 확인)' : ''}<button class="btn" id="retryBtn" type="button">다시 보내기</button></div>` : ''}
  ${installNote()}
  <div class="note info" id="sendNote" style="${S.sendTxt ? '' : 'display:none'}">📤 보내는 중… <b>${esc(S.sendTxt || '')}</b><br><span style="font-size:13px">기다리지 않고 다음 영수증을 찍어도 됩니다.</span></div>
  <div class="card"><h2>현장</h2>
    ${one ? `<div class="site">${esc(cfg.s[0][1])}현장</div>` : `<select id="siteSel"><option value="">— 현장 고르기 —</option>${cfg.s.map(([id, nm]) => `<option value="${esc(id)}" ${id === me.site ? 'selected' : ''}>${esc(nm)}</option>`).join('')}</select>`}
  </div>
  <div class="card"><h2>영수증 사진</h2>
    <div class="btns"><button class="btn pri big" id="camBtn" type="button">📷 찍기</button><button class="btn big" id="picBtn" type="button">🖼 사진첩</button></div>
    ${S.photos.length ? `<div class="thumbs" style="margin-top:10px">${thumbs}</div>${autoBtnHtml()}<p class="muted" style="margin:6px 0 0">${S.photos.length}장 · [✨ 자동 편집] = 모두 반듯하게 잘라 깨끗하게 · 한 장만 고칠 때는 [✂ 편집]</p>` :'<p class="muted" style="margin:8px 0 0">글자가 잘 보이게, 영수증 전체가 나오게 찍어 주세요.</p>'}
  </div>
  <div class="card"><h2>결제</h2>
    <div class="seg">${Object.entries(KIND).map(([k, l]) => `<button type="button" data-kind="${k}" class="${me.kind === k ? 'on' : ''}">${l}</button>`).join('')}</div>
    <label for="dateIn">사용한 날짜</label><input type="date" id="dateIn" value="${esc(S.date)}" max="${today()}">
    ${S.photos.length === 1 ? `<label for="amtIn">금액 (몰라도 됨)</label><input id="amtIn" inputmode="numeric" value="${esc(S.amount)}" placeholder="예: 32000">` : ''}
    <label for="memoIn">사용 내역 (선택)</label><input id="memoIn" value="${esc(S.memo)}" placeholder="예: 직원 4명 점심, 현장 소모품">
  </div>
  <button class="btn pri big" id="sendBtn" type="button" ${S.photos.length && !S.busy ? '' : 'disabled'}>${S.photos.length ? `영수증 ${S.photos.length}장 보내기` : '사진을 먼저 찍으세요'}</button>
  ${log.length ? `<div class="card" style="margin-top:12px"><h2>보낸 기록</h2><ul class="log">${log.slice(0, 10).map(x => {
    const d = new Date(x.at); return `<li><span>${pad2(d.getMonth() + 1)}/${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())} · ${esc(siteName(x.site) || '')} ${KIND[x.kind] || ''}${x.memo ? ' · ' + esc(x.memo) : ''}</span><b style="white-space:nowrap;color:${x.ok >= x.n ? 'var(--ok)' : 'var(--warn)'}">${x.ok >= x.n ? `✓ ${x.n}장` : `${x.ok}/${x.n} 대기`}</b></li>`; }).join('')}</ul></div>` : ''}`;
}
function settingsView() {
  return `<div class="card"><h2>설정</h2>
    <label for="nameIn">내 이름</label><input id="nameIn" value="${esc(me.name)}">
    <button class="btn" id="nameBtn" type="button" style="margin-top:10px">이름 저장</button>
    <p class="muted" style="margin:14px 0 4px">연결된 현장: ${cfg.s.map(x => esc(x[1])).join(', ') || '-'}</p>
    <button class="btn" id="goSetBtn" type="button">새 설치 링크 붙여 넣기</button>
    ${S.q ? `<button class="btn" id="qClrBtn" type="button" style="margin-top:10px;color:var(--bad)">보내지 못한 사진 ${S.q}장 삭제</button>` : ''}
    <p class="muted" style="margin:14px 0 0">버전 ${M_VER} · 사진은 회사 드롭박스로만 보내지고, 보낸 뒤에는 이 휴대폰에 남지 않습니다.</p></div>
  <button class="btn" id="backBtn" type="button">← 돌아가기</button>`;
}
function render() {
  const app = $('#app'), menu = $('#menuBtn');
  menu.classList.toggle('hide', !cfg || !me.name);
  menu.textContent = S.page === 'settings' ? '✕' : '⚙';
  if (!cfg) app.innerHTML = setupView();
  else if (S.page === 'setup') app.innerHTML = setupView() + '<button class="btn" id="backBtn" type="button">← 돌아가기</button>';
  else if (!me.name) app.innerHTML = nameView();
  else if (S.page === 'settings') app.innerHTML = settingsView();
  else app.innerHTML = mainView();
  bind();
}
function bind() {
  const on = (id, f) => { const el = $('#' + id); if (el) el.onclick = f; };
  on('pasteBtn', () => {
    const k = parseKey($('#pasteIn').value);
    if (!k) { S.pasteErr = '설치 링크가 아닙니다. 카카오톡에서 링크 전체를 복사해 붙여 넣으세요.'; render(); return; }
    S.pasteErr = ''; setCfg(k); S.page = 'main'; render(); toast('설치 링크를 받았습니다.'); flushQ();
  });
  on('nameBtn', () => { const v = $('#nameIn').value.trim(); if (v.length < 2) { toast('이름을 적어 주세요.'); return; } me.name = v; saveMe(); S.page = 'main'; render(); toast('저장했습니다.'); });
  on('goSetBtn', () => { S.page = 'setup'; render(); });
  on('backBtn', () => { S.page = 'main'; render(); });
  on('retryBtn', () => flushQ(true));
  on('qClrBtn', async () => { if (!confirm(`보내지 못한 사진 ${S.q}장을 삭제할까요? (경리에게 가지 않습니다)`)) return; await qdb.clear(); S.q = 0; render(); });
  on('camBtn', camShoot);
  on('autoBtn', autoAll);
  on('picBtn', () => $('#picIn').click());
  on('sendBtn', send);
  on('noInstBtn', () => { lsSet('ysm.noInstall', true); render(); });
  on('instBtn', async () => { const p = S.prompt; S.prompt = null; if (p) { p.prompt(); try { await p.userChoice; } catch (e) { } } render(); });
  document.querySelectorAll('[data-del]').forEach(b => b.onclick = () => { const [p] = S.photos.splice(+b.dataset.del, 1); URL.revokeObjectURL(p.url); render(); });
  document.querySelectorAll('[data-edit]').forEach(im => im.onclick = () => { const p = S.photos[+im.dataset.edit]; if (p) editPhoto(p); });
  document.querySelectorAll('[data-kind]').forEach(b => b.onclick = () => { me.kind = b.dataset.kind; saveMe(); render(); });
  const site = $('#siteSel'); if (site) site.onchange = () => { me.site = site.value; saveMe(); };
  const inp = (id, k) => { const el = $('#' + id); if (el) el.oninput = () => { S[k] = el.value; }; };
  inp('dateIn', 'date'); inp('memoIn', 'memo'); inp('amtIn', 'amount');
}
/* 사진마다 스캔 편집(scan.js): 모서리 맞추기 → 반듯하게 → 문서 보정. 원본(file)은 남겨 두어 다시 고칠 수 있음 */
async function editPhoto(p) {
  let r; try { r = await Scan.open(p.file, p.edit, { del: true }); } catch (e) { toast('편집 화면을 열지 못했습니다: ' + e.message); return; }
  if (r === 'del') { const i = S.photos.indexOf(p); if (i >= 0) S.photos.splice(i, 1); URL.revokeObjectURL(p.url); }
  else if (r && r.blob) { URL.revokeObjectURL(p.url); p.blob = r.blob; p.edit = r.edit; p.auto = false; p.busy = false; p.url = URL.createObjectURL(r.blob); }
  render();
}
function autoBtnHtml() {
  const busy = S.photos.filter(p => p.busy).length, todo = S.photos.filter(p => !p.blob && !p.busy).length;
  if (busy) return `<button class="btn big" id="autoBtn" type="button" disabled style="margin-top:10px">✨ 자동 편집 중… (${busy}장 남음)</button>`;
  if (todo) return `<button class="btn big" id="autoBtn" type="button" style="margin-top:10px;background:var(--accent-soft);border-color:var(--accent);color:var(--accent)">✨ 자동 편집 (${todo}장)</button>`;
  return '';
}
const thLabel = p => (p.busy ? '<em class="wk">정리 중…</em>' : p.auto ? '<em class="au">자동 편집</em>' : p.edit ? '<em>편집함</em>' : '<em></em>');
/* 📷 찍기: 앱 안 카메라로 연속 촬영 (cam.js) → 안 되면 휴대폰 카메라 (한 장씩) */
async function camShoot() {
  if (typeof Cam === 'undefined' || !Cam.ok()) { $('#camIn').click(); return; }
  const files = await Cam.open({ fallback: () => $('#camIn').click() });
  if (files.length) addFiles(files);
}
/* [✨ 자동 편집] 을 누르면 편집 화면 없이 자동으로 정리 (모서리 찾기·반듯하게·보정) — 한 장씩 차례로 (휴대폰이 버벅이지 않게).
 * 사진을 넣을 때는 원본 그대로 (줄이기만 미리). p.prep = 보낼 때 기다릴 것. 정리하다 실패하면 줄이기만 */
let autoQ = Promise.resolve(), pidN = 0;
function autoFix(p) {
  p.busy = true;
  p.prep = autoQ = autoQ.then(async () => {
    if (S.photos.includes(p) && !p.blob) {
      try {
        if (typeof Scan === 'undefined') throw new Error('no scan');
        const r = await Scan.auto(p.file);
        if (!p.blob) { URL.revokeObjectURL(p.url); p.blob = r.blob; p.edit = r.edit; p.auto = true; p.url = URL.createObjectURL(r.blob); }
      } catch (e) { }
    }
    p.busy = false; thumbUpd(p);
    return p.blob ? { blob: p.blob, ext: 'jpg' } : null;
  });
}
function thumbUpd(p) {   // 입력 중이면 그 사진 칸만 고침 (화면을 다시 그리면 글자 입력이 끊김)
  const a = document.activeElement;
  if (!(a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName))) { render(); return; }
  const el = document.querySelector(`[data-pid="${p.id}"]`); if (!el) return;
  el.querySelector('img').src = p.url; const em = el.querySelector('em'); if (em) em.outerHTML = thLabel(p);
  const ab = $('#autoBtn'); if (ab) { ab.outerHTML = autoBtnHtml() || '<span></span>'; const nb = $('#autoBtn'); if (nb) nb.onclick = autoAll; }
}
async function addFiles(list) {
  for (const f of list) if (/^image\//.test(f.type) || /\.(jpe?g|png|heic|heif|webp)$/i.test(f.name)) {
    const p = { id: ++pidN, file: f, url: URL.createObjectURL(f) }; S.photos.push(p); p.prep = shrink(f);   // 미리 줄여 둠 → [보내기] 바로 시작
  }
  render();
}
function autoAll() {   // 아직 편집하지 않은 사진 모두 자동 편집
  const todo = S.photos.filter(p => !p.blob && !p.busy); if (!todo.length) return;
  todo.forEach(autoFix); render();
}
$('#camIn').onchange = e => { addFiles([...e.target.files]); e.target.value = ''; };
$('#picIn').onchange = e => { addFiles([...e.target.files]); e.target.value = ''; };
$('#menuBtn').onclick = () => { S.page = S.page === 'settings' ? 'main' : 'settings'; render(); };
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); S.prompt = e; render(); });
window.addEventListener('online', () => flushQ());
document.addEventListener('visibilitychange', () => { if (!document.hidden) flushQ(); });
window.addEventListener('hashchange', () => { adoptHash(); render(); flushQ(); });

if (!IS_IOS) { const l = document.createElement('link'); l.rel = 'manifest'; l.href = 'manifest.json'; document.head.appendChild(l); }
if ('serviceWorker' in navigator && /^https:/.test(location.protocol)) navigator.serviceWorker.register('../sw.js').catch(() => { });
adoptHash();
render();
qdb.all().then(a => { S.q = a.length; if (a.length) flushQ(); else render(); }).catch(() => { });
