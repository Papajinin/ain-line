// AIN Line 클라우드 v1: 구글 로그인 + 실시간 동기화 (Firebase Auth + Firestore) — AIN Days와 같은 방식
//  - 클라우드 위치: users/{uid} 문서(설정, 내 질문) + users/{uid}/entries/{날짜} 문서 하루에 하나씩
//  - 하루씩 따로 저장해서, 폰과 PC에서 서로 다른 날을 써도 덮어쓰지 않음
//  - 다른 기기에서 바꾸면 onSnapshot으로 바로 받아서 화면을 다시 그림
//  - 인터넷이 끊겨도 Firestore가 기기에 저장해 뒀다가 연결되면 올림
//  - 누가 쓸 수 있는지는 Firebase 관리 화면의 Firestore "규칙"에서 정함 (firestore.rules 참고)
//  - 아래 설정값이 비어 있으면 로그인 없이 이 기기에만 저장 (클라우드 연결 전 확인용)

// Firebase 관리 화면 → 프로젝트 설정 → 내 앱(웹)에서 복사해 넣는 값
const FIREBASE_CONFIG = {
  apiKey: '',
  authDomain: '',
  projectId: '',
  storageBucket: '',
  messagingSenderId: '',
  appId: ''
};

const UID_KEY = 'ainLine.uid';          // 이 기기에 마지막으로 로그인한 사람
const LOCAL_ONLY_SETTINGS = ['theme'];  // 기기마다 따로 두는 설정 (AIN Todo·Cost·Days와 같게)

const loginEl = document.getElementById('login');
const loginError = document.getElementById('loginError');

const cloud = {
  auth: null,
  db: null,
  user: null,
  ready: false,            // 첫 내려받기가 끝났는지 (끝나기 전에는 올리지 않음)
  gotUser: false,
  gotEntries: false,
  unsubs: [],
  shadowEntries: new Map(), // 클라우드에 있는 하루 기록 (날짜 → 글자) — 바뀐 것만 올리려고
  shadowUser: ''
};

function cloudConfigured() {
  return !!FIREBASE_CONFIG.apiKey;
}

// 키 순서와 상관없이 같은 내용인지 비교하려고 키를 정렬해서 글자로 만듦
function stableStringify(v) {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v).sort().filter(k => v[k] !== undefined).map(k => `${JSON.stringify(k)}:${stableStringify(v[k])}`).join(',')}}`;
  }
  return JSON.stringify(v);
}

function userPayload() {
  const settings = { ...state.settings };
  LOCAL_ONLY_SETTINGS.forEach(k => delete settings[k]);
  return { settings, questions: state.questions };
}

// ---------- 로그인 화면 ----------
function showLogin(msg) {
  loginError.textContent = msg || '';
  loginError.hidden = !msg;
  loginEl.hidden = false;
}
function hideLogin() {
  loginEl.hidden = true;
}
function showLoginError(err) {
  console.warn(err);
  showLogin('로그인하지 못했어요. 잠시 뒤 다시 해 주세요.' + (err && err.code ? ` (${err.code})` : ''));
}

// ---------- 시작 ----------
function initCloud() {
  if (!cloudConfigured()) return; // 클라우드 연결 전: 이 기기에만 저장
  if (!window.firebase) {
    // 인터넷이 없어 Firebase를 못 불러온 경우: 전에 로그인했으면 기기에 저장된 내용으로 계속
    if (!localStorage.getItem(UID_KEY)) showLogin('인터넷 연결을 확인해 주세요.');
    return;
  }
  firebase.initializeApp(FIREBASE_CONFIG);
  cloud.auth = firebase.auth();
  cloud.db = firebase.firestore();
  cloud.db.settings({ ignoreUndefinedProperties: true });
  cloud.db.enablePersistence({ synchronizeTabs: true }).catch(() => {});

  cloud.auth.getRedirectResult().catch(showLoginError);
  cloud.auth.onAuthStateChanged(user => {
    if (user) startSync(user);
    else {
      stopSync();
      showLogin();
    }
  });
  // 전에 로그인한 적이 없으면 확인을 기다리지 않고 바로 로그인 화면
  if (!localStorage.getItem(UID_KEY)) showLogin();
}

function signIn() {
  if (!cloud.auth) return;
  const provider = new firebase.auth.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  cloud.auth.signInWithPopup(provider).catch(err => {
    // 팝업이 막힌 환경(홈 화면 앱 등)이면 페이지 이동 방식으로 다시
    if (err.code === 'auth/popup-blocked' || err.code === 'auth/operation-not-supported-in-this-environment') {
      return cloud.auth.signInWithRedirect(provider).catch(showLoginError);
    }
    if (err.code !== 'auth/popup-closed-by-user' && err.code !== 'auth/cancelled-popup-request') showLoginError(err);
  });
}

// ---------- 동기화 ----------
function userRef() {
  return cloud.db.collection('users').doc(cloud.user.uid);
}

function startSync(user) {
  stopSync();
  cloud.user = user;

  // 이 기기에 다른 사람이 쓰던 내용이 있으면 비움
  // (처음 로그인할 때 이 기기에만 저장해 둔 기록은 그대로 두었다가 클라우드로 올림)
  const prev = localStorage.getItem(UID_KEY);
  if (prev && prev !== user.uid) resetLocalState();
  cloud.firstLink = !prev; // 이 기기에서 처음 로그인
  try { localStorage.setItem(UID_KEY, user.uid); } catch (e) {}

  const ref = userRef();
  // 허용된 계정인지 확인하면서, 처음 쓰는 사람이면 설정 문서를 만들어 둠
  ref.get().then(snap => {
    if (!snap.exists) {
      return ref.set({ ...userPayload(), createdAt: firebase.firestore.FieldValue.serverTimestamp() });
    }
  }).then(subscribe, err => {
    if (err.code === 'permission-denied') return denyAccount();
    subscribe(); // 인터넷이 없을 때 등: 기기에 저장된 내용으로 계속
  });
}

function subscribe() {
  if (!cloud.user) return;
  hideLogin();
  const ref = userRef();
  // 이 기기에서 처음 로그인할 때만: 로그인 전에 이 기기에만 저장해 둔 기록·질문을 클라우드로 올림
  // (그 뒤에는 클라우드가 기준. 다른 기기에서 지운 글이 되살아나지 않게)
  cloud.pendingLocal = cloud.firstLink ? { entries: { ...state.entries }, questions: state.questions.slice() } : null;
  cloud.unsubs.push(ref.onSnapshot(onUserSnap, onCloudError));
  cloud.unsubs.push(ref.collection('entries').onSnapshot(onEntriesSnap, onCloudError));
}

function onUserSnap(snap) {
  if (snap.exists) {
    const d = snap.data();
    const local = {};
    LOCAL_ONLY_SETTINGS.forEach(k => { local[k] = state.settings[k]; });
    state.settings = { ...state.settings, ...(d.settings || {}), ...local };
    state.questions = d.questions || [];
    // 처음 연결할 때: 이 기기에만 있던 질문을 (자리가 남으면) 뒤에 붙임
    if (cloud.pendingLocal && cloud.pendingLocal.questions.length) {
      cloud.pendingLocal.questions.forEach(q => {
        const clash = state.questions.some(x => x.id === q.id || x.k === q.k);
        if (!clash && state.questions.length < MAX_QUESTIONS) state.questions.push(q);
      });
      cloud.pendingLocal.questions = [];
    }
    cloud.shadowUser = stableStringify({ settings: userPayload().settings, questions: d.questions || [] });
    applyTheme(); // 다른 기기에서 테마 색을 바꿨으면 바로 반영
  }
  cloud.gotUser = true;
  afterSnapshot();
}

function onEntriesSnap(snap) {
  // 이 기기에서 방금 저장한 내용이 되돌아온 것이면 화면은 다시 그리지 않음 (쓰는 중인 칸이 흔들리지 않게)
  const echo = cloud.ready && snap.metadata.hasPendingWrites;
  const entries = {};
  cloud.shadowEntries = new Map();
  snap.forEach(doc => {
    const d = doc.data();
    entries[doc.id] = d;
    cloud.shadowEntries.set(doc.id, stableStringify(d));
  });
  // 처음 연결할 때: 이 기기에만 있던 날을 더해서 올림 (클라우드에 같은 날이 있으면 클라우드 것)
  let merged = false;
  if (cloud.pendingLocal) {
    Object.keys(cloud.pendingLocal.entries).forEach(k => { if (!entries[k]) { entries[k] = cloud.pendingLocal.entries[k]; merged = true; } });
    cloud.pendingLocal.entries = {};
  }
  state.entries = entries;
  cloud.gotEntries = true;
  afterSnapshot(merged, echo);
}

function afterSnapshot(merged, echo) {
  if (cloud.gotUser && cloud.gotEntries) {
    cloud.ready = true;
    if (cloud.pendingLocal && !cloud.pendingLocal.questions.length) cloud.pendingLocal = null;
    if (stableStringify(userPayload()) !== cloud.shadowUser) merged = true; // 붙인 질문 올리기
  }
  saveLocal();
  if (merged) cloudSave();
  if (!echo) refreshViews();
}

// 다른 기기에서 바뀐 내용을 화면에 반영 (끄는 중이거나 쓰는 중이면 건드리지 않음)
function refreshViews() {
  if (typeof qDrag !== 'undefined' && qDrag && qDrag.on) return;
  const a = document.activeElement;
  if (!(a && appEl.contains(a) && (a.tagName === 'TEXTAREA' || a.tagName === 'INPUT'))) render();
  if (!settingsOverlay.hidden) renderSettings();
}

// saveState()가 부름: 바뀐 날만 골라서 올림 (글을 다 지운 날은 클라우드에서도 지움)
function cloudSave() {
  if (!cloud.user || !cloud.ready) return;
  const ref = userRef();
  const ops = [];

  Object.keys(state.entries).forEach(k => {
    const data = state.entries[k];
    const json = stableStringify(data);
    if (cloud.shadowEntries.get(k) === json) return;
    ops.push(b => b.set(ref.collection('entries').doc(k), data));
    cloud.shadowEntries.set(k, json);
  });
  cloud.shadowEntries.forEach((_, k) => {
    if (state.entries[k]) return;
    ops.push(b => b.delete(ref.collection('entries').doc(k)));
    cloud.shadowEntries.delete(k);
  });
  const u = stableStringify(userPayload());
  if (u !== cloud.shadowUser) {
    ops.push(b => b.set(ref, userPayload(), { merge: true }));
    cloud.shadowUser = u;
  }

  for (let i = 0; i < ops.length; i += 400) {
    const batch = cloud.db.batch();
    ops.slice(i, i + 400).forEach(f => f(batch));
    batch.commit().catch(onCloudError);
  }
}

function onCloudError(err) {
  console.warn(err);
  if (err && err.code === 'permission-denied') denyAccount();
}

function stopSync() {
  cloud.unsubs.forEach(u => u());
  cloud.unsubs = [];
  cloud.user = null;
  cloud.ready = cloud.gotUser = cloud.gotEntries = false;
  cloud.shadowEntries = new Map();
  cloud.shadowUser = '';
}

// 허용 목록에 없는 계정
function denyAccount() {
  stopSync();
  try { localStorage.removeItem(UID_KEY); } catch (e) {}
  resetLocalState();
  cloud.auth.signOut();
  showLogin('이 계정은 사용할 수 없어요. 가족 계정으로 로그인해 주세요.');
}

// 기기에 저장된 기록을 비움 (화면 모드는 남김)
function resetLocalState() {
  state.entries = {};
  state.questions = [];
  state.settings = { theme: state.settings.theme, accent: 'blue', weekStart: 0 };
  saveLocal();
  applyTheme();
  render();
}

function confirmSignOut() {
  showActions('로그아웃하면 이 기기에서 기록이 보이지 않아요. 다시 로그인하면 그대로 돌아와요.', [
    { label: '로그아웃', danger: true, fn: () => {
      stopSync();
      try { localStorage.removeItem(UID_KEY); } catch (e) {}
      resetLocalState();
      hideOverlay(settingsOverlay);
      cloud.auth.signOut();
    } }
  ]);
}

document.getElementById('loginBtn').addEventListener('click', signIn);
