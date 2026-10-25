import { inflateSync } from 'node:zlib';

export interface RawImage {
  width: number;
  height: number;
  /** Tightly packed BGRA, matching Windows capture surfaces. */
  bgra: Uint8Array;
}

/** Decodes the non-interlaced 8-bit RGB or RGBA PNGs produced by sidecar/tools/make_fixtures.py. */
export function decodePngToBgra(png: Buffer): RawImage {
  let offset = 8;
  let width = 0;
  let height = 0;
  let channels = 0;
  const data: Buffer[] = [];
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString('latin1', offset + 4, offset + 8);
    const chunk = png.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = chunk.readUInt32BE(0);
      height = chunk.readUInt32BE(4);
      const [bitDepth, colorType, , , interlace] = chunk.subarray(8, 13);
      channels = colorType === 2 ? 3 : colorType === 6 ? 4 : 0;
      if (bitDepth !== 8 || channels === 0 || interlace !== 0) throw new Error('Unsupported PNG layout.');
    } else if (type === 'IDAT') {
      data.push(chunk);
    }
    offset += 12 + length;
  }

  const filtered = inflateSync(Buffer.concat(data));
  const stride = width * channels;
  const pixels = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = filtered[y * (stride + 1)];
    const row = filtered.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const left = x >= channels ? pixels[y * stride + x - channels] : 0;
      const up = y > 0 ? pixels[(y - 1) * stride + x] : 0;
      const upLeft = x >= channels && y > 0 ? pixels[(y - 1) * stride + x - channels] : 0;
      let predictor = 0;
      if (filter === 1) predictor = left;
      else if (filter === 2) predictor = up;
      else if (filter === 3) predictor = (left + up) >> 1;
      else if (filter === 4) {
        const estimate = left + up - upLeft;
        const [a, b, c] = [Math.abs(estimate - left), Math.abs(estimate - up), Math.abs(estimate - upLeft)];
        predictor = a <= b && a <= c ? left : b <= c ? up : upLeft;
      }
      pixels[y * stride + x] = (row[x] + predictor) & 0xff;
    }
  }

  const bgra = new Uint8Array(width * height * 4);
  for (let source = 0, target = 0; source < pixels.length; source += channels, target += 4) {
    bgra[target] = pixels[source + 2];
    bgra[target + 1] = pixels[source + 1];
    bgra[target + 2] = pixels[source];
    bgra[target + 3] = channels === 4 ? pixels[source + 3] : 255;
  }
  return { width, height, bgra };
}
