// 백엔드 연결: Apps Script(목사님 계정으로 실행) 주소·비밀값은 Firestore config/backend에 저장
// (보안 규칙상 허용된 계정만 읽고 쓸 수 있음)
import { db, doc, getDoc, setDoc } from "./firebase.js";

let cache = null;

export async function loadBackendConfig() {
  if (cache) return cache;
  const snap = await getDoc(doc(db, "config", "backend"));
  cache = snap.exists() ? snap.data() : {};
  return cache;
}

export async function saveBackendConfig(cfg) {
  const clean = {
    gasUrl: String(cfg.gasUrl || "").trim(),
    secret: String(cfg.secret || "").trim(),
    attendanceDbUrl: String(cfg.attendanceDbUrl || "").trim().replace(/\/+$/, ""),
  };
  await setDoc(doc(db, "config", "backend"), clean);
  cache = clean;
  return clean;
}

/** Apps Script 호출. text/plain으로 보내면 브라우저 사전 확인(CORS) 없이 보낼 수 있음 */
export async function callGas(action, payload = {}) {
  const cfg = await loadBackendConfig();
  if (!cfg.gasUrl || !cfg.secret) throw new Error("설정에서 Apps Script 주소와 비밀값을 먼저 넣어 주세요.");
  let res;
  try {
    res = await fetch(cfg.gasUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action, secret: cfg.secret, ...payload }),
    });
  } catch (e) {
    throw new Error("Apps Script에 연결하지 못했습니다. 주소가 맞는지, 인터넷이 되는지 확인해 주세요.");
  }
  if (!res.ok) throw new Error("Apps Script 응답 오류: HTTP " + res.status);
  let data;
  try { data = await res.json(); } catch (e) { throw new Error("Apps Script 응답을 읽지 못했습니다. 웹 앱 배포 설정(액세스: 모든 사용자)을 확인해 주세요."); }
  if (!data.ok) throw new Error(data.error || "알 수 없는 오류");
  return data;
}

/** 출석부(실시간 DB)에서 교인 이름 목록 읽기 */
export async function loadMemberNames() {
  const cfg = await loadBackendConfig();
  if (!cfg.attendanceDbUrl) return { names: [], error: "설정에 출석부 DB 주소가 없습니다." };
  try {
    const res = await fetch(`${cfg.attendanceDbUrl}/members.json`);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = (await res.json()) || {};
    const names = [...new Set(Object.values(data).map((m) => String((m && m.name) || "").trim()).filter(Boolean))];
    return { names, error: null };
  } catch (e) {
    return { names: [], error: "출석부 명단을 읽지 못했습니다 (" + e.message + ")" };
  }
}
