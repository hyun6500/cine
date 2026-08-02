FILEV["story"] = "2.21";
/* =====================================================================
   page-story.js — 인스타 스토리용 이미지 만들기
   1080×1920 캔버스에 고른 작품의 포스터를 격자로 깔고,
   각 칸에 플랫폼 배지(머리글자)와 별점을 얹어 PNG로 내려받는다.
   ★ 플랫폼 '로고'는 상표라 쓰지 않는다 — 브랜드 색 + 머리글자 배지로 대신한다.
   ★ 포스터는 image.tmdb.org에서 crossOrigin=anonymous로 받는다.
     (CORS 헤더가 없으면 캔버스가 오염돼 저장이 막히므로, 실패한 칸은 제목 타일로 대체)
   ===================================================================== */

const ST_W = 1080, ST_H = 1920;
const WD_ST = ["일","월","화","수","목","금","토"];
const ST_SHOT_MAX = 4;      // 하루 칸을 최대 4분할 (앱 달력의 SHOT_MAX와 같은 기준)
const ST_LAYOUTS = {
  1:  { cols:1, rows:1,  lb:"1편 · 자세히" },
  4:  { cols:2, rows:2,  lb:"4편" },
  9:  { cols:3, rows:3,  lb:"9편" },
  12: { cols:3, rows:4,  lb:"12편" },
  16: { cols:4, rows:4,  lb:"16편" },
  cal:{ cols:7, rows:6,  lb:"달력" },      // ★ 한 달치를 달력 모양 그대로 (v2.20)
};
let stCanvas = null, stBusy = false;

/* ---------------- 열기 · 닫기 ---------------- */
function ymLabel(ym){
  return ym ? `${ym.slice(0,4)}년 ${Number(ym.slice(5,7))}월` : "";
}

/* preset: 기록 배열(격자 틀) 또는 { ym:"2026-07" }(달력 틀) */
function openStory(preset){
  const ov = $("#story-overlay");
  ov.classList.add("show"); ov.setAttribute("aria-hidden","false");
  document.body.style.overflow = "hidden";

  if (preset && !Array.isArray(preset) && preset.ym){
    S.story.layout = "cal";
    S.story.ym = preset.ym;
    S.story.title = ymLabel(preset.ym);
  } else if (Array.isArray(preset) && preset.length){
    S.story.picks = preset.slice(0, 16).map(r => r.key);
    S.story.layout = preset.length <= 1 ? 1 : preset.length <= 4 ? 4
                   : preset.length <= 9 ? 9 : preset.length <= 12 ? 12 : 16;
  }
  if (S.story.layout === "cal" && !S.story.ym)
    S.story.ym = (S.rows.find(r => !r.undated) || {}).date?.slice(0,7)
              || new Date().toISOString().slice(0,7);
  if (S.story.title == null) S.story.title = "요즘 본 것들";
  renderStory();
}

/* 달력 틀이 그릴 대상 — 그 달에 본 기록 (연도 필터와 무관하게 전체에서 뽑는다) */
function storyCalRows(){
  const ym = S.story.ym;
  return S.rows.filter(r => !r.undated && r.date.slice(0,7) === ym)
               .sort((a,b) => a.date < b.date ? -1 : 1);
}
function closeStory(){
  $("#story-overlay").classList.remove("show");
  $("#story-overlay").setAttribute("aria-hidden","true");
  if (!$("#modal-bg").classList.contains("show")) document.body.style.overflow = "";
}

/* ---------------- 후보 목록 ----------------
   작품 단위(key)로 접어서 보여준다. 같은 작품을 세 번 봤어도 카드는 하나. */
function storyPool(){
  const byKey = {};
  S.rows.forEach(r => {
    const g = byKey[r.key];
    if (!g) byKey[r.key] = r;
    else if ((r.date || "") > (g.date || "")) byKey[r.key] = r;   // 가장 최근 회차를 대표로
  });
  let list = Object.values(byKey);
  const q = S.story.q.trim().toLowerCase();
  if (q) list = list.filter(r => r.title.toLowerCase().includes(q) || (r.dir||"").toLowerCase().includes(q));
  if (S.story.sort === "rate")
    list.sort((a,b) => (parseRate(b.rate) ?? -1) - (parseRate(a.rate) ?? -1) || (a.date < b.date ? 1 : -1));
  else
    list.sort((a,b) => (a.date || "") < (b.date || "") ? 1 : -1);
  return list;
}
function storyPicked(){
  return S.story.picks.map(k => S.rows.find(r => r.key === k)).filter(Boolean);
}

/* ---------------- 화면 ---------------- */
function renderStory(){
  const T = S.story, cap = T.layout;
  const isCal = T.layout === "cal";
  const pool = isCal ? [] : storyPool().slice(0, 120);
  const calN = isCal ? storyCalRows().length : 0;

  $("#story-panel").innerHTML = `
    <div class="st-row">
      <div class="st-lb">틀</div>
      <div class="st-chips">${Object.keys(ST_LAYOUTS).map(n =>
        `<button class="chip${String(n)===String(T.layout)?" on":""}" data-lay="${n}">${ST_LAYOUTS[n].lb}</button>`).join("")}</div>
    </div>

    <div class="st-row">
      <div class="st-lb">제목</div>
      <input type="text" class="fin" id="st-title" value="${esc(T.title)}" placeholder="${isCal ? esc(ymLabel(T.ym)) : "요즘 본 것들"}" maxlength="24">
    </div>

    <div class="st-row">
      <div class="st-lb">표시</div>
      <label class="ed-chk"><input type="checkbox" id="st-star" ${T.showStar?"checked":""}> 별점</label>
      <label class="ed-chk"><input type="checkbox" id="st-tt" ${T.showTitle?"checked":""}> ${isCal ? "날짜" : "작품 제목"}</label>
    </div>

    ${isCal ? `
    <div class="st-row">
      <div class="st-lb">달</div>
      <button class="chip" id="st-prev">◀</button>
      <b class="st-ym">${esc(ymLabel(T.ym))}</b>
      <button class="chip" id="st-next">▶</button>
      <span class="st-cnt">${calN}편</span>
    </div>
    <p class="sub-p tiny">그 달에 본 기록이 달력 모양 그대로 들어갑니다.
      하루에 여러 편이면 대표 한 편의 포스터에 <b>+N</b>이 붙습니다.</p>`
    : `
    <div class="st-row">
      <div class="st-lb">고르기</div>
      <select class="chip" id="st-sort">
        <option value="recent" ${T.sort==="recent"?"selected":""}>최근 본 순</option>
        <option value="rate" ${T.sort==="rate"?"selected":""}>별점 높은 순</option>
      </select>
      <input type="search" class="fin st-q" id="st-q" value="${esc(T.q)}" placeholder="제목·감독으로 찾기">
      <span class="st-cnt">${T.picks.length} / ${cap}</span>
      ${T.picks.length ? '<button class="chip" id="st-clear">비우기</button>' : ""}
    </div>

    <div class="st-pool" id="st-pool"></div>`}`;

  const poolEl = $("#st-pool");
  if (poolEl) pool.forEach(r => {
    const i = T.picks.indexOf(r.key);
    const c = document.createElement("button");
    c.className = "st-card" + (i >= 0 ? " on" : "");
    c.innerHTML = `<span class="ph">${esc(r.title)}</span><img alt="">
      ${i >= 0 ? `<span class="ord">${i+1}</span>` : ""}
      <span class="nm">${esc(r.title)}</span>`;
    c.onclick = () => toggleStoryPick(r);
    poolEl.appendChild(c);
    posterFor(r).then(p => {
      if (!p) return;
      const img = c.querySelector("img");
      img.src = IMG + "w185" + p;
      img.onload = () => { img.classList.add("ld"); c.querySelector(".ph")?.remove(); };
    });
  });

  $$("#story-panel [data-lay]").forEach(b => b.onclick = () => {
    const v = b.dataset.lay;
    const was = T.layout;
    T.layout = v === "cal" ? "cal" : +v;
    if (T.layout === "cal"){
      if (!T.ym) T.ym = (S.rows.find(r => !r.undated) || {}).date?.slice(0,7)
                     || new Date().toISOString().slice(0,7);
      if (was !== "cal") T.title = ymLabel(T.ym);        // 제목을 달 이름으로 갈아 끼운다
    } else {
      if (was === "cal") T.title = "요즘 본 것들";
      if (T.picks.length > T.layout) T.picks = T.picks.slice(0, T.layout);
    }
    renderStory(); drawStory();
  });
  $("#st-title").oninput = e => { T.title = e.target.value; drawStory(); };
  $("#st-star").onchange = e => { T.showStar = e.target.checked; drawStory(); };
  $("#st-tt").onchange  = e => { T.showTitle = e.target.checked; drawStory(); };

  const shiftYM = n => {
    T.ym = ymAdd(T.ym, n);
    if (!T.title || /^\d{4}년 \d{1,2}월$/.test(T.title)) T.title = ymLabel(T.ym);
    renderStory(); drawStory();
  };
  const pv = $("#st-prev"), nx = $("#st-next");
  if (pv) pv.onclick = () => shiftYM(-1);
  if (nx) nx.onclick = () => shiftYM(1);

  const so = $("#st-sort");
  if (so) so.onchange = e => { T.sort = e.target.value; renderStory(); };
  const sq = $("#st-q");
  let qt = null;
  if (sq) sq.oninput = e => { clearTimeout(qt); const v = e.target.value; qt = setTimeout(() => { T.q = v; renderStory(); }, 200); };
  const cl = $("#st-clear");
  if (cl) cl.onclick = () => { T.picks = []; renderStory(); drawStory(); };

  drawStory();
}

function toggleStoryPick(r){
  const T = S.story, i = T.picks.indexOf(r.key);
  if (i >= 0) T.picks.splice(i, 1);
  else {
    if (T.picks.length >= T.layout){
      toast(`${T.layout}칸 틀이라 ${T.layout}편까지만 고를 수 있어요 — 틀을 바꾸거나 하나를 빼주세요`, "warn");
      return;
    }
    T.picks.push(r.key);
  }
  renderStory();
}

/* ---------------- 캔버스 그리기 ---------------- */
/* ★ v2.21 — 포스터가 안 뜨고 제목 타일만 나오던 문제
   앱은 같은 포스터를 평소 <img>(CORS 헤더 요청 없음)로 이미 받아 캐시에 넣어 둔다.
   그 캐시된 응답에는 CORS 헤더가 없어서, 뒤이어 crossOrigin="anonymous"로 같은 URL을
   요청하면 브라우저가 거부한다 (캔버스 오염 방지 규칙). 결과: onerror → 제목 타일.
   → 쿼리 하나를 덧붙여 캐시 항목을 분리한다. TMDB 이미지 CDN은 모르는 파라미터를 무시한다. */
const _imgCache = new Map();

function loadImg(src){
  if (_imgCache.has(src)) return Promise.resolve(_imgCache.get(src));
  const url = src + (src.includes("?") ? "&" : "?") + "cine=1";
  return new Promise(res => {
    const im = new Image();
    im.crossOrigin = "anonymous";
    im.onload  = () => { _imgCache.set(src, im); res(im); };
    im.onerror = () => { _imgCache.set(src, null); res(null); };
    im.src = url;
  });
}

/* 달력 틀은 한 번에 30~40장을 쓰므로 미리 병렬로 받아둔다 (하나씩 await하면 매우 느리다) */
async function preloadPosters(rows, size){
  const paths = await Promise.all(rows.map(r => posterFor(r).catch(() => null)));
  await Promise.all(paths.filter(Boolean).map(p => loadImg(IMG + size + p)));
}
function roundRect(ctx, x, y, w, h, r){
  if (ctx.roundRect){ ctx.beginPath(); ctx.roundRect(x, y, w, h, r); return; }
  ctx.beginPath();
  ctx.moveTo(x+r, y); ctx.arcTo(x+w, y, x+w, y+h, r); ctx.arcTo(x+w, y+h, x, y+h, r);
  ctx.arcTo(x, y+h, x, y, r); ctx.arcTo(x, y, x+w, y, r); ctx.closePath();
}
/* 포스터를 칸에 꽉 채워 그리기 (object-fit: cover) */
function drawCover(ctx, im, x, y, w, h){
  const s = Math.max(w / im.width, h / im.height);
  const dw = im.width * s, dh = im.height * s;
  ctx.drawImage(im, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}
function ellipsis(ctx, text, maxW){
  let t = String(text || "");
  if (ctx.measureText(t).width <= maxW) return t;
  while (t.length > 1 && ctx.measureText(t + "…").width > maxW) t = t.slice(0, -1);
  return t + "…";
}
/* 별 다섯 개 — 채운 만큼만 앰버로 (0.5점 단위) */
function drawStars(ctx, v, x, y, size, align){
  const glyph = "★★★★★";
  ctx.save();
  ctx.font = `${size}px ${ST_FONT}`;
  ctx.textBaseline = "alphabetic";
  const w = ctx.measureText(glyph).width;
  const sx = align === "center" ? x - w / 2 : x;
  ctx.fillStyle = "rgba(255,255,255,.18)";
  ctx.fillText(glyph, sx, y);
  ctx.save();
  ctx.beginPath(); ctx.rect(sx, y - size, w * (v / 5), size * 1.4); ctx.clip();
  ctx.fillStyle = "#F5B942";
  ctx.fillText(glyph, sx, y);
  ctx.restore();
  ctx.restore();
  return w;
}
const ST_FONT = "'Pretendard Variable', Pretendard, sans-serif";
const ST_DISP = "'Gowun Batang', serif";

let stPending = false;
async function drawStory(){
  if (stBusy){ stPending = true; return; }      // 그리는 중이면 끝난 뒤 한 번 더
  stBusy = true;
  try { await drawStoryInner(); } catch(e){ console.error("[cine] 스토리 그리기 실패", e); }
  stBusy = false;
  if (stPending){ stPending = false; drawStory(); }
}

async function drawStoryInner(){
  const T = S.story;
  const cv = $("#st-canvas");
  stCanvas = cv;
  cv.width = ST_W; cv.height = ST_H;
  const ctx = cv.getContext("2d");
  try { await document.fonts.ready; } catch(e){}

  /* 배경 — 영사실 톤 + 위쪽 앰버 글로우 */
  ctx.fillStyle = "#0E1116"; ctx.fillRect(0, 0, ST_W, ST_H);
  const g = ctx.createRadialGradient(ST_W/2, 240, 60, ST_W/2, 240, 900);
  g.addColorStop(0, "rgba(245,185,66,.13)"); g.addColorStop(1, "rgba(245,185,66,0)");
  ctx.fillStyle = g; ctx.fillRect(0, 0, ST_W, 1100);

  const isCal = T.layout === "cal";
  const picked = isCal ? storyCalRows() : storyPicked();
  const L = ST_LAYOUTS[T.layout];

  /* ---- 머리말 ----
     ★ v2.15b: 위로 바짝 올려 포스터 자리를 넓힌다.
       제목을 비우면 제목 줄이 통째로 사라지고 그만큼 포스터가 더 커진다. */
  const title = (T.title || "").trim();
  ctx.textAlign = "center";

  let y = 108;
  ctx.fillStyle = "#F5B942";
  ctx.font = `600 25px 'IBM Plex Mono', monospace`;
  ctx.fillText("주현  시네마테크", ST_W/2, y);

  if (title){
    y += 76;
    ctx.fillStyle = "#E8E6E1";
    ctx.font = `700 66px ${ST_DISP}`;
    ctx.fillText(ellipsis(ctx, title, ST_W - 120), ST_W/2, y);
  }

  const dates = picked.map(r => r.date).filter(Boolean).sort();
  const days = new Set(dates).size;
  const sub = isCal
    ? (picked.length ? `${picked.length}편 · ${days}일` : `${ymLabel(T.ym)}에는 기록이 없습니다`)
    : picked.length
      ? (dates.length
          ? `${dates[0].replace(/-/g,".")}${dates.length>1 && dates[0]!==dates[dates.length-1] ? " – " + dates[dates.length-1].replace(/-/g,".") : ""} · ${picked.length}편`
          : `${picked.length}편`)
      : "아래에서 작품을 골라주세요";
  y += 44;
  ctx.fillStyle = "#8B93A1";
  ctx.font = `400 27px ${ST_FONT}`;
  ctx.fillText(sub, ST_W/2, y);

  y += 30;
  ctx.strokeStyle = "rgba(245,185,66,.35)"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(ST_W/2 - 44, y); ctx.lineTo(ST_W/2 + 44, y); ctx.stroke();

  const headBottom = y + 34;
  if (!picked.length){ paintPreviewSize(); return; }

  if (isCal)               await drawCalStory(ctx, picked, headBottom);
  else if (T.layout === 1) await drawSingle(ctx, picked[0], headBottom);
  else                     await drawGrid(ctx, picked, L, headBottom);

  /* 꼬리말 */
  ctx.textAlign = "center";
  ctx.fillStyle = "#5A6270";
  ctx.font = `400 21px 'IBM Plex Mono', monospace`;
  ctx.fillText("MY CINEMATHEQUE · " + new Date().toISOString().slice(0,10).replace(/-/g,"."), ST_W/2, ST_H - 56);
  paintPreviewSize();
}

/* ---------------- 달력 틀 (v2.20) ----------------
   다이어리의 달력 뷰를 그대로 이미지로 옮긴다.
   한 칸 = 하루. 그 날 본 것 중 대표 한 편의 포스터가 칸을 채우고,
   여러 편이면 +N 배지가 붙는다. 기록 없는 날은 빈 칸(테두리만).
   ★ 포스터를 최대 42장 받으므로 격자 틀보다 느리다 — 미리보기가 늦게 채워질 수 있다. */
async function drawCalStory(ctx, rows, top){
  const T = S.story;
  const ym = T.ym;
  const Y = Number(ym.slice(0,4)), M = Number(ym.slice(5,7));
  const lead = new Date(Y, M-1, 1).getDay();
  const dayN = new Date(Y, M, 0).getDate();
  const weeks = Math.ceil((lead + dayN) / 7);

  const byDay = {};
  rows.forEach(r => { (byDay[r.date] = byDay[r.date] || []).push(r); });

  await preloadPosters(rows, "w342");   // 칸을 그리기 전에 한꺼번에 받아둔다

  const padX = 40, gap = 9;
  const cellW = (ST_W - padX*2 - gap*6) / 7;
  const cellH = cellW * 1.5;
  const wdH = 46;

  /* 세로가 모자라면 줄인다 (6주짜리 달) */
  const availH = (ST_H - 96) - (top + wdH);
  const needH = cellH * weeks + gap * (weeks - 1);
  const scale = needH > availH ? availH / needH : 1;
  const w = cellW * scale, h = cellH * scale;
  const gridW = w * 7 + gap * 6;
  const x0 = (ST_W - gridW) / 2;

  /* ★ 4~5주짜리 달은 아래가 크게 비므로 세로 가운데로 모은다 */
  const blockH = wdH + h * weeks + gap * (weeks - 1);
  const yTop = top + Math.max(0, (availH + wdH - blockH) / 2);

  /* 요일 머리 */
  ctx.textAlign = "center";
  ctx.font = `600 22px 'IBM Plex Mono', monospace`;
  for (let i = 0; i < 7; i++){
    ctx.fillStyle = i === 0 ? "#C8553D" : i === 6 ? "#5E9BD6" : "#5A6270";
    ctx.fillText(WD_ST[i], x0 + i * (w + gap) + w/2, yTop + 28);
  }

  const y0 = yTop + wdH;
  for (let i = 0; i < weeks * 7; i++){
    const dnum = i - lead + 1;
    if (dnum < 1 || dnum > dayN) continue;
    const x = x0 + (i % 7) * (w + gap);
    const y = y0 + Math.floor(i / 7) * (h + gap);
    const date = `${ym}-${String(dnum).padStart(2,"0")}`;
    const list = byDay[date] || [];
    await drawCalCell(ctx, x, y, w, h, dnum, list, scale);
  }
}

/* 칸을 편수에 맞춰 쪼갠 사각형들 — 앱 달력의 .shot 규칙과 같다
   (2편 위아래 / 3편 위 하나 + 아래 둘 / 4편 4분할) */
function shotRects(n, x, y, w, h){
  const g = 1.5;
  if (n <= 1) return [[x, y, w, h]];
  if (n === 2) return [[x, y, w, (h-g)/2], [x, y+(h+g)/2, w, (h-g)/2]];
  const hw = (w-g)/2, hh = (h-g)/2;
  if (n === 3) return [[x, y, w, hh], [x, y+hh+g, hw, hh], [x+hw+g, y+hh+g, hw, hh]];
  return [[x, y, hw, hh], [x+hw+g, y, hw, hh], [x, y+hh+g, hw, hh], [x+hw+g, y+hh+g, hw, hh]];
}

async function drawCalCell(ctx, x, y, w, h, dnum, list, scale){
  const T = S.story;
  const rad = 10 * scale;
  const has = list.length > 0;
  const use = list.slice(0, ST_SHOT_MAX);
  const lead = has ? use[0] : null;

  ctx.save();
  roundRect(ctx, x, y, w, h, rad); ctx.clip();
  if (has){
    ctx.fillStyle = "#12161D"; ctx.fillRect(x, y, w, h);
    const rects = shotRects(use.length, x, y, w, h);
    for (let i = 0; i < use.length; i++){
      const [rx, ry, rw, rh] = rects[i];
      const p = await posterFor(use[i]);
      const im = p ? await loadImg(IMG + "w342" + p) : null;
      ctx.save();
      ctx.beginPath(); ctx.rect(rx, ry, rw, rh); ctx.clip();
      if (im) drawCover(ctx, im, rx, ry, rw, rh);
      else {
        ctx.fillStyle = "#1C222C"; ctx.fillRect(rx, ry, rw, rh);
        ctx.fillStyle = "#8B93A1"; ctx.textAlign = "center";
        ctx.font = `600 ${Math.round(13*scale)}px ${ST_FONT}`;
        ctx.fillText(ellipsis(ctx, use[i].title, rw - 8), rx + rw/2, ry + rh/2);
      }
      ctx.restore();
    }
    /* 날짜가 포스터 위에서도 읽히도록 위쪽에 옅은 그늘 */
    if (T.showTitle){
      const gg = ctx.createLinearGradient(0, y, 0, y + h * 0.32);
      gg.addColorStop(0, "rgba(8,10,14,.78)"); gg.addColorStop(1, "rgba(8,10,14,0)");
      ctx.fillStyle = gg; ctx.fillRect(x, y, w, h * 0.32);
    }
  } else {
    ctx.fillStyle = "rgba(255,255,255,.03)"; ctx.fillRect(x, y, w, h);
  }
  ctx.restore();

  ctx.strokeStyle = has ? "rgba(255,255,255,.10)" : "rgba(255,255,255,.06)";
  ctx.lineWidth = 1.5;
  roundRect(ctx, x, y, w, h, rad); ctx.stroke();

  /* 날짜 */
  if (T.showTitle){
    ctx.textAlign = "left";
    ctx.font = `700 ${Math.round(20*scale)}px 'IBM Plex Mono', monospace`;
    ctx.fillStyle = has ? "#FFFFFF" : "#3A414E";
    ctx.fillText(String(dnum), x + 8*scale, y + 26*scale);
    ctx.textAlign = "center";
  }
  if (!has) return;

  /* +N — 쪼개고도 남는 편수 */
  if (list.length > ST_SHOT_MAX){
    const fs = Math.round(17 * scale);
    ctx.font = `700 ${fs}px 'IBM Plex Mono', monospace`;
    const lb = "+" + (list.length - ST_SHOT_MAX);
    const bw = ctx.measureText(lb).width + fs, bh = fs * 1.6;
    const bx = x + w - bw - 6*scale, by = y + 6*scale;
    ctx.fillStyle = "rgba(245,185,66,.94)";
    roundRect(ctx, bx, by, bw, bh, bh/2); ctx.fill();
    ctx.fillStyle = "#1A1408"; ctx.textBaseline = "middle";
    ctx.fillText(lb, bx + bw/2, by + bh/2 + 1);
    ctx.textBaseline = "alphabetic";
  }

  /* 별점 — 칸 아래쪽에 작게.
     여러 편을 쪼개 넣은 칸은 어느 작품의 별점인지 알 수 없으므로 그 날 최고 별점을 쓴다. */
  const v = list.map(r => parseRate(r.rate)).filter(x => x != null)
    .reduce((a,b) => Math.max(a,b), -1);
  if (T.showStar && v >= 0){
    const size = Math.round(15 * scale);
    const gg = ctx.createLinearGradient(0, y + h - size*3, 0, y + h);
    gg.addColorStop(0, "rgba(8,10,14,0)"); gg.addColorStop(1, "rgba(8,10,14,.82)");
    ctx.fillStyle = gg; ctx.fillRect(x, y + h - size*3, w, size*3);
    drawStars(ctx, v, x + w/2, y + h - size*0.7, size, "center");
  }
}

/* 격자 (4·9·12·16) */
async function drawGrid(ctx, picked, L, top){
  const T = S.story;
  const bottom = ST_H - 96;
  const padX = L.cols >= 4 ? 44 : 40, gap = L.cols >= 4 ? 18 : 22;
  /* 포스터 아래 캡션 자리 — 제목 한 줄 + 별점 한 줄이 들어갈 만큼만 */
  const lineH = L.cols >= 4 ? 30 : 34;
  const capH = 14 + (T.showTitle ? lineH : 0) + (T.showStar ? lineH : 0);
  /* ★ 고른 편수가 틀보다 적으면 실제로 채운 줄 수에 맞춰 키운다.
     (16칸 틀에 6편만 고르면 아래 절반이 텅 비고 포스터만 작아지던 문제) */
  const rows = Math.max(1, Math.ceil(picked.length / L.cols));
  const cellW = (ST_W - padX*2 - gap*(L.cols-1)) / L.cols;
  const cellH = cellW * 1.5 + capH;
  const availH = bottom - top;
  const needH = cellH * rows + gap * (rows - 1);
  const scale = needH > availH ? availH / needH : 1;
  const w = cellW * scale, posterH = cellW * 1.5 * scale, h = cellH * scale;
  const gridW = w * L.cols + gap * (L.cols - 1);
  const gridH = h * rows + gap * (rows - 1);
  const x0 = (ST_W - gridW) / 2, y0 = top + Math.max(0, (availH - gridH) / 2);

  for (let i = 0; i < picked.length; i++){
    const r = picked[i];
    const cx = x0 + (i % L.cols) * (w + gap);
    const cy = y0 + Math.floor(i / L.cols) * (h + gap);
    await drawTile(ctx, r, cx, cy, w, posterH, scale, L);   // scale은 캡션 글자 크기에만 쓴다
  }
}

async function drawTile(ctx, r, x, y, w, h, scale, L){
  const T = S.story;
  const rad = 14 * scale;

  /* 포스터 */
  const p = await posterFor(r);
  const im = p ? await loadImg(IMG + "w500" + p) : null;
  ctx.save();
  roundRect(ctx, x, y, w, h, rad); ctx.clip();
  if (im) drawCover(ctx, im, x, y, w, h);
  else {
    ctx.fillStyle = "#1C222C"; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = "#8B93A1"; ctx.textAlign = "center";
    ctx.font = `600 ${Math.round(22*scale)}px ${ST_FONT}`;
    ctx.fillText(ellipsis(ctx, r.title, w - 24), x + w/2, y + h/2);
  }
  ctx.restore();
  ctx.strokeStyle = "rgba(255,255,255,.10)"; ctx.lineWidth = 1.5;
  roundRect(ctx, x, y, w, h, rad); ctx.stroke();

  /* 플랫폼 배지 — 브랜드 색 알약에 머리글자 */
  const ab = platAbbr(r.plat);
  if (ab){
    const fs = Math.round((L.cols >= 4 ? 19 : 22) * scale);
    ctx.font = `700 ${fs}px ${ST_FONT}`;
    const tw = ctx.measureText(ab).width;
    const bw = Math.max(tw + fs*1.1, fs*1.9), bh = fs * 1.75;
    const bx = x + 10*scale, by = y + 10*scale;
    ctx.fillStyle = platColor(r.plat, r.med);
    roundRect(ctx, bx, by, bw, bh, bh/2); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(ab, bx + bw/2, by + bh/2 + 1);
    ctx.textBaseline = "alphabetic";
  }

  /* 캡션 — 제목 · 별점 */
  const lineH = Math.round((L.cols >= 4 ? 30 : 34) * scale);
  let cy = y + h + lineH;
  ctx.textAlign = "center";
  if (T.showTitle){
    ctx.fillStyle = "#E8E6E1";
    ctx.font = `600 ${Math.round((L.cols >= 4 ? 20 : 24) * scale)}px ${ST_FONT}`;
    ctx.fillText(ellipsis(ctx, r.title, w), x + w/2, cy);
    cy += lineH;
  }
  const v = parseRate(r.rate);
  if (T.showStar && v != null)
    drawStars(ctx, v, x + w/2, cy, Math.round((L.cols >= 4 ? 20 : 24) * scale), "center");
}

/* 1편 상세 — 아래 정보 블록에 필요한 만큼만 남기고 포스터를 최대한 키운다 */
async function drawSingle(ctx, r, top){
  const T = S.story;
  const rv = S.rows.filter(x => x.key === r.key).map(x => x.review).find(Boolean);
  const maxW = ST_W - 150;

  /* 제목이 두 줄이 될지 먼저 재고, 그만큼 자리를 비워둔다 */
  ctx.font = `700 54px ${ST_DISP}`;
  const titleLines = ctx.measureText(r.title).width > maxW ? 2 : 1;
  const v = parseRate(r.rate);
  const showStar = T.showStar && v != null;
  const metaH = titleLines * 62 + 52 + (showStar ? 74 : 0) + 76 + (rv ? 84 : 0) + 44;

  const py = top + 16;
  const pw = Math.min(772, (ST_H - 96 - py - metaH) / 1.5);
  const ph = pw * 1.5;
  const px = (ST_W - pw) / 2;

  const p = await posterFor(r);
  const im = p ? await loadImg(IMG + "w780" + p) : null;

  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,.6)"; ctx.shadowBlur = 40; ctx.shadowOffsetY = 16;
  roundRect(ctx, px, py, pw, ph, 22); ctx.clip();
  if (im) drawCover(ctx, im, px, py, pw, ph);
  else { ctx.fillStyle = "#1C222C"; ctx.fillRect(px, py, pw, ph); }
  ctx.restore();
  ctx.strokeStyle = "rgba(255,255,255,.12)"; ctx.lineWidth = 2;
  roundRect(ctx, px, py, pw, ph, 22); ctx.stroke();

  /* 플랫폼 배지 — 격자 칸과 같은 규칙 */
  const ab = platAbbr(r.plat);
  if (ab){
    ctx.font = `700 30px ${ST_FONT}`;
    const tw = ctx.measureText(ab).width;
    const bw = Math.max(tw + 34, 58), bh = 52;
    ctx.fillStyle = platColor(r.plat, r.med);
    roundRect(ctx, px + 18, py + 18, bw, bh, bh/2); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(ab, px + 18 + bw/2, py + 18 + bh/2 + 1);
    ctx.textBaseline = "alphabetic";
  }

  let y = py + ph + 74;
  ctx.textAlign = "center";

  /* 제목 */
  ctx.fillStyle = "#E8E6E1";
  ctx.font = `700 54px ${ST_DISP}`;
  if (titleLines === 2){
    const words = r.title.split(" ");
    let l1 = "", l2 = "";
    words.forEach(w => {
      if (!l2 && ctx.measureText(l1 + " " + w).width < maxW) l1 = (l1 ? l1 + " " : "") + w;
      else l2 = (l2 ? l2 + " " : "") + w;
    });
    if (!l1){ l1 = ellipsis(ctx, r.title, maxW); l2 = ""; }
    ctx.fillText(l1, ST_W/2, y);
    if (l2){ y += 62; ctx.fillText(ellipsis(ctx, l2, maxW), ST_W/2, y); }
  } else ctx.fillText(r.title, ST_W/2, y);

  y += 52;
  ctx.fillStyle = "#8B93A1";
  ctx.font = `400 28px ${ST_FONT}`;
  const meta = [r.year, r.dir ? r.dir.split(",")[0].trim() : "", r.genre ? r.genre.split(",")[0].trim() : ""]
    .filter(Boolean).join("  ·  ");
  if (meta) ctx.fillText(ellipsis(ctx, meta, ST_W - 140), ST_W/2, y);

  /* 별점 */
  if (showStar){
    y += 74;
    const w = drawStars(ctx, v, ST_W/2, y, 52, "center");
    ctx.fillStyle = "#F5B942";
    ctx.font = `600 34px 'IBM Plex Mono', monospace`;
    ctx.textAlign = "left";
    ctx.fillText(rateStr(v), ST_W/2 + w/2 + 18, y);
    ctx.textAlign = "center";
  }

  /* 관람 정보 알약 */
  y += 76;
  const where = [r.plat, branchShort(r.place, r.plat)].filter(Boolean).join(" ");
  const line = [r.undated ? UNDATED_LB : r.date.replace(/-/g,"."), where, r.time].filter(Boolean).join("   ·   ");
  if (line){
    ctx.font = `500 27px ${ST_FONT}`;
    const tw = ctx.measureText(line).width, bw = tw + 56, bh = 60;
    ctx.fillStyle = "rgba(255,255,255,.06)";
    roundRect(ctx, ST_W/2 - bw/2, y - 42, bw, bh, 30); ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,.10)"; ctx.lineWidth = 1.5;
    roundRect(ctx, ST_W/2 - bw/2, y - 42, bw, bh, 30); ctx.stroke();
    ctx.fillStyle = "#C9CFD8";
    ctx.fillText(line, ST_W/2, y);
  }

  /* 한줄평 */
  if (rv){
    y += 84;
    ctx.fillStyle = "#E8E6E1";
    ctx.font = `italic 400 32px ${ST_DISP}`;
    ctx.fillText(ellipsis(ctx, `“${rv}”`, ST_W - 160), ST_W/2, y);
  }
}

/* 미리보기 크기 맞추기 (캔버스는 항상 1080×1920, 화면에서만 축소) */
function paintPreviewSize(){
  const cv = $("#st-canvas");
  if (cv) cv.style.aspectRatio = "1080 / 1920";
}

/* ---------------- 저장 · 공유 ---------------- */
function storyFileName(){
  const t = (S.story.title || (S.story.layout === "cal" ? ymLabel(S.story.ym) : "story"))
    .replace(/[\\/:*?"<>|\s]+/g, "_").slice(0, 20);
  return `cine_${t}_${new Date().toISOString().slice(0,10)}.png`;
}

/* 지금 저장할 만한 내용이 있는지 */
function storyHasContent(){
  return S.story.layout === "cal" ? storyCalRows().length > 0 : S.story.picks.length > 0;
}
function storyEmptyMsg(){
  return S.story.layout === "cal"
    ? `${ymLabel(S.story.ym)}에는 기록이 없습니다 — 다른 달을 골라주세요`
    : "작품을 먼저 골라주세요";
}
async function storyBlob(){
  return new Promise((res, rej) => {
    try { $("#st-canvas").toBlob(b => b ? res(b) : rej(new Error("이미지 생성 실패")), "image/png"); }
    catch(e){ rej(e); }
  });
}
async function storyDownload(){
  if (!storyHasContent()){ toast(storyEmptyMsg(), "warn"); return; }
  try {
    const b = await storyBlob();
    const url = URL.createObjectURL(b);
    const a = document.createElement("a");
    a.href = url; a.download = storyFileName();
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    toast("이미지를 내려받았습니다 — 인스타 스토리에 올려보세요");
  } catch(e){
    toast("저장 실패 — 포스터 이미지 권한 문제일 수 있습니다", "warn");
    console.error(e);
  }
}
async function storyShare(){
  if (!storyHasContent()){ toast(storyEmptyMsg(), "warn"); return; }
  try {
    const b = await storyBlob();
    const file = new File([b], storyFileName(), { type: "image/png" });
    if (navigator.canShare && navigator.canShare({ files:[file] })){
      await navigator.share({ files:[file], title: S.story.title || "주현 시네마테크" });
    } else storyDownload();
  } catch(e){
    if (e && e.name === "AbortError") return;
    storyDownload();
  }
}
