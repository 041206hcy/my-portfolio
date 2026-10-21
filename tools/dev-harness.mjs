// 本地开发服务器（只在开发时用，不部署）
// 用途：在 Node 里直接跑 src/index.js 这个 Workers 风格的 fetch handler，
//      用 node:sqlite 顶替 D1 —— 线上连照片本体也存在 D1 的 blobs 表里，所以本地一个库就够；
//      用 public/ 目录顶替静态资源绑定。这样不装 wrangler（沙箱里也跑不起来）就能把接口真跑起来。
//
// 用法：node tools/dev-harness.mjs [--port 8787] [--reset]
//   --reset  清空 .devdata（数据库 + 已传的图）
import { DatabaseSync } from 'node:sqlite';
import { createServer } from 'node:http';
import { readFile, mkdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = path.resolve(import.meta.dirname, '..');
const PUBLIC = path.join(ROOT, 'public');
const DATA = path.join(ROOT, '.devdata');

const argv = process.argv.slice(2);
const PORT = Number((argv[argv.indexOf('--port') + 1] || '').match(/^\d+$/) ? argv[argv.indexOf('--port') + 1] : 8787);
const RESET = argv.includes('--reset');

await mkdir(DATA, { recursive: true });
if (RESET) {
  // 元数据和图片本体都在这个 sqlite 里，删掉库就等于清空全部数据
  await rm(path.join(DATA, 'd1.sqlite'), { force: true });
}

/* ---------------- D1 替身（node:sqlite） ---------------- */

const raw = new DatabaseSync(path.join(DATA, 'd1.sqlite'));
raw.exec('PRAGMA foreign_keys = ON');
raw.exec(await readFile(path.join(ROOT, 'schema.sql'), 'utf8'));

const clean = (v) => (v === undefined ? null : v);

function stmt(sql, params = []) {
  const args = params.map(clean);
  return {
    bind: (...next) => stmt(sql, next),
    async first(col) {
      const row = raw.prepare(sql).get(...args);
      if (!row) return null;
      return col ? row[col] : row;
    },
    async all() {
      return { results: raw.prepare(sql).all(...args), success: true, meta: {} };
    },
    async run() {
      const info = raw.prepare(sql).run(...args);
      return { success: true, meta: { changes: info.changes, last_row_id: info.lastInsertRowid }, results: [] };
    },
  };
}

const DB = {
  prepare: (sql) => stmt(sql),
  async batch(list) {
    const out = [];
    for (const s of list) out.push(await s.run());
    return out;
  },
  async exec(sql) {
    raw.exec(sql);
    return { count: 0, duration: 0 };
  },
  _raw: raw,
};

/* ---------------- ASSETS 替身（public/ 目录） ---------------- */

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
};

const readAsset = async (file) => {
  try {
    const info = await stat(file);
    if (!info.isFile()) return null;
    const body = await readFile(file);
    return new Response(body, {
      headers: {
        'content-type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
        'content-length': String(body.length),
      },
    });
  } catch {
    return null;
  }
};

const ASSETS = {
  async fetch(request) {
    const url = new URL(request.url);
    let pathname = decodeURIComponent(url.pathname);
    if (pathname.endsWith('/')) pathname += 'index.html';
    const target = path.join(PUBLIC, pathname);
    if (!target.startsWith(PUBLIC)) return new Response('forbidden', { status: 403 });

    return (
      (await readAsset(target)) ||
      (await readAsset(`${target}.html`)) ||
      (await readAsset(path.join(target, 'index.html'))) ||
      (await readAsset(path.join(PUBLIC, '404.html')).then((r) => r && new Response(r.body, { status: 404, headers: r.headers }))) ||
      new Response('not found', { status: 404 })
    );
  },
};

/* ---------------- 起服务 ---------------- */

const env = { DB, ASSETS, REQUIRE_ACCESS: '0' };
const worker = (await import(pathToFileURL(path.join(ROOT, 'src', 'index.js')).href)).default;

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const hasBody = chunks.length > 0;

  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (typeof v === 'string') headers.set(k, v);
    else if (Array.isArray(v)) headers.set(k, v.join(', '));
  }

  const request = new Request(url, {
    method: req.method,
    headers,
    body: hasBody ? Buffer.concat(chunks) : undefined,
  });

  let response;
  try {
    response = await worker.fetch(request, env);
  } catch (err) {
    response = new Response(`harness 内部错误：${(err && err.stack) || err}`, { status: 500 });
  }

  const out = new Headers(response.headers);
  out.delete('content-encoding');
  res.writeHead(response.status, Object.fromEntries(out));
  if (req.method === 'HEAD' || response.status === 304 || response.status === 204) {
    res.end();
    return;
  }
  res.end(Buffer.from(await response.arrayBuffer()));
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[dev] http://127.0.0.1:${PORT}   数据在 ${DATA}`);
});