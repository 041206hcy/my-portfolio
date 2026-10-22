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

    let html = '';
    let curYear = null;
    for (const t of trips) {
      const y = yearOf(t.start_date);
      if (y !== curYear) {
        curYear = y;
        const n = trips.filter((x) => yearOf(x.start_date) === y).length;
        html += `<div class="year-head"><span class="year-head__no">${esc(y)}</span>
          <span class="year-head__line"></span><span class="year-head__count">${n} 次</span></div>`;
      }
      const cover = byId.get(t.cover_id) || data.photos.find((p) => p.trip_id === t.id);
      const photos = byTrip.get(t.id) || 0;
      html += `<a class="row-trip" href="/journey.html?trip=${encodeURIComponent(t.id)}">
        <div class="row-trip__thumb">${cover ? `<img src="${esc(imgSrc(cover.key_thumb))}" alt="" loading="lazy">` : ''}</div>
        <div>
          <p class="row-trip__title">${esc(t.title || '未命名旅程')}</p>
          <p class="row-trip__sub">${esc(t.subtitle || '')}</p>
          <p class="row-trip__desc">${esc(t.summary || '')}</p>
        </div>
        <div class="row-trip__side">
          <b>${photos}</b> 张照片<br>${esc(range(t.start_date, t.end_date))}
          <span class="row-trip__arrow" aria-hidden="true">→</span>
        </div>
      </a>`;
    }
    host.innerHTML = html;
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
      metaEl.innerHTML = `<span>${esc(range(trip.start_date, trip.end_date))}</span>
        <span><b>${photos.length}</b> 张照片</span>
        <span><b>${places}</b> 个地点</span>`;
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
      wallEl.innerHTML = photos.length
        ? photos.map((p) => {
          const cap = p.caption || p.place || '旅行照片';
          const ar = (p.width && p.height) ? (p.width / p.height) : 4 / 3;
          return `<figure class="flow__item" style="flex-grow:${ar.toFixed(3)};flex-basis:${Math.round(ar * 190)}px">
            <button class="flow__open" type="button" data-web="${esc(p.key_web)}" data-cap="${esc(cap)}">
              <img src="${esc(imgSrc(p.key_thumb))}" alt="" loading="lazy">
            </button>
            <figcaption><span>${esc(p.place || '')}</span><span>${esc(ymd(p.shot_at))}</span></figcaption>
          </figure>`;
        }).join('')
        : `<div class="empty"><b>这趟还没照片</b>去管理页把它们归进这趟旅程。</div>`;
    }

    const pts = pinned(photos);
    const mapEl = $('trip-map');
    if (mapEl) {
      if (pts.length) mountMap(mapEl, pts);
      else mapEl.closest('.band').hidden = true;
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

    let html = '';
    for (const [key, list] of groups) {
      html += `<div class="year-head"><span class="year-head__no">${esc(/^\d{4}-\d{2}$/.test(key) ? (Number(key.slice(5)) + ' 月') : key)}</span>
        <span class="year-head__line"></span><span class="year-head__count">${esc(/^\d{4}-\d{2}$/.test(key) ? key.slice(0, 4) + ' 年' : '')} · ${list.length} 张</span></div>
        <div class="flow">`;
      for (const p of list) {
        const cap = p.caption || p.place || '旅行照片';
        const ar = (p.width && p.height) ? (p.width / p.height) : 4 / 3;
        html += `<figure class="flow__item" style="flex-grow:${ar.toFixed(3)};flex-basis:${Math.round(ar * 190)}px">
          <button class="flow__open" type="button" data-web="${esc(p.key_web)}" data-cap="${esc(cap)}">
            <img src="${esc(imgSrc(p.key_thumb))}" alt="" loading="lazy">
          </button>
          <figcaption><span>${esc(p.place || '未标注地点')}</span><span>${esc(ymd(p.shot_at))}</span></figcaption>
        </figure>`;
      }
      html += `</div>`;
    }
    host.innerHTML = html;
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
