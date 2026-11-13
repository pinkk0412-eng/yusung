/* 유성 현장 관리 프로그램 — 사용설명서 화면 (왼쪽 메뉴 맨 아래)
 * 처음 쓰는 사람을 위한 기능 설명. 기능을 고칠 때마다 고치지 않고, 수정이 어느 정도 모이면 한 번에 고침.
 * 고친 날은 HELP_DATE 에 적음. 그림(HELP_IMG)은 사진 파일이 아니라 실제 화면 모양을 줄여 그린 예시 (모양은 style.css 의 .help-* · .hm-*). */
'use strict';

const HELP_DATE = '2026-11-13';
const HELP_SECS = [
  ['start', '1. 처음 시작하기'],
  ['screen', '2. 화면 보는 법'],
  ['flow', '3. 한 달 업무 순서'],
  ['home', '4. 업무 홈'],
  ['pumui', '5. 품의서'],
  ['card', '6. 법인카드'],
  ['cash', '7. 전도금'],
  ['monthly', '8. 월결제'],
  ['meal', '9. 출근부'],
  ['cater', '10. 식대·캐터링'],
  ['pay', '11. 인건비'],
  ['budget', '12. 예산·손익'],
  ['bill', '13. 매출 청구'],
  ['asset', '14. 자산·집기'],
  ['mobile', '15. 휴대폰 영수증 앱'],
  ['settings', '16. 설정'],
  ['tips', '17. 알아두면 편한 기능'],
  ['faq', '18. 자주 묻는 것'],
];

/* ---- 그림: 실제 화면을 줄여 그린 예시 (이름·금액은 모두 가짜). 누를 수 없음 ---- */
const hN = n => `<span class="help-n">${n}</span>`;
const helpShot = (cap, body, notes) => `<figure class="help-fig"><div class="help-shot" aria-hidden="true"><div class="help-shot-in">${body}</div></div>
  <figcaption><b>그림 · ${cap}</b>${notes ? `<ol class="help-notes">${notes.map((x, i) => `<li>${hN(i + 1)}<span>${x}</span></li>`).join('')}</ol>` : ''}</figcaption></figure>`;
const hBtn = (label, cls = '') => `<span class="btn ${cls}">${label}</span>`;
const hHead = (title, sub, guide, btns) => `<div class="phd"><div class="phd-t"><h2>${title}</h2>${sub ? `<div class="phd-sub">${sub}</div>` : ''}${guide ? `<div class="phd-guide">${guide}</div>` : ''}</div><div class="phd-a">${btns || ''}</div></div>`;
const hFlow = steps => `<div class="hm-flow">${steps.map(([t, d]) => `<div class="hm-step"><b>${t}</b>${d ? `<small>${d}</small>` : ''}</div>`).join('<span class="hm-arr">→</span>')}</div>`;
const HELP_IMG = {
  gate: () => helpShot('처음 열었을 때 — 데이터 폴더 연결', `<div class="panel" style="max-width:560px;margin:0 auto"><h2>데이터 폴더 연결</h2>
      <p style="margin:0 0 10px">이 프로그램은 자료를 <b>PC의 폴더에 파일로</b> 저장합니다.</p>
      <div class="row">${hN(1)}${hBtn('📁 "Dropbox" 폴더 열기', 'primary')} ${hN(2)}${hBtn('데이터 폴더 선택…')}</div></div>
      <div class="panel" style="max-width:560px;margin:10px auto 0"><div class="row"><b class="grow">예산안만 작성</b>${hN(3)}${hBtn('📝 예산안 작성')}</div></div>`,
    ['전에 쓰던 폴더가 있으면 이 단추 하나로 엽니다.', '처음이거나 폴더를 바꿀 때 누릅니다. 현장 폴더들이 들어 있는 폴더를 고르고 <b>허용</b>을 누릅니다.', '데이터 폴더 없이 예산안만 쓰고 파일로 저장할 때 (본부장님용).']),
  setup: () => helpShot('업무 홈의 처음 설정 안내', `<div class="panel" style="margin:0"><div class="setup-steps">
      <div class="setup-step is-done"><span class="setup-number">✓</span><span><b>현장 정보</b><small>현장명·문서번호·담당자</small></span><span class="setup-arrow">수정 →</span></div>
      <div class="setup-step"><span class="setup-number">2</span><span><b>직원 등록</b><small>출근부·인건비 대상자</small></span><span class="setup-arrow">설정 →</span></div>
      <div class="setup-step"><span class="setup-number">3</span><span><b>법인카드 등록</b><small>카드 뒤 4자리와 사용처</small></span><span class="setup-arrow">설정 →</span></div></div></div>`,
    ['끝낸 단계는 ✓ 로 바뀝니다. 남은 단계를 위에서부터 눌러 채우면 준비가 끝납니다.']),
  screen: () => helpShot('화면 구성', `<div class="hm-app">
      <div class="hm-top"><b class="hm-brand">유성 현장 관리 프로그램</b>${hN(1)}<span class="hm-box">현장 ○○현장 ▾</span>${hN(2)}<span class="hm-box">◀ 2026-11 ▶ 오늘</span><span class="grow"></span>${hN(3)}${hBtn('📱 휴대폰 영수증 2장', 'sm primary')}${hN(4)}<span class="muted small">저장됨</span>${hN(5)}${hBtn('설정', 'sm')}</div>
      <div class="hm-body"><div class="hm-side">${hN(6)}<span class="on">업무 홈</span><span>품의서</span><i></i><span>법인카드</span><span>전도금</span><span>월결제</span><i></i><span>출근부</span><span>식대·캐터링</span><span>인건비</span><i></i><span>예산·손익</span><span>매출 청구</span><span>자산·집기</span><em></em><span>사용설명서</span></div>
        <div class="hm-main">${hHead(`${hN(7)} 2026년 11월 법인카드 정산`, '사용기간 11/3 ~ 12/2', `엑셀 불러오기 → 세목·사용내역 → 영수증`, `${hN(8)}${hBtn('카드사 엑셀 불러오기', 'primary')}${hBtn('인쇄 ▾')}${hBtn('저장 ▾')}`)}
          <div class="hm-ph">표 · 내용</div></div></div></div>`,
    ['<b>현장</b> — 맡은 현장을 고릅니다.', '<b>작업월</b> — 보고 있는 달. ◀ ▶ 로 옮기고 [오늘]로 돌아옵니다. 처음 열면 이번 달입니다.', '<b>휴대폰 영수증</b> — 직원이 휴대폰 앱으로 보낸 영수증. 새로 온 것이 있으면 파랗게 장수가 나옵니다.', '<b>저장 상태</b> — 자동 저장 결과가 나옵니다.', '<b>설정</b> — 현장 정보·직원·기한.', '<b>왼쪽 메뉴</b> — 업무별 화면. 경리 모드에서 잠긴 메뉴에는 🔒 가 붙습니다.', '<b>제목과 순서 안내</b> — "→" 뒤의 글이 이 화면에서 하는 일의 순서입니다.', '<b>단추</b> — 자주 쓰는 일은 파란 단추, 인쇄·저장은 ▾ 메뉴 안에 있습니다.']),
  link: () => helpShot('자료가 이어지는 길 (한 번 입력하면 다음 화면에 자동 반영)', `<div class="hm-link">
      <div class="hm-col"><div class="hm-node">출근부 · 식대·캐터링</div><div class="hm-node">품의서</div><div class="hm-node">법인카드 · 전도금 · 월결제</div><div class="hm-node">매출 청구</div></div>
      <div class="hm-col hm-mid"><span>근무일수·식대·캐터링 →</span><span>직원·단가·거래처·자산 →</span><span>지출 →</span><span>수익 →</span></div>
      <div class="hm-col"><div class="hm-node">인건비 · 월결제</div><div class="hm-node">직원 · 월결제 · 자산·집기</div><div class="hm-node hm-big">예산·손익<small>예산 대비 집행 · 현장 손익 (자동 계산)</small></div></div></div>`),
  home: () => helpShot('업무 홈', `<div class="panel" style="margin:0"><h2>업무 달력</h2>
      <div class="cal-wrap" style="grid-template-columns:minmax(0,1fr) 300px"><div class="cal hm-cal">
        ${['일', '월', '화', '수', '목', '금', '토'].map((w, i) => `<div class="cal-w${i === 0 ? ' sun' : i === 6 ? ' sat' : ''}">${w}</div>`).join('')}
        <div class="cal-d sun"><div class="cal-n">8</div></div>
        <div class="cal-d"><div class="cal-n">9</div><div class="cal-ev done">인건비 청구</div></div>
        <div class="cal-d"><div class="cal-n">10</div></div>
        <div class="cal-d today sel"><div class="cal-n">11</div><div class="cal-ev soon">월결제 마감</div><div>${hN(1)}</div></div>
        <div class="cal-d"><div class="cal-n">12</div></div>
        <div class="cal-d"><div class="cal-n">13</div><div class="cal-ev later">카드 정산</div></div>
        <div class="cal-d sat"><div class="cal-n">14</div></div></div>
        <div class="cal-side"><div class="cal-side-h"><b>11월 11일 (수)</b> <span class="badge ok">오늘</span></div>
          <div class="task"><span class="dday soon">D-0</span><div class="grow"><b>월결제 마감</b></div>${hN(2)}${hBtn('바로가기 →', 'sm')}</div>
          <div class="task"><span class="dday later">D-2</span><div class="grow"><b>카드 정산</b></div></div></div></div>
      <div class="chips" style="margin-top:10px">${hN(3)}<span class="chip warn">10월 카드 영수증 없음 3</span> <span class="chip ok">전도금 영수증 모두 있음 ✓</span></div></div>`,
    ['날짜를 누르면 오른쪽에 그날 할 일이 나옵니다. 색: 초록 = 완료, 주황 = 3일 안, 빨강 = 기한 지남, 회색 = 예정.', '[바로가기 →]를 누르면 그 일을 하는 화면으로 갑니다.', '노란 표시는 빠진 것이 있다는 뜻입니다. 누르면 빠진 내역만 보여 줍니다.']),
  pumui: () => helpShot('품의서 대장', `${hHead('품의서 대장', '○○현장 · 다음 번호 17', '작성 → 결재 → 스캔본 올리기', `${hN(1)}${hBtn('+ 새 품의서', 'primary')}${hN(2)}${hBtn('엑셀·스캔본 다시 읽기')}`)}
      <div class="tbl-wrap"><table class="t"><thead><tr><th>번호</th><th>기안일자</th><th>제목</th><th>금액</th><th>상태</th><th>스캔본</th><th>반영</th><th></th></tr></thead><tbody>
        <tr><td>16</td><td>11-05</td><td>사무집기 임차의 건</td><td class="num">1,320,000</td><td>${hN(3)}<span class="badge warn">결재중</span></td><td class="muted">—</td><td></td><td>${hN(4)}⋯</td></tr>
        <tr><td>15</td><td>11-02</td><td>영업팀 직원 채용의 건</td><td class="num">—</td><td><span class="badge ok">결재완료</span></td><td>스캔 1</td><td><span class="badge ok">직원 2</span></td><td>⋯</td></tr>
      </tbody></table></div>`,
    ['양식을 골라 새 품의서를 씁니다. 번호는 자동.', '현장 폴더에 넣어 둔 엑셀 품의서·스캔본을 대장에 읽어 옵니다.', '상태는 색으로: 회색 작성중 → 주황 결재중 → 초록 결재완료.', '⋯ 메뉴: 스캔본 올리기, 결재 후 반영(직원·단가·월결제·손익·자산), 복사, 삭제.']),
  pmNew: () => helpShot('새 품의서 — 양식 고르기', `<div class="panel" style="margin:0">
      <div class="row">${hN(1)}${hBtn('✨ AI로 작성')}${hBtn('빈 양식')}${hBtn('다른 품의서 복사해서 시작')}</div>
      <div class="small muted" style="margin:8px 0 4px">${hN(2)} 자주 쓰는 양식</div><div class="row">${hBtn('채용·영업팀 단가')}${hBtn('업체 섭외·물품 임차')}${hBtn('임차')}${hBtn('오픈기간 법인카드')}${hBtn('📄 에메트 견적서로 작성')}</div>
      <div class="small muted" style="margin:8px 0 4px">${hN(3)} 조직 지급</div><div class="row">${hBtn('조직 지급 (차수형)')}</div></div>`,
    ['맨 위: AI 초안, 빈 양식, 예전 품의서 복사.', '카드에는 제목만 보입니다. 마우스를 올리면 설명이 나옵니다.', '판매수수료·계약축하금 등 차수형 지급 품의.']),
  card: () => helpShot('법인카드', `${hHead('2026년 11월 법인카드 정산', '사용기간 11/3 ~ 12/2', '엑셀 불러오기 → 세목·사용내역 → 영수증', `${hN(1)}${hBtn('카드사 엑셀 불러오기', 'primary')}${hN(2)}${hBtn('영수증 사진 올리기')}${hBtn('+ 직접 입력')}${hBtn('자동 분류')}${hBtn('인쇄 ▾')}${hBtn('저장 ▾')}`)}
      <div class="hm-qb">${hN(3)}<span class="muted small">빠른 입력</span> <span class="chip tpl">직원 중식</span> <span class="chip tpl">사무용품 구입</span> <span class="chip tpl">고객 접대 다과</span> <span class="muted small">⚙</span></div>
      <div class="tbl-wrap"><table class="t"><thead><tr><th>#</th><th>일자</th><th>카드</th><th>가맹점</th><th>금액</th><th>세목</th><th>사용내역 (구분/사용자)</th><th>영수증</th><th>☐</th></tr></thead><tbody>
        <tr><td>1</td><td>11-04</td><td>1234</td><td>○○식당</td><td class="num">48,000</td><td>복리후생비</td><td>직원 중식 (6명)</td><td>📎 1</td><td>☐</td></tr>
        <tr><td>2</td><td>11-05</td><td>1234</td><td>△△문구</td><td class="num">23,500</td><td>소모품비</td><td>사무용품 구입</td><td>${hN(4)}<span class="badge warn">없음</span></td><td>☐</td></tr>
        <tr><td>3</td><td>11-06</td><td>5678</td><td>□□전자</td><td class="num">352,000</td><td>비품</td><td>${hN(5)}<span class="badge warn">20만원 이상</span> 프린터 구입</td><td>📎 2</td><td>${hN(6)}☑</td></tr>
      </tbody></table></div>`,
    ['카드사에서 받은 엑셀을 고르면 내역이 표로 들어옵니다.', '영수증 사진을 한꺼번에 올리면 금액·날짜가 맞는 줄에 붙습니다. 확인 창에서 [✂ 편집]으로 반듯하게 펼 수 있습니다.', '사용내역 칸을 누른 뒤 단추를 누르면 문구가 들어갑니다. ⚙ 로 단추를 내 PC에 맞게 고칩니다.', '영수증이 없는 줄 (줄 앞에 선 표시). 사진을 이 줄 위로 끌어다 놓거나 줄을 누르고 Ctrl+V.', '20만원 이상은 사용내역서를 따로 만듭니다.', '체크한 줄은 위의 [N건 삭제]로 한 번에 지웁니다.']),
  scan: () => helpShot('영수증 스캔 편집', `<div class="panel" style="margin:0"><div class="hm-two">
      <div><b class="small">${hN(1)} 모서리 맞추기</b><div class="hm-ph" style="height:110px;position:relative">영수증 사진<br><span class="muted small">네 모서리 점을 끌어서 맞춤</span></div></div>
      <div><b class="small">${hN(2)} 결과</b><div class="hm-ph" style="height:110px;background:#fff">반듯하게 편 하얀 영수증</div></div></div>
      <div class="row" style="margin-top:8px"><span class="grow"></span>${hBtn('취소')}${hN(3)}${hBtn('적용', 'primary')}</div></div>`,
    ['처음 열면 모서리를 자동으로 찾습니다. 어긋났으면 점을 끌어서 맞춥니다.', '비뚤어진 사진을 펴고, 스캔 앱처럼 하얗고 또렷하게 바꿉니다.', '[적용]하면 편집한 사진으로 저장됩니다.']),
  cash: () => helpShot('전도금', `${hHead('2026년 11월 전도금 정산', '2026-11-01 ~ 2026-11-30', '지출 입력 → 영수증·사진 → 정산', `${hN(1)}${hBtn('+ 지출', 'primary')}${hBtn('+ 전도금 입금')}${hN(2)}${hBtn('영수증 사진으로 입력')}${hBtn('엑셀 불러오기')}${hBtn('인쇄 ▾')}${hBtn('저장 ▾')}`)}
      <div class="stats">${hN(3)}<div class="stat"><div class="k">전월 이월 잔액</div><div class="v">120,000</div></div><div class="stat"><div class="k">당월 입금</div><div class="v">500,000</div></div><div class="stat"><div class="k">당월 사용</div><div class="v">86,400</div></div><div class="stat"><div class="k">현재 잔액</div><div class="v">533,600</div></div></div>
      <div class="banner info row" style="margin:8px 0"><span class="grow small">이 달 사용분을 정산하고, 잔액이 적으면 추가 신청하세요.</span>${hN(4)}${hBtn('📝 전도금 정산', 'primary')}</div>
      <div class="tbl-wrap"><table class="t"><thead><tr><th>#</th><th>일자</th><th>구분</th><th>세목</th><th>거래처</th><th>거래내용</th><th>금액</th><th>잔액</th><th>영수증</th></tr></thead><tbody>
        <tr><td>1</td><td>11-02</td><td>입금</td><td></td><td>본사</td><td>전도금 입금</td><td class="num" style="color:var(--accent)">500,000</td><td class="num">620,000</td><td></td></tr>
        <tr><td>2</td><td>11-03</td><td>지출</td><td>소모품비</td><td>○○마트</td><td>생수·종이컵</td><td class="num">36,400</td><td class="num">583,600</td><td>📎 1</td></tr>
      </tbody></table></div>`,
    ['쓴 돈은 [+ 지출], 본사에서 받은 돈은 [+ 전도금 입금].', '영수증 사진을 올리면 날짜·가맹점·금액을 읽어 줄을 만들어 줍니다.', '이월·입금·사용·잔액이 자동으로 계산됩니다.', '달마다 이 창에서 정산·추가 신청·인쇄·마감을 합니다.']),
  monthly: () => helpShot('월결제', `${hHead('2026년 11월 월결제', '마감 11일 · 자금집행 11/25 (수)', '금액 입력 → 증빙 확인 → 마감', `${hN(3)}${hBtn('마감하기', 'primary')}${hN(1)}${hBtn('+ 거래처')}${hBtn('전월 금액 복사')}${hBtn('자금청구서·지출결의서 인쇄')}${hBtn('엑셀로 저장')}`)}
      <div class="tbl-wrap"><table class="t"><thead><tr><th>#</th><th>과목</th><th>업체명</th><th>거래내역</th><th>유성</th><th>합계</th><th>전월</th><th>사용기간/비고</th><th>예산</th></tr></thead><tbody>
        <tr><td>1</td><td>임차료</td><td>○○렌탈</td><td>복합기 임차</td><td class="num">${hN(2)} 165,000</td><td class="num">165,000</td><td class="num muted">165,000</td><td>11월분</td><td><span class="badge ok">복합기</span></td></tr>
        <tr><td>2</td><td>복리후생비</td><td>△△캐터링</td><td>중식</td><td class="num" style="background:#fff8d9">1,240,000</td><td class="num">1,240,000</td><td class="num muted">1,180,000</td><td>10월분</td><td>${hN(4)}<span class="badge warn">품의 필요</span></td></tr>
      </tbody></table></div>`,
    ['거래처는 한 번 등록하면 매달 그대로 나옵니다.', '달마다 청구 금액만 넣습니다. 지난달과 다르면 노랗게 표시됩니다.', '다 넣었으면 [마감하기]. 마감한 달은 잠깁니다.', '예산 칸: 예산이 있는 현장만. 예산 항목에 없거나 넘으면 "품의 필요".']),
  att: () => helpShot('출근부', `${hHead('2026년 11월 출근부', '1일 ~ 말일 · 익월 초 정산 → 인건비 반영', '', `${hN(4)}${hBtn('출근부·근태기록 불러오기', 'primary')}${hN(5)}${hBtn('출퇴근보고 만들기')}${hBtn('출근 사진 인쇄')}${hBtn('엑셀로 저장')}`)}
      <div class="row" style="margin-bottom:8px">${hN(1)}${hBtn('<b>현장 인건비 직원</b> 12명', 'primary')}${hBtn('<b>유성 정직원</b> 3명')}</div>
      <div class="subtabs"><button class="active">출근부</button><button>인건비 반영 요약</button><button>⚙ 설정 (출근 기준·식대 단가)</button></div>
      <table class="hm-att"><thead><tr><th>구분</th><th>성명</th>${[2, 3, 4, 5, 6, 7, 8].map(d => `<th${d === 7 || d === 8 ? ' class="we"' : ''}>${d}</th>`).join('')}<th>계</th><th>지각</th></tr></thead><tbody>
        <tr><td>영업팀</td><td>김○○</td><td class="on">1</td><td class="on">1</td><td class="late">${hN(3)}지</td><td class="on">1</td><td class="on">1</td><td class="off we">휴</td><td class="we"></td><td>5</td><td>1</td></tr>
        <tr><td>영업팀</td><td>이○○</td><td class="on">${hN(2)}1</td><td class="on">1</td><td class="on">1</td><td class="etc">0.5</td><td class="on">1</td><td class="on we">1</td><td class="off we">휴</td><td>5.5</td><td></td></tr>
      </tbody></table>`,
    ['위에서 <b>현장 인건비 직원</b>(기획계약직·업체·알바) / <b>유성 정직원</b>(본사 지급)을 고르고, 아래 탭을 씁니다.', '칸을 누르면 1(출근) → 휴(휴무) → 빈칸 순서로 바뀝니다.', '지각 칸. <b>오른쪽 클릭</b>으로 지각 사유·사진·인정 처리, 반차·출장 등 직접 입력.', '얼굴인식 근태기록 엑셀을 읽어 한 번에 채웁니다.', '카톡에 올릴 출퇴근보고 문구를 만들어 줍니다.']),
  cater: () => helpShot('식대·캐터링', `${hHead('2026년 11월 식대 · 캐터링', '일자별 주문 수량·금액 · 출근 인원은 출근부에서 자동 · 월결제 캐터링 업체에 반영', '', hBtn('엑셀로 저장'))}
      <div class="subtabs">${hN(1)}<button>식대내역</button><button class="active">캐터링</button></div>
      <div class="tbl-wrap"><table class="t"><thead><tr><th>일자</th><th>출근 예정</th><th>실제 출근</th><th>주문 수량</th><th>금액</th></tr></thead><tbody>
        <tr><td>11-03 (월)</td><td class="num hm-auto">${hN(2)} 14</td><td class="num hm-auto">13</td><td class="num">14</td><td class="num">112,000</td></tr>
        <tr><td>11-04 (화)</td><td class="num hm-auto">14</td><td class="num hm-auto">14</td><td class="num">14</td><td class="num">112,000</td></tr>
      </tbody></table></div>
      <div class="small muted" style="margin-top:6px">${hN(3)} 업체 이름 <span class="hm-box">△△캐터링</span> → 월결제 같은 이름 업체에 금액 자동 반영</div>`,
    ['<b>식대내역</b>: 법인카드·전도금 식대를 사람별·날짜별로 / <b>캐터링</b>: 일자별 주문 수량·금액.', '회색 = 출근부에서 자동으로 온 인원.', '업체 이름을 적으면 월결제의 같은 업체 금액으로 바로 들어갑니다.']),
  pay: () => helpShot('인건비', `${hHead('2026년 11월 인건비', '2026-11-01 ~ 2026-11-30 · 12/10 (목) 자금집행', '출근·식대 확인 → 청구서 인쇄', `${hBtn('출근부 입력 →')}${hBtn('식대 ▾')}${hBtn('엑셀로 저장')}${hN(3)}${hBtn('자금청구서·지출결의서 인쇄', 'primary')}`)}
      <div class="tbl-wrap"><table class="t"><thead><tr><th>구분</th><th>성명</th><th>지급형태</th><th>급여단가</th><th>근무일수</th><th>급여계</th><th>식대계</th><th>총급여액</th><th>원천세</th><th>실지급액</th></tr></thead><tbody>
        <tr><td>영업팀</td><td>김○○</td><td>일급</td><td class="num">120,000</td><td class="num hm-auto">${hN(1)} 22</td><td class="num">2,640,000</td><td class="num hm-auto">220,000</td><td class="num">2,860,000</td><td class="num">94,380</td><td class="num"><b>2,765,620</b></td></tr>
        <tr><td>영업팀</td><td>이○○</td><td>월급</td><td class="num">3,000,000</td><td class="num hm-fix">${hN(2)} 20</td><td class="num">3,000,000</td><td class="num hm-auto">200,000</td><td class="num">3,200,000</td><td class="num">105,600</td><td class="num"><b>3,094,400</b></td></tr>
      </tbody></table></div>`,
    ['회색 = 출근부에서 자동으로 온 값.', '직접 넣은 값은 자동 값보다 우선합니다. 지우면 다시 자동.', '확인이 끝나면 청구서를 인쇄합니다.']),
  budget: () => helpShot('예산·손익 — 예산 작성', `${hHead('○○현장 예산 <span class="badge">작성중</span>', '2026년 ○○현장 예산심의(案) · 최초 예산 412,000,000원 (VAT 별도)', '', `${hN(4)}${hBtn('결재완료로', 'primary')}${hBtn('📥 예산안 파일 가져오기')}${hBtn('인쇄 ▾')}${hBtn('저장 ▾')}`)}
      <div class="subtabs bg-top">${hN(1)}<button class="active">예산</button><button>손익</button></div>
      <div class="subtabs sub2">${hN(2)}<button class="active">예산 작성</button><button>인력 일정</button><button>현장 정보</button></div>
      <div class="tbl-wrap"><table class="t"><thead><tr><th>계정</th><th>항목</th><th>인원·수량</th><th>사전</th><th>본영업</th><th>사후</th><th>단가</th><th>금액</th></tr></thead><tbody>
        <tr><td>인건비</td><td>⠿ 상담사</td><td class="num hm-auto">${hN(3)} 8</td><td class="num hm-auto">20</td><td class="num hm-auto">60</td><td class="num hm-auto">10</td><td class="num">130,000</td><td class="num">93,600,000</td></tr>
        <tr><td>임차료</td><td>⠿ 복합기</td><td class="num">1</td><td class="num">30</td><td class="num">60</td><td class="num">30</td><td class="num">5,500</td><td class="num">660,000</td></tr>
      </tbody></table></div>`,
    ['<b>예산</b> / <b>손익</b> 두 묶음. 손익 쪽에는 <b>예산 대비 집행</b>과 <b>현장 손익</b>이 있습니다.', '예산 작성 · 인력 일정(날짜별 인원) · 현장 정보(세대수·수수료·영업 일정).', '금액 = 인원·수량 × 단계별 일수 × 단가. 인건비 인원·일수는 <b>인력 일정</b>에서 옵니다 (회색).', '결재가 끝나면 [결재완료로] → 예산이 잠깁니다. 그 뒤로는 전용·증액 품의로만 바꿉니다.']),
  pl: () => helpShot('예산·손익 — 현장 손익', `<div class="tbl-wrap"><table class="t"><thead><tr><th colspan="2">구분</th><th>9월</th><th>10월</th><th>11월</th><th>2026년 합계</th></tr></thead><tbody>
        <tr><td>수익</td><td>분양대행수수료</td><td class="num hm-auto">52,000,000</td><td class="num hm-auto">${hN(1)} 48,000,000</td><td class="num hm-auto">61,000,000</td><td class="num">161,000,000</td></tr>
        <tr><td>지출</td><td>${hN(3)}<u>인건비</u></td><td class="num hm-auto">21,400,000</td><td class="num hm-auto">22,100,000</td><td class="num hm-auto">22,800,000</td><td class="num">66,300,000</td></tr>
        <tr><td></td><td>광고선전비</td><td class="num hm-auto">3,200,000</td><td class="num hm-fix">${hN(2)} 4,000,000</td><td class="num hm-auto">2,900,000</td><td class="num">10,100,000</td></tr>
      </tbody></table></div>`,
    ['회색 = 다른 화면의 자료로 자동 계산.', '파랑 = 직접 넣어 고정한 값. 지우면 자동으로 돌아갑니다.', '항목 이름을 누르면 무엇이 더해졌는지 세부내역이 나옵니다. 칸 오른쪽 클릭 = 메모.']),
  bill: () => helpShot('매출 청구 한 건의 진행 순서', hFlow([['① 청구 추가', '항목·기간·금액'], ['② 공문', '공문 날짜'], ['③ 세금계산서', '발행일'], ['④ 입금 확인', '입금일·금액']]) + `<div class="muted small" style="margin-top:8px">줄을 눌러 단계마다 날짜를 적으면 상태가 바뀌고, 발행했는데 안 들어온 돈은 <b>미수</b>로 표시됩니다.</div>`),
  asset: () => helpShot('자산·집기', `${hHead('자산·집기', '○○현장 · 구입 4 · 임차 12 · 소모품 30', '등록 → 상태 관리 → 철수 때 회수 리스트', `${hN(1)}${hBtn('+ 추가', 'primary')}${hBtn('엑셀에서 붙여넣기')}${hN(4)}${hBtn('인쇄 ▾')}`)}
      <div class="tbl-wrap"><table class="t"><thead><tr><th>종류</th><th>품명 · 규격</th><th>수량</th><th>단가</th><th>금액</th><th>입고 ~ 반납</th><th>배치 장소</th><th>상태</th></tr></thead><tbody>
        <tr><td>임차</td><td><b>상담 테이블</b> <span class="muted small">원형 900</span> 📷2</td><td class="num">10</td><td class="num">15,000</td><td class="num">150,000</td><td>11.01 ~</td><td>상담석</td><td>${hN(3)}<span class="badge">사용</span></td></tr>
        <tr><td>구입</td><td><b>프린터</b> ${hN(2)}<span class="badge warn">사진 없음</span></td><td class="num">1</td><td class="num">352,000</td><td class="num">352,000</td><td>11.06</td><td>사무실</td><td><span class="badge">사용</span></td></tr>
      </tbody></table></div>`,
    ['직접 추가하거나 엑셀 표를 복사해 붙여 넣습니다. 품의서 표에서 바로 등록할 수도 있습니다.', '구입·임차 집기는 사진 증빙이 필요합니다. 줄을 누르고 Ctrl+V.', '상태: 사용 / 회수 / 회수불가.', '임차 현황표, 소모품 단가표, 철수 회수 리스트, 사진 대장.']),
  mobile: () => helpShot('휴대폰 영수증이 들어오는 길', hFlow([['① 단톡방 링크', '경리 PC에서 [링크 복사]'], ['② 휴대폰으로 찍기', '이름만 적고 시작'], ['③ 보내기', '편집 → 법인카드/전도금'], ['④ PC에서 받기', '📱 휴대폰 영수증 → 확인 → 저장']])
      + `<div class="muted small" style="margin-top:8px">휴대폰 쪽은 로그인이 없습니다. 링크를 가진 사람은 사진을 <b>보내기만</b> 할 수 있고, 회사 자료는 볼 수 없습니다.</div>`),
  settings: () => helpShot('설정 화면의 위쪽 탭', `<div class="subtabs" style="margin:0"><button class="active">현장 정보·결재</button><button>직원·카드</button><button>정산 기한</button><button>영수증 AI</button><button>휴대폰 앱</button><button>관리자 잠금</button><button>현장 철수</button><button>현장·데이터 관리</button></div>`),
  files: () => helpShot('각 화면 아래쪽의 파일 보관', `<div class="panel" style="margin:0"><b>파일 보관</b> <span class="muted small">증빙 2개 · 결재받은 스캔본 1개</span>
      <div class="hm-two"><div>${hN(1)} <b class="small">증빙 파일</b><div class="row" style="margin-top:6px">${hBtn('+ 파일 올리기', 'sm')}${hBtn('보기 2', 'sm')}</div></div>
        <div>${hN(2)} <b class="small">결재받은 스캔본</b><div class="row" style="margin-top:6px">${hBtn('+ 스캔본', 'sm')}${hBtn('보기 1', 'sm ghost')}</div></div></div></div>`,
    ['카드 명세서 PDF, 세금계산서 등 증빙 파일.', '결재를 받은 서류의 스캔본. 올리면 현장 폴더의 스캔 폴더에 저장됩니다.']),
};

function viewHelp() {
  const go = (tab, label) => hiddenTab(tab) ? '' : `<button class="btn sm" data-act="helpTab" data-tab="${tab}">${label} 열기 →</button>`;
  const sec = (id, body, tab) => { const t = HELP_SECS.find(x => x[0] === id)[1]; return `<section class="panel help-sec" id="help_${id}"><h3>${t}${tab ? go(tab, t.replace(/^\d+\.\s*/, '')) : ''}</h3>${body}</section>`; };
  return `${pageHead('사용설명서', `처음 쓰는 분을 위한 기능 설명 · ${HELP_DATE} 기준`, BTN('helpPrint', '인쇄'))}
  <div class="help">
    <div class="panel help-toc"><b>목차</b><div class="help-toc-l">${HELP_SECS.map(([k, l]) => `<button class="chip" data-act="helpGo" data-v="${k}">${l}</button>`).join('')}</div></div>

    ${sec('start', `
      <p>이 프로그램은 현장 경리 업무(법인카드·전도금·월결제 정산, 출근부·식대·인건비, 품의서, 예산·현장 손익)를 한곳에서 하는 프로그램입니다. 설치 없이 <b>크롬 또는 엣지</b>로 열어서 씁니다 (다른 브라우저로 열면 경고가 나옵니다).</p>
      ${HELP_IMG.gate()}
      ${HELP_IMG.setup()}
      <ol>
        <li><b>데이터 폴더 연결</b> — 처음 열면 폴더를 고르라는 화면이 나옵니다. <b>현장 폴더들이 들어 있는 폴더</b>(예: Dropbox)를 고르고, "파일 수정 허용"을 물으면 <b>허용</b>을 누릅니다. 다음부터는 [📁 폴더 열기] 한 번이면 됩니다. 현장 폴더를 고르지 않았으면 안내와 함께 만들기를 도와줍니다.</li>
        <li><b>회사 현장 폴더 연결</b> — 회사가 만들어 둔 현장 폴더(예: "132. ○○현장")를 연결하면, 월별 자료·영수증·품의서가 그 폴더 안에 정리되어 저장됩니다.</li>
        <li><b>기본 설정 3가지</b> — 업무 홈에 뜨는 안내 순서대로 누르면 됩니다.
          <ul><li><b>현장 정보</b>: 현장 이름, 문서번호, 결재라인, 전도금 계좌</li>
          <li><b>직원 등록</b>: 출근부·인건비에 나올 직원 명단</li>
          <li><b>법인카드 등록</b>: 카드 뒤 4자리와 사용처</li></ul></li>
        <li><b>예산안만 작성</b> — 첫 화면 아래의 [📝 예산안 작성]으로 데이터 폴더 없이 예산안을 쓰고 파일(.xlsx)로 저장할 수 있습니다. 쓰던 내용은 브라우저에 임시로 보관됩니다. 이 파일을 현장에 보내면 <b>예산·손익</b> 탭에서 가져옵니다.</li>
      </ol>
      <div class="banner info small">모든 자료는 인터넷이 아니라 <b>내 PC(또는 Dropbox)의 폴더에 파일로</b> 저장됩니다. 고칠 때마다 자동으로 저장되므로 저장 버튼이 따로 없습니다.</div>`)}

    ${sec('screen', `
      ${HELP_IMG.screen()}
      <table class="t help-t"><tbody>
        <tr><th>위 막대 · 현장</th><td>여러 현장을 맡고 있으면 여기서 현장을 바꿉니다. 화면의 모든 내용이 고른 현장 것으로 바뀝니다.</td></tr>
        <tr><th>위 막대 · 작업월</th><td>지금 보고 있는 달입니다. 처음 열면 이번 달이고, ◀ ▶ 로 달을 옮기고, [오늘]을 누르면 이번 달로 돌아옵니다. 법인카드·전도금·월결제·출근부·인건비는 모두 이 달 기준으로 보입니다.</td></tr>
        <tr><th>위 막대 · 📱 휴대폰 영수증</th><td>휴대폰 앱을 쓰는 현장에만 보입니다. 새로 온 영수증이 있으면 파랗게 장수가 나오고, 누르면 받기 창이 열립니다. (15. 휴대폰 영수증 앱)</td></tr>
        <tr><th>위 막대 · 저장 상태</th><td>"저장됨" 같은 글자로 지금 저장이 되었는지 알려 줍니다.</td></tr>
        <tr><th>위 막대 · 설정</th><td>현장 정보, 직원·카드, 정산 기한 등을 고칩니다.</td></tr>
        <tr><th>왼쪽 메뉴</th><td>업무별 화면입니다. 화면 제목 아래의 "→ 엑셀 불러오기 → 세목 …" 같은 글은 그 화면에서 하는 일의 순서입니다. 경리 모드에서 잠긴 메뉴는 🔒 가 붙고, 누르면 비밀번호를 묻습니다.</td></tr>
        <tr><th>회색 숫자</th><td>프로그램이 자동으로 계산한 값입니다. 직접 숫자를 넣으면 그 값이 우선하고, 지우면 다시 자동 계산으로 돌아갑니다.</td></tr>
        <tr><th>노란·빨간 표시</th><td>확인이 필요한 곳입니다 (영수증 없음, 기한 임박, 금액이 지난달과 다름, 품의 필요 등). 누르면 해당 화면으로 갑니다.</td></tr>
      </tbody></table>`)}

    ${sec('flow', `
      ${HELP_IMG.link()}
      <p>날짜는 현장마다 다를 수 있으며 <b>설정 → 정산 기한</b>에서 고칩니다. 그때그때 해야 할 일은 <b>업무 홈</b>의 달력과 할 일 목록에 날짜순으로 나옵니다.</p>
      <table class="t help-t"><tbody>
        <tr><th>현장 투입 전</th><td><b>예산·손익</b>에서 예산심의(案) 작성(또는 받은 예산안 파일 가져오기) → 결재 → [결재완료로] 잠금</td></tr>
        <tr><th>수시</th><td>품의서 작성·결재 → 스캔본 올리기 / 전도금 지출 입력 + 영수증 / 출근부 입력, 출퇴근보고 / 휴대폰 영수증 받기</td></tr>
        <tr><th>월초</th><td>지난달 <b>출근부·식대</b> 확인 → <b>인건비</b> 자금청구서·지출결의서 인쇄 / <b>전도금</b> [📝 전도금 정산]</td></tr>
        <tr><th>월결제 마감일</th><td>거래처별 청구 금액 입력 → 증빙·예산 확인 → <b>마감하기</b> → 자금청구서 인쇄</td></tr>
        <tr><th>카드 사용기간 끝난 뒤</th><td>카드사 엑셀 불러오기 → 세목·사용내역 정리 → 영수증 붙이기 → 집계표·증빙철 인쇄</td></tr>
        <tr><th>결재 받은 뒤</th><td>결재받은 서류를 스캔해서 각 화면의 <b>파일 보관 → 결재받은 스캔본</b>에 올리기</td></tr>
        <tr><th>틈틈이</th><td><b>예산·손익 → 예산 대비 집행</b>에서 "품의 필요"가 없는지 확인</td></tr>
      </tbody></table>`)}

    ${sec('home', `
      ${HELP_IMG.home()}
      <ul>
        <li><b>달력</b> — 상단바 작업월의 마감일·자금집행일·공휴일이 표시됩니다. 날짜를 누르면 그날 할 일이 보입니다.</li>
        <li><b>할 일 목록</b> — 기한이 가까운 순서로 나오고, D-며칠인지 보여 줍니다. [바로가기 →]를 누르면 그 일을 하는 화면으로 갑니다.</li>
        <li><b>점검 표시</b> — "카드 영수증 없음 3" 같은 노란 표시는 빠진 것이 있다는 뜻입니다. 누르면 빠진 내역만 걸러서 보여 줍니다.</li>
        <li><b>결재 대기 품의서</b> — 아직 결재가 끝나지 않은 품의서가 모여 보입니다.</li>
      </ul>`, 'home')}

    ${sec('pumui', `
      ${HELP_IMG.pumui()}
      <p>품의서를 번호순으로 관리하는 <b>대장</b>입니다. 순서: <b>작성 → 결재 → 스캔본 올리기</b></p>
      ${HELP_IMG.pmNew()}
      <ul>
        <li><b>[+ 새 품의서]</b> — 양식을 고르면 내용·세부내역 표·첨부서류가 채워진 상태로 시작합니다. 번호는 자동으로 다음 번호가 붙고, 현장 폴더의 품의서 폴더에 번호마다 엑셀 파일이 만들어집니다.</li>
        <li><b>작성 창</b> — 인쇄 모양 그대로 클릭해서 씁니다. 번호 붙은 항목·번호 없는 글·안쪽 하위 항목을 자유롭게 쓰고, <b>Tab</b> 으로 들여씁니다. 표에서 <b>오른쪽 클릭</b> = 행·열 추가/삭제, "이 줄 부가세 없음". 엑셀 표를 복사해 붙여 넣을 수도 있습니다. 📎 로 견적서 등 첨부를 붙입니다.</li>
        <li><b>✨ AI로 작성</b> — 메모와 견적서·계약서(사진·PDF)를 주면 제목·본문·표·첨부서류 초안을 만들어 줍니다 (설정에서 AI 키를 넣은 경우). <b>AI 작성은 보조 도구</b>이므로 내용을 꼭 확인하세요.</li>
        <li><b>📄 에메트 견적서로 작성</b> — 집기 임차 견적서 엑셀을 고르면 사무집기 임차 품의서로 바로 채웁니다 (AI 없이).</li>
        <li><b>오픈기간 법인카드</b> — 작성 창에서 [💳 카드 내역 불러오기]로 그 기간 카드 내역을 표에 넣습니다. 인쇄하면 품의서 갑지 → 지출결의서 → 카드 사용내역 → 기타 서류 순서로 나옵니다.</li>
        <li><b>채용</b> 양식에는 "주요업무" 칸이 있습니다. <b>조직 지급</b>은 판매내역(계약 세대)을 붙여 넣으면 차수별로 나눠 줍니다.</li>
        <li><b>[엑셀·스캔본 다시 읽기]</b> — 현장 폴더의 "A. 기안품의" 안에 넣어 둔 엑셀 품의서와 스캔본을 읽어 대장에 반영합니다. [폴더 주소 복사]를 누르면 주소를 복사하고 파일 탐색기를 엽니다.</li>
        <li><b>결재 후 반영</b> — 결재가 끝난 품의는 ⋯ 메뉴에서 직원 등록·단가 변경·월결제 거래처·현장 손익·자산 대장으로 내용을 넘길 수 있습니다. 같은 내용을 두 번 입력하지 않아도 됩니다.</li>
        <li>전도금 청구서(J번호)는 대장에 나오지 않고 <b>전도금</b> 탭 아래 "전도금 청구 대장"에 모입니다.</li>
      </ul>`, 'pumui')}

    ${sec('card', `
      ${HELP_IMG.card()}
      <p>순서: <b>카드사 엑셀 불러오기 → 세목·사용내역 → 영수증</b></p>
      <ul>
        <li><b>[카드사 엑셀 불러오기]</b> — 카드사에서 받은 사용내역 엑셀을 고르면 내역이 표로 들어옵니다. 같은 파일을 다시 불러와도 겹치는 내역은 알려 줍니다.</li>
        <li><b>세목·사용내역</b> — [자동 분류]를 누르면 가맹점 이름으로 세목을 채웁니다. 사용내역 칸을 누른 뒤 위쪽 <b>빠른 입력</b> 단추를 누르면 자주 쓰는 문구가 들어갑니다. 아무 칸도 안 고르고 누르면 새 내역을 만들어 넣습니다. "중식/"·"석식/"은 세목 식대, "간식/"은 간식대로 자동.</li>
        <li><b>[영수증 사진 올리기]</b> — 여러 장을 한 번에 올리면 금액·날짜가 맞는 내역에 붙습니다. 확인 창에서 사진마다 <b>[✂ 편집]</b>(아래 그림)으로 반듯하게 펴거나 빼기를 할 수 있고, 맞는 내역이 없으면 "새로 등록"이 기본으로 골라집니다. 사진을 내역 줄 위로 끌어다 놓거나, 복사한 사진을 Ctrl+V 로 붙여도 됩니다.</li>
        <li><b>삭제</b> — 줄에서 <b>오른쪽 클릭</b> = 한 건 삭제, 오른쪽 끝 체크칸으로 여러 건을 골라 [N건 삭제].</li>
        <li><b>사용기간</b> — 정산 기준 기간(예: 3일~다음달 2일)과 1일~말일 보기를 제목 아래에서 바꿀 수 있습니다. 시작일은 설정 → 현장 정보에서 고칩니다. 월 한도는 화면 맨 아래에 금액으로 나옵니다.</li>
        <li><b>인쇄</b> — 집계표, 증빙철(영수증 묶음), 선결제 지출결의서, 입고사진 정리. <b>20만원 이상</b> 사용 건은 사용내역서를 건별로 골라 인쇄합니다.</li>
        <li><b>식대 점검</b> — 식대로 쓴 금액이 인원×단가를 넘거나, 출근 안 한 날 식대를 쓰면 표시해 줍니다. 시행사와 같이 먹은 식대는 초과에서 뺍니다.</li>
      </ul>
      ${HELP_IMG.scan()}
      <p class="small">스캔 편집은 영수증 사진을 크게 볼 때도 [✂ 스캔 편집] 단추로 열 수 있습니다. 전도금 영수증도 같습니다.</p>`, 'card')}

    ${sec('cash', `
      ${HELP_IMG.cash()}
      <p>순서: <b>지출 입력 → 영수증·사진 → 정산</b></p>
      <ul>
        <li><b>[+ 지출]</b> 로 쓴 돈을, <b>[+ 전도금 입금]</b> 으로 본사에서 받은 돈을 적습니다. 남은 잔액이 위쪽에 나옵니다.</li>
        <li><b>[영수증 사진으로 입력]</b> — 영수증 사진을 올리면 날짜·가맹점·금액을 읽어 지출 내역을 만들어 줍니다. 읽은 내용은 꼭 한 번 확인하세요.</li>
        <li><b>[📝 전도금 정산]</b> — 매달 1일~말일 사용분을 정산하는 창입니다. 잔액이 적으면 여기서 추가 신청 금액을 넣고, 청구서를 인쇄하고 마감합니다. 마감한 뒤 내역이 바뀌면 알려 줍니다.</li>
        <li><b>삭제</b> — 법인카드처럼 줄에서 오른쪽 클릭 = 한 건 삭제, 체크해서 여러 건 삭제.</li>
        <li><b>인쇄 ▾</b> — 증빙철(사진 없는 내역은 붙임 칸), 입고사진 정리. <b>저장 ▾</b> — 집행내역·청구서 엑셀, 입고사진 PPT. 기존 장부는 [엑셀 불러오기]로 옮겨 옵니다.</li>
        <li>전도금 청구서에는 품의 번호와 별도로 <b>J 번호</b>가 붙고, 화면 아래 <b>전도금 청구 대장</b>에 모입니다 (설정에서 시작 번호 지정).</li>
      </ul>`, 'cash')}

    ${sec('monthly', `
      ${HELP_IMG.monthly()}
      <p>매달 거래처에 주는 돈(임차료, 렌탈, 캐터링 등)을 정리합니다. 순서: <b>금액 입력 → 증빙 확인 → 마감</b></p>
      <ul>
        <li><b>[+ 거래처]</b> 로 거래처를 등록하고, 달마다 청구 금액(부가세 포함)을 넣습니다. <b>[전월 금액 복사]</b> 로 지난달 금액을 그대로 가져올 수 있습니다. 사용기간은 달력에서 시작~끝을 고릅니다.</li>
        <li>세금계산서·거래명세서 등 <b>증빙</b>을 받았는지 체크합니다. 검토 창의 대수·인원·변동 사유는 <b>비고</b> 한 칸에 적습니다.</li>
        <li><b>예산 칸</b> — 예산이 있는 현장이면 거래처마다 예산 항목을 연결합니다 (구두보고 날짜도). 예산 외·총액 초과·월 단가 초과면 <b>품의 필요</b>로 표시되고, 마감할 때 한 번 더 확인합니다. 품의로 지급하는 거래처는 비워 두고 참조문서에 품의 번호를 적습니다.</li>
        <li><b>캐터링</b> 업체 금액은 식대·캐터링 탭에서 자동으로 들어옵니다.</li>
        <li><b>[마감하기]</b> 를 누르면 그 달은 고칠 수 없게 잠깁니다. 고치려면 [마감 해제].</li>
        <li><b>업체별 월 지출</b> — 달마다 업체별 금액을 한 표로 보고, 지난달과 금액이 다른 칸은 노랗게 표시됩니다.</li>
        <li>시행사 칸은 그 달 시행사 청구가 있을 때만 보입니다 (없으면 [+ 시행사 칸]). 시행사 청구가 없으면 인쇄도 "○월집계"만 나옵니다.</li>
        <li><b>인쇄·엑셀</b> — 자금청구서·지출결의서 인쇄 (업체가 여럿이면 업체별로 나눔), 결제내역서 엑셀.</li>
      </ul>`, 'monthly')}

    ${sec('meal', `
      ${HELP_IMG.att()}
      <p>순서: <b>출근부 → 인건비 반영</b>. 위쪽에서 <b>현장 인건비 직원 / 유성 정직원</b>을 고르고, 그 아래 탭(출근부 · 인건비 반영 요약 · ⚙ 설정)을 씁니다. 식대내역과 캐터링은 <b>식대·캐터링</b> 탭에 있습니다.</p>
      <ul>
        <li><b>출근부</b> — 칸을 눌러 출근·휴무·반차 등을 표시합니다. 날짜·요일 줄은 고정되어 인원이 많아도 보입니다. <b>[출근부·근태기록 불러오기]</b> 로 얼굴인식 근태기록 엑셀이나 기존 출근부 엑셀을 읽어 올 수 있습니다.</li>
        <li><b>지각</b> — 출근 기준 시각보다 늦으면 표시됩니다. 칸에서 <b>오른쪽 클릭</b>하면 지각 사유를 적거나 사진을 붙일 수 있고, 인정 처리도 할 수 있습니다. 붙인 사진은 [출근 사진 인쇄]로 A4 한 장에 4장씩 인쇄합니다.</li>
        <li><b>[출퇴근보고 만들기]</b> — 출근부 내용으로 카톡에 올릴 출퇴근보고 문구를 만들어 줍니다. 복사해서 붙여넣기만 하면 됩니다.</li>
        <li><b>⚙ 설정</b> — 출근 기준 시각, 구분별 식대 단가·급여 단가.</li>
        <li><b>인건비 반영 요약</b> — 인건비에 넘어갈 근무일수·식대를 한눈에 봅니다 (유성 정직원은 본사 지급이라 요약이 없습니다).</li>
      </ul>`, 'meal')}

    ${sec('cater', `
      ${HELP_IMG.cater()}
      <ul>
        <li><b>식대내역</b> — 법인카드·전도금으로 결제한 식대를 사람별·날짜별 1인분으로 나눠 봅니다. 출근 안 한 날 식대, 사용내역에서 못 알아본 이름을 표시합니다. 식대 단가는 <b>출근부 → ⚙ 설정</b>에서 정합니다.</li>
        <li><b>캐터링</b> — 일자별 주문 수량·금액을 적습니다. 출근 예정 인원과 실제 출근 인원은 출근부에서 자동으로 나옵니다 (출근부 미입력은 그날까지 안 적은 것만 셈).</li>
        <li><b>업체 이름</b>을 적으면 월결제의 같은 이름 업체에 금액이 자동으로 들어갑니다. 사용기간을 적으면 그 기간 금액으로 계산합니다.</li>
        <li><b>엑셀로 저장</b> — 캐터링 주문대장(회사 양식).</li>
      </ul>`, 'cater')}

    ${sec('pay', `
      ${HELP_IMG.pay()}
      <p>순서: <b>출근·식대 확인 → 청구서 인쇄</b></p>
      <ul>
        <li>출근부에서 근무일수와 식대가 자동으로 넘어옵니다 (회색 숫자). 필요한 칸만 직접 고칩니다.</li>
        <li><b>일급·월급</b> 모두 계산합니다. 월급인 사람이 달 중간에 들어오거나 나가면 일할일수에 재직일수를 넣습니다.</li>
        <li><b>달 중간 단가 변경</b> — 급여 단가를 고치면 "○일부터 적용"을 고르는 창이 나옵니다. 일급↔월급 전환이나 인상이 달 중간에 있으면 그 날짜를 기준으로 나눠 계산합니다.</li>
        <li><b>식대</b> 메뉴 — 출근부의 식대 단가를 적용하거나 식대일수를 근무일수로 채웁니다.</li>
        <li><b>[자금청구서·지출결의서 인쇄]</b>, <b>[엑셀로 저장]</b>.</li>
        <li>🔒 표시가 있으면 관리자 잠금이 켜진 것입니다. 비공개 급여 인원은 관리자 모드에서만 보이고 인쇄됩니다.</li>
      </ul>`, 'pay')}

    ${sec('budget', `
      ${HELP_IMG.budget()}
      <p>현장 투입 전 <b>예산심의(案)</b>을 쓰고, 결재된 예산과 실제 쓴 돈을 비교합니다. 예산 단가·총액 안의 지출은 품의 없이 월결제로(구두보고), 넘거나 예산에 없으면 품의가 필요합니다.</p>
      <table class="t help-t"><tbody>
        <tr><th>예산 · 예산 작성</th><td>자주 쓰는 항목이 미리 들어 있습니다. 금액 = 인원·수량 × 단계별 일수(사전·본영업·사후) × 단가. 줄 위 <b>오른쪽 클릭</b> = 줄 추가(위·아래)·복사·삭제, <b>⠿</b> 를 끌어 순서 바꾸기(같은 계정 안).</td></tr>
        <tr><th>예산 · 인력 일정</th><td>출근부 모양의 표에 날짜별 인원을 넣습니다. 칸을 끌어서 고르고 숫자 키를 누르면 한 번에 들어갑니다. 인건비의 인원·일수는 여기서만 정합니다 (월급은 일수 ÷ 30 × 월급).</td></tr>
        <tr><th>예산 · 현장 정보</th><td>제목·작성자·세대수·수수료 총액·실비 지원·영업 일정(투입일·오픈일·선착순 → 사전·본영업·사후 기간)·비고.</td></tr>
        <tr><th>손익 · 예산 대비 집행</th><td>계정별 최초·전용·현재 예산, 집행, 남은 금액, 집행률. 예산 외·초과는 "품의 필요"로 표시됩니다. 인건비 단가도 확인합니다. 인쇄·엑셀.</td></tr>
        <tr><th>손익 · 현장 손익</th><td>아래 그림. 한 해의 수익·지출을 월별로 봅니다.</td></tr>
      </tbody></table>
      <ul>
        <li><b>결재</b> — 결재가 끝나면 [결재완료로]를 누르고 결재본 스캔을 붙입니다. 잠긴 뒤에는 고칠 수 없고, 늘릴 때는 <b>[전용·증액 품의 작성]</b> → 결재 → 예산 대비 집행에서 [반영]. 최초 예산은 그대로 보이고 바뀐 기록이 쌓입니다. 잘못 눌렀으면 [결재완료 취소].</li>
        <li><b>파일</b> — 저장 ▾ → 예산안 파일(회사 양식 갑지·세부내역 엑셀)로 저장, [📥 예산안 파일 가져오기]로 읽기. 예전 엑셀 예산안도 읽습니다.</li>
        <li><b>잠금</b> — 경리 모드에서는 이 탭이 잠기고, 예산 금액은 파일에서도 암호화됩니다.</li>
      </ul>
      ${HELP_IMG.pl()}
      <ul>
        <li><b>현장 손익</b> — <b>회색 = 자동 계산</b>이라 대부분 입력할 것이 없습니다 (수익은 매출 청구, 지출은 카드·전도금·월결제·인건비·품의서에서 옴). 법인카드·전도금은 부가세 포함, 월결제·품의서는 공급가 기준입니다.</li>
        <li>숫자를 직접 넣으면 그 값으로 고정되고(파랑), 지우면 자동으로 돌아갑니다. 항목 이름을 누르면 세부내역, 칸에서 <b>오른쪽 클릭</b>하면 메모.</li>
        <li>설정에 총 세대수를 넣어 두면 분양률도 계산합니다.</li>
      </ul>`, 'budget')}

    ${sec('bill', `
      ${HELP_IMG.bill()}
      <p>시행사·신탁사에 청구하는 돈을 관리합니다. 순서: <b>청구 추가 → 공문 → 세금계산서 → 입금 확인</b></p>
      <ul>
        <li><b>[+ 청구 추가]</b> 로 청구 건을 만들고, 줄을 눌러 공문 날짜·세금계산서 발행일·입금 내용을 차례로 적습니다. 표에는 기간·금액·청구월만 나오고 나머지는 눌러서 적습니다.</li>
        <li>위쪽 표에서 항목별 청구액·발행액·입금액·<b>미수금</b>을 봅니다. 입금 예정일이 지난 건은 경고가 뜹니다.</li>
        <li>여기 적은 청구는 <b>청구월</b> 기준으로 현장 손익의 수익에 자동 반영됩니다 (항목도 손익의 수익 항목과 같음).</li>
      </ul>`, 'bill')}

    ${sec('asset', `
      ${HELP_IMG.asset()}
      <p>순서: <b>구입·임차·소모품 등록 → 상태 관리 → 철수 때 회수 리스트</b></p>
      <ul>
        <li><b>[+ 추가]</b> 또는 <b>[엑셀에서 붙여넣기]</b> 로 등록합니다. 품의서의 표에서 [📦 자산 대장에 등록]으로 바로 넘길 수도 있습니다. 기간(입고~반납)은 달력에서 한 번에 고릅니다.</li>
        <li><b>사진 증빙</b> — 구입·임차 집기는 사진이 필요합니다. 줄을 누른 뒤 Ctrl+V 로 붙이거나 사진을 줄 위로 끌어다 놓으면 됩니다.</li>
        <li><b>상태</b> — 사용 / 회수 / 회수불가(사유) 로 관리합니다. 같은 품목을 계속 쓰면 연장 처리합니다.</li>
        <li><b>인쇄</b> — 집기 임차 현황표, 소모품 차수별 단가표, 철수 회수 리스트, 자산 사진 대장.</li>
      </ul>`, 'asset')}

    ${sec('mobile', `
      ${HELP_IMG.mobile()}
      <p>직원이 휴대폰으로 찍은 영수증을 <b>사진 옮기기 없이</b> 경리 PC로 바로 보냅니다. 아이폰·안드로이드 모두 되고, 직원은 앱 설치나 로그인이 필요 없습니다.</p>
      <ol>
        <li><b>처음 한 번 (경리 PC)</b> — <b>설정 → 휴대폰 앱</b>에서 [드롭박스 연결]을 누르고, 열린 창에서 이 PC의 드롭박스 계정으로 <b>[허용]</b>을 누릅니다. 사진함 폴더는 자동으로 찾습니다.</li>
        <li><b>링크 나눠 주기</b> — 같은 화면에서 현장의 [링크 만들기·복사]를 눌러 현장 단톡방에 붙여 넣습니다. 직원은 링크를 누르고 이름만 적으면 됩니다 (홈 화면에 추가해 두면 앱처럼 씁니다).</li>
        <li><b>찍어서 보내기 (휴대폰)</b> — 영수증을 찍으면 모서리를 찾아 반듯하게 펴 줍니다. 법인카드/전도금을 고르고 보냅니다. 전파가 약해 못 보낸 사진은 휴대폰에 모아 두었다가 다시 보냅니다.</li>
        <li><b>받기 (경리 PC)</b> — 위 막대의 <b>[📱 휴대폰 영수증]</b>을 누릅니다 (자동으로 확인하지 않으니, 보냈다는 연락을 받으면 누르세요). 사진마다 현장·법인카드/전도금을 확인하고 저장하면 영수증 확인 창으로 이어집니다. 방금 보냈는데 안 보이면 드롭박스가 내려받는 중이니 잠시 뒤 다시 누릅니다.</li>
      </ol>
      <ul>
        <li><b>보안</b> — 링크로는 사진을 <b>보내기만</b> 할 수 있고, 회사 자료나 보낸 영수증은 볼 수 없습니다. 받은 사진은 경리가 확인한 뒤에만 장부에 들어갑니다.</li>
        <li><b>퇴사자·링크 유출</b> — [새 링크로 바꾸기] → 새 링크를 단톡방에 다시 올립니다. 한 링크만 막으려면 [막기], 전부 막으려면 문제 해결 → [모든 링크 막기].</li>
        <li>한 현장을 여러 사람이 맡아도 같은 링크를 쓰면 됩니다. 한 사람이 여러 현장을 맡으면 "전체 현장" 링크를 주면 보낼 때 현장을 고릅니다. 받을 때도 현장을 바꿀 수 있습니다.</li>
      </ul>`)}

    ${sec('settings', `
      ${HELP_IMG.settings()}
      <table class="t help-t"><tbody>
        <tr><th>현장 정보·결재</th><td>현장 이름, 문서번호 앞부분, 결재라인, 실무책임자 서명(현장마다 따로, 현장 폴더에 저장), 전도금 계좌, 품의서 첫 번호, 카드 사용기간 시작일, 총 세대수</td></tr>
        <tr><th>직원·카드</th><td>직원 명단(구분·급여 형태·입퇴사일)과 법인카드 등록</td></tr>
        <tr><th>정산 기한</th><td>월결제 마감일·자금집행일 등 기한, 가맹점 이름으로 세목을 채우는 자동 입력 규칙</td></tr>
        <tr><th>영수증 AI</th><td>영수증 사진과 품의서 초안을 AI 로 읽기 위한 키 입력</td></tr>
        <tr><th>휴대폰 앱</th><td>드롭박스 연결, 현장별 설치 링크 만들기·바꾸기·막기 (15. 휴대폰 영수증 앱)</td></tr>
        <tr><th>관리자 잠금</th><td>정직원 급여·현장 손익·예산을 비밀번호로 가립니다. 비밀번호는 현장마다 따로입니다. 위 막대의 🔒 경리 모드 / 🔓 관리자 단추로 잠그고 풉니다.</td></tr>
        <tr><th>현장 철수</th><td>철수할 때 챙길 일 체크리스트</td></tr>
        <tr><th>현장·데이터 관리</th><td>현장 추가, 회사 현장 폴더 연결·바꾸기, 영수증 보관 폴더, 현장 합치기</td></tr>
      </tbody></table>`, 'settings')}

    ${sec('tips', `
      ${HELP_IMG.files()}
      <ul>
        <li><b>되돌리기</b> — 잘못 고쳤으면 <b>Ctrl+Z</b>, 다시 하려면 <b>Ctrl+Y</b>. 프로그램 어디서든 되고, 지운 파일도 30분 안에는 되돌릴 수 있습니다.</li>
        <li><b>사진 붙여넣기</b> — 법인카드·전도금 화면에서 캡처하거나 복사한 영수증 사진을 <b>Ctrl+V</b> 로 바로 붙일 수 있습니다.</li>
        <li><b>끌어다 놓기</b> — 영수증 사진·PDF 파일을 내역 줄 위에 끌어다 놓으면 그 내역에 붙습니다.</li>
        <li><b>✂ 스캔 편집</b> — 비뚤어지거나 지저분한 영수증 사진을 스캔 앱처럼 반듯하고 하얗게 만듭니다 (영수증 확인 창, 사진 크게 보기).</li>
        <li><b>오른쪽 클릭</b> — 출근부 칸(사진·지각 사유), 법인카드·전도금 줄(한 건 삭제), 품의서 표(행·열), 예산 줄(추가·복사·삭제), 현장 손익 칸(메모)에서 씁니다.</li>
        <li><b>기간 고르기</b> — 항공권 예약처럼 달력에서 시작일과 끝일을 차례로 누릅니다. 하루만 고르면 하루로 들어갑니다.</li>
        <li><b>파일 보관</b> — 각 화면 아래쪽의 "파일 보관"을 열면 증빙 파일과 결재받은 스캔본을 올리고 볼 수 있습니다. 올린 파일은 현장 폴더 안 정해진 자리에 저장됩니다.</li>
        <li><b>엑셀로 저장</b> — 대부분의 화면에서 회사 양식 그대로 엑셀로 저장할 수 있습니다.</li>
        <li><b>단추에 마우스 올리기</b> — 설명이 필요한 단추는 마우스를 올리면 도움말이 나옵니다.</li>
      </ul>`)}

    ${sec('faq', `
      <dl class="help-faq">
        <dt>저장 버튼이 없는데 저장은 어떻게 하나요?</dt>
        <dd>고칠 때마다 자동으로 데이터 폴더에 저장됩니다. 위 막대의 저장 상태 글자로 확인할 수 있습니다.</dd>
        <dt>다른 PC에서도 쓸 수 있나요?</dt>
        <dd>데이터 폴더가 Dropbox 처럼 같이 쓰는 폴더라면, 다른 PC에서 같은 폴더를 열면 그대로 이어서 쓸 수 있습니다. 두 PC에서 동시에 고치지는 마세요.</dd>
        <dt>"다른 PC에서 먼저 수정된 파일이 있어 덮어쓰지 않았습니다" 라고 나옵니다.</dt>
        <dd>다른 곳에서 먼저 고친 내용이 있다는 뜻입니다. 보통은 <b>[폴더에서 다시 불러오기]</b> 를 누르세요. 지금 화면의 내용이 맞다고 확실할 때만 [내 내용으로 덮어쓰기]를 누릅니다.</dd>
        <dt>폴더를 고르라는 화면이 매번 나옵니다.</dt>
        <dd>브라우저 보안 때문에 프로그램을 열 때마다 [📁 폴더 열기]를 한 번 눌러 허용해야 합니다.</dd>
        <dt>메뉴에 🔒 가 붙어 있거나 급여가 빠져 있습니다.</dt>
        <dd>관리자 잠금이 켜진 경리 모드입니다. 🔒 메뉴를 누르거나 위 막대의 🔒 경리 모드 단추를 눌러 관리자 비밀번호를 넣으면 보입니다. <b>예산·손익</b> 탭은 경리 모드에서 늘 잠깁니다.</dd>
        <dt>휴대폰으로 보낸 영수증이 PC에 안 보입니다.</dt>
        <dd>위 막대의 [📱 휴대폰 영수증]을 눌러야 새로 확인합니다. 그래도 없으면 PC의 드롭박스가 아직 사진을 내려받는 중이니 잠시 뒤 다시 누르세요. 단추가 아예 없으면 <b>설정 → 휴대폰 앱</b>에서 연결 상태를 확인합니다.</dd>
        <dt>지난달 자료를 보려면?</dt>
        <dd>위 막대의 작업월을 ◀ 로 옮기면 됩니다.</dd>
        <dt>"새 버전이 있습니다" 라고 나옵니다.</dt>
        <dd>웹으로 쓰는 경우 프로그램이 고쳐지면 안내가 나옵니다. 안내대로 새로 고치면 됩니다. 자료는 그대로입니다.</dd>
      </dl>`)}
  </div>`;
}
