# cathodeskyone — plan

Cathode-terminal-style Bluesky browsing, after the Voyager MIPL image-processing screens.
Sibling of skytreeone and fightskyone.

## Decided

- **Shape:** Chrome MV3 extension built the same way as skytreeone and fightskyone: load `ext/` unpacked, no build step, plus a demo/example page that runs without the network (like fightskyone's `?demo=1`).
- **Background mode:** the terminal sits behind bsky.app instead of trees/flight. The background shows the data bars on the right and the terminal-style image render / text box output.
- **Fullscreen:** a small corner button (like the tree/jet button) switches to the full screen view, as if looking at an old NASA terminal.
- **Images:** black-and-white, low-pixel renders of profile pictures and post images are done in the extension page (fetch via the `cdn.bsky.app` host permission, then read pixels on a canvas, as skytreeone's `avatarColour()` does). Histograms and other image data can be real.
- **Which post the background shows:** the post under the mouse, loaded slowly. Wait a second or two after the mouse settles on a new post before switching, so moving across the feed doesn't flicker or keep reselecting.
- **Bars:** three boxes, top to bottom: likes, replies, reposts. One bar per post on the page.

## Discussing

- First draft built (2026-11-14): feedback on the look and layout.

## Later

- Supplementary data readouts.
- tbsky hub listing (cathodeskyone and fightskyone are private for now).
