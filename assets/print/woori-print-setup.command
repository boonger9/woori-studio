#!/bin/bash
# 예배 스튜디오 · 주보 인쇄 대기 설정용 (인쇄 창이 보이는 모드, 처음 한 번)
# 처음 한 번: 터미널에서  chmod +x ~/Desktop/woori-print-setup.command  (또는 우클릭 → 열기)
open -na "Google Chrome" --args --user-data-dir="$HOME/Library/Application Support/WooriPrintStation" --no-first-run "https://boonger9.github.io/woori-studio/print-station.html"
