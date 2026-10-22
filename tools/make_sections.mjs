/* 生成页面外壳：文章页 + 五个板块页。
   板块薄壳只负责 SEO 头与容器，列表由 public/content.js 拉 /api/posts 渲染。
   改文案后重跑：node tools/make_sections.mjs */
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const SITE = 'https://shackle0412.vip';

const NAV = `<header class="nav" id="top">
  <div class="wrap nav__in">
    <a class="nav__brand" href="/">黄翀与</a>
    <nav class="nav__links" aria-label="主导航">
      <a href="/life">生活</a>
      <a href="/learn">学习</a>
      <a href="/work">作品</a>
      <a href="/media">书影音</a>
      <a href="/skill">技能</a>
      <a href="/journeys">旅行</a>
      <a href="/about">关于</a>
    </nav>
  </div>
</header>`;

const COLOPHON = `  <footer class="colophon">
    <span>© 2026 黄翀与 · <a href="${SITE}/">shackle0412.vip</a></span>
    <span><a href="/sitemap.xml">Sitemap</a> · <a href="/admin">管理</a></span>
  </footer>`;

const SCRIPTS = `<script src="/reactbits.js"></script>
<script src="/content.js"></script>`;

function head({ title, desc, kw, canonical, ogType = 'website' }) {
  return `<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<meta name="description" content="${desc}">
<meta name="keywords" content="${kw}">
<meta name="author" content="黄翀与">
<link rel="canonical" href="${canonical}">
<meta property="og:type" content="${ogType}">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${desc}">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${SITE}/assets/og-cover.jpg">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/b.css">
<link rel="stylesheet" href="/reactbits.css">`;
}

const SECTIONS = [
  {
    key: 'life',
    name: '生活记录',
    en: 'Life',
    label: '随手记',
    desc: '吃了什么、买了什么、今天干了什么。短句、照片、流水账，都放这里。',
    kw: '生活记录,日记,随笔,黄翀与',
  },
  {
    key: 'learn',
    name: '学习笔记',
    en: 'Learn',
    label: '课程 / 读书 / 代码',
    desc: '课程笔记、读书摘录、代码与踩坑记录。学到的东西先写下来，再往前走。',
    kw: '学习笔记,课程笔记,读书摘录,代码,XGBoost,黄翀与',
  },
  {
    key: 'work',
    name: '作品与项目',
    en: 'Work',
    label: '论文 / 测绘 / 可视化',
    desc: '论文、测绘项目与可视化成果，含在研的与已完成的；大致按时间倒序。',
    kw: '作品,项目,论文,测绘,可视化,机载LiDAR,黄翀与',
  },
  {
    key: 'media',
    name: '书影音',
    en: 'Media',
    label: '在读 / 在看 / 在听',
    desc: '读过的书、看过的电影与剧、听过的专辑。看完留一句短评。',
    kw: '书影音,读书,电影,剧集,音乐,短评,黄翀与',
  },
  {
    key: 'skill',
    name: '技能与工具箱',
    en: 'Skill',
    label: '工具 / 方法',
    desc: '我在用的工具与方法，附实际使用深度：从 Python、QGIS 到点云分类与特征提取。',
    kw: '技能,工具箱,Python,QGIS,LiDAR360,Pix4D,点云分类,黄翀与',
  },
];

function sectionPage(s) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
${head({
    title: `${s.name} · 黄翀与`,
    desc: s.desc,
    kw: s.kw,
    canonical: `${SITE}/${s.key}`,
  })}
</head>
<body data-page="section" data-section="${s.key}">

${NAV}

<main class="wrap" id="main">

  <section class="page-head">
    <p class="label">${s.en} · ${s.label}</p>
    <h1>${s.name}</h1>
    <p>${s.desc}</p>
  </section>

  <nav class="filters" id="filters" aria-label="标签筛选"></nav>

  <form class="search" id="search" role="search">
    <input type="search" id="q" placeholder="在这一块里搜……" aria-label="在这一块里搜索">
    <button class="btn btn--small" type="submit">搜索</button>
    <span class="label count" id="count"></span>
  </form>

  <section class="plist" id="list"></section>

${COLOPHON}
</main>

${SCRIPTS}
</body>
</html>
`;
}

function postPage() {
  const desc = '黄翀与写的一篇笔记或记录。';
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
${head({
    title: '一篇文章 · 黄翀与',
    desc,
    kw: '黄翀与,笔记,记录',
    canonical: `${SITE}/`,
  })}
</head>
<body data-page="post">

${NAV}

<main class="wrap" id="main">
  <div id="post">
    <div class="empty">载入中……</div>
  </div>

${COLOPHON}
</main>

${SCRIPTS}
</body>
</html>
`;
}

const written = [];
for (const s of SECTIONS) {
  const p = join(ROOT, `${s.key}.html`);
  writeFileSync(p, sectionPage(s), 'utf8');
  written.push(p);
}
const pp = join(ROOT, 'post.html');
writeFileSync(pp, postPage(), 'utf8');
written.push(pp);

for (const p of written) console.log('written ' + p);
console.log(`共 ${written.length} 个页面外壳`);