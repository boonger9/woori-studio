// 주간 준비: 이름 가리기, AI 결과 읽기, 예배 순서(슬라이드) 만들기
import { APOSTLES_CREED, CLOSING_HYMN, COMMUNION_HYMN } from "./fixed.js";
import { sermonItems } from "./sermon.js";

/* ---------- 찬송가·교독문 제목 ---------- */
let catalog = null;
export async function loadCatalog() {
  if (catalog) return catalog;
  const [h, r] = await Promise.all([fetch("data/hymns.json").then((x) => x.json()), fetch("data/responsive.json").then((x) => x.json())]);
  catalog = { hymns: h, responsive: r };
  return catalog;
}
export const hymnTitle = (no) => (catalog && catalog.hymns[String(parseInt(no, 10))]) || "";
export const responsiveTitle = (no) => (catalog && catalog.responsive[String(parseInt(no, 10))]) || "";

/** AI가 준 번호와 제목이 목록과 어긋나면, 제목으로 올바른 번호를 찾아 준다 */
const squash = (s) => String(s || "").replace(/[^가-힣0-9]/g, "");
export function fixNumberByTitle(no, title, kind = "hymn") {
  const list = catalog ? (kind === "resp" ? catalog.responsive : catalog.hymns) : {};
  const n = parseInt(no, 10);
  const want = squash(title);
  if (!want) return { no: n };
  const have = squash(list[String(n)]);
  if (have && (have === want || have.startsWith(want) || want.startsWith(have))) return { no: n };
  for (const [k, t] of Object.entries(list)) {
    const s = squash(t);
    if (s && (s === want || s.startsWith(want) || want.startsWith(s))) {
      return { no: parseInt(k, 10), note: `AI가 ${n}번이라고 했지만 제목 '${title}'은 ${k}번이라 고쳤습니다` };
    }
  }
  return { no: n, note: `AI가 말한 제목 '${title}'과 ${n}번 제목이 달라요 — 꼭 확인해 주세요` };
}

/* ---------- 성도 이름 가리기 (Gemini로 보내기 전) ---------- */
const HONORIFIC = "(?=\\s|$|[.,!?·)\\]]|님|씨|집사|권사|장로|성도|형제|자매|목사|전도사|선생|청년|학생)";

/** names가 원고에 나오면 '성도1', '성도2'로 바꿈. 3글자 이상은 그대로, 2글자 이름은 뒤에 호칭·띄어쓰기가 올 때만 */
export function maskNames(text, names) {
  const list = [...new Set(names.filter((n) => /^[가-힣]{2,5}$/.test(n)))].sort((a, b) => b.length - a.length);
  const map = []; // [{name, token}]
  let out = String(text || "");
  for (const name of list) {
    const re = name.length >= 3 ? new RegExp(name, "g") : new RegExp(name + HONORIFIC, "g");
    if (!re.test(out)) continue;
    const token = `성도${map.length + 1}`;
    out = out.replace(name.length >= 3 ? new RegExp(name, "g") : new RegExp(name + HONORIFIC, "g"), token);
    map.push({ name, token });
  }
  return { text: out, map };
}

/** AI 결과 글자 속 '성도N'을 원래 이름으로 되돌림 (긴 번호부터) */
export function unmask(value, map) {
  if (!map || !map.length) return value;
  const fix = (s) => [...map].sort((a, b) => b.token.length - a.token.length).reduce((acc, m) => acc.split(m.token).join(m.name), s);
  if (typeof value === "string") return fix(value);
  if (Array.isArray(value)) return value.map((v) => unmask(v, map));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, unmask(v, map)]));
  return value;
}

/** 답 글자 속 첫 번째 JSON 덩어리를 읽음 (앞뒤 설명이나 ``` 표시가 있어도 됨) */
export function parseAiJson(text) {
  const s = String(text || "");
  const start = s.indexOf("{"), end = s.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("결과에서 JSON을 찾지 못했습니다.");
  return JSON.parse(s.slice(start, end + 1));
}

/** AI에 보낼 사용자 메시지 (목록 + 원고) */
export function buildUserMessage(manuscript) {
  const h = Object.entries(catalog.hymns).map(([n, t]) => `${n}|${t}`).join("\n");
  const r = Object.entries(catalog.responsive).map(([n, t]) => `${n}|${t}`).join("\n");
  return `[찬송가 목록 (번호|제목)]\n${h}\n\n[교독문 목록 (번호|제목)]\n${r}\n\n=== 설교 원고 ===\n${manuscript}`;
}

/* ---------- 원고 파일 이름에서 제목·본문 읽기 ---------- */
// 예: "26.11.22_주일낮찬양예배_고후1:3~7_괜찮은 척하느라 얼마나 힘드셨습니까?"
export function parseManuscriptTitle(name) {
  const parts = String(name || "").split("_");
  if (parts.length >= 4) return { service: parts[1], passage: parts[2], title: parts.slice(3).join("_").trim() };
  return { service: parts[1] || "", passage: "", title: "" };
}

/* ---------- 날짜 규칙 ---------- */
export function weekOfMonth(date) { return Math.ceil(parseInt(date.slice(8, 10), 10) / 7); }
export const isFirstSunday = (date) => weekOfMonth(date) === 1;   // 성찬
export const isFourthSunday = (date) => weekOfMonth(date) === 4;  // 온 세대 찬양예배
export const isFifthSunday = (date) => weekOfMonth(date) === 5;   // 원로목사님 설교 (일반 예배 형식)
export const PASTOR = "이상후 목사";
export const ELDER = "김용원 원로목사";

/** 원고가 없을 때(원로목사님 설교): 제목·본문만으로 찬송·성시교독을 추천받는 메시지 */
export function buildPassageMessage(title, passage, passageText) {
  const h = Object.entries(catalog.hymns).map(([n, t]) => `${n}|${t}`).join("\n");
  const r = Object.entries(catalog.responsive).map(([n, t]) => `${n}|${t}`).join("\n");
  return `[찬송가 목록 (번호|제목)]\n${h}\n\n[교독문 목록 (번호|제목)]\n${r}\n\n` +
    `=== 이번 주는 설교 원고가 없습니다 (원로목사님 설교) ===\n설교 제목: ${title}\n본문: ${passage}\n\n[본문 말씀]\n${passageText}\n\n` +
    `※ 원고가 없으므로 summaryFull, summaryShort는 빈 문자열("")로, meditation은 빈 배열([])로 두세요. ` +
    `themes, hymnBefore, hymnOffertory, responsive만 위 제목과 본문 말씀에 맞게 추천하세요. JSON 형식은 그대로입니다.`;
}

export function koreanDate(date) {
  const [y, m, d] = date.split("-").map(Number);
  return `${y}년 ${m}월 ${d}일 주일`;
}

/* ---------- 예배 순서 → 슬라이드 항목 ---------- */
/**
 * w: { date, isCommunion, isPraise, sermonTitle, passage, preacher, prelude:[n,n], first:{no, firstVerseOnly},
 *      responsive:{no,title}, hymnBefore:{no,title}, offertory:{no,title}, prayer, gospel:[{id,title}] }
 */
export function buildWorshipItems(w) {
  return w.isPraise ? buildPraiseItems(w) : buildSundayItems(w);
}

const H = (section, no, extra = {}) => ({ section, type: "hymn", no: Number(no), title: hymnTitle(no), ...extra });
const CREED = [
  { section: "신앙고백", type: "title", title: "신앙고백", subtitle: "사도신경" },
  { section: "신앙고백", type: "text", title: "사도신경", body: APOSTLES_CREED, lines: true, align: "center" },
];

/** 주일 낮 예배 (8월 2일 주보 순서 기준) */
function buildSundayItems(w) {
  const items = [{ section: "예배 전", type: "cover", title: "주일 낮 예배", subtitle: koreanDate(w.date) }];
  (w.prelude || []).filter(Boolean).forEach((n) => items.push(H("묵도기원", n)));
  if (w.first && w.first.no) items.push(H("찬송", w.first.no, w.first.firstVerseOnly ? { note: "1절만", firstVerseOnly: true } : {}));
  if (w.responsive && w.responsive.no) items.push({ section: "성시교독", type: "responsive", no: Number(w.responsive.no), title: responsiveTitle(w.responsive.no) });
  items.push(...CREED);
  if (w.hymnBefore && w.hymnBefore.no) items.push(H("설교 전 찬송", w.hymnBefore.no));
  items.push({ section: "대표기도", type: "title", title: "대표기도", subtitle: w.prayer || "" });
  items.push({ section: "말씀", type: "title", title: w.sermonTitle || "말씀", subtitle: [w.passage, w.preacher].filter(Boolean).join(" · ") });
  items.push(...sermonItems(w.sermonSlides, "말씀"));   // 설교 중 화면 (구절·그림, 원고 순서)
  if (w.offertory && w.offertory.no) items.push(H("봉헌", w.offertory.no));
  if (w.isCommunion) {
    items.push({ section: "성찬", type: "title", title: "성찬식" });
    items.push(H("성찬", COMMUNION_HYMN.no, { note: COMMUNION_HYMN.note, firstVerseOnly: true }));
  }
  items.push({ section: "교회 소식", type: "title", title: "교회 소식" });
  items.push(H("폐회 찬송", CLOSING_HYMN.no));
  items.push({ section: "축도", type: "title", title: "축도", subtitle: w.preacher || "" });
  items.push({ section: "예배 후", type: "logo" });
  return items;
}

/** 온 세대 찬양예배 (넷째 주): 경배와 찬양(복음송가) → 신앙고백 → 광고 → 봉헌 → 대표기도 → 성경봉독 → 설교 → 설교 후 찬양 → 축도 */
function buildPraiseItems(w) {
  const items = [{ section: "예배 전", type: "cover", title: "온 세대 찬양예배", subtitle: koreanDate(w.date) }];
  (w.gospel || []).forEach((g) => items.push({ section: "경배와 찬양", type: "gospel", id: g.id, title: g.title }));
  items.push(...CREED);
  items.push({ section: "광고", type: "title", title: "교회 소식" });
  if (w.offertory && w.offertory.no) items.push(H("봉헌", w.offertory.no));
  items.push({ section: "대표기도", type: "title", title: "대표기도", subtitle: w.prayer || "" });
  if (w.passage) items.push({ section: "성경봉독", type: "title", title: "성경봉독", subtitle: w.passage });
  items.push({ section: "설교", type: "title", title: w.sermonTitle || "말씀", subtitle: [w.passage, w.preacher].filter(Boolean).join(" · ") });
  items.push(...sermonItems(w.sermonSlides, "설교"));
  if (w.gospelAfter && w.gospelAfter.id) items.push({ section: "설교 후 찬양", type: "gospel", id: w.gospelAfter.id, title: w.gospelAfter.title });
  items.push({ section: "축도", type: "title", title: "축도", subtitle: w.preacher || "" });
  items.push({ section: "예배 후", type: "logo" });
  return items;
}

/** 이번 주에 그림으로 만들어야 할 악보 목록 */
export function mediaNeeds(items) {
  const hymns = [...new Set(items.filter((i) => i.type === "hymn").map((i) => i.no))];
  const responsive = [...new Set(items.filter((i) => i.type === "responsive").map((i) => i.no))];
  const gospel = items.filter((i) => i.type === "gospel").map((i) => ({ id: i.id, title: i.title }));
  const art = items.filter((i) => i.type === "art").map((i) => ({ id: i.id, title: i.title }));
  return { hymns, responsive, gospel, art };
}
