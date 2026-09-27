/*  other/ のページで つかいまわす ちいさな道具
    Discord のようす（Lanyard）と 日替わりの一行だけ。
    見た目は それぞれのページが 勝手に決める。                       */
(function (w, d) {
    'use strict';

    var USER_ID = '339360580886593536';

    var STATUS_LABEL = {
        online: 'オンライン',
        idle: '退席中',
        dnd: '取り込み中',
        offline: 'オフライン'
    };
    var STATUS_EN = {
        online: 'Online',
        idle: 'Away',
        dnd: 'Do not disturb',
        offline: 'Offline'
    };
    var ACT_LABEL = {
        0: 'プレイ中',
        1: '配信中',
        2: '再生中',
        3: '視聴中',
        5: '参戦中'
    };

    var HITOKOTO = [
        '特に何もありませんが、お越しいただきありがとうございます',
        '本日も更新はありません',
        'ドメイン代の元は取れていません',
        'スクロールしても何も出てきません',
        'この一行は日替わりです。それだけです',
        '明日も同じような状態の見込みです',
        '何かを期待して来られた方、申し訳ありません',
        'ここまで読んでしまわれたのですね',
        '特筆すべきものはありません',
        'サーバーは優秀です。常時稼働しています',
        '更新する意思はあります。意思だけです',
        '「くそサイト」の「くそ」は褒め言葉です',
        '閉じても誰も怒りません',
        '本日の運勢は普通です'
    ];

    /* ---------- ちいさい道具 ---------- */

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function mmss(ms) {
        var s = Math.floor((ms / 1000) % 60);
        var m = Math.floor((ms / 60000) % 60);
        return m + ':' + (s < 10 ? '0' : '') + s;
    }

    function since(ms) {
        var diff = Date.now() - ms;
        if (!(diff > 0) || diff > 1000 * 60 * 60 * 24 * 14) return '';
        var m = Math.floor(diff / 60000);
        if (m < 1) return '開始直後';
        if (m < 60) return m + '分経過';
        var h = Math.floor(m / 60);
        if (h < 24) {
            var rest = m % 60;
            return (rest ? h + '時間' + rest + '分' : h + '時間') + '経過';
        }
        return Math.floor(h / 24) + '日経過';
    }

    function hitokoto() {
        var day = Math.floor(Date.now() / 86400000);
        return HITOKOTO[day % HITOKOTO.length];
    }

    /* ---------- Lanyard から きたものを ならす ---------- */

    function actImage(a) {
        var big = a.assets && a.assets.large_image;
        if (!big) return 'https://cdn.discordapp.com/embed/avatars/0.png';
        if (big.indexOf('mp:') === 0) {
            // よそのサイトの画像は 直だと断られるので Discord 経由で
            return 'https://media.discordapp.net/' + big.slice(3) + '?width=128&height=128';
        }
        if (a.application_id) {
            return 'https://cdn.discordapp.com/app-assets/' + a.application_id + '/' + big + '.png?size=128';
        }
        return 'https://cdn.discordapp.com/embed/avatars/0.png';
    }

    function shape(data) {
        var u = data.discord_user || {};
        var status = data.discord_status || 'offline';
        var acts = [];

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

        (data.activities || []).forEach(function (a) {
            if (a.name === 'Spotify' && a.type === 2) return;

            if (a.type === 4) {
                var e = a.emoji;
                var txt = [(e && !e.id) ? e.name : '', a.state].filter(Boolean).join(' ');
                if (!txt) return;
                acts.push({
                    kind: 'custom', label: 'カスタムステータス', name: txt, detail: '',
                    img: (e && e.id)
                        ? 'https://cdn.discordapp.com/emojis/' + e.id + (e.animated ? '.gif' : '.png') + '?size=96'
                        : null,
                    start: null, end: null
                });
                return;
            }

            var label = ACT_LABEL[a.type];
            if (!label) return;

            acts.push({
                kind: 'game',
                label: label,
                name: a.name,
                detail: [a.details, a.state].filter(Boolean).join(' / '),
                img: actImage(a),
                url: null,
                start: (a.timestamps && a.timestamps.start) ? a.timestamps.start : null,
                end: (a.timestamps && a.timestamps.end) ? a.timestamps.end : null
            });
        });

        // 同じ内容が 重複して届くことがある
        var seen = {};
        acts = acts.filter(function (a) {
            var id = a.label + '|' + a.name + '|' + a.detail;
            if (seen[id]) return false;
            seen[id] = 1;
            return true;
        });

        var np = u.collectibles && u.collectibles.nameplate;
        var pg = u.primary_guild;

        return {
            status: status,
            statusLabel: STATUS_LABEL[status] || status,
            statusEn: STATUS_EN[status] || status,
            name: u.display_name || u.global_name || u.username || 'Poo',
            username: u.username || 'poo.pptx',
            id: USER_ID,
            avatar: u.avatar
                ? 'https://cdn.discordapp.com/avatars/' + USER_ID + '/' + u.avatar + '.webp?size=256'
                : null,
            decoration: (u.avatar_decoration_data && u.avatar_decoration_data.asset)
                ? 'https://cdn.discordapp.com/avatar-decoration-presets/' + u.avatar_decoration_data.asset + '.png?size=160&passthrough=true'
                : null,
            nameplate: (np && np.asset) ? 'https://cdn.discordapp.com/assets/collectibles/' + np.asset : null,
            guild: (pg && pg.identity_enabled && pg.tag) ? {
                tag: pg.tag,
                badge: pg.badge
                    ? 'https://cdn.discordapp.com/guild-tag-badges/' + pg.identity_guild_id + '/' + pg.badge + '.png?size=32'
                    : null
            } : null,
            acts: acts
        };
    }

    /* ---------- つなぐ ---------- */

    var subs = [];
    var latest = null;
    var sock = null;
    var beat = null;

    function tellAll() {
        subs.forEach(function (fn) {
            try { fn(latest); } catch (e) {}
        });
    }

    function connect() {
        sock = new WebSocket('wss://api.lanyard.rest/socket');

        sock.onopen = function () {
            sock.send(JSON.stringify({ op: 2, d: { subscribe_to_id: USER_ID } }));
        };

        sock.onmessage = function (ev) {
            var msg = JSON.parse(ev.data);
            if (msg.op === 1) {
                if (beat) clearInterval(beat);
                beat = setInterval(function () { sock.send(JSON.stringify({ op: 3 })); }, msg.d.heartbeat_interval);
            }
            if (msg.t === 'INIT_STATE' || msg.t === 'PRESENCE_UPDATE') {
                latest = shape(msg.d);
                tellAll();
            }
        };

        sock.onclose = function () {
            clearInterval(beat);
            setTimeout(connect, 3000);
        };
        sock.onerror = function () { tellAll(); };
    }

    w.PooLive = {
        subscribe: function (fn) {
            subs.push(fn);
            if (latest) fn(latest);
            if (!sock) connect();
        },
        esc: esc,
        mmss: mmss,
        since: since,
        hitokoto: hitokoto,
        userId: USER_ID
    };

})(window, document);
