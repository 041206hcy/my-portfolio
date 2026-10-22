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
          href: '/journeys',
          name: '旅行',
          desc: '照片按地点落在地图上，点开能看当天走过的路线。',
          meta: stats.photos ? `${stats.trips} 趟 · ${stats.photos} 张照片` : '还没有照片',
        },
        { href: '/about', name: '关于我', desc: '我是谁、做过什么、怎么联系。', meta: '一页看完' },
      ]);
    $('sections').innerHTML = cards
      .map(
        (c, i) => `<a class="cell${i === cards.length - 1 ? ' cell--wide' : ''}" href="${esc(c.href)}" data-rb="glare" data-rb-opacity="0.22">
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
          (p) => `<a class="row" href="/p/${esc(p.id)}">
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
              `<a href="/journeys" title="${esc(p.place || p.caption || '')}"><img src="/img/${esc(p.key_thumb || '')}" alt="${esc(
                p.place || p.caption || '照片'
              )}" loading="lazy"></a>`
          )
          .join('')}</div>
        <div class="acts"><a class="btn" href="/journeys">看旅程</a><a class="btn" href="/map">打开地图</a><a class="btn" href="/photos">照片墙</a></div>`
      : `<div class="empty">旅行这块还空着。传上第一批照片后，这里会出现最新四张；地图、轨迹与票据在 <a href="/journeys">旅行</a> 里。</div>`;

    rendered();
  }

  /* ---------------- 板块页：筛选 + 搜索 + 列表 ---------------- */
  const itemHTML = (p) => `<a class="pitem" href="/p/${esc(p.id)}">
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

  async function initSection() {
    const section = document.body.dataset.section || '';
    navOn('/' + section);
    const params = new URLSearchParams(location.search);
    const state = { tag: params.get('tag') || '', q: params.get('q') || '' };
    const input = $('q');
    if (input) input.value = state.q;

    let all = [];
    try {
      const r = await fetch('/api/posts?section=' + encodeURIComponent(section) + '&limit=200');
      all = (await r.json()).posts || [];
    } catch {
      all = [];
    }

    const tags = [...new Set(all.flatMap((p) => tagsOf(p.tags)))].sort();
    const chips = $('filters');
    chips.innerHTML =
      `<button class="chip" data-tag="">全部</button>` +
      tags.map((t) => `<button class="chip" data-tag="${esc(t)}">${esc(t)}</button>`).join('');

    function render() {
      const q = state.q.trim().toLowerCase();
      const list = all.filter((p) => {
        if (state.tag && !tagsOf(p.tags).includes(state.tag)) return false;
        if (!q) return true;
        return [p.title, p.excerpt, p.tags].some((v) => String(v || '').toLowerCase().includes(q));
      });
      chips.querySelectorAll('.chip').forEach((b) => b.classList.toggle('on', (b.dataset.tag || '') === state.tag));
      $('count').textContent = list.length ? `${list.length} 条${state.tag || q ? ' · 筛选中' : ''}` : '';
      $('list').innerHTML = list.length
        ? list.map(itemHTML).join('')
        : `<div class="empty">${
            all.length ? '这一筛没有内容，换个标签或清掉搜索。' : '这块还空着。'
          }<br>内容写在 <a href="/admin">管理页</a>。</div>`;
      const url = new URL(location.href);
      state.tag ? url.searchParams.set('tag', state.tag) : url.searchParams.delete('tag');
      q ? url.searchParams.set('q', state.q.trim()) : url.searchParams.delete('q');
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

  document.addEventListener('DOMContentLoaded', () => {
    const page = document.body.dataset.page;
    if (page === 'home') initHome();
    else if (page === 'section') initSection();
    else if (page === 'post') initPost();
  });
})();