import fs from "node:fs";
const BASE = "https://shackle0412.vip";
const TOKEN = "ps-2b8f11ec6f16964cddc95aaaafeb2119";
const H = { "x-admin-token": TOKEN };

const trip = { id: "2026-08-01-d82x", title: "杭州 → 上海", subtitle: "示例旅程（验收用，可删）",
  summary: "西湖、乌镇、外滩，三个傍晚。", start_date: "2026-08-01", end_date: "2026-08-05", visibility: "public" };
let r = await fetch(BASE + "/api/admin/trip", { method: "POST", headers: { ...H, "content-type": "application/json" }, body: JSON.stringify(trip) });
console.log("trip  ", r.status, (await r.text()).slice(0, 100));

const photos = [
  { id: "2aac6771b95d4746", trip_id: "2026-08-01-d82x", lat: 30.2561, lng: 120.1542, place: "西湖 · 断桥", caption: "西湖 · 断桥", shot_at: "2026-08-01T17:40:00", width: 1600, height: 1067, key_thumb: "photos/2aac6771b95d4746/thumb.webp", key_web: "photos/2aac6771b95d4746/web.webp", visibility: "public" },
  { id: "19dcc45f4b8a49f3", trip_id: "2026-08-01-d82x", lat: 30.7462, lng: 120.4894, place: "乌镇 · 西栅", caption: "乌镇 · 西栅", shot_at: "2026-08-03T19:05:00", width: 1600, height: 1067, key_thumb: "photos/19dcc45f4b8a49f3/thumb.webp", key_web: "photos/19dcc45f4b8a49f3/web.webp", visibility: "public" },
  { id: "8f0f55ba617d4191", trip_id: "2026-08-01-d82x", lat: 31.2304, lng: 121.4737, place: "外滩 · 夜", caption: "外滩 · 夜", shot_at: "2026-08-05T21:10:00", width: 1600, height: 1067, key_thumb: "photos/8f0f55ba617d4191/thumb.webp", key_web: "photos/8f0f55ba617d4191/web.webp", visibility: "public" },
  { id: "w1i00kyr9924dyus", trip_id: null, lat: 30.86244728755089, lng: 120.10133743286134, place: "湖州", caption: "湖州", shot_at: null, width: 640, height: 480, key_thumb: "photos/w1i00kyr9924dyus/thumb.webp", key_web: "photos/w1i00kyr9924dyus/web.webp", visibility: "public" }
];

for (const p of photos) {
  for (const kind of ["thumb", "web"]) {
    const buf = fs.readFileSync(`.devdata/r2/photos/${p.id}/${kind}.webp`);
    const rr = await fetch(`${BASE}/api/admin/blob?pid=${p.id}&kind=${kind}`, { method: "POST", headers: { ...H, "content-type": "image/webp" }, body: buf });
    console.log(`blob   ${p.id} ${kind.padEnd(5)} ${String(buf.length).padStart(6)}B  ${rr.status}`, (await rr.text()).slice(0, 60));
  }
  const rp = await fetch(BASE + "/api/admin/photo", { method: "POST", headers: { ...H, "content-type": "application/json" }, body: JSON.stringify(p) });
  console.log(`photo  ${p.id}  ${rp.status}`, (await rp.text()).slice(0, 80));
}

const s = await fetch(BASE + "/api/site");
console.log("site   ", s.status, (await s.text()).slice(0, 200));
const img = await fetch(BASE + "/img/photos/2aac6771b95d4746/thumb.webp");
console.log("image  ", img.status, img.headers.get("content-type"), img.headers.get("cache-control"), (await img.arrayBuffer()).byteLength + "B");
