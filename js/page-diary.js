FILEV["diary"] = "2.20";
/* =====================================================================
   page-diary.js — 다이어리
   ① 타임라인 (월별, 티켓식 표기)
   ② 달력 (v2.15) — 왓챠피디아식 월 달력. 그 날 본 것의 포스터가 칸을 채운다.
   두 뷰 모두 S.view(연도 필터 결과)를 쓰고, 카테고리 칩으로 한 번 더 좁힌다.
   ★ 날짜 미상 기록은 어느 뷰에도 놓을 자리가 없어 제외하고 건수만 알린다.
   ===================================================================== */

const WD = ["일","월","화","수","목","금","토"];

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
      + (rs.length > 1 ? `<span class="more">+${rs.length-1}</span>` : "");

    if (rs.length){
      cell.tabIndex = 0;
      cell.setAttribute("role","button");
      cell.setAttribute("aria-label", `${M}월 ${dnum}일 · ${rs.map(r=>r.title).join(", ")}`);
      cell.title = rs.map(r => r.title + (parseRate(r.rate)!=null ? ` ★${rateStr(parseRate(r.rate))}` : "")).join("\n");
      const im = document.createElement("img");
      im.alt = ""; cell.insertBefore(im, cell.firstChild);
      posterFor(rs[0]).then(p => { if (p){ im.src = IMG + "w185" + p; im.classList.add("ld"); } });
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
    const box = $("#cal-day");
    box.className = "cal-daybox";
    const h = document.createElement("h3");
    h.innerHTML = `${Number(D.day.slice(8))}일 ${WD[new Date(D.day).getDay()]}요일 <span>${byDay[D.day].length}편</span>`;
    box.appendChild(h);
    byDay[D.day].forEach(r => box.appendChild(diaryRow(r)));
  }

  /* 지금 보고 있는 달을 그대로 스토리 이미지로 (v2.20) */
  $("#cal-story").onclick = () => openStory({ ym: D.ym });

  $("#cal-prev").onclick = () => { D.ym = ymAdd(D.ym, -1); D.day = null; renderDiaryCal(list); };
  $("#cal-next").onclick = () => { D.ym = ymAdd(D.ym,  1); D.day = null; renderDiaryCal(list); };
  const t = $("#cal-today");
  if (t) t.onclick = () => { D.ym = thisYM; D.day = null; renderDiaryCal(list); };
}

RENDERERS.diary = () => renderDiary(true);
