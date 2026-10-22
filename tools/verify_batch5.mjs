/* 批 5 线上/本地验收：封面图链路 + 四种内容形态 + 文章页封面与上下篇。
   用法：
     node tools/verify_batch5.mjs                       # 打本地 8787（无需口令）
     ADMIN_TOKEN=ps-... node tools/verify_batch5.mjs https://shackle0412.vip
   说明：线上验收会临时写一条内容（含一张 1 字节封面）验完立刻删掉，不污染站点。 */
const BASE = process.argv[2] || process.env.BASE || 'http://127.0.0.1:8787';
const TOKEN = process.env.ADMIN_TOKEN || '';
const VER = '?v=' + Date.now();
let pass = 0;
let fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) {
    pass += 1;
    console.log('ok   ' + name + (extra ? '  ' + extra : ''));
  } else {
    fail += 1;
    console.log('FAIL ' + name + (extra ? '  ' + extra : ''));
  }
};
const get = async (p) => {
  const r = await fetch(BASE + p);
  return { status: r.status, text: await r.text() };
};
const H = () => (TOKEN ? { 'x-admin-token': TOKEN } : {});
const post = async (p, body, type = 'application/json') => {
  const r = await fetch(BASE + p, {
    method: 'POST',
    headers: Object.assign({ 'content-type': type }, H()),
    body,
  });
  return { status: r.status, data: await r.json().catch(() => ({})) };
};

// 1. 静态资源带着批 5 的标记（带 ?v= 穿透边缘缓存）
const css = (await get('/b.css' + VER)).text;
for (const n of ['.shelfitem', '.logitem', '.radar-box', '.postnav', '.post-cover']) {
  ok('b.css 有 ' + n, css.includes(n));
}
const cjs = (await get('/content.js' + VER)).text;
for (const n of ['shelfHTML', 'logHTML', 'radarData', 'paintRadars']) {
  ok('content.js 有 ' + n, cjs.includes(n));
}
ok('content.js 封面按段编码（不再编掉 /）', cjs.includes("split('/').map(encodeURIComponent)"));
const ahtml = (await get('/admin.html' + VER)).text;
ok('admin.html 有封面行', ahtml.includes('post-cover-file') && ahtml.includes('post-cover-key'));
const ajs = (await get('/admin-posts.js' + VER)).text;
ok('admin-posts.js 上传 kind=cover', ajs.includes('kind=cover'));

// 2. 上传白名单
const bad = await post('/api/admin/blob?pid=v5checkaa01&kind=nope', 'x', 'image/webp');
if (TOKEN) {
  // 故意不带口令 —— 这一条只在线上（配了口令）才有意义
  const raw = await fetch(BASE + '/api/admin/blob?pid=v5checkbb01&kind=cover', {
    method: 'POST',
    headers: { 'content-type': 'image/webp' },
    body: 'x',
  });
  ok('未带口令的写接口被拒 401', raw.status === 401, 'HTTP ' + raw.status);
}
const good = await post('/api/admin/blob?pid=v5checkaa01&kind=cover', 'x', 'image/webp');
ok('kind=cover 被收下', good.status === 200 && String(good.data.key || '').endsWith('/cover.webp'), JSON.stringify(good.data));
ok('未知 kind 被拒', bad.status === 400 || bad.status === 401, 'HTTP ' + bad.status);

// 3. 写一条测试内容 → 验 /api/post 的 prev/next 与封面 → 删掉
const made = await post('/api/admin/post', JSON.stringify({
  section: 'life',
  title: '批 5 自检临时内容',
  body: '自检用完即删。',
  cover_key: good.data.key || '',
  tags: '自检',
}));
ok('建内容成功', made.status === 200 && !!made.data.id, JSON.stringify(made.data));
const id = made.data.id;
if (id) {
  const one = await fetch(BASE + '/api/post?id=' + id).then((r) => r.json()).catch(() => ({}));
  ok('/api/post 带 prev/next 字段', one.post && 'prev' in one && 'next' in one);
  ok('/api/post 的封面是 cover.webp', one.post && String(one.post.cover_key || '').endsWith('/cover.webp'));
  const pv = await post('/api/admin/post-delete', JSON.stringify({ id }));
  ok('删内容成功', pv.status === 200 && pv.data.ok === true, JSON.stringify(pv.data));
  const gone = await fetch(BASE + '/api/post?id=' + id);
  ok('删掉后 404', gone.status === 404, 'HTTP ' + gone.status);
}

// 4. 页面还是通的
for (const p of ['/life', '/media', '/skill', '/work', '/admin']) {
  const r = await fetch(BASE + p);
  ok(p + ' 200', r.status === 200, 'HTTP ' + r.status);
}

console.log(`\n通过 ${pass}，失败 ${fail}  （${BASE}）`);
process.exit(fail ? 1 : 0);