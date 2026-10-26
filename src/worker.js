// poo123.com の 入口。
// 静的ファイルは そのまま 返し、http で 来たときだけ https に ふりかえる。
// 中身は assets（リポジトリの ファイル）が 持っている。
export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        // Consolidate the public HTTP origin without redirecting local previews.
        if (url.hostname === 'poo123.com' && url.protocol === 'http:') {
            url.protocol = 'https:';
            return Response.redirect(url.toString(), 308);
        }
        return env.ASSETS.fetch(request);
    }
};
