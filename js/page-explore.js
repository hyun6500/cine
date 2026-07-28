/* =====================================================================
   page-explore.js — 탐색
   축: 장르 / 감독 / 연도 / 플랫폼 / 국가 → 그룹 목록 → 작품 그리드
   감독 상세: 내 관람작 + TMDB person credits 대조 '아직 안 본 작품'
   ===================================================================== */

/* 축 목록. ★ '카테고리'(형식: 영화/시리즈/드라마/다큐/예능)와 '장르'(내용: 드라마/액션/…)는
   이름이 겹치는 값이 있어도 층위가 다르다. 라벨과 설명으로 구분해 표기한다. */
const EXP_AXES = [
  { id:"cat",    lb:"카테고리", hint:"형식 — 영화 · 시리즈 · 드라마 · 다큐멘터리 · 예능",
    keys: r => r.cat ? [r.cat] : [] },
  { id:"genre",  lb:"장르",     hint:"내용 — KOBIS·TMDB 장르 태그",
    keys: r => r.genre  ? r.genre.split(",").map(s=>s.trim()) : [] },
  { id:"dir",    lb:"감독",     hint:"", keys: r => r.dir ? r.dir.split(",").map(s=>s.trim()) : [] },
  { id:"ryear",  lb:"관람연도", hint:"내가 본 해", keys: r => [String(r.y)] },
  { id:"pyear",  lb:"개봉연도", hint:"작품이 나온 해", keys: r => r.year ? [String(r.year)] : [] },
  { id:"plat",   lb:"플랫폼",   hint:"", keys: r => [r.plat || "미상"] },
  { id:"nation", lb:"국가",     hint:"", keys: r => r.nation ? r.nation.split(",").map(s=>s.trim()) : [] },
];

let expIO = null;      // 탐색 그리드 레이지 로드
let expList = [];      // 현재 그리드 데이터

function expAxis(){ return EXP_AXES.find(a => a.id === S.explore.axis); }

function renderExplore(){
  const E = S.explore;
  /* 축 칩 + 중복 점검 */
  $("#exp-axes").innerHTML = EXP_AXES.map(a =>
    `<button class="chip${!E.dupe && E.axis===a.id?" on":""}" data-axis="${a.id}"${a.hint?` title="${esc(a.hint)}"`:""}>${a.lb}</button>`).join("")
    + `<span class="chip-sep"></span><button class="chip dupe${E.dupe?" on":""}" id="exp-dupe-btn">🧹 중복 점검</button>`;
  $$("#exp-axes .chip[data-axis]").forEach(b => b.onclick = () => {
    E.axis = b.dataset.axis; E.group = null; E.dupe = false; renderExplore();
  });
  $("#exp-dupe-btn").onclick = () => { E.dupe = !E.dupe; renderExplore(); };

  if (E.dupe){
    $("#exp-groups").style.display = "none";
    renderDupeCheck();
    return;
  }
  $("#exp-groups").style.display = "";

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

  /* 카테고리 축은 층위가 달라서, 그 안의 장르 분포를 함께 보여준다 */
  let subline = "";
  if (ax.id === "cat"){
    const rows = S.view.filter(r => r.cat === E.group);
    const gs = topN(rows.flatMap(r => r.genre ? r.genre.split(",").map(s=>({g:s.trim()})) : []), x=>x.g, 8);
    if (gs.length) subline = `<div class="exp-sub">이 카테고리의 장르 ${gs.map(([g,c]) =>
      `<button class="gpill xlink2" data-g="${esc(g)}">${esc(g)} <i>${c}</i></button>`).join("")}</div>`;
  }

  el.innerHTML = `
    <div class="exp-head">
      <h3><span class="axlb">${esc(ax.lb)}</span>${esc(E.group)}</h3>
      <span class="cnt">${items.length}편 관람</span>
      ${ax.id==="dir" ? '<button class="chip" id="exp-wall-btn">포스터 월에서 검색</button>' : ""}
    </div>
    ${subline}
    <div class="exp-grid" id="exp-grid"></div>
    ${ax.id==="dir" ? `<div class="exp-unseen" id="exp-unseen">
        <div class="exp-head sub"><h3>아직 안 본 작품</h3><span class="cnt mono">TMDB FILMOGRAPHY</span></div>
        <div class="loading sm" id="unseen-loading">필모그래피 대조 중…</div>
        <div class="exp-grid" id="unseen-grid"></div>
      </div>` : ""}`;

  el.querySelectorAll(".xlink2").forEach(b => b.onclick = () => openExplore("genre", b.dataset.g));

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

/* ==================================================================
   중복 점검 — 같은 날짜 안에서 후보 그룹 탐지
   규칙: ① 같은 TMDB_ID+시즌 ② 정규화 제목 일치(끝 숫자 다르면 별개 — normT가 숫자를
   보존하므로 자동 배제) ③ 한쪽이 의미 없는 제목 + 다른 쪽이 정식 제목
   제외: 상영시각이 서로 다른 조합(같은 날 다른 회차 관람은 별도 기록이 맞음)
   ================================================================== */

function dupeIgnoreSet(){
  try { return new Set(JSON.parse(localStorage.getItem("dupIgnore") || "[]")); } catch(e){ return new Set(); }
}
function dupeIgnoreAdd(key){
  const s = dupeIgnoreSet(); s.add(key);
  try { localStorage.setItem("dupIgnore", JSON.stringify([...s])); } catch(e){}
}

/* 시각 호환: 둘 다 시각이 있고 값이 다르면 별도 관람 */
const timeCompat = (a, b) => !(a.time && b.time && a.time !== b.time);

function findDupeGroups(){
  const byDate = {};
  S.rows.forEach(r => { (byDate[r.date] = byDate[r.date] || []).push(r); });
  const groups = [], seen = new Set();

  Object.values(byDate).forEach(rows => {
    if (rows.length < 2) return;
    for (let i = 0; i < rows.length; i++){
      const a = rows[i];
      if (seen.has(a.no)) continue;
      const grp = [a];
      for (let j = i+1; j < rows.length; j++){
        const b = rows[j];
        if (seen.has(b.no) || !timeCompat(a, b)) continue;
        const sameId = a.tmdb && b.tmdb && a.tmdb === b.tmdb && (a.season||"") === (b.season||"");
        const sameTitle = !isJunkTitle(a.title) && !isJunkTitle(b.title) && normT(a.title) === normT(b.title)
                          && !(a.tmdb && b.tmdb && a.tmdb !== b.tmdb);   // ID가 서로 다르면 동명이작
        const junkPair = (isJunkTitle(a.title) !== isJunkTitle(b.title));
        if (sameId || sameTitle || junkPair) grp.push(b);
      }
      if (grp.length >= 2){
        grp.forEach(x => seen.add(x.no));
        const kind = grp.some(x => isJunkTitle(x.title)) ? "제목미상 짝"
                   : (grp[0].tmdb ? "동일 ID" : "동일 제목");
        groups.push({ key: grp.map(x=>x.no).sort().join("-"), date: grp[0].date, kind, rows: grp });
      }
    }
  });
  return groups.sort((a,b) => a.date < b.date ? 1 : -1);
}

function renderDupeCheck(){
  const el = $("#exp-detail");
  const ignored = dupeIgnoreSet();
  const groups = findDupeGroups();
  const visible = groups.filter(g => !ignored.has(g.key));

  el.innerHTML = `
    <div class="exp-head"><h3>중복 점검</h3>
      <span class="cnt">후보 ${visible.length}그룹${ignored.size ? ` · 무시 ${ignored.size}` : ""}</span>
      ${ignored.size ? '<button class="chip" id="dupe-reset">무시 목록 초기화</button>' : ""}
    </div>
    <p class="sub-p">같은 날짜에서 동일 ID·동일 제목·‘제목 미상’ 짝을 찾습니다.
      상영시각이 서로 다른 기록은 별도 관람으로 보고 후보에서 제외했어요.
      ‘제목 미상 짝’은 같은 날 다른 관람일 수도 있으니 동반·장소를 보고 판단하세요.</p>
    ${visible.length ? visible.map((g, gi) => `
      <div class="dupe-g" data-gi="${gi}">
        <div class="dupe-h"><span class="mono">${esc(g.date)}</span><span class="kind">${esc(g.kind)}</span>
          <span class="dupe-btns"><button class="chip" data-merge="${gi}">병합</button><button class="chip" data-ign="${gi}">무시</button></span></div>
        ${g.rows.map(r => `<div class="dupe-r">
          <span class="mono">no.${esc(r.no)}</span>
          <span class="ti">${esc(r.title)}${seasonTag(r)}</span>
          <span class="mono sub2">${[r.plat, r.time, r.src].filter(Boolean).map(esc).join(" · ")}</span>
          <span class="sub2">${esc(r.memo||"")}</span>
        </div>`).join("")}
      </div>`).join("")
    : '<div class="empty"><b>남은 중복 후보가 없습니다 🎉</b></div>'}`;

  el.querySelectorAll("[data-merge]").forEach(b => b.onclick = () => {
    mergeViewings(visible[+b.dataset.merge].rows);
  });
  el.querySelectorAll("[data-ign]").forEach(b => b.onclick = () => {
    dupeIgnoreAdd(visible[+b.dataset.ign].key);
    renderDupeCheck();
  });
  const rst = $("#dupe-reset");
  if (rst) rst.onclick = () => { try { localStorage.removeItem("dupIgnore"); } catch(e){} renderDupeCheck(); };
}

/* 외부 진입점 — 상세 모달의 감독·연도·장르·국가·플랫폼 클릭, 대시보드 감독 랭킹 */
function openExplore(axis, group){
  if (!EXP_AXES.some(a => a.id === axis)) return;
  S.explore.axis = axis;
  S.explore.group = group;
  S.explore.dupe = false;
  S.dirty.explore = true;
  switchTab("explore");
  $("#sec-explore").scrollIntoView({ block: "start", behavior: "smooth" });
}
function openDirector(name){ openExplore("dir", name); }

RENDERERS.explore = renderExplore;
