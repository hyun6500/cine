/* =====================================================================
   page-search.js — 통합 검색 오버레이
   ★ 검색은 탭 필터가 아니라 '목표물 찾기'다. 오버레이로 띄우고 닫으면
     보고 있던 탭이 그대로 남는다 (대시보드 통계가 흐트러지지 않음).
   구획: ① 내 기록(작품 단위로 묶음) ② 찜 목록 ③ TMDB(아직 기록에 없는 것 포함)
   ===================================================================== */

let _soLocalTimer = null, _soTmdbTimer = null, _soSeq = 0;

function openSearch(preset){
  const ov = $("#search-overlay");
  ov.classList.add("show");
  ov.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
  const inp = $("#q");
  if (preset !== undefined && preset !== null){ inp.value = preset; S.q = preset; }
  setTimeout(() => { inp.focus(); inp.select(); }, 40);
  runSearch();
}

function closeSearch(){
  const ov = $("#search-overlay");
  ov.classList.remove("show");
  ov.setAttribute("aria-hidden", "true");
  if (!$("#modal-bg").classList.contains("show")) document.body.style.overflow = "";
}

/* 입력 → 로컬은 즉시, TMDB는 디바운스 */
function onSearchInput(v){
  S.q = v;
  clearTimeout(_soLocalTimer);
  _soLocalTimer = setTimeout(runSearch, 120);
}

function runSearch(){
  const q = S.q.trim();
  const body = $("#so-body");

  if (!q){
    body.innerHTML = `<div class="so-hint">
      <b>무엇을 찾으시나요?</b>
      <span>제목이나 감독 이름을 입력하면 <i>내 기록</i>·<i>찜 목록</i>·<i>TMDB</i>에서 한 번에 찾아봅니다.</span>
      <span class="tiny">기록에 없는 작품도 TMDB 결과에서 ♡로 바로 찜할 수 있어요.</span>
    </div>`;
    _soSeq++;                       // 진행 중이던 TMDB 응답 무효화
    return;
  }

  const ql = q.toLowerCase();

  /* ① 내 기록 — 작품 단위로 묶어 관람 횟수 표시 */
  const matched = S.rows.filter(r =>
    r.title.toLowerCase().includes(ql) || (r.dir || "").toLowerCase().includes(ql));
  const byKey = {};
  matched.forEach(r => { (byKey[r.key] = byKey[r.key] || []).push(r); });
  const mine = Object.values(byKey)
    .map(g => ({ r: g.sort((a,b) => a.date < b.date ? 1 : -1)[0], n: g.length }))
    .sort((a,b) => a.r.date < b.r.date ? 1 : -1);

  /* ② 찜 목록 */
  const wished = S.wish.filter(w =>
    (w.title || "").toLowerCase().includes(ql) || (w.dir || "").toLowerCase().includes(ql));

  body.innerHTML = `
    <div class="so-sec">
      <div class="so-h"><span class="tag mine">내 기록</span><b>${mine.length}편</b>
        ${mine.length ? `<span class="sub">관람 ${matched.length}회</span>` : ""}</div>
      <div class="so-grid" id="so-mine">${mine.length ? "" : '<div class="so-none">일치하는 관람 기록이 없습니다</div>'}</div>
    </div>
    <div class="so-sec"${wished.length ? "" : ' style="display:none"'}>
      <div class="so-h"><span class="tag wish">찜 목록</span><b>${wished.length}편</b></div>
      <div class="so-grid" id="so-wish"></div>
    </div>
    <div class="so-sec">
      <div class="so-h"><span class="tag tmdb">TMDB</span><b id="so-tmdb-cnt">검색 중…</b>
        <span class="sub">기록에 없는 작품 — ♡로 담아둘 수 있어요</span></div>
      <div class="so-grid" id="so-tmdb"></div>
    </div>`;

  const mg = $("#so-mine");
  mine.forEach(({ r, n }) => {
    const c = soCard({
      title: r.title, year: r.year || r.date.slice(0,4),
      sub: [r.date, r.dir ? r.dir.split(",")[0] : ""].filter(Boolean).join(" · "),
      badge: n > 1 ? `${n}회` : "", season: r.season,
    });
    posterFor(r).then(p => soSetPoster(c, p));
    c.onclick = () => { closeSearch(); openModal(r); };
    c.onkeydown = e => { if (e.key === "Enter") c.onclick(); };
    mg.appendChild(c);
  });

  const wg = $("#so-wish");
  if (wg) wished.forEach(w => {
    const c = soCard({ title: w.title, year: w.year,
      sub: w.dir ? w.dir.split(",")[0] : "찜한 작품", badge: "♥" });
    if (w.poster) soSetPoster(c, w.poster);
    else if (w.tmdb && tmdbReady())
      detailFor({ tmdb:w.tmdb, ntype:w.ntype, title:w.title, key:w.key, season:"", year:w.year })
        .then(d => soSetPoster(c, d.p));
    c.onclick = () => { closeSearch(); openWishDetail(w); };
    c.onkeydown = e => { if (e.key === "Enter") c.onclick(); };
    wg.appendChild(c);
  });

  clearTimeout(_soTmdbTimer);
  _soTmdbTimer = setTimeout(() => searchTmdb(q), 380);
}

/* ③ TMDB */
async function searchTmdb(q){
  const seq = ++_soSeq;
  const cntEl = $("#so-tmdb-cnt"), grid = $("#so-tmdb");
  if (!cntEl) return;
  if (!tmdbReady()){ cntEl.textContent = "미설정"; return; }
  if (q.length < 2){ cntEl.textContent = "두 글자 이상"; return; }

  try {
    const d = await tmdb("/search/multi", { query: q });
    if (seq !== _soSeq || S.q.trim() !== q) return;      // 그 사이 입력이 바뀜
    const list = (d.results || []).filter(x => x.media_type === "movie" || x.media_type === "tv").slice(0, 14);
    grid.innerHTML = "";
    if (!list.length){ cntEl.textContent = "결과 없음"; return; }

    let novel = 0;
    list.forEach(x => {
      const t = x.title || x.name, yr = (x.release_date || x.first_air_date || "").slice(0,4);
      const row = S.rows.find(r => r.tmdb === String(x.id));
      if (!row) novel++;
      const work = { title: t, year: yr, tmdb: String(x.id), ntype: x.media_type,
                     poster: x.poster_path || "", dir: "", genre: "", nation: "" };
      const c = soCard({ title: t, year: yr,
        sub: x.media_type === "tv" ? "시리즈" : "영화",
        badge: row ? "기록 있음" : "", dim: !!row });
      soSetPoster(c, x.poster_path);
      c.appendChild(wishBtn(work));
      c.onclick = () => {
        if (row){ closeSearch(); openModal(row); }
        else window.open(`https://www.themoviedb.org/${x.media_type}/${x.id}`, "_blank", "noopener");
      };
      c.onkeydown = e => { if (e.key === "Enter") c.onclick(); };
      grid.appendChild(c);
    });
    cntEl.textContent = `${list.length}편${novel < list.length ? ` (새 작품 ${novel}편)` : ""}`;
  } catch(e){ if (seq === _soSeq) cntEl.textContent = "검색 실패"; }
}

/* ---------------- 카드 헬퍼 ---------------- */
function soCard(o){
  const c = document.createElement("div");
  c.className = "pcard so-card" + (o.dim ? " inlog" : "");
  c.tabIndex = 0; c.setAttribute("role", "button"); c.setAttribute("aria-label", o.title);
  c.innerHTML = `<div class="ph"><div class="t">${esc(o.title)}</div><div class="y">${esc(o.year || "")}</div></div>
    <img alt="">
    ${o.badge ? `<span class="badge socount">${esc(o.badge)}</span>` : ""}
    <div class="ov"><div class="t">${esc(o.title)}${o.season ? ` <span class="stag">S${esc(o.season)}</span>` : ""}</div>
      <div class="m">${esc(o.sub || "")}</div></div>`;
  return c;
}

function soSetPoster(c, p){
  if (!p) return;
  const img = c.querySelector("img");
  img.src = IMG + "w342" + p;
  img.onload = () => { img.classList.add("ld"); c.querySelector(".ph")?.remove(); };
}
