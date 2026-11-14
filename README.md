# cathodeskyone

A browser extension for [Bluesky](https://bsky.app): an old image-processing terminal behind your feed, in the style of the planetary probe screens of the 1980s. Every post on the page is a bar in three boxes down the right (likes, replies, reposts). Rest the mouse on a post for a moment and the terminal shows it to the left of the feed: the text, and the author's picture and the post's images in low-res black and white.

The little monitor button at the bottom right switches to the full terminal.

A sibling of [skytreeone](https://github.com/TechyBen/skytreeone) (a forest behind Bluesky) and fightskyone (a sky to fly in).

![The full terminal (demo posts)](docs/full.png)

## Install (unpacked)

```bash
git clone https://github.com/TechyBen/cathodeskyone
```

Then in Chrome or Edge, open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and pick the `ext` folder. Open bsky.app. There's no build step.

If skytreeone or fightskyone is installed too, switch the others off in their popups: each one puts a scene behind the page.

## Behind the feed

- **Bars** to the right of the feed: one row per post on the page, in page order, length on a log scale against the biggest on the page. The shown post is bright with a marker.
- **The post** to the left of the feed. The terminal waits until the mouse has rested on a post for the settle time (1.5 s by default), so sweeping across the feed doesn't keep switching.
- On a light Bluesky theme the screen is inverted to dark lines on pale paper, like the hard copy.

## Full terminal

| | |
|---|---|
| Up / Down, W / S, mouse wheel | Previous / next post |
| Page Up / Page Down, Home / End | Ten at a time, first, last |
| Click a bar | That post |
| L | Pictures as grey levels or traced lines |
| Enter | Open the post's thread on Bluesky |
| Esc | Back to your feed |

## The screen

- **Header**: the author's handle, the post's number on the page, and its record key.
- **Step wedge** (left): the 16 grey levels pictures are cut to, with a marker at the shown picture's average level.
- **Main frame**: the profile picture, name, handle and time, the text, and up to four images (a video's still or a link card's thumbnail too), each in a line-bound box. Pictures are shrunk to about a hundred pixels a side, turned to grey, contrast-stretched between their 1st and 99th percentile and cut to 16 levels, or traced to outlines with an edge filter. Reseau crosses sit over the frame like the marks on the camera's faceplate.
- **Readouts** along the bottom: characters, words, links, tags, mentions, language; the picture's average level, hue and saturation; the stretch it got (`L011=000 H254=255`: input level 11 went to black, 254 to white); the post's day of the year and time, large, and its date.
- **The tube**: drawn in 2D, then through a WebGL shader with one colour of phosphor, glow, scanlines, line jitter, grain, flicker, a slow rolling band, vignette and, in full screen, a curved face.

## Privacy

Only the addresses of the posts on the page (handle and record key) go from bsky.app to the terminal. It fetches the posts from Bluesky's public API and the pictures from Bluesky's CDN. Nothing needs a login, and nothing is stored or sent anywhere else.

## Settings (toolbar popup)

| Setting | Default | |
|---|---|---|
| Terminal behind Bluesky | on | Switching off restores Bluesky exactly |
| Settle time | 1.5 s | How long the mouse rests on a post before the terminal shows it |
| Pictures as traced lines | off | |
| Terminal glow | 55% | Brightness behind the feed |
| Feed panel | 70% | Opacity of the blurred panel behind the feed |
| Blur | 6 px | |
| Frame cap | 20 fps | Behind the feed; full screen runs at up to 60 |

## Testing without the extension

```bash
python tools/serve.py
```

Then open `http://localhost:8202/term/index.html?demo=1` for made-up, labelled demo posts with drawn pictures (no network). Add `&behind=1` for the behind-the-feed layout, and in the console `__cathode.testLayout(340, 600, true)` to lay it out around a pretend feed column on a light theme. The server's `/proxy?u=` fetches Bluesky's pictures for the page, standing in for the extension's permission.

## Files

- `ext/content.js`, `content.css`: the iframe behind bsky.app, the see-through panels and glass (as in skytreeone), reading the posts on the page, the settle timer, the monitor button, full screen, opening threads.
- `ext/term/`: the terminal page. `main.js` (state, messages, keys, loop), `feed.js` (fetching posts), `picture.js` (fetching and processing pictures), `screen.js` (the layouts and drawing), `crt.js` (the tube shader), `demo.js`.
- `tools/serve.py` (test server), `tools/make_icons.py` (the icon).
