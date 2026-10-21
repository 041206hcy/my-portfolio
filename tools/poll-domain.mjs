const targets = ["https://shackle0412.vip/", "https://shackle0412.vip/api/site"];
(async () => {
  for (let i = 0; i < 10; i++) {
    for (const u of targets) {
      const t0 = Date.now();
      try {
        const r = await fetch(u, { signal: AbortSignal.timeout(15000) });
        const body = await r.text();
        console.log(new Date().toISOString().slice(11, 19), String(r.status).padEnd(4), (Date.now() - t0 + "ms").padEnd(7), u, body.slice(0, 90).replace(/\s+/g, " "));
      } catch (e) {
        console.log(new Date().toISOString().slice(11, 19), "ERR ", (Date.now() - t0 + "ms").padEnd(7), u, e.message);
      }
    }
    await new Promise((r) => setTimeout(r, 18000));
  }
})();
