/* =====================================================================
   page-add.js — 관람 기록 추가 (Apps Script doPost 연동)
   ① 단일 추가: TMDB 검색 → 감독·장르·연도·ID·타입 자동 입력
   ② 넷플릭스 CSV 일괄 업로드: 파싱 → 시리즈 묶기(시즌별, 종료일 대표)
      → 기존 기록과 중복 대조 → 미리보기 확인 → 신규분만 전송
   ===================================================================== */

let addSel = null;      // TMDB 검색 선택 결과
let csvCands = [];      // CSV 후보 목록

/* ---------------- Apps Script 호출 ---------------- */
async function gsPost(payload){
  if (!CONFIG.APPS_SCRIPT_URL) throw new Error("CONFIG.APPS_SCRIPT_URL이 비어 있습니다");
  const res = await fetch(CONFIG.APPS_SCRIPT_URL, {
    method: "POST",
    body: JSON.stringify({ token: CONFIG.APP_TOKEN, ...payload }),   // text/plain → preflight 회피
  });
  const d = await res.json();
  if (!d.ok) throw new Error(d.error || "저장 실패");
  return d;
}

/* 낙관적 반영: 전송 성공한 행을 화면에도 즉시 추가 */
function addLocal(rows){
  rows.forEach(p => {
    const date = p.date;
    S.rows.push({
      no:"", date, start: p.start||date, cat: p.cat, plat: p.plat||"", place: p.place||"",
      title: p.title, eps: p.eps||"", time: p.time||"", src: p.src||"앱입력",
      memo: p.memo||"", rate: p.rate||"", review: p.review||"",
      year: p.year||"", dir: p.dirT||"", genre: p.genreT||"", nation: p.nation||"", grade:"",
      tmdb: p.tmdb||"", ntype: p.ntype||"", season: p.season||"", nflx: p.nflx||"",
      med: medium(p.plat), y:+date.slice(0,4), m:+date.slice(5,7), key:"",
    });
  });
  S.rows.sort((a,b)=>a.date<b.date?1:-1);
  buildKeys(); renderStrip(); applyFilters();
}

/* ==================================================================
   ① 단일 추가
   ================================================================== */
function renderAdd(){
  if ($("#add-form").dataset.ready) return;      // 1회만 구성
  $("#add-form").dataset.ready = "1";
  $("#f-date").value = new Date().toISOString().slice(0,10);
  $("#f-plat").innerHTML = `<option value="">플랫폼 선택</option>`
    + [...THEATERS, ...OTTS].map(p=>`<option>${p}</option>`).join("")
    + `<option value="__etc">직접 입력…</option>`;

  /* TMDB 검색 */
  let timer = null;
  $("#f-search").addEventListener("input", e => {
    clearTimeout(timer);
    const q = e.target.value.trim();
    if (q.length < 2){ $("#f-results").innerHTML=""; return; }
    timer = setTimeout(() => tmdbSearchUI(q), 350);
  });

  $("#f-plat").onchange = e => {
    $("#f-plat-etc").style.display = e.target.value==="__etc" ? "" : "none";
  };
  $("#f-submit").onclick = submitSingle;
  $("#f-clear").onclick = clearSingle;

  /* ② CSV */
  $("#csv-file").addEventListener("change", handleCsvFile);
  $("#csv-match").onclick = csvTmdbMatch;
  $("#csv-send").onclick = csvSend;

  if (!CONFIG.APPS_SCRIPT_URL)
    $("#add-warn").innerHTML = `⚠️ <b>CONFIG.APPS_SCRIPT_URL</b>이 비어 있어 저장할 수 없습니다. <code>apps-script/Code.gs</code>를 배포하고 URL을 넣어주세요.`;
}

async function tmdbSearchUI(q){
  const el = $("#f-results");
  if (!tmdbReady()){ el.innerHTML = '<div class="hint">TMDB 키/프록시가 없어 검색할 수 없습니다 — 직접 입력으로 저장은 가능합니다.</div>'; return; }
  el.innerHTML = '<div class="hint">검색 중…</div>';
  try {
    const d = await tmdb("/search/multi", { query: q });
    const list = (d.results||[]).filter(x=>x.media_type==="movie"||x.media_type==="tv").slice(0,6);
    if (!list.length){ el.innerHTML = '<div class="hint">결과 없음 — 아래에 직접 입력해 저장할 수 있습니다.</div>'; return; }
    el.innerHTML = "";
    list.forEach(x => {
      const t = x.title||x.name, yr = (x.release_date||x.first_air_date||"").slice(0,4);
      const b = document.createElement("button");
      b.type = "button"; b.className = "sres";
      b.innerHTML = `${x.poster_path?`<img src="${IMG}w92${x.poster_path}" alt="">`:'<span class="noimg"></span>'}
        <span class="ti">${esc(t)}</span><span class="mt">${yr||"—"} · ${x.media_type==="tv"?"TV":"영화"}</span>`;
      b.onclick = () => pickTmdb(x);
      el.appendChild(b);
    });
  } catch(e){ el.innerHTML = '<div class="hint">검색 실패</div>'; }
}

async function pickTmdb(x){
  addSel = { tmdb:String(x.id), ntype:x.media_type, title:x.title||x.name,
             year:(x.release_date||x.first_air_date||"").slice(0,4), dirT:"", genreT:"", poster:x.poster_path };
  $("#f-title").value = addSel.title;
  $("#f-year").value = addSel.year;
  $("#f-season-w").style.display = x.media_type==="tv" ? "" : "none";
  $("#f-results").innerHTML = "";
  $("#f-search").value = "";
  try {
    if (x.media_type==="movie"){
      const d = await tmdb(`/movie/${x.id}`, { append_to_response: "credits" });
      addSel.genreT = (d.genres||[]).map(g=>g.name).join(", ");
      addSel.dirT = (d.credits?.crew||[]).filter(c=>c.job==="Director").map(c=>c.name).join(", ");
    } else {
      const d = await tmdb(`/tv/${x.id}`);
      addSel.genreT = (d.genres||[]).map(g=>g.name).join(", ");
      addSel.dirT = (d.created_by||[]).map(c=>c.name).join(", ");
    }
  } catch(e){}
  $("#f-picked").innerHTML = `
    ${addSel.poster?`<img src="${IMG}w92${addSel.poster}" alt="">`:""}
    <div><b>${esc(addSel.title)}</b> <span class="mono">${addSel.ntype}/${addSel.tmdb}</span><br>
    <span class="sub">${[addSel.year, addSel.dirT, addSel.genreT].filter(Boolean).map(esc).join(" · ")}</span></div>
    <button type="button" class="chip" id="f-unpick">선택 해제</button>`;
  $("#f-picked").style.display = "flex";
  $("#f-unpick").onclick = () => { addSel=null; $("#f-picked").style.display="none"; $("#f-season-w").style.display="none"; };
}

function clearSingle(){
  addSel = null;
  ["f-search","f-title","f-year","f-place","f-eps","f-time","f-memo","f-rate","f-review","f-season","f-plat-etc"].forEach(id => { const e=$("#"+id); if(e) e.value=""; });
  $("#f-picked").style.display = "none";
  $("#f-results").innerHTML = "";
  $("#f-date").value = new Date().toISOString().slice(0,10);
}

async function submitSingle(){
  const title = $("#f-title").value.trim();
  const date  = $("#f-date").value;
  if (!title || !date){ toast("제목과 날짜는 필수입니다", "warn"); return; }
  const plat = $("#f-plat").value==="__etc" ? $("#f-plat-etc").value.trim() : $("#f-plat").value;
  const row = {
    date, start: $("#f-start").value || date,
    cat: $("#f-cat").value, plat, place: $("#f-place").value.trim(),
    title, eps: $("#f-eps").value.trim(), time: $("#f-time").value.trim(),
    src: "앱입력", memo: $("#f-memo").value.trim(),
    rate: $("#f-rate").value.trim(), review: $("#f-review").value.trim(),
    year: $("#f-year").value.trim(),
    dirT: addSel?.dirT||"", genreT: addSel?.genreT||"",
    tmdb: addSel?.tmdb||"", ntype: addSel?.ntype||"",
    tmdbStatus: addSel ? "앱검색확정" : "",
    season: $("#f-season-w").style.display!=="none" ? $("#f-season").value.trim() : "",
    status: "완료", nflx: $("#f-nflx").value,
  };
  const btn = $("#f-submit");
  btn.disabled = true; btn.textContent = "저장 중…";
  try {
    await gsPost({ action:"add", rows:[row] });
    toast(`‘${title}’ 저장 완료 — 시트에 추가됐습니다`);
    addLocal([row]);
    clearSingle();
  } catch(e){
    toast("저장 실패: " + e.message, "warn"); console.error(e);
  }
  btn.disabled = false; btn.textContent = "시트에 추가";
}

/* ==================================================================
   ② 넷플릭스 CSV 일괄 업로드
   ================================================================== */

/* 넷플릭스 제목 분해 — "제목: 시즌 N: 에피소드" / "제목: 리미티드 시리즈: 8화" */
function parseNetflixTitle(t){
  const parts = t.split(": ");
  for (let i=1; i<parts.length; i++){
    let m = parts[i].match(/^시즌\s*(\d+)$/) || parts[i].match(/^파트\s*(\d+)$/);
    if (m) return { series: parts.slice(0,i).join(": "), season: +m[1], ep: parts.slice(i+1).join(": ") };
    if (/^(리미티드 시리즈|시리즈)$/.test(parts[i]))
      return { series: parts.slice(0,i).join(": "), season: 1, ep: parts.slice(i+1).join(": "), limited: true };
  }
  const last = parts[parts.length-1];
  if (parts.length>=2 && /^\d+화$|^\d+회$|^에피소드\s*\d+|^챕터\s*\d+/.test(last))
    return { series: parts.slice(0,-1).join(": "), season: 1, ep: last };
  return null;   // 영화
}

function parseNetflixDate(s){
  s = s.trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return s.slice(0,10);
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m){
    const y = m[3].length===2 ? "20"+m[3] : m[3];
    return `${y}-${String(m[1]).padStart(2,"0")}-${String(m[2]).padStart(2,"0")}`;
  }
  return null;
}

function handleCsvFile(e){
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => buildCsvCands(reader.result);
  reader.readAsText(file);
}

function buildCsvCands(text){
  const rows = parseCSV(text);
  if (!rows.length){ toast("CSV를 읽지 못했습니다", "warn"); return; }
  const h = rows[0].map(x=>x.trim().toLowerCase());
  const ti = h.findIndex(x=>x==="title"||x==="제목"), di = h.findIndex(x=>x==="date"||x==="날짜");
  if (ti<0 || di<0){ toast("Title/Date 칼럼을 찾지 못했습니다 — 넷플릭스 시청기록 CSV인지 확인해 주세요", "warn"); return; }

  /* 시리즈 그룹핑: 시리즈명+시즌 → 시작일~종료일, 종료일이 대표, 회차수 집계 */
  const groups = {}, movies = [];
  rows.slice(1).forEach(r => {
    const title = (r[ti]||"").trim(), date = parseNetflixDate(r[di]||"");
    if (!title || !date) return;
    const p = parseNetflixTitle(title);
    if (p){
      const k = normT(p.series) + "|s" + p.season;
      const g = groups[k] = groups[k] || { series: p.series, season: p.season, limited: p.limited, dates: [], epNums: [] };
      g.dates.push(date);
      const em = (p.ep||"").match(/^(\d+)[화회]/); if (em) g.epNums.push(+em[1]);
    } else movies.push({ title, date });
  });

  csvCands = [];
  /* 시리즈 후보 */
  Object.values(groups).forEach(g => {
    g.dates.sort();
    const start = g.dates[0], end = g.dates[g.dates.length-1];
    const eps = g.epNums.length ? Math.max(...g.epNums) : g.dates.length;
    const dispTitle = g.limited ? `${g.series} (리미티드 시리즈)` : g.series;
    /* 기존 대조: 정규화 제목 + 시즌 */
    const hit = S.rows.find(r => normT(r.title)===normT(g.series) && String(r.season||1)===String(g.season));
    csvCands.push({
      type:"series", title: dispTitle, season: String(g.season), start, date: end, eps: String(eps),
      status: hit ? "보유" : "신규", hitDate: hit?.date || "", checked: !hit,
      tmdb:"", ntype:"", year:"", dirT:"", genreT:"",
    });
  });
  /* 영화 후보 — 중복시청은 복수 카운팅, 같은 날짜만 중복 처리 */
  movies.forEach(mv => {
    const same = S.rows.find(r => normT(r.title)===normT(mv.title) && r.date===mv.date);
    const other = !same && S.rows.find(r => normT(r.title)===normT(mv.title));
    csvCands.push({
      type:"movie", title: mv.title, season:"", start: mv.date, date: mv.date, eps:"",
      status: same ? "중복" : other ? "재관람" : "신규", hitDate: (same||other)?.date || "",
      checked: !same, tmdb:"", ntype:"", year:"", dirT:"", genreT:"",
    });
  });
  csvCands.sort((a,b) => a.date<b.date?1:-1);
  renderCsvPreview();
}

function renderCsvPreview(){
  const el = $("#csv-preview");
  if (!csvCands.length){ el.innerHTML = '<div class="empty">추가할 항목이 없습니다</div>'; return; }
  const n신규 = csvCands.filter(c=>c.status!=="중복"&&c.status!=="보유").length;
  el.innerHTML = `
    <div class="csv-sum">후보 ${csvCands.length}건 — 신규·재관람 <b>${n신규}</b> · 이미 있음 ${csvCands.length-n신규}
      <span class="sub">시리즈는 시즌별로 묶고 종료일을 대표 날짜로 잡았습니다. 제목·시즌은 수정 가능해요.</span></div>
    <div class="csv-table">
      <div class="ct-row head"><span></span><span>유형</span><span>제목</span><span>시즌</span><span>기간</span><span>화수</span><span>TMDB</span><span>상태</span></div>
      ${csvCands.map((c,i)=>`
      <div class="ct-row ${c.checked?"":"off"}">
        <input type="checkbox" data-i="${i}" ${c.checked?"checked":""}>
        <span class="mono">${c.type==="series"?"시리즈":"영화"}</span>
        <input type="text" class="ti" data-i="${i}" data-f="title" value="${esc(c.title)}">
        <input type="text" class="ss" data-i="${i}" data-f="season" value="${esc(c.season)}" ${c.type==="movie"?"disabled":""}>
        <span class="mono">${c.start===c.date?esc(c.date):esc(c.start)+"~"+esc(c.date.slice(5))}</span>
        <span class="mono">${esc(c.eps)}</span>
        <span class="mono tm" data-i="${i}">${c.tmdb?esc(c.ntype+"/"+c.tmdb):"—"}</span>
        <span class="st ${c.status}">${c.status}${c.hitDate?` <i>${esc(c.hitDate)}</i>`:""}</span>
      </div>`).join("")}
    </div>`;
  el.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.onchange = e => {
    csvCands[+e.target.dataset.i].checked = e.target.checked;
    e.target.closest(".ct-row").classList.toggle("off", !e.target.checked);
  });
  el.querySelectorAll('input[type="text"]').forEach(inp => inp.onchange = e => {
    csvCands[+e.target.dataset.i][e.target.dataset.f] = e.target.value.trim();
  });
  $("#csv-actions").style.display = "";
}

/* 선택 행 TMDB 매칭 — 정규화 제목 완전 일치일 때만 채움 (오매칭 방지) */
async function csvTmdbMatch(){
  if (!tmdbReady()){ toast("TMDB 키/프록시가 없어 매칭할 수 없습니다", "warn"); return; }
  const btn = $("#csv-match");
  btn.disabled = true;
  let hit = 0, miss = 0;
  for (const c of csvCands){
    if (!c.checked || c.tmdb) continue;
    try {
      const q = c.title.replace(/\(.*?\)/g,"").trim();
      const d = await tmdb(c.type==="series" ? "/search/tv" : "/search/movie", { query: q });
      const m = (d.results||[]).find(x => normT(x.name||x.title)===normT(q));
      if (m){
        c.tmdb = String(m.id); c.ntype = c.type==="series" ? "tv" : "movie";
        c.year = (m.first_air_date||m.release_date||"").slice(0,4);
        try {
          if (c.ntype==="movie"){
            const dd = await tmdb(`/movie/${m.id}`, { append_to_response:"credits" });
            c.genreT = (dd.genres||[]).map(g=>g.name).join(", ");
            c.dirT = (dd.credits?.crew||[]).filter(x=>x.job==="Director").map(x=>x.name).join(", ");
          } else {
            const dd = await tmdb(`/tv/${m.id}`);
            c.genreT = (dd.genres||[]).map(g=>g.name).join(", ");
            c.dirT = (dd.created_by||[]).map(x=>x.name).join(", ");
          }
        } catch(e){}
        hit++;
      } else miss++;
    } catch(e){ miss++; }
  }
  btn.disabled = false;
  renderCsvPreview();
  toast(`TMDB 매칭 완료 — 확정 ${hit} · 미확정 ${miss} (완전 일치만 채웠습니다)`);
}

async function csvSend(){
  const picked = csvCands.filter(c=>c.checked);
  if (!picked.length){ toast("선택된 항목이 없습니다", "warn"); return; }
  const rows = picked.map(c => ({
    date: c.date, start: c.start,
    cat: c.type==="series" ? "시리즈" : "영화",
    plat: "넷플릭스", place: "", title: c.title,
    eps: c.eps, time: "", src: "넷플릭스CSV(앱)", memo: "", rate: "", review: "",
    year: c.year, dirT: c.dirT, genreT: c.genreT,
    tmdb: c.tmdb, ntype: c.ntype, tmdbStatus: c.tmdb ? "앱검색확정" : "",
    season: c.type==="series" ? c.season : "", status: "완료", nflx: "",
  }));
  const btn = $("#csv-send");
  btn.disabled = true; btn.textContent = "전송 중…";
  try {
    const r = await gsPost({ action:"bulk", rows });
    toast(`${r.added}건이 시트에 추가됐습니다`);
    addLocal(rows);
    csvCands = []; $("#csv-preview").innerHTML = ""; $("#csv-actions").style.display = "none"; $("#csv-file").value = "";
  } catch(e){ toast("전송 실패: " + e.message, "warn"); console.error(e); }
  btn.disabled = false; btn.textContent = "선택 항목 시트에 추가";
}

RENDERERS.add = renderAdd;
