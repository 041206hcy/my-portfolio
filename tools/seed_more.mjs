/* 往本地 dev 库塞几条示例内容，把「作品 / 书影音 / 技能」三种版式喂满，方便截图验收。
   只打本地 harness，不碰线上。用法：node tools/seed_more.mjs [http://127.0.0.1:8787] */
const BASE = process.argv[2] || 'http://127.0.0.1:8787';
const TOKEN = process.env.ADMIN_TOKEN || '';

const POSTS = [
  {
    section: 'work',
    title: '无人机实景三维：一次外业，两套载荷，三次质检',
    excerpt: '七阶段作业链，从航高反算到 EPSG:4547 成果。',
    tags: '无人机,实景三维,测绘',
    posted_at: '2026-10-12',
    extra: { year: '2026', role: '独立完成', link: 'https://shackle0412.vip/notes/lidar-to-feature-matrix' },
  },
  {
    section: 'work',
    title: '个人主页与照片地图（这个站点）',
    excerpt: '零构建静态站：Cloudflare Workers + D1，自己写的照片地图、旅程轨迹与后台内容编辑器。',
    tags: 'Web,Cloudflare,D1',
    posted_at: '2026-10-22',
    extra: { year: '2026', role: '独立完成', link: 'https://shackle0412.vip/' },
  },
  {
    section: 'media',
    title: '《地理信息系统导论》',
    excerpt: '空间数据的组织与表达那一章反复看了三遍，投影变换终于不再是背公式。',
    tags: 'GIS,教材',
    posted_at: '2026-09-20',
    extra: { kind: 'book', creator: 'Kang-tsung Chang', year: '2019', rating: 4, progress: '读完' },
  },
  {
    section: 'media',
    title: '《点云处理与激光雷达测量》',
    excerpt: '地面点分类与归一化点云那两节，直接对上了我做 CHM 的那段。',
    tags: 'LiDAR,教材',
    posted_at: '2026-09-28',
    extra: { kind: 'book', creator: '课程讲义汇编', year: '2021', rating: 5, progress: '在读' },
  },
  {
    section: 'media',
    title: '《人生果实》',
    excerpt: '看完想把阳台也种满。节奏慢，但看完心是静的。',
    tags: '纪录片',
    posted_at: '2026-08-30',
    extra: { kind: 'film', creator: '伏原健之', year: '2016', rating: 5 },
  },
  {
    section: 'skill',
    title: '机载 LiDAR 点云处理',
    excerpt: 'LAZ 读写、去噪、地面点分类、DEM/DTM、归一化点云与 CHM（0.5–1 m）。',
    tags: 'LiDAR,点云',
    posted_at: '2026-10-01',
    extra: { group: '遥感与点云', level: '熟练' },
  },
  {
    section: 'skill',
    title: '多光谱与植被指数',
    excerpt: 'NDVI / NGRDI / TGI 与纹理特征（方差、同质性）的提取与筛选。',
    tags: '遥感,特征',
    posted_at: '2026-10-01',
    extra: { group: '遥感与点云', level: '熟练' },
  },
  {
    section: 'skill',
    title: 'Python 数据处理',
    excerpt: 'numpy / pandas / rasterio / laspy / PIL，写脚本把外业表、点云和影像对齐成一份特征矩阵。',
    tags: 'Python,数据',
    posted_at: '2026-10-01',
    extra: { group: '代码与工具', level: '熟练' },
  },
  {
    section: 'skill',
    title: 'Cloudflare Workers + D1',
    excerpt: '零构建静态站、REST 接口、D1 分片存图与后台口令，这个站点就是练手作品。',
    tags: 'Web,Cloudflare',
    posted_at: '2026-10-22',
    extra: { group: '代码与工具', level: '会用' },
  },
  {
    section: 'skill',
    title: 'XGBoost 与特征选择',
    excerpt: 'Boruta / RFE、VIF 共线性、分层 k 折与空间块交叉验证、嵌套 CV 与 SHAP 解释。',
    tags: '机器学习,XGBoost',
    posted_at: '2026-10-01',
    extra: { group: '建模与评价', level: '会用' },
  },
  {
    section: 'skill',
    title: '无人机测绘与空三',
    excerpt: 'GSD 反算航高、仿地飞行、像控点两次独立观测、空三与密集匹配、点云质检。',
    tags: '无人机,测绘',
    posted_at: '2026-10-01',
    extra: { group: '外业与工程', level: '会用' },
  },
];

async function post(body) {
  const r = await fetch(BASE + '/api/admin/post', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-admin-token': TOKEN },
    body: JSON.stringify(body),
  });
  return { status: r.status, id: (await r.json().catch(() => ({}))).id };
}

let ok = 0;
for (const p of POSTS) {
  const r = await post(p);
  if (r.status === 200) ok++;
  else console.log('失败', r.status, p.title);
}
const site = await (await fetch(BASE + '/api/site')).json();
console.log(`写入 ${ok}/${POSTS.length} 条`);
console.log('板块统计：', JSON.stringify(site.sections));
for (const s of ['work', 'media', 'skill']) {
  const d = await (await fetch(`${BASE}/api/posts?section=${s}&limit=5`)).json();
  console.log(s, '→', (d.posts || []).length, '条，第一条 extra =', JSON.stringify((d.posts || [])[0]?.extra));
}