// 콘티: 이번 주일에 부를 모든 찬송·찬양의 악보를 모아 A4 가로 PDF로 (반주자·찬양팀용)
//  - 찬송가 악보: GitHub boonger9/church-hymns (새찬송가 1~645장, 자동)
//  - 복음송가 악보: 찬양/악보 폴더의 이미지 (곡 제목으로 이름, 여러 장이면 제목_1, 제목_2)
//  - 배치: 여백 1cm, 두 칸. 긴 악보는 쪽 높이를 꽉 채우고, 짧은 악보는 한 칸에 위아래로 둘
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

/* ---------- 이번 주 콘티에 들어갈 곡 (예배 순서대로) ---------- */
const hy = (label, o) => (o && o.no ? { label, kind: "hymn", no: +o.no } : null);
const gs = (label, g) => (g && g.id ? { label, kind: "gospel", title: cleanTitle(g.title), id: g.id } : null);

/** [{ section, items: [{label, kind:'hymn', no} | {label, kind:'gospel', title}] }] */
export function contiSections(w) {
  const out = [];
  const day = [];
  if (w.isPraise) {
    (w.gospel || []).forEach((g, i) => day.push(gs(`경배와 찬양 ${i + 1}`, g)));
    day.push(hy("봉헌", w.offertory));
    day.push(hy("기도송", { no: PRAYER_SONG }));
    day.push(gs("설교 후 찬양", w.gospelAfter));
  } else {
    (w.prelude || []).forEach((no, i) => day.push(hy(`묵도기원 ${i + 1}`, { no })));
    day.push(hy("찬송", w.first));
    day.push(hy("설교 전 찬송", w.hymnBefore));
    day.push(hy("기도송", { no: PRAYER_SONG }));
    day.push(hy("봉헌", w.offertory));
    if (w.isCommunion) day.push(hy("성찬", { no: COMMUNION_HYMN.no }));
    day.push(hy("폐회", { no: CLOSING_HYMN.no }));
  }
  const dayItems = day.filter(Boolean);
  if (dayItems.length) out.push({ section: w.isPraise ? "온 세대 찬양예배" : "주일 낮 예배", items: dayItems });
  const pm = w.afternoon || {};
  if (pm.on !== false) {
    const items = (pm.songs || []).map((g, i) => gs(`오후 찬양 ${i + 1}`, g)).filter(Boolean);
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

/**
 * 악보 그림들을 쪽에 배치: 두 칸, 긴 악보는 높이를 꽉 채우고 짧은 악보는 한 칸에 위아래로 쌓음
 * pics: [{ w, h, ... }] → pages: [[{ pic, x, y, w, h }]]
 */
export function layout(pics) {
  const pages = [];
  let page = [], col = 0, used = 0;
  const nextCol = () => { col++; used = 0; if (col > 1) { pages.push(page); page = []; col = 0; } };
  for (const p of pics) {
    let w = COL_W, h = COL_W * p.h / p.w;
    if (h > AREA_H) { h = AREA_H; w = AREA_H * p.w / p.h; }      // 긴 악보: 높이를 꽉
    if (used && used + GAP + h > AREA_H + 0.01) nextCol();
    const y = AREA_TOP + (used ? used + GAP : 0);
    const x = M + col * (COL_W + GAP) + (COL_W - w) / 2;
    page.push({ pic: p, x, y, w, h });
    used = (used ? used + GAP : 0) + h;
    if (used > AREA_H * 0.62) nextCol();                          // 칸이 반 넘게 차면 다음 칸
  }
  if (page.length) pages.push(page);
  return pages;
}

/**
 * sections + 악보 불러오는 함수 → { base64, pages, missing }
 * getGospelScores(item) → [dataURL, ...] (없으면 [])
 */
export async function buildContiPdf({ date, sections, getGospelScores, onProgress = () => {} }) {
  const { jsPDF } = window.jspdf;
  const pics = [], missing = [];
  let n = 0; const total = sections.reduce((a, s) => a + s.items.length, 0);
  const seenHymn = new Set();
  for (const sec of sections) {
    for (const it of sec.items) {
      onProgress(++n, total, it);
      try {
        if (it.kind === "hymn") {
          if (seenHymn.has(it.no)) continue;            // 같은 장은 한 번만
          seenHymn.add(it.no);
          const im = await loadImage(hymnScoreUrl(it.no));
          pics.push({ ...toJpeg(im), sec: sec.section, label: `${it.label} ${it.no}장` });
        } else {
          const list = await getGospelScores(it);
          if (!list.length) { missing.push(it.title); continue; }
          for (const src of list) { const im = await loadImage(src); pics.push({ ...toJpeg(im), sec: sec.section, label: `${it.label} ${it.title}` }); }
        }
      } catch (e) { missing.push(it.kind === "hymn" ? `${it.no}장` : it.title); }
    }
  }
  if (!pics.length) throw new Error("넣을 악보가 없습니다");
  const pages = layout(pics);
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4", compress: true });
  const d = date.replace(/-/g, ". ");
  pages.forEach((pg, i) => {
    if (i) pdf.addPage();
    const secs = [...new Set(pg.map((x) => x.pic.sec))].join(" · ");
    const head = textImage(`${d}  ${secs}  |  ${pg.map((x) => x.pic.label).join("  ·  ")}`);
    const k = Math.min(1, AREA_W / head.w);
    pdf.addImage(head.data, "JPEG", M, M - 1, head.w * k, HEAD * k);
    pg.forEach((x) => pdf.addImage(x.pic.data, "JPEG", x.x, x.y, x.w, x.h, undefined, "FAST"));
  });
  const base64 = pdf.output("datauristring").split(",")[1];
  return { base64, pages: pages.length, missing, count: pics.length };
}
