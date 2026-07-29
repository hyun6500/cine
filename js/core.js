/* =====================================================================
   core.js — [로드 1순위]
   CONFIG · 상수 · 전역 상태 S · 시트 로딩/파싱 · 파생지표 · 필터 · 탭 라우팅
   ===================================================================== */

/* ---------------- CONFIG ----------------
   실제 값은 js/config.js 에서 설정합니다 (window.CINE_CONFIG).
   이 파일을 새 버전으로 덮어써도 개인 키는 보존됩니다. */
const CONFIG = Object.assign({
  SHEET_ID: "",
  SHEET_NAME: "시청기록",
  TMDB_KEY: "",              // ① 클라이언트 직접 호출 (v3 키, 노출됨)
  APPS_SCRIPT_URL: "",       // ② Apps Script 웹앱 URL — TMDB 프록시 + 기록 추가/수정 겸용
  /* APP_TOKEN 없음 — 편집 비밀번호는 사용자가 입력 (auth.js) */
  SCOPE: ["영화", "시리즈", "드라마", "다큐멘터리", "예능"],
}, window.CINE_CONFIG || {});

/* ---------------- 상수 ---------------- */
const APP_VERSION = "2.11";   // 푸터에 표시 — 배포된 버전 확인용
/* ★ 파일별 버전 도장. 각 js가 자기 버전을 등록하고, 푸터에 몇 개가 최신인지 표시한다.
   "코드는 고쳤는데 화면은 그대로"일 때 어느 파일이 서버에서 안 바뀌었는지 즉시 알 수 있다. */
const FILEV = { core: APP_VERSION };
function stampFooter(){
  const el = $("#appver");
  if (!el) return;
  const names = ["core","auth","poster","widgets","browse","dash","wall","diary","explore","search","wish","add","main"];
  const stale = names.filter(n => FILEV[n] !== APP_VERSION);
  el.textContent = stale.length
    ? `v${APP_VERSION} ⚠ 구버전 파일: ${stale.join(", ")} · `
    : `v${APP_VERSION} (${names.length}/${names.length}) · `;
  el.classList.toggle("bad", stale.length > 0);
  if (stale.length) console.warn("[cine] 갱신 안 된 파일:", stale.join(", "),
    "— 해당 js를 다시 올리거나 캐시를 지워주세요");
}
const THEATERS = ["CGV","메가박스","롯데시네마","아트하우스모모","씨네큐브","에무시네마","인디스페이스","마포아트센터"];
const OTTS = ["넷플릭스","디즈니+","티빙","웨이브","왓챠","쿠팡플레이","유튜브","OTT(미상)"];
const IMG = "https://image.tmdb.org/t/p/";
const NFLX = { "최고예요":{ico:"👍👍",cls:"best"}, "좋아요":{ico:"👍",cls:"good"}, "별로예요":{ico:"👎",cls:"bad"} };

/* ---------------- 전역 상태 ---------------- */
const S = {
  rows: [],            // 전체 (중도포기 제외, SCOPE 내)
  view: [],            // 연도·검색 필터 적용분
  year: null,          // 필름스트립 연도 필터
  q: "",               // 검색 오버레이 입력값 (전역 필터 아님)
  tab: "browse",
  rewatch: new Set(),  // 재관람 key
  wall:    { cat:null, med:null, genre:null, nflx:null, text:"", sort:"recent", shown:0, data:[] },
  diary:   { shown:0 },
  explore: { axis:"cat", group:null, dupe:false },
  wish:    [],         // 찜 목록 (page-wish.js)
  dirty:   { browse:true, dash:true, wall:true, diary:true, explore:true, wish:true, add:true },
};

/* ---------------- 유틸 ---------------- */
const $  = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
/* 제목 정규화 — ★ ! ? 는 작품을 가르는 정보라 남긴다 ('마더!'(아로노프스키) ≠ '마더'(봉준호)) */
const normT = t => (t||"").replace(/\(.*?\)/g,"").replace(/[\s,.\-:·'"“”<>《》「」~]/g,"").toLowerCase();
/* 백필용 — 원문 제목 그대로(공백만 정리). 정규화보다 엄격해 오병합을 막는다 */
const rawT = t => (t||"").trim().replace(/\s+/g," ").toLowerCase();

/* ★ 의미 없는 제목: 작품을 특정하지 못하므로 제목으로 행을 묶으면 안 된다
   ('(제목 미상)' 7행이 하나의 작품으로 묶여 랑종이 전파된 사고의 재발 방지) */
/* ★ 짧다고, 숫자라고 걸러선 안 된다 — '놉'·'듄'·'잠'·'1917'은 전부 실제 영화 제목이다.
   실제로 작품을 특정하지 못하는 표현만 열거한다. */
const JUNK_TITLE_RE = /^(\(?제목\s*미상\)?|영화|예매|아이맥스|imax|엄빠영화|독서모임|입장권|보드게임|넷플릭스|ott|극장|기타)$/i;
function isJunkTitle(t){
  t = (t||"").trim().replace(/\.0$/, "");
  return !t || JUNK_TITLE_RE.test(t);
}

function topN(arr, keyf, n){
  const c = {};
  arr.forEach(r => { const k = keyf(r); if (k) c[k] = (c[k]||0)+1; });
  return Object.entries(c).sort((a,b)=>b[1]-a[1]).slice(0, n);
}

/* 평점 파싱 — "4.5", "★4", "4점" 등 어떤 표기든 0~5 숫자로 (0.5 단위 반올림) */
function parseRate(v){
  const m = String(v ?? "").match(/\d+(\.\d+)?/);
  if (!m) return null;
  const n = Math.min(5, Math.max(0, parseFloat(m[0])));
  return Math.round(n * 2) / 2;
}
function rateStr(n){ return n == null ? "" : (Number.isInteger(n) ? String(n) : n.toFixed(1)); }

function medium(p){
  p = (p||"").trim();
  if (!p) return "etc";
  if (THEATERS.some(t=>p.startsWith(t))) return "th";
  if (OTTS.some(t=>p.startsWith(t))) return "ott";
  if (/^(EBS|SBS|KBS|MBC|tvN|JTBC)/.test(p)) return "ott";
  return "etc";
}

/* ---------------- CSV 파서 (따옴표 대응) ---------------- */
function parseCSV(text){
  const rows=[]; let row=[], cur="", q=false;
  for (let i=0;i<text.length;i++){
    const c = text[i];
    if (q){ if (c==='"'){ if (text[i+1]==='"'){cur+='"';i++;} else q=false; } else cur+=c; }
    else {
      if (c==='"') q=true;
      else if (c===',') { row.push(cur); cur=""; }
      else if (c==='\n'||c==='\r'){ if (c==='\r'&&text[i+1]==='\n') i++;
        row.push(cur); cur=""; if (row.some(x=>x!=="")) rows.push(row); row=[]; }
      else cur+=c;
    }
  }
  if (cur!==""||row.length){ row.push(cur); if (row.some(x=>x!=="")) rows.push(row); }
  return rows;
}

/* ---------------- 행 매핑 (칼럼 30개) ---------------- */
function mapRow(h, r){
  const g = n => { const i = h.indexOf(n); return i<0 ? "" : String(r[i] ?? "").trim(); };
  const date  = g("날짜(대표)").slice(0,10);
  const cat   = g("카테고리");
  const title = g("제목");
  const status = g("관람상태");
  if (status === "중도포기") return null;                 // ★ 규칙: 모든 집계·목록에서 제외
  /* ★ 날짜미상: 예전에 본 건 확실한데 관람 시점을 모르는 기록.
     연도·월 기반 화면(필름스트립·다이어리·월별리듬)에서는 빠지고, 작품 목록·별점에는 들어간다 */
  const undated = !date && status === "날짜미상";
  if ((!date && !undated) || !title || !CONFIG.SCOPE.includes(cat)) return null;

  const plat   = g("플랫폼/상영관");
  const tmdb   = g("TMDB_ID").replace(/\.0$/,"");
  const ntype  = g("TMDB타입").toLowerCase();             // ★ movie/tv — 카테고리로 추론 금지
  const season = g("시즌").replace(/\.0$/,"");

  return {
    no: g("no"), date, undated, status, start: g("시작일").slice(0,10)||date, cat, plat,
    place: g("위치/지점"), title, eps: g("화수"), time: g("상영시각"),
    src: g("출처"), note: g("비고(원본)"), memo: g("동반/메모"), rate: g("평점"), review: g("한줄평"),
    year: (g("개봉연도")||"").replace(/\.0$/,""),
    dir:  g("감독") || g("TMDB제작/감독"),                 // KOBIS 우선
    genre: (g("장르") || g("TMDB장르")).replace(/공포\(호러\)/g,"공포").replace(/모험/g,"어드벤처"),
    nation: g("제작국가"), grade: g("관람등급(KOBIS)"),
    tmdb, ntype, season,
    nflx: g("넷플릭스평가"),
    med: medium(plat),
    y: date ? +date.slice(0,4) : null, m: date ? +date.slice(5,7) : null,
    key: "",   // buildKeys()에서 부여
  };
}

/* 작품 동일성 키: TMDB_ID + 시즌 우선, 없으면 정규화 제목(+시즌)
   ★ 시즌이 있으면 같은 ID라도 다른 작품 (F1 시즌1·5·6·7·8 = 5편) */
function buildKeys(){
  // 1) 제목→ID 백필: 같은 작품인데 한쪽 행에만 ID가 있는 경우(재관람 지연기록 등) 보정
  //    ★ 의미 없는 제목은 시드로도, 대상으로도 쓰지 않는다 — 동일 문자열이어도 같은 작품이란 보장이 없음
  const t2id = {};
  S.rows.forEach(r => {
    if (r.tmdb && !isJunkTitle(r.title)) t2id[rawT(r.title)+"|"+(r.season||"")] = r.tmdb+"|"+r.ntype;
  });
  S.rows.forEach((r, i) => {
    if (!r.tmdb && !isJunkTitle(r.title)){
      const hit = t2id[rawT(r.title)+"|"+(r.season||"")];
      if (hit){ const [id,ty] = hit.split("|"); r.tmdb = id; r.ntype = r.ntype || ty; }
    }
    // 2) 작품 키 — 의미 없는 제목 + ID 없음 = 행마다 별개 작품
    r.key = r.tmdb ? `id:${r.tmdb}:s${r.season||0}`
          : isJunkTitle(r.title) ? `row:${r.no || "i"+i}`
          : normT(r.title);
  });
  // 3) 재관람 집합
  const c = {};
  S.rows.forEach(r => { c[r.key] = (c[r.key]||0)+1; });
  S.rewatch = new Set(Object.keys(c).filter(k => c[k] > 1));
}

/* ---------------- 데이터 로드 ---------------- */
async function loadSheet(){
  if (!CONFIG.SHEET_ID){
    $("#app-loading").style.display="none"; $("#setup").style.display="block"; return;
  }
  try {
    const url = `https://docs.google.com/spreadsheets/d/${CONFIG.SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(CONFIG.SHEET_NAME)}`;
    const t = await (await fetch(url)).text();
    const rows = parseCSV(t);
    const h = rows[0].map(x => x.trim());
    S.rows = rows.slice(1).map(r => mapRow(h, r)).filter(Boolean);
    await loadWish();                 // 찜 시트는 없어도 무방 (실패해도 진행)
    boot();
  } catch(e) {
    $("#app-loading").textContent = "시트를 불러오지 못했습니다 — 웹에 게시했는지, SHEET_ID가 맞는지 확인해 주세요.";
    console.error(e);
  }
}

function boot(){
  S.rows.sort((a,b) => a.date < b.date ? 1 : -1);
  buildKeys();
  $("#app-loading").style.display="none"; $("#setup").style.display="none";
  $("#app").style.display="block";
  renderStrip();
  renderWishBadge();
  applyChrome();
  stampFooter();
  applyFilters();
}

/* ---------------- 필름스트립 (전역 히어로) ---------------- */
function renderStrip(){
  const byY = {};
  S.rows.forEach(r => {
    if (r.undated) return;                    // 날짜 모르는 기록은 연도축에 올릴 수 없음
    (byY[r.y] = byY[r.y] || {th:0,ott:0,etc:0,t:0}); byY[r.y][r.med]++; byY[r.y].t++;
  });
  const years = Object.keys(byY).map(Number).sort();
  const max = Math.max(...years.map(y=>byY[y].t), 1);
  const el = $("#strip"); el.innerHTML = "";

  const all = document.createElement("button");
  all.className = "frame all" + (S.year===null ? " on" : "");
  all.innerHTML = `<div class="bar"><span>ALL</span></div><div class="yr">전체</div><div class="ct">${S.rows.length}</div>`;
  all.onclick = () => { S.year = null; renderStrip(); applyFilters(); };
  el.appendChild(all);

  years.forEach(y => {
    const d = byY[y], f = document.createElement("button");
    f.className = "frame" + (S.year===y ? " on" : "");
    const H = n => Math.round(n/max*86);
    f.innerHTML = `<div class="bar">
      <div class="seg th" style="height:${H(d.th)}px"></div>
      <div class="seg ott" style="height:${H(d.ott)}px"></div>
      <div class="seg etc" style="height:${H(d.etc)}px"></div>
      </div><div class="yr">${String(y).slice(2)}</div><div class="ct">${d.t}</div>`;
    f.setAttribute("aria-label", `${y}년 ${d.t}편`);
    f.onclick = () => { S.year = S.year===y ? null : y; renderStrip(); applyFilters(); };
    el.appendChild(f);
  });
}

/* ---------------- 전역 필터 (연도만) ----------------
   ★ 제목 검색은 전역 필터가 아니다. '이 작품을 찾겠다'는 목표물 찾기라
     대시보드 통계까지 한 작품으로 좁히면 오히려 사고처럼 보인다.
     검색은 별도 오버레이(page-search.js)에서 내 기록·찜·TMDB를 한 번에 보여준다.
     연도는 '그 해의 나'를 보는 관점 좁히기라 전역 유지. */
function applyFilters(){
  S.view = S.rows.filter(r => S.year===null || r.y===S.year);

  renderYearBar();
  $("#h-total").textContent = (S.year ? S.view.length : S.rows.length).toLocaleString();

  /* 전 탭 dirty 처리 후 현재 탭만 즉시 렌더 */
  ["browse","dash","wall","diary","explore"].forEach(t => S.dirty[t]=true);
  renderTab(S.tab);
}

/* ---------------- 연도 필터 (둘러보기 외 탭의 축소형) ----------------
   필름스트립은 자리를 많이 차지하므로 둘러보기에서만 노출하고,
   나머지 탭에서는 작은 셀렉트 하나로 줄인다. */
function renderYearBar(){
  const el = $("#yearbar");
  if (!el) return;
  const years = [...new Set(S.rows.map(r => r.y))].sort((a,b) => b - a);
  el.innerHTML = `<label class="yb-l" for="ysel">연도</label>
    <select id="ysel" class="yb-sel">
      <option value="">전체</option>
      ${years.map(y => `<option value="${y}"${S.year===y?" selected":""}>${y}년</option>`).join("")}
    </select>
    <span class="yb-cnt">${S.view.length.toLocaleString()}편</span>
    ${S.year ? '<button class="yb-clr" id="yclr">필터 해제</button>' : ""}`;
  $("#ysel").onchange = e => {
    S.year = e.target.value ? +e.target.value : null;
    renderStrip(); applyFilters();
  };
  const c = $("#yclr");
  if (c) c.onclick = () => { S.year = null; renderStrip(); applyFilters(); };
}

/* ---------------- 탭 라우팅 ---------------- */
const RENDERERS = {};   // page-*.js가 등록: RENDERERS.dash = renderDash ...

function renderTab(t){
  if (S.dirty[t] && RENDERERS[t]){ RENDERERS[t](); S.dirty[t]=false; }
}

function switchTab(t){
  S.tab = t;
  $$(".tab").forEach(b => b.classList.toggle("on", b.dataset.tab===t));
  $$("main section").forEach(s => s.classList.toggle("show", s.id==="sec-"+t));
  applyChrome();
  renderTab(t);
}

/* 상단 영역: 둘러보기에서만 히어로+필름스트립, 그 외엔 연도바만 */
function applyChrome(){
  const home = S.tab === "browse";
  $("#hero").classList.toggle("compact", !home);
  $("#legend").style.display = home ? "" : "none";
  $("#strip-wrap").style.display = home ? "" : "none";
  /* 연도 셀렉트는 편수와 같은 줄 오른쪽에. 둘러보기엔 필름스트립이 그 역할을 하므로 숨긴다 */
  $("#yearbar").style.display = home ? "none" : "flex";
}

/* 통합 검색 오버레이 열기 (빌보드 등에서 사용) */
function searchFor(s){ openSearch(s); }
