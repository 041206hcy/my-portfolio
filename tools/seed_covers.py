"""给本地 dev 库的 生活/作品/书影音 内容各配一张封面图（本地演示用，不进仓库）。
用法：python tools/seed_covers.py
"""
import io
import json
import urllib.request

from PIL import Image, ImageDraw, ImageFont

BASE = 'http://127.0.0.1:8787'
BOLD = 'C:/Windows/Fonts/msyhbd.ttc'


def get(path):
    with urllib.request.urlopen(BASE + path, timeout=20) as r:
        return json.load(r)


def post_json(path, data):
    body = json.dumps(data).encode('utf-8')
    req = urllib.request.Request(BASE + path, data=body, method='POST',
                                 headers={'content-type': 'application/json'})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def post_blob(pid, blob):
    req = urllib.request.Request(BASE + '/api/admin/blob?pid=%s&kind=cover' % pid,
                                 data=blob, method='POST',
                                 headers={'content-type': 'image/webp'})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)


def wrap(draw, text, font, maxw):
    lines, cur = [], ''
    for ch in text:
        if draw.textlength(cur + ch, font=font) > maxw and cur:
            lines.append(cur)
            cur = ch
        else:
            cur += ch
    if cur:
        lines.append(cur)
    return lines[:3]


def make(title, label, w, h, c1, c2, ink):
    img = Image.new('RGB', (w, h), c1)
    d = ImageDraw.Draw(img)
    span = max(1, h - 1)
    for y in range(h):
        t = y / span
        d.line([(0, y), (w, y)],
               fill=(round(c1[0] + (c2[0] - c1[0]) * t),
                     round(c1[1] + (c2[1] - c1[1]) * t),
                     round(c1[2] + (c2[2] - c1[2]) * t)))
    d.text((int(w * 0.08), int(h * 0.07)), label,
           font=ImageFont.truetype(BOLD, int(h * 0.036)), fill=ink)
    f = ImageFont.truetype(BOLD, int(h * 0.085))
    lines = wrap(d, title, f, int(w * 0.84))
    step = int(h * 0.115)
    y = h - int(h * 0.10) - step * len(lines)
    for ln in lines:
        d.text((int(w * 0.08), y), ln, font=f, fill=ink)
        y += step
    d.rectangle([0, h - int(h * 0.035), w, h], fill=ink)
    b = io.BytesIO()
    img.save(b, 'WEBP', quality=82, method=6)
    return b.getvalue()


PALETTES = [((247, 243, 234), (226, 216, 198), (43, 38, 32)),
            ((240, 237, 229), (212, 223, 214), (43, 38, 32)),
            ((247, 243, 234), (228, 206, 200), (43, 38, 32)),
            ((243, 240, 232), (206, 214, 226), (43, 38, 32)),
            ((247, 243, 234), (219, 213, 197), (43, 38, 32)),
            ((245, 241, 233), (214, 206, 196), (43, 38, 32))]
LABEL = {'life': '黄翀与 · 生活记录', 'work': '黄翀与 · 作品', 'media': '黄翀与 · 书影音'}

posts = get('/api/posts?limit=500')['posts']
n = 0
for p in posts:
    if p['section'] not in ('life', 'work', 'media') or p.get('cover_key'):
        continue
    c1, c2, ink = PALETTES[n % len(PALETTES)]
    poster = p['section'] == 'media'
    size = (600, 900) if poster else (1200, 675)
    blob = make(p['title'], LABEL[p['section']], size[0], size[1], c1, c2, ink)
    key = post_blob(p['id'], blob)['key']
    post_json('/api/admin/post', {'id': p['id'], 'cover_key': key})
    print('cover %-5s %s %-22s %6dB  %s' % (p['section'], p['id'], p['title'][:20], len(blob), key))
    n += 1
print('done', n)