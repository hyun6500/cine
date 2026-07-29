FILEV["wish"] = "2.11";
/* =====================================================================
   page-wish.js — 찜 목록 (아직 안 본 작품 담아두기)
   저장소: 같은 스프레드시트의 '찜목록' 시트 (Apps Script가 없으면 자동 생성)
          → 기기가 바뀌어도 유지됨. 읽기는 gviz, 쓰기는 Apps Script.
   ===================================================================== */

const WISH_SHEET = "찜목록";

/* 작품 식별 키 — TMDB ID가 있으면 그걸로, 없으면 정규화 제목 */
function wishKey(w){
  return w.tmdb ? `${w.ntype || "movie"}:${w.tmdb}` : `t:${normT(w.title)}`;
}

/* 이미 본 작품인지 (시청기록과 대조) */
function wishWatched(w){ return !!wishWatchedRow(w); }

/* ---------------- 로드 ---------------- */
async function loadWish(){
  S.wish = [];
  if (!CONFIG.SHEET_ID) return;
  try {
    const url = `https://docs.google.com/spreadsheets/d/${CONFIG.SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(WISH_SHEET)}`;
    const t = await (await fetch(url)).text();
    if (/^\s*</.test(t)) return;                    // 시트 없음 → HTML 오류 페이지
    const rows = parseCSV(t);
    if (!rows.length) return;
    const h = rows[0].map(x => x.trim());
    const g = (r, n) => { const i = h.indexOf(n); return i < 0 ? "" : String(r[i] ?? "").trim(); };
    S.wish = rows.slice(1).map(r => ({
      key: g(r,"key"), added: g(r,"추가일"), title: g(r,"제목"), year: g(r,"개봉연도"),
      dir: g(r,"감독"), genre: g(r,"장르"), nation: g(r,"제작국가"),
      tmdb: g(r,"TMDB_ID").replace(/\.0$/,""), ntype: g(r,"TMDB타입").toLowerCase(),
      poster: g(r,"포스터"), memo: g(r,"메모"),
    })).filter(w => w.title);
  } catch(e){ /* 찜 시트는 없어도 앱은 정상 동작 */ }
}

/* ---------------- 추가 · 해제 ---------------- */
async function addWish(work, opts = {}){
  const w = {
    title: work.title || "", year: work.year || "", dir: work.dir || "",
    genre: work.genre || "", nation: work.nation || "",
    tmdb: work.tmdb ? String(work.tmdb) : "", ntype: work.ntype || "",
    poster: work.poster || "", memo: opts.memo || "",
    added: new Date().toISOString().slice(0,10),
  };
  w.key = wishKey(w);
  if (S.wish.some(x => x.key === w.key)){ toast("이미 찜한 작품입니다"); return false; }
  if (!await ensureAuth("찜하려면 비밀번호가 필요합니다.")) return false;
  try {
    await gsPost({ action: "wishAdd", rows: [w] });
    S.wish.unshift(w);
    S.dirty.wish = true;
    renderWishBadge();
    if (S.tab === "wish") renderWish();
    toast(`‘${w.title}’ 찜했습니다`);
    return true;
  } catch(e){ toast("찜 저장 실패: " + e.message, "warn"); return false; }
}

async function removeWish(key){
  const w = S.wish.find(x => x.key === key);
  if (!w) return;
  if (!await ensureAuth("찜을 해제하려면 비밀번호가 필요합니다.")) return;
  try {
    await gsPost({ action: "wishDel", keys: [key] });
    S.wish = S.wish.filter(x => x.key !== key);
    renderWishBadge();
    renderWish();
    toast(`‘${w.title}’ 찜 해제`);
  } catch(e){ toast("해제 실패: " + e.message, "warn"); }
}

function isWished(work){ return S.wish.some(x => x.key === wishKey(work)); }

function renderWishBadge(){
  const b = $("#wish-badge");
  if (!b) return;
  const n = S.wish.length;
  b.textContent = n || "";
  b.style.display = n ? "" : "none";
}

/* ---------------- 찜 버튼 (탐색·선택기에서 공용) ---------------- */
function wishBtn(work){
  const b = document.createElement("button");
  b.className = "wbtn";
  const sync = () => {
    const on = isWished(work);
    b.classList.toggle("on", on);
    b.innerHTML = on ? "♥" : "♡";
    b.title = on ? "찜한 작품" : "찜하기";
  };
  sync();
  b.onclick = async e => {
    e.stopPropagation();
    if (isWished(work)) await removeWish(wishKey(work));
    else await addWish(work);
    sync();
  };
  return b;
}

/* 찜 항목의 상세 — 이미 본 작품이면 기존 상세 모달(MY LOG 포함)로, 아니면 전용 상세 */
function openWishDetail(w){
  const row = wishWatchedRow(w);
  if (row){ openModal(row); return; }

  $("#modal-body").innerHTML = `
    <div class="mo-poster" id="mp"><div class="ph2">${esc(w.title)}</div></div>
    <div class="mo-info">
      <div class="cat">찜 목록 · 아직 안 본 작품</div>
      <h2><a class="tlink" href="${w.tmdb ? `https://www.themoviedb.org/${w.ntype||"movie"}/${w.tmdb}`
        : `https://www.themoviedb.org/search?query=${encodeURIComponent(w.title)}`}"
        target="_blank" rel="noopener">${esc(w.title)}<span class="ext">↗</span></a></h2>
      <div class="meta">${[
          w.year ? `<button class="xlink yr" data-ax="pyear" data-gv="${esc(w.year)}">${esc(w.year)}</button>` : "",
          w.dir ? "감독 " + w.dir.split(",").map(d=>`<button class="xlink" data-ax="dir" data-gv="${esc(d.trim())}">${esc(d.trim())}</button>`).join(", ") : "",
          w.nation ? esc(w.nation) : ""
        ].filter(Boolean).join(" · ") || '<span class="nodata">추가 정보 없음</span>'}</div>
      ${w.genre ? `<div class="gpills">${w.genre.split(",").map(g =>
        `<button class="gpill xlink" data-ax="genre" data-gv="${esc(g.trim())}">${esc(g.trim())}</button>`).join("")}</div>` : ""}
      <div class="mo-log">
        <h4>WISHLIST · ${esc(w.added || "")} 담음</h4>
        <div class="wish-detail-acts">
          <button class="primary" id="wd-quick">봤어요 — 기록 추가</button>
          <button class="ghost" id="wd-log">자세히 입력</button>
          <button class="ghost" id="wd-del">찜 해제</button>
        </div>
        <p class="sub-p tiny">보고 나면 ‘관람 기록으로 추가’를 눌러 날짜·플랫폼을 채워 저장하세요.
          시청기록에 같은 작품이 생기면 찜 카드에 ‘본 작품’ 배지가 붙습니다.</p>
      </div>
    </div>`;

  $("#modal-body").querySelectorAll(".xlink").forEach(b => b.onclick = () => {
    closeModal(); openExplore(b.dataset.ax, b.dataset.gv);
  });
  $("#wd-quick").onclick = () => openQuickLog({
    title:w.title, year:w.year, dir:w.dir, genre:w.genre, nation:w.nation,
    tmdb:w.tmdb, ntype:w.ntype, poster:w.poster });
  $("#wd-log").onclick = () => { closeModal(); wishToLog(w); };
  $("#wd-del").onclick = async () => { await removeWish(w.key); closeModal(); };

  if (w.poster){
    $("#mp").innerHTML = `<img src="${IMG}w500${w.poster}" alt="${esc(w.title)} 포스터">`;
  } else if (w.tmdb && tmdbReady()){
    detailFor({ tmdb:w.tmdb, ntype:w.ntype, title:w.title, key:w.key, season:"", year:w.year })
      .then(d => { if (d.p) $("#mp").innerHTML = `<img src="${IMG}w500${d.p}" alt="">`; });
  }

  const bg = $("#modal-bg");
  bg.classList.add("show"); bg.setAttribute("aria-hidden","false");
  document.body.style.overflow = "hidden";
}

/* 찜 항목에 대응하는 시청기록 행 (가장 최근 관람) */
function wishWatchedRow(w){
  const hits = w.tmdb
    ? S.rows.filter(r => r.tmdb === String(w.tmdb))
    : S.rows.filter(r => !isJunkTitle(r.title) && normT(r.title) === normT(w.title));
  return hits.sort((a,b) => a.date < b.date ? 1 : -1)[0] || null;
}

/* ---------------- 찜 탭 ---------------- */
function renderWish(){
  const el = $("#wish");
  const list = [...S.wish];
  $("#wish-cnt").textContent = `${list.length}편`;

  el.innerHTML = `
    <div class="wish-top">
      <button class="primary" id="wish-add-btn">＋ TMDB에서 찾아 찜하기</button>
      <span class="sub">검색·탐색 화면의 ♡ 버튼으로도 담을 수 있어요. 목록은 스프레드시트 ‘찜목록’ 시트에 저장됩니다.</span>
    </div>
    ${list.length ? `<div class="wish-grid" id="wish-grid"></div>`
      : `<div class="empty"><b>아직 찜한 작품이 없습니다</b>보고 싶은 작품을 담아두면 여기 모입니다</div>`}`;

  $("#wish-add-btn").onclick = () => openPicker("", "", async work => { await addWish(work); });

  if (!list.length) return;
  const grid = $("#wish-grid");
  list.forEach(w => {
    const watched = wishWatched(w);
    const c = document.createElement("div");
    c.className = "pcard wcard" + (watched ? " watched" : "");
    c.innerHTML = `<div class="ph"><div class="t">${esc(w.title)}</div><div class="y">${esc(w.year||"")}</div></div>
      <img alt="">
      ${watched ? '<span class="badge seen">본 작품</span>' : ""}
      <div class="ov"><div class="t">${esc(w.title)}</div>
        <div class="m">${[w.year, w.dir ? w.dir.split(",")[0] : "", w.genre ? w.genre.split(",")[0] : ""].filter(Boolean).map(esc).join(" · ")}</div>
        <div class="wacts">
          <button class="wa" data-act="log">기록 추가</button>
          <button class="wa" data-act="link">TMDB</button>
          <button class="wa del" data-act="del">찜 해제</button>
        </div></div>`;
    if (w.poster){
      const img = c.querySelector("img");
      img.src = IMG + "w342" + w.poster;
      img.onload = () => { img.classList.add("ld"); c.querySelector(".ph")?.remove(); };
    } else if (w.tmdb && tmdbReady()){
      detailFor({ tmdb: w.tmdb, ntype: w.ntype, title: w.title, key: w.key, season: "", year: w.year })
        .then(d => { if (d.p){ const img = c.querySelector("img"); img.src = IMG + "w342" + d.p;
          img.onload = () => { img.classList.add("ld"); c.querySelector(".ph")?.remove(); }; } });
    }
    c.style.cursor = "pointer";
    c.tabIndex = 0;
    c.setAttribute("role","button");
    c.onclick = () => openWishDetail(w);
    c.onkeydown = e => { if (e.key === "Enter") openWishDetail(w); };
    c.querySelectorAll(".wa").forEach(b => b.onclick = e => {
      e.stopPropagation();
      const a = b.dataset.act;
      if (a === "del") removeWish(w.key);
      if (a === "link") window.open(w.tmdb
        ? `https://www.themoviedb.org/${w.ntype||"movie"}/${w.tmdb}`
        : `https://www.themoviedb.org/search?query=${encodeURIComponent(w.title)}`, "_blank", "noopener");
      if (a === "log") wishToLog(w);
    });
    grid.appendChild(c);
  });
}

/* 찜 → 기록 추가 폼으로 (본 작품이 되었을 때) */
function wishToLog(w){
  switchTab("add");
  renderAdd();
  addSel = { tmdb: w.tmdb, ntype: w.ntype, title: w.title, year: w.year,
             dirT: w.dir, genreT: w.genre, poster: w.poster };
  $("#f-title").value = w.title;
  $("#f-year").value = w.year || "";
  $("#f-season-w").style.display = w.ntype === "tv" ? "" : "none";
  $("#f-picked").innerHTML = `${w.poster?`<img src="${IMG}w92${w.poster}" alt="">`:""}
    <div><b>${esc(w.title)}</b> <span class="mono">${esc((w.ntype||"?")+"/"+(w.tmdb||"-"))}</span><br>
    <span class="sub">찜 목록에서 가져옴 — 관람 정보를 채우고 저장하세요</span></div>`;
  $("#f-picked").style.display = "flex";
  toast("찜 목록에서 불러왔습니다 — 날짜·플랫폼을 채워 저장하세요");
}

RENDERERS.wish = renderWish;
