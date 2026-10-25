// AIN Line 선택 창 v1 (질문 삭제·로그아웃 확인, AIN Days와 같음) + 키보드 위로 창 올리기

// 아이폰 키보드가 올라오면 입력 창도 키보드 위로 올림 (AIN Todo·Cost·Days와 같음)
if (window.visualViewport) {
  const vv = window.visualViewport;
  const fit = () => {
    const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    document.documentElement.style.setProperty('--kb', kb + 'px');
  };
  vv.addEventListener('resize', fit);
  vv.addEventListener('scroll', fit);
}

const actionOverlay = document.getElementById('actionOverlay');
const actionMsg = document.getElementById('actionMsg');
const actionBtns = document.getElementById('actionBtns');
let actionList = [];

function showActions(msg, list) {
  actionList = list;
  actionMsg.textContent = msg;
  actionBtns.innerHTML = list.map((a, i) =>
    `<button type="button" class="action-btn${a.danger ? ' danger' : ''}" data-i="${i}">${a.label}</button>`
  ).join('');
  document.activeElement && document.activeElement.blur();
  actionOverlay.hidden = false;
  requestAnimationFrame(() => actionOverlay.classList.add('show'));
}
function hideActions() {
  actionOverlay.classList.remove('show');
  setTimeout(() => { if (!actionOverlay.classList.contains('show')) actionOverlay.hidden = true; }, 470);
}
actionBtns.addEventListener('click', e => {
  const b = e.target.closest('.action-btn');
  if (!b) return;
  const a = actionList[Number(b.dataset.i)];
  hideActions();
  a.fn();
});
document.getElementById('actionCancel').addEventListener('click', hideActions);
actionOverlay.addEventListener('click', e => { if (e.target === actionOverlay) hideActions(); });
