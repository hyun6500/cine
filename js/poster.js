FILEV["poster"] = "2.9";
/* =====================================================================
   poster.js — TMDB 조회 계층
   · CONFIG.TMDB_KEY(직접) 또는 APPS_SCRIPT_URL(프록시) 중 가능한 경로 사용
   · ★ TMDB타입(ntype) 칼럼 우선. 타입 미기재 + ID 보유 시 movie→tv 폴백
   · 포스터/백드롭 localStorage 캐시 (키: pc2)
   ===================================================================== */

const pcache = JSON.parse(localStorage.getItem("pc2") || "{}");
let _saveTimer = null;
function saveCache(){
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => {
    try { localStorage.setItem("pc2", JSON.stringify(pcache)); } catch(e){}
  }, 800);
}

function tmdbReady(){ return !!(CONFIG.TMDB_KEY || CONFIG.APPS_SCRIPT_URL); }

/* 공통 TMDB GET — path 예: "/movie/496243", "/search/multi" */
async function tmdb(path, params = {}){
  if (CONFIG.TMDB_KEY){
    const q = new URLSearchParams({ api_key: CONFIG.TMDB_KEY, language: "ko-KR", ...params });
    const res = await fetch(`https://api.themoviedb.org/3${path}?${q}`);
    return res.json();
  }
  if (CONFIG.APPS_SCRIPT_URL){
    const q = new URLSearchParams({ action: "tmdb", path, language: "ko-KR", ...params });
    const res = await fetch(`${CONFIG.APPS_SCRIPT_URL}?${q}`);
    return res.json();
  }
  throw new Error("TMDB 접근 수단 없음 (TMDB_KEY 또는 APPS_SCRIPT_URL)");
}

/* 상세 {poster, backdrop} — 행 단위 캐시 */
async function detailFor(r){
  const ck = r.tmdb ? `d:${r.tmdb}:${r.ntype||"?"}` : `s:${r.key}:${r.year||""}:${r.season||""}`;
  if (ck in pcache) return pcache[ck];
  if (!tmdbReady()){ return { p:null, b:null }; }

  let out = { p:null, b:null };
  try {
    if (r.tmdb){
      /* 타입 확정 → 그 타입만 / 미기재 → movie 후 tv 재시도 (재조회 스크립트와 동일 폴백) */
      const types = r.ntype ? [r.ntype] : ["movie","tv"];
      for (const ty of types){
        const d = await tmdb(`/${ty}/${r.tmdb}`);
        if (d && d.id){ out = { p: d.poster_path||null, b: d.backdrop_path||null }; r.ntype = r.ntype || ty; break; }
      }
    } else {
      /* ID 없음 → 멀티 검색 (카테고리로 타입 추론하지 않음) */
      const q = r.title.replace(/\(.*?\)/g,"").replace(/\b(IMAX|4DX|아이맥스|용아맥|조조|2차관람)\b/gi,"").trim();
      const d = await tmdb("/search/multi", { query: q });
      const hit = (d.results||[]).find(x => x.media_type==="movie" || x.media_type==="tv");
      if (hit) out = { p: hit.poster_path||null, b: hit.backdrop_path||null };
    }
  } catch(e){}
  pcache[ck] = out; saveCache();
  return out;
}

async function posterFor(r){ return (await detailFor(r)).p; }
async function backdropFor(r){ return (await detailFor(r)).b; }

/* 포스터 월 레이지 로드 옵저버 — 대상 목록을 getter로 주입 */
function makePosterObserver(getList){
  const ob = new IntersectionObserver(es => {
    es.forEach(async e => {
      if (!e.isIntersecting) return;
      ob.unobserve(e.target);
      const r = getList()[+e.target.dataset.i];
      if (!r) return;
      const p = await posterFor(r);
      if (p){
        const img = e.target.querySelector("img");
        img.src = IMG + "w342" + p;
        img.onload = () => img.classList.add("ld");
        e.target.querySelector(".ph")?.remove();
      }
    });
  }, { rootMargin: "400px" });
  return ob;
}
let posterIO = null;   // main.js에서 초기화 (포스터 월 전용)
