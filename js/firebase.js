// Firebase 연결과 로그인 공통 모듈
import { firebaseConfig, ALLOWED_EMAILS } from "./config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut,
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, onSnapshot, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import {
  getDatabase, ref, onValue, set, onDisconnect, remove,
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-database.js";

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const rtdb = getDatabase(app);

export { doc, getDoc, setDoc, onSnapshot, serverTimestamp, ref, onValue, set, onDisconnect, remove };

export function isAllowed(user) {
  return !!user && user.emailVerified && ALLOWED_EMAILS.includes((user.email || "").toLowerCase());
}

function friendlyAuthError(e) {
  const code = e && e.code ? e.code : "";
  if (code.includes("popup-blocked")) return "팝업이 차단되었습니다. 브라우저 주소창 오른쪽의 팝업 차단 표시를 눌러 허용해 주세요.";
  if (code.includes("popup-closed")) return "로그인 창이 닫혔습니다. 다시 눌러 주세요.";
  if (code.includes("unauthorized-domain")) return "이 주소가 Firebase 승인 도메인에 없습니다. Authentication → 설정 → 승인된 도메인에 추가해 주세요.";
  if (code.includes("network")) return "인터넷 연결을 확인해 주세요.";
  return "로그인에 실패했습니다: " + (e && e.message ? e.message : code);
}

export async function login() {
  try {
    await signInWithPopup(auth, new GoogleAuthProvider());
  } catch (e) {
    throw new Error(friendlyAuthError(e));
  }
}

export const logout = () => signOut(auth);

/**
 * 로그인이 필요한 화면에서 사용.
 * gateEl: 로그인 안내를 보여 줄 요소, onReady(user): 허용된 계정으로 로그인되면 호출
 */
export function requireLogin(gateEl, onReady) {
  let started = false;
  onAuthStateChanged(auth, (user) => {
    if (isAllowed(user)) {
      gateEl.hidden = true;
      if (!started) { started = true; onReady(user); }
      return;
    }
    gateEl.hidden = false;
    gateEl.innerHTML = `
      <div class="gate-card">
        <img src="assets/logo.png" alt="대구우리교회" class="gate-logo">
        <h1>예배 스튜디오</h1>
        ${user ? `<p class="warn">${user.email} 계정은 사용 권한이 없습니다.<br>허용된 구글 계정으로 다시 로그인해 주세요.</p>` : `<p>구글 계정으로 로그인해 주세요.</p>`}
        <button class="btn primary big" id="gate-login">Google로 로그인</button>
        ${user ? `<button class="btn" id="gate-logout">다른 계정으로 바꾸기</button>` : ""}
        <p class="err" id="gate-err" role="alert"></p>
      </div>`;
    gateEl.querySelector("#gate-login").onclick = async () => {
      const err = gateEl.querySelector("#gate-err");
      err.textContent = "";
      try { if (user) await logout(); await login(); } catch (e) { err.textContent = e.message; }
    };
    const out = gateEl.querySelector("#gate-logout");
    if (out) out.onclick = () => logout();
  });
}
