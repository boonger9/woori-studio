#!/usr/bin/env python3
"""weekly.json → 비공개 악보 저장소에서 필요한 파일만 받기 위한 sparse-checkout 패턴 출력."""
import json
import sys

w = json.load(open(sys.argv[1], encoding="utf-8"))
lines = []
for n in dict.fromkeys(w.get("hymns", [])):
    lines.append(f"/hymns/{int(n)}장*")     # 54장_제목….ppt
    lines.append(f"/hymns/찬{int(n)}장*")   # 찬257장.ppt
for n in dict.fromkeys(w.get("responsive", [])):
    lines.append(f"/responsive/교독문{int(n)}.*")
print("\n".join(lines) if lines else "/README*")
