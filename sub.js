/* サブページの うごき：ひる/よる、アカウントの 情報を とってきて 埋める。
   とれなくても、HTML に 書いてある ぶんだけで 読める ように してある。 */
(function () {
    'use strict';
    const $ = (id) => document.getElementById(id);
    const body = document.body;
    const S = body.dataset.s || '';

    /* ---------- ひる / よる（メインと おなじ 保存を 使う） ---------- */
    const btn = $('theme-toggle');
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

    /* ---------- 部品 ---------- */
    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
    const show = (id) => { const e = $(id); if (e) e.hidden = false; return e; };
    const setText = (id, t) => { const e = $(id); if (e && t) e.textContent = t; };
    const setImg = (id, src) => { const e = $(id); if (e && src) { e.src = src; e.hidden = false; } };
    const num = (n) => (typeof n === 'number' ? n.toLocaleString('ja-JP') : String(n));
    const nums = (pairs) => {
        const box = $('sub-nums'); if (!box) return;
        box.textContent = '';
        pairs.forEach((p) => { if (p[1] == null) return; const d = el('div'); d.appendChild(el('b', '', num(p[1]))); d.appendChild(el('span', '', p[0])); box.appendChild(d); });
        if (box.childElementCount) show('sub-data');
    };
    const bio = (t) => { if (!t) return; const b = $('sub-bio'); if (!b) return; b.textContent = ''; b.appendChild(el('small', '', 'プロフィールの 文')); b.appendChild(document.createTextNode(t)); b.hidden = false; };
    const banner = (url) => { const b = $('pf-banner'); if (b && url) { b.style.backgroundImage = 'url("' + url + '")'; b.classList.add('has-img'); } };
    const jget = (url) => fetch(url).then((r) => (r.ok ? r.json() : Promise.reject(r.status)));
    const ymd = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric' }); };
    const ym = (iso) => { const d = new Date(iso); return isNaN(d) ? null : d.getFullYear() + '年' + (d.getMonth() + 1) + '月'; };
    const row = (date, text, href, tail) => {
        const li = el('li'); li.appendChild(el('time', '', date));
        if (href) { const a = el('a', '', text); a.href = href; a.target = '_blank'; a.rel = 'noopener'; li.appendChild(a); } else li.appendChild(el('span', '', text));
        if (tail) li.appendChild(el('small', '', tail));
        return li;
    };

    /* ---------- Discord（Lanyard） ---------- */
    const DID = '339360580886593536';
    const STATE = { online: 'オンライン', idle: 'りせき中', dnd: 'とりこみ中', offline: 'オフライン' };
    function discord(d) {
        const u = d.discord_user || {};
        if (u.avatar) setImg('pf-ava', 'https://cdn.discordapp.com/avatars/' + DID + '/' + u.avatar + '.webp?size=256');
        const deco = u.avatar_decoration_data;
        if (deco && deco.asset) setImg('pf-ring', 'https://cdn.discordapp.com/avatar-decoration-presets/' + deco.asset + '.png?size=240&passthrough=true');
        setText('pf-name', u.display_name || u.global_name || u.username);
        const dot = show('pf-dot'); if (dot) dot.className = 'pf-dot ' + (d.discord_status || 'offline');
        const pg = u.primary_guild;
        if (pg && pg.identity_enabled && pg.tag) {
            setText('pf-tag-name', pg.tag);
            if (pg.badge && pg.identity_guild_id) setImg('pf-tag-img', 'https://cdn.discordapp.com/guild-tag-badges/' + pg.identity_guild_id + '/' + pg.badge + '.png?size=32');
            show('pf-tag');
        }
        const np = u.collectibles && u.collectibles.nameplate;
        const rowEl = $('pf-row');
        if (np && np.asset && rowEl) { rowEl.style.backgroundImage = 'url("https://cdn.discordapp.com/assets/collectibles/' + np.asset + 'static.png")'; rowEl.classList.add('has-plate'); }
        const acts = d.activities || [];
        const custom = acts.find((a) => a.type === 4);
        setText('pf-status', STATE[d.discord_status] || '');
        const list = $('sub-list');
        if (list) {
            list.textContent = '';
            list.appendChild(row('いま', STATE[d.discord_status] || 'わからない'));
            if (custom && (custom.state || (custom.emoji && custom.emoji.name))) list.appendChild(row('ひとこと', custom.state || custom.emoji.name));
            acts.filter((a) => a.type !== 4).forEach((a) => {
                const kind = a.type === 2 ? 'きいてる' : a.type === 3 ? 'みてる' : 'やってる';
                list.appendChild(row(kind, a.name + (a.details ? '｜' + a.details : '') + (a.type === 2 && a.state ? '｜' + a.state : '')));
            });
            if (pg && pg.identity_enabled && pg.tag) list.appendChild(row('タグ', pg.tag));
            show('sub-data');
        }
    }

    /* ---------- それぞれ ---------- */
    const RUN = {
        discord: () => jget('https://api.lanyard.rest/v1/users/' + DID).then((j) => discord(j.data)),
        x: () => jget('/api/card/x').then((d) => {
            setImg('pf-ava', d.avatar); banner(d.banner); setText('pf-name', d.name); bio(d.bio);
            nums([['ポスト', d.posts], ['フォロー', d.following], ['フォロワー', d.followers], ['いいね', d.likes]]);
            if (d.joined) setText('sub-data-note', ym(d.joined) + ' から');
        }),
        youtube: () => jget('/api/card/youtube').then((d) => {
            setImg('pf-ava', d.avatar); setText('pf-name', d.name); bio(d.bio);
            const list = $('sub-list');
            if (list && d.videos && d.videos.length) {
                list.textContent = '';
                d.videos.forEach((v) => list.appendChild(row(ymd(v.date), v.title, 'https://www.youtube.com/watch?v=' + encodeURIComponent(v.id))));
                show('sub-data');
            }
        }),
        steam: () => jget('/api/card/steam').then((d) => {
            setImg('pf-ava', d.avatar); setText('pf-name', d.name);
            const on = d.state === 'online' || d.state === 'in-game';
            const dot = show('pf-dot'); if (dot) dot.className = 'pf-dot ' + (on ? 'online' : 'offline');
            setText('pf-status', d.state === 'in-game' ? 'ゲーム中' : on ? 'オンライン' : 'オフライン');
        }),
        github: () => Promise.all([
            jget('https://api.github.com/users/poo0123').then((u) => {
                setImg('pf-ava', u.avatar_url); setText('pf-name', u.name || u.login); bio(u.bio);
                nums([['リポジトリ', u.public_repos], ['フォロワー', u.followers]]);
                if (u.created_at) setText('sub-data-note', ym(u.created_at) + ' から');
            }),
            jget('https://api.github.com/users/poo0123/repos?sort=updated&per_page=10').then((rs) => {
                const list = $('sub-list2'); if (!list || !rs.length) return;
                list.textContent = '';
                rs.forEach((r) => list.appendChild(row(ymd(r.pushed_at || r.updated_at), r.name + (r.description ? '：' + r.description : ''), r.html_url, r.language || '')));
                show('sub-data2');
            }),
            jget('https://api.github.com/repos/poo0123/portfolio/commits?per_page=20').then((cs) => {
                const list = $('sub-list'); if (!list || !cs.length) return;
                list.textContent = '';
                // 日づけと 1行目だけ。作者の 名前や メールは 使わない
                cs.forEach((c) => list.appendChild(row(ymd(c.commit.committer.date), String(c.commit.message || '').split('\n')[0], c.html_url)));
                show('sub-data3');
            })
        ]),
        spotify: () => jget('https://api.lanyard.rest/v1/users/' + DID).then((j) => {
            const sp = j.data && j.data.spotify, box = $('sub-now');
            if (!box) return;
            box.textContent = '';
            if (sp && sp.song) {
                if (sp.album_art_url) { const im = el('img'); im.src = sp.album_art_url; im.alt = ''; box.appendChild(im); }
                const t = el('div'); const b = el('b', '', sp.song); t.appendChild(b); t.appendChild(el('span', 'sub-note', sp.artist || '')); box.appendChild(t);
            } else box.appendChild(el('p', 'sub-note', 'いまは なにも きいて いない。'));
            show('sub-data');
        })
    };
    if (RUN[S]) RUN[S]().catch(() => {});

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
