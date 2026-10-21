/* 管理页：上传（浏览器内压两档）→ 地图标点 → 归类/可见性 → 旅程 */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
  const imgSrc = (key) => '/img/' + String(key).split('/').map(encodeURIComponent).join('/');
  const pad = (n) => String(n).padStart(2, '0');
  const fmtDate = (v) => {
    if (!v) return '';
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return String(v).slice(0, 10);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };

  const state = {
    photos: [],
    trips: [],
    pendingSel: new Set(),
    allSel: new Set(),
    pin: null,
    pinMarker: null,
    pinnedLayer: null,
    map: null,
  };

  /* ---------------- 管理口令 ---------------- */
  // 服务端只存口令的 SHA-256（wrangler.jsonc 里的 ADMIN_TOKEN_SHA256），明文只留在本机浏览器。
  const TOKEN_KEY = 'photosite-admin-token';
  const token = () => { try { return localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; } };
  const withToken = (headers) => {
    const h = Object.assign({}, headers);
    const t = token();
    if (t) h['x-admin-token'] = t;
    return h;
  };
  const authBar = (show) => { const el = $('auth-bar'); if (el) el.hidden = !show; };

  /* ---------------- 请求封装 ---------------- */

  const assertOk = async (res) => {
    if (res.status === 401) {
      authBar(true);
      throw new Error('需要管理口令：在页面顶部填入口令并保存后重试');
    }
    if (!res.ok) throw new Error(`HTTP ${res.status} ${(await res.text()).slice(0, 140)}`);
    return res;
  };
  const api = async (path, init) => {
    const opts = Object.assign({}, init);
    opts.headers = withToken(init && init.headers);
    const res = await assertOk(await fetch(path, opts));
    return res.json();
  };
  const postJson = (path, body) => api(path, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  const notice = (msg, bad) => {
    $('drop-hint').textContent = msg;
    $('drop-hint').classList.toggle('is-bad', !!bad);
  };

  /* ---------------- 上传：浏览器内压两档 ---------------- */

  const MAX_THUMB = 400;
  const MAX_WEB = 1600;
  const QUALITY = 0.82;

  const newPid = () => {
    const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
    const buf = new Uint8Array(16);
    crypto.getRandomValues(buf);
    let out = '';
    for (const b of buf) out += alphabet[b % alphabet.length];
    return out;
  };

  const encode = async (bitmap, maxEdge, quality) => {
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', quality));
    if (!blob) throw new Error('这个浏览器导不出 WebP');
    return { blob, w, h };
  };

  // EXIF 里的时间经常是假的（不少相机/截图会写 1980-01-01 或 0000:00:00），
  // 离谱年份一律当成「时间未知」，免得照片墙上冒出 1980 年
  const localStamp = (d) => {
    if (!(d instanceof Date) || Number.isNaN(d.getTime())) return null;
    const y = d.getFullYear();
    if (y < 1990 || y > new Date().getFullYear() + 1) return null;
    return `${y}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  };

  const newRow = (name) => {
    const li = document.createElement('li');
    li.className = 'up-list__item';
    li.innerHTML = `<span class="up-list__name">${esc(name)}</span><span class="up-list__state">排队中…</span>`;
    $('up-list').prepend(li);
    return li.querySelector('.up-list__state');
  };

  async function uploadOne(file) {
    const status = newRow(file.name);
    try {
      status.textContent = '读 EXIF…';
      const hasExifr = typeof exifr !== 'undefined';
      const [gps, exif] = await Promise.all([
        hasExifr ? exifr.gps(file).catch(() => null) : null,
        hasExifr ? exifr.parse(file, { pick: ['DateTimeOriginal', 'CreateDate'] }).catch(() => null) : null,
      ]);

      status.textContent = '压缩…';
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
        .catch(() => createImageBitmap(file));
      const web = await encode(bitmap, MAX_WEB, QUALITY);
      const thumb = await encode(bitmap, MAX_THUMB, QUALITY);
      if (typeof bitmap.close === 'function') bitmap.close();

      const pid = newPid();
      status.textContent = '上传中…';
      await assertOk(await fetch(`/api/admin/blob?pid=${pid}&kind=thumb`, {
        method: 'POST', headers: withToken({ 'content-type': 'image/webp' }), body: thumb.blob,
      }));
      await assertOk(await fetch(`/api/admin/blob?pid=${pid}&kind=web`, {
        method: 'POST', headers: withToken({ 'content-type': 'image/webp' }), body: web.blob,
      }));

      const lat = gps && typeof gps.latitude === 'number' ? gps.latitude : null;
      const lng = gps && typeof gps.longitude === 'number' ? gps.longitude : null;
      const bytes = web.blob.size + thumb.blob.size;

      await postJson('/api/admin/photo', {
        id: pid,
        width: web.w,
        height: web.h,
        bytes,
        shot_at: localStamp(exif && (exif.DateTimeOriginal || exif.CreateDate)),
        lat,
        lng,
        key_thumb: `photos/${pid}/thumb.webp`,
        key_web: `photos/${pid}/web.webp`,
      });

      status.textContent = `完成 · ${web.w}×${web.h} · ${Math.round(bytes / 1024)}KB${lat !== null ? ' · 带坐标' : ' · 待标点'}`;
      status.classList.add('is-ok');
      return true;
    } catch (err) {
      status.textContent = '失败：' + err.message;
      status.classList.add('is-bad');
      return false;
    }
  }

  let uploading = false;

  async function uploadFiles(list) {
    const files = Array.from(list).filter((f) => f.type.startsWith('image/'));
    if (!files.length) {
      notice('这些文件里没有图片。', true);
      return;
    }
    if (uploading) {
      notice('上一批还在传，等它跑完再选。', true);
      return;
    }
    uploading = true;
    notice(`正在处理 ${files.length} 张…（压缩和上传都在本机做，别关页面）`);
    let ok = 0;
    for (const f of files) {
      // eslint-disable-next-line no-await-in-loop
      if (await uploadOne(f)) ok += 1;
    }
    uploading = false;
    notice(`这一批 ${ok}/${files.length} 张成功，列表已刷新。`);
    await load();
  }

  /* ---------------- 列表渲染 ---------------- */

  const thumbItem = (p, sel, group) => `
    <label class="thumb${sel.has(p.id) ? ' is-sel' : ''}">
      <input type="checkbox" data-group="${group}" value="${esc(p.id)}"${sel.has(p.id) ? ' checked' : ''}>
      <img src="${esc(imgSrc(p.key_thumb))}" alt="" loading="lazy">
      <span class="thumb__meta">
        <span class="thumb__place">${esc(p.place || (p.lat === null ? '待标点' : '有坐标'))}</span>
        <span class="thumb__sub">${esc(fmtDate(p.shot_at) || '时间未知')} · ${esc(p.visibility)}${p.trip_id ? ' · ' + esc(p.trip_id) : ''}</span>
      </span>
    </label>`;

  const pendingPhotos = () => state.photos.filter((p) => p.lat === null || p.lng === null);

  const renderTrips = () => {
    const options = ['<option value="">归入旅程…</option>']
      .concat(state.trips.map((t) => `<option value="${esc(t.id)}">${esc(t.title)}</option>`))
      .join('');
    const keep = $('bulk-trip').value;
    $('bulk-trip').innerHTML = options;
    $('bulk-trip').value = keep;

    $('trip-admin-list').innerHTML = state.trips.length
      ? state.trips.map((t) => {
        const n = state.photos.filter((p) => p.trip_id === t.id).length;
        return `
          <div class="trip-admin__row">
            <div>
              <strong>${esc(t.title)}</strong>
              <span class="trip-admin__meta">${esc(fmtDate(t.start_date) || '')}${t.end_date ? ' – ' + esc(fmtDate(t.end_date)) : ''} · ${n} 张 · ${esc(t.visibility)}</span>
            </div>
            <div class="trip-admin__ops">
              <button class="btn" type="button" data-trip-edit="${esc(t.id)}">编辑</button>
              <button class="btn btn--danger" type="button" data-trip-del="${esc(t.id)}">删除</button>
            </div>
          </div>`;
      }).join('')
      : '<p class="section__text">还没有旅程。上面填一个标题保存，就有了。</p>';
  };

  const updateButtons = () => {
    const pend = state.pendingSel.size;
    const all = state.allSel.size;
    $('pin-apply').disabled = !(pend && state.pin);
    $('pin-apply').textContent = pend ? `给选中的 ${pend} 张打点` : '给选中的照片打点';
    $('bulk-trip-apply').disabled = !all;
    $('bulk-vis-apply').disabled = !all;
    $('bulk-del').disabled = !all;
  };

  const render = () => {
    const pending = pendingPhotos();
    $('pending-count').textContent = String(pending.length);
    $('all-count').textContent = String(state.photos.length);
    $('pending-list').innerHTML = pending.length
      ? pending.map((p) => thumbItem(p, state.pendingSel, 'pending')).join('')
      : '<p class="section__text">都标好了，没有待标点的照片。</p>';
    $('all-list').innerHTML = state.photos.length
      ? state.photos.map((p) => thumbItem(p, state.allSel, 'all')).join('')
      : '<p class="section__text">还没有照片，先在上面传一批。</p>';
    renderTrips();
    updateButtons();
  };

  /* ---------------- 标点地图 ---------------- */

  function drawPinnedDots() {
    if (!state.map || typeof L === 'undefined') return;
    if (state.pinnedLayer) state.pinnedLayer.remove();
    state.pinnedLayer = L.layerGroup();
    for (const p of state.photos) {
      if (p.lat === null || p.lng === null) continue;
      L.circleMarker([p.lat, p.lng], {
        radius: 4, color: '#4ea1ff', weight: 1, fillOpacity: 0.5,
      }).bindTooltip(p.place || '已标点').addTo(state.pinnedLayer);
    }
    state.pinnedLayer.addTo(state.map);
  }

  function ensureMap() {
    if (state.map || typeof L === 'undefined') return;
    state.map = L.map('pin-map', { scrollWheelZoom: true }).setView([34.5, 108], 4);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '底图 © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> 贡献者',
    }).addTo(state.map);
    state.map.on('click', (e) => {
      state.pin = { lat: e.latlng.lat, lng: e.latlng.lng };
      if (state.pinMarker) state.pinMarker.setLatLng(e.latlng);
      else state.pinMarker = L.marker(e.latlng).addTo(state.map);
      $('pin-hint').textContent = `已选点：${state.pin.lat.toFixed(5)}, ${state.pin.lng.toFixed(5)}`;
      updateButtons();
    });
    drawPinnedDots();
  }

  /* ---------------- 读取与刷新 ---------------- */

  async function load() {
    const data = await api('/api/admin/overview');
    state.photos = data.photos || [];
    state.trips = data.trips || [];
    const alive = new Set(state.photos.map((p) => p.id));
    for (const sel of [state.pendingSel, state.allSel]) {
      for (const id of [...sel]) if (!alive.has(id)) sel.delete(id);
    }
    render();
    drawPinnedDots();
  }

  /* ---------------- 事件绑定 ---------------- */

  $('pick').addEventListener('click', () => $('file').click());
  $('file').addEventListener('change', (e) => {
    uploadFiles(e.target.files);
    e.target.value = '';
  });

  const drop = $('drop');
  ['dragenter', 'dragover'].forEach((evt) => drop.addEventListener(evt, (e) => {
    e.preventDefault();
    drop.classList.add('is-hot');
  }));
  ['dragleave', 'drop'].forEach((evt) => drop.addEventListener(evt, (e) => {
    e.preventDefault();
    drop.classList.remove('is-hot');
  }));
  drop.addEventListener('drop', (e) => {
    if (e.dataTransfer && e.dataTransfer.files) uploadFiles(e.dataTransfer.files);
  });

  document.addEventListener('change', (e) => {
    const box = e.target.closest('input[type=checkbox][data-group]');
    if (!box) return;
    const sel = box.dataset.group === 'pending' ? state.pendingSel : state.allSel;
    if (box.checked) sel.add(box.value);
    else sel.delete(box.value);
    box.closest('.thumb')?.classList.toggle('is-sel', box.checked);
    updateButtons();
  });

  const selectAll = (group, on) => {
    const sel = group === 'pending' ? state.pendingSel : state.allSel;
    sel.clear();
    if (on) {
      const list = group === 'pending' ? pendingPhotos() : state.photos;
      for (const p of list) sel.add(p.id);
    }
    render();
  };
  $('pending-all').addEventListener('click', () => selectAll('pending', true));
  $('pending-none').addEventListener('click', () => selectAll('pending', false));
  $('all-all').addEventListener('click', () => selectAll('all', true));
  $('all-none').addEventListener('click', () => selectAll('all', false));

  $('pin-apply').addEventListener('click', async () => {
    if (!state.pin || !state.pendingSel.size) return;
    const btn = $('pin-apply');
    btn.disabled = true;
    try {
      await postJson('/api/admin/bulk-pin', {
        ids: [...state.pendingSel],
        lat: state.pin.lat,
        lng: state.pin.lng,
        place: $('place-input').value.trim(),
      });
      state.pendingSel.clear();
      $('place-input').value = '';
      await load();
      notice('打点完成。');
    } catch (err) {
      notice('打点失败：' + err.message, true);
    } finally {
      updateButtons();
    }
  });

  $('bulk-trip-apply').addEventListener('click', async () => {
    const tripId = $('bulk-trip').value;
    if (!state.allSel.size) return;
    try {
      await postJson('/api/admin/bulk-set', { ids: [...state.allSel], trip_id: tripId || null });
      state.allSel.clear();
      await load();
      notice(tripId ? '已归入旅程。' : '已移出旅程（回到日常）。');
    } catch (err) {
      notice('归入失败：' + err.message, true);
    }
  });

  $('bulk-vis-apply').addEventListener('click', async () => {
    const visibility = $('bulk-vis').value;
    if (!visibility || !state.allSel.size) return;
    try {
      await postJson('/api/admin/bulk-set', { ids: [...state.allSel], visibility });
      state.allSel.clear();
      await load();
      notice('可见性已改。');
    } catch (err) {
      notice('改可见性失败：' + err.message, true);
    }
  });

  $('bulk-del').addEventListener('click', async () => {
    const ids = [...state.allSel];
    if (!ids.length) return;
    if (!window.confirm(`确定删除这 ${ids.length} 张照片？图片文件也会一起删掉。`)) return;
    try {
      for (const id of ids) {
        // eslint-disable-next-line no-await-in-loop
        await postJson('/api/admin/photo-delete', { id });
      }
      state.allSel.clear();
      await load();
      notice(`已删除 ${ids.length} 张。`);
    } catch (err) {
      notice('删除失败：' + err.message, true);
    }
  });

  /* ---------------- 旅程表单 ---------------- */

  $('trip-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = $('trip-id').value;
    const payload = {
      title: $('trip-title').value.trim(),
      start_date: $('trip-start').value || null,
      end_date: $('trip-end').value || null,
      summary: $('trip-summary').value.trim() || null,
      visibility: $('trip-vis').value,
    };
    if (id) payload.id = id;
    if (!payload.title) return;
    try {
      await postJson('/api/admin/trip', payload);
      resetTripForm();
      await load();
      notice('旅程已保存。');
    } catch (err) {
      notice('保存旅程失败：' + err.message, true);
    }
  });

  const resetTripForm = () => {
    $('trip-id').value = '';
    $('trip-title').value = '';
    $('trip-start').value = '';
    $('trip-end').value = '';
    $('trip-summary').value = '';
    $('trip-vis').value = 'public';
    $('trip-save').textContent = '保存旅程';
  };
  $('trip-reset').addEventListener('click', resetTripForm);

  $('trip-admin-list').addEventListener('click', async (e) => {
    const editBtn = e.target.closest('[data-trip-edit]');
    if (editBtn) {
      const t = state.trips.find((x) => x.id === editBtn.dataset.tripEdit);
      if (!t) return;
      $('trip-id').value = t.id;
      $('trip-title').value = t.title || '';
      $('trip-start').value = t.start_date || '';
      $('trip-end').value = t.end_date || '';
      $('trip-summary').value = t.summary || '';
      $('trip-vis').value = t.visibility || 'public';
      $('trip-save').textContent = '更新旅程';
      $('trip-title').focus();
      return;
    }
    const delBtn = e.target.closest('[data-trip-del]');
    if (delBtn) {
      const t = state.trips.find((x) => x.id === delBtn.dataset.tripDel);
      if (!t) return;
      if (!window.confirm(`删除旅程「${t.title}」？里面的照片会回到「日常」，不会被删。`)) return;
      try {
        await postJson('/api/admin/trip-delete', { id: t.id });
        await load();
        notice('旅程已删除，照片回到日常。');
      } catch (err) {
        notice('删除旅程失败：' + err.message, true);
      }
    }
  });

  /* ---------------- 启动 ---------------- */

  (async () => {
    // 口令输入框只在服务端返回 401 时才显形（authBar(true) 在 assertOk 里）
    const tokenInput = $('auth-token');
    if (tokenInput) {
      tokenInput.value = token();
      $('auth-save').addEventListener('click', () => {
        try { localStorage.setItem(TOKEN_KEY, tokenInput.value.trim()); } catch (e) { /* 隐私模式忽略 */ }
        authBar(false);
        notice('口令已保存，正在重新读取数据…');
        load()
          .then(() => notice('已连接，可以开始上传了。'))
          .catch((err) => notice('连接失败：' + err.message, true));
      });
      tokenInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') $('auth-save').click(); });
    }
    if (typeof L !== 'undefined') ensureMap();
    else $('pin-hint').textContent = '地图组件没加载出来（vendor/leaflet.js 缺失）。标点功能不可用。';
    try {
      await load();
    } catch (err) {
      notice('读取数据失败：' + err.message, true);
    }
  })();
})();