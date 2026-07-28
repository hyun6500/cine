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
function openModal(r){
  const all = S.rows.filter(x => x.key===r.key).sort((a,b) => a.date < b.date ? 1 : -1);
  $("#modal-body").innerHTML = `
    <div class="mo-poster" id="mp"><div class="ph2">${esc(r.title)}</div></div>
    <div class="mo-info">
      <div class="cat">${esc(r.cat)}${r.grade ? " · " + esc(r.grade) : ""}</div>
      <h2>${esc(r.title)}${seasonTag(r)}</h2>
      <div class="meta">
        ${r.year ? `<b>${esc(r.year)}</b> · ` : ""}${r.dir ? `감독 <b>${esc(r.dir)}</b>` : ""}${r.nation ? ` · ${esc(r.nation)}` : ""}
      </div>
      ${r.genre ? `<div class="gpills">${r.genre.split(",").map(g=>`<span class="gpill">${esc(g.trim())}</span>`).join("")}</div>` : ""}
      ${r.nflx ? `<div class="nfx-line">${nflxBadge(r, true)} <span>넷플릭스에서 ‘${esc(r.nflx)}’로 평가</span></div>` : ""}
      <div class="mo-log"><h4>MY LOG · ${all.length}회 관람</h4>
        ${all.map(v => `<div class="viewing">
          <span class="k">DATE</span><span class="v">${v.start!==v.date ? esc(v.start)+" ~ " : ""}${esc(v.date)}${v.eps ? ` <span class="sub">(${esc(v.eps)}화)</span>` : ""}${v.season ? ` <span class="sub">시즌 ${esc(v.season)}</span>` : ""}</span>
          ${v.plat ? `<span class="k">WHERE</span><span class="v">${esc(v.plat)}${v.place && v.place!==v.plat ? ` <span class="sub">${esc(v.place)}</span>` : ""}${v.time ? ` <span class="sub">${esc(v.time)}</span>` : ""}</span>` : ""}
          ${v.memo ? `<span class="k">WITH</span><span class="v">${esc(v.memo)}</span>` : ""}
          ${v.rate ? `<span class="k">RATE</span><span class="v">★ ${esc(v.rate)}</span>` : ""}
        </div>`).join("")}
        ${(() => { const rv = all.find(v=>v.review); return rv ? `<div class="mo-quote">“${esc(rv.review)}”</div>` : ""; })()}
      </div>
    </div>`;
  posterFor(r).then(p => { if (p) $("#mp").innerHTML = `<img src="${IMG}w500${p}" alt="${esc(r.title)} 포스터">`; });
  const bg = $("#modal-bg");
  bg.classList.add("show"); bg.setAttribute("aria-hidden","false");
  document.body.style.overflow = "hidden";
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
