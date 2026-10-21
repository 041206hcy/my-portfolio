# -*- coding: utf-8 -*-
"""给本地开发库塞入示例数据：一条旅程 + 三张带坐标的照片（西湖 / 乌镇 / 外滩）。
用法（必须用捆绑 Python，系统 python 没有 Pillow）：
  & "C:\\Users\\黄翀与\\.dsh\\dsh-runtimes\\dsh-primary-runtime\\dependencies\\python\\python.exe" tools\\seed_demo.py
清空：给 dev-harness 加 --reset 重启即可。
"""
import io
import json
import sys
import urllib.request
import uuid

from PIL import Image, ImageDraw, ImageFont

BASE = "http://127.0.0.1:8787"
FONT_BOLD = "C:/Windows/Fonts/msyhbd.ttc"
FONT_REG = "C:/Windows/Fonts/msyh.ttc"

SPOTS = [
    ("西湖 · 断桥", "杭州 · 2026-08-01", 30.2561, 120.1542, "2026-08-01T17:40:00"),
    ("乌镇 · 西栅", "嘉兴 · 2026-08-03", 30.7462, 120.4894, "2026-08-03T19:05:00"),
    ("外滩 · 夜", "上海 · 2026-08-05", 31.2304, 121.4737, "2026-08-05T21:10:00"),
]


def post(path, data=None, ctype="application/json"):
    if data is None:
        body = b""
    elif isinstance(data, bytes):
        body = data
    else:
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(BASE + path, data=body, method="POST",
                                 headers={"Content-Type": ctype})
    with urllib.request.urlopen(req, timeout=30) as r:
        raw = r.read()
        return r.status, raw


def render(place, sub, w, h, quality=82):
    img = Image.new("RGB", (w, h), (14, 24, 38))
    d = ImageDraw.Draw(img)
    for y in range(h):                      # 竖渐变底
        t = y / h
        d.line([(0, y), (w, y)],
               fill=(int(14 + 46 * t), int(26 + 62 * t), int(40 + 78 * t)))
    for x in range(0, w, 4):                # 斜向光带
        d.line([(x, h), (x + int(h * 0.6), 0)], fill=(22, 40, 58))
    f1 = ImageFont.truetype(FONT_BOLD, max(28, int(h * 0.10)))
    f2 = ImageFont.truetype(FONT_REG, max(14, int(h * 0.038)))
    d.text((int(w * 0.05), int(h * 0.42)), place, font=f1, fill=(230, 237, 243))
    d.text((int(w * 0.052), int(h * 0.58)), sub, font=f2, fill=(147, 164, 181))
    buf = io.BytesIO()
    img.save(buf, "WEBP", quality=quality)
    return buf.getvalue(), (w, h)


def main():
    try:
        st, raw = post("/api/admin/trip", {
            "title": "杭州 → 上海", "subtitle": "示例旅程（验收用，可删）",
            "start_date": "2026-08-01", "end_date": "2026-08-05",
        })
    except Exception as e:
        print("连不上本地服务，请先启动 tools/dev-harness.mjs：" + str(e))
        return 1
    trip = json.loads(raw)          # 响应体是平铺的 {id, title, ...}，没有 data 包装
    print("旅程已建：%s  id=%s" % (trip.get("title"), trip.get("id")))

    for place, sub, lat, lng, shot in SPOTS:
        pid = uuid.uuid4().hex[:16]
        web, (ww, wh) = render(place, sub, 1600, 1067)
        thumb, _ = render(place, sub, 400, 267, quality=78)
        post("/api/admin/blob?pid=%s&kind=web" % pid, web, "image/webp")
        post("/api/admin/blob?pid=%s&kind=thumb" % pid, thumb, "image/webp")
        st, raw = post("/api/admin/photo", {
            "id": pid, "trip_id": trip["id"], "width": ww, "height": wh,
            "bytes": len(web), "shot_at": shot, "lat": lat, "lng": lng,
            "place": place, "caption": place,
            "key_thumb": "photos/%s/thumb.webp" % pid,
            "key_web": "photos/%s/web.webp" % pid,
        })
        ok = "ok" if st == 200 else "FAIL"
        print("  %s  %-14s %s  (%d,%d)  %d KB" % (ok, place, pid, lat, lng, len(web) // 1024))
    print("完成，打开 http://127.0.0.1:8787 看地图")
    return 0


if __name__ == "__main__":
    sys.exit(main())