FILEV["nav"] = "2.23";
/* =====================================================================
   nav.js — 뒤로가기 관리 (v2.23)
   ★ 문제: 앱 안에서 탭을 옮기고 모달을 열어도 히스토리에는 아무것도 안 쌓여서,
     뒤로가기 한 번에 앱 자체를 벗어났다(직전에 보던 웹페이지로 이탈).
   ★ 해결: 탭 전환과 팝업을 각각 히스토리 한 칸으로 쌓는다.
     - 탭 전환   → { cine:"tab", tab:"wall" }
     - 팝업 열기 → { cine:"layer", name:"modal", depth:N }   (N = 쌓인 팝업 개수)
     뒤로가기가 오면 state의 depth까지 팝업을 닫고, 팝업이 없으면 그 탭으로 되돌린다.

   ★ 닫기 경로를 하나로 모으는 게 핵심이다.
     ✕ 버튼·배경 탭·ESC로 닫을 때는 DOM을 직접 건드리지 않고 history.back()만 호출한다.
     그러면 popstate가 실제 닫기를 수행하므로, 어느 경로로 닫든 히스토리와 화면이 어긋나지 않는다.
     (직접 닫으면 히스토리에 유령 칸이 남아 뒤로가기가 한 번 먹통이 된다)
   ===================================================================== */

const NAV = { stack: [], baseTab: "browse", ready: false };

function navInit(tab){
  NAV.baseTab = tab || "browse";
  try { history.replaceState({ cine: "tab", tab: NAV.baseTab }, ""); } catch(e){}
  NAV.ready = true;
}

/* 팝업을 열 때 — 이미 열려 있으면(재렌더 등) 다시 쌓지 않는다 */
function navOpen(name, domClose){
  if (NAV.stack.some(x => x.name === name)) return;
  NAV.stack.push({ name, domClose });
  try { history.pushState({ cine: "layer", name, depth: NAV.stack.length }, ""); } catch(e){}
}

/* 팝업을 닫을 때 — 스택에 있으면 뒤로가기로 넘기고 true를 돌려준다.
   호출자는 true면 DOM을 건드리지 말고 그대로 반환해야 한다. */
function navClose(name){
  const i = NAV.stack.map(x => x.name).lastIndexOf(name);
  if (i < 0) return false;
  const steps = NAV.stack.length - i;      // 이 팝업 위에 쌓인 것까지 한 번에
  try { history.go(-steps); } catch(e){ return false; }
  return true;
}

/* 탭 전환 — switchTab이 부른다 */
function navTab(tab){
  if (!NAV.ready) return;
  try { history.pushState({ cine: "tab", tab }, ""); } catch(e){}
}

window.addEventListener("popstate", e => {
  const st = (e.state && e.state.cine) ? e.state : null;
  const depth = (st && st.cine === "layer") ? st.depth : 0;

  /* 목표 깊이까지 팝업을 닫는다 (여러 칸 이동이면 한 번에 여러 개) */
  while (NAV.stack.length > depth){
    const top = NAV.stack.pop();
    try { top.domClose(); } catch(err){ console.warn("[cine] 닫기 실패", top.name, err); }
  }

  /* 팝업이 다 닫혔는데도 뒤로 왔다면 탭을 되돌린다 */
  if (!NAV.stack.length){
    const t = (st && st.cine === "tab") ? st.tab : NAV.baseTab;
    if (t && t !== S.tab) switchTab(t, true);
  }
});
