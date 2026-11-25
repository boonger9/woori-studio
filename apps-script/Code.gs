/**
 * 예배 스튜디오 · Google Apps Script 백엔드 (0원)
 * 목사님 구글 계정으로 실행되어 드라이브를 대신 읽고 씁니다.
 *
 * 설치: script.google.com → 새 프로젝트 → 이 내용 붙여넣기
 *   → 서비스 +: Drive API 추가
 *   → 프로젝트 설정 → 스크립트 속성: STUDIO_SECRET (20자 이상 임의 문자열)
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
      listGospel: listGospel_, getGospelFile: getGospelFile_
    };
    const h = handlers[req.action];
    if (!h) return json_({ ok: false, error: '알 수 없는 요청: ' + req.action });
    return json_(h(req));
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

/* ---------- 복음송가 (찬양/악보ppt 폴더) ---------- */

/** 폴더 안 복음송가 파일 목록 (하위 폴더 포함). 주간 준비 화면에서 곡을 고를 때 사용 */
function listGospel_() {
  const out = [];
  walk_(DriveApp.getFolderById(CONFIG.GOSPEL_FOLDER_ID), '', (f, path) => {
    const t = f.getMimeType();
    if (/presentation|powerpoint|pdf|image\//.test(t)) {
      out.push({ id: f.getId(), title: f.getName().replace(/\.(pptx?|pdf|jpe?g|png|webp)$/i, ''),
                 name: f.getName(), folder: path, mimeType: t, updated: f.getLastUpdated().toISOString() });
    }
  });
  out.sort((a, b) => a.title.localeCompare(b.title, 'ko'));
  return { ok: true, songs: out };
}

/** 복음송가 파일 하나를 base64로 돌려줌 (GitHub Actions가 그림으로 바꿀 때 사용). 찬양/악보ppt 폴더 안 파일만 허용 */
function getGospelFile_({ fileId }) {
  const f = DriveApp.getFileById(fileId);
  if (!isInside_(f, CONFIG.GOSPEL_FOLDER_ID)) throw new Error('찬양/악보ppt 폴더 밖의 파일은 받을 수 없습니다');
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

function getManuscript_({ fileId, tabTitle }) {
  const doc = DocumentApp.openById(fileId);
  const tabs = [];
  const flatten = (list) => list.forEach(t => { tabs.push(t); flatten(t.getChildTabs()); });
  flatten(doc.getTabs());
  const titles = tabs.map(t => t.getTitle());
  if (!tabTitle) return { ok: true, title: doc.getName(), tabs: titles };
  const tab = tabs.find(t => t.getTitle() === tabTitle);
  if (!tab) throw new Error('탭을 찾지 못했습니다: ' + tabTitle);
  return { ok: true, title: doc.getName(), tab: tabTitle, tabs: titles,
           text: tab.asDocumentTab().getBody().getText() };
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
