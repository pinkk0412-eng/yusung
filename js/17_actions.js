/* 유성 현장 관리 프로그램 — 버튼 동작(ACT)·현장 합치기
 * (원래 app.js 의 화면 부분. 모든 js/*.js 는 같은 전역 공간을 공유하며 html 에 적힌 순서대로 읽힘) */
'use strict';


/* ================= 이벤트: 클릭 ================= */
const ACT = {
  cardIssue: el => { state.cardIssue = el.dataset.v || ''; render(); },
  cardCal: el => { state.cardCal = !!el.dataset.v; render(); },   // 법인카드 탭: [3일~익월2일(정산)] ↔ [1일~말일] 보기
  setSub: el => { state.setSub = el.dataset.v; render(); window.scrollTo(0, 0); },
  secSetup: () => secSetupDialog(false), secChange: () => secSetupDialog(true), secUnlock: () => secUnlockDialog(), secLock: () => secLock(), secOff: () => secDisable(),
  photoPpt: () => photoPpt(),
  helpGo: el => { const t = document.getElementById('help_' + el.dataset.v); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); },   // 10b 사용설명서 목차
  helpTab: el => { state.tab = el.dataset.tab; render(); window.scrollTo(0, 0); },
  helpPrint: () => { document.body.classList.add('help-print'); window.addEventListener('afterprint', () => document.body.classList.remove('help-print'), { once: true }); window.print(); },
  prepayDoc: () => prepayDialog(),   // 06 법인카드 선결제 지출결의서
  goto: (el, ev) => { if (ev && el.tagName === 'A') ev.preventDefault(); if (el.dataset.sub) state.setSub = el.dataset.sub; if (el.dataset.msub) state.mealSub = el.dataset.msub; if (el.dataset.csub) state.caterSub = el.dataset.csub; if (el.dataset.issue !== undefined) state.cardIssue = el.dataset.issue; else if (el.dataset.tab === 'card') state.cardIssue = ''; state.tab = el.dataset.tab; if (el.dataset.ym) state.ym = el.dataset.ym; render(); },
  switchSite: (el, ev) => { ev.preventDefault(); db.cur = el.dataset.id; save(); render(); },
  importCard: () => importCardFiles(),
  importCash: () => importCashFile(),
  addTx: el => {
    const src = el.dataset.src, ym = state.ym;
    const lastDate = (txOf(ym, src).map(t => t.date).sort().pop()) || (todayStr().startsWith(ym) ? todayStr() : `${ym}-01`);
    const t = { id: uid(), siteId: db.cur, src, kind: el.dataset.kind || 'out', date: lastDate, time: '', card: src === 'card' ? (state.cardFilter || (siteCards()[0] || {}).last4 || '') : '', merchant: '', amount: 0, cat: '', memo: el.dataset.kind === 'in' ? '전도금 입금' : '' };
    db.tx.push(t); save(); render();
    const inp = view.querySelector(`[data-fid="m${t.id}"]`); if (inp) inp.focus();
    return t;   // 빠른 입력(chip)이 새 줄을 만들 때 씀
  },
  qbSet: () => {   // 빠른 입력 버튼 고치기 — 이 PC 브라우저에만 저장 (04 qbOpt)
    const o = qbOpt() || { tpls: ['중식/', '석식/', '간식/'], names: true };
    modal('빠른 입력 버튼 (나만 쓰는 설정)', `<p class="small">한 줄에 버튼 하나씩 적으세요. 끝에 <b>/</b> 를 붙이면 말머리가 됩니다 (예: <b>중식/</b> → "중식/홍길동,김철수").<br>이 PC에서만 바뀌고, 다른 사람 화면에는 영향이 없습니다.</p>
      <textarea id="qbT" rows="8" style="width:100%;font:inherit;padding:8px;border:1px solid var(--line);border-radius:6px">${esc(o.tpls.join('\n'))}</textarea>
      <label class="small" style="display:block;margin-top:8px"><input type="checkbox" id="qbN" ${o.names !== false ? 'checked' : ''}> 직원 이름 버튼도 보이기 (설정 → 직원에서 "빠른입력" 체크한 사람)</label>`, [
      { label: '기본값으로', onClick: () => { qbSave(null); render(); toast('빠른 입력 버튼을 기본값으로 되돌렸습니다.'); } },
      { label: '취소' },
      { label: '저장', cls: 'primary', onClick: root => {
        const tpls = [...new Set($('#qbT', root).value.split('\n').map(x => x.trim()).filter(Boolean))];
        qbSave({ tpls, names: $('#qbN', root).checked }); render(); toast('빠른 입력 버튼을 저장했습니다 (이 PC).');
      } }], 's');
  },
  delTx: async el => { const t = db.tx.find(x => x.id === el.dataset.id); if (!t) return; const n = (t.receipts || []).length; if (!el.noAsk && !confirm(`삭제할까요?\n${t.date} ${t.merchant} ${fmt(t.amount)}원${n ? `\n(영수증 파일 ${n}개도 함께 삭제됩니다)` : ''}`)) return; for (const r of t.receipts || []) await removeFile(r); db.tx = db.tx.filter(x => x.id !== t.id); save(); render(); },
  delSelTx: async () => {   // 법인카드·전도금: 체크한 내역 한 번에 삭제
    const ids = new Set(state.cardSel || []), list = db.tx.filter(x => ids.has(x.id)); if (!list.length) return;
    const n = sum(list, t => (t.receipts || []).length);
    if (!confirm(`선택한 ${list.length}건을 삭제할까요?\n합계 ${fmt(sum(list, t => t.amount))}원${n ? `\n(영수증 파일 ${n}개도 함께 삭제됩니다)` : ''}`)) return;
    for (const t of list) for (const r of t.receipts || []) await removeFile(r);
    db.tx = db.tx.filter(x => !ids.has(x.id)); state.cardSel = new Set(); save(); render(); toast(`${list.length}건을 삭제했습니다.`);
  },
  autoCat: () => {
    let n = 0; const rules = parseMemoRules(db.settings.memoRules);
    txOf(state.ym, 'card').forEach(t => {
      if (applyMemoRule(t, rules)) n++;
      if (!t.cat) { const c = guessCat(t, db.merchantMap); if (c) { t.cat = c; n++; } }
      if (t.cat === '식대' && !t.memo && t.time) t.memo = Number(t.time.slice(0, 2)) < 15 ? '중식/' : '석식/';
    });
    save(); render(); toast(n ? `${n}건 자동 분류했습니다. 확인해 주세요.` : '자동으로 분류할 수 있는 내역이 없습니다.');
  },
  chip: el => {   // 사용내역 칸에 커서가 있으면 그 줄에, 없으면 새 지출(법인카드·전도금 탭)을 만들어 넣음 (칩 mousedown 은 18 에서 커서를 안 뺏게 막음)
    const ae = document.activeElement;
    let inp = ae && ae.dataset && ae.dataset.memo ? ae : null;
    if (!inp) {
      const src = state.tab === 'cash' ? 'cash' : state.tab === 'card' ? 'card' : '';
      if (!src) { toast('먼저 사용내역 칸을 클릭하세요.'); return; }
      const t = ACT.addTx({ dataset: { src, kind: 'out' } });
      inp = view.querySelector(`[data-fid="o${t.id}"]`); if (!inp) return;
    }
    const v = el.dataset.v; let cur = inp.value;
    if (v.endsWith('/')) {   // 말머리 칩 → 세목도 자동: 중식/·석식/ = 식대, 간식/ = 간식대 (00 CAT_ALIAS · 세목 이름 그대로도 됨). 비었거나 같은 묶음(복리후생비)일 때만 바꿈
      const p = v.slice(0, -1).trim(), cat = SUBS.includes(p) ? p : CAT_ALIAS[p], t = cat && db.tx.find(x => x.id === inp.dataset.id);
      if (t && t.kind !== 'in' && t.cat !== cat && (!t.cat || GROUP_OF[t.cat] === GROUP_OF[cat])) t.cat = cat;
    }
    if (v.endsWith('/')) cur = v + cur.replace(/^[^/]{1,6}\//, '');
    else cur = cur + (cur && !cur.endsWith('/') && !cur.endsWith(',') ? ',' : '') + v;
    inp.value = cur; inp.focus();
    inp.dispatchEvent(new Event('change', { bubbles: true }));
  },
  exportCard: () => exportCard(),
  printCard: () => modal('집계표 인쇄', `<p class="small">카드마다 <b>월별 사용집계표</b>(A4 세로) 한 장씩 인쇄합니다.</p>
      <label class="small"><input type="checkbox" id="pcDet" checked> 카드별 <b>사용내역 명세</b>(A4 가로)도 함께 인쇄 (집계표 바로 뒤)</label>`, [{ label: '취소' }, { label: '인쇄', cls: 'primary', onClick: root => { printCardDocs($('#pcDet', root).checked); } }], 's'),
  exportCash: () => exportCash(),
  cashClaimOpen: () => cashClaimDialog(),   // 07 전도금 신청 창 (금액 입력 · 인쇄 · 마감)
  mealSub: el => { state.mealSub = el.dataset.v; render(); },
  caterSub: el => { state.caterSub = el.dataset.v; render(); },   // 식대·캐터링 탭: 식대내역 / 캐터링
  mealGroup: el => { state.mealGroup = el.dataset.v; render(); },
  attPhotoPrint: () => printAttPhotos(),
  // 출근부 칸 클릭: 1 → 휴무 → 빈칸 만 (사진대체·체크누락·지각·0.5·직접 입력·지각 인정은 오른쪽 클릭 메뉴 08 attMenu)
  attCell: el => {
    const att = attOf(state.ym); const rec = att[el.dataset.sid] = att[el.dataset.sid] || {};
    const d = el.dataset.d, v = String(rec[d] ?? '');
    rec[d] = v === '' ? '1' : v === '1' ? '휴무' : v === '휴무' ? '' : '1';   // 사진대체·출장 등 다른 값은 → 1
    if (rec[d] === '') delete rec[d];
    const ok = att.__lateOk && att.__lateOk[el.dataset.sid];   // 값을 바꾸면 인정 표시도 지움
    if (ok) { delete ok[d]; if (!Object.keys(ok).length) delete att.__lateOk[el.dataset.sid]; }
    save(); render();
  },
  attFill: el => {
    const att = attOf(state.ym); const rec = att[el.dataset.sid] = att[el.dataset.sid] || {};
    for (let d = 1; d <= daysIn(state.ym); d++) { const wd = weekday(state.ym, d); if (rec[d] === undefined || rec[d] === '') rec[d] = wd === 0 || wd === 6 ? '휴무' : '1'; }
    save(); render();
  },
  addStaffName: el => { db.staff.push({ id: uid(), siteId: db.cur, name: el.dataset.v, team: '', title: '', active: true, kind: '현장' }); save(); render(); toast(`${el.dataset.v} 등록 (설정에서 구분/직책 입력)`); },
  caterWide: () => { state.caterWide = !state.caterWide; render(); },
  caterColsEdit: () => caterColsDialog(),
  caterSegAdd: () => {   // 달 중간 캐터링 업체 변경 (바뀐 날부터 새 업체·단가) — 기본: 이번 달이면 오늘, 아니면 16일
    const ym = state.ym, c = caterOf(ym), last = caterSegs(c).pop(), t = new Date(), cur = `${t.getFullYear()}-${pad2(t.getMonth() + 1)}`;
    const from = Math.min(daysIn(ym), Math.max(last.from + 1, ym === cur ? t.getDate() : 16, 2));
    (c.chg = c.chg || []).push({ from, name: '', lunchPrice: last.lunchPrice, snackPrice: last.snackPrice, vatEx: last.vatEx });
    save(); render(); toast(`${monthNo(ym)}/${from}부터 바뀐 업체 줄을 넣었습니다. 시작일·업체 이름·단가를 고치세요.`);
  },
  caterSegDel: el => { const c = caterOf(state.ym), g = caterSegs(c)[+el.dataset.k]; if (!g || !confirm(`${g.from}일부터 ${g.name || '바뀐 업체'} 줄을 삭제할까요? (그날부터 앞 업체 단가로 계산)`)) return; c.chg = (c.chg || []).filter(x => !(toNum(x.from) === g.from && (x.name || '') === g.name)); if (!c.chg.length) delete c.chg; save(); render(); },
  caterPlanFill: () => {   // 출근예정을 비워 둔 날 → 그날 소속별 실제출근
    const ym = state.ym, c = caterOf(ym), P = caterPeople(ym); let n = 0;
    for (let d = 1; d <= daysIn(ym); d++) {
      const r = c.days[d] = c.days[d] || {}, p = P.days[d];
      if (!p.planSum && p.actSum) { r.plan = { ...p.act }; n++; }
    }
    save(); render(); toast(n ? `${n}일 출근예정을 실제출근으로 채웠습니다.` : '채울 날이 없습니다.');
  },
  caterFill: () => {
    const ym = state.ym, c = caterOf(ym), P = caterPeople(ym); let n = 0;
    for (let d = 1; d <= daysIn(ym); d++) {
      const pc = P.days[d].eat;   // 외부 소속(직접 입력) 포함 · 알바·도우미 제공 안 함이면 빼고
      const r = c.days[d] = c.days[d] || {};
      if (pc && !toNum(r.l)) { r.l = pc; n++; }
    }
    save(); render(); toast(n ? `${n}일 주문 수량을 출근 인원으로 채웠습니다.` : '채울 날이 없습니다.');
  },
  importAtt: async () => {
    const files = await pickFile('.xls,.xlsx,.csv', true); if (!files.length) return;
    let rows = []; const grids = [];
    for (const f of files) {
      try {
        const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' });
        wb.SheetNames.forEach((name, i) => {
          if (((wb.Workbook || {}).Sheets || [])[i] && wb.Workbook.Sheets[i].Hidden) return;   // 숨긴 시트 제외
          const aoa = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: false, defval: '' });
          const r = parseAttendanceSheet(aoa);
          if (r.ok) { rows = rows.concat(r.rows); return; }
          if (/식대/.test(name)) return;   // 식대내역 표는 출근부가 아님
          const g = parseAttGrid(aoa); if (g.ok) grids.push({ ...g, sheet: name, file: f.name });
        });
      } catch (e) { toast(`${f.name}: 읽을 수 없습니다 (${e.message})`); }
    }
    if (!rows.length && grids.length) { importAttGrid(grids); return; }
    if (!rows.length) { toast('출근부(성명·1~31일) 또는 근태기록(일자·성명·출근) 머리글을 찾지 못했습니다.'); return; }
    // 사람별로 묶기 (아이디 우선)
    const people = new Map();
    rows.forEach(x => { const k = x.id || x.name; const p = people.get(k) || { key: k, id: x.id, name: x.name, rawName: x.rawName, dept: x.dept, rows: [], worked: 0 }; p.rows.push(x); if (x.inT || x.outT) p.worked++; if (x.dept) p.dept = x.dept; people.set(k, p); });
    const staffAll = siteStaff(true);
    const matchOf = p => staffAll.find(s => p.id && s.faceId === p.id) || staffAll.find(s => s.name === p.name && (!s.faceId || !p.id || s.faceId === p.id));
    const list = [...people.values()].map(p => ({ ...p, staff: matchOf(p), skip: !p.dept && !p.worked }));
    const unmatched = list.filter(p => !p.staff && !p.skip);
    const skipped = list.filter(p => !p.staff && p.skip);
    const dates = [...new Set(rows.map(x => x.date))].sort();
    const yms = [...new Set(dates.map(ymOf))];
    const body = `<p>${rows.length}건 · ${people.size}명 · ${dates[0]} ~ ${dates[dates.length - 1]} (${yms.map(ymLabel).join(', ')})</p>
        <p class="small">직원 목록과 연결됨: <b>${list.filter(p => p.staff).length}명</b>${skipped.length ? ` · 건너뜀(관리자 등 계정): ${skipped.map(p => esc(p.rawName)).join(', ')}` : ''}</p>
        ${unmatched.length ? `<h3>직원 목록에 없는 사람 ${unmatched.length}명</h3><p class="muted small">체크하면 직원으로 등록하고 출근을 반영합니다. 근태 아이디가 함께 저장되어 다음 달부터 자동으로 연결됩니다.</p>
        <div class="tbl-wrap" style="max-height:300px"><table class="t"><thead><tr><th><input type="checkbox" id="attAll" checked></th><th>근태 이름</th><th>등록 이름</th><th>구분(부서)</th><th>소속</th><th>출근일</th></tr></thead><tbody>
        ${unmatched.map((p, i) => `<tr><td class="center"><input type="checkbox" data-ureg="${i}" ${p.worked ? 'checked' : ''}></td><td>${esc(p.rawName)} <span class="muted small">${esc(p.id)}</span></td>
          <td><input data-uname="${i}" value="${esc(p.name)}"></td><td><input data-uteam="${i}" value="${esc(p.dept)}"></td>
          <td><select data-ukind="${i}"><option value="현장">현장 인건비</option><option value="정직원">유성 정직원</option></select></td><td class="num">${p.worked}</td></tr>`).join('')}</tbody></table></div>` : '<p class="banner ok small">모든 사람이 직원 목록과 연결되었습니다.</p>'}
        <div style="margin-top:10px" class="small">
          <label><input type="checkbox" id="attNote" checked> 출퇴근 시각 없이 <b>비고만 있는 날</b>(예: 홍보관/현장출퇴근)도 출근으로 인정</label><br>
          <label><input type="checkbox" id="attOff"> 기록이 있는 날짜 중 출근하지 않은 날은 "휴무"로 표시</label><br>
          <label><input type="checkbox" id="attOver"> 이미 손으로 입력한 칸도 덮어쓰기</label></div>`;
    modal('근태기록 불러오기', body, [{ label: '취소' }, {
      label: '출근부에 반영', cls: 'primary', onClick: root => {
        const noteOk = $('#attNote', root).checked, markOff = $('#attOff', root).checked, over = $('#attOver', root).checked;
        unmatched.forEach((p, i) => {
          if (!root.querySelector(`[data-ureg="${i}"]`).checked) return;
          const st = { id: uid(), siteId: db.cur, name: root.querySelector(`[data-uname="${i}"]`).value.trim() || p.name, team: root.querySelector(`[data-uteam="${i}"]`).value.trim(), title: '', active: true, kind: root.querySelector(`[data-ukind="${i}"]`).value, faceId: p.id };
          db.staff.push(st); p.staff = st;
        });
        let marked = 0, notes = 0;
        list.forEach(p => {
          if (!p.staff) return;
          if (p.id && !p.staff.faceId) p.staff.faceId = p.id;
          p.rows.forEach(x => {
            const ym = ymOf(x.date), d = Number(x.date.slice(8, 10));
            const att = nest(db.attendance, db.cur, ym);
            const rec = att[p.staff.id] = att[p.staff.id] || {};
            const has = rec[d] !== undefined && rec[d] !== '';
            const worked = !!(x.inT || x.outT) || (noteOk && !!x.note);
            if (has && !over && String(rec[d]) !== '휴무') { /* 손으로 입력한 값 유지 */ }
            else if (worked) { rec[d] = !x.inT && !x.outT && /사진/.test(x.note || '') ? ATT_PHOTO : '1'; marked++; if (!x.inT && !x.outT) notes++; }
            else if (markOff && !has) rec[d] = '휴무';
            if (x.inT || x.outT || x.note) nest(att, '__time', p.staff.id)[d] = `${x.inT || '--:--'} ~ ${x.outT || '--:--'}${x.note ? ' · ' + x.note : ''}`;
            if (x.ot) nest(att, '__ot', p.staff.id)[d] = Math.round(x.ot * 100) / 100;
          });
        });
        if (yms.length === 1) state.ym = yms[0];
        state.mealSub = 'att';
        save(); render(); toast(`출근 ${marked}건을 반영했습니다${notes ? ` (비고로 인정 ${notes}건)` : ''}`);
        // 아침에 어제·오늘 근태기록을 넣은 경우 → 바로 출퇴근보고 문구 (한 달치를 넣을 때는 열지 않음, [출퇴근보고 만들기]로 언제든)
        const last = dates[dates.length - 1];
        if (last && last >= repDateAdd(repToday(), -1) && last <= repToday()) setTimeout(() => repDialog(last), 0);
      }
    }]);
    const all = $('#attAll'); if (all) all.onchange = () => document.querySelectorAll('[data-ureg]').forEach(c => c.checked = all.checked);
  },
  exportMeal: () => exportMeal(),
  exportCater: () => exportMeal('cater'),   // 캐터링 탭: 주문대장 시트만
  payMealFill: () => {
    let n = 0;
    payRows(db.cur, state.ym, true).forEach(r => { if (r.s.kind !== '정직원' && toNum(r.rec.mealRate) && !toNum(r.rec.mealDays)) { r.rec.mealDays = r.c.workDays; n++; } });
    save(); render(); toast(n ? `${n}명 식대일수를 근무일수로 채웠습니다.` : '식대단가가 있고 식대일수가 빈 사람이 없습니다.');
  },
  payMealRate: () => {
    const rules = mealRules();
    if (!rules.length) { toast('출근부 → ⚙ 설정에서 식대 단가를 먼저 입력하세요.'); return; }
    const rows = payRows(db.cur, state.ym, true).filter(r => r.s.kind !== '정직원' && mealRateFor(r.s.team, rules) !== null && toNum(r.rec.mealRate) !== mealRateFor(r.s.team, rules));
    if (!rows.length) { toast('바꿀 사람이 없습니다 (이미 설정 단가와 같음).'); return; }
    if (!confirm(`${ymLabel(state.ym)} ${rows.length}명의 식대 단가를 설정값으로 바꿉니다.\n${rows.slice(0, 8).map(r => `${r.s.team || ''} ${r.s.name}: ${fmt(r.rec.mealRate)} → ${fmt(mealRateFor(r.s.team, rules))}`).join('\n')}${rows.length > 8 ? `\n외 ${rows.length - 8}명` : ''}\n(캐터링 공제 −10,000 처럼 직접 넣은 값도 바뀝니다)`)) return;
    rows.forEach(r => { const v = mealRateFor(r.s.team, rules); r.rec.mealRate = v; r.s.pay = r.s.pay || {}; r.s.pay.mealRate = v; });
    save(); render(); toast(`${rows.length}명 식대 단가를 바꿨습니다. 식대일수가 비어 있으면 [식대일수 채우기]를 누르세요.`);
  },
  payChange: el => payChangeDialog(el.dataset.id),   // 인건비: 달 중간 단가 변경 (11_pay)
  payInclude: el => { const r = ((db.payroll[db.cur] || {})[state.ym] || {})[el.dataset.id]; if (r) r.payType = '일급'; save(); render(); },
  exportPay: () => { if (payLocked()) { toast('비공개 급여가 들어가는 파일이라 관리자 모드에서만 저장할 수 있습니다.'); return; } exportPay(); },
  printPay: () => payLocked() ? toast('비공개 급여가 들어가는 자금청구서라 관리자 모드에서만 인쇄할 수 있습니다.') : docDialog('pay', `<label class="small"><input type="checkbox" id="pFund" checked> 자금청구서 (집계표)</label><br><label class="small"><input type="checkbox" id="pExp" checked> 지출결의서</label><br><label class="small"><input type="checkbox" id="pDet" checked> 세부내역서</label>`, (no, date, root) => {
    const ym = state.ym;
    const docs = [];
    if ($('#pFund', root).checked) docs.push(docPayClaim(ym, no, date));
    if ($('#pExp', root).checked) docs.push(payExpDoc(ym, date));
    if ($('#pDet', root).checked) docs.push(docPayDetail(ym));
    printDocs(docs);
  }),
  exportPl: () => exportPl(),
  assetAdd: () => assetDialog(),   // 12c 자산·집기
  assetEdit: el => { const a = assetsOf().find(x => x.id === el.dataset.id); if (a) assetDialog(a); },
  assetPaste: () => assetPasteDialog(),
  assetOut: el => assetOutDialog(el.dataset.k),
  assetPhotos: () => assetPhotoPrint(),
  pmAsset: el => { const f = pmFind(el.dataset.id); if (f) pmAssetDialog(f.x); },   // 품의서 대장 ⋯ → 자산 대장에 등록
  billAdd: () => billDialog(),   // 12b 매출 청구
  billEdit: (el, ev) => { if (ev.target.closest('.dd')) return; const x = billFind(el.dataset.id); if (x) billDialog(x); },   // 줄 클릭 (⋯ 메뉴는 빼고)
  billNext: el => { const x = billFind(el.dataset.id); if (x) billDialog(x, true); },
  billDel: el => { const x = billFind(el.dataset.id); if (!x || !confirm(`${billLabel(x.b.k)} ${x.b.round ? x.b.round + '차 ' : ''}청구를 삭제할까요?`)) return; const l = billList(db.cur, x.ym); l.splice(l.indexOf(x.b), 1); save(); render(); },
  exportBill: () => exportBill(),
  plBill: (el, ev) => { ev.preventDefault(); billPlDialog(el.dataset.k); },   // 현장 손익 수익 항목 → 매출 청구 내역
  plRevAdd: () => {
    const l = (prompt('추가할 수익 항목 이름 (이 현장에만 적용)\n예) MGM수수료, 운영비, 견본주택 공과금, 계약축하금') || '').trim(); if (!l) return;
    const list = plRevItems(site()), old = PL_REV.find(([, x]) => x === l);   // 예전 고정 항목 이름이면 그 자료를 그대로 이어 씀
    if (list.some(x => x.l === l)) { toast('이미 있는 항목입니다.'); return; }
    list.push({ k: old ? old[0] : 'rv_' + uid(), l }); save(); render();
  },
  plRevDel: el => {
    const st = site(), list = plRevItems(st), x = list.find(y => y.k === el.dataset.k); if (!x) return;
    const has = Object.values(db.pl[st.id] || {}).some(m => toNum((m || {})[x.k]));
    if (!confirm(`'${x.l}' 수익 항목을 뺄까요?${has ? '\n(입력해 둔 금액은 손익 합계에서 빠집니다)' : ''}`)) return;
    st.plRevItems = list.filter(y => y !== x); save(); render();
  },
  plDetail: (el, ev) => {
    ev.preventDefault();
    const k = el.dataset.k, d = plAuto(db.cur, state.ym);
    const list = d.det[k] || [];
    modal(`${ymLabel(state.ym)} ${k} 세부내역 (자동 계산)`, list.length ? `<div class="tbl-wrap"><table class="t"><thead><tr><th>항목</th><th>금액</th></tr></thead><tbody>${list.map(([l, a]) => `<tr><td>${esc(l)}</td><td class="num">${fmt(a)}</td></tr>`).join('')}<tr class="sum"><td>합계</td><td class="num">${fmt(d.v[k])}</td></tr></tbody></table></div>` : '<p class="muted">이 달에 해당 자료가 없습니다.</p>', [{ label: '닫기' }]);
  },
  vendorAdd: () => { const vs = db.vendors.filter(v => v.siteId === db.cur); db.vendors.push({ id: uid(), siteId: db.cur, subject: '', name: '', desc: '', ref: '', active: true, order: vs.length ? Math.max(...vs.map(v => v.order ?? 0)) + 1 : 0 }); save(); render(); },
  vendorMove: el => {
    const vs = vendorsFor(state.ym); const i = vs.findIndex(v => v.id === el.dataset.id); const j = i + Number(el.dataset.d);
    if (j < 0 || j >= vs.length) return; vs.forEach((v, k) => v.order = k); [vs[i].order, vs[j].order] = [vs[j].order, vs[i].order]; save(); render();
  },
  vendorOff: el => { const v = db.vendors.find(x => x.id === el.dataset.id); if (!confirm(`'${v.name || '(이름 없음)'}' 거래처를 목록에서 뺄까요?\n(지난달 기록은 남습니다)`)) return; v.active = false; const m = monthOf(db.cur, state.ym); delete m.rows[v.id]; save(); render(); },
  monthlyShToggle: () => { state.monthlySh = !state.monthlySh; render(); },
  monthlyView: el => { state.monthlyView = el.dataset.v; if (el.dataset.ym) state.ym = el.dataset.ym; render(); },   // 월결제: 월별 입력 ↔ 업체별 월 지출
  monthlyYShift: el => { state.monthlyYEnd = ymAdd(state.monthlyYEnd || state.ym, +el.dataset.d); render(); },
  copyPrevMonthly: () => {
    const m = monthOf(db.cur, state.ym), p = (db.monthly[db.cur] || {})[ymAdd(state.ym, -1)];
    if (!p) { toast('전월 자료가 없습니다.'); return; }
    let n = 0;
    vendorsFor(state.ym).forEach(v => { const pr = p.rows[v.id]; const r = m.rows[v.id] = m.rows[v.id] || {}; if (pr && !toNum(r.ys) && !toNum(r.sh)) { r.ys = pr.ys; r.sh = pr.sh; n++; } });
    save(); render(); toast(`${n}개 거래처 금액을 복사했습니다. 바뀐 금액만 고치세요.`);
  },
  copyPrevOne: el => {   // 거래처 하나만 전월 금액 불러오기
    const m = monthOf(db.cur, state.ym), pr = ((db.monthly[db.cur] || {})[ymAdd(state.ym, -1)] || { rows: {} }).rows[el.dataset.id];
    if (!pr) { toast('전월 금액이 없습니다.'); return; }
    const r = m.rows[el.dataset.id] = m.rows[el.dataset.id] || {}; r.ys = pr.ys; r.sh = pr.sh; delete r.caterAuto; r.caterManual = true;
    save(); render(); toast(`전월 금액 ${fmt(mTot(pr))}원을 불러왔습니다.`);
  },
  caterVendorAdd: el => {   // 새 캐터링 업체 → 월결제 거래처 (캐터링 연동 체크)
    const name = el.dataset.name, vs = db.vendors.filter(v => v.siteId === db.cur), old = vs.find(v => v.catering);
    db.vendors.push({ id: uid(), siteId: db.cur, subject: (old && old.subject) || '복리후생비', name, desc: (old && old.desc) || '캐터링', ref: '', active: true, catering: true, order: vs.length ? Math.max(...vs.map(v => v.order ?? 0)) + 1 : 0 });
    caterAutoApply(state.ym); save(); render(); toast(`거래처 '${name}'를 추가하고 캐터링 금액을 넣었습니다.${old && old.active !== false ? ` 예전 업체 '${old.name}'가 더 이상 안 쓰이면 ✕로 빼세요.` : ''}`);
  },
  toggleClose: () => { const m = monthOf(db.cur, state.ym);
    const bi = m.closed ? [] : bgMonthlyIssues(state.ym);   // 14c 예산: 초과·예산 외 거래처
    if (bi.length && !confirm(`예산 확인이 필요한 거래처가 ${bi.length}곳 있습니다:\n${bi.map(x => `· ${x.v.name || '(이름 없음)'} — ${x.w.t}`).join('\n')}\n\n품의 없이 마감할까요?`)) return;
    m.closed = !m.closed; save(); render(); toast(m.closed ? '마감했습니다.' : '마감을 해제했습니다.'); },
  exportMonthly: () => exportMonthly(),
  printMonthly: () => docDialog('monthly', `<label class="small"><input type="checkbox" id="pFund" checked> 자금청구서</label><br><label class="small"><input type="checkbox" id="pExp" checked> 지출결의서</label>`, (no, date, root) => {
    const ym = state.ym;
    const docs = [];
    if ($('#pFund', root).checked) docs.push(docFundClaim(ym, no, date));
    if ($('#pExp', root).checked) docs.push(monthlyExpDoc(ym, date));
    printDocs(docs);
  }),
  addStaff: () => {
    const names = $('#newStaff').value.split(/[,，\s]+/).map(x => x.trim()).filter(Boolean); const team = $('#newStaffTeam').value.trim();
    const existing = new Set(siteStaff(true).map(s => s.name));
    names.filter(n => !existing.has(n)).forEach(n => db.staff.push({ id: uid(), siteId: db.cur, name: n, team, title: '', active: true, kind: '현장' }));
    save(); render();
  },
  delStaff: el => { if (!confirm('직원을 삭제할까요? (출근부 기록도 보이지 않게 됩니다. 퇴사자는 "사용" 체크 해제를 권장)')) return; db.staff = db.staff.filter(s => s.id !== el.dataset.id); save(); render(); },
  addCard: () => { db.cards.push({ id: uid(), siteId: db.cur, last4: '', issuer: '', holder: '' }); save(); render(); },
  delCard: el => { if (!confirm('카드를 목록에서 삭제할까요? (사용 내역은 남습니다)')) return; db.cards = db.cards.filter(c => c.id !== el.dataset.id); save(); render(); },
  apprAdd: () => { site().approvers.push({ title: '', name: '' }); save(); render(); },
  apprDel: () => { site().approvers.pop(); save(); render(); },
  siteAdd: () => folderDialog('새 현장 추가', '회사에서 만들어 둔 <b>현장 폴더</b>를 고르세요. 자료는 그 폴더 안(A. 기안품의 · B. 자금관련 …)에 저장됩니다.', '',
    (f, nm) => { const s = newSite(nm); s.folder = f; db.sites.push(s); db.cur = s.id; save(); render(); toast(`'${nm}' 현장을 추가했습니다 → 📁 ${f}`); }, true),
  siteCopy: () => {
    const src = site();
    folderDialog('현재 현장 설정 복사해서 새 현장', `<b>${esc(src.name)}</b>의 결재라인·거래처 목록을 복사합니다. 새 현장의 회사 폴더를 고르세요.`, '', (f, nm) => {
      const s = { ...JSON.parse(JSON.stringify(src)), id: uid(), name: nm, fullName: '', folder: f };
      delete s.sec; delete s.secretBlob;   // 관리자 비밀번호·암호문은 현장별 → 복사하지 않음 (새 현장은 잠금 없음)
      db.sites.push(s);
      db.vendors.filter(v => v.siteId === src.id && v.active !== false).forEach(v => db.vendors.push({ ...v, id: uid(), siteId: s.id }));
      db.cur = s.id; save(); render(); toast('결재라인·거래처 목록을 복사했습니다.');
    });
  },
  siteRelink: () => {
    const s = site();
    folderDialog(`'${s.name}' 현장 폴더 ${s.folder ? '바꾸기' : '연결'}`, s.folder ? `지금 폴더: 📁 <b>${esc(s.folder)}</b><br>새 폴더를 고르면 지금 폴더의 자료·영수증을 그 폴더로 복사하고 연결을 옮깁니다.` : '이 현장의 자료를 저장할 회사 현장 폴더를 고르세요.', s.name, (f, nm) => linkSite(s, f, nm));
  },
  dedupe: () => dedupeDialog(),
  storage: () => storageDialog(),
  pmAdd: () => pmNewDialog(),  pmLink: el => { const f = pmFind(el.dataset.id); if (!f) return; const tp = pmTpl(f.x.tpl); if (tp && ['staff', 'rate'].includes(tp.link) && !isAdmin()) { toast('급여 단가가 들어가는 반영이라 관리자 모드에서 하세요.'); return; } pmLinkDialog(f.x); },
  pmSync: () => pmSyncFolder(false),
  pmEdit: (el, ev) => { if (ev) ev.preventDefault(); const f = pmFind(el.dataset.id); if (!f) return; if (f.x.kind === 'excel') pmFileInfo(f.x); else pmEditor(f.x); },
  pmPrint: async el => { const f = pmFind(el.dataset.id); if (!f) return; if (f.x.kind === 'excel') { pmFileInfo(f.x); return; } if (f.x.kind !== 'general') { pmEditor(f.x); return; } if (await pmPrintDoc(f.x) === false) return; if (f.x.status === '작성중') { f.x.status = '결재중'; save(); render(); pmFileSync(f.x.id); } },   // 인쇄 = 작성 끝 → 엑셀을 C. 작성완료로
  pmNext: el => { const f = pmFind(el.dataset.id); if (!f) return; if (f.x.kind === 'excel') pmNextExcel(f.x); else pmNextRound(f.x); },
  pmDel: async el => { const f = pmFind(el.dataset.id); if (!f) return; if (!confirm(`${f.x.no}번 "${f.x.title}" 품의를 대장에서 삭제할까요?${(f.x.scans || []).length || f.x.file || f.x.xlFile ? '\n(엑셀·스캔본 파일도 함께 삭제)' : ''}`)) return; for (const r of [...(f.x.scans || []), ...(f.x.file ? [f.x.file] : []), ...(f.x.xlFile ? [f.x.xlFile] : [])]) await removeFile(r); f.list.splice(f.list.indexOf(f.x), 1); save(); render(); },
  pmScanAdd: async el => {
    const f = pmFind(el.dataset.id); if (!f || !FS.ready) return;
    const files = await pickFile('image/*,.pdf', true); if (!files.length) return;
    const it = f.x; it.scans = it.scans || [];
    const dir = pmScanDir(it);
    let saved = 0;
    try { for (const file of files) { it.scans.push(await storeFile(parts(dir), pmScanName(it), file)); saved++; } }
    catch (e) { save(); render(); toast(`스캔본 ${saved}개만 저장했고 나머지는 저장하지 못했습니다: ${e.message}`); return; }
    it.status = '결재완료'; it.scanExceptionReason = ''; save(); render(); toast(`스캔본 ${saved}개 저장 → 결재완료 (폴더: ${site().folder}/${dir})`);
  },
  pmScanView: el => { const f = pmFind(el.dataset.id); if (!f) return; const it = f.x, k = el.dataset.k;
    showFiles(`${it.no}번 ${it.title} — ${k === 'done' ? '결재본' : '스캔본'}`, k ? pmScansOf(it, k) : (it.scans || []),async rel => { await removeFile(rel); it.scans = it.scans.filter(r => r !== rel); save(); render(); },
      async () => {
        const files = await pickFile('image/*,.pdf', true); if (!files.length) return;
        try { for (const file of files) it.scans.push(await storeFile(parts(pmScanDir(it)), pmScanName(it), file)); }
        catch (e) { save(); render(); toast('스캔본을 저장하지 못했습니다: ' + e.message); return; }
        it.status = '결재완료'; it.scanExceptionReason = ''; save(); render(); toast(`스캔본 ${files.length}개를 저장하고 결재완료로 바꿨습니다.`);
      }); },
  pmExport: () => pmExport(),
  pmPl: el => { const f = pmFind(el.dataset.id); if (f) pmPlDialog(f.x); },
  siteMerge: async () => {
    const fromId = $('#mergeFrom').value, from = db.sites.find(x => x.id === fromId), to = site(); if (!from) return;
    if (!confirm(`'${from.name}' 현장의 모든 자료(내역 ${db.tx.filter(t => t.siteId === fromId).length}건, 영수증 포함)를 '${to.name}' 현장으로 옮깁니다.\n옮긴 뒤 '${from.name}' 현장은 없어집니다 (폴더와 영수증 원본은 남음). 계속할까요?`)) return;
    toast('합치는 중…');
    const r = await mergeSiteInto(fromId, to.id);
    toast(`'${from.name}' 현장을 '${to.name}' 현장으로 합쳤습니다${r.copied ? ` · 영수증 ${r.copied}개 이동` : ''}${r.failed ? ` · 파일 ${r.failed}개 실패(옛 폴더 '${r.folder}'를 남겨 둠)` : ''}`);
  },
  siteDel: () => {
    if (db.sites.length < 2) { toast('현장이 하나뿐이라 삭제할 수 없습니다.'); return; }
    const s = site(); if (prompt(`'${s.name}' 현장의 모든 자료가 삭제됩니다. 확인을 위해 현장 약칭을 입력하세요.`) !== s.name) return;
    removeSiteData(s.id); db.sites = db.sites.filter(x => x.id !== s.id); db.cur = db.sites[0].id;
    if (s.folder && confirm(`'${s.folder}' 폴더의 프로그램 자료 파일(현장설정·월별 데이터)도 삭제할까요?\n회사 폴더와 영수증·서류 파일은 그대로 둡니다.\n[취소]를 누르면 자료 파일도 남겨둡니다(다시 불러오면 현장이 되살아납니다).`)) unlinkFolder(s.folder);
    save(); render();
  },
  backup: () => download(`유성 현장 관리_전체백업_${todayStr()}.json`, JSON.stringify(db)),
  exportSite: () => download(`유성 현장 관리_${site().name}현장_${todayStr()}.json`, JSON.stringify(siteSubset(db.cur))),
  importSite: async () => {
    const [f] = await pickFile('.json'); if (!f) return;
    try { const data = JSON.parse(await f.text()); mergeSites.skipped = 0; const n = mergeSites(data);
      if (mergeSites.skipped) { const sk = mergeSites.skipped; const emptyNew = data.sites.filter(s => !db.tx.some(t => t.siteId === s.id)); emptyNew.forEach(s => { removeSiteData(s.id); db.sites = db.sites.filter(x => x.id !== s.id); }); if (!db.sites.find(x => x.id === db.cur)) db.cur = db.sites[0].id; save(); render(); toast(`이미 들어와 있는 내역 ${sk}건은 건너뛰었습니다${emptyNew.length ? ' (새로 넣을 자료가 없어 현장을 만들지 않음)' : ''}.`); return; } if (data.sites && data.sites[0]) db.cur = data.sites[0].id; save(); render(); toast(`${n}개 현장 자료를 합쳤습니다. (상단 "현장"에서 전환)`); }
    catch (e) { toast('파일을 읽을 수 없습니다: ' + e.message); }
  },
  restore: async () => {
    const [f] = await pickFile('.json'); if (!f) return;
    try { const data = JSON.parse(await f.text()); if (!data.sites) throw new Error('이 프로그램의 백업 파일이 아닙니다'); if (!confirm('데이터 폴더의 자료를 이 백업 내용으로 바꿉니다. 계속할까요?')) return; db = data; normalizeDb(); save(); render(); toast('복원했습니다.'); }
    catch (e) { toast('파일을 읽을 수 없습니다: ' + e.message); }
  },
  fsPick: () => pickRoot(),
  rcPick: () => rcPick(),
  rcReopen: () => rcReopen(),
  rcOff: () => rcOff(),
  rcMove: () => { if (confirm('드롭박스에 있는 영수증·증빙·입고사진을 영수증 폴더로 옮깁니다 (큰 사진은 줄여서). 옮긴 파일은 드롭박스에서 지워집니다. 계속할까요?')) rcMove(); },
  fsReopen: () => reopenRoot(),
  fsReload: async () => { if (FS.dirty && !confirm('저장되지 않은 변경이 있을 수 있습니다. 폴더에서 다시 불러올까요?')) return; await openRoot(FS.root); toast('폴더에서 다시 불러왔습니다.'); },
  fsForce: async () => { if (!confirm('다른 PC에서 고친 내용을 지우고 이 화면의 내용으로 덮어씁니다. 계속할까요?')) return; FS.conflict.forEach(p => { FS.mtime.delete(p); FS.written.delete(p); }); FS.conflict = []; await flush(); render(); },
  ocrRc: el => ocrReceipts(el.dataset.src),
  aiSave: () => { aiCfg.key = ($('#aiKey').value || '').trim(); aiCfg.model = $('#aiModel').value; render(); toast(aiCfg.key ? 'AI 인식 설정을 저장했습니다.' : 'API 키를 삭제했습니다. 오프라인 인식을 사용합니다.'); },
  aiClear: () => { aiCfg.key = ''; render(); toast('API 키를 삭제했습니다.'); },
  aiTest: async () => { const k = ($('#aiKey').value || '').trim(); if (k) { aiCfg.key = k; aiCfg.model = $('#aiModel').value; } const r = await aiTest(); toast(r === 'ok' ? '연결 성공 — AI 인식을 사용할 수 있습니다.' : r); render(); },
  rcAdd: async el => { const t = db.tx.find(x => x.id === el.dataset.id); const files = await pickFile('image/*,.pdf', true); if (t && files.length) addReceipts(t, files); },
  rcView: el => { const t = db.tx.find(x => x.id === el.dataset.id); if (t) viewReceipts(t); },
  rcPrint: el => printReceipts(el.dataset.src),
  // 경영지원 점검: 사용내역 · 식대 초과 · 캐터링 중복 · 입고사진 · 20만원 이상
  txWarnOk: el => { const t = txById(el.dataset.id); if (t) { t.warnOk = true; save(); render(); } },
  txOver: el => { const t = txById(el.dataset.id), m = t && mealInfo(t); if (!m) return; const v = prompt(`식대 초과 사유를 적으세요\n${t.date} ${t.merchant} ${fmt(t.amount)}원 · ${m.count}명 · 1인 ${fmt(m.share)}원 (식대 단가 합계 ${fmt(m.limit)}원 → ${fmt(m.overAmt)}원 초과)\n예) 야근 석식 / 손님 동석 / 메뉴 단가 인상`, t.overReason || ''); if (v === null) return; t.overReason = v.trim(); save(); render(); },
  txCater: el => { const t = txById(el.dataset.id); if (!t) return; const v = prompt('캐터링 중식을 주문한 날의 법카·전도금 중식입니다.\n같은 사람이 두 번 먹지 않았는지 확인하고 사유를 적으세요\n예) 외근으로 캐터링 미취식 / 캐터링 인원에서 제외', t.caterOk || ''); if (v === null) return; t.caterOk = v.trim(); save(); render(); },
  photoAdd: async el => {
    const t = txById(el.dataset.id); if (!t || !FS.ready) return;
    const files = await pickFile('image/*,.pdf', true); if (!files.length) return;
    const ym = txYm(t) || state.ym; t.photos = t.photos || [];
    try { for (const f of files) t.photos.push(await storeFile([...parts(monthPath(ym)), '입고사진'], `${t.date.replace(/-/g, '')}_${safeName(t.merchant || '입고').replace(/ /g, '').slice(0, 16)}_입고`, f)); } catch (e) { toast('사진을 저장하지 못했습니다: ' + e.message); }
    t.photoNa = false; save(); render(); toast(`입고 사진 ${files.length}장을 저장했습니다.`);
  },
  photoView: el => { const t = txById(el.dataset.id); if (!t) return;
    showFiles(`입고 사진 — ${t.date} ${t.merchant || ''}`, t.photos || [], async rel => { await removeFile(rel); t.photos = (t.photos || []).filter(r => r !== rel); save(); render(); }, () => ACT.photoAdd(el)); },
  photoNa: el => { const t = txById(el.dataset.id); if (t) { t.photoNa = !t.photoNa; save(); render(); } },
  photoPrint: () => printPhotos(),
  u200Edit: el => { const t = txById(el.dataset.id); if (t) u200Dialog(t); },
  u200One: el => { const t = txById(el.dataset.id); if (!t) return; if (!u200Done(t) && !confirm(`사용목적·참석자가 비어 있습니다.\n${t.date.slice(5)} ${t.merchant} ${fmt(t.amount)}원\n\n그대로 인쇄할까요?`)) return; printU200([t]); },   // 법인카드 탭 아래 20만원↑ 목록: 한 건만 인쇄
  repOpen: () => repDialog(repDefaultDate()),
  homeDay: el => { state.homeDay = el.dataset.d; state.ym = el.dataset.d.slice(0, 7); render(); },   // 업무 홈 달력 날짜 선택 · 다른 달 날짜(밀린 일)면 작업월도 그 달로
  repToggle: el => { const o = nest(db.done, db.cur, el.dataset.ym); o[el.dataset.key] = !o[el.dataset.key]; save(); render(); },
  // 월결제 증빙 파일 · 점검 메모
  mckFile: async el => {
    const v = db.vendors.find(x => x.id === el.dataset.id); if (!v || !FS.ready) return;
    const files = await pickFile('', true); if (!files.length) return;
    const r = monthOf(db.cur, state.ym).rows[v.id] = monthOf(db.cur, state.ym).rows[v.id] || {}; r.files = r.files || [];
    try { for (const f of files) r.files.push(await storeFile([...parts(monthPath(state.ym)), '증빙', '월결제'], `${safeName(v.name || '거래처')}_${safeName(f.name.replace(/\.[^.]+$/, '')).slice(0, 20)}`, f)); } catch (e) { toast('저장하지 못했습니다: ' + e.message); }
    save(); render(); toast(`${v.name} 증빙 ${files.length}개를 저장했습니다.`);
  },
  mckView: el => { const v = db.vendors.find(x => x.id === el.dataset.id); const r = (monthOf(db.cur, state.ym).rows || {})[el.dataset.id]; if (!v || !r) return;
    showFiles(`${v.name} — ${ymLabel(state.ym)} 증빙`, r.files || [], async rel => { await removeFile(rel); r.files = (r.files || []).filter(x => x !== rel); save(); render(); }, () => ACT.mckFile(el)); },
  mckText: () => {
    const txt = monthlyCheckText(state.ym);
    const root = modal('경비 점검 메모', `<p class="small">경영지원이 매달 묻는 "&lt;n월 경비&gt; 1. … 2. …" 형식입니다. 복사해 메신저에 붙여넣거나, 누락을 먼저 채우세요.</p><textarea id="mckT" rows="12" class="inp">${esc(txt)}</textarea>`, [{ label: '닫기' }, { label: '복사', cls: 'primary', onClick: async r => { const ta = $('#mckT', r); ta.select(); try { await navigator.clipboard.writeText(ta.value); toast('복사했습니다.'); } catch (e) { document.execCommand && document.execCommand('copy'); toast('선택했습니다. Ctrl+C로 복사하세요.'); } return true; } }]);
    modalSize(root, 'm');
  },
  signSet: () => signSet(),
  signClear: () => { if (!confirm(`${site().name}현장 서명을 삭제할까요?`)) return; delete site().sign; try { localStorage.removeItem(signKey()); } catch (e) { } save(); render(); },
  closeAdd: () => { const v = ($('#closeNew') || {}).value; if (!v || !v.trim()) return; const s = site(); s.closeCustom = s.closeCustom || []; s.closeCustom.push({ id: uid(), label: v.trim() }); save(); render(); },
  closeDel: el => { const s = site(); s.closeCustom = (s.closeCustom || []).filter(c => c.id !== el.dataset.id); if (s.closeList) delete s.closeList['c:' + el.dataset.id]; save(); render(); },
  attAdd: async el => { const files = await pickFile('', true); if (files.length) addAttach(state.ym, el.dataset.kind, files); },
  attView: el => {
    const ym = state.ym, list = attachOf(ym).filter(a => a.kind === el.dataset.kind);
    showFiles(`${ymLabel(ym)} 증빙 파일`, list.map(a => a.rel), async rel => { await removeFile(rel); db.attach[db.cur][ym] = attachOf(ym).filter(a => a.rel !== rel); save(); render(); },
      async () => { const files = await pickFile('', true); if (files.length) addAttach(ym, el.dataset.kind, files); });
  },
};
Object.assign(ACT, BG_ACT);   // 14c 예산 버튼
Object.assign(ACT, MB_ACT);   // 10c 휴대폰 영수증 앱

function siteSubset(sid) {
  const pick = o => (o[sid] ? { [sid]: o[sid] } : {});
  return {
    version: 1, kind: 'site', settings: db.settings, sites: db.sites.filter(s => s.id === sid), cur: sid,
    cards: db.cards.filter(x => x.siteId === sid), staff: db.staff.filter(x => x.siteId === sid), tx: db.tx.filter(x => x.siteId === sid), vendors: db.vendors.filter(x => x.siteId === sid),
    monthly: pick(db.monthly), attendance: pick(db.attendance), catering: pick(db.catering), cashClaim: pick(db.cashClaim), done: pick(db.done), docs: pick(db.docs), payroll: pick(db.payroll), pl: pick(db.pl), attach: pick(db.attach), pumui: pick(db.pumui || {}), fuel: pick(db.fuel || {}), billing: pick(db.billing || {}), merchantMap: db.merchantMap,
  };
}
/* 다른 현장(from)의 자료를 이 현장(to)으로 합치기 — 내역·카드·직원·거래처·월별 자료·영수증 파일까지 옮기고 from 현장은 없앰 */
async function mergeSiteInto(fromId, toId) {
  const from = db.sites.find(x => x.id === fromId), to = db.sites.find(x => x.id === toId);
  if (!from || !to || from === to) return;
  if (!isAdmin(fromId) || !isAdmin(toId)) { toast(`잠긴 현장(${[from, to].filter(x => !isAdmin(x.id)).map(x => x.name).join(', ')})이 있습니다. 두 현장 관리자 잠금을 먼저 푸세요 (비공개 급여·손익이 빠지지 않도록).`); return; }
  // 1) 영수증·증빙 파일 복사 (from 폴더 → to 폴더, 같은 이름이 있으면 _2 붙임)
  const relMap = {}; let copied = 0, failed = 0;
  const rels = new Set();
  db.tx.filter(t => t.siteId === fromId).forEach(t => (t.receipts || []).forEach(r => rels.add(r)));
  Object.values((db.attach[fromId]) || {}).forEach(list => (list || []).forEach(a => rels.add(a.rel)));
  for (const rel of rels) {
    try {
      const f = await (await fileAt(`${from.folder}/${rel}`, false)).getFile();
      const parts = rel.split('/'), name = parts.pop(), dir = await dirAt([to.folder, ...parts]);
      const dot = name.lastIndexOf('.'), base = dot > 0 ? name.slice(0, dot) : name, ext = dot > 0 ? name.slice(dot) : '';
      let nm = name, i = 2; for (; ;) { try { await dir.getFileHandle(nm); nm = `${base}_${i++}${ext}`; } catch (e) { break; } }
      const h = await dir.getFileHandle(nm, { create: true }); const w = await h.createWritable(); await w.write(f); await w.close();
      relMap[rel] = [...parts, nm].join('/'); copied++;
    } catch (e) { failed++; }
  }
  // 2) 카드·직원(같은 이름은 하나로)·거래처·내역 옮기기
  db.cards.filter(c => c.siteId === fromId).forEach(c => { if (db.cards.some(x => x.siteId === toId && x.last4 === c.last4)) db.cards = db.cards.filter(x => x !== c); else c.siteId = toId; });
  const staffMap = {};
  db.staff.filter(p => p.siteId === fromId).forEach(p => { const same = db.staff.find(x => x.siteId === toId && x.name === p.name); if (same) { staffMap[p.id] = same.id; db.staff = db.staff.filter(x => x !== p); } else p.siteId = toId; });
  db.vendors.filter(v => v.siteId === fromId).forEach(v => { v.siteId = toId; });
  db.tx.filter(t => t.siteId === fromId).forEach(t => { t.siteId = toId; if (t.receipts) t.receipts = t.receipts.map(r => relMap[r] || r); });
  // 3) 월별 자료: 그 달에 to 자료가 없으면 그대로, 둘 다 있으면 합침 (같은 항목은 to 쪽 우선)
  const remapStaff = o => { if (!o || typeof o !== 'object') return o; const n = {}; Object.entries(o).forEach(([k, v]) => { n[staffMap[k] || k] = v; }); return n; };
  for (const k of MONTH_KEYS) {
    const src = (db[k] || {})[fromId]; if (!src) continue;
    const dst = nest(db[k], toId);
    Object.entries(src).forEach(([ym, v]) => {
      if (k === 'attach') v = (v || []).map(a => ({ ...a, rel: relMap[a.rel] || a.rel, name: (relMap[a.rel] || a.rel).split('/').pop() }));
      if (k === 'attendance' || k === 'payroll') v = remapStaff(v);
      if (dst[ym] === undefined) { dst[ym] = v; return; }
      if (Array.isArray(dst[ym])) dst[ym] = dst[ym].concat(v || []);
      else if (k === 'monthly') { dst[ym].rows = Object.assign({}, (v || {}).rows, dst[ym].rows); }
      else if (typeof dst[ym] === 'object') dst[ym] = Object.assign({}, v, dst[ym]);
    });
    delete db[k][fromId];
  }
  // 4) 현장 정보: 이 현장에 비어 있는 칸만 채움
  Object.entries(from).forEach(([k, v]) => { if (['id', 'name', 'folder', 'approvers'].includes(k)) return; if (to[k] === undefined || to[k] === '' || to[k] === null || (k === 'cardStartDay' && (!to[k] || to[k] === 1))) to[k] = v; });
  if (from.startYm && (!to.startYm || from.startYm < to.startYm)) to.startYm = from.startYm;
  if (!(to.approvers || []).some(a => a.name) && (from.approvers || []).some(a => a.name)) to.approvers = from.approvers;
  db.sites = db.sites.filter(x => x !== from); db.cur = toId;
  // 5) from 폴더 정리 (복사 실패가 없을 때만 지움 — 남아 있으면 다시 불러올 때 현장이 되살아나므로)
  let removed = false;
  if (from.folder && !failed) { await unlinkFolder(from.folder); removed = true; }   // 회사 폴더는 지우지 않고 프로그램 자료 파일만
  save(); render();
  return { copied, failed, removed, folder: from.folder };
}
function removeSiteData(sid) {
  for (const k of ['cards', 'staff', 'tx', 'vendors']) db[k] = db[k].filter(x => x.siteId !== sid);
  for (const k of MONTH_KEYS) delete db[k][sid];
}
function mergeSites(data) {
  if (!data || !Array.isArray(data.sites)) throw new Error('이 프로그램에서 내보낸 파일이 아닙니다');
  data.sites.forEach(s => {
    removeSiteData(s.id);
    db.sites = db.sites.filter(x => x.id !== s.id); db.sites.push(s);
    for (const k of ['cards', 'staff', 'tx', 'vendors']) (data[k] || []).filter(x => x.siteId === s.id).forEach(x => {
      if (k === 'tx' && x.id && db.tx.some(t => t.id === x.id)) { mergeSites.skipped = (mergeSites.skipped || 0) + 1; return; }   // 이미 다른 현장으로 합쳐 둔 내역
      db[k].push(x);
    });
    for (const k of MONTH_KEYS) if (data[k] && data[k][s.id]) db[k][s.id] = data[k][s.id];
  });
  Object.entries(data.merchantMap || {}).forEach(([k, v]) => { if (!db.merchantMap[k]) db.merchantMap[k] = v; });
  // 첫 실행 때 자동으로 생긴 빈 현장 정리
  db.sites = db.sites.filter(s => !(s.name === '새 현장' && !s.fullName && !db.tx.some(t => t.siteId === s.id) && data.sites.every(d => d.id !== s.id) && db.sites.length > 1));
  if (!db.sites.find(s => s.id === db.cur)) db.cur = data.sites[0].id;
  return data.sites.length;
}
