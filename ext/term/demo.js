// Made-up placeholder posts for the demo page (?demo=1): clearly labelled,
// with drawn pictures, so the terminal can be tried without the network.

const TEXTS = [
  ['Demo Station', 'Calibration frame. If you can read this, the cathode is warm and the tape is moving.', ['planet'], 412, 37, 58],
  ['Demo Gardener', 'First frost on the allotment this morning. The leeks look smug about it.', ['hills'], 88, 12, 6],
  ['Demo Cat Person', 'He has claimed the radiator. Negotiations have broken down.', ['cat'], 1290, 140, 77],
  ['Demo Reader', 'Halfway through a book about lighthouses and I have strong opinions about Fresnel lenses now.\n\nAsk me anything.', [], 34, 21, 2],
  ['Demo Painter', 'Colour study, four ways. Which one works?', ['blocks1', 'blocks2', 'blocks3', 'blocks4'], 256, 63, 19],
  ['Demo Walker', 'Twelve miles along the ridge. Legs: gone. Mood: excellent.', ['hills'], 177, 9, 11],
  ['Demo Station', 'Downlink window closes in 4 minutes. Buffering what we can.', [], 61, 4, 13],
  ['Demo Baker', 'Sourdough attempt number nine. It rose! It actually rose!', ['blocks5'], 640, 88, 31],
  ['Demo Quiet', 'gm', [], 5, 1, 0],
  ['Demo Archivist', 'Found a box of old magnetic tapes in the basement, labelled only "DO NOT ERASE". Obviously I am going to find out what is on them. #archives #tape', ['blocks6'], 2210, 301, 412],
  ['Demo Gardener', 'Update: the leeks survived. The cabbages did not.', [], 46, 7, 1],
  ['Demo Night Owl', 'Clear sky tonight. Saw the moon go behind a cloud, come out, and go behind another cloud. Riveting.', ['planet'], 133, 15, 9],
];

export function demoPosts() {
  const now = Date.now();
  const posts = TEXTS.map(([name, text, imgs, likes, replies, reposts], i) => {
    const handle = `${name.toLowerCase().replace(/[^a-z]+/g, '-')}.demo`;
    return {
      key: `demo/${i}`, demo: true, did: `did:demo:${i}`, rkey: `3demo${String(i).padStart(8, '0')}`,
      handle, name: `${name} (demo)`, avatar: `demo:face-${name}`,
      text, created: new Date(now - i * 47 * 60e3).toISOString(), langs: ['en'],
      likes, replies, reposts, quotes: 0, links: 0, tags: (text.match(/#\w+/g) || []).length, mentions: 0,
      reply: i === 10, images: imgs.map(k => ({ src: `demo:${k}`, alt: '' })),
    };
  });
  // Quotes: a post with a picture, a feed, and one that's gone.
  const q = posts[0];
  posts[3].quote = { kind: 'post', did: q.did, rkey: q.rkey, handle: q.handle, name: q.name, text: q.text, images: q.images };
  posts[4].quote = { kind: 'feed', did: 'did:demo:feeds', rkey: 'paint', title: 'Painters (demo)' };
  posts[9].quote = { kind: 'missing' };
  posts[11].quote = { kind: 'post', did: posts[2].did, rkey: posts[2].rkey, handle: posts[2].handle, text: '', images: [], nested: true };
  return posts;
}
