FILEV["dash"] = "2.22";
/* =====================================================================
   page-dash.js — 대시보드
   KPI · 매체 도넛 · 카테고리 · 월별 리듬 · 장르/감독/극장 TOP ·
   재관람 · 넷플릭스 평가 분포(신규)
   ===================================================================== */

function renderDash(){
  const V = S.view;
  const th = V.filter(r=>r.med==="th").length,
        ott = V.filter(r=>r.med==="ott").length,
        etc = V.length - th - ott;
  $("#dash-cnt").textContent = `${V.length.toLocaleString()}편`;

  const genres = topN(V.flatMap(r=>r.genre?r.genre.split(",").map(s=>s.trim()):[]).map(g=>({g})), x=>x.g, 8);
  const dirs   = topN(V.filter(r=>r.dir), r=>r.dir.split(",")[0].trim(), 7);
  const places = topN(V.filter(r=>r.med==="th"&&r.place), r=>{
    const m = r.place.match(/^(CGV|메가박스|롯데시네마|아트하우스모모|씨네큐브|에무시네마)\s*(\S*)/);
    return m ? `${m[1]} ${m[2]}`.trim() : r.plat; }, 7);
  const cats = topN(V, r=>r.cat, 5);
  const mo = Array(12).fill(0); V.forEach(r=>{ if (r.m) mo[r.m-1]++; });
  const moMax = Math.max(...mo, 1);
  const reKeys = [...new Set(V.filter(r=>S.rewatch.has(r.key)).map(r=>r.key))];
  /* ★ 관람 횟수 내림차순으로 정렬 (예전엔 정렬이 없어 최근 기록이 1위로 올라왔다) */
  const re = reKeys.map(k => ({ r: V.find(x=>x.key===k), n: V.filter(x=>x.key===k).length }))
    .filter(x => x.r)
    .sort((a,b) => b.n - a.n || (a.r.date < b.r.date ? 1 : -1))
    .slice(0, 7);
  const reMax = re[0]?.n || 1;
  const gmax = genres[0]?.[1]||1, dmax = dirs[0]?.[1]||1, pmax = places[0]?.[1]||1;
  const pc = v => V.length ? Math.round(v/V.length*100) : 0;
  const deg1 = 360*th/(V.length||1), deg2 = deg1 + 360*ott/(V.length||1);
  const catColors = {영화:"#F5B942",시리즈:"#5E9BD6",드라마:"#8FB7E8",다큐멘터리:"#A9B4C4",예능:"#C8553D"};

  /* 넷플릭스 평가 분포 — 작품(key) 단위로 집계해 재관람 중복 제거 */
  const rated = {};
  V.forEach(r => { if (r.nflx) rated[r.key] = r.nflx; });
  const nf = { "최고예요":0, "좋아요":0, "별로예요":0 };
  Object.values(rated).forEach(v => { if (v in nf) nf[v]++; });
  const nfTotal = nf["최고예요"]+nf["좋아요"]+nf["별로예요"];
  const nfMax = Math.max(nf["최고예요"], nf["좋아요"], nf["별로예요"], 1);
  const nfColors = { "최고예요":"#C8553D", "좋아요":"#5E9BD6", "별로예요":"#4A5260" };

  /* ★ 내 별점 분포 (v2.15) — 넷플릭스 평가와 같은 방식으로 작품(key) 단위 집계.
     한 작품을 여러 번 봤으면 가장 높은 별점을 그 작품의 별점으로 본다. */
  const rateOf = {};
  V.forEach(r => {
    const v = parseRate(r.rate);
    if (v == null) return;
    rateOf[r.key] = Math.max(rateOf[r.key] ?? 0, v);
  });
  const allKeys = new Set(V.map(r => r.key));
  const STEPS = [5, 4.5, 4, 3.5, 3, 2.5, 2, 1.5, 1, 0.5];
  const rateHist = STEPS.map(v => [v, Object.values(rateOf).filter(x => x === v).length])
    .filter(([v,c]) => c > 0);
  const ratedN = Object.keys(rateOf).length;
  const unratedN = allKeys.size - ratedN;
  const rateMaxC = Math.max(...rateHist.map(x => x[1]), 1);
  const rateAvg = ratedN ? (Object.values(rateOf).reduce((a,b)=>a+b,0) / ratedN) : 0;

  /* ★ 막대는 자식 요소 없이 '그라디언트 한 겹'으로 그린다.
     중첩 span/div도, width 계산도, CSS 클래스도 필요 없어 어떤 스타일 환경에서도 동일하게 보인다. */
  const RK = (i, name, pct, val, color, attrs) => {
    const p = Math.max(Math.round(pct * 10) / 10, 2), c = color || "#F5B942";
    return `<div class="rk clickable"${attrs || ""}>`
      + `<span class="no">${String(i+1).padStart(2,"0")}</span>`
      + `<span class="nm">${name}</span>`
      + `<span class="tr" style="display:block;width:100%;height:8px;border-radius:99px;`
      + `background:linear-gradient(to right, ${c} 0%, ${c} ${p}%, #10141A ${p}%, #10141A 100%)"></span>`
      + `<span class="vl">${val}</span></div>`;
  };

  const HB = (name, pct, val, color, attrs) => {
    const p = Math.max(Math.round(pct * 10) / 10, 2);
    const c = color || "#F5B942";
    const bar = `display:block;width:100%;height:10px;border-radius:99px;`
      + `background:linear-gradient(to right, ${c} 0%, ${c} ${p}%, #10141A ${p}%, #10141A 100%)`;
    return `<div class="hb${attrs ? " clickable" : ""}"${attrs || ""}>`
      + `<span class="nm">${name}</span>`
      + `<span class="tr" style="${bar}"></span>`
      + `<span class="vl">${val}</span></div>`;
  };

  $("#dash-grid").innerHTML = `
  <div class="card c-12"><div class="kpis">
    <div class="kpi"><div class="big" id="kpi-total">0</div><div class="lb">총 관람</div></div>
    <div class="kpi"><div class="big amber">${th}</div><div class="lb">극장 (${pc(th)}%)</div></div>
    <div class="kpi"><div class="big blue">${ott}</div><div class="lb">OTT·홈 (${pc(ott)}%)</div></div>
    <div class="kpi"><div class="big" style="color:var(--dim)">${etc}</div><div class="lb">기타·미상</div></div>
    <div class="kpi"><div class="big" style="color:var(--ticket)">${reKeys.length}</div><div class="lb">재관람 작품</div></div>
  </div></div>

  <div class="card c-4"><h3>어디서 봤나 <span class="mono">MEDIUM</span></h3>
    <div class="donut-wrap">
      <div class="donut" style="background:conic-gradient(var(--marquee) 0deg ${deg1}deg,var(--glow) ${deg1}deg ${deg2}deg,var(--etc) ${deg2}deg 360deg)">
        <div class="c"><b>${pc(th)}%</b><span>극장</span></div></div>
      <div class="dleg">
        <span><i style="background:var(--marquee)"></i>극장<span class="v">${th}</span></span>
        <span><i style="background:var(--glow)"></i>OTT·홈<span class="v">${ott}</span></span>
        <span><i style="background:var(--etc)"></i>기타<span class="v">${etc}</span></span>
      </div></div></div>

  <div class="card c-4"><h3>카테고리 <span class="mono">FORMAT · 클릭하면 모아보기</span></h3><div class="hbar" id="dash-cats">
    ${cats.map(([k,v])=>HB(esc(k), v/(cats[0][1]||1)*100, v, catColors[k]||"#4A5260", ` data-ax="cat" data-gv="${esc(k)}"`)).join("")}
  </div></div>

  <div class="card c-4"><h3>월별 리듬 <span class="mono">SEASON</span></h3><div class="months">
    ${mo.map((v,i)=>`<div class="mo" style="background:rgba(245,185,66,${(v/moMax*0.34).toFixed(2)})"><span class="n">${i+1}월</span><span class="v">${v}</span></div>`).join("")}
  </div></div>

  <div class="card c-6"><h3>가장 자주 만난 장르 <span class="mono">GENRE · 클릭하면 모아보기</span></h3><div class="hbar" id="dash-genres">
    ${genres.map(([k,v])=>HB(esc(k), v/gmax*100, v, null, ` data-ax="genre" data-gv="${esc(k)}"`)).join("")||'<div class="empty">장르 데이터 없음</div>'}
  </div></div>

  <div class="card c-6"><h3>가장 자주 만난 감독 <span class="mono">DIRECTOR</span></h3><div class="ranklist" id="dash-dirs">
    ${dirs.map(([k,v],i)=>RK(i, esc(k), v/dmax*100, v+"편", null, ` data-dir="${esc(k)}"`)).join("")||'<div class="empty">감독 데이터 없음</div>'}
  </div></div>

  <div class="card c-6"><h3>나의 극장 <span class="mono">THEATER</span></h3><div class="hbar" id="dash-places">
    ${places.map(([k,v])=>HB(esc(k), v/pmax*100, v+"회", null, ` data-ax="plat" data-gv="${esc(k.split(" ")[0])}"`)).join("")||'<div class="empty">극장 기록 없음</div>'}
  </div></div>

  <div class="card c-6"><h3>넷플릭스 평가 분포 <span class="mono">MY RATINGS · 작품 기준</span></h3>
    ${nfTotal ? `<div class="hbar">
      ${["최고예요","좋아요","별로예요"].map(k=>HB(`${NFLX[k].ico} ${k}`, nf[k]/nfMax*100, nf[k], nfColors[k])).join("")}
    </div><div class="nf-note">평가한 작품 ${nfTotal}편 · ‘최고예요’ 비율 ${Math.round(nf["최고예요"]/nfTotal*100)}%</div>`
    : '<div class="empty">이 범위엔 넷플릭스 평가가 없습니다</div>'}
  </div>

  <div class="card c-6"><h3>내 별점 분포 <span class="mono">MY STARS · 작품 기준 · 클릭하면 모아보기</span></h3>
    ${ratedN ? `<div class="hbar" id="dash-stars">
      ${rateHist.map(([v,c]) => HB(`★ ${rateStr(v)}`, c/rateMaxC*100, c, "#F5B942",
        ` data-rate="${v >= 5 ? "5" : v >= 4.5 ? "4.5" : v >= 4 ? "4" : v >= 3 ? "3" : "low"}"`)).join("")}
      ${unratedN ? HB("미평가", unratedN/Math.max(rateMaxC,unratedN)*100, unratedN, "#3A414E", ' data-rate="none"') : ""}
    </div><div class="nf-note">별점을 남긴 작품 ${ratedN}편 · 평균 ★ ${rateAvg.toFixed(2)}${
      unratedN ? ` · 아직 ${unratedN}편이 미평가` : ""}</div>`
    : '<div class="empty">이 범위엔 별점 기록이 없습니다 — 상세에서 별을 눌러 남길 수 있어요</div>'}
  </div>

  <div class="card c-6"><h3>다시 꺼내 본 작품 <span class="mono">REWATCH</span></h3><div class="ranklist" id="dash-re">
    ${re.map(({r,n},i)=>RK(i, esc(r.title), n/reMax*100, n+"회", "#C8553D", ` data-key="${esc(r.key)}"`)).join("")||'<div class="empty">재관람 없음</div>'}
  </div></div>`;

  countUp($("#kpi-total"), V.length);

  /* 감독 클릭 → 탐색 탭 감독 상세 / 재관람 클릭 → 모달 / 막대 클릭 → 해당 축 모아보기 */
  $$("#dash-dirs .rk").forEach(el => el.onclick = () => openDirector(el.dataset.dir));
  $$("#dash-grid .hb.clickable").forEach(el => el.onclick = () => openExplore(el.dataset.ax, el.dataset.gv));
  /* 별점 막대 → 포스터 월에서 그 구간만 모아보기 */
  $$("#dash-stars .hb").forEach(el => el.onclick = () => {
    S.wall.rate = el.dataset.rate; S.wall.shown = 0;
    S.dirty.wall = true;
    switchTab("wall");
    toast(`별점 ${RATE_BUCKETS.find(b=>b.id===el.dataset.rate)?.lb || ""} 만 모아 봅니다`);
  });
  $$("#dash-re .rk").forEach(el => el.onclick = () => {
    const r = V.find(x=>x.key===el.dataset.key);
    if (r) openModal(r);
  });
}

RENDERERS.dash = renderDash;
