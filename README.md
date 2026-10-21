# 个人作品集网站 · 从 0 到被搜到

技术形态：**纯静态站点**（HTML + CSS + JS，无框架、无构建、无依赖）。
目标平台：**GitHub 仓库 → Cloudflare Pages 自动部署 → 绑定自有域名**。

选这条路线的原因：静态站不需要服务器、不需要备案、免费额度足够个人站，
而且搜索引擎抓取到的就是最终 HTML（不像 SPA 那样需要额外做预渲染）。

---

## 目录结构

```
personal-site/
├─ public/            ← 部署目录（Cloudflare Pages 的 Build output directory）
│  ├─ index.html      主页
│  ├─ styles.css      样式
│  ├─ app.js          交互（年份、滚动淡入）
│  ├─ 404.html        404 页（Cloudflare Pages 会自动使用）
│  ├─ robots.txt      爬虫规则 + sitemap 地址
│  ├─ sitemap.xml     站点地图（提交给搜索引擎用）
│  └─ assets/
│     └─ favicon.svg
├─ .gitignore
└─ README.md
```

---

## 阶段 A · 本地预览（已完成）

```bash
cd personal-site/public
python -m http.server 8099
```
浏览器打开 <http://127.0.0.1:8099>。也可以直接双击 `public/index.html`。

---

## 阶段 B · 推送到 GitHub

本机现状：git 2.56 已装，但**没有配身份、没有 SSH key、没有 gh CLI**。

**B1. 配置 git 身份（只需一次）**

```bash
git config --global user.name "你的名字"
git config --global user.email "你的邮箱"
```

**B2. 安装并登录 GitHub CLI（推荐，省掉手工配 key 和建仓库）**

```bash
winget install --id GitHub.cli -e     # 装完重开终端
gh auth login                          # 选 GitHub.com → HTTPS → Login with a web browser
```

**B3. 初始化并推送**

```bash
cd personal-site
git init -b main
git add .
git commit -m "init: personal portfolio site"
gh repo create my-portfolio --public --source=. --push
```

不想装 gh 的话：在 GitHub 网页新建一个空仓库，然后

```bash
git remote add origin https://github.com/你的用户名/my-portfolio.git
git branch -M main
git push -u origin main
```
（密码处填 **Personal Access Token**，不是账号密码：GitHub → Settings → Developer settings → Personal access tokens → Fine-grained → 勾选该仓库的 Contents 读写。）

---

## 阶段 C · Cloudflare Pages 部署

1. 注册/登录 <https://dash.cloudflare.com>
2. 左侧 **Workers & Pages** → **Create** → **Pages** → **Connect to Git**
3. 授权 GitHub，选中刚推的 `my-portfolio` 仓库
4. 构建设置**照抄**：
   - Framework preset：`None`
   - Build command：**留空**
   - Build output directory：`public`
5. **Save and Deploy** → 1 分钟内拿到 `https://my-portfolio.pages.dev`

以后每次 `git push`，Cloudflare 自动重新部署。**不需要备案**（服务器在境外）。

---

## 阶段 D · 绑定自有域名

**D1. 买域名，两条路**

- **Cloudflare Registrar**（推荐）：成本价、无溢价、NS 天然在 Cloudflare。Dashboard → **Domain Registration** → **Register Domains**。需要绑卡/PayPal。
- **阿里云 / 腾讯云**：支付宝方便、.com 首年便宜，但**续费贵**，且买完要自己做 D2 的 NS 切换。

**D2. 把域名接入 Cloudflare**（在 Cloudflare 买的跳过）

Cloudflare Dashboard → **Add a site** → 输入域名 → 选 Free 套餐 → 它会给你两个 NS，
去域名注册商后台把 NS 改成这两个 → 等 5 分钟到 24 小时生效。

**D3. 在 Pages 上挂域名**

Pages 项目 → **Custom domains** → **Set up a custom domain** → 填 `yourdomain.com`（再重复一次填 `www.yourdomain.com`）
→ Cloudflare 自动加 DNS 记录、自动签发 HTTPS 证书。全程零配置。

---

## 阶段 E · 让别人真正"搜到"（这一步决定成败）

**E1. 替换占位符**（全站搜索 `YOUR-` 和 `YOUR-DOMAIN.com`）

| 文件 | 要改的 |
| --- | --- |
| `public/index.html` | canonical、og:url、og:image、JSON-LD 里的 url、邮箱、GitHub 链接 |
| `public/robots.txt` | Sitemap 地址 |
| `public/sitemap.xml` | `<loc>` 地址 |

同时放两张图：
- `public/assets/avatar.jpg` —— 头像（正方形，≥400×400）
- `public/assets/og-cover.jpg` —— 分享卡片图（**1200×630**），发到微信/QQ 群会显示这张

**E2. 提交到搜索引擎**

- **Google Search Console**：<https://search.google.com/search-console> → 添加资源 → 选「网址前缀」→ 用 HTML 标记验证 → **站点地图**里提交 `sitemap.xml`
- **Bing Webmaster Tools**：<https://www.bing.com/webmasters> → 可直接从 GSC 导入 → 同样提交 sitemap
- **百度搜索资源平台**：<https://ziyuan.baidu.com> → 添加站点 → 文件验证（把给的 txt 放到 `public/` 下）→ 普通收录 → 提交 sitemap
  ⚠️ 百度对境外托管、无备案的站抓取很慢，可能数周不收录。想快就得走国内云 + 备案。

**E3. 制造外链（最有效的一步）**

搜索引擎靠**别的网站链接到你**来发现和信任你的站。零外链的新域名可能几个月不被收录。
最低成本的做法：

- 把域名写进 **GitHub 个人主页 README**、仓库 About 的 Website 字段
- 知乎 / CSDN / 小红书 / B 站的个人简介挂上域名
- 换朋友的友情链接
- 简历、论文致谢、邮件签名里写上域名

**E4. 验证是否被收录**

在 Google / Bing / 百度搜：

```
site:yourdomain.com
```

有结果 = 已收录。**预期时间**：Google 几天到 2 周；Bing 类似；百度 1–4 周甚至更久。

**E5. 加分项**

- 写 2–3 篇原创技术文章（哪怕是项目复盘），长文本内容是搜索排名的主要抓手
- 保持更新（`sitemap.xml` 的 `<lastmod>` 要跟着改）

---

## 隐私提醒

个人网页是**公开可搜索**的。不要放：学号、身份证号、手机号、家庭住址、未公开的研究数据。
邮箱建议用专门对外的一个，或者写成 `name [at] example.com` 降低爬虫抓取。

---

## 常用维护命令

```bash
# 本地预览
cd personal-site/public && python -m http.server 8099

# 改完内容发布
cd personal-site
git add . && git commit -m "update: 新增项目" && git push
```

推送后 Cloudflare 自动部署，约 1 分钟生效；如没更新，去 Pages 项目里 **Retry deployment** 或清一下 Cloudflare 缓存。