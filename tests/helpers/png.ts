/*
 * PNG files for tests: the brandbook only reads PNG (png.ts) and stores WebP, so writing one is test-only. 8-bit RGBA,
 * not interlaced, as simctl, adb and Chrome hand them over.
 */
import { crc32, deflateSync } from 'node:zlib';
import type { Image } from '../../skills/whatishipped/template/server/png.ts';

export function encodePng(img: Image): Buffer {
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
