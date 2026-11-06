"""Draws the icons of the smaller mods (1024 px PNG each). Usage: python3 make_more_icons.py <output folder>
Needs Pillow and the macOS font path below (BOLD); change it to run the script on another system."""
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import math, sys

S = 2048
OUT = sys.argv[1]
BOLD = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"


def gradient(top, bottom):
    img = Image.new("RGB", (S, S))
    px = img.load()
    for y in range(S):
        t = y / (S - 1)
        c = tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3))
        for x in range(S):
            px[x, y] = c
    return img.convert("RGBA")


def base(top, bottom, glow):
    img = gradient(top, bottom)
    layer = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(layer).ellipse((330, 300, 1720, 1690), fill=glow + (70,))
    img.alpha_composite(layer.filter(ImageFilter.GaussianBlur(160)))
    return img


def shadowed(img, draw_fn, blur=36, offset=26, alpha=110):
    layer = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    draw_fn(ImageDraw.Draw(layer), (0, 0, 0, alpha), offset)
    img.alpha_composite(layer.filter(ImageFilter.GaussianBlur(blur)))


def card(img, box, r, fill):
    shadowed(img, lambda d, c, o: d.rounded_rectangle((box[0], box[1] + o, box[2], box[3] + o), radius=r, fill=c))
    ImageDraw.Draw(img).rounded_rectangle(box, radius=r, fill=fill)


def finish(img, name):
    img.convert("RGB").resize((1024, 1024), Image.LANCZOS).save(f"{OUT}/{name}.png", optimize=True)


def check(d, cx, cy, size, color, width):
    pts = [(cx - size * 0.5, cy), (cx - size * 0.12, cy + size * 0.4), (cx + size * 0.55, cy - size * 0.4)]
    d.line(pts, fill=color, width=width, joint="curve")
    for p in pts:
        d.ellipse((p[0] - width / 2, p[1] - width / 2, p[0] + width / 2, p[1] + width / 2), fill=color)


def text_center(d, cx, cy, txt, size, fill):
    font = ImageFont.truetype(BOLD, size)
    b = d.textbbox((0, 0), txt, font=font)
    d.text((cx - (b[0] + b[2]) / 2, cy - (b[1] + b[3]) / 2), txt, font=font, fill=fill)


WHITE = (250, 248, 255)


# branch-guard-band: git branch graph with a warning triangle
img = base((86, 26, 40), (42, 12, 22), (255, 107, 107))
d = ImageDraw.Draw(img)
d.line([(900, 520), (900, 1520)], fill=WHITE, width=70)
d.line([(900, 1000), (1000, 1000), (1200, 880), (1200, 700)], fill=(255, 140, 140), width=70, joint="curve")
for (x, y, c) in [(900, 520, WHITE), (900, 1520, WHITE), (1200, 700, (255, 140, 140))]:
    d.ellipse((x - 100, y - 100, x + 100, y + 100), fill=(42, 12, 22), outline=c, width=48)
tri = [(1360, 1040), (1740, 1700), (980, 1700)]
shadowed(img, lambda dd, c, o: dd.polygon([(x, y + o) for x, y in tri], fill=c))
d = ImageDraw.Draw(img)
d.polygon(tri, fill=(255, 193, 7))
d.rounded_rectangle((1330, 1230, 1390, 1500), radius=30, fill=(60, 30, 10))
d.ellipse((1325, 1540, 1395, 1610), fill=(60, 30, 10))
finish(img, "branch-guard-band")

# env-band: a toggle switch with a small dial of dots
img = base((12, 62, 88), (6, 32, 50), (79, 195, 247))
card(img, (330, 760, 1718, 1288), 264, WHITE)
d = ImageDraw.Draw(img)
d.rounded_rectangle((330, 760, 1718, 1288), radius=264, fill=(79, 195, 247))
d.ellipse((1170, 800, 1678, 1248), fill=WHITE)
for i, x in enumerate((560, 740, 920)):
    d.ellipse((x - 46, 984, x + 46, 1076), fill=(255, 255, 255, 230) if i == 0 else (255, 255, 255, 120))
d.rounded_rectangle((470, 440, 1578, 560), radius=60, fill=(255, 255, 255, 60))
d.rounded_rectangle((470, 1480, 1170, 1600), radius=60, fill=(255, 255, 255, 60))
finish(img, "env-band")

# limit-band: a gauge with a needle
img = base((72, 60, 12), (38, 30, 6), (255, 213, 79))
d = ImageDraw.Draw(img)
cx, cy, r = 1024, 1280, 640
d.arc((cx - r, cy - r, cx + r, cy + r), 180, 360, fill=(255, 255, 255, 70), width=150)
d.arc((cx - r, cy - r, cx + r, cy + r), 180, 262, fill=(110, 200, 120), width=150)
d.arc((cx - r, cy - r, cx + r, cy + r), 262, 318, fill=(255, 213, 79), width=150)
d.arc((cx - r, cy - r, cx + r, cy + r), 318, 360, fill=(240, 90, 70), width=150)
ang = math.radians(300)
d.line([(cx, cy), (cx + 520 * math.cos(ang), cy + 520 * math.sin(ang))], fill=WHITE, width=62)
d.ellipse((cx - 110, cy - 110, cx + 110, cy + 110), fill=WHITE)
d.rounded_rectangle((520, 1460, 1528, 1580), radius=60, fill=(255, 255, 255, 60))
finish(img, "limit-band")


# prompt-library: stacked cards, the top one with a prompt sign
img = base((34, 48, 104), (16, 22, 58), (130, 160, 255))
for i, (dx, dy, a) in enumerate([(-90, -90, 90), (-45, -45, 170), (0, 0, 255)]):
    box = (470 + dx, 520 + dy, 1578 + dx, 1500 + dy)
    if i < 2:
        ImageDraw.Draw(img).rounded_rectangle(box, radius=140, fill=(230, 235, 255, a))
    else:
        card(img, box, 140, WHITE)
d = ImageDraw.Draw(img)
d.line([(700, 860), (860, 1010), (700, 1160)], fill=(70, 100, 220), width=62, joint="curve")
d.rounded_rectangle((960, 1110, 1300, 1170), radius=30, fill=(70, 100, 220))
d.rounded_rectangle((700, 1280, 1340, 1330), radius=25, fill=(180, 190, 230))
finish(img, "prompt-library")

