// AIN Line 쓰기 화면 v4 (날짜 제목에 공휴일 이름): 날짜 줄, 어제의 T, 칸(K H G P T · 내 질문 · M), 자동 저장, 날짜 고르기 창, 날짜 넘기기(버튼·옆으로 쓸기, Todo 캘린더 방식)

let writeFields = []; // 지금 그린 칸 목록 (칸 순서 = data-f 번호)

function writeHtml() {
  const k = ui.sel;
  const isToday = k === ui.today;
  const prev = state.entries[ymd(addDays(parseYmd(k), -1))];
  const yT = prev && prev.T && prev.T.trim();
  writeFields = fieldsFor(k);
  const fields = writeFields.map((f, i) => `
      <div class="field">
        <div class="f-head"><span class="letter">${escapeHtml(f.k)}</span><span class="f-name">${escapeHtml(f.name)}</span></div>
        <textarea class="f-input" data-f="${i}" rows="1" aria-label="${escapeHtml(f.name)}" placeholder="${escapeHtml(f.ph || '')}">${escapeHtml(fieldText(k, f))}</textarea>
      </div>`).join('');
  return `
    <header class="top">
      <h1 class="wordmark"><b>AIN</b> Line</h1>
      <div class="top-right">
        <button class="icon-btn" type="button" data-go="recall" aria-label="돌아보기"><span class="icon-circle">${ICONS.recall}</span></button>
        <button class="icon-btn" type="button" data-go="settings" aria-label="설정"><span class="icon-circle">${ICONS.settings}</span></button>
      </div>
    </header>
    <div class="date-bar">
      <button type="button" class="date-title" data-pick aria-label="날짜 고르기">${dateLabel(k)}${holidayName(k) ? ` <em class="holiday">${holidayName(k)}</em>` : ''}</button>
      ${isToday ? '' : '<button type="button" class="today-btn" data-today>오늘</button>'}
      <div class="arrows">
        <button class="nav-btn" type="button" data-step="-1" aria-label="전날">${ICONS.back}</button>
        <button class="nav-btn" type="button" data-step="1" aria-label="다음날"${isToday ? ' disabled' : ''}>${ICONS.next}</button>
      </div>
    </div>
    <div class="day-pane">
      ${yT ? `<div class="yesterday"><small>어제 시도해보기로 한 것</small>${escapeHtml(yT)}</div>` : ''}
      <div class="fields">${fields}</div>
    </div>`;
}

// 날짜 옮기기 (미래로는 못 감)
// AIN Todo 캘린더처럼: 지금 날이 옆으로 밀려나고, 새 날이 반대쪽에서 들어온다 (버튼·쓸기·날짜 고르기 모두)
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let sliding = false;
let paneX = 0; // 손가락을 따라 옮긴 거리

function moveDay(k) {
  if (k > ui.today) k = ui.today;
  if (sliding || (k === ui.sel && ui.view === 'write')) return;
  flushSave();
  const pane = appEl.querySelector('.day-pane');
  if (ui.view !== 'write' || !pane || reduceMotion) return showDay(k);
  slideDay(k < ui.sel ? -1 : 1, k);
}
function showDay(k) {
  ui.sel = k;
  ui.view = 'write';
  render();
  window.scrollTo(0, 0);
}
function setPane(pane, x, ms, ease) {
  pane.style.transition = ms ? `transform ${ms}ms ${ease}` : 'none';
  pane.style.transform = x ? `translateX(${x}px)` : '';
  paneX = x;
}
function slideDay(dir, k) {
  sliding = true;
  appEl.classList.remove('enter');
  let pane = appEl.querySelector('.day-pane');
  const w = pane.clientWidth;
  const outMs = Math.round(80 + 140 * (1 - Math.min(Math.abs(paneX) / w, 1)));
  setPane(pane, -dir * w, outMs, 'ease-in');
  setTimeout(() => {
    showDay(k);
    pane = appEl.querySelector('.day-pane');
    setPane(pane, dir * w, 0);
    pane.offsetHeight; // 새 날을 반대쪽에 먼저 놓기
    setPane(pane, 0, 240, 'ease-out');
    setTimeout(() => {
      pane.style.transition = '';
      sliding = false;
    }, 250);
  }, outMs);
}
// 덜 밀었으면 제자리로
function snapBack() {
  const pane = appEl.querySelector('.day-pane');
  if (!pane) return;
  setPane(pane, 0, 200, 'ease-out');
  setTimeout(() => { pane.style.transition = ''; }, 210);
}

// 칸 높이: 글이 늘면 부드럽게 늘어남 (처음 그릴 때는 바로)
function growField(t, smooth) {
  const from = t.offsetHeight;
  t.style.height = 'auto';
  const to = t.scrollHeight;
  if (smooth && from && from !== to) { t.style.height = from + 'px'; void t.offsetHeight; }
  t.style.height = to + 'px';
}

// ---------- 자동 저장 ----------
// 글자를 칠 때마다 기기에 바로 저장하고, 클라우드는 잠깐 멈췄을 때 한 번에 올림
let saveTimer = null;
function scheduleSave() {
  saveLocal();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSave, 800);
}
function flushSave() {
  if (saveTimer === null) return;
  clearTimeout(saveTimer);
  saveTimer = null;
  saveState();
}

appEl.addEventListener('input', e => {
  const t = e.target;
  if (!t.matches('.f-input')) return;
  const f = writeFields[Number(t.dataset.f)];
  if (!f) return;
  setFieldText(ui.sel, f, t.value);
  growField(t, true);
  scheduleSave();
});
appEl.addEventListener('focusout', e => { if (e.target.matches('.f-input')) flushSave(); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushSave(); });
window.addEventListener('pagehide', flushSave);

// ---------- 날짜 고르기 창 ----------
const dateOverlay = document.getElementById('dateOverlay');
const dateCal = document.getElementById('dateCal');
let pickMonth = null;

function openDatePicker() {
  const d = parseYmd(ui.sel);
  pickMonth = new Date(d.getFullYear(), d.getMonth(), 1);
  renderDatePicker();
  showOverlay(dateOverlay);
}
function renderDatePicker() {
  dateCal.innerHTML = calHtml(pickMonth, { pick: true });
}
dateCal.addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b || b.disabled) return;
  if (b.dataset.cal) {
    pickMonth = new Date(pickMonth.getFullYear(), pickMonth.getMonth() + Number(b.dataset.cal), 1);
    return renderDatePicker();
  }
  if (b.dataset.date) {
    hideOverlay(dateOverlay);
    moveDay(b.dataset.date);
  }
});
document.getElementById('dateClose').addEventListener('click', () => hideOverlay(dateOverlay));
dateOverlay.addEventListener('click', e => { if (e.target === dateOverlay) hideOverlay(dateOverlay); });

// ---------- 옆으로 쓸어 날짜 옮기기 ----------
// 오른쪽으로 쓸면 전날, 왼쪽으로 쓸면 다음날. 쓰는 동안 손가락을 따라 움직임 (AIN Todo 캘린더와 같은 기준)
// 글 칸 안에서 시작한 쓸기는 무시 (커서 옮기기와 겹치지 않게)
let swipe = null;
let swipedAt = 0;

appEl.addEventListener('touchstart', e => {
  swipe = null;
  if (sliding || ui.view !== 'write' || e.touches.length !== 1) return;
  if (e.target.closest('.f-input') || document.body.classList.contains('locked')) return;
  const p = e.touches[0];
  swipe = { x: p.clientX, y: p.clientY, time: Date.now(), axis: null };
}, { passive: true });

appEl.addEventListener('touchmove', e => {
  if (!swipe) return;
  const p = e.touches[0];
  const dx = p.clientX - swipe.x, dy = p.clientY - swipe.y;
  if (!swipe.axis && Math.max(Math.abs(dx), Math.abs(dy)) > 8) {
    swipe.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
    swipedAt = Date.now();
    if (swipe.axis === 'x') appEl.classList.remove('enter');
  }
  if (swipe.axis === 'x' && !reduceMotion) {
    const pane = appEl.querySelector('.day-pane');
    // 오늘에서 다음날 쪽으로는 조금만 끌려옴 (못 간다는 느낌)
    if (pane) setPane(pane, dx < 0 && ui.sel === ui.today ? dx / 4 : dx, 0);
  }
}, { passive: true });

appEl.addEventListener('touchend', e => {
  if (!swipe) return;
  const p = e.changedTouches[0];
  const dx = p.clientX - swipe.x;
  const fast = Math.abs(dx) / Math.max(Date.now() - swipe.time, 1) > 0.4; // 휙 넘긴 경우
  const axis = swipe.axis;
  swipe = null;
  if (axis) swipedAt = Date.now();
  if (axis !== 'x') return;
  const pane = appEl.querySelector('.day-pane');
  const far = pane && Math.abs(dx) > pane.clientWidth * 0.25;
  const step = dx < 0 ? 1 : -1;
  if ((far || (fast && Math.abs(dx) > 30)) && !(step > 0 && ui.sel === ui.today)) {
    moveDay(ymd(addDays(parseYmd(ui.sel), step)));
  } else if (!reduceMotion) snapBack();
}, { passive: true });

appEl.addEventListener('touchcancel', () => {
  if (swipe && swipe.axis === 'x') snapBack();
  swipe = null;
}, { passive: true });

// 쓸고 난 손가락이 버튼 위에서 떨어져도 눌린 것으로 치지 않음
appEl.addEventListener('click', e => {
  if (Date.now() - swipedAt < 400) { e.stopPropagation(); e.preventDefault(); }
}, true);
