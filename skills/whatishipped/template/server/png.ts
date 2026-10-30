/*
 * PNG in and out without dependencies: enough for screenshots (8-bit RGB or RGBA, not interlaced), which is what
 * simctl, adb and Chrome write. Used to tell captured frames apart (capture.ts) and to measure how closely a drawing
 * matches a screenshot of the app (check.ts --compare).
 */
import { crc32, deflateSync, inflateSync } from 'node:zlib';

export type Image = { width: number; height: number; rgba: Uint8Array };

export function decode(png: Buffer): Image | null {
  if (png.length < 33 || png.readUInt32BE(0) !== 0x89504e47) return null;
  let width = 0, height = 0, depth = 0, type = 0, interlace = 0;
  const data: Buffer[] = [];
  for (let at = 8; at + 8 <= png.length;) {
    const length = png.readUInt32BE(at);
    const kind = png.toString('ascii', at + 4, at + 8);
    const body = png.subarray(at + 8, at + 8 + length);
    if (kind === 'IHDR') { width = body.readUInt32BE(0); height = body.readUInt32BE(4); depth = body[8]; type = body[9]; interlace = body[12]; }
    if (kind === 'IDAT') data.push(body);
    if (kind === 'IEND') break;
    at += 12 + length;
  }
  const channels = type === 6 ? 4 : type === 2 ? 3 : 0;
  if (depth !== 8 || !channels || interlace || !width || !height) return null;
  const raw = inflateSync(Buffer.concat(data));
  const stride = width * channels;
  const rgba = new Uint8Array(width * height * 4);
  let prev = new Uint8Array(stride);
  let row = new Uint8Array(stride);
  for (let y = 0; y < height; y += 1) {
    const start = y * (stride + 1);
    const filter = raw[start];
    for (let x = 0; x < stride; x += 1) {
      const a = x >= channels ? row[x - channels] : 0;
      const b = prev[x];
      const c = x >= channels ? prev[x - channels] : 0;
      let v = raw[start + 1 + x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) { const p = a + b - c; const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      row[x] = v;
    }
    for (let x = 0; x < width; x += 1) {
      const o = (y * width + x) * 4;
      rgba[o] = row[x * channels];
      rgba[o + 1] = row[x * channels + 1];
      rgba[o + 2] = row[x * channels + 2];
      rgba[o + 3] = channels === 4 ? row[x * channels + 3] : 255;
    }
    [prev, row] = [row, prev];
  }
  return { width, height, rgba };
}

/* The colour profile a PNG names (iCCP), or null when it has none or says sRGB; phone screenshots often name Display P3. */
export function profile(png: Buffer): string | null {
  for (let at = 8; at + 8 <= png.length;) {
    const length = png.readUInt32BE(at);
    const kind = png.toString('ascii', at + 4, at + 8);
    if (kind === 'iCCP') { const name = png.toString('latin1', at + 8, png.indexOf(0, at + 8)); return /srgb/i.test(name) ? null : name; }
    if (kind === 'IDAT' || kind === 'IEND') return null;
    at += 12 + length;
  }
  return null;
}

export function encode(img: Image): Buffer {
  const stride = img.width * 4;
  const raw = Buffer.alloc((stride + 1) * img.height);
  for (let y = 0; y < img.height; y += 1) raw.set(img.rgba.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  const chunk = (kind: string, body: Buffer) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(body.length, 0);
    head.write(kind, 4, 'ascii');
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])), 0);
    return Buffer.concat([head, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(img.width, 0);
  ihdr.writeUInt32BE(img.height, 4);
  ihdr.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

/* The image at another size, each pixel the mean of the ones it covers. */
export function resize(img: Image, width: number, height: number): Image {
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const y0 = Math.floor((y * img.height) / height);
    const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * img.height) / height));
    for (let x = 0; x < width; x += 1) {
      const x0 = Math.floor((x * img.width) / width);
      const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * img.width) / width));
      const sum = [0, 0, 0, 0];
      for (let sy = y0; sy < y1; sy += 1) for (let sx = x0; sx < x1; sx += 1) for (let k = 0; k < 4; k += 1) sum[k] += img.rgba[(sy * img.width + sx) * 4 + k];
      const n = (y1 - y0) * (x1 - x0);
      for (let k = 0; k < 4; k += 1) rgba[(y * width + x) * 4 + k] = sum[k] / n;
    }
  }
  return { width, height, rgba };
}

/* The top-left width × height of the image, or the image resized to it when it is smaller. */
export function crop(img: Image, width: number, height: number): Image {
  if (img.width < width || img.height < height) return resize(img, width, height);
  if (img.width === width && img.height === height) return img;
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) rgba.set(img.rgba.subarray(y * img.width * 4, (y * img.width + width) * 4), y * width * 4);
  return { width, height, rgba };
}

/* Mean colour per cell of a cols × rows grid: [r, g, b] for each cell, row by row. */
export function grid(img: Image, cols: number, rows: number): Float32Array {
  const small = resize(img, cols, rows);
  const out = new Float32Array(cols * rows * 3);
  for (let i = 0; i < cols * rows; i += 1) for (let k = 0; k < 3; k += 1) out[i * 3 + k] = small.rgba[i * 4 + k];
  return out;
}
