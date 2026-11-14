// The posts behind the bars. The content script sends only addresses
// ("handle-or-did/rkey", in page order); each is fetched once from Bluesky's
// public AppView (no login or key) in batches of 25, and kept here.

const APPVIEW = 'https://public.api.bsky.app/xrpc/';

export async function xrpc(method, params) {
  const u = new URL(APPVIEW + method);
  for (const [k, v] of Object.entries(params)) {
    if (Array.isArray(v)) v.forEach(x => u.searchParams.append(k, x));
    else if (v != null) u.searchParams.set(k, v);
  }
  const r = await fetch(u);
  if (!r.ok) throw new Error(`${method}: ${r.status}`);
  return r.json();
}

// What to picture from a post's embed: up to four images, a video's still,
// or a link card's thumbnail.
function media(embed) {
  if (!embed) return { images: [] };
  const t = embed.$type || '';
  if (t.startsWith('app.bsky.embed.images')) return { images: (embed.images || []).slice(0, 4).map(i => ({ src: i.thumb, alt: i.alt || '' })) };
  if (t.startsWith('app.bsky.embed.video')) return { images: embed.thumbnail ? [{ src: embed.thumbnail, alt: embed.alt || 'video' }] : [], video: true };
  if (t.startsWith('app.bsky.embed.external')) {
    const e = embed.external || {};
    return { images: e.thumb ? [{ src: e.thumb, alt: e.title || '' }] : [], link: { title: e.title || e.uri || '', uri: e.uri || '' } };
  }
  if (t.startsWith('app.bsky.embed.recordWithMedia')) return { ...media(embed.media), quote: true };
  if (t.startsWith('app.bsky.embed.record')) return { images: [], quote: true };
  return { images: [] };
}

export function fromView(key, v) {
  const r = v.record || {};
  const facets = r.facets || [];
  const count = kind => facets.reduce((n, f) => n + (f.features || []).filter(x => (x.$type || '').endsWith(kind)).length, 0);
  return {
    key,
    did: v.author.did,
    rkey: v.uri.split('/').pop(),
    handle: v.author.handle,
    name: v.author.displayName || '',
    avatar: v.author.avatar ? v.author.avatar.replace('/img/avatar/plain/', '/img/avatar_thumbnail/plain/') : '',
    text: r.text || '',
    created: r.createdAt || v.indexedAt || '',
    langs: r.langs || [],
    likes: v.likeCount || 0,
    replies: v.replyCount || 0,
    reposts: (v.repostCount || 0),
    quotes: v.quoteCount || 0,
    links: count('#link'),
    tags: count('#tag'),
    mentions: count('#mention'),
    reply: !!r.reply,
    ...media(v.embed),
  };
}

export class Feed {
  constructor(onChange) {
    this.onChange = onChange;
    this.posts = new Map();   // key -> post, or { key, error }
    this.dids = new Map();    // handle -> did
    this.queue = new Set();
    this.busy = false;
  }

  get(key) { return this.posts.get(key); }

  put(post) { this.posts.set(post.key, post); }

  want(keys) {
    for (const k of keys) if (!this.posts.has(k)) this.queue.add(k);
    this.pump();
  }

  async did(actor) {
    if (actor.startsWith('did:')) return actor;
    if (!this.dids.has(actor)) {
      this.dids.set(actor, xrpc('com.atproto.identity.resolveHandle', { handle: actor }).then(j => j.did));
    }
    return this.dids.get(actor);
  }

  async pump() {
    if (this.busy || !this.queue.size) return;
    this.busy = true;
    const keys = [...this.queue].slice(0, 25);
    keys.forEach(k => this.queue.delete(k));
    const uris = new Map();
    await Promise.all(keys.map(async k => {
      const [actor, rkey] = k.split('/');
      try {
        uris.set(`at://${await this.did(decodeURIComponent(actor))}/app.bsky.feed.post/${rkey}`, k);
      } catch {
        this.posts.set(k, { key: k, error: true });
      }
    }));
    try {
      if (uris.size) {
        const j = await xrpc('app.bsky.feed.getPosts', { uris: [...uris.keys()] });
        for (const v of j.posts || []) {
          const k = uris.get(v.uri);
          if (k) this.posts.set(k, fromView(k, v));
        }
      }
    } catch { /* offline: left as errors below, tried again if asked */ }
    for (const k of uris.values()) if (!this.posts.has(k)) this.posts.set(k, { key: k, error: true });
    this.busy = false;
    this.onChange();
    this.pump();
  }
}
