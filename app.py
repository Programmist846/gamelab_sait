import os, json, time, base64, io, threading
from flask import Flask, render_template, request, jsonify, session
from PIL import Image

app = Flask(__name__)
app.secret_key = 'gamelab_secret_v3'

DATA_DIR = 'data'
USERS_FILE = os.path.join(DATA_DIR, 'users.json')
ARTICLES_FILE = os.path.join(DATA_DIR, 'articles.json')
lock = threading.Lock()
ADMIN_PASS = "552213!!"

def load_json(fp):
    with lock:
        if not os.path.exists(fp): return []
        try:
            with open(fp, 'r', encoding='utf-8') as f: return json.load(f)
        except: return []

def save_json(fp, data):
    with lock:
        with open(fp, 'w', encoding='utf-8') as f: json.dump(data, f, ensure_ascii=False, indent=4)

if not os.path.exists(DATA_DIR): os.makedirs(DATA_DIR)
for f in [USERS_FILE, ARTICLES_FILE]:
    if not os.path.exists(f): save_json(f, [])

# ИСПРАВЛЕННАЯ ФУНКЦИЯ КАРТИНОК
def process_image(img_str):
    if not img_str: return ""
    # Если строка уже начинается с data:image, значит это готовый base64
    if img_str.startswith("data:image"):
        # Можно тут добавить сжатие, если нужно, но пока вернем как есть для надежности
        return img_str 
    
    # Если это просто base64 без заголовка (редкий кейс)
    try:
        binary_data = base64.b64decode(img_str)
        img = Image.open(io.BytesIO(binary_data))
        # Сжатие
        img = img.resize((800, int(img.size[1] * (800/img.size[0]))), Image.Resampling.LANCZOS)
        buffer = io.BytesIO()
        img.save(buffer, format="JPEG", quality=70)
        return f"data:image/jpeg;base64,{base64.b64encode(buffer.getvalue()).decode()}"
    except Exception as e:
        print(f"Img Error: {e}")
        return ""

@app.route('/')
def index():
    user = None
    if 'user_id' in session:
        users = load_json(USERS_FILE)
        user = next((u for u in users if u['id'] == session['user_id']), None)
        if user and user.get('banned'):
            session.clear(); return "BAN", 403
    return render_template('index.html', user=user)

# --- AUTH ---
@app.route('/api/register', methods=['POST'])
def api_register():
    data = request.json
    if not data.get('rules_accepted'): return jsonify({'error': 'Прими правила'}), 400
    
    users = load_json(USERS_FILE)
    if any(u['username'] == data['username'] for u in users):
        return jsonify({'error': 'Ник занят'}), 400

    avatar = process_image(data.get('avatar', ''))
    role = 'admin' if data['password'] == ADMIN_PASS else 'user'
    
    new_user = {
        'id': str(int(time.time()*1000)),
        'username': data['username'],
        'password': data['password'],
        'nickname': data['username'],
        'role': role,
        'verified': 1 if role=='admin' else 0,
        'banned': 0,
        'avatar': avatar
    }
    users.append(new_user)
    save_json(USERS_FILE, users)
    session['user_id'] = new_user['id']
    return jsonify({'user': new_user}), 200

@app.route('/api/login', methods=['POST'])
def api_login():
    users = load_json(USERS_FILE)
    u = next((x for x in users if x['username']==request.json['username'] and x['password']==request.json['password']), None)
    if not u: return jsonify({'error': 'Ошибка входа'}), 401
    if u['banned']: return jsonify({'error': 'Вы забанены'}), 403
    session['user_id'] = u['id']
    return jsonify({'user': u}), 200

@app.route('/api/logout', methods=['POST'])
def api_logout():
    session.clear(); return jsonify({}), 200

# --- POSTS ---
@app.route('/api/articles', methods=['GET'])
def get_articles():
    arts = load_json(ARTICLES_FILE)
    arts.sort(key=lambda x: x.get('date',0), reverse=True)
    return jsonify(arts)

@app.route('/api/articles', methods=['POST'])
def create_article():
    if 'user_id' not in session: return jsonify({'error': 'Auth'}), 401
    users = load_json(USERS_FILE)
    me = next((u for u in users if u['id']==session['user_id']), None)
    
    data = request.json
    art = {
        'id': str(int(time.time()*1000)),
        'title': data['title'],
        'content': data['content'],
        'image': process_image(data.get('image')),
        'author_id': me['id'],
        'author_name': me['nickname'],
        'author_verified': me['verified'],
        'author_avatar': me['avatar'],
        'date': time.time(),
        'comments': []
    }
    arts = load_json(ARTICLES_FILE); arts.append(art); save_json(ARTICLES_FILE, arts)
    return jsonify({'message':'Ok'}), 201

# --- COMMENTS ---
@app.route('/api/comment', methods=['POST'])
def add_comment():
    if 'user_id' not in session: return jsonify({'error': 'Auth'}), 401
    users = load_json(USERS_FILE)
    me = next((u for u in users if u['id']==session['user_id']), None)
    
    data = request.json
    arts = load_json(ARTICLES_FILE)
    art = next((a for a in arts if a['id']==data['post_id']), None)
    
    if art:
        comment = {
            'id': str(int(time.time()*1000)),
            'user_id': me['id'],
            'username': me['nickname'],
            'avatar': me['avatar'],
            'verified': me['verified'],
            'text': data['text'],
            'post_id': data['post_id'], # ВАЖНО: сохраняем ID поста для вкладки "Ответы"
            'date': time.time(),
            'banned': 0,
            'ban_reason': ''
        }
        art['comments'].append(comment)
        save_json(ARTICLES_FILE, arts)
        return jsonify({'message':'Ok'}), 200
    return jsonify({'error':'No post'}), 404

@app.route('/api/admin/comment_action', methods=['POST'])
def admin_comment_action():
    if 'user_id' not in session: return jsonify({'error': 'Auth'}), 401
    users = load_json(USERS_FILE)
    me = next((u for u in users if u['id']==session['user_id']), None)
    if me['role'] != 'admin': return jsonify({'error': 'Deny'}), 403

    data = request.json
    arts = load_json(ARTICLES_FILE)
    art = next((a for a in arts if a['id']==data['post_id']), None)
    
    if art:
        comm = next((c for c in art['comments'] if c['id']==data['comment_id']), None)
        if comm:
            if data['action'] == 'ban':
                comm['banned'] = 1
                comm['ban_reason'] = data.get('reason', 'Нарушение')
            save_json(ARTICLES_FILE, arts)
            return jsonify({'message':'Done'}), 200
    return jsonify({'error':'Err'}), 400

# --- PROFILE DATA ---
@app.route('/api/user/<user_id>')
def get_user_profile(user_id):
    users = load_json(USERS_FILE)
    u = next((x for x in users if x['id']==user_id), None)
    if not u: return jsonify({'error':'Not found'}), 404
    
    arts = load_json(ARTICLES_FILE)
    my_posts = [a for a in arts if a['author_id']==user_id]
    
    safe_u = {k:v for k,v in u.items() if k!='password'}
    safe_u['posts_count'] = len(my_posts)
    return jsonify(safe_u)

@app.route('/api/user_posts/<user_id>')
def get_user_posts(user_id):
    arts = load_json(ARTICLES_FILE)
    my_posts = [a for a in arts if a['author_id']==user_id]
    my_posts.sort(key=lambda x: x.get('date',0), reverse=True)
    return jsonify(my_posts)

@app.route('/api/user_comments/<user_id>')
def get_user_comments(user_id):
    arts = load_json(ARTICLES_FILE)
    user_comments = []
    for art in arts:
        for c in art.get('comments', []):
            if c['user_id'] == user_id:
                # Добавляем инфо о посте, чтобы знать куда отвечать
                c['post_title'] = art['title']
                c['post_id'] = art['id']
                user_comments.append(c)
    
    user_comments.sort(key=lambda x: x.get('date',0), reverse=True)
    return jsonify(user_comments)

# --- ADMIN USERS ---
@app.route('/api/admin/users', methods=['GET'])
def admin_users():
    if 'user_id' not in session: return jsonify({}), 401
    users = load_json(USERS_FILE)
    me = next((u for u in users if u['id']==session['user_id']), None)
    if me['role']!='admin': return jsonify({}), 403
    return jsonify(users)

@app.route('/api/admin/action', methods=['POST'])
def admin_action():
    if 'user_id' not in session: return jsonify({}), 401
    users = load_json(USERS_FILE)
    me = next((u for u in users if u['id']==session['user_id']), None)
    if me['role']!='admin': return jsonify({}), 403
    
    data = request.json
    target = next((u for u in users if u['id']==data['id']), None)
    if target:
        if data['action']=='ban': target['banned']=1
        elif data['action']=='unban': target['banned']=0
        elif data['action']=='verify': target['verified']=1
        elif data['action']=='unverify': target['verified']=0
        save_json(USERS_FILE, users)
    return jsonify({'message':'Ok'})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=int(os.environ.get("PORT", 10000)), debug=True)