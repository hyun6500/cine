FILEV["widgets"] = "2.11";
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
/* action = { label, fn } — 되돌리기 등. 지정 시 표시 시간이 길어진다 */
function toast(msg, kind = "", action = null){
  const t = document.createElement("div");
  t.className = "toast " + kind;
  t.textContent = msg;
  if (action){
    const b = document.createElement("button");
    b.className = "tact"; b.textContent = action.label;
    b.onclick = () => { action.fn(); t.remove(); };
    t.appendChild(b);
  }
  $("#toasts").appendChild(t);
  requestAnimationFrame(() => t.classList.add("in"));
  setTimeout(() => { t.classList.remove("in"); setTimeout(() => t.remove(), 300); }, action ? 8000 : 3200);
}

/* ---------------- 별점 위젯 (0~5, 0.5 단위) ----------------
   별 하나를 좌/우 두 버튼으로 나눠 반 칸을 찍는다. onPick(값)은 저장을 담당. */
function starWidget(value, onPick, opts = {}){
  const wrap = document.createElement("div");
  wrap.className = "stars" + (opts.readonly ? " ro" : "") + (opts.small ? " sm" : "");
  let cur = parseRate(value);

  const paint = () => {
    const pct = ((cur || 0) / 5) * 100;
    wrap.querySelector(".st-fill").style.width = pct + "%";
    wrap.querySelector(".st-val").textContent = cur == null ? "미평가" : rateStr(cur);
    wrap.classList.toggle("none", cur == null);
    const clr = wrap.querySelector(".st-clear");
    if (clr) clr.style.display = cur == null ? "none" : "";
  };

  wrap.innerHTML = `<span class="st-box">
      <span class="st-base">★★★★★</span>
      <span class="st-fill">★★★★★</span>
      ${opts.readonly ? "" : `<span class="st-hit">${
        Array.from({length:10}, (_,i) =>
          `<button type="button" data-v="${(i+1)/2}" aria-label="별점 ${(i+1)/2}점"></button>`).join("")}</span>`}
    </span>
    <span class="st-val"></span>
    ${opts.readonly ? "" : '<button type="button" class="st-clear" title="평가 지우기">지우기</button>'}`;

  if (!opts.readonly){
    wrap.querySelectorAll(".st-hit button").forEach(b => {
      b.onmouseenter = () => { wrap.querySelector(".st-fill").style.width = (+b.dataset.v / 5 * 100) + "%"; };
      b.onclick = async () => {
        const v = +b.dataset.v;
        const prev = cur;
        cur = (cur === v) ? null : v;          // 같은 값을 다시 누르면 해제
        paint();
        if (onPick && !(await onPick(cur))){ cur = prev; paint(); }
      };
    });
    wrap.querySelector(".st-hit").onmouseleave = paint;
    wrap.querySelector(".st-clear").onclick = async () => {
      const prev = cur; cur = null; paint();
      if (onPick && !(await onPick(null))){ cur = prev; paint(); }
    };
  }
  paint();
  wrap.setValue = v => { cur = parseRate(v); paint(); };
  wrap.getValue = () => cur;
  return wrap;
}

/* ---------------- 상세 모달 ---------------- */
/* 탐색 이동용 링크 조각 */
function xlink(axis, val, cls){
  return `<button class="xlink${cls?" "+cls:""}" data-ax="${esc(axis)}" data-gv="${esc(val)}">${esc(val)}</button>`;
}

/* 외부 링크: TMDB_ID가 있으면 작품 페이지, 없으면 제목 검색 */
function tmdbUrl(r){
  if (r.tmdb) return `https://www.themoviedb.org/${r.ntype || "movie"}/${r.tmdb}`;
  return `https://www.themoviedb.org/search?query=${encodeURIComponent(r.title.replace(/\(.*?\)/g,"").trim())}`;
}
function kobisUrl(r){
  return `https://www.kobis.or.kr/kobis/business/mast/mvie/searchMovieList.do?sMovLang=ko&sMovName=${encodeURIComponent(r.title.replace(/\(.*?\)/g,"").trim())}`;
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
      <h2><a class="tlink" href="${tmdbUrl(r)}" target="_blank" rel="noopener"
        title="${r.tmdb ? "TMDB 작품 페이지 열기" : "TMDB에서 제목 검색"}">${esc(r.title)}<span class="ext">↗</span></a>${seasonTag(r)}</h2>
      <div class="xtra"><a href="${tmdbUrl(r)}" target="_blank" rel="noopener">TMDB${r.tmdb ? ` <span class="mono">${esc((r.ntype||"movie")+"/"+r.tmdb)}</span>` : " 검색"}</a>
        <a href="${kobisUrl(r)}" target="_blank" rel="noopener">KOBIS 검색</a>
        <span class="mo-wish" id="mo-wish"></span></div>
      ${r.tmdb ? "" : '<div class="unlinked">TMDB 미연결 — 포스터는 제목으로 검색한 <b>추정</b>입니다. 수정 → ‘TMDB에서 찾기’로 확정하세요.</div>'}
      <div class="meta">${meta.join(" · ") || '<span class="nodata">작품 정보 없음 — 아래 수정에서 채울 수 있습니다</span>'}</div>
      ${gens.length ? `<div class="gpills">${gens.map(g=>xlink("genre", g, "gpill")).join("")}</div>` : ""}
      ${r.nflx ? `<div class="nfx-line">${nflxBadge(r, true)} <span>넷플릭스에서 ‘${esc(r.nflx)}’로 평가</span></div>` : ""}
      <div class="mo-rate"><span class="k">내 별점</span><span id="mo-stars"></span></div>
      <div class="mo-log">
        <div class="mo-log-head"><h4>MY LOG · ${all.length}회 관람</h4>
          ${all.length > 1 ? '<button class="vmerge" id="vmerge" disabled>선택 병합 (2개 이상 체크)</button>' : ""}</div>
        ${all.map(v => `<div class="viewing">
          ${all.length > 1 ? `<input type="checkbox" class="vsel" data-no="${esc(v.no)}" aria-label="병합 대상 선택">` : ""}
          <div class="vgrid">
          <span class="k">DATE</span><span class="v">${v.undated ? '<span class="undated">날짜 미상</span>' : (v.start!==v.date ? esc(v.start)+" ~ " : "") + esc(v.date)}${v.eps ? ` <span class="sub">(${esc(v.eps)}화)</span>` : ""}${v.season ? ` <span class="sub">시즌 ${esc(v.season)}</span>` : ""}</span>
          ${v.plat ? `<span class="k">WHERE</span><span class="v">${xlink("plat", v.plat)}${v.place && v.place!==v.plat ? ` <span class="sub">${esc(v.place)}</span>` : ""}${v.time ? ` <span class="sub">${esc(v.time)}</span>` : ""}</span>` : ""}
          ${v.memo ? `<span class="k">WITH</span><span class="v">${esc(v.memo)}</span>` : ""}
          ${v.rate ? `<span class="k">RATE</span><span class="v">★ ${esc(rateStr(parseRate(v.rate)) || v.rate)}</span>` : ""}
          <span class="k"></span><span class="v vbtns"><button class="vedit" data-no="${esc(v.no)}">수정</button><button class="vedit vdel" data-no="${esc(v.no)}">삭제</button></span>
          </div>
        </div>`).join("")}
        ${(() => { const rv = all.find(v=>v.review); return rv ? `<div class="mo-quote">“${esc(rv.review)}”</div>` : ""; })()}
      </div>
    </div>`;

  /* 메타 클릭 → 탐색 탭으로 */
  $("#modal-body").querySelectorAll(".xlink").forEach(b => b.onclick = () => {
    closeModal();
    openExplore(b.dataset.ax, b.dataset.gv);
  });
  /* 회차 수정 · 삭제 */
  $("#modal-body").querySelectorAll(".vedit:not(.vdel)").forEach(b => b.onclick = () => {
    const v = all.find(x => String(x.no) === b.dataset.no);
    if (v) openEdit(v);
  });
  $("#modal-body").querySelectorAll(".vdel").forEach(b => b.onclick = () => {
    const v = all.find(x => String(x.no) === b.dataset.no);
    if (v) deleteViewing(v);
  });
  /* 회차 병합 */
  const mb = $("#vmerge");
  if (mb){
    const sync = () => {
      const n = $("#modal-body").querySelectorAll(".vsel:checked").length;
      mb.disabled = n < 2;
      mb.textContent = n < 2 ? "선택 병합 (2개 이상 체크)" : `선택 ${n}건 병합`;
    };
    $("#modal-body").querySelectorAll(".vsel").forEach(c => c.onchange = sync);
    mb.onclick = () => {
      const nos = [...$("#modal-body").querySelectorAll(".vsel:checked")].map(c => c.dataset.no);
      const rows = all.filter(v => nos.includes(String(v.no)));
      if (rows.length >= 2) mergeViewings(rows);
    };
  }

  /* 별점 — 이 작품의 가장 최근 관람 회차에 저장 */
  const rateRow = all[0];
  $("#mo-stars").appendChild(starWidget(rateRow.rate, v => saveRating(rateRow, v)));

  /* 찜 토글 — 다시 보고 싶은 작품도 담아둘 수 있게 */
  const workOf = () => ({ title: r.title, year: r.year, dir: r.dir, genre: r.genre,
                          nation: r.nation, tmdb: r.tmdb, ntype: r.ntype, poster: r._poster || "" });
  $("#mo-wish").appendChild(wishToggle(workOf));

  posterFor(r).then(p => {
    if (p){ r._poster = p; $("#mp").innerHTML = `<img src="${IMG}w500${p}" alt="${esc(r.title)} 포스터">`; }
  });
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

/* 텍스트형 찜 토글 (상세 모달용) — getWork()는 호출 시점에 최신 정보를 반환 */
function wishToggle(getWork){
  const b = document.createElement("button");
  b.className = "wtog";
  const sync = () => {
    const on = isWished(getWork());
    b.classList.toggle("on", on);
    b.textContent = on ? "♥ 찜 해제" : "♡ 찜하기";
  };
  sync();
  b.onclick = async () => {
    const w = getWork();
    b.disabled = true;
    if (isWished(w)) await removeWish(wishKey(w));
    else await addWish(w);
    b.disabled = false;
    sync();
  };
  return b;
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
