import assert from 'node:assert/strict';
import { test } from 'node:test';
import { System } from '../skills/whatishipped/template/app/types.ts';
import { screenshotGeometry } from '../skills/whatishipped/template/server/viewport.ts';

const size = (width: number, height: number, status: number, density: number) => ({ name: 'd', width, height, status, clock: '9:41', home: true, density });
const desktop = { system: System.web, size: size(1440, 900, 0, 1) };
const iphone = { system: System.ios, size: size(393, 852, 54, 0) };
const pixel = { system: System.android, size: size(411, 914, 24, 2.625) };

test('a 1440 x 900 desktop screenshot at density 1 is 1440 x 900 CSS pixels with no notes', () => {
  const g = screenshotGeometry(desktop, { width: 1440, height: 900 });
  assert.deepEqual([g.width, g.height, g.scale, g.status, g.turned], [1440, 900, 1, 0, false]);
  assert.deepEqual(g.notes, []);
});

test('a full-page web screenshot takes its own height without a height warning', () => {
  const g = screenshotGeometry(desktop, { width: 1440, height: 2400 });
  assert.equal(g.height, 2400);
  assert.deepEqual(g.bare, { width: 1440, height: 2400 });
  assert.deepEqual(g.notes, []);
});

test('a web screenshot of another width is reported as a viewport mismatch', () => {
  const g = screenshotGeometry(desktop, { width: 1280, height: 800 });
  assert.equal(g.notes.length, 1);
  assert.match(g.notes[0], /1280 wide at 1×, the board's viewport 1440: another viewport\?/);
});

test('a web screenshot at density 2 is measured in CSS pixels', () => {
  const g = screenshotGeometry({ system: System.web, size: size(1440, 900, 0, 2) }, { width: 2880, height: 1800 });
  assert.deepEqual([g.width, g.height, g.scale], [1440, 900, 2]);
  assert.deepEqual(g.notes, []);
});

test('a web screenshot is never turned, even when taller than wide', () => {
  const g = screenshotGeometry(desktop, { width: 1440, height: 2400 });
  assert.equal(g.turned, false);
  assert.deepEqual(g.device, { width: 1440, height: 900 });
});

test('an iPhone screenshot at 3x matches the phone with no notes', () => {
  const g = screenshotGeometry(iphone, { width: 1179, height: 2556 });
  assert.deepEqual([g.width, g.height, g.scale, g.status, g.turned], [393, 852, 3, 54, false]);
  assert.deepEqual(g.notes, []);
});

test('an iPhone screenshot not at a whole scale says another phone', () => {
  const g = screenshotGeometry(iphone, { width: 1000, height: 2170 });
  assert.ok(g.notes.includes('1000 px wide is not 393 at 2× or 3×: another phone? (Foundations.device.density says)'));
});

test('a native screenshot of another height warns about the phone', () => {
  const g = screenshotGeometry(iphone, { width: 1179, height: 2400 });
  assert.deepEqual(g.notes, ["the screenshot is 800 tall, the board's phone 852: another phone?"]);
});

test('an Android screenshot uses the declared density and is not checked for whole scales', () => {
  const g = screenshotGeometry(pixel, { width: 1080, height: 2400 });
  assert.equal(g.scale, 2.625);
  assert.equal(Math.round(g.width * 100) / 100, 411.43);
  assert.deepEqual(g.notes, []);
});

test('a landscape screenshot of a portrait phone is a turned state with turned device and bare sides', () => {
  const g = screenshotGeometry(iphone, { width: 2556, height: 1179 });
  assert.equal(g.turned, true);
  assert.deepEqual(g.device, { width: 852, height: 393 });
  assert.deepEqual([g.width, g.height], [852, 393]);
  assert.deepEqual(g.bare, { width: 393, height: 852 });
  assert.deepEqual(g.notes, []);
});

test('a turned note names the phone as turned', () => {
  const g = screenshotGeometry(iphone, { width: 2400, height: 1179 });
  assert.match(g.notes[0], /the board's phone 393 turned: another phone\?/);
});
