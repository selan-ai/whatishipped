/*
 * How closely a drawing matches a screenshot of the app, both at the screenshot's pixel size.
 * Only content counts: the pixels where either image differs from the app's ground (its commonest colour below the
 * status bar), so an empty or wrong screen on a dark, sparse ground scores low rather than high. A content pixel
 * matches when the other image has a pixel within one point of it whose colour is within TOLERANCE, both ways round,
 * which forgives anti-aliasing and a sub-point offset but not a shape, a size or a gap one point or more off.
 */
import { resize } from './png.ts';
import type { Image } from './png.ts';

const TOLERANCE = 28;
const BAND = 16;

export type Result = { score: number; off: Uint8Array; worst: { from: number; to: number }[] };

const at = (img: Image, x: number, y: number) => (y * img.width + x) * 4;
const diff = (a: Uint8Array, i: number, b: Uint8Array | number[], j: number) =>
  (Math.abs(a[i] - b[j]) + Math.abs(a[i + 1] - b[j + 1]) + Math.abs(a[i + 2] - b[j + 2])) / 3;

export function match(app: Image, drawing: Image, statusPoints: number, scale: number): Result {
  const d = drawing.width === app.width && drawing.height === app.height ? drawing : resize(drawing, app.width, app.height);
  const { width: W, height: H } = app;
  const top = Math.min(H, Math.ceil(statusPoints * scale));
  const ground = commonest(app, top);
  const r = Math.max(1, Math.round(scale));
  const near = (a: Image, b: Image, x: number, y: number) => {
    const i = at(a, x, y);
    for (let dy = -r; dy <= r; dy += 1) {
      const yy = y + dy;
      if (yy < top || yy >= H) continue;
      for (let dx = -r; dx <= r; dx += 1) {
        const xx = x + dx;
        if (xx >= 0 && xx < W && diff(a.rgba, i, b.rgba, at(b, xx, yy)) <= TOLERANCE) return true;
      }
    }
    return false;
  };
  const off = new Uint8Array(W * H);
  let content = 0;
  let same = 0;
  for (let y = top; y < H; y += 1) for (let x = 0; x < W; x += 1) {
    const i = at(app, x, y);
    if (diff(app.rgba, i, ground, 0) <= TOLERANCE && diff(d.rgba, i, ground, 0) <= TOLERANCE) continue;
    content += 1;
    if (near(app, d, x, y) && near(d, app, x, y)) same += 1;
    else off[y * W + x] = 1;
  }
  return { score: content ? Math.floor((same / content) * 100) : 100, off, worst: worst(off, W, H, Math.round(BAND * scale)) };
}

/* The commonest colour below the status bar, to the nearest 8 in each channel. */
function commonest(img: Image, top: number) {
  const count = new Map<number, number>();
  for (let y = top; y < img.height; y += 2) for (let x = 0; x < img.width; x += 2) {
    const i = at(img, x, y);
    const key = ((img.rgba[i] >> 3) << 10) | ((img.rgba[i + 1] >> 3) << 5) | (img.rgba[i + 2] >> 3);
    count.set(key, (count.get(key) ?? 0) + 1);
  }
  const key = [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;
  return [((key >> 10) << 3) + 4, (((key >> 5) & 31) << 3) + 4, ((key & 31) << 3) + 4, 255];
}

/* The two stretches of rows that differ most, each a run of bands with differences, as pixel rows. */
function worst(off: Uint8Array, W: number, H: number, band: number) {
  const bands = Math.ceil(H / band);
  const sums = new Array(bands).fill(0);
  for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) sums[Math.floor(y / band)] += off[y * W + x];
  const floor = W * band * 0.004;
  const runs: { from: number; to: number; sum: number }[] = [];
  for (let b = 0; b < bands; b += 1) {
    if (sums[b] <= floor) continue;
    const last = runs.at(-1);
    if (last && last.to === b * band && last.to - last.from < band * 10) { last.to = Math.min(H, (b + 1) * band); last.sum += sums[b]; }
    else runs.push({ from: b * band, to: Math.min(H, (b + 1) * band), sum: sums[b] });
  }
  return runs.sort((a, b) => b.sum - a.sum).slice(0, 2).sort((a, b) => a.from - b.from).map(({ from, to }) => ({ from, to }));
}

/* What differs, red on transparent at the screenshot's size: the board lays it over the drawing, greyed. */
export function mask(result: Result, width: number, height: number): Image {
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i += 1) if (result.off[i]) rgba.set([255, 64, 64, 255], i * 4);
  return { width, height, rgba };
}

/* The app, the drawing, and the drawing greyed with what differs in red, side by side at 1:1 points. */
export function picture(app: Image, drawing: Image, result: Result, w: number, h: number): Image {
  const gap = 16;
  const W = w * 3 + gap * 2;
  const rgba = new Uint8Array(W * h * 4);
  for (let i = 0; i < W * h; i += 1) rgba.set([17, 19, 24, 255], i * 4);
  const a = resize(app, w, h);
  const d = resize(drawing, w, h);
  const sx = app.width / w;
  const sy = app.height / h;
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
    const o = (y * w + x) * 4;
    rgba.set(a.rgba.subarray(o, o + 4), (y * W + x) * 4);
    rgba.set(d.rgba.subarray(o, o + 4), (y * W + x + w + gap) * 4);
    let red = false;
    for (let yy = Math.floor(y * sy); yy < Math.floor((y + 1) * sy) && !red; yy += 1) for (let xx = Math.floor(x * sx); xx < Math.floor((x + 1) * sx) && !red; xx += 1) red = result.off[yy * app.width + xx] === 1;
    const grey = (d.rgba[o] * 2 + d.rgba[o + 1] * 5 + d.rgba[o + 2]) / 16;
    rgba.set(red ? [255, 64, 64, 255] : [grey, grey, grey, 255], (y * W + x + (w + gap) * 2) * 4);
  }
  return { width: W, height: h, rgba };
}

/* The rows that differ most, at the screenshot's own scale: for each stretch, the app, the drawing, and the drawing
 * greyed with what differs in red, side by side; a red rule between stretches. */
export function zoom(app: Image, drawing: Image, result: Result): Image | null {
  if (!result.worst.length) return null;
  const d = drawing.width === app.width && drawing.height === app.height ? drawing : resize(drawing, app.width, app.height);
  const pad = 24;
  const gap = 24;
  const w = app.width;
  const W = w * 3 + gap * 2;
  const parts = result.worst.map((r) => ({ from: Math.max(0, r.from - pad), to: Math.min(app.height, r.to + pad) }));
  const H = parts.reduce((n, p) => n + (p.to - p.from) + gap, -gap);
  const rgba = new Uint8Array(W * H * 4);
  for (let i = 0; i < W * H; i += 1) rgba.set([17, 19, 24, 255], i * 4);
  let y0 = 0;
  for (const [n, p] of parts.entries()) {
    if (n) for (let y = y0 - gap + 8; y < y0 - 8; y += 1) for (let x = 0; x < W; x += 1) rgba.set([255, 64, 64, 255], (y * W + x) * 4);
    for (let y = p.from; y < p.to; y += 1) {
      const row = (y0 + y - p.from) * W;
      for (let x = 0; x < w; x += 1) {
        const i = at(app, x, y);
        rgba.set(app.rgba.subarray(i, i + 4), (row + x) * 4);
        rgba.set(d.rgba.subarray(i, i + 4), (row + x + w + gap) * 4);
        const grey = (d.rgba[i] * 2 + d.rgba[i + 1] * 5 + d.rgba[i + 2]) / 16;
        rgba.set(result.off[y * w + x] ? [255, 64, 64, 255] : [grey, grey, grey, 255], (row + x + (w + gap) * 2) * 4);
      }
    }
    y0 += p.to - p.from + gap;
  }
  return { width: W, height: H, rgba };
}
