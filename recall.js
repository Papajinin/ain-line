// AIN Line 돌아보기 v1: 그날의 기록 카드, 달력, 그달 목록, 찾기, 지난 기록 읽기

// 달력 (돌아보기, 날짜 고르기 창이 같이 씀)
//  - 쓴 날은 은은한 테마 색 동그라미. 빨간 표시·빠뜨린 날 표시는 없음
//  - pick: 날짜 고르기 창 (지난날 모두 누를 수 있음). 아니면 쓴 날만 눌러서 읽기
function calHtml(month, opts) {
  const y = month.getFullYear(), m = month.getMonth();
  const now = parseYmd(ui.today);
  const atNow = y === now.getFullYear() && m === now.getMonth();
  const first = earliestMonth();
  const atFirst = !opts.pick && month <= first;
  const lead = weekLead(month);
  const last = new Date(y, m + 1, 0).getDate();
  let cells = '';
  for (let i = 0; i < lead; i++) cells += '<span></span>';
  for (let d = 1; d <= last; d++) {
    const k = ymd(new Date(y, m, d));
    const has = hasEntry(k);
    const cls = ['cd', has ? 'has' : '', k === ui.today ? 'today' : '', k === opts.sel ? 'sel' : ''].join(' ');
    if (k > ui.today) cells += `<button type="button" class="${cls}" disabled><span class="n">${d}</span></button>`;
    else if (opts.pick) cells += `<button type="button" class="${cls}" data-date="${k}"><span class="n">${d}</span></button>`;
    else if (has) cells += `<button type="button" class="${cls}" data-read="${k}" aria-label="${dateLabel(k)}"><span class="n">${d}</span></button>`;
    else cells += `<span class="${cls}"><span class="n">${d}</span></span>`;
  }
  return `
    <div class="cal-head">
      <h3 class="month num">${y}년 ${m + 1}월</h3>
      <div class="arrows">
        <button class="nav-btn" type="button" data-cal="-1" aria-label="지난달"${atFirst ? ' disabled' : ''}>${ICONS.back}</button>
        <button class="nav-btn" type="button" data-cal="1" aria-label="다음 달"${atNow ? ' disabled' : ''}>${ICONS.next}</button>
      </div>
    </div>
    <div class="cal-labels">${weekLabelsHtml()}</div>
    <div class="cal-grid">${cells}</div>`;
}

// 처음 쓴 달 (아직 없으면 이번 달)
function earliestMonth() {
  const keys = Object.keys(state.entries).filter(hasEntry).sort();
  const d = parseYmd(keys.length && keys[0] < ui.today ? keys[0] : ui.today);
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

// 그날의 기록: 일주일·한 달·100일·6개월·1년 전 중 쓴 날만, 가까운 것부터
function recallCards() {
  const t = parseYmd(ui.today);
  return [
    ['일주일 전', addDays(t, -7)],
    ['한 달 전', monthsAgo(t, 1)],
    ['100일 전', addDays(t, -100)],
    ['6개월 전', monthsAgo(t, 6)],
    ['1년 전', monthsAgo(t, 12)]
  ].map(([ago, d]) => ({ ago, k: ymd(d), d })).filter(c => hasEntry(c.k));
}
function shortDate(d) {
  const sameYear = d.getFullYear() === parseYmd(ui.today).getFullYear();
  return `${sameYear ? '' : d.getFullYear() + '년 '}${d.getMonth() + 1}월 ${d.getDate()}일`;
}

function subTop(title, right) {
  return `
    <header class="top sub">
      <button class="icon-btn" type="button" data-back aria-label="뒤로"><span class="icon-circle">${ICONS.back}</span></button>
      <h1><span>${title}</span></h1>
      ${right || '<span></span>'}
    </header>`;
}

function recallHtml() {
  if (!ui.calMonth) {
    const t = parseYmd(ui.today);
    ui.calMonth = new Date(t.getFullYear(), t.getMonth(), 1);
  }
  const cards = recallCards().map(c => `
    <button type="button" class="mcard" data-read="${c.k}">
      <span class="ago">${c.ago}</span><span class="md">${shortDate(c.d)}</span><span class="k">${escapeHtml(entryTitle(c.k))}</span>
    </button>`).join('');
  const y = ui.calMonth.getFullYear(), m = ui.calMonth.getMonth();
  const prefix = `${y}-${String(m + 1).padStart(2, '0')}-`;
  const rows = Object.keys(state.entries).filter(k => k.startsWith(prefix) && hasEntry(k)).sort().reverse().map(k => {
    const d = parseYmd(k);
    return `<button type="button" class="li" data-read="${k}"><span class="d num">${d.getMonth() + 1}/${d.getDate()} ${WEEK_NAMES[d.getDay()]}</span><span class="t">${escapeHtml(entryTitle(k))}</span>${ICONS.next}</button>`;
  }).join('');
  return `
    ${subTop('돌아보기', `<button class="icon-btn end" type="button" data-go="search" aria-label="찾기"><span class="icon-circle">${ICONS.search}</span></button>`)}
    ${cards ? `<h2 class="sec-title">그날의 기록</h2><div class="cards">${cards}</div>` : ''}
    <div class="cal" data-recall-cal>${calHtml(ui.calMonth, {})}</div>
    ${rows ? `<div class="list">${rows}</div>` : `<p class="note">${m + 1}월에는 쓴 기록이 없어요.</p>`}`;
}

function readHtml() {
  const k = ui.readKey;
  const shown = fieldsFor(k).filter(f => fieldText(k, f).trim());
  const body = shown.map(f => `
      <div class="field">
        <div class="f-head"><span class="letter">${escapeHtml(f.k)}</span><span class="f-name">${escapeHtml(f.name)}</span></div>
        <p class="f-text">${escapeHtml(fieldText(k, f))}</p>
      </div>`).join('');
  return `
    ${subTop(dateLabel(k), '<button class="text-btn" type="button" data-edit>고치기</button>')}
    ${body ? `<div class="fields">${body}</div>` : '<p class="note">이 날은 쓴 기록이 없어요.</p>'}`;
}

// ---------- 찾기 ----------
function searchHtml() {
  return `
    ${subTop('찾기')}
    <label class="search">${ICONS.search}<input id="searchInput" type="search" value="${escapeHtml(ui.q)}" placeholder="모든 기록에서 찾기" aria-label="찾을 글자" autocomplete="off" enterkeyhint="search"></label>
    <div id="searchRes">${searchResHtml()}</div>`;
}

function searchHits(q) {
  const needle = q.toLowerCase(), hits = [];
  Object.keys(state.entries).sort().reverse().forEach(k => {
    fieldsFor(k).forEach(f => {
      const t = fieldText(k, f);
      if (t && t.toLowerCase().includes(needle)) hits.push({ k, f, t });
    });
  });
  return hits;
}
// 찾은 글자를 테마 색 굵은 글씨로 (대문자·소문자 구분 없이)
function markHtml(text, q) {
  const low = text.toLowerCase(), needle = q.toLowerCase();
  let out = '', i = 0, j;
  while ((j = low.indexOf(needle, i)) !== -1) {
    out += escapeHtml(text.slice(i, j)) + '<mark>' + escapeHtml(text.slice(j, j + q.length)) + '</mark>';
    i = j + q.length;
  }
  return out + escapeHtml(text.slice(i));
}
function searchResHtml() {
  const q = ui.q.trim();
  if (!q) return '';
  const hits = searchHits(q);
  const rows = hits.map(h => {
    const d = parseYmd(h.k);
    return `<button type="button" class="res" data-read="${h.k}">
      <span class="rh"><span class="num">${shortDate(d)} ${WEEK_NAMES[d.getDay()]}</span><span class="letter sm">${escapeHtml(h.f.k)}</span><span class="rn">${escapeHtml(h.f.name)}</span></span>
      <p>${markHtml(h.t, q)}</p>
    </button>`;
  }).join('');
  return `<div class="res-count fade-in">${hits.length ? hits.length + '개 찾음' : '찾은 기록이 없어요'}</div>${rows ? `<div class="list flush fade-in">${rows}</div>` : ''}`;
}

appEl.addEventListener('input', e => {
  if (e.target.id !== 'searchInput') return;
  ui.q = e.target.value;
  document.getElementById('searchRes').innerHTML = searchResHtml();
});
appEl.addEventListener('keydown', e => {
  if (e.target.id === 'searchInput' && e.key === 'Enter') e.target.blur(); // 키보드 내리기
});
