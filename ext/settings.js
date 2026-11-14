// Shared by the content script and the popup (kept in chrome.storage.sync).
// eslint-disable-next-line no-unused-vars
const CATHODESKY_DEFAULTS = {
  enabled: true,
  delay: 1.5,    // seconds the mouse rests on a post before the terminal switches to it
  glow: 55,      // brightness of the terminal behind the feed, 0-100
  sound: true,   // beeps, the posts' readings and tape reels, medium-low
  voice: true,   // read each shown post aloud (the CHIMERA voice)
  voiceWho: 'author',     // 'author' (each their own), 'a' (voice low) or 'b' (voice high)
  voiceStyle: 'natural',  // or 'robotic'
  vol: 35,       // 0-100, sound and voice
  lines: false,  // pictures as traced outlines instead of grey levels
  fps: 20,       // frame cap behind the feed (full screen runs at up to 60)
  glass: 70,     // opacity of the panel behind the feed, 0-100
  blur: 6,       // blur behind the feed, px
};

// Settings the terminal page itself uses (sent to it live, no reload).
// eslint-disable-next-line no-unused-vars
const CATHODESKY_LIVE = ['glow', 'lines', 'fps', 'sound', 'voice', 'voiceWho', 'voiceStyle', 'vol'];
