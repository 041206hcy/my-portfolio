/* 验证管理接口那道锁：无口令 → 401，错口令 → 401，对口令 → 200。
   用法：node tools/auth-check.mjs http://127.0.0.1:8788 ps-xxxx
*/

const base = process.argv[2] || 'http://127.0.0.1:8788';
const token = process.argv[3] || '';

const probe = async (label, headers) => {
  try {
    const res = await fetch(base + '/api/admin/overview', { headers });
    const body = await res.text();
    console.log(`${String(res.status).padEnd(4)} ${label.padEnd(10)} ${body.slice(0, 60)}`);
    return res.status;
  } catch (err) {
    console.log(`ERR  ${label.padEnd(10)} ${err.message}`);
    return 0;
  }
};

await probe('无口令', {});
await probe('错口令', { 'x-admin-token': 'wrong-token' });
if (token) await probe('对口令', { 'x-admin-token': token });

// 公开接口不受影响
const pub = await fetch(base + '/api/site');
console.log(`${String(pub.status).padEnd(4)} 公开 /api/site（应当仍是 200）`);