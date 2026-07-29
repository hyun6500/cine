FILEV["add"] = "2.11";
/* =====================================================================
   page-add.js — 관람 기록 추가 (Apps Script doPost 연동)
   ① 단일 추가: TMDB 검색 → 감독·장르·연도·ID·타입 자동 입력
   ② 넷플릭스 CSV 일괄 업로드: 파싱 → 시리즈 묶기(시즌별, 종료일 대표)
      → 기존 기록과 중복 대조 → 미리보기 확인 → 신규분만 전송
   ===================================================================== */

let addSel = null;      // TMDB 검색 선택 결과
let csvCands = [];      // CSV 후보 목록

/* ---------------- Apps Script 호출 ---------------- */
/* gsPost와 ensureAuth는 auth.js에 있음 — 모든 쓰기는 ensureAuth를 먼저 통과해야 한다 */

/* 낙관적 반영: 전송 성공한 행을 화면에도 즉시 추가 */
function addLocal(rows, firstNo){
  rows.forEach((p, i) => {
    const date = p.date;
    S.rows.push({
      no: firstNo ? String(firstNo + i) : "", date,
      undated: !date, status: p.status || "완료",
      start: p.start||date, cat: p.cat, plat: p.plat||"", place: p.place||"",
      title: p.title, eps: p.eps||"", time: p.time||"", src: p.src||"앱입력",
      memo: p.memo||"", rate: p.rate||"", review: p.review||"",
      year: p.year||"", dir: p.dirT||"", genre: p.genreT||"", nation: p.nation||"", grade:"",
      tmdb: p.tmdb||"", ntype: p.ntype||"", season: p.season||"", nflx: p.nflx||"",
      med: medium(p.plat), y: date ? +date.slice(0,4) : null, m: date ? +date.slice(5,7) : null, key:"",
    });
  });
  S.rows.sort((a,b)=>a.date<b.date?1:-1);
  buildKeys(); renderStrip(); applyFilters();
}

/* ==================================================================
   ⓪ 기록 수정 (상세 모달 → '수정')
   ================================================================== */
let editRow = null;      // 수정 중인 행
let editWork = null;     // 새로 고른 작품정보 (null이면 작품정보 변경 없음)

function openEdit(r){
  editRow = r; editWork = null;
  const sameCount = S.rows.filter(x => x.key === r.key).length;

  $("#edit-body").innerHTML = `
    <h3>기록 수정 <span class="mono">no.${esc(r.no)}</span></h3>

    <div class="ed-sec"><div class="ed-h">작품 정보</div>
      <div class="ed-work" id="ed-work"></div>
      <div class="ed-hint" id="ed-title-hint" style="display:none"></div>
      <div class="frow">
        <div><label class="fl">제목</label><input type="text" id="e-title" class="fin" value="${esc(r.title)}"></div>
        <div class="w90"><label class="fl">개봉연도</label><input type="text" id="e-year" class="fin" value="${esc(r.year)}"></div>
      </div>
      <div class="frow">
        <div><label class="fl">감독</label><input type="text" id="e-dir" class="fin" value="${esc(r.dir)}"></div>
        <div><label class="fl">장르 <span class="sub">쉼표 구분</span></label><input type="text" id="e-genre" class="fin" value="${esc(r.genre)}"></div>
      </div>
      <div class="frow">
        <div><label class="fl">제작국가</label><input type="text" id="e-nation" class="fin" value="${esc(r.nation)}"></div>
        <div class="w90"><label class="fl">TMDB ID</label><input type="text" id="e-tmdb" class="fin" value="${esc(r.tmdb)}"></div>
        <div class="w90"><label class="fl">타입</label><select id="e-ntype" class="fin">
          <option value="" ${!r.ntype?"selected":""}>—</option>
          <option value="movie" ${r.ntype==="movie"?"selected":""}>movie</option>
          <option value="tv" ${r.ntype==="tv"?"selected":""}>tv</option></select></div>
      </div>
      ${sameCount > 1 ? `<label class="ed-chk"><input type="checkbox" id="e-all">
        같은 작품 <b>${sameCount}회차 전체</b>에 작품 정보 함께 적용 <span class="sub">(저장 시 다시 확인합니다)</span></label>` : ""}
    </div>

    <div class="ed-sec"><div class="ed-h">관람 정보 <span class="sub">이 회차만</span></div>
      <div class="frow">
        <div><label class="fl">날짜(대표)</label><input type="date" id="e-date" class="fin" value="${esc(r.date)}"></div>
        <div><label class="fl">시작일</label><input type="date" id="e-start" class="fin" value="${esc(r.start)}"></div>
        <div class="w90"><label class="fl">시즌</label><input type="text" id="e-season" class="fin" value="${esc(r.season)}"></div>
      </div>
      <div class="frow">
        <div><label class="fl">카테고리</label><select id="e-cat" class="fin">
          ${CONFIG.SCOPE.map(c=>`<option ${r.cat===c?"selected":""}>${c}</option>`).join("")}</select></div>
        <div><label class="fl">플랫폼/상영관</label><input type="text" id="e-plat" class="fin" value="${esc(r.plat)}"></div>
      </div>
      <div class="frow">
        <div><label class="fl">위치/지점</label><input type="text" id="e-place" class="fin" value="${esc(r.place)}"></div>
        <div class="w90"><label class="fl">상영시각</label><input type="text" id="e-time" class="fin" value="${esc(r.time)}"></div>
        <div class="w90"><label class="fl">화수</label><input type="text" id="e-eps" class="fin" value="${esc(r.eps)}"></div>
      </div>
      <div class="frow">
        <div><label class="fl">동반/메모</label><input type="text" id="e-memo" class="fin" value="${esc(r.memo)}"></div>
        <div class="w90"><label class="fl">평점</label><input type="text" id="e-rate" class="fin" value="${esc(r.rate)}"></div>
        <div><label class="fl">넷플릭스 평가</label><select id="e-nflx" class="fin">
          <option value=""></option>
          ${["최고예요","좋아요","별로예요"].map(v=>`<option ${r.nflx===v?"selected":""}>${v}</option>`).join("")}</select></div>
      </div>
      <label class="fl">한줄평</label><input type="text" id="e-review" class="fin" value="${esc(r.review)}">
    </div>

    <div class="fbtns">
      <button class="primary" id="e-save">시트에 저장</button>
      <button class="ghost" id="e-cancel">취소</button>
    </div>`;

  renderEditWork();
  $("#e-save").onclick = submitEdit;
  $("#e-cancel").onclick = closeEdit;

  const bg = $("#edit-bg");
  bg.classList.add("show"); bg.setAttribute("aria-hidden","false");
  document.body.style.overflow = "hidden";
}

function renderEditWork(){
  const w = editWork;
  const cur = w ? w : { title: editRow.title, year: editRow.year, tmdb: editRow.tmdb, ntype: editRow.ntype, poster: "" };
  $("#ed-work").innerHTML = `
    ${cur.poster ? `<img src="${IMG}w92${cur.poster}" alt="">` : '<span class="noimg"></span>'}
    <div class="wi"><b>${esc(cur.title)}</b>
      <span class="mono">${cur.tmdb ? esc((cur.ntype||"?")+"/"+cur.tmdb) : "TMDB 미연결"}</span></div>
    <button type="button" class="chip" id="ed-pick">${cur.tmdb ? "다른 작품으로 교체" : "TMDB에서 찾기"}</button>`;
  $("#ed-pick").onclick = () => openPicker(editRow.title, editRow.ntype, work => {
    editWork = work;
    /* ★ 제목은 기본적으로 덮어쓰지 않는다.
       시트 제목은 KOBIS·예매 표기라 TMDB 공식 한국어 제목과 다를 수 있고, 그게 틀린 게 아니다.
       바꾸고 싶을 때만 아래 안내에서 직접 누르게 한다. */
    if (!$("#e-title").value.trim()) $("#e-title").value = work.title || "";
    $("#e-year").value   = work.year   || "";
    $("#e-dir").value    = work.dir    || "";
    $("#e-genre").value  = work.genre  || "";
    $("#e-nation").value = work.nation || "";
    $("#e-tmdb").value   = work.tmdb   || "";
    $("#e-ntype").value  = work.ntype  || "";
    renderEditWork();
    const cur = $("#e-title").value.trim();
    if (work.title && normT(cur) !== normT(work.title)){
      const box = $("#ed-title-hint");
      box.style.display = "";
      box.innerHTML = `TMDB 제목은 <b>${esc(work.title)}</b> 입니다 — 현재 제목은 그대로 두었습니다.
        <button type="button" class="chip" id="ed-title-use">이 제목으로 바꾸기</button>`;
      $("#ed-title-use").onclick = () => {
        $("#e-title").value = work.title;
        box.innerHTML = "제목을 TMDB 표기로 바꿨습니다.";
      };
    }
  });
}

function closeEdit(){
  $("#edit-bg").classList.remove("show");
  $("#edit-bg").setAttribute("aria-hidden","true");
  editRow = null; editWork = null;
  if (!$("#modal-bg").classList.contains("show")) document.body.style.overflow = "";
}

async function submitEdit(){
  const r = editRow;
  if (!r) return;
  if (!await ensureAuth("기록을 수정하려면 비밀번호가 필요합니다.")) return;
  const work = {
    title:  $("#e-title").value.trim(),
    year:   $("#e-year").value.trim(),
    dir:    $("#e-dir").value.trim(),
    genre:  $("#e-genre").value.trim(),
    nation: $("#e-nation").value.trim(),
    tmdb:   $("#e-tmdb").value.trim(),
    ntype:  $("#e-ntype").value,
  };
  const view = {
    date:   $("#e-date").value,
    start:  $("#e-start").value,
    season: $("#e-season").value.trim(),
    cat:    $("#e-cat").value,
    plat:   $("#e-plat").value.trim(),
    place:  $("#e-place").value.trim(),
    time:   $("#e-time").value.trim(),
    eps:    $("#e-eps").value.trim(),
    memo:   $("#e-memo").value.trim(),
    rate:   $("#e-rate").value.trim(),
    nflx:   $("#e-nflx").value,
    review: $("#e-review").value.trim(),
  };
  if (!work.title || !view.date){ toast("제목과 날짜는 비울 수 없습니다", "warn"); return; }

  const applyAll = $("#e-all")?.checked;
  const targets = applyAll ? S.rows.filter(x => x.key === r.key) : [r];

  /* ★ 여러 행 일괄 적용은 명시적 확인을 거친다 — '(제목 미상)' 랑종 전파 사고 재발 방지 */
  if (targets.length > 1){
    const dates = targets.map(t => t.date).sort();
    const ok = window.confirm(
      `작품 정보를 이 작품의 관람 기록 ${targets.length}건 전체에 적용합니다.\n`
      + `대상: no.${targets.map(t=>t.no).join(", ")}\n`
      + `관람일: ${dates[0]} ~ ${dates[dates.length-1]}\n\n계속할까요?`);
    if (!ok) return;
  }

  /* 수정 전 값 스냅샷 — 되돌리기 + 콘솔 기록 */
  const WORK_KEYS = Object.keys(work), VIEW_KEYS = Object.keys(view);
  const snap = targets.map(t => {
    const s = { no: t.no };
    WORK_KEYS.forEach(k => s[k] = t[k]);
    if (t === r) VIEW_KEYS.forEach(k => s[k] = t[k]);
    return s;
  });
  console.log("[cine] 수정 전 값 백업:"); console.table(snap);

  const btn = $("#e-save");
  btn.disabled = true; btn.textContent = "저장 중…";
  try {
    /* 작품 정보는 대상 전체 / 관람 정보는 이 회차만 */
    await gsPost({ action:"update", updates: [
      ...(targets.length > 1 ? [{ nos: targets.map(t=>t.no), fields: work }] : []),
      { nos: [r.no], fields: targets.length > 1 ? view : { ...work, ...view } },
    ]});

    targets.forEach(t => Object.assign(t, work));
    Object.assign(r, view);
    r.med = medium(r.plat);
    r.y = +r.date.slice(0,4); r.m = +r.date.slice(5,7);

    buildKeys(); renderStrip(); applyFilters();
    closeEdit(); closeModal();

    /* 되돌리기 — 스냅샷을 역방향 update로 전송 */
    toast(`‘${work.title}’ 수정 완료`, "", { label: "되돌리기", fn: async () => {
      try {
        await gsPost({ action:"update", updates: snap.map(s => {
          const { no, ...fields } = s;
          return { nos: [no], fields };
        })});
        snap.forEach(s => {
          const t = S.rows.find(x => String(x.no) === String(s.no));
          if (t){ const { no, ...fields } = s; Object.assign(t, fields);
            t.med = medium(t.plat); t.y = +t.date.slice(0,4); t.m = +t.date.slice(5,7); }
        });
        buildKeys(); renderStrip(); applyFilters();
        toast("수정 전 값으로 되돌렸습니다");
      } catch(e){ toast("되돌리기 실패: " + e.message, "warn"); }
    }});
  } catch(e){
    toast("저장 실패: " + e.message, "warn"); console.error(e);
  }
  btn.disabled = false; btn.textContent = "시트에 저장";
}

/* ==================================================================
   ⓪-2 병합 · 삭제
   ================================================================== */

/* 출처 우선순위 (아카이브 규칙): MY페이지 > 예매내역 > Gmail > 넷플릭스 > 가계부 > 캘린더 > Weekly */
const SRC_PRIORITY = ["MY페이지","예매","Gmail","지메일","넷플릭스","가계부","캘린더","Weekly"];
function srcRank(s){
  s = s || "";
  for (let i = 0; i < SRC_PRIORITY.length; i++) if (s.includes(SRC_PRIORITY[i])) return i;
  return SRC_PRIORITY.length;
}
const filledCount = r => ["plat","place","time","eps","rate","review","year","dir","genre","tmdb","memo"]
  .filter(k => r[k]).length;

/* 병합안 구성 — 대표행 + 대표행에 적용할 fields + 삭제할 no 목록 */
function composeMerge(rows){
  const sorted = [...rows].sort((a,b) =>
    srcRank(a.src) - srcRank(b.src) || filledCount(b) - filledCount(a) || (a.date < b.date ? -1 : 1));
  const primary = sorted[0], others = sorted.slice(1);
  const fields = {};

  /* 제목: 대표행이 의미 없는 제목이고 다른 행에 정식 제목이 있으면 그걸 채택 */
  if (isJunkTitle(primary.title)){
    const named = sorted.find(x => !isJunkTitle(x.title));
    if (named){ fields.title = named.title; if (named.season) fields.season = named.season; }
  }
  /* 빈 칸만 채움 (기존 값 덮어쓰지 않음). tmdb는 타입과 함께 이동 */
  ["plat","place","time","eps","rate","review","year","dir","genre","nation","season","nflx","cat","grade"]
    .forEach(k => {
      if (primary[k]) return;
      const donor = others.find(o => o[k]);
      if (donor) fields[k] = donor[k];
    });
  if (!primary.tmdb){
    const donor = others.find(o => o.tmdb);
    if (donor){ fields.tmdb = donor.tmdb; if (donor.ntype) fields.ntype = donor.ntype; }
  }
  /* 이어붙이기 — 중복 문구 제외 */
  const joinUniq = (key, sep) => {
    const parts = [];
    sorted.forEach(x => (x[key]||"").split(sep).map(s=>s.trim()).filter(Boolean)
      .forEach(p => { if (!parts.includes(p)) parts.push(p); }));
    return parts.join(sep.trim() ? ` ${sep.trim()} ` : sep);
  };
  const memo = joinUniq("memo", "/"), note = joinUniq("note", "|"), src = joinUniq("src", "+");
  if (memo !== (primary.memo||"")) fields.memo = memo;
  if (note !== (primary.note||"")) fields.note = note;
  if (src  !== (primary.src ||"")) fields.src  = src;
  /* 날짜 — 이른 쪽을 시작일로, 대표 날짜는 늦은 쪽 (시리즈 종료일 대표 규칙과 일치) */
  const allDates = sorted.flatMap(x => [x.date, x.start]).filter(Boolean).sort();
  if (allDates[0] !== primary.start) fields.start = allDates[0];
  if (allDates[allDates.length-1] !== primary.date) fields.date = allDates[allDates.length-1];

  return { primary, fields, deleteNos: others.map(o => String(o.no)) };
}

async function mergeViewings(rows){
  if (!await ensureAuth("기록을 병합하려면 비밀번호가 필요합니다.")) return;
  const plan = composeMerge(rows);
  const changed = Object.keys(plan.fields);
  const ok = window.confirm(
    `${rows.length}건을 병합합니다.\n\n`
    + `대표: no.${plan.primary.no} ‘${plan.primary.title}’ (출처: ${plan.primary.src || "—"})\n`
    + `삭제: no.${plan.deleteNos.join(", ")}\n`
    + (changed.length ? `대표행에 채워지는 값: ${changed.join(", ")}\n` : "")
    + `\n삭제된 행은 되돌릴 수 없습니다. 계속할까요?`);
  if (!ok) return;

  console.log("[cine] 병합 전 값 백업:");
  console.table(rows.map(x => ({ no:x.no, title:x.title, date:x.date, plat:x.plat, src:x.src, memo:x.memo })));

  try {
    await gsPost({ action:"merge", primaryNo: String(plan.primary.no), fields: plan.fields, deleteNos: plan.deleteNos });
    Object.assign(plan.primary, plan.fields);
    plan.primary.med = medium(plan.primary.plat);
    plan.primary.y = +plan.primary.date.slice(0,4); plan.primary.m = +plan.primary.date.slice(5,7);
    S.rows = S.rows.filter(x => !plan.deleteNos.includes(String(x.no)));
    buildKeys(); renderStrip(); applyFilters();
    closeModal();
    toast(`병합 완료 — no.${plan.primary.no}만 남기고 ${plan.deleteNos.length}행 삭제됨 (백업은 콘솔에)`);
  } catch(e){ toast("병합 실패: " + e.message, "warn"); console.error(e); }
}

async function deleteViewing(r){
  if (!await ensureAuth("기록을 삭제하려면 비밀번호가 필요합니다.")) return;
  const ok = window.confirm(
    `no.${r.no} ‘${r.title}’ (${r.date}) 기록을 시트에서 삭제합니다.\n되돌릴 수 없습니다. 계속할까요?`);
  if (!ok) return;
  console.log("[cine] 삭제 전 값 백업:"); console.table([r]);
  try {
    await gsPost({ action:"delete", nos: [String(r.no)] });
    S.rows = S.rows.filter(x => String(x.no) !== String(r.no));
    buildKeys(); renderStrip(); applyFilters();
    closeModal();
    toast(`no.${r.no} 삭제 완료 (삭제 전 값은 콘솔에)`);
  } catch(e){ toast("삭제 실패: " + e.message, "warn"); console.error(e); }
}

/* ==================================================================
   ⓪-3 별점 저장 · 빠른 기록('봤어요')
   ================================================================== */

/* 별점만 시트에 저장. 성공하면 true (별 위젯이 롤백 판단에 사용) */
async function saveRating(row, val){
  if (!await ensureAuth("별점을 남기려면 비밀번호가 필요합니다.")) return false;
  const prev = row.rate;
  const next = val == null ? "" : rateStr(val);
  try {
    await gsPost({ action:"update", updates: [{ nos:[row.no], fields:{ rate: next } }] });
    row.rate = next;
    S.dirty.browse = true; S.dirty.dash = true;
    if (S.tab === "browse" || S.tab === "dash") renderTab(S.tab);
    toast(val == null ? "별점을 지웠습니다" : `★ ${next} 저장`);
    return true;
  } catch(e){
    row.rate = prev;
    toast("별점 저장 실패: " + e.message, "warn");
    return false;
  }
}

/* '예전에 봤다' 기록 — 관람 시점을 모를 수 있으므로 날짜는 선택 사항 */
function openQuickLog(work){
  const today = new Date().toISOString().slice(0,10);
  $("#edit-body").innerHTML = `
    <h3>봤던 기록 추가</h3>
    <div class="ql-work">
      ${work.poster ? `<img src="${IMG}w92${work.poster}" alt="">` : '<span class="noimg"></span>'}
      <div><b>${esc(work.title)}</b><br>
        <span class="sub">${[work.year, work.dir ? work.dir.split(",")[0] : "", work.ntype==="tv"?"시리즈":"영화"].filter(Boolean).map(esc).join(" · ")}</span></div>
    </div>

    <div class="ed-sec"><div class="ed-h">별점</div><div id="ql-stars"></div></div>

    <div class="ed-sec"><div class="ed-h">언제 봤나요? <span class="sub">기억나지 않으면 비워두세요</span></div>
      <label class="ed-chk"><input type="checkbox" id="ql-nodate" checked> 관람 시점이 기억나지 않음 <span class="sub">(날짜 미상으로 저장)</span></label>
      <div class="frow" id="ql-datewrap" style="display:none">
        <div><label class="fl">날짜</label><input type="date" id="ql-date" class="fin" value="${today}"></div>
        <div><label class="fl">플랫폼/상영관</label><input type="text" id="ql-plat" class="fin" placeholder="넷플릭스, CGV 등"></div>
      </div>
    </div>

    <div class="ed-sec"><div class="ed-h">한줄평 <span class="sub">선택</span></div>
      <input type="text" id="ql-review" class="fin" placeholder="기억에 남은 한 줄">
    </div>

    <div class="fbtns">
      <button class="primary" id="ql-save">기록 추가</button>
      <button class="ghost" id="ql-cancel">취소</button>
    </div>
    <p class="sub-p tiny">날짜 미상으로 저장하면 필름스트립·다이어리·월별 통계에는 빠지고,
      포스터 월·별점·작품 목록에는 포함됩니다. 나중에 날짜가 생각나면 상세에서 수정하면 됩니다.</p>`;

  const stars = starWidget(null, null);
  $("#ql-stars").appendChild(stars);
  $("#ql-nodate").onchange = e => { $("#ql-datewrap").style.display = e.target.checked ? "none" : "flex"; };
  $("#ql-cancel").onclick = closeEdit;
  $("#ql-save").onclick = () => submitQuickLog(work, stars);

  editRow = null; editWork = null;
  const bg = $("#edit-bg");
  bg.classList.add("show"); bg.setAttribute("aria-hidden","false");
  document.body.style.overflow = "hidden";
}

async function submitQuickLog(work, stars){
  if (!await ensureAuth("기록을 추가하려면 비밀번호가 필요합니다.")) return;
  const noDate = $("#ql-nodate").checked;
  const date = noDate ? "" : $("#ql-date").value;
  if (!noDate && !date){ toast("날짜를 고르거나 ‘기억나지 않음’을 켜주세요", "warn"); return; }

  const row = {
    date, start: date,
    cat: work.ntype === "tv" ? "시리즈" : "영화",
    plat: noDate ? "" : $("#ql-plat").value.trim(), place: "",
    title: work.title, eps: "", time: "",
    src: "회고입력(앱)", memo: "", rate: rateStr(stars.getValue()),
    review: $("#ql-review").value.trim(),
    year: work.year || "", dirT: work.dir || "", genreT: work.genre || "", nation: work.nation || "",
    tmdb: work.tmdb || "", ntype: work.ntype || "", tmdbStatus: work.tmdb ? "앱검색확정" : "",
    season: "", status: noDate ? "날짜미상" : "완료", nflx: "",
  };

  const btn = $("#ql-save");
  btn.disabled = true; btn.textContent = "저장 중…";
  try {
    const res = await gsPost({ action:"add", rows:[row] });
    addLocal([row], res.firstNo);
    closeEdit(); closeModal();
    toast(`‘${work.title}’ 기록 추가${noDate ? " (날짜 미상)" : ""}`);
  } catch(e){ toast("저장 실패: " + e.message, "warn"); }
  btn.disabled = false; btn.textContent = "기록 추가";
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
  $("#csv-match").onclick = csvAutoMatch;
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
  if (!await ensureAuth("기록을 추가하려면 비밀번호가 필요합니다.")) return;
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
    const res = await gsPost({ action:"add", rows:[row] });
    toast(`‘${title}’ 저장 완료 — 시트에 추가됐습니다`);
    addLocal([row], res.firstNo);
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
  csvAutoMatch();          // ★ 업로드 즉시 자동 조회
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
        <span class="tmc">${c.tmdb
          ? `<button class="tmb ok" data-pick="${i}" title="${esc(c.ntype+"/"+c.tmdb)}">${esc(c.year||"확정")}</button>`
          : c.amb
            ? `<button class="tmb amb" data-pick="${i}">선택 ${c.amb}건</button>`
            : c.searched
              ? `<button class="tmb" data-pick="${i}">직접 찾기</button>`
              : `<span class="tmb wait">조회 중…</span>`}</span>
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
  el.querySelectorAll("[data-pick]").forEach(b => b.onclick = () => {
    const c = csvCands[+b.dataset.pick];
    openPicker(c.title, c.type==="series" ? "tv" : "movie", w => {
      c.tmdb = w.tmdb; c.ntype = w.ntype; c.year = w.year;
      c.dirT = w.dir; c.genreT = w.genre; c.nation = w.nation;
      c.amb = 0;
      renderCsvPreview();
    });
  });
  $("#csv-actions").style.display = "";
}

/* 자동 TMDB 매칭
   ★ 완전 일치 후보가 1건일 때만 자동 확정. 2건 이상이면 채우지 않고 사용자가 고르게 한다
     ('마더' → 봉준호/아로노프스키처럼 동명이작이 실제로 존재하므로 첫 결과를 믿으면 안 됨) */
async function csvAutoMatch(){
  if (!tmdbReady()){
    csvCands.forEach(c => c.searched = true);
    renderCsvPreview();
    toast("TMDB 키/프록시가 없어 자동 조회를 건너뜁니다", "warn");
    return;
  }
  let ok = 0, amb = 0, miss = 0;
  for (const c of csvCands){
    if (c.tmdb || !c.checked){ c.searched = true; continue; }
    const ty = c.type === "series" ? "tv" : "movie";
    try {
      const q = c.title.replace(/\(.*?\)/g,"").trim();
      const d = await tmdb(ty==="tv" ? "/search/tv" : "/search/movie", { query: q });
      const exact = (d.results||[]).filter(x => normT(x.name||x.title) === normT(q));
      if (exact.length === 1){
        const m = exact[0];
        c.tmdb = String(m.id); c.ntype = ty;
        c.year = (m.first_air_date||m.release_date||"").slice(0,4);
        try {
          if (ty === "movie"){
            const dd = await tmdb(`/movie/${m.id}`, { append_to_response:"credits" });
            c.genreT = (dd.genres||[]).map(g=>g.name).join(", ");
            c.dirT = (dd.credits?.crew||[]).filter(x=>x.job==="Director").map(x=>x.name).join(", ");
            c.nation = (dd.production_countries||[]).map(x=>x.name).join(", ");
          } else {
            const dd = await tmdb(`/tv/${m.id}`);
            c.genreT = (dd.genres||[]).map(g=>g.name).join(", ");
            c.dirT = (dd.created_by||[]).map(x=>x.name).join(", ");
            c.nation = (dd.production_countries||[]).map(x=>x.name).join(", ");
          }
        } catch(e){}
        ok++;
      } else if (exact.length > 1){ c.amb = exact.length; amb++; }
      else miss++;
    } catch(e){ miss++; }
    c.searched = true;
    renderCsvPreview();
  }
  toast(`자동 조회 완료 — 확정 ${ok}${amb?` · 선택 필요 ${amb}`:""}${miss?` · 미확정 ${miss}`:""}`);
}

async function csvSend(){
  const picked = csvCands.filter(c=>c.checked);
  if (!picked.length){ toast("선택된 항목이 없습니다", "warn"); return; }
  if (!await ensureAuth("기록을 추가하려면 비밀번호가 필요합니다.")) return;
  const rows = picked.map(c => ({
    date: c.date, start: c.start,
    cat: c.type==="series" ? "시리즈" : "영화",
    plat: "넷플릭스", place: "", title: c.title,
    eps: c.eps, time: "", src: "넷플릭스CSV(앱)", memo: "", rate: "", review: "",
    year: c.year, dirT: c.dirT, genreT: c.genreT, nation: c.nation || "",
    tmdb: c.tmdb, ntype: c.ntype, tmdbStatus: c.tmdb ? "앱검색확정" : "",
    season: c.type==="series" ? c.season : "", status: "완료", nflx: "",
  }));
  const btn = $("#csv-send");
  btn.disabled = true; btn.textContent = "전송 중…";
  try {
    const r = await gsPost({ action:"bulk", rows });
    toast(`${r.added}건이 시트에 추가됐습니다`);
    addLocal(rows, r.firstNo);
    csvCands = []; $("#csv-preview").innerHTML = ""; $("#csv-actions").style.display = "none"; $("#csv-file").value = "";
  } catch(e){ toast("전송 실패: " + e.message, "warn"); console.error(e); }
  btn.disabled = false; btn.textContent = "선택 항목 시트에 추가";
}

RENDERERS.add = renderAdd;
