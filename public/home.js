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

  const openBox = (key, caption, keepOpener) => {
    if (!key) return;
    const cap = caption || '';
    if (!keepOpener) opener = document.activeElement;
    boxImg.src = imgSrc(key);
    boxImg.alt = cap || '旅行照片';
    // 计数：把「第几张 / 共几张」拼在图注后面，翻看时心里有数
    const list = document.querySelectorAll('[data-web]');
    const idx = opener ? Array.prototype.indexOf.call(list, opener) : -1;
    const counter = (list.length > 1 && idx >= 0) ? `${cap ? ' · ' : ''}${idx + 1}/${list.length}` : '';
    boxCap.textContent = cap + counter;
    boxCap.hidden = !(cap || counter);
    box.hidden = false;
    document.body.style.overflow = 'hidden';
    if (boxClose) boxClose.focus();
  };

  // 灯箱内左右方向键翻上一张 / 下一张，顺序与页面上缩略图的顺序一致
  const stepBox = (dir) => {
    const list = Array.from(document.querySelectorAll('[data-web]'));
    if (!list.length) return;
    const i = list.indexOf(opener);
    const n = list[((i < 0 ? 0 : i + dir) + list.length) % list.length];
    if (!n) return;
    opener = n;
    openBox(n.dataset.web, n.dataset.cap || '', true);
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
    if (e.key === 'ArrowRight') { e.preventDefault(); stepBox(1); return; }
    if (e.key === 'ArrowLeft') { e.preventDefault(); stepBox(-1); return; }
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
      <a class="feature" href="/journey?id=${encodeURIComponent(t.id)}">
        ${cover ? `<figure class="feature__cover"><img src="${esc(imgSrc(cover.key_thumb))}" alt="${esc(t.title)}"></figure>` : ''}
        <div class="feature__body">
          <p class="kicker">最近一次</p>
          <h3 class="feature__title">${esc(t.title)}</h3>
          ${meta ? `<p class="feature__meta">${esc(meta)}</p>` : ''}
          ${t.summary ? `<p class="feature__summary">${esc(t.summary)}</p>` : ''}
          <div class="feature__mini">
            ${inside.map((p) => `<img src="${esc(imgSrc(p.key_thumb))}" alt="" loading="lazy">`).join('')}
          </div>
          <p class="feature__more">看这一趟 →</p>
        </div>
      </a>`;
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
        <a class="card--flat" href="/journey?id=${encodeURIComponent(t.id)}">
          <h3 class="card--flat__title">${esc(t.title)}</h3>
          ${meta ? `<p class="card--flat__meta">${esc(meta)}</p>` : ''}
          ${t.summary ? `<p class="card--flat__summary">${esc(t.summary)}</p>` : ''}
        </a>`;
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
      `<figure class="plate plate--main" data-rb="glare" data-rb-opacity="0.35"><img src="${esc(imgSrc(a.key_thumb))}" alt="">${chip(a)}</figure>` +
      (b ? `<figure class="plate plate--sub" data-rb="glare" data-rb-opacity="0.3"><img src="${esc(imgSrc(b.key_thumb))}" alt="" loading="lazy"></figure>` : '') +
      (c ? `<figure class="plate plate--stamp" data-rb="glare" data-rb-opacity="0.3"><img src="${esc(imgSrc(c.key_thumb))}" alt="" loading="lazy"></figure>` : '');
  };

  /* ---------------- 胶片条 ---------------- */
  const renderStrip = (photos) => {
    const host = $('film-strip');
    if (!host) return;
    // 照片太少时胶片条只是在重复照片墙，宁可空着
    if (photos.length < 8) { host.innerHTML = ''; host.hidden = true; return; }
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
    const ar = (p.width && p.height) ? (p.width / p.height) : 4 / 3;
    return `
    <figure class="flow__item" style="flex-grow:${ar.toFixed(3)};flex-basis:${Math.round(ar * 190)}px">
      <button class="flow__open" type="button" data-web="${esc(p.key_web)}" data-cap="${esc(cap)}" aria-label="查看大图：${esc(cap || '旅行照片')}">
        <img src="${esc(imgSrc(p.key_thumb))}" alt="" loading="lazy">
      </button>
      ${p.place || date ? `<figcaption>
        <span>${esc(p.place || '')}</span>
        <span>${esc(date)}</span>
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

  /* ---------------- 这一期的文字（站点级，存在 settings 表里） ----------------
     没写过的位置用内置默认：站点刚上线、照片还没有的时候，首页也不该是一片空白。 */
  const COPY_DEFAULT = {
    issue_note: '这个站刚开始。第一批照片还在硬盘里，等它们传上来、标好位置，这一页会自己长出年表、地点索引和地图上的点。\n把话说在前面：这里只放我拍的照片，按地点和时间铺开，攒够一趟就归成一次旅程。',
    method: '照片只存网页尺寸 —— 缩略图长边 400px、网页图长边 1600px，都是 WebP。原图留在硬盘里不上云，所以这个站能一直免费跑下去。\n照片传上来先读 EXIF 里的拍摄时间和坐标；没有坐标的落进「待标点」，在管理页地图上点一下、写个地名，一次能标一批。\n攒够一趟就归成一次旅程：一趟一个名字、一段起止日期，点进去是按天分组的那几天。',
    footer: '走到哪儿，拍到哪儿。照片与文字均为本人拍摄整理。',
    sidenotes: ['照片只存网页尺寸，原图不上云。', '没有 GPS 的照片在管理页手动标点。', '一趟旅程 = 名字 + 起止日期 + 一组照片。'],
  };

  const paras = (text) => String(text || '').split(/\n+/).map((s) => s.trim()).filter(Boolean)
    .map((s) => `<p>${esc(s)}</p>`).join('');

  // 双态：照片还少的时候是「创刊号」，够三张了才切成正常的一期
  const isFirstIssue = (photos) => photos.length < 3;

  const renderIssue = (copy, photos) => {
    const first = isFirstIssue(photos);
    document.body.classList.toggle('is-first-issue', first);
    const kicker = $('issue-kicker');
    if (kicker) kicker.textContent = first ? '创刊号' : `本期 · ${new Date().getFullYear()}`;
    const mastKicker = document.querySelector('.masthead .kicker');
    if (mastKicker && first) mastKicker.textContent = `创刊号 · ${new Date().getFullYear()}`;
    const note = $('issue-note');
    if (note) note.innerHTML = paras(copy.issue_note || COPY_DEFAULT.issue_note);
    const side = $('sidenotes');
    if (!side) return;
    const list = (copy.sidenotes && copy.sidenotes.length) ? copy.sidenotes : COPY_DEFAULT.sidenotes;
    side.innerHTML = list.map((s) => `<p class="sidenote">${esc(s)}</p>`).join('');
  };

  // 跨页图版：挑一张最「横」的照片当主图（横图才撑得住跨页），配一句说明
  const renderSpread = (photos, trips) => {
    const host = $('spread');
    if (!host) return;
    const withImg = photos.filter((p) => p.key_web && p.width && p.height);
    host.hidden = false;
    if (!withImg.length) {
      host.innerHTML = `
        <div class="spread__blank">
          <p class="spread__blank-no">图版 01</p>
          <p class="spread__blank-text">这一期还没有主图。传上第一批照片之后，这里会放一张最横的，配一段说明。</p>
        </div>
        <figcaption class="spread__cap">空着也是一种说法 —— 创刊号先把版式立起来，内容随后到。</figcaption>`;
      return;
    }
    const pick = withImg.slice().sort((a, b) => (b.width / b.height) - (a.width / a.height))[0];
    const trip = trips.find((t) => t.id === pick.trip_id);
    const meta = [pick.place || '', fmtDate(pick.shot_at) || '', trip ? trip.title : ''].filter(Boolean).join(' · ');
    host.innerHTML = `
      <button class="spread__open" type="button" data-web="${esc(pick.key_web)}" data-cap="${esc(pick.caption || pick.place || '')}" aria-label="查看大图：${esc(pick.caption || pick.place || '旅行照片')}">
        <img src="${esc(imgSrc(pick.key_web))}" alt="${esc(pick.caption || pick.place || '旅行照片')}" loading="lazy">
      </button>
      <figcaption class="spread__cap">
        ${meta ? `<span class="spread__cap-meta">${esc(meta)}</span>` : ''}
        ${pick.caption ? `<span class="spread__cap-text">${esc(pick.caption)}</span>` : ''}
      </figcaption>`;
  };

  // 年表：把旅程按年份摞成一条轴；空站时它就是一句「等待第一批」
  const renderYears = (trips) => {
    const host = $('trip-years');
    if (!host) return;
    const byYear = new Map();
    for (const t of trips) {
      const y = String(t.start_date || '').slice(0, 4) || '未标日期';
      byYear.set(y, (byYear.get(y) || 0) + 1);
    }
    if (!byYear.size) {
      host.innerHTML = '<p class="years__empty">还没有年份可排 —— 第一趟旅程建起来之后，这里会长出一条时间轴。</p>';
      return;
    }
    host.innerHTML = Array.from(byYear.entries())
      .sort((a, b) => String(b[0]).localeCompare(String(a[0])))
      .map(([y, n]) => `<span class="years__item"><b>${esc(y)}</b><span>${n} 次</span></span>`)
      .join('');
  };

  // 地点索引：地点 → 张数，点一下把地图飞过去
  const renderPlaces = (photos) => {
    const host = $('place-index');
    if (!host) return;
    const pinned = photos.filter((p) => p.lat !== null && p.lng !== null && p.place);
    const byPlace = new Map();
    for (const p of pinned) {
      const cur = byPlace.get(p.place) || { n: 0, lat: p.lat, lng: p.lng };
      cur.n += 1;
      byPlace.set(p.place, cur);
    }
    const loose = photos.filter((p) => p.lat === null || p.lng === null).length;
    if (!byPlace.size) {
      host.innerHTML = `<p class="place-index__empty">还没有标好位置的照片${loose ? `（另有 ${loose} 张在待标点）` : ''}。标好之后，地点会在这里列成一条。<br><a href="/admin">去管理页标点 →</a></p>`;
      return;
    }
    const rows = Array.from(byPlace.entries()).sort((a, b) => b[1].n - a[1].n);
    host.innerHTML = `<p class="place-index__head">地点 · ${rows.length} 处</p>`
      + rows.map(([place, v]) => `<button class="place-index__row" type="button" data-fly="${v.lat},${v.lng}">
        <span class="place-index__name">${esc(place)}</span>
        <span class="place-index__n">${v.n}</span>
      </button>`).join('');
  };
  document.addEventListener('click', (e) => {
    const hit = e.target.closest ? e.target.closest('[data-fly]') : null;
    if (!hit) return;
    const parts = String(hit.dataset.fly).split(',').map(Number);
    if (!Number.isFinite(parts[0]) || !Number.isFinite(parts[1])) return;
    if (!ensureMap() || !map) return;
    map.flyTo([parts[0], parts[1]], 11);
  });

  // 方法卡：正文是你写的，右边那栏数字是算出来的
  const renderMethod = (copy, photos, stats) => {
    const body = $('method-body');
    if (body) body.innerHTML = paras(copy.method || COPY_DEFAULT.method);
    const aside = $('method-aside');
    if (!aside) return;
    const places = new Set(photos.filter((p) => p.place).map((p) => p.place)).size;
    const years = Array.from(new Set(photos.map((p) => String(p.shot_at || '').slice(0, 4)).filter(Boolean)))
      .map(Number).sort((a, b) => a - b);
    const span = years.length ? (years[0] === years[years.length - 1] ? String(years[0]) : `${years[0]}–${years[years.length - 1]}`) : '—';
    aside.innerHTML = `
      <p class="method-card__no">这一期</p>
      <dl class="method-card__stats">
        <div><dt>照片</dt><dd>${stats.photos || 0}</dd></div>
        <div><dt>已定位</dt><dd>${stats.pinned || 0}</dd></div>
        <div><dt>地点</dt><dd>${places}</dd></div>
        <div><dt>旅程</dt><dd>${stats.trips || 0}</dd></div>
        <div><dt>年份</dt><dd>${esc(span)}</dd></div>
      </dl>`;
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
    const copy = data.copy || {};

    // 后台写过的导语/页脚覆盖内置文案；没写过就保持 HTML 里的原话
    const descEl = document.querySelector('.masthead__desc');
    if (descEl && copy.lede) descEl.textContent = copy.lede;
    const footEl = document.querySelector('.colophon__line');
    if (footEl && copy.footer) footEl.textContent = copy.footer;

    // stats.pinned 是「已定位的照片数」，不是地点数 —— 地点数由地图那行去算
    $('stats').innerHTML = [
      `<b data-rb="countup">${stats.photos || 0}</b> 张照片`,
      `<b data-rb="countup">${stats.pinned || 0}</b> 张有坐标`,
      `<b data-rb="countup">${stats.trips || 0}</b> 次旅程`,
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
    renderIssue(copy, photos);
    renderSpread(photos, trips);
    renderFeature(trips, photos);
    renderTripIndex(trips, photos);
    renderYears(trips);
    renderStrip(photos);
    drawMap(photos);
    renderPlaces(photos);
    renderMethod(copy, photos, stats);
    drawWall(photos);
    // 交给 reactbits.js：计数、逐字浮现、掠过光都在这之后挂载
    document.dispatchEvent(new CustomEvent('site:rendered'));
  })();
})();