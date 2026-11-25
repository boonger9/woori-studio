#!/usr/bin/env python3
"""
이번 주 찬송·교독문 악보 PPT만 그림(webp)으로 바꿔 웹사이트 폴더에 넣습니다.

사용법:
  python3 tools/build_media.py <weekly.json> <악보PPT 저장소 폴더> <출력 폴더>

- <악보PPT 저장소 폴더>/hymns/54장_….ppt, /responsive/교독문115.pptx 형식을 찾습니다.
- 출력: <출력>/media/h054-1.webp …, r115-1.webp …, manifest.json
- 원본 PPT 전체는 비공개 저장소에만 남고, 여기서 만든 그림은 git 기록에 남지 않습니다
  (GitHub Actions가 배포할 때만 만들어 올림).
"""
import base64
import glob
import json
import os
import re
import subprocess
import sys
import tempfile
import urllib.request
from datetime import datetime, timezone

from PIL import Image

LONG_SIDE = 1440   # 4:3 악보는 1440×1080 → 1080p 프로젝터에 꽉 참
QUALITY = 80


def find_file(folder, number):
    """번호가 맞는 파일을 찾음 (pptx 우선).
    파일 이름 형식: '54장_제목_….ppt', '찬257장.ppt', '찬257장_제목….ppt', '교독문115.pptx'"""
    if not os.path.isdir(folder):
        return None
    hits = []
    for fn in os.listdir(folder):
        if not fn.lower().endswith((".ppt", ".pptx")):
            continue
        m = re.match(r"^(?:교독문|찬)?\s*(\d+)", fn)
        if m and int(m.group(1)) == int(number):
            hits.append(os.path.join(folder, fn))
    hits.sort(key=lambda p: (not p.lower().endswith(".pptx"), p))
    return hits[0] if hits else None


def to_pdf(ppt_path, work):
    """LibreOffice로 PDF 변환. 실패하면 한 번 더 시도하고, 원인을 남김."""
    last = ""
    for attempt in (1, 2):
        r = subprocess.run(["soffice", "--headless", "--convert-to", "pdf", "--outdir", work, ppt_path],
                           capture_output=True, text=True, timeout=300)
        pdfs = glob.glob(os.path.join(work, "*.pdf"))
        if pdfs and os.path.getsize(pdfs[0]) > 0:
            return pdfs[0]
        last = f"시도 {attempt}: code={r.returncode} {r.stdout.strip()[-300:]} {r.stderr.strip()[-300:]}"
    raise RuntimeError("PDF 변환 실패 — " + last)


def ppt_to_webps(ppt_path, out_dir, prefix):
    """PPT·PPTX·PDF·그림 → 페이지별 webp. 만든 장수를 돌려줌."""
    work = tempfile.mkdtemp(prefix="media-")
    ext = os.path.splitext(ppt_path)[1].lower()
    if ext in (".jpg", ".jpeg", ".png", ".webp", ".gif"):
        im = Image.open(ppt_path).convert("RGB")
        im.thumbnail((LONG_SIDE, LONG_SIDE))
        im.save(os.path.join(out_dir, f"{prefix}-1.webp"), "WEBP", quality=QUALITY)
        return 1
    pdf = ppt_path if ext == ".pdf" else to_pdf(ppt_path, work)
    pdfs = [pdf]
    subprocess.run(["pdftoppm", "-png", "-scale-to", str(LONG_SIDE), pdfs[0], os.path.join(work, "p")],
                   check=True, capture_output=True, timeout=240)
    pngs = sorted(glob.glob(os.path.join(work, "p-*.png")),
                  key=lambda n: int(re.search(r"-(\d+)\.png$", n).group(1)))
    if not pngs:
        raise RuntimeError("그림 변환 결과 없음")
    for i, png in enumerate(pngs, 1):
        Image.open(png).convert("RGB").save(os.path.join(out_dir, f"{prefix}-{i}.webp"), "WEBP", quality=QUALITY)
    return len(pngs)


GOSPEL_EXT = {
    "application/vnd.ms-powerpoint": ".ppt",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": ".pptx",
    "application/pdf": ".pdf", "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp",
}


def fetch_gospel(file_id):
    """Apps Script(목사님 계정으로 실행)를 통해 드라이브 '찬양/악보ppt' 폴더의 파일을 받아 옴."""
    url, secret = os.environ.get("GAS_URL", ""), os.environ.get("STUDIO_SECRET", "")
    if not url or not secret:
        raise RuntimeError("GAS_URL·STUDIO_SECRET 비밀값이 없어 드라이브에서 받을 수 없습니다")
    body = json.dumps({"action": "getGospelFile", "secret": secret, "fileId": file_id}).encode()
    req = urllib.request.Request(url, data=body, headers={"Content-Type": "text/plain;charset=utf-8"})
    with urllib.request.urlopen(req, timeout=180) as r:
        data = json.loads(r.read().decode("utf-8"))
    if not data.get("ok"):
        raise RuntimeError(data.get("error", "알 수 없는 오류"))
    return data


def build_gospel(weekly, media, manifest):
    """weekly.json의 gospel(복음송가)·art(설교그림): [{id, title}] → media/g-<id>-<쪽>.webp"""
    items = [("복음송가", g) for g in weekly.get("gospel", [])] + [("설교그림", g) for g in weekly.get("art", [])]
    for kind, g in items:
        fid, title = str(g.get("id", "")), g.get("title", "")
        label = f"{kind} {title or fid}"
        if not re.fullmatch(r"[-_A-Za-z0-9]{10,}", fid):
            manifest["missing"].append(label)
            print(f"::warning::{label}: 드라이브 파일 ID 형식이 아닙니다")
            continue
        try:
            data = fetch_gospel(fid)
            ext = os.path.splitext(data.get("name", ""))[1].lower() or GOSPEL_EXT.get(data.get("mimeType"), "")
            if not ext:
                raise RuntimeError(f"지원하지 않는 파일 형식: {data.get('mimeType')}")
            work = tempfile.mkdtemp(prefix="gospel-")
            src = os.path.join(work, "song" + ext)
            with open(src, "wb") as f:
                f.write(base64.b64decode(data["base64"]))
            pages = ppt_to_webps(src, media, f"g-{fid}")
            manifest["gospel"][fid] = pages
            print(f"  [완료] {label} → {pages}장")
        except Exception as e:
            manifest["missing"].append(label)
            print(f"::warning::{label} 실패: {e}")


def main():
    if len(sys.argv) != 4:
        print(__doc__)
        sys.exit(2)
    weekly_path, lib, out = sys.argv[1:]
    with open(weekly_path, encoding="utf-8") as f:
        weekly = json.load(f)
    media = os.path.join(out, "media")
    os.makedirs(media, exist_ok=True)

    manifest = {"builtAt": datetime.now(timezone.utc).isoformat(), "dates": weekly.get("dates", []),
                "hymns": {}, "responsive": {}, "gospel": {}, "missing": []}
    jobs = [("hymns", "h", n) for n in dict.fromkeys(weekly.get("hymns", []))] + \
           [("responsive", "r", n) for n in dict.fromkeys(weekly.get("responsive", []))]
    for kind, letter, num in jobs:
        src = find_file(os.path.join(lib, kind), num)
        label = f"{'찬송' if kind == 'hymns' else '교독문'} {num}"
        if not src:
            print(f"::warning::{label} 파일을 찾지 못했습니다 ({os.path.join(lib, kind)})")
            manifest["missing"].append(label)
            continue
        try:
            pages = ppt_to_webps(src, media, f"{letter}{int(num):03d}")
            manifest[kind][str(int(num))] = pages
            print(f"  [완료] {label} → {pages}장")
        except Exception as e:  # 한 곡이 실패해도 나머지는 계속
            print(f"::warning::{label} 변환 실패: {e}")
            manifest["missing"].append(label)

    build_gospel(weekly, media, manifest)

    with open(os.path.join(media, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=1)
    print(f"찬송 {len(manifest['hymns'])}곡, 교독문 {len(manifest['responsive'])}편, "
          f"복음송가 {len(manifest['gospel'])}곡, 누락 {len(manifest['missing'])}")


if __name__ == "__main__":
    main()
