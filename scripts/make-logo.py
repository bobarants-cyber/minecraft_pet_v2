# Draws the Bbokari + FaceAway logo: Bbokari inside FaceAway's Face ID brackets, with the little bee.
#   assets/icon/bbokari-faceaway.png  (1024², the app icon)
#   assets/trayTemplate.png / @2x     (the menu bar icon: the bee inside the Face ID brackets)
# Run: python3 scripts/make-logo.py   (needs Pillow)
from PIL import Image, ImageDraw, ImageFilter
import os
HERE = os.path.dirname(os.path.abspath(__file__)); A = os.path.join(HERE, '..', 'assets')

def brackets(d, box, w, color, L=0.27, r=0.16):
    x0, y0, x1, y1 = box; s = x1 - x0; L *= s; r *= s
    for cx, cy, dx, dy in [(x0, y0, 1, 1), (x1, y0, -1, 1), (x0, y1, 1, -1), (x1, y1, -1, -1)]:
        # rounded corner: arc + two arms
        bx = (cx, cy, cx + dx * 2 * r, cy + dy * 2 * r)
        ab = (min(bx[0], bx[2]), min(bx[1], bx[3]), max(bx[0], bx[2]), max(bx[1], bx[3]))
        start = {(1, 1): 180, (-1, 1): 270, (1, -1): 90, (-1, -1): 0}[(dx, dy)]
        d.arc(ab, start, start + 90, fill=color, width=w)
        d.line([(cx + dx * r, cy), (cx + dx * L, cy)], fill=color, width=w)
        d.line([(cx, cy + dy * r), (cx, cy + dy * L)], fill=color, width=w)
        for px, py in [(cx + dx * L, cy), (cx, cy + dy * L)]:
            d.ellipse((px - w / 2, py - w / 2, px + w / 2, py + w / 2), fill=color)

def bee(d, x, y, u, body=(255, 205, 40), stripe=(40, 30, 20), wing=(230, 245, 255), eye=(30, 30, 30), mono=None):
    """A blocky little bee (u = one pixel block), facing right."""
    c = (lambda col: mono or col)
    d.rectangle((x + 2 * u, y - 1 * u, x + 4 * u, y + 1 * u), fill=c(wing))         # wings
    d.rectangle((x + 5 * u, y - 2 * u, x + 7 * u, y + 1 * u), fill=c(wing))
    d.rectangle((x, y + 1 * u, x + 9 * u, y + 6 * u), fill=c(body))                 # body
    if not mono:
        d.rectangle((x + 3 * u, y + 1 * u, x + 4 * u, y + 6 * u), fill=stripe)
        d.rectangle((x + 6 * u, y + 1 * u, x + 7 * u, y + 6 * u), fill=stripe)
        d.rectangle((x + 8 * u, y + 2 * u, x + 9 * u, y + 3 * u), fill=eye)
    d.rectangle((x - 1 * u, y + 3 * u, x, y + 4 * u), fill=c(stripe))               # stinger

# --- app icon ---
S = 1024
base = Image.open(os.path.join(A, 'icon', 'bbokari.png')).convert('RGBA').resize((S, S), Image.LANCZOS)
glow = Image.new('RGBA', (S, S), (0, 0, 0, 0)); g = ImageDraw.Draw(glow)
box = (262, 150, 762, 650)   # around Bbokari's head
brackets(g, box, 34, (60, 200, 255, 255))
blur = glow.filter(ImageFilter.GaussianBlur(14))
out = Image.alpha_composite(base, blur); out = Image.alpha_composite(out, glow)
top = Image.new('RGBA', (S, S), (0, 0, 0, 0)); t = ImageDraw.Draw(top)
brackets(t, box, 18, (255, 255, 255, 255))
# the bee, flying in from the left towards Bbokari, with a little dotted trail
bee(t, 118, 330, 13)
for i, (px, py) in enumerate([(150, 470), (190, 492), (232, 500)]):
    t.ellipse((px - 6, py - 6, px + 6, py + 6), fill=(255, 255, 255, 110 + i * 45))
out = Image.alpha_composite(out, top)
# keep the rounded-square shape of the original
out.putalpha(Image.composite(out.getchannel('A'), Image.new('L', (S, S), 0), base.getchannel('A').point(lambda a: 255 if a > 0 else 0)))
out.save(os.path.join(A, 'icon', 'bbokari-faceaway.png'))

# --- menu bar icon (template: black on transparent): a round little bee inside the Face ID brackets ---
for size, name in [(22, 'trayTemplate.png'), (44, 'trayTemplate@2x.png')]:
    k = 16; big = size * k; u = big / 22
    im = Image.new('RGBA', (big, big), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    brackets(d, (0.8 * u, 0.8 * u, big - 0.8 * u, big - 0.8 * u), int(1.7 * u), (0, 0, 0, 255), L=0.28, r=0.2)
    black, clear = (0, 0, 0, 255), (0, 0, 0, 0)
    d.ellipse((5.2 * u, 8.6 * u, 16.4 * u, 16.2 * u), fill=black)                  # body
    for x in (8.6, 11.6):                                                         # stripes (cut out)
        d.rectangle((x * u, 8 * u, (x + 1.1) * u, 17 * u), fill=clear)
    d.ellipse((13.3 * u, 10.6 * u, 14.6 * u, 11.9 * u), fill=clear)                # eye
    d.polygon([(5.6 * u, 11.6 * u), (3.6 * u, 12.4 * u), (5.6 * u, 13.2 * u)], fill=black)   # stinger
    d.ellipse((7.4 * u, 4.6 * u, 11.0 * u, 8.2 * u), outline=black, width=int(1.1 * u))      # wings
    d.ellipse((10.4 * u, 4.0 * u, 14.2 * u, 7.8 * u), outline=black, width=int(1.1 * u))
    im.resize((size, size), Image.LANCZOS).save(os.path.join(A, name))
print('logo made')
