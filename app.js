/* ============================================
   童话织梦机 — Application Logic
   ============================================ */

// --- Embedded API Config ---
const API_CONFIG = {
  apiKey: 'sk-3e431fec7e3c49eeb6efb4f4390ca994',
  apiBase: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  model: 'qwen-plus'
};

// --- State ---
let selectedStyle = 'andersen';
let currentStory = '';
let isGenerating = false;
let abortController = null;
let currentUser = null; // { name: string }

// --- Style prompts ---
const STYLE_PROMPTS = {
  andersen: '请以安徒生童话的风格写作。语言优美浪漫，富有诗意和哲理，带有淡淡的忧伤与温暖并存的情感基调。注重人物内心世界的刻画，结局可以是感人的、发人深省的。',
  grimm: '请以格林童话的风格写作。故事充满奇幻冒险色彩，有明确的善恶对立，正义最终战胜邪恶。情节跌宕起伏，有森林、城堡、魔法等经典元素，结局圆满幸福。',
  aesop: '请以伊索寓言的风格写作。故事简洁精炼，以动物为主角，通过生动有趣的故事传达深刻的人生道理和智慧。结尾需要点明寓意，让孩子从中获得启发。',
  eastern: '请以东方神话故事的风格写作。融入中国传统文化元素，如仙人、神兽、法宝、山川河流等意象。语言优雅古朴，带有诗词韵味，展现东方美学和传统价值观。'
};

const STYLE_ICONS = {
  andersen: '🧜‍♀️',
  grimm: '🏰',
  aesop: '🦊',
  eastern: '🐉'
};

// --- Init ---
document.addEventListener('DOMContentLoaded', () => {
  initStyleCards();
  initEventListeners();
  initMobileTabs();
  registerServiceWorker();
  initUser();
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
  document.getElementById('keepBtn').addEventListener('click', keepStory);
  document.getElementById('discardBtn').addEventListener('click', discardStory);

  // User switch button
  document.getElementById('userSwitchBtn').addEventListener('click', openUserModal);

  // User modal
  const userModal = document.getElementById('userModal');
  function onOverlayClose(e) {
    // Only allow close if a user is logged in
    if (e.target === userModal && currentUser) {
      e.preventDefault();
      closeUserModal();
    }
  }
  userModal.addEventListener('mousedown', onOverlayClose);
  userModal.addEventListener('touchend', onOverlayClose);

  const modalCloseBtn = document.getElementById('modalCloseBtn');
  modalCloseBtn.addEventListener('click', closeUserModal);
  modalCloseBtn.addEventListener('touchend', function(e) {
    e.preventDefault();
    closeUserModal();
  });

  const modalLoginBtn = document.getElementById('modalLoginBtn');
  modalLoginBtn.addEventListener('click', loginUser);
  modalLoginBtn.addEventListener('touchend', function(e) {
    e.preventDefault();
    loginUser();
  });

  // Enter key in username input
  document.getElementById('usernameInput').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') loginUser();
  });
}

// =============================================
// User System
// =============================================
function getAllUsers() {
  const raw = localStorage.getItem('fairytale_users');
  if (raw) {
    try { return JSON.parse(raw); } catch(e) {}
  }
  return [];
}

function saveAllUsers(users) {
  localStorage.setItem('fairytale_users', JSON.stringify(users));
}

function initUser() {
  const lastUser = localStorage.getItem('fairytale_current_user');
  if (lastUser) {
    currentUser = { name: lastUser };
    updateUserUI();
    loadStories();
  } else {
    openUserModal();
  }
}

function openUserModal() {
  const modal = document.getElementById('userModal');
  const closeBtn = document.getElementById('modalCloseBtn');
  document.getElementById('usernameInput').value = '';

  // Only show close button if already logged in (switching user)
  closeBtn.style.display = currentUser ? 'flex' : 'none';

  // Populate existing users
  renderExistingUsers();

  modal.classList.add('active');
  setTimeout(() => document.getElementById('usernameInput').focus(), 300);
}

function closeUserModal() {
  const modal = document.getElementById('userModal');
  modal.classList.remove('active');
  modal.offsetHeight;
}

let _loggingIn = false;
function loginUser() {
  if (_loggingIn) return;
  _loggingIn = true;
  setTimeout(() => { _loggingIn = false; }, 300);

  const name = document.getElementById('usernameInput').value.trim();
  if (!name) {
    showToast('请输入用户名', 'error');
    return;
  }

  // Register user if new
  const users = getAllUsers();
  if (!users.find(u => u.name === name)) {
    users.push({ name: name, createdAt: Date.now() });
    saveAllUsers(users);
  }

  currentUser = { name: name };
  localStorage.setItem('fairytale_current_user', name);

  closeUserModal();
  updateUserUI();
  clearReader();
  loadStories();
  showToast(`欢迎，${name}！`, 'success');
}

function loginAsUser(name) {
  document.getElementById('usernameInput').value = name;
  loginUser();
}

function updateUserUI() {
  if (!currentUser) return;
  document.getElementById('userNameDisplay').textContent = currentUser.name;
  document.getElementById('userAvatar').textContent = getAvatarEmoji(currentUser.name);
}

function getAvatarEmoji(name) {
  const avatars = ['🧸', '🦄', '🐰', '🐱', '🦋', '🌸', '⭐', '🍀', '🎈', '🐳', '🦊', '🐼'];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) & 0xffff;
  return avatars[hash % avatars.length];
}

function renderExistingUsers() {
  const users = getAllUsers();
  const section = document.getElementById('existingUsersSection');
  const list = document.getElementById('existingUsersList');
  list.innerHTML = '';

  if (users.length === 0) {
    section.style.display = 'none';
    return;
  }

  section.style.display = 'block';
  users.forEach(u => {
    const stories = getUserStories(u.name);
    const chip = document.createElement('button');
    chip.className = 'existing-user-chip';
    chip.innerHTML = `<span class="chip-icon">${getAvatarEmoji(u.name)}</span> ${escapeHtml(u.name)} <span class="chip-count">(${stories.length}篇)</span>`;
    chip.addEventListener('click', () => loginAsUser(u.name));
    list.appendChild(chip);
  });
}

// =============================================
// Story Management (per-user isolation)
// =============================================
function getStorageKey() {
  if (!currentUser) return 'fairytale_stories_guest';
  return 'fairytale_stories_' + currentUser.name;
}

function getStories() {
  const raw = localStorage.getItem(getStorageKey());
  if (raw) {
    try { return JSON.parse(raw); } catch(e) {}
  }
  return [];
}

function getUserStories(username) {
  const raw = localStorage.getItem('fairytale_stories_' + username);
  if (raw) {
    try { return JSON.parse(raw); } catch(e) {}
  }
  return [];
}

function saveStories(stories) {
  localStorage.setItem(getStorageKey(), JSON.stringify(stories));
}

function keepStory() {
  if (!currentStory.trim()) return;
  if (!currentUser) {
    showToast('请先登录', 'error');
    openUserModal();
    return;
  }

  const lines = currentStory.split('\n');
  let title = '未命名故事';
  for (const l of lines) {
    const t = l.trim().replace(/^[#\s]+/, '').replace(/^《/, '').replace(/》$/, '').trim();
    if (t && t.length < 40 && t.length > 0) {
      title = t;
      break;
    }
  }

  const story = {
    id: Date.now().toString(),
    title: title,
    content: currentStory,
    style: selectedStyle,
    date: new Date().toLocaleDateString('zh-CN'),
    timestamp: Date.now()
  };

  const stories = getStories();
  stories.unshift(story);
  saveStories(stories);
  loadStories();
  showToast('故事已保存到目录', 'success');
  document.getElementById('readerActions').style.display = 'none';

  setTimeout(() => {
    const first = document.querySelector('.story-item');
    if (first) first.classList.add('active');
  }, 50);

  if (isMobile()) {
    setTimeout(() => switchMobileTab('sidebar'), 600);
  }
}

function discardStory() {
  clearReader();
  currentStory = '';
  showToast('故事已放弃', 'info');
}

function loadStories() {
  const stories = getStories();
  const list = document.getElementById('storyList');
  const empty = document.getElementById('sidebarEmpty');

  list.querySelectorAll('.story-item').forEach(el => el.remove());

  if (stories.length === 0) {
    empty.style.display = 'block';
    return;
  }

  empty.style.display = 'none';

  stories.forEach(story => {
    const el = document.createElement('div');
    el.className = 'story-item';
    el.dataset.id = story.id;
    el.innerHTML = `
      <span class="story-item-icon">${STYLE_ICONS[story.style] || '📖'}</span>
      <div class="story-item-body">
        <div class="story-item-title">${escapeHtml(story.title)}</div>
        <div class="story-item-meta">${story.date}</div>
      </div>
      <button class="story-item-delete" title="删除">×</button>
    `;
    el.querySelector('.story-item-delete').addEventListener('click', function(e) {
      e.stopPropagation();
      deleteStory(story.id);
    });
    el.addEventListener('click', () => viewStory(story.id));
    list.appendChild(el);
  });
}

function viewStory(id) {
  const stories = getStories();
  const story = stories.find(s => s.id === id);
  if (!story) return;

  document.querySelectorAll('.story-item').forEach(el => el.classList.remove('active'));
  const item = document.querySelector(`.story-item[data-id="${id}"]`);
  if (item) item.classList.add('active');

  currentStory = story.content;
  showStoryArea();
  renderStoryText(story.content);
  document.getElementById('storyText').classList.remove('streaming');
  document.getElementById('readerActions').style.display = 'none';

  if (isMobile()) switchMobileTab('reader');
}

function deleteStory(id) {
  let stories = getStories();
  stories = stories.filter(s => s.id !== id);
  saveStories(stories);
  loadStories();
  showToast('故事已删除', 'info');
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
// Story Generation (embedded API)
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
