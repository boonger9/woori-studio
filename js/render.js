// 슬라이드 그리기: 1920×1080 무대를 그려서 담는 칸 크기에 맞게 확대/축소
import { CHURCH } from "./config.js";

const W = 1920, H = 1080;

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const nl = (s) => esc(s).replace(/\n/g, "<br>");

function slideHTML(s) {
  if (!s) return `<div class="sl sl-black"></div>`;
  switch (s.type) {
    case "black":
      return `<div class="sl sl-black"></div>`;
    case "logo":
      return `<div class="sl sl-logo"><img src="${CHURCH.logo}" alt="${esc(CHURCH.name)}"></div>`;
    case "cover":
      return `<div class="sl sl-cover">
        <img class="cover-logo" src="${CHURCH.logo}" alt="">
        <div class="cover-title fit" data-max="120" data-min="60">${esc(s.title)}</div>
        <div class="cover-sub">${esc(s.subtitle || "")}</div></div>`;
    case "title":
      return `<div class="sl sl-title">
        <div class="t-section">${esc(s.section || "")}</div>
        <div class="t-main fit" data-max="140" data-min="64">${esc(s.title)}</div>
        ${s.subtitle ? `<div class="t-sub">${esc(s.subtitle)}</div>` : ""}
        ${s.note ? `<div class="t-note">${esc(s.note)}</div>` : ""}</div>`;
    case "text":
      return `<div class="sl sl-text">
        <div class="x-head"><span>${esc(s.title || s.section || "")}</span><span class="x-page">${esc(s.page || "")}</span></div>
        <div class="x-body fit" data-max="76" data-min="40">${nl(s.body)}</div></div>`;
    case "hymn":
    case "responsive":
      // 악보 PPT·교독문 PPT 그림 (4:3)을 검은 바탕 가운데에
      return `<div class="sl sl-image"><img src="${esc(s.image)}" alt="${esc(slideLabel(s))}"></div>`;
    case "missing":
      return `<div class="sl sl-title">
        <div class="t-section">${esc(s.section || "")}</div>
        <div class="t-main fit" data-max="110" data-min="56">${esc(s.title || "")}</div>
        <div class="t-note">⚠ ${esc(s.message)}</div></div>`;
    case "image":
      return `<div class="sl sl-image"><img src="${esc(s.image)}" alt=""></div>`;
    default:
      return `<div class="sl sl-title"><div class="t-main">${esc(s.title || "")}</div></div>`;
  }
}

/** 글자가 칸을 넘치면 최소 크기까지 줄임. 최소 크기에서도 넘치면 data-overflow 표시 */
function fitAll(stage) {
  stage.querySelectorAll(".fit").forEach((el) => {
    const max = +el.dataset.max || 80, min = +el.dataset.min || 36;
    let size = max;
    el.style.fontSize = size + "px";
    const box = el.parentElement;
    const tooBig = () => el.scrollHeight > el.clientHeight + 2 || el.scrollWidth > el.clientWidth + 2 || box.scrollHeight > box.clientHeight + 2;
    while (size > min && tooBig()) { size -= 2; el.style.fontSize = size + "px"; }
    el.toggleAttribute("data-overflow", tooBig());
  });
}

/**
 * container 안에 슬라이드를 그림. 같은 container에 다시 부르면 내용만 바뀜.
 * 반환값: 다시 그리기 함수
 */
export function mountStage(container) {
  container.classList.add("stage-wrap");
  const stage = document.createElement("div");
  stage.className = "stage";
  stage.style.width = W + "px";
  stage.style.height = H + "px";
  container.innerHTML = "";
  container.appendChild(stage);

  const scale = () => {
    const r = container.getBoundingClientRect();
    const k = Math.min(r.width / W, r.height / H) || 0.1;
    stage.style.transform = `translate(-50%, -50%) scale(${k})`;
  };
  new ResizeObserver(scale).observe(container);
  scale();

  return function draw(slide) {
    stage.innerHTML = slideHTML(slide);
    // 웹폰트가 늦게 오면 크기가 바뀌므로 폰트 준비 후 한 번 더 맞춤
    fitAll(stage);
    if (document.fonts && document.fonts.status !== "loaded") document.fonts.ready.then(() => fitAll(stage));
  };
}

/** 다음에 올 이미지들을 미리 받아 둠 (송출 중 끊김 방지) */
const preloaded = new Set();
export function preloadSlides(slides) {
  slides.forEach((s) => {
    const url = s && (s.image || (s.type === "logo" || s.type === "cover" ? CHURCH.logo : null));
    if (url && !preloaded.has(url)) { preloaded.add(url); const im = new Image(); im.src = url; }
  });
}

export function slideLabel(s) {
  if (!s) return "";
  if (s.type === "hymn") return `${s.no ? s.no + "장 " : ""}${s.title || ""}${s.page ? " (" + s.page + ")" : ""}`;
  if (s.type === "responsive") return `교독문 ${s.no}번 ${s.title || ""}${s.page ? " (" + s.page + ")" : ""}`;
  if (s.type === "missing") return `⚠ ${s.message}`;
  if (s.type === "logo") return "교회 로고";
  if (s.type === "black") return "검은 화면";
  return `${s.title || s.section || ""}${s.page ? " (" + s.page + ")" : ""}`;
}
