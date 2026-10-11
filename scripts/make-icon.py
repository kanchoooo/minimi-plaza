# 앱 아이콘 생성: 밤하늘 + 도트 불꽃 + 미니미 (오리지널 도트)
# 사용법: python3 scripts/make-icon.py  →  build/icon.png
# build/icon-minimi.png (32x40 미니미 스프라이트) 를 사용한다.
import math, random
from PIL import Image, ImageDraw, ImageFilter

S, M = 1024, 100
B = S - 2 * M
R = int(B * 0.2237)
G = 56  # 도트 격자

# 배경
bg = Image.new('RGBA', (B, B))
dr = ImageDraw.Draw(bg)
top, mid, bot = (28, 30, 86), (74, 50, 138), (255, 150, 120)
for y in range(B):
    t = y / (B - 1)
    a, b, k = (top, mid, t / 0.72) if t < 0.72 else (mid, bot, (t - 0.72) / 0.28)
    dr.line([(0, y), (B, y)], fill=tuple(int(a[i] + (b[i] - a[i]) * k) for i in range(3)) + (255,))

px = Image.new('RGBA', (G, G), (0, 0, 0, 0))
def put(x, y, c):
    if 0 <= x < G and 0 <= y < G:
        px.putpixel((int(x), int(y)), c)

random.seed(3)
for _ in range(40):
    put(random.randrange(G), random.randrange(0, 30), (255, 255, 255, random.choice([70, 120, 190])))

def burst(cx, cy, rays, rmax, cols, skip=2):
    for k in range(rays):
        a = k / rays * math.tau
        for r in range(skip, rmax + 1):
            if (r + k) % 2 and r < rmax - 1:
                continue
            col = cols[min(len(cols) - 1, int((r - skip) / max(1, rmax - skip) * len(cols)))]
            put(cx + round(math.cos(a) * r), cy + round(math.sin(a) * r), col)
    put(cx, cy, (255, 255, 255, 255))

gold = [(255, 250, 225, 255), (255, 228, 140, 255), (255, 200, 90, 255), (240, 160, 60, 230)]
pink = [(255, 230, 242, 255), (255, 160, 205, 255), (240, 90, 160, 220)]
sky = [(230, 248, 255, 255), (140, 210, 255, 255), (70, 150, 240, 220)]
burst(28, 14, 20, 12, gold, 3)
burst(9, 9, 12, 6, pink, 2)
burst(47, 8, 12, 6, sky, 2)
burst(48, 27, 10, 4, pink, 1)
burst(7, 28, 10, 4, gold, 1)

# 미니미 (머리 + 몸 일부) 아래쪽 가운데
mini = Image.open('build/icon-minimi.png').convert('RGBA')
bx0, by0, bx1, by1 = mini.getbbox()
crop = mini.crop((0, by0, 32, min(40, by0 + 34)))
px.alpha_composite(crop, (12, G - crop.height))

big = px.resize((B, B), Image.NEAREST)
glow = big.filter(ImageFilter.GaussianBlur(10))
body = Image.alpha_composite(bg, glow)
body = Image.alpha_composite(body, big)

mask = Image.new('L', (B, B), 0)
ImageDraw.Draw(mask).rounded_rectangle([0, 0, B - 1, B - 1], radius=R, fill=255)
img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
img.paste(body, (M, M), mask)
shadow = Image.new('RGBA', (S, S), (0, 0, 0, 0))
ImageDraw.Draw(shadow).rounded_rectangle([M, M + 10, M + B, M + B + 10], radius=R, fill=(0, 0, 0, 80))
shadow = shadow.filter(ImageFilter.GaussianBlur(16))
Image.alpha_composite(shadow, img).save('build/icon.png')
print('saved build/icon.png')
