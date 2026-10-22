/* 往【本地】dev harness 的库里塞几条示意内容，用来验收版式（生产站点不受影响）。
   用法：
     node tools/seed_local_posts.mjs            塞三条
     node tools/seed_local_posts.mjs --clear    删掉所有自检/示意内容
   本地 harness 默认不要求口令，所以不需要 x-admin-token。 */
const BASE = (process.env.BASE || 'http://127.0.0.1:8787').replace(/\/$/, '');
const MARK = '示意内容';

const SEEDS = [
  {
    section: 'life',
    title: '把阳台改成了小书房',
    excerpt: '桌子朝窗，下午的光刚好落在键盘上。',
    tags: '阳台,改造,日常',
    posted_at: '2026-10-21',
    body: [
      '阳台原来堆着纸箱和一把旧椅子，国庆那两天清空，搬进来一张 120 的桌子和一盏落地灯。',
      '',
      '## 动了三件事',
      '',
      '- 桌面朝窗，下午三点以后不用开灯',
      '- 把插线板固定在桌腿上，线不再拖地',
      '- 旧椅子留了一把当客座',
      '',
      '> 唯一的缺点是夏天西晒，得再挂一层遮光帘。',
      '',
      '现在写东西基本都在这里，晚上十点以后尤其安静。',
    ].join('\n'),
  },
  {
    section: 'learn',
    title: '用 XGBoost 估测杉木蓄积量：我踩过的七个坑',
    excerpt: '从样本划分到特征共线性，每一步都能把结果带偏。',
    tags: 'XGBoost,LiDAR,机器学习,论文',
    posted_at: '2026-10-18',
    body: [
      '这是毕业论文里最花时间的一段。模型本身不难，难的是前面每一步都会悄悄把结果带偏。',
      '',
      '## 七个坑（按踩到的顺序）',
      '',
      '1. 用随机划分做验证 —— 相邻样地高度相关，等于拿训练集考自己',
      '2. 高度分位数一口气算了 19 个，VIF 高到没法解释',
      '3. 忘了归一化点云的基准面，CHM 在坡地上直接错位',
      '4. 样地边界和点云坐标系没对齐（EPSG:4547 之外又混了一层）',
      '5. 把「建模集/验证集」标记写进了特征矩阵，泄露',
      '6. 只看 R²，不看残差的空间聚集',
      '7. 用了默认超参就去写结论',
      '',
      '## 现在的做法',
      '',
      '```',
      '分层 k 折（按蓄积量分层）+ 空间块交叉验证，两套都跑',
      'Boruta 粗筛 → 再按 VIF 去掉冗余 → 留下 8 个能解释的特征',
      '```',
      '',
      '结论都要配上残差的空间诊断，不然 R² 好看也没意义。',
    ].join('\n'),
  },
  {
    section: 'work',
    title: '无人机实景三维：一次外业，两套载荷，三次质检',
    excerpt: '规划 → 控制 → 飞行 → 空三 → 匹配 → 点云 → 检核。',
    tags: '测绘,无人机,实景三维,点云',
    posted_at: '2026-10-12',
    body: [
      '同一个研究区，一次外业同时拿两套数据：倾斜摄影做实景三维，LiDAR 做林分结构。',
      '',
      '## 七个阶段',
      '',
      '- 规划：按 GSD = H×p/(f×10) 反算航高，兼顾 120m 真高限制',
      '- 控制：像控点与检查点各独立观测两次，间隔 60 分钟以上',
      '- 飞行：林区开仿地飞行，重叠度往上加',
      '- 空三：先看连接点分布，再谈精度',
      '- 匹配：密集匹配出点云，与 LiDAR 点云汇到同一坐标系',
      '- 点云：去噪 → 地面点分类 → DEM → 归一化 → CHM',
      '- 检核：数据层（互差、PDOP）+ 模型层（残差空间诊断）',
      '',
      '三次质检分别卡在空三、点云分类和成果输出，任何一次放过，后面的结论都站不住。',
    ].join('\n'),
  },
];

const req = async (path, init) => {
  const res = await fetch(BASE + path, {
    ...(init || {}),
    headers: { ...((init && init.headers) || {}) },
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: res.status, json, text };
};
const jpost = (path, body) =>
  req(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

const all = await req('/api/admin/posts');
if (all.status !== 200) {
  console.log('读不到 /api/admin/posts（HTTP ' + all.status + '）：harness 起来了吗？');
  process.exit(1);
}
const existing = (all.json && all.json.posts) || [];

if (process.argv.includes('--clear')) {
  let n = 0;
  for (const p of existing) {
    if (String(p.title || '').includes('坑') || String(p.title || '').includes('阳台') || String(p.title || '').includes('实景三维')) {
      const r = await jpost('/api/admin/post-delete', { id: p.id });
      console.log((r.status === 200 ? 'deleted ' : 'FAIL ') + p.id + ' ' + p.title);
      n++;
    }
  }
  console.log(`共删掉 ${n} 条示意内容。`);
} else {
  for (const s of SEEDS) {
    const r = await jpost('/api/admin/post', { ...s, visibility: 'public' });
    console.log((r.status === 200 ? 'created ' : 'FAIL ') + (r.json && r.json.id) + '  ' + s.section + '  ' + s.title);
  }
  const after = await req('/api/site');
  console.log('本地 /api/site：内容 ' + ((after.json.sections || []).reduce((n, x) => n + x.count, 0)) + ' 条，latest ' + ((after.json.latest || []).length) + ' 条。');
  console.log('标记：' + MARK);
}