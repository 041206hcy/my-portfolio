// 接口冒烟测试：对着 tools/dev-harness.mjs 起的本地服务跑一遍最小闭环
// 用法：node tools/smoke.mjs        （BASE 环境变量可改地址）
const BASE = process.env.BASE || 'http://127.0.0.1:8787';

let pass = 0;
let fail = 0;

const call = async (p, init) => {
  const r = await fetch(BASE + p, init);
  const text = await r.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: r.status, data, headers: r.headers };
};

const check = async (name, fn) => {
  try {
    const extra = await fn();
    pass += 1;
    console.log(`  ok    ${name}${extra ? '   → ' + extra : ''}`);
  } catch (err) {
    fail += 1;
    console.log(`  FAIL  ${name}   → ${err.message}`);
  }
};

const eq = (got, want, what) => {
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    throw new Error(`${what}：期望 ${JSON.stringify(want)}，实际 ${JSON.stringify(got)}`);
  }
};
const truthy = (v, what) => { if (!v) throw new Error(`${what} 不成立`); };

const PID = 'smoke01';
const jsonPost = (p, body) => call(p, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

console.log(`冒烟测试 → ${BASE}\n`);
let tripId = '';

await check('公开读 /api/site 形状正确', async () => {
  const r = await call('/api/site');
  eq(r.status, 200, '状态码');
  truthy(Array.isArray(r.data.trips) && Array.isArray(r.data.photos), 'trips/photos 是数组');
  return `trips=${r.data.trips.length} photos=${r.data.photos.length} stats=${JSON.stringify(r.data.stats)}`;
});

await check('建旅程 /api/admin/trip', async () => {
  const r = await jsonPost('/api/admin/trip', { title: '冒烟测试之旅', subtitle: '自动化', start_date: '2026-08-01', end_date: '2026-08-05' });
  eq(r.status, 200, '状态码');
  truthy(r.data.ok && r.data.id, 'ok + id');
  tripId = r.data.id;
  return `id=${tripId}`;
});

await check('缺 title 建旅程被拒', async () => {
  const r = await jsonPost('/api/admin/trip', { subtitle: '没有标题' });
  eq(r.status, 400, '状态码');
});

await check('传图 /api/admin/blob（web + thumb）', async () => {
  const web = await call(`/api/admin/blob?pid=${PID}&kind=web`, {
    method: 'POST', headers: { 'content-type': 'image/webp' }, body: Buffer.from([82, 73, 70, 70, 1, 2, 3, 4]),
  });
  const thumb = await call(`/api/admin/blob?pid=${PID}&kind=thumb`, {
    method: 'POST', headers: { 'content-type': 'image/webp' }, body: Buffer.from([82, 73, 70, 70, 9, 9]),
  });
  eq(web.status, 200, 'web 状态码');
  eq(thumb.status, 200, 'thumb 状态码');
  eq(web.data.key, `photos/${PID}/web.webp`, 'web key');
  eq(thumb.data.key, `photos/${PID}/thumb.webp`, 'thumb key');
  return `web=${web.data.bytes}B thumb=${thumb.data.bytes}B`;
});

await check('非法 pid 被拒', async () => {
  const r = await call('/api/admin/blob?pid=AB!!&kind=web', { method: 'POST', body: Buffer.from([1]) });
  eq(r.status, 400, '状态码');
});

await check('空 body 被拒', async () => {
  const r = await call(`/api/admin/blob?pid=${PID}&kind=web`, { method: 'POST', body: Buffer.alloc(0) });
  truthy([400, 413].includes(r.status), '状态码是 400/413');
  return `status=${r.status}`;
});

await check('落库 /api/admin/photo（带坐标）', async () => {
  const r = await jsonPost('/api/admin/photo', {
    id: PID, trip_id: tripId, width: 1600, height: 1067, bytes: 4096,
    shot_at: '2026-08-02T10:30:00+08:00', lat: 30.2561, lng: 120.1542, place: '西湖',
    caption: '冒烟测试照片', key_thumb: `photos/${PID}/thumb.webp`, key_web: `photos/${PID}/web.webp`,
  });
  eq(r.status, 200, '状态码');
  eq(r.data.created, true, 'created');
  return `id=${r.data.id}`;
});

await check('重复提交同 id 走更新（created=false）', async () => {
  const r = await jsonPost('/api/admin/photo', {
    id: PID, caption: '改过的标题', key_thumb: `photos/${PID}/thumb.webp`, key_web: `photos/${PID}/web.webp`,
  });
  eq(r.data.created, false, 'created');
  const site = await call('/api/site');
  const photo = site.data.photos.find((p) => p.id === PID);
  eq(photo.caption, '改过的标题', '标题已更新');
  eq(photo.lat, 30.2561, '坐标没被清掉');
  return '局部更新生效';
});

await check('建照片缺 key 被拒', async () => {
  const r = await jsonPost('/api/admin/photo', { id: 'smoke02', caption: '没图' });
  eq(r.status, 400, '状态码');
});

await check('地图数据 /api/site 里能拿到点', async () => {
  const r = await call('/api/site');
  const photo = r.data.photos.find((p) => p.id === PID);
  truthy(photo, '照片在公开列表里');
  eq([photo.lat, photo.lng], [30.2561, 120.1542], '坐标');
  truthy(r.data.stats.pinned >= 1, 'pinned 计数');
  return `pinned=${r.data.stats.pinned}`;
});

await check('图片 /img/... 能取回且带缓存头', async () => {
  const r = await fetch(`${BASE}/img/photos/${PID}/web.webp`);
  eq(r.status, 200, '状态码');
  const buf = Buffer.from(await r.arrayBuffer());
  eq(buf.length, 8, '字节数');
  truthy((r.headers.get('cache-control') || '').includes('immutable'), 'cache-control');
  truthy(r.headers.get('etag'), 'etag');
  return `${buf.length}B etag=${r.headers.get('etag')}`;
});

await check('图片路径穿越被拒', async () => {
  const r = await call('/img/..%2F..%2Fsecret');
  truthy([400, 404].includes(r.status), '状态码是 400/404');
  return `status=${r.status}`;
});

await check('批量标点 /api/admin/bulk-pin', async () => {
  const r = await jsonPost('/api/admin/bulk-pin', { ids: [PID], lat: 31.2304, lng: 121.4737, place: '上海' });
  eq(r.data.updated, 1, 'updated');
  const site = await call('/api/site');
  const photo = site.data.photos.find((p) => p.id === PID);
  eq([photo.lat, photo.lng, photo.place], [31.2304, 121.4737, '上海'], '坐标与地名');
  return '改点成功';
});

await check('可见性三级：改成 link 后不在公开列表', async () => {
  await jsonPost('/api/admin/bulk-set', { ids: [PID], visibility: 'link' });
  const site = await call('/api/site');
  truthy(!site.data.photos.some((p) => p.id === PID), '公开列表已排除');
  const withLink = await call('/api/photos?include=link');
  truthy(withLink.data.photos.some((p) => p.id === PID), 'include=link 能看到');
  await jsonPost('/api/admin/bulk-set', { ids: [PID], visibility: 'public' });
  return 'public → link → public 都正确';
});

await check('按旅程筛 /api/photos?trip=', async () => {
  const r = await call(`/api/photos?trip=${tripId}`);
  eq(r.data.photos.length, 1, '照片数');
  eq(r.data.photos[0].trip_title, '冒烟测试之旅', '旅程标题已 join');
});

await check('管理总览 /api/admin/overview', async () => {
  const r = await call('/api/admin/overview');
  truthy(r.data.photos.some((p) => p.id === PID), '含测试照片');
  truthy(r.data.trips.some((t) => t.id === tripId), '含测试旅程');
  const photo = r.data.photos.find((p) => p.id === PID);
  truthy(photo.visibility, '带 visibility 字段');
  return `photos=${r.data.photos.length} trips=${r.data.trips.length}`;
});

await check('删照片连带删图', async () => {
  const r = await jsonPost('/api/admin/photo-delete', { id: PID });
  eq(r.data.ok, true, 'ok');
  const img = await call(`/img/photos/${PID}/web.webp`);
  eq(img.status, 404, '图已不存在');
});

await check('删旅程后照片回到日常', async () => {
  const again = await jsonPost('/api/admin/photo', {
    id: PID, trip_id: tripId, key_thumb: `photos/${PID}/thumb.webp`, key_web: `photos/${PID}/web.webp`,
  });
  truthy(again.data.ok, '重新建照片');
  const r = await jsonPost('/api/admin/trip-delete', { id: tripId });
  eq(r.data.ok, true, 'ok');
  const ov = await call('/api/admin/overview');
  const photo = ov.data.photos.find((p) => p.id === PID);
  eq(photo.trip_id, null, 'trip_id 置空');
  return 'photo.trip_id = NULL';
});

await check('未知管理路由返回 404 + route', async () => {
  const r = await jsonPost('/api/admin/nope', {});
  eq(r.status, 404, '状态码');
  eq(r.data.route, 'nope', 'route 回显');
});

await check('静态首页 / 返回 index.html', async () => {
  const r = await fetch(`${BASE}/`);
  eq(r.status, 200, '状态码');
  const html = await r.text();
  truthy(html.includes('<html'), '是 HTML');
  return `${html.length} 字符`;
});

await check('不存在的路径返回自定义 404', async () => {
  const r = await fetch(`${BASE}/definitely-not-here-xyz`);
  eq(r.status, 404, '状态码');
  const html = await r.text();
  truthy(html.length > 0, '有内容');
  return `${html.length} 字符`;
});

// 收尾：清掉测试数据，别污染本地库
await jsonPost('/api/admin/photo-delete', { id: PID });

console.log(`\n通过 ${pass}，失败 ${fail}`);
process.exit(fail ? 1 : 0);