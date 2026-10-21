# 旅行照片站 · 复合版式设计提案 v1

> 对象：`public/index.html` / `styles.css` / `home.js`
> 目标：从「单页四段平铺」变成「封面式首页 + 4 个独立栏目」，让页面读起来有起承转合，而不是四份清单叠在一起。
> 配套构图稿：`design/wireframe-home.html`（浏览器直接打开，含桌面 / 平板 / 手机三档与节奏图）

---

## 0. 结论先行

1. **拆页**：首页不再是"全部内容"，改为「封面 + 索引」；内容分到 **旅程总览 / 旅程详情 / 照片档案 / 足迹地图 / 关于** 五页，首页每段只露 3–9 条并给出口。
2. **首页 6 段**：封面 → 引文带 → 精选旅程 → 地图带 → 胶片条 → 收束。用「纸 / 深一档纸」交替 + 「窄容器 / 出血带」交替建立节奏，三段间距 96 / 64 / 48。
3. **首屏 7:5 非对称双栏**：左侧报头（文字），右侧一张 4:5 拍立得主照片（白边 8px、-1.5° 微旋、向上出血 24px）。不是全幅大图压字——不依赖某一张神图，文字对比度也稳。
4. **顺手修两个硬伤**：① 旅程卡是死路（`home.js:164` 只有 `<article>`，点不进去）；② `--muted #7a6f61` 与 `--accent #b4543a` 在纸底上都是 **4.44:1**，15px 正文差 0.06 未达 WCAG AA。

---

## 1. 现状评估（按证据说话）

| # | 问题 | 证据 | 后果 |
|---|------|------|------|
| 1 | 四个 section 完全同构 | `index.html:52-66` 四个 `.section`；`.section__title` 统一 21px 宋体 + 44px 砖红短线 + 1px 底线，重复 4 次（`styles.css:150-159`） | 没有主次，读者不知道哪段重要；"四份清单"感就来自这里 |
| 2 | 首屏纯文字，右半空白 | `.hero` 只有 h1/tagline/desc/stats/buttons（`index.html:37-50`）；`.hero__desc` `max-width:640px`（`styles.css:177`）在 `--maxw:1180px`（`styles.css:285`）容器里 | 照片站的首屏没有一张照片；右侧 ~500px 是空的 |
| 3 | 旅程卡是断头路 | `home.js:164-172` 输出 `<article class="trip-card">`，无 `<a>`、无 `href` | 看完封面无处可去，旅程详情根本不存在 |
| 4 | 首页一次画 120 张 | `home.js:177` `BATCH = 120`，`drawMore()` 追加；`index.html:65` 只有一个 `#photo-wall` | 首屏之后是无底洞网格，没有"最新 / 精选"层级，也没有终点感 |
| 5 | 节奏平坦 | 所有 section `padding: 48px 0 8px`（`styles.css:149`）；460px 地图（`styles.css:309`）直接接 170px 照片墙网格（`styles.css:363`） | 相邻两段密度突变却无过渡，视觉上"硬切" |
| 6 | 列线不通 | 旅程 `minmax(280px,1fr)`（`:346`）、照片墙 `minmax(170px,1fr)`（`:363`）、后台 `minmax(132px,1fr)`（`:455`）；容器 1180 + 22px padding（`:147`）与 12 列无对应 | 三套网格各自为政，页面没有统一的纵向骨架 |
| 7 | 导航是锚点不是站点 | `index.html:27-32` 全部 `#map / #trips / #wall`；`/about` 是作品集式 hero（`about.html:46-62`） | 换页后气质断层；搜索引擎只认到 3 个 URL（`sitemap.xml` 只有首页 + 2 篇笔记） |
| 8 | 对比度差 0.06 | `--muted #7a6f61` on `--bg #f7f3ea` = **4.44:1**；`--accent #b4543a` on 纸底同样 **4.44:1**；`--muted` 在卡片 `#fffdf8` 上是 4.83:1 | 15px 正文（`.hero__desc` / `.section__text`）与 17px 砖红链接未达 AA 4.5:1 |
| 9 | 地图无无障碍名 | `index.html:55` `<div class="map" id="map-canvas">`，无 `aria-label` / `tabindex` | 读屏用户遇到一个无名区域，键盘也进不去 |

**保留的好东西**：纸底 + 宋体标题 + 砖红点缀的基调；拍立得白边（`.wall__item`）；灯箱的焦点归还（`home.js:33-55`）；地图瓦片的暖色滤镜（`.leaflet-tile`）。

---

## 2. 信息架构

### 2.1 页面清单

| 路径 | 名称 | 这一页只回答一个问题 | 数据来源 | 状态 |
|------|------|----------------------|----------|------|
| `/` | 首页 · 封面 | 这是谁的旅行，从哪开始看 | `/api/site`（只取精选 8 张 + 最近 3 次旅程） | 重做 |
| `/journeys.html` | 旅程 · 总览 | 一共去过哪几次，按时间排 | `/api/site` 的 `trips` | 新建 |
| `/trip.html?id=…` | 旅程 · 详情 | 这一次到底怎么走的、拍了什么 | 新增 `/api/trips/:id` | 新建 |
| `/photos.html` | 照片 · 档案 | 全部照片，按年 / 旅程 / 地点筛 | `/api/photos`（已支持 `?trip=`） | 新建 |
| `/map.html` | 足迹 · 地图 | 这些点在地球上的哪儿 | `/api/site` | 新建 |
| `/about.html` | 关于 | 拍照片的人是谁 | 静态 | 改写导航与版式 |
| `/admin` | 后台 | — | `/api/admin/*` | 不动 |
| `/404.html` | 404 | — | 静态 | 加导航 |

**路径取舍**：站点是 Worker + `ASSETS`，没有构建步骤。`/trip.html?id=2026-08-lijiang` 零改动即可用；想上干净 URL（`/journeys/2026-08-lijiang`）需要 `src/index.js` 的 `fetch()` 里加一段 rewrite（约 6 行），但内容仍是前端渲染，canonical 只能由 JS 写，对爬虫不友好。**现阶段推荐 query 参数**，等有静态生成再换。

### 2.2 导航与层级

- **全局导航（4 项）**：旅程 / 照片 / 地图 / 关于。品牌回 `/`。当前的「地图 / 旅程 / 照片墙」锚点全部作废——锚点是单页的补丁，多页站不需要。
- **二层导航**：详情页顶部面包屑「旅程 / 2026-08 丽江」。`about.html:34` 现在写的是「← 黄翀与的旅程」，改为统一的面包屑组件。
- **页脚**：三列（栏目索引 / 最近一次旅程 / 联系与版权），替换现在单行 `© …`（`index.html:71`）。
- **每页末尾「下一站」**：详情页 → 下一次旅程 + 回总览；档案页 → 地图；地图页 → 档案。断头路是这类个人站最常见的流失点。

### 2.3 首页 vs 其它页的职责

| | 首页 | 其它页 |
|---|---|---|
| 照片数量 | ≤ 9 张（1 主图 + 3 封面 + 5 胶片） | 全量，分页 / 筛选 |
| 旅程 | 最近 3 次（1 大 2 小） | 全部，按年分组 |
| 交互 | 只负责"引路"，地图不初始化 | 地图 / 筛选 / 灯箱 |
| 首屏性能 | 不加载 Leaflet（约 140KB JS） | 地图页才加载 |

> 首页现在 `<script src="vendor/leaflet.js">` 是同步加载的（`index.html:80-81`），地图在首屏下方 460px 处。改为地图带进入视口再 `ensureMap()`，首屏少两个同步脚本。

---

## 3. 首屏构图

### 3.1 方案对比

| 方案 | 做法 | 优点 | 代价 | 结论 |
|---|---|---|---|---|
| **A 非对称双栏（推荐）** | 左报头文字 7 列，右主照片 5 列 | 文字对比度稳；不依赖单一神图；内容变多也不用重排 | 需要一张够好的竖构图 | ✅ |
| B 全幅照片压字 | 一张大图铺满，文字压在上面 | 冲击力最强 | 需要极强的一张图；文字要加遮罩，纸感会脏 | 备用 |
| C 报头 + 三格拼贴 | 大字在上，下方三张并排 | 最安全、最"索引" | 又回到"平铺"，解决不了单调 | ❌ |

选 A：**照片站的克制**。纸底、宋体、砖红已经定了调，全幅图的戏剧性会和"手记"打架；A 的留白本身就是节奏。

### 3.2 桌面 ≥1024px（像素级）

```
容器 1180 · 左右 padding 32 · 12 列 · 列距 24 · 单列 71px
┌──────────────────────────────────────────────────────────────┐
│  照片 · 旅程 · 坐标        （eyebrow 12 / ls .24em / 砖红）    │
│                                                              │
│  黄翀与的旅程              ┌────────────────────┐            │
│  （宋体 58 / lh 1.16）     │                    │  ← 主照片   │
│  ────                     │   4:5 竖构图        │    451×564 │
│  走到哪儿，拍到哪儿         │   白边 8px          │    ↑ 上移 24│
│  （17 / 砖红 / ls .06）    │   -1.5°             │            │
│                           │                    │            │
│  正文 15px / muted         └────────────────────┘            │
│  最多 34em（≈641px）         大理 · 2026-08 · 30.2°N 100.1°E │
│                                                              │
│  128 张照片 │ 3 次旅程 │ 37 个地点                            │
│  （数字宋体 24，标签 12）                                      │
│                                                              │
│  [ 从最近的旅程开始 ]  [ 翻照片 ]                              │
└──────────────────────────────────────────────────────────────┘
col: 1─────7 (641px)              8────12 (451px)
```

- 栅格：`grid-template-columns: repeat(12, 1fr); gap: 24px;`，文字 `grid-column: 1 / 8`，照片 `grid-column: 8 / 13`。
- 高度：`min-height: clamp(560px, 82vh, 780px)`，内容垂直居中（`align-content: center`）。别再给 `.hero` 写 `padding: 64px 0 24px` 这种上下不对称的值（`styles.css:163`）。
- 字号：h1 `clamp(38px, 4.4vw, 58px)`，`line-height: 1.16`，`letter-spacing: .02em`；eyebrow 12px；tagline 17px；正文 15px / `max-width: 34em`。
- 主照片：
  - 尺寸 451×564（`aspect-ratio: 4/5`），`border: 8px solid #fffdf8`，`border-radius: 2px`。
  - `transform: rotate(-1.5deg) translateY(-24px)`；`box-shadow: 0 24px 48px -28px rgba(43,38,32,.40)`。
  - 图注 12px 右对齐：`大理 · 2026-08 · 30.2°N 100.1°E`，`font-variant-numeric: tabular-nums`。
  - 首图 `fetchpriority="high"`，**不要** `loading="lazy"`（它是 LCP 候选）。
- 背景：纸底维持；在 `.cover` 内加一层 4% 透明度的等高线 SVG（`background-image`，`pointer-events:none`），暗示"地图 / 坐标"，不额外下载图片。
- 可选：右缘竖排一行 `TRAVEL JOURNAL · 2026`（12px / `writing-mode: vertical-rl` / `letter-spacing:.3em` / muted），可删。

### 3.3 平板 640–1023px

单列，顺序：eyebrow → h1 40 → tagline → **照片（16:10 全宽，取消旋转）** → 正文 → 统计 → CTA。照片放正文前，让第一屏仍然先看到照片。

### 3.4 手机 <640px

顺序：h1 34（两行内）→ tagline → 照片 4:3（取消旋转、白边 5px）→ 正文 2–3 行 → 统计（两行，`·` 分隔）→ 两枚按钮**竖排**、高 48px、间距 10px。

**首屏预算（iPhone SE 667px）**：nav 57 + eyebrow 16 + h1 84 + tagline 24 + 照片 244 + CTA 48 + 间距 ≈ 500px → 不滚动就能看到主 CTA。验收线：**667px 高度内必须出现「站点名 + 至少一张照片 + 主 CTA」**。

### 3.5 首屏验收清单

- [ ] 3 秒能答：这是谁、拍什么、从哪开始。
- [ ] 第一屏至少一张照片（照片站不能"先读字后看图"）。
- [ ] 主 CTA 唯一（现在是三个同权重按钮，`index.html:45-49`），其余降为文字链接。
- [ ] 关掉 JS，h1 / 文案 / 统计骨架仍可读（现在的 hero 满足，保持）。
- [ ] LCP 元素 = h1 或主照片；首屏不加载 Leaflet / markercluster。

---

## 4. 栏目顺序与视觉节奏

### 4.1 首页 6 段

| # | 段落 | 目的 | 桌面高度 | 背景 | 容器 | 与上一段间距 |
|---|------|------|----------|------|------|--------------|
| 01 | 封面 Cover | 定位与入口 | `clamp(560px, 82vh, 780px)` | `--bg` + 等高线 | 1180 容器 | — |
| 02 | 引文带 Ledger | 「最近一次旅程」时效锚点 | 88px | `--bg-soft` | **出血** | 0（紧接封面） |
| 03 | 精选旅程 Bento | 叙事入口（1 大 2 小） | ≈ 641px | `--bg` | 1180 容器 | 96 |
| 04 | 地图带 Map band | 空间入口（全站最重交互） | 420px | `--bg-soft` | **出血** | 96 |
| 05 | 胶片条 Filmstrip | 浏览入口（横向流动） | 320px | `--bg` | 出血滚动 / 容器对齐 | 96 |
| 06 | 收束 Colophon | 一句收尾 + 三入口 + 页脚 | ≈ 240px | `--bg` | 1180 容器 | 96 |

> 段落编号 `01 / 02 / 03` 用 12px 等宽字体放在标题左侧，是"手记 / 杂志"最便宜的结构信号——比再加一条红线有效，也避免 `.section__title::after` 重复四次。

### 4.2 间距与节奏规则

- **三种区块间距**：桌面 96px / 平板 64px / 手机 48px（现在统一 48，且是 `padding-top`，导致上紧下松）。
- **块内间距**：标题→内容 24，卡片间 24，图注 8，按钮组 12。
- **明暗交替**：纸 → 深一档 → 纸 → 深一档 → 纸。每两段换一次色，**不要每段都换**（换多了又回到"平铺"）。
- **宽窄交替**：容器 → 出血 → 容器 → 出血 → 容器。`--maxw:1180` 只约束文字与卡片，图像带必须出血，否则整页永远在同一个矩形里。
- **密度三档**：报头（稀疏，留白 ≥55%）→ 卡片（中）→ 地图（开阔）→ 胶片（流动）。相邻两段不能同密度。

### 4.3 为什么是这个顺序

1. **先人后景**：封面回答"这是谁的旅行"，再进入内容；地图若放第 2 段，会在叙事开始前就把人扔进交互组件，且首屏加载 Leaflet 拖慢 LCP。
2. **引文带做接缝**：88px 的深色带把封面与卡片区分开，同时给出"最近一次"的时效锚点——单页站最缺的就是"现在"。
3. **地图放第 4**：它需要 420px 高度和一次网络请求，放在叙事（旅程）之后，读者已经有"去过哪"的概念，地图负责"在哪"。
4. **胶片条收在末尾**：横向滚动是"还没完"的信号，配合末尾"看全部 300 张 →"卡片，把浏览任务交给 `/photos.html`。
5. **每段一个出口**：6 段 = 3 个页面入口（旅程 / 地图 / 照片）+ 1 个"最近"入口，首页因此"满"而不"堵"。

---

## 5. 组件与 Token 增补

### 5.1 Token

```css
:root {
  --fs-5xl: 56px;        /* 首页报头（桌面） */
  --space-24: 96px;      /* 区块间距（桌面） */
  --muted: #6f6455;      /* 原 #7a6f61 → 纸底 5.22:1（原 4.44:1 未达 AA） */
  --accent-ink: #9c452e; /* 砖红的"文字版"：纸底 5.74:1，仅用于链接与 eyebrow */
}
```

- `--accent` 保留给**面**（按钮底、短线、描边）；文字一律用 `--accent-ink`。
- `--muted` 改深后，卡片上的弱化文字仍是 5.6:1 左右，层级不变、可读性变好。

### 5.2 新增/改造组件

| 类名 | 规格 |
|---|---|
| `.cover` | 12 列栅格；`min-height` 见上；等高线背景；`position:relative` |
| `.eyebrow` | 12px / `letter-spacing:.24em` / `--accent-ink` / 上边距 0 |
| `.band` | 出血：`width:100vw; margin-left:calc(50% - 50vw)` |
| `.ledger` | 88px 高，`--bg-soft`，上下 1px `--line`，左侧 3px `--accent` 竖线 |
| `.bento` | 12 列；主卡 `1/8`（图 4:3 + 正文 ≥160px），侧列 `8/13` 两张（图 2:1） |
| `.filmstrip` | `grid-auto-flow:column; grid-auto-columns:280px; gap:20px; overflow-x:auto; scroll-snap-type:x mandatory`；可键盘聚焦（`tabindex="0"` + `role="region"`） |
| `.trip-card`（改造） | 外层 `<a>` 包整卡；`display:block; color:inherit`；hover 封面 `scale(1.03)`；`:focus-visible` 2px `--accent` + 2px offset |
| `.section__head` | 编号 + 标题 + 英文小字（`TRAVELS / ARCHIVE`）；**红线只保留在页面第一个 section** |

### 5.3 关键样式片段（可直接落进 `styles.css`）

```css
.band { width: 100vw; margin-left: calc(50% - 50vw); }

.cover__grid {
  display: grid; grid-template-columns: repeat(12, 1fr); gap: 24px;
  align-items: center; min-height: clamp(560px, 82vh, 780px);
}
.cover__text  { grid-column: 1 / 8; }
.cover__photo { grid-column: 8 / 13; margin: 0; }

.cover__photo img {
  width: 100%; aspect-ratio: 4 / 5; object-fit: cover;
  border: 8px solid #fffdf8; border-radius: 2px;
  box-shadow: 0 24px 48px -28px rgba(43, 38, 32, .40);
  transform: rotate(-1.5deg) translateY(-24px);
}

.bento { display: grid; grid-template-columns: repeat(12, 1fr); gap: 24px; }
.bento__feature { grid-column: 1 / 8; }
.bento__side    { grid-column: 8 / 13; display: grid; gap: 24px; }
.bento__feature .trip-card__cover { aspect-ratio: 4 / 3; height: auto; }
.bento__side    .trip-card__cover { aspect-ratio: 2 / 1;   height: auto; }

/* 旅程卡不再是死路 */
.trip-card__link { display: block; color: inherit; text-decoration: none; }
.trip-card__link:hover .trip-card__cover { transform: scale(1.03); }
.trip-card__cover { transition: transform .25s ease; }
.trip-card__link:focus-visible {
  outline: 2px solid var(--accent); outline-offset: 2px;
}

/* 胶片条：保留白边，但用统一高度让横条对齐 */
.filmstrip {
  display: grid; grid-auto-flow: column; grid-auto-columns: 280px;
  gap: 20px; overflow-x: auto; scroll-snap-type: x mandatory;
  padding: 4px 2px 16px; scrollbar-width: thin;
}
.filmstrip > * { scroll-snap-align: start; }

@media (max-width: 1023px) {
  .cover__grid { grid-template-columns: 1fr; gap: 32px; }
  .cover__text, .cover__photo { grid-column: 1 / -1; }
  .cover__photo img { aspect-ratio: 16 / 10; transform: none; }
  .bento { grid-template-columns: 1fr; }
  .bento__feature, .bento__side { grid-column: 1 / -1; }
}
```

> 注意：`.cover__photo img` 用了 `aspect-ratio`，`<img>` 上仍要写 `width` / `height` 属性（用后端返回的 `p.width/p.height`），否则 CLS 会抖一下。

### 5.4 首页结构（`index.html` 目标形态）

```html
<main>
  <section class="cover"> …01 报头 + 主照片… </section>

  <section class="band ledger"> …最近一次旅程… </section>

  <section class="section" id="journeys">
    <header class="section__head"><span>02</span><h2>走过的路</h2></header>
    <div class="bento" id="featured-trips"></div>
    <p class="section__more"><a href="/journeys.html">全部 3 次旅程 →</a></p>
  </section>

  <section class="band" id="map">
    <div class="band__inner">
      <div class="map-intro">…37 个地点…<a href="/map.html">打开地图 →</a></div>
      <div class="map" id="map-canvas" role="region" aria-label="旅行照片地图"></div>
    </div>
  </section>

  <section class="section" id="frames">
    <header class="section__head"><span>04</span><h2>最近的底片</h2></header>
    <div class="filmstrip" id="filmstrip" tabindex="0" role="region" aria-label="最近照片，可横向滚动"></div>
  </section>

  <section class="section colophon"> …一句收尾 + 三个入口… </section>
</main>
```

`home.js` 相应瘦身：`renderCover()` / `renderLedger()` / `renderFeatured()` / `renderFilmstrip()` 四个函数，各自只吃 3–8 条数据；`drawWall()` 与批量 120 张的逻辑搬到 `/photos.html`。

---

## 6. 无障碍与细节

- **对比度**：`--muted` → `#6f6455`（5.22:1），链接色 → `--accent-ink #9c452e`（5.74:1）。按钮砖红底 + `#fffdf8` 字已是 4.9:1，保留。
- **地图**：`role="region" aria-label="旅行照片地图"` + `tabindex="0"`，让键盘能进 Leaflet 的键盘导航。
- **胶片条**：可横向滚动区域必须能键盘滚动（`tabindex="0"`），并在其内保留真实 `<button>`（现在是 `home.js:186`，保持）。
- **旅程卡**：整卡可点，但内部若再放"看详情"按钮会造成嵌套可交互元素——**整卡只做一个链接**。
- **动效**：`prefers-reduced-motion` 下取消照片旋转与卡片 `scale`；旋转是静态变换，不需要动画。
- **图注**：主照片的图注用 `<figcaption>`，和拍立得一致；`figcaption` 不是装饰，别用 `aria-hidden`。
- **SEO**：每页独立 `title / description / canonical / og:*`；`sitemap.xml` 增补 `/journeys.html`、`/photos.html`、`/map.html`，trip 详情页因是 query 参数暂不进 sitemap（或后续生成静态页再加）。

---

## 7. 落地顺序（4 步，按风险从低到高）

| 步骤 | 内容 | 涉及文件 | 验收 |
|---|---|---|---|
| **P0** | token 修正、旅程卡可点、地图 aria、section 间距 48→96 | `styles.css`、`home.js:164` | 对比度 ≥4.5；卡片能进详情（先指 `/trip.html`） |
| **P1** | 首页 6 段骨架 + 首屏双栏 | `index.html`、`styles.css`、`home.js` | 首屏 667px 内见照片与 CTA；地图未进视口不加载 |
| **P2** | `/journeys.html` + `/trip.html` + `/api/trips/:id` | 新 2 页、`src/index.js` | 首页 → 旅程 → 单次旅程 → 下一站，闭环无死链 |
| **P3** | `/photos.html` + `/map.html` + 导航/页脚/sitemap/404 | 新 2 页、`404.html`、`sitemap.xml` | 导航四项全部可用；无 JS 时文章内容仍可读 |

---

## 8. 需要你拍板的三件事

1. **旅程详情要放多深？** `schema.sql` 已有 `tickets` 与 `segments`（机票/火车票 + 轨迹线），但 `/api/site` 没吐出来。放全 = 详情页最有看头，但要新增接口与轨迹渲染；只放照片 = 一天能上。
2. **URL 形态**：接受 `/trip.html?id=…`（零后端改动），还是加 Worker rewrite 做 `/journeys/:id`（URL 好看，爬虫拿不到内容）。
3. **精选怎么选**：手动（`trips.cover_id` 已支持）还是自动取最近 3 次旅程？手动可控，自动省事。
