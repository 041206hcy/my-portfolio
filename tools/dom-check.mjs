// DOM 契约自检：页面里加载的每个前端脚本，用 $('x') / getElementById('x') 引用的 id
// 必须能在该页面 HTML 里找到（否则运行时就是 null.textContent 崩溃）
// 用法：node tools/dom-check.mjs
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';

const PAGES = [
  'public/index.html',
  'public/admin.html',
  'public/about.html',
  'public/404.html',
  'public/notes/cloudflare-deploy.html',
  'public/notes/lidar-to-feature-matrix.html',
];

// 由 JS 自己动态创建、因此不必出现在 HTML 里的 id
const DYNAMIC = new Set(['wall-more']);

let problems = 0;

for (const htmlPath of PAGES) {
  const html = readFileSync(htmlPath, 'utf8');
  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));

  // 只看页面自己加载的脚本，vendor/ 第三方库不算
  const scripts = [...html.matchAll(/<script[^>]*\bsrc="([^"]+)"/g)]
    .map((m) => m[1])
    .filter((s) => !/^(https?:|\/\/)/.test(s) && !s.includes('vendor/'))
    .map((s) => resolve(dirname(htmlPath), s.replace(/^\//, '')))
    .filter((p) => existsSync(p));

  if (!scripts.length) {
    console.log(` --   ${htmlPath.padEnd(38)} 不加载脚本（HTML 里 ${ids.size} 个 id）`);
    continue;
  }

  const missing = [];
  const used = new Set();
  for (const jsPath of scripts) {
    const js = readFileSync(jsPath, 'utf8');
    for (const m of js.matchAll(/\$\(\s*'([^']+)'\s*\)|getElementById\(\s*'([^']+)'\s*\)/g)) {
      const id = m[1] || m[2];
      used.add(id);
      if (!ids.has(id) && !DYNAMIC.has(id)) missing.push(id);
    }
  }

  const uniq = [...new Set(missing)];
  const files = scripts.map((p) => relative('.', p).replace(/\\/g, '/')).join(' + ');
  console.log(`${uniq.length ? 'FAIL ' : ' ok  '} ${htmlPath.padEnd(38)} ${files.padEnd(26)} 引用 ${used.size} 个 id${uniq.length ? '\n        缺 id：' + uniq.join('，') : ''}`);
  if (uniq.length) problems += 1;
}

console.log(problems ? `\n${problems} 个页面有缺 id` : '\nJS 引用的 id 在对应页面里都存在');
process.exit(problems ? 1 : 0);