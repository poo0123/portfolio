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
    'Content-Security-Policy': "default-src 'none'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"
};
const shell = (body) => '<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="robots" content="noindex, nofollow">' +
    '<title>きろく</title>' +
    '<link href="https://fonts.googleapis.com/css2?family=Caveat:wght@500;700&family=Yomogi&family=Zen+Kurenaido&display=swap" rel="stylesheet">' +
    '<link rel="stylesheet" href="/style.css"><style>' +
    '.k-sheet{position:relative;background:var(--card);border:1px solid var(--rule);box-shadow:var(--shadow);padding:26px 22px;margin:0 0 28px}' +
    '.k-h{font-family:Yomogi,cursive;font-weight:400;font-size:1.1rem;margin:0 0 14px}' +
    '.k-nums{display:grid;grid-template-columns:repeat(auto-fit,minmax(104px,1fr));gap:12px}' +
    '.k-nums div{border:1px dashed var(--rule);padding:10px 12px;background:var(--paper-2)}' +
    '.k-nums b{display:block;font-family:Caveat,cursive;font-size:1.9rem;line-height:1.1;color:var(--red)}' +
    '.k-nums span{font-size:.72rem;color:var(--ink-2)}' +
    '.k-row{display:grid;grid-template-columns:minmax(72px,34%) 1fr 44px;gap:10px;align-items:center;font-size:.78rem;padding:3px 0}' +
    '.k-row span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
    '.k-row i{display:block;height:10px;background:var(--red);opacity:.75;min-width:2px}' +
    '.k-row b{font-family:Caveat,cursive;font-size:1rem;text-align:right;font-weight:700}' +
    '.k-hours{display:grid;grid-template-columns:repeat(24,1fr);gap:2px;align-items:end;height:110px}' +
    '.k-hours i{display:block;background:var(--blue);opacity:.7;min-height:1px}' +
    '.k-hl{display:grid;grid-template-columns:repeat(24,1fr);gap:2px;font-size:.6rem;color:var(--ink-2);text-align:center;margin-top:4px}' +
    '.k-note{font-size:.72rem;color:var(--ink-2);line-height:1.7}' +
    '.k-form input{font:inherit;padding:8px 10px;border:1px solid var(--rule);background:var(--paper);color:var(--ink);width:100%;max-width:260px}' +
    '.k-form button,.k-out{font:inherit;font-family:Yomogi,cursive;padding:7px 18px;border:1.5px solid var(--red);color:var(--red);background:none;border-radius:999px;cursor:pointer;text-decoration:none;font-size:.85rem}' +
    '@media (prefers-color-scheme: dark){body{--paper:#070b1c;--paper-2:#0e1530;--card:#131c3c;--ink:#e3ebff;--ink-2:#98a6d4;--rule:#2a3566;--red:#ff96a8;--blue:#8fb5ff;--shadow:0 12px 30px rgba(0,0,0,.65)}}' +
    '</style></head><body><div class="page">' + body + '</div></body></html>';

const loginPage = (msg) => shell(
    '<div class="k-sheet"><h1 class="k-h">きろく</h1>' +
    (msg ? '<p class="k-note" style="color:var(--red)">' + esc(msg) + '</p>' : '') +
    '<form class="k-form" method="post" action="' + ADMIN + '" autocomplete="off">' +
    '<p><input type="password" name="k" aria-label="あいことば" placeholder="あいことば" required autofocus></p>' +
    '<p style="margin-top:14px"><button type="submit">ひらく</button></p></form></div>');

const rows = (list, label) => {
    if (!list.length) return '<p class="k-note">まだ なにも ない。</p>';
    const max = Math.max(...list.map((r) => r.n));
    return list.map((r) => '<div class="k-row"><span>' + esc(label ? label(r.k) : (r.k || '（なし）')) + '</span>' +
        '<i style="width:' + Math.max(1, Math.round(r.n / max * 100)) + '%"></i><b>' + r.n + '</b></div>').join('');
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
        q('SELECT COALESCE(SUM(n),0) n FROM hits'),
        q('SELECT day k, SUM(n) n FROM hits WHERE day >= ? GROUP BY day ORDER BY day DESC', d30),
        q('SELECT hour k, SUM(n) n FROM hits WHERE day >= ? GROUP BY hour', d30),
        q('SELECT path k, SUM(n) n FROM hits WHERE day >= ? GROUP BY path ORDER BY n DESC LIMIT 15', d30),
        q('SELECT ref k, SUM(n) n FROM hits WHERE day >= ? AND ref != \'\' GROUP BY ref ORDER BY n DESC LIMIT 15', d30),
        q('SELECT country k, SUM(n) n FROM hits WHERE day >= ? GROUP BY country ORDER BY n DESC LIMIT 12', d30),
        q('SELECT device k, SUM(n) n FROM hits WHERE day >= ? GROUP BY device ORDER BY n DESC', d30)
    ]);
    const one = (i) => res[i].results[0].n;
    const hours = Array(24).fill(0);
    res[6].results.forEach((r) => { hours[r.k] = r.n; });
    const hmax = Math.max(1, ...hours);
    const sheet = (title, inner) => '<div class="k-sheet"><h2 class="k-h">' + title + '</h2>' + inner + '</div>';
    return shell(
        '<div class="k-sheet"><h1 class="k-h">きろく <span class="k-note">poo123.com</span></h1>' +
        '<div class="k-nums">' +
        [['きょう', one(0)], ['きのう', one(1)], ['7日', one(2)], ['30日', one(3)], ['ぜんぶ', one(4)]]
            .map((x) => '<div><b>' + x[1] + '</b><span>' + x[0] + '</span></div>').join('') + '</div>' +
        '<p class="k-note" style="margin-top:14px">ページが 開かれた 回数。ロボットと、ここを 開いている じぶんは 数えない。' +
        '残しているのは 日・時・ページ・どこから 来たか（サイト名だけ）・国・スマホか PC かの 数だけ。</p>' +
        '<p style="margin-top:12px"><a class="k-out" href="' + ADMIN + '/out">とじる</a></p></div>' +
        sheet('ひにち（30日）', rows(res[5].results, (k) => k.slice(5).replace('-', '/'))) +
        sheet('じかん（30日・日本時間）', '<div class="k-hours">' + hours.map((n) => '<i title="' + n + '" style="height:' + Math.round(n / hmax * 100) + '%"></i>').join('') +
            '</div><div class="k-hl">' + hours.map((_, i) => '<span>' + (i % 3 === 0 ? i : '') + '</span>').join('') + '</div>') +
        sheet('ページ（30日）', rows(res[7].results)) +
        sheet('どこから（30日）', rows(res[8].results)) +
        sheet('くに（30日）', rows(res[9].results)) +
        sheet('スマホ / PC（30日）', rows(res[10].results, (k) => (k === 'sp' ? 'スマホ' : 'PC')))
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
        if (origin !== url.host) return html(loginPage('もういちど。'), 403);

        const { day, hour } = jst();
        const slot = day + ' ' + hour;
        const f = await env.LOG.prepare('SELECT n FROM fails WHERE slot = ?').bind(slot).first();
        if (f && f.n >= MAX_FAILS) return html(loginPage('まちがいが 多いので、しばらく 開けない。'), 429);

        const form = await request.formData().catch(() => null);
        const k = form ? String(form.get('k') || '').slice(0, 200) : '';
        if (k && same(await sha(k), await sha(env.ADMIN_KEY))) {
            const exp = Date.now() + 30 * 86400e3;
            const sig = await hmac(env.ADMIN_KEY, 'kiroku:' + exp);
            return new Response(null, { status: 303, headers: { ...HEAD, Location: ADMIN,
                'Set-Cookie': 'kiroku=' + exp + '.' + sig + '; Path=/; Max-Age=' + 30 * 86400 + '; HttpOnly; Secure; SameSite=Lax' } });
        }
        await env.LOG.prepare('INSERT INTO fails (slot, n) VALUES (?, 1) ON CONFLICT (slot) DO UPDATE SET n = n + 1').bind(slot).run();
        return html(loginPage('ちがう みたい。'), 401);
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
