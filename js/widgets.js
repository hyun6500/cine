/* =====================================================================
   widgets.js — 공용 위젯
   상세 모달 · 토스트 · 카운트업 · 넷플릭스 평가 배지 · 캐러셀 카드
   ===================================================================== */

/* ---------------- 표시 헬퍼 ---------------- */
function seasonTag(r){ return r.season ? ` <span class="stag">S${esc(r.season)}</span>` : ""; }

function nflxBadge(r, big){
  if (!r.nflx || !NFLX[r.nflx]) return "";
  const n = NFLX[r.nflx];
  return `<span class="badge nfx ${n.cls}${big?" big":""}" title="넷플릭스 평가: ${r.nflx}">${n.ico}</span>`;
}

/* ---------------- 카운트업 ---------------- */
function countUp(el, to, ms = 700){
  if (matchMedia("(prefers-reduced-motion: reduce)").matches){ el.textContent = to.toLocaleString(); return; }
  const t0 = performance.now();
  (function tick(t){
    const p = Math.min((t-t0)/ms, 1), v = Math.round(to * (1-Math.pow(1-p,3)));
    el.textContent = v.toLocaleString();
    if (p < 1) requestAnimationFrame(tick);
  })(t0);
}

/* ---------------- 토스트 ---------------- */
function toast(msg, kind = ""){
  const t = document.createElement("div");
  t.className = "toast " + kind;
  t.textContent = msg;
  $("#toasts").appendChild(t);
  requestAnimationFrame(() => t.classList.add("in"));
  setTimeout(() => { t.classList.remove("in"); setTimeout(() => t.remove(), 300); }, 3200);
}

/* ---------------- 상세 모달 ---------------- */
/* 탐색 이동용 링크 조각 */
function xlink(axis, val, cls){
  return `<button class="xlink${cls?" "+cls:""}" data-ax="${esc(axis)}" data-gv="${esc(val)}">${esc(val)}</button>`;
}

function openModal(r){
  const all = S.rows.filter(x => x.key===r.key).sort((a,b) => a.date < b.date ? 1 : -1);
  const dirs = r.dir ? r.dir.split(",").map(s=>s.trim()).filter(Boolean) : [];
  const nats = r.nation ? r.nation.split(",").map(s=>s.trim()).filter(Boolean) : [];
  const gens = r.genre ? r.genre.split(",").map(s=>s.trim()).filter(Boolean) : [];

  const meta = [];
  if (r.year) meta.push(xlink("pyear", r.year, "yr"));
  if (dirs.length) meta.push(`감독 ${dirs.map(d=>xlink("dir", d)).join(", ")}`);
  if (nats.length) meta.push(nats.map(n=>xlink("nation", n)).join(", "));

  $("#modal-body").innerHTML = `
    <div class="mo-poster" id="mp"><div class="ph2">${esc(r.title)}</div></div>
    <div class="mo-info">
      <div class="cat">${esc(r.cat)}${r.grade ? " · " + esc(r.grade) : ""}</div>
      <h2>${esc(r.title)}${seasonTag(r)}</h2>
      <div class="meta">${meta.join(" · ") || '<span class="nodata">작품 정보 없음 — 아래 수정에서 채울 수 있습니다</span>'}</div>
      ${gens.length ? `<div class="gpills">${gens.map(g=>xlink("genre", g, "gpill")).join("")}</div>` : ""}
      ${r.nflx ? `<div class="nfx-line">${nflxBadge(r, true)} <span>넷플릭스에서 ‘${esc(r.nflx)}’로 평가</span></div>` : ""}
      <div class="mo-log"><h4>MY LOG · ${all.length}회 관람</h4>
        ${all.map(v => `<div class="viewing">
          <span class="k">DATE</span><span class="v">${v.start!==v.date ? esc(v.start)+" ~ " : ""}${esc(v.date)}${v.eps ? ` <span class="sub">(${esc(v.eps)}화)</span>` : ""}${v.season ? ` <span class="sub">시즌 ${esc(v.season)}</span>` : ""}</span>
          ${v.plat ? `<span class="k">WHERE</span><span class="v">${xlink("plat", v.plat)}${v.place && v.place!==v.plat ? ` <span class="sub">${esc(v.place)}</span>` : ""}${v.time ? ` <span class="sub">${esc(v.time)}</span>` : ""}</span>` : ""}
          ${v.memo ? `<span class="k">WITH</span><span class="v">${esc(v.memo)}</span>` : ""}
          ${v.rate ? `<span class="k">RATE</span><span class="v">★ ${esc(v.rate)}</span>` : ""}
          <span class="k"></span><span class="v"><button class="vedit" data-no="${esc(v.no)}">수정</button></span>
        </div>`).join("")}
        ${(() => { const rv = all.find(v=>v.review); return rv ? `<div class="mo-quote">“${esc(rv.review)}”</div>` : ""; })()}
      </div>
    </div>`;

  /* 메타 클릭 → 탐색 탭으로 */
  $("#modal-body").querySelectorAll(".xlink").forEach(b => b.onclick = () => {
    closeModal();
    openExplore(b.dataset.ax, b.dataset.gv);
  });
  /* 회차 수정 */
  $("#modal-body").querySelectorAll(".vedit").forEach(b => b.onclick = () => {
    const v = all.find(x => String(x.no) === b.dataset.no);
    if (v) openEdit(v);
  });

  posterFor(r).then(p => { if (p) $("#mp").innerHTML = `<img src="${IMG}w500${p}" alt="${esc(r.title)} 포스터">`; });
  const bg = $("#modal-bg");
  bg.classList.add("show"); bg.setAttribute("aria-hidden","false");
  document.body.style.overflow = "hidden";
}

/* ---------------- TMDB 작품 선택기 (수정·CSV 공용) ---------------- */
/* openPicker(기본검색어, 타입힌트, 선택콜백) — 콜백에 정규화된 작품정보 전달 */
function openPicker(defaultQ, typeHint, onPick){
  const bg = $("#picker-bg");
  bg.classList.add("show"); bg.setAttribute("aria-hidden","false");
  document.body.style.overflow = "hidden";
  const inp = $("#pk-q"), res = $("#pk-res");
  $("#pk-type").value = typeHint || "";
  inp.value = defaultQ || "";
  res.innerHTML = "";
  inp.focus();

  let timer = null;
  const run = async () => {
    const q = inp.value.trim();
    if (q.length < 1){ res.innerHTML = ""; return; }
    if (!tmdbReady()){ res.innerHTML = '<div class="hint">TMDB 키/프록시가 없어 검색할 수 없습니다</div>'; return; }
    res.innerHTML = '<div class="hint">검색 중…</div>';
    const ty = $("#pk-type").value;
    try {
      const path = ty==="movie" ? "/search/movie" : ty==="tv" ? "/search/tv" : "/search/multi";
      const d = await tmdb(path, { query: q });
      const list = (d.results||[]).filter(x => ty || x.media_type==="movie" || x.media_type==="tv").slice(0,12);
      if (!list.length){ res.innerHTML = '<div class="hint">결과 없음</div>'; return; }
      res.innerHTML = "";
      list.forEach(x => {
        const mt = ty || x.media_type;
        const t = x.title || x.name, yr = (x.release_date || x.first_air_date || "").slice(0,4);
        const c = document.createElement("button");
        c.className = "pk-card"; c.type = "button";
        c.innerHTML = `${x.poster_path ? `<img src="${IMG}w185${x.poster_path}" alt="">` : '<span class="noimg"></span>'}
          <span class="ti">${esc(t)}</span>
          <span class="mt">${yr||"—"} · ${mt==="tv"?"TV":"영화"} · ${mt}/${x.id}</span>`;
        c.onclick = () => choose(x, mt);
        res.appendChild(c);
      });
    } catch(e){ res.innerHTML = '<div class="hint">검색 실패</div>'; }
  };

  const choose = async (x, mt) => {
    const out = {
      tmdb: String(x.id), ntype: mt, title: x.title || x.name,
      year: (x.release_date || x.first_air_date || "").slice(0,4),
      dir: "", genre: "", nation: "", poster: x.poster_path || "",
    };
    try {
      if (mt === "movie"){
        const d = await tmdb(`/movie/${x.id}`, { append_to_response: "credits" });
        out.genre = (d.genres||[]).map(g=>g.name).join(", ");
        out.dir = (d.credits?.crew||[]).filter(c=>c.job==="Director").map(c=>c.name).join(", ");
        out.nation = (d.production_countries||[]).map(c=>c.name).join(", ");
      } else {
        const d = await tmdb(`/tv/${x.id}`);
        out.genre = (d.genres||[]).map(g=>g.name).join(", ");
        out.dir = (d.created_by||[]).map(c=>c.name).join(", ");
        out.nation = (d.production_countries||[]).map(c=>c.name).join(", ");
      }
    } catch(e){}
    closePicker();
    onPick(out);
  };

  inp.oninput = () => { clearTimeout(timer); timer = setTimeout(run, 350); };
  $("#pk-type").onchange = run;
  if (defaultQ) run();
}

function closePicker(){
  $("#picker-bg").classList.remove("show");
  $("#picker-bg").setAttribute("aria-hidden","true");
  if (!$("#modal-bg").classList.contains("show") && !$("#edit-bg").classList.contains("show"))
    document.body.style.overflow = "";
}

function closeModal(){
  $("#modal-bg").classList.remove("show");
  $("#modal-bg").setAttribute("aria-hidden","true");
  document.body.style.overflow = "";
}

/* ---------------- 캐러셀 카드 (둘러보기·탐색 공용) ---------------- */
function ncard(r, w){
  const d = document.createElement("div");
  d.className = "ncard"; d.tabIndex = 0;
  d.setAttribute("role","button"); d.setAttribute("aria-label", r.title);
  d.innerHTML = `<img alt="">${nflxBadge(r)}<div class="nt">${esc(r.title)}${seasonTag(r)}</div>`;
  d.onclick = () => openModal(r);
  d.onkeydown = e => { if (e.key==="Enter") openModal(r); };
  posterFor(r).then(p => {
    if (p){ const img = d.querySelector("img");
      img.src = IMG + (w||"w342") + p;
      img.onload = () => { img.classList.add("ld"); d.classList.add("hasimg"); }; }
  });
  return d;
}

function nrow(title, eyebrow, items){
  if (!items.length) return null;
  const div = document.createElement("div"); div.className = "nrow";
  div.innerHTML = `<div class="rh"><h3>${esc(title)}</h3><span class="re">${esc(eyebrow)}</span></div>`;
  const car = document.createElement("div"); car.className = "ncar";
  items.forEach(r => car.appendChild(ncard(r)));
  div.appendChild(car);
  return div;
}

/* key 기준 중복 제거 후 n개 */
function dedupKey(arr, n){
  const seen = new Set(), out = [];
  for (const r of arr){
    if (seen.has(r.key)) continue;
    seen.add(r.key); out.push(r);
    if (out.length >= n) break;
  }
  return out;
}
