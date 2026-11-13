/* 유성 현장 관리 프로그램 — 예산 (예산심의안 작성 · 파일 주고받기 · 결재 잠금 · 예산 대비 집행 · 전용/증액 품의)
 * 품의 기준 (2026-11 상무님 회의): 예산 단가·총액 안 = 품의 없이 월결제 지급(구두보고) / 예산 초과·예산 외 항목·전용·증액 = 품의
 * 자료: site.budget = { title, author, date, open, phases:[{name,from,to}], punit('원'|'천원'), households, feePer, support:{rate,cap,note},
 *        notes, items:[{id, acc, grp, name, unit, qty, d:[단계별 일수·개월], price, fix?:[단계별 금액(엑셀에서 읽은 값)], memo}],
 *        status('작성중'|'결재전'|'결재완료'), approved:{date, scans:[rel]}, moves:[{id, kind:'전용'|'증액', from, to, amt, pmId, pmNo, date, reason}], src }
 * 금액 = 인원(수량) × 단계별 일수(개월) 합 × 단가 (원, VAT 별도). 결재완료 뒤에는 고칠 수 없고 전용·증액(품의 결재 후 반영)만 쌓임.
 * 폴더 없이 쓰기(본부장): 첫 화면 [예산안만 작성] → 브라우저에 임시 보관(BG_SOLO_KEY) → [파일로 저장] = 회사 양식 xlsx + 숨은 시트 '_예산데이터'(원본 값)
 * 실무자: 예산 탭 [예산안 파일 가져오기] → 숨은 시트가 있으면 그대로, 없으면(예전 엑셀 예산안) 머리글(인원·투입일·단가·총 지급액)로 읽음 */
'use strict';
const BG_VER = 1, BG_SHEET = '_예산데이터', BG_SOLO_KEY = 'yusung_budget_solo';
const BG_UNITS = ['일', '개월', '회', '식', '건', '대'];
const BG_PH0 = ['사전', '본영업', '사후'];
// 기본 항목 [계정, 구분, 세부, 단위, 단가(원)] — 예전 예산안들의 항목 모음
// 단가는 모두 0 (공개 웹에 올라가는 코드라 회사 단가를 넣지 않음, 11/13) — 단가는 예전 예산안 파일 가져오기로 채움. 안 쓰는 줄은 [빈 줄 모두 빼기]
const BG_TPL = [
  // 인건비 — 일급(일)·월급(개월) 줄은 인력 일정에서 날짜별 인원
  ['인건비', '기획팀', '본부장', '일', 0], ['인건비', '기획팀', '기획팀장', '일', 0], ['인건비', '기획팀', '기획팀 차장(계약)', '일', 0], ['인건비', '기획팀', '기획팀 대리(계약)', '일', 0],
  ['인건비', '영업', '상담사(팀장)', '일', 0], ['인건비', '영업', '상담사', '일', 0],
  ['인건비', 'TM', '팀장', '일', 0], ['인건비', 'TM', '팀원', '일', 0],
  ['인건비', '알바', '팀장', '일', 0], ['인건비', '알바', '팀원', '일', 0], ['인건비', '알바', '팀원(주차)', '일', 0],
  ['인건비', '프로모션', '팀원', '일', 0],
  ['인건비', '홍보단(모니터)', '팀원', '일', 0],
  ['인건비', '도우미', '팀장', '일', 0], ['인건비', '도우미', '팀원', '일', 0],
  ['인건비', '경호', '팀장', '일', 0], ['인건비', '경호', '팀원', '일', 0],
  ['인건비', '계약직', '경리', '개월', 0], ['인건비', '계약직', '미화', '일', 0],
  ['인건비', '연장수당', '영업', '회', 0], ['인건비', '연장수당', 'TM', '회', 0], ['인건비', '연장수당', '도우미', '회', 0],
  ['인건비', '영업조직 일비', '', '회', 0],
  // 복리후생비
  ['복리후생비', '식대', '기획', '일', 0], ['복리후생비', '식대', '영업', '일', 0], ['복리후생비', '식대', 'TM', '일', 0], ['복리후생비', '식대', '알바', '일', 0],
  ['복리후생비', '식대', '홍보단', '일', 0], ['복리후생비', '식대', '도우미', '일', 0], ['복리후생비', '식대', '경호', '일', 0], ['복리후생비', '식대', '계약직', '일', 0], ['복리후생비', '식대', '연장 식대', '일', 0],
  ['복리후생비', '회식비', '', '회', 0], ['복리후생비', '간식비', '', '개월', 0], ['복리후생비', '석식비', '기획팀(시행사·시공사 포함)', '일', 0], ['복리후생비', '운영비(생수·커피 등)', '', '개월', 0],
  // 임차료
  ['임차료', 'O/A', '복사기', '개월', 0], ['임차료', 'O/A', '컴퓨터(기획)', '개월', 0], ['임차료', 'O/A', '상담석 PC', '개월', 0], ['임차료', 'O/A', '순번대기표', '개월', 0],
  ['임차료', 'O/A', '근태관리(오션)', '개월', 0], ['임차료', 'O/A', '아웃바운드 전화', '개월', 0],
  ['임차료', '통신', 'CRM(TM·녹취 포함)', '개월', 0], ['임차료', '통신', '상담 녹취기능', '개월', 0], ['임차료', '통신', '리드 서비스(대표번호)', '개월', 0],
  ['임차료', '통신', '링고서비스(설치)', '회', 0], ['임차료', '통신', '링고(월이용료)', '개월', 0], ['임차료', '통신', '음성녹취(성우)', '회', 0],
  ['임차료', '사무집기', '책상 세트', '개월', 0], ['임차료', '사무집기', '책상(W1400*D800)', '개월', 0], ['임차료', '사무집기', '상담책상(W1400*D800)', '개월', 0], ['임차료', '사무집기', '이동서랍(3단)', '개월', 0],
  ['임차료', '사무집기', '회전의자(사무용)', '개월', 0], ['임차료', '사무집기', '회전의자(회의용)', '개월', 0], ['임차료', '사무집기', '절탁자(W1200*D600)', '개월', 0], ['임차료', '사무집기', '회의테이블(W1800*D900)', '개월', 0],
  ['임차료', '사무집기', '3단 올문장', '개월', 0], ['임차료', '사무집기', '5단 올문장(800*400*1880)', '개월', 0], ['임차료', '사무집기', '파티션', '개월', 0], ['임차료', '사무집기', '냉장고', '개월', 0],
  ['임차료', '사무집기', '세단기', '개월', 0], ['임차료', '사무집기', '원형테이블', '개월', 0], ['임차료', '사무집기', '테이블의자', '개월', 0], ['임차료', '사무집기', '화이트보드(W1800*D900)', '개월', 0],
  ['임차료', '사무집기', '냉난방기', '개월', 0], ['임차료', '사무집기', '홍보관 셋팅용 집기', '개월', 0], ['임차료', '사무집기', '기타 집기', '식', 0], ['임차료', '사무집기', '배송·설치·회수(3톤)', '식', 0],
  ['임차료', '렌터카(업무용)', '', '개월', 0], ['임차료', '렌터카(랩핑카)', '', '개월', 0], ['임차료', '커피머신(홍보관 비치)', '', '개월', 0], ['임차료', '홍보부스·거점 임차', '', '개월', 0],
  ['임차료', '컨테이너(식당·창고)', '', '개월', 0], ['임차료', '난로', '', '개월', 0],
  ['임차료', '숙소 임대료', '', '개월', 0], ['임차료', '사전사무실 임대료(인테리어 포함)', '', '개월', 0],
  // 지급수수료 · 차량유지비 · 건물관리비
  ['지급수수료', '중개수수료', '숙소', '회', 0], ['지급수수료', '중개수수료', '임시사무실', '회', 0],
  ['차량유지비', '유류대', '사전 영업용 랩핑카', '일', 0], ['차량유지비', '유류대', '사후 영업용 랩핑카', '일', 0], ['차량유지비', '유류대', '개인차량(영업사원용)', '일', 0], ['차량유지비', '유류대', '난방기', '일', 0],
  ['차량유지비', '여비교통비(운반비 포함)', '', '회', 0],
  ['건물관리비', '숙소 관리비', '', '개월', 0], ['건물관리비', '사전사무실 관리비', '', '개월', 0],
  // 소모품비 · 통신비
  ['소모품비', '유니폼', '사전', '회', 0], ['소모품비', '유니폼', '도우미', '회', 0], ['소모품비', '방역·위생 용품(마스크·손세정제 등)', '', '회', 0], ['소모품비', '문구 및 기타 소모품', '', '개월', 0],
  ['통신비', '가설비(이전설치 포함)', '', '회', 0], ['통신비', '문자 발송비', '', '건', 0], ['통신비', '전화·인터넷 사용료', '', '개월', 0], ['통신비', '수신거부·우편 발송비', '', '회', 0],
  // MGM · 인센티브
  ['MGM', '부동산 MGM', '', '건', 0], ['MGM', '청약 MGM', '', '건', 0],
  ['인센티브', '영업', '', '회', 0], ['인센티브', 'TM', '', '회', 0],
  // 광고선전비
  ['광고선전비', '이벤트', '특화이벤트(필요시)', '회', 0], ['광고선전비', '이벤트', '청약경품', '회', 0], ['광고선전비', '이벤트', '사업설명회', '회', 0], ['광고선전비', '이벤트', '소그룹 설명회', '회', 0], ['광고선전비', '이벤트', '바이투게더', '회', 0],
  ['광고선전비', '현수막', '게릴라', '건', 0], ['광고선전비', '현수막', '중개업소(큐방)', '건', 0], ['광고선전비', '현수막', '대형', '건', 0],
  ['광고선전비', '온라인', '바이럴', '회', 0], ['광고선전비', '온라인', '애드버토리얼', '회', 0],
  ['광고선전비', '판촉물', '중개업소', '건', 0], ['광고선전비', '판촉물', '종이컵', '건', 0], ['광고선전비', '판촉물', '갑티슈', '건', 0], ['광고선전비', '판촉물', '물티슈(100매)', '건', 0], ['광고선전비', '판촉물', '행주', '건', 0],
  ['광고선전비', '인쇄물', '전단지', '건', 0], ['광고선전비', '인쇄물', '배너', '건', 0], ['광고선전비', '인쇄물', '3단 리플렛', '건', 0], ['광고선전비', '인쇄물', '지도 제작', '회', 0], ['광고선전비', '인쇄물', '카페 배너', '회', 0],
  ['광고선전비', '매체', '신문 지면', '회', 0], ['광고선전비', '매체', 'BTL', '회', 0],
  ['광고선전비', '공통', '홍보관 셋팅', '회', 0], ['광고선전비', '공통', '홍보관 원상복구', '회', 0],
];
const BG_ACC_ORDER = ['인건비', '복리후생비', '임차료', '지급수수료', '차량유지비', '건물관리비', '소모품비', '통신비', '수도광열비', 'MGM', '인센티브', '광고선전비', '기타'];
const bgAccKey = a => String(a || '').replace(/\s/g, '') || '기타';
const BG_ACC_ALIAS = { 광고홍보비: '광고선전비', 여비교통비: '차량유지비', 기타예비비: '기타' };   // 프로그램 계정(카드 세목·월결제 과목) → 예산 계정
const bgAccOf = g => BG_ACC_ALIAS[bgAccKey(g)] || bgAccKey(g);

/* ---------- 자료 ---------- */
const SOLO = { b: null, dirty: false };
const bgSoloOn = () => !!state.bgSolo && !FS.ready;
function bgNew(name) {
  const s = bgSoloOn() ? null : site();
  return {
    v: BG_VER, title: `${name || (s && (s.fullName || s.name)) || '○○'} 예산심의(案)`, site: (s && s.name) || name || '', author: '', date: todayStr(), start: '', open: '', fcfs: '',
    phases: BG_PH0.map(name => ({ name, from: '', to: '' })), punit: '천원', households: '', feeTotal: '', support: { rate: '', cap: '', note: '' },
    notes: '상기 예산(案)은 견본주택 오픈일 기준으로 작성함 (오픈 일정 연기 등으로 예산 변동 가능성 있음).\n단위: 원, VAT 별도',
    items: BG_TPL.map(([acc, grp, name, unit, price]) => ({ id: uid(), acc, grp, name, unit, qty: '', d: ['', '', ''], price: price || '', memo: '' })),
    status: '작성중', moves: [],
  };
}
function bgDoc() { if (bgSoloOn()) return SOLO.b; const s = db.sites.find(x => x.id === db.cur); return s ? s.budget || null : null; }
function bgTouch() { if (bgSoloOn()) { SOLO.dirty = true; try { localStorage.setItem(BG_SOLO_KEY, JSON.stringify({ b: SOLO.b, dirty: true })); } catch (e) { } } }
const bgLocked = B => !!B && B.status === '결재완료';
const bgN = v => toNum(v);
/* 날짜별 인원 (인건비): it.sched = [{ from, to, n }] — 구간마다 인원이 다름. 날짜마다 그 날이 든 단계로 (단계 밖 날짜는 바로 앞 단계, 처음보다 앞이면 첫 단계) */
const BG_DAY = 86400000;
const bgHasSched = it => !!(it.sched && it.sched.length);
const bgDayPrice = it => it.unit === '개월' ? bgN(it.price) / 30 : bgN(it.price);   // 월급 = 일수 ÷ 30 × 월급 (예: 82일 × 월급 ÷ 30)
const bgSegDays = s => s.from && (s.to || s.from) >= s.from ? Math.round((Date.parse(s.to || s.from) - Date.parse(s.from)) / BG_DAY) + 1 : 0;
function bgSchedPh(B, it) {   // 단계별 연인원(명×일) + 단계 밖 날짜 수
  const out = B.phases.map(() => 0), rg = B.phases.map(p => p.from && (!p.to || p.to >= p.from) ? [Date.parse(p.from), p.to ? Date.parse(p.to) : Infinity] : null);   // 끝 날짜 없는 단계(사후) = 끝까지
  let outside = 0;
  (it.sched || []).forEach(s => {
    const n = bgN(s.n), days = Math.min(bgSegDays(s), 1500); if (!n || !days) return;
    for (let k = 0, t = Date.parse(s.from); k < days; k++, t += BG_DAY) {
      let i = rg.findIndex(r => r && t >= r[0] && t <= r[1]);
      if (i < 0) { outside++; i = 0; rg.forEach((r, j) => { if (r && r[0] <= t) i = j; }); }
      out[i] += n;
    }
  });
  return { ph: out, outside };
}
function bgPhAmt(B, it) {   // 단계별 금액
  if (it.fix) return B.phases.map((_, i) => Math.round(bgN(it.fix[i])));
  if (bgHasSched(it)) return bgSchedPh(B, it).ph.map(v => Math.round(v * bgDayPrice(it)));
  return B.phases.map((_, i) => Math.round(bgN(it.qty) * bgN((it.d || [])[i]) * bgN(it.price)));
}
const bgAmt = (B, it) => bgPhAmt(B, it).reduce((a, b) => a + b, 0);
const bgDays = (B, it) => B.phases.reduce((a, _, i) => a + bgN((it.d || [])[i]), 0);
const bgPD = (B, it) => bgHasSched(it) ? bgSchedPh(B, it).ph.reduce((a, b) => a + b, 0) : bgN(it.qty) * bgDays(B, it);   // 총 투입 (연인원·대·개월)
const bgHead = it => bgHasSched(it) ? Math.max(0, ...it.sched.map(s => bgN(s.n))) : bgN(it.qty);   // 인원 (일정이면 가장 많은 날)
const bgItemLabel = it => [it.grp, it.name].filter(Boolean).join(' · ') || '(이름 없음)';
function bgLim(B, it) {   // 현재 예산 = 최초 + 받은 전용·증액 − 준 전용
  const mv = B.moves || [];
  return bgAmt(B, it) + sum(mv.filter(m => m.to === it.id), m => m.amt) - sum(mv.filter(m => m.from === it.id), m => m.amt);
}
function bgAccs(B) {   // 계정 순서 (예산에 적힌 순서 그대로, 처음 보는 계정은 뒤로)
  const seen = []; B.items.forEach(it => { const k = bgAccKey(it.acc); if (!seen.includes(k)) seen.push(k); }); return seen;
}
const bgUsed = B => B.items.filter(it => bgAmt(B, it) || bgLim(B, it));
const bgTotal = B => sum(B.items, it => bgAmt(B, it));
const bgPhDays = p => (p.from && p.to && p.to >= p.from) ? Math.round((new Date(p.to) - new Date(p.from)) / 86400000) + 1 : 0;
/* 영업 단계 = 투입일·오픈일·선착순 세 날짜로 (사전 = 투입~오픈 전날 · 본영업 = 오픈~선착순 전날 · 사후 = 선착순부터, 끝 없음) — 엑셀에서 읽은 2단계 예산은 그대로 */
const bgPrevDay = d => d ? new Date(Date.parse(d) - 86400000).toISOString().slice(0, 10) : '';
function bgSyncPh(B) {
  if (B.phases.length !== 3) return;
  const [a, b, c] = B.phases;
  a.from = B.start || ''; a.to = B.open ? bgPrevDay(B.open) : B.fcfs ? bgPrevDay(B.fcfs) : '';
  b.from = B.open || ''; b.to = B.fcfs ? bgPrevDay(B.fcfs) : '';
  c.from = B.fcfs || ''; c.to = '';
}
const bgDot = d => d ? String(d).replace(/-/g, '.') : '';

/* ---------- 화면: 예산 탭 ---------- */
/* 예산·손익 탭 = [예산] 예산 작성 · 인력 일정 · 현장 정보 / [손익] 예산 대비 집행 · 현장 손익(12 viewPl) — 현장 손익은 관리자 잠금(secOpt tabs 'pl')이면 그 보기만 잠김 */
const bgGrpOf = sub => sub === 'exec' || sub === 'pl' ? '손익' : '예산';
function bgBar(B, solo) {
  const sub = state.bgSub || 'edit', g = solo ? '예산' : bgGrpOf(sub);
  const L = { 예산: [['edit', B && bgLocked(B) ? '예산 (결재본)' : '예산 작성'], ['cal', '날짜별 일정'], ['info', '현장 정보']], 손익: [['exec', '예산 대비 집행'], ['pl', `현장 손익${hiddenTab('pl') ? ' 🔒' : ''}`]] };
  const top = solo ? '' : `<div class="subtabs bg-top">${['예산', '손익'].map(k => `<button class="${k === g ? 'active' : ''}" data-act="bgGrp" data-v="${k}">${k}</button>`).join('')}</div>`;
  const right = B && sub === 'cal' && g === '예산' ? bgCalStats(B) : '';   // 날짜별 일정: 단계별 합계를 탭 줄 오른쪽 빈자리에
  return `${top}<div class="subtabs sub2">${L[g].map(([k, l]) => `<button class="${k === sub ? 'active' : ''}" data-act="bgSub" data-v="${k}">${l}</button>`).join('')}${right}</div>`;
}
function bgCalStats(B) {   // 날짜로 넣은 줄 합계 (한 줄 요약)
  const C = bgCalItems(B).filter(bgIsCal), lab = C.filter(bgIsLab), oth = C.filter(it => !bgIsLab(it)), P = B.phases;
  const k = (l, v, tip = '') => `<span class="bg-cs" ${tip ? `title="${tip}"` : ''}><span class="muted">${l}</span> <b>${v}</b></span>`;
  return `<div class="bg-calstats">${P.map((p, i) => k(esc(p.name), fmt(sum(C, it => bgPhAmt(B, it)[i])))).join('')}<span class="bg-calsep"></span>${k('인건비', fmt(sum(lab, it => bgAmt(B, it))), '날짜로 넣은 인건비 줄')}${oth.length ? k(`다른 항목 ${oth.length}줄`, fmt(sum(oth, it => bgAmt(B, it)))) : ''}${k('연인원', `${fmtQty(sum(lab, it => bgPD(B, it))) || 0}명일`)}</div>`;
}
function viewBudget() {
  const B = bgDoc(), sub = state.bgSub || 'edit';
  if (sub === 'pl') return hiddenTab('pl') ? `${pageHead('현장 손익 🔒', esc(site().fullName || site().name))}${bgBar(B)}<div class="panel"><p>현장 손익은 관리자 잠금으로 숨겨져 있습니다.</p>${BTN('bgPlUnlock', '🔓 관리자 비밀번호로 열기', '', 'primary')}</div>` : viewPl(bgBar(B));
  return B ? viewBudgetMain(B, sub) : viewBudgetNone();
}
function viewBudgetNone() {
  return `${pageHead(`${esc(site().name)}현장 예산`, '현장 투입 전 예산심의(案) — 예산 단가·총액 안의 지출은 품의 없이 월결제로 (구두보고)',
      BTN('bgFileIn', '📥 예산안 파일 가져오기', '', 'primary') + BTN('bgCreate', '+ 새 예산 작성'))}${bgBar(null)}
    <div class="panel"><p>이 현장에는 아직 예산이 없습니다.</p>
      <ul class="small muted" style="margin:0;padding-left:18px;line-height:1.8">
        <li>본부장님이 웹에서 작성해 보낸 <b>예산안 파일(.xlsx)</b>을 받았으면 → <b>[예산안 파일 가져오기]</b></li>
        <li>예전 엑셀 예산안(세부내역·기간별 예산안 시트)도 가져올 수 있습니다 — 항목·단가·총액을 읽어 옵니다.</li>
        <li>프로그램에서 바로 쓰려면 → <b>[+ 새 예산 작성]</b> (자주 쓰는 항목이 미리 들어 있음)</li></ul></div>`;
}
function viewBudgetMain(B, sub) {
  return `${pageHead(`${esc(site().name)}현장 예산 ${bgStBadge(B)}`, `${esc(B.title || '')}${B.author ? ` · 작성 ${esc(B.author)}` : ''}${B.date ? ` · ${bgDot(B.date)}` : ''} · 최초 예산 ${fmt(bgTotal(B))}원 (VAT 별도)`,
    (bgLocked(B) ? BTN('bgMovePm', '전용·증액 품의 작성', '', 'primary') : BTN('bgApprove', '결재완료로', 'title="결재가 끝나면 누르세요 — 예산이 잠기고 전용·증액 품의로만 바뀝니다"', 'primary'))
    + BTN('bgFileIn', '📥 예산안 파일 가져오기', bgLocked(B) ? 'disabled title="결재된 예산은 바꿀 수 없습니다"' : '')
    + MENU('인쇄', [MI('bgPrint', '예산심의(案) 인쇄', '', '갑지·세부내역·집계표'), MI('bgPrintExec', '예산 대비 집행 인쇄', '', '최초·전용·현재·집행')])
    + MENU('저장', [MI('bgFileOut', '예산안 파일로 저장 (.xlsx)', '', '회사 양식 + 프로그램이 다시 읽는 원본'), MI('bgExecXl', '예산 대비 집행 엑셀')]))}
    ${bgBar(B)}
    ${sub === 'exec' ? bgExecView(B) : sub === 'cal' ? bgCalView(B) : sub === 'info' ? bgInfoView(B) : bgEditView(B)}`;
}
const bgStBadge = B => B.status === '결재완료' ? `<span class="badge ok" title="${B.approved && B.approved.date ? `결재 ${bgDot(B.approved.date)}` : ''}">결재완료 · 잠김</span>` : B.status === '결재전' ? '<span class="badge warn">결재 전</span>' : '<span class="badge">작성중</span>';

const bgStBanner = B => bgSoloOn() ? '' : bgLocked(B) ? `<div class="banner ok small">결재된 예산입니다 (${bgDot((B.approved || {}).date)}) — 고칠 수 없습니다. 초과·예산 외 지출은 <b>[전용·증액 품의 작성]</b>으로 품의 후, 결재되면 <b>손익 → 예산 대비 집행</b>에서 [반영]하세요.${(B.approved || {}).scans && B.approved.scans.length ? ` <button class="btn sm" data-act="bgScanView">📎 결재본 ${B.approved.scans.length}</button>` : ''} <button class="btn sm ghost" data-act="bgUnapprove" title="잘못 눌렀거나 시험한 경우 — 결재 전으로 되돌려 다시 고칠 수 있게">결재완료 취소</button></div>`
  : `<div class="banner info small">결재 전에도 이 예산으로 월결제·집행 비교가 됩니다 (표시: "결재 전"). 결재가 끝나면 <b>[결재완료로]</b>를 눌러 잠그세요.</div>`;
/* 현장 정보: 제목·작성자·세대수·수수료 총액·실비 지원·영업 일정(투입일·오픈일·선착순)·비고 */
function bgInfoView(B) {
  const lock = bgLocked(B) ? 'disabled' : '', P = B.phases;
  const inp = (f, v, attrs = '') => `<input value="${esc(v ?? '')}" data-ch="bgMeta" data-f="${f}" ${lock} ${attrs}>`;
  return `${bgStBanner(B)}<div class="panel bg-meta"><div class="form-grid">
      <label style="grid-column:span 2">제목${inp('title', B.title, 'placeholder="○○ 공동주택 예산심의(案)"')}</label>
      <label>현장(약칭)${inp('site', B.site, 'placeholder="예) 양산"')}</label>
      <label>작성자${inp('author', B.author, 'placeholder="예) ○○○ 본부장"')}</label>
      <label>작성일자<input type="date" value="${esc(B.date || '')}" data-ch="bgMeta" data-f="date" ${lock}></label>
      <label>세대수${inp('households', B.households, 'class="num" placeholder="예) 842"')}</label>
      <label>수수료 총액 (원)${inp('feeTotal', fmt0(bgFee(B)), 'class="num" data-num="1" placeholder="예) 1,684,000,000"')}</label>
      <label>실비 지원율 (%)<input class="num" value="${esc((B.support || {}).rate ?? '')}" data-ch="bgSup" data-f="rate" ${lock} placeholder="없으면 비움"></label>
      <label>실비 지원 한도 (원)<input class="num" value="${fmt0((B.support || {}).cap)}" data-ch="bgSup" data-f="cap" ${lock} placeholder="예) 400,000,000"></label>
      <label style="grid-column:span 2">실비 지원 조건<input value="${esc((B.support || {}).note || '')}" data-ch="bgSup" data-f="note" ${lock} placeholder="예) 시행사·신탁사 인정 항목 기준"></label>
      <label>인쇄 단위<select data-ch="bgMeta" data-f="punit" ${lock}>${['천원', '원'].map(u => `<option ${B.punit === u ? 'selected' : ''}>${u}</option>`).join('')}</select></label></div>
      <div class="bg-phases"><b class="small">영업 일정</b>
        ${[['start', '투입일'], ['open', '오픈일'], ['fcfs', '선착순']].map(([f, l]) => `<label class="bg-ph small">${l} <input type="date" value="${esc(B[f] || '')}" data-ch="bgMeta" data-f="${f}" ${lock}></label>`).join('')}
        <span class="muted small">${P.length === 3 ? P.map(p => `${esc(p.name)} ${p.from ? `${bgDot(p.from).slice(5)}~${p.to ? bgDot(p.to).slice(5) : ''}${bgPhDays(p) ? ` (${bgPhDays(p)}일)` : ''}` : '-'}`).join(' · ') : `엑셀에서 읽은 단계: ${P.map(p => esc(p.name)).join(' / ')}`}</span></div>
      <p class="muted small" style="margin:4px 0 0">사전 = 투입일 ~ 오픈 전날 · 본영업 = 오픈일 ~ 선착순 전날 · 사후 = 선착순부터</p>
      <label class="small" style="display:block;margin-top:8px">비고 (갑지 아래 문구, 줄마다 한 가지)<textarea rows="3" data-ch="bgMeta" data-f="notes" ${lock} style="width:100%">${esc(B.notes || '')}</textarea></label></div>`;
}
function bgEditView(B) {
  const lock = bgLocked(B) ? 'disabled' : '', P = B.phases;
  const accs = bgAccs(B), tot = P.map(() => 0);
  const NC = P.length + 8;   // 열 수: 구분 · 세부 · 단가 · 인원·수량 · 단계들 · 단위 · 금액 · 비고 · 실비청구
  const rows = accs.map((acc, ai) => {
    const its = B.items.filter(it => bgAccKey(it.acc) === acc), st = P.map(() => 0);
    const body = its.map(it => {
      const ph = bgPhAmt(B, it), amt = ph.reduce((a, b) => a + b, 0); ph.forEach((v, i) => { st[i] += v; tot[i] += v; });
      const c = (f, v, cls = '', a = '') => `<input class="${cls}" value="${esc(v ?? '')}" data-ch="bgItem" data-id="${it.id}" data-f="${f}" ${lock} ${a}>`;
      const warn = !lock && amt && !bgN(it.price) && !it.fix ? ' class="bad-row"' : '';
      return `<tr${warn} data-bgid="${it.id}"><td style="white-space:nowrap">${lock ? '' : '<span class="bg-grip" draggable="true" title="끌어서 순서 바꾸기 (같은 계정 안)">⠿</span>'}${c('grp', it.grp, 'bg-g')}</td><td>${c('name', it.name, 'bg-n')}</td>
        <td>${c('price', fmt0(it.price), 'num bg-p')}</td>
        ${bgIsCal(it) ? (() => {   // 날짜별 일정 줄(인건비 일급·월급 + 날짜로 넣기로 한 줄) = 수량은 날짜별 일정에서만 · 여기는 가장 많은 날 수량과 단계별 합만 보여 줌
          const sp = bgHasSched(it) ? bgSchedPh(B, it) : { ph: P.map((_, i) => bgN(it.qty) * bgN((it.d || [])[i])), outside: 0 }, hd = bgHead(it), w = bgQW(it);
          return `<td class="num"><a href="#" data-act="bgSub" data-v="cal" title="${w.n}은 [날짜별 일정]에서 날짜마다 넣습니다 — 여기는 가장 많은 날의 ${w.n}">${hd ? `${fmtQty(hd)}${w.u}` : '📅 넣기'}</a>${sp.outside ? '<div class="bad small">단계 밖 날짜</div>' : ''}</td>
          ${sp.ph.map((v, i) => `<td class="num muted small" title="${esc(P[i].name)} ${w.n} 합 (날짜별 일정)">${v ? `${fmtQty(v)}${w.t}` : '-'}</td>`).join('')}`; })()
          : `<td>${c('qty', it.qty, 'num bg-q')}</td>
          ${P.map((_, i) => `<td>${c('d' + i, (it.d || [])[i], 'num bg-d', `title="${esc(P[i].name)} ${it.unit || ''}수 (1명·1대당)"`)}</td>`).join('')}`}
        <td><select data-ch="bgItem" data-id="${it.id}" data-f="unit" ${lock}>${BG_UNITS.map(u => `<option ${it.unit === u ? 'selected' : ''}>${u}</option>`).join('')}</select></td>
        <td class="num"><b>${amt ? fmt(amt) : '-'}</b>${it.fix ? ' <span class="badge" title="엑셀에서 읽은 금액 그대로 — 인원·일수·단가를 고치면 다시 계산합니다">엑셀</span>' : ''}<div class="muted small">${bgPD(B, it) ? `총 ${fmtQty(bgPD(B, it))}${bgHasSched(it) ? '명일' : it.unit || ''}` : ''}</div></td>
        <td>${c('memo', it.memo, 'bg-m')}</td>
        <td class="bg-claim"><input type="checkbox" data-ch="bgItem" data-id="${it.id}" data-f="claim" ${it.claim ? 'checked' : ''} ${lock} title="시행사·신탁사에 실비로 청구할 수 있는 항목">${it.claim ? c('claimCap', it.claimCap, 'bg-cap', 'placeholder="한도 (없으면 비움)" title="실비 청구 한도 — 예) 3,000,000 · 1인 월 10만원"') : ''}</td></tr>`;
    }).join('');
    return `${ai ? `<tr class="bg-gap"><td colspan="${NC}"></td></tr>` : ''}<tr class="bg-acc"><td colspan="${NC}"><b>${esc(acc)}</b>${acc === '인건비' ? ` <button class="btn sm" data-act="bgSub" data-v="cal" title="출근부처럼 날짜마다 인원 넣기">📅 날짜별 인원 (출근부처럼)</button>` : lock ? '' : ` <button class="btn ghost sm" data-act="bgSub" data-v="cal" title="이 계정의 줄도 [날짜별 일정]에 그대로 나옵니다 — 날짜마다 수량을 넣으면 여기 금액이 같이 바뀜 (예: 행사 도우미·차량·현수막)">📅 날짜별로 넣기</button>`}</td></tr>${body}
      ${lock ? '' : `<tr class="bg-addrow"><td colspan="${NC}"><button class="btn ghost sm" data-act="bgItemAdd" data-acc="${esc(acc)}" title="${esc(acc)} 맨 아래에 줄 추가">+ ${esc(acc)} 줄 추가</button></td></tr>`}
      <tr class="sum"><td colspan="4">${esc(acc)} 소계</td>${st.map(v => `<td class="num">${fmt0(v)}</td>`).join('')}<td></td><td class="num"><b>${fmt(st.reduce((a, b) => a + b, 0))}</b></td><td></td><td></td></tr>`;
  }).join('');
  const all = tot.reduce((a, b) => a + b, 0);
  return `${bgStBanner(B)}
    ${P.length === 3 && P.some(p => !p.from) ? `<div class="banner warn small">영업 일정(투입일·오픈일·선착순)이 비어 있습니다 — <a href="#" data-act="bgSub" data-v="info">현장 정보</a>에서 넣어야 사전·본영업·사후로 나뉩니다.</div>` : ''}
    <div class="stats">${P.map((p, i) => `<div class="stat"><div class="k">${esc(p.name)}</div><div class="v">${fmt(tot[i])}</div></div>`).join('')}<div class="stat"><div class="k">총 예산 (VAT 별도)</div><div class="v">${fmt(all)}</div></div>${bgRev(B).fee ? `<div class="stat"><div class="k">예상 손익</div><div class="v ${bgRev(B).pl < 0 ? 'bad' : ''}">${fmt(bgRev(B).pl)}</div></div>` : ''}</div>
    <div class="tbl-wrap bg-wrap"><table class="t tight bg-tbl"><thead><tr><th>구분</th><th>세부</th><th>단가 (원)</th><th title="인원 또는 수량">인원·수량</th>${P.map(p => `<th title="1명·1대당 ${esc(p.name)} 기간">${esc(p.name)}<div class="muted small">일·개월 수</div></th>`).join('')}<th>단위</th><th>금액</th><th>비고</th><th title="시행사·신탁사에 실비로 청구할 수 있는 항목 — 체크하면 한도 칸이 나옵니다">실비청구<div class="muted small">한도</div></th></tr></thead>
    <tbody>${rows}<tr class="bg-gap"><td colspan="${NC}"></td></tr><tr class="sum"><td colspan="4">합계</td>${tot.map(v => `<td class="num">${fmt0(v)}</td>`).join('')}<td></td><td class="num"><b>${fmt(all)}</b></td><td></td><td></td></tr></tbody></table></div>
    ${lock ? '' : `<div class="row" style="margin-top:8px"><button class="btn sm" data-act="bgAccAdd">+ 계정 추가</button><button class="btn sm ghost" data-act="bgEmptyDel" title="금액이 0인 줄(안 쓰는 기본 항목)을 모두 뺌">빈 줄 모두 빼기</button><span class="muted small grow"><b>줄 위에서 오른쪽 클릭</b> = 줄 추가·복사·삭제 · <b>⠿ 를 끌면</b> 순서 바꾸기 · 금액 = 인원·수량 × 단계별 일수(개월) 합 × 단가 · 한 번만 나가는 비용은 단위 "회", 수량 1 · 일수 1</span></div>`}`;
}
const bgFee = B => B.feeTotal !== undefined && B.feeTotal !== '' ? bgN(B.feeTotal) : bgN(B.households) * bgN(B.feePer);   // 수수료 총액 (예전 자료: 세대수 × 세대당)
function bgRev(B) {   // 갑지: 수익 · 실비 지원 · 예상 손익
  const fee = bgFee(B), cost = bgTotal(B), sp = B.support || {};
  const sup = bgN(sp.rate) ? Math.min(Math.round(cost * bgN(sp.rate) / 100), bgN(sp.cap) || Infinity) : 0;
  return { fee, cost, sup, net: cost - sup, pl: fee - (cost - sup) };
}

/* ---------- 집행 (예산 대비) ---------- */
const BG_AC = { k: '', v: null };   // 저장할 때마다 다시 셈 (월결제 줄마다 부르므로)
function bgActual(sid = db.cur) {
  const k = `${sid}|${db.savedAt || 0}|${db.tx.length}`;
  if (BG_AC.k !== k) { BG_AC.v = bgActualRun(sid); BG_AC.k = k; }
  return BG_AC.v;
}
function bgActualRun(sid) {   // 계정별 · 예산 항목별 집행 (현장 손익과 같은 기준: 월결제·품의 = 공급가, 카드·전도금 = 그대로)
  const acc = {}, item = {}, add = (o, k, v) => { v = Math.round(v); if (v) o[k] = (o[k] || 0) + v; };
  siteMonths(sid).forEach(ym => {
    payRows(sid, ym, false).forEach(({ rec, c }) => { if (rec.payType !== '제외') add(acc, '인건비', rec.payType === '정직원(손익만)' ? c.base : c.gross); });
    const m = (db.monthly[sid] || {})[ym];
    if (m) db.vendors.filter(v => v.siteId === sid).forEach(v => { const r = m.rows[v.id]; if (!r) return; const a = (toNum(r.ys) + toNum(r.sh)) * (v.vat === false ? 1 : 10 / 11); add(acc, bgAccOf(v.subject || '기타'), a); if (v.bgItem) add(item, v.bgItem, a); });
    pmPlItems(sid, ym).forEach(([k, , a]) => add(acc, k === '기타(월경비)' ? '기타' : k === '판매수수료(조직)' ? '조직 수수료' : bgAccOf(k), a));
  });
  db.tx.filter(t => t.siteId === sid && t.kind !== 'in').forEach(t => add(acc, bgAccOf(GROUP_OF[t.cat] || '기타'), toNum(t.amount)));
  return { acc, item };
}
function bgRateWarns(B) {   // 출근부 설정의 구분별 단가 ↔ 예산 인건비 단가
  const labor = B.items.filter(it => bgAccKey(it.acc) === '인건비' && bgN(it.price));
  return (site().rateTable || []).filter(r => r.job && toNum(r.rate)).map(r => {
    const j = normLabel(r.job), hit = labor.filter(it => normLabel(`${it.grp}${it.name}`).includes(j) || j.includes(normLabel(it.grp)) && normLabel(it.grp));
    if (!hit.length) return { r, msg: '예산에 없는 직종 — 품의 필요' };
    const mx = Math.max(...hit.map(it => bgN(it.price)));
    return toNum(r.rate) > mx ? { r, msg: `예산 단가 ${fmt(mx)}원 초과 — 품의 필요` } : null;
  }).filter(Boolean);
}
function bgExecRows(B) {
  const A = bgActual(), accs = bgAccs(B);
  Object.keys(A.acc).forEach(k => { if (!accs.includes(k)) accs.push(k); });
  return accs.map(acc => {
    const its = B.items.filter(it => bgAccKey(it.acc) === acc);
    const base = sum(its, it => bgAmt(B, it)), lim = sum(its, it => bgLim(B, it)), used = A.acc[acc] || 0;
    return { acc, base, mv: lim - base, lim, used, left: lim - used, out: !its.length };
  });
}
function bgExecView(B) {
  const R = bgExecRows(B), A = bgActual(), T = k => sum(R, r => r[k]);
  const rw = bgRateWarns(B);
  const pms = pmAll().filter(p => p.bgMove).sort((a, b) => toNum(b.no) - toNum(a.no));
  const done = p => (B.moves || []).some(m => m.pmId === p.id);
  const vend = db.vendors.filter(v => v.siteId === db.cur && v.bgItem);
  const itemRows = B.items.filter(it => bgLim(B, it) || A.item[it.id] || (B.moves || []).some(m => m.to === it.id || m.from === it.id)).map(it => {
    const base = bgAmt(B, it), lim = bgLim(B, it), used = A.item[it.id] || 0, vs = vend.filter(v => v.bgItem === it.id);
    if (!vs.length && base === lim && !used) return '';
    return `<tr><td>${esc(bgAccKey(it.acc))}</td><td>${esc(bgItemLabel(it))}</td><td class="num">${dashN(base)}</td><td class="num">${lim - base ? (lim > base ? '+' : '') + fmt(lim - base) : '-'}</td><td class="num">${dashN(lim)}</td>
      <td class="small">${vs.map(v => esc(v.name)).join(', ') || '<span class="muted">-</span>'}</td><td class="num">${dashN(used)}</td><td class="num ${used > lim ? 'bad' : ''}">${fmt(lim - used)}</td><td>${used > lim ? '<span class="badge bad">초과 — 품의 필요</span>' : ''}</td></tr>`;
  }).join('');
  return `${B.status !== '결재완료' ? '<div class="banner warn small">아직 결재 전 예산입니다 — 결재가 끝나면 예산 작성 화면에서 [결재완료로]를 누르세요.</div>' : ''}
    ${pms.length ? `<div class="panel"><h3 style="margin:0 0 6px">전용·증액 품의</h3><table class="t"><thead><tr><th>품의</th><th>구분</th><th>받는 항목</th><th>주는 항목</th><th>금액</th><th>상태</th><th></th></tr></thead><tbody>${pms.map(p => {
      const m = p.bgMove, to = B.items.find(x => x.id === m.to), fr = B.items.find(x => x.id === m.from);
      return `<tr><td><a href="#" data-act="pmEdit" data-id="${p.id}">${esc(p.no)}번</a> ${esc(p.title || '')}</td><td>${esc(m.kind)}</td><td>${to ? esc(`${bgAccKey(to.acc)} · ${bgItemLabel(to)}`) : '<span class="bad">항목 없음</span>'}</td><td>${m.kind === '전용' ? (fr ? esc(`${bgAccKey(fr.acc)} · ${bgItemLabel(fr)}`) : '<span class="bad">항목 없음</span>') : '<span class="muted">(전체 예산 증액)</span>'}</td>
        <td class="num">${fmt(m.amt)}</td><td><span class="pm-st ${pmStCls(p.status)}">${esc(p.status)}</span></td>
        <td>${done(p) ? '<span class="badge ok">반영됨</span>' : p.status === '결재완료' ? `<button class="btn sm primary" data-act="bgMoveApply" data-id="${p.id}">반영</button>` : '<span class="muted small">결재 후 반영</span>'}</td></tr>`;
    }).join('')}</tbody></table></div>` : ''}
    <div class="tbl-wrap"><table class="t"><thead><tr><th>계정</th><th>최초 예산</th><th>전용·증액</th><th>현재 예산</th><th>집행</th><th>남은 금액</th><th>집행률</th><th></th></tr></thead><tbody>
      ${R.map(r => `<tr><td><b>${esc(r.acc)}</b></td><td class="num">${dashN(r.base)}</td><td class="num">${r.mv ? (r.mv > 0 ? '+' : '') + fmt(r.mv) : '-'}</td><td class="num">${dashN(r.lim)}</td><td class="num">${dashN(r.used)}</td>
        <td class="num ${r.left < 0 ? 'bad' : ''}">${fmt(r.left)}</td><td class="num">${r.lim ? Math.round(r.used / r.lim * 100) + '%' : '-'}</td>
        <td>${r.out && r.used ? '<span class="badge bad">예산 외 — 품의 필요</span>' : r.left < 0 ? '<span class="badge bad">초과 — 품의 필요</span>' : ''}</td></tr>`).join('')}
      <tr class="sum"><td>합계</td><td class="num">${fmt(T('base'))}</td><td class="num">${T('mv') ? fmt(T('mv')) : '-'}</td><td class="num">${fmt(T('lim'))}</td><td class="num">${fmt(T('used'))}</td><td class="num">${fmt(T('lim') - T('used'))}</td><td class="num">${T('lim') ? Math.round(T('used') / T('lim') * 100) + '%' : '-'}</td><td></td></tr></tbody></table></div>
    <p class="muted small">집행 = 인건비 탭 + 월결제(공급가) + 법인카드·전도금(그대로) + 지출결의서로 나간 품의(공급가) — 현장 손익과 같은 기준, 이 현장 전체 기간.</p>
    ${rw.length ? `<div class="panel"><h3 style="margin:0 0 6px">인건비 단가 확인 <span class="muted small">— 출근부 설정의 구분별 단가</span></h3>${rw.map(x => `<div class="small"><b>${esc(x.r.job)}</b> ${fmt(toNum(x.r.rate))}원 → <span class="bad">${esc(x.msg)}</span></div>`).join('')}</div>` : ''}
    <div class="panel"><h3 style="margin:0 0 6px">항목별 <span class="muted small">— 월결제 거래처를 예산 항목에 연결한 것 (월결제 탭 "예산" 칸)</span></h3>
      ${itemRows ? `<div class="tbl-wrap"><table class="t"><thead><tr><th>계정</th><th>항목</th><th>최초</th><th>전용·증액</th><th>현재</th><th>월결제 거래처</th><th>집행(공급가)</th><th>남은 금액</th><th></th></tr></thead><tbody>${itemRows}</tbody></table></div>` : '<p class="muted small">연결된 거래처가 없습니다. 월결제 탭의 "예산" 칸에서 거래처마다 예산 항목을 고르세요.</p>'}</div>`;
}

/* ---------- 월결제 연결 (09 viewMonthly 에서 부름) ----------
 * 관리자 잠금 현장의 경리 모드: 예산(금액)은 암호문이라 없음 → 평문 budgetPub(항목 이름만, 01 buildChunks)로 항목 연결·구두보고만 (금액 비교는 관리자 모드에서) */
const bgPub = B => ({ items: B.items.filter(it => bgAmt(B, it) || bgLim(B, it)).map(it => ({ id: it.id, acc: it.acc, grp: it.grp, name: it.name })), status: B.status });
function bgMonthDoc() { const s = db.sites.find(x => x.id === db.cur); if (!s) return null; if (s.budget) return s.budget; return s.budgetPub ? { pub: true, ...s.budgetPub } : null; }
function bgVendorCell(v, ym, dis) {
  const B = bgMonthDoc(); if (!B) return '';
  const w = bgVendorWarn(B, v, ym);
  const opts = bgAccs(B).map(acc => `<optgroup label="${esc(acc)}">${B.items.filter(it => bgAccKey(it.acc) === acc && (B.pub || bgLim(B, it))).map(it => `<option value="${it.id}" ${v.bgItem === it.id ? 'selected' : ''}>${esc(bgItemLabel(it))}</option>`).join('')}</optgroup>`).join('');
  return `<td class="bg-vc"><select data-ch="vendor" data-id="${v.id}" data-f="bgItem" ${dis} title="이 거래처가 쓰는 예산 항목">${`<option value="">${v.ref ? '(품의로 지급)' : '— 예산 항목 —'}</option>`}${opts}</select>
    ${w ? `<div class="badge ${w.cls}" title="${esc(w.tip || '')}">${esc(w.t)}</div>` : ''}
    ${v.bgItem ? `<label class="small muted" title="예산 안에서 현장이 고른 업체 — 구두보고한 날">구두보고 <input type="date" value="${esc(v.oral || '')}" data-ch="vendor" data-id="${v.id}" data-f="oral" ${dis} class="${v.oral ? '' : 'needbox'}"></label>` : ''}</td>`;
}
function bgVendorWarn(B, v, ym) {
  const r = ((monthOf(db.cur, ym) || {}).rows || {})[v.id] || {}, amt = (toNum(r.ys) + toNum(r.sh)) * (v.vat === false ? 1 : 10 / 11);
  if (!v.bgItem) return v.ref || !amt ? null : { cls: 'bad', t: '예산 외 — 품의 필요', tip: '예산 항목에 연결되지 않았고 참조문서(품의 번호)도 없습니다' };
  const it = B.items.find(x => x.id === v.bgItem); if (!it) return { cls: 'bad', t: '예산 항목 없음' };
  if (B.pub) return v.oral ? { cls: 'ok', t: '예산 항목 연결', tip: '금액 비교는 관리자 모드에서' } : { cls: 'warn', t: '구두보고 미기록' };   // 경리 모드: 금액 없음
  const lim = bgLim(B, it), used = bgActual().item[it.id] || 0;
  if (used > lim) return { cls: 'bad', t: `총액 초과 ${fmt(used - lim)}원 — 품의 필요`, tip: `현재 예산 ${fmt(lim)}원 · 누적 ${fmt(used)}원 (공급가)` };
  if (it.unit === '개월' && bgN(it.qty) && bgN(it.price) && amt > bgN(it.qty) * bgN(it.price) * 1.0001) return { cls: 'bad', t: '월 단가 초과 — 품의 필요', tip: `예산 월 금액 ${fmt(bgN(it.qty) * bgN(it.price))}원 (${it.qty}${it.unit === '개월' ? '대·명' : ''} × ${fmt(it.price)}) · 이 달 ${fmt(Math.round(amt))}원 (공급가)` };
  if (!v.oral) return { cls: 'warn', t: '구두보고 미기록' };
  return { cls: 'ok', t: `예산 안 · 남은 ${fmt(lim - used)}` };
}
function bgMonthlyIssues(ym) {   // 월결제 위 안내 · 마감 경고
  const B = bgMonthDoc(); if (!B) return [];
  return vendorsFor(ym).map(v => ({ v, w: bgVendorWarn(B, v, ym) })).filter(x => x.w && x.w.cls === 'bad');
}

/* ---------- 입력 변경 (18 CH 에서 부름) ---------- */
function bgCh(kind, el) {
  const B = bgDoc(); if (!B || bgLocked(B)) return;
  const f = el.dataset.f, v = el.value;
  if (kind === 'meta') { B[f] = el.dataset.num ? toNum(v) : v; if (/^(start|open|fcfs)$/.test(f)) bgSyncPh(B); }
  else if (kind === 'sup') { B.support = B.support || {}; B.support[f] = f === 'note' ? v : toNum(v) || ''; }
  else if (kind === 'ph') B.phases[+el.dataset.i][f] = v;
  else if (kind === 'item') {
    const it = B.items.find(x => x.id === el.dataset.id); if (!it) return;
    if ((/^d\d$/.test(f) || f === 'qty') && bgIsCal(it)) return;   // 날짜별 일정 줄의 수량은 거기서만
    if (/^d\d$/.test(f)) { it.d = it.d || []; it.d[+f.slice(1)] = v === '' ? '' : toNum(v); delete it.fix; }
    else if (f === 'qty' || f === 'price') { it[f] = v === '' ? '' : toNum(v); delete it.fix; }
    else if (f === 'claim') { if (el.checked) it.claim = true; else { delete it.claim; delete it.claimCap; } }   // 실비청구 가능 · 한도
    else if (f === 'claimCap') it.claimCap = /^[\d,\s]+$/.test(v.trim()) && v.trim() ? fmt0(toNum(v)) : v.trim();   // 숫자만이면 1,000 모양
    else { it[f] = v; if (f === 'unit' && !it.cal && !/^(일|개월)$/.test(v)) delete it.sched; }   // 인건비가 일급·월급이 아니면 날짜별 인원은 안 씀 (날짜로 넣기로 한 줄은 그대로)
  }
  bgTouch();
}

/* ---------- 버튼 (17 ACT 에 합침) ---------- */
const BG_ACT = {
  bgSub: el => { state.bgSub = el.dataset.v; render(); },
  bgGrp: el => {   // [예산] [손익] — 묶음마다 마지막에 본 보기로
    const last = state.bgLast = state.bgLast || {}; last[bgGrpOf(state.bgSub || 'edit')] = state.bgSub || 'edit';
    state.bgSub = last[el.dataset.v] || (el.dataset.v === '손익' ? 'exec' : 'edit'); render();
  },
  bgPlUnlock: () => secUnlockDialog('pl'),
  bgSched: el => bgSchedDialog(el.dataset.id),
  bgCalMore: () => { const B = bgDoc(); if (!B || bgLocked(B)) return; const D = bgCalRange(B); if (!D) return; B.calEnd = bgIso(Date.parse(D[D.length - 1]) + 30 * BG_DAY); bgTouch(); save(); render(); },
  bgCalAdd: () => {
    const B = bgDoc(); if (!B || bgLocked(B)) return;
    modal('인력 줄 추가', `<div class="form-grid"><label>구분<input id="caG" class="inp" list="caGL" placeholder="예) 상담사 · TM · 도우미"></label><datalist id="caGL">${[...new Set(bgLabor(B).map(it => it.grp).filter(Boolean))].map(g => `<option>${esc(g)}</option>`).join('')}</datalist>
      <label>세부<input id="caN" class="inp" placeholder="예) 팀장 · 팀원(B)"></label>
      <label>급여<select id="caU"><option value="일">일급</option><option value="개월">월급 (경리 등 — 일수 ÷ 30)</option></select></label><label>금액 (원)<input id="caP" class="inp num" placeholder="예) 180,000 · 월급 2,100,000"></label></div>`, [{ label: '취소' }, { label: '추가', cls: 'primary', onClick: r => {
      const grp = r.querySelector('#caG').value.trim(), name = r.querySelector('#caN').value.trim(); if (!grp && !name) { toast('구분이나 세부를 적으세요.'); return true; }
      const last = B.items.map(x => bgAccKey(x.acc)).lastIndexOf('인건비');
      B.items.splice(last + 1, 0, { id: uid(), acc: '인건비', grp, name, unit: r.querySelector('#caU').value, qty: '', d: B.phases.map(() => ''), price: toNum(r.querySelector('#caP').value) || '', memo: '' });
      bgTouch(); save(); render();
    } }], 's');
  },   // 풀리면 state.tab='pl' → 05 render 가 예산·손익 탭의 현장 손익 보기로
  bgCalOther: el => bgCalOtherDialog(el.dataset.acc || ''),
  bgCalGo: el => bgCalGo(el.dataset.step ? null : +el.dataset.c, +el.dataset.step || 0),
  bgCalOnly: () => { state.bgCalOnly = !state.bgCalOnly; state.bgSel = null; render(); },
  bgCalOff: el => bgCalToggle(el.dataset.id, false),
  bgCreate: () => { site().budget = bgNew(); save(); render(); toast('새 예산을 만들었습니다. 쓰지 않는 줄은 [빈 줄 모두 빼기]로 정리하세요.'); },
  bgItemAdd: el => {
    const B = bgDoc(); if (!B || bgLocked(B)) return;
    const at = el.dataset.id ? B.items.findIndex(x => x.id === el.dataset.id) : -1, base = at >= 0 ? B.items[at] : null;
    const acc = base ? base.acc : el.dataset.acc, last = B.items.map(x => bgAccKey(x.acc)).lastIndexOf(bgAccKey(acc));
    B.items.splice(at >= 0 ? at + 1 : last + 1, 0, { id: uid(), acc, grp: base ? base.grp : '', name: '', unit: base ? base.unit : '회', qty: '', d: B.phases.map(() => ''), price: '', memo: '' });
    bgTouch(); save(); render();
  },
  bgEmptyDel: () => { const B = bgDoc(); if (!B || bgLocked(B)) return; const n = B.items.length; B.items = B.items.filter(it => bgAmt(B, it)); bgTouch(); save(); render(); toast(`금액이 없는 줄 ${n - B.items.length}개를 뺐습니다.`); },
  bgAccAdd: () => {
    const B = bgDoc(); if (!B || bgLocked(B)) return;
    const have = bgAccs(B), opts = BG_ACC_ORDER.filter(a => !have.includes(a));
    modal('계정 추가', `<label>계정 이름<input id="bgAccNm" class="inp" list="bgAccL" placeholder="예) 수도광열비"></label><datalist id="bgAccL">${opts.map(a => `<option>${a}</option>`).join('')}</datalist>`, [{ label: '취소' }, { label: '추가', cls: 'primary', onClick: r => {
      const a = bgAccKey(r.querySelector('#bgAccNm').value); if (!r.querySelector('#bgAccNm').value.trim()) { toast('계정 이름을 적으세요.'); return true; }
      B.items.push({ id: uid(), acc: a, grp: '', name: '', unit: '회', qty: '', d: B.phases.map(() => ''), price: '', memo: '' }); bgTouch(); save(); render();
    } }], 's');
  },
  bgApprove: () => {
    const B = bgDoc(); if (!B) return;
    const r = modal('예산 결재완료', `<p>결재가 끝난 예산이면 잠급니다. 잠근 뒤에는 <b>고칠 수 없고</b>, 초과·예산 외 지출은 전용·증액 품의로만 늘릴 수 있습니다.</p>
      <div class="form-grid"><label>결재일<input type="date" id="bgApD" value="${todayStr()}"></label><label>결재본 스캔 (선택)<input type="file" id="bgApF" accept="image/*,.pdf" multiple></label></div>`, [{ label: '취소' }, { label: '결재완료로 잠그기', cls: 'primary', onClick: async root => {
      const scans = [];
      for (const f of [...root.querySelector('#bgApF').files]) { try { scans.push(await storeFile(parts(DIR.pmScan), safeName(`${site().name}현장 예산심의 결재본`), f)); } catch (e) { toast('스캔본을 저장하지 못했습니다: ' + e.message); } }
      B.status = '결재완료'; B.approved = { date: root.querySelector('#bgApD').value || todayStr(), scans }; save(); render(); toast('예산을 결재완료로 잠갔습니다.');
    } }], 's');
    return r;
  },
  bgUnapprove: () => {   // 결재완료 취소 (잘못 누른 경우) — 결재 전으로, 스캔본 기록·전용 기록은 그대로 둠
    const B = bgDoc(); if (!B || !bgLocked(B)) return;
    const nm = (B.moves || []).length;
    if (!confirm(`결재완료를 취소하고 "결재 전"으로 되돌릴까요?\n다시 고칠 수 있게 됩니다. 실제로 결재된 예산이면 취소하지 마세요.${nm ? `\n(이미 반영한 전용·증액 ${nm}건은 그대로 남습니다.)` : ''}`)) return;
    B.status = '결재전'; B.unapproved = { date: todayStr(), prev: B.approved || null }; delete B.approved;
    save(); render(); toast('결재완료를 취소했습니다. 다시 고칠 수 있습니다.');
  },
  bgScanView: () => { const B = bgDoc(); if (B && B.approved) showFiles('예산심의 결재본', B.approved.scans || []); },
  bgFileOut: () => bgSaveFile(),
  bgFileIn: () => bgImportPick(),
  bgPrint: () => { const B = bgDoc(); if (B) printDocs(bgSheets(B).map(x => x[1])); },
  bgPrintExec: () => { const B = bgDoc(); if (B) printDocs([bgExecSheet(B)]); },
  bgExecXl: () => { const B = bgDoc(); if (B) saveXl([['예산 대비 집행', bgExecSheet(B)]], `${site().name}현장 예산 대비 집행.xlsx`); },
  bgMovePm: () => bgMoveDialog(),
  bgMoveApply: el => {
    const B = bgDoc(), p = pmAll().find(x => x.id === el.dataset.id); if (!B || !p || !p.bgMove) return;
    if (p.status !== '결재완료') { toast('결재완료된 품의만 반영할 수 있습니다.'); return; }
    if ((B.moves || []).some(m => m.pmId === p.id)) { toast('이미 반영했습니다.'); return; }
    const m = p.bgMove;
    if (!B.items.some(x => x.id === m.to) || (m.kind === '전용' && !B.items.some(x => x.id === m.from))) { toast('품의의 예산 항목을 찾지 못했습니다.'); return; }
    (B.moves = B.moves || []).push({ id: uid(), kind: m.kind, from: m.kind === '전용' ? m.from : '', to: m.to, amt: toNum(m.amt), pmId: p.id, pmNo: String(p.no), date: todayStr(), reason: m.reason || '' });
    save(); render(); toast(`품의 ${p.no}번 ${m.kind} ${fmt(m.amt)}원을 예산에 반영했습니다.`);
  },
  // 폴더 없이 (본부장)
  bgSolo: () => {
    state.bgSolo = true;
    try { const o = JSON.parse(localStorage.getItem(BG_SOLO_KEY) || 'null'); if (o && o.b) { SOLO.b = o.b; SOLO.dirty = !!o.dirty; } } catch (e) { }
    render();
  },
  bgSoloNew: () => { if (SOLO.b && SOLO.dirty && !confirm('파일로 저장하지 않은 예산이 있습니다. 지우고 새로 시작할까요?')) return; SOLO.b = bgNew(''); SOLO.dirty = false; bgTouch(); render(); },
  bgSoloOpen: () => bgImportPick(true),
  bgSoloExit: () => { if (SOLO.dirty && !confirm('파일로 저장하지 않은 변경이 있습니다 (이 PC 브라우저에는 남아 있음). 나갈까요?')) return; state.bgSolo = false; render(); },
};

/* ---------- 인력 일정 (출근부 모양: 줄 = 인건비 항목, 칸 = 그날 인원) ----------
 * 칸을 끌어서 고르고 숫자 키 → 그 칸들에 인원 · Delete = 지우기 · Esc = 선택 풀기. 저장은 it.sched 구간(같은 인원이 이어진 날을 한 구간으로 묶음) */
const BGSEL = { drag: false, buf: '', at: 0 };
const bgIso = t => new Date(t).toISOString().slice(0, 10);
const bgIsLab = it => bgAccKey(it.acc) === '인건비' && (it.unit === '일' || it.unit === '개월') && !it.fix;   // 인력 일정에 나오는 줄 (수량은 거기서만) — 월급(개월)도 하루 인원을 보려고 포함
const bgLabor = B => B.items.filter(bgIsLab);
/* 날짜별 일정 줄 = 인건비(일급·월급) + 다른 계정에서 [📅 날짜별로 넣기]로 고른 줄(it.cal) · 금액 = 날짜별 수량 합 × 단가 (개월 = ÷30) */
const bgIsCal = it => !it.fix && (bgIsLab(it) || !!it.cal);
// 예산 작성 표의 줄 그대로 (계정 순서 · 칸 줄 번호 = 이 순서) — 아직 날짜로 안 넣은 줄도 나오고, 칸에 수량을 넣으면 그 줄이 날짜 기준으로 바뀜 · [날짜로 넣은 줄만] = state.bgCalOnly
const bgCalItems = B => bgAccs(B).flatMap(acc => B.items.filter(it => bgAccKey(it.acc) === acc && (bgIsCal(it) || !state.bgCalOnly && (it.grp || it.name))));
const bgQW = it => bgIsLab(it) ? { n: '인원', u: '명', t: '명일' } : (u => ({ n: '수량', u, t: u }))(/^(일|개월)$/.test(it.unit) ? '' : it.unit || '');   // 수량 낱말·단위
function bgCalRange(B) {   // 투입일 ~ (선착순 + 30일 · 넣은 인원의 마지막 날 · [+30일]로 늘린 날) 중 늦은 날
  let a = '', b = '';
  const later = d => { if (d && (!b || d > b)) b = d; };
  B.phases.forEach(p => { if (p.from && (!a || p.from < a)) a = p.from; later(p.to); later(p.from); });
  B.items.forEach(it => (it.sched || []).forEach(s => { if (s.from && (!a || s.from < a)) a = s.from; later(s.to || s.from); }));
  const last = B.phases.filter(p => p.from).pop();
  if (last && !last.to) later(bgIso(Date.parse(last.from) + 30 * BG_DAY));   // 사후(끝 없음) → 30일 보여 줌
  later(B.calEnd);
  if (!a || !b || b < a) return null;
  const out = []; for (let t = Date.parse(a); t <= Date.parse(b) && out.length < 500; t += BG_DAY) out.push(bgIso(t));
  return out;
}
function bgDayMap(it) {
  const m = {};
  (it.sched || []).forEach(s => { const n = bgN(s.n), k = Math.min(bgSegDays(s), 1500); for (let i = 0, t = Date.parse(s.from); i < k; i++, t += BG_DAY) { const d = bgIso(t); m[d] = (m[d] || 0) + n; } });
  return m;
}
function bgSetDays(it, dates, n) {
  const m = bgDayMap(it); dates.forEach(d => { if (n) m[d] = n; else delete m[d]; });
  const segs = [];
  Object.keys(m).filter(d => m[d]).sort().forEach(d => { const L = segs[segs.length - 1]; if (L && L.n === m[d] && Date.parse(d) - Date.parse(L.to) === BG_DAY) L.to = d; else segs.push({ from: d, to: d, n: m[d] }); });
  if (segs.length) it.sched = segs; else delete it.sched;
  it.qty = segs.length ? bgHead(it) : ''; delete it.fix;   // 다 지우면 0 (예전 수량 × 일수가 되살아나지 않게)
}
function bgCalView(B) {
  const D = bgCalRange(B), lock = bgLocked(B), L = bgCalItems(B), P = B.phases;
  if (!D) return `<div class="panel"><p>날짜별 일정을 그리려면 <b>영업 일정</b>(투입일 · 오픈일 · 선착순)을 먼저 넣으세요.</p>${BTN('bgSub', '현장 정보에서 영업 일정 넣기', 'data-v="info"', 'primary')}</div>`;
  const WD = ['일', '월', '화', '수', '목', '금', '토'], wd = d => new Date(Date.parse(d)).getUTCDay();
  const phOf = d => P.findIndex(p => p.from && d >= p.from && (!p.to || d <= p.to));
  const key = d => d === B.open ? ['bg-open', '오픈일'] : d === B.start ? ['bg-key', '투입일'] : d === B.fcfs ? ['bg-key', '선착순'] : ['', ''];
  const groups = (key, lab, cls) => { const out = []; D.forEach(d => { const k = key(d), L0 = out[out.length - 1]; if (L0 && L0.k === k) L0.n++; else out.push({ k, n: 1, d }); }); return out.map(g => `<th colspan="${g.n}" class="${cls(g)}">${g.n > 1 || cls(g) ? lab(g) : ''}</th>`).join(''); };
  const mRow = groups(d => d.slice(0, 7), g => `${+g.k.slice(5)}월`, () => 'bg-mon');
  const pRow = groups(phOf, g => g.k >= 0 ? esc(P[g.k].name) : '', g => g.k >= 0 ? `bg-phb ph${g.k % 4}` : '');
  const dRow = D.map((d, c) => `<th class="${wd(d) % 6 === 0 ? 'we' : ''} ${key(d)[0]}" data-c="${c}" title="${bgDot(d)} ${key(d)[1]}">${+d.slice(8)}</th>`).join('');
  // 옆으로 옮기기: 달 · 투입일·오픈일·선착순으로 바로 (17 ACT.bgCalGo) · ◀ ▶ = 일주일씩
  const go = (c, label, tip = '') => `<button class="btn sm ghost" data-act="bgCalGo" data-c="${c}" ${tip ? `title="${tip}"` : ''}>${label}</button>`;
  const months = [...new Set(D.map(d => d.slice(0, 7)))].map(m => go(D.findIndex(d => d.startsWith(m)), `${+m.slice(5)}월`, `${m.slice(0, 4)}년 ${+m.slice(5)}월로`)).join('');
  const keys = [['start', '투입일'], ['open', '오픈일'], ['fcfs', '선착순']].filter(([f]) => D.includes(B[f])).map(([f, l]) => go(D.indexOf(B[f]), l, bgDot(B[f]))).join('');
  const goBar = `<span class="bg-calsep"></span><button class="btn sm ghost" data-act="bgCalGo" data-step="-7" title="일주일 앞으로">◀</button><button class="btn sm ghost" data-act="bgCalGo" data-step="7" title="일주일 뒤로">▶</button>${months}<span class="bg-calsep"></span>${keys}`;
  const help = '칸을 끌어서 고르고 숫자 키 = 바로 들어감 (여러 줄도 한꺼번에) · Delete = 지우기 · Esc = 선택 풀기\n오른쪽 클릭 = 한 달·단계·전체 기간 채우기 / 지우기\n날짜 머리줄 위에서 마우스 휠 = 옆으로 넘김\n노란 날 = 오픈일 · 하늘색 = 투입일·선착순\n\n월급 줄(경리 등)도 출근하는 날에 인원을 넣습니다 — 금액은 일수 ÷ 30 × 월급. 다른 항목은 그날 수량 × 단가 (단위 "개월"이면 ÷ 30).\n예산 작성 표의 줄이 그대로 나옵니다 — 흐린 줄(수량 × 일수 · 엑셀 금액)도 칸에 수량을 넣으면 날짜 기준으로 바뀌고 예산 작성 표 금액도 같이 바뀝니다.';
  const wRow = D.map(d => `<th class="${wd(d) % 6 === 0 ? 'we' : ''} ${key(d)[0]}" title="${key(d)[1]}">${WD[wd(d)]}</th>`).join('');
  const tot = D.map(() => 0), lab = L.filter(bgIsLab), NCc = D.length + 4;
  let prevAcc = '';
  const rows = L.map((it, r) => {
    const m = bgDayMap(it), isLab = bgIsLab(it), w = bgQW(it), acc = bgAccKey(it.acc), onCal = bgIsCal(it);
    const old = it.fix ? '엑셀 금액' : !bgHasSched(it) && bgN(it.qty) && bgDays(B, it) ? '일수로 입력됨' : '';
    const cells = D.map((d, c) => { const v = m[d] || 0; if (isLab) tot[c] += v; return `<td class="cell bgc ${v ? 'on' : ''} ${wd(d) % 6 === 0 ? 'we' : ''}" data-r="${r}" data-c="${c}">${v || ''}</td>`; }).join('');
    const head = acc !== prevAcc && L.some(x => !bgIsLab(x)) ?`<tr class="bg-calacc"><td class="name bg-st"><b>${esc(acc)}</b></td><td colspan="${NCc - 1}"></td></tr>` : ''; prevAcc = acc;
    const pr = bgN(it.price) ? `${fmt(bgN(it.price))}원${it.unit === '개월' ? '/월 <span title="금액 = 일수 ÷ 30 × 월급">(÷30)</span>' : it.unit && !isLab ? `/${esc(it.unit)}` : ''}` : '<span class="bad">단가 없음</span>';
    const oldTip = it.fix ? '엑셀에서 읽은 금액 그대로인 줄' : `${w.n} × 일수로 넣은 줄 (예산 작성 표)`;
    return `${head}<tr class="${onCal || bgHasSched(it) ? '' : 'bg-nocal'}"><td class="name bg-st bgn" data-r="${r}" title="오른쪽 클릭 = 이 줄 채우기·지우기"><b>${esc(it.grp || '')}</b> ${esc(it.name || '')}<div class="muted small">${pr}${old ? ` · <span class="${onCal ? 'bad' : ''}" title="${oldTip} — 칸에 수량을 넣거나 [⇥]로 기간을 넣으면 날짜 기준으로 바뀝니다">${old}</span>` : ''}</div></td>${cells}
      <td class="num"><b>${fmtQty(bgPD(B, it)) || ''}</b></td><td class="num">${dashN(bgAmt(B, it))}</td>
      <td style="white-space:nowrap"><button class="btn ghost sm" data-act="bgSched" data-id="${it.id}" title="기간으로 넣기 (시작일~종료일 · ${w.n})">⇥</button>${it.cal && !isLab && !lock ? `<button class="btn ghost sm" data-act="bgCalOff" data-id="${it.id}" title="날짜로 넣은 수량을 지우고 예산 작성 표에서 수량 × 일수로 넣기">✕</button>` : ''}</td></tr>`;
  }).join('');
  setTimeout(bgSelPaint, 0);   // 다시 그린 뒤에도 고른 칸 표시
  // 위 = 메뉴 한 줄 (단계별 합계는 탭 줄 오른쪽 bgCalStats) / 아래 = 표 상자가 창 바닥까지 (data-frame → 04 frameWraps)
  return `<div class="row bg-caltool no-print">${lock ? '<span class="badge ok">결재본 — 보기만</span>' : BTN('bgCalAdd', '+ 인력 줄', '', 'sm') + BTN('bgCalOther', '+ 다른 줄', 'title="인건비 말고 다른 계정에 줄 추가 (예산 작성 표에도 같이 들어감)"', 'sm') + BTN('bgCalMore', '+30일', `title="표 끝(${bgDot(D[D.length - 1])}) 뒤로 30일 더 보기 — 사후 기간이 길 때"`, 'sm ghost')}
      <button class="btn sm ${state.bgCalOnly ? 'primary' : 'ghost'}" data-act="bgCalOnly" title="예산 작성 표의 모든 줄 ↔ 날짜로 넣은 줄만">${state.bgCalOnly ? '✓ 날짜로 넣은 줄만' : '날짜로 넣은 줄만'}</button>${goBar}
      <span class="grow"></span><span class="muted small">선택 <b id="bgSelN">0</b>칸</span><span class="bg-help" title="${esc(help)}">ⓘ 사용법</span></div>
    <div class="tbl-wrap bg-calwrap" data-frame><table class="t grid bg-cal"><thead>
      <tr><th rowspan="4" class="bg-st">항목</th>${mRow}<th rowspan="4" title="인건비 = 연인원(명×일) · 다른 항목 = 날짜별 수량 합">합계</th><th rowspan="4">금액</th><th rowspan="4"></th></tr><tr>${pRow}</tr><tr>${dRow}</tr><tr>${wRow}</tr></thead>
      <tbody>${rows || `<tr><td colspan="${D.length + 4}" class="muted" style="padding:20px">${state.bgCalOnly ? '날짜로 넣은 줄이 없습니다. [날짜로 넣은 줄만]을 풀면 예산 작성 표의 모든 줄이 나옵니다.' : '예산 줄이 없습니다. [+ 인력 줄] 또는 [+ 다른 줄]로 추가하세요.'}</td></tr>`}
      ${lab.length ? `<tr class="sum"><td class="name bg-st">하루 인원 (인건비)</td>${tot.map(v => `<td>${v || ''}</td>`).join('')}<td class="num">${fmtQty(sum(tot))}</td><td></td><td></td></tr>` : ''}</tbody></table></div>`;
}
/* 날짜별 일정 옆으로 옮기기: c = 그 날짜 칸이 왼쪽(항목 칸 바로 옆)에 오게 · step = 지금 왼쪽 날짜에서 ±일 */
function bgCalGo(c, step) {
  const w = document.querySelector('.bg-calwrap'); if (!w) return;
  const ths = [...w.querySelectorAll('thead th[data-c]')]; if (!ths.length) return;
  const wl = w.getBoundingClientRect().left, nameW = (w.querySelector('thead .bg-st') || {}).offsetWidth || 0;
  const colLeft = th => w.scrollLeft + th.getBoundingClientRect().left - wl - nameW;   // 그 칸을 왼쪽 끝에 두는 scrollLeft
  if (c === null) { const cur = ths.findIndex(th => colLeft(th) >= w.scrollLeft - 2); c = Math.max(0, (cur < 0 ? 0 : cur) + step); }
  const th = ths[Math.min(c, ths.length - 1)]; if (th) w.scrollTo({ left: Math.max(0, colLeft(th)), behavior: 'smooth' });
}
/* 날짜 머리줄 위에서 마우스 휠 = 옆으로 (Shift 없이) */
document.addEventListener('wheel', e => {
  const h = e.target.closest && e.target.closest('.bg-calwrap thead'); if (!h || e.shiftKey || !e.deltaY) return;
  const w = h.closest('.bg-calwrap'); e.preventDefault(); w.scrollLeft += e.deltaY;
}, { passive: false });
/* 날짜별 일정에서 다른 계정 줄 추가 (예산 작성 표에도 같은 줄로 들어감 · it.cal) */
function bgCalOtherDialog(acc0) {
  const B = bgDoc(); if (!B || bgLocked(B)) return;
  const accs = bgAccs(B).filter(a => a !== '인건비');
  modal('줄 추가 (날짜별로 수량)', `<div class="form-grid"><label>계정<input id="coA" class="inp" list="coAL" value="${esc(acc0)}" placeholder="예) 홍보비 · 행사비"></label><datalist id="coAL">${accs.map(a => `<option>${esc(a)}</option>`).join('')}</datalist>
      <label>구분<input id="coG" class="inp" placeholder="예) 행사 · 차량"></label><label>세부<input id="coN" class="inp" placeholder="예) 주말 도우미 · 셔틀버스"></label>
      <label>단위<select id="coU">${BG_UNITS.map(u => `<option>${u}</option>`).join('')}</select></label><label>단가 (원)<input id="coP" class="inp num" placeholder="1개(1회·1대·1일)당"></label></div>
    <p class="muted small">예산 작성 표의 그 계정 맨 아래에 같이 들어갑니다. 날짜마다 수량을 넣으면 금액 = 수량 합 × 단가 (단위 "개월"이면 ÷ 30).</p>`, [{ label: '취소' }, { label: '추가', cls: 'primary', onClick: root => {
    const a = bgAccKey(root.querySelector('#coA').value), grp = root.querySelector('#coG').value.trim(), name = root.querySelector('#coN').value.trim();
    if (!root.querySelector('#coA').value.trim()) { toast('계정을 적으세요.'); return true; }
    if (!grp && !name) { toast('구분이나 세부를 적으세요.'); return true; }
    const last = B.items.map(x => bgAccKey(x.acc)).lastIndexOf(a), it = { id: uid(), acc: a, grp, name, unit: root.querySelector('#coU').value, qty: '', d: B.phases.map(() => ''), price: toNum(root.querySelector('#coP').value) || '', memo: '', cal: true };
    B.items.splice(last < 0 ? B.items.length : last + 1, 0, it);
    state.bgSub = 'cal'; bgTouch(); save(); render(); toast(`${bgItemLabel(it)} 줄을 추가했습니다.`);
  } }], 's');
}
function bgCalToggle(id, on) {   // on = 날짜별 일정으로 · off = 예산 작성 표에서 수량 × 일수로
  const B = bgDoc(), it = B && B.items.find(x => x.id === id); if (!it || bgLocked(B) || bgIsLab(it)) return;
  if (on) { it.cal = true; delete it.fix; state.bgSub = 'cal'; }
  else {
    if (bgHasSched(it) && !confirm(`${bgItemLabel(it)}: 날짜별로 넣은 수량을 지우고 예산 작성 표에서 수량 × 일수로 넣을까요?`)) return;
    delete it.cal; delete it.sched;
  }
  bgTouch(); save(); render(); toast(on ? `${bgItemLabel(it)}: 날짜별 일정에 넣었습니다.` : `${bgItemLabel(it)}: 날짜별 일정에서 뺐습니다. 예산 작성 표에서 수량·일수를 넣으세요.`);
}
const bgSelRect = () => { const s = state.bgSel; return s ? { r0: Math.min(s.r0, s.r1), r1: Math.max(s.r0, s.r1), c0: Math.min(s.c0, s.c1), c1: Math.max(s.c0, s.c1) } : null; };
function bgSelPaint() {
  const R = bgSelRect(); let n = 0;
  document.querySelectorAll('td.bgc').forEach(td => { const r = +td.dataset.r, c = +td.dataset.c, on = !!R && r >= R.r0 && r <= R.r1 && c >= R.c0 && c <= R.c1; td.classList.toggle('sel', on); if (on) n++; });
  const el = document.getElementById('bgSelN'); if (el) el.textContent = n;
}
function bgSelSet(n) {
  const B = bgDoc(), R = bgSelRect(); if (!B || !R) { toast('칸을 먼저 고르세요 (끌어서 여러 칸).'); return; }
  if (bgLocked(B)) { toast('결재된 예산은 고칠 수 없습니다.'); return; }
  const D = bgCalRange(B); if (!D) return;
  const rows = []; for (let r = R.r0; r <= R.r1; r++) rows.push(r);
  bgCalApply(B, rows, D.slice(R.c0, R.c1 + 1), n);
}
function bgCalApply(B, rows, dates, n) {   // 줄 번호(bgCalItems 순서)들 × 날짜들 = n (0 = 지우기)
  const L = bgCalItems(B);
  rows.forEach(r => {
    const it = L[r]; if (!it) return;
    if (!bgIsCal(it) && !bgHasSched(it)) { if (!n) return; if (!bgIsLab({ ...it, fix: undefined })) it.cal = true; }   // 수량 × 일수 · 엑셀 금액 줄: 수량을 넣으면 날짜 기준으로 (지우기는 건드리지 않음)
    bgSetDays(it, dates, n);
  });
  bgTouch(); save(); render();
}
/* 날짜별 일정 칸 오른쪽 클릭 → 수량 [ ] · 채우기(고른 칸·이 날부터 끝까지·이 달·이 단계·전체 기간, 주말 빼기) · 지우기(고른 칸·이 칸·이 달·이 줄 전부)
   고른 칸 안에서 누르면 고른 줄 모두에, 밖에서 누르면 그 줄에만 */
document.addEventListener('contextmenu', e => {
  const td = e.target.closest && e.target.closest('td.bgc, td.bgn'); if (!td) return;
  const B = bgDoc(); if (!B) return;
  e.preventDefault(); closeAttMenu();
  if (bgLocked(B)) { toast('결재된 예산은 고칠 수 없습니다.'); return; }
  const D = bgCalRange(B), L = bgCalItems(B); if (!D) return;
  const r = +td.dataset.r, c = td.dataset.c === undefined ? -1 : +td.dataset.c, it = L[r]; if (!it) return;
  const R = bgSelRect(), inSel = !!R && r >= R.r0 && r <= R.r1 && (c < 0 || c >= R.c0 && c <= R.c1), many = inSel && (R.r1 > R.r0 || R.c1 > R.c0);
  const rows = inSel ? Array.from({ length: R.r1 - R.r0 + 1 }, (_, i) => R.r0 + i) : [r];
  const d = c >= 0 ? D[c] : '', m = bgDayMap(it), w = bgQW(it);
  const n0 = (d && m[d]) || bgHead(it) || 1;
  const P = B.phases, pi = d ? P.findIndex(p => p.from && d >= p.from && (!p.to || d <= p.to)) : -1;
  const isWe = x => { const k = new Date(Date.parse(x)).getUTCDay(); return k === 0 || k === 6; };
  const sets = {
    sel: () => R ? D.slice(R.c0, R.c1 + 1) : [],
    rest: () => D.slice(c),
    month: () => D.filter(x => x.slice(0, 7) === d.slice(0, 7)),
    phase: () => pi < 0 ? [] : D.filter(x => x >= P[pi].from && (!P[pi].to || x <= P[pi].to)),
    all: () => D.slice(),
    cell: () => [d],
  };
  const who = rows.length > 1 ? `고른 ${rows.length}줄` : bgItemLabel(it);
  const mk = document.createElement('div'); mk.id = 'attMenu'; mk.className = 'no-print';
  mk.style.cssText = `position:fixed;left:${e.clientX}px;top:${e.clientY}px;z-index:9000;background:#fff;color:#222;border:1px solid #ccd;border-radius:6px;box-shadow:0 4px 14px rgba(0,0,0,.18);padding:4px;min-width:200px;font-size:13px`;
  const btn = (op, label, red) => `<button type="button" data-op="${op}" style="display:block;width:100%;text-align:left;border:0;background:none;padding:5px 8px;cursor:pointer;border-radius:4px;font:inherit${red ? ';color:var(--bad)' : ''}">${label}</button>`;
  const hr = t => `<div style="border-top:1px solid #eee;margin:3px 0;padding:3px 8px 0;color:var(--muted);font-size:12px">${t}</div>`;
  mk.innerHTML = `<div style="padding:4px 8px;color:var(--muted);font-size:12px">${esc(who)}${d ? ` · ${bgDot(d).slice(5)}` : ''}</div>
    <div style="display:flex;align-items:center;gap:6px;padding:3px 8px">${w.n} <input id="bcmN" class="num" value="${n0}" style="width:60px" title="Enter = ${many ? '고른 칸' : d ? '이 달' : '전체 기간'} 채우기"> ${w.u}
      <span style="flex:1"></span><label class="small" style="white-space:nowrap"><input type="checkbox" id="bcmWe"> 주말 빼기</label></div>
    ${hr('채우기')}${many ? btn('f:sel', '고른 칸 채우기') : ''}${d ? btn('f:rest', `${bgDot(d).slice(5)}부터 끝까지`) + btn('f:month', `${+d.slice(5, 7)}월 한 달`) : ''}${pi >= 0 ? btn('f:phase', `${esc(P[pi].name)} 기간 (${bgDot(P[pi].from).slice(5)}~${P[pi].to ? bgDot(P[pi].to).slice(5) : '끝'})`) : ''}${btn('f:all', '전체 기간')}
    ${hr('지우기')}${many ? btn('c:sel', '고른 칸 지우기', true) : ''}${d ? btn('c:cell', '이 칸 지우기', true) + btn('c:month', `${+d.slice(5, 7)}월 지우기`, true) : ''}${btn('c:all', `${rows.length > 1 ? '고른 줄' : '이 줄'} 전부 지우기`, true)}`;
  document.body.appendChild(mk);
  const b = mk.getBoundingClientRect();
  if (b.right > innerWidth) mk.style.left = Math.max(4, innerWidth - b.width - 8) + 'px';
  if (b.bottom > innerHeight) mk.style.top = Math.max(4, innerHeight - b.height - 8) + 'px';
  const ni = mk.querySelector('#bcmN'); setTimeout(() => { ni.focus(); ni.select(); }, 0);
  const run = op => {
    const [k, s] = op.split(':'), n = k === 'f' ? toNum(ni.value) : 0;
    if (k === 'f' && !n) { toast(`${w.n}을 넣으세요.`); ni.focus(); return; }
    let dates = sets[s](); if (k === 'f' && mk.querySelector('#bcmWe').checked) dates = dates.filter(x => !isWe(x));
    if (k === 'c' && s === 'all' && !confirm(`${who}: 날짜별로 넣은 수량을 모두 지울까요?`)) return;
    closeAttMenu(); if (dates.length) bgCalApply(B, rows, dates, n);
  };
  ni.onkeydown = ev => { if (ev.key === 'Enter') { ev.preventDefault(); run(many ? 'f:sel' : d ? 'f:month' : 'f:all'); } };
  mk.querySelectorAll('[data-op]').forEach(x => { x.onmouseenter = () => { x.style.background = '#f1f3f5'; }; x.onmouseleave = () => { x.style.background = 'none'; }; x.onclick = () => run(x.dataset.op); });
});
document.addEventListener('mousedown', e => {
  const td = e.target.closest && e.target.closest('td.bgc'); if (!td) return;
  if (e.button === 2) { const R = bgSelRect(), r = +td.dataset.r, c = +td.dataset.c; if (R && r >= R.r0 && r <= R.r1 && c >= R.c0 && c <= R.c1) return; }   // 오른쪽 클릭: 고른 칸 안이면 선택 그대로 (메뉴가 고른 줄에)
  e.preventDefault(); BGSEL.drag = e.button !== 2; BGSEL.buf = '';
  const r = +td.dataset.r, c = +td.dataset.c;
  state.bgSel = e.shiftKey && state.bgSel ? { ...state.bgSel, r1: r, c1: c } : { r0: r, c0: c, r1: r, c1: c }; bgSelPaint();
});
document.addEventListener('mouseover', e => { if (!BGSEL.drag || !state.bgSel) return; const td = e.target.closest && e.target.closest('td.bgc'); if (!td) return; state.bgSel.r1 = +td.dataset.r; state.bgSel.c1 = +td.dataset.c; bgSelPaint(); });
document.addEventListener('mouseup', () => { BGSEL.drag = false; });
/* 끌어서 고르는 중 표 끝(왼쪽·오른쪽·위·아래)에 마우스가 닿으면 저절로 스크롤 + 그 자리 칸까지 선택 (엑셀처럼) */
const BGAS = { raf: 0, x: 0, y: 0 };
document.addEventListener('mousemove', e => { if (!BGSEL.drag) return; BGAS.x = e.clientX; BGAS.y = e.clientY; if (!BGAS.raf) BGAS.raf = requestAnimationFrame(bgAutoScroll); });
function bgAutoScroll() {
  BGAS.raf = 0;
  const w = document.querySelector('.bg-calwrap'); if (!BGSEL.drag || !w || !state.bgSel) return;
  const r = w.getBoundingClientRect(), E = 48, R = r.left + w.clientLeft + w.clientWidth, Bt = r.top + w.clientTop + w.clientHeight;   // 스크롤 막대 안쪽
  const L = r.left + ((w.querySelector('tbody .bg-st') || {}).offsetWidth || 0), T = r.top + ((w.querySelector('thead') || {}).offsetHeight || 0);   // 고정된 인력 칸·날짜 머리 안쪽부터
  const sp = d => Math.min(45, Math.round(d / 2) + 6);
  const dx = BGAS.x > R - E ? sp(BGAS.x - (R - E)) : BGAS.x < L + E ? -sp(L + E - BGAS.x) : 0;
  const dy = BGAS.y > Bt - E ? sp(BGAS.y - (Bt - E)) : BGAS.y < T + 16 ? -sp(T + 16 - BGAS.y) : 0;
  const x0 = w.scrollLeft, y0 = w.scrollTop; w.scrollLeft += dx; w.scrollTop += dy;
  // 마우스 자리의 칸 (표 밖으로 나가도 가장자리 칸) — 줄은 왼쪽 인력 칸 높이로, 칸은 그 줄에서 가로 위치로 찾음
  const px = Math.min(Math.max(BGAS.x, L + 4), R - 4), py = Math.min(Math.max(BGAS.y, T + 4), Bt - 4);
  const trs = [...w.querySelectorAll('table.bg-cal tbody tr')].filter(x => x.querySelector('td.bgc'));
  const near = (list, v, f) => list.find(x => { const b = f(x); return v >= b[0] && v < b[1]; }) || (list.length && v >= f(list[list.length - 1])[0] ? list[list.length - 1] : list[0]);
  const tr = trs.length ? near(trs, py, x => { const b = x.getBoundingClientRect(); return [b.top, b.bottom]; }) : null;
  const cells = tr ? [...tr.querySelectorAll('td.bgc')] : [];
  if (cells.length) {
    const td = near(cells, px, c => { const b = c.getBoundingClientRect(); return [b.left, b.right]; });
    if (+td.dataset.r !== state.bgSel.r1 || +td.dataset.c !== state.bgSel.c1) { state.bgSel.r1 = +td.dataset.r; state.bgSel.c1 = +td.dataset.c; bgSelPaint(); }
  }
  if (w.scrollLeft !== x0 || w.scrollTop !== y0) BGAS.raf = requestAnimationFrame(bgAutoScroll);   // 끝에 닿은 동안 계속
}
document.addEventListener('keydown', e => {
  if (!state.bgSel || !document.querySelector('td.bgc') || document.querySelector('#modalRoot .modal') || e.ctrlKey || e.metaKey || e.altKey) return;
  const t = e.target; if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
  if (/^\d$/.test(e.key)) { e.preventDefault(); BGSEL.buf = (Date.now() - BGSEL.at < 900 ? BGSEL.buf : '') + e.key; BGSEL.at = Date.now(); bgSelSet(+BGSEL.buf); }
  else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); bgSelSet(0); }
  else if (e.key === 'Escape') { state.bgSel = null; bgSelPaint(); }
});

/* ---------- 예산 작성 표: 줄 위 오른쪽 클릭 → 아래·위에 줄 추가 · 줄 복사 · 줄 삭제 (메뉴는 출근부·카드 목록과 같은 #attMenu — 바깥 클릭·스크롤·Esc 로 닫힘) ---------- */
function bgRowOp(id, op) {
  const B = bgDoc(); if (!B || bgLocked(B)) return;
  const i = B.items.findIndex(x => x.id === id); if (i < 0) return;
  const it = B.items[i], blank = { id: uid(), acc: it.acc, grp: it.grp, name: '', unit: it.unit, qty: '', d: B.phases.map(() => ''), price: '', memo: '' };
  if (op === 'below') B.items.splice(i + 1, 0, blank);
  else if (op === 'above') B.items.splice(i, 0, blank);
  else if (op === 'copy') B.items.splice(i + 1, 0, { ...JSON.parse(JSON.stringify(it)), id: uid() });
  else if (op === 'cal') { bgCalToggle(id, !it.cal); return; }
  else if (op === 'del') {
    const amt = bgAmt(B, it), used = db.vendors.some(v => v.siteId === db.cur && v.bgItem === it.id) || (B.moves || []).some(m => m.to === it.id || m.from === it.id);
    if (used) { toast('월결제 거래처가 연결됐거나 전용·증액 기록이 있는 줄은 삭제할 수 없습니다.'); return; }
    if (amt && !confirm(`${bgItemLabel(it)} (${fmt(amt)}원) 줄을 삭제할까요?`)) return;
    B.items.splice(i, 1);
  }
  bgTouch(); save(); render();
}
document.addEventListener('contextmenu', e => {
  const tr = e.target.closest && e.target.closest('table.bg-tbl tr[data-bgid]'); if (!tr) return;
  const B = bgDoc(); if (!B || bgLocked(B)) return;
  const inp = e.target.closest('input,textarea'); if (inp && typeof inp.selectionStart === 'number' && inp.selectionStart !== inp.selectionEnd) return;   // 칸 글자를 골라 둔 때는 원래 메뉴(복사)
  e.preventDefault(); closeAttMenu();
  const it = B.items.find(x => x.id === tr.dataset.bgid); if (!it) return;
  const m = document.createElement('div'); m.id = 'attMenu'; m.className = 'no-print';
  m.style.cssText = `position:fixed;left:${e.clientX}px;top:${e.clientY}px;z-index:9000;background:#fff;color:#222;border:1px solid #ccd;border-radius:6px;box-shadow:0 4px 14px rgba(0,0,0,.18);padding:4px;min-width:170px;font-size:13px`;
  const btn = (op, label, red) => `<button type="button" data-op="${op}" style="display:block;width:100%;text-align:left;border:0;background:none;padding:5px 8px;cursor:pointer;border-radius:4px;font:inherit${red ? ';color:var(--bad)' : ''}">${label}</button>`;
  m.innerHTML = `<div style="padding:4px 8px;color:var(--muted);font-size:12px">${esc(bgAccKey(it.acc))} · ${esc(bgItemLabel(it))}</div>${btn('below', '＋ 아래에 줄 추가')}${btn('above', '＋ 위에 줄 추가')}${btn('copy', '⧉ 이 줄 복사')}${it.cal && !bgIsLab(it) ? btn('cal', '📅 날짜별 수량 지우기 (수량 × 일수로)') : ''}<div style="border-top:1px solid #eee;margin:3px 0"></div>${btn('del', '🗑 이 줄 삭제', true)}`;
  document.body.appendChild(m);
  const r = m.getBoundingClientRect();
  if (r.right > innerWidth) m.style.left = Math.max(4, innerWidth - r.width - 8) + 'px';
  if (r.bottom > innerHeight) m.style.top = Math.max(4, innerHeight - r.height - 8) + 'px';
  m.querySelectorAll('[data-op]').forEach(b => { b.onmouseenter = () => { b.style.background = '#f1f3f5'; }; b.onmouseleave = () => { b.style.background = 'none'; }; b.onclick = () => { closeAttMenu(); bgRowOp(it.id, b.dataset.op); }; });
});

/* ---------- 예산 작성 표: ⠿ 끌어서 순서 바꾸기 (같은 계정 안에서만 — 다른 계정으로 옮기면 계정이 바뀌므로) ---------- */
const BGDND = { id: null, to: null };
const bgDropClear = () => document.querySelectorAll('tr.bg-drop-before, tr.bg-drop-after, tr.bg-dragging').forEach(x => x.classList.remove('bg-drop-before', 'bg-drop-after', 'bg-dragging'));
document.addEventListener('dragstart', e => {
  const g = e.target.closest && e.target.closest('.bg-grip'); if (!g) return;
  const tr = g.closest('tr[data-bgid]'); BGDND.id = tr.dataset.bgid; BGDND.to = null;
  e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', BGDND.id);
  try { e.dataTransfer.setDragImage(tr, 16, 14); } catch (err) { }
  setTimeout(() => tr.classList.add('bg-dragging'), 0);
});
document.addEventListener('dragover', e => {
  if (!BGDND.id) return;
  const tr = e.target.closest && e.target.closest('table.bg-tbl tr[data-bgid]');
  document.querySelectorAll('tr.bg-drop-before, tr.bg-drop-after').forEach(x => x.classList.remove('bg-drop-before', 'bg-drop-after'));
  BGDND.to = null; if (!tr || tr.dataset.bgid === BGDND.id) return;
  const B = bgDoc(), a = B && B.items.find(x => x.id === BGDND.id), b = B && B.items.find(x => x.id === tr.dataset.bgid);
  if (!a || !b || bgAccKey(a.acc) !== bgAccKey(b.acc)) { e.dataTransfer.dropEffect = 'none'; return; }   // 다른 계정 줄 위 = 못 놓음
  e.preventDefault(); e.dataTransfer.dropEffect = 'move';
  const r = tr.getBoundingClientRect(), after = e.clientY > r.top + r.height / 2;
  tr.classList.add(after ? 'bg-drop-after' : 'bg-drop-before'); BGDND.to = { id: tr.dataset.bgid, after };
});
document.addEventListener('drop', e => {
  if (!BGDND.id) return; e.preventDefault();
  const B = bgDoc(), t = BGDND.to, id = BGDND.id; bgDropClear(); BGDND.id = null; BGDND.to = null;
  if (!B || bgLocked(B) || !t) return;
  const from = B.items.findIndex(x => x.id === id); if (from < 0) return;
  const [it] = B.items.splice(from, 1);
  const at = B.items.findIndex(x => x.id === t.id); if (at < 0) { B.items.splice(from, 0, it); return; }
  B.items.splice(t.after ? at + 1 : at, 0, it);
  bgTouch(); save(); render();
});
document.addEventListener('dragend', () => { bgDropClear(); BGDND.id = null; BGDND.to = null; });

/* ---------- 날짜별 인원 창 (인건비 줄 · 기간으로 넣기) ---------- */
function bgSchedDialog(id) {
  const B = bgDoc(), it = B && B.items.find(x => x.id === id); if (!it) return;
  const ro = bgLocked(B), P = B.phases, w = bgQW(it);
  let segs = (it.sched || []).map(s => ({ ...s }));
  if (!segs.length) {   // 처음: 지금 넣어 둔 인원·단계별 일수를 단계 날짜에서 시작하는 구간으로 옮겨 줌
    P.forEach((p, i) => { const d = bgN((it.d || [])[i]); if (p.from && d) segs.push({ from: p.from, to: new Date(Date.parse(p.from) + (d - 1) * BG_DAY).toISOString().slice(0, 10), n: bgN(it.qty) || 1 }); });
    if (!segs.length) segs.push({ from: '', to: '', n: bgN(it.qty) || '' });
  }
  const phTxt = P.map(p => `${esc(p.name)} ${p.from ? `${bgDot(p.from).slice(5)}~${p.to ? bgDot(p.to).slice(5) : ''}` : '(날짜 없음)'}`).join(' · ');
  const rowH = (s, i) => `<tr data-i="${i}"><td><input type="date" class="sf" value="${esc(s.from || '')}" ${ro ? 'disabled' : ''}></td><td><input type="date" class="st" value="${esc(s.to || '')}" ${ro ? 'disabled' : ''}></td>
    <td><input class="num sn" value="${esc(s.n ?? '')}" style="width:60px" ${ro ? 'disabled' : ''}> ${w.u}</td><td class="num sd muted"></td><td>${ro ? '' : `<button class="btn ghost sm danger" data-sdel="${i}">✕</button>`}</td></tr>`;
  const r = modal(`날짜별 ${w.n} — ${bgAccKey(it.acc)} · ${bgItemLabel(it)}`, `
    <p class="small muted">영업 단계: ${phTxt}${P.some(p => !p.from) ? ' — <span class="bad">영업 일정(투입일·오픈일·선착순)을 넣어야 단계별 금액이 나뉩니다</span>' : ''}</p>
    <table class="t"><thead><tr><th>시작일</th><th>종료일</th><th>${w.n}</th><th>일수 · 합계</th><th></th></tr></thead><tbody id="bsRows">${segs.map(rowH).join('')}</tbody></table>
    ${ro ? '' : `<div class="row" style="margin-top:6px"><button class="btn sm" id="bsAdd">+ 구간</button><button class="btn sm ghost" id="bsFill" title="단계마다 한 구간씩 (${w.n}은 지금 값)">단계 기간으로 채우기</button><span class="muted small grow">날짜는 시작·종료일 포함 (휴무일 포함한 달력 일수 — 회사 예산안과 같음). 하루만 다르면 그날만 한 구간으로.</span></div>`}
    <div id="bsSum" class="panel small" style="margin-top:8px"></div>`, ro ? [{ label: '닫기' }] : [{ label: '취소' }, { label: '일정 지우기', onClick: () => { delete it.sched; bgTouch(); save(); render(); } }, { label: '저장', cls: 'primary', onClick: root => {
    const v = read(root); const bad = v.find(s => s.from && s.to && s.to < s.from);
    if (bad) { toast('종료일이 시작일보다 앞선 구간이 있습니다.'); return true; }
    const ok = v.filter(s => s.from && bgN(s.n));
    if (!ok.length) { toast(`시작일과 ${w.n}을 넣은 구간이 없습니다.`); return true; }
    it.sched = ok.map(s => ({ from: s.from, to: s.to || s.from, n: bgN(s.n) })).sort((a, b) => a.from.localeCompare(b.from));
    it.qty = bgHead(it); delete it.fix; if (!bgIsLab(it)) it.cal = true; bgTouch(); save(); render(); toast(`${bgItemLabel(it)}: ${it.sched.length}구간 · 합계 ${fmtQty(bgPD(B, it))}${w.t} · ${fmt(bgAmt(B, it))}원`);
  } }], 'm');
  const read = root => [...root.querySelectorAll('#bsRows tr')].map(tr => ({ from: tr.querySelector('.sf').value, to: tr.querySelector('.st').value, n: tr.querySelector('.sn').value }));
  const draw = () => {
    const v = read(r);
    r.querySelectorAll('#bsRows tr').forEach((tr, i) => { const d = bgSegDays(v[i]); tr.querySelector('.sd').textContent = d ? `${d}일 · ${fmtQty(d * bgN(v[i].n))}${w.t}` : ''; });
    const tmp = { ...it, fix: undefined, sched: v.filter(s => s.from && bgN(s.n)) }, sp = bgSchedPh(B, tmp), amt = Math.round(sp.ph.reduce((a, b) => a + b, 0) * bgDayPrice(it));
    r.querySelector('#bsSum').innerHTML = `${P.map((p, i) => `${esc(p.name)} <b>${fmtQty(sp.ph[i])}</b>${w.t}`).join(' · ')} → 합계 <b>${fmtQty(sp.ph.reduce((a, b) => a + b, 0))}${w.t} × ${fmt(bgN(it.price))}원${it.unit === '개월' ? ' ÷ 30 (개월)' : ''} = ${fmt(amt)}원</b>${sp.outside ? `<div class="bad">단계 기간 밖 날짜 ${sp.outside}일 — 바로 앞 단계에 넣었습니다 (단계 날짜를 확인하세요)</div>` : ''}`;
  };
  const wire = () => { r.querySelectorAll('#bsRows input').forEach(x => x.oninput = draw); r.querySelectorAll('[data-sdel]').forEach(b => b.onclick = () => { b.closest('tr').remove(); draw(); }); draw(); };
  if (!ro) {
    r.querySelector('#bsAdd').onclick = () => { const v = read(r), last = v[v.length - 1] || {}; const from = last.to ? new Date(Date.parse(last.to) + BG_DAY).toISOString().slice(0, 10) : ''; r.querySelector('#bsRows').insertAdjacentHTML('beforeend', rowH({ from, to: '', n: last.n || '' }, v.length)); wire(); };
    r.querySelector('#bsFill').onclick = () => { const n = (read(r).find(s => bgN(s.n)) || {}).n || bgN(it.qty) || 1; const ps = P.filter(p => p.from); if (!ps.length) { toast('영업 일정(투입일·오픈일·선착순)을 먼저 넣으세요.'); return; } const D = bgCalRange(B) || []; r.querySelector('#bsRows').innerHTML = ps.map((p, i) => rowH({ from: p.from, to: p.to || D[D.length - 1] || p.from, n }, i)).join(''); wire(); };
  }
  wire();
}

/* ---------- 폴더 없이 쓰는 화면 ---------- */
function viewBudgetSolo() {
  const B = SOLO.b;
  const top = `<div class="phd"><div class="phd-t"><h2>예산안 작성 <span class="badge">폴더 없이</span></h2><div class="phd-sub">드롭박스 없이 예산안만 씁니다 → <b>[파일로 저장]</b> → 받은 실무자가 프로그램 예산 탭에서 [예산안 파일 가져오기]</div></div>
    <div class="phd-a">${B ? BTN('bgFileOut', '💾 파일로 저장 (.xlsx)', '', 'primary') + BTN('bgPrint', '인쇄') : ''}${BTN('bgSoloOpen', '📂 파일 열기', 'title="저장해 둔 예산안 파일을 열어 이어 쓰기 · 지난 현장 예산을 불러와 새로 쓰기"')}${BTN('bgSoloNew', '+ 새로 작성')}${BTN('bgSoloExit', '← 처음 화면', '', 'ghost')}</div></div>`;
  if (!B) return `${top}<div class="panel"><p><b>[+ 새로 작성]</b>을 누르면 자주 쓰는 항목(기획·상담사·TM·도우미·경호 / 복사기·PC·책상 / 숙소·사무실 …)이 들어 있는 양식이 열립니다.</p>
    <p class="muted small">지난 현장 예산을 바탕으로 쓰려면 [파일 열기]로 그 예산안 파일을 고른 뒤 제목·날짜를 고치고 [파일로 저장]하세요. 예전 엑셀 예산안도 열 수 있습니다.</p></div>`;
  return `${top}${bgBar(B, true)}${SOLO.dirty ? '<div class="banner warn small">파일로 저장하지 않은 변경이 있습니다 — 이 PC 브라우저에만 임시로 남아 있습니다. 다 쓰면 <b>[파일로 저장]</b>하세요.</div>' : ''}${state.bgSub === 'cal' ? bgCalView(B) : state.bgSub === 'info' ? bgInfoView(B) : bgEditView(B)}`;
}

/* ---------- 인쇄 · 엑셀 (회사 양식 표 모양 xtHtml) ---------- */
const bgMemoTxt = it => [it.claim ? `실비청구${it.claimCap ? ` (한도 ${it.claimCap}${/^[\d,]+$/.test(it.claimCap) ? '원' : ''})` : ''}` : '', it.memo || ''].filter(Boolean).join(' · ');   // 세부내역 비고: 실비청구 · 한도 · 메모
function bgSheets(B) {
  const P = B.phases, k = B.punit === '원' ? 1 : 1000, V = v => (v ? Math.round(v / k) : '-'), unitT = `[단위: ${B.punit === '원' ? '원' : '천원'}, VAT 별도]`;
  const accs = bgAccs(B), rev = bgRev(B);
  const accRow = (acc, i) => { const its = B.items.filter(it => bgAccKey(it.acc) === acc), ph = P.map((_, j) => sum(its, it => bgPhAmt(B, it)[j])); return [{ t: String(i + 1), c: 'c' }, acc, ...ph.map(V), V(ph.reduce((a, b) => a + b, 0)), '']; };
  const phTot = P.map((_, j) => sum(B.items, it => bgPhAmt(B, it)[j]));
  const N = P.length + 4;
  const gap = [
    [{ t: `작성자 : ${B.author || ''}`, cs: 2, c: 'l' }, { t: `작성일자 : ${bgDot(B.date)}`, cs: N - 2, c: 'l' }],
    [{ t: `${B.title || ''}과 관련하여 아래와 같이 품의하오니 검토 후 재가 바랍니다.`, cs: N, c: 'l' }],
    [{ t: `1. 예산(案) ${unitT}${[['start', '투입'], ['open', '오픈'], ['fcfs', '선착순']].filter(([f]) => B[f]).map(([f, l]) => ` · ${l} ${bgDot(B[f])}`).join('')}`, cs: N, c: 'l b' }],
    [{ t: 'No.', c: 'c b' }, { t: '계정', c: 'c b' }, ...P.map(p => ({ t: `${p.name}${p.from ? `\n(${bgDot(p.from).slice(5)}~${bgDot(p.to).slice(5)})` : ''}`, c: 'c b' })), { t: '총합계', c: 'c b' }, { t: '비고', c: 'c b' }],
    ...accs.map(accRow),
    ['합계', '', ...phTot.map(V), V(phTot.reduce((a, b) => a + b, 0)), ''],
  ];
  if (rev.fee || rev.sup) {
    gap.push([{ t: '2. 분양대행 수수료 · 예상 손익', cs: N, c: 'l b' }]);
    if (rev.fee) gap.push([{ t: '수수료 총액', cs: 2, c: 'c' }, { t: bgN(B.households) ? `${fmt(bgN(B.households))}세대` : '', cs: N - 4, c: 'l' }, V(rev.fee), '']);
    gap.push([{ t: '지출(예산)', cs: 2, c: 'c' }, { t: '', cs: N - 4 }, V(rev.cost), '']);
    if (rev.sup) gap.push([{ t: '실비 지원', cs: 2, c: 'c' }, { t: `${B.support.rate}%${bgN(B.support.cap) ? ` (한도 ${fmt(V(bgN(B.support.cap)))})` : ''} ${B.support.note || ''}`, cs: N - 4, c: 'l' }, V(-rev.sup), '']);
    if (rev.fee) gap.push([{ t: '예상 손익', cs: 2, c: 'c b' }, { t: '', cs: N - 4 }, V(rev.pl), { t: rev.fee ? `${Math.round(rev.pl / rev.fee * 100)}%` : '', c: 'c' }]);
  }
  String(B.notes || '').split('\n').map(x => x.trim()).filter(Boolean).forEach(l => gap.push([{ t: `※ ${l.replace(/^[※#＃→\-]\s*/, '')}`, cs: N, c: 'l' }]));
  const g = xtHtml({ title: B.title || '예산심의(案)', widths: [36, 120, ...P.map(() => 90), 100, 120], rows: gap });
  // 세부내역
  const head = [[{ t: '계정', rs: 2 }, { t: '구분', rs: 2 }, { t: '세부', rs: 2 }, { t: '총 합계', cs: 3 }, { t: '단계별 금액', cs: P.length }, { t: '총 지급액', rs: 2 }, { t: '비고', rs: 2 }], ['인원', '투입', '단가', ...P.map(p => p.name)]];
  const rows = [];
  accs.forEach(acc => {
    const its = B.items.filter(it => bgAccKey(it.acc) === acc && bgAmt(B, it)); if (!its.length) return;
    its.forEach((it, i) => { const ph = bgPhAmt(B, it); rows.push([i ? '' : acc, it.grp || '', it.name || '', fmtQty(bgHead(it)) || '', bgPD(B, it) ? `${fmtQty(bgPD(B, it))}${bgHasSched(it) ? '일' : it.unit}` : it.unit || '', V(bgN(it.price)), ...ph.map(V), V(ph.reduce((a, b) => a + b, 0)), bgMemoTxt(it)]); });
    const st = P.map((_, j) => sum(its, it => bgPhAmt(B, it)[j]));
    rows.push(['', `${acc} 소계`, '', '', '', '', ...st.map(V), V(st.reduce((a, b) => a + b, 0)), '']);
  });
  rows.push(['합계', '', '', '', '', '', ...phTot.map(V), V(phTot.reduce((a, b) => a + b, 0)), '']);
  const d = xtHtml({ title: `${B.title || ''} 세부내역`, sub: unitT, land: true, widths: [80, 120, 150, 44, 70, 64, ...P.map(() => 80), 90, 160], head, rows });
  return [['갑지', g], ['세부내역', d]];
}
function bgExecSheet(B) {
  const R = bgExecRows(B), T = k => sum(R, r => r[k]);
  const mv = (B.moves || []).map(m => { const to = B.items.find(x => x.id === m.to), fr = B.items.find(x => x.id === m.from); return [bgDot(m.date), m.kind, `품의 ${m.pmNo}번`, fr ? `${bgAccKey(fr.acc)} · ${bgItemLabel(fr)}` : '(증액)', to ? `${bgAccKey(to.acc)} · ${bgItemLabel(to)}` : '', m.amt, m.reason || '']; });
  return xtHtml({ title: `${site().name}현장 예산 대비 집행`, sub: `${todayStr().replace(/-/g, '.')} 기준 · 단위: 원 · ${B.status === '결재완료' ? `결재 ${bgDot((B.approved || {}).date)}` : '결재 전 예산'}`, land: true,
    widths: [120, 110, 100, 110, 110, 110, 70, 150],
    head: [['계정', '최초 예산', '전용·증액', '현재 예산', '집행', '남은 금액', '집행률', '비고']],
    rows: [...R.map(r => [r.acc, r.base, r.mv || '-', r.lim, r.used, r.left, r.lim ? `${Math.round(r.used / r.lim * 100)}%` : '-', r.out && r.used ? '예산 외 — 품의 필요' : r.left < 0 ? '초과 — 품의 필요' : '']),
      ['합계', T('base'), T('mv') || '-', T('lim'), T('used'), T('lim') - T('used'), T('lim') ? `${Math.round(T('used') / T('lim') * 100)}%` : '-', ''],
      ...(mv.length ? [[{ t: '전용·증액 내역 (날짜 · 구분 · 품의 · 주는 항목 → 받는 항목 · 금액 · 사유)', cs: 8, c: 'l b' }], ...mv.map(r => [r[0], r[1], r[2], { t: `${r[3]} → ${r[4]}`, cs: 3, c: 'l' }, r[5], r[6]])] : [])] });
}

/* ---------- 파일 저장 · 가져오기 ---------- */
async function bgSaveFile() {
  const B = bgDoc(); if (!B) return;
  const data = JSON.stringify({ 종류: '유성 예산안', v: BG_VER, app: APP_VERSION, savedAt: new Date().toISOString(), b: B });
  const aoa = [['YUSUNG_BUDGET', BG_VER, '이 시트는 프로그램이 읽는 원본입니다. 고치지 마세요.']];
  for (let i = 0; i < data.length; i += 30000) aoa.push([data.slice(i, i + 30000)]);
  const nm = (B.site || (bgSoloOn() ? '' : site().name) || '').trim();
  await saveXl(bgSheets(B), `${nm ? `${nm}현장 ` : ''}예산안${B.status === '결재완료' ? '(결재본)' : ''}.xlsx`, [{ name: BG_SHEET, aoa }]);
  if (bgSoloOn()) { SOLO.dirty = false; bgTouch(); SOLO.dirty = false; try { localStorage.setItem(BG_SOLO_KEY, JSON.stringify({ b: SOLO.b, dirty: false })); } catch (e) { } render(); }
}
async function bgImportPick(solo) {
  const [file] = await pickFile('.xlsx,.xlsm,.xls'); if (!file) return;
  let r; try { r = bgReadBook(XLSX.read(await file.arrayBuffer(), { type: 'array' })); } catch (e) { toast('예산안 파일을 읽지 못했습니다: ' + e.message); return; }
  if (!r || !r.b) { toast('예산안 파일을 읽지 못했습니다: 예산 표(인원·투입일·단가·총 지급액 머리글)를 찾지 못함'); return; }
  bgImportPreview(r, file.name, solo || bgSoloOn());
}
function bgReadBook(wb) {
  const hid = wb.SheetNames.find(n => n === BG_SHEET);
  if (hid) {
    const R = XLSX.utils.sheet_to_json(wb.Sheets[hid], { header: 1, raw: true, defval: '' });
    if (String((R[0] || [])[0]) === 'YUSUNG_BUDGET') {
      try { const o = JSON.parse(R.slice(1).map(r => String(r[0] ?? '')).join('')); const b = o.b; b.phases = b.phases || BG_PH0.map(name => ({ name, from: '', to: '' })); b.items = b.items || []; b.moves = b.moves || [];
        return { b, how: 'data', warn: bgEditedCheck(wb, b) }; } catch (e) { /* 아래 표 읽기로 */ }
    }
  }
  const b = bgReadOld(wb); return b ? { b, how: 'table', warn: [] } : null;
}
function bgEditedCheck(wb, b) {   // 저장한 뒤 엑셀에서 숫자를 고쳤는지 (세부내역 합계 줄 ↔ 원본)
  try {
    const R = XLSX.utils.sheet_to_json(wb.Sheets['세부내역'], { header: 1, raw: false, defval: '' });
    const last = R.filter(r => String(r[0]).trim() === '합계').pop(); if (!last) return [];
    const nums = last.map(c => toNum(c)).filter(Boolean), k = b.punit === '원' ? 1 : 1000, want = Math.round(bgTotal(b) / k);
    return nums.length && Math.max(...nums) !== want ? [`엑셀의 세부내역 합계(${fmt(Math.max(...nums))})가 원본(${fmt(want)})과 다릅니다 — 저장한 뒤 엑셀에서 고친 것 같습니다. 프로그램 원본 값으로 가져옵니다.`] : [];
  } catch (e) { return []; }
}
// 예전 엑셀 예산안: 머리글 줄(인원 · 투입일 · 단가 · 총 지급액)로 열을 찾음 — 진주(기간별 예산안)·양산(세부내역) 형식 확인
function bgReadOld(wb) {
  let num = v => +String(v).replace(/[^\d.\-]/g, '') || 0; const nsp = v => String(v ?? '').replace(/\s/g, '');
  let F = null;
  for (const n of wb.SheetNames) {
    const R = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: false, defval: '' });
    for (let i = 0; i < Math.min(R.length, 25) && !F; i++) {
      const r = R[i].map(nsp), cQ = r.indexOf('인원'), cP = r.indexOf('단가'), cT = r.findIndex(c => /^총지급액$/.test(c));
      if (cQ >= 0 && cP > cQ && cT > cP && cT < 20) F = { n, R, i, cQ, cD: r.indexOf('투입일'), cP, cT };
    }
    if (F) break;
  }
  if (!F) return null;
  const { n, R, i, cQ, cD, cP, cT } = F;
  const hdr = R.slice(0, i + 1).find(r => r.some(c => nsp(c) === '계정')) || [];
  let cA = hdr.findIndex(c => nsp(c) === '계정'); if (cA < 0) cA = Math.max(0, cQ - 3);
  const phN = R[i].slice(cP + 1, cT).map(c => String(c).trim()).filter(Boolean);
  const phases = (phN.length ? phN : ['합계']).map(name => ({ name, from: '', to: '' }));
  const all = R.map(r => r.map(c => String(c))).join(' ');
  const k = /단위\s*[:：]?\s*원/.test(all) && !/천원/.test(all) ? 1 : 1000;
  const items = []; let acc = '', grp = '';
  const RR = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: '' });   // 숫자는 화면 표시(반올림) 대신 셀 값 그대로
  const num0 = num; num = (v, ri, ci) => { const x = ((RR[ri] || [])[ci]); return typeof x === 'number' ? x : num0(v); };
  for (const [ri, r] of R.map((r, ri) => [ri, r]).slice(i + 1)) {
    const a = nsp(r[cA]); if (/^합계/.test(a)) break;
    if (a && !/소계|누계|누게|합계/.test(a)) { acc = a; grp = ''; }
    const g1 = String(r[cA + 1] || '').trim(); if (g1 && !/소계|누계|누게/.test(g1)) grp = g1;
    const d = cQ - cA > 2 ? String(r[cA + 2] || '').trim() : '';
    if (/소계|누계|누게|합계/.test(`${a}${g1}${d}`)) continue;
    const tot = num(r[cT], ri, cT); if (!tot) continue;
    const per = String(r[cD] || ''), unit = /개월/.test(per) ? '개월' : /회/.test(per) ? '회' : /식/.test(per) ? '식' : '일';
    const qty = num(r[cQ], ri, cQ), price = num(r[cP], ri, cP) * k, days = num0(per);
    const ph = phN.length ? R[i].slice(cP + 1, cT).map((c, j) => String(c).trim() ? num(r[cP + 1 + j], ri, cP + 1 + j) * k : null).filter(x => x !== null) : [tot * k];
    items.push({ id: uid(), acc, grp: g1 ? g1 : (d ? grp : ''), name: g1 ? d : (d || grp), unit, qty: qty || '', d: phases.map(() => ''), price: price || '', fix: ph.length === phases.length ? ph : [tot * k], memo: days && qty ? `엑셀: 투입 ${per}` : '' });
  }
  if (!items.length) return null;
  const titleCell = R.slice(0, 3).flat().map(x => String(x).trim()).find(x => /예산/.test(x)) || '';
  const b = bgNew(''); Object.assign(b, { title: titleCell.replace(/^[■□▶\s]+/, '') || b.title, phases, items, notes: `엑셀 예산안에서 읽음 (시트: ${n}, 단위 ${k === 1 ? '원' : '천원'})` });
  return b;
}
function bgImportPreview(r, fileName, solo) {
  const b = r.b, accs = bgAccs(b), cur = solo ? SOLO.b : bgDoc();
  if (!solo && cur && bgLocked(cur)) { toast('결재된 예산은 바꿀 수 없습니다 — 초과·예산 외 지출은 전용·증액 품의로 늘리세요.'); return; }
  const siteNm = solo ? '' : site().name, diffSite = !solo && b.site && siteNm && normLabel(b.site) !== normLabel(siteNm);
  const body = `<p class="small">파일: <b>${esc(fileName)}</b> · ${r.how === 'data' ? '프로그램에서 저장한 예산안' : '<span class="bad">예전 엑셀 예산안 — 표를 읽어 옴 (금액은 엑셀 값 그대로)</span>'}</p>
    <p><b>${esc(b.title || '')}</b>${b.author ? ` · 작성 ${esc(b.author)}` : ''}${b.date ? ` · ${bgDot(b.date)}` : ''} · ${b.status === '결재완료' ? '<span class="badge ok">결재완료</span>' : '<span class="badge warn">결재 전</span>'}</p>
    ${diffSite ? `<div class="banner warn small">파일의 현장(${esc(b.site)})과 지금 현장(${esc(siteNm)})이 다릅니다. 맞는 현장인지 확인하세요.</div>` : ''}
    ${(r.warn || []).map(w => `<div class="banner warn small">${esc(w)}</div>`).join('')}
    ${cur && !solo ? '<div class="banner warn small">이 현장에 있던 결재 전 예산은 이 파일로 바뀝니다 (전용·증액 기록은 그대로).</div>' : ''}
    <table class="t"><thead><tr><th>계정</th><th>항목 수</th><th>금액 (원)</th></tr></thead><tbody>${accs.map(a => { const its = b.items.filter(it => bgAccKey(it.acc) === a); return `<tr><td>${esc(a)}</td><td class="num">${its.length}</td><td class="num">${fmt(sum(its, it => bgAmt(b, it)))}</td></tr>`; }).join('')}
    <tr class="sum"><td>합계</td><td class="num">${b.items.length}</td><td class="num">${fmt(bgTotal(b))}</td></tr></tbody></table>
    <p class="muted small">원본 엑셀의 계정별 합계(갑지·집계표)와 맞는지 확인하세요.${solo ? ' 지난 현장 예산을 바탕으로 쓰는 경우, 연 뒤 제목·작성일·단계 날짜를 고치세요.' : ''}</p>`;
  modal('예산안 가져오기', body, [{ label: '취소' }, { label: solo ? '열기' : '이 현장에 적용', cls: 'primary', onClick: () => {
    if (solo) { if (SOLO.b && SOLO.dirty && !confirm('파일로 저장하지 않은 지금 예산이 바뀝니다. 계속할까요?')) return true; SOLO.b = b; SOLO.dirty = false; bgTouch(); SOLO.dirty = false; render(); toast('예산안을 열었습니다.'); return; }
    const keep = cur ? (cur.moves || []) : [];
    b.moves = [...keep, ...(b.moves || []).filter(m => !keep.some(k => k.id === m.id))];
    if (b.status !== '결재완료') b.status = '결재전';
    b.src = { file: fileName, at: todayStr(), how: r.how };
    site().budget = b; save(); state.bgSub = 'edit'; render(); toast(`예산을 적용했습니다 (${fmt(bgTotal(b))}원${b.status === '결재완료' ? ' · 결재완료' : ' · 결재 전'}).`);
  } }]);
}

/* ---------- 전용 · 증액 품의 ---------- */
PM_TPL.push({ id: 'bgmove', group: '예산', label: '예산 전용·증액', hidden: true, link: 'budget', attach: [['예산 대비 집행표', true], ['견적서', false]] });
function bgMoveDialog() {
  const B = bgDoc(); if (!B) return;
  const A = bgActual(), its = B.items.filter(it => bgAmt(B, it) || bgLim(B, it));
  const opt = (sel, filt) => bgAccs(B).map(acc => `<optgroup label="${esc(acc)}">${its.filter(it => bgAccKey(it.acc) === acc && (!filt || filt(it))).map(it => { const lim = bgLim(B, it), used = A.item[it.id] || 0; return `<option value="${it.id}" ${sel === it.id ? 'selected' : ''}>${esc(bgItemLabel(it))} — 현재 ${fmt(lim)}${used ? ` · 집행 ${fmt(used)}` : ''}</option>`; }).join('')}</optgroup>`).join('');
  const r = modal('전용·증액 품의 작성', `<div class="form-grid">
      <label>구분<select id="bmK"><option value="전용">전용 (다른 항목에서 가져옴)</option><option value="증액">증액 (전체 예산을 늘림)</option></select></label>
      <label>금액 (원, VAT 별도)<input id="bmA" class="num" placeholder="예) 600,000"></label>
      <label style="grid-column:span 2">받는 항목 (모자라는 항목)<select id="bmTo"><option value="">— 고르세요 —</option>${opt('')}</select></label>
      <label style="grid-column:span 2" id="bmFrW">주는 항목 (남는 항목 · 다른 계정도 됨)<select id="bmFr"><option value="">— 고르세요 —</option>${opt('')}</select></label>
      <label style="grid-column:span 2">사유<input id="bmR" class="inp" placeholder="예) 숙소 추가 투입(1실)으로 임대료 부족"></label></div>
      <p class="muted small">품의서 작성 창이 열립니다 → 인쇄·결재 → 결재완료 + 스캔본 → <b>예산 대비 집행</b>에서 [반영]. 반영 전까지 예산은 그대로이고, 최초 예산 금액은 늘 따로 보입니다.</p>`, [{ label: '취소' }, { label: '품의서 작성', cls: 'primary', onClick: root => {
    const kind = root.querySelector('#bmK').value, amt = toNum(root.querySelector('#bmA').value), to = root.querySelector('#bmTo').value, from = kind === '전용' ? root.querySelector('#bmFr').value : '', reason = root.querySelector('#bmR').value.trim();
    if (!to || !amt) { toast('받는 항목과 금액을 넣으세요.'); return true; }
    if (kind === '전용') {
      if (!from || from === to) { toast('주는 항목을 받는 항목과 다르게 고르세요.'); return true; }
      const fi = B.items.find(x => x.id === from), left = bgLim(B, fi) - (A.item[fi.id] || 0);
      if (amt > bgLim(B, fi)) { toast(`주는 항목의 현재 예산(${fmt(bgLim(B, fi))}원)보다 많이 가져올 수 없습니다.`); return true; }
      if (amt > left && !confirm(`주는 항목에 남은 금액(${fmt(left)}원)보다 많습니다. 그래도 품의를 쓸까요?`)) return true;
    }
    bgMovePmNew(B, { kind, amt, to, from, reason });
  } }], 'm');
  const k = r.querySelector('#bmK'), w = r.querySelector('#bmFrW'); k.onchange = () => { w.style.display = k.value === '전용' ? '' : 'none'; };
}
function bgMovePmNew(B, m) {
  const s = site(), S = s.fullName || s.name, to = B.items.find(x => x.id === m.to), fr = B.items.find(x => x.id === m.from), A = bgActual();
  const L = it => `${bgAccKey(it.acc)} / ${bgItemLabel(it)}`;
  const body = [`${S} 현장 예산 ${m.kind}에 관하여 아래와 같이 품의합니다.`,
    `가. ${m.kind === '전용' ? '전용' : '증액'} 금액 : ${fmt(m.amt)}원 (VAT 별도)`,
    `나. 대상 항목 : ${L(to)} (최초 예산 ${fmt(bgAmt(B, to))}원 · 현재 ${fmt(bgLim(B, to))}원 · 집행 ${fmt(A.item[to.id] || 0)}원)`,
    m.kind === '전용' ? `다. 전용 항목 : ${L(fr)} (최초 예산 ${fmt(bgAmt(B, fr))}원 · 현재 ${fmt(bgLim(B, fr))}원 · 집행 ${fmt(A.item[fr.id] || 0)}원)` : `다. 총 예산 : ${fmt(sum(B.items, it => bgLim(B, it)))}원 → ${fmt(sum(B.items, it => bgLim(B, it)) + m.amt)}원 (최초 ${fmt(bgTotal(B))}원)`,
    `라. 사유 : ${m.reason || ''}`];
  const row = (lab, it, d) => [lab, bgAccKey(it.acc), bgItemLabel(it), fmt(bgAmt(B, it)), fmt(bgLim(B, it)), (d > 0 ? '+' : '') + fmt(d), fmt(bgLim(B, it) + d), ''];
  const tp = Object.assign({}, pmTpl('bgmove'), { title: `예산 ${m.kind}의 건`, body: () => body, table: { title: '예산 변경 내역', cols: ['구분', '계정', '항목', '최초 예산', '현재 예산', '변경', '변경 후 예산', '비고'], rows: [row('받는 항목', to, m.amt), ...(m.kind === '전용' ? [row('주는 항목', fr, -m.amt)] : [])], sum: false, note: '※ 단위: 원, VAT 별도 · 최초 예산은 결재된 예산심의(案) 금액' } });
  const it = pmFromTpl(tp, { payDate: '-', claim: '불가', budget: m.kind === '전용' ? '예산 전용' : '예산 증액' });
  it.bgMove = { kind: m.kind, amt: m.amt, to: m.to, from: m.from || '', reason: m.reason || '' };
  it.noExpense = true;
  pmEditor(it, ['결재가 끝나면 스캔본을 올리고, 예산 탭 → 예산 대비 집행에서 [반영]을 누르세요.']);
}
