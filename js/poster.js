FILEV["poster"] = "2.20";
/* =====================================================================
   poster.js — TMDB 조회 계층
   · CONFIG.TMDB_KEY(직접) 또는 APPS_SCRIPT_URL(프록시) 중 가능한 경로 사용
   · ★ TMDB타입(ntype) 칼럼 우선. 타입 미기재 + ID 보유 시 movie→tv 폴백
   · 포스터/백드롭 localStorage 캐시 (키: pc2)
   ===================================================================== */

const pcache = JSON.parse(localStorage.getItem("pc3") || "{}");   // v2.12: 제목(t)까지 캐시하며 키 갱신
let _saveTimer = null;
function saveCache(){
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => {
    try { localStorage.setItem("pc3", JSON.stringify(pcache)); } catch(e){}
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

  let out = { p:null, b:null, t:null };
  try {
    if (r.tmdb){
      /* 타입 확정 → 그 타입만 / 미기재 → movie 후 tv 재시도 (재조회 스크립트와 동일 폴백) */
      const types = r.ntype ? [r.ntype] : ["movie","tv"];
      for (const ty of types){
        const d = await tmdb(`/${ty}/${r.tmdb}`);
        if (d && d.id){ out = { p: d.poster_path||null, b: d.backdrop_path||null,
                                 t: d.title || d.name || null }; r.ntype = r.ntype || ty; break; }
      }
    } else {
      /* ID 없음 → 멀티 검색 (카테고리로 타입 추론하지 않음) */
      const q = r.title.replace(/\(.*?\)/g,"").replace(/\b(IMAX|4DX|아이맥스|용아맥|조조|2차관람)\b/gi,"").trim();
      const d = await tmdb("/search/multi", { query: q });
      const hit = (d.results||[]).find(x => x.media_type==="movie" || x.media_type==="tv");
      if (hit) out = { p: hit.poster_path||null, b: hit.backdrop_path||null, t: null };  // 검색 폴백은 제목을 신뢰하지 않는다
    }
  } catch(e){}
  pcache[ck] = out; saveCache();
  return out;
}

async function posterFor(r){ return (await detailFor(r)).p; }
/* TMDB 공식 제목 — ID로 확정 조회한 경우에만 값이 있다 */
async function tmdbTitleFor(r){ return r.tmdb ? (await detailFor(r)).t : null; }
async function backdropFor(r){ return (await detailFor(r)).b; }

/* ---------------- 작품 메타 조회 (공용) ----------------
   ★ TMDB는 '감독'을 영화에만 시리즈 단위로 붙인다.
     TV는 created_by(기획자)뿐이라 다큐·리미티드 시리즈는 대개 비어 있고,
     실제 연출자는 에피소드별 크레딧(aggregate_credits)에 들어 있다. 그래서 2단계로 캔다. */
async function workMeta(kind, id){
  const out = { title:"", year:"", dirs:"", genres:"", countries:"", poster:"" };
  try {
    if (kind === "movie"){
      const d = await tmdb(`/movie/${id}`, { append_to_response: "credits" });
      if (!d || !d.id) return out;
      out.title = d.title || "";
      out.year = (d.release_date || "").slice(0,4);
      out.genres = (d.genres||[]).map(g=>g.name).join(", ");
      out.countries = (d.production_countries||[]).map(c=>c.name).join(", ");
      out.poster = d.poster_path || "";
      out.dirs = (d.credits?.crew||[]).filter(c=>c.job==="Director").map(c=>c.name).join(", ");
    } else {
      const d = await tmdb(`/tv/${id}`);
      if (!d || !d.id) return out;
      out.title = d.name || "";
      out.year = (d.first_air_date || "").slice(0,4);
      out.genres = (d.genres||[]).map(g=>g.name).join(", ");
      out.countries = (d.production_countries||[]).map(c=>c.name).join(", ");
      out.poster = d.poster_path || "";
      out.dirs = (d.created_by||[]).map(c=>c.name).join(", ");

      if (!out.dirs){                       // 2단계: 에피소드 크레딧에서 연출자 추출
        const ag = await tmdb(`/tv/${id}/aggregate_credits`);
        const crew = (ag?.crew || []).filter(c =>
          (c.jobs || []).some(j => /^(Director|Series Director|Co-Director)$/.test(j.job)));
        out.dirs = crew
          .sort((a,b) => (b.total_episode_count||0) - (a.total_episode_count||0))
          .slice(0, 3).map(c => c.name).join(", ");
      }
    }
  } catch(e){}
  return out;
}

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
