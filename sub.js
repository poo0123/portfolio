/* サブページの うごき：ひる/よる、アカウントの 情報を とってきて 埋める。
   とれなくても、HTML に 書いてある ぶんだけで 読める ように してある。 */
(function () {
    'use strict';
    const body = document.body;

    /* ---------- ひる / よる（メインと おなじ 保存を 使う） ---------- */
    const btn = document.getElementById('theme-toggle');
    const apply = (dark) => {
        body.classList.toggle('dark-mode', dark);
        body.classList.toggle('light-mode', !dark);
        if (btn) btn.textContent = dark ? 'ひる' : 'よる';
        const m = document.querySelector('meta[name="theme-color"]');
        if (m) m.setAttribute('content', dark ? '#070b1c' : '#dc6969');
    };
    let saved = null;
    try { saved = localStorage.getItem('poo-theme'); } catch (e) {}
    apply(saved ? saved === 'dark' : !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches));
    if (btn) btn.addEventListener('click', () => {
        const dark = !body.classList.contains('dark-mode');
        apply(dark);
        try { localStorage.setItem('poo-theme', dark ? 'dark' : 'light'); } catch (e) {}
    });

    /* ---------- 部品（アカウントごとの 枠の 中だけを さわる） ---------- */
    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
    const num = (n) => (typeof n === 'number' ? n.toLocaleString('ja-JP') : String(n));
    const jget = (url) => fetch(url).then((r) => (r.ok ? r.json() : Promise.reject(r.status)));
    const ymd = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric' }); };
    const ym = (iso) => { const d = new Date(iso); return isNaN(d) ? null : d.getFullYear() + '年' + (d.getMonth() + 1) + '月'; };
    const row = (date, text, href, tail) => {
        const li = el('li'); li.appendChild(el('time', '', date));
        if (href) { const a = el('a', '', text); a.href = href; a.target = '_blank'; a.rel = 'noopener'; li.appendChild(a); } else li.appendChild(el('span', '', text));
        if (tail) li.appendChild(el('small', '', tail));
        return li;
    };
    const scope = (name) => {
        const root = document.querySelector('.acct[data-s="' + name + '"]');
        if (!root) return null;
        const k = (key) => root.querySelector('[data-k="' + key + '"]');
        return {
            k,
            show: (key) => { const e = k(key); if (e) e.hidden = false; return e; },
            text: (key, t) => { const e = k(key); if (e && t) e.textContent = t; },
            img: (key, src) => { const e = k(key); if (e && src) { e.src = src; e.hidden = false; } },
            banner: (url) => { const b = k('banner'); if (b && url) { b.style.backgroundImage = 'url("' + url + '")'; b.classList.add('has-img'); } },
            bio: (t) => { const b = k('bio'); if (!b || !t) return; b.textContent = ''; b.appendChild(el('small', '', 'プロフィールの 文')); b.appendChild(document.createTextNode(t)); b.hidden = false; },
            nums: (pairs) => {
                const box = k('nums'); if (!box) return;
                box.textContent = '';
                pairs.forEach((p) => { if (p[1] == null) return; const d = el('div'); d.appendChild(el('b', '', num(p[1]))); d.appendChild(el('span', '', p[0])); box.appendChild(d); });
                if (box.childElementCount) { const w = k('data'); if (w) w.hidden = false; }
            }
        };
    };

    /* ---------- Discord と Spotify（Lanyard を 1回だけ 読む） ---------- */
    const DID = '339360580886593536';
    const STATE = { online: 'オンライン', idle: 'りせき中', dnd: 'とりこみ中', offline: 'オフライン' };
    const sD = scope('discord'), sS = scope('spotify');
    if (sD || sS) jget('https://api.lanyard.rest/v1/users/' + DID).then((j) => {
        const d = j.data || {}, u = d.discord_user || {};
        if (sD) {
            if (u.avatar) sD.img('ava', 'https://cdn.discordapp.com/avatars/' + DID + '/' + u.avatar + '.webp?size=256');
            const deco = u.avatar_decoration_data;
            if (deco && deco.asset) sD.img('ring', 'https://cdn.discordapp.com/avatar-decoration-presets/' + deco.asset + '.png?size=240&passthrough=true');
            sD.text('name', u.display_name || u.global_name || u.username);
            const dot = sD.show('dot'); if (dot) dot.className = 'pf-dot ' + (d.discord_status || 'offline');
            const pg = u.primary_guild, hasTag = pg && pg.identity_enabled && pg.tag;
            if (hasTag) {
                sD.text('tag-name', pg.tag);
                if (pg.badge && pg.identity_guild_id) sD.img('tag-img', 'https://cdn.discordapp.com/guild-tag-badges/' + pg.identity_guild_id + '/' + pg.badge + '.png?size=32');
                sD.show('tag');
            }
            const np = u.collectibles && u.collectibles.nameplate, rowEl = sD.k('row');
            if (np && np.asset && rowEl) { rowEl.style.backgroundImage = 'url("https://cdn.discordapp.com/assets/collectibles/' + np.asset + 'static.png")'; rowEl.classList.add('has-plate'); }
            sD.text('status', STATE[d.discord_status] || '');
            const acts = d.activities || [], custom = acts.find((a) => a.type === 4), list = sD.k('list');
            if (list) {
                list.textContent = '';
                list.appendChild(row('いま', STATE[d.discord_status] || 'わからない'));
                // サーバー絵文字は 名前しか 来ないので 出さない
                const uni = custom && custom.emoji && !custom.emoji.id ? custom.emoji.name : '';
                if (custom && (custom.state || uni)) list.appendChild(row('ひとこと', ((uni ? uni + ' ' : '') + (custom.state || '')).trim()));
                acts.filter((a) => a.type !== 4).forEach((a) => {
                    const kind = a.type === 2 ? 'きいてる' : a.type === 3 ? 'みてる' : 'やってる';
                    list.appendChild(row(kind, a.name + (a.details ? '｜' + a.details : '') + (a.type === 2 && a.state ? '｜' + a.state : '')));
                });
                if (hasTag) list.appendChild(row('タグ', pg.tag));
                sD.show('data');
            }
        }
        if (sS) {
            const sp = d.spotify, box = sS.k('now');
            if (box) {
                box.textContent = '';
                if (sp && sp.song) {
                    if (sp.album_art_url) { const im = el('img'); im.src = sp.album_art_url; im.alt = ''; box.appendChild(im); }
                    const t = el('div'); t.appendChild(el('b', '', sp.song)); t.appendChild(el('span', 'sub-note', sp.artist || '')); box.appendChild(t);
                } else box.appendChild(el('p', 'sub-note', 'いまは なにも きいて いない。'));
                sS.show('data');
            }
        }
    }).catch(() => {});

    /* ---------- X・YouTube・Steam（サイトの サーバーが とってきた もの） ---------- */
    const sX = scope('x');
    if (sX) jget('/api/card/x').then((d) => {
        sX.img('ava', d.avatar); sX.banner(d.banner); sX.text('name', d.name); sX.bio(d.bio);
        sX.nums([['ポスト', d.posts], ['フォロー', d.following], ['フォロワー', d.followers], ['いいね', d.likes]]);
        if (d.joined && ym(d.joined)) sX.text('note', ym(d.joined) + ' から');
    }).catch(() => {});

    const sY = scope('youtube');
    if (sY) jget('/api/card/youtube').then((d) => {
        sY.img('ava', d.avatar); sY.text('name', d.name); sY.bio(d.bio);
        const list = sY.k('list');
        if (list && d.videos && d.videos.length) {
            list.textContent = '';
            d.videos.forEach((v) => list.appendChild(row(ymd(v.date), v.title, 'https://www.youtube.com/watch?v=' + encodeURIComponent(v.id))));
            sY.show('data');
        }
    }).catch(() => {});

    const sT = scope('steam');
    if (sT) jget('/api/card/steam').then((d) => {
        sT.img('ava', d.avatar); sT.text('name', d.name);
        const on = d.state === 'online' || d.state === 'in-game';
        const dot = sT.show('dot'); if (dot) dot.className = 'pf-dot ' + (on ? 'online' : 'offline');
        sT.text('status', d.state === 'in-game' ? 'ゲーム中' : on ? 'オンライン' : 'オフライン');
    }).catch(() => {});

    /* ---------- GitHub ---------- */
    const sG = scope('github');
    if (sG) {
        jget('https://api.github.com/users/poo0123').then((u) => {
            sG.img('ava', u.avatar_url); sG.text('name', u.name || u.login); sG.bio(u.bio);
            sG.nums([['リポジトリ', u.public_repos], ['フォロワー', u.followers]]);
            if (u.created_at) sG.text('note', ym(u.created_at) + ' から');
        }).catch(() => {});
        jget('https://api.github.com/repos/poo0123/portfolio/commits?per_page=20').then((cs) => {
            const list = sG.k('list'); if (!list || !cs.length) return;
            list.textContent = '';
            // 日づけと 1行目だけ。作者の 名前や メールは 使わない
            cs.forEach((c) => list.appendChild(row(ymd(c.commit.committer.date), String(c.commit.message || '').split('\n')[0], c.html_url)));
            sG.show('data3');
        }).catch(() => {});
        jget('https://api.github.com/users/poo0123/repos?sort=updated&per_page=10').then((rs) => {
            const list = sG.k('list2'); if (!list || !rs.length) return;
            list.textContent = '';
            rs.forEach((r) => list.appendChild(row(ymd(r.pushed_at || r.updated_at), r.name + (r.description ? '：' + r.description : ''), r.html_url, r.language || '')));
            sG.show('data2');
        }).catch(() => {});
    }

    /* ---------- 数だけ 送る（押された りんく・ひる/よる） ---------- */
    if (!navigator.webdriver && navigator.sendBeacon) {
        const send = (k, v) => { try { navigator.sendBeacon('/b', new Blob([JSON.stringify({ k: k, v: v })], { type: 'text/plain' })); } catch (e) {} };
        document.addEventListener('click', (e) => {
            const a = e.target.closest ? e.target.closest('a[href]') : null;
            if (!a) return;
            const h = a.getAttribute('href') || '';
            if (!/^(https?:|mailto:)/.test(h)) return;
            let name = a.dataset.name || '';
            if (!name) { if (h.indexOf('mailto:') === 0) name = 'メール'; else { try { name = new URL(h).hostname.replace(/^www\./, ''); } catch (err) { return; } } }
            send('click', name);
        }, true);
        setTimeout(() => send('theme', body.classList.contains('dark-mode') ? 1 : 0), 1500);
    }
})();
