/* 通过 GitHub Contents API 推送文件（绕过 git 协议，网络不稳时唯一可靠的路）
 * 用法（pwsh）：
 *   $env:GH_TOKEN = (& "C:\Program Files\GitHub CLI\gh.exe" auth token).Trim()
 *   node push_api.mjs "提交信息" public/index.html public/reactbits.js ...
 * 路径相对 personal-site/；文件已存在则带 sha 更新。
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO = '041206hcy/my-portfolio';
const BRANCH = 'main';
const TOKEN = process.env.GH_TOKEN;
const SITE = 'C:/Users/黄翀与/Documents/deepseek-harness/default-workspace/personal-site';

const [msg, ...files] = process.argv.slice(2);
if (!msg || !files.length) { console.log('用法: node push_api.mjs "提交信息" <相对路径...>'); process.exit(2); }
if (!TOKEN) { console.log('缺少 GH_TOKEN'); process.exit(2); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(path, init) {
  let lastErr;
  for (let i = 1; i <= 3; i++) {
    try {
      const r = await fetch('https://api.github.com' + path, {
        ...init,
        signal: AbortSignal.timeout(45000),
        headers: {
          authorization: 'Bearer ' + TOKEN,
          accept: 'application/vnd.github+json',
          'user-agent': 'node',
          'content-type': 'application/json',
          ...((init && init.headers) || {}),
        },
      });
      return r;
    } catch (e) { lastErr = e; console.log(`  retry ${i}/3 ${path} — ${e.message}`); await sleep(2500 * i); }
  }
  throw lastErr;
}

let bad = 0;
for (const f of files) {
  const abs = resolve(SITE, f);
  let content;
  try { content = readFileSync(abs).toString('base64'); }
  catch (e) { console.log(`SKIP ${f} — 读不到：${e.message}`); bad++; continue; }

  let sha = null;
  const g = await api(`/repos/${REPO}/contents/${f}?ref=${BRANCH}`);
  if (g.ok) sha = (await g.json()).sha;
  else if (g.status !== 404) { console.log(`GET  ${f} → ${g.status} ${(await g.text()).slice(0, 160)}`); bad++; continue; }

  const body = { message: msg, content, branch: BRANCH };
  if (sha) body.sha = sha;

  const p = await api(`/repos/${REPO}/contents/${f}`, { method: 'PUT', body: JSON.stringify(body) });
  if (p.ok) {
    const j = await p.json();
    console.log(`ok   ${f.padEnd(24)} ${j.commit.sha.slice(0, 7)}  ${sha ? 'update' : 'create'}  ${j.content.size}B`);
  } else {
    console.log(`FAIL ${f} → ${p.status} ${(await p.text()).slice(0, 200)}`);
    bad++;
  }
}
console.log(bad ? `\n${bad} 个文件失败` : `\n${files.length} 个文件全部推送成功`);
process.exit(bad ? 1 : 0);