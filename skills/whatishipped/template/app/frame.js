/*
 * The phone around a screen, and the small helpers every area uses. The platform comes from window.Foundations.
 * Frame.phone({ nav, body, tabs, bottom, toast, sheet, over }): every slot is HTML or ''.
 *   nav     the app's top bar, drawn under the status bar; '' leaves the status bar bare over the page
 *   body    the page, which runs on under the bars
 *   tabs    a bottom tab or navigation bar
 *   bottom  what a screen pins over its foot (a composer, call controls, a button bar)
 *   toast   a snackbar or toast over the foot
 *   sheet   a bottom sheet over a dimmed page
 *   over    a dialog or alert centred over a dimmed page
 *   banner  a notification that hangs from the top (an in-app banner)
 *   scroll  how far the page is scrolled under the bar, in points; the bar then shows the app's scrolled edge
 *   style   custom properties for this one phone, such as '--body-bottom: 200px'
 *   landscape  the phone turned on its side
 */
window.Frame = (() => {
  const esc = (s) => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  const ios = {
    signal: '<svg width="18" height="12" viewBox="0 0 18 12" fill="currentColor"><rect x="0" y="8" width="3" height="4" rx="1"/><rect x="5" y="5.5" width="3" height="6.5" rx="1"/><rect x="10" y="3" width="3" height="9" rx="1"/><rect x="15" y="0" width="3" height="12" rx="1"/></svg>',
    wifi: '<svg width="17" height="12" viewBox="0 0 17 12" fill="currentColor"><path d="M8.5 2.3c2.4 0 4.6.9 6.3 2.5l1.2-1.2C14 1.6 11.4.6 8.5.6S3 1.6 1 3.6l1.2 1.2c1.7-1.6 3.9-2.5 6.3-2.5Zm0 3.4c1.5 0 2.8.6 3.9 1.5l1.2-1.2A7.2 7.2 0 0 0 8.5 4c-1.9 0-3.7.7-5.1 2l1.2 1.2c1.1-.9 2.4-1.5 3.9-1.5Zm0 3.4c.6 0 1.1.2 1.5.6L8.5 11.2 7 9.7c.4-.4.9-.6 1.5-.6Z"/></svg>',
    battery: '<svg width="27" height="13" viewBox="0 0 27 13"><rect x=".5" y=".5" width="23" height="12" rx="3.8" fill="none" stroke="currentColor" opacity=".4"/><rect x="2" y="2" width="20" height="9" rx="2.5" fill="currentColor"/><path d="M25 4.5v4c.8-.3 1.3-1.1 1.3-2s-.5-1.7-1.3-2Z" fill="currentColor" opacity=".4"/></svg>',
  };
  const android = {
    wifi: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21 0 8.5C3.3 5.4 7.5 3.5 12 3.5s8.7 1.9 12 5Z"/></svg>',
    signal: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M2 22 22 2v20Z"/></svg>',
    battery: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="7" y="3" width="10" height="19" rx="2"/><rect x="10" y="1" width="4" height="3" rx="1"/></svg>',
  };
  const platform = () => window.Foundations.platform;

  /* The clock as the device's screenshots show it (Foundations.device.clock: '9:41', or '09:41' on a 24-hour phone). */
  const clock = () => esc(window.Foundations.device.clock || '9:41');
  function status() {
    if (platform() === 'android') return `<div class="phone__status"><span>${clock()}</span><span class="phone__punch"></span><span class="phone__icons">${android.wifi}${android.signal}${android.battery}</span></div>`;
    return `<div class="phone__status"><span>${clock()}</span><span class="phone__island"></span><span class="phone__icons">${ios.signal}${ios.wifi}${ios.battery}</span></div>`;
  }

  function phone({ nav, body, tabs, bottom, toast, sheet, over, banner, scroll, style, landscape }) {
    const p = platform();
    const dim = sheet || over ? '<div class="phone__dim"></div>' : '';
    const overDim = sheet && over ? '<div class="phone__dim phone__dim--over"></div>' : '';
    const top = nav ? (scroll ? ' phone__top--scrolled' : '') : ' phone__top--bare';
    return `<div class="phone phone--${p}${landscape ? ' phone--landscape' : ''}" style="${style ?? ''}"><div class="phone__top${top}">${status()}${nav ?? ''}</div><div class="phone__body"><div class="phone__page" style="margin-top:${-(scroll ?? 0)}px">${body ?? ''}</div></div>${tabs ? `<div class="phone__tabs">${tabs}</div>` : ''}${bottom ? `<div class="phone__bottom">${bottom}</div>` : ''}${toast ? `<div class="phone__toast">${toast}</div>` : ''}${dim}${sheet ? `<div class="phone__sheet">${sheet}</div>` : ''}${overDim}${over ? `<div class="phone__over">${over}</div>` : ''}${banner ? `<div class="phone__banner">${banner}</div>` : ''}${window.Foundations.device.home === false ? '' : '<div class="phone__home"></div>'}</div>`;
  }

  /*
   * A demo's states: d('label', () => html); d('label', () => html, 'wide') for one that stands on the screen ground at
   * phone width; d('label', () => html, 'bleed') for a full-width bar that runs to the phone's edges.
   */
  const d = (label, render, wide = false) => ({ label, render, wide: Boolean(wide), bleed: wide === 'bleed' });

  /*
   * A piece another area owns, drawn when its owner's file is on the board, else a dashed box with its name. Call it
   * inside a render function, never at load time, so the owner's file has loaded by then.
   */
  const slot = (name, params) => (window.C[name] ? window.C[name](params) : `<div style="padding:10px 12px;border:1px dashed rgba(255,255,255,.35);border-radius:10px;font:11px ui-monospace,monospace;color:rgba(255,255,255,.6)">${esc(name)}</div>`);

  return { esc, phone, d, slot };
})();
