#!/bin/bash
# 예배 스튜디오 · 주보 인쇄 대기 (크롬 자동 인쇄 모드)
# 처음 한 번: 터미널에서  chmod +x ~/Desktop/woori-print-station.command  (또는 우클릭 → 열기)
open -na "Google Chrome" --args --kiosk-printing --user-data-dir="$HOME/Library/Application Support/WooriPrintStation" --no-first-run "https://boonger9.github.io/woori-studio/print-station.html"
