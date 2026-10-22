/* 旅行：/travel（总览）、/travel/journey（单次旅程）、/travel/photos（相册）、/travel/map（全屏地图）
   只读接口：/api/site（trips + photos + stats）、/api/photos?trip=&limit=
   地图：Leaflet + markercluster（自托管在 /vendor/）；灯箱自建，带计数与左右翻页。 */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const esc = (s) =>
    String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const imgSrc = (key) => '/img/' + String(key || '');
  const num = (n) => (n || 0).toLocaleString('zh-CN');
  const WD = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  const pad = (n) => (n < 10 ? '0' + n : '' + n);

  function dayKey(p) {
    return p && p.shot_at ? String(p.shot_at).slice(0, 10) : '';
  }
  function fmtDay(key) {
    if (!key) return '时间未标注';
    const d = new Date(key + 'T00:00:00');
    if (isNaN(d.getTime())) return key;
    return pad(d.getMonth() + 1) + '.' + pad(d.getDate()) + ' ' + WD[d.getDay()];
  }
  function fmtRange(a, b) {
    if (!a && !b) return '日期未标注';
    if (!b || a === b) return fmtDay(String(a || '').slice(0, 10));
    return String(a).slice(0, 10) + ' — ' + String(b).slice(0, 10);
  }
  const ar = (p) => (p && p.width && p.height ? p.width / p.height : 4 / 3);
  let photos = [];
  let trips = [];
  function captionOf(p) {
    const bits = [];
    if (p.place) bits.push(p.place);
    if (p.shot_at) bits.push(String(p.shot_at).slice(0, 10));
    if (p.caption) bits.push(p.caption);
    return bits.join(' · ') || '未命名';
  }

  /* ---------- 灯箱 ---------- */
  let boxList = [];
  let boxIdx = -1;
  function renderBox() {
    const p = boxList[boxIdx];
    if (!p) return;
    const im = $('box-img');
    if (im) {
      im.src = imgSrc(p.key_web || p.key_thumb);
      im.alt = p.place || p.caption || '';
    }
    const cap = $('box-cap');
    if (cap) cap.textContent = captionOf(p) + '（第 ' + (boxIdx + 1) + ' / ' + boxList.length + ' 张）';
    const wide = boxList.length > 1;
    ['box-prev', 'box-next'].forEach((id) => {
      const el = $(id);
      if (el) el.hidden = !wide;
    });
  }
  function openBox(list, idx) {
    if (!list || !list.length) return;
    boxList = list;
    boxIdx = Math.max(0, Math.min(idx, list.length - 1));
    const box = $('lightbox');
    if (!box) return;
    box.hidden = false;
    renderBox();
    document.body.style.overflow = 'hidden';
  }
  function closeBox() {
    const box = $('lightbox');
    if (!box) return;
    box.hidden = true;
    document.body.style.overflow = '';
  }
  function stepBox(dir) {
    if (boxList.length < 2) return;
    boxIdx = (boxIdx + dir + boxList.length) % boxList.length;
    renderBox();
  }
  function bindBox() {
    const box = $('lightbox');
    if (!box) return;
    $('box-close') && $('box-close').addEventListener('click', closeBox);
    $('box-prev') && $('box-prev').addEventListener('click', () => stepBox(-1));
    $('box-next') && $('box-next').addEventListener('click', () => stepBox(1));
    box.addEventListener('click', (e) => {
      if (e.target === box || e.target.className === 'lightbox__stage') closeBox();
    });
    document.addEventListener('keydown', (e) => {
      if (box.hidden) return;
      if (e.key === 'Escape') closeBox();
      if (e.key === 'ArrowLeft') stepBox(-1);
      if (e.key === 'ArrowRight') stepBox(1);
    });
  }

  /* ---------- 地图 ---------- */
  function ensureMap(el) {
    if (!el || !window.L) return null;
    if (el._map) return el._map;
    const map = L.map(el, { scrollWheelZoom: false, zoomControl: true }).setView([30.3, 118.2], 6);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap',
    }).addTo(map);
    el._map = map;
    return map;
  }
  function pinned(ps) {
    return (ps || []).filter((p) => p.lat != null && p.lng != null);
  }
  function drawPins(map, ps) {
    if (!map || !ps.length) return null;
    const group = L.markerClusterGroup ? L.markerClusterGroup({ showCoverageOnHover: false, maxClusterRadius: 46 }) : L.featureGroup();
    ps.forEach((p) => {
      const m = L.marker([p.lat, p.lng]);
      const thumb = p.key_thumb
        ? '<img src="' + imgSrc(p.key_thumb) + '" alt="" style="width:132px;border-radius:2px;display:block;margin-bottom:6px">'
        : '';
      m.bindPopup('<div style="min-width:150px">' + thumb + '<b>' + esc(p.place || '未标注') + '</b><br>' + esc(dayKey(p) || '') + '</div>');
      group.addLayer(m);
    });
    map.addLayer(group);
    map.fitBounds(group.getBounds().pad(0.2), { maxZoom: 12 });
    return group;
  }
  function drawTrace(map, ps) {
    const pts = ps
      .filter((p) => p.lat != null && p.shot_at)
      .slice()
      .sort((a, b) => String(a.shot_at).localeCompare(String(b.shot_at)))
      .map((p) => [p.lat, p.lng]);
    if (!map || pts.length < 3) return;
    L.polyline(pts, { color: '#d4552b', weight: 2, opacity: 0.55, dashArray: '6 7' }).addTo(map);
  }
  function placeCounts(ps) {
    const m = new Map();
    ps.forEach((p) => {
      const k = p.place || '未标注';
      m.set(k, (m.get(k) || 0) + 1);
    });
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }
  function renderLegend(host, ps, limit) {
    if (!host) return;
    const rows = placeCounts(ps).slice(0, limit || 14);
    host.innerHTML = rows.length
      ? rows.map(([name, n]) => '<span class="chip">' + esc(name) + ' · ' + num(n) + '</span>').join('')
      : '<span class="hint">还没有带坐标的照片。</span>';
  }

  /* ---------- 照片流（按真实比例排布） ---------- */
  function flowItem(p, i, lead) {
    const r = ar(p);
    const grow = lead ? r * 2 : r;
    const basis = Math.round(r * (lead ? 380 : 190));
    return (
      '<figure class="flow__item' + (lead ? ' flow__item--lead' : '') + '" style="flex-grow:' + grow.toFixed(3) + ';flex-basis:' + basis + 'px" data-rb="tilt" data-rb-tilt="1.6">' +
      '<img src="' + imgSrc(p.key_thumb) + '" alt="' + esc(p.place || p.caption || '') + '" loading="lazy" data-web="' + esc(p.key_web || p.key_thumb) + '" data-i="' + i + '">' +
      '<figcaption>' + esc(p.place || dayKey(p) || '未标注') + '</figcaption>' +
      '</figure>'
    );
  }
  function bindFlow(host, list) {
    if (!host) return;
    host.querySelectorAll('img[data-web]').forEach((im) => {
      im.addEventListener('click', () => openBox(list, Number(im.dataset.i || 0)));
    });
  }
  function empty(host, text) {
    if (host) host.innerHTML = '<p class="empty">' + esc(text) + '</p>';
  }

  /* ---------- /travel 总览 ---------- */
  async function initTravel() {
    const data = await (await fetch('/api/site')).json();
    trips = data.trips || [];
    photos = data.photos || [];

    const list = $('trip-list');
    const count = $('trip-count');
    if (count) count.textContent = trips.length ? trips.length + ' 趟 · ' + photos.length + ' 张照片' : '';
    if (list) {
      if (!trips.length) empty(list, '还没有旅程。到后台建一趟，再把照片归进去。');
      else {
        list.innerHTML = trips
          .map((t) => {
            const ps = photos.filter((p) => p.trip_id === t.id);
            const cover = ps.find((p) => p.id === t.cover_id) || ps[0];
            const days = new Set(ps.map(dayKey).filter(Boolean)).size;
            return (
              '<a class="jcard" href="/travel/journey?id=' + encodeURIComponent(t.id) + '">' +
              (cover
                ? '<img class="jcard__cover" src="' + imgSrc(cover.key_thumb) + '" alt="">'
                : '<div class="jcard__cover jcard__cover--blank">照片</div>') +
              '<div><div class="jcard__title">' + esc(t.title || t.id) + '</div>' +
              (t.subtitle ? '<div class="jcard__sub">' + esc(t.subtitle) + '</div>' : '') + '</div>' +
              '<div class="jcard__meta">' + esc(fmtRange(t.start_date, t.end_date)) + '<br>' + ps.length + ' 张' + (days ? ' · ' + days + ' 天' : '') + '</div>' +
              '</a>'
            );
          })
          .join('');
      }
    }

    const map = ensureMap($('map-canvas'));
    const pins = pinned(photos);
    if (map) {
      drawPins(map, pins);
      if (!pins.length) map.setView([30.3, 118.2], 5);
    }
    renderLegend($('map-legend'), pins);

    const strip = $('strip');
    if (strip) {
      const recent = photos.slice(0, 8);
      if (!recent.length) empty(strip, '还没有照片。到后台传第一批。');
      else {
        strip.innerHTML = recent
          .map((p, i) => '<figure class="strip__item"><img src="' + imgSrc(p.key_thumb) + '" alt="" loading="lazy" data-web="' + esc(p.key_web || p.key_thumb) + '" data-i="' + i + '"></figure>')
          .join('');
        bindFlow(strip, recent);
      }
    }
  }

  /* ---------- /travel/journey ---------- */
  async function initJourney() {
    const id = new URLSearchParams(location.search).get('id') || '';
    const data = await (await fetch('/api/site')).json();
    trips = data.trips || [];
    const t = trips.find((x) => x.id === id);
    if (!t) {
      $('t-title') && ($('t-title').textContent = '没找到这趟旅程');
      empty($('t-days'), '链接里的 id 可能过期了，回旅行总览挑一趟。');
      return;
    }
    document.title = (t.title || '旅程') + ' · 黄翀与';
    $('t-kicker') && ($('t-kicker').textContent = 'TRAVEL · 旅程');
    $('t-title') && ($('t-title').textContent = t.title || t.id);
    $('t-dates') && ($('t-dates').textContent = fmtRange(t.start_date, t.end_date));
    $('t-sub') && ($('t-sub').textContent = t.subtitle || t.summary || '');

    const r = await fetch('/api/photos?trip=' + encodeURIComponent(id) + '&limit=500');
    const ps = (await r.json()).photos || [];
    photos = ps;

    const days = [...new Set(ps.map(dayKey))].sort();
    const pinnedPs = pinned(ps);
    const places = new Set(ps.map((p) => p.place).filter(Boolean)).size;
    const stats = $('t-stats');
    if (stats) {
      stats.innerHTML =
        '<div class="tstat"><dt>天数</dt><dd>' + num(days.filter(Boolean).length || (t.start_date ? 1 : 0)) + '</dd></div>' +
        '<div class="tstat"><dt>照片</dt><dd>' + num(ps.length) + '</dd></div>' +
        '<div class="tstat"><dt>有坐标</dt><dd>' + num(pinnedPs.length) + '</dd></div>' +
        '<div class="tstat"><dt>地点</dt><dd>' + num(places) + '</dd></div>';
    }

    const host = $('t-days');
    if (host) {
      if (!ps.length) empty(host, '这趟旅程还没有照片。到后台把拍好的照片归到这一趟。');
      else {
        host.innerHTML = days
          .map((d) => {
            const dayPs = ps.filter((p) => dayKey(p) === d);
            return (
              '<section class="tday"><div class="tday__head"><span class="tday__date">' + esc(fmtDay(d)) + '</span>' +
              '<span class="tday__meta">' + dayPs.length + ' 张</span></div>' +
              '<div class="flow">' + dayPs.map((p) => flowItem(p, ps.indexOf(p))).join('') + '</div></section>'
            );
          })
          .join('');
        bindFlow(host, ps);
      }
    }

    const map = ensureMap($('t-map'));
    if (map) {
      drawPins(map, pinnedPs);
      drawTrace(map, pinnedPs);
      if (!pinnedPs.length) map.setView([30.3, 118.2], 5);
    }
    renderLegend($('t-legend'), pinnedPs, 10);
  }

  /* ---------- /travel/photos ---------- */
  async function initPhotos() {
    const BATCH = 120;
    const data = await (await fetch('/api/site')).json();
    photos = data.photos || [];
    const years = [...new Set(photos.map((p) => dayKey(p).slice(0, 4)).filter(Boolean))].sort().reverse();
    const year = new URLSearchParams(location.search).get('y') || '';
    const host = $('wall');
    const bar = $('filters');
    if (bar) {
      bar.innerHTML =
        '<button class="chip" data-y="" aria-pressed="' + (!year) + '">全部 ' + photos.length + '</button>' +
        years.map((y) => '<button class="chip" data-y="' + y + '" aria-pressed="' + (year === y) + '">' + y + ' ' + photos.filter((p) => dayKey(p).startsWith(y)).length + '</button>').join('');
      bar.querySelectorAll('.chip').forEach((b) =>
        b.addEventListener('click', () => {
          const u = new URL(location.href);
          if (b.dataset.y) u.searchParams.set('y', b.dataset.y);
          else u.searchParams.delete('y');
          location.href = u.toString();
        })
      );
    }
    const list = year ? photos.filter((p) => dayKey(p).startsWith(year)) : photos;
    if (!host) return;
    if (!list.length) {
      empty(host, photos.length ? '这一年还没有照片。' : '相册还是空的。到后台传第一批照片。');
      return;
    }
    let shown = 0;
    const more = $('wall-more');
    function draw() {
      const chunk = list.slice(shown, shown + BATCH);
      host.insertAdjacentHTML(
        'beforeend',
        '<div class="flow">' + chunk.map((p) => flowItem(p, list.indexOf(p))).join('') + '</div>'
      );
      shown += chunk.length;
      bindFlow(host, list);
      if (more) {
        more.hidden = shown >= list.length;
        more.textContent = '再看一批（还有 ' + (list.length - shown) + ' 张）';
      }
    }
    draw();
    if (more) more.addEventListener('click', draw);
  }

  /* ---------- /travel/map ---------- */
  async function initMapPage() {
    const data = await (await fetch('/api/site')).json();
    trips = data.trips || [];
    photos = data.photos || [];
    const trip = new URLSearchParams(location.search).get('trip') || '';
    const bar = $('filters');
    if (bar) {
      bar.innerHTML =
        '<button class="chip" data-t="" aria-pressed="' + (!trip) + '">全部 ' + pinned(photos).length + '</button>' +
        trips
          .map((t) => {
            const n = pinned(photos.filter((p) => p.trip_id === t.id)).length;
            return '<button class="chip" data-t="' + esc(t.id) + '" aria-pressed="' + (trip === t.id) + '">' + esc(t.title || t.id) + ' ' + n + '</button>';
          })
          .join('');
      bar.querySelectorAll('.chip').forEach((b) =>
        b.addEventListener('click', () => {
          const u = new URL(location.href);
          if (b.dataset.t) u.searchParams.set('trip', b.dataset.t);
          else u.searchParams.delete('trip');
          location.href = u.toString();
        })
      );
    }
    const list = trip ? photos.filter((p) => p.trip_id === trip) : photos;
    const pins = pinned(list);
    const map = ensureMap($('map-canvas'));
    if (map) {
      drawPins(map, pins);
      if (trip) drawTrace(map, pins);
      if (!pins.length) map.setView([30.3, 118.2], 5);
    }
    const side = $('place-index');
    if (side) {
      const rows = placeCounts(pins);
      side.innerHTML = rows.length
        ? '<p class="label">地点索引</p>' +
          rows
            .map(([name, n]) => {
              const one = pins.find((p) => (p.place || '未标注') === name);
              return '<button class="place-row" data-fly="' + one.lat + ',' + one.lng + '"><span>' + esc(name) + '</span><b>' + num(n) + '</b></button>';
            })
            .join('')
        : '<p class="hint">还没有带坐标的照片。标点之后这里会按地点排开。</p>';
      side.addEventListener('click', (e) => {
        const b = e.target.closest('[data-fly]');
        if (!b) return;
        const [lat, lng] = b.dataset.fly.split(',').map(Number);
        if (map && isFinite(lat) && isFinite(lng)) map.flyTo([lat, lng], 12);
      });
    }
  }

  /* ---------- 启动 ---------- */
  async function main() {
    bindBox();
    const page = document.body.dataset.page || '';
    try {
      if (page === 'travel') await initTravel();
      else if (page === 'travel-journey') await initJourney();
      else if (page === 'travel-photos') await initPhotos();
      else if (page === 'travel-map') await initMapPage();
    } catch (err) {
      const host = $('t-days') || $('wall') || $('trip-list');
      if (host) host.innerHTML = '<p class="empty">内容没取回来：' + esc(String((err && err.message) || err)) + '</p>';
    }
    document.dispatchEvent(new CustomEvent('site:rendered'));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', main);
  else main();
})();