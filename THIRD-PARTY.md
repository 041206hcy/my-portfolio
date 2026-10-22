# 第三方资源与许可

本站（`personal-site/`）是纯静态站点，没有构建步骤。除下列资源外，全部为本项目自有代码。

## React Bits（动效组件）

- 上游：<https://github.com/DavidHDev/react-bits> —— 「The largest open-source library of animated, interactive, and customizable React & Next.js components」
- 许可：**MIT + Commons Clause License Condition v1.0**，Copyright (c) 2026 David Haz
- 许可要点（原文摘录）：
  - 「Permission is hereby granted, free of charge … to use, copy, modify, merge, publish, and distribute the Software **as part of an application, website, or product**」
  - 「You may use this Software, including for any commercial purpose, **so long as you do not sell, sublicense, or redistribute the components themselves — whether alone, in a bundle, or as a ported version.**」
  - 工具（Background Studio / Texture Lab / Shape Magic / Center Stage / Sound Lab）与音效库同样不得单独再分发，也不得作为托管服务提供。
  - 「THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND」
- 本站的使用方式：上游是 React 组件库，本站是零构建的静态站点，因此把 4 个组件的**行为**移植成原生 JS/CSS，**作为本站（应用）的一部分**使用，保留上述许可与版权声明。完整许可文本见 <https://github.com/DavidHDev/react-bits/blob/main/LICENSE.md>。
- 移植清单（保留的原默认值写在文件头注释里）：

| 上游组件 | 分类 | 移植到 | 用在哪 |
| --- | --- | --- | --- |
| CountUp | TextAnimations | `public/reactbits.js` → `countUp()` + `.rb-blurtext` 无关 | 刊头统计数字、方法卡数字 |
| BlurText | TextAnimations | `public/reactbits.js` → `blurText()` + `public/reactbits.css` | 刊头大标题（中文按「字」切分） |
| GlareHover（streak） | Animations | `public/reactbits.js` → `glare()` + `public/reactbits.css` | 刊头三张相纸 |
| ClickSpark | Animations | `public/reactbits.js` → `clickSpark()` + `.rb-spark` | 全站点击火花（砖红） |

- 改编说明：原实现依赖 React 与 `motion/react`；移植版用 `requestAnimationFrame` + `IntersectionObserver` 实现同样的时间曲线与常量，颜色改为本站的纸白／砖红，`prefers-reduced-motion` 时按上游同样降级（计数直接落终值、BlurText 不动、掠光不扫、火花退化为 320ms 线性）。Upstream 的 `color-mix()` 渐变改为等价的 `rgba()` 以便更老的浏览器也能渲染。

## 其它运行时依赖（自托管，非本站代码）

| 资源 | 版本 | 许可 | 位置 |
| --- | --- | --- | --- |
| Leaflet | 1.9.4 | BSD-2-Clause | `public/vendor/leaflet.js` / `leaflet.css` / `images/` |
| Leaflet.markercluster | 1.5.3 | MIT | `public/vendor/leaflet.markercluster.js` / `MarkerCluster.css` / `MarkerCluster.Default.css` |
| exifr | 7.1.3 | MIT | `public/vendor/exifr.js` |
| 字体 | — | — | 不下载字体，标题用系统宋体、正文用系统黑体 |

## 地图数据

- 底图瓦片：OpenStreetMap 公共瓦片服务（`https://tile.openstreetmap.org/`）。
- 瓦片版权归 OpenStreetMap 贡献者所有，遵循 ODbL；地图角落标注「© OpenStreetMap contributors」。公共瓦片有使用政策，流量变大时应换成自建或商业瓦片源（`public/pages.js` 里 `mountMap()` 的 `tileUrl` 是配置项）。