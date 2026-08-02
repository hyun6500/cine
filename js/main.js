FILEV["main"] = "2.18";
/* =====================================================================
   main.js — [마지막 로드] init() 진입점
   ===================================================================== */

function init(){
  /* 포스터 월 레이지 로드 옵저버 */
  posterIO = makePosterObserver(() => S.wall.data);

  /* 탭 (하단 탭바) */
  $$(".tab").forEach(b => b.onclick = () => switchTab(b.dataset.tab));

  /* 헤더 아이콘 */
  $("#btn-add").onclick = () => switchTab("add");
  $("#btn-story").onclick = () => openStory();
  $("#btn-lock").onclick = () => {
    if (authAlive()) authLock();
    else ensureAuth("잠금을 해제하면 편집이 가능해지고, 동반/메모가 화면에 표시됩니다.");
  };
  updateLockUI();

  /* 검색 — 돋보기를 누르면 전체 화면 오버레이. 닫아도 보던 탭은 그대로 */
  $("#btn-search").onclick = () => openSearch();
  $("#so-close").onclick = () => closeSearch();
  /* 결과 없는 빈 영역을 눌러도 닫히게 (모바일에서 닫을 방법이 하나뿐이면 답답함) */
  $("#so-body").addEventListener("click", e => { if (e.target.id === "so-body") closeSearch(); });
  $("#q").addEventListener("input", e => onSearchInput(e.target.value));
  $("#q").addEventListener("keydown", e => { if (e.key === "Escape") closeSearch(); });

  /* 인증 모달 */
  $("#auth-ok").onclick = trySubmitAuth;
  $("#auth-cancel").onclick = () => closeAuthModal(false);
  $("#auth-x").onclick = () => closeAuthModal(false);
  $("#auth-bg").onclick = e => { if (e.target.id === "auth-bg") closeAuthModal(false); };
  $("#auth-pw").addEventListener("keydown", e => { if (e.key === "Enter") trySubmitAuth(); });

  /* 스토리 만들기 */
  $("#st-close").onclick = closeStory;
  $("#st-save").onclick = storyDownload;
  $("#st-share").onclick = storyShare;

  /* 더 보기 */
  $("#more").onclick = () => renderWallGrid(false);
  $("#more-d").onclick = () => renderDiary(false);

  /* 모달 3종 — 겹쳐 열릴 수 있으므로 위에서부터 닫는다 */
  $("#modal-x").onclick = closeModal;
  $("#modal-bg").onclick = e => { if (e.target.id==="modal-bg") closeModal(); };
  $("#edit-x").onclick = closeEdit;
  $("#edit-bg").onclick = e => { if (e.target.id==="edit-bg") closeEdit(); };
  $("#pk-x").onclick = closePicker;
  $("#picker-bg").onclick = e => { if (e.target.id==="picker-bg") closePicker(); };
  document.addEventListener("keydown", e => {
    if (e.key !== "Escape") return;
    if ($("#auth-bg").classList.contains("show")) closeAuthModal(false);
    else if ($("#picker-bg").classList.contains("show")) closePicker();
    else if ($("#edit-bg").classList.contains("show")) closeEdit();
    else if ($("#modal-bg").classList.contains("show")) closeModal();
    else if ($("#search-overlay").classList.contains("show")) closeSearch();
    else if ($("#story-overlay").classList.contains("show")) closeStory();
  });

  /* 데모 */
  $("#demo-btn").onclick = loadDemo;

  loadSheet();
}

/* ---------------- 내장 샘플 (CONFIG 입력 전 디자인 확인용) ---------------- */
const DEMO = [
/* date, cat, plat, place, title, eps, time, year, dir, genre, nation, season, ntype, tmdb, nflx */
["2026-07-26","시리즈","넷플릭스","","김부장 (리미티드 시리즈)","10","","2026","","드라마","한국","1","tv","296206","별로예요"],
["2026-07-26","영화","넷플릭스","","기생충","","","2019","봉준호","드라마, 스릴러","한국","","movie","496243","최고예요"],
["2026-07-18","영화","CGV","CGV 창원더시티 IMAX관","호프","","09:30","2025","","드라마","한국","","","",""],
["2026-07-12","영화","에무시네마","에무시네마 2관","샤이닝","","15:10","1980","스탠리 큐브릭","공포, 스릴러","미국","","movie","694",""],
["2026-04-07","영화","CGV","CGV 용산아이파크몰 IMAX관","프로젝트 헤일메리","","11:00","2026","필 로드, 크리스토퍼 밀러","SF","미국","","","",""],
["2025-03-30","시리즈","넷플릭스","","폭싹 속았수다","16","","2025","","드라마","한국","1","tv","219246","최고예요"],
["2025-02-26","영화","CGV","CGV 용산아이파크몰 16관","서브스턴스","","20:45","2024","코랄리 파르자","공포, SF","프랑스","","movie","933260",""],
["2024-10-07","시리즈","넷플릭스","","흑백요리사: 요리 계급 전쟁","12","","2024","","예능","한국","1","tv","259542","최고예요"],
["2023-08-20","영화","CGV","CGV 용산아이파크몰 IMAX관","오펜하이머","","","2023","크리스토퍼 놀란","드라마, 스릴러","미국","","movie","872585",""],
["2023-04-16","시리즈","넷플릭스","","성난 사람들 (시즌 1)","10","","2023","이성진","드라마","미국","1","tv","154385","최고예요"],
["2022-06-30","영화","","","헤어질 결심","","","2022","박찬욱","드라마, 미스터리","한국","","movie","705996","좋아요"],
["2022-07-10","영화","CGV","CGV 왕십리","헤어질 결심","","19:00","2022","박찬욱","드라마, 미스터리","한국","","movie","705996","좋아요"],
["2021-10-24","영화","CGV","CGV 용산아이파크몰 IMAX관","듄","","","2021","드니 빌뇌브","SF, 어드벤처","미국","","movie","438631",""],
["2020-06-13","영화","메가박스","메가박스 신촌 6관","위대한 쇼맨","","11:00","2017","마이클 그레이시","뮤지컬, 드라마","미국","","movie","316029",""],
["2020-06-13","영화","CGV","CGV 창원 1관","위대한 쇼맨","","16:40","2017","마이클 그레이시","뮤지컬, 드라마","미국","","movie","316029",""],
["2015-05-23","영화","","","매드맥스: 분노의 도로","","","2015","조지 밀러","액션, 어드벤처","호주","","movie","76341","최고예요"],
["2012-07-25","영화","","","도둑들","","","2012","최동훈","액션, 범죄","한국","","movie","121898",""],
];

function loadDemo(){
  S.rows = DEMO.map(d => ({
    no:"", date:d[0], start:d[0], cat:d[1], plat:d[2], place:d[3], title:d[4],
    eps:d[5], time:d[6], src:"demo", memo:"", rate:"", review:"",
    year:d[7], dir:d[8], genre:d[9], nation:d[10],  grade:"",
    season:d[11], ntype:d[12], tmdb:d[13], nflx:d[14],
    med: medium(d[2]), y:+d[0].slice(0,4), m:+d[0].slice(5,7), key:"",
  }));
  boot();
}

init();
