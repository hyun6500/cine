FILEV["explore"] = "2.20";
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
  { id:"ryear",  lb:"관람연도", hint:"내가 본 해", keys: r => [r.undated ? UNDATED_LB : String(r.y)] },
  { id:"pyear",  lb:"개봉연도", hint:"작품이 나온 해", keys: r => r.year ? [String(r.year)] : [] },
  { id:"plat",   lb:"플랫폼",   hint:"", keys: r => [r.plat || "미상"] },
  { id:"rate",   lb:"별점",     hint:"내가 남긴 별점 — 0.5점 단위",
    keys: r => { const v = parseRate(r.rate); return [v == null ? "미평가" : `★ ${rateStr(v)}`]; } },
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
    + `<span class="chip-sep"></span><button class="chip dupe${E.dupe?" on":""}" id="exp-dupe-btn">🧹 정리함${
        (() => { const n = cleanupCounts(); return n ? ` <i class="cbadge">${n}</i>` : ""; })()}</button>`;
  $$("#exp-axes .chip[data-axis]").forEach(b => b.onclick = () => {
    E.axis = b.dataset.axis; E.group = null; E.dupe = false; renderExplore();
  });
  $("#exp-dupe-btn").onclick = () => { E.dupe = !E.dupe; renderExplore(); };

  if (E.dupe){
    $("#exp-groups").style.display = "none";
    renderCleanup();
    return;
  }
  $("#exp-groups").style.display = "";

  /* 그룹 목록 */
  const ax = expAxis();
  const groups = topN(S.view.flatMap(r => ax.keys(r).map(k => ({k}))), x => x.k, 200);
  if (ax.id === "ryear" || ax.id === "pyear") groups.sort((a,b) => b[0].localeCompare(a[0]));
  if (ax.id === "rate") groups.sort((a,b) =>
    (parseRate(b[0]) ?? -1) - (parseRate(a[0]) ?? -1));      // 5점 → 0.5점 → 미평가
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
      const work = { title: t, year: yr, tmdb: String(x.id), ntype: x.media_type,
                     poster: x.poster_path || "", dir: name, genre: "", nation: "" };
      const d = document.createElement("div");
      d.className = "pcard sm unseen";
      d.innerHTML = `<div class="ph"><div class="t">${esc(t)}</div><div class="y">${esc(yr)}</div></div><img alt="">
        <div class="ov"><div class="t">${esc(t)}</div><div class="m">${esc(yr)} · ${x.media_type==="tv"?"시리즈":"영화"}</div></div>`;
      d.appendChild(wishBtn(work));
      if (x.poster_path){
        const img = d.querySelector("img");
        img.src = IMG + "w342" + x.poster_path;
        img.onload = () => { img.classList.add("ld"); d.querySelector(".ph")?.remove(); };
      }
      d.title = `${t} (${yr}) — 클릭하면 TMDB, ♡로 찜하기`;
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

/* ---------------- 정리함 ----------------
   ① 중복 후보 ② 작품 정보 없음(TMDB 미연결·감독/장르 공란) ③ 제목 미상 ④ 날짜 미상 */
function cleanupTargets(){
  const ignored = dupeIgnoreSet();
  return {
    dupe:   findDupeGroups().filter(g => !ignored.has(g.key)),
    /* ★ 감독 공란은 '정보 없음' 사유에서 뺐다.
       TMDB가 TV 시리즈에 감독을 안 주는 경우가 많아(다큐·리미티드 시리즈), 채울 수 없는 항목이
       목록에 영원히 남아버린다. 채울 수 있는 것(TMDB 연결·장르)만 기준으로 삼는다. */
    noinfo: S.rows.filter(r => !isJunkTitle(r.title) && (!r.tmdb || !r.genre)),
    junk:   S.rows.filter(r => isJunkTitle(r.title)),
    undated:S.rows.filter(r => r.undated),
  };
}
function cleanupCounts(){
  const t = cleanupTargets();
  return t.dupe.length + t.junk.length;      // 배지는 '손봐야 하는 것'만
}

function renderCleanup(){
  const el = $("#exp-detail");
  const T = cleanupTargets();
  const mode = S.explore.clean || "dupe";
  const TABS = [
    ["dupe",    "중복 후보",   T.dupe.length],
    ["title",   "제목 다름",   titleDiffs === null ? "?" : titleDiffs.length],
    ["junk",    "제목 미상",   T.junk.length],
    ["noinfo",  "정보 없음",   T.noinfo.length],
    ["undated", "날짜 미상",   T.undated.length],
  ];

  el.innerHTML = `
    <div class="exp-head"><h3>정리함</h3>
      <span class="cnt">손볼 거리를 모아 둔 곳</span></div>
    <div class="chips clean-tabs">${TABS.map(([k,lb,n]) =>
      `<button class="chip${mode===k?" on":""}" data-cm="${k}">${lb} <i>${n}</i></button>`).join("")}</div>
    <div id="clean-body"></div>`;

  el.querySelectorAll("[data-cm]").forEach(b => b.onclick = () => {
    S.explore.clean = b.dataset.cm; renderCleanup();
  });

  const body = $("#clean-body");
  if (mode === "dupe")  return renderDupeCheck(body, T.dupe);
  if (mode === "title") return renderTitleDiff(body);

  const list = T[mode];
  const desc = {
    junk:    "제목이 남아 있지 않은 기록입니다. 상세에서 제목을 채우거나, 같은 날 다른 기록과 중복이면 병합하세요.",
    noinfo:  "TMDB 연결이나 장르가 비어 있는 기록입니다. 상세의 ‘수정 → TMDB에서 찾기’로 한 번에 채워집니다. "
             + "감독이 비는 건 사유에서 뺐습니다 — TMDB가 TV 시리즈(특히 다큐·리미티드)에는 감독을 주지 않는 경우가 많아 "
             + "채울 수 없는 항목이기 때문입니다.",
    undated: "관람 시점을 모른 채 저장한 기록입니다. 날짜가 생각나면 상세에서 채우면 타임라인에도 나타납니다.",
  }[mode];

  body.innerHTML = `<p class="sub-p">${desc}</p>` + (list.length
    ? `<div class="clean-list">${list.slice(0, 200).map(r => `
        <div class="clean-r" data-no="${esc(r.no)}">
          <span class="mono">no.${esc(r.no)}</span>
          <span class="ti">${esc(r.title)}${seasonTag(r)}</span>
          <span class="mono sub2">${r.undated ? "날짜 미상" : esc(r.date)}${r.plat ? " · " + esc(r.plat) : ""}</span>
          <span class="miss">${[!r.tmdb?"TMDB":"", !r.dir?"감독":"", !r.genre?"장르":""].filter(Boolean).join("·")}</span>
          <button class="chip" data-fix="${esc(r.no)}">수정</button>
        </div>`).join("")}
       ${list.length > 200 ? `<div class="sub-p">외 ${list.length-200}건</div>` : ""}</div>`
    : '<div class="empty"><b>정리할 것이 없습니다 🎉</b></div>');

  body.querySelectorAll("[data-fix]").forEach(b => b.onclick = () => {
    const r = S.rows.find(x => String(x.no) === b.dataset.fix);
    if (r) openEdit(r);
  });
}

/* ---------------- 제목 다름 ----------------
   TMDB와 연결된 기록의 제목을 공식 표기와 대조한다.
   표기가 한 곳으로 통일돼야 검색·중복점검·재관람 묶임이 일관되게 동작한다. */
let titleDiffs = null;      // null = 아직 대조 안 함

async function scanTitles(body){
  const mapped = S.rows.filter(r => r.tmdb);
  const prog = $("#tdiff-prog");
  const out = [];
  for (let i = 0; i < mapped.length; i++){
    const r = mapped[i];
    const t = await tmdbTitleFor(r);
    if (t && t.trim() && t.trim() !== r.title.trim()) out.push({ r, t: t.trim() });
    if (prog && i % 5 === 0) prog.textContent = `대조 중… ${i + 1}/${mapped.length} · 발견 ${out.length}`;
  }
  titleDiffs = out;
  renderCleanup();
}

function renderTitleDiff(body){
  if (titleDiffs === null){
    body.innerHTML = `<p class="sub-p">TMDB와 연결된 기록 ${S.rows.filter(r=>r.tmdb).length}건의 제목을
      공식 표기와 대조합니다. 처음 한 번은 조회에 시간이 걸리고, 이후엔 캐시에서 즉시 나옵니다.</p>
      <button class="primary" id="tdiff-go">제목 대조 시작</button>
      <div class="sub-p" id="tdiff-prog"></div>`;
    $("#tdiff-go").onclick = e => { e.target.disabled = true; scanTitles(body); };
    return;
  }
  if (!titleDiffs.length){
    body.innerHTML = '<div class="empty"><b>모든 제목이 TMDB 표기와 같습니다 🎉</b></div>';
    return;
  }
  body.innerHTML = `<p class="sub-p">시트 제목과 TMDB 공식 제목이 다른 기록입니다.
      적용하면 시트의 <b>제목</b> 칼럼이 TMDB 표기로 바뀝니다. (관람 정보는 그대로)</p>
    <div class="fbtns"><button class="primary" id="tdiff-all">${titleDiffs.length}건 전체 적용</button>
      <button class="ghost" id="tdiff-rescan">다시 대조</button></div>
    <div class="clean-list">${titleDiffs.map((d, i) => `
      <div class="clean-r tdiff" data-i="${i}">
        <span class="mono">no.${esc(d.r.no)}</span>
        <span class="ti old">${esc(d.r.title)}</span>
        <span class="ti new">→ ${esc(d.t)}</span>
        <button class="chip" data-one="${i}">적용</button>
      </div>`).join("")}</div>`;

  body.querySelectorAll("[data-one]").forEach(b => b.onclick = () => applyTitles([titleDiffs[+b.dataset.one]]));
  $("#tdiff-all").onclick = () => applyTitles(titleDiffs.slice());
  $("#tdiff-rescan").onclick = () => { titleDiffs = null; renderCleanup(); };
}

async function applyTitles(list){
  if (!list.length) return;
  if (list.length > 1 && !window.confirm(`${list.length}건의 제목을 TMDB 표기로 바꿉니다.\n계속할까요?`)) return;
  if (!await ensureAuth("제목을 바꾸려면 비밀번호가 필요합니다.")) return;

  console.log("[cine] 제목 변경 전 값:");
  console.table(list.map(d => ({ no: d.r.no, 이전: d.r.title, 이후: d.t })));

  try {
    for (let i = 0; i < list.length; i += 100){        // 요청당 100건씩 나눠 전송
      const chunk = list.slice(i, i + 100);
      await gsPost({ action: "update",
        updates: chunk.map(d => ({ nos: [d.r.no], fields: { title: d.t } })) });
      chunk.forEach(d => { d.r.title = d.t; });
    }
    titleDiffs = titleDiffs.filter(d => !list.includes(d));
    buildKeys(); renderStrip(); applyFilters();
    renderCleanup();
    toast(`${list.length}건의 제목을 TMDB 표기로 맞췄습니다`);
  } catch(e){ toast("제목 변경 실패: " + e.message, "warn"); console.error(e); }
}

function renderDupeCheck(body, groups){
  const el = body || $("#exp-detail");
  const ignored = dupeIgnoreSet();
  const visible = groups || findDupeGroups().filter(g => !ignored.has(g.key));

  el.innerHTML = `
    ${ignored.size ? `<div class="exp-head sub2row"><span class="cnt">무시 ${ignored.size}건</span>
      <button class="chip" id="dupe-reset">무시 목록 초기화</button></div>` : ""}
    <p class="sub-p">같은 날짜에서 동일 ID·동일 제목·‘제목 미상’ 짝을 찾습니다.
      상영시각이 서로 다른 기록은 별도 관람으로 보고 후보에서 제외했어요.
      ‘제목 미상 짝’은 같은 날 다른 관람일 수도 있으니 동반·장소를 보고 판단하세요.
      ${canSeePrivate() ? "" : "<b>동반 정보는 잠금 해제(🔒) 후에 표시됩니다.</b>"}</p>
    ${visible.length ? visible.map((g, gi) => `
      <div class="dupe-g" data-gi="${gi}">
        <div class="dupe-h"><span class="mono">${esc(g.date)}</span><span class="kind">${esc(g.kind)}</span>
          <span class="dupe-btns"><button class="chip" data-merge="${gi}">병합</button><button class="chip" data-ign="${gi}">무시</button></span></div>
        ${g.rows.map(r => `<div class="dupe-r">
          <span class="mono">no.${esc(r.no)}</span>
          <span class="ti">${esc(r.title)}${seasonTag(r)}</span>
          <span class="mono sub2">${[r.plat, r.time, r.src].filter(Boolean).map(esc).join(" · ")}</span>
          <span class="sub2">${canSeePrivate() ? esc(r.memo||"") : ""}</span>
        </div>`).join("")}
      </div>`).join("")
    : '<div class="empty"><b>남은 중복 후보가 없습니다 🎉</b></div>'}`;

  el.querySelectorAll("[data-merge]").forEach(b => b.onclick = () => {
    mergeViewings(visible[+b.dataset.merge].rows);
  });
  el.querySelectorAll("[data-ign]").forEach(b => b.onclick = () => {
    dupeIgnoreAdd(visible[+b.dataset.ign].key);
    renderCleanup();
  });
  const rst = $("#dupe-reset");
  if (rst) rst.onclick = () => { try { localStorage.removeItem("dupIgnore"); } catch(e){} renderCleanup(); };
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
