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
  const mo = Array(12).fill(0); V.forEach(r=>mo[r.m-1]++);
  const moMax = Math.max(...mo, 1);
  const reKeys = [...new Set(V.filter(r=>S.rewatch.has(r.key)).map(r=>r.key))];
  const re = reKeys.map(k => V.find(r=>r.key===k)).slice(0,7);
  const gmax = genres[0]?.[1]||1, dmax = dirs[0]?.[1]||1, pmax = places[0]?.[1]||1;
  const pc = v => V.length ? Math.round(v/V.length*100) : 0;
  const deg1 = 360*th/(V.length||1), deg2 = deg1 + 360*ott/(V.length||1);
  const catColors = {영화:"var(--marquee)",시리즈:"var(--glow)",드라마:"#8FB7E8",다큐멘터리:"#A9B4C4",예능:"#C8553D"};

  /* 넷플릭스 평가 분포 — 작품(key) 단위로 집계해 재관람 중복 제거 */
  const rated = {};
  V.forEach(r => { if (r.nflx) rated[r.key] = r.nflx; });
  const nf = { "최고예요":0, "좋아요":0, "별로예요":0 };
  Object.values(rated).forEach(v => { if (v in nf) nf[v]++; });
  const nfTotal = nf["최고예요"]+nf["좋아요"]+nf["별로예요"];
  const nfMax = Math.max(nf["최고예요"], nf["좋아요"], nf["별로예요"], 1);
  const nfColors = { "최고예요":"var(--ticket)", "좋아요":"var(--glow)", "별로예요":"var(--etc)" };

  /* ★ 채움 막대는 인라인으로도 display:block을 박는다 — 캐시된 구버전 CSS에서도 폭이 먹도록 */
  const FL = (pct, color) => `display:block;height:100%;border-radius:99px;min-width:2px;`
    + `width:${Math.max(pct, 1.5)}%;background:${color || "var(--marquee)"}`;

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
    ${cats.map(([k,v])=>`<div class="hb clickable" data-ax="cat" data-gv="${esc(k)}"><span class="nm">${esc(k)}</span><span class="tr" style="display:block"><span class="fl" style="${FL(v/(cats[0][1]||1)*100, catColors[k]||"var(--etc)")}"></span></span><span class="vl">${v}</span></div>`).join("")}
  </div></div>

  <div class="card c-4"><h3>월별 리듬 <span class="mono">SEASON</span></h3><div class="months">
    ${mo.map((v,i)=>`<div class="mo" style="background:rgba(245,185,66,${(v/moMax*0.34).toFixed(2)})"><span class="n">${i+1}월</span><span class="v">${v}</span></div>`).join("")}
  </div></div>

  <div class="card c-6"><h3>가장 자주 만난 장르 <span class="mono">GENRE · 클릭하면 모아보기</span></h3><div class="hbar" id="dash-genres">
    ${genres.map(([k,v])=>`<div class="hb clickable" data-ax="genre" data-gv="${esc(k)}"><span class="nm">${esc(k)}</span><span class="tr" style="display:block"><span class="fl" style="${FL(v/gmax*100)}"></span></span><span class="vl">${v}</span></div>`).join("")||'<div class="empty">장르 데이터 없음</div>'}
  </div></div>

  <div class="card c-6"><h3>가장 자주 만난 감독 <span class="mono">DIRECTOR</span></h3><div class="ranklist" id="dash-dirs">
    ${dirs.map(([k,v],i)=>`<div class="rk clickable" data-dir="${esc(k)}"><span class="no">${String(i+1).padStart(2,"0")}</span><span class="nm">${esc(k)}</span><span class="vl">${v}편</span></div>`).join("")||'<div class="empty">감독 데이터 없음</div>'}
  </div></div>

  <div class="card c-6"><h3>나의 극장 <span class="mono">THEATER</span></h3><div class="hbar" id="dash-places">
    ${places.map(([k,v])=>`<div class="hb clickable" data-ax="plat" data-gv="${esc(k.split(" ")[0])}"><span class="nm">${esc(k)}</span><span class="tr" style="display:block"><span class="fl" style="${FL(v/pmax*100)}"></span></span><span class="vl">${v}회</span></div>`).join("")||'<div class="empty">극장 기록 없음</div>'}
  </div></div>

  <div class="card c-6"><h3>넷플릭스 평가 분포 <span class="mono">MY RATINGS · 작품 기준</span></h3>
    ${nfTotal ? `<div class="hbar">
      ${["최고예요","좋아요","별로예요"].map(k=>`<div class="hb"><span class="nm">${NFLX[k].ico} ${k}</span><span class="tr" style="display:block"><span class="fl" style="${FL(nf[k]/nfMax*100, nfColors[k])}"></span></span><span class="vl">${nf[k]}</span></div>`).join("")}
    </div><div class="nf-note">평가한 작품 ${nfTotal}편 · ‘최고예요’ 비율 ${Math.round(nf["최고예요"]/nfTotal*100)}%</div>`
    : '<div class="empty">이 범위엔 넷플릭스 평가가 없습니다</div>'}
  </div>

  <div class="card c-6"><h3>다시 꺼내 본 작품 <span class="mono">REWATCH</span></h3><div class="ranklist" id="dash-re">
    ${re.map((r,i)=>`<div class="rk clickable" data-key="${esc(r.key)}"><span class="no">${String(i+1).padStart(2,"0")}</span><span class="nm">${esc(r.title)}</span><span class="vl">${V.filter(x=>x.key===r.key).length}회</span></div>`).join("")||'<div class="empty">재관람 없음</div>'}
  </div></div>`;

  countUp($("#kpi-total"), V.length);

  /* 감독 클릭 → 탐색 탭 감독 상세 / 재관람 클릭 → 모달 / 막대 클릭 → 해당 축 모아보기 */
  $$("#dash-dirs .rk").forEach(el => el.onclick = () => openDirector(el.dataset.dir));
  $$("#dash-grid .hb.clickable").forEach(el => el.onclick = () => openExplore(el.dataset.ax, el.dataset.gv));
  $$("#dash-re .rk").forEach(el => el.onclick = () => {
    const r = V.find(x=>x.key===el.dataset.key);
    if (r) openModal(r);
  });
}

RENDERERS.dash = renderDash;
