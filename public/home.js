/* 首页：地图打点 + 旅程分组 + 照片墙
   数据全部来自 /api/site（只含公开可见的照片与旅程） */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
  // R2 key → /img/ 地址（key 里只有字母数字和斜杠，逐段编码更稳）
  const imgSrc = (key) => '/img/' + String(key).split('/').map(encodeURIComponent).join('/');

  const pad = (n) => String(n).padStart(2, '0');
  const fmtDate = (v) => {
    if (!v) return '';
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return String(v).slice(0, 10);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };
  const fmtRange = (a, b) => {
    if (!a && !b) return '';
    if (a && b) return fmtDate(a) === fmtDate(b) ? fmtDate(a) : `${fmtDate(a)} – ${fmtDate(b)}`;
    return fmtDate(a || b);
  };

  $('year').textContent = String(new Date().getFullYear());

  /* ---------------- 灯箱 ---------------- */
  const box = $('lightbox');
  const boxImg = $('lightbox-img');
  const boxCap = $('lightbox-cap');
  const boxClose = $('lightbox-close');
  // 关闭后把焦点还给「打开它的那张缩略图」，键盘用户不会被丢回页首
  let opener = null;

  const openBox = (key, caption) => {
    if (!key) return;
    const cap = caption || '';
    opener = document.activeElement;
    boxImg.src = imgSrc(key);
    boxImg.alt = cap || '旅行照片';
    boxCap.textContent = cap;
    boxCap.hidden = !cap;
    box.hidden = false;
    document.body.style.overflow = 'hidden';
    if (boxClose) boxClose.focus();
  };
  const closeBox = () => {
    box.hidden = true;
    boxImg.src = '';
    boxImg.alt = '';
    document.body.style.overflow = '';
    if (opener && typeof opener.focus === 'function') opener.focus();
    opener = null;
  };

  // 缩略图现在是真 <button>，回车 / 空格会自己派发 click，这里只处理鼠标和键盘的 click
  document.addEventListener('click', (e) => {
    const hit = e.target.closest ? e.target.closest('[data-web]') : null;
    if (!hit) return;
    e.preventDefault();
    openBox(hit.dataset.web, hit.dataset.cap || '');
  });
  box.addEventListener('click', (e) => {
    if (e.target === box || e.target.closest('.lightbox__close')) closeBox();
  });
  document.addEventListener('keydown', (e) => {
    if (box.hidden) return;
    if (e.key === 'Escape') { closeBox(); return; }
    // 灯箱里只有关闭按钮一个可聚焦元素，Tab 不该跑到背后的页面上去
    if (e.key === 'Tab') {
      e.preventDefault();
      if (boxClose) boxClose.focus();
    }
  });

  /* ---------------- 地图 ---------------- */
  let map = null;
  let cluster = null;

  const ensureMap = () => {
    if (map || typeof L === 'undefined') return map;
    map = L.map('map-canvas', { scrollWheelZoom: false, worldCopyJump: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '底图 © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> 贡献者',
    }).addTo(map);
    map.setView([34.5, 108], 4);
    cluster = L.markerClusterGroup({ showCoverageOnHover: false, maxClusterRadius: 46 });
    map.addLayer(cluster);
    return map;
  };

  // 图钉和弹窗缩略图原本都是裸 <img>：键盘 Tab 不到，回车也打不开。
  // 现在缩略图包在 <button> 里，标签用 aria-label，图片本身当装饰（alt=""）。
  const popupHtml = (p) => {
    const place = p.place || '未命名地点';
    const cap = p.caption || p.place || '';
    const extra = p.caption && p.caption !== p.place ? p.caption : '';
    return `
    <div class="pop">
      <button class="pop__open" type="button" data-web="${esc(p.key_web)}" data-cap="${esc(cap)}" aria-label="查看大图：${esc(cap || place)}">
        <img src="${esc(imgSrc(p.key_thumb))}" alt="" loading="lazy">
      </button>
      <div class="pop__body">
        <strong>${esc(place)}</strong>
        <div class="pop__meta">${esc(fmtDate(p.shot_at) || '时间未知')}${extra ? ' · ' + esc(extra) : ''}</div>
      </div>
    </div>`;
  };

  const drawMap = (photos) => {
    const pinned = photos.filter((p) => p.lat !== null && p.lng !== null);
    const hint = $('map-hint');

    if (typeof L === 'undefined') {
      hint.textContent = '地图组件没加载出来（vendor/leaflet.js 缺失或没连通）。';
      return;
    }
    ensureMap();

    if (!pinned.length) {
      hint.innerHTML = photos.length
        ? '这些照片还没有位置。到 <a href="/admin">管理页</a> 在地图上点一下，点就会出现在这里。'
        : '还没有照片。到 <a href="/admin">管理页</a> 传第一批，这里就会亮起来。';
      return;
    }

    cluster.clearLayers();
    const bounds = L.latLngBounds();
    for (const p of pinned) {
      // alt / title 让图钉不是一排「Marker」：读屏能念出地名，鼠标悬停也有提示
      const label = p.place || '照片位置';
      const marker = L.marker([p.lat, p.lng], { alt: label, title: label });
      marker.bindPopup(popupHtml(p), { maxWidth: 260, minWidth: 200 });
      cluster.addLayer(marker);
      bounds.extend([p.lat, p.lng]);
    }

    if (pinned.length === 1) map.setView([pinned[0].lat, pinned[0].lng], 11);
    else map.fitBounds(bounds.pad(0.18), { maxZoom: 12 });

    const places = new Set(pinned.map((p) => p.place).filter(Boolean));
    hint.textContent = `地图上 ${pinned.length} 个点，涉及 ${places.size || '若干'} 个地点。点开图标看照片。`;
  };

  /* ---------------- 旅程：最近一次跨页 + 其余索引 ---------------- */
  const tripCounts = (photos) => {
    const counts = new Map();
    for (const p of photos) {
      if (p.trip_id) counts.set(p.trip_id, (counts.get(p.trip_id) || 0) + 1);
    }
    return counts;
  };
  const coverOf = (t, photos) => {
    if (t.cover_id) {
      const c = photos.find((p) => p.id === t.cover_id);
      if (c) return c;
    }
    return photos.find((p) => p.trip_id === t.id) || null;
  };
  const sortTrips = (trips) => trips.slice().sort((a, b) =>
    String(b.start_date || '').localeCompare(String(a.start_date || '')));

  const renderFeature = (trips, photos) => {
    const host = $('feature-trip');
    if (!host) return;
    const sorted = sortTrips(trips);
    if (!sorted.length) {
      host.innerHTML = '<p class="section__text">还没有旅程。到 <a href="/admin">管理页</a> 新建一次，再把照片归进去。</p>';
      return;
    }
    const counts = tripCounts(photos);
    const t = sorted[0];
    const n = counts.get(t.id) || 0;
    const cover = coverOf(t, photos);
    const inside = photos.filter((p) => p.trip_id === t.id).slice(0, 3);
    const meta = [fmtRange(t.start_date, t.end_date), n ? `${n} 张照片` : '', t.subtitle || '']
      .filter(Boolean).join(' · ');
    host.innerHTML = `
      <article class="feature">
        ${cover ? `<figure class="feature__cover"><img src="${esc(imgSrc(cover.key_thumb))}" alt="${esc(t.title)}"></figure>` : ''}
        <div class="feature__body">
          <p class="kicker">最近一次</p>
          <h3 class="feature__title">${esc(t.title)}</h3>
          ${meta ? `<p class="feature__meta">${esc(meta)}</p>` : ''}
          ${t.summary ? `<p class="feature__summary">${esc(t.summary)}</p>` : ''}
          <div class="feature__mini">
            ${inside.map((p) => `<img src="${esc(imgSrc(p.key_thumb))}" alt="" loading="lazy">`).join('')}
          </div>
        </div>
      </article>`;
  };

  const renderTripIndex = (trips, photos) => {
    const host = $('trip-index');
    if (!host) return;
    const sorted = sortTrips(trips).slice(1);
    const counts = tripCounts(photos);
    if (!sorted.length) { host.innerHTML = ''; return; }
    host.innerHTML = sorted.map((t) => {
      const n = counts.get(t.id) || 0;
      const meta = [fmtRange(t.start_date, t.end_date), n ? `${n} 张照片` : '']
        .filter(Boolean).join(' · ');
      return `
        <article class="card--flat">
          <h3 class="card--flat__title">${esc(t.title)}</h3>
          ${meta ? `<p class="card--flat__meta">${esc(meta)}</p>` : ''}
          ${t.summary ? `<p class="card--flat__summary">${esc(t.summary)}</p>` : ''}
        </article>`;
    }).join('');
  };

  /* ---------------- 刊头：三张相纸 + 元信息条 ---------------- */
  const renderMasthead = (photos, stats) => {
    const plates = $('plates');
    const mast = $('masthead');
    const meta = $('masthead-meta');
    const withKeys = photos.filter((p) => p.key_thumb);
    const pick = withKeys.slice().reverse().slice(0, 3);

    if (meta) {
      const dates = withKeys.map((p) => p.shot_at).filter(Boolean).sort();
      const first = dates.length ? fmtDate(dates[0]) : '';
      const last = dates.length ? fmtDate(dates[dates.length - 1]) : '';
      meta.textContent = [
        first ? `第一张照片 ${first}` : '还没有照片',
        last ? `最近更新 ${last}` : '',
        `${stats.photos || 0} 张照片 · ${stats.trips || 0} 次旅程`,
      ].filter(Boolean).join(' · ');
    }

    if (!pick.length || !plates) {
      if (mast) mast.classList.add('masthead--bare');
      if (plates) plates.innerHTML = '';
      return;
    }

    const chip = (p) => (p.lat != null && p.lng != null)
      ? `<span class="coord">${Math.abs(p.lat).toFixed(1)}°${p.lat >= 0 ? 'N' : 'S'} ${Math.abs(p.lng).toFixed(1)}°${p.lng >= 0 ? 'E' : 'W'}</span>`
      : '';
    const [a, b, c] = pick;
    plates.innerHTML =
      `<figure class="plate plate--main"><img src="${esc(imgSrc(a.key_thumb))}" alt="">${chip(a)}</figure>` +
      (b ? `<figure class="plate plate--sub"><img src="${esc(imgSrc(b.key_thumb))}" alt="" loading="lazy"></figure>` : '') +
      (c ? `<figure class="plate plate--stamp"><img src="${esc(imgSrc(c.key_thumb))}" alt="" loading="lazy"></figure>` : '');
  };

  /* ---------------- 胶片条 ---------------- */
  const renderStrip = (photos) => {
    const host = $('film-strip');
    if (!host) return;
    const pick = photos.slice().reverse().slice(0, 8);
    host.innerHTML = pick.map((p) => {
      const cap = p.caption || p.place || '';
      return `<button class="strip__item" type="button" data-web="${esc(p.key_web)}" data-cap="${esc(cap)}" aria-label="查看大图：${esc(cap || '旅行照片')}">
        <img src="${esc(imgSrc(p.key_thumb))}" alt="" loading="lazy">
      </button>`;
    }).join('');
    host.hidden = !pick.length;
  };

  /* ---------------- 照片墙 ---------------- */
  const BATCH = 120;
  let wallPhotos = [];
  let wallShown = 0;

  const wallItem = (p) => {
    const cap = p.caption || p.place || '';
    const date = fmtDate(p.shot_at);
    return `
    <figure class="wall__item">
      <button class="wall__open" type="button" data-web="${esc(p.key_web)}" data-cap="${esc(cap)}" aria-label="查看大图：${esc(cap || '旅行照片')}">
        <img src="${esc(imgSrc(p.key_thumb))}" alt="" loading="lazy">
      </button>
      ${p.place || date ? `<figcaption>
        <span class="wall__place">${esc(p.place || '')}</span>
        <span class="wall__date">${esc(date)}</span>
      </figcaption>` : ''}
    </figure>`;
  };

  const drawMore = () => {
    const host = $('photo-wall');
    const slice = wallPhotos.slice(wallShown, wallShown + BATCH);
    if (!slice.length) return;
    host.insertAdjacentHTML('beforeend', slice.map(wallItem).join(''));
    wallShown += slice.length;
    const more = $('wall-more');
    if (more) more.hidden = wallShown >= wallPhotos.length;
  };

  const drawWall = (photos) => {
    const host = $('photo-wall');
    if (!photos.length) {
      host.innerHTML = '<p class="section__text">还没有照片。到 <a href="/admin">管理页</a> 传第一批。</p>';
      return;
    }
    wallPhotos = photos.slice().reverse(); // 新的排前面
    host.innerHTML = '';
    wallShown = 0;
    drawMore();
    if (wallPhotos.length > BATCH) {
      host.insertAdjacentHTML('afterend', '<p class="wall__more-wrap"><button class="btn" type="button" id="wall-more">再看 120 张</button></p>');
      $('wall-more').addEventListener('click', drawMore);
    }
  };

  /* ---------------- 主流程 ---------------- */
  (async () => {
    let data;
    try {
      const res = await fetch('/api/site', { headers: { accept: 'application/json' } });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      data = await res.json();
    } catch (err) {
      $('stats').textContent = '数据读不到：' + err.message;
      $('map-hint').textContent = '地图数据读取失败，刷新试试。';
      $('photo-wall').innerHTML = '<p class="section__text">照片暂时读不到。请刷新重试。</p>';
      return;
    }

    const photos = data.photos || [];
    const trips = data.trips || [];
    const stats = data.stats || {};

    // stats.pinned 是「已定位的照片数」，不是地点数 —— 地点数由地图那行去算
    $('stats').innerHTML = [
      `<b>${stats.photos || 0}</b> 张照片`,
      `<b>${stats.pinned || 0}</b> 张有坐标`,
      `<b>${stats.trips || 0}</b> 次旅程`,
    ].join('<span class="stat-dot">·</span>');

    const tripCountEl = $('trip-count');
    if (tripCountEl) tripCountEl.textContent = stats.trips ? `共 ${stats.trips} 次` : '';
    const wallCountEl = $('wall-count');
    if (wallCountEl) wallCountEl.textContent = stats.photos
      ? `共 ${stats.photos} 张 · 新的排前面` : '';
    const coloStats = $('colophon-stats');
    if (coloStats) coloStats.textContent =
      `${stats.photos || 0} 张照片 · ${stats.pinned || 0} 张有坐标 · ${stats.trips || 0} 次旅程`;

    renderMasthead(photos, stats);
    renderFeature(trips, photos);
    renderTripIndex(trips, photos);
    renderStrip(photos);
    drawMap(photos);
    drawWall(photos);
  })();
})();