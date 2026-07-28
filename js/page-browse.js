/* =====================================================================
   page-browse.js — 둘러보기 (넷플릭스 문법)
   빌보드 · 다시 꺼내 본 TOP 10 · 인생작 셀렉션(넷플릭스평가) · 가로 캐러셀
   ===================================================================== */

function renderBrowse(){
  const el = $("#browse"); el.innerHTML = "";
  const V = S.view;
  if (!V.length){ el.innerHTML = '<div class="empty"><b>기록이 없습니다</b></div>'; return; }

  /* ---- 빌보드: 최근 관람 중 TMDB 있는 첫 작품 ---- */
  const hero = V.find(r=>r.tmdb) || V[0];
  const bb = document.createElement("div"); bb.className = "bb";
  bb.innerHTML = `<div class="bg"></div><div class="in">
    <div class="eyeb">RECENTLY WATCHED · ${esc(hero.date)}</div>
    <h2>${esc(hero.title)}${seasonTag(hero)}</h2>
    <div class="bmeta">${[hero.year, hero.dir?`감독 <b>${esc(hero.dir.split(",")[0])}</b>`:"", hero.genre?esc(hero.genre.split(",").slice(0,3).join(" · ")):""].filter(Boolean).join(" · ")}</div>
    <div class="btns"><button class="play">▶ 상세 보기</button><button class="sec2">이 작품 검색</button></div>
  </div>`;
  bb.querySelector(".play").onclick = () => openModal(hero);
  bb.querySelector(".sec2").onclick = () => searchFor(hero.title);
  el.appendChild(bb);
  backdropFor(hero).then(b => {
    const bg = bb.querySelector(".bg");
    if (b){ bg.style.backgroundImage = `url(${IMG}w1280${b})`; bg.classList.add("ld"); }
    else posterFor(hero).then(p => {
      if (p){ bg.style.backgroundImage = `url(${IMG}w780${p})`; bg.style.backgroundPosition = "center 12%"; bg.classList.add("ld"); }
    });
  });

  /* ---- 다시 꺼내 본 TOP 10 ---- */
  const rc = {}; V.forEach(r => { rc[r.key] = (rc[r.key]||0)+1; });
  const top10 = Object.entries(rc).filter(([k,v])=>v>1).sort((a,b)=>b[1]-a[1]).slice(0,10)
    .map(([k,v]) => ({ r: V.find(x=>x.key===k), v })).filter(x=>x.r);
  if (top10.length){
    const div = document.createElement("div"); div.className = "nrow";
    div.innerHTML = '<div class="rh"><h3>다시 꺼내 본 TOP 10</h3><span class="re">REWATCH</span></div>';
    const car = document.createElement("div"); car.className = "t10";
    top10.forEach((x,i) => {
      const it = document.createElement("div");
      it.className = "t10i"; it.tabIndex = 0; it.setAttribute("role","button");
      it.innerHTML = `<div class="bn">${i+1}</div><div class="pc"><img alt=""><div class="nt">${esc(x.r.title)}</div><span class="rc">${x.v}회</span></div>`;
      it.onclick = () => openModal(x.r);
      it.onkeydown = e => { if (e.key==="Enter") openModal(x.r); };
      posterFor(x.r).then(p => {
        if (p){ const img = it.querySelector("img"); img.src = IMG+"w342"+p; img.onload = () => img.classList.add("ld"); }
      });
      car.appendChild(it);
    });
    div.appendChild(car); el.appendChild(div);
  }

  /* ---- 내 별점 TOP ---- */
  const rated = [];
  const seenR = new Set();
  V.map(r => ({ r, v: parseRate(r.rate) })).filter(x => x.v != null)
    .sort((a,b) => b.v - a.v || (a.r.date < b.r.date ? 1 : -1))
    .forEach(x => { if (!seenR.has(x.r.key)){ seenR.add(x.r.key); rated.push(x); } });
  const topRated = rated.slice(0, 18);

  /* ---- 인생작 셀렉션 (넷플릭스 '최고예요') ---- */
  const best = dedupKey(V.filter(r=>r.nflx==="최고예요"), 18);

  /* ---- 가로 행들 ---- */
  const rows = [
    topRated.length ? nrowRated("내 별점 TOP", `★ 평가한 ${rated.length}편 중 상위`, topRated) : null,
    nrow("인생작 셀렉션", "넷플릭스 평가 👍👍 최고예요", best),
    nrow("최근 관람", "LATEST", dedupKey(V, 18)),
    nrow("극장의 밤", "THEATER · 텅스텐", dedupKey(V.filter(r=>r.med==="th"), 18)),
    nrow("홈 스크린", "OTT · 블루라이트", dedupKey(V.filter(r=>r.med==="ott"), 18)),
  ];
  const tg = topN(V.flatMap(r => r.genre ? r.genre.split(",").map(s=>s.trim()) : []).map(g=>({g})), x=>x.g, 2);
  tg.forEach(([g]) => rows.push(nrow(`${g} 몰아보기`, "GENRE", dedupKey(V.filter(r=>r.genre.includes(g)), 18))));
  rows.filter(Boolean).forEach(r => el.appendChild(r));
}

/* 별점 배지가 붙은 캐러셀 */
function nrowRated(title, eyebrow, items){
  const div = document.createElement("div"); div.className = "nrow";
  div.innerHTML = `<div class="rh"><h3>${esc(title)}</h3><span class="re">${esc(eyebrow)}</span></div>`;
  const car = document.createElement("div"); car.className = "ncar";
  items.forEach(({ r, v }) => {
    const c = ncard(r);
    const b = document.createElement("span");
    b.className = "badge ratebadge";
    b.textContent = `★ ${rateStr(v)}`;
    c.appendChild(b);
    car.appendChild(c);
  });
  div.appendChild(car);
  return div;
}

RENDERERS.browse = renderBrowse;
