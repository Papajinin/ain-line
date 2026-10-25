// AIN Line 설정 v1: 화면 모드, 테마 색, 한 주의 시작, 내 질문(추가·고치기·삭제·꾹 눌러 순서 바꾸기), 계정

const settingsOverlay = document.getElementById('settingsOverlay');
const sTheme = document.getElementById('sTheme');
const sAccent = document.getElementById('sAccent');
const sWeek = document.getElementById('sWeek');
const sQuestions = document.getElementById('sQuestions');

function markSeg(seg, v) {
  seg.querySelectorAll('button').forEach(b => {
    const on = b.dataset.v === String(v);
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', on);
  });
}

function renderSettings() {
  markSeg(sTheme, state.settings.theme);
  markSeg(sAccent, state.settings.accent);
  markSeg(sWeek, state.settings.weekStart);
  renderQuestions();
  const signedIn = typeof cloud !== 'undefined' && cloud.user;
  document.getElementById('sAccount').hidden = !signedIn;
  document.getElementById('localNote').hidden = !!signedIn || cloudConfigured();
  if (signedIn) document.getElementById('accountEmail').textContent = cloud.user.email || '';
}

function renderQuestions() {
  const rows = state.questions.map(q => `
    <div class="q-row" data-qid="${q.id}">
      <button type="button" class="q-open" data-q="${q.id}">
        <span class="letter">${escapeHtml(q.k)}</span>
        <span class="q-text">${escapeHtml(q.name)}${q.ph ? `<small>${escapeHtml(q.ph)}</small>` : ''}</span>
      </button>
      <span class="grip" aria-hidden="true">${ICONS.grip}</span>
    </div>`).join('');
  const add = state.questions.length < MAX_QUESTIONS ? `<button type="button" class="row add" data-qadd>${ICONS.plus}질문 추가</button>` : '';
  sQuestions.innerHTML = rows + add;
}

function openSettings() {
  renderSettings();
  showOverlay(settingsOverlay);
}

function onSeg(seg, key, cast) {
  seg.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    state.settings[key] = cast ? cast(b.dataset.v) : b.dataset.v;
    applyTheme();
    saveState();
    renderSettings();
    render();
  });
}
onSeg(sTheme, 'theme');
onSeg(sAccent, 'accent');
onSeg(sWeek, 'weekStart', Number);

document.getElementById('settingsClose').addEventListener('click', () => hideOverlay(settingsOverlay));
settingsOverlay.addEventListener('click', e => { if (e.target === settingsOverlay) hideOverlay(settingsOverlay); });
document.getElementById('logoutBtn').addEventListener('click', () => confirmSignOut());

sQuestions.addEventListener('click', e => {
  if (qSkipClick) { qSkipClick = false; return; }
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.qadd !== undefined) return openQuestionSheet(null);
  if (b.dataset.q) return openQuestionSheet(b.dataset.q);
});

// ---------- 내 질문 추가·고치기 창 ----------
const questionOverlay = document.getElementById('questionOverlay');
const qLetter = document.getElementById('qLetter');
const qName = document.getElementById('qName');
const qPh = document.getElementById('qPh');
const qSave = document.getElementById('qSave');
const qError = document.getElementById('qError');
let qForm = null; // { id(고칠 때) }

function openQuestionSheet(id) {
  const q = id ? state.questions.find(x => x.id === id) : null;
  qForm = { id: q ? q.id : null };
  qLetter.value = q ? q.k : '';
  qName.value = q ? q.name : '';
  qPh.value = q ? q.ph || '' : '';
  document.getElementById('qTitle').textContent = q ? '질문 고치기' : '질문 추가';
  qSave.textContent = q ? '저장' : '추가';
  document.getElementById('qEditOnly').hidden = !q;
  checkQuestion();
  showOverlay(questionOverlay);
  // 아이폰은 누르는 순간에 커서를 넣어야 키보드를 열어 줌
  if (!q) qLetter.focus({ preventScroll: true });
}

// 글자: 영어 한 글자, K H G P T M과 다른 내 질문의 글자와 겹치면 안 됨
function letterError(L) {
  if (!L) return '';
  if (!/^[A-Z]$/.test(L)) return '영어 한 글자만 쓸 수 있어요.';
  if (FIXED_LETTERS.includes(L) || state.questions.some(q => q.k === L && q.id !== qForm.id)) return `${L}는 이미 쓰고 있어요. 다른 글자를 골라 주세요.`;
  return '';
}
function checkQuestion() {
  const L = qLetter.value, err = letterError(L);
  qError.textContent = err;
  qError.hidden = !err;
  qSave.disabled = !L || !!err || !qName.value.trim();
}

function closeQuestionSheet() {
  document.activeElement && document.activeElement.blur();
  hideOverlay(questionOverlay);
}

function saveQuestion() {
  checkQuestion();
  if (qSave.disabled) return;
  const data = { k: qLetter.value, name: qName.value.trim(), ph: qPh.value.trim() };
  if (qForm.id) Object.assign(state.questions.find(x => x.id === qForm.id), data);
  else state.questions.push({ id: newId(), ...data });
  saveState();
  closeQuestionSheet();
  renderQuestions();
  render();
}

function askDeleteQuestion() {
  const q = state.questions.find(x => x.id === qForm.id);
  showActions(`'${q.name}' 질문을 지워요. 이미 쓴 글은 그날 기록에 그대로 남아요.`, [
    { label: '질문 삭제', danger: true, fn: () => {
      state.questions = state.questions.filter(x => x.id !== q.id);
      saveState();
      closeQuestionSheet();
      renderQuestions();
      render();
    } }
  ]);
}

// 소문자로 쳐도 대문자로
qLetter.addEventListener('input', () => {
  const v = qLetter.value.slice(-1).toUpperCase();
  if (qLetter.value !== v) qLetter.value = v;
  checkQuestion();
});
qName.addEventListener('input', checkQuestion);
[qLetter, qName, qPh].forEach(el => el.addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  if (el === qLetter) qName.focus();
  else if (el === qName) qPh.focus();
  else saveQuestion();
}));
qSave.addEventListener('click', saveQuestion);
document.getElementById('qCancel').addEventListener('click', closeQuestionSheet);
document.getElementById('qDelete').addEventListener('click', askDeleteQuestion);
questionOverlay.addEventListener('click', e => { if (e.target === questionOverlay) closeQuestionSheet(); });

// ---------- 꾹 눌러(0.45초) 끌어서 순서 바꾸기 (AIN Days와 같은 방식) ----------
// 누르기 전에 손가락이 움직이면 스크롤로 봄
let qDrag = null;
let qSkipClick = false;

sQuestions.addEventListener('pointerdown', e => {
  const row = e.target.closest('.q-row');
  if (!row) return;
  qDrag = { row, y: e.clientY, on: false };
  qDrag.timer = setTimeout(() => {
    if (!qDrag) return;
    qDrag.on = true;
    qDrag.rows = [...sQuestions.querySelectorAll('.q-row')];
    qDrag.from = qDrag.to = qDrag.rows.indexOf(row);
    qDrag.tops = qDrag.rows.map(r => r.offsetTop);
    qDrag.hs = qDrag.rows.map(r => r.offsetHeight);
    sQuestions.classList.add('sorting');
    row.classList.add('dragging');
    if (navigator.vibrate) navigator.vibrate(10);
  }, 450);
});
document.addEventListener('pointermove', e => {
  if (!qDrag) return;
  if (!qDrag.on) {
    if (Math.abs(e.clientY - qDrag.y) > 8) { clearTimeout(qDrag.timer); qDrag = null; }
    return;
  }
  const { rows, from, tops, hs } = qDrag;
  const last = rows.length - 1;
  const dy = Math.max(tops[0] - tops[from] - 4, Math.min(tops[last] + hs[last] - hs[from] - tops[from] + 4, e.clientY - qDrag.y));
  qDrag.row.style.transform = `translateY(${dy}px)`;
  const mid = tops[from] + hs[from] / 2 + dy;
  let to = from;
  rows.forEach((r, k) => {
    if (k === from) return;
    const m = tops[k] + hs[k] / 2;
    let shift = 0;
    if (k < from && mid <= m) { shift = hs[from]; to--; }
    if (k > from && mid >= m) { shift = -hs[from]; to++; }
    r.style.transform = shift ? `translateY(${shift}px)` : '';
  });
  qDrag.to = to;
});
document.addEventListener('touchmove', e => { if (qDrag && qDrag.on) e.preventDefault(); }, { passive: false });

function endQDrag() {
  if (!qDrag) return;
  clearTimeout(qDrag.timer);
  const was = qDrag;
  qDrag = null;
  if (!was.on) return;
  qSkipClick = true;
  setTimeout(() => { qSkipClick = false; }, 400);
  const { rows, from, to, tops, hs, row } = was;
  const y = to > from ? tops[to] + hs[to] - hs[from] - tops[from] : tops[to] - tops[from];
  row.classList.add('settle');
  row.style.transform = `translateY(${y}px)`;
  setTimeout(() => {
    const order = rows.map(r => state.questions.find(q => q.id === r.dataset.qid));
    order.splice(to, 0, order.splice(from, 1)[0]);
    state.questions = order;
    sQuestions.classList.remove('sorting');
    saveState();
    renderQuestions();
    render();
  }, 470); // 내려앉는 움직임(--t)이 끝난 뒤
}
document.addEventListener('pointerup', endQDrag);
document.addEventListener('pointercancel', endQDrag);
