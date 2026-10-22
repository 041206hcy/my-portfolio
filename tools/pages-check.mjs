// 页面自检：把每个页面里引用的本地资源都真的取一遍，抓坏链
// 用法：node tools/pages-check.mjs        （BASE 环境变量可改地址）
const BASE = process.env.BASE || 'http://127.0.0.1:8787';

const PAGES = [
  '/',
  '/life',
  '/learn',
  '/work',
  '/media',
  '/skill',
  '/travel',
  '/travel/journey',
  '/travel/photos',
  '/travel/map',
  '/notes',
  '/about',
  '/admin',
  '/post.html',
  '/notes/cloudflare-deploy',
  '/notes/lidar-to-feature-matrix',
  '/404.html',
];

const SKIP = /^(https?:|mailto:|tel:|#|data:|javascript:)/i;

// 可选素材：缺了不算坏链（页面已做回退/留白），只有真坏链才 FAIL
const OPTIONAL = new Set(['assets/avatar.jpg']);

let problems = 0;

for (const page of PAGES) {
  const res = await fetch(BASE + page);
  const html = await res.text();
  if (res.status !== 200) {
    console.log(`FAIL  ${page}  → HTTP ${res.status}`);
    problems += 1;
    continue;
  }

  const refs = [...html.matchAll(/(?:src|href)="([^"]*)"/gi)]
    .map((m) => m[1].trim())
    .filter((u) => u && !SKIP.test(u));

  const bad = [];
  const optional = [];
  for (const ref of refs) {
    const target = new URL(ref, BASE + page).pathname;
    const r = await fetch(BASE + target, { method: 'GET' });
    if (r.status === 200) continue;
    if (OPTIONAL.has(target.replace(/^\//, ''))) optional.push(target);
    else bad.push(`${ref} → HTTP ${r.status}`);
  }

  const title = (html.match(/<title>([^<]*)<\/title>/i) || [, ''])[1];
  console.log(`${bad.length ? 'FAIL ' : ' ok  '} ${page.padEnd(38)} 「${title}」  本地引用 ${refs.length} 个${bad.length ? '\n        坏链：' + bad.join('，') : ''}${optional.length ? '  （可选未放：' + optional.join('，') + '）' : ''}`);
  if (bad.length) problems += 1;
}

console.log(problems ? `\n${problems} 个页面有问题` : '\n所有页面的本地引用都能取到（200）');
process.exit(problems ? 1 : 0);