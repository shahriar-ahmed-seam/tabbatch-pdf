#!/usr/bin/env python3
"""Generate TabBatch PDF icons (no third-party deps).

Renders a document-with-folded-corner glyph on an indigo->violet rounded
square, supersampled 4x for clean anti-aliasing, and writes PNGs."""
import os
import struct
import zlib

SS = 4  # supersample factor


def lerp(a, b, t):
    return a + (b - a) * t


def mix(c1, c2, t):
    return tuple(int(round(lerp(c1[i], c2[i], t))) for i in range(3))


def rounded_alpha(x, y, w, h, r):
    """Coverage (0..1) of a rounded rect at point (x,y)."""
    cx = min(max(x, r), w - r)
    cy = min(max(y, r), h - r)
    if x < r and y < r:
        d = ((x - r) ** 2 + (y - r) ** 2) ** 0.5
    elif x > w - r and y < r:
        d = ((x - (w - r)) ** 2 + (y - r) ** 2) ** 0.5
    elif x < r and y > h - r:
        d = ((x - r) ** 2 + (y - (h - r)) ** 2) ** 0.5
    elif x > w - r and y > h - r:
        d = ((x - (w - r)) ** 2 + (y - (h - r)) ** 2) ** 0.5
    else:
        return 1.0
    return 1.0 if d <= r else 0.0


def render(size):
    S = size * SS
    px = [[(0, 0, 0, 0) for _ in range(S)] for _ in range(S)]
    bg_r = 0.22 * S
    top = (99, 102, 241)      # indigo-500
    bot = (139, 92, 246)      # violet-500

    # document geometry
    doc_w = 0.50 * S
    doc_h = 0.62 * S
    doc_x = (S - doc_w) / 2
    doc_y = (S - doc_h) / 2
    fold = 0.18 * S           # folded corner size
    doc_r = 0.05 * S

    for y in range(S):
        for x in range(S):
            xc, yc = x + 0.5, y + 0.5
            a_bg = rounded_alpha(xc, yc, S, S, bg_r)
            if a_bg <= 0:
                continue
            col = mix(top, bot, yc / S)

            lx, ly = xc - doc_x, yc - doc_y
            in_doc = 0 <= lx <= doc_w and 0 <= ly <= doc_h
            if in_doc and rounded_alpha(lx, ly, doc_w, doc_h, doc_r) > 0:
                # folded top-right corner
                if (doc_w - lx) + ly < fold:
                    col = (210, 214, 245)  # fold shadow
                elif (doc_w - lx) + ly < fold + 0.012 * S:
                    col = (150, 160, 220)
                else:
                    col = (255, 255, 255)
                    # red PDF band
                    band_y0, band_y1 = doc_h * 0.62, doc_h * 0.78
                    band_x0, band_x1 = doc_w * 0.12, doc_w * 0.88
                    if band_y0 <= ly <= band_y1 and band_x0 <= lx <= band_x1:
                        col = (229, 57, 53)  # red
                    else:
                        # subtle text lines
                        for ln in (0.16, 0.28, 0.40):
                            if abs(ly - doc_h * ln) < 0.022 * S and doc_w * 0.16 <= lx <= doc_w * 0.84:
                                col = (203, 213, 225)
                        for ln in (0.86, 0.92):
                            if abs(ly - doc_h * ln) < 0.018 * S and doc_w * 0.16 <= lx <= doc_w * 0.70:
                                col = (203, 213, 225)
            px[y][x] = (col[0], col[1], col[2], int(round(255 * a_bg)))

    # downsample SS x SS -> size
    out = bytearray()
    for oy in range(size):
        out.append(0)  # filter type 0
        for ox in range(size):
            r = g = b = a = 0
            for dy in range(SS):
                for dx in range(SS):
                    p = px[oy * SS + dy][ox * SS + dx]
                    r += p[0] * p[3]
                    g += p[1] * p[3]
                    b += p[2] * p[3]
                    a += p[3]
            n = SS * SS
            if a > 0:
                out += bytes((r // a, g // a, b // a, a // n))
            else:
                out += bytes((0, 0, 0, 0))
    return bytes(out)


def write_png(path, size, raw):
    def chunk(tag, data):
        c = tag + data
        return struct.pack(">I", len(data)) + c + struct.pack(">I", zlib.crc32(c) & 0xFFFFFFFF)

    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    idat = zlib.compress(raw, 9)
    with open(path, "wb") as f:
        f.write(sig + chunk(b"IHDR", ihdr) + chunk(b"IDAT", idat) + chunk(b"IEND", b""))


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    icons_dir = os.path.join(here, "..", "icons")
    os.makedirs(icons_dir, exist_ok=True)
    for s in (16, 32, 48, 128):
        write_png(os.path.join(icons_dir, f"icon{s}.png"), s, render(s))
        print(f"icons/icon{s}.png")
    for s in (256, 512):
        write_png(os.path.join(here, f"icon{s}.png"), s, render(s))
        print(f"store_assets/icon{s}.png")


if __name__ == "__main__":
    main()
