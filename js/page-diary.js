/* =====================================================================
   page-diary.js — 다이어리 (월별 타임라인, 티켓식 표기)
   ===================================================================== */

function renderDiary(reset = true){
  const el = $("#diary");
  const D = S.diary;
  if (reset){ el.innerHTML=""; D.shown=0; }
  $("#diary-cnt").textContent = `${S.view.length.toLocaleString()}편`;
  if (!S.view.length){
    el.innerHTML = '<div class="empty"><b>기록이 없습니다</b></div>';
    $("#more-d").style.display = "none"; return;
  }
  const slice = S.view.slice(D.shown, D.shown+80);
  let curYM = D.shown > 0 ? S.view[D.shown-1].date.slice(0,7) : "";
  let mdiv = curYM ? el.lastElementChild : null;

  slice.forEach(r => {
    const ym = r.date.slice(0,7);
    if (ym !== curYM){
      curYM = ym;
      mdiv = document.createElement("div"); mdiv.className = "diary-month";
      const cnt = S.view.filter(x=>x.date.slice(0,7)===ym).length;
      mdiv.innerHTML = `<h3>${ym.replace("-","년 ")}월 <span>${cnt}편</span></h3>`;
      el.appendChild(mdiv);
    }
    const d = document.createElement("div"); d.className = "drow"; d.tabIndex = 0;
    const wd = ["일","월","화","수","목","금","토"][new Date(r.date).getDay()];
    d.innerHTML = `<div class="dd"><b>${r.date.slice(8)}</b>${wd}</div>
      <div class="thumb"></div>
      <div class="tt"><div class="t"><span class="dot ${r.med}"></span>${esc(r.title)}${seasonTag(r)}${r.eps ? ` <span style="color:var(--faint);font-size:12px">· ${esc(r.eps)}화</span>` : ""}</div>
        <div class="m">${[r.cat, r.dir?r.dir.split(",")[0]:"", r.genre?r.genre.split(",").slice(0,2).join("·"):""].filter(Boolean).map(esc).join(" · ")}</div></div>
      <div class="pl"><div class="p">${esc(r.plat||"—")}</div><div class="tm">${esc(r.time||(r.start!==r.date?r.start+"~":""))}</div></div>`;
    d.onclick = () => openModal(r);
    d.onkeydown = e => { if (e.key==="Enter") openModal(r); };
    mdiv.appendChild(d);
    posterFor(r).then(p => { if (p) d.querySelector(".thumb").innerHTML = `<img src="${IMG}w92${p}" alt="">`; });
  });
  D.shown += slice.length;
  $("#more-d").style.display = D.shown < S.view.length ? "" : "none";
}

RENDERERS.diary = () => renderDiary(true);
