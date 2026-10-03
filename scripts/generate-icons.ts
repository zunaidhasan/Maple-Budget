// Zero-dependency PNG icon generator for the PWA.
// Produces simple branded icons: emerald rounded square + white maple-leaf
// glyph fall-back (letter "M"). Run: npm run icons:generate

import { deflateSync } from "zlib";
import { mkdirSync, writeFileSync } from "fs";

interface Rgb {
  r: number;
  g: number;
  b: number;
}

function crc32(buf: Buffer): number {
  let c: number;
  const table: number[] = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const byte of buf) {
    crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}

/** Encode raw RGBA pixels as PNG. */
function encodePng(width: number, height: number, rgba: Buffer): Buffer {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  // filter each row with 0 prefix
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const idat = deflateSync(raw);
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

/** Draw a rounded-rect icon with a stylized white "M" for Maple Budget. */
function drawIcon(size: number, maskable = false): Buffer {
  const bg: Rgb = { r: 5, g: 150, b: 105 }; // emerald
  const fg: Rgb = { r: 255, g: 255, b: 255 };
  const rgba = Buffer.alloc(size * size * 4, 0);

  const radius = Math.round(size * (maskable ? 0 : 0.18));
  const pad = maskable ? Math.round(size * 0.18) : 0;
  const inner = size - pad * 2;

  const inRounded = (x: number, y: number): boolean => {
    const cx = Math.min(Math.max(x, radius), size - radius);
    const cy = Math.min(Math.max(y, radius), size - radius);
    const dx = x - cx;
    const dy = y - cy;
    return dx * dx + dy * dy <= radius * radius || (x >= radius && x <= size - radius) || (y >= radius && y <= size - radius);
  };

  // "M" glyph made of 3 vertical-ish strokes within 40%..60% region
  const stroke = Math.max(2, Math.round(size * 0.07));

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const localX = x - pad;
      const localY = y - pad;
      if (localX < 0 || localY < 0 || localX >= inner || localY >= inner) continue;
      if (!inRounded(x, y)) continue;

      let color = bg;
      // Glyph box: 30%..70% of inner size
      const gx0 = inner * 0.28;
      const gx1 = inner * 0.72;
      const gy0 = inner * 0.34;
      const gy1 = inner * 0.70;
      if (localX >= gx0 && localX <= gx1 && localY >= gy0 && localY <= gy1) {
        const w = gx1 - gx0;
        const h = gy1 - gy0;
        const relX = (localX - gx0) / w;
        const relY = (localY - gy0) / h;
        // vertical strokes at 0..0.18, 0.41..0.59, 0.82..1.0
        const inLeft = relX <= 0.18;
        const inMid = relX >= 0.41 && relX <= 0.59 && relY >= 0.0 && relY <= 0.55;
        const inRight = relX >= 0.82;
        // diagonals from mid bottom to tops
        const diagL = relY > 0.1 && Math.abs(relX - (0.09 + relY * 0.9)) < 0.08;
        const diagR = relY > 0.1 && Math.abs(relX - (0.91 - relY * 0.9)) < 0.08;
        if (inLeft || inRight || inMid || (diagL && relX <= 0.5) || (diagR && relX >= 0.5)) {
          color = fg;
        }
      }
      const idx = (y * size + x) * 4;
      rgba[idx] = color.r;
      rgba[idx + 1] = color.g;
      rgba[idx + 2] = color.b;
      rgba[idx + 3] = 255;
    }
  }
  return encodePng(size, size, rgba);
}

mkdirSync("public/icons", { recursive: true });
writeFileSync("public/icons/icon-192.png", drawIcon(192));
writeFileSync("public/icons/icon-512.png", drawIcon(512));
writeFileSync("public/icons/icon-maskable-512.png", drawIcon(512, true));
writeFileSync("public/icons/apple-touch-icon.png", drawIcon(180));
console.log("Icons written to public/icons/");
