const urls = ["https://myfirst.041206hcy.workers.dev/", "https://myfirst.041206hcy.workers.dev/map.html", "https://myfirst.041206hcy.workers.dev/journeys.html"];
for (const u of urls) {
  try {
    const r = await fetch(u, { signal: AbortSignal.timeout(15000) });
    const t = await r.text();
    const hit = t.includes("整本相册") ? "新内容" : (t.includes("黄翀与的旅程") ? "旧版/首页" : "?");
    console.log(`${r.status}  ${hit}  ${t.length}B  ${u}`);
  } catch (e) { console.log(`ERR ${e.message}  ${u}`); }
}
