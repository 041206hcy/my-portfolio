/* 批 4 契约自检：检索三件套的 DOM 挂点、接口、样式与脚本标记。
   用法：node tools/search-check.mjs [base] */
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

const search = await get('/search');
ok('/search 200', search.status === 200, 'HTTP ' + search.status);
for (const id of ['tagcloud', 'yearbar', 'viewtoggle', 'sc-sections', 'suggest', 'q', 'list', 'count']) {
  ok('/search 有 #' + id, search.text.includes('id="' + id + '"'));
}

const life = await get('/life');
for (const id of ['filters', 'viewtoggle', 'yearbar', 'suggest']) {
  ok('/life 有 #' + id, life.text.includes('id="' + id + '"'));
}

const css = await get('/b.css');
for (const c of ['.tagcloud', '.tagpill', '.yearbar', '.suggest', '.viewtoggle', '.qgrid', '.toolbar']) {
  ok('b.css 定义 ' + c, css.text.includes(c));
}

const js = await get('/content.js');
for (const f of ['initSearch', 'tagCounts', 'yearCounts', 'renderYearbar', 'renderViewToggle', 'suggestFor', 'viewOf']) {
  ok('content.js 有 ' + f, js.text.includes(f));
}

const api = await get('/api/posts?limit=500');
let posts = [];
try {
  posts = JSON.parse(api.text).posts || [];
} catch {
  posts = [];
}
ok('/api/posts?limit=500 可用', api.status === 200 && Array.isArray(posts), 'posts=' + posts.length);

const sm = await get('/sitemap.xml');
ok('sitemap 含 /search', sm.text.includes('<loc>https://shackle0412.vip/search</loc>'));

console.log(`\n通过 ${pass}，失败 ${fail}`);
process.exit(fail ? 1 : 0);