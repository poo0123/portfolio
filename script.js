document.addEventListener('DOMContentLoaded', () => {

    const USER_ID = "339360580886593536";

    const loader      = document.getElementById('loader');
    const backBtn     = document.getElementById('back-to-top');
    const themeBtn    = document.getElementById('theme-toggle');
    const statusDot   = document.getElementById('status-dot');
    const pillDot     = document.getElementById('pill-dot');
    const pillText    = document.getElementById('pill-text');
    const actsBox     = document.getElementById('bubble-list');

    // 中身を いじるあいだ、高さを なめらかに つなぐ
    let actsHeightTimer = null;
    const smoothActs = (change) => {
        if (!actsBox) { change(); return; }
        const oldH = actsBox.offsetHeight;
        change();
        actsBox.style.height = '';
        const newH = actsBox.offsetHeight;
        if (oldH === newH) return;
        actsBox.style.height = oldH + 'px';
        actsBox.classList.add('acts-moving');
        void actsBox.offsetHeight;          // いったん 確定させる
        actsBox.style.height = newH + 'px';
        clearTimeout(actsHeightTimer);
        actsHeightTimer = setTimeout(() => {
            actsBox.style.height = '';
            actsBox.classList.remove('acts-moving');
        }, 460);
    };

    // 消えるものは 浮かせてから 消す（まわりが すぐ詰まるように）
    const leaveAct = (el) => {
        el.style.top = el.offsetTop + 'px';
        el.style.height = el.offsetHeight + 'px';
        el.removeAttribute('data-key');
        el.classList.add('act-out');
        setTimeout(() => el.remove(), 420);
    };

    // 「ほかに ◯ こ」を押したとき
    if (actsBox) {
        actsBox.addEventListener('click', (e) => {
            const btn = e.target.closest('.acts-toggle');
            if (!btn) return;
            actsOpen = !actsOpen;
            smoothActs(() => {
                actsBox.classList.toggle('open', actsOpen);
                btn.setAttribute('aria-expanded', actsOpen ? 'true' : 'false');
                const t = btn.querySelector('.acts-toggle-text');
                if (t) t.textContent = actsOpen ? 'とじる' : 'ほかに ' + btn.dataset.rest + ' こ';
            });
        });
    }

    let socket = null;
    let heartbeat = null;
    let lastActs = "";
    let barTimer = null;

    // 動く アイコンに 差しかえ ずみか。paint は Discord が 動くたびに
    // 何度も 走るので、img の src では なく ここで おぼえておく
    let bigMoving = false;
    let smallMoving = false;

    // Discord が くれる activity の種類
    const ACT_LABEL = {
        0: 'やってる',
        1: 'はいしん中',
        2: 'きいてる',
        3: 'みてる',
        5: '参戦してる'
    };
    const ACTS_VISIBLE = 2;   // ここまでは いつも出す
    let actsOpen = false;

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

    /* ---------- 終わりの時刻が わかるものの えんぴつ線 ---------- */

    const runBars = () => {
        if (barTimer) clearInterval(barTimer);
        if (!actsBox) return;
        const tick = () => {
            const bars = actsBox.querySelectorAll('.bar[data-start][data-end]');
            let live = false;
            bars.forEach(b => {
                const start = Number(b.dataset.start);
                const end   = Number(b.dataset.end);
                const total = end - start;
                const done  = Date.now() - start;
                const fill  = b.querySelector('.bar-fill');
                const now   = b.querySelector('.bar-now');
                if (total > 0 && fill && now) {
                    fill.style.width = Math.min(Math.max(done / total, 0) * 100, 100) + '%';
                    now.textContent = mmss(Math.max(Math.min(done, total), 0));
                }
                if (done < total) live = true;
            });
            if (!live) clearInterval(barTimer);
        };
        tick();
        barTimer = setInterval(tick, 1000);
    };

    /* ---------- Discord のいま ---------- */

    const paint = (data) => {
        const avatar = document.getElementById('discord-avatar');
        const ph = document.getElementById('avatar-placeholder');
        if (avatar && data.discord_user && data.discord_user.avatar) {
            // ハッシュが a_ で はじまるのは 動く アイコン。ふつうに .webp を
            // たのむと Discord は 1枚だけ 返してくる（9.6KB）。animated=true を
            // つけると 動くものが くる かわりに 重くなる（96px で 113KB、
            // 160px で 312KB）。なので はじめは 止まったまま 置いておく。
            const avaBase = 'https://cdn.discordapp.com/avatars/' + USER_ID + '/' + data.discord_user.avatar;
            const avaMoves = !calm && data.discord_user.avatar.indexOf('a_') === 0;

            avatar.src = (avaMoves && bigMoving)
                ? avaBase + '.webp?size=160&animated=true' : avaBase + '.webp?size=256';

            // 大きい ほうは さわった ときだけ 動かす。はなしても もどさない
            // （もう 持っているので、もどしても 軽くは ならない）
            if (avaMoves && !avatar.dataset.armed) {
                avatar.dataset.armed = '1';
                avatar.parentElement.addEventListener('pointerenter', () => {
                    bigMoving = true;
                    avatar.src = avaBase + '.webp?size=160&animated=true';
                }, { once: true });
            }
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
                // 「いま」の ほうは 生きている ところなので、ページが
                // 落ちついてから 小さい 動くやつ（96px・113KB）に 差しかえる
                const faceBase = 'https://cdn.discordapp.com/avatars/' + USER_ID + '/' + u.avatar;
                const faceMoves = !calm && u.avatar.indexOf('a_') === 0;

                face.src = (faceMoves && smallMoving)
                    ? faceBase + '.webp?size=96&animated=true' : faceBase + '.webp?size=160';

                if (faceMoves && !smallMoving && !face.dataset.armed) {
                    face.dataset.armed = '1';
                    const later = () => setTimeout(() => {
                        smallMoving = true;
                        face.src = faceBase + '.webp?size=96&animated=true';
                    }, 1200);
                    if (document.readyState === 'complete') later();
                    else window.addEventListener('load', later, { once: true });
                }
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
                const still = 'url("' + base + 'static.png")';
                // 動かない環境のために 静止画も敷いておく
                head.style.backgroundImage = still;
                if (plate && !calm) {
                    if (plate.dataset.base !== base) {
                        plate.dataset.base = base;
                        plate.src = base + 'asset.webm';
                        // 動くほうは 透けている部分があるので、
                        // 流れはじめたら 下の静止画は どける（二重に見えてしまう）
                        plate.addEventListener('playing', () => {
                            head.style.backgroundImage = '';
                        }, { once: true });
                        // 読めなかったときは 静止画に もどす
                        plate.addEventListener('error', () => {
                            head.style.backgroundImage = still;
                        });
                        const go = () => { const p = plate.play(); if (p && p.catch) p.catch(() => {}); };
                        go();
                        plate.addEventListener('loadeddata', go, { once: true });
                    } else if (!plate.paused) {
                        head.style.backgroundImage = '';
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
            if (a.name === 'Spotify' && a.type === 2) return;

            // ひとこと（カスタムステータス）は 絵文字と文だけ
            if (a.type === 4) {
                const e = a.emoji;
                const txt = [(e && !e.id) ? e.name : '', a.state].filter(Boolean).join(' ');
                if (!txt) return;
                acts.push({
                    kind: 'custom',
                    label: 'ひとこと',
                    name: txt,
                    detail: '',
                    img: (e && e.id)
                        ? 'https://cdn.discordapp.com/emojis/' + e.id + (e.animated ? '.gif' : '.png') + '?size=96'
                        : null,
                    start: null
                });
                return;
            }

            const label = ACT_LABEL[a.type];
            if (!label) return;

            let img = 'https://cdn.discordapp.com/embed/avatars/0.png';
            const big = a.assets && a.assets.large_image;
            if (big) {
                if (big.indexOf('mp:') === 0) {
                    // よそのサイトの画像は 直に取りにいくと 断られるので Discord 経由でもらう
                    img = 'https://media.discordapp.net/' + big.slice(3) + '?width=96&height=96';
                } else if (a.application_id) {
                    img = 'https://cdn.discordapp.com/app-assets/' + a.application_id + '/' + big + '.png?size=96';
                }
            }
            acts.push({
                kind: 'game',
                label: label,
                name: a.name,
                detail: [a.details, a.state].filter(Boolean).join(' / '),
                img: img,
                // 曲や 動画は details_url を 持っていることがある。
                // 捨てていたので、いままで ただの 文字に なっていた
                url: a.details_url || null,
                start: (a.timestamps && a.timestamps.start) ? a.timestamps.start : null,
                end:   (a.timestamps && a.timestamps.end)   ? a.timestamps.end   : null
            });
        });

        // 同じ内容が重複して届くことがあるので ひとつにまとめる
        const seen = new Set();
        acts = acts.filter(a => {
            const id = a.label + '|' + a.name + '|' + a.detail;
            if (seen.has(id)) return false;
            seen.add(id);
            return true;
        });

        const key = JSON.stringify(acts);
        if (key === lastActs) return;
        lastActs = key;

        // 一枚ぶんの 中身
        const buildAct = (a) => {
            let bar = '';
            // 終わりの時刻が わかるものは どこまで進んだか 出す
            if (a.start && a.end && a.end > a.start) {
                bar = '<div class="bar" data-start="' + a.start + '" data-end="' + a.end + '">' +
                        '<div class="bar-bg"><div class="bar-fill"></div></div>' +
                        '<div class="bar-time">' +
                            '<span class="bar-now">0:00</span>' +
                            '<span>' + mmss(a.end - a.start) + '</span>' +
                        '</div>' +
                      '</div>';
            }
            return {
                noimg: !a.img,
                sig: [a.img, a.url, a.start, a.end].join('|'),
                html:
                    (a.img ? '<img class="act-img" src="' + esc(a.img) + '" alt="" loading="lazy" ' +
                             'onerror="this.onerror=null;this.src=&quot;https://cdn.discordapp.com/embed/avatars/0.png&quot;">' : '') +
                    '<div class="act-body">' +
                        '<div class="act-label">' + esc(a.label) +
                            ((a.start && !bar && since(a.start)) ? ' <span class="act-time" data-start="' + a.start + '">' + esc(since(a.start)) + '</span>' : '') +
                        '</div>' +
                        '<p class="act-name">' +
                            (a.url ? '<a href="' + esc(a.url) + '" target="_blank" rel="noopener">' + esc(a.name) + '</a>' : esc(a.name)) +
                        '</p>' +
                        (a.detail ? '<p class="act-detail">' + esc(a.detail) + '</p>' : '') +
                        bar +
                    '</div>'
            };
        };

        const keyOf = (a) => a.label + '|' + a.name + '|' + a.detail;

        // ある ものは のこし、足りないものだけ 足して、いらないものだけ 落とす
        smoothActs(() => {
            const none = actsBox.querySelector('.act-none');

            if (!acts.length) {
                actsBox.querySelectorAll('.act:not(.act-out)').forEach(leaveAct);
                const old = actsBox.querySelector('.acts-toggle');
                if (old) old.remove();
                if (!none) {
                    const p = document.createElement('p');
                    p.className = 'act-none act-in';
                    p.textContent = 'とくに なにもしてない。';
                    actsBox.appendChild(p);
                    setTimeout(() => p.classList.remove('act-in'), 30);
                }
                return;
            }
            if (none) none.remove();

            const have = new Map();
            actsBox.querySelectorAll('.act:not(.act-out)').forEach(el => have.set(el.dataset.key, el));

            const want = new Set(acts.map(keyOf));
            have.forEach((el, k) => {
                if (want.has(k)) return;
                leaveAct(el);
                have.delete(k);
            });

            let prev = null;
            acts.forEach(a => {
                const k = keyOf(a);
                const b = buildAct(a);
                let el = have.get(k);
                if (el) {
                    if (el.dataset.sig !== b.sig) {
                        el.innerHTML = b.html;
                        el.dataset.sig = b.sig;
                    }
                    el.classList.toggle('act-noimg', b.noimg);
                } else {
                    el = document.createElement('div');
                    el.className = 'act act-in' + (b.noimg ? ' act-noimg' : '');
                    el.dataset.key = k;
                    el.dataset.sig = b.sig;
                    el.innerHTML = b.html;
                    setTimeout(() => el.classList.remove('act-in'), 30);
                }
                if (prev) prev.after(el);
                else actsBox.insertBefore(el, actsBox.firstChild);
                prev = el;
            });

            // あまりは たたむ
            const alive = Array.prototype.slice.call(actsBox.querySelectorAll('.act:not(.act-out)'));
            alive.forEach((el, i) => el.classList.toggle('act-extra', i >= ACTS_VISIBLE));

            const rest = Math.max(alive.length - ACTS_VISIBLE, 0);
            if (!rest) actsOpen = false;
            actsBox.classList.toggle('open', actsOpen && rest > 0);

            let btn = actsBox.querySelector('.acts-toggle');
            if (rest > 0) {
                if (!btn) {
                    btn = document.createElement('button');
                    btn.type = 'button';
                    btn.className = 'acts-toggle';
                    btn.innerHTML = '<span class="acts-toggle-text"></span>' +
                                    '<i class="fa-solid fa-chevron-down" aria-hidden="true"></i>';
                }
                btn.dataset.rest = rest;
                btn.setAttribute('aria-expanded', actsOpen ? 'true' : 'false');
                btn.querySelector('.acts-toggle-text').textContent =
                    actsOpen ? 'とじる' : 'ほかに ' + rest + ' こ';
                actsBox.appendChild(btn);
            } else if (btn) {
                btn.remove();
            }
        });

        if (acts.some(a => a.start && a.end && a.end > a.start)) runBars();
        else if (barTimer) clearInterval(barTimer);
    };

    const connect = () => {
        socket = new WebSocket('wss://api.lanyard.rest/socket');

        socket.onopen = () => {
            mark('api-dot-lanyard', true);
            socket.send(JSON.stringify({ op: 2, d: { subscribe_to_id: USER_ID } }));
        };

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
        socket.onerror = () => { mark('api-dot-lanyard', false); hideLoader(); };
    };

    /* ---------- あかるさ ---------- */

    // よる/ひるが 切りかわったら 知らせる（蛍と 雲が つかう）
    const themeHooks = [];
    const onThemeChange = (fn) => {
        themeHooks.push(fn);
        fn(document.body.classList.contains('dark-mode'));
    };

    const applyTheme = (dark) => {
        document.body.classList.toggle('dark-mode', dark);
        document.body.classList.toggle('light-mode', !dark);
        if (themeBtn) themeBtn.textContent = dark ? 'ひる' : 'よる';
        const meta = document.querySelector('meta[name="theme-color"]');
        if (meta) meta.setAttribute('content', dark ? '#070b1c' : '#dc6969');
        themeHooks.forEach((fn) => fn(dark));
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

    /* ---------- スクロール中の 小さい見出し ---------- */

    const minibar = document.getElementById('minibar');

    if (minibar) {
        // 見出しを 通りすぎたら 出す。高さは 測りなおせるように しておく
        let mastBottom = 300;
        const measureMast = () => {
            const mast = document.querySelector('.masthead');
            mastBottom = mast
                ? mast.getBoundingClientRect().bottom + window.scrollY - 8
                : 300;
        };
        const onScrollMini = () => {
            // 紙を 開いて うしろを 止めている あいだは さわらない
            if (document.body.classList.contains('api-locked')) return;
            minibar.classList.toggle('show', window.scrollY > mastBottom);
        };
        const remeasure = () => { measureMast(); onScrollMini(); };

        remeasure();
        window.addEventListener('scroll', onScrollMini, { passive: true });
        window.addEventListener('resize', remeasure);
        window.addEventListener('load', remeasure);
        if (document.fonts && document.fonts.ready) {
            document.fonts.ready.then(remeasure).catch(() => {});
        }

        const miniLogo = minibar.querySelector('.minibar-logo');
        if (miniLogo) {
            miniLogo.addEventListener('click', (e) => {
                e.preventDefault();
                window.scrollTo({ top: 0, behavior: 'smooth' });
            });
        }
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

    /* ---------- スマホの 丸いいどう ---------- */

    const dots    = document.getElementById('dots');
    const dotsBtn = document.getElementById('dots-toggle');

    if (dots && dotsBtn) {
        const closeDots = () => {
            dots.classList.remove('open');
            dotsBtn.setAttribute('aria-expanded', 'false');
        };

        const onScrollDots = () => dots.classList.toggle('show', window.scrollY > 300);
        window.addEventListener('scroll', onScrollDots, { passive: true });
        onScrollDots();

        dotsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const open = !dots.classList.contains('open');
            dots.classList.toggle('open', open);
            dotsBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
        });

        dots.querySelectorAll('.dots-list a').forEach(a => {
            a.addEventListener('click', (e) => {
                closeDots();
                if (a.dataset.top) {
                    e.preventDefault();
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                }
            });
        });

        document.addEventListener('click', (e) => {
            if (!e.target.closest('#dots')) closeDots();
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
        const DAY = [
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

        // よるは 夜に 飛んでいそうなもの だけ
        const NIGHT = [
            {
                cls: 'f-moth', min: 13000, max: 18000, count: [1, 2],
                colors: ['#cfd9f6', '#b7c4e6', '#e2d8bd', '#a8b3d8'],
                svg: '<svg width="30" height="24" viewBox="0 0 30 24" fill="none">' +
                     '<path d="M15 12C11 3 4 1 2 5c-2 4 3 9 13 7z" fill="currentColor" opacity="0.7"/>' +
                     '<path d="M15 12c4-9 11-11 13-7 2 4-3 9-13 7z" fill="currentColor" opacity="0.7"/>' +
                     '<path d="M15 12c-3 5-8 6-9 3" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" opacity="0.5" fill="none"/>' +
                     '<path d="M15 12c3 5 8 6 9 3" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" opacity="0.5" fill="none"/>' +
                     '<ellipse cx="15" cy="13" rx="1.6" ry="5" fill="currentColor" opacity="0.9"/>' +
                     '<path d="M15 8l-2.6-3.4M15 8l2.6-3.4" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.8"/>' +
                     '</svg>'
            },
            {
                cls: 'f-star', min: 2000, max: 2900, count: [1, 1],
                colors: ['#eaf3ff', '#dceaff'],
                svg: '<svg width="120" height="36" viewBox="0 0 120 36" fill="none">' +
                     '<path d="M114 5 18 31" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" opacity="0.16"/>' +
                     '<path d="M114 5 56 21" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" opacity="0.42"/>' +
                     '<path d="M114 5 88 12" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" opacity="0.88"/>' +
                     '<circle cx="114" cy="5" r="2.5" fill="currentColor"/>' +
                     '</svg>'
            },
            {
                cls: 'f-plane', min: 13000, max: 17000, count: [1, 1],
                colors: ['#b9c6e8'],
                svg: '<svg width="42" height="28" viewBox="0 0 42 28" fill="none">' +
                     '<path d="M2 13L40 2 27 26l-6.5-8.5L2 13z" fill="currentColor" opacity="0.4"/>' +
                     '<path d="M2 13l18.5 4.5M20.5 17.5L40 2" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" stroke-linecap="round" opacity="0.75"/>' +
                     '</svg>'
            }
        ];

        // いまの 天気（そらの ぶんが つけた しるしを 読むだけ）
        const wxNow = () => {
            const c = document.body.classList;
            return c.contains('wx-rain')   ? 'rain'
                 : c.contains('wx-snow')   ? 'snow'
                 : c.contains('wx-cloudy') ? 'cloudy'
                 : 'clear';
        };
        const wet = () => { const w = wxNow(); return w === 'rain' || w === 'snow'; };

        const pool = () => {
            const night = document.body.classList.contains('dark-mode');
            const all = night ? NIGHT : DAY;
            let list = all;
            // あめと ゆきの日に 風船と しゃぼん玉は うかばない
            if (wet()) list = list.filter((f) => f.cls !== 'f-balloon' && f.cls !== 'f-bubble');
            // 雲が あるときは 流れ星は 見えない
            if (wxNow() !== 'clear') list = list.filter((f) => f.cls !== 'f-star');
            return list.length ? list : all;
        };

        const rand = (a, b) => a + Math.random() * (b - a);
        const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

        function plan(ms) { setTimeout(fly, ms); }

        function fly() {
            // 見ていないときは 出さずに 待ちなおす
            if (document.hidden) { plan(rand(8000, 15000)); return; }

            const f = pick(pool());
            const n = Math.round(rand(f.count[0], f.count[1]));
            for (let i = 0; i < n; i++) {
                // ぱらぱらと 時間差で
                setTimeout(() => spawn(f), Math.round(i * rand(260, 900)));
            }

            // ふる日は すこし まばらに
            plan(rand(9000, 18000) * (wet() ? 1.6 : 1));
        }

        /* --- ほんものっぽい 軌道 ---
           1つずつ その場で 計算して、こまかい コマに して 流す。
           おなじ 飛びかたは 二度と 出ない。 */

        // なめらかな ゆらぎ（風）。-1〜1 くらい
        const mkNoise = (base) => {
            const p = [0, 1, 2].map((i) => [base * (0.55 + i * 0.75 + Math.random() * 0.4), Math.random() * 6.283, 1 / (i + 1)]);
            return (t) => p.reduce((s, q) => s + q[2] * Math.sin(q[0] * t + q[1]), 0) / 1.83;
        };
        const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
        const fadeIO = (t, dur, a, b) => clamp(Math.min(t / a, (dur - t) / b), 0, 1);

        const PATHS = {
            // 紙ひこうき：揚力と 抗力の つりあい。上がると おそく、下がると はやい（フゴイド）
            'f-plane': (night) => {
                const w = window.innerWidth, h = window.innerHeight;
                const LD = rand(7.5, 11);                       // どれだけ よく 滑るか
                const cycles = clamp(w / 520, 1.3, 3.2);        // 画面を よこぎる あいだの うねり
                const X = cycles * 8.9;
                const gust = mkNoise(0.8);
                let v = rand(1.12, 1.5), g = rand(-0.06, 0.24), x = 0, y = 0, t = 0, k = 0;
                const pts = [];
                while (x < X && t < 90) {
                    if (k++ % 8 === 0) pts.push([x, y, g]);
                    const lift = v * v * (1 + 0.07 * gust(t));
                    v = Math.max(0.3, v + (-Math.sin(g) - v * v / LD) * 0.02);
                    g += ((lift - Math.cos(g)) / v) * 0.02;
                    x += v * Math.cos(g) * 0.02; y += v * Math.sin(g) * 0.02; t += 0.02;
                }
                pts.push([x, y, g]);
                const s = (w + 190) / X;
                const y0 = h * rand(0.1, 0.52);
                const dur = clamp(w / 105, 6.5, 14) * rand(0.9, 1.2) * (night ? 1.12 : 1);
                const n = pts.length - 1;
                return {
                    dur: dur * 1000,
                    frames: pts.map((p, i) => ({
                        x: -95 + p[0] * s, y: y0 - p[1] * s,
                        r: -p[2] * 57.3 + 11,
                        o: fadeIO(i, n, n * 0.05, n * 0.07)
                    }))
                };
            },

            // 風船：浮力で ほぼ 一定に 上がり、風に おくれて 流される
            'f-balloon': () => {
                const w = window.innerWidth, h = window.innerHeight;
                const dur = rand(17, 24), N = 150, dt = dur / N;
                const wind = mkNoise(0.45), sway = mkNoise(1.3);
                const drift = rand(-10, 10), vt = (h + 200) / (dur - 1.2);
                let x = rand(0.06, 0.86) * w, vx = 0;
                const out = [];
                for (let i = 0; i <= N; i++) {
                    const t = i * dt;
                    const wv = drift + 30 * wind(t);
                    vx += (wv - vx) * Math.min(1, dt / 0.9);
                    x += vx * dt;
                    const y = h + 20 - vt * (t - 1.2 * (1 - Math.exp(-t / 1.2)));
                    out.push({ x, y, r: clamp(vx * 0.24, -10, 10) + 2.4 * sway(t), o: fadeIO(t, dur, 1.2, 1.6) });
                }
                return { dur: dur * 1000, frames: out };
            },

            // 木の葉：ひらひら 左右に すべるか、くるくる 回りながら 落ちる
            'f-leaf': () => {
                const w = window.innerWidth, h = window.innerHeight;
                const dur = rand(12, 18), N = 170, dt = dur / N;
                const wind = mkNoise(0.5);
                const tumble = Math.random() < 0.35;
                const x0 = rand(0.04, 0.9) * w, drift = rand(-14, 14), ph = rand(0, 6.283);
                const om = rand(1.7, 2.5), A = rand(30, 64), r0 = rand(0, 360);
                const spin = rand(150, 230) * (Math.random() < 0.5 ? -1 : 1);
                const v = (h + 130) / dur;
                const out = [];
                for (let i = 0; i <= N; i++) {
                    const t = i * dt, a = om * t + ph;
                    let x = x0 + drift * t + 36 * wind(t), y = -50 + v * t, r;
                    if (tumble) {
                        const sa = spin * t * 0.01745 * 2;
                        x += Math.sign(spin) * 9 * t + 6 * Math.sin(sa);
                        y += 5 * Math.cos(sa);
                        r = r0 + spin * t;
                    } else {
                        // はしで ふわっと 止まり、まんなかで すっと 落ちる
                        const env = 0.7 + 0.3 * Math.sin(0.4 * t + ph);
                        x += A * env * Math.sin(a);
                        y += A * 0.24 * env * Math.sin(2 * a);
                        r = r0 * 0.1 + 46 * env * Math.cos(a);
                    }
                    out.push({ x, y, r, o: fadeIO(t, dur, 1, 1.2) });
                }
                return { dur: dur * 1000, frames: out };
            },

            // しゃぼん玉：風に そのまま 流され、ぷるぷる ゆれて、どこかで はじける
            'f-bubble': () => {
                const w = window.innerWidth, h = window.innerHeight;
                const dur = rand(11, 18), N = 150, dt = dur / N;
                const wind = mkNoise(0.6), bob = mkNoise(1.6);
                const reach = rand(0.45, 1.05) * (h + 110);    // はじける 高さ
                const drift = rand(-9, 9), wf = rand(4.5, 6.5), ph = rand(0, 6.283);
                let x = rand(0.05, 0.9) * w;
                const out = [];
                for (let i = 0; i <= N; i++) {
                    const t = i * dt, u = t / dur;
                    x += (drift + 34 * wind(t)) * dt;
                    // ふきだした いきおいが だんだん ぬけて、ゆっくりに なる
                    const y = h + 30 - reach * (1 - Math.pow(Math.max(0, 1 - u), 1.6)) + 7 * bob(t);
                    const wob = 0.055 * Math.exp(-t / 5) * Math.sin(wf * t + ph) + 0.015 * Math.sin(wf * 0.6 * t);
                    out.push({ x, y, r: 0, sx: 1 + wob, sy: 1 - wob, o: 0.9 * clamp(t / 1.2, 0, 1) });
                }
                const e = out[out.length - 1], q = out[out.length - 2];
                q.sx = q.sy = 1.12;
                e.sx = e.sy = 1.5; e.o = 0;                     // ぱちん
                return { dur: dur * 1000, frames: out };
            },

            // 蛾：まっすぐ 飛べない。向きを こまかく 変えながら 上へ
            'f-moth': () => {
                const w = window.innerWidth, h = window.innerHeight;
                const turn = mkNoise(2.6), slow = mkNoise(0.5), pace = mkNoise(1.9);
                const v0 = rand(70, 105), dt = 1 / 12;
                let x = rand(0.08, 0.88) * w, y = h + 30, t = 0;
                const out = [];
                while (y > -60 && t < 26) {
                    const th = -1.5708 + 1.15 * turn(t) + 0.55 * slow(t);
                    const v = v0 * (1 + 0.55 * pace(t));
                    out.push({ x, y, r: (th + 1.5708) * 57.3 * 0.7, o: 0.9 * clamp(t / 1, 0, 1) });
                    x += v * Math.cos(th) * dt; y += v * Math.sin(th) * dt; t += dt;
                }
                out.push({ x, y, r: 0, o: 0 });
                return { dur: t * 1000, frames: out };
            },

            // 流れ星：まっすぐ、おなじ 速さで、一瞬
            'f-star': () => {
                const w = window.innerWidth, h = window.innerHeight;
                const a = rand(16, 40) * 0.01745;
                const dist = rand(0.32, 0.55) * Math.hypot(w, h);
                const x0 = rand(0.5, 0.98) * w, y0 = rand(0.0, 0.24) * h;
                const r = 195.2 - a * 57.3;                     // あたまを 進む向きに
                const dur = rand(0.65, 1.15);
                const at = (u, o, sc) => ({ x: x0 - 60 - Math.cos(a) * dist * u, y: y0 + Math.sin(a) * dist * u, r, o, sx: sc, sy: 1, off: u });
                return { dur: dur * 1000, frames: [at(0, 0, 0.3), at(0.14, 1, 0.8), at(0.55, 1, 1), at(1, 0, 0.75)] };
            }
        };

        function spawn(f) {
            const el = document.createElement('div');
            el.className = 'floater ' + f.cls;
            el.innerHTML = f.svg;
            el.style.color = f.colors
                ? pick(f.colors)
                : (getComputedStyle(document.body).getPropertyValue('--ink-2').trim() || '#6b5f52');
            el.style.setProperty('--sc', rand(0.72, 1.14).toFixed(2));

            const night = document.body.classList.contains('dark-mode');
            const p = PATHS[f.cls](night);
            const tf = (k) => 'translate3d(' + k.x.toFixed(1) + 'px,' + k.y.toFixed(1) + 'px,0) rotate(' + k.r.toFixed(1) + 'deg)' +
                (k.sx ? ' scale(' + k.sx.toFixed(3) + ',' + k.sy.toFixed(3) + ')' : '');
            const frames = p.frames.map((k) => {
                const o = { transform: tf(k), opacity: k.o.toFixed(2) };
                if (k.off !== undefined) o.offset = k.off;
                return o;
            });
            // 位置は ぜんぶ ここで 決める（CSS の 動きは 使わない）
            el.style.cssText += ';left:0;top:0;bottom:auto;animation:none;opacity:0;';
            sky.appendChild(el);

            if (!el.animate) { el.remove(); return; }
            const an = el.animate(frames, { duration: p.dur, easing: 'linear', fill: 'forwards' });
            an.onfinish = () => el.remove();
            setTimeout(() => el.remove(), p.dur + 1500);
        }

        plan(rand(3000, 9000));
    }

    /* ---------- よるの 蛍 ---------- */

    const ffBox = document.getElementById('fireflies');

    if (ffBox && !calm) {
        const rnd = (a, b) => a + Math.random() * (b - a);

        const light = () => {
            if (ffBox.childElementCount) return;
            const n = window.innerWidth < 720 ? 9 : 16;
            for (let i = 0; i < n; i++) {
                const el = document.createElement('i');
                el.className = 'ff';
                el.style.left = rnd(2, 96).toFixed(1) + 'vw';
                el.style.top  = rnd(6, 92).toFixed(1) + 'vh';
                el.style.setProperty('--r',  rnd(2.6, 5).toFixed(1) + 'px');
                el.style.setProperty('--dx', rnd(-90, 90).toFixed(0) + 'px');
                el.style.setProperty('--dy', rnd(-120, 40).toFixed(0) + 'px');
                el.style.setProperty('--d',  rnd(16, 30).toFixed(1) + 's');
                el.style.setProperty('--b',  rnd(2.6, 5.4).toFixed(1) + 's');
                // 出そろって しまわないよう ばらばらに ずらす
                el.style.setProperty('--bd', (-rnd(0, 6)).toFixed(1) + 's');
                ffBox.appendChild(el);
                // ふらふら さまよって、もとの 場所へ もどってくる 道すじ
                if (el.animate) {
                    const d = rnd(34, 60), N = 48, fr = [];
                    const cs = [1, 2, 3, 5].map((k) => [k, rnd(0, 6.283), rnd(0, 6.283), rnd(0.5, 1) / k]);
                    const ax = rnd(40, 110), ay = rnd(30, 80);
                    for (let q = 0; q <= N; q++) {
                        const u = q / N * 6.283;
                        let x = 0, y = 0;
                        cs.forEach((c) => { x += c[3] * Math.sin(c[0] * u + c[1]); y += c[3] * Math.sin(c[0] * u + c[2]); });
                        fr.push({ transform: 'translate3d(' + (x * ax).toFixed(1) + 'px,' + (y * ay).toFixed(1) + 'px,0)' });
                    }
                    el.animate(fr, { duration: d * 1000, iterations: Infinity, easing: 'linear', delay: -rnd(0, d) * 1000 });
                }
            }
        };

        const out = () => { ffBox.textContent = ''; };

        onThemeChange((dark) => { if (dark) light(); else out(); });
    }

    /* ---------- つかっているもの（奥付の 紙） ---------- */

    // つながったか どうかを ●に 書きとめる。あとから 開いても 残る
    const apiState = {};
    const mark = (id, ok) => {
        apiState[id] = ok;
        const el = document.getElementById(id);
        if (el) el.classList.add(ok ? 'on' : 'off');
    };

    const apiDlg   = document.getElementById('api-dlg');
    const apiOpen  = document.getElementById('api-open');
    const apiClose = document.getElementById('api-close');

    // 開いている あいだは うしろを 止めて、とじたら もとの 位置に もどす
    let apiLockY = 0;
    const apiLock = () => {
        apiLockY = window.scrollY || window.pageYOffset || 0;
        document.body.style.top = (-apiLockY) + 'px';
        document.body.classList.add('api-locked');
    };
    const apiUnlock = () => {
        if (!document.body.classList.contains('api-locked')) return;
        document.body.classList.remove('api-locked');
        document.body.style.top = '';
        // html に scroll-behavior: smooth が かかっているので、
        // そのまま もどすと 上から 下へ すべって 見える。ここだけ 切る
        const root = document.documentElement;
        const keep = root.style.scrollBehavior;
        root.style.scrollBehavior = 'auto';
        window.scrollTo(0, apiLockY);
        root.style.scrollBehavior = keep;
    };

    // close イベントは 環境によって 飛んでこない ので、
    // とじる道すじ ひとつひとつで 直に もどす（二重に 呼んでも 害は ない）
    const apiShut = () => {
        if (apiDlg && apiDlg.open) apiDlg.close();
        apiUnlock();
    };

    if (apiDlg && apiOpen) {
        apiDlg.addEventListener('close', apiUnlock);
        apiDlg.addEventListener('cancel', apiUnlock);   // Esc

        apiOpen.addEventListener('click', () => {
            // 開くたびに いまの 状態を 反映しなおす
            Object.keys(apiState).forEach((id) => {
                const el = document.getElementById(id);
                if (el) {
                    el.classList.remove('on', 'off');
                    el.classList.add(apiState[id] ? 'on' : 'off');
                }
            });
            apiLock();
            if (apiDlg.showModal) apiDlg.showModal();
            else apiDlg.setAttribute('open', '');
        });
        if (apiClose) apiClose.addEventListener('click', apiShut);
        // 外がわを 押しても とじる
        apiDlg.addEventListener('click', (e) => { if (e.target === apiDlg) apiShut(); });
    }

    /* ---------- そら（新宿の 本当の 天気） ---------- */

    const soraBox = document.getElementById('sora');

    if (soraBox) {
        // Open-Meteo は 0.0625度の 格子に まるめる ので、細かく 書いても 結果は 同じ
        const LAT = 35.7, LON = 139.7;
        const rnd = (a, b) => a + Math.random() * (b - a);

        // WMO の コードを 4つに まとめる
        const kindOf = (c) => {
            if ((c >= 71 && c <= 77) || c === 85 || c === 86) return 'snow';
            if ((c >= 51 && c <= 67) || (c >= 80 && c <= 82) || c >= 95) return 'rain';
            if ((c >= 45 && c <= 48) || (c >= 2 && c <= 3)) return 'cloudy';
            return 'clear';
        };
        const paint = (kind) => {
            soraBox.textContent = '';
            document.body.classList.remove('wx-snow', 'wx-rain', 'wx-cloudy', 'wx-clear');
            document.body.classList.add('wx-' + kind);
            if (calm) return;

            if (kind === 'rain') {
                for (let i = 0; i < 70; i++) {
                    const d = document.createElement('i');
                    d.className = 'drop';
                    d.style.left = rnd(-4, 104).toFixed(1) + 'vw';
                    d.style.height = rnd(28, 62).toFixed(0) + 'px';
                    d.style.animationDuration = rnd(0.6, 1.15).toFixed(2) + 's';
                    d.style.animationDelay = (-rnd(0, 1.2)).toFixed(2) + 's';
                    soraBox.appendChild(d);
                }
            } else if (kind === 'snow') {
                for (let i = 0; i < 60; i++) {
                    const f = document.createElement('i');
                    f.className = 'flake';
                    const s = rnd(2.5, 5.5).toFixed(1);
                    f.style.left = rnd(-4, 104).toFixed(1) + 'vw';
                    f.style.width = f.style.height = s + 'px';
                    f.style.opacity = rnd(0.35, 0.85).toFixed(2);
                    f.style.animationDuration = rnd(9, 18).toFixed(1) + 's';
                    f.style.animationDelay = (-rnd(0, 18)).toFixed(1) + 's';
                    soraBox.appendChild(f);
                    if (f.animate) {
                        // 大きい つぶは はやく まっすぐ、小さい つぶは おそく よく ゆれる
                        const d = (22 - s * 2.6) * rnd(0.85, 1.2), N = 40, fr = [];
                        const H = window.innerHeight * 1.16, A = rnd(10, 30) * (6 - s) / 3;
                        const k1 = Math.round(rnd(2, 4)), k2 = Math.round(rnd(5, 8));
                        const p1 = rnd(0, 6.283), p2 = rnd(0, 6.283), wd = rnd(-50, -5);
                        for (let q = 0; q <= N; q++) {
                            const u = q / N, a = u * 6.283;
                            const x = wd * u + A * (Math.sin(k1 * a + p1) - Math.sin(p1)) + A * 0.35 * (Math.sin(k2 * a + p2) - Math.sin(p2));
                            fr.push({ transform: 'translate3d(' + x.toFixed(1) + 'px,' + (H * u).toFixed(1) + 'px,0)' });
                        }
                        f.style.animation = 'none';
                        f.animate(fr, { duration: d * 1000, iterations: Infinity, easing: 'linear', delay: -rnd(0, d) * 1000 });
                    }
                }
            }
        };

        fetch('https://api.open-meteo.com/v1/forecast?latitude=' + LAT + '&longitude=' + LON +
              '&current=temperature_2m,weather_code,is_day&timezone=Asia%2FTokyo&forecast_days=1')
            .then((r) => r.json())
            .then((j) => {
                const c = j.current;
                if (!c) return;
                paint(kindOf(c.weather_code));
                mark('api-dot-meteo', true);

                // 自分で えらんでいない人 だけ、そとの 明るさに あわせる
                if (!saved) applyTheme(!c.is_day);
            })
            .catch(() => mark('api-dot-meteo', false));
    }

    /* ---------- よるの 雲 ---------- */

    const cloudBox = document.getElementById('clouds');

    if (cloudBox && !calm) {
        const rnd = (a, b) => a + Math.random() * (b - a);

        const gather = () => {
            if (cloudBox.childElementCount) return;
            const many = window.innerWidth < 720 ? 3 : 5;
            for (let i = 0; i < many; i++) {
                const el = document.createElement('div');
                el.className = 'cloud';
                const w = rnd(52, 94);
                const dur = rnd(150, 280);
                el.style.top = rnd(-8, 58).toFixed(1) + 'vh';
                el.style.setProperty('--w', w.toFixed(1) + 'vw');
                el.style.setProperty('--h', rnd(16, 34).toFixed(1) + 'vh');
                el.style.setProperty('--d', dur.toFixed(0) + 's');
                // はじめから ちらばって 見えるように 途中から 流す
                el.style.setProperty('--dl', (-rnd(0, dur)).toFixed(0) + 's');
                cloudBox.appendChild(el);
            }
        };

        const clear = () => { cloudBox.textContent = ''; };

        onThemeChange((dark) => { if (dark) gather(); else clear(); });
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

    /* ---------- ポインタが 近づくと 紙きれが 逃げる ---------- */

    // 指で さわる 画面では やらない。紙きれ自体 せまい画面では しまってある
    const fine = window.matchMedia &&
        window.matchMedia('(hover: hover) and (pointer: fine)').matches;

    if (!calm && fine) {
        // style.css で つけている かたむき。逃げる ときも これを 土台に する
        const TILT = {
            'scrap-ticket':  -7,
            'scrap-receipt':  5,
            'scrap-photo':    6,
            'scrap-memo':    -4,
            'scrap-stamp':   -9,
            'scrap-fold':     4
        };
        const REACH = 340;   // これより 遠いと なにも しない
        const PUSH  = 30;    // いちばん 近いとき 逃げる 長さ

        const papers = Object.keys(TILT)
            .map((cls) => ({ el: document.querySelector('.' + cls), deg: TILT[cls] }))
            .filter((p) => p.el);

        if (papers.length) {
            let px = -9999, py = -9999, waiting = false;

            const shove = () => {
                waiting = false;
                papers.forEach((p) => {
                    const b = p.el.getBoundingClientRect();
                    // せまい画面では しまわれている
                    if (!b.width) { p.el.style.removeProperty('transform'); return; }
                    const dx = b.left + b.width / 2 - px;
                    const dy = b.top + b.height / 2 - py;
                    const far = Math.hypot(dx, dy) || 1;
                    const near = Math.max(0, 1 - far / REACH);
                    const k = near * near;   // 近いほど ぐっと 効く
                    if (!k) { p.el.style.removeProperty('transform'); return; }
                    const deg = p.deg + k * (dx < 0 ? 4.5 : -4.5);
                    p.el.style.transform =
                        'rotate(' + deg.toFixed(2) + 'deg) translate(' +
                        (dx / far * k * PUSH).toFixed(1) + 'px, ' +
                        (dy / far * k * PUSH).toFixed(1) + 'px)';
                });
            };

            const aim = (e) => {
                px = e.clientX; py = e.clientY;
                if (waiting) return;
                waiting = true;
                requestAnimationFrame(shove);
            };

            const away = () => { px = -9999; py = -9999; shove(); };

            window.addEventListener('pointermove', aim, { passive: true });
            document.addEventListener('mouseleave', away);
            window.addEventListener('blur', away);
        }
    }

    /* ---------- 押すと 紙くずが 散る ---------- */

    // 視差効果の 低減を えらんでいる 人には なにも しない。
    // 置き場も 作らず、耳も 立てない
    if (!calm) {
        const fxLayer = document.createElement('div');
        fxLayer.className = 'fx-layer';
        fxLayer.setAttribute('aria-hidden', 'true');
        document.body.appendChild(fxLayer);

        // 押した ものごとに 散りかたを 変える。
        //   n 枚かず  size 大きさpx  spin まわる角度  far 飛ぶ長さpx
        const FX_KIND = {
            sticker: { n: 12, size: [4,  9], spin: 560, far: [36,  96] },
            link:    { n: 10, size: [3,  7], spin: 420, far: [30,  80] },
            scrap:   { n: 16, size: [4, 11], spin: 680, far: [44, 125] }
        };
        const FX_MAX = 140;   // 連打されても ふくれ上がらないように

        const fxRnd = (a, b) => a + Math.random() * (b - a);

        const scatter = (x, y, kind) => {
            const k = FX_KIND[kind];
            if (fxLayer.childElementCount + k.n > FX_MAX) return;

            for (let i = 0; i < k.n; i++) {
                const bit = document.createElement('i');
                bit.className = 'fx-bit';
                if (i % 3 === 0) bit.classList.add('is-ink');
                bit.style.width  = fxRnd(k.size[0], k.size[1]).toFixed(1) + 'px';
                bit.style.height = fxRnd(k.size[0], k.size[1]).toFixed(1) + 'px';
                bit.style.left = x + 'px';
                bit.style.top  = y + 'px';
                fxLayer.appendChild(bit);

                const ang = fxRnd(0, Math.PI * 2);
                const far = fxRnd(k.far[0], k.far[1]);
                const dx = Math.cos(ang) * far;
                // 上に 行くぶんを すこし 足して、落ちてくる かんじを 出す
                const dy = Math.sin(ang) * far - fxRnd(6, 26);
                const life = fxRnd(520, 880);

                // 勢いよく 出て、ゆっくり 止まる
                const fly = bit.animate([
                    { translate: '0 0', rotate: '0deg', scale: 1 },
                    { translate: dx.toFixed(1) + 'px ' + dy.toFixed(1) + 'px',
                      rotate: fxRnd(-k.spin, k.spin).toFixed(0) + 'deg', scale: 0.55 }
                ], { duration: life, easing: 'cubic-bezier(0.1, 0.78, 0.3, 1)' });

                // うすくなる ほうは 別の うごきに する。上の 曲線を 透明度にも
                // かけると、飛びはじめた とたんに 消える（道のりの 半分で
                // すでに 0.09 だった）。まっすぐ、しかも 後半まで 濃いまま
                bit.animate([
                    { opacity: 1, offset: 0 },
                    { opacity: 1, offset: 0.55 },
                    { opacity: 0, offset: 1 }
                ], { duration: life, easing: 'linear' });

                // 裏の タブなど、ブラウザが 絵を 描いていない あいだは
                // onfinish が 呼ばれない。放っておくと 紙くずが たまり
                // つづけるので、時間でも かならず 消す。
                // remove は 二度 呼んでも なにも 起きない
                const gone = () => bit.remove();
                fly.onfinish = gone;
                fly.oncancel = gone;
                setTimeout(gone, life + 400);
            }
        };

        document.addEventListener('click', (e) => {
            const t = e.target;
            if (!t || !t.closest) return;
            const hit = t.closest('.sticker, .scrap, .cuts a');
            if (!hit) return;

            const b = hit.getBoundingClientRect();
            if (!b.width || !b.height) return;   // せまい画面では しまってある

            const kind = hit.classList.contains('sticker') ? 'sticker'
                       : hit.classList.contains('scrap')   ? 'scrap' : 'link';

            // 画面の 外に はみ出している 紙きれは、見えている ところから 出す
            scatter(
                Math.min(Math.max(b.left + b.width  / 2, 8), window.innerWidth  - 8),
                Math.min(Math.max(b.top  + b.height / 2, 8), window.innerHeight - 8),
                kind
            );
        });
    }

    connect();
});

/* ============================================================
   あとから 足した もの（ねふだ・こうしんきろく・えんぴつ・かくしコマンド・うごきの 順番）
   ============================================================ */
(() => {
    'use strict';
    const $ = (s) => document.querySelector(s);
    const set = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
    const getJSON = (url) => fetch(url).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); });
    /* 日本時間の「いま」を、UTCの 入れ物に 入れて あつかう */
    const jst = (ms) => new Date((ms === undefined ? Date.now() : ms) + 9 * 3600000);

    /* 順番に 動かす ための 番号 */
    ['#me .checklist li', '#gohan .r-items li, #gohan .r-line', '#likes .sticker', '#links .cuts li']
        .forEach((sel) => document.querySelectorAll(sel).forEach((el, i) => el.style.setProperty('--i', i)));

    /* ねふだ（きょうの 1ドル） */
    if ($('#x-tag-yen')) {
        getJSON('https://api.frankfurter.dev/v1/latest?base=USD&symbols=JPY')
            .then((j) => {
                const yen = j.rates.JPY;
                set('x-tag-yen', yen.toFixed(1));
                set('x-tag-sub', 'うまい棒 やく ' + Math.floor(yen / 15) + 'ほん ぶん');
            })
            .catch(() => set('x-tag-sub', 'ねだんが わからない'));
    }

    /* こうしん きろく（GitHub。日付と 1行目 だけ 使う） */
    const rows = $('#x-lib-rows');
    if (rows) {
        getJSON('https://api.github.com/repos/poo0123/portfolio/commits?per_page=5')
            .then((list) => {
                rows.textContent = '';
                list.forEach((c, i) => {
                    const d = jst(new Date(c.commit.committer.date).getTime());
                    const li = document.createElement('li');
                    const time = document.createElement('time');
                    time.textContent = (d.getUTCMonth() + 1) + '/' + d.getUTCDate();
                    time.style.setProperty('--i', i);
                    time.style.setProperty('--tr', [-3, 2, -1.5, 3, -2][i % 5] + 'deg');
                    const span = document.createElement('span');
                    span.textContent = String(c.commit.message).split('\n')[0];
                    li.append(time, span);
                    rows.appendChild(li);
                });
            })
            .catch(() => { rows.textContent = ''; const li = document.createElement('li'); li.textContent = 'きろくが よめなかった。'; rows.appendChild(li); });
    }

    /* ことしの えんぴつ */
    const year = $('.x-year');
    if (year) {
        const now = jst();
        const y = now.getUTCFullYear();
        const start = Date.UTC(y, 0, 1), end = Date.UTC(y + 1, 0, 1);
        const left = (end - now.getTime()) / (end - start);
        year.style.setProperty('--left', (left * 88).toFixed(1) + '%');
        const p = $('#x-year-text');
        const b = document.createElement('b');
        b.textContent = Math.ceil((end - now.getTime()) / 86400000);
        p.textContent = '';
        p.append(y + '年は あと ', b, ' にち。えんぴつ のこり ' + Math.round(left * 100) + '%。');
    }

    /* かくし コマンド（unko と 打つ か、サインを 5かい タップ） */
    const layer = $('#x-rain');
    if (layer) {
        const rain = () => {
            if (layer.childElementCount > 60) return;
            for (let i = 0; i < 26; i++) {
                const s = document.createElement('span');
                s.textContent = '💩';
                s.style.left = (Math.random() * 96) + '%';
                s.style.fontSize = (18 + Math.random() * 22) + 'px';
                layer.appendChild(s);
                const dur = 1700 + Math.random() * 1500, delay = Math.random() * 900;
                try {
                    s.animate(
                        [{ transform: 'translateY(0) rotate(0deg)' }, { transform: 'translateY(' + (window.innerHeight + 90) + 'px) rotate(' + (Math.random() * 720 - 360) + 'deg)' }],
                        { duration: dur, delay: delay, easing: 'cubic-bezier(0.4, 0, 0.9, 0.6)', fill: 'both' }
                    );
                } catch (e) { /* 動かなくても 下の そうじで 消える */ }
                setTimeout(() => s.remove(), dur + delay + 80);
            }
        };
        let buf = '';
        document.addEventListener('keydown', (e) => {
            if (!e.key || e.key.length !== 1 || /^(INPUT|TEXTAREA)$/.test((e.target && e.target.tagName) || '')) return;
            buf = (buf + e.key.toLowerCase()).slice(-4);
            if (buf === 'unko') { buf = ''; rain(); }
        });
        const sign = $('.colophon .sign');
        if (sign) {
            let taps = 0, timer = 0;
            sign.addEventListener('click', () => {
                taps++; clearTimeout(timer);
                timer = setTimeout(() => { taps = 0; }, 1600);
                if (taps >= 5) { taps = 0; rain(); }
            });
        }
    }
})();
