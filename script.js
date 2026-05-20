/* ==========================================================================
   톡톡 (TalkTalk) - Supabase 실시간 채팅 버전
   ========================================================================== */

// ============================================================
// 🔥 여기만 본인 값으로 교체하세요! 🔥
// ============================================================
const SUPABASE_URL = 'https://yrndqghsdtxoajgxvqrv.supabaseClient.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlybmRxZ2hzZHR4b2FqZ3h2cXJ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyNjM3NTksImV4cCI6MjA5NDgzOTc1OX0.jEjISPblbaz-EFTE63kj8wG85lqWSdr_HAloukwzjnc';
// ============================================================

// Supabase 클라이언트 초기화
const supabaseClient = window.supabaseClient.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ==========================================================================
   전역 상태 변수
   ========================================================================== */
let currentTab = 'friends';
let currentRoom = { id: null, isGroup: false, name: '' };
let roomOpen = false;
let searchQuery = "";
let chatSearchQuery = "";
let profileTargetId = null;
let currentUserId = null;
let currentUserProfile = null;
let friendsList = [];
let chatRoomsList = [];
let messagesSubscription = null;
let currentDegree = 0;
let flipX = 1;
let flipY = 1;
let textEditMode = 'name';
let selectedMessageId = null;
let viewerContextMessageId = null;
let activeSwiped = null;

/* ==========================================================================
   도우미 함수
   ========================================================================== */
function timeNow() {
  const d = new Date();
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h >= 12 ? '오후' : '오전'} ${h % 12 || 12}:${m}`;
}

function dateStr() {
  const d = new Date();
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
}

function showToast(title, message, color = '#333') {
  const tc = document.getElementById('toast-container');
  if (!tc) return;
  const t = document.createElement('div');
  t.className = 'toast';
  t.innerHTML = `<div class="toast-avatar avatar-base"><i class="ti ti-info-circle"></i></div>
                 <div class="toast-body"><div class="toast-name">${title}</div><div class="toast-msg">${message}</div></div>`;
  tc.appendChild(t);
  setTimeout(() => {
    t.classList.add('hiding');
    setTimeout(() => t.remove(), 200);
  }, 2500);
}

function showChatNotification(name, text, avatarUrl) {
  const tc = document.getElementById('toast-container');
  if (!tc) return;
  const t = document.createElement('div');
  t.className = 'toast';
  const avStyle = avatarUrl ? `style="background-image:url('${avatarUrl}');"` : '';
  t.innerHTML = `<div class="toast-avatar avatar-base" ${avStyle}><i class="ti ti-user"></i></div>
                 <div class="toast-body"><div class="toast-name">${name}</div><div class="toast-msg">${text}</div></div>`;
  t.onclick = () => {
    const room = chatRoomsList.find(r => r.name === name);
    if (room) openRoomFromData(room.id);
    t.remove();
  };
  tc.appendChild(t);
  setTimeout(() => {
    if (t.parentNode) {
      t.classList.add('hiding');
      setTimeout(() => t.remove(), 200);
    }
  }, 3500);
}

function applyAvatarStyle(element, imgUrl) {
  if (!element) return;
  if (imgUrl) {
    element.style.backgroundImage = `url('${imgUrl}')`;
    element.innerHTML = '';
  } else {
    element.style.backgroundImage = 'none';
    element.innerHTML = '<i class="ti ti-user"></i>';
  }
}

/* ==========================================================================
   인증 & 앱 초기화
   ========================================================================== */
window.addEventListener('DOMContentLoaded', async () => {
  await initApp();
});

async function initApp() {
  const authScreen = document.getElementById('auth-screen');
  const savedSession = localStorage.getItem('talktalk_session');
  
  if (savedSession) {
    try {
      const { data: { session }, error } = await supabaseClient.auth.getSession();
      if (!error && session?.user) {
        const user = session.user;
        currentUserId = user.id;
        await loadUserData(user.id);
        if (authScreen) authScreen.style.display = 'none';
        showToast("환영합니다", `${currentUserProfile?.name || '사용자'}님, 자동 로그인되었습니다.`, "#fee500");
        return;
      }
    } catch(e) {}
  }
  
  if (authScreen) authScreen.style.display = 'flex';
  setTimeout(() => {
    const splash = document.getElementById('splash-logo');
    if (splash) splash.style.display = 'none';
    toggleAuthForm('login');
  }, 1500);
}

async function loadUserData(userId) {
  const { data: profile } = await supabaseClient
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  
  if (profile) {
    currentUserProfile = profile;
    syncMyProfileDOM();
  }
  
  await loadFriends();
  await loadChatRooms();
  renderFriends();
  renderChats();
  checkUnreadDots();
}

async function loadFriends() {
  const { data: friendships } = await supabaseClient
    .from('friendships')
    .select('friend_id, profiles:friend_id(*)')
    .eq('user_id', currentUserId)
    .eq('status', 'accepted');
  
  friendsList = friendships?.map(f => ({
    id: f.friend_id,
    ...f.profiles
  })) || [];

  // 추천 친구용: 전체 프로필 목록 로드
  const { data: allProfiles } = await supabaseClient.from('profiles').select('id, username, name, status, avatar');
  window._allProfiles = allProfiles || [];
}

async function loadChatRooms() {
  const { data: rooms } = await supabaseClient
    .from('chat_room_members')
    .select('room_id, chat_rooms(*)')
    .eq('user_id', currentUserId);
  
  chatRoomsList = rooms?.map(r => r.chat_rooms) || [];
}

function syncMyProfileDOM() {
  if (!currentUserProfile) return;
  const myName = document.getElementById('my-name-display');
  const myStatus = document.getElementById('my-status-display');
  const moreName = document.getElementById('more-name-display');
  const moreStatus = document.getElementById('more-status-display');
  if (myName) myName.textContent = currentUserProfile.name;
  if (myStatus) myStatus.textContent = currentUserProfile.status || '상태메시지';
  if (moreName) moreName.textContent = currentUserProfile.name;
  if (moreStatus) moreStatus.textContent = currentUserProfile.status || '상태메시지';
  applyAvatarStyle(document.getElementById('my-avatar-display'), currentUserProfile.avatar);
  applyAvatarStyle(document.getElementById('more-avatar-display'), currentUserProfile.avatar);
}

/* ==========================================================================
   인증 폼 (로그인/회원가입)
   ========================================================================== */
function toggleAuthForm(mode) {
  const loginCard = document.getElementById('login-card');
  const registerCard = document.getElementById('register-card');
  if (mode === 'login') {
    if (registerCard) registerCard.classList.remove('active');
    if (loginCard) loginCard.classList.add('active');
  } else {
    if (loginCard) loginCard.classList.remove('active');
    if (registerCard) registerCard.classList.add('active');
  }
}

async function handleRegister() {
  const username = document.getElementById('reg-id').value.trim();
  const pw = document.getElementById('reg-pw').value.trim();
  const pwConfirm = document.getElementById('reg-pw-confirm').value.trim();
  const name = document.getElementById('reg-name').value.trim();
  
  if (!username || !pw || !pwConfirm || !name) { 
    alert("모든 빈칸을 입력해주세요."); 
    return; 
  }
  
  if (pw !== pwConfirm) {
    alert("비밀번호가 일치하지 않습니다.");
    return;
  }
  
  if (pw.length < 4) {
    alert("비밀번호는 4자 이상 입력해주세요.");
    return;
  }
  
  const { data: existingUser } = await supabaseClient
    .from('profiles')
    .select('username')
    .eq('username', username)
    .maybeSingle();
  
  if (existingUser) {
    alert("이미 존재하는 아이디입니다.");
    return;
  }
  
  const fakeEmail = username + "@talktalk.app";
  
  const { data, error } = await supabaseClient.auth.signUp({
    email: fakeEmail,
    password: pw,
    options: {
      data: { username: username, name: name }
    }
  });
  
  if (error) { 
    console.error("Auth signup error:", error);
    alert("회원가입에 실패했습니다. 다시 시도해주세요.");
    return; 
  }
  
  if (!data.user) {
    alert("회원가입에 실패했습니다. 다시 시도해주세요.");
    return;
  }
  
  const { error: profileError } = await supabaseClient.from('profiles').insert({
    id: data.user.id,
    username: username,
    name: name,
    status: '환영합니다'
  });
  
  if (profileError) {
    console.error("Profile save error:", profileError);
    await supabaseClient.auth.admin.deleteUser(data.user.id);
    alert("회원가입에 실패했습니다. 다시 시도해주세요.");
    return;
  }
  
  localStorage.setItem('talktalk_session', data.user.id);
  currentUserId = data.user.id;
  await loadUserData(data.user.id);
  
  const authScreen = document.getElementById('auth-screen');
  if (authScreen) authScreen.style.display = 'none';
  showToast("가입 축하", name + "님의 아이디가 생성되었습니다.", "#2ed573");
  
  document.getElementById('reg-id').value = "";
  document.getElementById('reg-pw').value = "";
  document.getElementById('reg-pw-confirm').value = "";
  document.getElementById('reg-name').value = "";
}
async function handleLogin() {
  const username = document.getElementById('login-id').value.trim();
  const pw = document.getElementById('login-pw').value.trim();
  
  if (!username || !pw) { 
    alert("아이디와 비밀번호를 모두 입력해주세요."); 
    return; 
  }
  
  const { data: profile, error: profileError } = await supabaseClient
    .from('profiles')
    .select('id, username, name')
    .eq('username', username)
    .maybeSingle();
  
  if (profileError || !profile) {
    alert("아이디 또는 비밀번호가 일치하지 않습니다.");
    return;
  }
  
  const fakeEmail = username + "@talktalk.app";
  
  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email: fakeEmail,
    password: pw
  });
  
  if (error) { 
    alert("아이디 또는 비밀번호가 일치하지 않습니다.");
    return; 
  }
  
  localStorage.setItem('talktalk_session', data.user.id);
  currentUserId = data.user.id;
  await loadUserData(data.user.id);
  
  const authScreen = document.getElementById('auth-screen');
  if (authScreen) authScreen.style.display = 'none';
  showToast("로그인 성공", profile.name + "님 반갑습니다!", "#fee500");
  
  document.getElementById('login-id').value = "";
  document.getElementById('login-pw').value = "";
}
async function handleLogout() {
  await supabaseClient.auth.signOut();
  localStorage.removeItem('talktalk_session');
  currentUserId = null;
  currentUserProfile = null;
  
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

/* ==========================================================================
   친구 렌더링
   ========================================================================== */
function renderFriends() {
  const container = document.getElementById('friends-list-container');
  if (!container) return;
  
  const filtered = friendsList.filter(f => 
    f.name.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const favoriteFriends = filtered.filter(f => f.isFavorite);
  const normalFriends = filtered.filter(f => !f.isFavorite);
  
  let html = "";
  if (favoriteFriends.length > 0) {
    html += `<div class="favorite-section"><div class="section-title">즐겨찾기 ${favoriteFriends.length}</div>`;
    html += favoriteFriends.map(f => makeFriendItemHTML(f)).join('');
    html += `</div>`;
  }
  html += `<div class="normal-section"><div class="section-title">친구 ${normalFriends.length}</div>`;
  if (normalFriends.length === 0 && favoriteFriends.length === 0) {
    html += `<div class="empty-state"><p>등록된 친구가 없습니다.</p></div>`;
  } else {
    html += normalFriends.map(f => makeFriendItemHTML(f)).join('');
  }
  html += `</div>`;

  // 추천 친구 섹션
  const recommendHtml = renderRecommendSection();
  if (recommendHtml) html += recommendHtml;

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
      <div class="avatar-sm avatar-base">${p.avatar ? `<img src="${p.avatar}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">` : '<i class="ti ti-user"></i>'}</div>
      <div style="flex:1;"><div class="fi-name">${p.name}</div><div class="fi-status">${p.status || '안녕하세요!'}</div></div>
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
  friendsList.push({ id: friendId, username: friendUsername, name: friendName, status: fullProfile?.status || '', avatar: fullProfile?.avatar || null, isFavorite: false });
  renderFriends();
  renderChats();
  showToast("친구 추가", `${friendName}님과 친구가 되었습니다!`, "#2ed573");
}

function makeFriendItemHTML(f) {
  const avatarStyle = f.avatar ? `style="background-image:url('${f.avatar}');"` : '';
  const avatarIcon = f.avatar ? '' : '<i class="ti ti-user"></i>';
  const starBadge = f.isFavorite ? `<i class="ti ti-star-filled fi-star-badge"></i>` : '';
  return `<div class="friend-item" onclick="openProfileCard('${f.id}')">
    <div class="avatar-sm avatar-base" ${avatarStyle}>${avatarIcon}</div>
    <div><div class="fi-name">${f.name}</div><div class="fi-status">${f.status || '안녕하세요!'}</div></div>
    ${starBadge}
  </div>`;
}

/* ==========================================================================
   채팅 목록 렌더링
   ========================================================================== */
async function renderChats() {
  const container = document.getElementById('chats-list-container');
  if (!container) return;
  
  const filtered = chatRoomsList.filter(c => 
    c.name?.toLowerCase().includes(chatSearchQuery.toLowerCase())
  );
  
  if (filtered.length === 0) {
    container.innerHTML = `<div class="empty-state"><p>채팅방이 없습니다.</p></div>`;
    return;
  }
  
  container.innerHTML = '';
  for (const room of filtered) {
    const { data: lastMsg } = await supabaseClient
      .from('messages')
      .select('text, is_image, created_at')
      .eq('room_id', room.id)
      .order('created_at', { ascending: false })
      .limit(1);
    
    const lastChat = lastMsg?.[0];
    let displayMsg = lastChat ? (lastChat.is_image ? "📸 사진" : lastChat.text?.substring(0, 30)) : "대화 내역 없음";
    
    const wrapper = document.createElement('div');
    wrapper.className = 'chat-item-wrapper';
    wrapper.setAttribute('data-id', room.id);
    
    wrapper.innerHTML = `
      <div class="chat-swipe-actions">
        <button class="swa-btn swa-pin" onclick="chatSwipeAction('pin','${room.id}')"><i class="ti ti-pin"></i><span>고정</span></button>
        <button class="swa-btn swa-leave" onclick="chatSwipeAction('leave','${room.id}')"><i class="ti ti-door-exit"></i><span>나가기</span></button>
      </div>
      <div class="chat-item" onclick="openRoomFromData('${room.id}')">
        <div class="chat-avatar avatar-base">${room.is_group ? '<i class="ti ti-users"></i>' : '<i class="ti ti-user"></i>'}</div>
        <div class="ci-info">
          <div class="ci-row1">
            <span class="ci-name">${room.name || (room.is_group ? '단체방' : '대화')}</span>
            <span class="ci-time">${lastChat ? timeNow() : ''}</span>
          </div>
          <div class="ci-row2">
            <span class="ci-preview">${displayMsg}</span>
          </div>
        </div>
      </div>
    `;
    container.appendChild(wrapper);
  }
}

/* ==========================================================================
   채팅방 열기
   ========================================================================== */
async function openRoomFromData(roomId) {
  const room = chatRoomsList.find(r => r.id === roomId);
  if (!room) return;
  
  currentRoom = room;
  roomOpen = true;
  
  document.getElementById('room-title').textContent = room.name || '채팅방';
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-room').classList.add('active');
  document.getElementById('tab-bar').style.display = 'none';
  
  if (messagesSubscription) {
    supabaseClient.removeChannel(messagesSubscription);
  }
  
  messagesSubscription = supabaseClient
    .channel(`room-${roomId}`)
    .on('postgres_changes', { 
      event: 'INSERT', 
      schema: 'public', 
      table: 'messages',
      filter: `room_id=eq.${roomId}`
    }, (payload) => {
      if (!roomOpen || currentRoom.id !== roomId) {
        const sender = friendsList.find(f => f.id === payload.new.sender_id);
        showChatNotification(sender?.name || '누군가', payload.new.text || '사진', sender?.avatar);
      } else {
        appendMessageToUI(payload.new);
      }
    })
    .subscribe();
  
  await loadMessages(roomId);
}

async function loadMessages(roomId) {
  const { data: messages } = await supabaseClient
    .from('messages')
    .select('*')
    .eq('room_id', roomId)
    .order('created_at', { ascending: true });
  
  const container = document.getElementById('room-messages');
  if (!container) return;
  
  container.innerHTML = `<div class="date-sep"><span>${dateStr()}</span></div>`;
  for (const msg of messages || []) {
    appendMessageToUI(msg);
  }
  container.scrollTop = container.scrollHeight;
}

function appendMessageToUI(msg) {
  const container = document.getElementById('room-messages');
  if (!container) return;
  
  const isMine = msg.sender_id === currentUserId;
  const row = document.createElement('div');
  row.className = `msg-row ${isMine ? 'mine' : 'other'}`;
  
  const bwrap = document.createElement('div');
  bwrap.className = 'bwrap';
  
  const bubble = document.createElement('div');
  bubble.className = `bubble ${isMine ? 'mine' : 'other'}`;
  if (msg.is_image && msg.image_url) {
    bubble.classList.add('image-bubble');
    bubble.innerHTML = `<img src="${msg.image_url}" alt="이미지" style="max-width:200px; max-height:200px;">`;
    bubble.onclick = () => openImageViewer(msg.image_url, msg.id);
  } else {
    bubble.textContent = msg.text || '사진';
    bubble.onclick = (e) => { e.stopPropagation(); triggerBubbleMenu(e, msg.id); };
  }
  
  const meta = document.createElement('div');
  meta.className = 'bmeta';
  meta.innerHTML = `<span>${timeNow()}</span>`;
  
  bwrap.appendChild(bubble);
  bwrap.appendChild(meta);
  row.appendChild(bwrap);
  container.appendChild(row);
  container.scrollTop = container.scrollHeight;
}

async function sendMsg() {
  const input = document.getElementById('msg-input');
  const text = input?.value.trim();
  if (!text || !currentRoom.id) return;
  if (input) input.value = '';
  
  await supabaseClient.from('messages').insert({
    room_id: currentRoom.id,
    sender_id: currentUserId,
    text: text,
    is_image: false
  });
}

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
  
  if (type === 'all') {
    await supabaseClient.from('messages')
      .update({ deleted_for_all: true })
      .eq('id', selectedMessageId)
      .eq('sender_id', currentUserId);
  } else {
    showToast("알림", "나에게만 삭제되었습니다.", "#555");
  }
  if (roomOpen && currentRoom.id) {
    await loadMessages(currentRoom.id);
  }
}

function openManageModal() {
  const modal = document.getElementById('manage-modal');
  if (modal) modal.classList.add('active');
  renderManageList();
}

function closeManageModal() {
  const modal = document.getElementById('manage-modal');
  if (modal) modal.classList.remove('active');
}

function renderManageList() {
  const listCont = document.getElementById('modal-manage-list');
  if (!listCont) return;
  listCont.innerHTML = friendsList.map(f => `
    <div class="manage-item">
      <span><strong>${f.name}</strong></span>
      <button class="btn-cancel" style="background:#ff4757; color:white;" onclick="removeFriend('${f.id}')">삭제</button>
    </div>
  `).join('') || '<div style="padding:12px;text-align:center;">친구가 없습니다</div>';
}

async function addNewFriendWithVerify() {
  const input = document.getElementById('new-friend-id-input');
  const username = input?.value.trim();
  if (!username) return;
  if (username === currentUserProfile?.username) { alert("자기 자신은 추가할 수 없습니다."); return; }
  
  const { data: profile } = await supabaseClient
    .from('profiles')
    .select('id, username, name, status, avatar')
    .eq('username', username)
    .single();
  
  if (!profile) { alert("존재하지 않는 아이디입니다."); return; }
  
  if (friendsList.some(f => f.id === profile.id)) { alert("이미 친구입니다."); return; }
  
  await supabaseClient.from('friendships').insert({
    user_id: currentUserId,
    friend_id: profile.id,
    status: 'accepted'
  });
  
  const { data: room } = await supabaseClient.from('chat_rooms').insert({
    name: profile.name,
    is_group: false,
    created_by: currentUserId
  }).select().single();
  
  await supabaseClient.from('chat_room_members').insert([
    { room_id: room.id, user_id: currentUserId },
    { room_id: room.id, user_id: profile.id }
  ]);
  
  // 즉시 로컬 목록에 추가 (새로고침 없이 반영)
  friendsList.push({
    id: profile.id,
    username: profile.username || '',
    name: profile.name,
    status: profile.status || '안녕하세요!',
    avatar: profile.avatar || null,
    isFavorite: false
  });
  chatRoomsList.push(room);
  renderFriends();
  renderChats();
  renderManageList();
  if (input) input.value = '';
  showToast("친구 추가", `${profile.name}님과 친구가 되었습니다!`, "#2ed573");
}

async function removeFriend(friendId) {
  await supabaseClient.from('friendships')
    .delete()
    .eq('user_id', currentUserId)
    .eq('friend_id', friendId);

  // 즉시 로컬 목록에서도 제거
  friendsList = friendsList.filter(f => f.id !== friendId);
  renderFriends();
  renderManageList();
  showToast("친구 삭제", "친구 목록에서 제거되었습니다.", "#ff4757");
}

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
    document.getElementById('pc-status').textContent = currentUserProfile.status || '상태메시지';
    nameEditIcon.style.display = 'inline-block';
    statusEditIcon.style.display = 'inline-block';
    starBtn.style.display = 'none';
    applyAvatarStyle(avatarEl, currentUserProfile.avatar);
    actionsContainer.innerHTML = `
      <button class="pc-action-btn" onclick="triggerProfileUpload('avatar')"><i class="ti ti-photo"></i><span>사진 변경</span></button>
    `;
  } else {
    const user = friendsList.find(f => f.id === id);
    if (!user) return;
    document.getElementById('pc-name').textContent = user.name;
    document.getElementById('pc-status').textContent = user.status || '안녕하세요!';
    nameEditIcon.style.display = 'none';
    statusEditIcon.style.display = 'none';
    starBtn.style.display = 'inline-block';
    applyAvatarStyle(avatarEl, user.avatar);
    actionsContainer.innerHTML = `
      <button class="pc-action-btn" onclick="closeProfileCard(); openRoomFromData('${id}')"><i class="ti ti-message-2"></i><span>1:1 채팅</span></button>
    `;
  }
  cardOverlay.classList.add('active');
}

function closeProfileCard() {
  document.getElementById('profile-card').classList.remove('active');
  profileTargetId = null;
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
    await supabaseClient.from('profiles')
      .update({ avatar: base64 })
      .eq('id', currentUserId);
    
    currentUserProfile.avatar = base64;
    syncMyProfileDOM();
    openProfileCard('me');
    showToast("프로필", "프로필 사진이 변경되었습니다.", "#2ed573");
  };
  reader.readAsDataURL(file);
  inputElement.value = "";
}

function openImageViewer(srcUrl, msgId = null) {
  currentDegree = 0; flipX = 1; flipY = 1;
  viewerContextMessageId = msgId;
  const targetImg = document.getElementById('viewer-img-target');
  if (targetImg) targetImg.src = srcUrl;
  updateViewerTransform();
  document.getElementById('image-viewer').classList.add('active');
}

function closeImageViewer() {
  document.getElementById('image-viewer').classList.remove('active');
}

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
  a.href = img.src;
  a.download = 'talktalk_image.jpg';
  a.click();
}

function toggleEmoticonDrawer() {
  document.getElementById('emoticon-drawer')?.classList.toggle('active');
}
function selectEmot(emot) {
  const input = document.getElementById('msg-input');
  if (input) input.value += emot;
}
function switchTab(tab) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  const map = { friends: 'screen-friends', chats: 'screen-chats', more: 'screen-more' };
  document.getElementById(map[tab]).classList.add('active');
  document.getElementById('tab-' + tab).classList.add('active');
  currentTab = tab;
}
function closeRoom() {
  roomOpen = false;
  if (messagesSubscription) {
    supabaseClient.removeChannel(messagesSubscription);
    messagesSubscription = null;
  }
  document.getElementById('tab-bar').style.display = 'flex';
  document.getElementById('emoticon-drawer')?.classList.remove('active');
  document.getElementById('room-search-bar')?.classList.remove('active');
  renderChats();
  switchTab(currentTab);
}
function toggleChatSearch() {
  document.getElementById('chat-search-bar')?.classList.toggle('active');
}
function filterChats() {
  chatSearchQuery = document.getElementById('chat-search-input')?.value || '';
  renderChats();
}
function clearChatSearch() {
  chatSearchQuery = '';
  if (document.getElementById('chat-search-input')) document.getElementById('chat-search-input').value = '';
  renderChats();
}
function toggleSearchBar() {
  document.getElementById('friend-search-container')?.classList.toggle('active');
}
function filterFriends() {
  searchQuery = document.getElementById('friend-search-input')?.value || '';
  renderFriends();
}
function clearSearch() {
  searchQuery = '';
  if (document.getElementById('friend-search-input')) document.getElementById('friend-search-input').value = '';
  renderFriends();
}
function checkUnreadDots() {
  // TODO: 읽지 않은 메시지 수 계산
}
function chatSwipeAction(action, roomId) {
  showToast("알림", `${action} 기능 준비 중입니다.`, "#888");
}

document.getElementById('send-btn')?.addEventListener('click', sendMsg);
document.getElementById('msg-input')?.addEventListener('keydown', e => { if (e.key === 'Enter') sendMsg(); });

// 엔터키로 로그인
document.getElementById('login-id')?.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') handleLogin();
});
document.getElementById('login-pw')?.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') handleLogin();
});
document.getElementById('reg-id')?.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') handleRegister();
});
document.getElementById('reg-pw')?.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') handleRegister();
});
document.getElementById('reg-name')?.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') handleRegister();
});
