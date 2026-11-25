// 실시간 슬라이드 상태 동기화
// - 같은 PC 안(발표자 창 ↔ 송출 창): BroadcastChannel. 인터넷이 끊겨도 동작
// - 다른 기기(폰 리모컨 ↔ 송출 PC): Firebase Realtime Database
import { rtdb, ref, onValue, set, onDisconnect, remove } from "./firebase.js";

const CHANNEL = "woori-studio-live";
const LIVE_PATH = "live/state";

/**
 * state: { deckId, index, mode: "slide" | "black" | "logo", by }
 * canWrite: 로그인한 발표자/리모컨만 true
 */
export function createLive({ canWrite = false, who = "unknown" } = {}) {
  const bc = "BroadcastChannel" in window ? new BroadcastChannel(CHANNEL) : null;
  const liveRef = ref(rtdb, LIVE_PATH);
  const stateListeners = new Set();
  const connListeners = new Set();
  let state = { deckId: null, index: 0, mode: "slide" };
  let online = false;
  const lastAtBy = {}; // 같은 기기가 보낸 신호는 시간 순서대로만 받음 (늦게 온 옛 신호 무시)

  const emit = (s, source) => {
    if (!s || typeof s !== "object") return;
    if (s.by && s.at) {
      if (lastAtBy[s.by] && s.at < lastAtBy[s.by]) return;
      lastAtBy[s.by] = s.at;
    }
    state = { ...state, ...s };
    stateListeners.forEach((fn) => fn(state, source));
  };

  let markReady;
  const ready = new Promise((res) => { markReady = res; setTimeout(res, 2500); }); // 오프라인이면 2.5초 뒤 그냥 진행

  if (bc) bc.onmessage = (e) => emit(e.data, "local");
  onValue(liveRef, (snap) => { emit(snap.val(), "cloud"); markReady(); }, (err) => { console.warn("live read error", err); markReady(); });
  onValue(ref(rtdb, ".info/connected"), (snap) => {
    online = snap.val() === true;
    connListeners.forEach((fn) => fn(online));
  });

  async function update(patch) {
    if (!canWrite) throw new Error("이 화면에서는 슬라이드를 바꿀 수 없습니다.");
    const next = { deckId: state.deckId, index: state.index, mode: state.mode, ...patch, by: who, at: Date.now() };
    emit(next, "self");
    if (bc) bc.postMessage(next);
    try {
      await set(liveRef, next);
    } catch (e) {
      // 오프라인이면 Firebase가 대기열에 넣었다가 연결되면 보냄. 권한 오류만 알림
      if (String(e && e.code).includes("PERMISSION")) throw new Error("권한이 없습니다. 허용된 계정으로 로그인해 주세요.");
    }
  }

  return {
    get state() { return state; },
    get online() { return online; },
    ready,
    onState(fn) { stateListeners.add(fn); fn(state, "init"); return () => stateListeners.delete(fn); },
    onConnection(fn) { connListeners.add(fn); fn(online); return () => connListeners.delete(fn); },
    update,
  };
}

/** 송출 화면이 켜져 있음을 알림 (리모컨에 '송출 화면 연결됨' 표시용) */
export function announceDisplay() {
  const r = ref(rtdb, "live/presence/display");
  onValue(ref(rtdb, ".info/connected"), (snap) => {
    if (snap.val() !== true) return;
    onDisconnect(r).remove().then(() => set(r, Date.now())).catch(() => {});
  });
}

export function watchDisplayPresence(fn) {
  return onValue(ref(rtdb, "live/presence/display"), (snap) => fn(snap.exists()));
}

/** 화면 꺼짐 방지 (지원하는 브라우저에서만) */
export function keepAwake() {
  let lock = null;
  const req = async () => {
    try { if ("wakeLock" in navigator && document.visibilityState === "visible") lock = await navigator.wakeLock.request("screen"); }
    catch (e) { /* 지원 안 하면 무시 */ }
  };
  document.addEventListener("visibilitychange", req);
  req();
  return () => lock && lock.release();
}

export const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
export { remove };
