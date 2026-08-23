FILEV["diary"] = "2.23";
/* =====================================================================
   page-diary.js — 다이어리
   ① 타임라인 (월별, 티켓식 표기)
   ② 달력 (v2.15) — 왓챠피디아식 월 달력. 그 날 본 것의 포스터가 칸을 채운다.
   두 뷰 모두 S.view(연도 필터 결과)를 쓰고, 카테고리 칩으로 한 번 더 좁힌다.
   ★ 날짜 미상 기록은 어느 뷰에도 놓을 자리가 없어 제외하고 건수만 알린다.
   ===================================================================== */

const WD = ["일","월","화","수","목","금","토"];

/* ---------------- 하루 안에서의 순서 ----------------
   ① 사용자가 직접 정한 순서(시트 '순서' 칼럼)가 있으면 그것
   ② 없으면 상영시각 순 (극장 관람은 이게 실제 순서다. 시각 없는 건 뒤로)
   ③ 그래도 같으면 기록된 순서(no)
   달력 칸의 분할 배치와 아래 목록이 같은 순서를 쓴다. */
function dayOrder(rs){
  return rs.slice().sort((a,b) => {
    const oa = a.ord ? Number(a.ord) : null, ob = b.ord ? Number(b.ord) : null;
    if (oa != null && ob != null && oa !== ob) return oa - ob;
    if (oa != null && ob == null) return -1;
    if (oa == null && ob != null) return 1;
    const ta = a.time || "~", tb = b.time || "~";
    if (ta !== tb) return ta < tb ? -1 : 1;
    return Number(a.no) - Number(b.no);
  });
}

/* 카테고리 칩까지 적용한 이 탭의 대상 목록 */
function diaryRows(){
  const D = S.diary;
  return S.view.filter(r => !r.undated && (!D.cat || r.cat === D.cat));
}

/* ---------------- 공통 머리(뷰 전환 + 카테고리 칩) ---------------- */
function renderDiaryHead(){
  const D = S.diary;
  const cats = CONFIG.SCOPE.filter(c => S.view.some(r => r.cat === c));
  $("#diary-head").innerHTML =
    `<div class="dv-tabs">
       <button class="dv${D.view==="list"?" on":""}" data-dv="list">타임라인</button>
       <button class="dv${D.view==="cal"?" on":""}" data-dv="cal">달력</button>
     </div>
     <div class="dv-cats">
       <button class="chip${!D.cat?" on":""}" data-dcat="">전체</button>
       ${cats.map(c => `<button class="chip${D.cat===c?" on":""}" data-dcat="${esc(c)}">${esc(c)}</button>`).join("")}
     </div>`;

  $$("#diary-head [data-dv]").forEach(b => b.onclick = () => {
    D.view = b.dataset.dv; D.day = null; renderDiary(true);
  });
  $$("#diary-head [data-dcat]").forEach(b => b.onclick = () => {
    D.cat = b.dataset.dcat || null; D.day = null; renderDiary(true);
  });
}

/* ---------------- 진입점 ---------------- */
function renderDiary(reset = true){
  renderDiaryHead();
  const D = S.diary;
  const list = diaryRows();
  const undatedN = S.view.filter(r => r.undated).length;
  $("#diary-cnt").textContent = `${list.length.toLocaleString()}편`
    + (undatedN ? ` · 날짜 미상 ${undatedN}편은 제외` : "");

  if (D.view === "cal"){
    $("#diary").style.display = "none";
    $("#diary-cal").style.display = "";
    $("#more-d").style.display = "none";
    renderDiaryCal(list);
    return;
  }
  $("#diary-cal").style.display = "none";
  $("#diary").style.display = "";
  renderDiaryList(list, reset);
}

/* ---------------- ① 타임라인 ---------------- */
function renderDiaryList(list, reset){
  const el = $("#diary");
  const D = S.diary;
  if (reset){ el.innerHTML=""; D.shown=0; }
  D.list = list;
  if (!D.list.length){
    el.innerHTML = '<div class="empty"><b>기록이 없습니다</b></div>';
    $("#more-d").style.display = "none"; return;
  }
  const slice = D.list.slice(D.shown, D.shown+80);
  let curYM = D.shown > 0 ? D.list[D.shown-1].date.slice(0,7) : "";
  let mdiv = curYM ? el.lastElementChild : null;

  slice.forEach(r => {
    const ym = r.date.slice(0,7);
    if (ym !== curYM){
      curYM = ym;
      mdiv = document.createElement("div"); mdiv.className = "diary-month";
      const cnt = D.list.filter(x=>x.date.slice(0,7)===ym).length;
      mdiv.innerHTML = `<h3>${ym.replace("-","년 ")}월 <span>${cnt}편</span></h3>`;
      el.appendChild(mdiv);
    }
    mdiv.appendChild(diaryRow(r));
  });
  D.shown += slice.length;
  $("#more-d").style.display = D.shown < D.list.length ? "" : "none";
}

/* 타임라인 한 줄 (달력의 '그 날' 목록에서도 재사용) */
function diaryRow(r){
  const d = document.createElement("div"); d.className = "drow"; d.tabIndex = 0;
  const wd = WD[new Date(r.date).getDay()];
  d.innerHTML = `<div class="dd"><b>${r.date.slice(8)}</b>${wd}</div>
    <div class="thumb"></div>
    <div class="tt"><div class="t"><span class="dot ${r.med}"></span>${esc(r.title)}${seasonTag(r)}${r.eps ? ` <span style="color:var(--faint);font-size:12px">· ${esc(r.eps)}화</span>` : ""}</div>
      <div class="m">${[r.cat, r.dir?r.dir.split(",")[0]:"", r.genre?r.genre.split(",").slice(0,2).join("·"):""].filter(Boolean).map(esc).join(" · ")}</div></div>
    <div class="pl"><div class="p">${esc(r.plat||"—")}</div><div class="tm">${esc(r.time||(r.start!==r.date?r.start+"~":""))}</div></div>`;
  d.onclick = () => openModal(r);
  d.onkeydown = e => { if (e.key==="Enter") openModal(r); };
  posterFor(r).then(p => { if (p) d.querySelector(".thumb").innerHTML = `<img src="${IMG}w92${p}" alt="">`; });
  return d;
}

/* ---------------- 하루 칸의 포스터 ----------------
   ★ v2.21: 하루에 여러 편이면 칸을 쪼개 함께 보여준다.
     2편 = 위아래, 3편 = 위 한 칸 + 아래 둘, 4편 = 4분할.
     4를 넘기면 나머지는 +N으로 — 달력 칸은 모바일에서 한 변이 45px 남짓이라
     그 이상 쪼개면 어느 영화인지 알아볼 수 없다(9분할이면 15px 조각). */
const SHOT_MAX = 4;

function dayShot(rs){
  const use = rs.slice(0, SHOT_MAX);
  const box = document.createElement("div");
  box.className = "shot n" + use.length;
  use.forEach(r => {
    /* ★ 조각마다 타일을 하나씩 둔다. 포스터를 못 받아도 칸이 비어 보이지 않도록
       제목 글자를 깔아두고, 포스터가 도착하면 그 위를 덮는다.
       (예전엔 <img>만 넣어서 포스터 실패 시 검은 조각으로 보였다) */
    const t = document.createElement("div");
    t.className = "sh";
    t.innerHTML = `<span>${esc(r.title)}</span>`;
    const im = document.createElement("img");
    im.alt = "";
    im.onerror = () => im.remove();
    t.appendChild(im);
    box.appendChild(t);
    posterFor(r).then(p => { if (p){ im.src = IMG + "w185" + p; im.classList.add("ld"); } });
  });
  return box;
}

/* ---------------- ② 달력 ---------------- */
function ymAdd(ym, n){
  const [y,m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0");
}

function renderDiaryCal(list){
  const D = S.diary;
  /* 보고 있는 달이 없으면 기록이 있는 가장 최근 달로 */
  if (!D.ym) D.ym = list.length ? list[0].date.slice(0,7) : new Date().toISOString().slice(0,7);

  const byDay = {};
  list.forEach(r => { (byDay[r.date] = byDay[r.date] || []).push(r); });
  Object.keys(byDay).forEach(k => { byDay[k] = dayOrder(byDay[k]); });

  const Y = Number(D.ym.slice(0,4)), M = Number(D.ym.slice(5,7));
  const lead = new Date(Y, M-1, 1).getDay();
  const days = new Date(Y, M, 0).getDate();
  const cells = Math.ceil((lead + days) / 7) * 7;
  const monthN = list.filter(r => r.date.slice(0,7) === D.ym).length;
  const thisYM = new Date().toISOString().slice(0,7);

  const el = $("#diary-cal");
  el.innerHTML =
    `<div class="cal-head">
       <button class="cal-nav" id="cal-prev" aria-label="이전 달">◀</button>
       <div class="cal-ym"><b>${Y}년 ${M}월</b><span>${monthN}편</span></div>
       <button class="cal-nav" id="cal-next" aria-label="다음 달">▶</button>
       ${D.ym !== thisYM ? '<button class="cal-today" id="cal-today">이번 달</button>' : ""}
     </div>
     <div class="cal-actions">
       <button class="chip story" id="cal-story" title="이 달 달력을 그대로 스토리 이미지로">🖼 이 달을 스토리로</button>
     </div>
     <div class="cal-wd">${WD.map((w,i)=>`<span class="${i===0?"sun":i===6?"sat":""}">${w}</span>`).join("")}</div>
     <div class="cal-grid" id="cal-grid"></div>
     <div id="cal-day"></div>`;

  const grid = $("#cal-grid");
  for (let i = 0; i < cells; i++){
    const dnum = i - lead + 1;
    const cell = document.createElement("div");
    if (dnum < 1 || dnum > days){ cell.className = "cal-cell out"; grid.appendChild(cell); continue; }

    const date = `${D.ym}-${String(dnum).padStart(2,"0")}`;
    const rs = byDay[date] || [];
    cell.className = "cal-cell" + (rs.length ? " has" : "") + (D.day === date ? " sel" : "");
    cell.innerHTML = `<span class="dn ${i%7===0?"sun":i%7===6?"sat":""}">${dnum}</span>`
      + (rs.length > SHOT_MAX ? `<span class="more">+${rs.length-SHOT_MAX}</span>` : "");

    if (rs.length){
      cell.tabIndex = 0;
      cell.setAttribute("role","button");
      cell.setAttribute("aria-label", `${M}월 ${dnum}일 · ${rs.map(r=>r.title).join(", ")}`);
      cell.title = rs.map(r => r.title + (parseRate(r.rate)!=null ? ` ★${rateStr(parseRate(r.rate))}` : "")).join("\n");
      cell.insertBefore(dayShot(rs), cell.firstChild);
      cell.onclick = () => {
        if (rs.length === 1){ openModal(rs[0]); return; }
        D.day = D.day === date ? null : date;
        renderDiaryCal(list);
      };
      cell.onkeydown = e => { if (e.key === "Enter") cell.onclick(); };
    }
    grid.appendChild(cell);
  }

  /* 여러 편 본 날 — 아래에 그 날 목록을 펼친다 */
  if (D.day && byDay[D.day]){
    const rs = byDay[D.day];
    const box = $("#cal-day");
    box.className = "cal-daybox";
    const h = document.createElement("h3");
    h.innerHTML = `${Number(D.day.slice(8))}일 ${WD[new Date(D.day).getDay()]}요일 <span>${rs.length}편</span>`
      + (rs.length > 1 ? '<span class="dragtip">길게 눌러 순서 바꾸기</span>' : "");
    box.appendChild(h);

    const listEl = document.createElement("div");
    listEl.className = "daylist";
    rs.forEach(r => {
      const row = diaryRow(r);
      row.dataset.no = r.no;
      if (rs.length > 1){
        const g = document.createElement("span");
        g.className = "grip"; g.textContent = "⠿"; g.title = "길게 눌러 끌면 순서가 바뀝니다";
        row.appendChild(g);
      }
      listEl.appendChild(row);
    });
    box.appendChild(listEl);
    if (rs.length > 1) makeSortable(listEl, D.day);
  }

  /* 지금 보고 있는 달을 그대로 스토리 이미지로 (v2.20) */
  $("#cal-story").onclick = () => openStory({ ym: D.ym });

  $("#cal-prev").onclick = () => { D.ym = ymAdd(D.ym, -1); D.day = null; renderDiaryCal(list); };
  $("#cal-next").onclick = () => { D.ym = ymAdd(D.ym,  1); D.day = null; renderDiaryCal(list); };
  const t = $("#cal-today");
  if (t) t.onclick = () => { D.ym = thisYM; D.day = null; renderDiaryCal(list); };
}

RENDERERS.diary = () => renderDiary(true);

/* ---------------- 길게 눌러 순서 바꾸기 (v2.23) ----------------
   ★ 모바일에서 스크롤과 드래그를 구분해야 한다.
     짧게 누르면 스크롤·클릭, 400ms 이상 누르고 있으면 그때부터 끌기로 전환한다
     (누르자마자 끌기로 잡으면 목록을 스크롤할 수가 없다).
   ★ 순서는 시트 '순서' 칼럼에 1,2,3…으로 저장한다. 값이 없으면 상영시각 순이 기본이다. */
const SORT_HOLD_MS = 400;

function makeSortable(listEl, date){
  let held = null, startY = 0, timer = null, moved = false, dragging = false;

  const rows = () => [...listEl.querySelectorAll(".drow")];

  const endDrag = async (commit) => {
    clearTimeout(timer);
    if (held) held.classList.remove("held");
    listEl.classList.remove("sorting");
    document.body.style.userSelect = "";
    const wasDragging = dragging;
    dragging = false; held = null;
    if (wasDragging && commit) await saveDayOrder(listEl, date);
  };

  listEl.addEventListener("pointerdown", e => {
    const row = e.target.closest(".drow");
    if (!row) return;
    held = row; startY = e.clientY; moved = false; dragging = false;
    timer = setTimeout(() => {
      dragging = true;
      row.classList.add("held");
      listEl.classList.add("sorting");
      document.body.style.userSelect = "none";
      if (navigator.vibrate) { try { navigator.vibrate(12); } catch(err){} }
      try { row.setPointerCapture(e.pointerId); } catch(err){}
    }, SORT_HOLD_MS);
  });

  listEl.addEventListener("pointermove", e => {
    if (!held) return;
    if (!dragging){
      /* 아직 끌기 전인데 손가락이 움직였다면 스크롤 의도 — 대기를 취소한다 */
      if (Math.abs(e.clientY - startY) > 8){ clearTimeout(timer); held = null; }
      return;
    }
    e.preventDefault();
    moved = true;
    const others = rows().filter(r => r !== held);
    /* 포인터가 어느 행의 중앙을 넘었는지 보고 그 앞/뒤로 옮긴다 */
    let placed = false;
    for (const r of others){
      const b = r.getBoundingClientRect();
      if (e.clientY < b.top + b.height / 2){
        listEl.insertBefore(held, r); placed = true; break;
      }
    }
    if (!placed) listEl.appendChild(held);
  }, { passive: false });

  listEl.addEventListener("pointerup",     () => endDrag(moved));
  listEl.addEventListener("pointercancel", () => endDrag(false));
  listEl.addEventListener("pointerleave",  e => { if (!dragging) { clearTimeout(timer); held = null; } });

  /* 끌어서 옮긴 직후의 클릭은 상세 모달을 열지 않게 막는다 */
  listEl.addEventListener("click", e => {
    if (moved){ e.stopPropagation(); e.preventDefault(); moved = false; }
  }, true);
}

async function saveDayOrder(listEl, date){
  const nos = [...listEl.querySelectorAll(".drow")].map(r => Number(r.dataset.no)).filter(Boolean);
  if (nos.length < 2) return;

  /* 화면에는 이미 반영돼 있으니 메모리부터 맞춘다 (저장이 실패해도 이 화면은 유지) */
  const before = {};
  nos.forEach((no, i) => {
    const row = S.rows.find(x => Number(x.no) === no);
    if (row){ before[no] = row.ord; row.ord = i + 1; }
  });

  if (!await ensureAuth("순서를 저장하려면 비밀번호가 필요합니다.")){
    Object.keys(before).forEach(no => {
      const row = S.rows.find(x => String(x.no) === String(no));
      if (row) row.ord = before[no];
    });
    renderDiaryCal(diaryRows());
    return;
  }
  try {
    await gsPost({ action: "reorder", items: nos.map((no, i) => ({ no, ord: i + 1 })) });
    toast("순서를 저장했습니다");
  } catch(e){
    Object.keys(before).forEach(no => {
      const row = S.rows.find(x => String(x.no) === String(no));
      if (row) row.ord = before[no];
    });
    toast("순서 저장 실패 — 되돌렸습니다: " + e.message, "warn");
  }
  renderDiaryCal(diaryRows());
}
