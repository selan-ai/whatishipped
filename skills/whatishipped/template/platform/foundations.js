/*
 * What this app's foundations are, read from its token files. Replace every value; keep the shape.
 * A token is { name, css } (a custom property in tokens.css) or { name, value } (a literal the code uses).
 */
window.Foundations = {
  platform: 'ios', // or 'android', or 'web' (a desktop board: device 1440 × 900, status: 0, clock: '', home: false, density: 1, CSS pixels)
  // The device the app's UI tests run on, in points or dp, as its screenshots show it: the status bar's height (the
  // top safe-area inset; measure it on a screenshot, e.g. 62 on an iPhone 17 Pro), the clock ('9:41', or '09:41'
  // on a 24-hour phone), whether the home indicator shows (home: false when the screenshots have none), and the
  // density, pixels per point (iPhones 2 or 3; Android its dpi / 160, e.g. 420 / 160 = 2.625; 0 when unknown).
  // It stands the way the app does: a landscape-only app is wider than tall, e.g. an iPad (A16) at 1180 × 820.
  device: { name: 'iPhone 16', width: 393, height: 852, status: 54, clock: '9:41', home: true, density: 3 },
  // The one setup every screen is drawn in (account, plan, flags), so all areas agree. The board does not show it.
  scenario: 'One signed-in account; every feature on.',
  // Each design system the app ships, and how much the app uses it, in a few words.
  systems: [{ name: 'Design system', use: 'all of the app' }],
  app: { name: 'App · iOS', mark: '' },
  // Grouped by what the code says each colour is for (names, comments, where it is used), not by hue.
  colours: [
    { group: 'Surfaces', tokens: [{ name: 'Color.background', css: '--t-background' }] },
  ],
  // One row per text style, with real copy from the app.
  type: [
    { name: 'Title', spec: 'Inter Bold 24 / 30', cls: 't-title', sample: 'A real title from the app' },
  ],
  radii: [{ name: 'Radius.card', css: '--t-radius-card' }],
  spacing: [{ name: 'Spacing.m', css: '--t-space-m' }],
  groupOrder: ['Identity', 'Controls', 'Navigation', 'Lists', 'Content', 'Feedback', 'System'],
  // Component names in the app's own catalogue order, if it has one.
  itemOrder: [],
};
