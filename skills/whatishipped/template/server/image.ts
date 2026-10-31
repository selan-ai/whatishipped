/*
 * Reference screenshots are WebP (small enough to keep in the repo); PNGs from before that still read. Decoding a WebP
 * needs a Chrome page to evaluate in (webp.ts); a PNG never does.
 */
import { decode } from './png.ts';
import type { Image } from './png.ts';
import { decodeWebp } from './webp.ts';
import type { Evaluate } from './webp.ts';

export const REF_EXTENSION = '.webp';

/* The file name of the nth (from 0) newly kept frame: 0001.webp. */
export const frameFile = (n: number) => `${String(n + 1).padStart(4, '0')}${REF_EXTENSION}`;

export const isWebp = (bytes: Buffer) => bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';

/* A PNG or WebP as pixels, or null when it is neither or cannot be read. */
export async function decodeImage(bytes: Buffer, evaluate: Evaluate): Promise<Image | null> {
  return isWebp(bytes) ? decodeWebp(bytes, evaluate) : decode(bytes);
}
