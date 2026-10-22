/* 子页公用脚本：旅程索引 / 单次旅程 / 相册 / 大地图
   依赖 body[data-page] 决定渲染哪一页。数据全部来自 /api/site。 */

(() => {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const imgSrc = (key) => (key ? `/img/${key}` : '');
  const api = async (url) => {
    const r = await fetch(url, { headers: { accept: 'application/json' } });
    if (!r.ok) throw new Error(`${r.status} ${url}`);
    return r.json();
  };

  const MONTH = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'];
  const dpart = (s) => (s ? String(s).slice(0, 10) : '');
  const ymd = (s) => {
    const d = dpart(s);
    if (!d) return '';
    const [y, m, day] = d.split('-');
    return `${y}.${m}.${day}`;
  };
  const range = (a, b) => {
    const x = dpart(a), y = dpart(b);
    if (!x) return '';
    if (!y || x === y) return ymd(x);
    return `${ymd(x)} — ${ymd(y)}`;
  };
  const yearOf = (s) => dpart(s).slice(0, 4) || '未标注';
  const monthKey = (s) => dpart(s).slice(0, 7) || '未标注时间';
  const monthLabel = (k) => {
    if (!/^\d{4}-\d{2}$/.test(k)) return k;
    const [y, m] = k.split('-');
    return `${y} 年 ${MONTH[Number(m) - 1]} 月`;
  };

  /* ---------------- 灯箱 ---------------- */
  const box = $('lightbox');
  const boxImg = $('lightbox-img');
  const boxCap = $('lightbox-cap');
  let opener = null;

  const openBox = (key, caption) => {
    if (!box || !key) return;
    boxImg.src = imgSrc(key);
    boxImg.alt = caption || '旅行照片';
    // 计数 + 翻页：相册页没有它就只能看缩略图
    const list = document.querySelectorAll('[data-web]');
    const idx = opener ? Array.prototype.indexOf.call(list, opener) : -1;
    const counter = (list.length > 1 && idx >= 0) ? `${caption ? ' · ' : ''}${idx + 1}/${list.length}` : '';
    boxCap.textContent = (caption || '') + counter;
    box.hidden = false;
    document.documentElement.style.overflow = 'hidden';
    ($('lightbox-close') || box).focus({ preventScroll: true });
  };
  const stepBox = (dir) => {
    if (!box || box.hidden) return;
    const list = Array.from(document.querySelectorAll('[data-web]'));
    if (!list.length) return;
    const i = list.indexOf(opener);
    const n = list[((i < 0 ? 0 : i + dir) + list.length) % list.length];
    if (!n) return;
    opener = n;
    openBox(n.dataset.web, n.dataset.cap || '');
  };
  const closeBox = () => {
    if (!box || box.hidden) return;
    box.hidden = true;
    boxImg.src = '';
    document.documentElement.style.overflow = '';
    if (opener && document.contains(opener)) opener.focus({ preventScroll: true });
  };

  if (box) {
    document.addEventListener('click', (e) => {
      const hit = e.target.closest ? e.target.closest('[data-web]') : null;
      if (hit) {
        e.preventDefault();
        opener = hit;
        openBox(hit.dataset.web, hit.dataset.cap || '');
        return;
      }
      if (e.target === box || e.target.closest('.lightbox__close')) closeBox();
    });
    document.addEventListener('keydown', (e) => {
      if (box.hidden) return;
      if (e.key === 'Escape') { closeBox(); return; }
      if (e.key === 'ArrowRight') { e.preventDefault(); stepBox(1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); stepBox(-1); }
    });
  }

  /* ---------------- 地图 ---------------- */
  const tile = () => L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> 贡献者',
    className: 'osm-tile',
  });

  function popupHtml(p) {
    const cap = p.caption || p.place || '旅行照片';
    return `<div class="pop">
      <button class="pop__open" type="button" data-web="${esc(p.key_web)}" data-cap="${esc(cap)}">
        <img src="${esc(imgSrc(p.key_thumb))}" alt="" loading="lazy">
      </button>
      <div class="pop__body">
        <strong>${esc(p.place || '未标注地点')}</strong>
        <p class="pop__meta">${esc(p.caption || '')}${p.caption && p.shot_at ? ' · ' : ''}${esc(ymd(p.shot_at))}</p>
      </div>
    </div>`;
  }

  function mountMap(el, pts, opts = {}) {
    if (!el || !window.L) return null;
    const map = L.map(el, { scrollWheelZoom: !!opts.scroll, zoomControl: true });
    tile().addTo(map);
    const group = L.markerClusterGroup({ showCoverageOnHover: false, maxClusterRadius: 46 });
    pts.forEach((p) => {
      const m = L.marker([p.lat, p.lng], { title: p.place || '', alt: p.place || '照片位置' });
      m.bindPopup(popupHtml(p), { maxWidth: 280, className: 'pop-wrap' });
      m.on('popupopen', () => { if (opts.onOpen) opts.onOpen(p); });
      group.addLayer(m);
    });
    map.addLayer(group);
    if (pts.length === 1) map.setView([pts[0].lat, pts[0].lng], 11);
    else if (pts.length > 1) map.fitBounds(L.latLngBounds(pts.map((p) => [p.lat, p.lng])), { padding: [48, 48] });
    else map.setView([31.2, 107.5], 4);
    return { map, group };
  }

  const pinned = (photos) => photos.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));

  /* ---------------- 日期：给单次旅程按天分组用 ---------------- */
  const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  const dayLabel = (d) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
    const dt = new Date(`${d}T12:00:00`);
    return `${d.slice(5).replace('-', '.')} ${WEEK[dt.getDay()]}`;
  };
  // 优先用旅程的起止日期算天数；没有起止日期就数有照片的天数
  const tripDays = (trip, photos) => {
    const has = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));
    if (has(trip.start_date) && has(trip.end_date)) {
      const a = new Date(`${trip.start_date}T12:00:00`);
      const b = new Date(`${trip.end_date}T12:00:00`);
      const n = Math.round((b - a) / 86400000) + 1;
      return n > 0 ? n : 0;
    }
    return new Set(photos.map((p) => String(p.shot_at || '').slice(0, 10)).filter(Boolean)).size;
  };
  const shotDay = (p) => String(p.shot_at || '').slice(0, 10) || '未知日期';
  const flowItem = (p) => {
    const cap = p.caption || p.place || '旅行照片';
    const ar = (p.width && p.height) ? (p.width / p.height) : 4 / 3;
    return `<figure class="flow__item" style="flex-grow:${ar.toFixed(3)};flex-basis:${Math.round(ar * 190)}px">
      <button class="flow__open" type="button" data-web="${esc(p.key_web)}" data-cap="${esc(cap)}" aria-label="查看大图：${esc(cap)}">
        <img src="${esc(imgSrc(p.key_thumb))}" alt="" loading="lazy">
      </button>
      <figcaption><span>${esc(p.place || '')}</span><span>${esc(ymd(p.shot_at))}</span></figcaption>
    </figure>`;
  };

  /* ---------------- 首页通用尾巴 ---------------- */
  function stampYear() {
    const y = $('year');
    if (y) y.textContent = String(new Date().getFullYear());
  }

  function colophonStats(data) {
    const el = $('colophon-stats');
    if (!el) return;
    const n = data.photos.length;
    const places = new Set(data.photos.map((p) => p.place).filter(Boolean)).size;
    el.textContent = `${n} 张照片 · ${places} 个地点 · ${data.trips.length} 次旅程`;
  }

  /* ---------------- 旅程索引 ---------------- */
  async function initJourneys() {
    const host = $('journey-rows');
    if (!host) return;
    const data = await api('/api/site');
    const byTrip = new Map();
    for (const p of data.photos) {
      if (!p.trip_id) continue;
      byTrip.set(p.trip_id, (byTrip.get(p.trip_id) || 0) + 1);
    }
    const byId = new Map(data.photos.map((p) => [p.id, p]));

    const trips = [...data.trips].sort((a, b) =>
      String(b.start_date || '').localeCompare(String(a.start_date || '')));

    const stat = $('page-stats');
    if (stat) {
      const years = new Set(trips.map((t) => yearOf(t.start_date)).filter((y) => /^\d{4}$/.test(y)));
      stat.innerHTML = `<span><b>${trips.length}</b> 次旅程</span>
        <span><b>${data.photos.length}</b> 张照片</span>
        <span><b>${years.size}</b> 个年份</span>`;
    }

    if (!trips.length) {
      host.innerHTML = `<div class="empty"><b>还没有旅程</b>去上传几张照片，标好位置，就会自动攒成一趟。</div>`;
      return;
    }

    const daysOf = (t) => {
      const ok = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));
      if (!ok(t.start_date) || !ok(t.end_date)) return 0;
      const n = Math.round((new Date(`${t.end_date}T12:00:00`) - new Date(`${t.start_date}T12:00:00`)) / 86400000) + 1;
      return n > 0 ? n : 0;
    };
    const tripPhotos = new Map();
    for (const p of data.photos) {
      if (!p.trip_id) continue;
      if (!tripPhotos.has(p.trip_id)) tripPhotos.set(p.trip_id, []);
      tripPhotos.get(p.trip_id).push(p);
    }
    const years = [...new Set(trips.map((t) => yearOf(t.start_date)).filter((y) => /^\d{4}$/.test(y)))];

    // 年份 rail：年份多了以后，列表需要一个骨架
    const rail = years.length > 1
      ? `<nav class="rail" aria-label="按年份跳转">
          <p class="rail__title">年份</p>
          ${years.map((y) => `<a href="#y${esc(y)}"><span>${esc(y)}</span><b>${trips.filter((t) => yearOf(t.start_date) === y).length}</b></a>`).join('')}
        </nav>`
      : '';

    let rows = '';
    let curYear = null;
    for (const t of trips) {
      const y = yearOf(t.start_date);
      if (y !== curYear) {
        curYear = y;
        const list = trips.filter((x) => yearOf(x.start_date) === y);
        const nPhotos = list.reduce((s, x) => s + (tripPhotos.get(x.id) || []).length, 0);
        rows += `<div class="year-head" id="y${esc(y)}">
          <span class="year-head__no">${esc(y)}</span>
          <span class="year-head__line"></span>
          <span class="year-head__count">${list.length} 次 · ${nPhotos} 张</span>
        </div>`;
      }
      const cover = byId.get(t.cover_id) || data.photos.find((p) => p.trip_id === t.id);
      const mine = tripPhotos.get(t.id) || [];
      const places = new Set(mine.map((p) => p.place).filter(Boolean)).size;
      const days = daysOf(t);
      const side = [
        `${mine.length} 张照片`,
        days ? `${days} 天` : '',
        places ? `${places} 个地点` : '',
      ].filter(Boolean);
      rows += `<a class="row-trip" href="/journey.html?trip=${encodeURIComponent(t.id)}">
        <div class="row-trip__thumb">${cover ? `<img src="${esc(imgSrc(cover.key_thumb))}" alt="" loading="lazy">` : ''}</div>
        <div>
          <p class="row-trip__title">${esc(t.title || '未命名旅程')}</p>
          <p class="row-trip__sub">${esc(t.subtitle || '')}</p>
          <p class="row-trip__desc">${esc(t.summary || '')}</p>
        </div>
        <div class="row-trip__side">
          <b>${side.join(' · ')}</b><br>${esc(range(t.start_date, t.end_date))}
          <span class="row-trip__arrow" aria-hidden="true">→</span>
        </div>
      </a>`;
    }

    // 日常出口：schema 里 trip_id 为空就是「不在任何旅程里」的照片，之前全站没有落点
    const loose = data.photos.filter((p) => !p.trip_id);
    const tail = loose.length
      ? `<a class="loose" href="/photos.html?f=loose">
          <span class="loose__title">不在任何旅程里的照片</span>
          <span class="loose__meta">${loose.length} 张 · 日常随手拍的都在这里</span>
          <span class="row-trip__arrow" aria-hidden="true">→</span>
        </a>`
      : '';

    host.innerHTML = rail
      ? `<div class="sheet"><div class="c-3">${rail}</div><div class="c-9">${rows}${tail}</div></div>`
      : `${rows}${tail}`;
  }

  /* ---------------- 单次旅程 ---------------- */
  async function initJourney() {
    const id = new URLSearchParams(location.search).get('trip');
    const data = await api('/api/site');
    const trips = [...data.trips].sort((a, b) =>
      String(b.start_date || '').localeCompare(String(a.start_date || '')));
    const idx = trips.findIndex((t) => t.id === id);
    const trip = idx >= 0 ? trips[idx] : null;
    const titleEl = $('trip-title');
    const subEl = $('trip-sub');
    const descEl = $('trip-desc');
    const metaEl = $('trip-meta');
    const heroEl = $('trip-hero');
    const wallEl = $('trip-wall');
    const pagerEl = $('trip-pager');

    if (!trip) {
      if (titleEl) titleEl.textContent = '没找到这趟旅程';
      if (descEl) descEl.textContent = '链接可能过期了，回旅程列表看看。';
      if (wallEl) wallEl.innerHTML = '';
      if (heroEl) heroEl.hidden = true;
      return;
    }

    document.title = `${trip.title || '旅程'} · 黄翀与的旅程`;
    if (titleEl) titleEl.textContent = trip.title || '未命名旅程';
    if (subEl) subEl.textContent = trip.subtitle || '';
    if (descEl) descEl.textContent = trip.summary || '';
    const photos = data.photos.filter((p) => p.trip_id === trip.id)
      .sort((a, b) => String(a.shot_at || '').localeCompare(String(b.shot_at || '')));

    if (metaEl) {
      const places = new Set(photos.map((p) => p.place).filter(Boolean)).size;
      const days = tripDays(trip, photos);
      metaEl.innerHTML = `<div class="stats-strip">
          <div><b>${esc(range(trip.start_date, trip.end_date))}</b><span>日期</span></div>
          ${days ? `<div><b>${days}</b><span>天</span></div>` : ''}
          <div><b>${photos.length}</b><span>张照片</span></div>
          <div><b>${places}</b><span>个地点</span></div>
        </div>`;
    }

    const byId = new Map(photos.map((p) => [p.id, p]));
    const cover = byId.get(trip.cover_id) || photos[0];
    if (heroEl && cover) {
      heroEl.innerHTML = `<div class="journey-hero__img">
          <img src="${esc(imgSrc(cover.key_web))}" alt="${esc(cover.place || trip.title || '')}">
        </div>
        <div class="journey-hero__cap"><span>${esc(cover.place || '')}</span><span>${esc(ymd(cover.shot_at))}</span></div>`;
    } else if (heroEl) {
      heroEl.hidden = true;
    }

    if (wallEl) {
      if (!photos.length) {
        wallEl.innerHTML = `<div class="empty"><b>这趟还没照片</b>去管理页把它们归进这趟旅程。</div>`;
      } else {
        // 按天分组：40 张平铺是「一堆」，按天才是「一次旅行」
        const days = new Map();
        for (const p of photos) {
          const d = shotDay(p);
          if (!days.has(d)) days.set(d, []);
          days.get(d).push(p);
        }
        let html = '';
        for (const [d, list] of days) {
          const places = [...new Set(list.map((p) => p.place).filter(Boolean))].slice(0, 2).join(' · ');
          html += `<div class="day-head">
            <span class="day-head__date">${esc(dayLabel(d))}</span>
            <span class="day-head__line"></span>
            <span class="day-head__count">${places ? `${esc(places)} · ` : ''}${list.length} 张</span>
          </div><div class="flow">${list.map(flowItem).join('')}</div>`;
        }
        wallEl.innerHTML = html;
      }
    }

    const pts = pinned(photos);
    const mapEl = $('trip-map');
    if (mapEl) {
      if (pts.length) {
        const mounted = mountMap(mapEl, pts);
        // 点数够就连一条虚线，把「先到哪、后到哪」画出来（不必等轨迹表）
        if (mounted && pts.length >= 3) {
          const ordered = pts.slice().sort((a, b) =>
            String(a.shot_at || '').localeCompare(String(b.shot_at || '')));
          L.polyline(ordered.map((p) => [p.lat, p.lng]), {
            color: '#b4543a', weight: 2, dashArray: '6 7', opacity: 0.5,
          }).addTo(mounted.map);
        }
      } else mapEl.closest('.band').hidden = true;
    }

    if (pagerEl) {
      const prev = trips[idx + 1];
      const next = trips[idx - 1];
      pagerEl.innerHTML = `${prev
        ? `<a href="/journey.html?trip=${encodeURIComponent(prev.id)}"><span>更早的一趟</span>${esc(prev.title || '未命名')}</a>`
        : '<span></span>'}${next
        ? `<a class="pager__next" href="/journey.html?trip=${encodeURIComponent(next.id)}"><span>更新的一趟</span>${esc(next.title || '未命名')}</a>`
        : '<span></span>'}`;
    }
  }

  /* ---------------- 相册 ---------------- */
  async function initPhotos() {
    const host = $('album');
    if (!host) return;
    const data = await api('/api/site');
    const photos = [...data.photos].sort((a, b) =>
      String(b.shot_at || '').localeCompare(String(a.shot_at || '')));

    const stat = $('page-stats');
    if (stat) {
      const places = new Set(photos.map((p) => p.place).filter(Boolean)).size;
      stat.innerHTML = `<span><b>${photos.length}</b> 张照片</span>
        <span><b>${places}</b> 个地点</span>
        <span><b>${data.trips.length}</b> 次旅程</span>`;
    }

    if (!photos.length) {
      host.innerHTML = `<div class="empty"><b>相册还是空的</b>先去管理页传几张。</div>`;
      return;
    }

    const groups = new Map();
    for (const p of photos) {
      const k = monthKey(p.shot_at);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(p);
    }

    /* 筛选条：状态进 URL，方便直接分享「某年」或「某趟」的那一屏 */
    const params = new URLSearchParams(location.search);
    const f = params.get('f') || '';
    const y = params.get('y') || '';
    const tripQ = params.get('trip') || '';
    const trips = [...data.trips].sort((a, b) =>
      String(b.start_date || '').localeCompare(String(a.start_date || '')));
    const chosen = trips.find((t) => t.id === tripQ) || null;

    let list = photos;
    if (f === 'loose') list = photos.filter((p) => !p.trip_id);
    else if (/^\d{4}$/.test(y)) list = photos.filter((p) => String(p.shot_at || '').startsWith(y));
    else if (chosen) list = photos.filter((p) => p.trip_id === chosen.id);

    const looseCount = photos.filter((p) => !p.trip_id).length;
    const years = [...new Set(photos.map((p) => String(p.shot_at || '').slice(0, 4)).filter((v) => /^\d{4}$/.test(v)))];

    const filterEl = $('album-filter');
    if (filterEl) {
      const chip = (href, text, n, on) =>
        `<a class="filters__item${on ? ' is-on' : ''}" href="${href}">${esc(text)} <b>${n}</b></a>`;
      filterEl.innerHTML = [
        chip('/photos.html', '全部', photos.length, !f && !y && !chosen),
        looseCount ? chip('/photos.html?f=loose', '不在旅程里', looseCount, f === 'loose') : '',
        years.slice(0, 4).map((v) => chip(`/photos.html?y=${encodeURIComponent(v)}`, `${v} 年`,
          photos.filter((p) => String(p.shot_at || '').startsWith(v)).length, y === v)).join(''),
        trips.slice(0, 8).map((t) => chip(`/photos.html?trip=${encodeURIComponent(t.id)}`, t.title || '未命名旅程',
          photos.filter((p) => p.trip_id === t.id).length, !!chosen && chosen.id === t.id)).join(''),
      ].filter(Boolean).join('');
    }

    if (!list.length) {
      host.innerHTML = '<div class="empty"><b>这一筛没有照片</b>换个条件看看。</div>';
      return;
    }

    // 分批渲染：一两千张时不至于一次插进上万个节点
    const BATCH = 120;
    let shown = 0;
    let lastMonth = null;
    const moreBtn = $('album-more');
    const draw = () => {
      const chunk = list.slice(shown, shown + BATCH);
      shown += chunk.length;
      let html = '';
      let open = false;      // 当前是否有一个未闭合的 .flow
      let cur = null;        // 当前批次内正在写的月份
      let lead = false;      // 本月第一张跨两格
      const closeFlow = () => { if (open) { html += '</div>'; open = false; } };
      for (const p of chunk) {
        const k = monthKey(p.shot_at);
        if (k !== cur) {
          closeFlow();
          cur = k;
          lead = true;
          const n = list.filter((q) => monthKey(q.shot_at) === k).length;
          const label = /^\d{4}-\d{2}$/.test(k) ? `${Number(k.slice(5))} 月` : k;
          const yPre = /^\d{4}-\d{2}$/.test(k) ? `${k.slice(0, 4)} 年 · ` : '';
          html += `<div class="year-head"><span class="year-head__no">${esc(label)}</span>
            <span class="year-head__line"></span><span class="year-head__count">${esc(yPre)}${n} 张${k === lastMonth ? '（续）' : ''}</span></div>`;
          html += '<div class="flow">';
          open = true;
        }
        const cap = p.caption || p.place || '旅行照片';
        const ar = (p.width && p.height) ? (p.width / p.height) : 4 / 3;
        // 每月第一张跨两格：2000 张时才不会全是等大方块
        html += `<figure class="flow__item${lead ? ' flow__item--lead' : ''}" style="flex-grow:${(lead ? ar * 2 : ar).toFixed(3)};flex-basis:${Math.round(ar * (lead ? 380 : 190))}px">
          <button class="flow__open" type="button" data-web="${esc(p.key_web)}" data-cap="${esc(cap)}" aria-label="查看大图：${esc(cap)}">
            <img src="${esc(imgSrc(p.key_thumb))}" alt="" loading="lazy">
          </button>
          <figcaption><span>${esc(p.place || '未标注地点')}</span><span>${esc(ymd(p.shot_at))}</span></figcaption>
        </figure>`;
        lead = false;
        lastMonth = k;
      }
      closeFlow();
      host.insertAdjacentHTML('beforeend', html);
      if (moreBtn) moreBtn.hidden = shown >= list.length;
    };

    host.innerHTML = '';
    draw();
    if (moreBtn) {
      moreBtn.textContent = `再看一批（还有 ${list.length - shown} 张）`;
      moreBtn.onclick = draw;
    }
  }

  /* ---------------- 大地图 ---------------- */
  async function initMap() {
    const el = $('map-canvas');
    if (!el) return;
    const data = await api('/api/site');
    const pts = pinned(data.photos);

    const side = $('place-list');
    const counts = new Map();
    for (const p of pts) {
      const k = p.place || '未标注地点';
      counts.set(k, (counts.get(k) || 0) + 1);
    }
    const places = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh'));

    if (side) {
      side.innerHTML = places.length
        ? places.map(([name, n]) => `<li><button type="button" data-place="${esc(name)}">
            <b>${esc(name)}</b><em>${n} 张</em></button></li>`).join('')
        : '<li><button type="button" disabled>还没有带位置的照片</button></li>';
    }

    const stat = $('page-stats');
    if (stat) {
      stat.innerHTML = `<span><b>${pts.length}</b> 张有坐标</span>
        <span><b>${places.length}</b> 个地点</span>
        <span><b>${data.trips.length}</b> 次旅程</span>`;
    }

    const m = mountMap(el, pts, { scroll: true });
    if (!m || !side) return;
    side.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-place]');
      if (!btn) return;
      const name = btn.dataset.place;
      const group = pts.filter((p) => (p.place || '未标注地点') === name);
      if (!group.length) return;
      const b = L.latLngBounds(group.map((p) => [p.lat, p.lng]));
      m.map.fitBounds(b, { padding: [64, 64], maxZoom: 12 });
      const first = group[0];
      m.map.eachLayer((l) => {
        if (l.getLatLng && l.getLatLng().lat === first.lat && l.getLatLng().lng === first.lng) {
          if (m.map.hasLayer(l)) l.openPopup();
        }
      });
    });
  }

  /* ---------------- 启动 ---------------- */
  const boot = async () => {
    stampYear();
    const page = document.body.dataset.page;
    try {
      if (page === 'journeys') { await initJourneys(); }
      else if (page === 'journey') { await initJourney(); }
      else if (page === 'photos') { await initPhotos(); }
      else if (page === 'map') { await initMap(); }
      if (page) {
        const data = await api('/api/site');
        colophonStats(data);
      }
    } catch (err) {
      const host = $('journey-rows') || $('album') || $('map-canvas');
      if (host && !host.innerHTML.trim()) {
        host.innerHTML = `<div class="empty"><b>数据没取到</b>刷新试试，或稍后再来。</div>`;
      }
      console.error(err);
    }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
