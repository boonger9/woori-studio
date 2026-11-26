#!/usr/bin/env python3
"""
주보 PDF 만들기 (GitHub Actions에서 실행).

  python3 tools/make_bulletin.py <weekly.json> <사이트 폴더(_site)>

1) weekly.json 의 bulletin 날짜를 보고 Apps Script에서 주보 내용(JSON)을 받아 옴 (getBulletinData)
2) 사이트 폴더를 잠깐 로컬 웹서버로 띄우고, 크롬으로 bulletin.html 을 그려 A4 가로 PDF로 인쇄
3) PDF를 Apps Script로 드라이브 '주보pdf_검토' 폴더에 올림 (uploadBulletin) → 목사님이 확인 후 홈페이지에 게시
4) 결과를 media/manifest.json 의 bulletin 칸에 적어 둠 (주간 준비 화면이 보고 링크를 보여 줌)
주보 내용은 저장소(git)에 남지 않고 드라이브에만 있습니다.
"""
import base64
import functools
import http.server
import json
import os
import sys
import threading
import urllib.request
from datetime import datetime, timezone


def gas(action, **payload):
    url, secret = os.environ.get("GAS_URL", ""), os.environ.get("STUDIO_SECRET", "")
    if not url or not secret:
        raise RuntimeError("GAS_URL·STUDIO_SECRET 비밀값이 없습니다")
    body = json.dumps({"action": action, "secret": secret, **payload}).encode()
    req = urllib.request.Request(url, data=body, headers={"Content-Type": "text/plain;charset=utf-8"})
    with urllib.request.urlopen(req, timeout=180) as r:
        data = json.loads(r.read().decode("utf-8"))
    if not data.get("ok"):
        raise RuntimeError(data.get("error", "알 수 없는 오류"))
    return data


def serve(root):
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=root)
    handler.log_message = lambda *a: None
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


def render_pdf(site, data, out_pdf):
    from playwright.sync_api import sync_playwright
    srv = serve(site)
    try:
        with sync_playwright() as p:
            try:
                browser = p.chromium.launch(channel="chrome")   # GitHub 러너에 깔려 있는 크롬
            except Exception:
                browser = p.chromium.launch()
            page = browser.new_page(viewport={"width": 1400, "height": 1000})
            page.goto(f"http://127.0.0.1:{srv.server_address[1]}/bulletin.html?blank", wait_until="networkidle")
            warns = page.evaluate("(d) => window.renderBulletin(d)", data)
            page.emulate_media(media="print")
            page.pdf(path=out_pdf, width="297mm", height="210mm", print_background=True, prefer_css_page_size=True)
            browser.close()
            return warns or []
    finally:
        srv.shutdown()


def main():
    weekly_path, site = sys.argv[1:3]
    with open(weekly_path, encoding="utf-8") as f:
        weekly = json.load(f)
    date = weekly.get("bulletin")
    today = datetime.now(timezone.utc).astimezone().strftime("%Y-%m-%d")
    if not date or date < today:
        print("이번에는 주보를 만들지 않습니다 (weekly.json에 이번 주 bulletin 날짜 없음)")
        return
    manifest_path = os.path.join(site, "media", "manifest.json")
    manifest = json.load(open(manifest_path, encoding="utf-8")) if os.path.exists(manifest_path) else {}
    info = {"date": date, "at": datetime.now(timezone.utc).isoformat(), "rev": weekly.get("bulletinRev")}
    try:
        data = gas("getBulletinData", date=date)["data"]
        out_pdf = os.path.join("/tmp", f"bulletin-{date}.pdf")
        warns = render_pdf(site, data, out_pdf)
        size = os.path.getsize(out_pdf)
        with open(out_pdf, "rb") as f:
            up = gas("uploadBulletin", date=date, isPraise=bool(data.get("isPraise")), base64=base64.b64encode(f.read()).decode())
        info.update(ok=True, name=up["name"], url=up["url"], warnings=warns)
        print(f"  [완료] 주보 {up['name']} ({size // 1024}KB) → 검토 폴더" + (f" · 경고: {warns}" if warns else ""))
        for w in warns:
            print(f"::warning::주보: {w}")
    except Exception as e:
        info.update(ok=False, error=str(e)[:300])
        print(f"::warning::주보 PDF 만들기 실패: {e}")
    manifest["bulletin"] = info
    os.makedirs(os.path.dirname(manifest_path), exist_ok=True)
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
