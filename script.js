/* ==========================================================================
   톡톡 (TalkTalk) - Supabase 실시간 채팅
   ========================================================================== */

const SUPABASE_URL = 'https://yrndqghsdtxoajgxvqrv.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlybmRxZ2hzZHR4b2FqZ3h2cXJ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyNjM3NTksImV4cCI6MjA5NDgzOTc1OX0.jEjISPblbaz-EFTE63kj8wG85lqWSdr_HAloukwzjnc';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ============================================================
   전역 상태
   ============================================================ */
let currentTab = 'friends';
let currentRoom = { id: null, isGroup: false, name: '' };
let roomOpen = false;
let searchQuery = "";
let chatSearchQuery = "";
let profileTargetId = null;
let currentUserId = null;
let currentUserProfile = null;
let friendsList = [];
let blockedList = []; // 차단 목록 (user_id 배열)
let chatRoomsList = [];
let messagesSubscription = null;
let currentDegree = 0;
let flipX = 1;
let flipY = 1;
let textEditMode = 'name';
let selectedMessageId = null;
let viewerContextMessageId = null;

/* ============================================================
   폰트 / 테마 설정
   ============================================================ */
const FONT_LIST = [
  { id: 'system',   name: '기본체',     css: "-apple-system,'Apple SD Gothic Neo','Noto Sans KR',sans-serif", preview: '가나다라 마바사아' },
  { id: 'gothic',   name: '고딕체',     css: "'Malgun Gothic','맑은 고딕',sans-serif",                         preview: '가나다라 마바사아' },
  { id: 'serif',    name: '바탕체',     css: "'Batang','바탕',Georgia,serif",                                   preview: '가나다라 마바사아' },
  { id: 'nanum',    name: '나눔고딕',   css: "'Nanum Gothic',sans-serif",                                       preview: '가나다라 마바사아' },
  { id: 'mono',     name: '모노체',     css: "'Courier New',Courier,monospace",                                 preview: '가나다라 마바사아' },
];

let currentFontId   = localStorage.getItem('tt_font_id')   || 'system';
let currentFontSize = parseInt(localStorage.getItem('tt_font_size') || '15');
let currentTheme    = localStorage.getItem('tt_theme')      || 'white';

function applyFont() {
  const f = FONT_LIST.find(x => x.id === currentFontId) || FONT_LIST[0];
  document.documentElement.style.setProperty('--app-font', f.css);
  document.documentElement.style.setProperty('--app-font-size', currentFontSize + 'px');
  document.body.style.fontFamily = f.css;
}
function applyTheme() {
  if (currentTheme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
  } else if (currentTheme === 'pokemon') {
    document.documentElement.setAttribute('data-theme', 'pokemon');
  } else {
    document.documentElement.removeAttribute('data-theme'); // white는 기본
  }
}
applyFont();
applyTheme();

/* ============================================================
   도우미
   ============================================================ */
function timeNow() {
  const d = new Date();
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h >= 12 ? '오후' : '오전'} ${h % 12 || 12}:${m}`;
}
function dateStr() {
  const d = new Date();
  return `${d.getFullYear()}년 ${d.getMonth()+1}월 ${d.getDate()}일`;
}
function showToast(title, message, color='#333') {
  const tc = document.getElementById('toast-container');
  if (!tc) return;
  const t = document.createElement('div');
  t.className = 'toast';
  t.innerHTML = `<div class="toast-avatar avatar-base"><i class="ti ti-info-circle"></i></div>
                 <div class="toast-body"><div class="toast-name">${title}</div><div class="toast-msg">${message}</div></div>`;
  tc.appendChild(t);
  setTimeout(() => { t.classList.add('hiding'); setTimeout(() => t.remove(), 200); }, 2500);
}
function showChatNotification(name, text, avatarUrl) {
  const tc = document.getElementById('toast-container');
  if (!tc) return;
  const t = document.createElement('div');
  t.className = 'toast';
  const avStyle = avatarUrl ? `style="background-image:url('${avatarUrl}'); background-size:cover; background-position:center;"` : '';
  t.innerHTML = `<div class="toast-avatar avatar-base" ${avStyle}>${avatarUrl?'':'<i class="ti ti-user"></i>'}</div>
                 <div class="toast-body"><div class="toast-name">${name}</div><div class="toast-msg">${text}</div></div>`;
  t.onclick = () => {
    const room = chatRoomsList.find(r => r.name === name);
    if (room) openRoomFromData(room.id);
    t.remove();
  };
  tc.appendChild(t);
  setTimeout(() => { if (t.parentNode) { t.classList.add('hiding'); setTimeout(() => t.remove(), 200); } }, 3500);
}
function applyAvatarStyle(element, imgUrl) {
  if (!element) return;
  if (imgUrl) {
    element.style.backgroundImage = `url('${imgUrl}')`;
    element.style.backgroundSize = 'cover';
    element.style.backgroundPosition = 'center';
    element.innerHTML = '';
  } else {
    element.style.backgroundImage = 'none';
    element.innerHTML = '<i class="ti ti-user"></i>';
  }
}

/* ============================================================
   인증 & 초기화
   ============================================================ */
window.addEventListener('DOMContentLoaded', async () => { await initApp(); });

async function initApp() {
  const authScreen = document.getElementById('auth-screen');
  const splashLogo = document.getElementById('splash-logo');
  const savedSession = localStorage.getItem('talktalk_session');
  
  if (savedSession) {
    try {
      const { data: { session }, error } = await supabaseClient.auth.getSession();
      if (!error && session?.user) {
        currentUserId = session.user.id;
        if (authScreen) authScreen.style.display = 'none';
        await loadUserData(session.user.id);
        showToast("환영합니다", `${currentUserProfile?.name || '사용자'}님, 자동 로그인되었습니다.`, "#fee500");
        return;
      }
    } catch(e) {}
  }
  
  // 로그인 안 된 경우에만 스플래시 표시
  if (authScreen) {
    authScreen.style.display = 'flex';
    if (splashLogo) splashLogo.style.display = 'flex';
  }
  setTimeout(() => {
    if (splashLogo) splashLogo.style.display = 'none';
    toggleAuthForm('login');
  }, 1500);
}

async function loadUserData(userId) {
  const { data: profile } = await supabaseClient.from('profiles').select('*').eq('id', userId).single();
  if (profile) { currentUserProfile = profile; syncMyProfileDOM(); }
  
  await Promise.all([loadBlockedList(), loadFriends(), loadChatRooms()]); 
  
  renderFriends();
  renderChats();
  checkUnreadDots();
  startGlobalRealtime();
  if (currentUserProfile?.is_admin) {
    const btn = document.getElementById('admin-panel-btn');
    if (btn) btn.style.display = 'flex';
  }

  // OneSignal player_id 저장
  window.OneSignalDeferred = window.OneSignalDeferred || [];
  OneSignalDeferred.push(async function(OneSignal) {
    const playerId = await OneSignal.User.PushSubscription.id;
    if (playerId) {
      await supabaseClient.from('profiles')
        .update({ onesignal_player_id: playerId })
        .eq('id', userId);
    }
  });
}

async function loadBlockedList() {
  const { data } = await supabaseClient
    .from('blocks')
    .select('blocked_id')
    .eq('user_id', currentUserId);
  blockedList = data?.map(b => b.blocked_id) || [];
}

async function loadFriends() {
  const { data: friendships } = await supabaseClient
    .from('friendships')
    .select('friend_id, profiles:friend_id(*)')
    .eq('user_id', currentUserId)
    .eq('status', 'accepted');
  friendsList = friendships?.map(f => ({ id: f.friend_id, ...f.profiles })) || [];
  const { data: allProfiles } = await supabaseClient.from('profiles').select('id, username, name, status, avatar');
  window._allProfiles = allProfiles || [];
}

async function loadChatRooms() {
  const { data: rooms } = await supabaseClient
    .from('chat_room_members')
    .select('room_id, chat_rooms(*), user_id')
    .eq('user_id', currentUserId);
  chatRoomsList = rooms?.map(r => ({
    ...r.chat_rooms,
    members: rooms.filter(m => m.room_id === r.room_id).map(m => m.user_id)
  })) || [];
}

function syncMyProfileDOM() {
  if (!currentUserProfile) return;
  ['my-name-display','more-name-display'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = currentUserProfile.name;
  });
  ['my-status-display','more-status-display'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = currentUserProfile.status || '';
  });
  applyAvatarStyle(document.getElementById('my-avatar-display'), currentUserProfile.avatar);
  applyAvatarStyle(document.getElementById('more-avatar-display'), currentUserProfile.avatar);
}

/* ============================================================
   인증 폼
   ============================================================ */
function toggleAuthForm(mode) {
  const loginCard = document.getElementById('login-card');
  const registerCard = document.getElementById('register-card');
  if (mode === 'login') {
    registerCard?.classList.remove('active');
    loginCard?.classList.add('active');
  } else {
    loginCard?.classList.remove('active');
    registerCard?.classList.add('active');
  }
}

async function handleRegister() {
  const username = document.getElementById('reg-id').value.trim();
  const pw = document.getElementById('reg-pw').value.trim();
  const pwConfirm = document.getElementById('reg-pw-confirm').value.trim();
  const name = document.getElementById('reg-name').value.trim();
  if (!username || !pw || !pwConfirm || !name) { alert("모든 빈칸을 입력해주세요."); return; }
  if (pw !== pwConfirm) { alert("비밀번호가 일치하지 않습니다."); return; }
  if (pw.length < 4) { alert("비밀번호는 4자 이상 입력해주세요."); return; }

  const { data: existingUser } = await supabaseClient.from('profiles').select('username').eq('username', username).maybeSingle();
  if (existingUser) { alert("이미 존재하는 아이디입니다."); return; }

  const fakeEmail = username + "@talktalk.app";
  const { data, error } = await supabaseClient.auth.signUp({
    email: fakeEmail, password: pw,
    options: { data: { username, name } }
  });
  if (error || !data.user) { alert("회원가입에 실패했습니다."); return; }

  const { error: profileError } = await supabaseClient.from('profiles').insert({
    id: data.user.id, username, name, status: ''
  });
  if (profileError) { alert("회원가입에 실패했습니다."); return; }

  localStorage.setItem('talktalk_session', data.user.id);
  currentUserId = data.user.id;
  await loadUserData(data.user.id);
  document.getElementById('auth-screen').style.display = 'none';
  showToast("가입 축하", name + "님의 아이디가 생성되었습니다.", "#2ed573");
  ['reg-id','reg-pw','reg-pw-confirm','reg-name'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
}

async function handleLogin() {
  const username = document.getElementById('login-id').value.trim();
  const pw = document.getElementById('login-pw').value.trim();
  if (!username || !pw) { alert("아이디와 비밀번호를 모두 입력해주세요."); return; }

  const { data: profile, error: profileError } = await supabaseClient
    .from('profiles').select('id, username, name').eq('username', username).maybeSingle();
  if (profileError || !profile) { alert("아이디 또는 비밀번호가 일치하지 않습니다."); return; }

  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email: username + "@talktalk.app", password: pw
  });
  if (error) { alert("아이디 또는 비밀번호가 일치하지 않습니다."); return; }

  localStorage.setItem('talktalk_session', data.user.id);
  currentUserId = data.user.id;
  await loadUserData(data.user.id);
  document.getElementById('auth-screen').style.display = 'none';
  showToast("로그인 성공", profile.name + "님 반갑습니다!", "#fee500");
  ['login-id','login-pw'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
}

async function handleLogout() {
  await supabaseClient.auth.signOut();
  localStorage.removeItem('talktalk_session');
  currentUserId = null; currentUserProfile = null;
  const authScreen = document.getElementById('auth-screen');
  if (authScreen) {
    authScreen.style.display = 'flex';
    const splash = document.getElementById('splash-logo');
    if (splash) splash.style.display = 'flex';
  }
  toggleAuthForm('login');
  switchTab('friends');
  showToast("로그아웃", "안전하게 로그아웃되었습니다.", "#ff4757");
}

/* ============================================================
   친구 렌더링
   ============================================================ */
function renderFriends() {
  const container = document.getElementById('friends-list-container');
  if (!container) return;
  const filtered = friendsList.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()));
  const favoriteFriends = filtered.filter(f => f.isFavorite);
  const normalFriends   = filtered.filter(f => !f.isFavorite);

  let html = "";
  if (favoriteFriends.length > 0) {
    html += `<div class="favorite-section"><div class="section-title">즐겨찾기 ${favoriteFriends.length}</div>`;
    html += favoriteFriends.map(f => makeFriendItemHTML(f)).join('');
    html += `</div>`;
  }
  html += `<div class="normal-section"><div class="section-title">친구 ${normalFriends.length}</div>`;
  if (normalFriends.length === 0 && favoriteFriends.length === 0)
    html += `<div class="empty-state"><p>등록된 친구가 없습니다.</p></div>`;
  else html += normalFriends.map(f => makeFriendItemHTML(f)).join('');
  html += `</div>`;

  const recs = renderRecommendSection();
  if (recs) html += recs;
  container.innerHTML = html;
}

function renderRecommendSection() {
  if (!window._allProfiles || window._allProfiles.length === 0) return '';
  const friendIds = new Set(friendsList.map(f => f.id));
  const recommends = window._allProfiles.filter(p => p.id !== currentUserId && !friendIds.has(p.id));
  if (recommends.length === 0) return '';
  let html = `<div class="normal-section"><div class="section-title" style="color:#888;">추천 친구 ${recommends.length}</div>`;
  html += recommends.map(p => `
    <div class="friend-item" style="opacity:0.75;">
      <div class="avatar-sm avatar-base">${p.avatar ? `<div style="width:100%;height:100%;background:url('${p.avatar}') center/cover;border-radius:50%;"></div>` : '<i class="ti ti-user"></i>'}</div>
      <div style="flex:1;"><div class="fi-name">${p.name}</div><div class="fi-status">${p.status||''}</div></div>
      <button onclick="quickAddFriend('${p.id}','${p.username}','${p.name}')" style="background:#fee500;border:none;border-radius:8px;padding:5px 10px;font-size:12px;font-weight:700;cursor:pointer;">추가</button>
    </div>
  `).join('');
  html += `</div>`;
  return html;
}

async function quickAddFriend(friendId, friendUsername, friendName) {
  if (friendsList.some(f => f.id === friendId)) { showToast("알림","이미 친구입니다.","#888"); return; }
  await supabaseClient.from('friendships').insert({ user_id: currentUserId, friend_id: friendId, status: 'accepted' });
  const { data: room } = await supabaseClient.from('chat_rooms').insert({
    name: friendName, is_group: false, created_by: currentUserId
  }).select().single();
  if (room) {
    await supabaseClient.from('chat_room_members').insert([
      { room_id: room.id, user_id: currentUserId },
      { room_id: room.id, user_id: friendId }
    ]);
    chatRoomsList.push(room);
  }
  const { data: fullProfile } = await supabaseClient.from('profiles').select('*').eq('id', friendId).single();
  friendsList.push({ id: friendId, username: friendUsername, name: friendName, status: fullProfile?.status||'', avatar: fullProfile?.avatar||null, isFavorite: false });
  renderFriends(); renderChats();
  showToast("친구 추가", `${friendName}님과 친구가 되었습니다!`, "#2ed573");
}

function makeFriendItemHTML(f) {
  const isBlocked = blockedList.includes(f.id);
  const avatarStyle = f.avatar ? `style="background-image:url('${f.avatar}'); background-size:cover; background-position:center;"` : '';
  const avatarIcon = f.avatar ? '' : '<i class="ti ti-user"></i>';
  const starBadge = f.isFavorite ? `<i class="ti ti-star-filled fi-star-badge"></i>` : '';
  const blockedBadge = isBlocked ? `<span style="font-size:10px;color:#ff4757;margin-left:4px;">차단됨</span>` : '';
  return `<div class="friend-item" onclick="openProfileCard('${f.id}')">
    <div class="avatar-sm avatar-base" ${avatarStyle}>${avatarIcon}</div>
    <div style="flex:1;min-width:0;">
      <div class="fi-name" style="display:flex;align-items:center;gap:4px;">${f.name}${blockedBadge}</div>
      <div class="fi-status">${isBlocked ? '차단된 친구' : (f.status||'')}</div>
    </div>
    ${starBadge}
  </div>`;
}

/* ============================================================
   차단 기능
   ============================================================ */
async function blockFriend(friendId) {
  if (blockedList.includes(friendId)) {
    showToast("알림","이미 차단된 사용자입니다.","#888");
    return;
  }
  await supabaseClient.from('blocks').insert({ user_id: currentUserId, blocked_id: friendId });
  blockedList.push(friendId);
  renderFriends();
  renderManageList();
  const friend = friendsList.find(f => f.id === friendId);
  showToast("차단", `${friend?.name||'사용자'}님을 차단했습니다.`, "#ff4757");
  closeProfileCard();
}

async function unblockFriend(friendId) {
  await supabaseClient.from('blocks').delete().eq('user_id', currentUserId).eq('blocked_id', friendId);
  blockedList = blockedList.filter(id => id !== friendId);
  renderFriends();
  renderManageList();
  const friend = friendsList.find(f => f.id === friendId);
  showToast("차단 해제", `${friend?.name||'사용자'}님의 차단을 해제했습니다.`, "#2ed573");
}

/* ============================================================
   스와이프 (고정 / 나가기만)
   ============================================================ */
function closeAllSwipes(except) {
  document.querySelectorAll('.chat-item-wrapper.swiped').forEach(el => {
    if (el !== except) el.classList.remove('swiped');
  });
}

function attachSwipeToItem(wrapper) {
  let startX = 0, startY = 0, isSwiping = false, dirLocked = false, isHoriz = false;
  const MIN_SWIPE = 30;

  wrapper.addEventListener('touchstart', e => {
    startX = e.touches[0].clientX; startY = e.touches[0].clientY;
    isSwiping = true; dirLocked = false; isHoriz = false;
  }, { passive: true });

  wrapper.addEventListener('touchmove', e => {
    if (!isSwiping) return;
    const dx = e.touches[0].clientX - startX;
    const dy = e.touches[0].clientY - startY;
    if (!dirLocked && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) {
      isHoriz = Math.abs(dx) > Math.abs(dy); dirLocked = true;
    }
    if (isHoriz) e.preventDefault();
  }, { passive: false });

  wrapper.addEventListener('touchend', e => {
    if (!isSwiping || !dirLocked || !isHoriz) { isSwiping = false; return; }
    isSwiping = false;
    const dx = e.changedTouches[0].clientX - startX;
    const swiped = wrapper.classList.contains('swiped');
    if (!swiped && dx < -MIN_SWIPE) { closeAllSwipes(wrapper); wrapper.classList.add('swiped'); }
    else if (swiped && dx > MIN_SWIPE) { wrapper.classList.remove('swiped'); }
  }, { passive: true });

  let mouseDown = false;
  wrapper.addEventListener('mousedown', e => { startX = e.clientX; startY = e.clientY; mouseDown = true; dirLocked = false; isHoriz = false; });
  document.addEventListener('mousemove', e => {
    if (!mouseDown) return;
    const dx = e.clientX - startX; const dy = e.clientY - startY;
    if (!dirLocked && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) { isHoriz = Math.abs(dx) > Math.abs(dy); dirLocked = true; }
  });
  document.addEventListener('mouseup', e => {
    if (!mouseDown || !dirLocked || !isHoriz) { mouseDown = false; return; }
    mouseDown = false;
    const dx = e.clientX - startX;
    const swiped = wrapper.classList.contains('swiped');
    if (!swiped && dx < -MIN_SWIPE) { closeAllSwipes(wrapper); wrapper.classList.add('swiped'); }
    else if (swiped && dx > MIN_SWIPE) { wrapper.classList.remove('swiped'); }
  });
}

document.addEventListener('touchstart', e => {
  if (!e.target.closest('.chat-item-wrapper')) closeAllSwipes(null);
}, { passive: true });
document.addEventListener('mousedown', e => {
  if (!e.target.closest('.chat-item-wrapper')) closeAllSwipes(null);
});

/* ============================================================
   채팅 목록 렌더링
   ============================================================ */
let isRenderingChats = false;

async function renderChats() {
  if (isRenderingChats) return;
  isRenderingChats = true;

  const container = document.getElementById('chats-list-container');
  if (!container) { isRenderingChats = false; return; }
  const sorted = [...chatRoomsList].sort((a, b) => (b.is_pinned ? 1 : 0) - (a.is_pinned ? 1 : 0));
  const filtered = sorted.filter(c => c.name?.toLowerCase().includes(chatSearchQuery.toLowerCase()));
  if (filtered.length === 0) {
    container.innerHTML = `<div class="empty-state"><p>채팅방이 없습니다.</p></div>`;
    isRenderingChats = false;
    return;
  }
  const roomIds = filtered.map(r => r.id);
  const { data: allLastMsgs } = await supabaseClient
    .from('messages')
    .select('room_id, content, type, created_at')
    .in('room_id', roomIds)
    .order('created_at', { ascending: false });
  const lastMsgMap = {};
  for (const msg of allLastMsgs || []) {
    if (!lastMsgMap[msg.room_id]) lastMsgMap[msg.room_id] = msg;
  }
  container.innerHTML = '';
  for (const room of filtered) {
    const lastChat = lastMsgMap[room.id];
    if (!lastChat) continue;
    let displayMsg = lastChat.type === 'image' ? '📸 사진' : (lastChat.content?.substring(0, 30) || '');
    let displayTime = '';
    if (lastChat.created_at) {
      const d = new Date(lastChat.created_at);
      const h = d.getHours(); const m = String(d.getMinutes()).padStart(2, '0');
      displayTime = `${h >= 12 ? '오후' : '오전'} ${h % 12 || 12}:${m}`;
    }
    const isPinned = room.is_pinned || false;
    let avatarHtml = '';
    if (!room.is_group) {
      const otherId = room.members?.find(id => id !== currentUserId);
      const other = friendsList.find(f => f.id === otherId);
      if (other?.avatar) {
        avatarHtml = `<div class="chat-avatar avatar-base" style="background-image:url('${other.avatar}'); background-size:cover; background-position:center;"></div>`;
      } else {
        avatarHtml = `<div class="chat-avatar avatar-base"><i class="ti ti-user"></i></div>`;
      }
    } else {
      avatarHtml = `<div class="chat-avatar avatar-base"><i class="ti ti-users"></i></div>`;
    }
    const wrapper = document.createElement('div');
    wrapper.className = 'chat-item-wrapper';
    wrapper.setAttribute('data-id', room.id);
    wrapper.innerHTML = `
      <div class="chat-swipe-actions">
        <button class="swa-btn swa-pin" onclick="chatSwipeAction('pin','${room.id}')">
          <i class="ti ${isPinned ? 'ti-pin-filled' : 'ti-pin'}"></i><span>${isPinned ? '해제' : '고정'}</span>
        </button>
        <button class="swa-btn swa-leave" onclick="chatSwipeAction('leave','${room.id}')">
          <i class="ti ti-door-exit"></i><span>나가기</span>
        </button>
      </div>
      <div class="chat-item${isPinned ? ' pinned' : ''}" onclick="openRoomFromData('${room.id}')">
        ${avatarHtml}
        <div class="ci-info">
          <div class="ci-row1">
            <span class="ci-name">${isPinned ? '📌 ' : ''}${room.name || (room.is_group ? '단체방' : '대화')}</span>
            <span class="ci-time">${displayTime}</span>
          </div>
          <div class="ci-row2">
            <span class="ci-preview">${displayMsg}</span>
          </div>
        </div>
      </div>
    `;
    container.appendChild(wrapper);
    attachSwipeToItem(wrapper);
  }
  isRenderingChats = false;
}

async function chatSwipeAction(action, roomId) {
  const room = chatRoomsList.find(r => r.id === roomId);
  if (!room) return;
  closeAllSwipes(null);
  
  if (action === 'pin') {
    room.is_pinned = !room.is_pinned;
    chatRoomsList.sort((a, b) => (b.is_pinned ? 1 : 0) - (a.is_pinned ? 1 : 0));
    showToast("채팅방", room.is_pinned ? "상단에 고정되었습니다." : "고정이 해제되었습니다.", "#5352ed");
    renderChats();
    
  } else if (action === 'leave') {
    if (!confirm("채팅방에서 나가시겠습니까? 나가면 대화 내용이 삭제됩니다.")) return;
    
    // 1. 내가 보낸 메시지 삭제
    await supabaseClient.from('messages').delete().eq('room_id', roomId).eq('sender_id', currentUserId);
    
    // 2. 채팅방 멤버에서 제거
    await supabaseClient.from('chat_room_members').delete().eq('room_id', roomId).eq('user_id', currentUserId);
    
    // 3. 방에 아무도 없으면 방 자체도 삭제 (선택 사항)
    const { data: remainingMembers, count } = await supabaseClient
      .from('chat_room_members')
      .select('*', { count: 'exact', head: true })
      .eq('room_id', roomId);
    
    if (count === 0) {
      await supabaseClient.from('chat_rooms').delete().eq('id', roomId);
    }
    
    chatRoomsList = chatRoomsList.filter(r => r.id !== roomId);
    showToast("채팅방", "채팅방에서 나갔습니다. 내 대화 내용이 삭제되었습니다.", "#ff4757");
    renderChats();
  }
}

/* ============================================================
   채팅방 열기
   ============================================================ */
async function openRoomWithFriend(friendId) {
  let room = chatRoomsList.find(r => !r.is_group && r.members?.includes(friendId) && r.members?.includes(currentUserId));
  if (!room) {
    const { data: memberRows } = await supabaseClient.from('chat_room_members').select('room_id').eq('user_id', friendId);
    if (memberRows?.length > 0) {
      const friendRoomIds = memberRows.map(r => r.room_id);
      const { data: myRows } = await supabaseClient.from('chat_room_members').select('room_id').eq('user_id', currentUserId).in('room_id', friendRoomIds);
      if (myRows?.length > 0) {
        const { data: roomData } = await supabaseClient.from('chat_rooms').select('*').eq('id', myRows[0].room_id).eq('is_group', false).single();
        if (roomData) { roomData.members = [currentUserId, friendId]; chatRoomsList.push(roomData); room = roomData; }
      }
    }
  }
  if (!room) {
    const friend = friendsList.find(f => f.id === friendId);
    if (!friend) { showToast("오류","친구 정보를 찾을 수 없습니다.","#ff4757"); return; }
    const { data: newRoom, error } = await supabaseClient.from('chat_rooms').insert({ name: friend.name, is_group: false, created_by: currentUserId }).select().single();
    if (error) { showToast("오류","채팅방을 만들 수 없습니다.","#ff4757"); return; }
    await supabaseClient.from('chat_room_members').insert([{ room_id: newRoom.id, user_id: currentUserId },{ room_id: newRoom.id, user_id: friendId }]);
    newRoom.members = [currentUserId, friendId];
    chatRoomsList.push(newRoom);
    room = newRoom;
  }
  openRoomFromData(room.id);
}

async function openRoomFromData(roomId) {
  let room = chatRoomsList.find(r => r.id === roomId);
  if (!room) {
    const { data: roomData } = await supabaseClient.from('chat_rooms').select('*').eq('id', roomId).single();
    if (!roomData) { showToast("오류","채팅방을 찾을 수 없습니다.","#ff4757"); return; }
    room = roomData;
    chatRoomsList.push(room);
  }
  
  // 멤버 정보 추가
  if (!room.members || room.members.length === 0) {
    const { data: memberRows } = await supabaseClient
      .from('chat_room_members')
      .select('user_id')
      .eq('room_id', room.id);
    room.members = memberRows?.map(r => r.user_id) || [];
  }
  
  currentRoom = room;
  roomOpen = true;

  // 👇 여기 수정: 멤버 수 표시
  const memberCount = room.members?.length || 0;
  const roomTitle = room.name || (room.is_group ? '단체방' : '대화');
  document.getElementById('room-title').innerHTML = `${roomTitle} <span style="font-size:12px; opacity:0.7; font-weight:normal;">(${memberCount})</span>`;
  
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-room').classList.add('active');
  document.getElementById('tab-bar').style.display = 'none';

  if (messagesSubscription) {
    await supabaseClient.removeChannel(messagesSubscription);
    messagesSubscription = null;
  }

  messagesSubscription = supabaseClient
    .channel(`messages-room-${room.id}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
      const msg = payload.new;
      if (msg.room_id !== room.id) return;
      if (msg.sender_id === currentUserId) return;
      if (blockedList.includes(msg.sender_id)) return;
      if (!roomOpen || currentRoom.id !== room.id) {
        const sender = friendsList.find(f => f.id === msg.sender_id);
        showChatNotification(sender?.name || '누군가', msg.content || '사진', sender?.avatar);
      } else {
        appendMessageToUI(msg);
      }
    })
    .subscribe();

  await loadMessages(room.id);
}

async function loadMessages(roomId) {
  const container = document.getElementById('room-messages');
  if (!container) return;
  
  // 로딩 표시
  container.innerHTML = '<div class="loading-spinner"></div><div style="text-align:center; padding:20px;">메시지 불러오는 중...</div>';
  
  // 1. 메시지만 먼저 가져오기
  const { data: messages } = await supabaseClient
    .from('messages')
    .select('*')
    .eq('room_id', roomId)
    .order('created_at', { ascending: true });
  
  // 2. 방 멤버 정보 (친구 목록에서 재사용)
  const memberIds = currentRoom.members || [];
  
  // 3. 프로필 정보 (친구 목록 + 본인)
  const memberProfiles = memberIds.map(id => {
    if (id === currentUserId) return currentUserProfile;
    return friendsList.find(f => f.id === id);
  }).filter(Boolean);
  
  window._roomMemberProfiles = memberProfiles;
  
  // 4. 메시지 렌더링
  container.innerHTML = `<div class="date-sep"><span>${dateStr()}</span></div>`;
  
  for (const msg of messages || []) {
    if (msg.deleted_for_all) continue;
    if (blockedList.includes(msg.sender_id)) continue;
    appendMessageToUI(msg);
  }
  
  container.scrollTop = container.scrollHeight;
}

function appendMessageToUI(msg) {
  const container = document.getElementById('room-messages');
  if (!container) return;
  if (msg.id && container.querySelector(`[data-msg-id="${msg.id}"]`)) return;

  const isMine = msg.sender_id === currentUserId;
  const row = document.createElement('div');
  row.className = `msg-row ${isMine ? 'mine' : 'other'}`;
  if (msg.id) row.setAttribute('data-msg-id', msg.id);

  // 상대방 아바타
  if (!isMine) {
    const profiles = window._roomMemberProfiles || [];
    const senderProfile = profiles.find(p => p.id === msg.sender_id);
    const senderFriend = friendsList.find(f => f.id === msg.sender_id);
    const senderAv = senderProfile?.avatar || senderFriend?.avatar || null;
    const senderName = senderProfile?.name || senderFriend?.name || '?';

    const avEl = document.createElement('div');
    avEl.className = 'msg-av avatar-base';
    if (senderAv) {
      avEl.style.backgroundImage = `url('${senderAv}')`;
      avEl.style.backgroundSize = 'cover';
      avEl.style.backgroundPosition = 'center';
    } else {
      avEl.innerHTML = '<i class="ti ti-user"></i>';
    }
    row.appendChild(avEl);

    // 단체방이면 이름도 표시
    if (currentRoom.is_group) {
      const bwrap = document.createElement('div');
      bwrap.className = 'bwrap';
      const nameEl = document.createElement('div');
      nameEl.className = 'msg-sender-name';
      nameEl.textContent = senderName;
      const bubble = makeBubbleEl(msg, isMine);
      const meta = makeMetaEl();
      bwrap.appendChild(nameEl);
      bwrap.appendChild(bubble);
      bwrap.appendChild(meta);
      row.appendChild(bwrap);
      container.appendChild(row);
      container.scrollTop = container.scrollHeight;
      return;
    }
  }

  const bwrap = document.createElement('div');
  bwrap.className = 'bwrap';
  const bubble = makeBubbleEl(msg, isMine);
  const meta = makeMetaEl();
  bwrap.appendChild(bubble);
  bwrap.appendChild(meta);
  row.appendChild(bwrap);
  container.appendChild(row);
  container.scrollTop = container.scrollHeight;
}

function makeBubbleEl(msg, isMine) {
  const bubble = document.createElement('div');
  bubble.className = `bubble ${isMine ? 'mine' : 'other'}`;
  if (msg.type === 'image' && msg.image_url) {
    bubble.classList.add('image-bubble');
    bubble.innerHTML = `<img src="${msg.image_url}" alt="이미지" style="max-width:200px; max-height:200px; border-radius:8px;">`;
    bubble.onclick = () => openImageViewer(msg.image_url, msg.id);
  } else {
    bubble.textContent = msg.content || '사진';
    bubble.onclick = (e) => { e.stopPropagation(); triggerBubbleMenu(e, msg.id); };
  }
  return bubble;
}

function makeMetaEl() {
  const meta = document.createElement('div');
  meta.className = 'bmeta';
  meta.innerHTML = `<span>${timeNow()}</span>`;
  return meta;
}

/* ============================================================
   메시지 전송
   ============================================================ */
async function sendPushNotification(text) {
  try {
    const otherIds = currentRoom.members?.filter(id => id !== currentUserId) || [];
    if (otherIds.length === 0) return;

    const { data: profiles } = await supabaseClient
      .from('profiles')
      .select('onesignal_player_id')
      .in('id', otherIds);

    const playerIds = profiles?.map(p => p.onesignal_player_id).filter(Boolean) || [];
    if (playerIds.length === 0) return;

    await fetch('https://yrndqghsdtxoajgxvqrv.supabase.co/functions/v1/send-notification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        player_ids: playerIds,
        title: currentUserProfile?.name || '톡톡',
        message: text,
        url: 'https://talk-talk-phi.vercel.app'
      })
    });
  } catch(e) {
    console.error('알림 전송 실패:', e);
  }
}
async function sendPushNotification(text) {
  try {
    // 채팅방 멤버 중 나 제외한 상대방 OneSignal player_id 가져오기
    const otherIds = currentRoom.members?.filter(id => id !== currentUserId) || [];
    if (otherIds.length === 0) return;

    // profiles에서 onesignal_player_id 가져오기
    const { data: profiles } = await supabaseClient
      .from('profiles')
      .select('onesignal_player_id')
      .in('id', otherIds);

    const playerIds = profiles?.map(p => p.onesignal_player_id).filter(Boolean) || [];
    if (playerIds.length === 0) return;

    await fetch('https://yrndqghsdtxoajgxvqrv.supabase.co/functions/v1/send-notification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        player_ids: playerIds,
        title: currentUserProfile?.name || '톡톡',
        message: text,
        url: 'https://talk-talk-phi.vercel.app'
      })
    });
  } catch(e) {
    console.error('알림 전송 실패:', e);
  }
}

async function sendMsg() {
  const input = document.getElementById('msg-input');
  const text = input?.value.trim();
  if (!text || !currentRoom.id) return;
  if (input) input.value = '';
  
  const { data, error } = await supabaseClient.from('messages').insert({
    room_id: currentRoom.id, sender_id: currentUserId, content: text, type: 'text'
  }).select().single();
  
  if (error) { 
    alert("오류: " + error.message); 
  } else { 
    appendMessageToUI(data); 
    if (!roomOpen) renderChats();
    sendPushNotification(text);
  }
}

async function handleClipFile(inputElement) {
  const file = inputElement.files[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    showToast("오류", "이미지 파일만 첨부 가능합니다.", "#ff4757");
    return;
  }
  
  const ext = file.name.split('.').pop();
  const fileName = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 8)}.${ext}`;
  
  const { error: uploadError } = await supabaseClient.storage
    .from('chat-images')
    .upload(fileName, file);
  
  if (uploadError) {
    console.error('업로드 실패:', uploadError);
    showToast("오류", "이미지 업로드에 실패했습니다.", "#ff4757");
    inputElement.value = "";
    return;
  }
  
  const { data: urlData } = supabaseClient.storage
    .from('chat-images')
    .getPublicUrl(fileName);
  
  const { data, error: dbError } = await supabaseClient.from('messages').insert({
    room_id: currentRoom.id,
    sender_id: currentUserId,
    image_url: urlData.publicUrl,
    type: 'image',
    content: '📷 사진'
  }).select().single();
  
  if (dbError) {
    showToast("오류", "메시지 저장에 실패했습니다.", "#ff4757");
  } else {
    appendMessageToUI(data);
    if (!roomOpen) renderChats();
    sendPushNotification('📷 사진');
  }
  
  inputElement.value = "";
}
function triggerClip() { 
  document.getElementById('clip-file-input')?.click(); 
}

/* ============================================================
   말풍선 메뉴
   ============================================================ */
function triggerBubbleMenu(e, messageId) {
  selectedMessageId = messageId;
  const menu = document.getElementById('bubble-context-menu');
  if (menu) {
    menu.style.top = `${e.pageY}px`;
    menu.style.left = `${Math.min(e.pageX, window.innerWidth - 130)}px`;
    menu.classList.add('active');
  }
}
async function handleBubbleDelete(type) {
  if (!selectedMessageId) return;
  document.getElementById('bubble-context-menu')?.classList.remove('active');
  if (type === 'all') {
    await supabaseClient.from('messages').update({ deleted_for_all: true }).eq('id', selectedMessageId).eq('sender_id', currentUserId);
  } else {
    showToast("알림","나에게만 삭제되었습니다.","#555");
  }
  if (roomOpen && currentRoom.id) await loadMessages(currentRoom.id);
}
document.addEventListener('click', e => {
  if (!e.target.closest('.bubble') && !e.target.closest('.bubble-menu'))
    document.getElementById('bubble-context-menu')?.classList.remove('active');
});

/* ============================================================
   채팅방 검색
   ============================================================ */
function toggleRoomSearch() {
  document.getElementById('room-search-bar')?.classList.toggle('active');
}
function closeRoomSearch() {
  document.getElementById('room-search-bar')?.classList.remove('active');
  const input = document.getElementById('room-search-input');
  if (input) input.value = '';
  if (roomOpen && currentRoom.id) loadMessages(currentRoom.id);
}
function searchRoomMessages() {
  const query = document.getElementById('room-search-input')?.value.toLowerCase() || '';
  document.querySelectorAll('#room-messages .msg-row').forEach(row => {
    const text = row.querySelector('.bubble')?.textContent?.toLowerCase() || '';
    row.style.display = (!query || text.includes(query)) ? '' : 'none';
  });
}

/* ============================================================
   친구 관리 모달
   ============================================================ */
function openManageModal() {
  document.getElementById('manage-modal')?.classList.add('active');
  renderManageList();
}
function closeManageModal() { document.getElementById('manage-modal')?.classList.remove('active'); }

function renderManageList() {
  const listCont = document.getElementById('modal-manage-list');
  if (!listCont) return;
  if (friendsList.length === 0) {
    listCont.innerHTML = '<div style="padding:12px;text-align:center;color:#aaa;">친구가 없습니다</div>';
    return;
  }
  listCont.innerHTML = friendsList.map(f => {
    const isBlocked = blockedList.includes(f.id);
    return `
    <div class="manage-item">
      <span style="flex:1;font-weight:600;">${f.name}</span>
      <div class="manage-item-btns">
        ${isBlocked
          ? `<button style="background:#888;color:#fff;border:none;border-radius:6px;padding:5px 10px;font-size:12px;font-weight:600;cursor:pointer;" onclick="unblockFriend('${f.id}')">차단해제</button>`
          : `<button style="background:#ff8c42;color:#fff;border:none;border-radius:6px;padding:5px 10px;font-size:12px;font-weight:600;cursor:pointer;" onclick="blockFriend('${f.id}')">차단</button>`
        }
        <button style="background:#ff4757;color:#fff;border:none;border-radius:6px;padding:5px 10px;font-size:12px;font-weight:600;cursor:pointer;" onclick="removeFriend('${f.id}')">삭제</button>
      </div>
    </div>`;
  }).join('');
}

async function addNewFriendWithVerify() {
  const input = document.getElementById('new-friend-id-input');
  const username = input?.value.trim();
  if (!username) return;
  if (username === currentUserProfile?.username) { alert("자기 자신은 추가할 수 없습니다."); return; }
  const { data: profile } = await supabaseClient.from('profiles').select('id, username, name, status, avatar').eq('username', username).single();
  if (!profile) { alert("존재하지 않는 아이디입니다."); return; }
  if (friendsList.some(f => f.id === profile.id)) { alert("이미 친구입니다."); return; }
  await supabaseClient.from('friendships').insert({ user_id: currentUserId, friend_id: profile.id, status: 'accepted' });
  const { data: room } = await supabaseClient.from('chat_rooms').insert({ name: profile.name, is_group: false, created_by: currentUserId }).select().single();
  await supabaseClient.from('chat_room_members').insert([{ room_id: room.id, user_id: currentUserId },{ room_id: room.id, user_id: profile.id }]);
  friendsList.push({ id: profile.id, username: profile.username||'', name: profile.name, status: profile.status||'', avatar: profile.avatar||null, isFavorite: false });
  chatRoomsList.push(room);
  renderFriends(); renderChats(); renderManageList();
  if (input) input.value = '';
  showToast("친구 추가", `${profile.name}님과 친구가 되었습니다!`, "#2ed573");
}

async function removeFriend(friendId) {
  await supabaseClient.from('friendships').delete().eq('user_id', currentUserId).eq('friend_id', friendId);
  // 차단 상태도 해제
  if (blockedList.includes(friendId)) {
    await supabaseClient.from('blocks').delete().eq('user_id', currentUserId).eq('blocked_id', friendId);
    blockedList = blockedList.filter(id => id !== friendId);
  }
  friendsList = friendsList.filter(f => f.id !== friendId);
  renderFriends(); renderManageList();
  showToast("친구 삭제","친구 목록에서 제거되었습니다.","#ff4757");
}

/* ============================================================
   프로필 카드
   ============================================================ */
async function openProfileCard(id) {
  profileTargetId = id;
  const cardOverlay = document.getElementById('profile-card');
  const actionsContainer = document.getElementById('pc-bottom-actions');
  const avatarEl = document.getElementById('pc-avatar');
  const starBtn = document.getElementById('pc-star-btn');
  const nameEditIcon = document.getElementById('pc-edit-name-icon');
  const statusEditIcon = document.getElementById('pc-edit-status-icon');

  if (id === 'me') {
    document.getElementById('pc-name').textContent = currentUserProfile.name;
    document.getElementById('pc-status').textContent = currentUserProfile.status || '';
    nameEditIcon.style.display = 'inline-block';
    statusEditIcon.style.display = 'inline-block';
    starBtn.style.display = 'none';
    applyAvatarStyle(avatarEl, currentUserProfile.avatar);
    // 배경사진 설정
    if (currentUserProfile.bg) {
      cardOverlay.style.backgroundImage = `url('${currentUserProfile.bg}')`;
    } else {
      cardOverlay.style.backgroundImage = 'none';
      cardOverlay.style.backgroundColor = '#7a8188';
    }
    actionsContainer.innerHTML = `
      <button class="pc-action-btn" onclick="openImageSourceModal('avatar')"><i class="ti ti-photo"></i><span>사진 변경</span></button>
      <button class="pc-action-btn" onclick="openImageSourceModal('bg')"><i class="ti ti-photo-plus"></i><span>배경 변경</span></button>
    `;
  } else {
    const user = friendsList.find(f => f.id === id);
    if (!user) return;

    // 차단된 사람은 프로필 볼 수 없게
    // (반대로 내가 차단된 경우는 서버에서 처리)

    document.getElementById('pc-name').textContent = user.name;
    document.getElementById('pc-status').textContent = user.status || '';
    nameEditIcon.style.display = 'none';
    statusEditIcon.style.display = 'none';
    starBtn.style.display = 'inline-block';
    starBtn.className = user.isFavorite ? 'ti ti-star-filled' : 'ti ti-star';
    starBtn.style.color = user.isFavorite ? '#fee500' : '';
    applyAvatarStyle(avatarEl, user.avatar);
    cardOverlay.style.backgroundImage = 'none';
    cardOverlay.style.backgroundColor = '#7a8188';

    const isBlocked = blockedList.includes(id);
    actionsContainer.innerHTML = `
      <button class="pc-action-btn" onclick="closeProfileCard(); openRoomWithFriend('${id}')"><i class="ti ti-message-2"></i><span>1:1 채팅</span></button>
      <button class="pc-action-btn" onclick="${isBlocked ? `unblockFriend('${id}')` : `blockFriend('${id}')`}">
        <i class="ti ${isBlocked ? 'ti-lock-open' : 'ti-ban'}"></i>
        <span>${isBlocked ? '차단해제' : '차단'}</span>
      </button>
    `;
  }
  cardOverlay.classList.add('active');
}

function closeProfileCard() {
  document.getElementById('profile-card').classList.remove('active');
  profileTargetId = null;
}

function handleAvatarTouch() {
  if (profileTargetId === 'me') triggerProfileUpload('avatar');
}

async function triggerProfileUpload(type) {
  if (type === 'avatar') document.getElementById('avatar-file-input').click();
}

async function handleProfileImageUpload(inputElement, type) {
  const file = inputElement.files[0];
  if (!file || !currentUserId) return;
  const reader = new FileReader();
  reader.onload = async function(e) {
    const base64 = e.target.result;
    const updateData = type === 'avatar' ? { avatar: base64 } : { bg: base64 };
    await supabaseClient.from('profiles').update(updateData).eq('id', currentUserId);
    currentUserProfile[type === 'avatar' ? 'avatar' : 'bg'] = base64;
    syncMyProfileDOM();
    openProfileCard('me'); // 즉시 갱신
    showToast("프로필", type === 'avatar' ? "프로필 사진이 변경되었습니다." : "배경 사진이 변경되었습니다.", "#2ed573");
    // 친구들한테도 즉시 반영되도록 friendsList 갱신
    friendsList.forEach(f => {
      if (f.id === currentUserId) f.avatar = base64;
    });
    renderChats();
  };
  reader.readAsDataURL(file);
  inputElement.value = "";
}

/* ============================================================
   텍스트 편집 (이름 / 상태메시지)
   ============================================================ */
function openTextEditModal(mode) {
  textEditMode = mode;
  const modal = document.getElementById('text-edit-modal');
  const title = document.getElementById('text-modal-title');
  const input = document.getElementById('text-modal-input');
  if (mode === 'name') {
    title.textContent = '이름 변경';
    input.value = currentUserProfile?.name || '';
  } else {
    title.textContent = '상태메시지 변경';
    input.value = currentUserProfile?.status || '';
  }
  modal?.classList.add('active');
  setTimeout(() => input.focus(), 100);
}
function closeTextEditModal() { document.getElementById('text-edit-modal')?.classList.remove('active'); }

async function saveTextEditAction() {
  const input = document.getElementById('text-modal-input');
  const value = input?.value || '';  // 빈 문자열 허용
  
  // 이름 수정일 때만 빈칸 체크
  if (textEditMode === 'name' && !value.trim()) {
    showToast("알림", "이름은 빈칸으로 둘 수 없습니다.", "#ff4757");
    return;
  }
  
  // 상태메시지는 빈칸 허용 (trim() 제거)
  const updateValue = textEditMode === 'name' ? value.trim() : value;
  const updateData = textEditMode === 'name' ? { name: updateValue } : { status: updateValue };
  
  const { error } = await supabaseClient.from('profiles').update(updateData).eq('id', currentUserId);
  if (error) { 
    showToast("오류", "저장에 실패했습니다.", "#ff4757"); 
    return; 
  }

  if (textEditMode === 'name') {
    currentUserProfile.name = updateValue;
  } else {
    currentUserProfile.status = updateValue;  // 빈 문자열도 저장 가능
  }

  syncMyProfileDOM();
  closeTextEditModal();
  openProfileCard('me');
  showToast("저장", textEditMode === 'name' ? "이름이 변경되었습니다." : "상태메시지가 변경되었습니다.", "#2ed573");
}

/* ============================================================
   이미지 뷰어
   ============================================================ */
function openImageViewer(srcUrl, msgId = null) {
  currentDegree = 0; flipX = 1; flipY = 1;
  viewerContextMessageId = msgId;
  const targetImg = document.getElementById('viewer-img-target');
  if (targetImg) targetImg.src = srcUrl;
  updateViewerTransform();
  document.getElementById('image-viewer').classList.add('active');
}
function closeImageViewer() { document.getElementById('image-viewer').classList.remove('active'); }
function updateViewerTransform() {
  const container = document.getElementById('viewer-img-container');
  if (container) container.style.transform = `rotate(${currentDegree}deg) scaleX(${flipX}) scaleY(${flipY})`;
}
function rotateViewerImage(deg) { currentDegree += deg; updateViewerTransform(); }
function flipViewerImage(axis) { if (axis === 'X') flipX *= -1; else flipY *= -1; updateViewerTransform(); }
function saveViewerImage() {
  const img = document.getElementById('viewer-img-target');
  if (!img || !img.src) return;
  const a = document.createElement('a');
  a.href = img.src; a.download = 'talktalk_image.jpg'; a.click();
}
function toggleViewerDropdown(e) {
  e.stopPropagation();
  document.getElementById('viewer-dropdown')?.classList.toggle('active');
}
async function deleteViewerImage() {
  if (!viewerContextMessageId) return;
  await supabaseClient.from('messages').update({ deleted_for_all: true }).eq('id', viewerContextMessageId).eq('sender_id', currentUserId);
  closeImageViewer();
  if (roomOpen && currentRoom.id) loadMessages(currentRoom.id);
}

/* ============================================================
   즐겨찾기
   ============================================================ */
function toggleFavoriteAction() {
  if (!profileTargetId || profileTargetId === 'me') return;
  const friend = friendsList.find(f => f.id === profileTargetId);
  if (!friend) return;
  friend.isFavorite = !friend.isFavorite;
  const starBtn = document.getElementById('pc-star-btn');
  if (starBtn) { starBtn.className = friend.isFavorite ? 'ti ti-star-filled' : 'ti ti-star'; starBtn.style.color = friend.isFavorite ? '#fee500' : ''; }
  showToast("즐겨찾기", friend.isFavorite ? `${friend.name}님을 즐겨찾기에 추가했습니다.` : `${friend.name}님을 즐겨찾기에서 제거했습니다.`, "#fee500");
  renderFriends();
}

/* ============================================================
   단체 채팅방 생성
   ============================================================ */
function openGroupCreateModal() {
  document.getElementById('group-create-modal')?.classList.add('active');
  const listEl = document.getElementById('group-member-list');
  if (!listEl) return;
  listEl.innerHTML = friendsList.map(f => `
    <div class="manage-item">
      <label style="display:flex;align-items:center;gap:10px;cursor:pointer;flex:1;">
        <input type="checkbox" value="${f.id}" style="width:16px;height:16px;">
        <span>${f.name}</span>
      </label>
    </div>
  `).join('');
}
function closeGroupCreateModal() { document.getElementById('group-create-modal')?.classList.remove('active'); }
async function confirmCreateGroupChat() {
  const name = document.getElementById('group-name-input')?.value.trim();
  if (!name) { alert("채팅방 이름을 입력하세요."); return; }
  const checked = [...document.querySelectorAll('#group-member-list input[type=checkbox]:checked')].map(c => c.value);
  if (checked.length === 0) { alert("초대할 친구를 선택하세요."); return; }
  const { data: room } = await supabaseClient.from('chat_rooms').insert({ name, is_group: true, created_by: currentUserId }).select().single();
  if (!room) return;
  const members = [currentUserId, ...checked].map(uid => ({ room_id: room.id, user_id: uid }));
  await supabaseClient.from('chat_room_members').insert(members);
  chatRoomsList.push(room);
  renderChats();
  closeGroupCreateModal();
  showToast("단체채팅", `'${name}' 방이 만들어졌습니다.`, "#5352ed");
}

/* ============================================================
   단체방 초대
   ============================================================ */
function openInviteModal() {
  if (!currentRoom.id || !currentRoom.is_group) return;
  document.getElementById('invite-modal')?.classList.add('active');
  const listEl = document.getElementById('invite-member-list');
  if (!listEl) return;
  const alreadyIn = currentRoom.members || [];
  const invitable = friendsList.filter(f => !alreadyIn.includes(f.id));
  if (invitable.length === 0) { listEl.innerHTML = '<div style="padding:12px;text-align:center;color:#aaa;">초대 가능한 친구가 없습니다.</div>'; return; }
  listEl.innerHTML = invitable.map(f => `
    <div class="manage-item">
      <label style="display:flex;align-items:center;gap:10px;cursor:pointer;flex:1;">
        <input type="checkbox" value="${f.id}" style="width:16px;height:16px;">
        <span>${f.name}</span>
      </label>
    </div>
  `).join('');
}
function closeInviteModal() { document.getElementById('invite-modal')?.classList.remove('active'); }
async function confirmInviteMembers() {
  const checked = [...document.querySelectorAll('#invite-member-list input[type=checkbox]:checked')].map(c => c.value);
  if (checked.length === 0) { alert("초대할 친구를 선택하세요."); return; }
  const rows = checked.map(uid => ({ room_id: currentRoom.id, user_id: uid }));
  await supabaseClient.from('chat_room_members').insert(rows);
  currentRoom.members = [...(currentRoom.members || []), ...checked];
  closeInviteModal();
  showToast("초대", "친구를 초대했습니다.", "#2ed573");
}

/* ============================================================
   관리자 패널
   ============================================================ */
function openAdminBanModal() {
  document.getElementById('admin-ban-modal')?.classList.add('active');
  renderAdminBanList();
}
function closeAdminBanModal() { document.getElementById('admin-ban-modal')?.classList.remove('active'); }
async function renderAdminBanList() {
  const listEl = document.getElementById('admin-ban-list');
  if (!listEl) return;
  const { data: profiles } = await supabaseClient.from('profiles').select('id, username, name, is_banned');
  if (!profiles) { listEl.innerHTML = '<div style="padding:12px;">불러오기 실패</div>'; return; }
  listEl.innerHTML = profiles.filter(p => p.id !== currentUserId).map(p => `
    <div class="manage-item">
      <span style="flex:1;"><strong>${p.name}</strong> (@${p.username})</span>
      <button style="background:${p.is_banned?'#888':'#ff4757'};color:#fff;border:none;border-radius:6px;padding:5px 10px;font-size:12px;cursor:pointer;"
        onclick="toggleBanUser('${p.id}', ${p.is_banned})">${p.is_banned?'밴 해제':'밴'}</button>
    </div>
  `).join('') || '<div style="padding:12px;text-align:center;">사용자 없음</div>';
}
async function toggleBanUser(userId, isBanned) {
  await supabaseClient.from('profiles').update({ is_banned: !isBanned }).eq('id', userId);
  renderAdminBanList();
  showToast("관리자", !isBanned ? "사용자를 밴했습니다." : "밴을 해제했습니다.", "#5352ed");
}

/* ============================================================
   탭 전환 / 공통 UI
   ============================================================ */
function toggleEmoticonDrawer() { document.getElementById('emoticon-drawer')?.classList.toggle('active'); }
function selectEmot(emot) {
  const input = document.getElementById('msg-input');
  if (input) input.value += emot;
  document.getElementById('emoticon-drawer')?.classList.remove('active');
}
function switchTab(tab) {
  if (roomOpen) return;
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  const map = { friends: 'screen-friends', chats: 'screen-chats', more: 'screen-more' };
  document.getElementById(map[tab])?.classList.add('active');
  document.getElementById('tab-' + tab)?.classList.add('active');
  document.getElementById('tab-bar').style.display = 'flex';
  currentTab = tab;
}
function closeRoom() {
  roomOpen = false;
  if (messagesSubscription) { supabaseClient.removeChannel(messagesSubscription); messagesSubscription = null; }
  document.getElementById('tab-bar').style.display = 'flex';
  document.getElementById('emoticon-drawer')?.classList.remove('active');
  document.getElementById('room-search-bar')?.classList.remove('active');
  renderChats();
  switchTab(currentTab);
}
function toggleChatSearch() { document.getElementById('chat-search-bar')?.classList.toggle('active'); }
function filterChats() { chatSearchQuery = document.getElementById('chat-search-input')?.value || ''; renderChats(); }
function clearChatSearch() { chatSearchQuery = ''; if (document.getElementById('chat-search-input')) document.getElementById('chat-search-input').value = ''; renderChats(); }
function toggleSearchBar() { document.getElementById('friend-search-container')?.classList.toggle('active'); }
function filterFriends() { searchQuery = document.getElementById('friend-search-input')?.value || ''; renderFriends(); }
function clearSearch() { searchQuery = ''; if (document.getElementById('friend-search-input')) document.getElementById('friend-search-input').value = ''; renderFriends(); }
function checkUnreadDots() {}

/* ============================================================
   전역 Realtime
   ============================================================ */
// 전역 Realtime (메시지 + 프로필 변경 감지)
let globalSubscription = null;

function startGlobalRealtime() {
  if (globalSubscription) {
    supabaseClient.removeChannel(globalSubscription);
  }
  
  globalSubscription = supabaseClient
    .channel('global-realtime')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, async (payload) => {
      const msg = payload.new;
      if (msg.sender_id === currentUserId) return;
      if (blockedList.includes(msg.sender_id)) return;
      
      // 내가 속한 채팅방 ID 목록
      const myRoomIds = chatRoomsList.map(r => r.id);
      
      // ✅ 내가 속하지 않은 방에 메시지가 오면 (나갔다가 다시 메시지 온 경우)
      if (!myRoomIds.includes(msg.room_id)) {
        console.log("새 메시지가 왔지만 속한 방이 아님. 재가입 시도:", msg.room_id);
        
        // 1. 이미 멤버인지 먼저 확인 (중복 방지)
        const { data: existing } = await supabaseClient
          .from('chat_room_members')
          .select('room_id')
          .eq('room_id', msg.room_id)
          .eq('user_id', currentUserId)
          .maybeSingle();
        
        if (!existing) {
          // 2. 채팅방 멤버로 다시 추가
          await supabaseClient.from('chat_room_members').insert({
            room_id: msg.room_id,
            user_id: currentUserId
          });
        }
        
        // 3. 채팅방 목록 새로고침
        await loadChatRooms();
        renderChats();
        
        // 4. 알림 표시 (상대방 이름 찾기)
        const room = chatRoomsList.find(r => r.id === msg.room_id);
        const sender = friendsList.find(f => f.id === msg.sender_id);
        showChatNotification(
          sender?.name || room?.name || '새 메시지', 
          msg.content || '사진', 
          sender?.avatar
        );
        return;
      }
      
      // 이미 속한 방이면 기존 알림 로직 실행
      if (roomOpen && currentRoom.id === msg.room_id) return;
      
      const room = chatRoomsList.find(r => r.id === msg.room_id);
      if (room?.is_muted) return;
      
      const sender = friendsList.find(f => f.id === msg.sender_id);
      showChatNotification(sender?.name || room?.name || '누군가', msg.content || '사진', sender?.avatar);
      if (!roomOpen) renderChats();
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, async (payload) => {
      const updatedProfile = payload.new;
      
      const friendIndex = friendsList.findIndex(f => f.id === updatedProfile.id);
      if (friendIndex !== -1) {
        const old = friendsList[friendIndex];
        const changed = old.name !== updatedProfile.name || old.status !== updatedProfile.status || old.avatar !== updatedProfile.avatar;

        friendsList[friendIndex] = {
          ...friendsList[friendIndex],
          name: updatedProfile.name,
          status: updatedProfile.status,
          avatar: updatedProfile.avatar
        };
        
        renderFriends();
        
        if (document.getElementById('manage-modal')?.classList.contains('active')) {
          renderManageList();
        }
        
        if (profileTargetId === updatedProfile.id) {
          document.getElementById('pc-name').textContent = updatedProfile.name;
          document.getElementById('pc-status').textContent = updatedProfile.status || '';
          applyAvatarStyle(document.getElementById('pc-avatar'), updatedProfile.avatar);
        }
        
        if (roomOpen && currentRoom.id && !currentRoom.is_group) {
          const otherId = currentRoom.members?.find(id => id !== currentUserId);
          if (otherId === updatedProfile.id) {
            document.getElementById('room-title').textContent = updatedProfile.name;
            currentRoom.name = updatedProfile.name;
          }
        }
        
        const targetRoom = chatRoomsList.find(room => 
          !room.is_group && room.members?.includes(updatedProfile.id) && room.members?.includes(currentUserId)
        );
        if (targetRoom) {
          targetRoom.name = updatedProfile.name;
          renderChats();
        }

        if (changed) showToast("프로필 변경", `${updatedProfile.name}님의 프로필이 업데이트되었습니다.`, "#5352ed");
      }
    })
    .subscribe();
}

/* ============================================================
   폰트 설정
   ============================================================ */
function openFontModal() {
  document.getElementById('font-modal')?.classList.add('active');
  // 슬라이더 현재 값 반영
  const slider = document.getElementById('font-size-slider');
  if (slider) slider.value = currentFontSize;
  updateFontPreview();
  renderFontList();
}
function closeFontModal() { document.getElementById('font-modal')?.classList.remove('active'); }

function onFontSizeChange(val) {
  currentFontSize = parseInt(val);
  localStorage.setItem('tt_font_size', currentFontSize);
  applyFont();
  updateFontPreview();
}

function updateFontPreview() {
  const preview = document.getElementById('font-preview-text');
  const f = FONT_LIST.find(x => x.id === currentFontId) || FONT_LIST[0];
  if (preview) {
    preview.style.fontFamily = f.css;
    preview.style.fontSize = currentFontSize + 'px';
    preview.textContent = f.preview + ' ' + currentFontSize + 'px';
  }
}

function renderFontList() {
  const container = document.getElementById('font-list');
  if (!container) return;
  container.innerHTML = FONT_LIST.map(f => `
    <div class="font-item ${f.id === currentFontId ? 'selected' : ''}" onclick="selectFont('${f.id}')">
      <span class="font-item-preview" style="font-family:${f.css};">${f.preview}</span>
      <span class="font-item-name">${f.name}</span>
    </div>
  `).join('');
}

function selectFont(fontId) {
  currentFontId = fontId;
  localStorage.setItem('tt_font_id', fontId);
  applyFont();
  updateFontPreview();
  renderFontList();
}

/* ============================================================
   테마 설정
   ============================================================ */
function openThemeModal() {
  document.getElementById('theme-modal')?.classList.add('active');
  updateThemeCards();
}
function closeThemeModal() { document.getElementById('theme-modal')?.classList.remove('active'); }

function setTheme(theme) {
  currentTheme = theme;
  localStorage.setItem('tt_theme', theme);
  applyTheme();
  updateThemeCards();
}

function updateThemeCards() {
  const themes = ['white', 'dark', 'pokemon'];  // 'pokemon' 추가
  themes.forEach(t => {
    const card = document.getElementById('theme-' + t);
    if (card) card.classList.toggle('selected', currentTheme === t);
  });
}

/* ============================================================
   이벤트 연결
   ============================================================ */
document.getElementById('send-btn')?.addEventListener('click', sendMsg);
document.getElementById('msg-input')?.addEventListener('keydown', e => { if (e.key === 'Enter') sendMsg(); });
document.getElementById('login-id')?.addEventListener('keypress', e => { if (e.key === 'Enter') handleLogin(); });
document.getElementById('login-pw')?.addEventListener('keypress', e => { if (e.key === 'Enter') handleLogin(); });
document.getElementById('reg-id')?.addEventListener('keypress', e => { if (e.key === 'Enter') handleRegister(); });
document.getElementById('reg-pw')?.addEventListener('keypress', e => { if (e.key === 'Enter') handleRegister(); });
document.getElementById('reg-name')?.addEventListener('keypress', e => { if (e.key === 'Enter') handleRegister(); });

// ============================================================
// 프로필 이미지 선택 모달 관련 함수
// ============================================================

let currentImageType = null;

function openImageSourceModal(type) {
  currentImageType = type;
  const modal = document.getElementById('image-source-modal');
  if (modal) modal.classList.add('active');
}

function closeImageSourceModal() {
  const modal = document.getElementById('image-source-modal');
  if (modal) modal.classList.remove('active');
  currentImageType = null;
}

function selectImageSource(source) {
  if (source === 'gallery') {
    if (currentImageType === 'avatar') {
      document.getElementById('avatar-file-input').click();
    } else if (currentImageType === 'bg') {
      document.getElementById('bg-file-input').click();
    }
  } else if (source === 'default') {
    if (currentImageType === 'avatar') {
      resetProfileImage();
    } else if (currentImageType === 'bg') {
      resetProfileBg();
    }
  }
  closeImageSourceModal();
}

async function resetProfileImage() {
  await supabaseClient.from('profiles').update({ avatar: null }).eq('id', currentUserId);
  currentUserProfile.avatar = null;
  syncMyProfileDOM();
  openProfileCard('me');
  showToast("프로필", "기본 프로필 사진으로 변경되었습니다.", "#2ed573");
}

async function resetProfileBg() {
  await supabaseClient.from('profiles').update({ bg: null }).eq('id', currentUserId);
  currentUserProfile.bg = null;
  openProfileCard('me');
  showToast("프로필", "기본 배경으로 변경되었습니다.", "#2ed573");
}
