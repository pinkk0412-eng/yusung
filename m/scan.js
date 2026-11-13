/* 유성 영수증 — 스캔 편집 (스캔 앱처럼): 영수증 네 모서리 자동 찾기 → 손가락으로 맞추기 → 반듯하게 펴기 → 문서 보정
 * Scan.open(file, prev) → Promise: { blob, edit } 완료 / 'orig' 원본 그대로 / 'del' 빼기
 * 문서 보정은 PC 프로그램 02_receipt.js rcEnhance 와 같은 방식 (종이 밝기로 나눠 그림자 없애고 글자 진하게) */
'use strict';
const Scan = (() => {
  const OUT_PX = 2500000, SRC_SIDE = 3000;
  const MODES = [['doc', '문서(흑백)'], ['color', '컬러 선명'], ['raw', '원본 그대로']];
  const newCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };
  const grayOf = c => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data, g = new Float32Array(c.width * c.height); for (let i = 0, j = 0; j < g.length; i += 4, j++) g[j] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; return g; };
  const pctOf = (arr, p, max = 256) => { const h = new Uint32Array(max); for (let i = 0; i < arr.length; i++) h[Math.min(max - 1, Math.max(0, arr[i] | 0))]++; let acc = 0; const need = arr.length * p / 100; for (let v = 0; v < max; v++) { acc += h[v]; if (acc >= need) return v; } return max - 1; };
  const scaled = (c, side) => { const k = Math.min(1, side / Math.max(c.width, c.height)); if (k === 1) return c; const o = newCanvas(c.width * k, c.height * k); o.getContext('2d').drawImage(c, 0, 0, o.width, o.height); return o; };

  async function loadCanvas(file) {   // 방향(EXIF)은 브라우저가 맞춰 줌
    const u = URL.createObjectURL(file);
    try {
      const im = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error('사진을 열 수 없습니다')); i.src = u; });
      const k = Math.min(1, SRC_SIDE / Math.max(im.naturalWidth, im.naturalHeight));
      const c = newCanvas(im.naturalWidth * k, im.naturalHeight * k); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); return c;
    } finally { URL.revokeObjectURL(u); }
  }
  function rotate(c) { const o = newCanvas(c.height, c.width), x = o.getContext('2d'); x.translate(o.width, 0); x.rotate(Math.PI / 2); x.drawImage(c, 0, 0); return o; }
  const full = c => [[0, 0], [c.width, 0], [c.width, c.height], [0, c.height]];

  function convexHull(p) {   // 모노톤 체인
    p = p.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]); if (p.length < 3) return p;
    const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]), lo = [], up = [];
    for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
    for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
    return lo.slice(0, -1).concat(up.slice(0, -1));
  }
  function minRect(pts) {   // 점들을 감싸는 가장 작은 기울어진 직사각형 (볼록 껍질 각 변 방향으로)
    const hull = convexHull(pts); if (hull.length < 3) return null; let best = null;
    for (let i = 0; i < hull.length; i++) {
      const [x1, y1] = hull[i], [x2, y2] = hull[(i + 1) % hull.length], l = Math.hypot(x2 - x1, y2 - y1); if (!l) continue;
      const ux = (x2 - x1) / l, uy = (y2 - y1) / l; let a0 = 1e9, a1 = -1e9, b0 = 1e9, b1 = -1e9;
      for (const [x, y] of hull) { const a = x * ux + y * uy, b = -x * uy + y * ux; if (a < a0) a0 = a; if (a > a1) a1 = a; if (b < b0) b0 = b; if (b > b1) b1 = b; }
      const ar = (a1 - a0) * (b1 - b0);
      if (!best || ar < best.ar) best = { ar, pts: [[a0, b0], [a1, b0], [a1, b1], [a0, b1]].map(([a, b]) => [a * ux - b * uy, a * uy + b * ux]) };
    }
    return best && best.pts;
  }
  const maxSkew = q => Math.max(...q.map((b, i) => { const a = q[(i + 3) % 4], c = q[(i + 1) % 4], v1 = [a[0] - b[0], a[1] - b[1]], v2 = [c[0] - b[0], c[1] - b[1]]; return Math.abs(Math.acos(Math.max(-1, Math.min(1, (v1[0] * v2[0] + v1[1] * v2[1]) / ((Math.hypot(...v1) * Math.hypot(...v2)) || 1)))) * 180 / Math.PI - 90); }));
  function orderQuad(q) {   // 왼쪽 위 · 오른쪽 위 · 오른쪽 아래 · 왼쪽 아래 순서로
    const cx = q.reduce((s, p) => s + p[0], 0) / 4, cy = q.reduce((s, p) => s + p[1], 0) / 4;
    const s = q.slice().sort((a, b) => Math.atan2(a[1] - cy, a[0] - cx) - Math.atan2(b[1] - cy, b[0] - cx));   // 시계 방향 (화면 좌표)
    let k = 0; s.forEach((p, i) => { if (p[0] + p[1] < s[k][0] + s[k][1]) k = i; });
    return [0, 1, 2, 3].map(i => s[(k + i) % 4]);
  }
  /* 모서리 자동 찾기 (2판)
   * 1) 종이 후보: 밝기(L)와 '종이다움'(밝고 색이 없음 = L - 채도) 두 가지로 여러 문턱값 → 구멍 메우기·깎기 → 가장 큰 덩어리
   * 2) 덩어리의 볼록 껍질을 감싸는 사각형 (변을 하나씩 없애며 넓이가 가장 덜 늘어나는 쪽) — 어느 각도로 기울어도 됨
   * 3) 점수: 사각형 안이 꽉 찼는지 · 네 변에 실제 경계(밝기 변화)가 있는지 · 사진 가장자리에 닿는지(배경)
   * 4) 고른 사각형의 네 변을 더 큰 그림에서 실제 경계선에 붙임 (변마다 경계점을 모아 직선 맞춤 → 교점 = 모서리) */
  function detect(c) {
    const s = scaled(c, 400), w = s.width, h = s.height, N = w * h, k = c.width / w;
    const d = s.getContext('2d').getImageData(0, 0, w, h).data;
    const L = new Float32Array(N), P = new Float32Array(N), Sat = new Float32Array(N);
    for (let i = 0, j = 0; i < N; i++, j += 4) {
      const r = d[j], g = d[j + 1], b = d[j + 2], mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      L[i] = 0.299 * r + 0.587 * g + 0.114 * b; Sat[i] = mx - mn; P[i] = Math.max(0, L[i] - 1.3 * Sat[i]);
    }
    const Nm = flatLight(L, w, h), Lb = boxBlur(L, w, h);   // 조명 고르게 (부드러운 그림자·한쪽만 어두운 사진)
    const G = gradMag(L, Sat, w, h), g95 = Math.max(8, pctOf(G, 95, 1024));
    const otsu = (F, from) => {
      const hist = new Uint32Array(256); let n = 0; for (let i = 0; i < N; i++) if (F[i] > from) { hist[F[i] | 0]++; n++; }
      let sum = 0; for (let v = 0; v < 256; v++) sum += v * hist[v];
      let sB = 0, wB = 0, best = 0, t = -1;
      for (let v = 0; v < 256; v++) { wB += hist[v]; if (!wB) continue; const wF = n - wB; if (!wF) break; sB += v * hist[v]; const mB = sB / wB, mF = (sum - sB) / wF, bb = wB * wF * (mB - mF) * (mB - mF); if (bb > best) { best = bb; t = v; } }
      return t;
    };
    const lab = new Int32Array(N), stack = new Int32Array(N), R = 3;
    const erode = m => {
      const a = new Uint8Array(N);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let ok = 1; for (let dd = -R; dd <= R && ok; dd++) { const xx = x + dd; if (xx < 0 || xx >= w || !m[y * w + xx]) ok = 0; } a[y * w + x] = ok; }
      const b = new Uint8Array(N);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let ok = 1; for (let dd = -R; dd <= R && ok; dd++) { const yy = y + dd; if (yy < 0 || yy >= h || !a[yy * w + x]) ok = 0; } b[y * w + x] = ok; }
      return b;
    };
    const polyArea = q => { let a = 0; for (let i = 0; i < q.length; i++) { const [x1, y1] = q[i], [x2, y2] = q[(i + 1) % q.length]; a += x1 * y2 - x2 * y1; } return Math.abs(a) / 2; };
    // 변 지지도: 변을 따라 수직으로 ±2칸 안의 가장 큰 경계 세기 평균 (사진 가장자리에 붙은 변은 뺌)
    const support = q => {
      const vals = [];
      for (let e = 0; e < 4; e++) {
        const [x1, y1] = q[e], [x2, y2] = q[(e + 1) % 4], len = Math.hypot(x2 - x1, y2 - y1); if (len < 4) { vals.push(0); continue; }
        const nx = -(y2 - y1) / len, ny = (x2 - x1) / len; let sum = 0, n = 0, border = 0;
        for (let t = 0.06; t < 0.95; t += 0.04) {
          const px = x1 + (x2 - x1) * t, py = y1 + (y2 - y1) * t;
          if (px < 3 || py < 3 || px > w - 4 || py > h - 4) { border++; continue; }
          let m = 0; for (let o = -2; o <= 2; o++) { const xx = Math.round(px + nx * o), yy = Math.round(py + ny * o); if (xx >= 0 && yy >= 0 && xx < w && yy < h) m = Math.max(m, G[yy * w + xx]); }
          // 안쪽(종이)이 바깥보다 밝은 '계단'이 있는지 — 글자·그림자 띠는 계단이 일정하지 않음
          const st = stepAt(px, py, nx, ny);
          sum += 0.35 * Math.min(1, m / g95) + 0.65 * st; n++;
        }
        vals.push(n >= 4 ? sum / n : border ? 0.5 : 0);
      }
      const mean = vals.reduce((a, b) => a + b, 0) / 4;
      return 0.6 * mean + 0.4 * Math.min(...vals);
    };
    // 변 다시 찾기: 변마다 각도(±30°)·위치를 바꿔 가며 '안쪽 종이가 바깥보다 밝은' 정도가 가장 큰 직선 → 이웃 변과 교점
    // (그림자에 모서리 한쪽이 묻혀 대각선으로 잘린 변을 바로잡음. 표의 가는 줄에 붙지 않게 바깥 3·6·9칸 평균)
    // 경계 계단: 바로 옆(±2칸) 차이와 조금 떨어진(±5·8칸) 차이 중 작은 쪽 — 진짜 종이 끝은 둘 다 큼, 부드러운 그림자 경계는 ±2 가 작고, 표의 가는 줄은 ±5·8 이 작음
    const stepAt = (px, py, nx, ny) => {
      let best = 0;
      const at = (A, o) => { const xx = Math.min(w - 1, Math.max(0, Math.round(px + nx * o))), yy = Math.min(h - 1, Math.max(0, Math.round(py + ny * o))); return A[yy * w + xx]; };
      for (const A of [L, Nm]) {
        const s2 = (at(A, 2) - at(A, -2)) / 20, s6 = (at(A, 5) + at(A, 8) - at(A, -5) - at(A, -8)) / 2 / 20;
        best = Math.max(best, Math.min(s2, s6));
      }
      return Math.min(1, Math.max(0, best));
    };
    const stepAlong = (a, b) => {
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]); if (len < 6) return 0;
      const nx = -(b[1] - a[1]) / len, ny = (b[0] - a[0]) / len; let sum = 0, n = 0;
      for (let t = 0.1; t < 0.91; t += 0.04) {
        const px = a[0] + (b[0] - a[0]) * t, py = a[1] + (b[1] - a[1]) * t;
        if (px < 2 || py < 2 || px > w - 3 || py > h - 3) continue;
        sum += stepAt(px, py, nx, ny); n++;
      }
      return n >= 5 ? sum / n : -1;   // -1 = 거의 사진 밖 (판단 못 함)
    };
    function fixSides(q0) {
      let q = q0.map(p => p.slice()); const S = Math.sqrt(polyArea(q));
      const lineOf = i => [q[i], q[(i + 1) % 4]];
      for (let it = 0; it < 2; it++) {
        const order = [0, 1, 2, 3].map(i => [i, stepAlong(...lineOf(i))]).filter(x => x[1] >= 0).sort((a, b) => a[1] - b[1]);
        for (const [i, cur] of order) {
          if (cur > 0.6) continue;
          // 한쪽 모서리는 그대로 두고 변을 돌려 봄 (모서리 하나가 그림자에 묻힌 경우) → 다른 끝은 이웃 변과의 교점
          const [a, b] = lineOf(i), th = Math.atan2(b[1] - a[1], b[0] - a[0]);
          const P = lineOf((i + 3) % 4), Nx = lineOf((i + 1) % 4);
          let best = { sc: cur + 0.12, q: null };
          for (const piv of [0, 1]) {
            const o = piv ? b : a;
            for (let dth = -36; dth <= 36; dth += 1.5) {
              const t2 = th + dth * Math.PI / 180, o2 = [o[0] + Math.cos(t2) * 50, o[1] + Math.sin(t2) * 50];
              const A = piv ? lineInter(P[0], P[1], o, o2) : a, B = piv ? b : lineInter(o, o2, Nx[0], Nx[1]); if (!A || !B) continue;
              const nq = q.slice(); nq[i] = A; nq[(i + 1) % 4] = B;
              if (!convexOk(nq) || !nq.every(([x, y]) => x > -4 && y > -4 && x < w + 4 && y < h + 4)) continue;
              const st = stepAlong(A, B); if (st < 0) continue;
              const sc = st - 0.1 * Math.abs(dth) / 36;
              if (sc > best.sc) best = { sc, q: nq };
            }
          }
          if (best.q) q = best.q;
        }
      }
      return q;
    }
    const comp = (F, t) => {
      const m = new Uint8Array(N); for (let i = 0; i < N; i++) m[i] = F[i] > t ? 1 : 0;
      { const out = new Uint8Array(N); let sp = 0;   // 구멍 메우기 (종이 위 글자)
        const seed = p => { if (!m[p] && !out[p]) { out[p] = 1; stack[sp++] = p; } };
        for (let x = 0; x < w; x++) { seed(x); seed((h - 1) * w + x); }
        for (let y = 0; y < h; y++) { seed(y * w); seed(y * w + w - 1); }
        while (sp) { const p = stack[--sp], x = p % w; if (x > 0) seed(p - 1); if (x < w - 1) seed(p + 1); if (p >= w) seed(p - w); if (p < N - w) seed(p + w); }
        for (let i = 0; i < N; i++) if (!m[i] && !out[i]) m[i] = 1; }
      const e = erode(m);
      lab.fill(0); let bestN = 0, bestL = 0, Lb = 0;
      for (let i = 0; i < N; i++) {
        if (!e[i] || lab[i]) continue;
        Lb++; let n = 0, sp = 0; stack[sp++] = i; lab[i] = Lb;
        while (sp) { const p = stack[--sp]; n++; const x = p % w;
          if (x > 0 && !lab[p - 1] && e[p - 1]) { lab[p - 1] = Lb; stack[sp++] = p - 1; }
          if (x < w - 1 && !lab[p + 1] && e[p + 1]) { lab[p + 1] = Lb; stack[sp++] = p + 1; }
          if (p >= w && !lab[p - w] && e[p - w]) { lab[p - w] = Lb; stack[sp++] = p - w; }
          if (p < N - w && !lab[p + w] && e[p + w]) { lab[p + w] = Lb; stack[sp++] = p + w; } }
        if (n > bestN) { bestN = n; bestL = Lb; }
      }
      if (bestN < N * 0.03) return null;
      const rows = []; let edge = 0;
      for (let y = 0; y < h; y++) { let a = -1, b = -1; for (let x = 0; x < w; x++) if (lab[y * w + x] === bestL) { if (a < 0) a = x; b = x; } if (a >= 0) { rows.push([a, y]); if (b !== a) rows.push([b, y]); if (a <= R + 1 || b >= w - 2 - R || y <= R + 1 || y >= h - 2 - R) edge += (y <= R + 1 || y >= h - 2 - R) ? b - a + 1 : 1; } }
      const hull = convexHull(rows); if (hull.length < 4) return null;
      let q = hullQuad(hull); if (!q) return null;
      q = offsetQuad(orderQuad(q), R + 0.5);   // 깎은 만큼 되돌림
      const qa = polyArea(q); if (!(qa > 0)) return null;
      return { q, ratio: qa / N, fill: Math.min(1, bestN / Math.max(1, polyArea(offsetQuad(q, -(R + 0.5))))), edge: edge / (2 * (w + h)), t };
    };
    const cands = [];
    for (const F of [L, P, Nm]) {
      const t1 = otsu(F, -1), t2 = t1 >= 0 ? otsu(F, t1) : -1, ts = new Set([t1, t2]);
      for (let t = Math.max(20, t1 - 24); t < 248; t += 8) ts.add(t);
      for (const t of ts) { if (t < 0) continue; const r = comp(F, t); if (r && r.ratio >= 0.05 && r.ratio <= 0.97 && convexOk(r.q) && r.q.every(([x, y]) => x > -4 && y > -4 && x < w + 4 && y < h + 4)) cands.push(r); }   // 모서리가 사진 밖으로 나가면 빼기
    }
    if (!cands.length) return full(c);
    cands.forEach(r => { r.sup = support(r.q); r.score = r.fill * (0.2 + 0.8 * r.sup) * (0.8 + 0.2 * Math.min(1, r.ratio / 0.25)) - r.edge * 1.5; });
    cands.sort((a, b) => b.score - a.score);
    const best = cands[0];
    if (best.score < 0.3) return full(c);
    best.q = fixSides(best.q);
    // 직사각형과 너무 다르면(한 모서리가 20° 넘게 틀어짐 = 말리거나 그림자 진 모서리를 잘라 먹은 것) 감싸는 직사각형으로 — 글자를 잘라 먹는 것보다 책상이 조금 남는 게 나음
    if (maxSkew(best.q) > 20) { const r = minRect(best.q); if (r) best.q = orderQuad(r).map(([x, y]) => [Math.min(w, Math.max(0, x)), Math.min(h, Math.max(0, y))]); }
    // 4) 큰 그림(긴 변 1200)에서 네 변을 실제 경계선에 붙임
    const big = scaled(c, 1200), kb = c.width / big.width;
    let q = best.q.map(([x, y]) => [x * k / kb, y * k / kb]);
    q = refineQuad(big, q, Math.max(6, 3 * k / kb));
    q = offsetQuad(q, 0.01 * Math.sqrt(polyArea(q)));   // 1% 바깥으로 — 경계에 딱 붙다 글자를 자르지 않게 (문서 보정하면 남은 책상은 하얗게 됨)
    return q.map(([x, y]) => [Math.min(c.width, Math.max(0, x * kb)), Math.min(c.height, Math.max(0, y * kb))]);
  }
  function boxBlur(A, w, h) { const o = new Float32Array(A.length); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let v = 0, n = 0; for (let dy = -1; dy <= 1; dy++) { const yy = y + dy; if (yy < 0 || yy >= h) continue; for (let dx = -1; dx <= 1; dx++) { const xx = x + dx; if (xx < 0 || xx >= w) continue; v += A[yy * w + xx]; n++; } } o[y * w + x] = v / n; } return o; }
  // 조명 고르게: 밝기 ÷ 넓게 흐린 밝기 (그림자 속 종이도 주변보다 밝으면 밝게)
  function flatLight(L, w, h) {
    const sw = Math.max(2, Math.round(w / 20)), sh = Math.max(2, Math.round(h / 20)), sm = new Float32Array(sw * sh), cnt = new Float32Array(sw * sh);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const j = Math.min(sh - 1, (y * sh / h) | 0) * sw + Math.min(sw - 1, (x * sw / w) | 0); sm[j] += L[y * w + x]; cnt[j]++; }
    for (let j = 0; j < sm.length; j++) sm[j] /= Math.max(1, cnt[j]);
    let b = sm; for (let it = 0; it < 3; it++) { const o = new Float32Array(b.length); for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) { let v = 0, n = 0; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const yy = y + dy, xx = x + dx; if (yy < 0 || xx < 0 || yy >= sh || xx >= sw) continue; v += b[yy * sw + xx]; n++; } o[y * sw + x] = v / n; } b = o; }
    const N = new Float32Array(w * h);
    for (let y = 0; y < h; y++) { const fy = Math.min(sh - 1.001, Math.max(0, (y + 0.5) * sh / h - 0.5)), y0 = fy | 0, ty = fy - y0;
      for (let x = 0; x < w; x++) { const fx = Math.min(sw - 1.001, Math.max(0, (x + 0.5) * sw / w - 0.5)), x0 = fx | 0, tx = fx - x0, i = y0 * sw + x0;
        const bg = (b[i] * (1 - tx) + b[i + 1] * tx) * (1 - ty) + (b[i + sw] * (1 - tx) + b[i + sw + 1] * tx) * ty;
        N[y * w + x] = Math.min(255, L[y * w + x] / Math.max(8, bg) * 170); } }
    return N;
  }
  // 경계 세기: 밝기와 채도의 소벨 (흐리게 한 뒤)
  function gradMag(L, S, w, h) {
    const blur = A => { const o = new Float32Array(A.length); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let v = 0, n = 0; for (let dy = -1; dy <= 1; dy++) { const yy = y + dy; if (yy < 0 || yy >= h) continue; for (let dx = -1; dx <= 1; dx++) { const xx = x + dx; if (xx < 0 || xx >= w) continue; v += A[yy * w + xx]; n++; } } o[y * w + x] = v / n; } return o; };
    const a = blur(L), b = blur(S), G = new Float32Array(w * h);
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx = (A) => A[i - w + 1] + 2 * A[i + 1] + A[i + w + 1] - A[i - w - 1] - 2 * A[i - 1] - A[i + w - 1];
      const gy = (A) => A[i + w - 1] + 2 * A[i + w] + A[i + w + 1] - A[i - w - 1] - 2 * A[i - w] - A[i - w + 1];
      const lx = gx(a), ly = gy(a), sx = gx(b), sy = gy(b);
      G[i] = Math.sqrt(lx * lx + ly * ly + 0.6 * (sx * sx + sy * sy)) / 4;
    }
    return G;
  }
  function lineInter(a, b, c, d) {
    const x1 = a[0], y1 = a[1], x2 = b[0], y2 = b[1], x3 = c[0], y3 = c[1], x4 = d[0], y4 = d[1];
    const den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4); if (Math.abs(den) < 1e-9) return null;
    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den; return [x1 + t * (x2 - x1), y1 + t * (y2 - y1)];
  }
  // 볼록 다각형 → 감싸는 사각형: 변 하나를 없애고 양옆 변을 늘려 만나게 할 때 늘어나는 넓이가 가장 작은 변부터
  function hullQuad(hp) {
    const p = hp.slice(), tri = (a, b, c) => Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 2;
    while (p.length > 4) {
      const n = p.length; let bi = -1, bA = Infinity, bP = null;
      for (let i = 0; i < n; i++) {
        const a = p[(i - 1 + n) % n], b = p[i], c = p[(i + 1) % n], dd = p[(i + 2) % n], X = lineInter(a, b, c, dd); if (!X) continue;
        if ((X[0] - b[0]) * (b[0] - a[0]) + (X[1] - b[1]) * (b[1] - a[1]) < -1e-9) continue;
        if ((X[0] - c[0]) * (c[0] - dd[0]) + (X[1] - c[1]) * (c[1] - dd[1]) < -1e-9) continue;
        const A = tri(b, X, c); if (A < bA) { bA = A; bi = i; bP = X; }
      }
      if (bi < 0) { let vi = 0, vA = Infinity; for (let i = 0; i < n; i++) { const A = tri(p[(i - 1 + n) % n], p[i], p[(i + 1) % n]); if (A < vA) { vA = A; vi = i; } } p.splice(vi, 1); continue; }
      const j = (bi + 1) % n; p[bi] = bP; p.splice(j, 1);
    }
    return p.length === 4 ? p : null;
  }
  // 사각형의 네 변을 바깥(+)/안(-)으로 d 만큼 옮김 (순서: 왼위·오위·오아래·왼아래 = 화면에서 시계 방향)
  function offsetQuad(q, d) {
    const ls = [0, 1, 2, 3].map(i => { const a = q[i], b = q[(i + 1) % 4], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = (b[1] - a[1]) / l, ny = -(b[0] - a[0]) / l; return [[a[0] + nx * d, a[1] + ny * d], [b[0] + nx * d, b[1] + ny * d]]; });
    return [0, 1, 2, 3].map(i => lineInter(...ls[(i + 3) % 4], ...ls[i]) || q[i]);
  }
  function convexOk(q) {   // 볼록하고, 모서리 각이 너무 뾰족하지 않고(35°~145°), 마주 보는 변 길이가 비슷함 (그림자에 반쯤 가린 세모꼴 빼기)
    const len = i => Math.hypot(q[(i + 1) % 4][0] - q[i][0], q[(i + 1) % 4][1] - q[i][1]);
    for (const [i, j] of [[0, 2], [1, 3]]) { const a = len(i), b = len(j); if (Math.min(a, b) < 0.45 * Math.max(a, b)) return false; }
    let sg = 0;
    for (let i = 0; i < 4; i++) {
      const a = q[(i + 3) % 4], b = q[i], c = q[(i + 1) % 4], v1 = [a[0] - b[0], a[1] - b[1]], v2 = [c[0] - b[0], c[1] - b[1]];
      const cr = v1[0] * v2[1] - v1[1] * v2[0], s = Math.sign(cr); if (!s || (sg && s !== sg)) return false; sg = s;
      const cos = (v1[0] * v2[0] + v1[1] * v2[1]) / ((Math.hypot(...v1) * Math.hypot(...v2)) || 1); if (Math.abs(cos) > 0.82) return false;
    }
    return true;
  }
  // 변마다: 변을 따라 점을 찍고, 수직 방향 ±rad 안에서 경계가 가장 센 곳을 모아 직선 맞춤(튀는 점 빼고 두 번) → 이웃 변과의 교점
  function refineQuad(c, q, rad) {
    const w = c.width, h = c.height, d = c.getContext('2d').getImageData(0, 0, w, h).data, L = new Float32Array(w * h);
    for (let i = 0, j = 0; i < L.length; i++, j += 4) L[i] = 0.299 * d[j] + 0.587 * d[j + 1] + 0.114 * d[j + 2];
    const at = (x, y) => L[Math.min(h - 1, Math.max(0, y | 0)) * w + Math.min(w - 1, Math.max(0, x | 0))];
    const diag = Math.hypot(w, h), lines = [];
    for (let e = 0; e < 4; e++) {
      const a = q[e], b = q[(e + 1) % 4], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const ux = (b[0] - a[0]) / len, uy = (b[1] - a[1]) / len, nx = -uy, ny = ux, pts = [];
      for (let t = 0.07; t < 0.94; t += 0.02) {
        const px = a[0] + (b[0] - a[0]) * t, py = a[1] + (b[1] - a[1]) * t;
        if (px < 4 || py < 4 || px > w - 5 || py > h - 5) continue;
        let bo = 0, bm = 0;
        for (let o = -rad; o <= rad; o += 0.5) {   // 변 수직 방향 밝기 차이 (변 방향으로 3점 평균 = 글자·잡티에 덜 흔들림)
          let m = 0; for (let s2 = -2; s2 <= 2; s2 += 2) { const x0 = px + ux * s2 + nx * o, y0 = py + uy * s2 + ny * o; m += Math.abs(at(x0 + nx * 1.5, y0 + ny * 1.5) - at(x0 - nx * 1.5, y0 - ny * 1.5)); }
          if (m > bm) { bm = m; bo = o; }
        }
        if (bm > 3 * 12) pts.push([px + nx * bo, py + ny * bo]);
      }
      lines.push(pts.length >= 8 ? fitLine(pts) : null);
    }
    return q.map((p, i) => {
      const l1 = lines[(i + 3) % 4], l2 = lines[i]; if (!l1 || !l2) return p;
      const X = lineInter(l1[0], l1[1], l2[0], l2[1]);
      return X && Math.hypot(X[0] - p[0], X[1] - p[1]) < 0.05 * diag ? X : p;
    });
  }
  function fitLine(pts) {   // 직선 맞춤 (주성분) → 멀리 떨어진 점 빼고 다시
    const fit = P => { let mx = 0, my = 0; P.forEach(([x, y]) => { mx += x; my += y; }); mx /= P.length; my /= P.length; let sxx = 0, sxy = 0, syy = 0; P.forEach(([x, y]) => { sxx += (x - mx) ** 2; sxy += (x - mx) * (y - my); syy += (y - my) ** 2; }); const th = 0.5 * Math.atan2(2 * sxy, sxx - syy); return { mx, my, dx: Math.cos(th), dy: Math.sin(th) }; };
    let f = fit(pts);
    for (let it = 0; it < 2; it++) {
      const res = pts.map(([x, y]) => Math.abs(-(x - f.mx) * f.dy + (y - f.my) * f.dx)), srt = res.slice().sort((a, b) => a - b), cut = Math.max(1.5, srt[Math.floor(srt.length * 0.6)] * 2);
      const keep = pts.filter((p, i) => res[i] <= cut); if (keep.length < 6) break; f = fit(keep);
    }
    return [[f.mx, f.my], [f.mx + f.dx * 100, f.my + f.dy * 100]];
  }

  /* 네 모서리 → 반듯한 직사각형 (원근 펴기) */
  function warp(c, q) {
    const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    let W = Math.max(d(q[0], q[1]), d(q[3], q[2])), H = Math.max(d(q[0], q[3]), d(q[1], q[2]));
    const k = Math.min(1, Math.sqrt(OUT_PX / (W * H))); W = Math.max(1, Math.round(W * k)); H = Math.max(1, Math.round(H * k));
    const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = q;
    const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3, dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
    let a, b, cc, dd, e, f, gg = 0, hh = 0;
    const den = dx1 * dy2 - dx2 * dy1;
    if (Math.abs(den) > 1e-9 && (Math.abs(dx3) > 1e-6 || Math.abs(dy3) > 1e-6)) { gg = (dx3 * dy2 - dx2 * dy3) / den; hh = (dx1 * dy3 - dx3 * dy1) / den; }
    a = x1 - x0 + gg * x1; b = x3 - x0 + hh * x3; cc = x0; dd = y1 - y0 + gg * y1; e = y3 - y0 + hh * y3; f = y0;
    const sw = c.width, sh = c.height, src = c.getContext('2d').getImageData(0, 0, sw, sh).data;
    const o = newCanvas(W, H), ox = o.getContext('2d'), out = ox.createImageData(W, H), od = out.data;
    for (let j = 0; j < H; j++) {
      const v = (j + 0.5) / H;
      for (let i = 0; i < W; i++) {
        const u = (i + 0.5) / W, z = gg * u + hh * v + 1;
        let x = (a * u + b * v + cc) / z - 0.5, y = (dd * u + e * v + f) / z - 0.5;
        x = Math.min(sw - 1.001, Math.max(0, x)); y = Math.min(sh - 1.001, Math.max(0, y));
        const xi = x | 0, yi = y | 0, fx = x - xi, fy = y - yi, p = (yi * sw + xi) * 4, p2 = p + sw * 4, t = (j * W + i) * 4;
        for (let ch = 0; ch < 3; ch++) {
          const top = src[p + ch] + (src[p + 4 + ch] - src[p + ch]) * fx, bot = src[p2 + ch] + (src[p2 + 4 + ch] - src[p2 + ch]) * fx;
          od[t + ch] = top + (bot - top) * fy;
        }
        od[t + 3] = 255;
      }
    }
    ox.putImageData(out, 0, 0); return o;
  }

  /* 문서(흑백): PC rcEnhance 와 같음 */
  function enhanceDoc(c) {
    const w = c.width, h = c.height, g = grayOf(c);
    const sw = Math.max(1, Math.round(w / 16)), sh = Math.max(1, Math.round(h / 16));
    const sc = newCanvas(sw, sh); sc.getContext('2d').drawImage(c, 0, 0, sw, sh);
    let b = grayOf(sc);
    const filt = (arr, r, max) => { const o = new Float32Array(arr.length); for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) { let v = 0, n = 0; for (let dy = -r; dy <= r; dy++) { const yy = Math.min(sh - 1, Math.max(0, y + dy)); for (let dx = -r; dx <= r; dx++) { const q = arr[yy * sw + Math.min(sw - 1, Math.max(0, x + dx))]; if (max) { if (q > v) v = q; } else { v += q; n++; } } } o[y * sw + x] = max ? v : v / n; } return o; };
    b = filt(filt(filt(b, 1, true), 1, true), 2, false);
    const bc = newCanvas(sw, sh), bx = bc.getContext('2d'), bi = bx.createImageData(sw, sh);
    for (let i = 0; i < b.length; i++) { const v = Math.max(1, Math.min(255, b[i])); bi.data[i * 4] = bi.data[i * 4 + 1] = bi.data[i * 4 + 2] = v; bi.data[i * 4 + 3] = 255; }
    bx.putImageData(bi, 0, 0);
    const fc = newCanvas(w, h), fx = fc.getContext('2d'); fx.imageSmoothingEnabled = true; fx.imageSmoothingQuality = 'high'; fx.drawImage(bc, 0, 0, w, h);
    const bf = grayOf(fc), o = new Float32Array(w * h);
    for (let i = 0; i < o.length; i++) o[i] = Math.min(255, g[i] / Math.max(1, bf[i]) * 255);
    const lo = Math.min(200, pctOf(o, 1)), hi = 235, lut = new Uint8ClampedArray(256);
    for (let v = 0; v < 256; v++) lut[v] = Math.round(Math.pow(Math.min(1, Math.max(0, (v - lo) / (hi - lo))), 1.25) * 255);
    const out = fx.createImageData(w, h);
    for (let i = 0; i < o.length; i++) { const v = lut[o[i] | 0]; out.data[i * 4] = out.data[i * 4 + 1] = out.data[i * 4 + 2] = v; out.data[i * 4 + 3] = 255; }
    fx.putImageData(out, 0, 0); return fc;
  }
  /* 컬러 선명: 색마다 어두운 1%·밝은 99% 를 끝까지 늘림 (종이는 하얗게, 색 도장·형광펜은 남김) */
  function enhanceColor(c) {
    const x = c.getContext('2d'), im = x.getImageData(0, 0, c.width, c.height), d = im.data, n = d.length / 4;
    for (let ch = 0; ch < 3; ch++) {
      const a = new Uint8Array(n); for (let i = 0; i < n; i++) a[i] = d[i * 4 + ch];
      const lo = pctOf(a, 1), hi = Math.max(lo + 30, pctOf(a, 97)), lut = new Uint8ClampedArray(256);
      for (let v = 0; v < 256; v++) lut[v] = (v - lo) / (hi - lo) * 255;
      for (let i = 0; i < n; i++) d[i * 4 + ch] = lut[d[i * 4 + ch]];
    }
    x.putImageData(im, 0, 0); return c;
  }

  /* ---------- 편집 화면: ① 모서리 맞추기 → ② 미리보기·보정 고르기 → 저장 ---------- */
  const css = `.sc-wrap{position:fixed;inset:0;z-index:10000;background:#111;display:flex;flex-direction:column;color:#fff;touch-action:none;user-select:none;-webkit-user-select:none;font-family:inherit}
.sc-top{display:grid;grid-template-columns:minmax(92px,auto) 1fr minmax(92px,auto);gap:8px;align-items:center;padding:10px 12px;padding-top:calc(10px + env(safe-area-inset-top))}
.sc-top b{text-align:center;font-size:16px;font-weight:700;line-height:1.3}
.sc-top b small{display:block;font-size:12px;font-weight:400;color:#9aa3b2}
.sc-wrap button{min-height:46px;border-radius:12px;border:1px solid #3a3f49;background:#252830;color:#fff;font-size:15px;font-weight:600;padding:0 14px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:6px;font-family:inherit}
.sc-wrap button:hover{background:#30343d}
.sc-wrap button.pri{background:#2b59c3;border-color:#2b59c3;font-size:17px;min-height:52px}
.sc-wrap button.pri:hover{background:#3868d8}
.sc-wrap button.del{background:#3b1c1f;border-color:#e05a5a;color:#ff9b9b}
.sc-wrap button.del:hover{background:#4d2226}
.sc-wrap .sc-ph{visibility:hidden}
.sc-mid{flex:1;position:relative;min-height:0}
.sc-mid canvas{position:absolute;inset:0;width:100%;height:100%}
.sc-prev{position:absolute;inset:12px;width:calc(100% - 24px);height:calc(100% - 24px);object-fit:contain;background:transparent}
.sc-tip{position:absolute;left:50%;top:10px;transform:translateX(-50%);max-width:calc(100% - 24px);background:rgba(0,0,0,.72);border:1px solid #3a3f49;border-radius:20px;padding:7px 14px;font-size:13px;text-align:center;pointer-events:none}
.sc-bot{display:flex;flex-direction:column;gap:8px;padding:10px 12px;padding-bottom:calc(12px + env(safe-area-inset-bottom));width:100%;max-width:640px;margin:0 auto;box-sizing:border-box}
.sc-tools,.sc-seg{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}
.sc-tools button{flex-direction:column;gap:2px;font-size:12px;font-weight:500;min-height:56px}
.sc-tools button i{font-style:normal;font-size:20px;line-height:1}
.sc-seg button.on{background:#fff;color:#111;border-color:#fff}
.sc-row{display:grid;grid-template-columns:1fr 2fr;gap:8px}
.sc-steps{display:flex;gap:14px;justify-content:center;font-size:12px;color:#7d8594}
.sc-steps span.on{color:#fff;font-weight:700}
.sc-busy{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.6);font-size:17px}`;
  let styled = false;

  // opt.del: true 면 [🗑 빼기] 버튼 (휴대폰 앱) → 'del'. [취소]·Esc → null (바뀐 것 없음). 저장 → { blob, edit }
  async function open(file, prev, opt = {}) {
    if (!styled) { const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s); styled = true; }
    let src = await loadCanvas(file);
    for (let r = 0; r < ((prev && prev.rot) || 0); r++) src = rotate(src);
    let quad = prev && prev.quad ? prev.quad.map(p => p.slice()) : detect(src), rot = (prev && prev.rot) || 0;
    let mode = (prev && prev.mode) || localStorage.getItem('ysm.scanMode') || 'doc';
    if (!MODES.some(m => m[0] === mode)) mode = 'doc';
    const touch = matchMedia('(pointer:coarse)').matches;
    const wrap = document.createElement('div'); wrap.className = 'sc-wrap';
    const delBtn = opt.del ? '<button type="button" class="del" data-a="del">🗑 빼기</button>' : '<button type="button" class="sc-ph" tabindex="-1" aria-hidden="true">.</button>';
    wrap.innerHTML = `<div class="sc-top"><button type="button" data-a="cancel">✕ 취소</button><b data-t></b>${delBtn}</div>
      <div class="sc-mid"><canvas></canvas><img class="sc-prev" alt="" hidden><div class="sc-tip" data-tip></div></div>
      <div class="sc-bot">
        <div data-s="1" style="display:contents">
          <div class="sc-tools"><button type="button" data-a="rot" title="사진을 오른쪽으로 90° 돌리기"><i>↻</i>돌리기</button><button type="button" data-a="auto" title="영수증 모서리를 다시 자동으로 찾기"><i>◎</i>자동 맞춤</button><button type="button" data-a="full" title="자르지 않고 사진 전체를 씀"><i>▢</i>사진 전체</button></div>
          <button type="button" class="pri" data-a="next">다음 — 미리보기 →</button>
        </div>
        <div data-s="2" style="display:none">
          <div class="sc-seg">${MODES.map(([k, l]) => `<button type="button" data-m="${k}" class="${k === mode ? 'on' : ''}">${l}</button>`).join('')}</div>
          <div class="sc-row"><button type="button" data-a="back">← 다시 맞추기</button><button type="button" class="pri" data-a="ok">✓ 저장</button></div>
        </div>
        <div class="sc-steps"><span data-st="1">① 모서리 맞추기</span><span data-st="2">② 보정 고르고 저장</span></div>
      </div>`;
    document.body.appendChild(wrap);
    const $w = q => wrap.querySelector(q);
    const mid = $w('.sc-mid'), cv = $w('canvas'), cx = cv.getContext('2d'), img = $w('.sc-prev'), tip = $w('[data-tip]');
    let step = 1, view = { k: 1, ox: 0, oy: 0 }, drag = -1, dragAt = null, flat = null, cache = {};
    const dropCache = () => { Object.values(cache).forEach(c => c.url && URL.revokeObjectURL(c.url)); cache = {}; flat = null; };
    function layout() {
      const dpr = window.devicePixelRatio || 1, W = mid.clientWidth, H = mid.clientHeight;
      cv.width = W * dpr; cv.height = H * dpr; cx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const k = Math.min((W - 48) / src.width, (H - 96) / src.height);   // 위 안내 글·모서리 손잡이가 화면 밖으로 안 나가게
      view = { k, ox: (W - src.width * k) / 2, oy: (H - src.height * k) / 2 + 20 }; draw();
    }
    const toScr = ([x, y]) => [view.ox + x * view.k, view.oy + y * view.k];
    function draw() {
      const W = mid.clientWidth, H = mid.clientHeight;
      cx.clearRect(0, 0, W, H);
      if (step !== 1) return;
      cx.drawImage(src, view.ox, view.oy, src.width * view.k, src.height * view.k);
      const s = quad.map(toScr);
      cx.save(); cx.beginPath(); cx.rect(0, 0, W, H); cx.moveTo(...s[0]); s.slice(1).forEach(p => cx.lineTo(...p)); cx.closePath();
      cx.fillStyle = 'rgba(0,0,0,.55)'; cx.fill('evenodd'); cx.restore();
      cx.beginPath(); cx.moveTo(...s[0]); s.slice(1).forEach(p => cx.lineTo(...p)); cx.closePath(); cx.strokeStyle = '#5b9bff'; cx.lineWidth = 3; cx.stroke();
      s.forEach(([x, y], i) => {
        const on = i === drag, r = on ? 18 : 15;
        cx.beginPath(); cx.arc(x, y, r + 6, 0, 7); cx.fillStyle = 'rgba(0,0,0,.35)'; cx.fill();   // 밝은 종이 위에서도 보이게 그림자
        cx.beginPath(); cx.arc(x, y, r, 0, 7); cx.fillStyle = on ? '#5b9bff' : 'rgba(43,89,195,.55)'; cx.fill(); cx.lineWidth = 3; cx.strokeStyle = '#fff'; cx.stroke();
      });
      if (drag >= 0) {   // 돋보기: 손가락에 가린 모서리를 크게
        const [qx, qy] = quad[drag], R = 60, Z = 2.5, lx = s[drag][0] < W / 2 ? W - R - 12 : R + 12, ly = R + 52;
        cx.save(); cx.beginPath(); cx.arc(lx, ly, R, 0, 7); cx.clip();
        cx.fillStyle = '#000'; cx.fillRect(lx - R, ly - R, R * 2, R * 2);
        const zk = view.k * Z; cx.drawImage(src, lx - qx * zk, ly - qy * zk, src.width * zk, src.height * zk);
        cx.strokeStyle = '#5b9bff'; cx.lineWidth = 2; cx.beginPath(); cx.moveTo(lx - 12, ly); cx.lineTo(lx + 12, ly); cx.moveTo(lx, ly - 12); cx.lineTo(lx, ly + 12); cx.stroke();
        cx.restore(); cx.beginPath(); cx.arc(lx, ly, R, 0, 7); cx.strokeStyle = '#fff'; cx.lineWidth = 3; cx.stroke();
      }
    }
    const pt = e => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    const near = (x, y) => { let bi = -1, bd = touch ? 48 : 36; quad.map(toScr).forEach(([sx, sy], i) => { const dd = Math.hypot(sx - x, sy - y); if (dd < bd) { bd = dd; bi = i; } }); return bi; };
    cv.addEventListener('pointerdown', e => {
      if (step !== 1) return; const [x, y] = pt(e), bi = near(x, y);
      if (bi < 0) return;
      drag = bi; dragAt = { x, y, q: quad[bi].slice() }; cv.setPointerCapture(e.pointerId); draw();
    });
    cv.addEventListener('pointermove', e => {
      const [x, y] = pt(e);
      if (drag < 0) { if (step === 1) cv.style.cursor = near(x, y) >= 0 ? 'grab' : 'default'; return; }
      cv.style.cursor = 'grabbing';
      quad[drag] = [Math.min(src.width, Math.max(0, dragAt.q[0] + (x - dragAt.x) / view.k)), Math.min(src.height, Math.max(0, dragAt.q[1] + (y - dragAt.y) / view.k))];
      draw();
    });
    const up = () => { if (drag >= 0) { drag = -1; cv.style.cursor = 'grab'; draw(); } };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    const onResize = () => layout(); window.addEventListener('resize', onResize);

    const busy = on => { let b = $w('.sc-busy'); if (on && !b) { b = document.createElement('div'); b.className = 'sc-busy'; b.textContent = '만드는 중…'; mid.appendChild(b); } else if (!on && b) b.remove(); };
    async function render(m) {   // 보정한 결과 (보정 방법마다 한 번만 만들어 둠)
      if (cache[m]) return cache[m];
      if (!flat) flat = warp(src, quad);
      const out = m === 'doc' ? enhanceDoc(flat) : m === 'color' ? enhanceColor(flat) : flat;
      const blob = await new Promise(r => out.toBlob(r, 'image/jpeg', m === 'doc' ? 0.8 : 0.82));
      if (!blob) throw new Error('그림을 만들지 못함');
      return (cache[m] = { blob, url: URL.createObjectURL(blob) });
    }
    async function showPrev() {
      busy(true); await new Promise(r => setTimeout(r, 30));
      try { const c = await render(mode); img.src = c.url; img.hidden = false; }
      catch (e) { alert('보정하지 못했습니다: ' + e.message); go(1); }
      finally { busy(false); }
    }
    function go(n) {
      step = n;
      $w('[data-s="1"]').style.display = n === 1 ? 'contents' : 'none';
      $w('[data-s="2"]').style.display = n === 2 ? 'contents' : 'none';
      wrap.querySelectorAll('[data-st]').forEach(x => x.classList.toggle('on', +x.dataset.st === n));
      $w('[data-t]').innerHTML = n === 1 ? '모서리 맞추기<small>영수증 부분만 남기고 잘라냅니다</small>' : '미리보기<small>글자가 잘 보이는 보정을 고르세요</small>';
      tip.textContent = n === 1 ? '파란 동그라미를 끌어 영수증 모서리에 맞추세요' : '';
      tip.hidden = n !== 1;
      if (n === 1) { img.hidden = true; cv.hidden = false; layout(); }
      else { cv.hidden = true; showPrev(); }
    }

    return new Promise(done => {
      const close = r => { window.removeEventListener('resize', onResize); window.removeEventListener('keydown', onKey, true); dropCache(); wrap.remove(); done(r); };
      const onKey = e => {   // PC: Enter = 다음/저장, Esc = 뒤로/취소 (뒤 창으로 키가 가지 않게)
        if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); if (!$w('.sc-busy')) $w(step === 1 ? '[data-a="next"]' : '[data-a="ok"]').click(); }
        else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (step === 2) go(1); else close(null); }
      };
      window.addEventListener('keydown', onKey, true);
      wrap.querySelectorAll('[data-m]').forEach(b => b.onclick = () => {
        mode = b.dataset.m; wrap.querySelectorAll('[data-m]').forEach(x => x.classList.toggle('on', x === b));
        try { localStorage.setItem('ysm.scanMode', mode); } catch (e) { }
        showPrev();
      });
      $w('[data-a="cancel"]').onclick = () => close(null);
      if (opt.del) $w('[data-a="del"]').onclick = () => { if (confirm('이 사진을 목록에서 뺄까요?\n(휴대폰 사진첩의 사진은 그대로 있습니다)')) close('del'); };
      $w('[data-a="rot"]').onclick = () => { src = rotate(src); rot = (rot + 1) % 4; quad = detect(src); dropCache(); layout(); };
      $w('[data-a="auto"]').onclick = () => { quad = detect(src); dropCache(); draw(); };
      $w('[data-a="full"]').onclick = () => { quad = full(src); dropCache(); draw(); };
      $w('[data-a="next"]').onclick = () => { dropCache(); go(2); };
      $w('[data-a="back"]').onclick = () => go(1);
      $w('[data-a="ok"]').onclick = async () => {
        busy(true); await new Promise(r => setTimeout(r, 30));
        try { const c = await render(mode); const blob = c.blob; close({ blob, edit: { quad: quad.map(p => p.slice()), rot, mode } }); }
        catch (e) { busy(false); alert('보정하지 못했습니다: ' + e.message); }
      };
      requestAnimationFrame(() => go(1));
    });
  }
  // 편집 화면 없이 자동 정리 (연속 촬영·여러 장): 모서리 자동 찾기 → 반듯하게 → 마지막에 고른 보정. 결과가 이상하면 [✂ 편집] (edit 로 이어서 고침)
  async function auto(file) {
    const src = await loadCanvas(file), quad = detect(src);
    let mode = 'doc'; try { mode = localStorage.getItem('ysm.scanMode') || 'doc'; } catch (e) { }
    if (!MODES.some(m => m[0] === mode)) mode = 'doc';
    const flat = warp(src, quad), out = mode === 'doc' ? enhanceDoc(flat) : mode === 'color' ? enhanceColor(flat) : flat;
    const blob = await new Promise(r => out.toBlob(r, 'image/jpeg', mode === 'doc' ? 0.8 : 0.82));
    if (!blob) throw new Error('그림을 만들지 못함');
    return { blob, edit: { quad: quad.map(p => p.slice()), rot: 0, mode } };
  }
  return { open, auto, detect, warp, enhanceDoc };
})();
