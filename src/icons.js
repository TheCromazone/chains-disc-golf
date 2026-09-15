// One lightweight, local icon set. No font, sprite request or third-party runtime.
const paths = {
  play: '<path d="m9 5 11 7-11 7z"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  back: '<path d="M20 12H4m6-6-6 6 6 6"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  target: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3"/>',
  map: '<path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2zm6-2v16m6-14v16"/>',
  sound: '<path d="M11 4 6 8H3v8h3l5 4zM15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  mute: '<path d="M11 4 6 8H3v8h3l5 4zm5 5 6 6m0-6-6 6"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  players: '<circle cx="9" cy="8" r="3"/><path d="M3 21v-2a6 6 0 0 1 12 0v2m2-15a3 3 0 0 1 0 6m1 3a5 5 0 0 1 3 4v2"/>',
  online: '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>',
  jersey: '<path d="m8 3-6 4 3 5 3-2v11h8V10l3 2 3-5-6-4a4 4 0 0 1-8 0Z"/>',
  shuffle: '<path d="M3 6h3c5 0 7 12 12 12h3m-4-4 4 4-4 4M3 18h3c2 0 3-2 4-4m4-4c1-2 2-4 4-4h3m-4-4 4 4-4 4"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 0 1 6 0c0 2-3 2-3 4m0 4h.01"/>',
  trophy: '<path d="M7 3h10v5c0 8-10 8-10 0zm0 2H3v3c0 3 3 4 5 4m9-7h4v3c0 3-3 4-5 4m-4 2v7m-5 0h10"/>',
  flag: '<path d="M5 22V3m0 1c5-4 9 4 14 0v9c-5 4-9-4-14 0"/>',
  disc: '<ellipse cx="12" cy="12" rx="10" ry="5" transform="rotate(-25 12 12)"/><ellipse cx="12" cy="12" rx="6" ry="2.5" transform="rotate(-25 12 12)"/>',
  backhand: '<path d="M4 17c-3-8 3-12 10-9l6 3m-4-6 4 6-6 2"/>',
  forehand: '<path d="M20 17c3-8-3-12-10-9l-6 3m4-6-4 6 6 2"/>',
  tomahawk: '<path d="M8 5c7-5 12 2 8 8l-4 7m-3-6 3 6 6-3"/>',
  scoober: '<path d="M18 19c7-6-1-14-8-10L4 12m7 2-7-2 3-7"/>',
  putt: '<path d="M12 21V4m-6 6 6-6 6 6"/><path d="M4 20h3m10 0h3"/>',
};
paths.backhand_io = paths.backhand + '<path d="m14 21 6-2"/>'; paths.backhand_oi = paths.backhand + '<path d="m14 19 6 2"/>';
paths.forehand_io = paths.forehand + '<path d="m4 19 6 2"/>'; paths.forehand_oi = paths.forehand + '<path d="m4 21 6-2"/>';
paths.blade = '<path d="M5 4c8 0 14 6 14 16"/><path d="M14 20h5v-5"/>';
export const icon = name => `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths[name] || paths.disc}</svg>`;
