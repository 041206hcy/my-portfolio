/* 创刊号版式自检：接口有没有 copy、首页有没有承载那些区块的节点、写接口收不收非 copy.* 的键
   用法：先跑 dev-harness，再 `node --no-warnings tools/issue-check.mjs`（默认 8787） */
const B = process.env.BASE || 'http://127.0.0.1:8787';

const IDS = ['issue-kicker', 'issue-note', 'sidenotes', 'spread', 'trip-years', 'place-index', 'method-body', 'method-aside'];

let pass = 0;
let fail = 0;
const ok = (cond, msg) => {
  console.log((cond ? '  ok    ' : ' FAIL   ') + msg);
  if (cond) pass += 1; else fail += 1;
};

const post = (path, body) => fetch(B + path, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

const html = await (await fetch(B + '/')).text();
for (const id of IDS) ok(html.includes(`id="${id}"`), `首页有 #${id}`);
ok(html.includes('class="lede-band"'), '首页有编辑层 .lede-band');
ok(html.includes('class="map-layout"'), '地图与地点索引并成两栏');

const before = await (await fetch(B + '/api/site')).json();
ok(before.copy && Array.isArray(before.copy.sidenotes), '/api/site 返回 copy 结构');

const saveRes = await post('/api/admin/settings', {
  values: {
    'copy.issue_note': '自检手记。\n第二段。',
    'copy.sidenotes': JSON.stringify(['甲', '乙']),
    'nope': '不该被收下',
  },
});
const saved = await saveRes.json();
ok(saveRes.status === 200 && saved.saved === 2, `写接口只接受 copy.* 键（saved=${saved.saved}）`);

const after = await (await fetch(B + '/api/site')).json();
ok(String(after.copy.issue_note).includes('自检手记'), '手记能写能读');
ok(after.copy.sidenotes.length === 2, '边注（JSON 数组）能写能读');

await post('/api/admin/settings', { values: { 'copy.issue_note': '', 'copy.sidenotes': '[]' } });
const reset = await (await fetch(B + '/api/site')).json();
ok(reset.copy.issue_note === '' && reset.copy.sidenotes.length === 0, '自检写进去的文字已清回空');

console.log(`\n通过 ${pass}，失败 ${fail}`);
process.exit(fail ? 1 : 0);