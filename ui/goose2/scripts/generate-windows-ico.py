import struct
import sys
import zlib
from pathlib import Path


def read_png(path: Path):
    data = path.read_bytes()
    if not data.startswith(b"\x89PNG\r\n\x1a\n"):
        raise ValueError(f"{path} is not a PNG")

    pos = 8
    width = height = bit_depth = color_type = None
    idat = bytearray()
    while pos + 8 <= len(data):
        length = struct.unpack(">I", data[pos : pos + 4])[0]
        chunk_type = data[pos + 4 : pos + 8]
        chunk = data[pos + 8 : pos + 8 + length]
        pos += 12 + length
        if chunk_type == b"IHDR":
            width, height, bit_depth, color_type, _, _, _ = struct.unpack(
                ">IIBBBBB", chunk
            )
        elif chunk_type == b"IDAT":
            idat.extend(chunk)
        elif chunk_type == b"IEND":
            break

    if width is None or height is None or bit_depth != 8 or color_type not in (2, 6):
        raise ValueError(f"unsupported PNG format: {path}")

    channels = 4 if color_type == 6 else 3
    raw = zlib.decompress(bytes(idat))
    stride = width * channels
    prev = [0] * stride
    rows = []
    p = 0

    for _ in range(height):
        filter_type = raw[p]
        p += 1
        encoded = list(raw[p : p + stride])
        p += stride
        row = []
        bpp = channels
        for i, value in enumerate(encoded):
            left = row[i - bpp] if i >= bpp else 0
            up = prev[i]
            upper_left = prev[i - bpp] if i >= bpp else 0
            if filter_type == 0:
                decoded = value
            elif filter_type == 1:
                decoded = value + left
            elif filter_type == 2:
                decoded = value + up
            elif filter_type == 3:
                decoded = value + ((left + up) // 2)
            elif filter_type == 4:
                predictor = left + up - upper_left
                pa = abs(predictor - left)
                pb = abs(predictor - up)
                pc = abs(predictor - upper_left)
                predicted = left if pa <= pb and pa <= pc else up if pb <= pc else upper_left
                decoded = value + predicted
            else:
                raise ValueError(f"unsupported PNG filter: {filter_type}")
            row.append(decoded & 0xFF)
        rows.append(row)
        prev = row

    rgba_rows = []
    for row in rows:
        rgba = []
        for i in range(0, len(row), channels):
            r, g, b = row[i], row[i + 1], row[i + 2]
            a = row[i + 3] if channels == 4 else 255
            rgba.extend((r, g, b, a))
        rgba_rows.append(rgba)
    return width, height, rgba_rows


def make_dib(width: int, height: int, rows):
    header = struct.pack(
        "<IIIHHIIIIII",
        40,
        width,
        height * 2,
        1,
        32,
        0,
        width * height * 4,
        0,
        0,
        0,
        0,
    )
    pixels = bytearray()
    for row in reversed(rows):
        for i in range(0, len(row), 4):
            r, g, b, a = row[i], row[i + 1], row[i + 2], row[i + 3]
            pixels.extend((b, g, r, a))
    mask_stride = ((width + 31) // 32) * 4
    mask = bytearray(mask_stride * height)
    return header + bytes(pixels) + bytes(mask)


def main():
    if len(sys.argv) < 3 or len(sys.argv[1:-1]) > 255:
        raise SystemExit("usage: generate-windows-ico.py input.png... output.ico")

    inputs = [Path(arg) for arg in sys.argv[1:-1]]
    output = Path(sys.argv[-1])
    images = []
    for path in inputs:
        width, height, rows = read_png(path)
        if width != height:
            raise ValueError(f"icon frame must be square: {path}")
        images.append((width, height, make_dib(width, height, rows)))

    offset = 6 + 16 * len(images)
    header = bytearray(struct.pack("<HHH", 0, 1, len(images)))
    payload = bytearray()
    for width, height, dib in images:
        header.extend(
            struct.pack(
                "<BBBBHHII",
                0 if width == 256 else width,
                0 if height == 256 else height,
                0,
                0,
                1,
                32,
                len(dib),
                offset,
            )
        )
        payload.extend(dib)
        offset += len(dib)

    output.write_bytes(bytes(header + payload))


if __name__ == "__main__":
    main()
