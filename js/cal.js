FILEV["cal"] = "2.24";
/* =====================================================================
   cal.js — 구글 캘린더('문화📖📽️') 등록
   ★ 브라우저에서 직접 캘린더를 건드리지 않는다. Apps Script가 '나'로 실행되므로
     별도 OAuth 없이 내 캘린더에 쓸 수 있고, 앱 코드에는 아무 권한도 남지 않는다.
   일정명 규칙: 「제목 · 약어 위치」  예) 호프 · C 용산 / 기생충 · N
     (약어·위치 규칙은 core.js의 platAbbr·branchShort에 있음 — 스토리 카드와 공유)
   ===================================================================== */

/* 관람 기록 한 건 → 캘린더 이벤트 한 건 */
function calEvent(r, extra = {}){
  const desc = [];
  if (r.cat) desc.push(r.cat + (r.year ? ` · ${r.year}` : ""));
  if (r.dir) desc.push("감독 " + r.dir);
  if (r.place) desc.push(r.place);
  if (extra.seats) desc.push("좌석 " + extra.seats);
  if (extra.people && +extra.people > 1) desc.push(`${extra.people}인 관람`);
  const rt = parseRate(r.rate);
  if (rt != null) desc.push(`★ ${rateStr(rt)}`);
  if (r.review) desc.push(`“${r.review}”`);
  if (r.tmdb) desc.push(`https://www.themoviedb.org/${r.ntype || "movie"}/${r.tmdb}`);
  desc.push("— 주현 시네마테크에서 등록");

  return {
    title: calTitle(r),
    date: r.date,
    time: r.time || "",
    endTime: extra.endTime || "",
    /* 시각이 없으면 종일 일정. 극장 관람은 기본 2시간으로 잡는다 */
    mins: extra.mins || 120,
    location: r.place || r.plat || "",
    desc: desc.join("\n"),
  };
}

/* 여러 건 등록 — 서버가 같은 날·같은 제목이면 건너뛴다(중복 방지) */
async function calAdd(events, opts = {}){
  const list = events.filter(e => e && e.title && e.date);
  if (!list.length) return { ok:true, added:0, skipped:0 };
  if (!await ensureAuth("캘린더에 등록하려면 비밀번호가 필요합니다.")) return null;
  try {
    const r = await gsPost({ action: "calAdd", events: list });
    if (!opts.silent){
      const msg = `캘린더에 ${r.added}건 등록`
        + (r.skipped ? ` · 이미 있어 건너뜀 ${r.skipped}건` : "");
      toast(msg);
    }
    return r;
  } catch(e){
    toast("캘린더 등록 실패: " + e.message, "warn");
    console.warn("[cine] calAdd 실패", e);
    return null;
  }
}

/* 상세 모달의 회차별 📅 버튼 — 예전 기록을 뒤늦게 캘린더에 넣을 때 */
function calBtn(r){
  const b = document.createElement("button");
  b.className = "vedit vcal";
  b.textContent = "📅 캘린더";
  b.title = `‘${calTitle(r)}’ 로 문화 캘린더에 등록`;
  b.onclick = async () => {
    if (!r.date){ toast("날짜 미상 기록은 캘린더에 올릴 수 없습니다", "warn"); return; }
    b.disabled = true;
    const res = await calAdd([calEvent(r)]);
    b.disabled = false;
    if (res && res.added) b.textContent = "📅 등록됨";
  };
  return b;
}
