// 이번 주 악보 PPT 그림 목록(manifest) 불러오기
// 그림은 GitHub Actions가 배포할 때 비공개 저장소에서 그 주 곡만 변환해 media/ 폴더에 넣습니다.
const KEY = "woori-studio:media-manifest";
const EMPTY = { hymns: {}, responsive: {}, gospel: {}, hymnMeta: {}, lyrics: {}, missing: [] };

export async function loadManifest() {
  try {
    const res = await fetch("media/manifest.json", { cache: "no-cache" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const m = await res.json();
    try { localStorage.setItem(KEY, JSON.stringify(m)); } catch (e) {}
    return { ...EMPTY, ...m };
  } catch (e) {
    // 오프라인이면 마지막으로 받은 목록 사용
    try { const c = localStorage.getItem(KEY); if (c) return { ...EMPTY, ...JSON.parse(c) }; } catch (e2) {}
    return { ...EMPTY };
  }
}

const pad3 = (n) => String(parseInt(n, 10)).padStart(3, "0");

/** 찬송 장마다 [{verse, refrain}] (악보 변환 때 PPT의 빨간 절 표시·반복 그림으로 읽어 둔 것). 없으면 null */
export function hymnMeta(manifest, no) {
  const m = (manifest.hymnMeta || {})[String(parseInt(no, 10))];
  return Array.isArray(m) ? m.map((x) => ({ verse: parseInt(x, 10) || 1, refrain: /R/.test(x) })) : null;
}

/** 찬송 번호 → 그림 주소 목록. firstVerseOnly면 1절 전체(후렴 포함), 절 정보가 없으면 앞 2장 */
export function hymnPages(manifest, no, firstVerseOnly = false) {
  const n = manifest.hymns[String(parseInt(no, 10))] || 0;
  const meta = hymnMeta(manifest, no);
  const v1 = meta && meta.length === n ? meta.filter((m) => m.verse === 1).length : 0;
  const count = firstVerseOnly ? (v1 || Math.min(2, n)) : n;
  return Array.from({ length: count }, (_, i) => `media/h${pad3(no)}-${i + 1}.webp`);
}

export function responsivePages(manifest, no) {
  const n = manifest.responsive[String(parseInt(no, 10))] || 0;
  return Array.from({ length: n }, (_, i) => `media/r${pad3(no)}-${i + 1}.webp`);
}

/** 복음송가(드라이브 '찬양/악보ppt' 폴더 파일 ID) → 그림 주소 목록 */
export function gospelPages(manifest, id) {
  const n = (manifest.gospel || {})[id] || 0;
  return Array.from({ length: n }, (_, i) => `media/g-${id}-${i + 1}.webp`);
}

/** 복음송가 장마다 첫 줄 가사 (PPT에 글자로 들어 있을 때만) */
export const gospelLyrics = (manifest, id) => (manifest.lyrics || {})[id] || [];
