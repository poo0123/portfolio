// poo123.com の 入口。
// 静的ファイルは そのまま 返し、http で 来たときだけ https に ふりかえる。
// 中身は assets（リポジトリの ファイル）が 持っている。
//
// ついでに「どの ページが いつ 何回 見られたか」だけを D1 に 数える。
// IP・ブラウザの くわしい 名前・ひとりひとりの 足どりは 残さない（数の 足し算だけ）。
// 見るための ページ（/kiroku）は、あいことば（ADMIN_KEY。ここには 書かない）を
// 知っている 人だけ。あいことばが 未設定なら ページごと 無い ことに する。

const ADMIN = '/kiroku';
const BOT = /bot|crawl|spider|slurp|preview|fetch|curl|wget|python|monitor|headless|lighthouse|facebookexternalhit|embed|scan|http/i;
const MAX_FAILS = 8;            // 1時間に まちがえて いい 回数（全員ぶん 合わせて）

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const enc = new TextEncoder();
const sha = async (s) => hex(await crypto.subtle.digest('SHA-256', enc.encode(s)));
const hmac = async (key, msg) => {
    const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    return hex(await crypto.subtle.sign('HMAC', k, enc.encode(msg)));
};
// 長さの そろった 文字列を、かかる 時間で ばれない ように くらべる
const same = (a, b) => {
    if (a.length !== b.length) return false;
    let d = 0;
    for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return d === 0;
};
const jst = (ms = Date.now()) => {
    const t = new Date(ms + 9 * 3600e3);
    return { day: t.toISOString().slice(0, 10), hour: t.getUTCHours() };
};
const cookie = (req, name) => {
    const m = (req.headers.get('Cookie') || '').match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
    return m ? m[1] : '';
};
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function authed(req, env) {
    if (!env.ADMIN_KEY) return false;
    const [exp, sig] = cookie(req, 'kiroku').split('.');
    if (!exp || !sig || !(Number(exp) > Date.now())) return false;
    return same(sig, await hmac(env.ADMIN_KEY, 'kiroku:' + exp));
}

/* ---------- かぞえる ---------- */
// どれも「種類」に まるめてから 数える。もとの 文字列は 残さない
const BOTS = [
    ['Googlebot', /googlebot|google-inspectiontool|googleother/i], ['Bingbot', /bingbot|bingpreview/i],
    ['GPTBot / ChatGPT', /gptbot|oai-searchbot|chatgpt/i], ['ClaudeBot', /claudebot|claude-web|anthropic/i],
    ['PerplexityBot', /perplexity/i], ['Applebot', /applebot/i], ['Yandex', /yandex/i], ['Baidu', /baidu/i],
    ['Bytespider', /bytespider/i], ['Ahrefs', /ahrefs/i], ['Semrush', /semrush/i], ['DuckDuckBot', /duckduck/i],
    ['Discord（リンクプレビュー）', /discordbot/i], ['X（リンクプレビュー）', /twitterbot/i], ['Facebook', /facebook/i],
    ['Slack', /slack/i], ['LINE', /line-poker|linespider/i], ['Cloudflare', /cloudflare/i],
    ['スクリプト（curl など）', /curl|wget|python|go-http|node|axios|okhttp|java|libwww|ruby/i]
];
const botName = (ua) => { if (!ua) return 'UA なし'; const b = BOTS.find((x) => x[1].test(ua)); return b ? b[0] : 'その他のボット'; };
const browserOf = (ua) => /Line\//i.test(ua) ? 'LINE アプリ内' : /Instagram/i.test(ua) ? 'Instagram アプリ内' : /Discord/i.test(ua) ? 'Discord アプリ内'
    : /Edg/i.test(ua) ? 'Edge' : /OPR|Opera/i.test(ua) ? 'Opera' : /Firefox|FxiOS/i.test(ua) ? 'Firefox'
    : /Chrome|CriOS/i.test(ua) ? 'Chrome' : /Safari/i.test(ua) ? 'Safari' : 'その他';
const osOf = (ua) => /Windows/i.test(ua) ? 'Windows' : /Android/i.test(ua) ? 'Android' : /iPhone|iPad|iPod/i.test(ua) ? 'iOS'
    : /Mac OS X|Macintosh/i.test(ua) ? 'macOS' : /CrOS/i.test(ua) ? 'ChromeOS' : /Linux/i.test(ua) ? 'Linux' : 'その他';

async function count(request, env, url, status) {
    try {
        const ua = request.headers.get('User-Agent') || '';
        const bot = !ua || BOT.test(ua);
        const { day, hour } = jst();
        const st = [];
        const dim = (kind, k) => st.push(env.LOG.prepare(
            'INSERT INTO dims (day, kind, k, n) VALUES (?, ?, ?, 1) ON CONFLICT (day, kind, k) DO UPDATE SET n = n + 1'
        ).bind(day, kind, String(k).slice(0, 80)));

        if (bot) dim('bot', botName(ua));
        if (status === 404 && !url.pathname.startsWith('/cdn-cgi/')) dim('nf', url.pathname);
        if (bot || status === 404) { await env.LOG.batch(st); return; }

        if (/prefetch|prerender/i.test(request.headers.get('Sec-Purpose') || request.headers.get('Purpose') || '')) return;
        if (await authed(request, env)) return;             // じぶんは 数えない

        const path = url.pathname.replace(/\/index(\.html)?$/, '/').replace(/\.html$/, '').slice(0, 80) || '/';
        let ref = '';
        try {
            const r = new URL(request.headers.get('Referer') || '');
            if (r.hostname !== url.hostname) ref = r.hostname.slice(0, 60);
        } catch (e) {}
        const cf = request.cf || {};
        const country = cf.country || '';
        const device = /Mobi|Android|iPhone|iPad/i.test(ua) ? 'sp' : 'pc';
        st.push(env.LOG.prepare(
            'INSERT INTO hits (day, hour, path, ref, country, device, n) VALUES (?, ?, ?, ?, ?, ?, 1) ' +
            'ON CONFLICT (day, hour, path, ref, country, device) DO UPDATE SET n = n + 1'
        ).bind(day, hour, path, ref, country, device));
        dim('browser', browserOf(ua));
        dim('os', osOf(ua));
        if (country === 'JP' && cf.region) dim('region', cf.region);
        const lang = (request.headers.get('Accept-Language') || '').split(',')[0].trim().slice(0, 12);
        if (/^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(lang)) dim('lang', lang);
        if (cf.asOrganization) dim('isp', cf.asOrganization);
        await env.LOG.batch(st);
    } catch (e) { /* 数えそこねても ページは 返す */ }
}

/* ---------- アカウントの 表示用：よその 公開プロフィールを とってきて、要る ものだけ 返す ----------
   名前・アイコン・自己紹介・数 だけ。本名や 場所の 欄は 読まない。15分 おぼえて おく。 */
const UA_FETCH = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const img = (u, hosts) => { try { const x = new URL(u); return x.protocol === 'https:' && hosts.some((h) => x.hostname === h || x.hostname.endsWith('.' + h)) ? x.toString() : null; } catch (e) { return null; } };
const txt = (s, n) => (typeof s === 'string' ? s.replace(/<[^>]*>/g, '').slice(0, n) : null);
const unx = (s) => (s || '').replace(/<!\[CDATA\[(.*?)\]\]>/s, '$1').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const CARDS = {
    x: async () => {
        const r = await fetch('https://api.fxtwitter.com/_poo_main', { headers: { 'User-Agent': UA_FETCH } });
        const u = (await r.json()).user || {};
        const n = (v) => (Number.isFinite(v) ? v : null);
        return { name: txt(u.name, 60), bio: txt(u.description, 300), avatar: img((u.avatar_url || '').replace('_normal.', '_400x400.'), ['twimg.com']),
            banner: u.banner_url ? img(u.banner_url + '/1500x500', ['twimg.com']) : null,
            posts: n(u.tweets), following: n(u.following), followers: n(u.followers), likes: n(u.likes), joined: txt(u.joined, 40) };
    },
    steam: async () => {
        const x = await (await fetch('https://steamcommunity.com/id/Poo0123/?xml=1', { headers: { 'User-Agent': UA_FETCH } })).text();
        const g = (t) => { const m = x.match(new RegExp('<' + t + '>([\\s\\S]*?)</' + t + '>')); return m ? unx(m[1]) : ''; };
        return { name: txt(g('steamID'), 60), state: ['online', 'offline', 'in-game'].includes(g('onlineState')) ? g('onlineState') : 'offline',
            avatar: img(g('avatarFull'), ['steamstatic.com']) };
    },
    discord: async () => {
        const d = await (await fetch('https://dcdn.dstn.to/profile/339360580886593536', { headers: { 'User-Agent': UA_FETCH } })).json();
        const u = d.user || {}, p = d.user_profile || {}, b = p.banner || u.banner;
        const ok = typeof b === 'string' && /^(a_)?[0-9a-f]{32}$/.test(b);
        return { banner: ok ? 'https://cdn.discordapp.com/banners/339360580886593536/' + b + (b.indexOf('a_') === 0 ? '.gif' : '.png') + '?size=600' : null,
            color: /^#[0-9a-f]{6}$/i.test(u.banner_color || '') ? u.banner_color : null, bio: txt(p.bio || u.bio, 300) };
    },
    youtube: async () => {
        const h = await (await fetch('https://www.youtube.com/@Poo_main', { headers: { 'User-Agent': UA_FETCH, 'Accept-Language': 'ja' } })).text();
        const og = (p) => { const m = h.match(new RegExp('<meta property="og:' + p + '" content="([^"]*)"')); return m ? unx(m[1]) : ''; };
        const cid = (h.match(/channel\/(UC[\w-]{22})/) || [])[1];
        let videos = [];
        if (cid) {
            const f = await (await fetch('https://www.youtube.com/feeds/videos.xml?channel_id=' + cid)).text();
            videos = [...f.matchAll(/<entry>[\s\S]*?<yt:videoId>([\w-]{6,20})<\/yt:videoId>[\s\S]*?<title>([\s\S]*?)<\/title>[\s\S]*?<published>([^<]+)<\/published>/g)]
                .slice(0, 8).map((m) => ({ id: m[1], title: txt(unx(m[2]), 120), date: txt(m[3], 40) }));
        }
        const bn = (h.match(/https:\/\/yt3\.googleusercontent\.com\/[A-Za-z0-9_-]+=w\d+[^"\ ]*/) || [])[0];
        return { name: txt(og('title'), 60), bio: txt(og('description'), 300), avatar: img(og('image'), ['googleusercontent.com', 'ggpht.com']),
            banner: bn ? img(bn.replace(/=w\d+/, '=w1707'), ['googleusercontent.com']) : null, videos };
    }
};
async function profile(name, request, ctx) {
    const json = (data, age) => new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=' + age, 'X-Content-Type-Options': 'nosniff' } });
    if (!CARDS[name] || request.method !== 'GET') return json({}, 60);
    const key = new Request('https://poo123.com/api/card/' + name);
    const cache = caches.default;
    const hit = await cache.match(key);
    if (hit) return hit;
    let res;
    try { res = json(await CARDS[name](), 900); } catch (e) { res = json({}, 60); }
    ctx.waitUntil(cache.put(key, res.clone()));
    return res;
}

/* ---------- ページの 中での 動き ----------
   サイト側から「何が 起きたか」だけが 送られてくる。決まった 種類しか 受けとらない。 */
const STAY = ['10秒未満', '10〜30秒', '30秒〜1分', '1〜3分', '3〜10分', '10分以上'];
const REACH = ['25%まで', '25〜50%', '50〜75%', '75%以上'];
const THEME = ['ひる（ライト）', 'よる（ダーク）'];
const EVENTS = { click: null, egg: null, stay: STAY, scroll: REACH, theme: THEME };
async function beacon(request, env, url) {
    const done = new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
    try {
        const ua = request.headers.get('User-Agent') || '';
        if (!ua || BOT.test(ua)) return done;
        let origin = '';
        try { origin = new URL(request.headers.get('Origin') || '').host; } catch (e) {}
        if (origin !== url.host) return done;
        if (await authed(request, env)) return done;
        const text = (await request.text()).slice(0, 300);
        const d = JSON.parse(text);
        const list = EVENTS[d.k];
        if (list === undefined) return done;
        let v = list ? list[Number(d.v)] : String(d.v || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 60);
        if (!v) return done;
        await env.LOG.prepare('INSERT INTO dims (day, kind, k, n) VALUES (?, ?, ?, 1) ON CONFLICT (day, kind, k) DO UPDATE SET n = n + 1')
            .bind(jst().day, 'ev_' + d.k, v).run();
    } catch (e) {}
    return done;
}

/* ---------- 見る ---------- */
const HEAD = {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Robots-Tag': 'noindex, nofollow, noarchive',
    'Referrer-Policy': 'same-origin',
    'X-Frame-Options': 'DENY'
};
const CSS =
    ':root{--bg:#f4efe3;--panel:#fbf8f0;--sub:#eae2d2;--ink:#2f2823;--ink2:#6b5f52;--rule:#d9cfbc;--red:#dc6969;--blue:#3f5d9e;--hm:220,105,105}' +
    ':root[data-theme=dark]{--bg:#070b1c;--panel:#131c3c;--sub:#0e1530;--ink:#e3ebff;--ink2:#98a6d4;--rule:#2a3566;--red:#ff96a8;--blue:#8fb5ff;--hm:255,150,168}' +
    '*{box-sizing:border-box;margin:0;padding:0}' +
    'body{background:var(--bg);color:var(--ink);font:14px/1.6 system-ui,-apple-system,"Segoe UI","Hiragino Sans","Yu Gothic UI",Meiryo,sans-serif;-webkit-text-size-adjust:100%}' +
    'a{color:inherit}' +
    '.app{display:grid;grid-template-columns:208px minmax(0,1fr);min-height:100vh}' +
    '.side{background:var(--panel);border-right:1px solid var(--rule);padding:18px 12px;position:sticky;top:0;height:100vh;overflow-y:auto;display:flex;flex-direction:column;gap:2px}' +
    '.brand{font-size:15px;font-weight:700;padding:0 10px 2px}.brand+small{padding:0 10px 14px;color:var(--ink2);font-size:11px;display:block}' +
    '.side a{display:block;padding:8px 10px;border-radius:7px;text-decoration:none;font-size:13px;color:var(--ink2)}' +
    '.side a:hover{background:var(--sub);color:var(--ink)}.side a.on{background:var(--red);color:#fff;font-weight:700}' +
    '.side hr{border:0;border-top:1px solid var(--rule);margin:10px 4px}.side .sp{flex:1}' +
    '.main{padding:20px 24px 40px;min-width:0}' +
    '.head{position:sticky;top:0;z-index:4;display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin:-20px -24px 16px;padding:16px 24px;background:var(--bg);border-bottom:1px solid transparent;transition:padding .2s,border-color .2s}' +
    '.head h1{font-size:18px;margin-right:auto;transition:font-size .2s}' +
    '.sc .head{padding:8px 24px;border-bottom-color:var(--rule)}.sc .head h1{font-size:14px}.sc .head time{display:none}' +
    '.ic{width:30px;height:30px;display:grid;place-items:center;border:1px solid var(--rule);border-radius:7px;background:var(--panel);color:var(--ink);cursor:pointer;padding:0}' +
    '.ic:hover{border-color:var(--red);color:var(--red)}.ic svg{width:16px;height:16px}.ic .mo{display:none}[data-theme=dark] .ic .su{display:none}[data-theme=dark] .ic .mo{display:block}' +
    '.login .ic{position:fixed;top:14px;right:14px}' +
    '.head time{font-size:12px;color:var(--ink2)}' +
    '.seg{display:inline-flex;border:1px solid var(--rule);border-radius:7px;overflow:hidden}.seg a{padding:5px 12px;font-size:12px;text-decoration:none;background:var(--panel);color:var(--ink2);border-left:1px solid var(--rule)}' +
    '.seg a:first-child{border-left:0}.seg a.on{background:var(--ink);color:var(--bg);font-weight:700}' +
    '.btn{font:inherit;font-size:12px;padding:6px 14px;border:1px solid var(--rule);border-radius:6px;background:var(--sub);color:var(--ink);text-decoration:none;cursor:pointer}' +
    '.btn.pri{background:var(--red);border-color:var(--red);color:#fff}' +
    '.kpi{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:16px}' +
    '.card{background:var(--panel);border:1px solid var(--rule);border-radius:10px;padding:14px 16px;min-width:0}' +
    '.kpi .card>span{display:block;font-size:12px;color:var(--ink2)}.kpi .card b{display:block;font-size:26px;line-height:1.25;font-variant-numeric:tabular-nums;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
    '.kpi .card small{font-size:11px;color:var(--ink2)}.up{color:var(--red)}' +
    '.grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}.wide{grid-column:1/-1}' +
    '.card h2{font-size:13px;font-weight:700;margin-bottom:12px;display:flex;justify-content:space-between;align-items:baseline;gap:10px}.card h2 small{font-weight:400;color:var(--ink2);font-size:11px;text-align:right}' +
    '.bars{display:flex;align-items:flex-end;gap:3px;height:150px}.bars i{flex:1;min-width:0;background:var(--red);opacity:.8;border-radius:2px 2px 0 0;min-height:1px}' +
    '.bars.h i{background:var(--blue)}.bars i:hover{opacity:1}' +
    '.axis{display:flex;gap:3px;margin-top:6px;font-size:10px;color:var(--ink2)}.axis span{flex:1;min-width:0;text-align:center;white-space:nowrap}' +
    'table{width:100%;border-collapse:collapse;font-size:13px}td{padding:6px 0;border-top:1px solid var(--rule);vertical-align:middle}tr:first-child td{border-top:0}' +
    'td.k{max-width:0;width:46%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding-right:10px}td.n{width:56px;text-align:right;font-variant-numeric:tabular-nums;font-weight:700}' +
    'td.p{width:44px;text-align:right;color:var(--ink2);font-size:11px;font-variant-numeric:tabular-nums}' +
    'td.b i{display:block;height:8px;border-radius:4px;background:var(--red);opacity:.75;min-width:2px}' +
    '.hm{display:grid;grid-template-columns:22px repeat(24,1fr);gap:2px;font-size:10px;color:var(--ink2);align-items:center}.hm i{display:block;aspect-ratio:1;border-radius:2px;background:rgba(var(--hm),var(--a));min-height:8px}' +
    '.hm span{text-align:center}' +
    '.empty,.note{font-size:12px;color:var(--ink2)}.note{margin-top:16px;line-height:1.8}' +
    '.login{max-width:340px;margin:14vh auto 0;padding:0 20px}.login .card{padding:22px}.login h1{font-size:16px;margin-bottom:14px}' +
    '.login input{font:inherit;width:100%;padding:9px 11px;border:1px solid var(--rule);border-radius:6px;background:var(--bg);color:var(--ink);margin-bottom:12px}' +
    '.login .err{color:var(--red);font-size:12px;margin-bottom:10px}' +
    '@media (max-width:820px){.app{display:block}.side{position:sticky;top:0;z-index:5;height:auto;flex-direction:row;align-items:center;overflow-x:auto;padding:8px 10px;border-right:0;border-bottom:1px solid var(--rule);gap:4px}' +
    '.side a{white-space:nowrap;padding:6px 10px}.brand,.brand+small,.side hr,.side .sp{display:none}.side{height:46px}.main{padding:14px}.head{top:46px;margin:-14px -14px 14px;padding:10px 14px}.sc .head{padding:6px 14px}.grid{grid-template-columns:1fr}.bars{height:110px;gap:2px}.axis{gap:2px}}';

const THEME_BTN = '<button class="ic" id="th" type="button" aria-label="ライト／ダークの切り替え" title="ライト／ダークの切り替え">' +
    '<svg class="su" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.4M12 19.1v2.4M2.5 12h2.4M19.1 12h2.4M5.3 5.3l1.7 1.7M17 17l1.7 1.7M5.3 18.7 7 17M17 7l1.7-1.7"/></svg>' +
    '<svg class="mo" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z"/></svg></button>';
const page = (body, nonce) => '<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="robots" content="noindex, nofollow">' +
    '<title>アクセス記録</title>' +
    // 描く前に テーマを 決める（保存が なければ 端末の 設定）
    '<script nonce="' + nonce + '">try{document.documentElement.dataset.theme=localStorage.getItem("kt")||(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light")}catch(e){}</script>' +
    '<style>' + CSS + '</style></head><body>' + body +
    '<script nonce="' + nonce + '">(function(){var r=document.documentElement,b=document.getElementById("th");' +
    'if(b)b.onclick=function(){var t=r.dataset.theme==="dark"?"light":"dark";r.dataset.theme=t;try{localStorage.setItem("kt",t)}catch(e){}};' +
    'var f=function(){r.classList.toggle("sc",window.scrollY>24)};addEventListener("scroll",f,{passive:true});f()})()</script></body></html>';

const loginPage = (msg) => (
    '<div class="login">' + THEME_BTN + '<div class="card"><h1>アクセス記録</h1>' +
    (msg ? '<p class="err">' + esc(msg) + '</p>' : '') +
    '<form method="post" action="' + ADMIN + '" autocomplete="off">' +
    '<input type="password" name="k" aria-label="合言葉" placeholder="合言葉" required autofocus>' +
    '<button class="btn pri" type="submit">ログイン</button></form></div></div>');

const VIEWS = [['overview', '概要'], ['trend', '推移'], ['time', '時間帯・曜日'], ['pages', 'ページ'], ['refs', '参照元'], ['act', '行動'],
    ['geo', '地域'], ['env', '環境'], ['bots', 'ボット'], ['nf', '404'], ['system', 'システム']];
const PERIODS = [['7', '7日'], ['30', '30日'], ['90', '90日'], ['all', '全期間']];
const WD = ['日', '月', '火', '水', '木', '金', '土'];

// ---- 部品 ----
const table = (list, total, label) => {
    if (!list.length) return '<p class="empty">まだデータがありません。</p>';
    const max = Math.max(...list.map((r) => r.n));
    const sum = total || list.reduce((s, r) => s + r.n, 0);
    return '<table>' + list.map((r) => '<tr><td class="k" title="' + esc(r.k) + '">' + esc(label ? label(r.k) : (r.k || '（不明）')) + '</td>' +
        '<td class="b"><i style="width:' + Math.max(1, Math.round(r.n / max * 100)) + '%"></i></td>' +
        '<td class="n">' + r.n + '</td><td class="p">' + (sum ? Math.round(r.n / sum * 100) : 0) + '%</td></tr>').join('') + '</table>';
};
const bars = (items, cls, every) => {
    const max = Math.max(1, ...items.map((x) => x.n));
    return '<div class="bars' + (cls ? ' ' + cls : '') + '">' + items.map((x) => '<i title="' + esc(x.t) + '：' + x.n + '" style="height:' + Math.round(x.n / max * 100) + '%"></i>').join('') + '</div>' +
        '<div class="axis">' + items.map((x, i) => '<span>' + (every(i) ? esc(x.l) : '') + '</span>').join('') + '</div>';
};
const kpi = (label, val, sub) => '<div class="card"><span>' + label + '</span><b>' + val + '</b><small>' + (sub || '&nbsp;') + '</small></div>';
const card = (title, sub, inner, cls) => '<section class="card' + (cls ? ' ' + cls : '') + '"><h2>' + title + (sub ? '<small>' + sub + '</small>' : '') + '</h2>' + inner + '</section>';
const md = (k) => Number(k.slice(5, 7)) + '/' + Number(k.slice(8));

async function dashboard(env, view, per) {
    const now = Date.now();
    const d = (back) => jst(now - back * 86400e3).day;
    const nDays = per === 'all' ? 0 : Number(per);
    const since = nDays ? d(nDays - 1) : '0000-00-00';
    const perLabel = PERIODS.find((p) => p[0] === per)[1];
    const q = (sql, ...b) => env.LOG.prepare(sql).bind(...b);
    const run = async (list) => (await env.LOG.batch(list)).map((r) => r.results);
    const dimQ = (kind, limit) => q('SELECT k, SUM(n) n FROM dims WHERE kind = ? AND day >= ? GROUP BY k ORDER BY n DESC LIMIT ' + limit, kind, since);
    const dayBars = (rows, span, cls) => {
        const by = {}; rows.forEach((r) => { by[r.k] = r.n; });
        const items = [];
        for (let i = span - 1; i >= 0; i--) { const k = d(i); items.push({ t: k, l: md(k), n: by[k] || 0 }); }
        const step = span > 60 ? 15 : span > 14 ? 5 : 1;
        return bars(items, cls, (i) => (span - 1 - i) % step === 0);
    };
    const span = nDays || 90;       // 日別グラフは 最長 90日
    const hourBars = (rows) => { const h = Array(24).fill(0); rows.forEach((r) => { h[r.k] = r.n; });
        return bars(h.map((n, i) => ({ t: i + '時', l: String(i), n })), 'h', (i) => i % 3 === 0); };
    const fixed = (rows, order) => { const by = {}; rows.forEach((r) => { by[r.k] = r.n; }); return order.map((k) => ({ k, n: by[k] || 0 })); };
    let body = '';

    if (view === 'overview') {
        const [t0, t1, t7, t30, tall, days, pages, refs, bots, hT, hY] = await run([
            q('SELECT COALESCE(SUM(n),0) n FROM hits WHERE day = ?', d(0)),
            q('SELECT COALESCE(SUM(n),0) n FROM hits WHERE day = ?', d(1)),
            q('SELECT COALESCE(SUM(n),0) n FROM hits WHERE day >= ?', d(6)),
            q('SELECT COALESCE(SUM(n),0) n FROM hits WHERE day >= ?', d(29)),
            q('SELECT COALESCE(SUM(n),0) n, MIN(day) s FROM hits'),
            q('SELECT day k, SUM(n) n FROM hits WHERE day >= ? GROUP BY day', d(span - 1)),
            q('SELECT path k, SUM(n) n FROM hits WHERE day >= ? GROUP BY path ORDER BY n DESC LIMIT 5', since),
            q('SELECT ref k, SUM(n) n FROM hits WHERE day >= ? AND ref != \'\' GROUP BY ref ORDER BY n DESC LIMIT 5', since),
            q('SELECT COALESCE(SUM(n),0) n FROM dims WHERE kind = \'bot\' AND day = ?', d(0)),
            q('SELECT hour k, SUM(n) n FROM hits WHERE day = ? GROUP BY hour', d(0)),
            q('SELECT hour k, SUM(n) n FROM hits WHERE day = ? GROUP BY hour', d(1))
        ]);
        const diff = t0[0].n - t1[0].n;
        body = '<div class="kpi">' +
            kpi('今日', t0[0].n, '前日比 <span class="' + (diff > 0 ? 'up' : '') + '">' + (diff > 0 ? '+' : '') + diff + '</span>') +
            kpi('昨日', t1[0].n) + kpi('直近7日', t7[0].n, '1日平均 ' + (t7[0].n / 7).toFixed(1)) +
            kpi('直近30日', t30[0].n, '1日平均 ' + (t30[0].n / 30).toFixed(1)) +
            kpi('累計', tall[0].n, tall[0].s ? esc(tall[0].s) + ' から' : '') +
            kpi('今日のボット', bots[0].n, '人のアクセスとは別集計') + '</div><div class="grid">' +
            card('日別アクセス', '直近' + span + '日', dayBars(days, span), 'wide') +
            card('今日の時間別', '日本時間・現在 ' + jst(now).hour + '時台', hourBars(hT)) + card('昨日の時間別', '日本時間', hourBars(hY)) +
            card('よく見られたページ', perLabel, table(pages)) + card('おもな参照元', perLabel, table(refs)) + '</div>';
    } else if (view === 'trend') {
        const [days, months, best, tot, prev] = await run([
            q('SELECT day k, SUM(n) n FROM hits WHERE day >= ? GROUP BY day', d(span - 1)),
            q('SELECT substr(day,1,7) k, SUM(n) n FROM hits GROUP BY k ORDER BY k DESC LIMIT 24'),
            q('SELECT day k, SUM(n) n FROM hits GROUP BY day ORDER BY n DESC LIMIT 10'),
            q('SELECT COALESCE(SUM(n),0) n, COUNT(DISTINCT day) c FROM hits WHERE day >= ?', since),
            q('SELECT COALESCE(SUM(n),0) n FROM hits WHERE day >= ? AND day < ?', nDays ? d(nDays * 2 - 1) : '9', since)
        ]);
        const pv = prev[0].n, ch = pv ? Math.round((tot[0].n - pv) / pv * 100) : null;
        body = '<div class="kpi">' + kpi('期間の合計', tot[0].n, perLabel) +
            (nDays ? kpi('前の' + perLabel + 'との比較', ch === null ? '—' : (ch > 0 ? '+' : '') + ch + '%', '前の期間 ' + pv + ' 件') : '') +
            kpi('アクセスのあった日数', tot[0].c) +
            kpi('1日平均', tot[0].c ? (tot[0].n / (nDays || tot[0].c)).toFixed(1) : '0') +
            kpi('過去最多の日', best.length ? best[0].n : 0, best.length ? esc(best[0].k) : '') + '</div><div class="grid">' +
            card('日別アクセス', '直近' + span + '日', dayBars(days, span), 'wide') +
            card('月別', '全期間', table(months, 0, (k) => k.replace('-', '年') + '月')) +
            card('多かった日 トップ10', '全期間', table(best)) + '</div>';
    } else if (view === 'time') {
        const [hm] = await run([q('SELECT CAST(strftime(\'%w\', day) AS INTEGER) w, hour h, SUM(n) n FROM hits WHERE day >= ? GROUP BY w, h', since)]);
        const g = Array.from({ length: 7 }, () => Array(24).fill(0));
        hm.forEach((r) => { g[r.w][r.h] = r.n; });
        const hours = Array(24).fill(0).map((_, h) => g.reduce((s, row) => s + row[h], 0));
        const wds = g.map((row) => row.reduce((s, n) => s + n, 0));
        const max = Math.max(1, ...g.flat()), total = hours.reduce((s, n) => s + n, 0);
        const peakH = hours.indexOf(Math.max(...hours)), peakW = wds.indexOf(Math.max(...wds));
        body = '<div class="kpi">' + kpi('最も多い時間帯', total ? peakH + '時台' : '—', perLabel) + kpi('最も多い曜日', total ? WD[peakW] + '曜日' : '—') +
            kpi('深夜（0〜5時）の割合', total ? Math.round(hours.slice(0, 6).reduce((s, n) => s + n, 0) / total * 100) + '%' : '—') +
            kpi('土日の割合', total ? Math.round((wds[0] + wds[6]) / total * 100) + '%' : '—') + '</div><div class="grid">' +
            card('時間帯別', perLabel + '・日本時間', bars(hours.map((n, i) => ({ t: i + '時', l: String(i), n })), 'h', (i) => i % 3 === 0), 'wide') +
            card('曜日 × 時間帯', '色が濃いほど多い', '<div class="hm"><span></span>' + hours.map((_, i) => '<span>' + (i % 3 === 0 ? i : '') + '</span>').join('') +
                g.map((row, w) => '<span>' + WD[w] + '</span>' + row.map((n, h) => '<i title="' + WD[w] + ' ' + h + '時：' + n + '" style="--a:' + (n ? (0.12 + 0.88 * n / max).toFixed(2) : 0.04) + '"></i>').join('')).join('') + '</div>', 'wide') +
            card('曜日別', perLabel, table(wds.map((n, w) => ({ k: WD[w] + '曜日', n })), total), 'wide') + '</div>';
    } else if (view === 'pages') {
        const [rows, tot] = await run([
            q('SELECT path k, SUM(n) n FROM hits WHERE day >= ? GROUP BY path ORDER BY n DESC LIMIT 100', since),
            q('SELECT COALESCE(SUM(n),0) n FROM hits WHERE day >= ?', since)]);
        body = '<div class="kpi">' + kpi('ページ数', rows.length, perLabel) + kpi('合計', tot[0].n) + '</div>' + card('ページ別', perLabel, table(rows, tot[0].n));
    } else if (view === 'refs') {
        const [rows, tot, direct] = await run([
            q('SELECT ref k, SUM(n) n FROM hits WHERE day >= ? AND ref != \'\' GROUP BY ref ORDER BY n DESC LIMIT 100', since),
            q('SELECT COALESCE(SUM(n),0) n FROM hits WHERE day >= ?', since),
            q('SELECT COALESCE(SUM(n),0) n FROM hits WHERE day >= ? AND ref = \'\'', since)]);
        const ext = tot[0].n - direct[0].n;
        body = '<div class="kpi">' + kpi('他サイトから', ext, tot[0].n ? Math.round(ext / tot[0].n * 100) + '%' : '') +
            kpi('直接・サイト内', direct[0].n, 'URL 直打ち、ブックマーク、アプリ、サイト内の移動') + kpi('参照元の数', rows.length) + '</div>' +
            card('参照元サイト', perLabel + '・他サイトからの ' + ext + ' 件の内訳', table(rows, ext));
    } else if (view === 'act') {
        const [ck, st, sc, th, eg] = await run([dimQ('ev_click', 50), dimQ('ev_stay', 10), dimQ('ev_scroll', 10), dimQ('ev_theme', 5), dimQ('ev_egg', 20)]);
        const sum = (r) => r.reduce((a, x) => a + x.n, 0);
        const stF = fixed(st, STAY), scF = fixed(sc, REACH), n = sum(stF);
        const long = n ? Math.round((stF[3].n + stF[4].n + stF[5].n) / n * 100) + '%' : '—';
        const deep = sum(scF) ? Math.round(scF[3].n / sum(scF) * 100) + '%' : '—';
        body = '<div class="kpi">' + kpi('リンクが押された回数', sum(ck), perLabel) + kpi('1分以上 見た人の割合', long) +
            kpi('最後まで読んだ割合', deep, 'ページの 75% 以上まで') + kpi('隠しコマンドの発動', sum(eg)) + '</div><div class="grid">' +
            card('押されたリンク', perLabel, table(ck), 'wide') +
            card('滞在時間', perLabel + '・ページを開いていた時間', table(stF)) + card('どこまでスクロールしたか', perLabel, table(scF)) +
            card('表示モード', perLabel + '・開いたときの状態', table(fixed(th, THEME))) + card('隠しコマンド', perLabel, table(eg)) + '</div>' +
            '<p class="note">サイトのページから、起きたことの種類だけを送って数えています（誰が、は記録しません）。この機能を入れる前の分はありません。</p>';
    } else if (view === 'geo') {
        const [cs, rs] = await run([
            q('SELECT country k, SUM(n) n FROM hits WHERE day >= ? GROUP BY country ORDER BY n DESC LIMIT 50', since), dimQ('region', 60)]);
        body = '<div class="grid">' + card('国・地域', perLabel, table(cs)) + card('都道府県', perLabel + '・日本からのアクセスのみ', table(rs)) + '</div>';
    } else if (view === 'env') {
        const [dv, br, os, lg, isp] = await run([
            q('SELECT device k, SUM(n) n FROM hits WHERE day >= ? GROUP BY device ORDER BY n DESC', since), dimQ('browser', 20), dimQ('os', 20), dimQ('lang', 20), dimQ('isp', 40)]);
        body = '<div class="grid">' + card('デバイス', perLabel, table(dv, 0, (k) => (k === 'sp' ? 'スマートフォン' : 'PC')), 'wide') +
            card('ブラウザ', perLabel, table(br)) + card('OS', perLabel, table(os)) +
            card('ブラウザの言語設定', perLabel, table(lg)) + card('回線・プロバイダ', perLabel + '・事業者名のみ', table(isp)) + '</div>';
    } else if (view === 'bots') {
        const [names, days, tot] = await run([dimQ('bot', 40),
            q('SELECT day k, SUM(n) n FROM dims WHERE kind = \'bot\' AND day >= ? GROUP BY day', d(span - 1)),
            q('SELECT COALESCE(SUM(n),0) n FROM dims WHERE kind = \'bot\' AND day >= ?', since)]);
        body = '<div class="kpi">' + kpi('ボットのアクセス', tot[0].n, perLabel) + kpi('種類', names.length) + '</div><div class="grid">' +
            card('日別（ボット）', '直近' + span + '日', dayBars(days, span, 'h'), 'wide') + card('ボットの内訳', perLabel, table(names, tot[0].n), 'wide') + '</div>' +
            '<p class="note">検索エンジンの巡回、SNS に URL を貼ったときのプレビュー取得、自動スクリプトなどです。人のアクセス数には含めていません。</p>';
    } else if (view === 'nf') {
        const [rows, tot] = await run([dimQ('nf', 100), q('SELECT COALESCE(SUM(n),0) n FROM dims WHERE kind = \'nf\' AND day >= ?', since)]);
        body = '<div class="kpi">' + kpi('404 の回数', tot[0].n, perLabel) + kpi('パスの種類', rows.length) + '</div>' +
            card('存在しないページへのアクセス', perLabel + '・人とボットの合計', table(rows, tot[0].n)) +
            '<p class="note">リンク切れの発見に使えます。/wp-login.php や /.env などは、脆弱性を探す自動スキャンによるもので、このサイトには該当するものがないため害はありません。</p>';
    } else {
        const [h, dm, fl] = await run([
            q('SELECT COUNT(*) c, MIN(day) a, MAX(day) b FROM hits'), q('SELECT kind k, COUNT(*) n FROM dims GROUP BY kind ORDER BY n DESC'),
            q('SELECT slot k, n FROM fails ORDER BY slot DESC LIMIT 30')]);
        const kn = { bot: 'ボット', nf: '404', browser: 'ブラウザ', os: 'OS', region: '都道府県', lang: '言語', isp: '回線', ev_click: 'リンクのクリック', ev_stay: '滞在時間', ev_scroll: 'スクロール', ev_theme: '表示モード', ev_egg: '隠しコマンド' };
        body = '<div class="kpi">' + kpi('記録の行数（アクセス）', h[0].c) + kpi('記録の行数（その他）', dm.reduce((s, r) => s + r.n, 0)) +
            kpi('記録の開始日', h[0].a ? esc(h[0].a) : '—') + kpi('最新の記録日', h[0].b ? esc(h[0].b) : '—') + '</div><div class="grid">' +
            card('ログイン失敗の履歴', '1時間ごとの回数・新しい順', fl.length ? table(fl, 0, (k) => k + '時台') : '<p class="empty">失敗はありません。</p>') +
            card('その他の記録の内訳', '行数', table(dm, 0, (k) => kn[k] || k)) + '</div>' +
            '<p class="note">ログインは 1 時間に ' + MAX_FAILS + ' 回失敗すると、その時間はロックされます。ログイン状態は 30 日間続きます。<br>' +
            '保存しているのは「日付・時・ページ・参照元のサイト名・国・デバイス種別」ごとの件数と、ブラウザ／OS の種類・言語・回線事業者・都道府県・ボットの種類・404 のパス・ページ内の行動（押されたリンク、滞在時間、スクロール、表示モード）ごとの日別件数のみです。' +
            'IP アドレス、ブラウザの詳細な識別情報、個別の訪問履歴は保存していません。</p>';
    }

    const link = (v, p) => ADMIN + '?v=' + v + '&d=' + p;
    const j = new Date(now + 9 * 3600e3).toISOString().slice(0, 16).replace('T', ' ');
    return ('<div class="app"><nav class="side"><div class="brand">アクセス記録</div><small>poo123.com</small>' +
        VIEWS.map((v) => '<a href="' + link(v[0], per) + '"' + (v[0] === view ? ' class="on"' : '') + '>' + v[1] + '</a>').join('') +
        '<div class="sp"></div><hr><a href="/">サイトを開く</a><a href="' + ADMIN + '/out">ログアウト</a></nav>' +
        '<main class="main"><div class="head"><h1>' + VIEWS.find((v) => v[0] === view)[1] + '</h1><time>' + j + ' 時点</time>' +
        (view === 'system' ? '' : '<div class="seg">' + PERIODS.map((p) => '<a href="' + link(view, p[0]) + '"' + (p[0] === per ? ' class="on"' : '') + '>' + p[1] + '</a>').join('') + '</div>') +
        THEME_BTN + '</div>' + body + '</main></div>');
}

async function admin(request, env, url) {
    const nonce = hex(crypto.getRandomValues(new Uint8Array(12)));
    const csp = "default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-" + nonce + "'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'";
    const html = (body, status = 200) => new Response(body ? page(body, nonce) : '', { status, headers: { ...HEAD, 'Content-Security-Policy': csp } });
    const sub = url.pathname.slice(ADMIN.length);

    if (sub === '/out') {
        return new Response(null, { status: 303, headers: { ...HEAD, Location: '/', 'Set-Cookie': 'kiroku=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax' } });
    }
    if (sub !== '' && sub !== '/') return null;

    if (request.method === 'POST') {
        // よその ページからの 送信は 受けない
        let origin = '';
        try { origin = new URL(request.headers.get('Origin') || '').host; } catch (e) {}
        if (origin !== url.host) return html(loginPage('送信に失敗しました。もう一度お試しください。'), 403);

        const { day, hour } = jst();
        const slot = day + ' ' + String(hour).padStart(2, '0');
        const f = await env.LOG.prepare('SELECT n FROM fails WHERE slot = ?').bind(slot).first();
        if (f && f.n >= MAX_FAILS) return html(loginPage('失敗が続いたため、しばらくログインできません。'), 429);

        const form = await request.formData().catch(() => null);
        const k = form ? String(form.get('k') || '').slice(0, 200) : '';
        if (k && same(await sha(k), await sha(env.ADMIN_KEY))) {
            const exp = Date.now() + 30 * 86400e3;
            const sig = await hmac(env.ADMIN_KEY, 'kiroku:' + exp);
            return new Response(null, { status: 303, headers: { ...HEAD, Location: ADMIN,
                'Set-Cookie': 'kiroku=' + exp + '.' + sig + '; Path=/; Max-Age=' + 30 * 86400 + '; HttpOnly; Secure; SameSite=Lax' } });
        }
        await env.LOG.prepare('INSERT INTO fails (slot, n) VALUES (?, 1) ON CONFLICT (slot) DO UPDATE SET n = n + 1').bind(slot).run();
        return html(loginPage('合言葉が違います。'), 401);
    }
    if (request.method !== 'GET') return html('', 405);
    if (!(await authed(request, env))) return html(loginPage(''));
    const v = url.searchParams.get('v'), p = url.searchParams.get('d');
    const view = VIEWS.some((x) => x[0] === v) ? v : 'overview';
    const per = PERIODS.some((x) => x[0] === p) ? p : '30';
    return html(await dashboard(env, view, per));
}

// まえは アカウントごとに ページが あった。いまは 1ページ
const MOVED = { '/discord': 'discord', '/discord-sub': 'discord-sub', '/x': 'x', '/instagram': 'instagram', '/youtube': 'youtube', '/spotify': 'spotify', '/github': 'github', '/steam': 'steam' };

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        // Consolidate the public HTTP origin without redirecting local previews.
        if (url.hostname === 'poo123.com' && url.protocol === 'http:') {
            url.protocol = 'https:';
            return Response.redirect(url.toString(), 308);
        }

        // あいことばと DB が そろって いる ときだけ、きろくの ページが ある
        if (env.ADMIN_KEY && env.LOG && (url.pathname === ADMIN || url.pathname.startsWith(ADMIN + '/'))) {
            const r = await admin(request, env, url);
            if (r) return r;
        }

        if (env.LOG && url.pathname === '/b' && request.method === 'POST') return beacon(request, env, url);
        if (url.pathname.startsWith('/api/card/')) return profile(url.pathname.slice(10), request, ctx);
        const moved = MOVED[url.pathname.replace(/\.html$/, '')];
        if (moved) return Response.redirect(url.origin + '/links#' + moved, 301);

        const res = await env.ASSETS.fetch(request);
        if (env.LOG && request.method === 'GET' && (res.status === 200 || res.status === 404) &&
            (res.headers.get('Content-Type') || '').includes('text/html')) {
            ctx.waitUntil(count(request, env, url, res.status));
        }
        return res;
    }
};
