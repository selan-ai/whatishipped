/*
 * The app's icons as outline glyphs on a 24 × 24 view box. SF Symbols and font icons cannot be drawn in a browser,
 * so each is its nearest outline glyph and keeps the name the code uses; an Android vector drawable or an SVG in an
 * asset catalogue is converted as it is. Icons.add(name, source, paths, paint), Icons.icon(name, size, weight), where
 * weight is a name below or the code's own stroke width in points (Compose's 2.2.dp is 2.2).
 * paint: false for an outline, true for a filled glyph that takes the text colour, 'as-is' for a multicolour icon
 * (a brand mark, a flag) whose paths carry their own fills.
 */
window.Icons = (() => {
  const P = {};
  const weight = { thin: 1.2, regular: 1.6, medium: 1.8, semibold: 2.2, bold: 2.5 };
  const add = (name, source, paths, filled = false) => { P[name] = { source, paths, filled }; };
  const icon = (name, size, w = 'medium') => {
    const g = P[name];
    if (!g) return `<span class="b-missing-icon" title="${name}" style="display:inline-block;width:${size}px;height:${size}px;border-radius:4px;outline:1px dashed currentColor;opacity:.5"></span>`;
    const paint = g.filled === 'as-is' ? '' : g.filled ? 'fill="currentColor" stroke="none"' : `fill="none" stroke="currentColor" stroke-width="${typeof w === 'number' ? w : weight[w]}" stroke-linecap="round" stroke-linejoin="round"`;
    return `<svg class="i" width="${size}" height="${size}" viewBox="0 0 24 24" ${paint} aria-hidden="true">${g.paths}</svg>`;
  };
  return { add, icon, get names() { return Object.keys(P); }, source: (n) => P[n].source };
})();
