# 예배 스튜디오 (대구우리교회)

구글 문서 설교 원고에서 주보 PDF와 예배 슬라이드를 만들고, 예배당 화면을 PC 발표자 모드나 폰 리모컨으로 넘기는 웹앱입니다.
**모든 구성이 무료(0원)**입니다: GitHub Pages + Firebase Spark + Google Apps Script + Gemini API 무료 등급.

## 화면

| 주소 | 용도 | 로그인 |
|---|---|---|
| `index.html` | 홈 | 선택 |
| `presenter.html` | 발표자 모드 (방송 담당자, 예배당 PC) | 필요 |
| `remote.html` | 폰 리모컨 (담당자 부재 시) | 필요 |
| `display.html` | 송출 화면 (프로젝터) | 불필요 |

## 1단계에서 되는 것
- 예배 슬라이드 송출, 발표자 모드(현재·다음·목록·타이머), 폰 리모컨(다음·이전·순서 바로가기·검은 화면·로고)
- 같은 PC의 발표자 창 ↔ 송출 창은 BroadcastChannel로 연결되어 **인터넷이 끊겨도 동작**
- 다른 기기(폰) ↔ 송출 PC는 Firebase Realtime Database로 실시간 동기화
- 긴 본문(가사·성경·광고)은 화면 분량만큼 **자동으로 여러 장으로 나뉨 → 장수 제한 없음**
- 키보드/무선 클리커: → PageDown Space Enter(다음), ← PageUp Backspace(이전), B 또는 .(검은 화면), L(로고), Home/End
- 예배 도중 발표자 화면을 새로 고쳐도 송출 위치가 유지됨

## 처음 설정 (한 번만)
1. **Firebase 보안 규칙 게시**
   - Firestore Database → 규칙 → `firestore.rules` 내용 붙여넣기 → 게시
   - Realtime Database → 규칙 → `database.rules.json` 내용 붙여넣기 → 게시
2. **로그인 허용 주소 추가**: Authentication → 설정 → 승인된 도메인 → `boonger9.github.io` 추가
3. **GitHub Pages 켜기**: 저장소 Settings → Pages → Source: Deploy from a branch → `main` / `(root)` → Save
4. 접속: `https://boonger9.github.io/woori-studio/`

## 계정 추가 (방송 담당자 등)
아래 세 곳에 같은 이메일을 넣어야 합니다.
- `js/config.js` 의 `ALLOWED_EMAILS`
- `firestore.rules` 의 목록
- `database.rules.json` 의 `live/state/.write` (`|| auth.token.email == '추가@gmail.com'`)

## 다음 단계
- 2단계: 주간 준비 화면 (원고 확정 → Gemini 무료 API로 요약·찬송·교독문 추천 → 묵도기원·첫 찬송·기도자·광고 입력)
- 3단계: 주보 템플릿 → PDF → 드라이브 `주보pdf` 폴더 업로드 (Apps Script), 말씀 페이지용 `sermons.json`
- 4단계: 카톡주보·우리노트 되살리기
