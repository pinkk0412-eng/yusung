/* 유성 현장 관리 프로그램 — 설정 화면
 * (원래 app.js 의 화면 부분. 모든 js/*.js 는 같은 전역 공간을 공유하며 html 에 적힌 순서대로 읽힘) */
'use strict';


/* ================= 설정 ================= */
const SET_SECS = [['site', '현장 정보·결재'], ['staff', '직원·카드'], ['rule', '정산 기한'], ['ai', '영수증 AI'], ['mb', '휴대폰 앱'], ['sec', '관리자 잠금'], ['close', '현장 철수'], ['data', '현장·데이터 관리']];
function viewSettings() {
  const parts = settingsHtml().split(/<!--S:(\w+)-->/), cur = state.setSub || 'site', by = {};
  for (let i = 1; i < parts.length; i += 2) by[parts[i]] = (by[parts[i]] || '') + parts[i + 1];
  return `${pageHead('설정', esc(site().name) + '현장')}<div class="subtabs setnav">${SET_SECS.map(([k, l]) => `<button class="${k === cur ? 'active' : ''}" data-act="setSub" data-v="${k}">${l}${k === 'sec' && secOn() ? (isAdmin() ? ' 🔓' : ' 🔒') : ''}</button>`).join('')}</div>${by[cur] || ''}`;
}
function settingsHtml() {
  const s = site(), st = db.settings;
  const cards = siteCards(), staff = siteStaff(true);
  const f = (label, key, ph = '') => `<label>${label}<input value="${esc(s[key] ?? '')}" data-ch="site" data-f="${key}" data-fid="s_${key}" placeholder="${esc(ph)}"></label>`;
  return `
<!--S:site-->
    <div class="panel"><h3 style="margin-top:0">현장 정보 — ${esc(s.name)}</h3>
      <div class="form-grid">
        ${f('현장 약칭 (파일명·목록에 사용)', 'name', '○○')}
        ${f('현장 정식 명칭', 'fullName')}
        ${f('회사명', 'company', '㈜유성')}
        ${f('실무책임자 (직책 / 이름)', 'manager')}
        ${f('확인자 (경영지원팀)', 'checker', '경영지원팀 담당자')}
        ${f('전도금 입금 계좌', 'account', '㈜유성 우리은행 1005-202-000000')}
      </div>
      <h3>기간 · 문서 번호</h3>
      <div class="form-grid">
        <label title="결제내역서(엑셀)가 이 달부터 시작하고, 업무 홈의 '밀린 일'도 이 달부터 셉니다">현장 시작월 (결제내역서 시작)<input type="month" value="${esc(s.startYm || '')}" data-ch="site" data-f="startYm"></label>
        <label title="현장 손익은 투입한 달부터 표시">현장 투입일<input type="date" value="${esc(s.inDate || '')}" data-ch="site" data-f="inDate"></label>
        ${f('문서번호 앞부분', 'docPrefix', 'YS-○○현장')}
        <label title="이 현장에서 다음에 쓸 품의 번호">품의서 첫 번호<input class="num" value="${fmt0(s.pumuiStart)}" data-ch="site" data-f="pumuiStart" data-num="1" data-fid="s_pms" placeholder="예) 15"></label>
        <label title="다음에 쓸 번호 — 품의 번호와 따로">전도금 청구 J 번호<input class="num" value="${fmt0(s.jStart)}" data-ch="site" data-f="jStart" data-num="1" data-fid="s_js" placeholder="예) 12 → J12"></label>
      </div>
      <h3>정산 기준</h3>
      <div class="form-grid">
        <label title="기본 3 → 3일~다음달 2일, 1 → 1일~말일">법인카드 사용기간 시작일<input class="num" type="number" min="1" max="28" value="${cardStartSet(db.cur)}" data-ch="site" data-f="cardStartDay" data-num="1"></label>
        <label>캐터링 중식 기본 단가<input class="num" value="${fmt0(s.cateringLunch)}" data-ch="site" data-f="cateringLunch" data-num="1" data-fid="s_cl"></label>
        <label title="현장 손익의 분양률 계산에 씀">총 세대수<input class="num" value="${fmt0(s.totalUnits)}" data-ch="site" data-f="totalUnits" data-num="1" data-fid="s_tu" placeholder="960"></label>
        <label class="small" style="align-self:end" title="끄면 법인카드 내역의 청구 칸을 숨김"><input type="checkbox" data-ch="site" data-f="claimOn" ${claimOn() ? 'checked' : ''}> 시행사 청구 적용</label>
      </div>
      <h3>결재라인</h3>
      <div class="form-grid">${s.approvers.map((a, i) => `<label>${i + 1}번 칸<span class="row"><input style="width:92px" value="${esc(a.title)}" data-ch="appr" data-i="${i}" data-f="title" data-fid="ap_t${i}"><input class="grow" value="${esc(a.name)}" placeholder="직책/이름" data-ch="appr" data-i="${i}" data-f="name" data-fid="ap_n${i}"></span></label>`).join('')}</div>
      <div class="row" style="margin-top:8px"><button class="btn sm" data-act="apprAdd">+ 결재칸 추가</button>${s.approvers.length > 1 ? '<button class="btn sm" data-act="apprDel">− 마지막 칸 삭제</button>' : ''}</div>
      <h3>실무책임자 서명 <span class="muted small">— 현장마다 따로, 현장 데이터 폴더에 저장 (다른 PC에서도 그대로)</span></h3>
      <div class="row">${signData() ? `<img src="${signData()}" alt="서명" style="height:46px;border:1px solid var(--line);background:#fff;padding:2px">` : '<span class="muted small">등록된 서명 없음</span>'}
        <button class="btn sm" data-act="signSet">서명 그림 올리기</button>${signData() ? '<button class="btn sm danger" data-act="signClear">서명 삭제</button>' : ''}
        <span class="muted small">흰 종이에 서명해 찍은 사진(또는 PNG). 품의서·자금청구서·지출결의서·집계표·사용내역서의 "(서명)" 자리에 인쇄됩니다.</span></div>
    </div>

<!--S:staff-->
    <div class="two-col set-staff">
    <div class="panel"><h3 style="margin-top:0">직원 (${staff.length}명)</h3>
      <div class="tbl-wrap"><table class="t"><thead><tr><th>구분/팀</th><th>성명</th><th>직책</th><th>소속</th><th title="얼굴인식 근태기록의 아이디 (불러오면 자동 입력)">근태 아이디</th><th title="법인카드·전도금 사용내역 빠른 입력 버튼에 표시">빠른입력</th>${secOn() && isAdmin() ? '<th title="관리자 잠금: 이 사람 급여를 경리 모드에서 숨김">급여 비공개</th>' : ''}<th>사용</th><th></th></tr></thead><tbody>
      ${staff.map(p => `<tr><td><input value="${esc(p.team || '')}" data-ch="staff" data-id="${p.id}" data-f="team" data-fid="st${p.id}"></td><td><input value="${esc(p.name)}" data-ch="staff" data-id="${p.id}" data-f="name" data-fid="sn${p.id}"></td><td><input value="${esc(p.title || '')}" data-ch="staff" data-id="${p.id}" data-f="title" data-fid="sx${p.id}"></td>
        <td><select data-ch="staff" data-id="${p.id}" data-f="kind"><option value="현장" ${p.kind !== '정직원' ? 'selected' : ''}>현장 인건비</option><option value="정직원" ${p.kind === '정직원' ? 'selected' : ''}>유성 정직원(본사지급)</option><option value="외부" ${p.kind === '외부' ? 'selected' : ''}>시행사·시공사</option></select></td>
        <td><input value="${esc(p.faceId || '')}" data-ch="staff" data-id="${p.id}" data-f="faceId" data-fid="sf${p.id}" style="min-width:90px"></td>
        <td class="center"><input type="checkbox" ${isQuick(p) ? 'checked' : ''} data-ch="staff" data-id="${p.id}" data-f="quick"></td>
        ${secOn() && isAdmin() ? `<td class="center"><input type="checkbox" ${isSecretStaff(p) ? 'checked' : ''} ${p.kind === '외부' ? 'disabled' : ''} data-ch="staff" data-id="${p.id}" data-f="secret" title="${isSecretStaff(p) && !p.secret ? '구분·소속 기준으로 비공개' : ''}"></td>` : ''}
        <td class="center"><input type="checkbox" ${p.active !== false ? 'checked' : ''} data-ch="staff" data-id="${p.id}" data-f="active"></td><td><button class="btn ghost sm danger" data-act="delStaff" data-id="${p.id}">✕</button></td></tr>`).join('')}
      </tbody></table></div>
      <div class="row" style="margin-top:8px"><input id="newStaff" class="inp grow" placeholder="이름을 쉼표로 여러 명 입력: 홍길동, 김철수"><input id="newStaffTeam" class="inp" placeholder="구분 (예: 기획팀)" style="width:130px"><button class="btn primary" data-act="addStaff">추가</button></div>
      <p class="muted small">퇴사자는 "사용" 해제 · 유성 정직원 = 출근부·식대만 (급여는 본사) · 시행사·시공사 = 이름 인식·빠른입력용</p>
    </div>
    <div class="panel"><h3 style="margin-top:0">법인카드</h3>
      <div class="tbl-wrap"><table class="t"><thead><tr><th>뒤 4자리</th><th>카드사</th><th>명의/용도</th><th title="한 사용기간(예: 3일~익월 2일) 한도 — 90% 넘으면 법인카드 탭에 경고">월 한도</th><th></th></tr></thead><tbody>
      ${cards.map(c => `<tr><td><input value="${esc(c.last4)}" maxlength="4" data-ch="cardm" data-id="${c.id}" data-f="last4" data-fid="cl${c.id}"></td><td><input value="${esc(c.issuer)}" data-ch="cardm" data-id="${c.id}" data-f="issuer" data-fid="ci${c.id}" placeholder="부산/우리"></td><td><input value="${esc(c.holder)}" data-ch="cardm" data-id="${c.id}" data-f="holder" data-fid="ch${c.id}" placeholder="현장공용/홍길동"></td><td><input class="num" style="width:100px" value="${c.limit ? fmt(c.limit) : ''}" data-ch="cardm" data-id="${c.id}" data-f="limit" data-fid="clim${c.id}" placeholder="${fmt(CARD_LIMIT)}"></td><td><button class="btn ghost sm danger" data-act="delCard" data-id="${c.id}">✕</button></td></tr>`).join('')}
      </tbody></table></div>
      <button class="btn sm" style="margin-top:8px" data-act="addCard">+ 카드 추가</button>
    </div></div>

<!--S:rule-->
    <div class="panel"><h3 style="margin-top:0">정산 기한 (모든 현장 공통)</h3>
      <div class="form-grid">
        <label>전도금·식대·법인카드 정산 (익월 n일까지)<input type="number" min="1" max="28" value="${st.settleDay}" data-ch="setting" data-f="settleDay"></label>
        <label>인건비 자료 마감 (익월 n일 — 출근부·식대 확정)<input type="number" min="1" max="28" value="${st.payrollClose || 2}" data-ch="setting" data-f="payrollClose"></label>
        <label title="휴일이면 그 전 영업일">자금집행일 ① (인건비 등 · 휴일이면 전 영업일)<input type="number" min="1" max="28" value="${st.payrollDay}" data-ch="setting" data-f="payrollDay"></label>
        <label>월결제 마감일<input type="number" min="1" max="28" value="${st.monthlyClose}" data-ch="setting" data-f="monthlyClose"></label>
        <label title="휴일이면 그 다음 영업일">자금집행일 ② (월결제 등 · 휴일이면 다음 영업일)<input type="number" min="1" max="31" value="${st.monthlyPay}" data-ch="setting" data-f="monthlyPay"></label>
      </div>
      <p class="muted small" style="margin:6px 0 0">공휴일 2025~2028년 포함 · 이번 달 자금집행일 <b>${mdw(payFundDay(todayStr().slice(0, 7), st))}</b> · <b>${mdw(monthlyFundDay(todayStr().slice(0, 7), st))}</b> · 다음 달: ${mdw(payFundDay(ymAdd(todayStr().slice(0, 7), 1), st))} · ${mdw(monthlyFundDay(ymAdd(todayStr().slice(0, 7), 1), st))}</p>
      <div class="form-grid" style="margin-top:10px"><label style="grid-column:span 2">직원 구분 정렬 순서 (쉼표로 구분, 적지 않은 구분은 뒤에)<input value="${esc(st.teamOrder ?? DEFAULT_TEAM_ORDER)}" data-ch="setting" data-f="teamOrder" data-fid="teamOrder" placeholder="${DEFAULT_TEAM_ORDER}"></label></div></div>


<!--S:ai-->
    <div class="panel"><h3 style="margin-top:0">영수증 AI 인식 <span class="muted small">— 이 PC에만 저장 (데이터 폴더에 넣지 않음)</span></h3>
      <div class="form-grid">
        <label>Claude API 키<input type="password" id="aiKey" value="${esc(aiCfg.key)}" placeholder="sk-ant-..." autocomplete="off"></label>
        <label>모델<select id="aiModel">${AI_MODELS.map(([v, l]) => `<option value="${v}" ${aiCfg.model === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      </div>
      <div class="row" style="margin-top:8px"><button class="btn sm primary" data-act="aiSave">저장</button><button class="btn sm" data-act="aiTest">연결 확인</button>${aiCfg.key ? '<button class="btn sm danger" data-act="aiClear">키 삭제</button>' : ''}
        <span class="small ${aiCfg.key ? '' : 'muted'}">${aiCfg.key ? '✔ AI 인식 사용 중 (영수증 사진이 Anthropic으로 전송됩니다)' : '키가 없으면 오프라인 글자 인식을 사용합니다'}</span></div>
      <p class="muted small">키 발급: console.anthropic.com → API Keys (유료) · 오류가 나면 오프라인 인식으로 자동 전환</p></div>

<!--S:mb-->${mbPanel()}<!--S:sec-->${secPanel()}<!--S:close-->${closePanel(s)}<!--S:data-->
    <div class="panel"><h3 style="margin-top:0">현장 관리</h3>
      <div class="row"><button class="btn primary" data-act="siteAdd">+ 새 현장 추가</button>
        <button class="btn" data-act="siteCopy">현재 현장 설정 복사해서 새 현장</button>
        <button class="btn" data-act="siteRelink">현장 폴더 ${s.folder ? '바꾸기' : '연결'}</button>
        <button class="btn danger" data-act="siteDel">현재 현장 삭제</button></div>
      ${db.sites.length > 1 ? `<div class="row small" style="margin-top:10px">다른 현장을 <b>${esc(site().name)}</b>(으)로 합치기:
        <select id="mergeFrom">${db.sites.filter(x => x.id !== db.cur).map(x => `<option value="${x.id}">${esc(x.name)} (${db.tx.filter(t => t.siteId === x.id).length}건)</option>`).join('')}</select>
        <button class="btn sm" data-act="siteMerge">합치기</button><span class="muted">내역·카드·직원·거래처·영수증을 옮기고 그 현장은 없어집니다</span></div>` : ''}
</div>

    <div class="panel"><h3 style="margin-top:0">데이터 저장</h3>
      <p class="small muted">프로그램 버전 <b>v${APP_VERSION}</b> ${IS_WEB ? '(웹 · 새 버전 자동 안내)' : '(새 버전은 프로그램 폴더만 바꾸면 됨)'}</p>
      <p class="small">저장 위치: 📁 <b>${esc(FS.root ? FS.root.name : '')}/${s.folder ? esc(s.folder) : '<span class="bad">(현장 폴더 연결 안 됨 — 위 [현장 폴더 연결])</span>'}</b></p>
      <div class="banner ${RC.want ? (RC.ready ? 'info' : 'warn') : 'warn'} small" style="margin:8px 0">
        <b>영수증 보관 폴더 (이 PC)</b>: ${RC.want ? `📁 <b>${esc(RC.root.name)}</b> ${RC.ready ? '사용 중' : '— 권한 필요'}` : '없음 — 영수증·증빙 사진도 드롭박스에 저장 중'}<br>
        <span class="muted">영수증·증빙·입고사진만 이 폴더에 저장합니다(사진은 작게 줄여 저장). 회사 드롭박스에는 자료·품의서·결재 스캔본만 남습니다. 추천: 구글 드라이브(무료 15GB) 안에 "유성 영수증" 폴더를 만들어 선택. 여러 PC에서 쓰면 PC마다 같은 폴더를 선택하세요.</span>
        <div class="row" style="margin-top:6px">${RC.want && !RC.ready ? '<button class="btn sm primary" data-act="rcReopen">권한 허용</button>' : ''}
          <button class="btn sm ${RC.want ? '' : 'primary'}" data-act="rcPick">${RC.want ? '다른 영수증 폴더 선택' : '영수증 폴더 선택…'}</button>
          ${RC.ready ? '<button class="btn sm" data-act="rcMove" title="드롭박스에 있는 영수증·증빙 사진을 영수증 폴더로 옮겨 드롭박스 용량 비우기">드롭박스의 영수증 옮기기</button>' : ''}
          ${RC.want ? '<button class="btn sm ghost" data-act="rcOff">사용 안 함</button>' : ''}</div></div>
      <div class="row">
        <button class="btn" data-act="fsReload" title="다른 PC에서 고친 내용 반영">폴더에서 다시 불러오기</button>
        <button class="btn" data-act="fsPick">다른 데이터 폴더로 바꾸기</button>
        <button class="btn" data-act="dedupe" title="같은 자료를 두 번 불러와 생긴 똑같은 내역·직원·카드를 정리">중복 정리</button>
        <button class="btn" data-act="storage" title="현장 폴더의 달별 용량을 보고, 큰 영수증 사진을 줄입니다 (드롭박스 용량 절약)">용량 정리</button>
      </div>
      <details style="margin-top:10px"><summary class="small muted" style="cursor:pointer">백업 파일 · 현장 옮기기 (필요할 때만)</summary>
        <div class="row" style="margin-top:8px">
          <button class="btn sm" data-act="backup">전체 백업 파일 저장</button>
          <button class="btn sm" data-act="restore">백업에서 전체 복원</button>
          <button class="btn sm" data-act="exportSite">현재 현장만 내보내기</button>
          <button class="btn sm" data-act="importSite">현장 자료 가져오기(합치기)</button>
        </div></details>
    </div>`;
}
