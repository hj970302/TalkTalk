cat > /home/claude/script_new.js << 'ENDOFFILE'
/* ==========================================================================
   톡톡 (TalkTalk) - Supabase 실시간 채팅 버전 (수정판)
   ========================================================================== */

// ============================================================
// 🔥 여기만 본인 값으로 교체하세요! 🔥
// ============================================================
const SUPABASE_URL = 'https://yrndqghsdtxoajgxvqrv.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlybmRxZ2hzZHR4b2FqZ3h2cXJ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyNjM3NTksImV4cCI6MjA5NDgzOTc1OX0.jEjISPblbaz-EFTE63kj8wG85lqWSdr_HAloukwzjnc';
// ============================================================

// ✅ 수정: window.supabase.createClient (라이브러리가 window.supabase로 노출됨)
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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
let blockedList = []; // 차단 목록
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
    // 관리자 패널 표시
    if (profile.is_admin) {
      const adminBtn = document.getElementById('admin-panel-btn');
      if (adminBtn) adminBtn.style.display = 'flex';
    }
  }
  
  await loadFriends();
  await loadBlockedList();
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

// ✅ 차단 목록 로드
async function loadBlockedList() {
  const { data: blocks } = await supabaseClient
    .from('blocks')
    .select('blocked_id, profiles:blocked_id(id, username, name, avatar)')
    .eq('blocker_id', currentUserId);
  
  blockedList = blocks?.map(b => ({
    id: b.blocked_id,
    ...b.profiles
  })) || [];
}

async function loadChatRooms() {
  const { data: rooms } = await supabaseClient
    .from('chat_room_members')
    .select('room_id, chat_rooms(*)')
    .eq('user_id', currentUserId);
  
  chatRoomsList = rooms?.map(r => r.chat_rooms).filter(Boolean) || [];
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
  friendsList = [];
  blockedList = [];
  chatRoomsList = [];
  
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

  // 추천 친구 섹션 (펼치기/접기 형태)
  const recommendHtml = renderRecommendSection();
  if (recommendHtml) html += recommendHtml;

  container.innerHTML = html;
}

function renderRecommendSection() {
  if (!window._allProfiles || window._allProfiles.length === 0) return '';
  const friendIds = new Set(friendsList.map(f => f.id));
  const blockedIds = new Set(blockedList.map(b => b.id));
  const recommends = window._allProfiles.filter(p => 
    p.id !== currentUserId && !friendIds.has(p.id) && !blockedIds.has(p.id)
  );
  if (recommends.length === 0) return '';
  
  // 처음엔 접혀있는 상태로 렌더링
  let html = `
  <div class="normal-section recommend-section">
    <div class="section-title recommend-toggle" onclick="toggleRecommendSection()" style="cursor:pointer; display:flex; align-items:center; gap:6px;">
      <span>추천 친구 ${recommends.length}</span>
      <i class="ti ti-chevron-down" id="recommend-chevron" style="font-size:13px; color:#888; transition:transform 0.2s;"></i>
    </div>
    <div id="recommend-list" style="display:none;">
  `;
  html += recommends.map(p => `
    <div class="friend-item" style="opacity:0.8;">
      <div class="avatar-sm avatar-base" ${p.avatar ? `style="background-image:url('${p.avatar}');"` : ''}>${p.avatar ? '' : '<i class="ti ti-user"></i>'}</div>
      <div style="flex:1;"><div class="fi-name">${p.name}</div><div class="fi-status">${p.status || '안녕하세요!'}</div></div>
      <button onclick="quickAddFriend('${p.id}','${p.username || ''}','${p.name}')" style="background:#fee500;border:none;border-radius:8px;padding:5px 10px;font-size:12px;font-weight:700;cursor:pointer;">추가</button>
    </div>
  `).join('');
  html += `</div></div>`;
  return html;
}

function toggleRecommendSection() {
  const list = document.getElementById('recommend-list');
  const chevron = document.getElementById('recommend-chevron');
  if (!list) return;
  const isOpen = list.style.display !== 'none';
  list.style.display = isOpen ? 'none' : 'block';
  if (chevron) chevron.style.transform = isOpen ? '' : 'rotate(180deg)';
}

async function quickAddFriend(friendId, friendUsername, friendName) {
  if (friendsList.some(f => f.id === friendId)) { showToast("알림","이미 친구입니다.","#888"); return; }

  // ✅ 양방향 friendship insert (나 → 상대, 상대 → 나)
  await supabaseClient.from('friendships').upsert([
    { user_id: currentUserId, friend_id: friendId, status: 'accepted' },
    { user_id: friendId, friend_id: currentUserId, status: 'accepted' }
  ], { onConflict: 'user_id,friend_id' });

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
  friendsList.push({ 
    id: friendId, 
    username: friendUsername, 
    name: friendName, 
    status: fullProfile?.status || '', 
    avatar: fullProfile?.avatar || null, 
    isFavorite: false 
  });
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
    c && c.name?.toLowerCase().includes(chatSearchQuery.toLowerCase())
  );
  
  if (filtered.length === 0) {
    container.innerHTML = `<div class="empty-state"><p>채팅방이 없습니다.</p></div>`;
    return;
  }
  
  container.innerHTML = '';
  for (const room of filtered) {
    if (!room || !room.id) continue;
    
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
  const room = chatRoomsList.find(r => r && r.id === roomId);
  if (!room) {
    // DB에서 직접 조회 (친구 추가 후 바로 열리는 경우 대비)
    const { data: dbRoom } = await supabaseClient
      .from('chat_rooms')
      .select('*')
      .eq('id', roomId)
      .single();
    if (!dbRoom) return;
    chatRoomsList.push(dbRoom);
    return openRoomFromData(roomId);
  }
  
  // ✅ currentRoom을 roomId가 포함된 객체로 명확히 설정
  currentRoom = { ...room };
  roomOpen = true;
  
  document.getElementById('room-title').textContent = room.name || '채팅방';
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-room').classList.add('active');
  document.getElementById('tab-bar').style.display = 'none';
  
  // 단체방이 아닐 경우 초대 버튼 숨김
  const inviteIcon = document.getElementById('room-invite-icon');
  if (inviteIcon) inviteIcon.style.display = room.is_group ? 'inline-block' : 'none';
  
  if (messagesSubscription) {
    supabaseClient.removeChannel(messagesSubscription);
    messagesSubscription = null;
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
        // 내가 보낸 메시지는 sendMsg에서 이미 UI에 추가하므로 중복 방지
        if (payload.new.sender_id !== currentUserId) {
          appendMessageToUI(payload.new);
        }
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
    .eq('deleted_for_all', false)
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
  if (msg.deleted_for_all) return;
  
  const isMine = msg.sender_id === currentUserId;
  const row = document.createElement('div');
  row.className = `msg-row ${isMine ? 'mine' : 'other'}`;
  row.setAttribute('data-msg-id', msg.id);
  
  const bwrap = document.createElement('div');
  bwrap.className = 'bwrap';
  
  // 상대방 이름 표시 (단체방)
  if (!isMine && currentRoom.is_group) {
    const sender = friendsList.find(f => f.id === msg.sender_id);
    const nameEl = document.createElement('div');
    nameEl.className = 'msg-sender-name';
    nameEl.textContent = sender?.name || '알 수 없음';
    bwrap.appendChild(nameEl);
  }
  
  const bubble = document.createElement('div');
  bubble.className = `bubble ${isMine ? 'mine' : 'other'}`;
  if (msg.is_image && msg.image_url) {
    bubble.classList.add('image-bubble');
    bubble.innerHTML = `<img src="${msg.image_url}" alt="이미지" style="max-width:200px; max-height:200px;">`;
    bubble.onclick = () => openImageViewer(msg.image_url, msg.id);
  } else {
    bubble.textContent = msg.text || '';
    bubble.onclick = (e) => { e.stopPropagation(); triggerBubbleMenu(e, msg.id, isMine); };
  }
  
  const meta = document.createElement('div');
  meta.className = 'bmeta';
  // 실제 메시지 생성 시간 표시
  let msgTime = timeNow();
  if (msg.created_at) {
    const d = new Date(msg.created_at);
    const h = d.getHours();
    const mm = String(d.getMinutes()).padStart(2, '0');
    msgTime = `${h >= 12 ? '오후' : '오전'} ${h % 12 || 12}:${mm}`;
  }
  meta.innerHTML = `<span>${msgTime}</span>`;
  
  bwrap.appendChild(bubble);
  bwrap.appendChild(meta);
  row.appendChild(bwrap);
  container.appendChild(row);
  container.scrollTop = container.scrollHeight;
}

async function sendMsg() {
  const input = document.getElementById('msg-input');
  const text = input?.value.trim();
  if (!text || !currentRoom?.id) return;
  if (input) input.value = '';
  
  // ✅ 즉시 UI에 추가 (낙관적 업데이트)
  const tempMsg = {
    id: 'temp_' + Date.now(),
    room_id: currentRoom.id,
    sender_id: currentUserId,
    text: text,
    is_image: false,
    created_at: new Date().toISOString(),
    deleted_for_all: false
  };
  appendMessageToUI(tempMsg);
  
  const { data, error } = await supabaseClient.from('messages').insert({
    room_id: currentRoom.id,
    sender_id: currentUserId,
    text: text,
    is_image: false,
    deleted_for_all: false
  }).select().single();
  
  if (error) {
    console.error('메시지 전송 오류:', error);
    showToast('오류', '메시지 전송에 실패했습니다.', '#ff4757');
    // 실패 시 임시 메시지 제거
    const tempEl = document.querySelector(`[data-msg-id="temp_${Date.now()}"]`);
    if (tempEl) tempEl.remove();
  }
}

/* ==========================================================================
   메시지 컨텍스트 메뉴
   ========================================================================== */
function triggerBubbleMenu(e, messageId, isMine) {
  selectedMessageId = messageId;
  const menu = document.getElementById('bubble-context-menu');
  const deleteAllBtn = document.getElementById('menu-delete-all-btn');
  if (deleteAllBtn) deleteAllBtn.style.display = isMine ? 'block' : 'none';
  if (menu) {
    menu.style.top = `${e.pageY}px`;
    menu.style.left = `${Math.min(e.pageX, window.innerWidth - 130)}px`;
    menu.classList.add('active');
    // 외부 클릭 시 메뉴 닫기
    setTimeout(() => {
      document.addEventListener('click', closeBubbleMenu, { once: true });
    }, 100);
  }
}

function closeBubbleMenu() {
  document.getElementById('bubble-context-menu')?.classList.remove('active');
}

async function handleBubbleDelete(type) {
  closeBubbleMenu();
  if (!selectedMessageId) return;
  
  if (type === 'all') {
    await supabaseClient.from('messages')
      .update({ deleted_for_all: true })
      .eq('id', selectedMessageId)
      .eq('sender_id', currentUserId);
    
    // UI에서 해당 메시지 제거
    const msgEl = document.querySelector(`[data-msg-id="${selectedMessageId}"]`);
    if (msgEl) msgEl.remove();
  } else {
    // 나에게만 삭제: UI에서만 제거
    const msgEl = document.querySelector(`[data-msg-id="${selectedMessageId}"]`);
    if (msgEl) msgEl.remove();
    showToast("알림", "나에게만 삭제되었습니다.", "#555");
  }
  selectedMessageId = null;
}

/* ==========================================================================
   파일 첨부 / 이미지 전송
   ========================================================================== */
function triggerClip() {
  document.getElementById('clip-file-input')?.click();
}

async function handleClipFile(inputEl) {
  const file = inputEl.files[0];
  if (!file || !currentRoom?.id) return;
  
  const reader = new FileReader();
  reader.onload = async function(e) {
    const base64 = e.target.result;
    await supabaseClient.from('messages').insert({
      room_id: currentRoom.id,
      sender_id: currentUserId,
      text: '',
      is_image: true,
      image_url: base64,
      deleted_for_all: false
    });
  };
  reader.readAsDataURL(file);
  inputEl.value = "";
}

/* ==========================================================================
   친구 관리 (추가/삭제/차단)
   ========================================================================== */
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
  
  if (friendsList.length === 0) {
    listCont.innerHTML = '<div style="padding:12px;text-align:center;color:#888;">친구가 없습니다</div>';
    return;
  }
  
  listCont.innerHTML = friendsList.map(f => `
    <div class="manage-item" id="manage-item-${f.id}">
      <span><strong>${f.name}</strong><br><small style="color:#888;">@${f.username || ''}</small></span>
      <div style="display:flex; gap:6px;">
        <button class="btn-cancel" style="background:#ff6b35; color:white; font-size:12px; padding:4px 8px;" onclick="blockFriend('${f.id}', '${f.name}')">차단</button>
        <button class="btn-cancel" style="background:#ff4757; color:white; font-size:12px; padding:4px 8px;" onclick="removeFriend('${f.id}')">삭제</button>
      </div>
    </div>
  `).join('');
}

// ✅ 친구 삭제 (양방향 + 관리창 즉시 반영)
async function removeFriend(friendId) {
  if (!confirm('정말 이 친구를 삭제하시겠습니까?')) return;
  
  // 양방향 삭제
  await supabaseClient.from('friendships')
    .delete()
    .eq('user_id', currentUserId)
    .eq('friend_id', friendId);
  await supabaseClient.from('friendships')
    .delete()
    .eq('user_id', friendId)
    .eq('friend_id', currentUserId);

  // ✅ 로컬 목록에서 즉시 제거
  friendsList = friendsList.filter(f => f.id !== friendId);
  
  // ✅ 관리창 DOM에서도 즉시 제거
  const itemEl = document.getElementById(`manage-item-${friendId}`);
  if (itemEl) itemEl.remove();
  
  renderFriends();
  showToast("친구 삭제", "친구 목록에서 제거되었습니다.", "#ff4757");
}

// ✅ 차단 기능
async function blockFriend(friendId, friendName) {
  if (!confirm(`${friendName}님을 차단하시겠습니까?\n차단 시 상대방은 메시지와 프로필을 볼 수 없습니다.`)) return;
  
  // 차단 테이블에 추가
  await supabaseClient.from('blocks').upsert({
    blocker_id: currentUserId,
    blocked_id: friendId
  }, { onConflict: 'blocker_id,blocked_id' });
  
  // 친구 목록에서도 삭제
  await supabaseClient.from('friendships')
    .delete()
    .eq('user_id', currentUserId)
    .eq('friend_id', friendId);
  await supabaseClient.from('friendships')
    .delete()
    .eq('user_id', friendId)
    .eq('friend_id', currentUserId);
  
  // 로컬 상태 업데이트
  const blocked = friendsList.find(f => f.id === friendId);
  if (blocked) blockedList.push(blocked);
  friendsList = friendsList.filter(f => f.id !== friendId);
  
  // 관리창 DOM에서 즉시 제거
  const itemEl = document.getElementById(`manage-item-${friendId}`);
  if (itemEl) itemEl.remove();
  
  renderFriends();
  showToast("차단 완료", `${friendName}님이 차단되었습니다.`, "#ff6b35");
}

// ✅ 차단 해제 모달
function openBlockedListModal() {
  let modal = document.getElementById('blocked-list-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'blocked-list-modal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-content">
        <h3>🚫 차단 목록</h3>
        <div class="manage-list" id="blocked-user-list" style="max-height:250px;"></div>
        <div class="modal-btns">
          <button class="btn-cancel" onclick="document.getElementById('blocked-list-modal').classList.remove('active')">닫기</button>
        </div>
      </div>
    `;
    document.getElementById('app').appendChild(modal);
  }
  
  renderBlockedList();
  modal.classList.add('active');
}

function renderBlockedList() {
  const listCont = document.getElementById('blocked-user-list');
  if (!listCont) return;
  
  if (blockedList.length === 0) {
    listCont.innerHTML = '<div style="padding:12px;text-align:center;color:#888;">차단한 사용자가 없습니다</div>';
    return;
  }
  
  listCont.innerHTML = blockedList.map(b => `
    <div class="manage-item" id="blocked-item-${b.id}">
      <span><strong>${b.name}</strong></span>
      <button class="btn-confirm" style="font-size:12px; padding:4px 8px;" onclick="unblockUser('${b.id}', '${b.name}')">차단 해제</button>
    </div>
  `).join('');
}

async function unblockUser(blockedId, blockedName) {
  await supabaseClient.from('blocks')
    .delete()
    .eq('blocker_id', currentUserId)
    .eq('blocked_id', blockedId);
  
  blockedList = blockedList.filter(b => b.id !== blockedId);
  
  const itemEl = document.getElementById(`blocked-item-${blockedId}`);
  if (itemEl) itemEl.remove();
  
  // 추천 친구로 다시 표시되도록 재렌더
  renderFriends();
  showToast("차단 해제", `${blockedName}님의 차단이 해제되었습니다.`, "#2ed573");
}

// ✅ 친구 추가 (양방향 friendship insert)
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
  
  // 차단 여부 확인
  if (blockedList.some(b => b.id === profile.id)) {
    alert("차단한 사용자입니다. 차단 해제 후 추가해주세요.");
    return;
  }
  
  if (friendsList.some(f => f.id === profile.id)) { alert("이미 친구입니다."); return; }
  
  // ✅ 양방향 friendship insert (나 → 상대, 상대 → 나 모두 추가되어 상대 추천목록에도 표시됨)
  await supabaseClient.from('friendships').upsert([
    { user_id: currentUserId, friend_id: profile.id, status: 'accepted' },
    { user_id: profile.id, friend_id: currentUserId, status: 'accepted' }
  ], { onConflict: 'user_id,friend_id' });
  
  // 1:1 채팅방 생성
  const roomName = profile.name;
  const { data: room } = await supabaseClient.from('chat_rooms').insert({
    name: roomName,
    is_group: false,
    created_by: currentUserId
  }).select().single();
  
  if (room) {
    await supabaseClient.from('chat_room_members').insert([
      { room_id: room.id, user_id: currentUserId },
      { room_id: room.id, user_id: profile.id }
    ]);
    chatRoomsList.push(room);
  }
  
  // 로컬 목록에 즉시 추가
  friendsList.push({
    id: profile.id,
    username: profile.username || '',
    name: profile.name,
    status: profile.status || '안녕하세요!',
    avatar: profile.avatar || null,
    isFavorite: false
  });
  renderFriends();
  renderChats();
  renderManageList();
  if (input) input.value = '';
  showToast("친구 추가", `${profile.name}님과 친구가 되었습니다!`, "#2ed573");
}

/* ==========================================================================
   프로필 카드
   ========================================================================== */
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
    
    // ✅ 차단된 사용자면 프로필 볼 수 없음
    const amIBlocked = await checkIfBlockedByTarget(id);
    if (amIBlocked) {
      showToast("알림", "이 사용자에게 차단되었습니다.", "#888");
      return;
    }
    
    document.getElementById('pc-name').textContent = user.name;
    document.getElementById('pc-status').textContent = user.status || '안녕하세요!';
    nameEditIcon.style.display = 'none';
    statusEditIcon.style.display = 'none';
    starBtn.style.display = 'inline-block';
    
    const isFav = user.isFavorite;
    starBtn.className = isFav ? 'ti ti-star-filled' : 'ti ti-star';
    
    applyAvatarStyle(avatarEl, user.avatar);
    actionsContainer.innerHTML = `
      <button class="pc-action-btn" onclick="closeProfileCard(); openRoomFromData('${findRoomIdWithFriend(id)}')"><i class="ti ti-message-2"></i><span>1:1 채팅</span></button>
    `;
  }
  cardOverlay.classList.add('active');
}

// 차단당했는지 확인 (상대방이 나를 차단했는지)
async function checkIfBlockedByTarget(targetId) {
  const { data } = await supabaseClient
    .from('blocks')
    .select('id')
    .eq('blocker_id', targetId)
    .eq('blocked_id', currentUserId)
    .maybeSingle();
  return !!data;
}

// 1:1 채팅방 ID 찾기
function findRoomIdWithFriend(friendId) {
  // 1:1 채팅방 중 해당 친구와의 방 찾기
  const room = chatRoomsList.find(r => r && !r.is_group);
  return room?.id || null;
}

function closeProfileCard() {
  document.getElementById('profile-card').classList.remove('active');
  profileTargetId = null;
}

function toggleFavoriteAction() {
  if (!profileTargetId || profileTargetId === 'me') return;
  const friend = friendsList.find(f => f.id === profileTargetId);
  if (!friend) return;
  friend.isFavorite = !friend.isFavorite;
  renderFriends();
  const starBtn = document.getElementById('pc-star-btn');
  if (starBtn) starBtn.className = friend.isFavorite ? 'ti ti-star-filled' : 'ti ti-star';
  showToast(friend.isFavorite ? "즐겨찾기 추가" : "즐겨찾기 해제", `${friend.name}님을 ${friend.isFavorite ? "즐겨찾기에 추가" : "즐겨찾기에서 제거"}했습니다.`, "#fee500");
}

/* ==========================================================================
   프로필 이미지 업로드
   ========================================================================== */
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

/* ==========================================================================
   이미지 뷰어
   ========================================================================== */
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

async function deleteViewerImage() {
  if (!viewerContextMessageId) return;
  if (!confirm('이 이미지를 삭제하시겠습니까?')) return;
  await supabaseClient.from('messages')
    .update({ deleted_for_all: true })
    .eq('id', viewerContextMessageId)
    .eq('sender_id', currentUserId);
  closeImageViewer();
  if (roomOpen && currentRoom.id) await loadMessages(currentRoom.id);
}

function toggleViewerDropdown(e) {
  e.stopPropagation();
  document.getElementById('viewer-dropdown')?.classList.toggle('active');
}

/* ==========================================================================
   이모티콘 서랍
   ========================================================================== */
function toggleEmoticonDrawer() {
  document.getElementById('emoticon-drawer')?.classList.toggle('active');
}
function selectEmot(emot) {
  const input = document.getElementById('msg-input');
  if (input) input.value += emot;
  toggleEmoticonDrawer();
}

/* ==========================================================================
   탭 전환 및 화면 이동
   ========================================================================== */
function switchTab(tab) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  const map = { friends: 'screen-friends', chats: 'screen-chats', more: 'screen-more' };
  document.getElementById(map[tab])?.classList.add('active');
  document.getElementById('tab-' + tab)?.classList.add('active');
  currentTab = tab;
}

function closeRoom() {
  roomOpen = false;
  currentRoom = { id: null, isGroup: false, name: '' };
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

/* ==========================================================================
   채팅방 검색
   ========================================================================== */
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

/* ==========================================================================
   친구 검색
   ========================================================================== */
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

/* ==========================================================================
   채팅방 내 검색
   ========================================================================== */
function toggleRoomSearch() {
  document.getElementById('room-search-bar')?.classList.toggle('active');
  if (document.getElementById('room-search-bar')?.classList.contains('active')) {
    document.getElementById('room-search-input')?.focus();
  }
}
function closeRoomSearch() {
  document.getElementById('room-search-bar')?.classList.remove('active');
  if (document.getElementById('room-search-input')) document.getElementById('room-search-input').value = '';
  // 하이라이트 제거
  document.querySelectorAll('.bubble.highlight').forEach(b => b.classList.remove('highlight'));
}
function searchRoomMessages() {
  const query = document.getElementById('room-search-input')?.value.trim().toLowerCase();
  document.querySelectorAll('.bubble.highlight').forEach(b => b.classList.remove('highlight'));
  if (!query) return;
  const bubbles = document.querySelectorAll('#room-messages .bubble');
  let first = null;
  bubbles.forEach(b => {
    if (b.textContent.toLowerCase().includes(query)) {
      b.classList.add('highlight');
      if (!first) first = b;
    }
  });
  if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

/* ==========================================================================
   읽지 않은 메시지 점
   ========================================================================== */
function checkUnreadDots() {
  // TODO: 읽지 않은 메시지 수 계산
}

/* ==========================================================================
   채팅 스와이프 액션
   ========================================================================== */
function chatSwipeAction(action, roomId) {
  if (action === 'leave') {
    if (confirm('이 채팅방을 나가시겠습니까?')) {
      leaveChatRoom(roomId);
    }
  } else {
    showToast("알림", `${action} 기능 준비 중입니다.`, "#888");
  }
}

async function leaveChatRoom(roomId) {
  await supabaseClient.from('chat_room_members')
    .delete()
    .eq('room_id', roomId)
    .eq('user_id', currentUserId);
  
  chatRoomsList = chatRoomsList.filter(r => r.id !== roomId);
  renderChats();
  showToast("채팅방 나가기", "채팅방에서 나왔습니다.", "#888");
}

/* ==========================================================================
   텍스트 편집 모달 (이름/상태메시지)
   ========================================================================== */
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
}

function closeTextEditModal() {
  document.getElementById('text-edit-modal')?.classList.remove('active');
}

async function saveTextEditAction() {
  const val = document.getElementById('text-modal-input')?.value.trim();
  if (!val) return;
  
  const updateObj = textEditMode === 'name' ? { name: val } : { status: val };
  await supabaseClient.from('profiles').update(updateObj).eq('id', currentUserId);
  
  if (textEditMode === 'name') {
    currentUserProfile.name = val;
  } else {
    currentUserProfile.status = val;
  }
  syncMyProfileDOM();
  closeTextEditModal();
  openProfileCard('me');
  showToast("저장", "변경사항이 저장되었습니다.", "#2ed573");
}

/* ==========================================================================
   단체채팅방 생성
   ========================================================================== */
function openGroupCreateModal() {
  document.getElementById('group-create-modal')?.classList.add('active');
  const memberList = document.getElementById('group-member-list');
  if (!memberList) return;
  memberList.innerHTML = friendsList.map(f => `
    <div class="manage-item">
      <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
        <input type="checkbox" value="${f.id}" style="width:16px;height:16px;">
        <strong>${f.name}</strong>
      </label>
    </div>
  `).join('') || '<div style="padding:12px;color:#888;">친구가 없습니다</div>';
}

function closeGroupCreateModal() {
  document.getElementById('group-create-modal')?.classList.remove('active');
  if (document.getElementById('group-name-input')) document.getElementById('group-name-input').value = '';
}

async function confirmCreateGroupChat() {
  const name = document.getElementById('group-name-input')?.value.trim();
  if (!name) { alert("채팅방 이름을 입력해주세요."); return; }
  
  const checked = document.querySelectorAll('#group-member-list input[type="checkbox"]:checked');
  const memberIds = Array.from(checked).map(c => c.value);
  
  if (memberIds.length === 0) { alert("초대할 친구를 선택해주세요."); return; }
  
  const { data: room } = await supabaseClient.from('chat_rooms').insert({
    name: name,
    is_group: true,
    created_by: currentUserId
  }).select().single();
  
  if (!room) return;
  
  const members = [currentUserId, ...memberIds].map(uid => ({ room_id: room.id, user_id: uid }));
  await supabaseClient.from('chat_room_members').insert(members);
  
  chatRoomsList.push(room);
  closeGroupCreateModal();
  renderChats();
  showToast("그룹 채팅", `"${name}" 방이 생성되었습니다.`, "#2ed573");
}

/* ==========================================================================
   친구 초대 모달
   ========================================================================== */
function openInviteModal() {
  document.getElementById('invite-modal')?.classList.add('active');
  const memberList = document.getElementById('invite-member-list');
  if (!memberList) return;
  
  // 현재 채팅방 멤버를 제외한 친구 목록
  memberList.innerHTML = friendsList.map(f => `
    <div class="manage-item">
      <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
        <input type="checkbox" value="${f.id}" style="width:16px;height:16px;">
        <strong>${f.name}</strong>
      </label>
    </div>
  `).join('') || '<div style="padding:12px;color:#888;">초대할 친구가 없습니다</div>';
}

function closeInviteModal() {
  document.getElementById('invite-modal')?.classList.remove('active');
}

async function confirmInviteMembers() {
  const checked = document.querySelectorAll('#invite-member-list input[type="checkbox"]:checked');
  const memberIds = Array.from(checked).map(c => c.value);
  if (memberIds.length === 0) { alert("초대할 친구를 선택해주세요."); return; }
  
  const inserts = memberIds.map(uid => ({ room_id: currentRoom.id, user_id: uid }));
  await supabaseClient.from('chat_room_members').insert(inserts);
  
  closeInviteModal();
  showToast("초대 완료", `${memberIds.length}명을 초대했습니다.`, "#2ed573");
}

/* ==========================================================================
   관리자 패널
   ========================================================================== */
async function openAdminBanModal() {
  document.getElementById('admin-ban-modal')?.classList.add('active');
  const list = document.getElementById('admin-ban-list');
  if (!list) return;
  
  const { data: allProfiles } = await supabaseClient.from('profiles').select('id, username, name, is_banned');
  list.innerHTML = allProfiles?.filter(p => p.id !== currentUserId).map(p => `
    <div class="manage-item">
      <span><strong>${p.name}</strong><br><small>@${p.username}</small></span>
      <button class="btn-cancel" style="background:${p.is_banned ? '#2ed573' : '#ff4757'};color:white;font-size:12px;padding:4px 8px;" onclick="adminToggleBan('${p.id}', ${!!p.is_banned}, '${p.name}')">
        ${p.is_banned ? '밴 해제' : '밴'}
      </button>
    </div>
  `).join('') || '<div style="padding:12px;color:#888;">사용자가 없습니다</div>';
}

async function adminToggleBan(userId, currentlyBanned, name) {
  await supabaseClient.from('profiles').update({ is_banned: !currentlyBanned }).eq('id', userId);
  showToast("관리자", `${name}님 ${currentlyBanned ? '밴 해제' : '밴'} 처리되었습니다.`, "#5352ed");
  openAdminBanModal();
}

function closeAdminBanModal() {
  document.getElementById('admin-ban-modal')?.classList.remove('active');
}

/* ==========================================================================
   스와이프 액션 (채팅 목록 외부 스와이프)
   ========================================================================== */
function swipeAction(type) {
  showToast("알림", `${type} 기능 준비 중입니다.`, "#888");
  document.getElementById('swipe-action-menu')?.classList.remove('active');
}

/* ==========================================================================
   이벤트 리스너
   ========================================================================== */
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('send-btn')?.addEventListener('click', sendMsg);
  document.getElementById('msg-input')?.addEventListener('keydown', e => { 
    if (e.key === 'Enter') sendMsg(); 
  });

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
  document.getElementById('text-modal-input')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') saveTextEditAction();
  });
  
  // 외부 클릭 시 버블 메뉴 닫기
  document.addEventListener('click', (e) => {
    const menu = document.getElementById('bubble-context-menu');
    if (menu && !menu.contains(e.target)) {
      menu.classList.remove('active');
    }
    const vDropdown = document.getElementById('viewer-dropdown');
    if (vDropdown && !document.getElementById('viewer-more-btn')?.contains(e.target)) {
      vDropdown.classList.remove('active');
    }
  });
});

// 더보기 탭의 차단 목록 메뉴를 HTML에 없으므로 동적으로 추가
window.addEventListener('DOMContentLoaded', () => {
  const moreMenu = document.querySelector('.more-menu');
  if (moreMenu) {
    const blockMenuItem = document.createElement('div');
    blockMenuItem.className = 'mm-item';
    blockMenuItem.onclick = openBlockedListModal;
    blockMenuItem.innerHTML = `<i class="ti ti-ban" style="color:#ff6b35;"></i><span class="mm-label" style="color:#ff6b35;">차단 목록 관리</span><i class="ti ti-chevron-right mm-arr"></i>`;
    // 로그아웃 버튼 앞에 삽입
    const logoutItem = moreMenu.querySelector('[onclick="handleLogout()"]');
    if (logoutItem) {
      moreMenu.insertBefore(blockMenuItem, logoutItem);
    } else {
      moreMenu.appendChild(blockMenuItem);
    }
  }
});
ENDOFFILE
출력

exit code 0
