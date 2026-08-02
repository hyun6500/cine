FILEV["ticket"] = "2.22";
/* =====================================================================
   page-ticket.js — 멀티플렉스 티켓 스크린샷으로 기록 추가
   흐름: 이미지 선택 → 브라우저에서 축소 → Apps Script(Gemini) 판독
        → 연도 추정 → TMDB 매칭 → 기존 기록 대조 → 확인 후 저장
   ★ 이미지는 판독에만 쓰고 어디에도 저장하지 않는다 (예매번호·이름이 찍혀 있으므로)
   ===================================================================== */

let ticketCands = [];
const WEEKDAYS = ["일","월","화","수","목","금","토"];

/* ---------------- 이미지 축소 (업로드량·판독시간 절감) ---------------- */
function shrinkImage(file, maxSide = 1400, quality = 0.82){
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      const dataUrl = c.toDataURL("image/jpeg", quality);
      resolve({ name: file.name, mime: "image/jpeg", data: dataUrl.split(",")[1] });
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("이미지를 읽지 못했습니다")); };
    img.src = url;
  });
}

/* ---------------- 연도 추정 ----------------
   티켓에는 연도가 없고 요일만 있다. 월·일·요일이 맞아떨어지는 해를 고르면
   후보가 6년에 하나꼴로 좁혀진다. 미래는 제외하고 가장 최근 해를 기본값으로. */
function yearCandidates(month, day, weekday){
  if (!month || !day) return [];
  const now = new Date(), thisYear = now.getFullYear();
  const out = [];
  for (let y = thisYear; y >= 2010; y--){
    const d = new Date(y, month - 1, day);
    if (d.getMonth() !== month - 1) continue;               // 2/30 같은 날짜 배제
    if (d > now) continue;                                   // 미래 제외
    if (weekday && WEEKDAYS[d.getDay()] !== weekday) continue;
    out.push(y);
  }
  return out;
}

/* ---------------- 판독 ---------------- */
function renderTicket(){
  if ($("#ticket-card").dataset.ready) return;
  $("#ticket-card").dataset.ready = "1";
  $("#ticket-file").addEventListener("change", handleTicketFiles);
  $("#ticket-send").onclick = ticketSend;
}

async function handleTicketFiles(e){
  const files = [...e.target.files].slice(0, 12);
  if (!files.length) return;
  if (!CONFIG.APPS_SCRIPT_URL){ toast("APPS_SCRIPT_URL이 설정돼 있지 않습니다", "warn"); return; }
  if (!await ensureAuth("티켓을 판독하려면 비밀번호가 필요합니다.")) return;

  const prev = $("#ticket-preview");
  prev.innerHTML = `<div class="hint">이미지 ${files.length}장 준비 중…</div>`;
  ticketCands = [];

  let shrunk;
  try { shrunk = await Promise.all(files.map(f => shrinkImage(f))); }
  catch(err){ prev.innerHTML = `<div class="hint">${esc(err.message)}</div>`; return; }

  /* 3장씩 나눠 보낸다 — Apps Script 실행시간 한도(6분)를 넘기지 않도록 */
  const out = [];
  for (let i = 0; i < shrunk.length; i += 3){
    prev.innerHTML = `<div class="hint">판독 중… ${i}/${shrunk.length}장</div>`;
    try {
      const r = await gsPost({ action: "ocr", images: shrunk.slice(i, i + 3) });
      out.push(...(r.tickets || []));
    } catch(err){
      prev.innerHTML = `<div class="hint">판독 실패: ${esc(err.message)}</div>`;
      return;
    }
  }

  /* ★ 같은 예매를 두 번 캡처했거나(예: 예매내역 목록 + 티켓 상세) 같은 파일을 두 번 고른 경우,
     판독 단계에서 미리 접어둔다. 제목·날짜·시각이 모두 같으면 같은 회차다. */
  const seen = new Set();
  ticketCands = out.map(t => buildTicketCand(t)).map(c => {
    if (c.error) return c;
    const k = tkKey(c);
    if (seen.has(k)){ c.checked = false; c.dupOfUpload = true; }
    seen.add(k);
    return c;
  });
  const folded = ticketCands.filter(c => c.dupOfUpload).length;
  if (folded) toast(`같은 회차로 보이는 캡처 ${folded}장은 체크를 풀어뒀습니다`, "warn");
  renderTicketPreview();
  ticketAutoMatch();
}

function buildTicketCand(t){
  if (t.error) return { error: t.error, name: t.name || "", checked: false };

  const years = yearCandidates(t.month, t.day, t.weekday);
  const year = years[0] || new Date().getFullYear();
  const date = t.month && t.day
    ? `${year}-${String(t.month).padStart(2,"0")}-${String(t.day).padStart(2,"0")}` : "";

  const plat = t.brand && t.brand !== "기타" ? t.brand : "";
  const place = [plat, t.branch, t.hall].filter(Boolean).join(" ").trim();

  const c = {
    title: (t.title || "").trim(), format: t.format || "",
    date, years, month: t.month, day: t.day, weekday: t.weekday || "",
    time: t.time || "", endTime: t.end_time || "", plat, branch: t.branch || "", hall: t.hall || "", place,
    people: t.people || "", seats: t.seats || "", grade: t.rating || "",
    tmdb: "", ntype: "", year: "", dirT: "", genreT: "", nation: "",
    searched: false, amb: 0, name: t.name || "",
  };
  Object.assign(c, matchExisting(c));
  c.checked = c.status !== "보유";
  return c;
}

/* 같은 회차인지 판별하는 키 — 제목·날짜·시각 */
function tkKey(c){ return [normT(c.title), c.date, c.time || ""].join("|"); }

/* ★ 대조 규칙: 같은 날짜 + 같은 상영시각일 때만 '보유'.
   날짜나 시각이 다르면 별도 관람이므로 신규다 (같은 영화·같은 극장이어도). */
function matchExisting(c){
  if (!c.date || !c.title) return { status: "확인필요", hitNo: "" };
  const same = S.rows.find(r =>
    r.date === c.date && normT(r.title) === normT(c.title) &&
    (!c.time || !r.time || r.time === c.time));
  if (same) return { status: "보유", hitNo: same.no };
  const other = S.rows.find(r => normT(r.title) === normT(c.title));
  return { status: other ? "재관람" : "신규", hitNo: other ? other.no : "" };
}

/* ---------------- TMDB 매칭 (CSV 업로드와 같은 규칙) ---------------- */
async function ticketAutoMatch(){
  if (!tmdbReady()){ ticketCands.forEach(c => c.searched = true); renderTicketPreview(); return; }
  for (const c of ticketCands){
    if (c.error || c.tmdb || !c.title){ if (c) c.searched = true; continue; }
    try {
      const d = await tmdb("/search/movie", { query: c.title });
      const exact = (d.results||[]).filter(x => normT(x.title) === normT(c.title));
      if (exact.length === 1){
        const m = exact[0], meta = await workMeta("movie", m.id);
        c.tmdb = String(m.id); c.ntype = "movie";
        c.year = meta.year; c.dirT = meta.dirs; c.genreT = meta.genres; c.nation = meta.countries;
        if (meta.title) c.title = meta.title;          // 제목은 TMDB 표기로 통일
        Object.assign(c, matchExisting(c));
      } else if (exact.length > 1) c.amb = exact.length;
    } catch(e){}
    c.searched = true;
    renderTicketPreview();
  }
}

/* ---------------- 미리보기 ---------------- */
function renderTicketPreview(){
  const el = $("#ticket-preview");
  if (!ticketCands.length){ el.innerHTML = ""; $("#ticket-actions").style.display = "none"; return; }

  const ok = ticketCands.filter(c => !c.error);
  el.innerHTML = `
    <div class="csv-sum">티켓 ${ticketCands.length}장 — 신규·재관람 <b>${ok.filter(c=>c.status!=="보유").length}</b>
      · 이미 있음 ${ok.filter(c=>c.status==="보유").length}
      <span class="sub">연도는 요일로 추정했습니다. 다른 해라면 아래에서 바꾸세요.</span></div>
    <div class="csv-table">
      <div class="ct-row tk head"><span></span><span>제목</span><span>날짜</span><span>시각</span><span>극장</span><span>TMDB</span><span>상태</span></div>
      ${ticketCands.map((c,i) => c.error
        ? `<div class="ct-row tk off"><span></span><span class="ti">${esc(c.name)}</span>
             <span class="mono" style="grid-column:3/8">${esc(c.error)}</span></div>`
        : `<div class="ct-row tk ${c.checked?"":"off"}">
        <input type="checkbox" data-i="${i}" ${c.checked?"checked":""}>
        <input type="text" class="ti" data-i="${i}" data-f="title" value="${esc(c.title)}">
        <span class="dcell">
          ${c.years.length > 1
            ? `<select class="ysel2" data-i="${i}">${c.years.map(y=>`<option ${String(y)===c.date.slice(0,4)?"selected":""}>${y}</option>`).join("")}</select>`
            : `<span class="mono">${esc(c.date.slice(0,4))}</span>`}
          <span class="mono">${esc(c.date.slice(5))}${c.weekday?`(${esc(c.weekday)})`:""}</span>
        </span>
        <input type="text" class="ss" data-i="${i}" data-f="time" value="${esc(c.time)}">
        <span class="mono sub2" title="${esc(c.place)}">${esc(c.plat||"—")}${c.branch?" "+esc(c.branch):""}</span>
        <span class="tmc">${c.tmdb
          ? `<button class="tmb ok" data-pick="${i}">${esc(c.year||"확정")}</button>`
          : c.amb ? `<button class="tmb amb" data-pick="${i}">선택 ${c.amb}건</button>`
          : c.searched ? `<button class="tmb" data-pick="${i}">직접 찾기</button>`
          : `<span class="tmb wait">조회 중…</span>`}</span>
        <span class="st ${c.status}">${c.status}${c.hitNo?` <i>no.${esc(c.hitNo)}</i>`:""}</span>
      </div>`).join("")}
    </div>`;

  el.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.onchange = e => {
    ticketCands[+e.target.dataset.i].checked = e.target.checked;
    e.target.closest(".ct-row").classList.toggle("off", !e.target.checked);
  });
  el.querySelectorAll('input[type="text"]').forEach(inp => inp.onchange = e => {
    const c = ticketCands[+e.target.dataset.i];
    c[e.target.dataset.f] = e.target.value.trim();
    Object.assign(c, matchExisting(c));
    renderTicketPreview();
  });
  el.querySelectorAll(".ysel2").forEach(sel => sel.onchange = e => {
    const c = ticketCands[+e.target.dataset.i];
    c.date = `${e.target.value}-${String(c.month).padStart(2,"0")}-${String(c.day).padStart(2,"0")}`;
    Object.assign(c, matchExisting(c));
    renderTicketPreview();
  });
  el.querySelectorAll("[data-pick]").forEach(b => b.onclick = () => {
    const c = ticketCands[+b.dataset.pick];
    openPicker(c.title, "movie", w => {
      c.tmdb = w.tmdb; c.ntype = w.ntype; c.year = w.year;
      c.dirT = w.dir; c.genreT = w.genre; c.nation = w.nation;
      if (w.title) c.title = w.title;
      c.amb = 0;
      Object.assign(c, matchExisting(c));
      renderTicketPreview();
    });
  });
  $("#ticket-actions").style.display = "";
}

/* ---------------- 저장 ----------------
   ★ v2.15 중복 저장 방지 3중 잠금
     ① 전송 중 재진입 차단(_tkSending) — 모바일에서 버튼이 두 번 먹는 경우
     ② 요청마다 reqId — 같은 요청이 두 번 도착하면 서버가 첫 결과만 돌려준다
        (Apps Script는 네트워크가 끊겼다 재시도될 때 같은 요청을 두 번 처리할 수 있다)
     ③ 서버에서 날짜·제목·시각·플랫폼이 같은 행은 건너뜀 */
let _tkSending = false;

async function ticketSend(){
  if (_tkSending){ toast("이미 저장하는 중입니다", "warn"); return; }
  const picked = ticketCands.filter(c => c.checked && !c.error && c.title && c.date);
  if (!picked.length){ toast("선택된 티켓이 없습니다", "warn"); return; }
  if (!await ensureAuth("기록을 추가하려면 비밀번호가 필요합니다.")) return;

  const rows = picked.map(c => ({
    date: c.date, start: c.date, cat: "영화",
    plat: c.plat, place: c.place, title: c.title,
    eps: "", time: c.time, src: "티켓캡처(앱)",
    memo: c.people && +c.people > 1 ? `${c.people}인` : "",
    rate: "", review: "",
    year: c.year, dirT: c.dirT, genreT: c.genreT, nation: c.nation,
    tmdb: c.tmdb, ntype: c.ntype, tmdbStatus: c.tmdb ? "티켓판독확정" : "",
    season: "", status: "완료", nflx: "",
  }));

  const btn = $("#ticket-send");
  _tkSending = true;
  btn.disabled = true; btn.textContent = "저장 중…";
  try {
    const reqId = "tk-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);
    const r = await gsPost({ action: "bulk", rows, reqId, dedupe: true });
    const saved = r.savedIdx ? r.savedIdx.map(i => rows[i]).filter(Boolean) : rows;
    addLocal(saved, r.firstNo);
    toast(`${r.added}건이 시트에 추가됐습니다`
      + (r.skipped ? ` · 이미 있어 건너뜀 ${r.skipped}건` : "")
      + (r.replayed ? " (중복 요청이라 다시 쓰지 않음)" : ""));

    /* 캘린더 등록 — 시트 저장이 끝난 뒤 별도 요청. 실패해도 기록은 남는다 */
    if ($("#ticket-cal")?.checked && r.added){
      const savedKeys = new Set(saved.map(x => [normT(x.title), x.date, x.time || ""].join("|")));
      const evs = picked.filter(c => savedKeys.has(tkKey(c)))
        .map(c => calEvent(
          { title:c.title, date:c.date, time:c.time, plat:c.plat, place:c.place,
            cat:"영화", year:c.year, dir:c.dirT, tmdb:c.tmdb, ntype:c.ntype, rate:"", review:"" },
          { endTime:c.endTime, seats:c.seats, people:c.people }));
      await calAdd(evs);
    }

    ticketCands = []; $("#ticket-preview").innerHTML = "";
    $("#ticket-actions").style.display = "none"; $("#ticket-file").value = "";
  } catch(e){ toast("저장 실패: " + e.message, "warn"); }
  _tkSending = false;
  btn.disabled = false; btn.textContent = "선택 항목 시트에 추가";
}
