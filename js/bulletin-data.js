// 주보 데이터: 주간 준비 화면 값 + 주보 고정 내용 → bulletin.html 이 그리는 모양으로
import { CLOSING_HYMN, COMMUNION_HYMN } from "./fixed.js";

/** 주보 색 (진한 색 하나만 정하면 연한 카드색은 자동) */
export const THEMES = [
  { id: "blue", name: "기본 · 파랑 (로고 색)", color: "#217fac" },
  { id: "purple", name: "찬양예배 · 보라", color: "#6c4fa3" },
  { id: "advent", name: "대림절·사순절 · 진보라", color: "#5b2a86" },
  { id: "christmas", name: "성탄절 · 초록", color: "#2e7d4f" },
  { id: "christmas-red", name: "성탄절 · 빨강", color: "#b03a32" },
  { id: "easter", name: "부활절 · 금색", color: "#a8822a" },
  { id: "pentecost", name: "성령강림절 · 진홍", color: "#b23a48" },
  { id: "harvest", name: "맥추·추수감사절 · 주황", color: "#c0682a" },
  { id: "newyear", name: "신년 · 남색", color: "#2b4c8c" },
  { id: "teal", name: "예전 주보 · 청록", color: "#4f9f92" },
];
export const defaultTheme = (isPraise) => (isPraise ? "#6c4fa3" : "#217fac");

/** 주보 고정 내용 기본값 (2026.11 주보에서 옮김). 주간 준비 화면의 '주보 고정 내용'에서 고칠 수 있음 */
export const FIXED_DEFAULT = {
  intro: "환영합니다.(Welcome) ‘대구우리교회’는 대한예수교 장로회 (합신)경북노회 소속으로 2002년 설립된 교회로서, 같은 교단 교회로는 대표적으로 남서울은혜교회(홍정길 목사), 남포교회(박영선 목사)가 있습니다. 함께 예배하고(Worship) 함께 말씀을 나누고(Word) 함께 섬기며(work), 함께 복음을 전하는 주님의 제자가(Witness) 되는 교회입니다.",
  meetings: [
    "주일낮예배 | 주일 오전 11:00", "주일오후예배 | 주일 오후 01:30", "교회학교 | 주일 오전 10:20",
    "청년부 모임 | 주일 오후 12:30 본당", "수요기도회 | 수요일 저녁 7:30", "토요기도회 | 토요일 저녁 7:00",
    "새벽기도회 | 월요일~금요일 새벽 5:30", "SF 영어도서관 | 화요일 2:00 수요일/1:20", "우리마을 작은 도서관 | 토 오전11:00~12:30",
  ].join("\n"),
  weekday: "새벽 기도회 : 오전 5:30\n수요 기도회 : 저녁 7:30\n토요 기도회 : 저녁 7:00",
  workers: [
    "영어도서관: 이상후 김태경 교사", "주일학교: 김정숙 김정환 정진영", "재정위원: 김성진 김정숙 정진영",
    "애찬위원: 정진영  교육위원: 김정숙", "전도위원: 김태경  차량: 김성진", "반주: 김예지",
  ].join("\n"),
  visionTitle: "제자 양육",
  vision: "1. 예수님을 바로 알고 믿도록 합니다.\n2. 말씀으로 성도 간에 영적 교제를 나눕니다.\n3. 주님의 명령에 응답하여 제자로 순종합니다.",
  offering: "1조: 김태경, 김정환 / 2조: 김정숙, 정진영 / 3조: 방계매, 손명애 / 4조: 손경아, 김희애",
  prayerOrder: "김성진 사공영광 김태경 이미자 정진영 김정숙 방계매 김정환",
  footer: [
    "담임목사: 이상후 / 원로목사: 김용원", "주소: 대구 동구 메디밸리로 5-2 (3층)", "Tel: 053.964-3230",
    "유튜브 예배 안내: 대구우리교회_대한예수교장로회합신", "계좌: (예금주: 대구우리교회) 대구은행 504-10-228501-4",
  ].join("\n"),
};

/** 주보 호수·하이델베르크 주일 기본값: 2026-11-15 = 제1290호 · 제14주일 기준으로 한 주에 하나씩 */
const BASE = { date: "2026-11-15", issue: 1290, heidelberg: 14 };
const weeksFrom = (date) => Math.round((Date.parse(date) - Date.parse(BASE.date)) / (7 * 864e5));
export const defaultIssueNo = (date) => BASE.issue + weeksFrom(date);
export const defaultHeidelberg = (date) => ((BASE.heidelberg - 1 + weeksFrom(date)) % 52 + 52) % 52 + 1;

const dateText = (date) => { const [y, m, d] = date.split("-"); return `${y}. ${m}. ${d}`; };
const hy = (o) => (o && o.no ? `${o.no}장` : "");

/** w: 주간 준비 화면의 collect() 결과 */
export function buildBulletinData(w, fixed) {
  const f = { ...FIXED_DEFAULT, ...(fixed || {}) };
  const order = [];
  const R = (star, label, value, note) => order.push({ star, label, value: value || "", ...(note ? { note } : {}) });
  if (w.isPraise) {
    R(false, "경배와찬양", "다같이");
    R(true, "신앙고백", "사도신경");
    R(false, "광고", "사회자");
    R(false, "봉헌", hy(w.offertory));
    R(false, "대표기도", w.prayer);
    R(false, "성경봉독", w.passage);
    R(false, "설교", w.sermonTitle);
    R(false, "설교후찬양", w.gospelAfter ? w.gospelAfter.title : "");
    R(true, "축도", w.preacher);
  } else {
    R(true, "묵도기원", `다같이 (${(w.prelude || []).join(", ")})`);
    if (w.first) R(true, "찬송", `${w.first.no}장`, w.first.firstVerseOnly ? "1절만" : "");
    if (w.responsive) R(true, "성시교독", `${w.responsive.no}. ${w.responsive.title || ""}`);
    R(true, "신앙고백", "사도신경");
    R(false, "찬송", hy(w.hymnBefore));
    R(false, "대표기도", w.prayer);
    R(false, "성경", w.passage);
    R(false, "말씀", w.sermonTitle);
    R(false, "봉헌", hy(w.offertory));
    if (w.isCommunion) R(false, "성찬", `${COMMUNION_HYMN.no}장`, "1절만");
    R(false, "교회소식", "사회자");
    R(true, "폐회찬송", `${CLOSING_HYMN.no}장`);
    R(true, "축도", w.preacher);
  }
  return {
    date: w.date, isPraise: !!w.isPraise,
    theme: w.bulletinTheme || defaultTheme(w.isPraise),
    issueNo: w.issueNo || defaultIssueNo(w.date),
    dateText: dateText(w.date),
    serviceName: w.isPraise ? "온 세대 찬양예배" : "주일 낮 예배",
    preacher: w.preacher,
    order,
    afternoon: `* 찬양\n* 말씀\n하이델베르크 요리문답 제${w.heidelberg || defaultHeidelberg(w.date)}주일\n* 주기도문`,
    notices: w.notices || "",
    sermonTitle: w.sermonTitle, passage: w.passage,
    summary: w.summaryFull || "",
    fixed: f,
  };
}
