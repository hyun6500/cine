/* =====================================================================
   auth.js — 쓰기 권한 (추가·수정·삭제·병합·찜)
   ★ 설계: 비밀번호를 코드에 두지 않는다.
     사용자가 입력한 비밀번호가 그대로 Apps Script의 TOKEN으로 전송되고,
     서버(Apps Script)가 검증한다. 따라서 소스를 열어봐도 쓰기 권한을 얻을 수 없다.
     (기존처럼 config.js에 토큰을 박아두면 누구나 읽어서 쓸 수 있었음)
   세션: 인증 후 10분 유지, 쓰기가 일어날 때마다 갱신(슬라이딩). 탭을 닫으면 소멸.
   ===================================================================== */

const AUTH = { pw: null, exp: 0, TTL: 10 * 60 * 1000, _resolve: null };

/* ---------- 세션 복원/저장 (sessionStorage: 탭 단위, 브라우저 종료 시 소멸) ---------- */
(function restoreAuth(){
  try {
    const s = JSON.parse(sessionStorage.getItem("cineAuth") || "null");
    if (s && s.exp > Date.now()){ AUTH.pw = s.pw; AUTH.exp = s.exp; }
  } catch(e){}
})();

function authSave(){
  try {
    if (AUTH.pw) sessionStorage.setItem("cineAuth", JSON.stringify({ pw: AUTH.pw, exp: AUTH.exp }));
    else sessionStorage.removeItem("cineAuth");
  } catch(e){}
}

function authAlive(){ return !!AUTH.pw && Date.now() < AUTH.exp; }
function authTouch(){ if (AUTH.pw){ AUTH.exp = Date.now() + AUTH.TTL; authSave(); updateLockUI(); } }

function authLock(silent){
  AUTH.pw = null; AUTH.exp = 0; authSave(); updateLockUI();
  if (!silent) toast("잠갔습니다 — 수정·삭제·찜에는 비밀번호가 다시 필요합니다");
}

/* 남은 시간 표시 + 만료 자동 감시 */
function updateLockUI(){
  const b = $("#btn-lock");
  if (!b) return;
  const on = authAlive();
  b.classList.toggle("on", on);
  const min = on ? Math.max(1, Math.ceil((AUTH.exp - Date.now()) / 60000)) : 0;
  b.innerHTML = on ? `<span class="ic">🔓</span><span class="lt">${min}</span>` : `<span class="ic">🔒</span>`;
  b.title = on ? `편집 가능 — ${min}분 후 자동 잠금 (눌러서 바로 잠그기)` : "편집하려면 비밀번호 입력";
}
setInterval(() => {
  if (AUTH.pw && !authAlive()){ authLock(true); toast("10분이 지나 자동으로 잠겼습니다"); }
  else updateLockUI();
}, 20000);

/* ---------- 비밀번호 입력 ---------- */
function openAuthModal(reason){
  $("#auth-msg").textContent = reason || "수정·삭제·찜하기에는 비밀번호가 필요합니다.";
  $("#auth-err").textContent = "";
  $("#auth-pw").value = "";
  const bg = $("#auth-bg");
  bg.classList.add("show"); bg.setAttribute("aria-hidden","false");
  document.body.style.overflow = "hidden";
  setTimeout(() => $("#auth-pw").focus(), 50);
}

function closeAuthModal(ok){
  $("#auth-bg").classList.remove("show");
  $("#auth-bg").setAttribute("aria-hidden","true");
  if (!$("#modal-bg").classList.contains("show") && !$("#edit-bg").classList.contains("show"))
    document.body.style.overflow = "";
  const r = AUTH._resolve; AUTH._resolve = null;
  if (r) r(!!ok);
}

async function trySubmitAuth(){
  const pw = $("#auth-pw").value;
  if (!pw){ $("#auth-err").textContent = "비밀번호를 입력하세요"; return; }
  if (!CONFIG.APPS_SCRIPT_URL){ $("#auth-err").textContent = "APPS_SCRIPT_URL이 설정돼 있지 않습니다 (js/config.js)"; return; }
  const btn = $("#auth-ok");
  btn.disabled = true; btn.textContent = "확인 중…";
  try {
    const res = await fetch(CONFIG.APPS_SCRIPT_URL, { method:"POST", body: JSON.stringify({ token: pw, action: "auth" }) });
    const d = await res.json();
    if (d.ok){
      AUTH.pw = pw; authTouch();
      closeAuthModal(true);
      toast("10분간 편집할 수 있습니다");
    } else {
      $("#auth-err").textContent = "비밀번호가 맞지 않습니다";
      $("#auth-pw").select();
    }
  } catch(e){
    $("#auth-err").textContent = "확인 실패 — Apps Script 배포 상태를 확인해 주세요";
  }
  btn.disabled = false; btn.textContent = "확인";
}

/* 쓰기 직전 호출 — true면 진행 */
function ensureAuth(reason){
  if (authAlive()){ authTouch(); return Promise.resolve(true); }
  openAuthModal(reason);
  return new Promise(res => { AUTH._resolve = res; });
}

/* ---------- 쓰기 요청 공통 ---------- */
async function gsPost(payload){
  if (!CONFIG.APPS_SCRIPT_URL) throw new Error("CONFIG.APPS_SCRIPT_URL이 비어 있습니다 (js/config.js)");
  if (!authAlive()) throw new Error("인증이 만료됐습니다 — 다시 시도해 주세요");
  const res = await fetch(CONFIG.APPS_SCRIPT_URL, {
    method: "POST",
    body: JSON.stringify({ token: AUTH.pw, ...payload }),   // text/plain → preflight 회피
  });
  const d = await res.json();
  if (!d.ok) throw new Error(d.error || "저장 실패");
  authTouch();
  return d;
}
