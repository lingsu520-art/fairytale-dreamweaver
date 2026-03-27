/* ============================================
   童话织梦机 — Application Logic (Firebase + OSS)
   ============================================ */

// --- Firebase Config ---
const firebaseConfig = {
  apiKey: "AIzaSyC3bTo1_POWXXBjXGobDdRIEPeGQZtUNrk",
  authDomain: "fairytale-dreamweaver.firebaseapp.com",
  projectId: "fairytale-dreamweaver",
  storageBucket: "fairytale-dreamweaver.firebasestorage.app",
  messagingSenderId: "1094672552918",
  appId: "1:1094672552918:web:474581d1215cc5a7d68a77"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
// --- Aliyun OSS via STS ---
const OSS_BUCKET = 'fairytale-dreamweaver-images';
const OSS_REGION = 'oss-cn-hangzhou';
const STS_SERVER = window.STS_SERVER_URL || 'http://localhost:3001';

let ossClient = null;
let ossTokenExpireTime = 0;

async function getOSSClient() {
  const now = Date.now();
  // 如果 token 还有 2 分钟以上有效期，复用现有 client
  if (ossClient && ossTokenExpireTime - now > 120000) {
    return ossClient;
  }

  // 向 STS 服务请求临时凭证
  const res = await fetch(`${STS_SERVER}/sts-token`);
  if (!res.ok) throw new Error('获取 STS 凭证失败');
  const cred = await res.json();

  ossClient = new OSS({
    region: OSS_REGION,
    accessKeyId: cred.accessKeyId,
    accessKeySecret: cred.accessKeySecret,
    stsToken: cred.stsToken,
    bucket: OSS_BUCKET,
  });
  ossTokenExpireTime = new Date(cred.expiration).getTime();
  return ossClient;
}

// --- Qwen API Config ---
const API_CONFIG = {
  apiKey: 'sk-3e431fec7e3c49eeb6efb4f4390ca994',
  apiBase: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  model: 'qwen-plus',
  imageModel: 'wan2.1-t2i-plus'
};

// --- Picture Book Config ---
const PICTURE_BOOK_CONFIG = {
  shortStoryThreshold: 800, // 800字以下为短故事
  shortStoryImages: 4,      // 短故事生成4张
  longStoryImages: 6,       // 长故事生成6张
  imageSize: '1024x1024'    // 图片尺寸
};

// --- Style to Art Style Mapping ---
const STYLE_ART_PROMPTS = {
  andersen: 'watercolor painting style, soft pastel colors, dreamy atmosphere, delicate illustrations, children book illustration, whimsical and romantic, European fairy tale aesthetic',
  grimm: 'classic storybook illustration, detailed ink and watercolor, dark forest atmosphere, medieval European setting, Brothers Grimm aesthetic, rich textures',
  aesop: 'simple and clean illustration style, warm earth tones, animal characters, moral story aesthetic, classic fable illustration, educational children book style',
  eastern: 'traditional Chinese painting style, ink wash painting, oriental watercolor, mythical creatures, ancient Chinese aesthetic, poetic atmosphere, ethereal landscapes'
};

// --- State ---
let selectedStyle = 'andersen';
let currentStory = '';
let isGenerating = false;
let abortController = null;
let currentUser = null;
let currentUsername = '';
let authMode = 'login';
let currentStoryId = null; // 当前查看的故事ID
let currentStoryData = null; // 当前查看的故事数据
let storyToDelete = null; // 待删除的故事ID

// --- Style prompts ---
const STYLE_PROMPTS = {
  andersen: '请以安徒生童话的风格写作。语言优美浪漫，富有诗意和哲理，带有淡淡的忧伤与温暖并存的情感基调。注重人物内心世界的刻画，结局可以是感人的、发人深省的。',
  grimm: '请以格林童话的风格写作。故事充满奇幻冒险色彩，有明确的善恶对立，正义最终战胜邪恶。情节跌宕起伏，有森林、城堡、魔法等经典元素，结局圆满幸福。',
  aesop: '请以伊索寓言的风格写作。故事简洁精炼，以动物为主角，通过生动有趣的故事传达深刻的人生道理和智慧。结尾需要点明寓意，让孩子从中获得启发。',
  eastern: '请以东方神话故事的风格写作。融入中国传统文化元素，如仙人、神兽、法宝、山川河流等意象。语言优雅古朴，带有诗词韵味，展现东方美学和传统价值观。'
};

const STYLE_ICONS = { andersen: '🧜‍♀️', grimm: '🏰', aesop: '🦊', eastern: '🐉' };

// --- Init ---
document.addEventListener('DOMContentLoaded', () => {
  initStyleCards();
  initEventListeners();
  initMobileTabs();
  registerServiceWorker();
  initAuth();
});

// --- PWA Service Worker ---
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').then(reg => {
      console.log('SW registered:', reg.scope);
    }).catch(err => {
      console.log('SW registration failed:', err);
    });
  }
}

// --- Event Listeners ---
function initEventListeners() {
  document.getElementById('generateBtn').addEventListener('click', generateStory);
  document.getElementById('keepBtn').addEventListener('click', onKeepStoryClick);
  document.getElementById('discardBtn').addEventListener('click', discardStory);

  // Logout button
  document.getElementById('userLogoutBtn').addEventListener('click', logoutUser);

  // Modal
  const userModal = document.getElementById('userModal');
  userModal.addEventListener('click', function(e) {
    if (e.target === userModal && currentUser) {
      closeUserModal();
    }
  });

  document.getElementById('modalCloseBtn').addEventListener('click', closeUserModal);
  document.getElementById('modalLoginBtn').addEventListener('click', handleAuth);

  // Auth mode toggle
  document.getElementById('authToggleBtn').addEventListener('click', toggleAuthMode);

  // Enter key in password input
  document.getElementById('passwordInput').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') handleAuth();
  });
  document.getElementById('usernameInput').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') document.getElementById('passwordInput').focus();
  });

  // Picture Book Modal
  document.getElementById('generatePictureBookBtn').addEventListener('click', () => {
    closePictureBookModal();
    generatePictureBook();
  });
  document.getElementById('skipPictureBookBtn').addEventListener('click', () => {
    closePictureBookModal();
    completeKeepStory();
  });

  // Reader Tab Switching
  document.querySelectorAll('.reader-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const targetTab = tab.dataset.readerTab;
      switchReaderTab(targetTab);
    });
  });

  // Delete Confirm Modal
  document.getElementById('confirmDeleteBtn').addEventListener('click', () => {
    closeDeleteConfirmModal();
    if (storyToDelete) {
      executeDeleteStory(storyToDelete);
      storyToDelete = null;
    }
  });
  document.getElementById('cancelDeleteBtn').addEventListener('click', () => {
    closeDeleteConfirmModal();
    storyToDelete = null;
  });
}

// =============================================
// Auth System (Firebase)
// =============================================
function initAuth() {
  auth.onAuthStateChanged(async (user) => {
    if (user) {
      currentUser = user;
      try {
        const doc = await db.collection('users').doc(user.uid).get();
        if (doc.exists) {
          currentUsername = doc.data().username || '';
        }
      } catch (e) {
        console.error('Failed to load user profile:', e);
      }
      updateUserUI();
      loadStories();
      closeUserModal();
    } else {
      currentUser = null;
      currentUsername = '';
      updateUserUI();
      clearReader();
      clearStoryList();
      openUserModal();
    }
  });
}

function openUserModal() {
  const modal = document.getElementById('userModal');
  const closeBtn = document.getElementById('modalCloseBtn');
  document.getElementById('usernameInput').value = '';
  document.getElementById('passwordInput').value = '';
  hideAuthError();

  closeBtn.style.display = currentUser ? 'flex' : 'none';

  // Reset to login mode
  authMode = 'login';
  updateAuthModeUI();

  modal.classList.add('active');
  setTimeout(() => document.getElementById('usernameInput').focus(), 300);
}

function closeUserModal() {
  document.getElementById('userModal').classList.remove('active');
}

function toggleAuthMode() {
  authMode = authMode === 'login' ? 'register' : 'login';
  updateAuthModeUI();
  hideAuthError();
}

function updateAuthModeUI() {
  const title = document.getElementById('modalTitle');
  const desc = document.getElementById('modalDesc');
  const btn = document.getElementById('modalLoginBtn');
  const toggleText = document.getElementById('authToggleText');
  const toggleBtn = document.getElementById('authToggleBtn');

  if (authMode === 'login') {
    title.textContent = '👋 欢迎回来';
    desc.textContent = '登录你的账号，继续你的童话之旅';
    btn.textContent = '登录';
    toggleText.textContent = '还没有账号？';
    toggleBtn.textContent = '点击注册';
  } else {
    title.textContent = '✨ 创建新账号';
    desc.textContent = '注册一个账号，开启你的童话世界';
    btn.textContent = '注册';
    toggleText.textContent = '已有账号？';
    toggleBtn.textContent = '返回登录';
  }
}

let _authBusy = false;
async function handleAuth() {
  if (_authBusy) return;

  const username = document.getElementById('usernameInput').value.trim();
  const password = document.getElementById('passwordInput').value;

  if (!username) { showAuthError('请输入用户名'); return; }
  if (!password) { showAuthError('请输入密码'); return; }
  if (password.length < 6) { showAuthError('密码至少需要6位'); return; }

  // Construct email from username (encode for Firebase Auth)
  const emailSafe = encodeURIComponent(username).replace(/%/g, '_').toLowerCase();
  const email = emailSafe + '@fairytale-dreamweaver.app';

  _authBusy = true;
  const btn = document.getElementById('modalLoginBtn');
  btn.disabled = true;
  btn.textContent = authMode === 'login' ? '登录中…' : '注册中…';
  hideAuthError();

  // 15秒超时保护，防止永远卡在"登录中"
  const authTimeout = setTimeout(() => {
    _authBusy = false;
    btn.disabled = false;
    btn.textContent = authMode === 'login' ? '登录' : '注册';
    showAuthError('操作超时，请检查网络后重试');
  }, 15000);

  try {
    if (authMode === 'register') {
      const cred = await auth.createUserWithEmailAndPassword(email, password);
      await db.collection('users').doc(cred.user.uid).set({
        username: username,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      currentUsername = username;
      showToast('注册成功，欢迎！', 'success');
    } else {
      await auth.signInWithEmailAndPassword(email, password);
      showToast('欢迎回来！', 'success');
    }
  } catch (err) {
    console.error('Auth error:', err.code, err.message);
    const msg = getAuthErrorMessage(err.code);
    showAuthError(msg);
  } finally {
    clearTimeout(authTimeout);
    _authBusy = false;
    btn.disabled = false;
    btn.textContent = authMode === 'login' ? '登录' : '注册';
  }
}

function getAuthErrorMessage(code) {
  const map = {
    'auth/email-already-in-use': '该用户名已被注册，请直接登录',
    'auth/user-not-found': '用户名不存在，请先注册',
    'auth/wrong-password': '密码错误，请重试',
    'auth/invalid-credential': '用户名或密码错误',
    'auth/too-many-requests': '登录尝试过多，请稍后再试',
    'auth/weak-password': '密码强度不够，至少需要6位',
    'auth/network-request-failed': '网络连接失败，请检查网络',
    'auth/invalid-email': '用户名格式不正确，请使用中英文和数字'
  };
  return map[code] || '操作失败，请稍后重试';
}

async function logoutUser() {
  try {
    await auth.signOut();
    showToast('已退出登录', 'info');
  } catch (e) {
    console.error('Logout error:', e);
  }
}

function updateUserUI() {
  const name = currentUsername || '未登录';
  document.getElementById('userNameDisplay').textContent = name;
  document.getElementById('userAvatar').textContent = currentUser ? getAvatarEmoji(name) : '👤';
}

function getAvatarEmoji(name) {
  const avatars = ['🧸', '🦄', '🐰', '🐱', '🦋', '🌸', '⭐', '🍀', '🎈', '🐳', '🦊', '🐼'];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) & 0xffff;
  return avatars[hash % avatars.length];
}

function showAuthError(msg) {
  const el = document.getElementById('authError');
  el.textContent = msg;
  el.style.display = 'block';
}

function hideAuthError() {
  document.getElementById('authError').style.display = 'none';
}

// =============================================
// Story Management (Firestore)
// =============================================
function getStoriesRef() {
  if (!currentUser) return null;
  return db.collection('users').doc(currentUser.uid).collection('stories');
}

async function loadStories() {
  if (!currentUser) return;
  const ref = getStoriesRef();
  if (!ref) return;

  try {
    const snap = await ref.orderBy('timestamp', 'desc').get();
    const list = document.getElementById('storyList');
    const empty = document.getElementById('sidebarEmpty');

    list.querySelectorAll('.story-item').forEach(el => el.remove());

    if (snap.empty) {
      empty.style.display = 'block';
      return;
    }

    empty.style.display = 'none';

    snap.forEach(doc => {
      const story = { id: doc.id, ...doc.data() };
      const el = document.createElement('div');
      el.className = 'story-item';
      el.dataset.id = story.id;
      // 如果有绘本，显示绘本标记
      const hasPictureBook = story.pictureBook && story.pictureBook.length > 0 ? '🎨 ' : '';
      el.innerHTML = `
        <span class="story-item-icon">${hasPictureBook}${STYLE_ICONS[story.style] || '📖'}</span>
        <div class="story-item-body">
          <div class="story-item-title">${escapeHtml(story.title)}</div>
          <div class="story-item-meta">${story.date || ''}</div>
        </div>
        <button class="story-item-delete" title="删除">×</button>
      `;
      el.querySelector('.story-item-delete').addEventListener('click', function(e) {
        e.stopPropagation();
        confirmDeleteStory(story.id);
      });
      el.addEventListener('click', () => viewStory(story.id, story));
      list.appendChild(el);
    });
  } catch (e) {
    console.error('Failed to load stories:', e);
    showToast('加载故事失败', 'error');
  }
}

// 临时存储保存故事的数据
let pendingStoryData = null;

function onKeepStoryClick() {
  if (!currentStory.trim()) return;
  if (!currentUser) {
    showToast('请先登录', 'error');
    openUserModal();
    return;
  }

  // 准备故事数据
  const lines = currentStory.split('\n');
  let title = '未命名故事';
  for (const l of lines) {
    const t = l.trim().replace(/^[#\s]+/, '').replace(/^《/, '').replace(/》$/, '').trim();
    if (t && t.length < 40 && t.length > 0) {
      title = t;
      break;
    }
  }

  // 获取用户的原始输入
  const userInputText = document.getElementById('userInput').value.trim();

  pendingStoryData = {
    title: title,
    content: currentStory,
    userInput: userInputText,
    style: selectedStyle,
    date: new Date().toLocaleDateString('zh-CN'),
    timestamp: firebase.firestore.FieldValue.serverTimestamp()
  };

  // 显示绘本生成确认弹窗
  showPictureBookModal();
}

function showPictureBookModal() {
  const modal = document.getElementById('pictureBookModal');
  const countEl = document.getElementById('pictureBookCount');
  const storyLength = currentStory.length;
  const imageCount = storyLength < PICTURE_BOOK_CONFIG.shortStoryThreshold
    ? PICTURE_BOOK_CONFIG.shortStoryImages
    : PICTURE_BOOK_CONFIG.longStoryImages;

  countEl.textContent = imageCount;
  modal.classList.add('active');
}

function closePictureBookModal() {
  document.getElementById('pictureBookModal').classList.remove('active');
}

async function completeKeepStory(pictureBook = null) {
  if (!pendingStoryData) return;

  try {
    const storyData = { ...pendingStoryData };
    if (pictureBook) {
      storyData.pictureBook = pictureBook;
    }

    await getStoriesRef().add(storyData);
    loadStories();
    showToast('故事已保存到目录', 'success');
    document.getElementById('readerActions').style.display = 'none';

    if (isMobile()) {
      setTimeout(() => switchMobileTab('sidebar'), 600);
    }
  } catch (e) {
    console.error('Failed to save story:', e);
    showToast('保存失败，请重试', 'error');
  } finally {
    pendingStoryData = null;
  }
}

// 保留旧函数以兼容
async function keepStory() {
  onKeepStoryClick();
}

function discardStory() {
  clearReader();
  currentStory = '';
  showToast('故事已放弃', 'info');
}

function viewStory(id, storyData) {
  document.querySelectorAll('.story-item').forEach(el => el.classList.remove('active'));
  const item = document.querySelector(`.story-item[data-id="${id}"]`);
  if (item) item.classList.add('active');

  currentStory = storyData.content;
  currentStoryId = id;
  currentStoryData = storyData;

  showStoryArea();
  renderStoryText(storyData.content);
  document.getElementById('storyText').classList.remove('streaming');
  document.getElementById('readerActions').style.display = 'none';

  // 渲染绘本内容
  renderPictureBook(storyData.pictureBook || []);

  // 默认切到故事浏览 tab
  switchReaderTab('story');

  if (isMobile()) switchMobileTab('reader');
}

function confirmDeleteStory(id) {
  storyToDelete = id;
  document.getElementById('deleteConfirmModal').classList.add('active');
}

function closeDeleteConfirmModal() {
  document.getElementById('deleteConfirmModal').classList.remove('active');
}

async function executeDeleteStory(id) {
  try {
    await getStoriesRef().doc(id).delete();
    loadStories();
    showToast('故事已删除', 'info');

    // 如果删除的是当前查看的故事，清空阅读区
    if (currentStoryId === id) {
      clearReader();
      currentStoryId = null;
      currentStoryData = null;
    }
  } catch (e) {
    console.error('Failed to delete story:', e);
    showToast('删除失败', 'error');
  }
}

// 保留旧函数以兼容
async function deleteStory(id) {
  confirmDeleteStory(id);
}

function clearStoryList() {
  const list = document.getElementById('storyList');
  list.querySelectorAll('.story-item').forEach(el => el.remove());
  document.getElementById('sidebarEmpty').style.display = 'block';
}

// =============================================
// Style Selection
// =============================================
function initStyleCards() {
  document.querySelectorAll('.style-card').forEach(card => {
    card.addEventListener('click', () => {
      document.querySelectorAll('.style-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      selectedStyle = card.dataset.style;
    });
  });
}

// =============================================
// Story Generation (Qwen API)
// =============================================
async function generateStory() {
  if (isGenerating) {
    if (abortController) abortController.abort();
    setGenerating(false);
    return;
  }

  if (!currentUser) {
    showToast('请先登录', 'error');
    openUserModal();
    return;
  }

  const userInput = document.getElementById('userInput').value.trim();
  if (!userInput) {
    showToast('请先输入故事素材', 'error');
    return;
  }

  setGenerating(true);
  clearReader();
  showStoryArea();
  switchToReaderIfMobile();

  const storyText = document.getElementById('storyText');
  storyText.classList.add('streaming');
  currentStory = '';

  const systemPrompt = `你是一位才华横溢的童话故事作家，专门为儿童创作精彩的童话故事。${STYLE_PROMPTS[selectedStyle]}

创作要求：
1. 请为故事取一个富有吸引力的标题，标题单独一行
2. 故事长度在800-1500字之间，适合家长给孩子讲述
3. 语言生动有趣，适合3-10岁儿童理解
4. 故事要有完整的开头、发展、高潮和结局
5. 融入积极向上的价值观`;

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `请根据以下素材创作一个童话故事：\n\n${userInput}` }
  ];

  abortController = new AbortController();
  const apiUrl = API_CONFIG.apiBase.replace(/\/$/, '') + '/chat/completions';

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_CONFIG.apiKey}`
      },
      body: JSON.stringify({
        model: API_CONFIG.model,
        messages: messages,
        stream: true,
        temperature: 0.85,
        max_tokens: 2048
      }),
      signal: abortController.signal
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`请求失败 (${response.status}): ${errText.slice(0, 200)}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;
        const data = trimmed.slice(5).trim();
        if (data === '[DONE]') continue;

        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) {
            currentStory += delta;
            renderStoryText(currentStory);
          }
        } catch (e) { /* skip */ }
      }
    }

    storyText.classList.remove('streaming');
    setGenerating(false);
    document.getElementById('readerActions').style.display = 'flex';

  } catch (err) {
    storyText.classList.remove('streaming');
    setGenerating(false);
    if (err.name === 'AbortError') {
      showToast('生成已取消', 'info');
    } else {
      showToast(err.message || '生成失败，请稍后重试', 'error');
      console.error(err);
    }
  }
}

// =============================================
// Rendering helpers
// =============================================
function renderStoryText(text) {
  const storyText = document.getElementById('storyText');
  const lines = text.split('\n');
  let title = '';
  let body = text;

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trim();
    if (!l) continue;
    const cleaned = l.replace(/^[#\s]+/, '').replace(/^《/, '').replace(/》$/, '').trim();
    if (cleaned && cleaned.length < 40) {
      title = cleaned;
      body = lines.slice(i + 1).join('\n').trim();
    }
    break;
  }

  let html = '';
  if (title) {
    html += `<div class="story-title-display">${escapeHtml(title)}</div>`;
  }
  html += escapeHtml(body);
  storyText.innerHTML = html;

  const reader = document.getElementById('readerContent');
  reader.scrollTop = reader.scrollHeight;
}

function setGenerating(state) {
  isGenerating = state;
  const btn = document.getElementById('generateBtn');
  const btnText = btn.querySelector('.btn-text');
  const btnIcon = btn.querySelector('.btn-icon');
  const btnLoading = btn.querySelector('.btn-loading');

  if (state) {
    btn.disabled = false;
    btnText.style.display = 'none';
    btnIcon.style.display = 'none';
    btnLoading.style.display = 'inline-flex';
  } else {
    btn.disabled = false;
    btnText.style.display = 'inline';
    btnIcon.style.display = 'inline';
    btnLoading.style.display = 'none';
    abortController = null;
  }
}

function showStoryArea() {
  document.getElementById('readerPlaceholder').style.display = 'none';
  document.getElementById('storyText').style.display = 'block';
}

function clearReader() {
  document.getElementById('storyText').innerHTML = '';
  document.getElementById('storyText').style.display = 'none';
  document.getElementById('readerPlaceholder').style.display = 'block';
  document.getElementById('readerActions').style.display = 'none';
  // 清理绘本区域
  document.getElementById('pictureBookContainer').innerHTML = '';
  document.getElementById('pictureBookContainer').style.display = 'none';
  const placeholder = document.getElementById('pictureBookPlaceholder');
  if (placeholder) placeholder.style.display = 'block';
  // 重置绘本 tab 标记
  const picturebookTab = document.getElementById('readerTabPicturebook');
  if (picturebookTab) picturebookTab.classList.remove('has-content');
  // 切回故事浏览 tab
  switchReaderTab('story');
  currentStory = '';
}

// =============================================
// Toast
// =============================================
function showToast(msg, type = 'info') {
  document.querySelectorAll('.toast').forEach(t => t.remove());
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = msg;
  document.body.appendChild(toast);
  requestAnimationFrame(() => { toast.classList.add('show'); });
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 400);
  }, 2500);
}

// =============================================
// Utils
// =============================================
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// =============================================
// Mobile Tabs
// =============================================
const TAB_PANEL_MAP = {
  center: '.center-panel',
  reader: '.reader-panel',
  sidebar: '.sidebar'
};
let currentMobileTab = 'center';

function initMobileTabs() {
  applyMobileTab('center');

  document.querySelectorAll('.mobile-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.tab;
      if (target === currentMobileTab) return;
      switchMobileTab(target);
    });
  });

  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (isMobile()) {
        applyMobileTab(currentMobileTab);
      } else {
        Object.values(TAB_PANEL_MAP).forEach(sel => {
          const el = document.querySelector(sel);
          if (el) {
            el.classList.remove('mobile-visible');
            el.style.display = '';
          }
        });
      }
    }, 150);
  });
}

function isMobile() {
  return window.innerWidth <= 680;
}

function switchMobileTab(tab) {
  currentMobileTab = tab;
  document.querySelectorAll('.mobile-tab').forEach(t => t.classList.remove('active'));
  const activeTab = document.querySelector(`.mobile-tab[data-tab="${tab}"]`);
  if (activeTab) activeTab.classList.add('active');
  applyMobileTab(tab);
}

function applyMobileTab(tab) {
  if (!isMobile()) return;
  Object.entries(TAB_PANEL_MAP).forEach(([key, sel]) => {
    const el = document.querySelector(sel);
    if (!el) return;
    if (key === tab) {
      el.classList.add('mobile-visible');
    } else {
      el.classList.remove('mobile-visible');
    }
  });
}

function switchToReaderIfMobile() {
  if (isMobile()) {
    switchMobileTab('reader');
    const readerTab = document.querySelector('.mobile-tab[data-tab="reader"]');
    if (readerTab) readerTab.classList.add('has-story');
  }
}

// =============================================
// Picture Book Generation
// =============================================
async function generatePictureBook() {
  if (!pendingStoryData) return;

  const storyLength = pendingStoryData.content.length;
  const imageCount = storyLength < PICTURE_BOOK_CONFIG.shortStoryThreshold
    ? PICTURE_BOOK_CONFIG.shortStoryImages
    : PICTURE_BOOK_CONFIG.longStoryImages;

  showPictureBookProgressModal();
  updateProgress(0, '正在分析故事内容...');

  try {
    // 1. 分析故事，提取关键场景
    updateProgress(10, '正在提取故事场景...');
    const scenes = await extractStoryScenes(pendingStoryData.content, imageCount);

    // 2. 为每个场景生成图片
    const pictureBook = [];
    for (let i = 0; i < scenes.length; i++) {
      const progress = 10 + Math.floor((i / scenes.length) * 80);
      updateProgress(progress, `正在生成第 ${i + 1}/${scenes.length} 张绘本...`);

      const imageUrl = await generateSceneImage(
        scenes[i],
        pendingStoryData.style,
        i + 1,
        scenes.length
      );

      pictureBook.push({
        scene: scenes[i].description,
        caption: scenes[i].caption,
        imageUrl: imageUrl,
        order: i + 1
      });
    }

    updateProgress(100, '绘本生成完成！');
    setTimeout(() => {
      closePictureBookProgressModal();
      completeKeepStory(pictureBook);
    }, 500);

  } catch (err) {
    console.error('Picture book generation error:', err);
    closePictureBookProgressModal();
    showToast('绘本生成失败，但故事已保存', 'error');
    completeKeepStory(null);
  }
}

async function extractStoryScenes(story, count) {
  const systemPrompt = `你是一位专业的故事分镜师。请将以下童话故事分解成${count}个关键场景，每个场景需要：
1. 详细描述：用于AI绘画的详细英文描述（包含角色、场景、氛围、光线等）
2. 简短说明：1-2句中文，概括这个场景的内容

输出格式必须是JSON数组：
[
  {"description": "英文绘画描述", "caption": "中文场景说明"},
  ...
]`;

  const response = await fetch(`${API_CONFIG.apiBase.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_CONFIG.apiKey}`
    },
    body: JSON.stringify({
      model: API_CONFIG.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: story }
      ],
      temperature: 0.7,
      max_tokens: 2048
    })
  });

  if (!response.ok) {
    throw new Error('Failed to extract scenes');
  }

  const data = await response.json();
  const content = data.choices[0].message.content;

  // 提取JSON
  const jsonMatch = content.match(/\[[\s\S]*\]/);
  if (jsonMatch) {
    return JSON.parse(jsonMatch[0]);
  }

  throw new Error('Invalid scene data format');
}

async function generateSceneImage(scene, style, index, total) {
  const artStyle = STYLE_ART_PROMPTS[style] || STYLE_ART_PROMPTS.andersen;
  const prompt = `${scene.description}, ${artStyle}, high quality, children's book illustration`;

  // 使用 DashScope 文生图 API（wanx2.1-t2i-turbo）
  const response = await fetch(`${API_CONFIG.apiBase.replace(/\/$/, '')}/images/generations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_CONFIG.apiKey}`
    },
    body: JSON.stringify({
      model: API_CONFIG.imageModel,
      prompt: prompt,
      n: 1,
      size: '1024*1024'
    })
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    console.error('Image API error:', response.status, errText);
    throw new Error(`图片生成失败 (${response.status})`);
  }

  const data = await response.json();

  // DashScope compatible mode 返回格式: { data: [{ url: "..." }] }
  const tempUrl = data.data?.[0]?.url || data.data?.[0]?.b64_json;
  if (!tempUrl) {
    console.error('Image API response:', JSON.stringify(data));
    throw new Error('图片生成返回数据异常');
  }

  // 如果返回的是 base64，直接构建 data URI
  if (data.data[0].b64_json) {
    const b64 = data.data[0].b64_json;
    // 上传 base64 到阿里云 OSS 持久化
    try {
      const ossUrl = await uploadBase64ToOSS(b64, index);
      return ossUrl;
    } catch (e) {
      console.warn('OSS upload failed, using base64:', e);
      return `data:image/png;base64,${b64}`;
    }
  }

  // 返回的是临时 URL，尝试下载并上传到阿里云 OSS 持久化
  try {
    const ossUrl = await uploadUrlToOSS(tempUrl, index);
    return ossUrl;
  } catch (e) {
    console.warn('OSS upload failed, using temp URL:', e);
    return tempUrl;
  }
}

// 将图片URL下载并上传到阿里云 OSS
async function uploadUrlToOSS(imageUrl, index) {
  if (!currentUser) throw new Error('Not authenticated');

  const response = await fetch(imageUrl);
  if (!response.ok) throw new Error('Failed to fetch image');
  const blob = await response.blob();
  const buffer = await blob.arrayBuffer();

  const filename = `users/${currentUser.uid}/picturebooks/picturebook_${Date.now()}_${index}.png`;
  const client = await getOSSClient();
  const result = await client.put(filename, new Blob([buffer], { type: 'image/png' }));

  return result.url || `https://${OSS_BUCKET}.${OSS_REGION}.aliyuncs.com/${filename}`;
}

// 将 base64 图片上传到阿里云 OSS
async function uploadBase64ToOSS(b64Data, index) {
  if (!currentUser) throw new Error('Not authenticated');

  // base64 转 Blob
  const byteChars = atob(b64Data);
  const byteNumbers = new Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) {
    byteNumbers[i] = byteChars.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  const blob = new Blob([byteArray], { type: 'image/png' });

  const filename = `users/${currentUser.uid}/picturebooks/picturebook_${Date.now()}_${index}.png`;
  const client = await getOSSClient();
  const result = await client.put(filename, blob);

  return result.url || `https://${OSS_BUCKET}.${OSS_REGION}.aliyuncs.com/${filename}`;
}

function showPictureBookProgressModal() {
  document.getElementById('pictureBookProgressModal').classList.add('active');
  updateProgress(0, '准备开始...');
}

function closePictureBookProgressModal() {
  document.getElementById('pictureBookProgressModal').classList.remove('active');
}

function updateProgress(percent, text) {
  const fill = document.getElementById('progressFill');
  const textEl = document.getElementById('progressText');
  fill.style.width = `${percent}%`;
  textEl.textContent = text;
}

// =============================================
// Reader Tab Switching
// =============================================
function switchReaderTab(tabName) {
  // 更新 tab 按钮状态
  document.querySelectorAll('.reader-tab').forEach(t => t.classList.remove('active'));
  const activeTab = document.querySelector(`.reader-tab[data-reader-tab="${tabName}"]`);
  if (activeTab) activeTab.classList.add('active');

  // 更新 tab 内容区域
  document.querySelectorAll('.reader-tab-content').forEach(c => c.classList.remove('active'));
  if (tabName === 'story') {
    document.getElementById('storyTabContent').classList.add('active');
  } else if (tabName === 'picturebook') {
    document.getElementById('picturebookTabContent').classList.add('active');
  }
}

function renderPictureBook(pictureBook) {
  const container = document.getElementById('pictureBookContainer');
  const placeholder = document.getElementById('pictureBookPlaceholder');
  const picturebookTab = document.getElementById('readerTabPicturebook');

  if (!pictureBook || pictureBook.length === 0) {
    container.innerHTML = '';
    container.style.display = 'none';
    if (placeholder) placeholder.style.display = 'block';
    if (picturebookTab) picturebookTab.classList.remove('has-content');
    return;
  }

  if (placeholder) placeholder.style.display = 'none';
  container.style.display = 'flex';
  if (picturebookTab) picturebookTab.classList.add('has-content');

  container.innerHTML = pictureBook.map((page, index) => `
    <div class="picture-book-page">
      <div class="page-number">${index + 1}</div>
      <div class="page-image">
        <img src="${escapeHtml(page.imageUrl)}" alt="绘本第${index + 1}页" loading="lazy"
             onerror="this.onerror=null; this.src=''; this.parentElement.innerHTML='<div class=\\'page-image-error\\'>图片加载失败</div>';">
      </div>
      <div class="page-caption">${escapeHtml(page.caption)}</div>
    </div>
  `).join('');
}
