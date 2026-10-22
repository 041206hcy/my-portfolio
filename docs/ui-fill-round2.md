# 第二轮：逐页差量 —— 把每一屏填满，而不堆砌

日期 2026-10-22 · 承接 `personal-site/docs/ui-composite-redesign.md`
P0（12 列 / band / `.head` / 刊头错版 / 目录条 / 地图满版）、P0.5（对比度 / 44px / 纸纹 z-index）、P1（四个子页外壳）已落地。本文**不重复**这些，只写"现在仍然空的地方"，全部落到类名、格数、像素与函数名。

---

## 0. 诊断：复合版式做完，为什么还是觉得空

| # | 症状（可观察） | 真正原因 |
| --- | --- | --- |
| 1 | 每段都是「标题 + 一块内容」然后结束 | **每节只有一层语域**。杂志的一节是「导语 → 主体 → 边注/尾注」三层；只有一层时，段落再多也只是并排的模块，密度是均匀的低 |
| 2 | 01 旅程索引区是空的；03 照片只有 4 张；04 笔记 2 行 | **数据稀疏时没有降级版式**。结构是按"以后一两千张"设计的，现在被空槽撑开。"不充盈"的直接原因是**空槽**，不是缺板块 |
| 3 | 所有图都裁成 4:3（`styles.css:376-384`）；旅程封面裁成 21:9（`page.css:112-121`） | **比例单一**。竖图被裁掉 2/3，满而不美。而 `/api/site` 已经返回 `width`/`height`（`src/index.js:188`），前端从未使用 |
| 4 | 4 张照片在首页出现 4 轮（相纸 / 胶片条 / 墙 / 地图弹窗） | **素材复用没有限额**。小数据集下，"再看一遍同一张"读起来就是空 |

---

## 1. 反堆砌的四条硬规则

任何新增块先过这四条，过不了就不加：

- **R1 不新增段落。** 首页固定 6 段：刊头 / 目录条 / 01 旅程 / 02 地图 / 03 照片 / 04 笔记 / 页脚。新内容一律进入现有段落的第二语域。
- **R2 一段最多三种语域**（标题 / 主体 / 边注或尾注），全站底色只有三种（`--bg` / `--bg-soft` / `--text`）。
- **R3 一张照片同屏最多 2 次。** 分配：刊头取最新 3 张 → 胶片条取"非刊头"的 8 张 → 墙取"非前两者"的 120 张；不足时**砍掉中间那层（胶片条）**，不要循环。
- **R4 图片按真实比例落位**（读 `width/height`），只有每 5 张里的 1 张"相纸"允许裁切。

---

## 2. 通用组件（改一次，六页受益）

### C1 `.flow` 照片流（取代 `.wall--mosaic`）

**为什么换掉错版墙**：`.wall--mosaic`（`layout.css:180-192`）用 12 列 + `nth-child(12n+4)/(12n+8)` 给两项 `span 6`，实际排布是 `4+4+4` / `6+4+4=14 溢出` / … → **每 12 张就有 2 列空洞**，且位置固定。这在读者眼里不是"错版"，是排版错误。

```css
.flow { display: flex; flex-wrap: wrap; gap: 8px; }
.flow__item { margin: 0; flex-grow: var(--r); flex-basis: 0; height: var(--rh, 260px); }
.flow__item img { width: 100%; height: 100%; object-fit: cover; display: block; }
.flow__item--paper { padding: 7px 7px 0; background: #fffefb; border: 1px solid var(--line); }
.flow__item--paper img { height: calc(100% - 7px); }
/* 图注不占行高：悬停/聚焦时以 chip 浮在左下，与刊头 .coord 同款 */
.flow__cap { position: absolute; left: 10px; bottom: 10px; opacity: 0; transition: .2s; }
.flow__item:hover .flow__cap, .flow__item:focus-within .flow__cap { opacity: 1; }
```

**JS 算法**（约 30 行，`public/flow.js`）：给定容器宽 `W`、`gap=8`、目标行高 `H`（桌面 260 / 平板 210 / 手机 150），按 `w/h` 累加比例 `r`，当 `H * Σr + gap*(n-1) >= W` 时闭行，回写 `--r` 与 `--rh`。行尾自然齐平，永不空洞。

**稀疏态**（`items.length < 6 || W < 640`）：改为 `grid-template-columns: repeat(2, 1fr)`，每张 `aspect-ratio: var(--ar)` 用真实比例，**首张 `grid-column: span 2`**。4 张照片时是「一大 + 两小」的一屏，而不是 4 个同尺寸方块。

**相纸配额**：每 5 张第 1 张 `.flow__item--paper`（当前是 2/12，看起来像随机）。

### C2 灯箱 v2（`public/lightbox.js`，六页共用）

现在 `home.js:36-75` 与 `pages.js:42-74` 是两份实现，且已经分叉（前者有 Tab 陷阱，后者没有）。合并后补齐：

| 能力 | 规格 |
| --- | --- |
| 上一张 / 下一张 | `←` `→` + 屏幕左右半区点击 + 30px pointer swipe；`←` 到第一张时不循环（避免误以为还有） |
| 计数 | `.lightbox__idx`「3 / 148」，12px，右下角，`--muted` |
| 元信息 | `.lightbox__bar`：地点 + 日期 + 「这一趟 →」（有 `trip_id` 时） |
| 预载 | 打开时 `new Image().src = next.key_web` |
| 焦点 | 打开记 `opener`；关闭回原缩略图（按索引取，不是按 `document.activeElement`） |
| 触屏 | 底部 56px 安全区，`touch-action: pan-y` |

**这是"照片多却看起来少"的根因**：现在只能"点开—关掉—再点"，无法连续看，2000 张和 4 张的浏览体验一样贫。

### C3 数据语域三件套

- `.stats-strip`：`display:grid; grid-template-columns: repeat(4,1fr)`，格间 1px 竖线；每格「宋体 24px 数字 + 12px 说明」（日期 / 天数 / 张数 / 地点数）。子页页头与旅程详情共用。
- `.legend`：地点索引的紧凑形态。每行「地名（左）+ 数量（右对齐）+ 60px 宽度条（`--accent-soft` 底、`--accent` 填充，宽度 = 数量 / 最大值）」。**一屏内同时给出"哪几个地方"和"各多少"，是地图段最省力的填充。**
- `.fan`：横向 `scroll-snap` 的 8 张 160×120 缩略图条 + 尾部「看全部 34 张 →」。用于地图选中态、年份轴、旅程段尾。

---

## 3. 首页：五个现有板块各加一层

不加段落，只把每段的"下半身"补上。

### ① 目录条 —— 加数字（`.toc__stat`）
`grid-template-rows` 改 `auto auto auto`；第三行 12px `--muted`：`12 趟` / `138 个点` / `1 240 张` / `12 篇`。
效果：首屏之后的第一屏从"4 个箭头"变成"本期要目"，且零新数据（前端可算）。

### ② 01 旅程 —— 双态 + 年份轴
- **稀疏态（`trips.length <= 3`，当前就是这个）**：`.feature` 保持 7/5，右栏在摘要下补两块：
  - `.feature__moments`：3 张 1:1（72px）+ 地名 chip ——「这一趟的三个瞬间」；
  - `.feature__days`：按 `shot_at` 分天，最多 5 行，每行「08.14 周五 · 3 张 · 丽江古城」，12px，行间细线。
  索引区不再留 `<div></div>`，整段变成「一大图 + 叙事栏」。
- **富态（≥ 4 趟）**：`.trip-index` 改 3/9 —— 左 3 列 `position:sticky` 年份（宋体 48px + 当年趟数），右 9 列两栏；每年首条 `.card--flat--lead` 跨两栏、16:9 封面。
- **两态共有 · 段尾 `.years`**：横向年份轴，每年一格「年份（宋体 24px）+ 当年张数 + 1 张代表图（4:3）」，末格「全部 →」。这是首页唯一缺的"时间跨度"可视化——刊头 meta 写着「第一张照片 2019」，但页面上看不到 2019。
- **修 bug**：`home.js:195-212` 的 `<article class="card--flat">` 没有任何 `<a>`，**首页旅程索引现在点不动**。
- **加出口**：段尾一行「不在旅程里的照片 87 张 →」`/photos.html`（`trip_id IS NULL`，schema 已支持）。

### ③ 02 地图 —— 从"一张图"到"图版 + 数据栏"
`grid-template-columns: 4fr 8fr`：
- 左：`.legend` 前 6 个地点 + 底部一行「共 138 点 · 43 个地点 · 最近落点 2026-08-14 丽江」；
- 右：`.map` 高 520，外套 `.plate--map`（4px 白边 + 1px `--line` + 阴影），与相纸同一语汇；
- 右上角 `.coord`：地图中心经纬度（鼠标移动时更新，`requestAnimationFrame` 节流）。**"手记"的味道来自这种小读数，不是来自花纹。**

### ④ 03 照片 —— 去重 + 换流
- 胶片条**只在总数 ≥ 8 时出现**，且取"非刊头"的照片（R3）；
- 墙改 `.flow`（C1），目标行高 260；
- 段尾 `.head__more` 已有张数，补「全部 →」。

### ⑤ 04 笔记 —— 最新一篇要有图
`grid-template-columns: 4fr 8fr`：左 4 列最新一篇封面（4:3，`.plate` 相纸），右 8 列「标题（宋体 21px）+ 摘要 + 日期 · 阅读 6 分钟」，其下 2–3 行列表（现有 `.note-row`），段尾「全部 12 篇 →」。
现在这段是 1180px 宽里两行 96px 的短文本，是首页最空的一屏。

### ⑥ 页脚 —— 换成"年终数字"
四栏不变，"本期"栏改成 2×2 小统计：`26 趟 / 1 240 张 / 43 个地方 / 8 年`。深色段从"链接集合"变成"合上书时的总结"。

---

## 4. 四个子页：各自缺的那一块

### `/journeys.html` 缺「骨架」与「出口」
| 缺 | 骨架 |
| --- | --- |
| 年份 rail（上一版设计了，未实现：现在 `pages.js:165-167` 把年份做成流内 `.year-head`） | `.sheet` 3/9：左 sticky 年份（`--fs-4xl` 宋体 + 当年趟数），右 `.rows`。移动端 rail 折叠为顶部 chips（44px 高，横滑） |
| 每行的"体量" | 右侧三行：`N 张` / `N 天` / `N 个地点`（天数 = `end-start+1`，前端可算）；首行缩略图 240×135（16:9），其余 168×126 |
| 年度小结 | 年份头右侧一行 12px：「2026 · 4 趟 · 23 天 · 312 张 · 9 个地方」 |
| 「日常」出口 | 末尾固定一组 `.daily`：「不在任何旅程里的照片 · 87 张」→ `/photos.html`（`trip_id IS NULL`） |
| 状态 | `end_date` 为空 → 「进行中」；`start_date` 晚于今天 → 「计划中」（`.badge` 已有样式） |

### `/journey.html` 缺「顺序」与「到达方式」
1. **`.stats-strip`**（日期 / 天数 / 张数 / 地点数）——现在只有 `page-head__meta` 一行小字。
2. **按天分组**：`photos` 按 `shot_at` 分天，每天 `.day-head`（`08.14 周五 · 丽江古城 · 3 张`）+ 一段 `.flow`。**一趟 40 张照片，平铺是"一堆"，按天是"一次旅行"**——这是旅程页最缺的结构。
3. **轨迹线**：点数 ≥ 3 时按 `shot_at` 连 `L.polyline(pts, { color:'#9d4630', weight:1.5, dashArray:'4 6', opacity:.55 })`，起终点各一个小圆。`segments` 表可以先不用，照片点连起来就有"走过"的感觉。
4. **`.journey-how`「怎么到的」**：航班/车次 + 起降地 + 时长 + 打码票图。**需要后台**（见 §5）。
5. hero 按 `width/height` 选 `21/9` 或 `4/5`，竖构图封面不再被裁。
6. pager 加 72×54 封面 + 日期，才像"翻"，而不是两个文字链接。

### `/photos.html` 缺「导航」与「密度变化」
1. **`.filter-bar` 吸顶**（`top: var(--nav-h)`）：`[全部] [2026] [2025] …` + 旅程下拉 + 排序。状态写进 URL（`?year=&trip=`），可分享、可后退。**现在完全没有筛选。**
2. **月份组首图跨两格**（`.flow` 稀疏态的首张 span 2）：每月一眼能认出"这个月的主图"，2000 张不再全是等大格子。
3. **分批**：`pages.js:296-311` 一次性 `host.innerHTML = html`，2000 张会同时插 2000 个节点。改 `BATCH = 120` + `IntersectionObserver` 自动续（`home.js:264, 283-307` 已有可复用实现）。
4. **灯箱上下张**（C2）——相册页没有它，等于只有"缩略图"没有"看照片"。
5. 有坐标的照片加一个 `.coord` 小角标，点它去 `/map.html?focus=<id>`，把相册和地图连起来。

### `/map.html` 缺「选中之后看什么」
现在点地点 → `flyTo` + 开一个弹窗（`pages.js:345-359`），照片没有出路；整页 90% 是 OSM 底色。

1. **选中态结果区**：`.twocol` 380/1fr，地图 `position: sticky; top: calc(var(--nav-h) + 16px); height: calc(100svh - var(--nav-h) - 32px)`；点地点后，地图下方（或侧栏底部）出现 `.fan`：8 张缩略图 + 「看这个地点的全部 34 张 → `/photos.html?place=丽江古城`」。
2. **列表升级**：`.place-list` 每行加 36×36 缩略图 + `.legend` 的宽度条；按年份分组（`<details>` 折叠，无 JS 也能用）。
3. **图例行**：页头统计之外，地图左上角一块纸片：「138 个点 · 43 个地点 · 2019—2026」。
4. **未定位提示**：`pinned < total` 时一行「另有 12 张没有坐标 → 去管理页点位置」。
5. 移动端：地点列表现在在地图**上方**，地图被推到 700px 以下；改为地图在下、chips 横滑在上。

### `/notes.html`（顺手）
`index.html:136-151` 与 `notes.html:39-54` 是**两份硬编码的同一份列表**，必然漂移。改为 `public/notes/index.json`（`{slug,title,date,summary,tags,trip_id,cover}`），两页共读；列表加年份分组 + 标签 chips + 每篇首图。

---

## 5. 数据与后台：哪些必须配合

| # | 事项 | 现状 | 要做什么 | 阻塞谁 |
| --- | --- | --- | --- | --- |
| D1 | `width` / `height` | **已返回**（`src/index.js:188`），前端未用 | 前端直接用，无需后台 | 无（C1 的前置条件已满足） |
| D2 | `/api/site` 全量 | 一次返回全部照片 11 个字段；`pages.js:371-374` 在 `initX` 之后**又 fetch 一次**只为算页脚 | ① 每页只 fetch 一次（把 `data` 传进 `colophonStats`）；② 加 `?slim=1`（去 `caption`/`key_web`），2000 张时体积约 −45%；③ 返回 `aggregates`：`byYear / byMonth / byPlace / byTrip / bounds` | 目录条数字、筛选 chips、年份轴 |
| D3 | 地点归一化 | `place` 是自由文本（手填或反查） | 2000 张必然出现「丽江 / 丽江市 / 云南·丽江」。加 `photos.place_key` + `places` 表（名称、坐标、封面），或至少在写库时归一 | **地图页列表、首页"地点数"都会碎**；越晚做越贵 |
| D4 | 票据 / 轨迹 | `schema.sql:43-78` 有 `tickets`、`segments` 表，**但 `/api/site` 不返回，`admin.js` 零处引用**（`src/index.js` 只在上传 blob 时认 `kind='ticket'`） | `/api/site` 增 `tickets`（按 trip 分组、`passenger` 打码）+ `segments.geojson`；`admin` 加录入表单 | `/journey` 的「怎么到的」、真轨迹 |
| D5 | 相册分页 | `/api/photos` 支持 `?trip=`，`LIMIT 5000`，无 `offset`/`total` | 加 `offset`，返回 `total` | 「再看 120 张」、筛选计数 |
| D6 | 笔记索引 | 两份硬编码 HTML | `public/notes/index.json`（静态文件，不需后台） | 首页笔记段、`/notes` |
| D7 | sitemap | 只有 `/` + 2 篇笔记 | 补 `journeys.html`、`map.html`、`photos.html`、`notes.html`、`about`；以后用 `scripts/gen-sitemap.mjs` 从 `/api/site` 生成 | SEO |
| D8 | 旅程页 SEO | `/journey.html?trip=` 是纯客户端渲染 | 若要被收录，需 `src/index.js` 对 `/journey/<id>` 服务端拼 meta（P2 提过，仍未做） | 收录 |

---

## 6. 优先级

### R1 · 组件层（约 1 天，改动集中，六个页面同时变）
1. `public/flow.js` + `.flow`（C1），替换首页墙、`/photos`、`/journey` 三处的 `.wall--mosaic`；稀疏态一并做。
2. `public/lightbox.js` + 灯箱 v2（C2），六页 `<script>` 顺序调整；删掉 `home.js` / `pages.js` 里的两份旧实现。
3. `.stats-strip` / `.legend` / `.fan` 三个类进 `layout.css`（纯新增，不动旧 token）。

**验收**：1440 宽下 4 张照片的首页照片段无空洞；相册页任意一张可 `←/→` 连续看到最后一张；灯箱关闭后焦点回到原缩略图。

### R2 · 每页结构补全（约 2–3 天，纯前端）
4. 首页：目录条数字 + 01 双态 + 年份轴 + 修 `<a>` bug + 地图左栏 + 笔记首图。
5. `/journey`：`.stats-strip` + 按天分组 + polyline + hero 比例。
6. `/photos`：筛选条（URL 状态）+ 月首大图 + 分批渲染。
7. `/map`：选中态 `.fan` + sticky 地图 + 列表缩略图/条 + 未定位提示。
8. `/journeys`：3/9 年份 rail + 天数/地点 + 日常出口。
9. `/notes`：读 `notes/index.json`。

**验收**：每段至少两种语域；同一张照片同屏 ≤ 2 次；1440×900 下任意段落的垂直空白 ≤ 240px；2000 张时不出现一次性 >300 节点插入。

### R3 · 数据与后台（按 D2→D3→D4 顺序）
10. D2（一次 fetch + slim + aggregates）→ 目录条/chips 的数字才可信。
11. D3（`place_key`）→ 地图页与统计才有意义。
12. D4（tickets/segments + admin）→ `/journey` 的「怎么到的」。
13. D7（sitemap）。

---

## 7. 顺手要修的既有缺陷

| 位置 | 问题 |
| --- | --- |
| `home.js:205-211` | 旅程索引是 `<article>`，**没有链接**，首页第二屏点不动 |
| `layout.css:180-192` | `.wall--mosaic` 的 `span 6` 组合每 12 张留 2 列空洞（`6+4+4=14` 溢出） |
| `styles.css:376-384` | 所有墙图 `aspect-ratio: 4/3` 硬裁，竖图损失 2/3；`width/height` 已在手里没用 |
| `page.css:112-121` | 旅程 hero 固定 `21/9`，竖构图封面被裁 |
| `pages.js:371-374` | 每页 fetch `/api/site` 两次 |
| `pages.js:296-311` | 相册一次性 `innerHTML`，2000 张会卡 |
| `pages.js:42-74` vs `home.js:36-75` | 灯箱两份实现已分叉（Tab 陷阱只在首页有） |
| `public/sitemap.xml` | 缺 4 个子页 |

---

## 8. 不做的事（避免堆砌）

- 不加第 7 个首页段落；不加装饰性角花、纹理、多层阴影。
- 不在浅色段之间引入第三种浅底。
- 不为了填满而编造数据（"最北点""总里程"要等 `segments` 或至少 `place_key` 可信后再上）。
- 不引入外链字体 / CDN / 构建步骤——本轮全部是 `.css` 与两个新 `.js`。
