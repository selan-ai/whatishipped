/*
 * How a screenshot of the app sits on the board's device (check.ts --compare): the CSS size the drawing is made at,
 * the scale between the screenshot's pixels and CSS pixels, and what looks wrong about the screenshot.
 * A phone's screenshot is checked against the phone (a turned one against the phone turned, its height to a percent).
 * A web screenshot is a viewport: the page's own height is free, so a full-page capture is as tall as it needs to be,
 * and nothing is turned or cleared for a status bar.
 */
import { System } from '../app/types.ts';
import type { Foundations } from '../app/types.ts';

type Size = { width: number; height: number };
export type Platform = { system: System; size: Foundations['device'] };
export type Geometry = {
  /* The drawing's size in CSS pixels, and the screenshot's pixels per CSS pixel. */
  width: number; height: number; scale: number;
  /* The screenshot is the other way round from the device: the device is measured turned. */
  turned: boolean; device: Size;
  /* The sides the bare page takes (?bare&w=&h=): a turned phone stands as --phone-h × --phone-w. */
  bare: Size;
  /* The height of the bar the match leaves out. */
  status: number;
  notes: string[];
};

const round = (n: number, to: number) => Math.round(n * to) / to;

export function screenshotGeometry({ system, size }: Platform, image: Size): Geometry {
  const web = system === System.web;
  const density = Number(size.density) || 0;
  const turned = !web && (image.width > image.height) !== (size.width > size.height);
  const device = turned ? { width: size.height, height: size.width } : { width: size.width, height: size.height };
  const scale = density > 0 ? density : image.width / device.width;
  const width = image.width / scale;
  const height = image.height / scale;
  const bare = turned ? { width: height, height: width } : { width, height };
  const status = web ? 0 : size.status;
  const where = turned ? ' turned' : '';
  const notes = [
    web && Math.abs(width - device.width) > 1 ? `the screenshot is ${round(width, 10)} wide at ${round(scale, 1000)}×, the board's viewport ${device.width}: another viewport?` : '',
    !web && Math.abs(width - device.width) > 1 ? `the screenshot is ${round(width, 10)} wide at ${round(scale, 1000)}×, the board's phone ${device.width}${where}: another phone?` : '',
    !web && Math.abs(height - device.height) > device.height * 0.01 ? `the screenshot is ${Math.round(height)} tall, the board's phone ${device.height}${where}: another phone?` : '',
    !density && system === System.ios && Math.abs(scale - Math.round(scale)) > 0.02 ? `${image.width} px wide is not ${device.width} at 2× or 3×: another phone? (Foundations.device.density says)` : '',
  ].filter(Boolean);
  return { width, height, scale, turned, device, bare, status, notes };
}
