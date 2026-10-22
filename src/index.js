// 照片旅行站 · Cloudflare Worker
// 静态资源 + 少量接口：公开读（地图/照片墙）、管理写（上传、标点、分组）
// 管理接口全部挂在 /api/admin/* 下，由 adminAllowed() 用「管理口令」把门（见文件末尾）。

const IMG_CACHE = 'public, max-age=31536000, immutable';
const VISIBILITIES = ['public', 'link', 'private'];

function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    status: init.status || 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...(init.headers || {}),
    },
  });
}

function newId(len = 16) {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  let out = '';
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}

function pickVisibility(v, fallback = 'public') {
  return VISIBILITIES.includes(v) ? v : fallback;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // 规范化跳转：http → https，www → 裸域。
    // 域名由 Cloudflare 代理，TLS 在边缘终止，所以原始协议看 x-forwarded-proto；
    // 仪表板里的 Always Use HTTPS 需要有 zone 权限的令牌才能开，改在 Worker 里做等价的事。
    // （注意：静态资源默认由边缘直接返回、不进 Worker，所以 wrangler.jsonc 里开了 run_worker_first。）
    const wantsHttps = (request.headers.get('x-forwarded-proto') || '').toLowerCase() === 'http';
    const wantsApex = url.hostname.startsWith('www.');
    if (wantsHttps || wantsApex) {
      const target = new URL(request.url);
      target.protocol = 'https:';
      if (wantsApex) target.hostname = url.hostname.slice(4);
      return Response.redirect(target.toString(), 301);
    }

    try {
      if (path.startsWith('/img/')) return await serveImage(request, env, path.slice('/img/'.length));
      if (path === '/api/site') return await siteData(env);
      if (path === '/api/photos') return await listPhotos(env, url);
      if (path.startsWith('/api/admin/')) {
        if (!(await adminAllowed(request, env))) {
          return json({ error: 'unauthorized' }, { status: 401 });
        }
        return await adminApi(request, env, url);
      }
      return await env.ASSETS.fetch(request);
    } catch (err) {
      return json({ error: String((err && err.message) || err) }, { status: 500 });
    }
  },
};

/* ---------------- 管理接口的两道锁 ----------------
   1) ADMIN_TOKEN_SHA256：管理口令的 SHA-256（十六进制）。口令本身永远不进仓库，
      只存在你自己浏览器的 localStorage 里，每次请求带 x-admin-token 头。
      （放哈希而不是明文，是因为这个仓库是公开的。）
   2) REQUIRE_ACCESS=1：额外要求 Cloudflare Access 注入的身份头 —— 等自定义域名
      通了、能在 Access 里建应用之后再打开；现在 workers.dev 上配不了，保持 0。
   两道都留了开关：一个都不配 = 本地开发，完全不拦。
*/
async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function adminAllowed(request, env) {
  if (env.REQUIRE_ACCESS === '1' && !request.headers.get('cf-access-authenticated-user-email')) {
    return false;
  }
  const expect = String(env.ADMIN_TOKEN_SHA256 || '').trim().toLowerCase();
  if (!expect) return true;
  const got = String(request.headers.get('x-admin-token') || '').trim();
  if (!got) return false;
  return (await sha256Hex(got)) === expect;
}

/* ---------------- 图片：存在 D1 里（不依赖 R2，免费版就能用） ---------------- */

// 一张图按 64KB 切成多行存，避开 D1 单行/单参数的体积上限；重复访问走边缘缓存，不落回 D1。
const BLOB_CHUNK = 64 * 1024;

const toU8 = (v) => (v instanceof Uint8Array ? v : new Uint8Array(v));

async function sha1Hex(u8) {
  const digest = await crypto.subtle.digest('SHA-1', u8);
  let out = '';
  for (const b of new Uint8Array(digest)) out += b.toString(16).padStart(2, '0');
  return out;
}

async function blobPut(env, key, buf, type) {
  const u8 = toU8(buf);
  const etag = `"${(await sha1Hex(u8)).slice(0, 32)}"`;
  const parts = Math.max(1, Math.ceil(u8.byteLength / BLOB_CHUNK));
  const stmts = [env.DB.prepare('DELETE FROM blobs WHERE key = ?').bind(key)];
  for (let i = 0; i < parts; i++) {
    stmts.push(
      env.DB.prepare(
        `INSERT INTO blobs (key, part, type, etag, bytes, data, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`
      ).bind(key, i, type, etag, u8.byteLength, u8.subarray(i * BLOB_CHUNK, (i + 1) * BLOB_CHUNK))
    );
  }
  await env.DB.batch(stmts);
  return { key, bytes: u8.byteLength, parts, etag };
}

async function blobGet(env, key) {
  const rows = (
    await env.DB.prepare('SELECT part, type, etag, bytes, data FROM blobs WHERE key = ? ORDER BY part ASC')
      .bind(key)
      .all()
  ).results;
  if (!rows || !rows.length) return null;
  const total = rows[0].bytes || 0;
  const out = new Uint8Array(total || rows.reduce((n, r) => n + toU8(r.data).byteLength, 0));
  let off = 0;
  for (const r of rows) {
    const u8 = toU8(r.data);
    out.set(u8, off);
    off += u8.byteLength;
  }
  // 按 key 而不是按 url 缓存，同一张图被不同页面引用时只存一份
  return {
    body: out.subarray(0, off),
    type: rows[0].type || 'application/octet-stream',
    etag: rows[0].etag || '',
  };
}

async function blobDelete(env, keys) {
  const list = (Array.isArray(keys) ? keys : [keys]).filter(Boolean);
  if (!list.length) return;
  await env.DB.batch(list.map((k) => env.DB.prepare('DELETE FROM blobs WHERE key = ?').bind(k)));
}

async function serveImage(request, env, key) {
  if (!key || key.includes('..') || key.startsWith('/')) {
    return new Response('bad key', { status: 400 });
  }

  const cache = typeof caches === 'undefined' ? null : caches.default;
  const cached = cache && request.method === 'GET' ? await cache.match(request) : null;
  if (cached) {
    const et = cached.headers.get('etag');
    if (et && request.headers.get('if-none-match') === et) {
      return new Response(null, { status: 304, headers: { etag: et, 'cache-control': IMG_CACHE } });
    }
    return cached;
  }

  const blob = await blobGet(env, key);
  if (!blob) return new Response('not found', { status: 404 });

  const headers = new Headers({
    'content-type': blob.type,
    'cache-control': IMG_CACHE,
    'content-length': String(blob.body.byteLength),
  });
  if (blob.etag) headers.set('etag', blob.etag);
  if (blob.etag && request.headers.get('if-none-match') === blob.etag) {
    return new Response(null, { status: 304, headers });
  }

  const res = new Response(blob.body, { headers });
  if (cache && request.method === 'GET') {
    try {
      await cache.put(request, res.clone());
    } catch {
      /* 缓存写失败不影响出图 */
    }
  }
  return res;
}

/* ---------------- 公开读 ---------------- */

async function siteData(env) {
  const trips = (
    await env.DB.prepare(
      `SELECT id, title, subtitle, summary, start_date, end_date, cover_id
         FROM trips WHERE visibility = 'public'
        ORDER BY COALESCE(start_date, created_at) DESC`
    ).all()
  ).results;

  const photos = (
    await env.DB.prepare(
      `SELECT id, trip_id, lat, lng, place, caption, shot_at, width, height, key_thumb, key_web
         FROM photos WHERE visibility = 'public'
        ORDER BY COALESCE(shot_at, created_at) ASC`
    ).all()
  ).results;

  return json({
    trips,
    photos,
    stats: {
      photos: photos.length,
      trips: trips.length,
      pinned: photos.filter((p) => p.lat !== null && p.lng !== null).length,
    },
    copy: await readCopy(env),
  });
}

/* ---------------- 站点文字（settings 表里的 copy.* 键） ----------------
   首页上那些「编辑位置」的话都由你写，这里只负责读出来。settings 表本来就有，所以这一轮不加新表。
   键名固定：copy.lede / copy.issue_note / copy.method / copy.footer / copy.sidenotes(JSON 数组)。
   读不到就回落成空串，由前端给默认文案 —— 数据库还没建时首页也不该白屏。 */
async function readCopy(env) {
  let raw = {};
  try {
    const rows = (
      await env.DB.prepare("SELECT key, value FROM settings WHERE key LIKE 'copy.%'").all()
    ).results;
    for (const r of rows) raw[r.key] = r.value == null ? '' : String(r.value);
  } catch {
    raw = {};
  }
  let sidenotes = [];
  try {
    const parsed = JSON.parse(raw['copy.sidenotes'] || '[]');
    if (Array.isArray(parsed)) sidenotes = parsed.map((s) => String(s)).filter(Boolean).slice(0, 12);
  } catch {
    sidenotes = [];
  }
  return {
    lede: raw['copy.lede'] || '',
    issue_note: raw['copy.issue_note'] || '',
    method: raw['copy.method'] || '',
    footer: raw['copy.footer'] || '',
    sidenotes,
  };
}

async function listPhotos(env, url) {
  const tripId = url.searchParams.get('trip');
  const includeLink = url.searchParams.get('include') === 'link';
  const vis = includeLink ? `('public','link')` : `('public')`;
  let sql = `SELECT p.id, p.trip_id, p.lat, p.lng, p.place, p.caption, p.shot_at,
                    p.width, p.height, p.key_thumb, p.key_web, t.title AS trip_title
               FROM photos p LEFT JOIN trips t ON t.id = p.trip_id
              WHERE p.visibility IN ${vis}`;
  const args = [];
  if (tripId) { sql += ' AND p.trip_id = ?'; args.push(tripId); }
  sql += ' ORDER BY COALESCE(p.shot_at, p.created_at) ASC LIMIT 5000';
  const photos = (await env.DB.prepare(sql).bind(...args).all()).results;
  return json({ photos });
}

/* ---------------- 管理写 ---------------- */

async function adminApi(request, env, url) {
  const route = url.pathname.slice('/api/admin/'.length);
  const method = request.method;

  if (method === 'GET' && route === 'overview') {
    const photos = (
      await env.DB.prepare(
        `SELECT p.id, p.trip_id, p.lat, p.lng, p.place, p.caption, p.shot_at, p.width, p.height,
                p.visibility, p.key_thumb, p.key_web, p.bytes, t.title AS trip_title
           FROM photos p LEFT JOIN trips t ON t.id = p.trip_id
          ORDER BY COALESCE(p.shot_at, p.created_at) DESC`
      ).all()
    ).results;
    const trips = (await env.DB.prepare(`SELECT * FROM trips ORDER BY COALESCE(start_date, created_at) DESC`).all()).results;
    return json({ photos, trips });
  }

  // 收图：二进制切片进 D1 的 blobs 表，元数据由 client 负责算（尺寸、EXIF 时间、两档大小都在浏览器里做）
  if (method === 'POST' && route === 'blob') {
    const pid = url.searchParams.get('pid') || '';
    const kind = url.searchParams.get('kind') || 'web';
    if (!/^[a-z0-9]{6,32}$/.test(pid)) return json({ error: 'bad pid' }, { status: 400 });
    if (!['thumb', 'web', 'ticket'].includes(kind)) return json({ error: 'bad kind' }, { status: 400 });
    const body = await request.arrayBuffer();
    if (!body.byteLength) return json({ error: 'empty body' }, { status: 400 });
    if (body.byteLength > 12 * 1024 * 1024) return json({ error: 'too large' }, { status: 413 });
    const ext = kind === 'ticket' ? 'bin' : 'webp';
    const key = kind === 'ticket' ? `tickets/${pid}/image.${ext}` : `photos/${pid}/${kind}.${ext}`;
    const stored = await blobPut(env, key, body, request.headers.get('content-type') || 'application/octet-stream');
    return json({ key, bytes: stored.bytes, parts: stored.parts });
  }

  if (method === 'POST' && route === 'photo') {
    const b = await request.json();
    const id = b.id ? String(b.id) : newId();
    const current = await env.DB.prepare('SELECT * FROM photos WHERE id = ?').bind(id).first();
    const visibility = pickVisibility(b.visibility, current ? current.visibility : 'public');

    if (!current) {
      if (!b.key_thumb || !b.key_web) return json({ error: 'key_thumb / key_web required' }, { status: 400 });
      await env.DB.prepare(
        `INSERT INTO photos (id, trip_id, width, height, bytes, shot_at, lat, lng, place, caption, visibility, key_thumb, key_web, sort)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
        .bind(
          id, b.trip_id || null, b.width ?? null, b.height ?? null, b.bytes ?? null,
          b.shot_at || null, b.lat ?? null, b.lng ?? null, b.place || null, b.caption || null,
          visibility, b.key_thumb, b.key_web, b.sort ?? 0
        )
        .run();
    } else {
      await env.DB.prepare(
        `UPDATE photos
            SET trip_id = ?, shot_at = ?, lat = ?, lng = ?, place = ?, caption = ?, visibility = ?, sort = ?
          WHERE id = ?`
      )
        .bind(
          b.trip_id !== undefined ? b.trip_id || null : current.trip_id,
          b.shot_at !== undefined ? b.shot_at || null : current.shot_at,
          b.lat !== undefined ? b.lat : current.lat,
          b.lng !== undefined ? b.lng : current.lng,
          b.place !== undefined ? b.place || null : current.place,
          b.caption !== undefined ? b.caption || null : current.caption,
          visibility,
          b.sort !== undefined ? b.sort : current.sort,
          id
        )
        .run();
    }
    return json({ ok: true, id, created: !current });
  }

  if (method === 'POST' && route === 'photo-delete') {
    const { id } = await request.json();
    if (!id) return json({ error: 'id required' }, { status: 400 });
    const keys = (
      await env.DB.prepare('SELECT key_thumb, key_web FROM photos WHERE id = ?').bind(id).all()
    ).results[0];
    if (keys) await blobDelete(env, [keys.key_thumb, keys.key_web]);
    await env.DB.prepare('DELETE FROM photos WHERE id = ?').bind(id).run();
    return json({ ok: true });
  }

  // 批量标点：同一天/同一组照片一次点上，这是这个站唯一的人力瓶颈的解药
  if (method === 'POST' && route === 'bulk-pin') {
    const { ids, lat, lng, place } = await request.json();
    if (!Array.isArray(ids) || !ids.length) return json({ error: 'ids required' }, { status: 400 });
    const stmt = env.DB.prepare(
      `UPDATE photos SET lat = ?, lng = ?, place = COALESCE(?, place) WHERE id IN (${ids.map(() => '?').join(',')})`
    );
    await stmt.bind(lat ?? null, lng ?? null, place || null, ...ids).run();
    return json({ ok: true, updated: ids.length });
  }

  // 批量改属性：归到某趟旅程 / 改可见性 / 批量改拍摄时间
  if (method === 'POST' && route === 'bulk-set') {
    const { ids, trip_id, visibility, shot_at } = await request.json();
    if (!Array.isArray(ids) || !ids.length) return json({ error: 'ids required' }, { status: 400 });
    const sets = [];
    const args = [];
    if (trip_id !== undefined) { sets.push('trip_id = ?'); args.push(trip_id || null); }
    if (visibility !== undefined) { sets.push('visibility = ?'); args.push(pickVisibility(visibility)); }
    if (shot_at !== undefined) { sets.push('shot_at = ?'); args.push(shot_at || null); }
    if (!sets.length) return json({ error: 'nothing to update' }, { status: 400 });
    await env.DB.prepare(`UPDATE photos SET ${sets.join(', ')} WHERE id IN (${ids.map(() => '?').join(',')})`)
      .bind(...args, ...ids)
      .run();
    return json({ ok: true, updated: ids.length });
  }

  if (method === 'POST' && route === 'trip') {
    const b = await request.json();
    if (!b.title) return json({ error: 'title required' }, { status: 400 });
    const id = b.id || `${(b.start_date || new Date().toISOString().slice(0, 10))}-${newId(4)}`;
    const visibility = pickVisibility(b.visibility, 'public');
    await env.DB.prepare(
      `INSERT INTO trips (id, title, subtitle, summary, cover_id, start_date, end_date, visibility, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(id) DO UPDATE SET
         title = excluded.title, subtitle = excluded.subtitle, summary = excluded.summary,
         cover_id = excluded.cover_id, start_date = excluded.start_date, end_date = excluded.end_date,
         visibility = excluded.visibility, updated_at = datetime('now')`
    )
      .bind(id, b.title, b.subtitle || null, b.summary || null, b.cover_id || null, b.start_date || null, b.end_date || null, visibility)
      .run();
    return json({ ok: true, id });
  }

  if (method === 'POST' && route === 'trip-delete') {
    const { id } = await request.json();
    if (!id) return json({ error: 'id required' }, { status: 400 });
    await env.DB.prepare("UPDATE photos SET trip_id = NULL WHERE trip_id = ?").bind(id).run();
    await env.DB.prepare('DELETE FROM trips WHERE id = ?').bind(id).run();
    return json({ ok: true });
  }

  // 站点文字：首页的导语/手记/方法卡/页脚/边注都存进 settings 表
  if (method === 'GET' && route === 'settings') {
    const rows = (
      await env.DB.prepare('SELECT key, value FROM settings ORDER BY key').all()
    ).results;
    return json({ settings: rows });
  }

  // 只接受 copy.* 前缀，避免管理页被当成「任意配置后门」
  if (method === 'POST' && route === 'settings') {
    const b = await request.json();
    const values = b && b.values && typeof b.values === 'object' ? b.values : null;
    if (!values) return json({ error: 'values required' }, { status: 400 });
    const keys = Object.keys(values).filter((k) => k.startsWith('copy.')).slice(0, 40);
    for (const k of keys) {
      // eslint-disable-next-line no-await-in-loop
      await env.DB.prepare(
        `INSERT INTO settings (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`
      )
        .bind(k, String(values[k] == null ? '' : values[k]))
        .run();
    }
    return json({ ok: true, saved: keys.length });
  }

  return json({ error: 'not found', route }, { status: 404 });
}