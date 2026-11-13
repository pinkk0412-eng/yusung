/* 유성 영수증 — 연속 촬영 카메라 (앱 안 카메라: 셔터를 계속 눌러 여러 장 → [완료] 한 번)
 * Cam.open({ fallback }) → File[] (닫기 = 빈 목록). 카메라를 못 열면 [휴대폰 카메라로 찍기] → fallback() (누른 그 자리에서 불러야 iOS 가 막지 않음) */
'use strict';
const Cam = (() => {
  const css = `.cam-wrap{position:fixed;inset:0;z-index:9000;background:#000;color:#fff;display:flex;flex-direction:column;touch-action:manipulation;user-select:none;-webkit-user-select:none}
.cam-wrap button{font-family:inherit;cursor:pointer}
.cam-top{display:flex;align-items:center;gap:8px;padding:10px 12px;padding-top:calc(10px + env(safe-area-inset-top))}
.cam-top span{flex:1;text-align:center;font-size:14px;line-height:1.35}
.cam-top button{min-height:42px;min-width:64px;border-radius:10px;border:1px solid #444;background:#222;color:#fff;font-size:15px;font-weight:600;padding:0 12px}
.cam-top button.on{background:#ffd54a;color:#111;border-color:#ffd54a}
.cam-top .ph{display:none}
.cam-top button.ic{min-width:46px;padding:0 8px;font-size:18px}
.cam-mid{flex:1;position:relative;min-height:0;overflow:hidden}
.cam-mid video{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:#000}
.cam-flash{position:absolute;inset:0;background:#fff;opacity:0;pointer-events:none;transition:opacity .3s}
.cam-flash.on{opacity:.75;transition:none}
.cam-err{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:24px;text-align:center;font-size:15px;line-height:1.55}
.cam-err button{min-height:52px;border-radius:12px;border:0;background:#2b59c3;color:#fff;font-size:17px;font-weight:700;padding:0 20px}
.cam-bot{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:10px;padding:14px 18px;padding-bottom:calc(18px + env(safe-area-inset-bottom))}
.cam-last{justify-self:start;width:58px;height:58px;border-radius:10px;border:2px solid #fff;overflow:hidden;position:relative;background:#1a1a1a}
.cam-last img{width:100%;height:100%;object-fit:cover;display:block}
.cam-last b{position:absolute;left:0;right:0;bottom:0;background:rgba(0,0,0,.7);font-size:12px;text-align:center;line-height:18px}
.cam-shot{width:80px;height:80px;border-radius:50%;border:5px solid #fff;background:#fff;box-shadow:inset 0 0 0 4px #000;padding:0}
.cam-shot:active{transform:scale(.9)}
.cam-shot:disabled{opacity:.4}
.cam-done{justify-self:end;min-height:52px;border-radius:12px;border:0;background:#2b59c3;color:#fff;font-size:16px;font-weight:700;padding:0 16px;white-space:nowrap}
.cam-done:disabled{background:#2a2a2a;color:#777}`;
  let styled = false;
  const ok = () => !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);

  function open(opt = {}) {
    if (!styled) { const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s); styled = true; }
    const wrap = document.createElement('div'); wrap.className = 'cam-wrap';
    wrap.innerHTML = `<div class="cam-top"><button type="button" data-a="x">✕ 닫기</button><span data-msg>카메라 켜는 중…</span><button type="button" data-a="flip" class="ic ph" aria-label="카메라 바꾸기" title="앞·뒤 카메라 바꾸기">🔄</button><button type="button" data-a="torch" class="ic ph" aria-label="손전등">🔦</button></div>
      <div class="cam-mid"><video playsinline muted autoplay></video><div class="cam-flash"></div></div>
      <div class="cam-bot"><div class="cam-last" data-last style="visibility:hidden"><img alt=""><b></b></div>
        <button type="button" class="cam-shot" data-a="shot" aria-label="찍기" disabled></button>
        <button type="button" class="cam-done" data-a="done" disabled>완료</button></div>`;
    document.body.appendChild(wrap);
    const $w = q => wrap.querySelector(q), video = $w('video'), msg = $w('[data-msg]');
    const shots = [], pend = []; let stream = null, track = null, torch = false, lastUrl = '', cnt = 0;

    const stop = () => { if (stream) stream.getTracks().forEach(t => t.stop()); stream = track = null; };
    // 뒤 카메라로 열기: 전에 고른 카메라 → 뒤 카메라(꼭) → 뒤 카메라(되면) → 아무거나. 그래도 앞(셀카)이 잡히면 이름에 '뒤'가 있는 카메라로 바꿈
    const camKey = 'ysm.camId', getId = () => { try { return localStorage.getItem(camKey) || ''; } catch (e) { return ''; } };
    const setId = v => { try { v ? localStorage.setItem(camKey, v) : localStorage.removeItem(camKey); } catch (e) { } };
    const SIZE = { width: { ideal: 2560 }, height: { ideal: 1920 } };
    const gum = v => navigator.mediaDevices.getUserMedia({ audio: false, video: { ...SIZE, ...v } });
    const cams = async () => { try { return (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput'); } catch (e) { return []; } };
    const BACK = /back|rear|environment|후면|뒤/i, FRONT = /front|user|face|전면|앞/i;
    async function openStream(devId) {
      const tries = devId ? [{ deviceId: { exact: devId } }] : [];
      tries.push({ facingMode: { exact: 'environment' } }, { facingMode: { ideal: 'environment' } }, {});
      let err;
      for (const v of tries) {
        try { return await gum(v); }
        catch (e) { err = e; if (e && (e.name === 'NotAllowedError' || e.name === 'SecurityError')) break; }   // 권한 거절이면 더 해 봐야 소용없음
      }
      throw err;
    }
    async function start(devId) {
      stop();
      try {
        const saved = devId || getId();
        stream = await openStream(saved);
        track = stream.getVideoTracks()[0];
        let st = {}; try { st = track.getSettings ? track.getSettings() : {}; } catch (e) { }
        if (!saved && (st.facingMode === 'user' || FRONT.test(track.label || ''))) {   // 셀카 쪽이 열림 → 뒤 카메라 찾아 다시
          const back = (await cams()).find(d => BACK.test(d.label) && !FRONT.test(d.label));
          if (back) { try { const s2 = await gum({ deviceId: { exact: back.deviceId } }); stop(); stream = s2; track = s2.getVideoTracks()[0]; } catch (e) { } }
        }
        $w('[data-a="flip"]').classList.toggle('ph', (await cams()).length < 2); video.srcObject = stream; video.play().catch(() => { });   // 기다리지 않음 (재생 알림이 늦게 오는 휴대폰이 있음 — 찍을 때 화면 크기로 확인)
        msg.textContent = '영수증 한 장을 화면에 크게 담고 ⚪ 를 누르세요. 다 찍으면 [완료]';
        $w('[data-a="shot"]').disabled = false;
        let caps = {}; try { caps = track.getCapabilities ? track.getCapabilities() : {}; } catch (e) { }
        $w('[data-a="torch"]').classList.toggle('ph', !caps.torch);   // 손전등은 되는 휴대폰만 (주로 안드로이드)
      } catch (e) {
        stop(); $w('[data-a="shot"]').disabled = true; msg.textContent = '';
        const err = document.createElement('div'); err.className = 'cam-err';
        err.innerHTML = `<div>앱 안 카메라를 열 수 없습니다.<br><span style="color:#aaa;font-size:13px">(카메라 권한을 허용하지 않았거나, 카카오톡 안에서 열었거나, 휴대폰이 지원하지 않음)</span></div><button type="button">📷 휴대폰 카메라로 찍기</button><div style="color:#aaa;font-size:13px">한 장씩 찍힙니다</div>`;
        err.querySelector('button').onclick = () => { if (opt.fallback) opt.fallback(); close([]); };
        $w('.cam-mid').appendChild(err);
      }
    }
    function shoot() {
      if (!video.videoWidth) return;
      const c = document.createElement('canvas'); c.width = video.videoWidth; c.height = video.videoHeight;
      c.getContext('2d').drawImage(video, 0, 0);
      const fl = $w('.cam-flash'); fl.classList.add('on'); requestAnimationFrame(() => requestAnimationFrame(() => fl.classList.remove('on')));
      try { if (navigator.vibrate) navigator.vibrate(30); } catch (e) { }
      const n = ++cnt;
      pend.push(new Promise(r => c.toBlob(r, 'image/jpeg', 0.92)).then(b => {
        if (b) shots.push(new File([b], `cam_${Date.now()}_${n}.jpg`, { type: 'image/jpeg', lastModified: Date.now() }));
        if (b) { if (lastUrl) URL.revokeObjectURL(lastUrl); lastUrl = URL.createObjectURL(b); $w('[data-last] img').src = lastUrl; }
      }));
      $w('[data-last]').style.visibility = ''; $w('[data-last] b').textContent = `${n}장`;
      const d = $w('[data-a="done"]'); d.disabled = false; d.textContent = `완료 (${n}장)`;
    }
    let done;
    const close = r => { stop(); document.removeEventListener('visibilitychange', onVis); if (lastUrl) URL.revokeObjectURL(lastUrl); wrap.remove(); done(r); };
    const onVis = () => { if (!document.hidden && (!track || track.readyState === 'ended')) start(); };   // 다른 앱 갔다 오면 카메라 다시 켜기
    document.addEventListener('visibilitychange', onVis);
    $w('[data-a="shot"]').onclick = shoot;
    $w('[data-a="done"]').onclick = async () => { await Promise.all(pend); close(shots.slice()); };
    $w('[data-a="x"]').onclick = async () => {
      const n = cnt;
      if (n && !confirm(`찍은 ${n}장을 버리고 닫을까요?\n(보내려면 [완료]를 누르세요)`)) return;
      close([]);
    };
    $w('[data-a="flip"]').onclick = async () => {   // 다음 카메라로 → 고른 카메라는 다음에 열 때도 씀
      const list = await cams(); if (list.length < 2) return;
      let cur = ''; try { cur = track ? track.getSettings().deviceId || '' : ''; } catch (e) { }
      const i = list.findIndex(d => d.deviceId === cur), nx = list[(i + 1) % list.length];
      setId(FRONT.test(nx.label || '') ? '' : nx.deviceId); torch = false;   // 셀카 쪽은 기억하지 않음 (다음엔 다시 뒤 카메라로)
      $w('[data-a="torch"]').classList.remove('on'); start(nx.deviceId);
    };
    $w('[data-a="torch"]').onclick = async e => {
      const btn = e.currentTarget; if (!track) return; torch = !torch;
      try { await track.applyConstraints({ advanced: [{ torch }] }); btn.classList.toggle('on', torch); } catch (er) { torch = !torch; }
    };
    const p = new Promise(r => { done = r; });
    start();
    return p;
  }
  return { open, ok };
})();
