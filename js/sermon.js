// 설교 중 화면: 원고에서 성경 구절과 그림을 "원고 순서대로" 찾아 슬라이드 후보를 만든다.
//
// 1) 목사님 원고 습관: 읽을 구절은 "(고후1:3)찬송하리로다 …"처럼 한 줄에 씀
//    → 이런 줄은 원고에 쓴 글을 그대로 화면에 띄움 (일부만 인용한 것도 그대로)
// 2) 문장 속에서 "로마서 8장 28절"처럼 언급만 한 구절 → 개역개정 본문을 가져와 띄움
// 3) 원고에 넣은 그림 → Apps Script가 [[그림:번호]] 표시를 남기고 그림을 설교그림/날짜 폴더에 저장

// 성경 66권: [정식 이름, 약어...] (순서 = 개역개정 자료의 권 번호 1~66)
export const BOOKS = [
  ["창세기", "창"], ["출애굽기", "출"], ["레위기", "레"], ["민수기", "민"], ["신명기", "신"],
  ["여호수아", "수"], ["사사기", "삿"], ["룻기", "룻"], ["사무엘상", "삼상"], ["사무엘하", "삼하"],
  ["열왕기상", "왕상"], ["열왕기하", "왕하"], ["역대상", "대상"], ["역대하", "대하"], ["에스라", "스"],
  ["느헤미야", "느"], ["에스더", "에"], ["욥기", "욥"], ["시편", "시"], ["잠언", "잠"],
  ["전도서", "전"], ["아가", "아"], ["이사야", "사"], ["예레미야", "렘"], ["예레미야애가", "애"],
  ["에스겔", "겔"], ["다니엘", "단"], ["호세아", "호"], ["요엘", "욜"], ["아모스", "암"],
  ["오바댜", "옵"], ["요나", "욘"], ["미가", "미"], ["나훔", "나"], ["하박국", "합"],
  ["스바냐", "습"], ["학개", "학"], ["스가랴", "슥"], ["말라기", "말"],
  ["마태복음", "마"], ["마가복음", "막"], ["누가복음", "눅"], ["요한복음", "요"], ["사도행전", "행"],
  ["로마서", "롬"], ["고린도전서", "고전"], ["고린도후서", "고후"], ["갈라디아서", "갈"], ["에베소서", "엡"],
  ["빌립보서", "빌"], ["골로새서", "골"], ["데살로니가전서", "살전"], ["데살로니가후서", "살후"], ["디모데전서", "딤전"],
  ["디모데후서", "딤후"], ["디도서", "딛"], ["빌레몬서", "몬"], ["히브리서", "히"], ["야고보서", "약"],
  ["베드로전서", "벧전"], ["베드로후서", "벧후"], ["요한일서", "요일"], ["요한이서", "요이"], ["요한삼서", "요삼"],
  ["유다서", "유"], ["요한계시록", "계"],
];

const NAME_TO_BOOK = new Map();   // 이름 → { book, full }
BOOKS.forEach((names, i) => names.forEach((n, k) => NAME_TO_BOOK.set(n, { book: i + 1, full: k === 0 })));
const NAMES = [...NAME_TO_BOOK.keys()].sort((a, b) => b.length - a.length); // 긴 이름부터 (요한일서가 요보다 먼저)

// 책 이름 + 장:절 (예: 고후1:3 / 고린도후서 1:3~7 / 로마서 8장 28절 / 시편 23편 1-3절)
const REF = new RegExp(
  `(${NAMES.join("|")})\\s*(\\d{1,3})\\s*(?::|장\\s*|편\\s*)(\\d{1,3})(?:\\s*절)?(?:\\s*[-~～∼–]\\s*(\\d{1,3})(?:\\s*절)?)?`, "g");
// 책 이름 없이 괄호 안 장:절 (예: "(1:8)") → 설교 본문과 같은 책으로 봄
const BARE = /[(（]\s*(\d{1,3})\s*:\s*(\d{1,3})(?:\s*[-~～∼–]\s*(\d{1,3}))?\s*[)）]/g;
const ART = /^\[\[그림:(\d+)\]\]$/;
const HANGUL = /[가-힣]/;

export const bookName = (b) => BOOKS[b - 1][0];
export const refLabel = (r) => `${bookName(r.book)} ${r.ch}:${r.v1}${r.v2 && r.v2 !== r.v1 ? "-" + r.v2 : ""}`;

/** "고후 1:3~7" 같은 본문 표기에서 책 번호만 */
export function passageBook(passage) {
  REF.lastIndex = 0;
  const m = REF.exec(String(passage || ""));
  if (m) return NAME_TO_BOOK.get(m[1]).book;
  const n = NAMES.find((x) => String(passage || "").trim().startsWith(x));
  return n ? NAME_TO_BOOK.get(n).book : null;
}

/** 한 줄에서 구절 찾기 → [{book, ch, v1, v2, start, end}] */
function refsInLine(line, mainBook) {
  const found = [];
  REF.lastIndex = 0;
  let m;
  while ((m = REF.exec(line))) {
    const info = NAME_TO_BOOK.get(m[1]);
    const before = line.slice(0, m.index).replace(/\s+$/, "");
    // 약어(창, 시, 요…)는 "(약어" 또는 줄 맨 앞일 때만 인정 (예: "오전 10:30"을 전도서로 오해하지 않게)
    if (!info.full && !(before === "" || /[(（\[,;·“"']$/.test(before))) continue;
    // 정식 이름도 바로 앞 글자가 한글이면 다른 낱말의 일부로 봄 (예: "…서로마서")
    if (info.full && m.index > 0 && HANGUL.test(line[m.index - 1])) continue;
    const ch = +m[2], v1 = +m[3], v2 = m[4] ? +m[4] : v1;
    if (!ch || !v1 || v2 < v1 || v2 - v1 > 30) continue;
    found.push({ book: info.book, ch, v1, v2, start: m.index, end: m.index + m[0].length });
  }
  if (mainBook) {
    BARE.lastIndex = 0;
    while ((m = BARE.exec(line))) {
      if (found.some((f) => m.index >= f.start - 2 && m.index <= f.end)) continue;
      const ch = +m[1], v1 = +m[2], v2 = m[3] ? +m[3] : v1;
      if (!ch || !v1 || v2 < v1) continue;
      found.push({ book: mainBook, ch, v1, v2, start: m.index, end: m.index + m[0].length });
    }
  }
  return found.sort((a, b) => a.start - b.start);
}

/**
 * "(고후1:3)찬송하리로다…" 처럼 줄이 "(구절)"로 시작하면, 괄호 뒤 글이 원고에 적은 성경 본문.
 * 한 줄에 "(고후 1:8) … (고후 1:9) …"가 이어져 있어도 각각 나눠 줌.
 */
function quoteAfter(line, ref, nextStart, prevWasQuote) {
  const head = line.slice(0, ref.start).replace(/[\s“"'「『*]/g, "");
  const opened = /[(（]$/.test(head);
  const startsLine = head === "(" || head === "（";
  if (!opened || !(startsLine || prevWasQuote)) return "";
  const after = line.slice(ref.end);
  if (!/^\s*[)）]/.test(after)) return "";
  let rest = line.slice(ref.end, nextStart).replace(/^\s*[)）]\s*/, "");
  rest = rest.replace(/[\s(（“"'「『*]+$/, "").replace(/[\s”"'」』*]+$/, "").replace(/\s*…+$/, " …").trim();
  return rest.length >= 4 ? rest : "";
}

/**
 * flow(원고 글, [[그림:n]] 표시 포함) → 후보 목록
 * art: [{n, id, name}] (Apps Script가 저장한 원고 그림)
 */
export function findSermonSlides(flow, { passage = "", art = [] } = {}) {
  const mainBook = passageBook(passage);
  const artByN = new Map(art.map((a) => [String(a.n), a]));
  const out = [];
  const lines = String(flow || "").split(/[\n\r\u000b]+/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const am = line.match(ART);
    if (am) {
      const a = artByN.get(am[1]);
      if (a) out.push({ kind: "art", id: a.id, name: a.name, label: `원고 그림 ${am[1]}`, on: true });
      continue;
    }
    const refs = refsInLine(line, mainBook);
    let prevQuote = false;
    refs.forEach((r, i) => {
      const quote = quoteAfter(line, r, refs[i + 1] ? refs[i + 1].start : line.length, prevQuote);
      prevQuote = !!quote;
      const item = { kind: "verse", book: r.book, ch: r.ch, v1: r.v1, v2: r.v2, ref: refLabel(r), quote, on: true };
      const last = out[out.length - 1];
      if (last && last.kind === "verse" && last.ref === item.ref && (last.quote === item.quote || !item.quote)) return; // 바로 앞과 같으면 한 번만
      out.push(item);
    });
  }
  // "본문 고린도후서 1:3~7" 바로 뒤에 3절, 4절…을 한 줄씩 적은 경우 → 묶음 화면은 빼고 한 절씩만
  return out.filter((it, i) => {
    if (it.kind !== "verse" || it.quote || it.v2 === it.v1) return true;
    const nx = out[i + 1];
    return !(nx && nx.kind === "verse" && nx.quote && nx.book === it.book && nx.ch === it.ch && nx.v1 >= it.v1 && nx.v1 <= it.v2);
  });
}

/* ---------- 개역개정 본문 ---------- */
const bookCache = new Map();
async function loadBook(b) {
  if (!bookCache.has(b)) bookCache.set(b, fetch(`data/bible/${b}.json`).then((r) => { if (!r.ok) throw new Error("성경 자료를 못 불러왔습니다"); return r.json(); }));
  return bookCache.get(b);
}

/** 후보마다 화면에 띄울 글(text) 채우기: 원고 인용이 있으면 그대로, 없으면 개역개정 */
export async function fillVerseText(items) {
  for (const it of items) {
    if (it.kind !== "verse") continue;
    if (it.quote) { it.text = it.quote; it.source = "원고"; continue; }
    try {
      const chap = (await loadBook(it.book))[String(it.ch)] || {};
      const vs = [];
      for (let v = it.v1; v <= it.v2; v++) if (chap[String(v)]) vs.push(it.v1 === it.v2 ? chap[String(v)] : `${v} ${chap[String(v)]}`);
      it.text = vs.join("\n");
      it.source = vs.length ? "개역개정" : "";
      if (!vs.length) { it.text = ""; it.on = false; it.warn = "성경에 없는 장·절입니다"; }
    } catch (e) { it.text = ""; it.warn = e.message; }
  }
  return items;
}

/** 확정 때 슬라이드 항목으로 (설교 제목 바로 뒤에 들어감) */
export function sermonItems(list, section) {
  return (list || []).filter((s) => s.on).map((s) => s.kind === "art"
    ? { section, type: "art", id: s.id, title: s.label || "설교 그림", sermon: true }
    : { section, type: "text", title: s.ref, body: s.text || "", sermon: true });
}

/** "고후 1:3~7" 같은 본문 표기 → 한 절씩 화면 후보 (원고 없이 본문만 있을 때) */
export async function passageSlides(passage) {
  REF.lastIndex = 0;
  const m = REF.exec(String(passage || "").trim());
  if (!m) return [];
  const book = NAME_TO_BOOK.get(m[1]).book, ch = +m[2], v1 = +m[3], v2 = m[4] ? +m[4] : v1;
  const items = [];
  for (let v = v1; v <= Math.min(v2, v1 + 40); v++) items.push({ kind: "verse", book, ch, v1: v, v2: v, ref: refLabel({ book, ch, v1: v, v2: v }), quote: "", on: true });
  return fillVerseText(items);
}
