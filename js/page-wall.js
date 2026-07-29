FILEV["wall"] = "2.11";
/* =====================================================================
   page-wall.js — 포스터 월 (Letterboxd식 그리드)
   칩: 카테고리 / 극장·OTT / 장르 / 넷플릭스평가(신규) · 정렬 4종 · 무한 더보기
   배지: 매체 · 再(재관람) · 👍👍(넷플릭스평가)
   ===================================================================== */

function wallData(){
  let d = [...S.view];
  const f = S.wall;
  if (f.cat)   d = d.filter(r=>r.cat===f.cat);
  if (f.med)   d = d.filter(r=>r.med===f.med);
  if (f.genre) d = d.filter(r=>r.genre.includes(f.genre));
  if (f.nflx)  d = d.filter(r=>r.nflx===f.nflx);
  if (f.text){                       // 이 목록 안에서만 걸러내기 (전역 검색과 별개)
    const t = f.text.toLowerCase();
    d = d.filter(r => r.title.toLowerCase().includes(t) || (r.dir||"").toLowerCase().includes(t));
  }
  if (f.sort==="recent")  d.sort((a,b)=>a.date<b.date?1:-1);
  if (f.sort==="old")     d.sort((a,b)=>a.date>b.date?1:-1);
  if (f.sort==="title")   d.sort((a,b)=>a.title.localeCompare(b.title,"ko"));
  if (f.sort==="release") d.sort((a,b)=>(b.year||"0").localeCompare(a.year||"0"));
  return d;
}

function renderWallChips(){
  const f = S.wall;
  const gs = topN(S.view.flatMap(r=>r.genre?r.genre.split(",").map(s=>s.trim()):[]).map(g=>({g})), x=>x.g, 10).map(x=>x[0]);
  const chip = (lb, on, fn) => `<button class="chip${on?" on":""}" data-fn="${fn}">${lb}</button>`;

  $("#wall-chips").innerHTML =
    chip("전체", !f.cat && !f.med && !f.nflx, "reset") +
    CONFIG.SCOPE.map(c=>chip(c, f.cat===c, "cat:"+c)).join("") +
    '<span class="chip-sep"></span>' +
    chip("극장", f.med==="th", "med:th") + chip("OTT·홈", f.med==="ott", "med:ott") +
    '<span class="chip-sep"></span>' +
    chip("👍👍 최고예요", f.nflx==="최고예요", "nflx:최고예요") +
    chip("👍 좋아요", f.nflx==="좋아요", "nflx:좋아요") +
    chip("👎 별로예요", f.nflx==="별로예요", "nflx:별로예요") +
    '<span class="chip-sep"></span>' +
    `<select class="chip" id="gsel"><option value="">장르 전체</option>${gs.map(g=>`<option ${f.genre===g?"selected":""}>${esc(g)}</option>`).join("")}</select>` +
    `<select class="chip" id="ssel">
      <option value="recent" ${f.sort==="recent"?"selected":""}>최근 관람순</option>
      <option value="old" ${f.sort==="old"?"selected":""}>오래된 순</option>
      <option value="title" ${f.sort==="title"?"selected":""}>제목순</option>
      <option value="release" ${f.sort==="release"?"selected":""}>개봉연도순</option></select>` +
    `<span class="wfilter"><input type="search" id="wtext" placeholder="이 목록에서 걸러내기" value="${esc(f.text||"")}"></span>`;

  $$("#wall-chips .chip[data-fn]").forEach(b => b.onclick = () => {
    const [k,v] = b.dataset.fn.split(":");
    if (k==="reset"){ f.cat=null; f.med=null; f.genre=null; f.nflx=null; }
    if (k==="cat")  f.cat  = f.cat===v ? null : v;
    if (k==="med")  f.med  = f.med===v ? null : v;
    if (k==="nflx") f.nflx = f.nflx===v ? null : v;
    f.shown = 0; renderWallChips(); renderWallGrid(true);
  });
  $("#gsel").onchange = e => { f.genre = e.target.value||null; f.shown=0; renderWallGrid(true); };
  $("#ssel").onchange = e => { f.sort = e.target.value; f.shown=0; renderWallGrid(true); };
  const wt = $("#wtext");
  let wtTimer = null;
  wt.oninput = e => {
    clearTimeout(wtTimer);
    const v = e.target.value;
    wtTimer = setTimeout(() => { f.text = v; f.shown = 0; renderWallGrid(true); }, 150);
  };
}

function renderWallGrid(reset){
  const f = S.wall;
  f.data = wallData();
  $("#wall-cnt").textContent = `${f.data.length.toLocaleString()}편`;
  const el = $("#wall");
  if (reset){ el.innerHTML=""; f.shown=0; }
  if (!f.data.length){
    el.innerHTML = '<div class="empty" style="grid-column:1/-1"><b>조건에 맞는 작품이 없습니다</b>필터를 바꿔보세요</div>';
    $("#more").style.display = "none"; return;
  }
  const next = f.data.slice(f.shown, f.shown+60);
  next.forEach((r,j) => {
    const i = f.shown + j;
    const d = document.createElement("div");
    d.className = "pcard"; d.dataset.i = i; d.tabIndex = 0;
    d.setAttribute("role","button"); d.setAttribute("aria-label", r.title);
    d.innerHTML = `<div class="ph"><div class="t">${esc(r.title)}${seasonTag(r)}</div><div class="y">${esc(r.year||r.date.slice(0,4))}</div></div>
      <img alt="">
      <span class="badge ${r.med}">${r.med==="th"?"극장":r.med==="ott"?"OTT":"기타"}</span>
      ${S.rewatch.has(r.key) ? '<span class="badge re">再</span>' : ""}
      ${nflxBadge(r)}
      <div class="ov"><div class="t">${esc(r.title)}${seasonTag(r)}</div><div class="m">${esc(r.date)} · ${esc(r.dir?r.dir.split(",")[0]:r.cat)}</div></div>`;
    d.onclick = () => openModal(r);
    d.onkeydown = e => { if (e.key==="Enter") openModal(r); };
    el.appendChild(d); posterIO.observe(d);
  });
  f.shown += next.length;
  $("#more").style.display = f.shown < f.data.length ? "" : "none";
}

function renderWall(){ renderWallChips(); renderWallGrid(true); }

RENDERERS.wall = renderWall;
