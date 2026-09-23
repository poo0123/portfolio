document.addEventListener('DOMContentLoaded', () => {

    const USER_ID = "339360580886593536";

    const loader      = document.getElementById('loader');
    const backBtn     = document.getElementById('back-to-top');
    const themeBtn    = document.getElementById('theme-toggle');
    const statusDot   = document.getElementById('status-dot');
    const pillDot     = document.getElementById('pill-dot');
    const pillText    = document.getElementById('pill-text');
    const actsBox     = document.getElementById('bubble-list');

    let socket = null;
    let heartbeat = null;
    let lastActs = "";
    let spotifyTimer = null;

    const STATUS_LABEL = {
        online:  'オンライン',
        idle:    'はなれてる',
        dnd:     'とりこみ中',
        offline: 'いない'
    };

    /* ---------- ちいさい道具 ---------- */

    const esc = (s) => String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

    // いつから やっているか
    const since = (ms) => {
        const diff = Date.now() - ms;
        // 先の時刻や、2 週間より前のものは あてにならないので出さない
        if (!(diff > 0) || diff > 1000 * 60 * 60 * 24 * 14) return '';
        const m = Math.floor(diff / 60000);
        if (m < 1) return 'はじまったばかり';
        if (m < 60) return m + '分';
        const h = Math.floor(m / 60);
        if (h < 24) {
            const rest = m % 60;
            return rest ? h + '時間' + rest + '分' : h + '時間';
        }
        return Math.floor(h / 24) + '日';
    };

    const mmss = (ms) => {
        const s = Math.floor((ms / 1000) % 60);
        const m = Math.floor((ms / 60000) % 60);
        return m + ':' + s.toString().padStart(2, '0');
    };

    /* ---------- スクロールで出す ---------- */

    const targets = document.querySelectorAll('.reveal');
    if ('IntersectionObserver' in window) {
        const io = new IntersectionObserver((entries) => {
            entries.forEach((entry, i) => {
                if (!entry.isIntersecting) return;
                setTimeout(() => entry.target.classList.add('active'), i * 110);
                io.unobserve(entry.target);
            });
        }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });
        targets.forEach(el => io.observe(el));
    } else {
        targets.forEach(el => el.classList.add('active'));
    }

    /* ---------- ローダーと手書きキャプション ---------- */

    const writeCaption = () => {
        const cap = document.getElementById('typing-job');
        if (!cap || cap.textContent !== '') return;
        const text = 'よくわからん社会人';
        let i = 0;
        const run = () => {
            if (i < text.length) {
                cap.textContent += text.charAt(i++);
                setTimeout(run, 90);
            }
        };
        run();
    };

    const hideLoader = () => {
        if (!loader || loader.classList.contains('loaded')) return;
        loader.classList.add('loaded');
        setTimeout(() => { loader.style.display = 'none'; writeCaption(); }, 550);
    };
    setTimeout(hideLoader, 3500);

    /* ---------- Spotify のえんぴつ線 ---------- */

    const runBar = (act) => {
        if (spotifyTimer) clearInterval(spotifyTimer);
        const tick = () => {
            const total = act.end - act.start;
            const done = Date.now() - act.start;
            const fill = document.getElementById('spotify-fill');
            const now = document.getElementById('spotify-current');
            if (fill && now && total > 0) {
                fill.style.width = Math.min((done / total) * 100, 100) + '%';
                now.textContent = mmss(Math.max(Math.min(done, total), 0));
            }
            if (done >= total) clearInterval(spotifyTimer);
        };
        tick();
        spotifyTimer = setInterval(tick, 1000);
    };

    /* ---------- Discord のいま ---------- */

    const paint = (data) => {
        const avatar = document.getElementById('discord-avatar');
        const ph = document.getElementById('avatar-placeholder');
        if (avatar && data.discord_user && data.discord_user.avatar) {
            avatar.src = 'https://cdn.discordapp.com/avatars/' + USER_ID + '/' + data.discord_user.avatar + '.webp?size=256';
            avatar.style.display = 'block';
            if (ph) ph.style.display = 'none';
        }

        // アバターデコレーション（Discord で着けているもの）
        const u = data.discord_user || {};
        const avatarBox = document.getElementById('now-avatar');
        if (avatarBox) {
            const face = document.getElementById('deco-face');
            const ring = document.getElementById('deco-ring');
            if (u.avatar) {
                face.src = 'https://cdn.discordapp.com/avatars/' + USER_ID + '/' + u.avatar + '.webp?size=160';
            }
            const deco = u.avatar_decoration_data;
            if (deco && deco.asset) {
                ring.src = 'https://cdn.discordapp.com/avatar-decoration-presets/' + deco.asset + '.png?size=160&passthrough=true';
                ring.hidden = false;
                avatarBox.classList.add('has-deco');
            } else {
                ring.hidden = true;
                avatarBox.classList.remove('has-deco');
            }
        }

        // ネームプレート（Discord で着けているもの）
        const head = document.getElementById('now-head');
        if (head) {
            const np = u.collectibles && u.collectibles.nameplate;
            const plate = document.getElementById('now-plate');
            const wrap = document.getElementById('now-wrap');
            if (np && np.asset) {
                const base = 'https://cdn.discordapp.com/assets/collectibles/' + np.asset;
                // 動かない環境のために 静止画も敷いておく
                head.style.backgroundImage = 'url("' + base + 'static.png")';
                if (plate && !calm) {
                    if (plate.dataset.base !== base) {
                        plate.dataset.base = base;
                        plate.src = base + 'asset.webm';
                        const go = () => { const p = plate.play(); if (p && p.catch) p.catch(() => {}); };
                        go();
                        plate.addEventListener('loadeddata', go, { once: true });
                    }
                    plate.hidden = false;
                }
                head.classList.add('has-plate');
                if (wrap) wrap.classList.add('has-plate');
                const nm = document.getElementById('now-name');
                if (nm) nm.textContent = u.display_name || u.global_name || u.username || '';
            } else {
                head.classList.remove('has-plate');
                if (wrap) wrap.classList.remove('has-plate');
                head.style.backgroundImage = '';
                if (plate) { plate.hidden = true; plate.removeAttribute('src'); delete plate.dataset.base; }
            }
        }

        // サーバータグ
        const tag = document.getElementById('guild-tag');
        if (tag) {
            const pg = u.primary_guild;
            if (pg && pg.identity_enabled && pg.tag) {
                document.getElementById('guild-name').textContent = pg.tag;
                const badge = document.getElementById('guild-badge');
                if (pg.badge && pg.identity_guild_id) {
                    badge.src = 'https://cdn.discordapp.com/guild-tag-badges/' + pg.identity_guild_id + '/' + pg.badge + '.png?size=32';
                    badge.hidden = false;
                } else {
                    badge.hidden = true;
                }
                tag.hidden = false;
            } else {
                tag.hidden = true;
            }
        }

        const status = data.discord_status || 'offline';
        if (statusDot) statusDot.className = 'status-dot ' + status;
        if (pillDot) pillDot.className = 'dot ' + status;
        if (pillText) pillText.textContent = STATUS_LABEL[status] || status;

        if (!actsBox) return;

        let acts = [];

        if (data.listening_to_spotify && data.spotify) {
            acts.push({
                kind: 'spotify',
                label: 'きいてる',
                name: data.spotify.song,
                detail: data.spotify.artist,
                img: data.spotify.album_art_url,
                url: data.spotify.track_id ? 'https://open.spotify.com/track/' + data.spotify.track_id : null,
                start: data.spotify.timestamps.start,
                end: data.spotify.timestamps.end
            });
        }

        (data.activities || []).forEach(a => {
            if (a.type !== 0 || a.name === 'Spotify') return;
            let img = 'https://cdn.discordapp.com/embed/avatars/0.png';
            if (a.assets && a.assets.large_image) {
                img = a.assets.large_image.indexOf('mp:external') === 0
                    ? a.assets.large_image.replace(/mp:external\/.*?\/https\//, 'https://')
                    : 'https://cdn.discordapp.com/app-assets/' + a.application_id + '/' + a.assets.large_image + '.png';
            }
            acts.push({
                kind: 'game',
                label: 'やってる',
                name: a.name,
                detail: [a.details, a.state].filter(Boolean).join(' / '),
                img: img,
                start: (a.timestamps && a.timestamps.start) ? a.timestamps.start : null
            });
        });

        // 同じ内容が重複して届くことがあるので ひとつにまとめる
        const seen = new Set();
        acts = acts.filter(a => {
            const id = a.kind + '|' + a.name + '|' + a.detail;
            if (seen.has(id)) return false;
            seen.add(id);
            return true;
        });

        const key = JSON.stringify(acts);
        if (key === lastActs) return;
        lastActs = key;

        if (!acts.length) {
            actsBox.innerHTML = '<p class="act-none">とくに なにもしてない。</p>';
            if (spotifyTimer) clearInterval(spotifyTimer);
            return;
        }

        actsBox.innerHTML = acts.map(a => {
            let bar = '';
            if (a.kind === 'spotify') {
                bar = '<div class="bar">' +
                        '<div class="bar-bg"><div id="spotify-fill" class="bar-fill"></div></div>' +
                        '<div class="bar-time"><span id="spotify-current">0:00</span><span>' + mmss(a.end - a.start) + '</span></div>' +
                      '</div>';
            }
            return '<div class="act">' +
                '<img class="act-img" src="' + esc(a.img) + '" alt="">' +
                '<div class="act-body">' +
                    '<div class="act-label">' + esc(a.label) +
                        ((a.start && since(a.start)) ? ' <span class="act-time" data-start="' + a.start + '">' + esc(since(a.start)) + '</span>' : '') +
                    '</div>' +
                    '<p class="act-name">' +
                        (a.url ? '<a href="' + esc(a.url) + '" target="_blank" rel="noopener">' + esc(a.name) + '</a>' : esc(a.name)) +
                    '</p>' +
                    (a.detail ? '<p class="act-detail">' + esc(a.detail) + '</p>' : '') +
                    bar +
                '</div>' +
            '</div>';
        }).join('');

        const sp = acts.find(a => a.kind === 'spotify');
        if (sp) runBar(sp);
        else if (spotifyTimer) clearInterval(spotifyTimer);
    };

    const connect = () => {
        socket = new WebSocket('wss://api.lanyard.rest/socket');

        socket.onopen = () => socket.send(JSON.stringify({ op: 2, d: { subscribe_to_id: USER_ID } }));

        socket.onmessage = (event) => {
            const msg = JSON.parse(event.data);
            if (msg.op === 1) {
                if (heartbeat) clearInterval(heartbeat);
                heartbeat = setInterval(() => socket.send(JSON.stringify({ op: 3 })), msg.d.heartbeat_interval);
            }
            if (msg.t === 'INIT_STATE' || msg.t === 'PRESENCE_UPDATE') {
                paint(msg.d);
                if (msg.t === 'INIT_STATE') hideLoader();
            }
        };

        socket.onclose = () => { clearInterval(heartbeat); setTimeout(connect, 3000); };
        socket.onerror = () => hideLoader();
    };

    /* ---------- あかるさ ---------- */

    const applyTheme = (dark) => {
        document.body.classList.toggle('dark-mode', dark);
        document.body.classList.toggle('light-mode', !dark);
        if (themeBtn) themeBtn.textContent = dark ? 'ひる' : 'よる';
    };

    let saved = null;
    try { saved = localStorage.getItem('poo-theme'); } catch (e) {}
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    applyTheme(saved ? saved === 'dark' : !!prefersDark);

    if (themeBtn) {
        themeBtn.addEventListener('click', () => {
            const dark = !document.body.classList.contains('dark-mode');
            applyTheme(dark);
            try { localStorage.setItem('poo-theme', dark ? 'dark' : 'light'); } catch (e) {}
        });
    }

    /* ---------- うえへ ---------- */

    if (backBtn) {
        const onScroll = () => backBtn.classList.toggle('show', window.scrollY > 300);
        window.addEventListener('scroll', onScroll, { passive: true });
        onScroll();
        backBtn.addEventListener('click', (e) => {
            e.preventDefault();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }

    /* ---------- きょうの ひとこと ---------- */

    const HITOKOTO = [
        'なにもないけど 来てくれて ありがとう',
        'きょうも とくに 更新していない',
        'ドメイン代の もとは とれていない',
        'スクロールしても なにも出てこない',
        'この一行は 日替わりです。それだけ',
        'たぶん あしたも こんな感じ',
        'なにか 期待して来た人、ごめん',
        'ここまで 読んでしまったのか',
        '見るべきものは とくに ない',
        'サーバーは えらい。ずっと 起きてる',
        '更新する気は ある。気だけ ある',
        'くそサイトの くそは ほめ言葉',
        'とじても だれも 怒らない',
        'きょうの 運勢は ふつう'
    ];

    const writeHitokoto = () => {
        const box = document.getElementById('hitokoto-text');
        if (!box) return;
        const now = new Date();
        const day = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000);
        const text = HITOKOTO[day % HITOKOTO.length];
        let i = 0;
        const run = () => {
            if (i < text.length) {
                box.textContent += text.charAt(i++);
                setTimeout(run, 75);
            } else {
                box.classList.add('done');
            }
        };
        run();
    };

    const slip = document.getElementById('hitokoto');
    if (slip && 'IntersectionObserver' in window) {
        let started = false;
        const io2 = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (!entry.isIntersecting || started) return;
                started = true;
                setTimeout(writeHitokoto, 350);
                io2.disconnect();
            });
        }, { threshold: 0.4 });
        io2.observe(slip);
    } else {
        writeHitokoto();
    }

    /* ---------- レシートの日付 ---------- */

    const rdate = document.getElementById('r-date');
    if (rdate) {
        const n2 = new Date();
        const p = (x) => String(x).padStart(2, '0');
        rdate.textContent = n2.getFullYear() + '-' + p(n2.getMonth() + 1) + '-' + p(n2.getDate()) + '  ' + p(n2.getHours()) + ':' + p(n2.getMinutes());
    }

    /* ---------- あしあと（この端末で来た回数） ---------- */

    const footprint = document.getElementById('footprint');
    if (footprint) {
        let n = 1;
        try {
            n = parseInt(localStorage.getItem('poo-visits') || '0', 10) + 1;
            if (!n || n < 1) n = 1;
            localStorage.setItem('poo-visits', String(n));
        } catch (e) { n = 1; }
        footprint.textContent = n === 1
            ? 'あなたが ここに来たのは はじめて です'
            : 'あなたが ここに来たのは ' + n + ' かいめ です';
    }

    /* ---------- やっている時間を ときどき 更新 ---------- */

    setInterval(() => {
        document.querySelectorAll('.act-time[data-start]').forEach(el => {
            const txt = since(Number(el.dataset.start));
            el.textContent = txt;
            el.style.display = txt ? '' : 'none';
        });
    }, 30000);

    /* ---------- タブを離れると さみしがる ---------- */

    const realTitle = document.title;
    document.addEventListener('visibilitychange', () => {
        document.title = document.hidden ? 'もどってきて…' : realTitle;
    });

    /* ---------- たまに なにかが 通りすぎる ---------- */

    const sky = document.getElementById('sky');
    const calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (sky && !calm) {
        const FLOATERS = [
            {
                cls: 'f-balloon', min: 17000, max: 24000, count: [1, 2],
                colors: ['#dc6969', '#7ea7d6', '#8dc39a', '#dfae5e', '#c58ac8'],
                svg: '<svg width="34" height="58" viewBox="0 0 34 58" fill="none">' +
                     '<ellipse cx="17" cy="19" rx="13" ry="15" fill="currentColor" opacity="0.85"/>' +
                     '<path d="M17 34l-2.6 4.4h5.2L17 34z" fill="currentColor"/>' +
                     '<path d="M17 39c3.4 4.6 -3.4 6.6 0 11 3.4 4.4 -2.4 4.4 0 7.4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" fill="none" opacity="0.7"/>' +
                     '</svg>'
            },
            {
                cls: 'f-plane', min: 11000, max: 15000, count: [1, 1],
                colors: null,
                svg: '<svg width="42" height="28" viewBox="0 0 42 28" fill="none">' +
                     '<path d="M2 13L40 2 27 26l-6.5-8.5L2 13z" fill="currentColor" opacity="0.45"/>' +
                     '<path d="M2 13l18.5 4.5M20.5 17.5L40 2" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" stroke-linecap="round" opacity="0.8"/>' +
                     '</svg>'
            },
            {
                cls: 'f-leaf', min: 14000, max: 19000, count: [3, 6],
                colors: ['#b5793f', '#c0913f', '#a2693a', '#9a8a4a'],
                svg: '<svg width="22" height="27" viewBox="0 0 22 27" fill="none">' +
                     '<path d="M11 1C4.5 6 1.5 13 3.5 19.5 5.5 25 13 26.5 17 22.5 21 18.5 20 9 11 1z" fill="currentColor" opacity="0.75"/>' +
                     '<path d="M11 4c-2 7-2.5 13-0.5 19" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.5"/>' +
                     '</svg>'
            },
            {
                cls: 'f-bubble', min: 14000, max: 19000, count: [3, 5],
                colors: ['#8fb8d9', '#a9c9dd', '#bcd3e4'],
                svg: '<svg width="26" height="26" viewBox="0 0 26 26" fill="none">' +
                     '<circle cx="13" cy="13" r="11" stroke="currentColor" stroke-width="1.4" opacity="0.65"/>' +
                     '<circle cx="9" cy="9" r="3.2" fill="currentColor" opacity="0.35"/>' +
                     '</svg>'
            }
        ];

        const rand = (a, b) => a + Math.random() * (b - a);
        const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

        function plan(ms) { setTimeout(fly, ms); }

        function fly() {
            // 見ていないときは 出さずに 待ちなおす
            if (document.hidden) { plan(rand(8000, 15000)); return; }

            const f = pick(FLOATERS);
            const n = Math.round(rand(f.count[0], f.count[1]));
            for (let i = 0; i < n; i++) {
                // ぱらぱらと 時間差で
                setTimeout(() => spawn(f), Math.round(i * rand(260, 900)));
            }

            plan(rand(9000, 18000));
        }

        function spawn(f) {
            const el = document.createElement('div');
            el.className = 'floater ' + f.cls;
            el.innerHTML = f.svg;
            el.style.color = f.colors
                ? pick(f.colors)
                : (getComputedStyle(document.body).getPropertyValue('--ink-2').trim() || '#6b5f52');
            el.style.setProperty('--sc', rand(0.72, 1.14).toFixed(2));

            const dur = Math.round(rand(f.min, f.max));
            el.style.animationDuration = dur + 'ms';
            if (f.cls === 'f-plane') el.style.top = rand(10, 64).toFixed(1) + 'vh';
            else el.style.left = rand(4, 84).toFixed(1) + 'vw';

            sky.appendChild(el);
            setTimeout(() => el.remove(), dur + 900);
        }

        plan(rand(3000, 9000));
    }

    /* ---------- 写真に さわると ぬるっと まっすぐ ---------- */

    const photo = document.querySelector('a.polaroid');
    if (photo && !calm) {
        const EASE = 'transform 0.6s cubic-bezier(0.22, 1, 0.36, 1)';
        const setT = (v) => photo.style.setProperty('transform', v, 'important');
        let back = null;

        photo.addEventListener('mouseenter', () => {
            clearTimeout(back);
            // いま揺れている角度のまま いったん止める
            const now = getComputedStyle(photo).transform;
            photo.style.setProperty('animation', 'none', 'important');
            setT(now && now !== 'none' ? now : 'rotate(-3deg)');
            void photo.offsetWidth;
            photo.style.setProperty('transition', EASE, 'important');
            setT('rotate(0deg) scale(1.04)');
        });

        photo.addEventListener('mouseleave', () => {
            setT('rotate(-3deg) scale(1)');
            back = setTimeout(() => {
                photo.style.removeProperty('transition');
                photo.style.removeProperty('transform');
                photo.style.removeProperty('animation');
            }, 650);
        });
    }

    connect();
});
