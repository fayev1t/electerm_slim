"""Regenerate committed icons: python3 -m pip install cairosvg pillow."""

from io import BytesIO
from pathlib import Path
import struct

import cairosvg
from PIL import Image


branding = Path(__file__).resolve().parents[2] / 'assets' / 'branding'
images = branding / 'images'
build = branding / 'build'
images.mkdir(parents=True, exist_ok=True)
build.mkdir(parents=True, exist_ok=True)


# Every size is rendered straight from the SVG: the logo sits on a 16x16 pixel
# grid, so sizes that are multiples of 16 stay crisp, which resizing one large
# bitmap would blur.
def icon(size):
    return Image.open(BytesIO(cairosvg.svg2png(
        url=str(branding / 'logo.svg'), output_width=size, output_height=size
    ))).convert('RGBA')


icon(1024).save(images / 'electerm_slim.png')
icon(128).save(images / 'electerm_slim-icon.png')
icon(32).save(images / 'electerm_slim-tray.png')
cairosvg.svg2png(
    url=str(branding / 'wordmark.svg'),
    write_to=str(images / 'electerm_slim-wordmark.png')
)

ico_sizes = [256, 128, 64, 48, 32, 24, 16]
ico = [icon(size) for size in ico_sizes]
ico[0].save(
    build / 'icon.ico',
    sizes=[(size, size) for size in ico_sizes],
    append_images=ico[1:]
)

# PNG-backed ICNS entries keep the macOS icon build reproducible on Linux.
entries = []
for code, size in [(b'icp4', 16), (b'icp5', 32), (b'icp6', 64),
                   (b'ic07', 128), (b'ic08', 256), (b'ic09', 512), (b'ic10', 1024)]:
    output = BytesIO()
    icon(size).save(output, format='PNG')
    data = output.getvalue()
    entries.append(code + struct.pack('>I', len(data) + 8) + data)
payload = b''.join(entries)
(build / 'icon.icns').write_bytes(b'icns' + struct.pack('>I', len(payload) + 8) + payload)

for size in [16, 24, 32, 48, 64, 128, 256, 512, 1024]:
    destination = build / 'icons' / f'{size}x{size}.png'
    destination.parent.mkdir(parents=True, exist_ok=True)
    icon(size).save(destination)
