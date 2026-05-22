}
}

function compressImage(file, maxWidth = 1024, quality = 0.7) {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      let w = img.width, h = img.height;
      if (w > maxWidth) { h = h * maxWidth / w; w = maxWidth; }
      canvas.width = w; canvas.height = h;
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      canvas.toBlob(resolve, 'image/jpeg', quality);
    };
    img.src = url;
  });
}
async function handleClipFile(inputElement) {
const file = inputElement.files[0];
if (!file) return;
@@ -1149,12 +1166,12 @@ async function handleClipFile(inputElement) {
return;
}

  const ext = file.name.split('.').pop();
  const fileName = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 8)}.${ext}`;
  const compressed = await compressImage(file, 1024, 0.7);
  const fileName = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 8)}.jpg`;

const { error: uploadError } = await supabaseClient.storage
.from('chat-images')
    .upload(fileName, file);
    .upload(fileName, compressed);

if (uploadError) {
console.error('업로드 실패:', uploadError);
@@ -1447,20 +1464,17 @@ async function handleProfileImageUpload(inputElement, type) {
return;
}

  // 파일 크기 제한 (5MB)
if (file.size > 5 * 1024 * 1024) {
showToast("오류", "5MB 이하의 이미지만 업로드 가능합니다.", "#ff4757");
return;
}

  // 파일명 생성
  const ext = file.name.split('.').pop();
  const fileName = `${type}_${currentUserId}_${Date.now()}.${ext}`;
  const compressed = await compressImage(file, 512, 0.8);
  const fileName = `${type}_${currentUserId}_${Date.now()}.jpg`;

  // 1. Storage에 업로드
const { error: uploadError } = await supabaseClient.storage
.from('chat-images')
    .upload(fileName, file);
    .upload(fileName, compressed);

if (uploadError) {
console.error('업로드 실패:', uploadError);
@@ -1469,16 +1483,13 @@ async function handleProfileImageUpload(inputElement, type) {
return;
}

  // 2. public URL 얻기
const { data: urlData } = supabaseClient.storage
.from('chat-images')
.getPublicUrl(fileName);

  // 3. DB에 URL 저장
const updateData = type === 'avatar' ? { avatar: urlData.publicUrl } : { bg: urlData.publicUrl };
await supabaseClient.from('profiles').update(updateData).eq('id', currentUserId);

  // 4. 상태 업데이트
if (type === 'avatar') {
currentUserProfile.avatar = urlData.publicUrl;
} else {
@@ -1489,6 +1500,18 @@ async function handleProfileImageUpload(inputElement, type) {
openProfileCard('me');
showToast("프로필", type === 'avatar' ? "프로필 사진이 변경되었습니다." : "배경 사진이 변경되었습니다.", "#2ed573");

  friendsList.forEach(f => {
    if (f.id === currentUserId) f.avatar = currentUserProfile.avatar;
  });
  
  renderChats();
  inputElement.value = "";
}
  
  syncMyProfileDOM();
  openProfileCard('me');
  showToast("프로필", type === 'avatar' ? "프로필 사진이 변경되었습니다." : "배경 사진이 변경되었습니다.", "#2ed573");
  
// friendsList 업데이트 (내 프로필 사진)
friendsList.forEach(f => {
if (f.id === currentUserId) f.avatar = currentUserProfile.avatar;
