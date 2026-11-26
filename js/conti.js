// 콘티: 이번 주일에 부를 모든 찬송·찬양의 악보를 모아 A4 가로 PDF로 (반주자·찬양팀용)
//  - 찬송가 악보: GitHub boonger9/church-hymns (새찬송가 1~645장, 자동)
//  - 복음송가 악보: 찬양/악보 폴더의 이미지 (곡 제목으로 이름, 여러 장이면 제목_1, 제목_2)
//  - 배치(주일 낮): 1쪽 묵도기원 2곡 | 2쪽 왼쪽 기도송·폐회송, 오른쪽 첫 찬송 | 3쪽 설교 전 | 설교 후 | 끝쪽 오후 찬양 2곡
//    여백 1cm, 두 칸, 긴 악보는 쪽 높이를 꽉 채움
//  - 브라우저에서 바로 PDF를 만들어 찬양/콘티 폴더에 올림 (10~20초)

import { CLOSING_HYMN, COMMUNION_HYMN } from "./fixed.js";

const EXT = /\.(pptx?|pdf|jpe?g|png|webp|gif)$/i;
export const cleanTitle = (s) => String(s || "").replace(EXT, "").replace(/_Wide.*$/i, "").replace(/\s*\(\d+\)\s*$/, "").trim();
const key = (s) => cleanTitle(s).replace(/[^가-힣a-zA-Z0-9]/g, "").toLowerCase();
export const PRAYER_SONG = 631;   // 기도송 (반주자용, 대표기도 뒤)
export const hymnScoreUrl = (no) => `https://raw.githubusercontent.com/boonger9/church-hymns/main/hymn_${String(no).padStart(3, "0")}.jpg`;

/* ---------- 복음송가 제목 ↔ 악보 이미지 짝짓기 ---------- */
function groupScores(scores) {
  const g = new Map();
  for (const s of scores || []) {
    const t = String(s.name || "").replace(EXT, "");
    const m = t.match(/^(.*?)[_\-\s]+(\d{1,2})$/);
    const base = key(m ? m[1] : t), page = m ? +m[2] : 0;
    if (!base) continue;
    if (!g.has(base)) g.set(base, []);
    g.get(base).push({ ...s, page });
  }
  g.forEach((list) => list.sort((a, b) => a.page - b.page));
  return g;
}
/** 곡 제목 → 맞는 악보 이미지 목록 [{id, name}] (없으면 []) */
export function matchScores(songTitle, scores) {
  const full = key(songTitle);
  const parens = [...String(songTitle).matchAll(/\(([^)]+)\)/g)].map((m) => key(m[1])).filter(Boolean);
  const main = key(String(songTitle).replace(/\([^)]*\)/g, ""));
  let best = null, bestScore = 0;
  groupScores(scores).forEach((list, base) => {
    let sc = 0;
    if (base === full || base === main || parens.includes(base)) sc = 4;
    else if (base.length >= 3 && (main.startsWith(base) || base.startsWith(main))) sc = 3;
    else if (base.length >= 4 && parens.some((p) => p.startsWith(base) || base.startsWith(p))) sc = 3;
    else if (base.length >= 5 && full.includes(base)) sc = 2;
    if (sc > bestScore || (sc === bestScore && sc > 0 && base.length > best.base.length)) { bestScore = sc; best = { base, list }; }
  });
  return best ? best.list.map((x) => ({ id: x.id, name: x.name })) : [];
}

/* ---------- 이번 주 콘티에 들어갈 곡 (예배 순서대로) + 쪽 배치 자리 ---------- */
// 각 곡에 자리(at: [쪽, 칸])를 붙임. 칸 0=왼쪽, 1=오른쪽. 같은 칸의 곡은 위아래로 쌓음.
const hy = (label, o, at) => (o && o.no ? { label, kind: "hymn", no: +o.no, at } : null);
const gs = (label, g, at) => (g && g.id ? { label, kind: "gospel", title: cleanTitle(g.title), id: g.id, at } : null);
const pair = (i, base = 1) => [base + Math.floor(i / 2), i % 2];   // 두 곡씩 좌우 나란히

/** [{ section, items: [{label, kind:'hymn', no, at} | {label, kind:'gospel', title, at}] }] */
export function contiSections(w) {
  const out = [];
  const day = [];
  if (w.isPraise) {
    // 찬양예배: 순서대로 두 곡씩 좌우
    const list = [];
    (w.gospel || []).forEach((g, i) => list.push(["gs", `경배와 찬양 ${i + 1}`, g]));
    list.push(["hy", "봉헌", w.offertory]);
    list.push(["hy", "기도송", { no: PRAYER_SONG }]);
    list.push(["gs", "설교 후 찬양", w.gospelAfter]);
    list.filter(([k, , o]) => (k === "hy" ? o && o.no : o && o.id))
      .forEach(([k, label, o], i) => day.push(k === "hy" ? hy(label, o, pair(i)) : gs(label, o, pair(i))));
  } else {
    // 1쪽: 묵도기원 두 곡 좌우
    (w.prelude || []).forEach((no, i) => day.push(hy(`묵도기원 ${i + 1}`, { no }, pair(i, 1))));
    const p = 1 + Math.max(1, Math.ceil((w.prelude || []).length / 2));
    // 2쪽: 왼쪽 위 기도송 631 · 왼쪽 아래 폐회송 / 오른쪽 첫 찬송
    const first = w.first && w.first.firstVerseOnly ? "찬송(1절)" : "찬송";
    day.push(hy(first, w.first, [p, 1]));
    // 3쪽: 왼쪽 설교 전 찬송 / 오른쪽 설교 후(봉헌) 찬송
    day.push(hy("설교 전 찬송", w.hymnBefore, [p + 1, 0]));
    day.push(hy("기도송", { no: PRAYER_SONG }, [p, 0]));
    day.push(hy("설교 후(봉헌)", w.offertory, [p + 1, 1]));
    if (w.isCommunion) day.push(hy("성찬", { no: COMMUNION_HYMN.no }, [p + 2, 0]));
    day.push(hy("폐회송", { no: CLOSING_HYMN.no }, [p, 0]));
  }
  const dayItems = day.filter(Boolean);
  if (dayItems.length) out.push({ section: w.isPraise ? "온 세대 찬양예배" : "주일 낮 예배", items: dayItems });
  const pm = w.afternoon || {};
  if (pm.on !== false) {
    // 마지막 쪽: 오후 찬양 좌우 나란히
    const items = (pm.songs || []).filter((g) => g && g.id).map((g, i) => gs(`오후 찬양 ${i + 1}`, g, pair(i, 100)));
    if (items.length) out.push({ section: "오후 예배", items });
  }
  return out;
}

/* ---------- PDF 만들기 ---------- */
const PAGE_W = 297, PAGE_H = 210, M = 10, HEAD = 6, GAP = 5;           // mm
const AREA_W = PAGE_W - 2 * M, AREA_TOP = M + HEAD, AREA_H = PAGE_H - M - AREA_TOP;
const COL_W = (AREA_W - GAP) / 2;

function loadImage(src) {
  return new Promise((ok, bad) => { const im = new Image(); im.crossOrigin = "anonymous"; im.onload = () => ok(im); im.onerror = () => bad(new Error("그림을 불러오지 못했습니다")); im.src = src; });
}
/** 어떤 그림이든 흰 바탕 JPEG로 (PNG 투명·webp 대비) */
function toJpeg(im) {
  const c = document.createElement("canvas"); c.width = im.naturalWidth; c.height = im.naturalHeight;
  const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(im, 0, 0);
  return { data: c.toDataURL("image/jpeg", 0.9), w: c.width, h: c.height };
}
/** 한글 머리글은 그림으로 그려 넣음 (PDF 기본 글꼴에 한글이 없어서) */
function textImage(text) {
  const pxPerMm = 12, hPx = Math.round(HEAD * pxPerMm);
  const font = `${Math.round(hPx * 0.6)}px "Pretendard", "Malgun Gothic", "Apple SD Gothic Neo", sans-serif`;
  const c = document.createElement("canvas"); let g = c.getContext("2d");
  g.font = font;
  c.width = Math.ceil(g.measureText(text).width) + 8; c.height = hPx;
  g = c.getContext("2d");
  g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
  g.font = font; g.fillStyle = "#333"; g.textBaseline = "middle"; g.fillText(text, 4, c.height / 2);
  return { data: c.toDataURL("image/jpeg", 0.92), w: c.width / pxPerMm, h: HEAD };
}

/** 한 칸에 그림들을 위아래로 쌓을 때의 배율 (칸 너비 기준, 높이가 넘치면 함께 줄임) */
function stackScale(pics) {
  const hs = pics.map((p) => COL_W * p.h / p.w);
  const avail = AREA_H - GAP * (pics.length - 1);
  return Math.min(1, avail / hs.reduce((a, b) => a + b, 0));
}
/** 한 칸 안의 그림 위치 */
function placeColumn(pics, col) {
  const out = [];
  if (pics.length === 1) {
    const p = pics[0];
    let w = COL_W, h = COL_W * p.h / p.w;
    if (h > AREA_H) { h = AREA_H; w = AREA_H * p.w / p.h; }   // 긴 악보: 높이를 꽉
    out.push({ pic: p, x: M + col * (COL_W + GAP) + (COL_W - w) / 2, y: AREA_TOP, w, h });
    return out;
  }
  const s = stackScale(pics);
  let y = AREA_TOP;
  for (const p of pics) {
    const w = COL_W * s, h = w * p.h / p.w;
    out.push({ pic: p, x: M + col * (COL_W + GAP) + (COL_W - w) / 2, y, w, h });
    y += h + GAP;
  }
  return out;
}

/**
 * 정해진 자리대로 쪽을 만듦
 * specs: [[왼쪽 칸 그림들, 오른쪽 칸 그림들], ...]  (쪽마다)
 * 한 칸에 너무 많아 작아지면(55% 미만) 칸을 나눠 다음 칸·다음 쪽으로 넘김
 */
export function layout(specs) {
  const pages = [];
  for (const spec of specs) {
    const cols = [];
    for (const pics of spec) {
      if (!pics || !pics.length) continue;
      if (pics.length === 1 || stackScale(pics) >= 0.55) cols.push(pics);
      else pics.forEach((p) => cols.push([p]));
    }
    for (let i = 0; i < cols.length; i += 2) {
      pages.push([...placeColumn(cols[i], 0), ...(cols[i + 1] ? placeColumn(cols[i + 1], 1) : [])]);
    }
  }
  return pages;
}

/**
 * sections + 악보 불러오는 함수 → { base64, pages, missing }
 * getGospelScores(item) → [dataURL, ...] (없으면 [])
 */
export async function buildContiPdf({ date, sections, getGospelScores, onProgress = () => {} }) {
  const { jsPDF } = window.jspdf;
  const slots = new Map(), missing = [];       // "구역|쪽" → [왼쪽 칸, 오른쪽 칸]
  let n = 0, count = 0; const total = sections.reduce((a, s) => a + s.items.length, 0);
  const seenHymn = new Set();
  sections.forEach((sec, si) => {
    sec.items.forEach((it) => { const k = `${si}|${String((it.at || [0])[0]).padStart(4, "0")}`; if (!slots.has(k)) slots.set(k, [[], []]); });
  });
  for (const [si, sec] of sections.entries()) {
    for (const it of sec.items) {
      onProgress(++n, total, it);
      const [pg, col] = it.at || [0, 0];
      const slot = slots.get(`${si}|${String(pg).padStart(4, "0")}`)[col ? 1 : 0];
      try {
        if (it.kind === "hymn") {
          if (seenHymn.has(it.no)) continue;            // 같은 장은 한 번만
          seenHymn.add(it.no);
          const im = await loadImage(hymnScoreUrl(it.no));
          slot.push({ ...toJpeg(im), sec: sec.section, label: `${it.label} ${it.no}장` }); count++;
        } else {
          const list = await getGospelScores(it);
          if (!list.length) { missing.push(it.title); continue; }
          for (const src of list) { const im = await loadImage(src); slot.push({ ...toJpeg(im), sec: sec.section, label: `${it.label} ${it.title}` }); count++; }
        }
      } catch (e) { missing.push(it.kind === "hymn" ? `${it.no}장` : it.title); }
    }
  }
  if (!count) throw new Error("넣을 악보가 없습니다");
  const specs = [...slots.keys()].sort().map((k) => slots.get(k));
  const pages = layout(specs).filter((p) => p.length);
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4", compress: true });
  const d = date.replace(/-/g, ". ");
  pages.forEach((pg, i) => {
    if (i) pdf.addPage();
    const secs = [...new Set(pg.map((x) => x.pic.sec))].join(" · ");
    const labels = [...new Set(pg.map((x) => x.pic.label))];
    const head = textImage(`${d}  ${secs}  |  ${labels.join("  ·  ")}`);
    const k = Math.min(1, AREA_W / head.w);
    pdf.addImage(head.data, "JPEG", M, M - 1, head.w * k, HEAD * k);
    pg.forEach((x) => pdf.addImage(x.pic.data, "JPEG", x.x, x.y, x.w, x.h, undefined, "FAST"));
  });
  const base64 = pdf.output("datauristring").split(",")[1];
  return { base64, pages: pages.length, missing, count };
}
