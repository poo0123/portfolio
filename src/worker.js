// poo123.com の 入口。
// 静的ファイルは そのまま 返し、http で 来たときだけ https に ふりかえる。
// 中身は assets（リポジトリの ファイル）が 持っている。
//
// ついでに「どの ページが いつ 何回 見られたか」だけを D1 に 数える。
// IP・ブラウザの 名前・ひとりひとりの 足どりは 残さない（数の 足し算だけ）。
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
async function count(request, env, url) {
    try {
        const ua = request.headers.get('User-Agent') || '';
        if (!ua || BOT.test(ua)) return;
        if (/prefetch|prerender/i.test(request.headers.get('Sec-Purpose') || request.headers.get('Purpose') || '')) return;
        if (await authed(request, env)) return;             // じぶんは 数えない

        let path = url.pathname.replace(/\/index(\.html)?$/, '/').replace(/\.html$/, '').slice(0, 80) || '/';
        let ref = '';
        try {
            const r = new URL(request.headers.get('Referer') || '');
            if (r.hostname !== url.hostname) ref = r.hostname.slice(0, 60);
        } catch (e) {}
        const country = (request.cf && request.cf.country) || '';
        const device = /Mobi|Android|iPhone|iPad/i.test(ua) ? 'sp' : 'pc';
        const { day, hour } = jst();
        await env.LOG.prepare(
            'INSERT INTO hits (day, hour, path, ref, country, device, n) VALUES (?, ?, ?, ?, ?, ?, 1) ' +
            'ON CONFLICT (day, hour, path, ref, country, device) DO UPDATE SET n = n + 1'
        ).bind(day, hour, path, ref, country, device).run();
    } catch (e) { /* 数えそこねても ページは 返す */ }
}

/* ---------- 見る ---------- */
const HEAD = {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Robots-Tag': 'noindex, nofollow, noarchive',
    'Referrer-Policy': 'same-origin',
    'X-Frame-Options': 'DENY',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"
};
const CSS =
    ':root{--bg:#f4efe3;--panel:#fbf8f0;--sub:#eae2d2;--ink:#2f2823;--ink2:#6b5f52;--rule:#d9cfbc;--red:#dc6969;--blue:#3f5d9e}' +
    '@media (prefers-color-scheme: dark){:root{--bg:#070b1c;--panel:#131c3c;--sub:#0e1530;--ink:#e3ebff;--ink2:#98a6d4;--rule:#2a3566;--red:#ff96a8;--blue:#8fb5ff}}' +
    '*{box-sizing:border-box;margin:0;padding:0}' +
    'body{background:var(--bg);color:var(--ink);font:14px/1.6 system-ui,-apple-system,"Segoe UI","Hiragino Sans","Yu Gothic UI",Meiryo,sans-serif;-webkit-text-size-adjust:100%}' +
    '.top{position:sticky;top:0;z-index:5;display:flex;align-items:center;gap:12px;padding:12px 20px;background:var(--panel);border-bottom:1px solid var(--rule)}' +
    '.top h1{font-size:15px;font-weight:700;letter-spacing:.02em}.top h1 span{font-weight:400;color:var(--ink2);margin-left:8px;font-size:12px}' +
    '.top .sp{flex:1}.top time{font-size:12px;color:var(--ink2)}' +
    '.btn{font:inherit;font-size:12px;padding:6px 14px;border:1px solid var(--rule);border-radius:6px;background:var(--sub);color:var(--ink);text-decoration:none;cursor:pointer}' +
    '.btn:hover{border-color:var(--red);color:var(--red)}.btn.pri{background:var(--red);border-color:var(--red);color:#fff}.btn.pri:hover{color:#fff;opacity:.9}' +
    '.wrap{max-width:1080px;margin:0 auto;padding:20px}' +
    '.kpi{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:16px}' +
    '.card{background:var(--panel);border:1px solid var(--rule);border-radius:10px;padding:14px 16px}' +
    '.kpi .card>span{display:block;font-size:12px;color:var(--ink2)}.kpi .card b{display:block;font-size:28px;line-height:1.25;font-variant-numeric:tabular-nums}' +
    '.kpi .card small{font-size:11px;color:var(--ink2)}.up{color:var(--red)}' +
    '.grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}.wide{grid-column:1/-1}' +
    '.card h2{font-size:13px;font-weight:700;margin-bottom:12px;display:flex;justify-content:space-between;align-items:baseline}.card h2 small{font-weight:400;color:var(--ink2);font-size:11px}' +
    '.bars{display:flex;align-items:flex-end;gap:3px;height:150px}.bars i{flex:1;min-width:0;background:var(--red);opacity:.8;border-radius:2px 2px 0 0;min-height:1px}' +
    '.bars.h i{background:var(--blue)}.bars i:hover{opacity:1}' +
    '.axis{display:flex;gap:3px;margin-top:6px;font-size:10px;color:var(--ink2)}.axis span{flex:1;min-width:0;text-align:center;white-space:nowrap;overflow:visible}' +
    'table{width:100%;border-collapse:collapse;font-size:13px}td{padding:6px 0;border-top:1px solid var(--rule);vertical-align:middle}tr:first-child td{border-top:0}' +
    'td.k{max-width:0;width:46%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding-right:10px}td.n{width:52px;text-align:right;font-variant-numeric:tabular-nums;font-weight:700}' +
    'td.p{width:44px;text-align:right;color:var(--ink2);font-size:11px;font-variant-numeric:tabular-nums}' +
    'td.b i{display:block;height:8px;border-radius:4px;background:var(--red);opacity:.75;min-width:2px}' +
    '.empty,.note{font-size:12px;color:var(--ink2)}.note{margin-top:16px;line-height:1.8}' +
    '.login{max-width:340px;margin:14vh auto 0;padding:0 20px}.login .card{padding:22px}.login h1{font-size:16px;margin-bottom:14px}' +
    '.login input{font:inherit;width:100%;padding:9px 11px;border:1px solid var(--rule);border-radius:6px;background:var(--bg);color:var(--ink);margin-bottom:12px}' +
    '.login .err{color:var(--red);font-size:12px;margin-bottom:10px}' +
    '@media (max-width:720px){.grid{grid-template-columns:1fr}.wrap{padding:14px}.top{padding:10px 14px}.top time{display:none}.bars{height:110px;gap:2px}.axis{gap:2px}}';

const shell = (body) => '<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="robots" content="noindex, nofollow">' +
    '<title>アクセス記録</title><style>' + CSS + '</style></head><body>' + body + '</body></html>';

const loginPage = (msg) => shell(
    '<div class="login"><div class="card"><h1>アクセス記録</h1>' +
    (msg ? '<p class="err">' + esc(msg) + '</p>' : '') +
    '<form method="post" action="' + ADMIN + '" autocomplete="off">' +
    '<input type="password" name="k" aria-label="合言葉" placeholder="合言葉" required autofocus>' +
    '<button class="btn pri" type="submit">ログイン</button></form></div></div>');

const table = (list, total, label) => {
    if (!list.length) return '<p class="empty">まだデータがありません。</p>';
    const max = Math.max(...list.map((r) => r.n));
    return '<table>' + list.map((r) => '<tr><td class="k" title="' + esc(r.k) + '">' + esc(label ? label(r.k) : (r.k || '（不明）')) + '</td>' +
        '<td class="b"><i style="width:' + Math.max(1, Math.round(r.n / max * 100)) + '%"></i></td>' +
        '<td class="n">' + r.n + '</td><td class="p">' + (total ? Math.round(r.n / total * 100) : 0) + '%</td></tr>').join('') + '</table>';
};

async function dashboard(env) {
    const now = Date.now();
    const d = (back) => jst(now - back * 86400e3).day;
    const today = d(0), yest = d(1), d7 = d(6), d30 = d(29);
    const q = (sql, ...b) => env.LOG.prepare(sql).bind(...b);
    const res = await env.LOG.batch([
        q('SELECT COALESCE(SUM(n),0) n FROM hits WHERE day = ?', today),
        q('SELECT COALESCE(SUM(n),0) n FROM hits WHERE day = ?', yest),
        q('SELECT COALESCE(SUM(n),0) n FROM hits WHERE day >= ?', d7),
        q('SELECT COALESCE(SUM(n),0) n FROM hits WHERE day >= ?', d30),
        q('SELECT COALESCE(SUM(n),0) n, MIN(day) since FROM hits'),
        q('SELECT day k, SUM(n) n FROM hits WHERE day >= ? GROUP BY day', d30),
        q('SELECT hour k, SUM(n) n FROM hits WHERE day >= ? GROUP BY hour', d30),
        q('SELECT path k, SUM(n) n FROM hits WHERE day >= ? GROUP BY path ORDER BY n DESC LIMIT 15', d30),
        q('SELECT ref k, SUM(n) n FROM hits WHERE day >= ? AND ref != \'\' GROUP BY ref ORDER BY n DESC LIMIT 15', d30),
        q('SELECT country k, SUM(n) n FROM hits WHERE day >= ? GROUP BY country ORDER BY n DESC LIMIT 12', d30),
        q('SELECT device k, SUM(n) n FROM hits WHERE day >= ? GROUP BY device ORDER BY n DESC', d30),
        q('SELECT COALESCE(SUM(n),0) n FROM hits WHERE day >= ? AND ref = \'\'', d30)
    ]);
    const one = (i) => res[i].results[0].n;
    const t30 = one(3), since = res[4].results[0].since;

    // 日別：データのない日も 0 として並べる
    const byDay = {};
    res[5].results.forEach((r) => { byDay[r.k] = r.n; });
    const days = [];
    for (let i = 29; i >= 0; i--) { const k = d(i); days.push({ k, n: byDay[k] || 0 }); }
    const dmax = Math.max(1, ...days.map((x) => x.n));
    const hours = Array(24).fill(0);
    res[6].results.forEach((r) => { hours[r.k] = r.n; });
    const hmax = Math.max(1, ...hours);
    const peak = hours.indexOf(Math.max(...hours));
    const diff = one(0) - one(1);
    const j = new Date(now + 9 * 3600e3);
    const stamp = j.toISOString().slice(0, 16).replace('T', ' ');

    const kpi = (label, val, sub) => '<div class="card"><span>' + label + '</span><b>' + val + '</b><small>' + (sub || '&nbsp;') + '</small></div>';
    const card = (title, sub, inner, cls) => '<section class="card' + (cls ? ' ' + cls : '') + '"><h2>' + title + (sub ? '<small>' + sub + '</small>' : '') + '</h2>' + inner + '</section>';

    return shell(
        '<header class="top"><h1>アクセス記録<span>poo123.com</span></h1><div class="sp"></div>' +
        '<time>' + stamp + ' 更新</time><a class="btn" href="' + ADMIN + '">再読み込み</a><a class="btn" href="' + ADMIN + '/out">ログアウト</a></header>' +
        '<main class="wrap"><div class="kpi">' +
        kpi('今日', one(0), '前日比 <span class="' + (diff > 0 ? 'up' : '') + '">' + (diff > 0 ? '+' : '') + diff + '</span>') +
        kpi('昨日', one(1)) +
        kpi('直近7日', one(2), '1日平均 ' + (one(2) / 7).toFixed(1)) +
        kpi('直近30日', t30, '1日平均 ' + (t30 / 30).toFixed(1)) +
        kpi('累計', one(4), since ? esc(since) + ' から' : '') +
        '</div><div class="grid">' +
        card('日別アクセス', '直近30日',
            '<div class="bars">' + days.map((x) => '<i title="' + x.k + '：' + x.n + '" style="height:' + Math.round(x.n / dmax * 100) + '%"></i>').join('') + '</div>' +
            '<div class="axis">' + days.map((x, i) => '<span>' + (i % 5 === 4 || i === 0 ? Number(x.k.slice(5, 7)) + '/' + Number(x.k.slice(8)) : '') + '</span>').join('') + '</div>', 'wide') +
        card('時間帯別', '直近30日・日本時間' + (t30 ? '・最多 ' + peak + '時台' : ''),
            '<div class="bars h">' + hours.map((n, i) => '<i title="' + i + '時：' + n + '" style="height:' + Math.round(n / hmax * 100) + '%"></i>').join('') + '</div>' +
            '<div class="axis">' + hours.map((_, i) => '<span>' + (i % 3 === 0 ? i : '') + '</span>').join('') + '</div>', 'wide') +
        card('ページ別', '直近30日', table(res[7].results, t30)) +
        card('参照元', '直近30日・直接アクセス ' + one(11) + ' 件を除く', table(res[8].results, t30)) +
        card('国・地域', '直近30日', table(res[9].results, t30)) +
        card('デバイス', '直近30日', table(res[10].results, t30, (k) => (k === 'sp' ? 'スマートフォン' : 'PC'))) +
        '</div><p class="note">ページが開かれた回数を集計しています。ボットと、ログイン中のブラウザからのアクセスは含みません。<br>' +
        '保存しているのは「日付・時・ページ・参照元のサイト名・国・デバイス種別」ごとの件数のみで、IP アドレスやブラウザ情報、個別の訪問履歴は保存していません。</p></main>'
    );
}

async function admin(request, env, url) {
    const html = (body, status = 200, extra = {}) => new Response(body, { status, headers: { ...HEAD, ...extra } });
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
        const slot = day + ' ' + hour;
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
    if (await authed(request, env)) return html(await dashboard(env));
    return html(loginPage(''));
}

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

        const res = await env.ASSETS.fetch(request);
        if (env.LOG && request.method === 'GET' && res.status === 200 &&
            (res.headers.get('Content-Type') || '').includes('text/html')) {
            ctx.waitUntil(count(request, env, url));
        }
        return res;
    }
};
