/* 给所有页面外壳的导航补上「搜索」入口（幂等：已有 /search 就跳过）。
   板块页与文章页由 make_sections.mjs 生成时已带上；这个脚本管其余手写页面。
   用法：node tools/add_search_nav.mjs */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const SKIP = new Set(['admin.html', '404.html']);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === 'vendor' || name === 'assets') continue;
      walk(p, out);
    } else if (name.endsWith('.html')) {
      out.push(p);
    }
  }
  return out;
}

let touched = 0;
let skipped = 0;
for (const p of walk(ROOT)) {
  const rel = relative(ROOT, p).replace(/\\/g, '/');
  if (SKIP.has(rel)) {
    skipped++;
    continue;
  }
  let html = readFileSync(p, 'utf8');
  if (!html.includes('nav__links')) {
    skipped++;
    continue;
  }
  if (html.includes('href="/search"') || html.includes("href='/search'")) {
    skipped++;
    continue;
  }
  const before = html;
  html = html.replace(/(\s*)<a href="\/about">关于<\/a>/, '$1<a href="/search">搜索</a>$1<a href="/about">关于</a>');
  if (html === before) {
    console.log('未能匹配导航  ' + rel);
    skipped++;
    continue;
  }
  writeFileSync(p, html, 'utf8');
  console.log('已加搜索入口  ' + rel);
  touched++;
}
console.log(`改动 ${touched} 个页面，跳过 ${skipped} 个`);