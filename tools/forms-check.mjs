/* 批 5 契约自检：封面图 / 随手记 / 海报墙 / 技能雷达 / 文章页封面与上下篇。
   用法：node tools/forms-check.mjs [base] */
const BASE = process.argv[2] || process.env.BASE || 'http://127.0.0.1:8787';
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
const json = async (p) => {
  const r = await fetch(BASE + p);
  return { status: r.status, data: await r.json().catch(() => ({})) };
};

// 1. 静态资源里有批 5 的标记
const content = await get('/content.js');
for (const n of ['logHTML', 'shelfHTML', 'radarData', 'paintRadars', 'postnav']) {
  ok('content.js 有 ' + n, content.text.includes(n));
}
const css = await get('/b.css');
for (const n of ['.logitem', '.shelfitem', '.radar-box', '.postnav', '.post-cover', '.pitem__thumb']) {
  ok('b.css 有 ' + n, css.text.includes(n));
}
const adminJs = await get('/admin-posts.js');
ok('admin-posts.js 传 kind=cover', adminJs.text.includes('kind=cover'));
ok('admin-posts.js 有 encode()', adminJs.text.includes('function encode('));
const adminHtml = await get('/admin.html');
for (const id of ['post-cover-file', 'post-cover-key', 'post-cover-prev', 'post-cover-clear']) {
  ok('admin.html 有 #' + id, adminHtml.text.includes('id="' + id + '"'));
}

// 2. 板块页真的按新版式渲染（靠 /api/posts 里已有内容）
const lifePosts = (await json('/api/posts?section=life&limit=50')).data.posts || [];
const mediaPosts = (await json('/api/posts?section=media&limit=50')).data.posts || [];
const workPosts = (await json('/api/posts?section=work&limit=50')).data.posts || [];
// 页面外壳是空容器，版式由 content.js 在浏览器里渲染 —— 这里只报数据形状，
// 真正的渲染结果用无头 Edge 截图核对（见 screens/b5-*.png）
console.log(`info 生活 ${lifePosts.length} 条（带封面 ${lifePosts.filter((p) => p.cover_key).length}）`);
console.log(`info 书影音 ${mediaPosts.length} 条（带封面 ${mediaPosts.filter((p) => p.cover_key).length}）`);
console.log(`info 作品 ${workPosts.length} 条（带封面 ${workPosts.filter((p) => p.cover_key).length}）`);
const skillPosts = (await json('/api/posts?section=skill&limit=50')).data.posts || [];
console.log(`info 技能 ${skillPosts.length} 条，等级 ${JSON.stringify(skillPosts.map((p) => (p.extra && p.extra.level) || ''))}`);

// 3. 文章页：封面 + 上下篇
if (workPosts.length) {
  const id = workPosts[0].id;
  const one = await json('/api/post?id=' + encodeURIComponent(id));
  ok('/api/post 返回 post', !!one.data.post);
  ok('/api/post 带 prev/next 字段', 'prev' in one.data && 'next' in one.data, `prev=${one.data.prev ? 1 : 0} next=${one.data.next ? 1 : 0}`);
  const page = await get('/p/' + id);
  ok('/p/<id> 200', page.status === 200, 'HTTP ' + page.status);
} else {
  ok('/api/post 跳过（本地没有作品内容）', true);
}

// 4. 上传白名单：cover 收，别的拒
const post = async (p, body, type) => {
  const r = await fetch(BASE + p, { method: 'POST', headers: { 'content-type': type }, body });
  return { status: r.status, data: await r.json().catch(() => ({})) };
};
const bad = await post('/api/admin/blob?pid=formcheckaa11&kind=nope', 'x', 'image/webp');
ok('未知 kind 被拒（400）', bad.status === 400, 'HTTP ' + bad.status);
const good = await post('/api/admin/blob?pid=formcheckaa11&kind=cover', 'x', 'image/webp');
ok('kind=cover 被收下', good.status === 200 && String(good.data.key || '').includes('cover.webp'), JSON.stringify(good.data));

console.log(`\n通过 ${pass}，失败 ${fail}`);
process.exit(fail ? 1 : 0);