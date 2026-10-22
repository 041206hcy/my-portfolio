/* 批 3 线上验收：旅行整体搬到 /travel/*，旧地址 301 保住 */
const U = 'https://shackle0412.vip';
const q = '?v=' + Date.now();
let pass = 0;
let fail = 0;
const ok = (label, cond, extra = '') => {
  if (cond) pass++;
  else fail++;
  console.log((cond ? 'ok   ' : 'FAIL ') + label + (extra ? '   ' + extra : ''));
};

/* 1. 新页面（带 ?v= 绕过边缘缓存：部署切换的瞬间可能缓存过 404） */
for (const p of ['/travel', '/travel/journey?id=2026-08-01-d82x', '/travel/photos', '/travel/map']) {
  const sep = p.includes('?') ? '&' : '?';
  const r = await fetch(U + p + sep + 'cachebust=' + Date.now(), { redirect: 'manual' });
  ok('新页面 ' + p, r.status === 200, 'HTTP ' + r.status);
}

/* 2. 旧地址 301（且带路径与查询串） */
for (const [from, to] of [
  ['/journeys', '/travel'],
  ['/journey?id=abc', '/travel/journey?id=abc'],
  ['/photos', '/travel/photos'],
  ['/map', '/travel/map'],
]) {
  const r = await fetch(U + from, { redirect: 'manual' });
  const loc = r.headers.get('location') || '';
  ok('旧地址 301 ' + from, r.status === 301 && loc.includes(to), 'HTTP ' + r.status + ' → ' + loc);
}

/* 3. 静态资源 */
const css = await (await fetch(U + '/b.css' + q)).text();
ok('b.css 含 .jcard（旅程卡）', css.includes('.jcard'));
ok('b.css 含 .lightbox', css.includes('.lightbox'));
ok('b.css 含 .tstats', css.includes('.tstats'));
const js = await (await fetch(U + '/travel.js' + q)).text();
ok('travel.js 有四个页面的初始化', ['initTravel', 'initJourney', 'initPhotos', 'initMapPage'].every((f) => js.includes(f)));

/* 4. 导航与 sitemap 已指向 /travel */
const home = await (await fetch(U + '/' + q)).text();
ok('首页导航旅行指向 /travel', home.includes('href="/travel"'));
ok('首页不再有 /journeys', !home.includes('/journeys'));
const map = await (await fetch(U + '/sitemap.xml' + q)).text();
ok('sitemap 有 /travel', map.includes('<loc>' + U + '/travel</loc>'));
ok('sitemap 无旧路径', !map.includes('<loc>' + U + '/journeys</loc>') && !map.includes('<loc>' + U + '/photos</loc>') && !map.includes('<loc>' + U + '/map</loc>'));

/* 5. 接口不受影响 */
const site = await (await fetch(U + '/api/site')).json();
ok('/api/site 正常', Array.isArray(site.trips) && Array.isArray(site.photos), 'trip=' + site.trips.length + ' photo=' + site.photos.length);
const ph = await (await fetch(U + '/api/photos?limit=2')).json();
ok('/api/photos 正常', Array.isArray(ph.photos));

console.log('\n' + pass + ' 通过 / ' + fail + ' 失败（共 ' + (pass + fail) + '）');
process.exit(fail ? 1 : 0);