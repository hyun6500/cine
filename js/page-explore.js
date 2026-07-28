/* =====================================================================
   page-explore.js — 탐색
   축: 장르 / 감독 / 연도 / 플랫폼 / 국가 → 그룹 목록 → 작품 그리드
   감독 상세: 내 관람작 + TMDB person credits 대조 '아직 안 본 작품'
   ===================================================================== */

const EXP_AXES = [
  { id:"genre",  lb:"장르",     keys: r => r.genre  ? r.genre.split(",").map(s=>s.trim()) : [] },
  { id:"dir",    lb:"감독",     keys: r => r.dir    ? r.dir.split(",").map(s=>s.trim())   : [] },
  { id:"ryear",  lb:"관람연도", keys: r => [String(r.y)] },
  { id:"pyear",  lb:"개봉연도", keys: r => r.year ? [String(r.year)] : [] },
  { id:"plat",   lb:"플랫폼",   keys: r => [r.plat || "미상"] },
  { id:"nation", lb:"국가",     keys: r => r.nation ? r.nation.split(",").map(s=>s.trim()) : [] },
];

let expIO = null;      // 탐색 그리드 레이지 로드
let expList = [];      // 현재 그리드 데이터

function expAxis(){ return EXP_AXES.find(a => a.id === S.explore.axis); }

function renderExplore(){
  const E = S.explore;
  /* 축 칩 */
  $("#exp-axes").innerHTML = EXP_AXES.map(a =>
    `<button class="chip${E.axis===a.id?" on":""}" data-axis="${a.id}">${a.lb}</button>`).join("");
  $$("#exp-axes .chip").forEach(b => b.onclick = () => {
    E.axis = b.dataset.axis; E.group = null; renderExplore();
  });

  /* 그룹 목록 */
  const ax = expAxis();
  const groups = topN(S.view.flatMap(r => ax.keys(r).map(k => ({k}))), x => x.k, 200);
  if (ax.id === "ryear" || ax.id === "pyear") groups.sort((a,b) => b[0].localeCompare(a[0]));
  if (E.group && !groups.some(([k]) => k === E.group)) E.group = null;
  if (!E.group && groups.length) E.group = groups[0][0];

  $("#exp-groups").innerHTML = groups.map(([k,v]) =>
    `<button class="exp-g${E.group===k?" on":""}" data-g="${esc(k)}">
       <span class="nm">${esc(k)}</span><span class="vl">${v}</span></button>`).join("")
    || '<div class="empty">데이터 없음</div>';
  $$("#exp-groups .exp-g").forEach(b => b.onclick = () => { E.group = b.dataset.g; renderExplore(); });

  renderExpDetail();
}

function renderExpDetail(){
  const E = S.explore, ax = expAxis(), el = $("#exp-detail");
  if (!E.group){ el.innerHTML = '<div class="empty"><b>왼쪽에서 항목을 선택하세요</b></div>'; return; }

  const items = dedupKey(S.view.filter(r => ax.keys(r).includes(E.group)), 9999);
  el.innerHTML = `
    <div class="exp-head">
      <h3>${esc(E.group)}</h3>
      <span class="cnt">${items.length}편 관람</span>
      ${ax.id==="dir" ? '<button class="chip" id="exp-wall-btn">포스터 월에서 검색</button>' : ""}
    </div>
    <div class="exp-grid" id="exp-grid"></div>
    ${ax.id==="dir" ? `<div class="exp-unseen" id="exp-unseen">
        <div class="exp-head sub"><h3>아직 안 본 작품</h3><span class="cnt mono">TMDB FILMOGRAPHY</span></div>
        <div class="loading sm" id="unseen-loading">필모그래피 대조 중…</div>
        <div class="exp-grid" id="unseen-grid"></div>
      </div>` : ""}`;

  if (ax.id==="dir") $("#exp-wall-btn").onclick = () => searchFor(E.group);

  /* 관람작 그리드 */
  expList = items;
  expIO = makePosterObserver(() => expList);
  const grid = $("#exp-grid");
  items.forEach((r,i) => grid.appendChild(expCard(r, i)));

  if (ax.id==="dir") loadUnseen(E.group, items);
}

function expCard(r, i){
  const d = document.createElement("div");
  d.className = "pcard sm"; d.dataset.i = i; d.tabIndex = 0;
  d.setAttribute("role","button"); d.setAttribute("aria-label", r.title);
  d.innerHTML = `<div class="ph"><div class="t">${esc(r.title)}${seasonTag(r)}</div><div class="y">${esc(r.year||r.date.slice(0,4))}</div></div>
    <img alt="">${nflxBadge(r)}
    <div class="ov"><div class="t">${esc(r.title)}</div><div class="m">${esc(r.date)}</div></div>`;
  d.onclick = () => openModal(r);
  d.onkeydown = e => { if (e.key==="Enter") openModal(r); };
  expIO.observe(d);
  return d;
}

/* ---------------- 감독 미시청 필모 ---------------- */
async function loadUnseen(name, watchedItems){
  const loadEl = $("#unseen-loading"), grid = $("#unseen-grid");
  if (!tmdbReady()){
    loadEl.textContent = "TMDB 키 또는 Apps Script 프록시를 설정하면 미시청 필모그래피를 볼 수 있습니다.";
    return;
  }
  try {
    const s = await tmdb("/search/person", { query: name });
    const person = s.results?.[0];
    if (!person){ loadEl.textContent = `TMDB에서 ‘${name}’을(를) 찾지 못했습니다.`; return; }

    const c = await tmdb(`/person/${person.id}/combined_credits`);
    const directed = (c.crew||[]).filter(x => x.job === "Director");

    /* 내 기록과 대조: ID 우선, ID 없는 기록은 정규화 제목 폴백 */
    const myIds = new Set(S.rows.filter(r=>r.tmdb).map(r=>String(r.tmdb)));
    const myTitles = new Set(S.rows.map(r=>normT(r.title)));
    const seen = new Set();
    const unseen = directed.filter(x => {
      const id = String(x.id), t = x.title || x.name || "";
      const dk = x.media_type + ":" + id;
      if (seen.has(dk)) return false; seen.add(dk);
      return !myIds.has(id) && !myTitles.has(normT(t));
    }).sort((a,b) => (b.release_date||b.first_air_date||"").localeCompare(a.release_date||a.first_air_date||""));

    loadEl.style.display = "none";
    if (!unseen.length){ grid.innerHTML = '<div class="empty">이 감독의 연출작을 전부 봤습니다 🎉</div>'; return; }

    unseen.forEach(x => {
      const t = x.title || x.name || "(제목 없음)";
      const yr = (x.release_date || x.first_air_date || "").slice(0,4);
      const d = document.createElement("div");
      d.className = "pcard sm unseen";
      d.innerHTML = `<div class="ph"><div class="t">${esc(t)}</div><div class="y">${esc(yr)}</div></div><img alt="">
        <div class="ov"><div class="t">${esc(t)}</div><div class="m">${esc(yr)} · ${x.media_type==="tv"?"시리즈":"영화"}</div></div>`;
      if (x.poster_path){
        const img = d.querySelector("img");
        img.src = IMG + "w342" + x.poster_path;
        img.onload = () => { img.classList.add("ld"); d.querySelector(".ph")?.remove(); };
      }
      d.title = `${t} (${yr}) — TMDB에서 보기`;
      d.onclick = () => window.open(`https://www.themoviedb.org/${x.media_type}/${x.id}`, "_blank", "noopener");
      grid.appendChild(d);
    });
  } catch(e){
    loadEl.textContent = "필모그래피를 불러오지 못했습니다.";
    console.error(e);
  }
}

/* 외부 진입점 — 상세 모달의 감독·연도·장르·국가·플랫폼 클릭, 대시보드 감독 랭킹 */
function openExplore(axis, group){
  if (!EXP_AXES.some(a => a.id === axis)) return;
  S.explore.axis = axis;
  S.explore.group = group;
  S.dirty.explore = true;
  switchTab("explore");
  $("#sec-explore").scrollIntoView({ block: "start", behavior: "smooth" });
}
function openDirector(name){ openExplore("dir", name); }

RENDERERS.explore = renderExplore;
