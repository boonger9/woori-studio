// 이번 주 악보 PPT 그림 목록(manifest) 불러오기
// 그림은 GitHub Actions가 배포할 때 비공개 저장소에서 그 주 곡만 변환해 media/ 폴더에 넣습니다.
const KEY = "woori-studio:media-manifest";
const EMPTY = { hymns: {}, responsive: {}, gospel: {}, missing: [] };

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

/** 찬송 번호 → 그림 주소 목록. firstVerseOnly면 앞 2장(기존 PPT 엔진과 같은 규칙) */
export function hymnPages(manifest, no, firstVerseOnly = false) {
  const n = manifest.hymns[String(parseInt(no, 10))] || 0;
  const count = firstVerseOnly ? Math.min(2, n) : n;
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
