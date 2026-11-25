// 예배 슬라이드 묶음(덱) 데이터: 불러오기, 저장, 자동 분할, 샘플
import { db, doc, getDoc, setDoc, onSnapshot, serverTimestamp } from "./firebase.js";
import { hymnPages, responsivePages, gospelPages } from "./media.js";
import { APOSTLES_CREED, CLOSING_HYMN } from "./fixed.js";

/*
 덱 구조 (Firestore: decks/{YYYY-MM-DD})
 {
   date: "2026-11-29", title: "주일 낮 예배",
   items: [                       // 사람이 편집하는 '예배 순서' 단위
     { section: "찬송", type: "hymn", no: 54, title: "주여 복을 구하오니", note: "1절만" },
     { section: "광고", type: "text", title: "교회 소식", body: "여러 줄...\n..." },
     ...
   ]
 }
 화면에 띄우는 slides는 items를 expandItems()로 펼친 결과입니다.
 긴 본문은 화면에 들어가는 분량만큼 자동으로 여러 장으로 나뉘므로 장수 제한이 없습니다.
*/

const CACHE_KEY = (id) => `woori-studio:deck:${id}`;

// 한 장에 들어갈 분량 (16:9, 큰 글씨 기준)
const MAX_LINES = 6;
const MAX_CHARS_PER_LINE = 28;

function lineCost(line) {
  return Math.max(1, Math.ceil([...line].length / MAX_CHARS_PER_LINE));
}

/** 긴 본문을 화면 분량 단위로 나눔. 빈 줄은 문단 경계로 우선 사용.
 *  '---' 줄이 있으면 그 자리에서만 나눔 (사도신경처럼 넘기는 위치가 정해진 고정 문구) */
export function paginateBody(body) {
  const text = String(body || "").replace(/\r/g, "");
  if (/^---$/m.test(text)) return text.split(/^---$/m).map((p) => p.trim()).filter(Boolean);
  const lines = text.split("\n");
  const pages = [];
  let cur = [], cost = 0;
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line === "") { // 문단 경계: 지금 장이 절반 이상 찼으면 넘김
      if (cost >= MAX_LINES / 2) { pages.push(cur); cur = []; cost = 0; }
      else if (cur.length) { cur.push(""); }
      continue;
    }
    const c = lineCost(line);
    if (cost + c > MAX_LINES && cur.length) { pages.push(cur); cur = []; cost = 0; }
    cur.push(line); cost += c;
  }
  if (cur.some((l) => l !== "")) pages.push(cur);
  return pages.map((p) => p.join("\n").trim()).filter(Boolean);
}

const isFirstVerseOnly = (it) => it.firstVerseOnly === true || /1절만/.test(it.note || "");

/** items → slides (자동 분할 포함). manifest: 이번 주 악보 PPT 그림 목록 */
export function expandItems(items = [], manifest = { hymns: {}, responsive: {} }) {
  const slides = [];
  items.forEach((it, i) => {
    const base = { section: it.section || "", itemIndex: i };
    if (it.type === "text" && it.body) {
      const pages = paginateBody(it.body);
      pages.forEach((body, p) =>
        slides.push({ ...base, type: "text", title: it.title || "", body, lines: !!it.lines, align: it.align || "",
          page: pages.length > 1 ? `${p + 1}/${pages.length}` : "" }));
      return;
    }
    if (it.type === "hymn") {
      const pages = hymnPages(manifest, it.no, isFirstVerseOnly(it));
      if (!pages.length) {
        slides.push({ ...base, type: "missing", no: it.no, title: it.title || "",
          message: `${it.no}장 악보 PPT가 아직 준비되지 않았습니다` });
        return;
      }
      pages.forEach((image, p) => slides.push({ ...base, type: "hymn", no: it.no, title: it.title || "",
        note: it.note || "", image, page: `${p + 1}/${pages.length}` }));
      return;
    }
    if (it.type === "gospel") {
      const pages = gospelPages(manifest, it.id);
      if (!pages.length) {
        slides.push({ ...base, type: "missing", title: it.title || "",
          message: `복음송가 '${it.title || ""}' 악보가 아직 준비되지 않았습니다` });
        return;
      }
      pages.forEach((image, p) => slides.push({ ...base, type: "gospel", id: it.id, title: it.title || "",
        image, page: `${p + 1}/${pages.length}` }));
      return;
    }
    if (it.type === "responsive") {
      const pages = responsivePages(manifest, it.no);
      if (!pages.length) {
        slides.push({ ...base, type: "missing", no: it.no, title: it.title || "",
          message: `교독문 ${it.no}번이 아직 준비되지 않았습니다` });
        return;
      }
      pages.forEach((image, p) => slides.push({ ...base, type: "responsive", no: it.no, title: it.title || "",
        image, page: `${p + 1}/${pages.length}` }));
      return;
    }
    slides.push({ ...base, ...it });
  });
  return slides;
}

export function sectionsOf(slides) {
  const out = [];
  slides.forEach((s, i) => {
    if (s.section && (!out.length || out[out.length - 1].label !== s.section)) out.push({ label: s.section, index: i });
  });
  return out;
}

function cacheSave(id, deck) {
  try { localStorage.setItem(CACHE_KEY(id), JSON.stringify(deck)); } catch (e) { /* 저장공간 부족 등은 무시 */ }
}
function cacheLoad(id) {
  try { const s = localStorage.getItem(CACHE_KEY(id)); return s ? JSON.parse(s) : null; } catch (e) { return null; }
}

/** 덱 실시간 구독. 인터넷이 끊겨도 마지막으로 받은 덱(캐시)을 먼저 보여 줌 */
export function watchDeck(id, onDeck, onError) {
  const cached = cacheLoad(id);
  if (cached) onDeck(cached, "cache");
  return onSnapshot(doc(db, "decks", id),
    (snap) => {
      if (!snap.exists()) { onDeck(null, "missing"); return; }
      const deck = snap.data();
      delete deck.updatedAt;
      cacheSave(id, deck);
      onDeck(deck, "cloud");
    },
    (err) => onError && onError(err));
}

export async function loadDeck(id) {
  const snap = await getDoc(doc(db, "decks", id));
  return snap.exists() ? snap.data() : null;
}

export async function saveDeck(id, deck) {
  await setDoc(doc(db, "decks", id), { ...deck, updatedAt: serverTimestamp() });
  cacheSave(id, deck);
}

/** 다음(또는 오늘) 주일 날짜 YYYY-MM-DD (한국 시간 기준) */
export function nextSunday(from = new Date()) {
  const kst = new Date(from.getTime() + (9 * 60 + from.getTimezoneOffset()) * 60000);
  const d = new Date(kst.getFullYear(), kst.getMonth(), kst.getDate());
  d.setDate(d.getDate() + ((7 - d.getDay()) % 7));
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 1단계 시험용 샘플 예배 (2단계에서는 주간 준비 화면이 이 자리를 채움) */
export function sampleDeck(date) {
  return {
    date, title: "주일 낮 예배 (시험용 샘플)",
    items: [
      { section: "예배 전", type: "cover", title: "주일 낮 예배", subtitle: date },
      { section: "묵도기원", type: "hymn", no: 257, title: "마음에 가득한 의심을 깨치고" },
      { section: "묵도기원", type: "hymn", no: 259, title: "예수 십자가에 흘린 피로써" },
      { section: "찬송", type: "hymn", no: 4, title: "성부 성자와 성령", note: "1절만" },
      { section: "성시교독", type: "responsive", no: 115, title: "구주 강림(1)" },
      { section: "신앙고백", type: "title", title: "신앙고백", subtitle: "사도신경" },
      { section: "신앙고백", type: "text", title: "사도신경", body: APOSTLES_CREED, lines: true, align: "center" },
      { section: "설교 전 찬송", type: "hymn", no: 258, title: "샘물과 같은 보혈은" },
      { section: "대표기도", type: "title", title: "대표기도", subtitle: "○○○ 장로" },
      { section: "말씀", type: "title", title: "괜찮은 척하느라 얼마나 힘드셨습니까?", subtitle: "고린도후서 1:3~7 · 이상후 목사" },
      { section: "말씀", type: "text", title: "오늘의 말씀 요점",
        body: "하나님의 위로는 고난이 끝난 뒤에만 오지 않습니다.\n고난 한가운데서 먼저 찾아오십니다.\n\n받은 위로는 흘려보내라고 주신 위로입니다.\n오늘 내 곁의 한 사람에게 그 위로를 나눕시다." },
      { section: "봉헌", type: "hymn", no: 268, title: "죄에서 자유를 얻게 함은" },
      { section: "교회 소식", type: "title", title: "교회 소식" },
      { section: "폐회 찬송", type: "hymn", ...CLOSING_HYMN },
      { section: "축도", type: "title", title: "축도", subtitle: "이상후 목사" },
      { section: "예배 후", type: "logo" },
    ],
  };
}

/** 장수 제한이 없는지 확인하는 시험용 덱 (120장) */
export function stressDeck(date, count = 120) {
  const items = [{ section: "시작", type: "cover", title: "120장 시험", subtitle: date }];
  for (let i = 1; i <= count; i++) {
    items.push({ section: `구간 ${Math.ceil(i / 20)}`, type: "text", title: `시험 슬라이드 ${i}`, body: `${i}번째 장입니다.\n장수 제한 없이 넘어가는지 확인합니다.` });
  }
  return { date, title: "장수 제한 시험", items };
}
