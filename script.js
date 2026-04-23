// --- НАСТРОЙКИ ПРОЕКТА (МЕНЯЙ ССЫЛКИ ТУТ) ---
const RULES_LINK = "https://google.com"; // Замени на свою ссылку
const PRIVACY_LINK = "https://google.com"; // Замени на свою ссылку

let currentUser = INITIAL_USER;
let currentProfileId = null;

if(currentUser) { updateUI(); showPage('feed'); } 
else { showPage('auth'); }

function showPage(id) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('page-'+id).classList.add('active');
    if(id==='feed') loadPosts();
    if(id==='admin') loadAdmin();
}

function setAuthMode(m) {
    document.getElementById('form-in').style.display = m==='in'?'block':'none';
    document.getElementById('form-reg').style.display = m==='reg'?'block':'none';
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    event.target.classList.add('active');
    document.getElementById('msg').innerText = "";
    document.getElementById('avatar-status').style.display = "none";
}

// --- AUTH ---
async function doRegister() {
    const u = document.getElementById('reg-user').value;
    const p = document.getElementById('reg-pass').value;
    const rules = document.getElementById('reg-rules').checked;
    const file = document.getElementById('reg-avatar').files[0];
    const msg = document.getElementById('msg');
    const avatarStatus = document.getElementById('avatar-status');

    if(!rules) return msg.innerText = "Прими правила платформы!";
    
    msg.innerText = "Регистрация...";
    if(avatarStatus) avatarStatus.style.display = "none";

    let avatarBase64 = "";
    if(file) {
        try {
            avatarBase64 = await toBase64(file);
        } catch(e) {
            console.error("Ошибка чтения файла", e);
        }
    }

    const res = await fetch('/api/register', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({username:u, password:p, rules_accepted:rules, avatar:avatarBase64})
    });
    const data = await res.json();
    if(res.ok) {
        currentUser = data.user;
        updateUI();
        showPage('feed');
    } else msg.innerText = data.error;
}

async function doLogin() {
    const u = document.getElementById('in-user').value;
    const p = document.getElementById('in-pass').value;
    const res = await fetch('/api/login', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({username:u, password:p})
    });
    const data = await res.json();
    if(res.ok) {
        currentUser = data.user;
        updateUI();
        showPage('feed');
    } else document.getElementById('msg').innerText = data.error;
}

async function doLogout() {
    await fetch('/api/logout', {method:'POST'});
    location.reload();
}

function updateUI() {
    if(!currentUser) return;
    document.getElementById('navbar').style.display = 'flex';
    if(currentUser.role==='admin') document.getElementById('adminBtn').style.display = 'inline-block';
}

// --- POSTS RENDERING ---
async function loadPosts() {
    const res = await fetch('/api/articles');
    const posts = await res.json();
    renderPosts(posts, 'posts-list');
}

function renderPosts(posts, containerId, isCommentView = false) {
    const list = document.getElementById(containerId);
    list.innerHTML = '';
    
    if(posts.length === 0) {
        list.innerHTML = '<p style="text-align:center; color:#666; padding:20px;">Пусто...</p>';
        return;
    }

    posts.forEach(p => {
        const div = document.createElement('div');
        div.className = 'post';
        
        if(isCommentView) {
             const ava = p.avatar ? p.avatar : 'https://via.placeholder.com/40';
             const verify = p.verified ? '<span class="verified-badge">✔</span>' : '';
             const banStatus = p.banned ? `<div style="color:red; font-size:12px;">Скрыто: ${p.ban_reason}</div>` : '';
             
             div.innerHTML = `
                <div style="font-size:12px; color:#666; margin-bottom:5px;">На пост: <b>${p.post_title}</b></div>
                <div class="comment">
                    <div class="comment-header">
                        <img src="${ava}" class="avatar" style="width:30px;height:30px; margin-right:8px;" onclick="openUserProfile('${p.user_id}')">
                        <span class="comment-author-name">${p.username} ${verify}</span>
                    </div>
                    <div class="comment-text">${p.text}</div>
                    ${banStatus}
                </div>
             `;
        } else {
            const ava = p.author_avatar ? p.author_avatar : 'https://via.placeholder.com/40';
            const verify = p.author_verified ? '<span class="verified-badge">✔</span>' : '';
            
            let commentsHtml = '';
            if(p.comments) {
                const recentComments = p.comments.slice(-3); 
                recentComments.forEach(c => {
                    const isBanned = c.banned;
                    const cText = isBanned ? `<span class="banned-comment">Комментарий скрыт. Причина: ${c.ban_reason}</span>` : c.text;
                    const cAva = c.avatar ? c.avatar : 'https://via.placeholder.com/30';
                    const cVerify = c.verified ? '<span class="verified-badge" style="font-size:10px">✔</span>' : '';
                    
                    let adminControls = '';
                    if(currentUser && currentUser.role === 'admin' && !isBanned) {
                        adminControls = `<button style="font-size:10px; color:red; background:none; border:none; cursor:pointer; float:right;" onclick="banComment('${p.id}', '${c.id}')">🚫 Скрыть</button>`;
                    }

                    commentsHtml += `
                        <div class="comment">
                            <div class="comment-header">
                                <img src="${cAva}" class="avatar" style="width:30px;height:30px; margin-right:8px;" onclick="openUserProfile('${c.user_id}')">
                                <span class="comment-author-name">${c.username} ${cVerify}</span>
                                ${adminControls}
                            </div>
                            <div class="comment-text">${cText}</div>
                        </div>
                    `;
                });
                if(p.comments.length > 3) {
                    commentsHtml += `<div style="font-size:12px; color:#666; text-align:center; cursor:pointer;" onclick="openUserProfile('${p.author_id}')">...еще ${p.comments.length - 3} комм.</div>`;
                }
            }

            div.innerHTML = `
                <div class="post-author-info">
                    <img src="${ava}" class="avatar" onclick="openUserProfile('${p.author_id}')">
                    <div class="post-author-details">
                        <span class="post-author-name" onclick="openUserProfile('${p.author_id}')">
                            ${p.author_name} ${verify}
                        </span>
                        <span class="post-date">${new Date(p.date*1000).toLocaleDateString()}</span>
                    </div>
                </div>
                <h3>${p.title}</h3>
                ${p.image ? `<img src="${p.image}" class="main-image">` : ''}
                <p>${p.content}</p>
                
                <div class="comments-section">
                    ${commentsHtml}
                    ${currentUser ? `
                    <div class="comment-input-area">
                        <input type="text" class="comment-input" id="comment-input-${p.id}" placeholder="Написать ответ...">
                        <button class="tool-btn" onclick="sendComment('${p.id}')">➤</button>
                    </div>` : ''}
                </div>
            `;
        }
        list.appendChild(div);
    });
}

// --- COMMENTS ---
async function sendComment(postId) {
    const input = document.getElementById(`comment-input-${postId}`);
    const text = input.value;
    if(!text) return;
    
    await fetch('/api/comment', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({post_id:postId, text:text})
    });
    input.value = '';
    if(document.getElementById('page-feed').classList.contains('active')) {
        loadPosts();
    }
}

async function banComment(postId, commentId) {
    const reason = prompt("Причина скрытия комментария:");
    if(!reason) return;
    await fetch('/api/admin/comment_action', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({post_id:postId, comment_id:commentId, action:'ban', reason:reason})
    });
    loadPosts();
}

// --- PROFILES ---
async function openMyProfile() {
    openUserProfile(currentUser.id);
}

async function openUserProfile(userId) {
    currentProfileId = userId;
    showPage('profile');
    switchProfileTab('posts');
    
    const uRes = await fetch(`/api/user/${userId}`);
    const u = await uRes.json();
    
    document.getElementById('prof-avatar').src = u.avatar || 'https://via.placeholder.com/80';
    document.getElementById('prof-name').innerHTML = `${u.nickname} ${u.verified?'<span class="verified-badge">✔</span>':''}`;
    document.getElementById('prof-bio').innerText = `@${u.username}`;
    document.getElementById('stat-posts').innerText = u.posts_count;
    document.getElementById('stat-role').innerText = u.role;
}

async function switchProfileTab(tab) {
    document.querySelectorAll('.p-tab').forEach(t => t.classList.remove('active'));
    document.getElementById(`tab-${tab}`).classList.add('active');
    
    if(tab === 'posts') {
        const res = await fetch(`/api/user_posts/${currentProfileId}`);
        const posts = await res.json();
        renderPosts(posts, 'profile-content-list', false);
    } else if (tab === 'replies') {
        const res = await fetch(`/api/user_comments/${currentProfileId}`);
        const comments = await res.json();
        renderPosts(comments, 'profile-content-list', true);
    }
}

// --- CREATE POST ---
function formatText(tag) {
    const area = document.getElementById('post-text');
    const start = area.selectionStart;
    const end = area.selectionEnd;
    const text = area.value;
    const before = text.substring(0, start);
    const selection = text.substring(start, end);
    const after = text.substring(end);
    
    area.value = before + `<${tag}>` + selection + `</${tag}>` + after;
    area.focus();
}

function previewImage(input) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const img = document.getElementById('img-preview');
            img.src = e.target.result;
            img.style.display = 'block';
        }
        reader.readAsDataURL(input.files[0]);
    }
}

// Уведомление об аватарке при регистрации
function previewRegAvatar(input) {
    const statusEl = document.getElementById('avatar-status');
    if (input.files && input.files[0]) {
        if(statusEl) {
            statusEl.innerText = "✅ Аватарка успешно выбрана!";
            statusEl.style.color = "#00f3ff";
            statusEl.style.marginTop = "5px";
            statusEl.style.display = "block";
        }
    } else {
        if(statusEl) statusEl.style.display = "none";
    }
}

async function sendPost() {
    const title = document.getElementById('post-title').value;
    const content = document.getElementById('post-text').value;
    const file = document.getElementById('post-image').files[0];
    
    if(!title || !content) return alert("Заполни поля");
    
    let img = "";
    if(file) img = await toBase64(file);
    
    const res = await fetch('/api/articles', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({title, content, image:img})
    });
    
    if(res.ok) {
        showPage('feed');
        document.getElementById('post-title').value = "";
        document.getElementById('post-text').value = "";
        document.getElementById('post-image').value = "";
        document.getElementById('img-preview').style.display = 'none';
    }
}

// --- ADMIN ---
async function loadAdmin() {
    const res = await fetch('/api/admin/users');
    const users = await res.json();
    const list = document.getElementById('admin-list');
    list.innerHTML = "";
    users.forEach(u => {
        if(u.id === currentUser.id) return;
        const row = document.createElement('div');
        row.className = 'admin-row';
        row.innerHTML = `
            <span>${u.nickname} (${u.role})</span>
            <div>
                <button class="adm-btn ver" onclick="adminAct('${u.id}', '${u.verified?'unverify':'verify'}')">${u.verified?'Снять':'Вериф'}</button>
                <button class="adm-btn ban" onclick="adminAct('${u.id}', '${u.banned?'unban':'ban'}')">${u.banned?'Разбан':'Бан'}</button>
            </div>
        `;
        list.appendChild(row);
    });
}

async function adminAct(id, action) {
    await fetch('/api/admin/action', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({id, action})
    });
    loadAdmin();
}

const toBase64 = f => new Promise((res, rej) => {
    const r = new FileReader(); r.readAsDataURL(f);
    r.onload = () => res(r.result); r.onerror = e => rej(e);
});