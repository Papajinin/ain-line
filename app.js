// AIN Line 공통 v2: 날짜 도우미, 칸 정의, 저장소, 상태, 화면 모드·테마 색, 아래에서 올라오는 창

const STORE_KEY = 'ainLine';
const appEl = document.getElementById('app');
const WEEK_NAMES = ['일', '월', '화', '수', '목', '금', '토'];

// 기본 칸 (질문은 고칠 수 없음). 내 질문은 T와 M 사이에 들어감
const BASE_FIELDS = [
  { k: 'K', name: '오늘을 설명하는 키워드', ph: '오늘 있었던 일, 남기고 싶은 순간' },
  { k: 'H', name: '오늘의 행복한 일', ph: '따뜻한 커피 한 잔도 괜찮아요' },
  { k: 'G', name: '오늘 내가 잘한 것', ph: '스스로 칭찬해 주세요' },
  { k: 'P', name: '오늘 어려웠던 것', ph: '어떤 점이 어려웠나요' },
  { k: 'T', name: '내일 시도해볼 것', ph: '작은 것 하나면 충분해요' }
];
const MORE_FIELD = { k: 'M', name: '더 남기고 싶은 이야기', ph: '안 써도 괜찮아요' };
const FIXED_LETTERS = ['K', 'H', 'G', 'P', 'T', 'M'];
const MAX_QUESTIONS = 3;

// ---------- 날짜 ('YYYY-MM-DD' 문자열) ----------
function ymd(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function parseYmd(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function todayStr() {
  return ymd(new Date());
}
function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
// n달 전 같은 날. 그런 날이 없으면(3월 31일의 한 달 전 등) 그달의 마지막 날
function monthsAgo(d, n) {
  const first = new Date(d.getFullYear(), d.getMonth() - n, 1);
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  return new Date(first.getFullYear(), first.getMonth(), Math.min(d.getDate(), last));
}
function dateLabel(k) {
  const d = parseYmd(k);
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${WEEK_NAMES[d.getDay()]}요일`;
}
function weekLead(d) {
  return (d.getDay() - state.settings.weekStart + 7) % 7;
}
function weekLabelsHtml() {
  return [...Array(7)].map((_, i) => (i + state.settings.weekStart) % 7)
    .map(n => `<span${n === 0 ? ' class="sun"' : ''}>${WEEK_NAMES[n]}</span>`).join('');
}

// ---------- 상태 ----------
// 하루 기록: entries['YYYY-MM-DD'] = { K, H, G, P, T, M: 글, mine: { 질문 id: { k, name, text } } }
//  - 내 질문은 처음 적은 때의 글자·질문 글을 같이 남겨서, 나중에 질문을 고치거나 지워도 그날 물었던 대로 보임
// 내 질문: questions = [{ id, k, name, ph }] (순서는 배열 순서)
let state = {
  entries: {},
  questions: [],
  // theme: light | dark | auto (기기마다), accent: blue | green | red | yellow, weekStart: 0 | 1 (계정마다)
  settings: { theme: 'auto', accent: 'blue', weekStart: 0 }
};

// 저장하지 않는 화면 상태
const ui = {
  today: todayStr(),
  sel: todayStr(),     // 쓰기 화면의 날짜
  view: 'write',       // write | read | recall | search
  readKey: null,       // 읽기 화면의 날짜
  readFrom: 'recall',  // 읽기에서 뒤로 가면 갈 곳
  calMonth: null,      // 돌아보기 달력의 달 (Date, 그달 1일)
  q: '',               // 찾는 글자
  anim: ''             // 다음 그리기 한 번만 쓰는 움직임 (enter, slide-prev, slide-next)
};

function loadState() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return false;
    const saved = JSON.parse(raw);
    state = {
      entries: saved.entries || {},
      questions: saved.questions || [],
      settings: { ...state.settings, ...(saved.settings || {}) }
    };
    return true;
  } catch (e) {
    return false;
  }
}

// 이 기기에만 저장 (클라우드에서 받은 내용을 저장할 때)
function saveLocal() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  } catch (e) {}
}

// 내가 바꾼 내용 저장: 기기 + 클라우드 (sync.js)
function saveState() {
  saveLocal();
  if (typeof cloudSave === 'function') cloudSave();
}

// 화면 모드('자동'이면 아이폰 설정을 따름)와 테마 색
function applyTheme() {
  const { theme: mode, accent } = state.settings;
  const root = document.documentElement;
  if (mode === 'light' || mode === 'dark') root.setAttribute('data-theme', mode);
  else root.removeAttribute('data-theme');
  if (accent === 'green' || accent === 'red' || accent === 'yellow') root.setAttribute('data-accent', accent);
  else root.removeAttribute('data-accent');
}

// 아래에서 올라오는 창 열기·닫기 (설정, 날짜 고르기, 내 질문)
function showOverlay(el) {
  el.hidden = false;
  document.body.classList.add('locked');
  requestAnimationFrame(() => el.classList.add('show'));
}
function hideOverlay(el) {
  el.classList.remove('show');
  if (!document.querySelector('.overlay.show')) document.body.classList.remove('locked');
  setTimeout(() => { if (!el.classList.contains('show')) el.hidden = true; }, 470); // 닫히는 움직임(0.45초)이 끝난 뒤
}

function newId() {
  return 'q_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

// ---------- 기록 ----------
// 그날 칸 목록: 기본 5칸 → 내 질문 → M
//  - 그날 이미 적은 내 질문은 적을 때의 글자·질문 글로
//  - 지금은 지운 질문이라도 그날 적은 글이 있으면 그대로 보임
function fieldsFor(k) {
  const e = state.entries[k] || {};
  const mine = e.mine || {};
  const list = state.questions.map(q => {
    const m = mine[q.id];
    return m && m.text ? { k: m.k, name: m.name, ph: q.ph, qid: q.id } : { k: q.k, name: q.name, ph: q.ph, qid: q.id };
  });
  Object.keys(mine).forEach(id => {
    if (!state.questions.some(q => q.id === id) && mine[id].text) list.push({ k: mine[id].k, name: mine[id].name, ph: '', qid: id });
  });
  return [...BASE_FIELDS, ...list, MORE_FIELD];
}
function fieldText(k, f) {
  const e = state.entries[k];
  if (!e) return '';
  if (f.qid) return (e.mine && e.mine[f.qid] && e.mine[f.qid].text) || '';
  return e[f.k] || '';
}
function setFieldText(k, f, text) {
  const e = state.entries[k] || (state.entries[k] = {});
  if (f.qid) {
    e.mine = e.mine || {};
    const prev = e.mine[f.qid];
    if (text) e.mine[f.qid] = prev && prev.text ? { ...prev, text } : { k: f.k, name: f.name, text };
    else delete e.mine[f.qid];
    if (!Object.keys(e.mine).length) delete e.mine;
  } else if (text) e[f.k] = text;
  else delete e[f.k];
  if (!hasEntry(k)) delete state.entries[k];
}
// 그날 글이 한 칸이라도 있는지
function hasEntry(k) {
  const e = state.entries[k];
  if (!e) return false;
  if (FIXED_LETTERS.some(L => e[L] && e[L].trim())) return true;
  return !!e.mine && Object.values(e.mine).some(m => m.text && m.text.trim());
}
// 목록·카드에 보여 줄 한 줄: K, 없으면 처음 적은 칸
function entryTitle(k) {
  const e = state.entries[k];
  if (!e) return '';
  if (e.K && e.K.trim()) return e.K.trim();
  const f = fieldsFor(k).find(x => fieldText(k, x).trim());
  return f ? fieldText(k, f).trim() : '';
}

// ---------- 아이콘 ----------
const ICONS = {
  recall: '<svg viewBox="0 0 24 24"><path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1L3.5 8.5"/><path d="M3.5 4v4.5H8"/><path d="M12 7.5V12l3 2"/></svg>',
  settings: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
  back: '<svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg>',
  next: '<svg viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"/></svg>',
  search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  grip: '<svg viewBox="0 0 24 24"><path d="M4 8h16M4 12h16M4 16h16"/></svg>'
};

// 선택 버튼 묶음(.seg): 고른 칸 표시가 옆으로 미끄러짐 (네 앱 공통 방식)
// 어느 칸을 골랐는지는 화면마다 .on으로 정하고, 여기서는 그 칸을 따라가기만 함
const segPos = new Map(); // 묶음을 다시 그려도 지난 자리에서 미끄러지게
function segKey(seg) { return seg.id || seg.dataset.seg || seg.getAttribute('aria-label') || ''; }
function moveSegThumb(thumb, pos, animate) {
  if (!animate) thumb.style.transition = 'none';
  thumb.style.width = pos.w + 'px';
  thumb.style.transform = `translateX(${pos.x}px)`;
  if (!animate) { void thumb.offsetWidth; thumb.style.transition = ''; }
}
function placeSegThumb(seg, animate) {
  let thumb = seg.querySelector(':scope > .seg-thumb');
  if (!thumb) {
    thumb = document.createElement('span');
    thumb.className = 'seg-thumb';
    seg.prepend(thumb);
    seg.classList.add('has-thumb');
    segResize.observe(seg);
    const last = segPos.get(segKey(seg));
    if (last) { moveSegThumb(thumb, last, false); thumb.dataset.ready = '1'; } else animate = false;
  }
  const on = seg.querySelector(':scope > button.on');
  thumb.hidden = !on;
  if (!on || !on.offsetWidth) return; // 닫힌 창 안: 보일 때 segResize가 다시 부름
  const pos = { x: on.offsetLeft, w: on.offsetWidth };
  moveSegThumb(thumb, pos, animate && thumb.dataset.ready === '1');
  thumb.dataset.ready = '1';
  if (segKey(seg)) segPos.set(segKey(seg), pos);
}
const segResize = new ResizeObserver(list => list.forEach(e => placeSegThumb(e.target, true)));
new MutationObserver(list => {
  const segs = new Set();
  for (const m of list) {
    if (m.type === 'attributes') {
      const p = m.target.parentElement;
      if (p && p.classList.contains('seg')) segs.add(p);
      continue;
    }
    if (m.target.classList && m.target.classList.contains('seg')) segs.add(m.target);
    m.addedNodes.forEach(n => {
      if (n.nodeType !== 1) return;
      if (n.classList.contains('seg')) segs.add(n);
      n.querySelectorAll('.seg').forEach(s => segs.add(s));
    });
  }
  segs.forEach(s => placeSegThumb(s, true));
}).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
document.querySelectorAll('.seg').forEach(s => placeSegThumb(s, false));
// 아이폰 사파리는 이게 있어야 누르는 동안(:active) 모양이 바뀜
document.addEventListener('touchstart', () => {}, { passive: true });
