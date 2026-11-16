# Dibuja el icono de Gestor-Alarma: campana de cristal sobre cuadrado redondeado azul. Uso: python icono.py <carpeta assets>
import sys, os
from PIL import Image, ImageDraw, ImageFilter, ImageChops

S = 1024  # se dibuja grande y se reduce (antialias)
def grad(w, h, a, b):
    g = Image.new('RGBA', (w, h))
    d = ImageDraw.Draw(g)
    for y in range(h):
        t = y / (h - 1)
        d.line([(0, y), (w, y)], fill=tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(4)))
    return g

def capa(color, m):  # color sólido con el alfa de la máscara (sin halos grises)
    c = Image.new('RGBA', (S, S), color[:3] + (0,))
    c.putalpha(m.point(lambda v: v * color[3] // 255)); return c

def mascara(fn):
    m = Image.new('L', (S, S), 0); fn(ImageDraw.Draw(m)); return m

def campana(d, k=1.0, dx=0, dy=0):
    cx, cy = S / 2 + dx, S / 2 + dy
    w = 300 * k
    # cuerpo: cúpula + falda acampanada
    d.ellipse([cx - w * .62, cy - 250 * k, cx + w * .62, cy + 40 * k], fill=255)
    d.polygon([(cx - w * .62, cy - 100 * k), (cx + w * .62, cy - 100 * k), (cx + w * .98, cy + 170 * k), (cx - w * .98, cy + 170 * k)], fill=255)
    d.rounded_rectangle([cx - w * 1.08, cy + 140 * k, cx + w * 1.08, cy + 205 * k], radius=32 * k, fill=255)
    d.ellipse([cx - 34 * k, cy - 300 * k, cx + 34 * k, cy - 232 * k], fill=255)  # asa

img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
# fondo: cuadrado redondeado con degradado azul
fondo = grad(S, S, (110, 182, 255, 255), (38, 84, 214, 255))
m_fondo = mascara(lambda d: d.rounded_rectangle([40, 40, S - 40, S - 40], radius=230, fill=255))
img.paste(fondo, (0, 0), m_fondo)
# brillo difuso arriba a la izquierda
luz = mascara(lambda d: d.ellipse([60, 20, 700, 520], fill=255)).filter(ImageFilter.GaussianBlur(90))
img = Image.alpha_composite(img, capa((255, 255, 255, 90), ImageChops.multiply(luz, m_fondo)))
# borde de luz de 6 px
borde = mascara(lambda d: d.rounded_rectangle([40, 40, S - 40, S - 40], radius=230, outline=255, width=8))
img = Image.alpha_composite(img, capa((255, 255, 255, 110), borde))

# sombra de la campana
sombra = mascara(lambda d: campana(d, dy=36)).filter(ImageFilter.GaussianBlur(28))
img = Image.alpha_composite(img, capa((10, 30, 90, 120), sombra))
# campana de cristal: blanco translúcido con degradado
m_camp = mascara(lambda d: campana(d))
cristal = grad(S, S, (255, 255, 255, 235), (225, 238, 255, 175))
cristal.putalpha(ImageChops.multiply(cristal.getchannel('A'), m_camp)); img = Image.alpha_composite(img, cristal)
# reflejo especular: franja curva en la parte izquierda de la cúpula
refl = mascara(lambda d: d.ellipse([S / 2 - 150, S / 2 - 225, S / 2 - 60, S / 2 + 60], fill=255)).filter(ImageFilter.GaussianBlur(10))
img = Image.alpha_composite(img, capa((255, 255, 255, 200), ImageChops.multiply(refl, m_camp)))
# borde interior de la campana (canto de cristal)
canto = ImageChops.subtract(m_camp, m_camp.filter(ImageFilter.MinFilter(13)))
img = Image.alpha_composite(img, capa((255, 255, 255, 255), canto))
# badajo
d = ImageDraw.Draw(img); d.ellipse([S / 2 - 62, S / 2 + 200, S / 2 + 62, S / 2 + 300], fill=(255, 196, 64, 255))
d.ellipse([S / 2 - 34, S / 2 + 214, S / 2 + 4, S / 2 + 240], fill=(255, 240, 200, 220))

dest = sys.argv[1]
img.save(os.path.join(dest, 'icon.png'))
img.save(os.path.join(dest, 'icon.ico'), sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
print('ok')
