-- アクセスの きろく（数だけ。IP や ひとりひとりの 記録は 持たない）
CREATE TABLE IF NOT EXISTS hits (
    day     TEXT    NOT NULL,   -- 日本時間の 日付 YYYY-MM-DD
    hour    INTEGER NOT NULL,   -- 日本時間の 時 0-23
    path    TEXT    NOT NULL,
    ref     TEXT    NOT NULL,   -- どこから 来たか（サイト名だけ）
    country TEXT    NOT NULL,
    device  TEXT    NOT NULL,   -- sp / pc
    n       INTEGER NOT NULL,
    PRIMARY KEY (day, hour, path, ref, country, device)
);
CREATE INDEX IF NOT EXISTS hits_day ON hits (day);
-- あいことばの まちがい（1時間ごとの 回数）
CREATE TABLE IF NOT EXISTS fails (
    slot TEXT PRIMARY KEY,
    n    INTEGER NOT NULL
);
