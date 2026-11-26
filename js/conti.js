// 콘티: 이번 주 부를 찬양(복음송가)의 악보 이미지를 찬양/악보 폴더에서 제목으로 찾아 짝지음
//  - PPT 이름: "하늘의 문을 여소서 이곳을 주목하소서 (임재)_Wide.PPT"
//  - 악보 이름: "하늘의문을여소서.jpg", 여러 장이면 "하늘의문을여소서_1.jpg", "…_2.jpg"
//  띄어쓰기·기호는 무시하고, 제목 앞부분 또는 괄호 속 부제목과 맞으면 같은 곡으로 봄

const EXT = /\.(pptx?|pdf|jpe?g|png|webp|gif)$/i;
export const cleanTitle = (s) => String(s || "").replace(EXT, "").replace(/_Wide.*$/i, "").replace(/\s*\(\d+\)\s*$/, "").trim();
const key = (s) => cleanTitle(s).replace(/[^가-힣a-zA-Z0-9]/g, "").toLowerCase();

/** 악보 이미지들을 곡(기본 이름)별로 묶음: "제목_2.jpg" → {base: 제목, page: 2} */
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

/** 이번 주 콘티에 넣을 묶음: 찬양예배(경배와 찬양 + 설교 후 찬양), 오후 예배 */
export function contiSets(w) {
  const sets = [];
  if (w.isPraise) {
    const songs = [...(w.gospel || [])];
    if (w.gospelAfter) songs.push({ ...w.gospelAfter, role: "설교 후" });
    if (songs.length) sets.push({ label: "온 세대 찬양예배", songs });
  }
  const pm = w.afternoon || {};
  if (pm.on !== false && (pm.songs || []).length) sets.push({ label: "오후 예배", songs: pm.songs });
  return sets;
}
