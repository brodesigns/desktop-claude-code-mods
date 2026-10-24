from PIL import Image, ImageDraw, ImageFont, ImageFilter
import math, sys
S = 2048  # draw big, scale down for smooth edges
OUT = sys.argv[1]

def gradient(top, bottom):
    img = Image.new("RGB", (S, S))
    px = img.load()
    for y in range(S):
        t = y / (S - 1)
        c = tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3))
        for x in range(S):
            px[x, y] = c
    return img

def rr(d, box, r, fill, outline=None, width=0):
    d.rounded_rectangle(box, radius=r, fill=fill, outline=outline, width=width)

def shadow(img, box, r, blur=40, offset=30, alpha=90):
    layer = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(layer).rounded_rectangle((box[0], box[1] + offset, box[2], box[3] + offset), radius=r, fill=(0, 0, 0, alpha))
    layer = layer.filter(ImageFilter.GaussianBlur(blur))
    img.alpha_composite(layer)

def finish(img, name):
    img.convert("RGB").resize((1024, 1024), Image.LANCZOS).save(f"{OUT}/{name}.png", optimize=True)

# ---------- bro-cockpit: the worker with hard hat ----------
bg = gradient((38, 41, 72), (20, 22, 44)).convert("RGBA")
# soft glow
glow = Image.new("RGBA", (S, S), (0, 0, 0, 0))
ImageDraw.Draw(glow).ellipse((330, 300, 1720, 1690), fill=(217, 119, 87, 70))
bg.alpha_composite(glow.filter(ImageFilter.GaussianBlur(160)))
d = ImageDraw.Draw(bg)
# little dashboard tiles behind
tiles = Image.new("RGBA", (S, S), (0, 0, 0, 0))
td = ImageDraw.Draw(tiles)
for (x, y, w, h, a) in [(170, 1440, 520, 300, 120), (760, 1500, 520, 240, 90), (1350, 1440, 520, 300, 120)]:
    td.rounded_rectangle((x, y, x + w, y + h), radius=60, fill=(255, 255, 255, 26), outline=(255, 255, 255, 70), width=8)
bg.alpha_composite(tiles)
d = ImageDraw.Draw(bg)
# feet
for cx in (790, 1258):
    d.ellipse((cx - 120, 1480, cx + 120, 1640), fill=(184, 92, 60))
# body
shadow(bg, (530, 760, 1518, 1590), 360)
d = ImageDraw.Draw(bg)
rr(d, (530, 760, 1518, 1590), 360, (217, 119, 87))
d.ellipse((720, 1230, 1328, 1500), fill=(242, 165, 131))
# helmet
d.pieslice((540, 470, 1508, 1130), 180, 360, fill=(242, 193, 78))
d.arc((700, 520, 1348, 1000), 200, 250, fill=(255, 224, 138), width=44)
rr(d, (470, 800, 1578, 920), 60, (224, 168, 46))
d.ellipse((960, 410, 1088, 538), fill=(224, 168, 46))
# eyes
for cx in (790, 1258):
    d.ellipse((cx - 98, 1020, cx + 98, 1250), fill=(42, 29, 23))
    d.ellipse((cx - 38, 1050, cx + 18, 1106), fill=(255, 255, 255))
# cheeks and smile
for cx in (640, 1408):
    d.ellipse((cx - 70, 1230, cx + 70, 1330), fill=(255, 143, 163))
d.arc((900, 1220, 1148, 1400), 20, 160, fill=(42, 29, 23), width=34)
finish(bg, "bro-cockpit")

# ---------- secret-guard: shield with keyhole ----------
bg = gradient((16, 66, 70), (9, 36, 44)).convert("RGBA")
glow = Image.new("RGBA", (S, S), (0, 0, 0, 0))
ImageDraw.Draw(glow).ellipse((380, 340, 1670, 1700), fill=(76, 175, 122, 80))
bg.alpha_composite(glow.filter(ImageFilter.GaussianBlur(150)))
d = ImageDraw.Draw(bg)

def shield(cx, top, w, h):
    half = w / 2
    pts = []
    n = 60
    # right side: straight down the shoulder, then a curve to the tip
    shoulder = top + h * 0.42
    for i in range(0, 21):
        pts.append((cx + half, top + 36 + (shoulder - top - 36) * i / 20))
    for i in range(1, n + 1):
        t = i / n
        # quadratic bezier from (cx+half, shoulder) via (cx+half, top+h*0.82) to (cx, top+h)
        x = (1 - t) ** 2 * (cx + half) + 2 * (1 - t) * t * (cx + half * 0.95) + t ** 2 * cx
        y = (1 - t) ** 2 * shoulder + 2 * (1 - t) * t * (top + h * 0.84) + t ** 2 * (top + h)
        pts.append((x, y))
    left = [(2 * cx - x, y) for x, y in pts]
    # top edge with a gentle dip in the middle
    topedge = [(cx - half + w * i / 40, top + 36 * math.sin(math.pi * i / 40) * -1 + 36) for i in range(41)]
    return topedge + list(pts) + list(reversed(left))[1:]

pts = shield(1024, 330, 1060, 1380)
layer = Image.new("RGBA", (S, S), (0, 0, 0, 0))
ImageDraw.Draw(layer).polygon([(x, y + 40) for x, y in pts], fill=(0, 0, 0, 110))
bg.alpha_composite(layer.filter(ImageFilter.GaussianBlur(40)))
d = ImageDraw.Draw(bg)
d.polygon(pts, fill=(76, 175, 122))
inner = shield(1024, 400, 900, 1230)
d.polygon(inner, fill=(55, 148, 101))
# keyhole
d.ellipse((884, 800, 1164, 1080), fill=(236, 252, 243))
d.polygon([(960, 1040), (1088, 1040), (1140, 1420), (908, 1420)], fill=(236, 252, 243))
d.ellipse((960, 880, 1088, 1008), fill=(55, 148, 101))
d.polygon([(990, 990), (1058, 990), (1078, 1300), (970, 1300)], fill=(55, 148, 101))
finish(bg, "secret-guard")

