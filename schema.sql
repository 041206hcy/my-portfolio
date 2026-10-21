-- 照片旅行站 · 数据结构
-- 目标：一次「旅程」= 名字 + 起止日期 + 轨迹 + 票据 + 一组照片；不归属任何旅程的照片进「日常」
-- 可见性三档：public（公开、进 sitemap）/ link（仅链接可见、不进列表与 sitemap）/ private（仅自己）

CREATE TABLE IF NOT EXISTS trips (
  id           TEXT PRIMARY KEY,              -- slug，如 2026-08-lijiang
  title        TEXT NOT NULL,
  subtitle     TEXT,
  summary      TEXT,
  cover_id     TEXT,                          -- 封面照片 id
  start_date   TEXT,                          -- YYYY-MM-DD
  end_date     TEXT,
  visibility   TEXT NOT NULL DEFAULT 'public',
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT
);

CREATE TABLE IF NOT EXISTS photos (
  id           TEXT PRIMARY KEY,
  trip_id      TEXT,                          -- NULL = 日常
  width        INTEGER,
  height       INTEGER,
  bytes        INTEGER,
  shot_at      TEXT,                          -- ISO 时间，来自 EXIF 或手工
  lat          REAL,                          -- NULL = 还没标点
  lng          REAL,
  place        TEXT,                          -- 地点名（手填或反查）
  caption      TEXT,
  visibility   TEXT NOT NULL DEFAULT 'public',
  key_thumb    TEXT NOT NULL,                 -- R2 里的缩略图 key
  key_web      TEXT NOT NULL,                 -- R2 里的 1600px 图 key
  sort         INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_photos_trip   ON photos(trip_id);
CREATE INDEX IF NOT EXISTS idx_photos_shot   ON photos(shot_at);
CREATE INDEX IF NOT EXISTS idx_photos_vis    ON photos(visibility);
CREATE INDEX IF NOT EXISTS idx_photos_unpinned ON photos(lat) WHERE lat IS NULL;

-- 机票 / 火车票
CREATE TABLE IF NOT EXISTS tickets (
  id           TEXT PRIMARY KEY,
  trip_id      TEXT NOT NULL,
  kind         TEXT NOT NULL,                 -- flight | train | bus | ferry
  code         TEXT,                          -- 航班号或车次，如 MU5137 / G1234
  from_name    TEXT,
  to_name      TEXT,
  from_lat     REAL,
  from_lng     REAL,
  to_lat       REAL,
  to_lng       REAL,
  depart_at    TEXT,
  arrive_at    TEXT,
  seat         TEXT,
  passenger    TEXT,                          -- 展示时会打码
  key_image    TEXT,                          -- 票图（已打码）
  raw_json     TEXT,                          -- 条码/OCR 原始结果，便于回溯校对
  visibility   TEXT NOT NULL DEFAULT 'public',
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_tickets_trip ON tickets(trip_id);

-- 轨迹段：离线预计算好的一段线（飞机大圆插值 / 火车真实铁路线 / 手工修正）
CREATE TABLE IF NOT EXISTS segments (
  id           TEXT PRIMARY KEY,
  trip_id      TEXT NOT NULL,
  ticket_id    TEXT,
  mode         TEXT,                          -- flight | train
  geojson      TEXT NOT NULL,                 -- LineString 的 coordinates
  source       TEXT,                          -- great-circle | railway | manual
  FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_segments_trip ON segments(trip_id);

CREATE TABLE IF NOT EXISTS settings (
  key          TEXT PRIMARY KEY,
  value        TEXT NOT NULL
);

-- 图片本体：按 64KB 切片存在 D1 里（免费版就够，不必开通 R2）
-- 同一个 key 的每一片是一行；part = 0 的那行带 etag / 总字节数 / content-type
CREATE TABLE IF NOT EXISTS blobs (
  key          TEXT NOT NULL,
  part         INTEGER NOT NULL,
  type         TEXT,
  etag         TEXT,
  bytes        INTEGER,
  data         BLOB NOT NULL,
  updated_at   TEXT,
  PRIMARY KEY (key, part)
);