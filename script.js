async function sendPushNotification(text, isImage = false) {
  // ✅ 앱이 활성화되어 있으면 (켜져 있으면) 푸시 알림 보내지 않음
  if (isAppActive) {
    console.log('앱 켜져 있음 - 푸시 알림 생략');
    return;
  }
  
  try {
    const otherIds = currentRoom.members?.filter(id => id !== currentUserId) || [];
    if (otherIds.length === 0) return;

    const { data: profiles } = await supabaseClient
      .from('profiles')
      .select('onesignal_player_id')
      .in('id', otherIds);

    const player_ids = profiles?.map(p => p.onesignal_player_id).filter(Boolean) || [];
    if (player_ids.length === 0) return;

    const messageText = isImage ? '📷 사진' : (text.length > 50 ? text.substring(0, 50) + '...' : text);

    await fetch('https://talk-talk-phi.vercel.app/api/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        player_ids,
        title: currentUserProfile?.name || '톡톡',
        message: messageText,
      })
    });
  } catch(e) {
    console.error('알림 전송 실패:', e);
  }
}
