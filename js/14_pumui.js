/* 유성 현장 관리 프로그램 — 품의서 탭·양식 모음
 * (원래 app.js 의 화면 부분. 모든 js/*.js 는 같은 전역 공간을 공유하며 html 에 적힌 순서대로 읽힘) */
'use strict';
const PM_UNIT_DEF = '(단위: 원 / VAT 포함)';   // 새 표의 표 위 오른쪽 글 기본값 (작성 창에서 고칠 수 있음)


/* ================= 품의서 (기안품의서 대장 · 작성 · 인쇄 · 스캔본) =================
 * 업무 흐름: 작성(번호 부여) → 인쇄 → 결재(서명) → 스캔본 올리기 → 결재완료
 * 번호는 현장별 일련번호 하나로 이어짐: 기안품의서 + 인건비·월결제 자금청구서 (전도금 청구는 따로 J01, J02 … — 본사 스캔 파일 이름과 같게)
 * 기안번호 = 문서번호 앞부분 + 기안월(YYMM) + "-" + 번호   예) YS-영종현장2608-131 */
const PM_STATUS = ['작성중', '결재중', '결재완료'];   // 보류·반려는 없앰 (예전 품의에 남아 있으면 그 값만 그대로 보임)
const pmStCls = s => ({ 작성중: 'st-draft', 결재중: 'st-wait', 결재완료: 'st-done' })[s] || 'st-etc';   // 상태 색 (style.css .pm-st): 회색·주황·초록 · 보류·반려 등은 빨강
const PM_KIND = { general: '기안품의서', excel: '엑셀', pay: '인건비 자금청구서', monthly: '월결제 자금청구서', cash: '전도금 청구서' };
const pmAll = (sid = db.cur) => Object.entries((db.pumui || {})[sid] || {}).flatMap(([ym, list]) => (list || []).map(x => ({ ...x, _ym: ym })));
const pmFind = id => { for (const [ym, list] of Object.entries((db.pumui || {})[db.cur] || {})) { const x = (list || []).find(p => p.id === id); if (x) return { x, ym, list }; } return null; };
function pmNextNo(sid = db.cur) { const s = db.sites.find(x => x.id === sid) || {}; const mx = Math.max(0, ...pmAll(sid).map(p => toNum(p.no))); return Math.max(mx + 1, toNum(s.pumuiStart) || 1); }
const pmJNo = p => toNum((String(p.no || '').match(/^J(\d+)$/) || String(p.docNo || '').match(/-J(\d+)\s*$/) || [])[1]);
function pmNextJ(sid = db.cur) { const s = db.sites.find(x => x.id === sid) || {}; const mx = Math.max(0, ...pmAll(sid).filter(p => p.kind === 'cash').map(pmJNo)); return Math.max(mx + 1, toNum(s.jStart) || 1); }
const pmDocNoJ = (j, date) => `${site().docPrefix || ''}${String(date || todayStr()).slice(2, 4)}${String(date || todayStr()).slice(5, 7)}-J${pad2(j)}`;
const pmDocNo = (no, date) => `${site().docPrefix || ''}${String(date || todayStr()).slice(2, 4)}${String(date || todayStr()).slice(5, 7)}-${pad2(no)}`;
function pmPut(item) {   // 기안일자 월 칸에 저장 (날짜가 바뀌면 옮김)
  const ym = ymOf(item.date) || state.ym;
  const f = pmFind(item.id); if (f && f.ym !== ym) f.list.splice(f.list.indexOf(f.x), 1);
  const list = nest(db.pumui, db.cur)[ym] = nest(db.pumui, db.cur)[ym] || [];
  const i = list.findIndex(p => p.id === item.id); if (i >= 0) list[i] = item; else list.push(item);
  return item;
}
function pmNew(over) {
  const s = site(), date = todayStr(), no = pmNextNo();
  return Object.assign({
    id: uid(), kind: 'general', no, docNo: pmDocNo(no, date), firstNo: '', date, period: '', title: '', vendor: '',
    payMethod: '계좌이체', payDate: '', fundDate: '', claim: '가능', budget: '', amount: 0, status: '작성중', scans: [],
    blocks: [
      { type: 'text', num: true, title: '', text: `${s.fullName || s.name} 현장 ○○에 관해 아래와 같이 품의합니다.\n가. \n나. \n다. ` },
      { type: 'table', num: true, unit: PM_UNIT_DEF, title: '세부내역', cols: ['구분', '내역', '수량', '단가', '금액', '비고'], rows: [['', '', '', '', '', '']], sum: true, note: '' },
      { type: 'attach', num: true, title: '첨부서류', items: [{ name: '견적서', ok: true }, { name: '', ok: false }, { name: '', ok: false }] }],
  }, over || {});
}
/* ---------- 품의서 양식 모음 (경영지원팀 제안: 반복 품의 양식 통일) ----------
 * body = 1. 내용 줄, table = 세부내역 표, etc = 기타사항 줄, attach = [서류, 확인], link = 결재 후 반영할 곳 */
const VATT = [['견적서', true], ['사업자등록증', false], ['통장사본', false]];
const PM_TPL = [
  { id: 'hire', group: '채용', label: '채용·영업팀 단가', hint: '사람별 채용(직원 등록) 또는 직종별 영업팀 단가(인건비 반영) · 단가 변경도 이 양식으로', title: '기획 직원 채용의 건', payDate: '매월 10일', link: 'staff',
    body: S => [`${S} 현장 ○○ 직원 채용과 관련하여 아래와 같이 품의합니다.`, '가. 채용인원(총 ○명) : ', `나. 근무지 : ${S} 현장`, '다. 근무기간 : 0000.00.00.(예정) ~ 당 PJT 종료 시'],
    table: { title: '세부내역', cols: ['성명', '직종', '지급형태', '급여단가', '식대', '근무 시작일', '주요업무', '비고'], rows: [['', '', '월급', '', '9,000', '', '', '']], sum: false, note: '※ 석식 : 야근 시에 한해 제공함' },
    etc: ['가. 출퇴근 관리 프로그램(오션) 기준으로 출근일자 산정 후 당사 인건비 결제일에 맞추어 급여 지급 예정'], attach: [['이력서', true]] },
  // 업체 섭외 통합 양식 (초기 세팅·KT·CRM·문자·MGM·주유·캐터링 등을 하나로)
  { id: 'vendor', group: '업체 섭외', label: '업체 섭외·물품 임차', hint: '인터넷·전화·CRM·문자·생수·주유·캐터링·MGM·사무집기 임차 등 모든 업체', title: '○○ 업체 섭외의 건', payDate: '매월 25일', link: 'vendor', newBiz: true,
    body: S => [`${S} 현장 ○○ 업체 섭외에 관하여 아래와 같이 품의합니다.`, '가. 목적 : ', '나. 업체명 : ', '다. 이용 기간 : 0000.00.00. ~ PJT 종료 시까지', '라. 설치·입고일자 : ', '※ 현장 상황에 따라 일정 변동 가능성 있음.'],
    table: { title: '세부내역', cols: ['구분', '규격', '수량', '단위', '비고'], rows: [['', '', '', '', ''], ['', '', '', '', ''], ['', '', '', '', '']], sum: true, note: '※ 업체 선정 사유 : ' }, etc: ['- '], attach: VATT },
  // 통합 양식 이전의 개별 양식 (초기 세팅·KT·CRM·문자·MGM·주유·캐터링) — 새로 만들 수 없고(목록에 안 보임), 예전 품의의 이름표(label)·결재 후 반영(link)·비교견적 안내(compare)에만 씀
  ...[['setup', '초기 세팅'], ['kt', 'KT 인터넷·전화'], ['crm', 'CRM'], ['sms', '문자 발송'], ['mgm', 'MGM', ''], ['fuel', '주유업체'], ['cater', '캐터링']].map(([id, label, link = 'vendor']) => ({ id, group: '업체 섭외', label, link: link || undefined, hidden: true })),
  { id: 'rent', group: '임차', label: '사무집기 임차', hint: '집기 임차·연장', title: '사무집기 임차의 건', payDate: '자금집행일', link: 'vendor',
    body: S => [`${S} 현장 사무집기 임차에 관해 아래와 같이 품의합니다.`, '가. 기간 : ', '나. 입고일 : '],
    table: { title: '세부내역', cols: ['품목', '규격', '수량', '월 단가', '월 금액', '비고'], rows: [['', '', '', '', '', ''], ['', '', '', '', '', '']], sum: true, note: '' },
    attach: [['견적서', true], ['거래명세서', true], ['레이아웃', false]] },
  // 통합 양식 이전의 숙소·사무실 임차 양식 — 위와 같이 이름표만 (새 품의는 아래 '임차' 통합 양식)
  ...[['house', '숙소 임차'], ['office', '사무실·홍보관 임차']].map(([id, label]) => ({ id, group: '임차', label, link: 'vendor', hidden: true })),
  // 숙소·사무실·홍보관 임차 통합 양식 (영종 05 기획 직원 숙소 · 06 임시사무실 및 홍보관 · 40 조직영업팀 사무실 임차 형식) — 월 임차료는 결재 후 월결제에 반영
  { id: 'lease', group: '임차', label: '임차', hint: '숙소·임시사무실·홍보관·조직영업팀 사무실 (호실별 보증금·임차료·중개수수료)', title: '○○ 임차의 건', payDate: '매월 25일', link: 'vendor',
    body: S => [`${S} 현장 ○○ 임차에 관하여 아래와 같이 품의합니다.`, '가. 용도(사용인원) : ', '나. 소재지 : ○○시 ○○로 ○○, ○○○호(총 ○개호실)', '다. 임차기간 : 0000.00.00. ~ 0000.00.00.', '라. 입주(투입)일자 : 0000.00.00.', '마. 계약일자 : 0000.00.00.'],
    table: { title: '세부내역', cols: ['구분', '호실(소재지)', '업체명(임대인)', '수량(개월)', '단가', '금액', '비고'], rows: [['보증금', '○○○호(전용 ○○평)', '', '1', '', '', '퇴실 시 반환'], ['임차료', '○○○호(전용 ○○평)', '', '', '', '', '매월 25일'], ['보증금', '○○○호(전용 ○○평)', '', '1', '', '', '퇴실 시 반환'], ['임차료', '○○○호(전용 ○○평)', '', '', '', '', '매월 25일'], ['중개수수료', '', '○○부동산', '1', '', '', '세금계산서'], ['부가세', '', '', '', '', '', '임차료 10%']], sum: true, note: '' },
    etc: [' - 임차기간 종료 후 현장 상황에 따라 연장 예정(연장 시 별도 품의)', ' - 관리비·주차·공과금은 실비 정산(별도 품의)', ' - 퇴실 시 원상복구 조건 : '],
    attach: [['임대차계약서', true], ['등기사항전부증명서', true], ['건축물대장', false], ['임대인 신분증(사업자등록증)·통장사본', true], ['도면·위치도', false], ['중개대상물 확인·설명서', false], ['중개수수료 세금계산서', false]] },
  { id: 'rate', group: '인건비', label: '영업팀 단가', hint: '직종별 업체·단가 (결재 후 인건비에 반영)', title: '영업팀 단가 품의에 관한 건', payDate: '매월 10일', link: 'rate',
    body: S => [`${S} 현장 영업팀 단가 품의에 관하여 아래와 같이 품의합니다.`, '가. 출근일자 : 0000.00.00. 이후 순차적 투입', '나. 채용직종 : 상담사, TM, 홍보단, 도우미, 경호, 아르바이트'],
    table: { title: '세부내역', cols: ['직종', '업체명', '지급형태', '급여단가', '식대', '예정 인원', '비고'], rows: ['상담사', 'TM', '홍보단', '도우미', '경호', '아르바이트'].map(j => [j, '', '일급', '', '', '', '']), sum: false, note: '' },
    etc: ['※ 영업인력 오션 기준으로 출근일자 산정', '※ 상기 인원 계획은 현장 일정에 따라 탄력적으로 운영 예정'], attach: [['견적서', true]] },
  { id: 'opencard', group: '법인카드', label: '오픈기간 법인카드 사용', hint: '사용기간·예상금액 (카드 화면에 사용액 비교)', title: '오픈기간 법인카드 사용의 건', payMethod: '법인카드', payDate: '-', link: 'card',
    body: (S, it) => [`${S} 현장 오픈에 따른 법인카드 사용에 관하여 아래와 같이 품의합니다.`, `가. 사용기간 : ${it.useFrom ? `${it.useFrom.replace(/-/g, '.')}.~${(it.useTo || '').replace(/-/g, '.')}.` : ''}`, '나. 사용내용 : 간식(상담사, TM, 도우미, 탕비실 간식 포함) 및 필요비품 구입'],
    table: { title: '세부내역', cols: ['구분', '내역', '예상금액', '비고'], rows: [['간식', '상담사·TM·도우미 간식, 탕비실', '', ''], ['비품', '오픈 준비 필요비품', '', '']], sum: true, note: '' }, attach: [['영수증', true]] },
];
['vendor', 'setup', 'kt', 'crm', 'sms', 'fuel', 'cater', 'rent'].forEach(id => { const t = PM_TPL.find(x => x.id === id); if (t) t.compare = true; });   // 업체 섭외 = 비교견적 3곳 (경영지원 요청)
['rent', 'rate'].forEach(id => { const t = PM_TPL.find(x => x.id === id); if (t) t.hidden = true; });   // 새 품의 목록에서 숨김 — rent 는 에메트 견적서로 작성(15 pmEmetNew), rate 는 채용 창에서 "직종별" 선택으로 씀
const pmTpl = id => PM_TPL.find(x => x.id === id);
// 오픈기간 법인카드 품의 ↔ 법인카드 사용내역 (사용기간·카드 기준, 카드 화면 비교와 같은 범위)
const pmCardTx = it => { const to = it.useTo || it.useFrom, cards = it.useCards || []; return it.useFrom ? db.tx.filter(t => t.siteId === db.cur && t.src === 'card' && t.kind !== 'in' && t.date >= it.useFrom && t.date <= to && (!cards.length || cards.includes(t.card))).sort((a, b) => String(a.date).localeCompare(String(b.date))) : []; };
function pmCardPages(it) {   // 인쇄: 사용기간의 법인카드 사용내역 (카드마다 한 장, 회사 사용내역 명세 모양 13 docCardDetailOf) — 지출결의서 뒤 (15 pmPrintDoc)
  if (it.tpl !== 'opencard' || it.noCardPrint) return '';
  const list = pmCardTx(it); if (!list.length) return '';
  const per = `${String(it.useFrom).replace(/-/g, '.')}.~${String(it.useTo || it.useFrom).replace(/-/g, '.')}.`;
  return [...new Set(list.map(t => t.card))].map(id => docCardDetailOf(list.filter(t => t.card === id), id, `법인카드 사용내역 (${per}) · 카드 ${id}`)).join('');
}
function pmCardTable(list, each) {   // each = 한 건씩, 아니면 구분(계정)별 합계
  if (each) return { cols: ['사용일', '가맹점', '사용내역', '금액', '카드'], rows: list.map(t => [String(t.date).slice(5).replace('-', '/'), t.merchant || '', t.memo || '', fmt(t.amount), t.card || '']) };
  const g = {}; list.forEach(t => { const k = t.cat || '미분류'; (g[k] = g[k] || []).push(t); });
  return { cols: ['구분', '내역', '금액', '비고'], rows: Object.entries(g).map(([k, ts]) => { const m = [...new Set(ts.map(t => t.merchant).filter(Boolean))]; return [k, m.slice(0, 3).join(', ') + (m.length > 3 ? ` 외 ${m.length - 3}곳` : ''), fmt(sum(ts, t => t.amount)), `${ts.length}건`]; }) };
}
function pmFillCard(it, B, each) {   // 세부내역 표(첫 표)를 카드 내역으로 바꿈 → 바꾼 건수 (0 = 내역 없음)
  const list = pmCardTx(it); if (!list.length) return 0;
  let tb = B.find(b => b.type === 'table' && b.title !== '신규업체 등록사항');
  if (!tb) { const at = B.findIndex(b => b.type === 'attach'); tb = { type: 'table', num: true, unit: PM_UNIT_DEF, title: '세부내역', cols: [], rows: [], sum: true, note: '' }; B.splice(at < 0 ? B.length : at, 0, tb); }
  Object.assign(tb, pmCardTable(list, each), { sum: true, note: tb.note || `※ 법인카드 사용내역 ${list.length}건 (${String(it.useFrom).replace(/-/g, '.')}.~${String(it.useTo || it.useFrom).replace(/-/g, '.')}.) — 카드 화면 기준` });
  return list.length;
}
function pmStartDate(it) { if (it.useFrom) return it.useFrom; const m = String(it.period || '').match(/(20\d{2})\s*[.\-\/년]\s*(\d{1,2})\s*[.\-\/월]\s*(\d{1,2})/); return m ? `${m[1]}-${pad2(+m[2])}-${pad2(+m[3])}` : ''; }
const pmExtraLines = it => [String(it.lateReason || '').trim() ? `※ 후품의 사유 : ${it.lateReason || ''}` : '', String(it.reportLine || '').trim() ? `※ 보고 경위 : ${it.reportLine}` : ''].filter(Boolean);
function pmPrintWarns(it) {   // 인쇄 전에 확인: 후품의 사유 · 첨부서류 (낱장 품의 금지) · 비교견적
  const w = [], B = pmBlocks(it);
  const att = B.filter(b => b.type === 'attach').flatMap(b => b.items || []).filter(a => a.name && (a.ok || /후첨|예정/.test(a.st || '')));   // 후첨·예정도 서류 있음으로
  if (!att.length && !B.some(b => b.type === 'image' && b.rel)) w.push('첨부서류(○)가 없습니다 — 견적서·세부내역 없이 품의서만 올리지 마세요 (낱장 금지)');
  const cmp = B.find(b => b.type === 'table' && /비교견적/.test(b.title || ''));   // 예전 형식 (따로 있던 비교견적 표)
  if (cmp && (cmp.rows || []).filter(r => String(r[0] || '').trim()).length < 3) w.push('비교견적이 3곳보다 적습니다');
  const cmpIn = B.find(b => b.type === 'table' && pmCmpVendors(b).some(g => /^확정/.test(g)));   // 세부내역 표 안의 비교견적
  if (cmpIn) {
    const vs = pmCmpVendors(cmpIn).filter(g => !/^확정/.test(g));
    if (vs.length < 3) w.push('비교견적 업체가 3곳보다 적습니다');
    if (vs.some(g => /^업체\d$/.test(g)) || pmCmpVendors(cmpIn).includes('확정(업체명)')) w.push('세부내역 표의 업체 이름(업체1·2·3, 확정 업체)을 적지 않았습니다 — 작성 화면의 "비교 업체" 칸');
  }
  w.push(...orgPrintWarns(it));   // 조직 지급: 이미 지급된 세대 (14b)
  w.push(...pmExpWarns(it));   // 지출결의서 업체별 나누기 (15)
  return w;
}
const PM_LINK = { staff: '직원 등록·단가 반영', rate: '인건비 단가로 반영', vendor: '월결제 거래처로 등록' };
/* 비교견적은 세부내역 표 안에 옆으로 (샘플 대비표 모양):
 *  구분 · 규격 · 수량 · 단위 | 업체1 단가·금액 | 업체2 단가·금액 | 업체3 단가·금액 | 확정(업체명) 단가·금액 | 비고
 *  머리글 "업체명|단가" = 두 줄 머리글 (업체 이름은 작성 화면의 "비교 업체" 칸에서 한 번에 바꿈) */
const PM_CMP_GROUPS = ['업체1', '확정(업체명)'];   // 비교 업체는 작성 화면 [+ 업체]로 필요한 만큼 추가
function pmCmpAdd(t) {   // 비교 업체 한 곳 추가 (확정 업체 앞에)
  const gs = pmCmpVendors(t); if (!gs.length) return;
  const price = t.cols.filter(c => String(c).startsWith(gs[0] + '|')).map(c => String(c).split('|')[1]);
  let n = gs.filter(g => !/^확정/.test(g)).length + 1; while (gs.includes(`업체${n}`)) n++;
  let at = t.cols.findIndex(c => /^확정/.test(String(c)) && String(c).includes('|'));
  if (at < 0) at = t.cols.reduce((a, c, j) => String(c).includes('|') ? j + 1 : a, 0);
  t.cols.splice(at, 0, ...price.map(p => `업체${n}|${p}`));
  t.rows.forEach(r => r.splice(at, 0, ...price.map(() => '')));
}
function pmCmpDel(t, g) {   // 비교 업체 한 곳 빼기 (그 업체의 단가·금액 열)
  for (let j = t.cols.length - 1; j >= 0; j--) if (String(t.cols[j]).split('|')[0] === g && String(t.cols[j]).includes('|')) { t.cols.splice(j, 1); t.rows.forEach(r => r.splice(j, 1)); }
}
function pmCmpTable(t) {
  const isPrice = c => /단가|금액/.test(c);
  const keep = t.cols.map((c, j) => [c, j]).filter(([c]) => !isPrice(c) && !/^업체명$|^비고$/.test(c));
  const price = t.cols.filter(isPrice); if (!price.length) price.push('단가', '금액');
  const cols = [...keep.map(([c]) => c), ...PM_CMP_GROUPS.flatMap(g => price.map(p => `${g}|${p}`)), '비고'];
  const rows = (t.rows || []).map(r => [...keep.map(([, j]) => r[j] || ''), ...PM_CMP_GROUPS.flatMap(() => price.map(() => '')), r[t.cols.indexOf('비고')] || '']);
  return { title: t.title || '세부내역', cols, rows, sum: true, note: t.note || '※ 업체 선정 사유 : ' };
}
const pmCmpVendors = b => [...new Set((b.cols || []).filter(c => String(c).includes('|')).map(c => String(c).split('|')[0]))];
function pmFromTpl(tp, over) {
  const s = site(), S = s.fullName || s.name, base = pmNew(over);
  if (!tp || !tp.body) return base;   // 이름표만 남긴 예전 양식(body 없음)은 빈 양식으로
  const it = Object.assign(base, { tpl: tp.id, title: base.title || tp.title, vendor: base.vendor || tp.vendor || '', payMethod: tp.payMethod || base.payMethod, payDate: base.payDate || tp.payDate || '', claim: '불가', budget: '예산 심의 전' }, over || {});
  // 3칸만: 1. 내용(기타사항은 ※ 줄로 끝에) · 2. 세부내역 · 3. 첨부서류 — 신규업체 등록사항 표는 사업자등록증 첨부로 대신 (상무님 요청)
  const etc = (tp.etc || []).map(l => l.trim()).filter(l => l.replace(/^(?:-|※|[가-하]\.)\s*/, '').trim());
  const etcL = tp.etcTitle ? (etc.length ? [`※ ${tp.etcTitle}`, ...etc.map(l => '  ' + l)] : []) : etc.map(l => '※ ' + l.replace(/^(?:-|※|[가-하]\.)\s*/, ''));
  const B = [{ type: 'text', num: true, title: '', text: [...tp.body(S, it), ...etcL].join('\n') }];
  if (tp.table) B.push({ type: 'table', num: true, unit: PM_UNIT_DEF, ...(tp.compare ? pmCmpTable(tp.table) : JSON.parse(JSON.stringify(tp.table))) });
  const att = tp.attach.map(([name, ok]) => ({ name, ok: ok || (!!tp.newBiz && name === '사업자등록증') }));
  if (tp.newBiz && !att.some(a => a.name === '사업자등록증')) att.push({ name: '사업자등록증', ok: true });
  B.push({ type: 'attach', num: true, title: '첨부서류', items: [...att, ...(tp.compare ? [{ name: '비교견적서(3곳)', ok: true }] : []), { name: '', ok: false }] });
  it.blocks = B;
  return it;
}
// 새 품의서: 1) 양식 고르기 → 2) 머리 칸 입력 → 엑셀 파일 또는 프로그램에서 작성
function pmNewDialog() {
  const shown = PM_TPL.filter(t => !t.hidden), groups = [...new Set(shown.map(t => t.group))];
  const card = (id, label, hint) => `<button class="pm-tpl" data-tpl="${id}" data-hint="${esc(hint)}" title="${esc(hint)}"><b>${esc(label)}</b></button>`;   // 카드는 제목만 · 설명은 마우스를 올리면 아래 #pmTplHint 줄에
  // 맨 위: AI·빈 양식·복사 / 자주 쓰는 양식(+ 에메트 견적서) / 조직 지급(따로)
  const r = modal('새 품의서 — 양식 고르기', `<div class="pm-tplg"><div class="pm-tpls">${card('ai', '✨ AI로 작성', '메모와 견적서·계약서(사진·PDF)를 넣으면 AI가 양식을 골라 제목·본문·세부내역 표·첨부서류까지 채움 · ⚠ 초안을 돕는 보조 기능 (내용은 직접 확인)')}${card('blank', '빈 양식', '1. 내용 · 세부내역 · 첨부서류')}${card('copy', '다른 품의서 복사해서 시작', '이 현장·다른 현장의 지난 품의서를 골라 번호·날짜만 새로')}</div></div>
      <div class="pm-tplg"><div class="small muted">자주 쓰는 양식</div><div class="pm-tpls">${groups.flatMap(g => shown.filter(t => t.group === g)).map(t => card(t.id, t.label, t.hint)).join('')}${card('emet', '📄 에메트 견적서로 작성', '에메트(집기 임차) 렌탈 견적서 엑셀(xlsb·xlsx)을 고르면 사무집기 임차·연장 품의서를 바로 채움 (회차·기간·품목표·부가세 · AI 요금 없음)')}</div></div>
      <div class="pm-tplg"><div class="small muted">조직 지급</div><div class="pm-tpls">${card('orgpay', '조직 지급 (차수형)', '판매수수료·계약축하금·인센티브·일비 … 판매내역(세대)을 붙여넣으면 차수·대비표(전회·금회·누계)·이미 지급된 세대 확인 자동')}</div></div>
      <div id="pmTplHint" class="pm-tplhint">양식에 마우스를 올리면 설명이 여기에 나옵니다.</div>`, [{ label: '취소' }], 'm');
  const hint = $('#pmTplHint', r), hint0 = hint.textContent;
  r.querySelectorAll('[data-tpl]').forEach(b => {
    b.onmouseenter = b.onfocus = () => { hint.innerHTML = `<b>${b.querySelector('b').innerHTML}</b> — ${esc(b.dataset.hint)}`; hint.classList.add('on'); };
    b.onmouseleave = b.onblur = () => { hint.textContent = hint0; hint.classList.remove('on'); };
    b.removeAttribute('title');   // 설명 줄이 있으니 브라우저 말풍선은 안 띄움
  });
  r.querySelectorAll('[data-tpl]').forEach(b => b.onclick =() => { const id = b.dataset.tpl; closeModal(); if (id === 'ai') pmAiNew(); else if (id === 'emet') pmEmetNew(); else if (id === 'orgpay') orgPayForm(); else if (id === 'copy') pmCopyDialog(); else pmTplForm(id === 'blank' ? null : pmTpl(id)); });
}
function pmTplForm(tp0) {
  if (!FS.ready) return;
  let tp = tp0;
  const it0 = tp ? pmFromTpl(tp) : pmNew();
  const isCard = tp && tp.id === 'opencard', isPeople = tp && (tp.id === 'hire' || tp.id === 'rate');
  const cards = siteCards();
  // 보이는 칸은 제목·기안일자만 (번호는 자동, 결제방법·결제일은 양식 기본값) — 나머지는 [더 보기]
  const body = `<p class="small">${tp ? `<b>${esc(tp.label)}</b> 양식 — 내용·표·첨부서류가 미리 채워집니다.` : '빈 양식'} 회사 양식 엑셀로 <b>${esc(site().folder)}/${DIR.pm}/</b>에 저장합니다 (결재중으로 바꾸면 <b>C. 작성완료</b>로 옮김).</p>
      <div class="form-grid">
        <label style="grid-column:span 2">제목<input id="xeTitle" value="${esc(it0.title)}" placeholder="예) 견본주택 전기요금 납부의 건(8월분)"></label>
        <label>기안일자<input id="xeDate" type="date" value="${it0.date}"></label>
        ${isPeople ? `<label>표 쓰는 방식<select id="xeKind"><option value="hire" ${tp.id === 'hire' ? 'selected' : ''}>사람별 — 채용 (결재 후 직원 등록)</option><option value="rate" ${tp.id === 'rate' ? 'selected' : ''}>직종별 — 영업팀 단가 (결재 후 인건비 단가)</option></select></label>` : ''}
        ${isCard ? `<label>사용 시작일<input id="xeFrom" type="date" data-rng="from"></label><label>사용 종료일<input id="xeTo" type="date" data-rng="to"></label>
          <label>승인 요청 금액 (카드 화면에 사용액과 비교)<input id="xeAmt" class="num"></label>
          <label>카드 (비우면 전체)<span class="row small" style="gap:8px">${cards.map(c => `<label><input type="checkbox" data-xecard="${esc(c.last4)}"> ${esc(c.last4)}</label>`).join('') || '<span class="muted">등록된 카드 없음</span>'}</span></label>` : ''}
      </div>
      ${isCard ? `<p class="small muted" style="margin:6px 0 0">💳 그 기간에 이미 쓴 카드 내역이 있으면 세부내역 표에 구분별로 채워집니다 — 표까지 채우려면 <b>[프로그램에서 작성]</b> (엑셀 파일은 표를 엑셀에서 작성)</p>` : ''}
      <details style="margin-top:8px"><summary class="small muted" style="cursor:pointer">더 보기 (번호 ${it0.no} · 업체명 · 시행기간 · 결제방법 · 결제일 · 최초 기안번호)</summary>
      <div class="form-grid" style="margin-top:6px">
        <label>번호<input id="xeNo" class="num" value="${it0.no}"></label>
        <label>업체명<input id="xeVendor" value="${esc(it0.vendor)}"></label>
        <label>시행기간<input id="xePeriod" data-rng="text" autocomplete="off" placeholder="예) 2026.08.16.~2026.08.31."></label>
        <label>결제방법<select id="xePay">${['계좌이체', '법인카드', '전도금', '현금', '기타'].map(x => `<option ${x === it0.payMethod ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
        <label>결제일<input id="xePayDate" value="${esc(it0.payDate)}" placeholder="비우면 '자금집행일'"></label>
        <label>최초 기안번호 (연속 품의일 때)<input id="xeFirst" placeholder="예) YS-○○현장2512-54"></label>
      </div></details>`;
  const read = r => {
    const v = id => ($('#' + id, r) || {}).value || '';
    const it = tp ? pmFromTpl(tp, { useFrom: v('xeFrom'), useTo: v('xeTo') }) : pmNew();
    Object.assign(it, { no: toNum(v('xeNo')) || it0.no, date: v('xeDate') || it0.date, title: v('xeTitle').trim(), vendor: v('xeVendor').trim(), period: v('xePeriod').trim(), payMethod: v('xePay'), payDate: v('xePayDate').trim(), firstNo: v('xeFirst').trim() });
    if (isCard) { it.useFrom = v('xeFrom'); it.useTo = v('xeTo'); it.amount = toNum(v('xeAmt')); it.useCards = [...r.querySelectorAll('[data-xecard]:checked')].map(x => x.dataset.xecard); if (it.useFrom && !it.period) it.period = `${it.useFrom.replace(/-/g, '.')}.~${(it.useTo || '').replace(/-/g, '.')}.`; pmFillCard(it, it.blocks, false); }   // 이미 쓴 카드 내역이 있으면 세부내역에 바로 채움
    it.docNo = pmDocNo(it.no, it.date);
    return it;
  };
  const root = modal(`새 품의서 — ${tp ? tp.label : '빈 양식'}`, body, [
    { label: '취소' },
    { label: '프로그램에서 작성', onClick: r => { const it = read(r); setTimeout(() => pmEditor(it), 0); } },
    { label: '엑셀 파일 만들기', cls: 'primary', onClick: async r => {
      const it = read(r); it.kind = 'excel';
      try { it.file = await pmWriteExcel(await pmTemplateBytes(), it, 'new'); } catch (e) { toast('엑셀 파일을 만들지 못했습니다: ' + e.message); return true; }
      pmPut(it); save(); render(); pmFileInfo(it, tp ? '양식의 1. 내용 · 첨부서류(○)를 채웠습니다. 세부내역 표는 엑셀에서 작성하세요.' : ''); return true;
    } }]);
  const kind = $('#xeKind', root);
  if (kind) kind.onchange = () => {   // 사람별(채용) ↔ 직종별(영업팀 단가): 제목이 기본값 그대로면 같이 바꿈
    const t = $('#xeTitle', root), old = tp; tp = pmTpl(kind.value) || tp;
    if (!t.value.trim() || t.value === old.title) t.value = tp.title;
  };
}
// 다른 품의서 복사 (이 현장·다른 현장) — 번호·날짜는 새로, 현장 이름은 이 현장으로
function pmCopyDialog() {
  const all = db.sites.flatMap(st => pmAll(st.id).filter(p => p.kind === 'general' || p.kind === 'excel').map(p => ({ p, st })))
    .sort((a, b) => (a.st.id === db.cur ? 0 : 1) - (b.st.id === db.cur ? 0 : 1) || String(b.p.date).localeCompare(String(a.p.date)));
  if (!all.length) { toast('복사할 품의서가 없습니다. 기존 품의서 엑셀을 현장 폴더/A. 기안품의/C. 작성완료 에 넣고 [엑셀·스캔본 다시 읽기]를 하면 목록에 나옵니다.'); return; }
  const rowsHtml = q => all.filter(x => !q || (x.p.title + x.p.vendor + x.st.name).includes(q)).slice(0, 150).map(x => `<tr><td class="small">${esc(x.st.name)}</td><td class="num">${esc(x.p.no)}</td><td><a href="#" data-cp="${x.st.id}|${x.p.id}">${esc(x.p.title || '(제목 없음)')}</a> ${x.p.kind === 'excel' ? '<span class="badge">엑셀</span>' : ''}</td><td class="small">${esc(x.p.vendor || '')}</td><td class="small">${esc(x.p.date || '')}</td></tr>`).join('');
  const r = modal('다른 품의서 복사해서 시작', `<input id="cpQ" placeholder="제목·업체·현장 검색 (예: 숙소, 임차, 분양대행)" class="inp" style="width:100%;margin-bottom:8px">
      <div class="tbl-wrap" style="max-height:55vh"><table class="t"><thead><tr><th>현장</th><th>번호</th><th>제목</th><th>업체</th><th>기안일자</th></tr></thead><tbody id="cpRows">${rowsHtml('')}</tbody></table></div>
      <p class="muted small">내용·표를 복사하고 번호·날짜는 새로, 현장 이름은 ${esc(site().name)}(으)로 바꿉니다.</p>`, [{ label: '취소' }]);
  const bind = () => r.querySelectorAll('[data-cp]').forEach(a => a.onclick = ev => { ev.preventDefault(); const [sid, pid] = a.dataset.cp.split('|'); const x = all.find(y => y.st.id === sid && y.p.id === pid); closeModal(); if (x) pmCopyFrom(x.p, x.st); });
  $('#cpQ', r).oninput = ev => { $('#cpRows', r).innerHTML = rowsHtml(ev.target.value.trim()); bind(); };
  bind();
}
const siteNameSwap = (src, dst) => { const pairs = [[src.fullName, dst.fullName || dst.name], [src.name, dst.name]].filter(([a, b]) => a && b && a !== b && String(a).length >= 2); return v => pairs.reduce((t, [a, b]) => String(t).split(a).join(b), v); };
async function pmCopyFrom(src, srcSite) {
  const swap = siteNameSwap(srcSite, site());
  const keep = { title: swap(src.title || ''), vendor: src.vendor || '', payMethod: src.payMethod, payDate: src.payDate || '', claim: src.claim, budget: src.budget, tpl: src.tpl, period: '' };
  if (src.kind === 'excel') {
    let bytes; try { bytes = new Uint8Array(await (await (await fileAt(`${srcSite.folder}/${src.file}`, false)).getFile()).arrayBuffer()); } catch (e) { toast('원본 엑셀 파일을 찾을 수 없습니다: ' + src.file); return; }
    const it = pmNew({ kind: 'excel', blocks: [], ...keep }); it.docNo = pmDocNo(it.no, it.date);
    try { it.file = await pmWriteExcel(bytes, it, 'copy', swap); } catch (e) { toast('엑셀 파일을 만들지 못했습니다: ' + e.message); return; }
    pmPut(it); save(); render(); pmFileInfo(it, `${srcSite.name} ${src.no}번 품의서를 복사했습니다 (번호·기안일자·현장 정보·결재라인을 이 현장 것으로 바꿈). 내용은 엑셀에서 고치세요.`);
    return;
  }
  const blocks = JSON.parse(JSON.stringify(pmBlocks(src))).map(b => { if (b.type === 'text') b.text = swap(b.text || ''); if (b.type === 'table') b.rows = (b.rows || []).map(r => r.map(swap)); if (b.type === 'attach') (b.items || []).forEach(a => { delete a.files; }); return b; });   // 📎 첨부 파일은 이번 건 것으로 새로
  const it = pmNew({ ...keep, blocks, noExpense: src.noExpense }); it.docNo = pmDocNo(it.no, it.date);
  if (srcSite.id !== db.cur) it.blocks = it.blocks.filter(b => b.type !== 'image' || !b.rel);   // 다른 현장 그림 파일은 따라오지 않음
  pmEditor(it); toast('복사했습니다. 내용을 이번 건에 맞게 고치고 저장하세요.');
}
// 인건비·월결제·전도금 자금청구서를 인쇄할 때 대장에 같이 등록 (번호 공유)
function pmRegisterDoc(kind, ym, docNo, date, amount, title) {
  const no = kind === 'cash' ? `J${pad2(toNum((String(docNo).match(/-J(\d+)\s*$/i) || [])[1]) || pmNextJ())}` : toNum((String(docNo).match(/-(\d+)\s*$/) || [])[1]) || pmNextNo();
  const ex = pmAll().find(p => p.kind === kind && p.linkYm === ym);
  const item = ex ? { ...ex } : pmNew({ kind, linkYm: ym, blocks: [] });
  delete item._ym;
  Object.assign(item, { no, docNo, date, amount, title, vendor: item.vendor || '' });
  if (item.status === '작성중') item.status = '결재중';
  pmPut(item); save();
}
function pmDocNoFor(kind, ym, date) {   // 자금청구서 인쇄창 기본 문서번호
  const ex = pmAll().find(p => p.kind === kind && p.linkYm === ym);
  if (ex) return ex.docNo;
  return kind === 'cash' ? pmDocNoJ(pmNextJ(), date || todayStr()) : pmDocNo(pmNextNo(), date || todayStr());
}
const pmDetailTotal = d => {   // 대장 금액: "(금회)" 열 → 없으면 누계·단가를 뺀 마지막 금액 열
  if (!d || !d.cols) return 0;
  let ci = d.cols.findIndex(c => /금회/.test(c));
  if (ci < 0) { const c2 = d.cols.map((c, j) => [c, j]).filter(([c]) => /금액|합계|청구/.test(c) && !/누계|단가/.test(c)); ci = c2.length ? c2[c2.length - 1][1] : -1; }
  if (ci < 0) return 0;
  const lab = r => String(r[0] || '').trim(), hap = (d.rows || []).find(r => /^(합계|합\s*계|총계)$/.test(lab(r)));   // 표에 합계 줄이 있으면 그 값 (계·부가세·합계 겹쳐 더하지 않게)
  return hap ? toNum(hap[ci]) : sum((d.rows || []).filter(r => !/^(계|소계)$/.test(lab(r))), r => toNum(r[ci]));
};

/* 선지급 표시 */
function pmFlags(p) {
  const out = [];
  if (p.status === '결재완료' && !(p.scans || []).length && p.scanExceptionReason) out.push(`<span class="badge" title="스캔본 없이 결재완료로 바꿀 때 적은 증빙 보관 위치·사유">스캔본 없음 · ${esc(p.scanExceptionReason)}</span>`);
  const tp = pmTpl(p.tpl); if (tp) out.push(`<span class="badge" title="품의서 양식">${esc(tp.label)}</span>`);
  const na = pmAssets(p).length; if (na) out.push(`<a href="#" class="badge ok" data-act="goto" data-tab="asset" title="이 품의서로 자산·집기 대장에 등록한 품목">자산 ${na}</a>`);   // 12c 자산 연동
  return out.length ? `<div class="chips small" style="margin-top:3px">${out.join(' ')}</div>` : '';
}
function pmLinkBtn(p) {
  const tp = pmTpl(p.tpl); if (!tp || !PM_LINK[tp.link]) return '';
  const ok = p.status === '결재완료';
  return `<button class="btn ${ok ? '' : 'ghost'} sm" data-act="pmLink" data-id="${p.id}" title="${ok ? '' : '결재 전입니다. 결재완료 후 반영을 권장합니다 · '}${PM_LINK[tp.link]}">${ok ? '↪ ' : ''}${PM_LINK[tp.link].replace(/로 반영|에 등록|로 등록/, '')}</button>`;
}
/* 결재된 품의 → 다른 화면에 반영: 채용 → 직원 명단 · 영업팀 단가 → 인건비 단가 · 업체 섭외/집기 → 월결제 거래처 */
function pmTableRows(it, want, tb) {   // 첫 표(또는 넘겨 준 표 tb)에서 열 이름으로 값 뽑기
  tb = tb || pmBlocks(it).find(b => b.type === 'table' && b.title !== '신규업체 등록사항') || it.xlTable; if (!tb) return [];   // 엑셀 품의서는 읽어 둔 세부내역 표(xlTable)
  const ci = Object.fromEntries(Object.entries(want).map(([k, re]) => [k, tb.cols.findIndex(c => re.test(String(c).replace(/\s/g, '')))]));
  // 비교견적 표: 업체명 = 확정(업체명) 머리글, 금액 = 확정 업체의 금액 열 (업체1·2… 열은 읽지 않음)
  const cg = pmCmpVendors(tb).find(g => /^확정/.test(g)), fixName = cg ? ((cg.match(/^확정\s*\((.+)\)$/) || [])[1] || '').replace(/^업체명$/, '') : '';
  if (cg) Object.keys(ci).forEach(k => { const c = tb.cols[ci[k]]; if (c !== undefined && String(c).includes('|')) ci[k] = -1; });
  if (cg && 'amount' in ci) ci.amount = tb.cols.findIndex(c => String(c).startsWith(cg + '|') && /금액/.test(c));
  return (tb.rows || []).map(r => Object.fromEntries(Object.entries(ci).map(([k, i]) => [k, i >= 0 ? String(r[i] ?? '').trim() : '']))).filter(x => Object.values(x).some(Boolean))
    .map(x => (cg && 'name' in x && !x.name ? { ...x, name: fixName } : x));
}
// 단가 적용일: 본문 "조정기간 : 2026.08.18.부터" → 없으면 시행기간 시작일(pmStartDate: "2026.08.18. ~ PJT종료 시") → 2026-08-18
function pmApplyDate(it) {
  const txt = pmBlocks(it).filter(b => b.type === 'text').map(b => b.text || '').join('\n');
  const m = txt.match(/(?:조정기간|적용일|시행일|변경일)[^\d\n]{0,12}(20\d{2})\s*[.\-\/년]\s*(\d{1,2})\s*[.\-\/월]\s*(\d{1,2})/);
  return m ? `${m[1]}-${pad2(+m[2])}-${pad2(+m[3])}` : pmStartDate(it);   // 없으면 시행기간 시작일
}
// "주 5일 240만원" · "월 750만원" · "2,500,000" → 원 (마지막 금액)
const pmMoney = v => { const s = String(v ?? '').replace(/\s/g, ''), ms = [...s.matchAll(/([\d,.]+)(만)?원/g)]; if (ms.length) { const x = ms[ms.length - 1]; return Math.round(toNum(x[1]) * (x[2] ? 10000 : 1)); } return /^[\d,.]+$/.test(s) ? toNum(s) : 0; };
function pmLinkDialog(it) {
  const tp = pmTpl(it.tpl); if (!tp) return;  const inp = (k, i, v, w = 110, cls = '') => `<input data-lk="${k}" data-i="${i}" value="${esc(v ?? '')}" class="${cls}" style="width:${w}px">`;
  const ptSel = (i, v) => `<select data-lk="payType" data-i="${i}">${PAY_TYPES.filter(x => x !== '제외').map(x => `<option ${x === v ? 'selected' : ''}>${x}</option>`).join('')}</select>`;
  const pt = v => (/월/.test(v) ? '월급' : '일급');
  let rows, head, rowHtml, note, apply;
  const blank = n => Array.from({ length: n }, () => ({}));
  if (tp.link === 'staff') {
    // 채용 품의 + 인건비 조정 품의(영종 89·127 "○○ 인건비 조정의 건": 기존급여(월) → 조정급여(월), 조정기간 …부터)
    // 새 이름 → 직원 등록 · 이미 있는 이름 → 적용일부터 새 단가 (달 중간이면 그 달은 앞뒤로 나눠 계산, 11_pay payApplyChange)
    const tb = pmBlocks(it).find(b => b.type === 'table' && b.title !== '신규업체 등록사항') || it.xlTable;
    const newHead = tb ? (tb.cols.find(c => /조정|변경후|변경\s*급여/.test(String(c))) || tb.cols.find(c => /급여단가|단가|급여/.test(String(c))) || '') : '';
    rows = pmTableRows(it, { name: /성명|이름/, team: /직종|구분/, payType: /지급형태/, rate: /급여단가|단가|급여/, neu: /조정|변경후|변경급여/, old: /기존/, meal: /식대/, start: /시작일|적용일/ });
    if (!rows.length) rows = blank(3);
    const start0 = pmApplyDate(it) || `${state.ym}-01`;
    const staffOf = name => siteStaff(true).find(s => s.name === String(name || '').trim());
    const typeOf = r => { const t = `${r.payType || ''} ${r.neu || ''}`; return /일급|일당|\(일\)/.test(t) ? '일급' : /월급|\(월\)|^월/.test(t) || /\(월\)|월/.test(newHead) ? '월급' : /\(일\)|일/.test(newHead) ? '일급' : pt(r.payType); };
    const rateOf = r => { const v = pmMoney(r.neu || r.rate); return v ? fmt(v) : (r.neu || r.rate || ''); };
    const dateOf = r => { const m = String(r.start || '').match(/(20\d{2})\s*[.\-\/]\s*(\d{1,2})\s*[.\-\/]\s*(\d{1,2})/); return m ? `${m[1]}-${pad2(+m[2])}-${pad2(+m[3])}` : start0; };
    const nowOf = name => { const p = staffOf(name); if (!p) return '<span class="muted">새 직원</span>'; const d = payDefaults(p); return `${esc(d.payType)} ${fmt(d.rate)}`; };
    head = '<th></th><th>성명</th><th>구분(팀)</th><th>지금</th><th>지급형태</th><th>급여단가</th><th>식대단가</th><th title="이미 있는 직원: 이 날부터 새 단가 (달 중간이면 그 달은 나눠 계산)">적용일</th>';
    rowHtml = (r, i) => `<td><input type="checkbox" data-lk="on" data-i="${i}" checked></td><td>${inp('name', i, r.name, 80)}</td><td>${inp('team', i, r.team, 90)}</td><td class="small" style="white-space:nowrap">${r.name ? nowOf(r.name) : ''}${r.old ? `<div class="muted">품의 기존: ${esc(r.old)}</div>` : ''}</td><td>${ptSel(i, typeOf(r))}</td><td>${inp('rate', i, rateOf(r), 100, 'num')}</td><td>${inp('meal', i, r.meal, 70, 'num')}</td><td><input type="date" data-lk="date" data-i="${i}" value="${esc(dateOf(r))}"></td>`;
    note = '새 이름은 현장 인건비 직원으로 등록합니다. <b>이미 있는 직원은 적용일부터 새 단가</b>로 바뀝니다 — 1일이면 그 달부터, 달 중간이면 그 달은 적용일 앞뒤로 나눠 계산 (일급 = 출근일 × 일급, 월급 = 월급 × 일수 / 그 달 일수). 다음 달부터는 새 단가로 이어집니다.';
    apply = (vals) => {
      let add = 0; const chg = [];
      vals.forEach(v => {
        if (!v.name) return;
        const rate = toNum(v.rate), meal = v.meal !== '' ? { mealRate: toNum(v.meal) } : {};
        let p = staffOf(v.name);
        if (!p) { p = { id: uid(), siteId: db.cur, name: v.name, team: v.team, title: '', active: true, kind: '현장' }; db.staff.push(p); add++; p.pay = Object.assign(p.pay || {}, { payType: v.payType, ...(rate ? { rate } : {}), ...meal }); return; }
        if (!p.team && v.team) p.team = v.team;
        if (rate && /^\d{4}-\d{2}-\d{2}$/.test(v.date)) chg.push(`${p.name} ${payApplyChange(p, v.date, v.payType, rate, meal)} ${v.payType} ${fmt(rate)}`);
        else p.pay = Object.assign(p.pay || {}, { payType: v.payType, ...(rate ? { rate } : {}), ...meal });
      });
      return [add ? `직원 ${add}명 등록` : '', chg.length ? `단가 변경: ${chg.join(' · ')}` : ''].filter(Boolean).join(' · ') || '바뀐 것 없음';
    };
  } else if (tp.link === 'rate') {
    rows = pmTableRows(it, { job: /직종|구분/, company: /업체/, payType: /지급형태/, rate: /급여단가|단가/, meal: /식대/ });
    if (!rows.length) rows = blank(4);
    head = '<th></th><th>직종(구분)</th><th>업체명</th><th>지급형태</th><th>급여단가</th><th>식대단가</th><th>맞는 직원</th>';
    const match = job => siteStaff(true).filter(s => s.kind === '현장' && job && normLabel(s.team) && (normLabel(s.team).includes(normLabel(job)) || normLabel(job).includes(normLabel(s.team)))).length;
    rowHtml = (r, i) => `<td><input type="checkbox" data-lk="on" data-i="${i}" ${r.rate || r.company ? 'checked' : ''}></td><td>${inp('job', i, r.job, 90)}</td><td>${inp('company', i, r.company, 120)}</td><td>${ptSel(i, pt(r.payType))}</td><td>${inp('rate', i, r.rate, 100, 'num')}</td><td>${inp('meal', i, r.meal, 80, 'num')}</td><td class="num muted">${match(r.job)}명</td>`;
    note = `구분 이름에 직종이 들어간 현장 직원의 기본 단가가 바뀝니다 (예: 직종 "상담사" → 구분 "상담사팀"). 나중에 등록하는 사람도 이 단가로 시작합니다.<br>
      <label>인건비 표 적용일 <input type="date" id="lkFrom" value="${esc(pmApplyDate(it) || `${state.ym}-01`)}"></label> — 이 날부터 인건비에 적용 (달 중간이면 그 달은 앞뒤로 나눠 계산) · 비우면 기본 단가만 바꿈`;
    apply = (vals, root) => {
      const s = site(); s.rateTable = vals.filter(v => v.job).map(v => ({ job: v.job, company: v.company, payType: v.payType, rate: toNum(v.rate) || '', meal: v.meal === '' ? '' : toNum(v.meal) }));
      const from = $('#lkFrom', root).value; let n = 0;
      siteStaff(true).filter(p => p.kind === '현장').forEach(p => {
        const r = s.rateTable.find(x => normLabel(p.team) && (normLabel(p.team).includes(normLabel(x.job)) || normLabel(x.job).includes(normLabel(p.team)))); if (!r) return;
        const extra = { ...(r.company ? { company: r.company } : {}), ...(r.meal !== '' ? { mealRate: r.meal } : {}) };
        n++;
        if (from && r.rate !== '') payApplyChange(p, from, r.payType, r.rate, extra);   // 11_pay: 1일이면 그 달부터, 아니면 그 달 나눠 계산
        else { p.pay = Object.assign(p.pay || {}, extra, { payType: r.payType }); if (from) Object.assign(payRec(db.cur, from.slice(0, 7), p), extra); }
      });
      return `단가표 ${s.rateTable.length}개 직종 저장 · 직원 ${n}명 ${from ? `${from.slice(5).replace('-', '/')}부터 ` : '기본 '}단가 반영`;
    };
  } else {
    rows = pmTableRows(it, { subject: /과목/, name: /업체/, desc: /내역|품목|구분/, amount: /월금액|금액|합계/ });
    if (!rows.some(r => r.name)) rows = [{ subject: tp.id === 'rent' ? '임차료' : '', name: it.vendor || '', desc: String(it.title || '').replace(/의\s*건.*$|에\s*관한.*$/, ''), amount: String(pmAmount(it) || '') }];
    rows.forEach(r => { if (!r.name) r.name = it.vendor || ''; });
    head = '<th></th><th>과목</th><th>업체명</th><th>거래내역</th><th>월 금액</th><th></th>';
    const exists = r => db.vendors.some(v => v.siteId === db.cur && v.active !== false && v.name === r.name && (!r.desc || v.desc === r.desc));
    rowHtml = (r, i) => `<td><input type="checkbox" data-lk="on" data-i="${i}" ${exists(r) || !r.name ? '' : 'checked'}></td><td><input data-lk="subject" data-i="${i}" value="${esc(r.subject)}" list="subjList2" style="width:100px"></td><td>${inp('name', i, r.name, 130)}</td><td>${inp('desc', i, r.desc, 180)}</td><td>${inp('amount', i, r.amount, 100, 'num')}</td><td class="small muted">${exists(r) ? '이미 있음' : ''}</td>`;
    note = `<datalist id="subjList2">${MONTHLY_SUBJECTS.map(x => `<option>${x}</option>`).join('')}</datalist>월결제 탭의 매월 결제처로 추가합니다.<br><label><input type="checkbox" id="lkAmt"> 월 금액을 작업월(${ymLabel(state.ym)}) 월결제 금액(유성)에도 넣기</label>`;
    apply = (vals, root) => {
      const vs = db.vendors.filter(v => v.siteId === db.cur); let order = vs.length ? Math.max(...vs.map(v => v.order ?? 0)) + 1 : 0, n = 0;
      const withAmt = $('#lkAmt', root).checked, m = monthOf(db.cur, state.ym);
      vals.forEach(v => { if (!v.name) return; let x = db.vendors.find(y => y.siteId === db.cur && y.name === v.name && (y.desc || '') === v.desc); if (!x) { x = { id: uid(), siteId: db.cur, subject: v.subject, name: v.name, desc: v.desc, ref: it.docNo || '', active: true, order: order++ }; db.vendors.push(x); n++; } else x.active = true; if (withAmt && toNum(v.amount) && !m.closed) { const r = m.rows[x.id] = m.rows[x.id] || {}; r.ys = toNum(v.amount); } });
      return `월결제 거래처 ${n}곳 추가`;
    };
  }
  modal(`${PM_LINK[tp.link]} — ${it.no}번 ${it.title || ''}`, `${it.status !== '결재완료' ? '<div class="banner warn small">아직 결재완료가 아닙니다. 결재 후 반영하는 것을 권장합니다.</div>' : ''}
      <div class="tbl-wrap"><table class="t"><thead><tr>${head}</tr></thead><tbody>${rows.map((x, i) => `<tr>${rowHtml(x, i)}</tr>`).join('')}</tbody></table></div>
      <p class="small muted">${note}</p>${it.kind === 'excel' ? '<p class="small muted">엑셀 품의서는 표 내용을 읽지 않으므로 위 칸에 직접 입력하세요.</p>' : ''}`, [
    { label: '취소' },
    { label: '반영', cls: 'primary', onClick: root => {
      const vals = rows.map((_, i) => { const o = {}; root.querySelectorAll(`[data-lk][data-i="${i}"]`).forEach(el => { o[el.dataset.lk] = el.type === 'checkbox' ? el.checked : el.value.trim(); }); return o; }).filter(o => o.on);
      const msg = apply(vals, root); it.linkedAt = todayStr(); const f = pmFind(it.id); if (f) f.x.linkedAt = it.linkedAt;
      save(); render(); toast(msg);
    } }]);
}

/* 손익 반영: 프로그램 품의서 중 지출결의서를 같이 낸 것(결재중·결재완료) → 현장 손익 지출 (12_pl plAuto)
 * 빼는 것: 법인카드·전도금 결제(카드·전도금 내역으로 이미 들어감), 직원·단가·월결제로 반영되는 양식(인건비·월결제로 들어감), [손익에서 빼기] 체크
 * 귀속월 = 자금집행일, 없으면 기안일자 · 항목 = 제목·표 과목으로 임차료 / 복리후생비 / 기타(월경비) */
/* 회사 방식: 품의 + 지출결의서를 같이 올림 → 그때 지급(손익) / 품의만 올림 → 월결제·인건비 때 지급(그쪽 손익으로 들어감)
 * 엑셀 품의서: 파일 안에 지출결의서 시트가 채워져 있으면(hasExp, 15 pmReadExcel) 자동 반영
 * 품의마다 plMode: '' 자동 · 'on' 반영 · 'off' 빼기 (엑셀 품의 정보 창), 프로그램 품의는 plSkip(작성 창 [손익에서 빼기])도 */
function pmPlAuto(p) {
  const tp = pmTpl(p.tpl);
  if (['법인카드', '전도금'].includes(p.payMethod) || (tp && tp.link) ||!['결재중', '결재완료'].includes(p.status)) return false;
  if (p.kind === 'general') return !p.noExpense && !p.plSkip;
  if (p.kind === 'excel') return (p.hasExp !== undefined ? !!p.hasExp : !/매월|매달/.test(p.payDate || '')) && !/채용|단가/.test(p.title || '');   // hasExp: 엑셀에 지출결의서가 채워져 있음 (아직 다시 읽기 전이면 예전 기준)
  return false;
}
// 품의마다 [손익] 창에서 고친 값: plMode('' 자동·on·off) · plAmt(금액) · plKey(구분) · plYm(귀속월) · plNoVat(부가세 없는 품의)
// 손익은 부가세 뺀 공급가 기준: 품의 금액 × 10/11 (월결제와 같은 방식). 부가세 없는 품의(월세·면세)는 plNoVat, 직접 넣은 금액(plAmt)은 그대로
const pmPlBase = p => Math.round(pmAmount(p) * (p.plNoVat ? 1 : 10 / 11));
const pmPlAmt = p => toNum(p.plAmt) || pmPlBase(p);
const pmPlYm = p => p.plYm || String(p.fundDate || p.date || '').slice(0, 7);
const PL_PM_KEYS = ['임차료', '복리후생비', '기타(월경비)', '판매수수료(조직)'];
function pmPlGuessKey(p) {
  const txt = [p.title, ...[...pmBlocks(p).filter(b => b.type === 'table'), ...(p.xlTable ? [p.xlTable] : [])].flatMap(b => (b.rows || []).map(r => r[0]))].join(' ');
  return p.tpl === 'orgpay' || /조직\s*수수료|판매\s*수수료/.test(txt) ? '판매수수료(조직)' : /임차|숙소|사무실|홍보관|월세|임대/.test(txt) ? '임차료' : /식대|간식|생수|복리|회식|식사/.test(txt) ? '복리후생비' : '기타(월경비)';
}
const pmPlKey = p => (PL_PM_KEYS.includes(p.plKey) ? p.plKey : pmPlGuessKey(p));
function pmPlOn(p) {
  if (pmPlAmt(p) <= 0 || p.plMode === 'off') return false;
  return p.plMode === 'on' || pmPlAuto(p);
}
function pmPlItems(sid, ym) {
  return pmAll(sid).filter(p => pmPlYm(p) === ym && pmPlOn(p)).map(p => [pmPlKey(p), `품의 ${p.no}번 ${p.title || ''}`, pmPlAmt(p)]);
}
const pmPlVisible = () => isAdmin() || !(secOn() && secOpt().pl);   // 손익을 잠가 둔 경리 모드에서는 안 보임
function pmPlDialog(p) {
  const on = pmPlOn(p);
  const r = modal(`현장 손익 반영 — ${p.no}번 ${p.title || ''}`, `
    <div class="form-grid">
      <label>반영<select id="plMode">${[['', `자동 (지금 ${pmPlAuto(p) ? '반영' : '안 함'})`], ['on', '반영'], ['off', '빼기']].map(([v, l]) => `<option value="${v}" ${(p.plMode || '') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label>구분<select id="plKey">${PL_PM_KEYS.map(k => `<option ${k === pmPlKey(p) ? 'selected' : ''}>${k}</option>`).join('')}</select></label>
      <label>부가세<select id="plVat"><option value="">품의 금액에 포함 → 빼고 반영 (÷1.1)</option><option value="none" ${p.plNoVat ? 'selected' : ''}>없음 (월세·면세 등) → 그대로</option></select></label>
      <label>손익 금액 (공급가)<input id="plAmt" class="num" value="${fmt0(pmPlAmt(p))}" placeholder="${fmt0(pmPlBase(p))}"></label>
      <label>귀속월<input id="plYm" type="month" value="${esc(pmPlYm(p))}"></label></div>
    <p class="muted small">지금: <b>${on ? `${ymLabel(pmPlYm(p) || state.ym)} ${pmPlKey(p)} ${fmt(pmPlAmt(p))}원 반영` : '손익에 안 들어감'}</b><br>
      자동 = 지출결의서를 같이 올린 품의만 (월결제·인건비로 나가는 품의는 그쪽에서 반영) ${p.kind === 'excel' ? `(이 엑셀: 지출결의서 ${p.hasExp ? '있음' : p.hasExp === false ? '없음' : '아직 확인 안 함'})` : `(작성 창의 "지출결의서 같이 올림" ${p.noExpense ? '꺼짐' : '켜짐'})`}
      손익은 <b>부가세 뺀 공급가</b>로 들어갑니다: 품의 금액 ${fmt0(pmAmount(p)) || 0}원 ÷ 1.1. 금액을 비우면 이 값, 직접 적으면 적은 그대로. 귀속월을 비우면 자금집행일(없으면 기안일자) 달.</p>`, [
    { label: '취소' },
    { label: '저장', cls: 'primary', onClick: root => {
      const f = pmFind(p.id); if (!f) return;
      const x = f.x, amt = toNum($('#plAmt', root).value), key = $('#plKey', root).value, ym = $('#plYm', root).value;
      x.plMode = $('#plMode', root).value || undefined; if (!x.plMode) delete x.plMode;
      if ($('#plVat', root).value === 'none') x.plNoVat = true; else delete x.plNoVat;
      if (amt && amt !== pmPlBase(x)) x.plAmt = amt; else delete x.plAmt;
      if (key !== pmPlGuessKey(x)) x.plKey = key; else delete x.plKey;
      if (ym && ym !== String(x.fundDate || x.date || '').slice(0, 7)) x.plYm = ym; else delete x.plYm;
      delete x.plSkip;   // 예전 작성 창 체크는 [손익] 창으로 대신
      save(); render(); toast(pmPlOn(x) ? `손익 ${ymLabel(pmPlYm(x))} ${pmPlKey(x)}에 ${fmt(pmPlAmt(x))}원을 반영했습니다.` : '손익에서 뺐습니다.');
    } }], 'm');
  // 부가세를 바꾸면 금액 칸도 다시 계산 (직접 고친 금액이 아니면)
  $('#plVat', r).onchange = ev => { if (!p.plAmt) $('#plAmt', r).value = fmt0(Math.round(pmAmount(p) * (ev.target.value === 'none' ? 1 : 10 / 11))); };
  return r;
}
const pmScansOf = (p, k) => (p.scans || []).filter(r => (String(r).startsWith(DIR.pmDone + '/')) === (k === 'done'));   // done = A. 결재완료 폴더, scan = 그 밖
// 대장 표 (품의서 탭 = 전도금 청구 뺀 것 · 전도금 탭 = 전도금 청구(J번호)만 07 viewCash)
// 결재본(A. 결재완료 폴더) · 스캔본(그 밖: B. 스캔본, [＋스캔]으로 올린 것) 따로 · 파일 위치/다음 회차/삭제는 ⋯ 메뉴
function pmListTable(list, empty) {
  const plOk = p => pmPlVisible() && (p.kind === 'general' || p.kind === 'excel');
  const scanBtn = (p, k, label) => { const n = pmScansOf(p, k).length; return n ? `<button class="btn sm" data-act="pmScanView" data-id="${p.id}" data-k="${k}" title="${label} 보기">${label} ${n}</button>` : ''; };
  const rows = list.map(p => `<tr>
      <td class="num" title="${esc(p.docNo || '')}"><b>${esc(p.no)}</b></td><td style="white-space:nowrap">${esc(p.date)}</td>
      <td><a href="#" data-act="pmEdit" data-id="${p.id}" title="${esc([p.docNo, p.firstNo ? `최초 ${p.firstNo}` : '', p.vendor ? `업체 ${p.vendor}` : '', p.file ? `📄 ${p.file.split('/').pop()}` : ''].filter(Boolean).join('\n'))}">${esc(p.title || '(제목 없음)')}</a>${p.kind !== 'general' ? ` <span class="badge">${PM_KIND[p.kind]}</span>` : ''}${pmFlags(p)}</td>
      <td class="num">${fmt0(pmAmount(p))}</td>
      <td><select data-ch="pmStatus" data-id="${p.id}" class="pm-st ${pmStCls(p.status)}">${[...PM_STATUS, ...(PM_STATUS.includes(p.status) ? [] : [p.status])].map(x => `<option ${x === p.status ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></td>
      <td class="center" style="white-space:nowrap">${scanBtn(p, 'done', '결재본')}${scanBtn(p, 'scan', '스캔')}</td>
      <td style="white-space:nowrap">${pmLinkBtn(p)}${plOk(p) && pmPlOn(p) ? `<button class="btn sm" data-act="pmPl" data-id="${p.id}" title="현장 손익 ${ymLabel(pmPlYm(p))} ${pmPlKey(p)} ${fmt(pmPlAmt(p))}원 반영 중 (공급가) — 눌러서 고치기">손익 ✓</button>` : ''}</td>
      <td>${MENU('⋯', [
        plOk(p) && !pmPlOn(p) ? MI('pmPl', '손익에 반영…', `data-id="${p.id}"`, '구분·금액(공급가)·귀속월 정하기') : '',
        (p.kind === 'general' || p.kind === 'excel') && pmAssetRows(p).length ? MI('pmAsset', '자산 대장에 등록', `data-id="${p.id}"`, pmAssets(p).length ? `이미 ${pmAssets(p).length}건 등록` : '표의 품목·수량·단가 → 자산·집기') : '',
        MI('pmScanAdd', '스캔본 올리기', `data-id="${p.id}"`, '서명 받은 PDF·사진 → 결재완료'),
        MI('pmPrint', p.kind === 'excel' ? '📂 파일 위치·폴더 열기' : '인쇄', `data-id="${p.id}"`, p.kind === 'excel' && p.file ? p.file.split('/').pop() : ''),
        p.kind === 'general' || p.kind === 'excel' ? MI('pmNext', '다음 회차', `data-id="${p.id}"`, '차수·월분 +1로 복사해 작성') : '',
        MI('pmDel', '삭제', `data-id="${p.id}"`, '대장에서 삭제')])}</td></tr>`).join('');
  return `<div class="tbl-wrap" style="overflow:visible"><table class="t pm-list"><thead><tr><th>번호</th><th style="white-space:nowrap">기안일자</th><th>제목</th><th>금액</th><th>상태</th><th title="결재본 = A. 결재완료 폴더 · 스캔 = B. 스캔본 폴더 (⋯ → 스캔본 올리기)">스캔본</th><th title="결재 후 직원·단가·월결제로 반영 · 현장 손익(부가세 뺀 공급가) — 손익에 안 들어간 품의는 ⋯ → 손익에 반영">반영</th><th></th></tr></thead>
      <tbody>${rows || `<tr><td colspan="8" class="center muted" style="padding:30px">${empty}</td></tr>`}</tbody></table></div>`;
}
function viewPumui() {
  if (state.pmSynced !== db.cur && FS.ready) { state.pmSynced = db.cur; setTimeout(() => pmSyncFolder(true), 50); }
  const s = site(), whole = pmAll(), all = whole.filter(p => p.kind !== 'cash').sort((a, b) => toNum(b.no) - toNum(a.no));   // 전도금 청구(J번호)는 전도금 탭에서
  const f = state.pmFilter || '';
  const q = (state.pmQ || '').trim();
  const list = all.filter(p => (!f || (f === '스캔없음' ? p.status !== '결재완료' && !(p.scans || []).length : p.status === f)) && (!q || (p.title + p.vendor + p.docNo).includes(q)));
  const cnt = k => all.filter(p => p.status === k).length;
  // 이번 달 정기 자금청구서 (지난달 인건비 · 이번 달 월결제) — 전도금 정산은 전도금 탭에서만 안내
  const T = todayStr().slice(0, 7), P = ymAdd(T, -1);
  const due = [['pay', P, `${monthNo(P)}월분 인건비 청구`, 'pay'], ['monthly', T, `${monthNo(T)}월 월결제`, 'monthly']]
    .filter(([k, ym]) => !whole.some(p => p.kind === k && p.linkYm === ym));
  return `${pageHead('품의서 대장', `${esc(s.fullName || s.name)} · 다음 번호 ${pmNextNo()}`,
    BTN('pmAdd', '+ 새 품의서', 'title="양식(채용·업체 섭외·사무집기·영업팀 단가·오픈기간 카드 …)을 골라 엑셀 또는 프로그램에서 작성"', 'primary') + BTN('pmSync', '엑셀·스캔본 다시 읽기', 'title="현장 폴더/A. 기안품의 (C. 작성완료·A. 결재완료·B. 스캔본)의 엑셀·스캔본을 읽어 대장에 반영"') + BTN('pmExport', '엑셀로 저장', 'title="품의서 대장을 엑셀로 저장"'))}
      ${due.length ? `<div class="banner info small">이번 달 정기 청구: ${due.map(([, ym, l, tab]) => `<button class="chip" data-act="goto" data-tab="${tab}" data-ym="${ym}">${l} →</button>`).join(' ')}</div>` : ''}
      <div class="row small" style="margin-bottom:8px"><select data-ch="pmFilter"><option value="">전체 (${all.length}건)</option>${[...PM_STATUS, '스캔없음'].map(x => `<option ${x === f ? 'selected' : ''} value="${x}">${x === '스캔없음' ? '스캔본 없는 미완료' : `${x} (${cnt(x)}건)`}</option>`).join('')}</select>
        <input data-ch="pmQ" value="${esc(q)}" placeholder="제목·업체·번호 검색" class="inp" style="width:220px"></div>
      ${pmListTable(list, '품의서가 없습니다. [+ 새 품의서]로 만드세요.<br>첫 번호는 설정 → 현장 정보 → "품의서 첫 번호"')}
      <p class="muted small">스캔본은 A. 기안품의/B. 스캔본에 넣고 [다시 읽기] → 자동 "결재완료" · 반복 품의는 [다음 회차]</p>`;
}
