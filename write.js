// AIN Line 쓰기 화면 v1: 날짜 줄, 어제의 T, 칸(K H G P T · 내 질문 · M), 자동 저장, 날짜 고르기 창

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
      <button type="button" class="date-title day-anim" data-pick aria-label="날짜 고르기">${dateLabel(k)}</button>
      ${isToday ? '' : '<button type="button" class="today-btn" data-today>오늘</button>'}
      <div class="arrows">
        <button class="nav-btn" type="button" data-step="-1" aria-label="전날">${ICONS.back}</button>
        <button class="nav-btn" type="button" data-step="1" aria-label="다음날"${isToday ? ' disabled' : ''}>${ICONS.next}</button>
      </div>
    </div>
    ${yT ? `<div class="yesterday day-anim"><small>어제 시도해보기로 한 것</small>${escapeHtml(yT)}</div>` : ''}
    <div class="fields day-anim">${fields}</div>`;
}

// 날짜 옮기기 (미래로는 못 감)
function moveDay(k, anim) {
  if (k > ui.today) k = ui.today;
  if (k === ui.sel && ui.view === 'write') return;
  flushSave();
  ui.anim = anim || (k < ui.sel ? 'slide-prev' : 'slide-next');
  ui.sel = k;
  ui.view = 'write';
  render();
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
  dateCal.innerHTML = calHtml(pickMonth, { sel: ui.sel, pick: true });
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
