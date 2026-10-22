/* 内容板块接口契约自检：新建 → 列表 → 筛选 → 搜索 → 文章页 → 更新 → 可见性 → 删除。
   用法：node tools/posts-check.mjs [http://127.0.0.1:8787]
   本地 harness 默认不带口令（ADMIN_TOKEN_SHA256 为空）；若传了 ADMIN_TOKEN 则顺带验 401。 */
const BASE = (process.argv[2] || 'http://127.0.0.1:8787').replace(/\/$/, '');
const TOKEN = process.env.ADMIN_TOKEN || '';

let pass = 0;
let fail = 0;
const ok = (name, cond, extra) => {
  if (cond) {
    pass++;
    console.log('ok   ' + name);
  } else {
    fail++;
    console.log('FAIL ' + name + (extra ? '  → ' + extra : ''));
  }
};

const req = async (path, init) => {
  const res = await fetch(BASE + path, {
    ...(init || {}),
    headers: { ...(TOKEN ? { 'x-admin-token': TOKEN } : {}), ...((init && init.headers) || {}) },
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: res.status, text, json };
};
const jpost = (path, body) =>
  req(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

const uniq = 'zq' + Math.random().toString(36).slice(2, 8);

async function main() {
  // 1. 站点数据多了 sections / latest
  const site = await req('/api/site');
  ok('GET /api/site 200', site.status === 200, 'status=' + site.status);
  const sections = (site.json && site.json.sections) || [];
  ok('sections 是 5 个板块', Array.isArray(sections) && sections.length === 5, 'len=' + sections.length);
  ok(
    '板块字段齐全（key/name/en/href/count）',
    sections.length > 0 && ['key', 'name', 'en', 'href', 'count'].every((k) => k in sections[0]),
    JSON.stringify(sections[0] || {})
  );
  ok('latest 是数组', Array.isArray(site.json && site.json.latest));
  ok('copy 仍在', !!site.json && 'copy' in site.json);

  // 2. 页面外壳在
  const life = await req('/life');
  ok('/life 200 且是板块壳', life.status === 200 && life.text.includes('data-section="life"'), 'status=' + life.status);
  const postShell = await req('/post.html');
  ok('/post.html 200 且是文章壳', postShell.status === 200 && postShell.text.includes('data-page="post"'));

  // 3. 新建
  const created = await jpost('/api/admin/post', {
    section: 'life',
    title: '自检文章 ' + uniq,
    excerpt: '这是自检写入的摘要 ' + uniq,
    tags: '自检,' + uniq,
    posted_at: '2026-10-22',
    body: '## 小标题\n正文 ' + uniq + '\n\n- 一\n- 二\n\n> 引用一行\n\n```\ncode\n```',
  });
  ok('POST /api/admin/post 200', created.status === 200, 'status=' + created.status + ' ' + created.text.slice(0, 120));
  const id = created.json && created.json.id;
  ok('返回了新 id', !!id && /^[a-z0-9]{4,64}$/.test(id), String(id));

  // 4. 列表与筛选
  const list = await req('/api/posts?section=life');
  const ids = ((list.json && list.json.posts) || []).map((p) => p.id);
  ok('GET /api/posts?section=life 含新文章', ids.includes(id), 'ids=' + ids.join(','));
  const learn = await req('/api/posts?section=learn');
  ok('别的板块不含它', !((learn.json && learn.json.posts) || []).some((p) => p.id === id));
  const byTag = await req('/api/posts?section=life&tag=' + uniq);
  ok('按标签能筛到', ((byTag.json && byTag.json.posts) || []).some((p) => p.id === id));
  const byQ = await req('/api/posts?section=life&q=' + uniq);
  ok('按关键词能搜到', ((byQ.json && byQ.json.posts) || []).some((p) => p.id === id));
  const noQ = await req('/api/posts?section=life&q=zzzznope' + uniq);
  ok('搜不到时为空', (((noQ.json && noQ.json.posts) || []).length) === 0);

  // 5. 文章页与正文
  const one = await req('/api/post?id=' + id);
  ok('GET /api/post 200', one.status === 200, 'status=' + one.status);
  ok('正文原样返回', !!one.json && String(one.json.post.body).includes(uniq));
  const page = await req('/p/' + id);
  ok('/p/<id> 重写到文章壳', page.status === 200 && page.text.includes('data-page="post"'), 'status=' + page.status);

  // 6. 更新
  const upd = await jpost('/api/admin/post', { id, section: 'life', title: '改过的标题 ' + uniq, posted_at: '2026-10-23', visibility: 'public' });
  ok('POST /api/admin/post 更新 200', upd.status === 200, 'status=' + upd.status + ' ' + upd.text.slice(0, 120));
  const after = await req('/api/post?id=' + id);
  ok('更新后标题变了', !!after.json && String(after.json.post.title).includes('改过的标题'));

  // 7. 可见性
  await jpost('/api/admin/post', { id, section: 'life', title: '改了可见性 ' + uniq, visibility: 'private' });
  const priv = await req('/api/post?id=' + id);
  ok('private 匿名取不到（404）', priv.status === 404, 'status=' + priv.status);
  const privList = await req('/api/posts?section=life&limit=500');
  ok('private 不出现在列表', !(((privList.json && privList.json.posts) || []).some((p) => p.id === id)));

  await jpost('/api/admin/post', { id, section: 'life', title: 'link 可见 ' + uniq, visibility: 'link' });
  const linkNo = await req('/api/post?id=' + id);
  const linkYes = await req('/api/post?id=' + id + '&include=link');
  ok('link 默认取不到', linkNo.status === 404, 'status=' + linkNo.status);
  ok('link 带 include=link 能取到', linkYes.status === 200, 'status=' + linkYes.status);

  // 8. 参数校验
  const badSec = await jpost('/api/admin/post', { section: 'nope', title: 'x' });
  ok('非法板块被拒', badSec.status >= 400, 'status=' + badSec.status);
  const badId = await req('/api/post?id=BAD_ID!!');
  ok('非法 id 被拒', badId.status >= 400, 'status=' + badId.status);

  // 9. 口令（仅当 harness 设了 ADMIN_TOKEN）
  if (TOKEN) {
    const noTok = await fetch(BASE + '/api/admin/posts');
    ok('不带口令 401', noTok.status === 401, 'status=' + noTok.status);
    const wrong = await fetch(BASE + '/api/admin/posts', { headers: { 'x-admin-token': 'wrong-token' } });
    ok('错口令 401', wrong.status === 401, 'status=' + wrong.status);
  } else {
    console.log('skip 口令检查（本次 harness 没设 ADMIN_TOKEN_SHA256）');
  }

  // 10. 删除
  const del = await jpost('/api/admin/post-delete', { id });
  ok('POST /api/admin/post-delete 200', del.status === 200, 'status=' + del.status);
  const gone = await req('/api/post?id=' + id);
  ok('删掉后取不到', gone.status === 404, 'status=' + gone.status);
  const goneList = await req('/api/posts?section=life&limit=500');
  ok('删掉后不在列表', !(((goneList.json && goneList.json.posts) || []).some((p) => p.id === id)));

  console.log(`\n${pass} 通过 / ${fail} 失败（共 ${pass + fail}）`);
  if (fail) process.exit(1);
}

main().catch((e) => {
  console.log('自检崩了：' + (e && e.message));
  process.exit(1);
});