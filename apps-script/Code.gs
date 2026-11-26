/**
 * 예배 스튜디오 · Google Apps Script 백엔드 (0원)
 * 목사님 구글 계정으로 실행되어 드라이브를 대신 읽고 씁니다.
 *
 * 설치: script.google.com → 새 프로젝트 → 이 내용 붙여넣기
 *   → 서비스 +: Drive API 추가
 *   → 프로젝트 설정 → 스크립트 속성 3개:
 *        STUDIO_SECRET  (20자 이상 임의 문자열, 예배 스튜디오 설정과 같은 값)
 *        GEMINI_API_KEY (AI Studio 무료 키, 결제 연결 금지)
 *        GITHUB_TOKEN   (woori-studio 저장소 Contents 읽기·쓰기 권한 토큰)
 *   → 배포 → 새 배포 → 웹 앱 (실행: 나 / 액세스: 모든 사용자) → URL 복사
 * GitHub 저장소 Secret에도 GAS_URL(웹 앱 주소)과 STUDIO_SECRET(같은 값)을 넣어야
 * 복음송가 악보를 자동으로 받아 올 수 있습니다.
 */
const CONFIG = {
  BULLETIN_FOLDER_ID: '14au-qW-7EPv5J0dn9UgYPWSaMuG7Ocrm', // 주보pdf (홈페이지가 읽는 공개 폴더)
  BULLETIN_PARENT_ID: '1wq-kWBV9ICjy8fpJdPqkHN_4aBzT_x6A',  // 주보pdf의 상위 폴더
  REVIEW_FOLDER_NAME: '주보pdf_검토',                        // 공개 폴더 '밖'에 둠
  MANUSCRIPT_ROOT_ID: '1aSimibEXebDadvWXjUZBaDnvsTofsu3Z',   // 생명의삶 (성경별 하위 폴더 포함)
  GOSPEL_FOLDER_ID: '1d3GKEymQU31452HXwA4QdVILwCMz9Z9m',     // 찬양/악보ppt (복음송가 송출용)
  SCORE_FOLDER_ID: '11Rf8OKv9zp7vxSH_f9HvjmK17P1g0I4A',      // 찬양/악보 (악보 이미지, 곡 제목으로 이름)
  CONTI_FOLDER_ID: '10Nfp-xyUM6xZCXtYHZaUYiyb9U8CJM76',      // 찬양/콘티 (주일마다 만드는 악보 모음 문서)
  SERMON_ART_FOLDER_ID: '1viIZBiPjNNnYiaqiPQ6sDbh3XvdE-GK0', // 설교/설교그림 (설교 중 띄울 그림·PPT, 날짜별 하위 폴더)
  SITE_DATA_FOLDER_NAME: '홈페이지데이터',
  MAX_PDF_BYTES: 20 * 1024 * 1024,
  MAX_GOSPEL_BYTES: 35 * 1024 * 1024,
  SEARCH_DAYS: 21
};

function doPost(e) {
  try {
    const req = JSON.parse(e.postData.contents);
    const secret = PropertiesService.getScriptProperties().getProperty('STUDIO_SECRET');
    if (!secret || req.secret !== secret) return json_({ ok: false, error: '인증 실패' });
    const handlers = {
      findManuscripts: findManuscripts_, getManuscript: getManuscript_,
      uploadBulletin: uploadBulletin_, publishBulletin: publishBulletin_, publishSermon: publishSermon_,
      listGospel: listGospel_, getGospelFile: getGospelFile_, getMediaFile: getGospelFile_,
      listSermonArt: listSermonArt_, saveBulletinData: saveBulletinData_, getBulletinData: getBulletinData_,
      createSchoolDoc: createSchoolDoc_, listScores: listScores_, makeConti: makeConti_,
      aiGenerate: aiGenerate_, updateWeekly: updateWeekly_, ping: () => ({ ok: true, now: new Date().toISOString() })
    };
    const h = handlers[req.action];
    if (!h) return json_({ ok: false, error: '알 수 없는 요청: ' + req.action });
    return json_(h(req));
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

/* ---------- AI (Gemini 무료 등급) ---------- */
// 예배 스튜디오가 지침(system)과 원고(user)를 보내면 Gemini 결과(JSON 글자)를 돌려줍니다.
// 무료로 쓸 수 있는 Flash 모델을 스스로 찾아 쓰고, 모델이 종료되면 다음 모델로 넘어갑니다.

function aiGenerate_({ system, user, format }) {
  const props = PropertiesService.getScriptProperties();
  const key = props.getProperty('GEMINI_API_KEY');
  if (!key) throw new Error('스크립트 속성에 GEMINI_API_KEY가 없습니다');
  if (!user || user.length < 200) throw new Error('원고가 너무 짧습니다');
  const tried = [];
  const models = candidateModels_(key);
  for (const model of models) {
    const res = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/' + model + ':generateContent', {
      method: 'post', contentType: 'application/json', headers: { 'x-goog-api-key': key }, muteHttpExceptions: true,
      payload: JSON.stringify({
        systemInstruction: { parts: [{ text: system || '' }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: format === 'text' ? { temperature: 0.5 } : { responseMimeType: 'application/json', temperature: 0.4 }
      })
    });
    const code = res.getResponseCode();
    if (code === 200) {
      const cand = (JSON.parse(res.getContentText()).candidates || [])[0];
      const text = cand && cand.content && cand.content.parts ? cand.content.parts.map(p => p.text || '').join('') : '';
      if (!text) throw new Error('Gemini가 빈 답을 보냈습니다 (안전 필터 등)');
      props.setProperty('GEMINI_MODEL_OK', model);
      return { ok: true, model: model, text: text };
    }
    tried.push(model + ':' + code);
    if (code === 429) throw new Error('오늘 무료 사용량을 다 썼거나 잠시 너무 많이 불렀습니다. 잠시 후 다시 시도하거나 [프롬프트 복사]로 진행하세요');
    if (code === 400 || code === 401 || code === 403) {
      const msg = res.getContentText().slice(0, 200);
      if (/API key|PERMISSION|billing/i.test(msg)) throw new Error('Gemini 키 문제: ' + msg);
    }
    // 404 등은 모델이 없어진 것 → 다음 모델 시도
  }
  props.deleteProperty('GEMINI_MODEL_OK');
  throw new Error('쓸 수 있는 Gemini 모델을 찾지 못했습니다: ' + tried.join(', '));
}

/** 정식 버전 Flash 모델을 최신순으로 (마지막 성공 모델을 맨 앞에) */
function candidateModels_(key) {
  const ok = PropertiesService.getScriptProperties().getProperty('GEMINI_MODEL_OK');
  let list = [];
  try {
    const res = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200',
      { headers: { 'x-goog-api-key': key }, muteHttpExceptions: true });
    if (res.getResponseCode() === 200) {
      list = (JSON.parse(res.getContentText()).models || [])
        .filter(m => (m.supportedGenerationMethods || []).indexOf('generateContent') >= 0)
        .map(m => m.name)
        .filter(n => /flash/i.test(n) && !/(preview|exp|image|tts|live|audio|thinking|embedding|8b)/i.test(n));
      list.sort((a, b) => verOf_(b) - verOf_(a) || (/lite/.test(a) ? 1 : 0) - (/lite/.test(b) ? 1 : 0));
    }
  } catch (e) { /* 목록을 못 받으면 아래 기본값 사용 */ }
  if (ok) list = [ok].concat(list.filter(n => n !== ok));
  if (!list.length) list = ['models/gemini-flash-latest'];
  return list.slice(0, 6);
}
function verOf_(name) { const m = name.match(/(\d+(?:\.\d+)?)/); return m ? parseFloat(m[1]) : 0; }

/* ---------- 이번 주 악보 목록(weekly.json) 갱신 → GitHub가 자동으로 악보 그림을 만들어 배포 ---------- */

function updateWeekly_({ weekly }) {
  const token = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');
  if (!token) throw new Error('스크립트 속성에 GITHUB_TOKEN이 없습니다');
  if (!weekly || !Array.isArray(weekly.hymns)) throw new Error('weekly 형식이 잘못되었습니다');
  const clean = {
    note: '주간 준비 화면이 자동으로 고친 파일입니다. 여기 있는 곡만 그림으로 바꿔 웹사이트에 올립니다.',
    dates: (weekly.dates || []).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)),
    hymns: weekly.hymns.map(Number).filter(n => n >= 1 && n <= 645),
    responsive: (weekly.responsive || []).map(Number).filter(n => n >= 1 && n <= 137),
    gospel: (weekly.gospel || []).filter(g => g && /^[-_A-Za-z0-9]{10,}$/.test(g.id)).map(g => ({ id: g.id, title: String(g.title || '').slice(0, 80) })),
    art: (weekly.art || []).filter(g => g && /^[-_A-Za-z0-9]{10,}$/.test(g.id)).map(g => ({ id: g.id, title: String(g.title || '').slice(0, 80) })),
    bulletin: /^\d{4}-\d{2}-\d{2}$/.test(weekly.bulletin || '') ? weekly.bulletin : undefined,
    bulletinRev: Number(weekly.bulletinRev) || undefined
  };
  const api = 'https://api.github.com/repos/boonger9/woori-studio/contents/weekly.json';
  const headers = { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json' };
  const cur = UrlFetchApp.fetch(api, { headers: headers, muteHttpExceptions: true });
  const sha = cur.getResponseCode() === 200 ? JSON.parse(cur.getContentText()).sha : undefined;
  const content = Utilities.base64Encode(Utilities.newBlob(JSON.stringify(clean, null, 2) + '\n').getBytes());
  const res = UrlFetchApp.fetch(api, {
    method: 'put', headers: headers, contentType: 'application/json', muteHttpExceptions: true,
    payload: JSON.stringify({ message: '이번 주 악보 목록 갱신 (' + clean.dates.join(', ') + ')', content: content, sha: sha })
  });
  const code = res.getResponseCode();
  if (code !== 200 && code !== 201) throw new Error('GitHub 저장 실패 ' + code + ': ' + res.getContentText().slice(0, 200));
  return { ok: true, weekly: clean };
}

/* ---------- 복음송가 (찬양/악보ppt 폴더) ---------- */

/** 폴더 안 복음송가 파일 목록 (하위 폴더 포함). 주간 준비 화면에서 곡을 고를 때 사용 */
function listGospel_() {
  const out = [];
  walk_(DriveApp.getFolderById(CONFIG.GOSPEL_FOLDER_ID), '', (f, path) => {
    const t = f.getMimeType();
    if (/presentation|powerpoint|pdf|image\//.test(t)) {
      out.push({ id: f.getId(), title: f.getName().replace(/\.(pptx?|pdf|jpe?g|png|webp)$/i, '').replace(/_Wide.*$/i, '').replace(/\s*\(\d+\)\s*$/, '').trim(),
                 name: f.getName(), folder: path, mimeType: t, updated: f.getLastUpdated().toISOString() });
    }
  });
  out.sort((a, b) => a.title.localeCompare(b.title, 'ko'));
  return { ok: true, songs: out };
}

/** 설교그림 폴더의 'YYYY-MM-DD'(또는 'YYMMDD') 하위 폴더 파일 목록 (이름순). 설교 중 띄울 그림·PPT */
function listSermonArt_({ date }) {
  const folder = sermonArtFolder_(date);
  const out = [];
  const files = folder.getFiles();
  while (files.hasNext()) {
    const f = files.next(), t = f.getMimeType();
    if (/presentation|powerpoint|pdf|image\//.test(t))
      out.push({ id: f.getId(), title: f.getName().replace(/\.(pptx?|pdf|jpe?g|png|webp|gif)$/i, ''), name: f.getName(), mimeType: t });
  }
  out.sort((a, b) => a.name.localeCompare(b.name, 'ko', { numeric: true }));
  return { ok: true, folderUrl: folder.getUrl(), files: out };
}

/** 설교그림/날짜 폴더 (없으면 만듦) */
function sermonArtFolder_(date) {
  const root = DriveApp.getFolderById(CONFIG.SERMON_ART_FOLDER_ID);
  for (const n of [date, toYymmdd_(date)]) { const it = root.getFoldersByName(n); if (it.hasNext()) return it.next(); }
  return root.createFolder(date);
}

/** 그림으로 바꿀 파일 하나를 base64로 돌려줌 (GitHub Actions가 사용). 찬양/악보ppt·설교그림 폴더 안 파일만 허용 */
function getGospelFile_({ fileId }) {
  const f = DriveApp.getFileById(fileId);
  if (!isInside_(f, CONFIG.GOSPEL_FOLDER_ID) && !isInside_(f, CONFIG.SERMON_ART_FOLDER_ID))
    throw new Error('찬양/악보ppt 또는 설교그림 폴더 밖의 파일은 받을 수 없습니다');
  let blob = f.getBlob(), name = f.getName();
  if (f.getMimeType() === MimeType.GOOGLE_SLIDES) { blob = f.getAs(MimeType.PDF); name = name + '.pdf'; }
  const bytes = blob.getBytes();
  if (bytes.length > CONFIG.MAX_GOSPEL_BYTES) throw new Error('파일이 35MB를 넘습니다: ' + name);
  return { ok: true, name: name, mimeType: blob.getContentType(), base64: Utilities.base64Encode(bytes) };
}

function isInside_(file, folderId) {
  const queue = [];
  const ps = file.getParents(); while (ps.hasNext()) queue.push(ps.next());
  for (let depth = 0; depth < 6 && queue.length; depth++) {
    const next = [];
    for (const p of queue) {
      if (p.getId() === folderId) return true;
      const pp = p.getParents(); while (pp.hasNext()) next.push(pp.next());
    }
    queue.splice(0, queue.length, ...next);
  }
  return false;
}

/* ---------- 원고 ---------- */

function parseYymmdd_(title) {
  const m = String(title).match(/^(\d{2})[.\-]?(\d{2})[.\-]?(\d{2})(?!\d)/);
  return m ? m[1] + m[2] + m[3] : null;
}

function findManuscripts_({ date }) {
  const target = toYymmdd_(date);
  const since = new Date(Date.now() - CONFIG.SEARCH_DAYS * 86400000);
  const all = [];
  walk_(DriveApp.getFolderById(CONFIG.MANUSCRIPT_ROOT_ID), '', (f, path) => {
    if (f.getMimeType() !== MimeType.GOOGLE_DOCS || f.getLastUpdated() < since) return;
    all.push({ id: f.getId(), title: f.getName(), folder: path,
               updated: f.getLastUpdated().toISOString(), dateMatch: parseYymmdd_(f.getName()) === target });
  });
  all.sort((a, b) => (b.dateMatch - a.dateMatch) || (b.updated > a.updated ? 1 : -1));
  return { ok: true, target, candidates: all.slice(0, 10) };
}

function getManuscript_({ fileId, tabTitle, date }) {
  const doc = DocumentApp.openById(fileId);
  const tabs = [];
  const flatten = (list) => list.forEach(t => { tabs.push(t); flatten(t.getChildTabs()); });
  flatten(doc.getTabs());
  const titles = tabs.map(t => t.getTitle());
  if (!tabTitle) return { ok: true, title: doc.getName(), tabs: titles };
  const tab = tabs.find(t => t.getTitle() === tabTitle);
  if (!tab) throw new Error('탭을 찾지 못했습니다: ' + tabTitle);
  const body = tab.asDocumentTab().getBody();
  const out = { ok: true, version: 2, title: doc.getName(), tab: tabTitle, tabs: titles, text: body.getText() };
  if (date) Object.assign(out, manuscriptFlow_(body, date));
  return out;
}

/**
 * 원고를 위에서 아래로 읽으며 글과 그림의 순서를 기록.
 * 그림 자리에는 [[그림:번호]] 표시를 남기고, 그림 파일은 설교그림/날짜 폴더에 '원고그림-01.png'처럼 저장.
 * (다시 불러오면 예전 '원고그림-' 파일은 휴지통으로 보내고 새로 저장)
 */
function manuscriptFlow_(body, date) {
  const lines = [], blobs = [];
  const T = DocumentApp.ElementType;
  const walk = (el) => {
    const type = el.getType();
    if (type === T.INLINE_IMAGE) { blobs.push(el.asInlineImage().getBlob()); lines.push('[[그림:' + blobs.length + ']]'); return; }
    if (type === T.PARAGRAPH || type === T.LIST_ITEM) {
      const p = type === T.PARAGRAPH ? el.asParagraph() : el.asListItem();
      let text = '';
      const flush = () => { if (text.trim()) lines.push(text); text = ''; };
      for (let i = 0; i < p.getNumChildren(); i++) {
        const c = p.getChild(i);
        if (c.getType() === T.TEXT) text += c.asText().getText();
        else if (c.getType() === T.INLINE_IMAGE) { flush(); walk(c); }
      }
      flush();
      try { p.getPositionedImages().forEach(img => { blobs.push(img.getBlob()); lines.push('[[그림:' + blobs.length + ']]'); }); } catch (e) {}
      return;
    }
    if (typeof el.getNumChildren === 'function') {
      for (let i = 0; i < el.getNumChildren(); i++) walk(el.getChild(i));
      return;
    }
    if (typeof el.getText === 'function') { const t = el.getText(); if (t && t.trim()) lines.push(t); }
  };
  for (let i = 0; i < body.getNumChildren(); i++) walk(body.getChild(i));

  const folder = sermonArtFolder_(date);
  const old = folder.getFiles();
  while (old.hasNext()) { const f = old.next(); if (/^원고그림-/.test(f.getName())) f.setTrashed(true); }
  const art = blobs.map((b, k) => {
    const type = b.getContentType() || 'image/png';
    const ext = /jpe?g/.test(type) ? '.jpg' : /gif/.test(type) ? '.gif' : '.png';
    const name = '원고그림-' + String(k + 1).padStart(2, '0') + ext;
    const f = folder.createFile(b.setName(name));
    return { n: k + 1, id: f.getId(), name: name };
  });
  return { flow: lines.join('\n'), art: art, artFolderUrl: folder.getUrl() };
}

/* ---------- 주보 PDF ---------- */

function bulletinName_(date, isPraise) {
  return toYymmdd_(date) + (isPraise ? '주보(찬양예배).pdf' : '주일주보.pdf');
}

function uploadBulletin_({ date, isPraise, base64 }) {
  const name = bulletinName_(date, isPraise);
  const bytes = Utilities.base64Decode(base64);
  if (bytes.length > CONFIG.MAX_PDF_BYTES) throw new Error('PDF가 20MB를 넘습니다');
  const review = subFolder_(DriveApp.getFolderById(CONFIG.BULLETIN_PARENT_ID), CONFIG.REVIEW_FOLDER_NAME);
  const file = upsert_(review, name, Utilities.newBlob(bytes, 'application/pdf', name));
  return { ok: true, stage: 'review', name, id: file.getId(), url: file.getUrl() };
}

function publishBulletin_({ date, isPraise }) {
  const name = bulletinName_(date, isPraise);
  const review = subFolder_(DriveApp.getFolderById(CONFIG.BULLETIN_PARENT_ID), CONFIG.REVIEW_FOLDER_NAME);
  const src = review.getFilesByName(name);
  if (!src.hasNext()) throw new Error('검토본이 없습니다: ' + name);
  const file = upsert_(DriveApp.getFolderById(CONFIG.BULLETIN_FOLDER_ID), name, src.next().getBlob().setName(name));
  shareLink_(file);
  return { ok: true, stage: 'published', name, id: file.getId(), url: file.getUrl() };
}

/*
 * 다섯째 주(원로목사님 설교) — 설교 원고가 없는 주에 홈페이지 교회학교 자동화가 읽을 문서를 생명의삶 폴더에 만듦.
 * 이름: YYMMDD_주일낮_본문_제목 (원로목사님 설교)
 * 내용: [본문](개역개정) · [설교 요지] · [어린이 설교](AI 초안 → 목사님 검토)
 * 같은 날짜 문서가 이미 있으면 새로 만들지 않고 내용을 바꿔 씀.
 */
function createSchoolDoc_({ date, title, passage, passageText, notes, kidSermon }) {
  if (!title || !passage) throw new Error('설교 제목과 본문이 필요합니다');
  const yymmdd = toYymmdd_(date);
  const name = yymmdd + '_주일낮_' + String(passage).replace(/\s+/g, '') + '_' + title + ' (원로목사님 설교)';
  const root = DriveApp.getFolderById(CONFIG.MANUSCRIPT_ROOT_ID);
  const found = root.searchFiles("title contains '" + yymmdd + "_주일낮' and title contains '원로목사님 설교' and trashed = false");
  let doc;
  if (found.hasNext()) { doc = DocumentApp.openById(found.next().getId()); doc.setName(name); doc.getBody().clear(); }
  else { doc = DocumentApp.create(name); DriveApp.getFileById(doc.getId()).moveTo(root); }
  const body = doc.getBody();
  const H = DocumentApp.ParagraphHeading;
  const first = body.getParagraphs()[0];   // 새 문서의 첫 빈 줄을 제목으로
  first.setText(title);
  first.setHeading(H.TITLE);
  const note = body.appendParagraph('원로목사님 설교 주일 · 설교 전문 없음 · 설교: 김용원 원로목사 · 예배 스튜디오가 만든 교회학교용 문서');
  body.appendParagraph('[본문] ' + passage).setHeading(H.HEADING1);
  String(passageText || '').split('\n').forEach(l => { if (l.trim()) body.appendParagraph(l); });
  body.appendParagraph('[설교 요지]').setHeading(H.HEADING1);
  body.appendParagraph(String(notes || '').trim() || '(받은 요지 없음 — 본문을 기준으로 합니다)');
  body.appendParagraph('[어린이 설교]').setHeading(H.HEADING1);
  String(kidSermon || '').split('\n').forEach(l => body.appendParagraph(l));
  body.editAsText().setItalic(false);
  note.setItalic(true);
  doc.saveAndClose();
  return { ok: true, id: doc.getId(), name: name, url: 'https://docs.google.com/document/d/' + doc.getId() + '/edit' };
}

/* ---------- 콘티: 악보 이미지 모음 문서 ---------- */
/** 찬양/악보 폴더의 악보 이미지 목록 (하위 폴더 포함) */
function listScores_() {
  const out = [];
  walk_(DriveApp.getFolderById(CONFIG.SCORE_FOLDER_ID), '', (f) => {
    if (/^image\//.test(f.getMimeType())) out.push({ id: f.getId(), name: f.getName() });
  });
  out.sort((a, b) => a.name.localeCompare(b.name, 'ko', { numeric: true }));
  return { ok: true, scores: out };
}

/**
 * 콘티 문서 만들기: 찬양/콘티 폴더에 'YYMMDD 콘티' 구글 문서 (A4 가로, 여백 1cm, 악보 두 장씩 나란히)
 * sets: [{ label: '온 세대 찬양예배', songs: [{ title, scoreIds: [...] }] }, { label: '오후 예배', ... }]
 * 같은 이름 문서가 있으면 내용을 새로 바꿔 씀.
 */
function makeConti_({ date, sets }) {
  const yymmdd = toYymmdd_(date);
  const name = yymmdd + ' 콘티';
  const folder = DriveApp.getFolderById(CONFIG.CONTI_FOLDER_ID);
  const found = folder.getFilesByName(name);
  let doc;
  if (found.hasNext()) { doc = DocumentApp.openById(found.next().getId()); doc.getBody().clear(); }
  else { doc = DocumentApp.create(name); DriveApp.getFileById(doc.getId()).moveTo(folder); }
  const body = doc.getBody();
  const CM = 28.3465;                       // 1cm = 28.35pt
  const W = 841.89, H = 595.28;             // A4 가로
  body.setPageWidth(W).setPageHeight(H).setMarginTop(CM).setMarginBottom(CM).setMarginLeft(CM).setMarginRight(CM);
  const cellW = (W - 2 * CM) / 2 - 4, cellH = H - 2 * CM - 48;   // 위 제목 한 줄 + 표 뒤 빈 줄 자리를 뺌
  const missing = [];
  let first = true;
  (sets || []).forEach((set) => {
    const imgs = [];
    (set.songs || []).forEach((song) => {
      if (!song.scoreIds || !song.scoreIds.length) missing.push(song.title);
      (song.scoreIds || []).forEach((id) => imgs.push(id));
    });
    if (!imgs.length) return;
    const order = (set.songs || []).map((x, i) => (i + 1) + '. ' + x.title).join('   ');
    for (let k = 0; k < imgs.length; k += 2) {
      let hp;
      if (first) { hp = body.getParagraphs()[0]; first = false; }
      else {
        // 표 뒤에 자동으로 붙는 빈 줄에 쪽 나눔을 넣어 빈 쪽이 생기지 않게
        const last = body.getChild(body.getNumChildren() - 1);
        if (last.getType() === DocumentApp.ElementType.PARAGRAPH) last.asParagraph().appendPageBreak(); else body.appendPageBreak();
        hp = body.appendParagraph('');
      }
      hp.setText(date.replace(/-/g, '. ') + '  ' + (set.label || '') + (k === 0 ? '  |  ' + order : '  (이어서)'));
      hp.setFontSize(9).setBold(false).setSpacingAfter(2).setSpacingBefore(0);
      const table = body.appendTable([['', '']]);
      table.setBorderWidth(0);
      [0, 1].forEach((c) => {
        const id = imgs[k + c];
        const cell = table.getCell(0, c);
        cell.setPaddingTop(0).setPaddingBottom(0).setPaddingLeft(2).setPaddingRight(2).setWidth(cellW + 4);
        if (!id) return;
        const p = cell.getChild(0).asParagraph();
        p.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
        const img = p.appendInlineImage(DriveApp.getFileById(id).getBlob());
        const r = Math.min(cellW / img.getWidth(), cellH / img.getHeight());
        img.setWidth(Math.floor(img.getWidth() * r)).setHeight(Math.floor(img.getHeight() * r));
      });
    }
  });
  if (first) body.getParagraphs()[0].setText('악보 이미지를 찾지 못했습니다. 찬양/악보 폴더에 곡 제목으로 이미지를 넣어 주세요.');
  doc.saveAndClose();
  return { ok: true, name: name, url: 'https://docs.google.com/document/d/' + doc.getId() + '/edit', missing: missing };
}

/* 주보 내용(JSON)을 검토 폴더에 보관 → GitHub Actions가 받아 PDF로 만든 뒤 uploadBulletin으로 올림 */
function bulletinDataName_(date) { return '주보데이터_' + toYymmdd_(date) + '.json'; }
function saveBulletinData_({ date, data }) {
  if (!data || typeof data !== 'object') throw new Error('주보 데이터가 없습니다');
  const review = subFolder_(DriveApp.getFolderById(CONFIG.BULLETIN_PARENT_ID), CONFIG.REVIEW_FOLDER_NAME);
  const name = bulletinDataName_(date);
  upsert_(review, name, Utilities.newBlob(JSON.stringify(data), 'application/json', name));
  return { ok: true, name: name };
}
function getBulletinData_({ date }) {
  const review = subFolder_(DriveApp.getFolderById(CONFIG.BULLETIN_PARENT_ID), CONFIG.REVIEW_FOLDER_NAME);
  const it = review.getFilesByName(bulletinDataName_(date));
  if (!it.hasNext()) throw new Error('주보 데이터가 없습니다: ' + date);
  return { ok: true, data: JSON.parse(it.next().getBlob().getDataAsString('UTF-8')) };
}

/* ---------- 말씀 페이지 데이터 ---------- */

function publishSermon_({ item }) {
  if (!item || !/^\d{4}-\d{2}-\d{2}$/.test(item.date) || !item.title || !item.summary)
    throw new Error('date(YYYY-MM-DD), title, summary는 필수입니다');
  const folder = subFolder_(DriveApp.getFolderById(CONFIG.BULLETIN_PARENT_ID), CONFIG.SITE_DATA_FOLDER_NAME);
  const it = folder.getFilesByName('sermons.json');
  const file = it.hasNext() ? it.next() : folder.createFile('sermons.json', '{"items":[]}', MimeType.PLAIN_TEXT);
  let data;
  try { data = JSON.parse(file.getBlob().getDataAsString('UTF-8')); } catch (e) { data = { items: [] }; }
  data.items = (data.items || []).filter(x => x.date !== item.date);
  data.items.push(item);
  data.items.sort((a, b) => b.date.localeCompare(a.date));
  data.items = data.items.slice(0, 104);
  data.updated = new Date().toISOString();
  file.setContent(JSON.stringify(data, null, 2));
  shareLink_(file); shareLink_(folder);
  return { ok: true, fileId: file.getId(), count: data.items.length };
}

/* ---------- 공통 ---------- */

function toYymmdd_(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('날짜 형식은 YYYY-MM-DD 입니다');
  return date.slice(2).replace(/-/g, '');
}
function walk_(folder, path, fn) {
  const files = folder.getFiles(); while (files.hasNext()) fn(files.next(), path);
  const subs = folder.getFolders();
  while (subs.hasNext()) { const s = subs.next(); walk_(s, path ? path + '/' + s.getName() : s.getName(), fn); }
}
function upsert_(folder, name, blob) {
  const found = folder.getFilesByName(name);
  if (found.hasNext()) { const f = found.next(); Drive.Files.update({}, f.getId(), blob); return f; }
  return folder.createFile(blob);
}
function subFolder_(parent, name) {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}
function shareLink_(item) {
  try { item.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); }
  catch (e) { console.warn('공유 설정 건너뜀: ' + e); }
}
function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
