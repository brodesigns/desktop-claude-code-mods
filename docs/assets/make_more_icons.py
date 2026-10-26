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

# daily-band: calendar page with small bars
img = base((62, 40, 104), (30, 20, 62), (179, 157, 255))
card(img, (400, 420, 1648, 1648), 150, WHITE)
d = ImageDraw.Draw(img)
d.rounded_rectangle((400, 420, 1648, 760), radius=150, fill=(150, 120, 255))
d.rectangle((400, 640, 1648, 760), fill=(150, 120, 255))
for x in (680, 1368):
    d.rounded_rectangle((x - 50, 330, x + 50, 560), radius=50, fill=WHITE, outline=(60, 40, 110), width=20)
for i, h in enumerate((230, 380, 300, 470)):
    x = 560 + i * 250
    d.rounded_rectangle((x, 1500 - h, x + 170, 1500), radius=34, fill=(150, 120, 255) if i == 3 else (200, 190, 240))
finish(img, "daily-band")

# deadline-band: a clock with a shrinking arc
img = base((92, 34, 62), (48, 16, 36), (255, 143, 177))
card(img, (400, 420, 1648, 1668), 624, WHITE)
d = ImageDraw.Draw(img)
cx, cy = 1024, 1044
d.pieslice((cx - 500, cy - 500, cx + 500, cy + 500), -90, 150, fill=(255, 143, 177))
d.ellipse((cx - 370, cy - 370, cx + 370, cy + 370), fill=WHITE)
d.line([(cx, cy), (cx, cy - 260)], fill=(70, 30, 50), width=48)
d.line([(cx, cy), (cx + 190, cy + 110)], fill=(70, 30, 50), width=48)
d.ellipse((cx - 50, cy - 50, cx + 50, cy + 50), fill=(70, 30, 50))
d.rounded_rectangle((cx - 90, 330, cx + 90, 440), radius=40, fill=WHITE)
finish(img, "deadline-band")

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

# snippet-pane: curly braces with a cursor
img = base((82, 30, 98), (42, 14, 52), (240, 128, 255))
d = ImageDraw.Draw(img)
text_center(d, 1024, 1010, "{ }", 900, (250, 220, 255))
d.rounded_rectangle((996, 800, 1052, 1240), radius=28, fill=(240, 128, 255))
d.rounded_rectangle((520, 1500, 1528, 1570), radius=35, fill=(255, 255, 255, 70))
finish(img, "snippet-pane")

# session-summary: a short note with three bullet lines and a spark
img = base((16, 52, 84), (8, 26, 48), (110, 200, 255))
card(img, (430, 440, 1618, 1608), 130, WHITE)
d = ImageDraw.Draw(img)
for k, w in enumerate([560, 640, 420]):
    y = 640 + k * 270
    d.ellipse((560, y, 640, y + 80), fill=(40, 120, 190))
    d.rounded_rectangle((720, y + 12, 720 + w, y + 68), radius=28, fill=(150, 170, 200))
d.polygon([(1480, 330), (1530, 440), (1640, 490), (1530, 540), (1480, 650), (1430, 540), (1320, 490), (1430, 440)], fill=(110, 200, 255))
finish(img, "session-summary")

# kanban-pane: three columns with cards
img = base((30, 60, 128), (14, 28, 68), (130, 177, 255))
card(img, (260, 420, 1788, 1628), 130, (255, 255, 255, 40))
d = ImageDraw.Draw(img)
for col, cards in enumerate([3, 2, 1]):
    x = 340 + col * 500
    d.rounded_rectangle((x, 500, x + 420, 560), radius=30, fill=(130, 177, 255))
    for k in range(cards):
        y = 620 + k * 300
        d.rounded_rectangle((x, y, x + 420, y + 240), radius=50, fill=WHITE)
        d.rounded_rectangle((x + 50, y + 70, x + 300, y + 110), radius=20, fill=(120, 140, 200))
        d.rounded_rectangle((x + 50, y + 140, x + 210, y + 175), radius=18, fill=(190, 200, 235))
finish(img, "kanban-pane")

# log-viewer: a terminal with coloured log lines
img = base((38, 42, 52), (20, 22, 28), (170, 180, 200))
card(img, (300, 420, 1748, 1628), 130, (14, 16, 22))
d = ImageDraw.Draw(img)
for x, c in ((400, (255, 95, 86)), (500, (255, 189, 46)), (600, (39, 201, 63))):
    d.ellipse((x - 28, 490, x + 28, 546), fill=c)
lines = [((255, 107, 107), 700), ((200, 205, 215), 880), ((255, 193, 7), 560), ((200, 205, 215), 820), ((255, 107, 107), 640), ((200, 205, 215), 480)]
for i, (c, w) in enumerate(lines):
    y = 680 + i * 140
    d.ellipse((400, y - 24, 448, y + 24), fill=c)
    d.rounded_rectangle((490, y - 22, 490 + w, y + 22), radius=22, fill=c if c != (200, 205, 215) else (90, 96, 110))
finish(img, "log-viewer")

# dependency-pane: a package cube with an update arrow
img = base((86, 48, 26), (42, 24, 12), (255, 183, 77))
d = ImageDraw.Draw(img)
cx, cy, r = 1000, 1050, 560
top = [(cx, cy - r), (cx + r * 0.87, cy - r * 0.5), (cx, cy), (cx - r * 0.87, cy - r * 0.5)]
left = [(cx - r * 0.87, cy - r * 0.5), (cx, cy), (cx, cy + r), (cx - r * 0.87, cy + r * 0.5)]
right = [(cx + r * 0.87, cy - r * 0.5), (cx, cy), (cx, cy + r), (cx + r * 0.87, cy + r * 0.5)]
shadowed(img, lambda dd, c, o: dd.polygon([(x, y + o) for x, y in top + left[1:3] + right[1:3][::-1]], fill=c))
d = ImageDraw.Draw(img)
d.polygon(top, fill=(255, 224, 160))
d.polygon(left, fill=(255, 183, 77))
d.polygon(right, fill=(224, 140, 40))
d.line([(cx - r * 0.45, cy - r * 0.62), (cx + r * 0.1, cy - r * 0.3)], fill=(190, 120, 40), width=40)
badge = (1230, 1130, 1790, 1690)
shadowed(img, lambda dd, c, o: dd.ellipse((badge[0], badge[1] + o, badge[2], badge[3] + o), fill=c))
d = ImageDraw.Draw(img)
d.ellipse(badge, fill=(76, 175, 122), outline=WHITE, width=24)
d.line([(1510, 1550), (1510, 1270)], fill=WHITE, width=64)
d.line([(1400, 1370), (1510, 1260), (1620, 1370)], fill=WHITE, width=64, joint="curve")
finish(img, "dependency-pane")
