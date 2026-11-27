/* 유성 현장 관리 프로그램 — 체험 모드 (11/27)
 * 폴더 없이 예시 현장 자료로 모든 화면을 둘러보기. 자료는 브라우저 메모리 안 가상 폴더에만 쓰고, 새로고침하면 사라짐.
 * 실제 데이터 폴더·영수증 보관 폴더·이 PC 기억(IndexedDB 폴더 기억)은 건드리지 않음.
 * 예시 이름·금액은 모두 가짜 (공개 저장소에 올라감 — 실제 현장·업체·사람 자료를 넣지 않음) */
'use strict';

/* ---- 메모리 폴더: File System Access API 의 폴더·파일 손잡이 흉내 (프로그램이 쓰는 기능만) ---- */
const memNF = n => new DOMException(`A requested file or directory could not be found: ${n}`, 'NotFoundError');
const memTM = n => new DOMException(`The path supplied exists, but was not an entry of requested type: ${n}`, 'TypeMismatchError');
class MemFile {
  constructor(name) { this.kind = 'file'; this.name = name; this.data = new Blob([]); this.mtime = Date.now(); }
  async getFile() { return new File([this.data], this.name, { lastModified: this.mtime }); }
  async createWritable(o) {
    const self = this, parts = o && o.keepExistingData ? [this.data] : [];
    return {
      async write(d) { if (d && typeof d === 'object' && d.type === 'write') d = d.data; if (d && typeof d === 'object' && (d.type === 'truncate' || d.type === 'seek')) return; parts.push(d); },
      async truncate() { parts.length = 0; }, async seek() { }, async abort() { },
      async close() { self.data = new Blob(parts); self.mtime = Date.now(); },
    };
  }
  async queryPermission() { return 'granted'; } async requestPermission() { return 'granted'; }
  async isSameEntry(o) { return o === this; }
}
class MemDir {
  constructor(name) { this.kind = 'directory'; this.name = name; this.kids = new Map(); }
  async getDirectoryHandle(n, o) { let h = this.kids.get(n); if (h && h.kind !== 'directory') throw memTM(n); if (!h) { if (!(o && o.create)) throw memNF(n); h = new MemDir(n); this.kids.set(n, h); } return h; }
  async getFileHandle(n, o) { let h = this.kids.get(n); if (h && h.kind !== 'file') throw memTM(n); if (!h) { if (!(o && o.create)) throw memNF(n); h = new MemFile(n); this.kids.set(n, h); } return h; }
  async removeEntry(n, o) { const h = this.kids.get(n); if (!h) throw memNF(n); if (h.kind === 'directory' && h.kids.size && !(o && o.recursive)) throw new DOMException('not empty', 'InvalidModificationError'); this.kids.delete(n); }
  async *entries() { for (const e of [...this.kids.entries()]) yield e; }
  async *values() { for (const h of [...this.kids.values()]) yield h; }
  async *keys() { for (const k of [...this.kids.keys()]) yield k; }
  [Symbol.asyncIterator]() { return this.entries(); }
  async queryPermission() { return 'granted'; } async requestPermission() { return 'granted'; }
  async isSameEntry(o) { return o === this; }
  async resolve(o) { if (o === this) return []; for (const [n, h] of this.kids) { if (h === o) return [n]; if (h.kind === 'directory') { const r = await h.resolve(o); if (r) return [n, ...r]; } } return null; }
}

/* ---- 체험 시작: 메모리 폴더 → 예시 현장 하나 ---- */
const DEMO_FOLDER = '001. 체험 현장';
async function demoStart() {
  state.demo = true; state.savedRootName = '';
  RC.root = null; RC.want = false; RC.ready = false;   // 영수증 보관 폴더(실제 PC 폴더)에 체험 자료가 쓰이지 않게
  const root = new MemDir('체험용 폴더 (저장 안 됨)');
  await root.getDirectoryHandle(DEMO_FOLDER, { create: true });
  await openRoot(root);
  if (!FS.ready) return;
  closeModal();   // 01 linkPending 의 폴더 연결 창
  demoFill();
  save(); render();
  toast('체험 모드입니다. 예시 자료로 둘러보세요 — 고친 내용은 저장되지 않고 새로고침하면 사라집니다.');
}
function demoFill() {
  const ym = state.ym, st = db.sites[0] || newSite('체험');
  if (!db.sites.length) db.sites.push(st);
  Object.assign(st, { name: '체험', fullName: '○○ 공동주택 체험 현장 (예시)', folder: DEMO_FOLDER, manager: '실무책임자 / 홍길동', checker: '경영지원팀 담당자', startYm: ymAdd(ym, -1), docPrefix: 'YS-체험현장', totalUnits: 500 });
  db.cur = st.id;
  const sid = st.id, catOf = re => { for (const c of CATS) for (const s of c.s) if (re.test(s)) return s; return ''; };
  db.cards.push({ id: uid(), siteId: sid, last4: '1234', issuer: '○○카드', holder: '홍길동', limit: 3000000 }, { id: uid(), siteId: sid, last4: '5678', issuer: '○○카드', holder: '김철수', limit: 1000000 });
  const P = [['홍길동', '정직원', '기획'], ['김철수', '현장', '상담사'], ['이영희', '현장', '상담사'], ['박민수', '현장', 'TM']]
    .map(([name, kind, team]) => ({ id: uid(), siteId: sid, name, kind, team, title: '', active: true }));
  db.staff.push(...P);
  const last = Math.min(daysIn(ym), todayStr().startsWith(ym) ? +todayStr().slice(8, 10) : daysIn(ym));
  const day = d => `${ym}-${pad2(Math.min(d, last))}`;
  const card = (d, last4, merchant, amount, re, memo) => ({ id: uid(), siteId: sid, src: 'card', kind: 'out', date: day(d), time: '12:10', card: last4, merchant, amount, cat: catOf(re), memo });
  db.tx.push(
    card(2, '1234', '○○식당', 36000, /식대|중식|식비/, '중식/김철수,이영희,박민수'),
    card(3, '1234', '○○마트', 48500, /소모품/, '사무용품 (복사용지·볼펜)'),
    card(5, '5678', '○○주유소', 70000, /유류|주유|차량/, '현장 차량 주유'),
    card(6, '1234', '○○식당', 24000, /식대|중식|식비/, '중식/김철수,이영희'),
    card(9, '1234', '○○카페', 15000, /간식|다과|회의/, '간식/방문 고객 응대'),
    card(12, '5678', '○○문구', 23000, /소모품/, ''),
    { id: uid(), siteId: sid, src: 'cash', kind: 'in', date: day(1), time: '', card: '', merchant: '', amount: 1000000, cat: '', memo: '전도금 입금' },
    { id: uid(), siteId: sid, src: 'cash', kind: 'out', date: day(4), time: '', card: '', merchant: '○○철물', amount: 32000, cat: catOf(/소모품/), memo: '현수막 끈·테이프' },
    { id: uid(), siteId: sid, src: 'cash', kind: 'out', date: day(8), time: '', card: '', merchant: '○○퀵', amount: 18000, cat: catOf(/운반|퀵|택배|통신/), memo: '서류 퀵 발송' });
  [['○○렌탈', '복합기 임차'], ['○○통신', '인터넷·전화'], ['○○생수', '생수 배달']].forEach(([name, desc], i) =>
    db.vendors.push({ id: uid(), siteId: sid, subject: (typeof MONTHLY_SUBJECTS !== 'undefined' && MONTHLY_SUBJECTS[i]) || '', name, desc, ref: '', active: true, order: i }));
  const att = attOf(ym);
  for (const p of P) { const r = att[p.id] = {}; for (let d = 1; d <= last; d++) { const w = weekday(ym, d); if (w !== 0 && w !== 6) r[d] = '1'; } }
}
const demoBanner = () => state.demo ? `<div class="banner warn small demo-banner">🧪 <b>체험 모드</b> — 예시 자료입니다. 고친 내용은 저장되지 않고, 새로고침하면 사라집니다. <button class="btn sm" data-act="demoEnd">체험 끝내기</button></div>` : '';
