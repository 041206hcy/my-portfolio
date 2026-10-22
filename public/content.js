/* 个人主页前端：名片首页 / 板块页 / 文章页 三合一。
   只读公开接口，不含任何写操作——写入口只有 /admin（带管理口令）。
   页面用 <body data-page="home|section|post"> 区分，板块页再用 data-section 指明哪一块。 */
(() => {
  const $ = (id) => document.getElementById(id);
  const esc = (s) =>
    String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtDate = (v) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v || ''));
    return m ? `${m[2]}-${m[3]}` : '';
  };
  const fmtFull = (v) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v || ''));
    return m ? `${m[1]}-${m[2]}-${m[3]}` : '';
  };
  const tagsOf = (t) =>
    String(t || '')
      .split(/[,，]/)
      .map((s) => s.trim())
      .filter(Boolean);
  const SECTION_SHORT = { life: '生活', learn: '学习', work: '作品', media: '书影音', skill: '技能' };

  const navOn = (href) => {
    document.querySelectorAll('.nav__links a').forEach((a) => {
      a.classList.toggle('on', href != null && a.getAttribute('href') === href);
    });
  };
  const rendered = () => document.dispatchEvent(new CustomEvent('site:rendered'));

  /* ---------------- 首页：名片 ---------------- */
  async function initHome() {
    navOn('/');
    let data = {};
    try {
      data = await (await fetch('/api/site')).json();
    } catch {
      data = {};
    }
    const sections = data.sections || [];
    const latest = data.latest || [];
    const stats = data.stats || { photos: 0, trips: 0, pinned: 0 };
    const copy = data.copy || {};

    if (copy.lede) $('hero-lede').textContent = copy.lede;

    // 一眼看板：只放算得出来的数字
    const contentTotal = sections.reduce((n, s) => n + (s.count || 0), 0);
    const railRows = [
      { label: '内容', n: contentTotal, unit: '条' },
      { label: '旅行', n: stats.trips, unit: '趟 · ' + stats.photos + ' 张' },
      { label: '已定位照片', n: stats.pinned, unit: '张' },
    ];
    const newest = latest[0] && (latest[0].posted_at || '');
    $('rail').innerHTML =
      railRows
        .map(
          (r) =>
            `<div class="rail__row"><b>${esc(r.label)}</b><span><b data-rb="countup">${esc(String(r.n))}</b> ${esc(r.unit)}</span></div>`
        )
        .join('') +
      `<div class="rail__row"><b>最近更新</b><span>${esc(newest ? fmtFull(newest) : '还没有')}</span></div>`;

    $('portrait').innerHTML =
      `<img src="assets/avatar.jpg" alt="黄翀与" loading="lazy" onerror="this.remove();document.getElementById('portrait').innerHTML='<span>形象位 4:3</span>'">`;

    // 板块入口：5 个可写的板块 + 旅行 + 关于
    const cards = sections
      .map((s) => ({
        href: s.href,
        name: s.name,
        desc: s.desc,
        meta: s.count ? `${s.count} 条 · 最近 ${fmtFull(s.latest) || '—'}` : '还没有内容',
      }))
      .concat([
        {
          href: '/travel',
          name: '旅行',
          desc: '照片按地点落在地图上，点开能看当天走过的路线。',
          meta: stats.photos ? `${stats.trips} 趟 · ${stats.photos} 张照片` : '还没有照片',
        },
        { href: '/about', name: '关于我', desc: '我是谁、做过什么、怎么联系。', meta: '一页看完' },
      ]);
    $('sections').innerHTML = cards
      .map(
        (c, i) => `<a class="cell${i === cards.length - 1 ? ' cell--wide' : ''}" href="${esc(c.href)}" data-rb="glare tilt reveal" data-rb-opacity="0.22">
        <span class="cell__no">${String(i + 1).padStart(2, '0')}</span>
        <h3 class="cell__t">${esc(c.name)}</h3>
        <p class="cell__d">${esc(c.desc)}</p>
        <div class="cell__m">${esc(c.meta)}</div>
      </a>`
      )
      .join('');
    $('sections-note').textContent = cards.length + ' 个入口';

    // 最近三条混流
    if (latest.length) {
      $('latest').innerHTML = latest
        .map(
          (p) => `<a class="row" href="/p/${esc(p.id)}" data-rb="reveal" data-rb-delay="0">
        <span class="row__d">${esc(fmtDate(p.posted_at))}</span>
        <span class="row__k">${esc(SECTION_SHORT[p.section] || p.section)}</span>
        <span class="row__t">${esc(p.title)}</span>
      </a>`
        )
        .join('');
      const btn = $('hero-latest');
      btn.href = '/p/' + latest[0].id;
      const t = String(latest[0].title || '');
      btn.textContent = '读最新一篇 · ' + (t.length > 12 ? t.slice(0, 12) + '…' : t);
    } else {
      $('latest').innerHTML =
        `<div class="empty"><b>还没有内容。</b>第一篇会出现在这里——去 <a href="/admin">管理页</a>写一条生活记录，或写一篇学习笔记。</div>`;
      $('hero-latest').hidden = true;
    }

    // 旅行入口：最新四张缩略图 + 三条去路
    const photos = (data.photos || []).slice(-4).reverse();
    $('travel-note').textContent = stats.photos ? `${stats.trips} 趟 · ${stats.photos} 张照片` : '还没有照片';
    $('travel').innerHTML = photos.length
      ? `<div class="strip">${photos
          .map(
            (p) =>
              `<a href="/travel" data-rb="tilt" data-rb-tilt="2.2" title="${esc(p.place || p.caption || '')}"><img src="/img/${esc(p.key_thumb || '')}" alt="${esc(
                p.place || p.caption || '照片'
              )}" loading="lazy"></a>`
          )
          .join('')}</div>
        <div class="acts"><a class="btn" href="/travel">看旅程</a><a class="btn" href="/travel/map">打开地图</a><a class="btn" href="/travel/photos">照片墙</a></div>`
      : `<div class="empty">旅行这块还空着。传上第一批照片后，这里会出现最新四张；地图、轨迹与票据在 <a href="/travel">旅行</a> 里。</div>`;

    rendered();
  }

  /* ---------------- 板块页：筛选 + 搜索 + 列表 ---------------- */
  const itemHTML = (p) => `<a class="pitem" href="/p/${esc(p.id)}" data-rb="glare tilt reveal">
      <span class="pitem__d">${esc(fmtFull(p.posted_at))}</span>
      <span>
        <h2 class="pitem__t">${esc(p.title)}</h2>
        ${p.excerpt ? `<p class="pitem__x">${esc(p.excerpt)}</p>` : ''}
        ${
          tagsOf(p.tags).length
            ? `<span class="pitem__tags">${tagsOf(p.tags).map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</span>`
            : ''
        }
      </span>
    </a>`;

  /* ---------------- 板块视图：清单 / 项目网格 / 书目清单 / 技能分组 ---------------- */
  // 板块给不同的版式，不是一个模板复制五遍；extra 里放着各板块的结构化字段
  const VIEW = { life: 'list', learn: 'list', work: 'grid', media: 'rows', skill: 'groups' };

  /* ---------------- 检索三件套：标签云 / 年表 / 清单-网格切换 ---------------- */
  // 视图选择按板块记在浏览器里；'rich' = 这一块本来的版式，'flat' = 统一清单
  const LS_VIEW = 'photosite-view-';
  const NATURAL_NAME = { grid: '网格', rows: '书目', groups: '分组', list: '卡片' };
  const viewOf = (section) => {
    const saved = localStorage.getItem(LS_VIEW + section);
    if (saved === 'rich' || saved === 'flat') return saved;
    return (VIEW[section] || 'list') === 'list' ? 'flat' : 'rich';
  };
  const tagCounts = (posts) => {
    const m = new Map();
    posts.forEach((p) => tagsOf(p.tags).forEach((t) => m.set(t, (m.get(t) || 0) + 1)));
    return [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh'));
  };
  const yearCounts = (posts) => {
    const m = new Map();
    posts.forEach((p) => {
      const y = String(p.posted_at || '').slice(0, 4);
      if (/^\d{4}$/.test(y)) m.set(y, (m.get(y) || 0) + 1);
    });
    return [...m].sort((a, b) => b[0].localeCompare(a[0]));
  };
  function renderYearbar(host, years, state, onPick) {
    if (!host) return;
    if (years.length < 2) {
      host.innerHTML = '';
      host.hidden = true;
      return;
    }
    host.hidden = false;
    host.innerHTML =
      `<button class="chip" data-year="">全部年份</button>` +
      years.map(([y, n]) => `<button class="chip" data-year="${esc(y)}">${esc(y)} <b>${n}</b></button>`).join('');
    const paint = () => host.querySelectorAll('.chip').forEach((b) => b.classList.toggle('on', (b.dataset.year || '') === state.year));
    paint();
    host.onclick = (e) => {
      const b = e.target.closest('.chip');
      if (!b) return;
      state.year = b.dataset.year || '';
      paint();
      onPick(state.year);
    };
  }
  function renderViewToggle(host, section, state, onChange) {
    if (!host) return;
    const natural = VIEW[section] || 'list';
    const opts = [
      { v: 'rich', label: NATURAL_NAME[natural] },
      { v: 'flat', label: '清单' },
    ];
    host.innerHTML = opts
      .map((o) => `<button type="button" data-mode="${o.v}" class="${state.mode === o.v ? 'on' : ''}">${esc(o.label)}</button>`)
      .join('');
    host.onclick = (e) => {
      const b = e.target.closest('[data-mode]');
      if (!b) return;
      state.mode = b.dataset.mode;
      localStorage.setItem(LS_VIEW + section, state.mode);
      host.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x.dataset.mode === state.mode));
      onChange();
    };
  }
  // 搜索建议：标题/标签/摘要里命中就出，↑↓ 选，Enter 直接进
  function suggestFor(input, host, posts) {
    if (!input || !host) return;
    let idx = -1;
    const hide = () => {
      host.hidden = true;
      host.innerHTML = '';
      idx = -1;
    };
    const match = (v) => {
      const q = String(v || '').trim().toLowerCase();
      if (!q) return [];
      return posts.filter((p) => [p.title, p.tags, p.excerpt].some((x) => String(x || '').toLowerCase().includes(q))).slice(0, 6);
    };
    const paint = (list) => {
      if (!list.length) return hide();
      host.hidden = false;
      host.innerHTML = list
        .map(
          (p) =>
            `<a href="/p/${esc(p.id)}"><span class="s-k">${esc(SECTION_SHORT[p.section] || '')}</span><span class="s-t">${esc(
              p.title
            )}</span><span class="s-d">${esc(fmtFull(p.posted_at))}</span></a>`
        )
        .join('');
      idx = -1;
    };
    input.addEventListener('input', () => paint(match(input.value)));
    input.addEventListener('keydown', (e) => {
      if (host.hidden) return;
      const items = [...host.querySelectorAll('a')];
      if (!items.length) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        idx = (idx + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
        items.forEach((a, i) => a.classList.toggle('on', i === idx));
      } else if (e.key === 'Enter' && idx >= 0) {
        e.preventDefault();
        e.stopPropagation();
        location.href = items[idx].getAttribute('href');
      } else if (e.key === 'Escape') {
        hide();
      }
    });
    document.addEventListener('click', (e) => {
      if (!host.contains(e.target) && e.target !== input) hide();
    });
  }
  const EX = (p) => {
    // 服务端一般已经把 extra 解成对象；这里再兜一层，兼容它原样是 JSON 字符串的情况
    let e = p ? p.extra : null;
    if (typeof e === 'string' && e.trim()) {
      try {
        e = JSON.parse(e);
      } catch {
        e = null;
      }
    }
    return e && typeof e === 'object' && !Array.isArray(e) ? e : {};
  };
  const coverOf = (p) => {
    const k = p.cover_key || EX(p).cover || '';
    return k ? '/img/' + encodeURIComponent(k) : '';
  };
  const linkOf = (p) => {
    const e = EX(p);
    const u = e.link || e.repo || '';
    return /^https?:\/\//.test(String(u)) ? String(u) : '';
  };

  const workHTML = (p) => {
    const e = EX(p);
    const cover = coverOf(p);
    const href = linkOf(p);
    const meta = [e.role, e.year, e.status].filter(Boolean).map(esc).join(' · ');
    const tags = tagsOf(p.tags).map((t) => `<span class="tag">${esc(t)}</span>`).join('');
    return `<div class="pcard" data-rb="glare tilt reveal">
      <a class="pcard__hit" href="/p/${esc(p.id)}" aria-label="${esc(p.title)}"></a>
      ${
        cover
          ? `<span class="pcard__fig"><img src="${esc(cover)}" alt="" loading="lazy"></span>`
          : `<span class="pcard__fig pcard__fig--blank"><span>${esc(String(e.year || '').slice(0, 4) || 'PROJ')}</span></span>`
      }
      <span class="pcard__b">
        <span class="pcard__k">${esc(e.year || fmtDate(p.posted_at))}</span>
        <h2 class="pcard__t">${esc(p.title)}</h2>
        ${p.excerpt ? `<p class="pcard__x">${esc(p.excerpt)}</p>` : ''}
        ${meta ? `<span class="pcard__m">${meta}</span>` : ''}
        ${tags ? `<span class="pcard__tags">${tags}</span>` : ''}
      </span>
      ${href ? `<a class="pcard__out" href="${esc(href)}" target="_blank" rel="noopener">打开项目 ↗</a>` : ''}
    </div>`;
  };

  const KIND = { book: '书', film: '影', tv: '剧', music: '音', podcast: '播客', game: '游戏' };
  const mediaHTML = (p) => {
    const e = EX(p);
    const kind = KIND[String(e.kind || '').toLowerCase()] || e.kind || '记录';
    const n = Math.max(0, Math.min(5, Math.round(Number(e.rating) || 0)));
    const stars = n ? '★'.repeat(n) + '☆'.repeat(5 - n) : '';
    const by = [e.creator, e.year].filter(Boolean).map(esc).join(' · ');
    return `<a class="mrow" href="/p/${esc(p.id)}" data-rb="reveal" data-rb-delay="0">
      <span class="mrow__k">${esc(kind)}</span>
      <span class="mrow__b">
        <span class="mrow__t">${esc(p.title)}</span>
        ${by ? `<span class="mrow__c">${by}</span>` : ''}
        ${p.excerpt ? `<span class="mrow__x">${esc(p.excerpt)}</span>` : ''}
      </span>
      <span class="mrow__r">${stars ? `<span class="mrow__s">${stars}</span>` : ''}${
        e.progress ? `<b>${esc(e.progress)}</b>` : ''
      }</span>
    </a>`;
  };

  const skillHTML = (p) => {
    const e = EX(p);
    return `<a class="sitem" href="/p/${esc(p.id)}" data-rb="glare tilt reveal">
      <span class="sitem__t">${esc(p.title)}</span>
      ${e.level ? `<span class="sitem__l">${esc(e.level)}</span>` : ''}
      ${p.excerpt ? `<span class="sitem__x">${esc(p.excerpt)}</span>` : ''}
    </a>`;
  };

  async function initSection() {
    const section = document.body.dataset.section || '';
    navOn('/' + section);
    const params = new URLSearchParams(location.search);
    const state = {
      tag: params.get('tag') || '',
      q: params.get('q') || '',
      year: params.get('year') || '',
      mode: viewOf(section),
    };
    const input = $('q');
    if (input) input.value = state.q;

    let all = [];
    try {
      const r = await fetch('/api/posts?section=' + encodeURIComponent(section) + '&limit=200');
      all = (await r.json()).posts || [];
    } catch {
      all = [];
    }

    const chips = $('filters');
    chips.innerHTML =
      `<button class="chip" data-tag="">全部 <b>${all.length}</b></button>` +
      tagCounts(all)
        .map(([t, n]) => `<button class="chip" data-tag="${esc(t)}">${esc(t)} <b>${n}</b></button>`)
        .join('');
    renderYearbar($('yearbar'), yearCounts(all), state, () => render());
    renderViewToggle($('viewtoggle'), section, state, () => render());
    suggestFor(input, $('suggest'), all);

    function render() {
      const q = state.q.trim().toLowerCase();
      const list = all.filter((p) => {
        if (state.tag && !tagsOf(p.tags).includes(state.tag)) return false;
        if (state.year && String(p.posted_at || '').slice(0, 4) !== state.year) return false;
        if (!q) return true;
        return [p.title, p.excerpt, p.tags].some((v) => String(v || '').toLowerCase().includes(q));
      });
      chips.querySelectorAll('.chip').forEach((b) => b.classList.toggle('on', (b.dataset.tag || '') === state.tag));
      const active = [state.tag, state.year, state.q.trim()].filter(Boolean);
      $('count').textContent = list.length ? `${list.length} 条${active.length ? ' · 筛选中' : ''}` : '';
      const host = $('list');
      const natural = VIEW[section] || 'list';
      host.className = 'plist view-' + state.mode;
      const emptyHTML = `<div class="empty">${
        all.length ? '这一筛没有内容，换个标签或清掉搜索。' : '这块还空着。'
      }<br>内容写在 <a href="/admin">管理页</a>。</div>`;
      if (!list.length) {
        host.innerHTML = emptyHTML;
      } else if (state.mode === 'flat') {
        host.innerHTML = list.map(itemHTML).join('');
      } else if (natural === 'grid') {
        host.innerHTML = `<div class="pgrid">${list.map(workHTML).join('')}</div>`;
      } else if (natural === 'rows') {
        host.innerHTML = list.map(mediaHTML).join('');
      } else if (natural === 'groups') {
        const groups = new Map();
        list.forEach((p) => {
          const k = EX(p).group || tagsOf(p.tags)[0] || '其他';
          if (!groups.has(k)) groups.set(k, []);
          groups.get(k).push(p);
        });
        host.innerHTML = [...groups]
          .map(
            ([k, arr]) =>
              `<section class="sgroup" data-rb="reveal" data-rb-delay="0">
                 <h2 class="sgroup__k">${esc(k)}<span>${arr.length}</span></h2>
                 <div class="sgroup__items">${arr.map(skillHTML).join('')}</div>
               </section>`
          )
          .join('');
      } else {
        host.innerHTML = `<div class="qgrid">${list.map(itemHTML).join('')}</div>`;
      }
      const url = new URL(location.href);
      const put = (k, v) => (v ? url.searchParams.set(k, v) : url.searchParams.delete(k));
      put('tag', state.tag);
      put('year', state.year);
      put('q', state.q.trim());
      history.replaceState(null, '', url);
    }

    chips.addEventListener('click', (e) => {
      const b = e.target.closest('.chip');
      if (!b) return;
      state.tag = b.dataset.tag || '';
      render();
    });
    const form = $('search');
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        state.q = input ? input.value : '';
        render();
      });
      if (input) {
        input.addEventListener('input', () => {
          state.q = input.value;
          render();
        });
      }
    }
    render();
    rendered();
  }

  /* ---------------- 文章页 ---------------- */
  const inline = (s) =>
    esc(s)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" rel="noopener">$1</a>');

  function proseHTML(body) {
    const lines = String(body || '')
      .replace(/\r\n/g, '\n')
      .split('\n');
    const out = [];
    let mode = null;
    let buf = [];
    const flush = () => {
      if (!buf.length) return;
      if (mode === 'ul') out.push('<ul>' + buf.map((l) => `<li>${inline(l)}</li>`).join('') + '</ul>');
      else if (mode === 'ol') out.push('<ol>' + buf.map((l) => `<li>${inline(l)}</li>`).join('') + '</ol>');
      else if (mode === 'pre') out.push('<pre><code>' + esc(buf.join('\n')) + '</code></pre>');
      else if (mode === 'quote') out.push('<blockquote>' + buf.map((l) => inline(l)).join('<br>') + '</blockquote>');
      buf = [];
    };
    for (const raw of lines) {
      const line = raw.replace(/\s+$/, '');
      if (/^```/.test(line)) {
        flush();
        mode = mode === 'pre' ? null : 'pre';
        continue;
      }
      if (mode === 'pre') {
        buf.push(line);
        continue;
      }
      if (/^\s*$/.test(line)) {
        flush();
        mode = null;
        continue;
      }
      if (/^###\s+/.test(line)) {
        flush();
        mode = null;
        out.push('<h3>' + inline(line.replace(/^###\s+/, '')) + '</h3>');
        continue;
      }
      if (/^##\s+/.test(line)) {
        flush();
        mode = null;
        out.push('<h2>' + inline(line.replace(/^##\s+/, '')) + '</h2>');
        continue;
      }
      if (/^>\s?/.test(line)) {
        if (mode !== 'quote') {
          flush();
          mode = 'quote';
        }
        buf.push(line.replace(/^>\s?/, ''));
        continue;
      }
      if (/^[-*]\s+/.test(line)) {
        if (mode !== 'ul') {
          flush();
          mode = 'ul';
        }
        buf.push(line.replace(/^[-*]\s+/, ''));
        continue;
      }
      if (/^\d+[.)]\s+/.test(line)) {
        if (mode !== 'ol') {
          flush();
          mode = 'ol';
        }
        buf.push(line.replace(/^\d+[.)]\s+/, ''));
        continue;
      }
      flush();
      mode = null;
      out.push('<p>' + inline(line) + '</p>');
    }
    flush();
    return out.join('\n');
  }

  async function initPost() {
    // id 可能来自 ?id=，也可能来自漂亮地址 /p/<id>（Worker 内部重写后地址栏仍是 /p/<id>）
    const id =
      new URLSearchParams(location.search).get('id') ||
      (location.pathname.match(/^\/p\/([a-z0-9]{4,64})\/?$/) || [])[1] ||
      '';
    const host = $('post');
    if (!id) {
      host.innerHTML = `<div class="empty">这条链接没带文章 id。<a href="/">回首页</a></div>`;
      return;
    }
    let post = null;
    try {
      const r = await fetch('/api/post?id=' + encodeURIComponent(id));
      if (r.ok) post = (await r.json()).post;
    } catch {
      post = null;
    }
    if (!post) {
      host.innerHTML = `<div class="empty"><b>没找到这篇。</b>它可能被删了，或者可见性改成了「仅自己」。<br><br><a class="btn" href="/">回首页</a></div>`;
      return;
    }
    const short = SECTION_SHORT[post.section] || post.section;
    document.title = post.title + ' · 黄翀与';
    // 文章页是 /p/<id>，canonical 得指向真地址（外壳里写的是站点根）
    const canon = document.querySelector('link[rel="canonical"]');
    if (canon) canon.setAttribute('href', location.origin + '/p/' + post.id);
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) metaDesc.setAttribute('content', post.excerpt || post.title);
    host.innerHTML = `
      <header class="post-head">
        <p class="label">${esc(short)} · ${esc(fmtFull(post.posted_at) || '未标日期')}</p>
        <h1>${esc(post.title)}</h1>
        ${post.excerpt ? `<p class="hero__lede">${esc(post.excerpt)}</p>` : ''}
        ${
          tagsOf(post.tags).length
            ? `<div class="post-meta">${tagsOf(post.tags).map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>`
            : ''
        }
      </header>
      <article class="prose">${proseHTML(post.body)}</article>
      <p class="back"><a class="btn" href="/${esc(post.section)}">← 回到${esc(short)}</a> <a class="btn" href="/">首页</a></p>`;
    navOn('/' + post.section);
    rendered();
  }

  /* ---------------- 全站检索页：板块 + 标签云 + 年份 + 清单/卡片 ---------------- */
  async function initSearch() {
    navOn('/search');
    const params = new URLSearchParams(location.search);
    const state = {
      q: params.get('q') || '',
      section: params.get('section') || '',
      tag: params.get('tag') || '',
      year: params.get('year') || '',
      mode: viewOf('search'),
    };
    const input = $('q');
    if (input) input.value = state.q;

    let all = [];
    let sections = [];
    try {
      const [a, b] = await Promise.all([fetch('/api/posts?limit=500'), fetch('/api/site')]);
      all = (await a.json()).posts || [];
      sections = (await b.json()).sections || [];
    } catch {
      all = [];
    }

    const secHost = $('sc-sections');
    if (secHost) {
      secHost.innerHTML =
        `<button class="chip" data-section="">全部 <b>${all.length}</b></button>` +
        sections
          .map(
            (s) =>
              `<button class="chip" data-section="${esc(s.key)}">${esc(s.name.replace(/(记录|笔记|与项目|与工具箱)$/, ''))} <b>${
                s.count || 0
              }</b></button>`
          )
          .join('');
    }
    const tagHost = $('tagcloud');
    const tags = tagCounts(all);
    if (tagHost) {
      const max = tags.length ? tags[0][1] : 1;
      tagHost.innerHTML = tags
        .slice(0, 28)
        .map(([t, n]) => {
          const size = n >= max ? 3 : n > 1 ? 2 : 1;
          return `<button type="button" class="tagpill" data-tag="${esc(t)}" data-size="${size}">${esc(t)}<i>${n}</i></button>`;
        })
        .join('');
    }
    renderYearbar($('yearbar'), yearCounts(all), state, () => render());
    renderViewToggle($('viewtoggle'), 'search', state, () => render());
    suggestFor(input, $('suggest'), all);

    function render() {
      const q = state.q.trim().toLowerCase();
      const list = all.filter((p) => {
        if (state.section && p.section !== state.section) return false;
        if (state.tag && !tagsOf(p.tags).includes(state.tag)) return false;
        if (state.year && String(p.posted_at || '').slice(0, 4) !== state.year) return false;
        if (!q) return true;
        return [p.title, p.excerpt, p.tags].some((v) => String(v || '').toLowerCase().includes(q));
      });
      if (secHost) secHost.querySelectorAll('.chip').forEach((b) => b.classList.toggle('on', (b.dataset.section || '') === state.section));
      if (tagHost) tagHost.querySelectorAll('.tagpill').forEach((b) => b.classList.toggle('on', (b.dataset.tag || '') === state.tag));
      const active = [state.section, state.tag, state.year, state.q.trim()].filter(Boolean);
      $('count').textContent = all.length ? `${list.length} / ${all.length} 条${active.length ? ' · 筛选中' : ''}` : '';
      const host = $('list');
      host.className = 'plist view-' + state.mode;
      if (!all.length) {
        host.innerHTML = `<div class="empty">还没有内容。<br>内容写在 <a href="/admin">管理页</a>。</div>`;
      } else if (!list.length) {
        host.innerHTML = `<div class="empty">没有匹配的。换个词，或者点掉筛选。</div>`;
      } else if (state.mode === 'rich') {
        host.innerHTML = `<div class="qgrid">${list.map(itemHTML).join('')}</div>`;
      } else {
        host.innerHTML = list.map(itemHTML).join('');
      }
      const url = new URL(location.href);
      const put = (k, v) => (v ? url.searchParams.set(k, v) : url.searchParams.delete(k));
      put('q', state.q.trim());
      put('section', state.section);
      put('tag', state.tag);
      put('year', state.year);
      history.replaceState(null, '', url);
      const kw = state.q.trim();
      document.title = (kw ? kw + ' · ' : '') + '搜索 · 黄翀与';
    }

    if (secHost) {
      secHost.addEventListener('click', (e) => {
        const b = e.target.closest('.chip');
        if (!b) return;
        state.section = b.dataset.section || '';
        render();
      });
    }
    if (tagHost) {
      tagHost.addEventListener('click', (e) => {
        const b = e.target.closest('.tagpill');
        if (!b) return;
        const t = b.dataset.tag || '';
        state.tag = state.tag === t ? '' : t;
        render();
      });
    }
    const form = $('search');
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        state.q = input ? input.value : '';
        render();
      });
      if (input) {
        input.addEventListener('input', () => {
          state.q = input.value;
          render();
        });
      }
    }
    render();
    rendered();
  }

  document.addEventListener('DOMContentLoaded', () => {
    const page = document.body.dataset.page;
    if (page === 'home') initHome();
    else if (page === 'section') initSection();
    else if (page === 'post') initPost();
    else if (page === 'search') initSearch();
    else if (page === 'about') { navOn('/about'); rendered(); }
  });
})();