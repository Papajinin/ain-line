// AIN Line 시작 v1: 화면 고르기·그리기, 누르기 처리, 날짜 바뀜, 클라우드 시작

function render() {
  if (ui.view === 'read') appEl.innerHTML = readHtml();
  else if (ui.view === 'recall') appEl.innerHTML = recallHtml();
  else if (ui.view === 'search') appEl.innerHTML = searchHtml();
  else appEl.innerHTML = writeHtml();
  // 움직임은 화면을 바꾼 그 한 번만 (같은 화면을 다시 그릴 때는 가만히)
  appEl.className = 'app' + (ui.anim ? ' ' + ui.anim : '');
  ui.anim = '';
  appEl.querySelectorAll('.f-input').forEach(t => growField(t, false));
}

function go(view) {
  flushSave();
  ui.anim = 'enter';
  ui.view = view;
  render();
  window.scrollTo(0, 0);
}

function goBack() {
  if (ui.view === 'read') return go(ui.readFrom);
  if (ui.view === 'search') return go('recall');
  go('write');
}

appEl.addEventListener('click', e => {
  const t = e.target.closest('button');
  if (!t || t.disabled) return;
  const d = t.dataset;
  if (d.go === 'settings') return openSettings();
  if (d.go === 'recall') { ui.calMonth = null; return go('recall'); }
  if (d.go) return go(d.go);
  if (d.back !== undefined) return goBack();
  if (d.step) { moveDay(ymd(addDays(parseYmd(ui.sel), Number(d.step)))); return window.scrollTo(0, 0); }
  if (d.today !== undefined) { moveDay(ui.today, 'slide-next'); return window.scrollTo(0, 0); }
  if (d.pick !== undefined) return openDatePicker();
  if (d.read) { ui.readFrom = ui.view === 'search' ? 'search' : 'recall'; ui.readKey = d.read; return go('read'); }
  if (d.edit !== undefined) { ui.sel = ui.readKey; return go('write'); }
  if (d.cal) {
    ui.calMonth = new Date(ui.calMonth.getFullYear(), ui.calMonth.getMonth() + Number(d.cal), 1);
    return render();
  }
});

// 앱을 켜 둔 채 날짜가 바뀌면 '오늘'을 새로 계산
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  const now = todayStr();
  if (now === ui.today) return;
  if (ui.sel === ui.today) ui.sel = now;
  ui.today = now;
  render();
});

loadState(); // 기기에 저장된 내용으로 먼저 보여 주고, 클라우드에서 최신 내용을 받으면 다시 그림
applyTheme();
render();
initCloud();
