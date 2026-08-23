FILEV["wall"] = "2.24";
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
  if (f.rate)  d = d.filter(r=>rateMatch(r, f.rate));
  if (f.text){                       // 이 목록 안에서만 걸러내기 (전역 검색과 별개)
    const t = f.text.toLowerCase();
    d = d.filter(r => r.title.toLowerCase().includes(t) || (r.dir||"").toLowerCase().includes(t));
  }
  if (f.sort==="recent")  d.sort((a,b)=>a.date<b.date?1:-1);
  if (f.sort==="old")     d.sort((a,b)=>a.date>b.date?1:-1);
  if (f.sort==="title")   d.sort((a,b)=>a.title.localeCompare(b.title,"ko"));
  if (f.sort==="release") d.sort((a,b)=>(b.year||"0").localeCompare(a.year||"0"));
  if (f.sort==="rate")    d.sort((a,b)=>(parseRate(b.rate) ?? -1) - (parseRate(a.rate) ?? -1)
                                        || (a.date < b.date ? 1 : -1));
  return d;
}

function renderWallChips(){
  const f = S.wall;
  const gs = topN(S.view.flatMap(r=>r.genre?r.genre.split(",").map(s=>s.trim()):[]), x=>x, 12).map(x=>x[0]);
  const on = v => v ? " on" : "";
  /* ★ v2.15: 칩을 죄다 뿌리지 않고 필터 그룹별 드롭다운으로 묶는다.
     화면이 짧은 모바일에서 칩 두 줄이 그리드를 밀어내던 문제도 함께 해결. */
  const sel = (id, lb, cur, opts) =>
    `<label class="wsel${on(cur)}"><span>${lb}</span><select id="${id}">
       <option value="">전체</option>
       ${opts.map(o => `<option value="${esc(o.v)}"${cur===o.v?" selected":""}>${esc(o.lb)}</option>`).join("")}
     </select></label>`;

  const active = [f.cat, f.med, f.nflx, f.rate, f.genre, f.text].filter(Boolean).length;

  $("#wall-chips").innerHTML =
    sel("wcat",  "분류",  f.cat,   CONFIG.SCOPE.filter(c => S.view.some(r=>r.cat===c)).map(c=>({v:c,lb:c}))) +
    sel("wmed",  "관람",  f.med,   [{v:"th",lb:"극장"},{v:"ott",lb:"OTT·홈"}]) +
    sel("wrate", "별점",  f.rate,  RATE_BUCKETS.map(b=>({v:b.id,lb:b.lb}))) +
    sel("wnflx", "평가",  f.nflx,  Object.keys(NFLX).map(k=>({v:k,lb:NFLX[k].ico+" "+k}))) +
    sel("gsel",  "장르",  f.genre, gs.map(g=>({v:g,lb:g}))) +
    `<label class="wsel wsort"><span>정렬</span><select id="ssel">
       <option value="recent" ${f.sort==="recent"?"selected":""}>최근 관람순</option>
       <option value="old" ${f.sort==="old"?"selected":""}>오래된 순</option>
       <option value="title" ${f.sort==="title"?"selected":""}>제목순</option>
       <option value="release" ${f.sort==="release"?"selected":""}>개봉연도순</option>
       <option value="rate" ${f.sort==="rate"?"selected":""}>별점 높은 순</option>
     </select></label>` +
    `<span class="wfilter"><input type="search" id="wtext" placeholder="이 목록에서 걸러내기" value="${esc(f.text||"")}"></span>` +
    (active ? `<button class="chip wreset" id="wall-reset">필터 해제 ${active}</button>` : "") +
    `<button class="chip story" id="wall-story" title="지금 걸러진 목록으로 인스타 스토리 이미지 만들기">🖼 스토리</button>`;

  const bind = (id, key) => { $("#"+id).onchange = e => {
    f[key] = e.target.value || null; f.shown = 0; renderWallChips(); renderWallGrid(true);
  }; };
  bind("wcat","cat"); bind("wmed","med"); bind("wrate","rate");
  bind("wnflx","nflx"); bind("gsel","genre");
  $("#ssel").onchange = e => { f.sort = e.target.value; f.shown=0; renderWallGrid(true); };

  const rs = $("#wall-reset");
  if (rs) rs.onclick = () => {
    f.cat=null; f.med=null; f.genre=null; f.nflx=null; f.rate=null; f.text="";
    f.shown=0; renderWallChips(); renderWallGrid(true);
  };

  /* 지금 화면에 걸러 둔 목록 그대로 스토리로 — '별점 4.5 이상만 모아 올리기' 같은 흐름 */
  $("#wall-story").onclick = () => openStory(dedupKey(wallData(), 4));

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
      ${parseRate(r.rate) != null ? `<span class="badge ratebadge wall">★${rateStr(parseRate(r.rate))}</span>` : ""}
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
