/* 内容板块（生活/学习/作品/书影音/技能共用）的后台编辑器。
   与 admin.js 同源：口令存在 localStorage 的 photosite-admin-token，请求带 x-admin-token。
   所有写操作都打 /api/admin/*，不带口令一律 401。 */
(() => {
  const $ = (id) => document.getElementById(id);
  const TOKEN_KEY = 'photosite-admin-token';
  const SECTION_NAME = { life: '生活记录', learn: '学习笔记', work: '作品与项目', media: '书影音', skill: '技能与工具箱' };

  const token = () => {
    try {
      return localStorage.getItem(TOKEN_KEY) || '';
    } catch {
      return '';
    }
  };
  const hint = (msg) => {
    const el = $('post-status');
    if (el) el.textContent = msg;
  };
  const esc = (s) =>
    String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const today = () => {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  };

  async function api(path, init) {
    const res = await fetch(path, {
      ...(init || {}),
      headers: { 'x-admin-token': token(), ...((init && init.headers) || {}) },
    });
    if (res.status === 401) {
      hint('需要管理口令：先在页面最上面的「需要管理口令」里粘贴口令并保存，再回来点一次。');
      throw new Error('unauthorized');
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'HTTP ' + res.status);
    return data;
  }
  const postJson = (path, body) =>
    api(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

  let posts = [];

  function itemHTML(p) {
    const tags = String(p.tags || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    return `<div class="bar" data-id="${esc(p.id)}">
      <b style="flex:1;min-width:220px">${esc(p.title)}</b>
      <span class="hint">${esc(SECTION_NAME[p.section] || p.section)} · ${esc(String(p.posted_at || '').slice(0, 10) || '未标日期')} · ${
        p.visibility === 'public' ? '公开' : p.visibility === 'link' ? '仅链接' : '仅自己'
      }${tags.length ? ' · ' + esc(tags.join(' / ')) : ''}</span>
      <button class="btn" type="button" data-edit="${esc(p.id)}">编辑</button>
      <a class="btn" href="/p/${esc(p.id)}" target="_blank" rel="noopener">看</a>
      <button class="btn btn--danger" type="button" data-del="${esc(p.id)}">删除</button>
    </div>`;
  }

  async function load() {
    try {
      const d = await api('/api/admin/posts');
      posts = d.posts || [];
      hint(`共 ${posts.length} 条内容。`);
    } catch (e) {
      posts = [];
      if (String(e.message) !== 'unauthorized') hint('读不到内容：' + e.message);
    }
    const n = $('posts-count');
    if (n) n.textContent = String(posts.length);
    $('post-admin-list').innerHTML = posts.length
      ? posts.map(itemHTML).join('')
      : '<p class="section__text">还没有内容。在上面写第一条，保存后就会出现在这里。</p>';
  }

  function fill(p) {
    $('post-id').value = p.id || '';
    $('post-section').value = p.section || 'life';
    $('post-title').value = p.title || '';
    $('post-excerpt').value = p.excerpt || '';
    $('post-tags').value = p.tags || '';
    $('post-date').value = String(p.posted_at || '').slice(0, 10) || '';
    $('post-vis').value = p.visibility || 'public';
    $('post-body').value = p.body || '';
  }

  function reset(scroll) {
    fill({});
    $('post-date').value = today();
    hint('表单已清空。');
    if (scroll) window.scrollTo({ top: $('posts').offsetTop - 20, behavior: 'smooth' });
  }

  async function save(e) {
    e.preventDefault();
    const id = $('post-id').value.trim();
    const payload = {
      section: $('post-section').value,
      title: $('post-title').value.trim(),
      excerpt: $('post-excerpt').value.trim(),
      tags: $('post-tags').value.trim(),
      posted_at: $('post-date').value || today(),
      visibility: $('post-vis').value,
      body: $('post-body').value,
    };
    if (!payload.title) return hint('标题不能空。');
    if (id) payload.id = id;
    hint('保存中……');
    try {
      const d = await postJson('/api/admin/post', payload);
      hint(`已保存（${id ? '更新' : '新建'}）：${d.id || ''}。`);
      $('post-id').value = d.id || id;
      await load();
    } catch (err) {
      if (String(err.message) !== 'unauthorized') hint('保存失败：' + err.message);
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    const form = $('post-form');
    if (!form) return;
    form.addEventListener('submit', save);
    $('post-reset').addEventListener('click', () => reset(true));
    $('post-admin-list').addEventListener('click', async (e) => {
      const del = e.target.closest('[data-del]');
      if (del) {
        const id = del.dataset.del;
        const p = posts.find((x) => x.id === id);
        if (!window.confirm(`确定删掉「${(p && p.title) || id}」？删了就找不回来了。`)) return;
        try {
          await postJson('/api/admin/post-delete', { id });
          hint('已删除。');
          await load();
        } catch (err) {
          if (String(err.message) !== 'unauthorized') hint('删除失败：' + err.message);
        }
        return;
      }
      const ed = e.target.closest('[data-edit]');
      if (ed) {
        const p = posts.find((x) => x.id === ed.dataset.edit);
        if (!p) return;
        fill(p);
        hint('已载入到表单，改完点「保存」。');
        window.scrollTo({ top: $('posts').offsetTop - 20, behavior: 'smooth' });
      }
    });
    reset(false);
    load();
  });
})();