/* 영수증 글자 인식 (오프라인)
 * - tesseract.js-core(WASM) + 한글 학습데이터를 이 폴더의 js 파일에서 읽어 백그라운드(Worker)로 실행
 * - 인터넷 연결·설치·비용 없음. 처음 한 번 준비에 몇 초 걸리고, 이후 장당 2~5초
 * - 사용: const text = await ReceiptOCR.read(file)
 */
(function () {
  const base = ((document.currentScript && document.currentScript.src) || '').replace(/[^/]*$/, '');
  let worker = null, ready = null, seq = 0;
  const pend = {};

  function loadScript(src) {
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src; s.onload = res; s.onerror = () => rej(new Error('글자 인식 파일을 읽을 수 없습니다: ' + src.split('/').pop()));
      document.head.appendChild(s);
    });
  }
  function call(msg, transfer) {
    return new Promise((res, rej) => { const id = ++seq; pend[id] = { res, rej }; worker.postMessage(Object.assign({}, msg, { id }), transfer || []); });
  }

  const WORKER_BODY = `
let M = null, api = null;
onmessage = async (e) => {
  const d = e.data;
  try {
    if (d.type === 'init') {
      M = await TesseractCore();
      const res = new Response(new Blob([d.kor]).stream().pipeThrough(new DecompressionStream('gzip')));
      M.FS.writeFile('./kor.traineddata', new Uint8Array(await res.arrayBuffer()));
      api = new M.TessBaseAPI();
      if (api.Init(null, 'kor') === -1) throw new Error('한글 인식 데이터를 불러오지 못했습니다');
      postMessage({ id: d.id });
    } else if (d.type === 'rec') {
      M.FS.writeFile('/input', d.img);
      if (api.SetImageFile(1, 0) === 1) throw new Error('이미지를 읽을 수 없습니다');
      api.Recognize(null);
      postMessage({ id: d.id, text: api.GetUTF8Text() });
    }
  } catch (err) { postMessage({ id: d.id, error: String((err && err.message) || err) }); }
};`;

  async function start() {
    if (!window.OCR_CORE_SRC) await loadScript(base + 'ocr-core.js');
    if (!window.OCR_KOR_GZ) await loadScript(base + 'ocr-kor.js');
    const url = URL.createObjectURL(new Blob([window.OCR_CORE_SRC, '\n', WORKER_BODY], { type: 'text/javascript' }));
    worker = new Worker(url);
    worker.onmessage = (e) => { const p = pend[e.data.id]; if (!p) return; delete pend[e.data.id]; if (e.data.error) p.rej(new Error(e.data.error)); else p.res(e.data); };
    worker.onerror = (e) => { Object.keys(pend).forEach(k => { pend[k].rej(new Error(e.message || '글자 인식 오류')); delete pend[k]; }); };
    const kor = Uint8Array.from(atob(window.OCR_KOR_GZ), c => c.charCodeAt(0));
    await call({ type: 'init', kor }, [kor.buffer]);
    window.OCR_CORE_SRC = null; window.OCR_KOR_GZ = null;   // 메모리 정리 (Worker 안에 이미 올라감)
  }

  // 사진 → 흑백 PNG (긴 변 최대 2400px, 작은 이미지는 2배 확대해 글자를 키움)
  async function prep(file) {
    const bmp = await createImageBitmap(file);
    const long = Math.max(bmp.width, bmp.height);
    const scale = long > 2400 ? 2400 / long : long < 1000 ? 2 : 1;
    const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.drawImage(bmp, 0, 0, w, h);
    const px = g.getImageData(0, 0, w, h), a = px.data;
    for (let i = 0; i < a.length; i += 4) { const y = 0.299 * a[i] + 0.587 * a[i + 1] + 0.114 * a[i + 2]; a[i] = a[i + 1] = a[i + 2] = y; }
    g.putImageData(px, 0, 0);
    const blob = await new Promise(r => cv.toBlob(r, 'image/png'));
    return new Uint8Array(await blob.arrayBuffer());
  }

  window.ReceiptOCR = {
    // 준비(엔진 로드)만 미리 해 두기
    warm() { if (!ready) ready = start().catch(e => { ready = null; throw e; }); return ready; },
    async read(file) {
      await this.warm();
      const img = await prep(file);
      const r = await call({ type: 'rec', img }, [img.buffer]);
      return r.text || '';
    },
  };
})();
