/* 유성 현장 관리 프로그램 — 현장 손익 탭
 * (원래 app.js 의 화면 부분. 모든 js/*.js 는 같은 전역 공간을 공유하며 html 에 적힌 순서대로 읽힘) */
'use strict';


/* ================= 현장 손익 ================= */
const PL_REV = [['units', '판매 세대수'], ['fee', '판매수수료금액'], ['mgm', 'MGM수수료'], ['opex', '운영비'], ['util', '견본주택 공과금'], ['bonus', '계약축하금'], ['revEtc', '기타 수익']];
const PL_EXP = [['유성 정직원', 'pay'], ['기획계약직', 'pay'], ['경리', 'pay'], ['상담사/TM', 'pay'], ['도우미/경호', 'pay'], ['아르바이트/홍보단/미화', 'pay'], ['복리후생비', 'auto'], ['임차료', 'auto'], ['기타(월경비)', 'auto'], ['판매수수료(조직)', 'auto']];
function plAuto(sid, ym) {
  const v = {}, det = {};
  const add = (k, label, amt) => { amt = Math.round(amt); if (!amt) return; v[k] = (v[k] || 0) + amt; (det[k] = det[k] || []).push([label, amt]); };
  payRows(sid, ym, false).forEach(({ s, rec, c }) => {
    if (rec.payType === '제외') return;
    const k = rec.payType === '정직원(손익만)' ? '유성 정직원' : (rec.plGroup || guessPlGroup(s.team));
    add(k, `${s.team ? s.team + ' ' : ''}${s.name}`, rec.payType === '정직원(손익만)' ? c.base : c.gross);
  });
  // 법인카드·전도금은 부가세 포함 금액 그대로 (회사 기준 — 월결제·품의서만 공급가)
  db.tx.filter(t => t.siteId === sid && txYm(t) === ym && t.kind !== 'in').forEach(t => {
    const k = GROUP_OF[t.cat] === '복리후생비' ? '복리후생비' : '기타(월경비)';
    add(k, t.src === 'card' ? `법인카드(${t.card})` : '전도금', t.amount);
  });
  const m = (db.monthly[sid] || {})[ym];
  if (m) db.vendors.filter(x => x.siteId === sid).forEach(x => {
    const r = m.rows[x.id]; if (!r) return;
    const amt = (toNum(r.ys) + toNum(r.sh)) * (x.vat === false ? 1 : 10 / 11);
    const k = x.subject === '임차료' ? '임차료' : x.subject === '복리후생비' ? '복리후생비' : '기타(월경비)';
    add(k, `${x.name}${x.vat === false ? '' : ' (공급가)'}`, amt);
  });
  pmPlItems(sid, ym).forEach(([k, label, amt]) => add(k, label, amt));   // 지출결의서로 나간 품의서 (14_pumui pmPlOn)
  // 같은 이름 항목 합치기
  Object.keys(det).forEach(k => { const g = {}; det[k].forEach(([l, a]) => g[l] = (g[l] || 0) + a); det[k] = Object.entries(g); });
  return { v, det };
}
/* 수익 항목: 판매 세대수·판매수수료금액은 고정, 나머지는 현장마다 [+ 수익 항목]으로 추가 (site.plRevItems = [{k, l}])
 * 아직 정하지 않은 현장은 예전 고정 항목(MGM·운영비 …) 중 값이 들어 있는 것만 보여 줌 */
function plRev(sid = db.cur) {
  const st = db.sites.find(x => x.id === sid) || {};
  let extra = st.plRevItems;
  if (!Array.isArray(extra)) { const pl = db.pl[sid] || {}; extra = PL_REV.slice(2).filter(([k]) => Object.values(pl).some(m => toNum((m || {})[k]))).map(([k, l]) => ({ k, l })); }
  return [...PL_REV.slice(0, 2), ...extra.map(x => [x.k, x.l])];
}
function plRevItems(st) {   // 처음 고칠 때 지금 보이는 항목으로 목록을 만들어 둠
  if (!Array.isArray(st.plRevItems)) st.plRevItems = plRev(st.id).slice(2).map(([k, l]) => ({ k, l }));
  return st.plRevItems;
}
function plMonth(sid, ym) {
  const man = (db.pl[sid] || {})[ym] || {};
  const auto = plAuto(sid, ym);
  const val = {}, isMan = {}, REV = plRev(sid);
  const bill = billPlAuto(sid, ym);   // 12b 매출 청구: 청구월 공급가 (손익 칸에 숫자가 있으면 그 값)
  REV.forEach(([k]) => { const has = man[k] !== undefined && man[k] !== '' && man[k] !== null; val[k] = has || k === 'units' ? toNum(man[k]) : (bill[k] || 0); });
  PL_EXP.forEach(([k, type]) => {
    const has = man[k] !== undefined && man[k] !== '' && man[k] !== null;
    val[k] = type === 'manual' ? toNum(man[k]) : (has ? toNum(man[k]) : (auto.v[k] || 0));
    isMan[k] = has && type !== 'manual';
  });
  const rev = sum(REV.filter(([k]) => k !== 'units'), ([k]) => val[k]);
  const exp = sum(PL_EXP, ([k]) => val[k]);
  return { val, auto, bill, isMan, man, rev, exp, profit: rev - exp };
}
function viewPl(bar = '') {   // bar = 14c 예산·손익 탭의 보기 전환 (머리 아래)
  const s = site(), year = state.ym.slice(0, 4);
  const inYm = String(s.inDate || '').slice(0, 7);   // 현장 투입일 이전 달은 표시하지 않음
  const months = Array.from({ length: 12 }, (_, i) => `${year}-${pad2(i + 1)}`).filter(ym => !inYm || ym >= inYm);
  const data = months.map(ym => plMonth(db.cur, ym));
  // 전년까지 누계
  const st0 = inYm && (!s.startYm || inYm > s.startYm) ? inYm : s.startYm;
  const start = st0 && st0 < `${year}-01` ? st0 : null;
  const prior = { rev: 0, exp: 0, val: {} };
  if (start) for (let x = start, n = 0; x < `${year}-01` && n < 120; x = ymAdd(x, 1), n++) {
    const d = plMonth(db.cur, x); prior.rev += d.rev; prior.exp += d.exp;
    Object.entries(d.val).forEach(([k, v]) => prior.val[k] = (prior.val[k] || 0) + v);
  }
  const total = toNum(s.totalUnits);
  const cell = (ym, k, d, type) => {
    const has = d.man[k] !== undefined && d.man[k] !== '' && d.man[k] !== null;
    const bv = type === 'rev' ? (d.bill || {})[k] : 0;   // 매출 청구 자동값 (세금계산서 발행분)
    const ph = type === 'manual' ? '' : type === 'rev' ? fmt0(bv) : fmt0(d.auto.v[k]);
    const memo = String((d.man.memo || {})[k] || '');   // 칸 메모 (오른쪽 클릭)
    const tip = [memo ? `메모: ${memo}` : '', type === 'pay' || type === 'auto' ? '비워두면 자동 계산값(회색) 사용. 숫자를 입력하면 그 값으로 고정(파란색)' : bv ? '매출 청구 탭의 이 달 청구분(공급가). 숫자를 입력하면 그 값으로 고정' : '', '오른쪽 클릭 = 메모'].filter(Boolean).join('\n');
    return `<td ${memo ? 'style="background:linear-gradient(225deg,var(--warn) 7px,transparent 7px)"' : ''}><input class="num ${has && type !== 'manual' && (type !== 'rev' || bv) ? 'ovr' : ''}" style="width:96px" value="${has ? fmt(d.man[k]) : ''}" placeholder="${ph}" data-ch="pl" data-ym="${ym}" data-k="${k}" data-fid="pl${ym}${k}" title="${esc(tip)}"></td>`;
  };
  const yearSum = k => sum(data, d => d.val[k]);
  const revRows = plRev().map(([k, l]) => `<tr><td class="lbl">${k === 'fee' ? '<b>수익</b>' : k === 'units' ? '<b>판매</b>' : ''}</td><td class="lbl">${k === 'units' ? esc(l) : `<a href="#" data-act="plBill" data-k="${esc(k)}" title="매출 청구 내역 (청구월 기준으로 그 달 수익에 자동)">${esc(l)}</a>`}${k !== 'units' && k !== 'fee' ? ` <button class="btn ghost sm" data-act="plRevDel" data-k="${esc(k)}" title="이 수익 항목 빼기">✕</button>` : ''}</td><td class="num muted">${fmt0(prior.val[k])}</td>${months.map((ym, i) => cell(ym, k, data[i], 'rev')).join('')}<td class="num"><b>${fmt0(yearSum(k))}</b></td><td class="num">${fmt0(yearSum(k) + (prior.val[k] || 0))}</td></tr>
      ${k === 'units' && total ? `<tr><td></td><td class="lbl muted">월별 분양률</td><td></td>${data.map(d => `<td class="num muted small">${d.val.units ? (d.val.units / total * 100).toFixed(1) + '%' : ''}</td>`).join('')}<td class="num small">${(yearSum('units') / total * 100).toFixed(1)}%</td><td></td></tr>
      <tr><td></td><td class="lbl muted">누적 분양률</td><td class="num muted small">${prior.val.units ? (prior.val.units / total * 100).toFixed(1) + '%' : ''}</td>${(() => { let acc = prior.val.units || 0; return data.map(d => { acc += d.val.units; return `<td class="num small">${acc && (d.rev || d.exp || d.val.units) ? (acc / total * 100).toFixed(1) + '%' : ''}</td>`; }).join(''); })()}<td></td><td class="num small"><b>${((yearSum('units') + (prior.val.units || 0)) / total * 100).toFixed(1)}%</b></td></tr>` : ''}`).join('');
  const expRows = PL_EXP.map(([k, type], i) => `<tr><td class="lbl">${i === 0 ? '<b>지출</b>' : ''}</td><td class="lbl">${type === 'manual' ? esc(k) : `<a href="#" data-act="plDetail" data-k="${esc(k)}" title="${monthNo(state.ym)}월 세부내역 보기">${esc(k)}</a>`}</td>
      <td class="num muted">${fmt0(prior.val[k])}</td>${months.map((ym, j) => cell(ym, k, data[j], type)).join('')}<td class="num"><b>${fmt0(yearSum(k))}</b></td><td class="num">${fmt0(yearSum(k) + (prior.val[k] || 0))}</td></tr>`).join('');
  const yRev = sum(data, d => d.rev), yExp = sum(data, d => d.exp);
  let acc = prior.rev - prior.exp;
  const sumRow = (label, f, py, cls = 'pl-sum') => `<tr class="${cls}"><td></td><td class="lbl">${label}</td><td class="num">${fmt0(py)}</td>${data.map(d => { const v = f(d); return `<td class="num ${v < 0 ? 'neg' : ''}">${fmt0(v)}</td>`; }).join('')}`;
  return `
    ${pageHead(`${year}년 현장 손익`, esc(s.fullName || s.name), BTN('exportPl', '엑셀로 저장'))}${bar}
    <div class="banner info small">회색 = 자동 계산 (수익은 매출 청구 탭의 청구월 기준) · 숫자를 넣으면 고정(파랑), 지우면 자동 · 항목 이름을 누르면 세부내역 · 칸 오른쪽 클릭 = 메모${total ? '' : ' · 총 세대수를 넣으면 분양률'}</div>
    <div class="tbl-wrap pl-wrap"><table class="t pl-tbl"><thead><tr><th colspan="2">구분</th><th>${start ? `~${Number(year) - 1}년 누계` : '이전 누계'}</th>${months.map(ym => `<th>${monthNo(ym)}월</th>`).join('')}<th>${year}년 합계</th><th>현장 누계</th></tr></thead><tbody>
    ${revRows}
    <tr><td></td><td class="lbl"><button class="btn ghost sm" data-act="plRevAdd" title="이 현장에만 있는 수익 항목 (예: MGM수수료, 운영비, 계약축하금)">+ 수익 항목</button></td><td colspan="${months.length + 3}"></td></tr>
    ${sumRow('수익 계', d => d.rev, prior.rev)}<td class="num">${fmt(yRev)}</td><td class="num">${fmt(yRev + prior.rev)}</td></tr>
    ${expRows}
    ${sumRow('지출 계', d => d.exp, prior.exp)}<td class="num">${fmt(yExp)}</td><td class="num">${fmt(yExp + prior.exp)}</td></tr>
    ${sumRow('<b>손익 (수익−지출)</b>', d => d.profit, prior.rev - prior.exp)}<td class="num ${yRev - yExp < 0 ? 'neg' : ''}">${fmt(yRev - yExp)}</td><td class="num ${yRev - yExp + prior.rev - prior.exp < 0 ? 'neg' : ''}">${fmt(yRev - yExp + prior.rev - prior.exp)}</td></tr>
    <tr class="sub"><td></td><td class="lbl">누적 손익</td><td></td>${data.map(d => { acc += d.profit; return `<td class="num ${acc < 0 ? 'neg' : ''}">${d.rev || d.exp ? fmt(acc) : ''}</td>`; }).join('')}<td></td><td></td></tr>
    </tbody></table></div>
    <div class="panel small" style="margin-top:12px"><b>현장 손익현황 작성기준 (세전금액 기준)</b>
      <ol style="margin:6px 0 0 18px;padding:0"><li>매출 — 청구월 기준 (매출 청구 탭)</li><li>인건비 — 당월 귀속분 정산 (익월 ${db.settings.payrollDay}일 결제분까지)</li><li>경비 — 당월 ${db.settings.monthlyPay}일 결제분 (결제일 기준 귀속월)</li><li>법인카드·전도금 — 당월 사용분 (입금은 빼고 지출만)</li><li>품의서 — 지출결의서로 나간 것 (자금집행일, 없으면 기안일자 기준 · 카드·전도금·인건비·월결제로 들어가는 품의는 제외)</li><li>조직수수료 — 결제일 기준 (익월 10일 결제분까지 포함)</li></ol></div>`;
}
function plMemo(el) {   // 손익 칸 오른쪽 클릭 → 메모 (db.pl[현장][달].memo[항목])
  const ym = el.dataset.ym, k = el.dataset.k, m = nest(db.pl, db.cur, ym), old = String((m.memo || {})[k] || '');
  const label = (plRev().find(x => x[0] === k) || [k, k])[1];
  const v = prompt(`${monthNo(ym)}월 ${label} 메모 (비우면 지움)`, old); if (v === null) return;
  const t = v.trim(); m.memo = m.memo || {}; if (t) m.memo[k] = t; else delete m.memo[k]; if (!Object.keys(m.memo).length) delete m.memo;
  save(); render();
}
const plMemoText = (k, months) => months.map(ym => { const t = (((db.pl[db.cur] || {})[ym] || {}).memo || {})[k]; return t ? `${monthNo(ym)}월 ${t}` : ''; }).filter(Boolean).join(' / ');
function exportPl() {
  const s = site(), year = state.ym.slice(0, 4), inYm = String(s.inDate || '').slice(0, 7);
  const months = Array.from({ length: 12 }, (_, i) => `${year}-${pad2(i + 1)}`).filter(ym => !inYm || ym >= inYm);
  const data = months.map(ym => plMonth(db.cur, ym));
  const a1 =[[`${s.name}현장 손익 (${year}년)`], ['구분', '항목', ...months.map(x => `${monthNo(x)}월`), '합계', '비고']];
  const total = toNum(s.totalUnits), pct = v => (total && v ? `${(v / total * 100).toFixed(1)}%` : '');
  plRev().forEach(([k, l]) => {
    a1.push([k === 'units' ? '판매' : '수익', l, ...data.map(d => d.val[k] || 0), sum(data, d => d.val[k]), plMemoText(k, months)]);
    if (k === 'units' && total) {   // 분양률 (설정 → 총 세대수)
      let acc = 0; for (let x = s.startYm || months[0], n = 0; x < months[0] && n < 120; x = ymAdd(x, 1), n++) acc += toNum(((db.pl[db.cur] || {})[x] || {}).units);
      a1.push(['', '월별 분양률', ...data.map(d => pct(d.val.units)), pct(sum(data, d => d.val.units)), `총 ${fmt(total)}세대`]);
      a1.push(['', '누적 분양률', ...data.map(d => { acc += toNum(d.val.units); return pct(acc); }), pct(acc), '']);
    }
  });
  a1.push(['', '수익 계', ...data.map(d => d.rev), sum(data, d => d.rev), '']);
  PL_EXP.forEach(([k]) => a1.push(['지출', k, ...data.map(d => d.val[k] || 0), sum(data, d => d.val[k]), plMemoText(k, months)]));
  a1.push(['', '지출 계', ...data.map(d => d.exp), sum(data, d => d.exp), '']);
  a1.push(['손익', '수익-지출', ...data.map(d => d.profit), sum(data, d => d.profit), '']);
  // 청구 집계 (매출 청구 탭): 수익 항목별 청구 계 · 세금계산서 발행(완료) · 미발행(예정) · 입금 · 미수 — 손익 마감 "집계표" 수익 쪽
  const bl = billAll(), bs = billSummary(bl);
  const a3 = [[`${s.name}현장 매출 청구 집계`], ['수익 항목', '청구 건수', '청구 계(공급가)', `${year}년 손익 반영`, '세금계산서 발행(완료)', '미발행(예정)', '입금(부가세 포함)', '미수(발행분)']];
  plRev().filter(([k]) => k !== 'units').forEach(([k, l]) => { const x = bs.find(y => y.k === k) || { n: 0, amt: 0, issued: 0, notYet: 0, paid: 0, recv: 0 }; a3.push([l, x.n, x.amt, sum(bl.filter(y => y.b.k === k && String(y.ym).startsWith(year)), y => toNum(y.b.amount)), x.issued, x.notYet, x.paid, x.recv]); });
  a3.push(['합계', sum(bs, x => x.n), sum(bs, x => x.amt), sum(bl.filter(y => String(y.ym).startsWith(year)), y => toNum(y.b.amount)), sum(bs, x => x.issued), sum(bs, x => x.notYet), sum(bs, x => x.paid), sum(bs, x => x.recv)]);
  const a2 = [[`${s.name}현장 손익 세부내역 (${year}년)`], ['구분', '세부 항목', ...months.map(x => `${monthNo(x)}월`), '합계']];   // 첫 줄 = 제목 (다른 시트와 같게)
  PL_EXP.forEach(([k, type]) => {
    if (type === 'manual') return;
    const labels = [...new Set(data.flatMap(d => (d.auto.det[k] || []).map(x => x[0])))];
    labels.forEach((l, i) => { const vals = data.map(d => ((d.auto.det[k] || []).find(x => x[0] === l) || [0, 0])[1]); a2.push([i === 0 ? k : '', l, ...vals, sum(vals)]); });
    a2.push(['', '소계(자동)', ...data.map(d => d.auto.v[k] || 0), sum(data, d => d.auto.v[k] || 0)]);
  });
  saveBook([[`${year}집계표`, sheet(a1, [8, 22, ...months.map(() => 13), 14, 40])], [`${year}세부내역`, sheet(a2, [16, 28, ...months.map(() => 12), 14])], ...(bl.length ? [['청구 집계', sheet(a3, [18, 9, 15, 15, 17, 14, 16, 14])]] : [])], `${year}년 ${s.name}현장 손익.xlsx`);
}
