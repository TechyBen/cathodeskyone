// Puts the cathode terminal behind bsky.app (same approach as skytreeone and
// fightskyone):
//  - a fixed, click-through iframe (the extension's term/ page) sits under
//    everything
//  - Bluesky paints its page colour inline on many nested panels; a
//    stylesheet rule makes every panel with that inline colour transparent
//  - one translucent, blurred panel sits behind the feed column so posts stay
//    readable over the terminal
//  - the posts on the page are read from the feed (only their addresses) and
//    sent to the terminal, which fetches them from Bluesky's public API and
//    draws them as bars; resting the mouse on a post for a moment shows it
//  - full screen (the monitor button, or the popup) fades Bluesky out and
//    hands the keyboard and mouse to the terminal
(() => {
  if (window.__cathodesky) return;
  window.__cathodesky = true;

  // Outside the extension (window.CATHODESKY_TEST_BASE set) it runs with defaults.
  const ext = typeof chrome !== 'undefined' && chrome.runtime?.getURL ? chrome : null;
  const BASE = ext ? ext.runtime.getURL('term/index.html') : window.CATHODESKY_TEST_BASE;
  const ORIGIN = new URL(BASE).origin;

  let cfg = { ...CATHODESKY_DEFAULTS };
  let frame = null, veil = null, glass = null, button = null, observer = null, timer = 0;
  let themeBg = '', full = false, ready = false;
  let readyTimer = 0, retryTimer = 0, retried = false;
  const html = document.documentElement;

  // --- terminal iframe -------------------------------------------------------
  function termUrl() {
    return `${BASE}?saver&parent=${encodeURIComponent(location.origin)}`;
  }

  function mountFrame() {
    if (frame) return;
    frame = document.createElement('iframe');
    frame.id = 'cathodesky-frame';
    frame.setAttribute('aria-hidden', 'true');
    frame.tabIndex = -1;
    // Sound starts once you've clicked or typed on the page.
    frame.allow = 'autoplay';
    veil = document.createElement('div');
    veil.id = 'cathodesky-veil';
    glass = document.createElement('div');
    glass.id = 'cathodesky-glass';
    document.body.prepend(frame, veil, glass);
    button = makeButton();
    document.body.append(button);
    load(termUrl());
  }

  // The terminal stays hidden (Bluesky's own colour shows) until it reports
  // ready, then fades in, so there's never a bright flash. If it hasn't
  // reported in after 20 s, it's loaded once more.
  function load(url) {
    html.classList.remove('cathodesky-ready');
    ready = false;
    clearTimeout(readyTimer);
    clearTimeout(retryTimer);
    frame.src = url;
    retryTimer = setTimeout(() => {
      if (frame && !retried) { retried = true; load(frame.src); }
    }, 20000);
  }
  function onReady() {
    clearTimeout(retryTimer);
    retried = false;
    ready = true;
    readyTimer = setTimeout(() => html.classList.add('cathodesky-ready'), 600);
    sendCfg();
    lastLayout = '';
    sendLayout();
    lastPosts = '';
    sendPosts();
    if (shownKey) post({ type: 'cathodesky:select', key: shownKey });
    if (full) { frame.focus(); post('cathodesky:full'); }
  }

  function post(msg) { if (ready) frame?.contentWindow?.postMessage(msg, ORIGIN); }
  function sendCfg() {
    const live = {};
    for (const k of CATHODESKY_LIVE) live[k] = cfg[k];
    post({ type: 'cathodesky:cfg', cfg: live });
  }

  // --- the posts on the page ---------------------------------------------------
  // Feed items and thread items carry a link to their own post; only that
  // address (author handle or DID, and record key) is passed on.
  const ITEM = '[data-testid^="feedItem-by-"], [data-testid^="postThreadItem-by-"]';
  const POST_PATH = /^\/profile\/([\w.:%-]+)\/post\/([\w.~:-]+)/;
  // The open thread's own post (its address is the page's).
  const anchorKey = () => { const m = location.pathname.match(POST_PATH); return m ? `${m[1]}/${m[2]}` : ''; };
  const keyOf = item => {
    if (item.querySelector('[data-testid$="-expanded"]') && anchorKey()) return anchorKey();
    const href = item.querySelector('a[href*="/post/"]')?.getAttribute('href') || '';
    const m = href.match(POST_PATH);
    return m ? `${m[1]}/${m[2]}` : '';
  };
  // Only what's on the current screen: Bluesky keeps other feed tabs and the
  // screen it came from mounted but out of view.
  const shown = el => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.right > 0 && r.left < innerWidth;
  };
  let lastPosts = '';
  function sendPosts() {
    const keys = [];
    for (const el of document.querySelectorAll(ITEM)) {
      if (!shown(el)) continue;
      const k = keyOf(el);
      if (k && !keys.includes(k)) keys.push(k);
    }
    const s = keys.join(' ');
    if (!keys.length || s === lastPosts) return;
    lastPosts = s;
    post({ type: 'cathodesky:posts', keys });
    sendContext();
  }

  // --- zoom: into a post's thread and back out; round the feed tabs -------
  // The terminal drives Bluesky itself, so its list is always what Bluesky
  // would show. Zooming in opens a post's thread (clicking the main frame,
  // or + on a reply inside a thread); zooming out goes back the way it came,
  // to the home feed. On the home feed, + and - move to the next or previous
  // feed tab (Following, Discover, your pinned feeds), round and round.
  let depth = 0, lastContext = '', zoomTimer = 0;
  const feedTabs = () => [...document.querySelectorAll('[data-testid^="homeScreenFeedTabs-selector-"][role="tab"]')]
    .filter(t => shown(t) && !/^feeds\b/i.test(t.textContent.trim()));
  // Bluesky marks the current tab by colour: the brightest (or darkest, on a
  // light theme) label against the page.
  function currentTab(tabs) {
    const bg = luma(themeBg || 'rgb(0,0,0)');
    let best = 0, bd = -1;
    tabs.forEach((t, i) => {
      const el = t.querySelector('[data-testid^="homeScreenFeedTabs-"]') || t;
      const d = Math.abs(luma(getComputedStyle(el).color) - bg);
      if (d > bd + 0.02) { bd = d; best = i; }
    });
    return best;
  }
  function sendContext() {
    const path = location.pathname;
    let c;
    if (POST_PATH.test(path)) c = { kind: 'thread', depth: Math.max(1, depth), rkey: path.match(POST_PATH)[2] };
    else if (path === '/') {
      const tabs = feedTabs();
      c = { kind: 'feed', name: tabs.length ? tabs[currentTab(tabs)].textContent.trim() : 'HOME' };
    } else c = { kind: 'page', name: path.split('/').filter(Boolean)[0] || 'page' };
    const s = JSON.stringify(c);
    if (s === lastContext) return;
    lastContext = s;
    post({ type: 'cathodesky:context', ...c });
  }
  function go(path) {
    history.pushState(null, '', path);
    dispatchEvent(new PopStateEvent('popstate', { state: null }));
  }
  // Once the new screen has its posts, send them (and the thread's own post
  // to show first).
  function afterZoom(selectAnchor) {
    clearInterval(zoomTimer);
    const t0 = Date.now();
    zoomTimer = setInterval(() => {
      const ready = selectAnchor ? document.querySelector('[data-testid^="postThreadItem-by-"] [data-testid$="-expanded"]') : document.querySelector(ITEM);
      if (!ready && Date.now() - t0 < 6000) return;
      clearInterval(zoomTimer);
      lastPosts = '';
      sendPosts();
      sendContext();
      if (selectAnchor && anchorKey()) post({ type: 'cathodesky:select', key: anchorKey() });
    }, 150);
  }
  function zoom(m) {
    if (m.dir > 0) {
      if (!/^did:[a-z]+:[\w.:%-]+$/.test(m.did) || !/^[\w.~:-]+$/.test(m.rkey)) return;
      if (anchorKey().endsWith(`/${m.rkey}`)) return;   // already in that thread
      depth++;
      go(`/profile/${m.did}/post/${m.rkey}`);
      afterZoom(true);
      return;
    }
    if (POST_PATH.test(location.pathname)) {
      depth = Math.max(0, depth - 1);
      if (history.length > 1) history.back(); else go('/');
      afterZoom(false);
    } else if (location.pathname !== '/') {
      depth = 0;
      go('/');
      afterZoom(false);
    }
  }
  function nextTab(dir) {
    if (location.pathname !== '/') return;
    const tabs = feedTabs();
    if (tabs.length < 2) return;
    tabs[(currentTab(tabs) + (dir > 0 ? 1 : tabs.length - 1)) % tabs.length].click();
    // The new tab's feed may still be loading.
    setTimeout(() => afterZoom(false), 400);
  }

  // The post under the mouse, shown only once the mouse has rested on it for
  // a moment, so sweeping across the feed doesn't keep switching.
  let pending = '', shownKey = '', hoverTimer = 0;
  function onHover(e) {
    if (full) return;
    const item = e.target.closest?.(ITEM);
    const key = item ? keyOf(item) : '';
    if (key === pending) return;
    pending = key;
    clearTimeout(hoverTimer);
    if (!key || key === shownKey) return;
    hoverTimer = setTimeout(() => {
      shownKey = key;
      sendPosts();
      post({ type: 'cathodesky:select', key });
    }, cfg.delay * 1000);
  }

  // --- full screen ---------------------------------------------------------------
  // A little monitor with a curved screen and a glowing trace, drawn as rects.
  function makeButton() {
    const b = document.createElement('button');
    b.id = 'cathodesky-btn';
    b.type = 'button';
    b.innerHTML = '<svg viewBox="0 0 12 11" width="22" height="20" aria-hidden="true" shape-rendering="crispEdges">' +
      '<rect x="0" y="0" width="12" height="9" fill="#9aa39c"/><rect x="1" y="1" width="10" height="7" fill="#0b0f0c"/>' +
      '<rect x="2" y="5" width="2" height="1" fill="#d8f0dc"/><rect x="4" y="3" width="1" height="2" fill="#d8f0dc"/>' +
      '<rect x="5" y="2" width="2" height="1" fill="#d8f0dc"/><rect x="7" y="3" width="1" height="3" fill="#d8f0dc"/>' +
      '<rect x="8" y="6" width="2" height="1" fill="#d8f0dc"/><rect x="4" y="9" width="4" height="1" fill="#9aa39c"/>' +
      '<rect x="2" y="10" width="8" height="1" fill="#9aa39c"/></svg>';
    b.addEventListener('click', () => setFull(!full));
    labelButton(b);
    return b;
  }
  function labelButton(b = button) {
    if (!b) return;
    const label = full ? 'Back to the feed (Esc)' : 'Full terminal';
    b.title = label;
    b.setAttribute('aria-label', label);
  }

  // Bottom right, lifted above Bluesky's bottom bar and compose button, and
  // above the tree or jet button if a sibling extension is on too.
  function placeButton() {
    if (!button) return;
    let lift = 0;
    if (!full) {
      const h = innerHeight;
      for (const el of document.querySelectorAll('[data-cathodesky-bar], [data-testid="composeFAB"], #skytree-wander-btn, #fightsky-fly-btn')) {
        const r = el.getBoundingClientRect();
        if (r.height && r.top > h / 2 && r.bottom >= h - 80) lift = Math.max(lift, h - r.top + (el.id ? 8 : 0));
      }
    }
    button.style.bottom = `${16 + lift}px`;
  }

  function setFull(on) {
    if (!frame || on === full) return;
    full = on;
    labelButton();
    placeButton();
    html.classList.toggle('cathodesky-full', on);
    frame.tabIndex = on ? 0 : -1;
    frame.setAttribute('aria-hidden', on ? 'false' : 'true');
    if (on) {
      sendPosts();
      frame.focus();
      post('cathodesky:full');
    } else {
      post('cathodesky:calm');
      frame.blur();
      window.focus();
    }
  }

  // Esc in the terminal is handled there; this catches it if focus is back
  // on the page. Any other key in full screen hands focus back to the terminal.
  function onKey(e) {
    if (!full) return;
    if (e.code === 'Escape') {
      e.preventDefault();
      setFull(false);
    } else {
      // The key landed on the page (after clicking the monitor button, say):
      // pass it on to the terminal as well as giving it the focus back.
      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        e.stopPropagation();
        post({ type: 'cathodesky:key', code: e.code });
      }
      frame.focus();
    }
  }
  function onPageFocus() {
    if (full) frame.focus();
  }

  function onFrameMessage(e) {
    if (!frame || e.source !== frame.contentWindow || e.origin !== ORIGIN) return;
    const m = e.data;
    if (m?.type === 'cathodesky:ready') onReady();
    else if (m?.type === 'cathodesky:leave') setFull(false);
    else if (m?.type === 'cathodesky:zoom' && full) zoom(m);
    else if (m?.type === 'cathodesky:tab' && full) nextTab(m.dir);
    else if (m?.type === 'cathodesky:open' && /^did:[a-z]+:[\w.:%-]+$/.test(m.did) && /^[\w.~:-]+$/.test(m.rkey)) {
      setFull(false);
      openThread(m.did, m.rkey, typeof m.handle === 'string' ? m.handle : '');
    }
  }

  // Opening a post (Enter in full screen). Bluesky's router follows history
  // changes, so a pushState plus a popstate opens the thread without
  // reloading the page. Bluesky stays hidden until the post is on the page.
  let thread = null;
  function openThread(did, rkey, handle) {
    endThread();
    const path = `/profile/${did}/post/${rkey}`;
    html.classList.add('cathodesky-opening');
    history.pushState(null, '', path);
    dispatchEvent(new PopStateEvent('popstate', { state: null }));
    const t0 = Date.now();
    thread = { path, timer: 0 };
    thread.timer = setInterval(() => {
      const items = [...document.querySelectorAll('[data-testid^="postThreadItem-by-"]')];
      const anchor = items.find(e => e.querySelector('[data-testid$="-expanded"]')) ||
        items.find(e => e.dataset.testid === `postThreadItem-by-${handle}`);
      if (anchor || Date.now() - t0 > 6000) {
        clearInterval(thread.timer);
        requestAnimationFrame(() => html.classList.remove('cathodesky-opening'));
      }
    }, 100);
  }
  function endThread() {
    if (!thread) return;
    clearInterval(thread.timer);
    html.classList.remove('cathodesky-opening');
    thread = null;
  }
  function checkThread() {
    if (thread && location.pathname !== thread.path) endThread();
  }

  // --- see-through Bluesky ---------------------------------------------------
  // A stylesheet rule with !important beats Bluesky's inline colours, and it
  // applies before the browser paints, so panels that Bluesky re-renders never
  // flash opaque. The rule is rewritten when the theme changes.
  const rootPanel = () => document.querySelector('#root [style*="min-height: 100dvh"]');
  let pageBg = '', rules = null;
  const screens = new Set();
  let checked = new WeakSet();

  function readTheme() {
    return rootPanel()?.style.backgroundColor || pageBg;
  }

  function writeRules() {
    if (!rules) {
      rules = document.createElement('style');
      rules.id = 'cathodesky-rules';
      document.head.append(rules);
    }
    const sel = [];
    if (themeBg) sel.push(`html.cathodesky-on #root [style*="background-color: ${themeBg};"]`);
    for (const st of screens) sel.push(`html.cathodesky-on main [style="${CSS.escape(st)}"]`);
    rules.textContent = sel.length ? `${sel.join(',\n')} { background-color: transparent !important; }` : '';
  }

  // Navigation screens paint their own backdrop in a colour close to the page
  // colour: an absolute panel inside <main> that fills its parent.
  function isScreen(el) {
    if (!near(el.style.backgroundColor, themeBg)) return false;
    const cs = getComputedStyle(el);
    if (cs.position !== 'absolute' || cs.pointerEvents === 'none') return false;
    const r = el.getBoundingClientRect(), p = el.parentElement?.getBoundingClientRect();
    return !!p && r.width >= p.width * 0.95 && r.height >= p.height * 0.95;
  }

  function near(a, b) {
    const x = a.match(/[\d.]+/g), y = b.match(/[\d.]+/g);
    return !!x && !!y && x.length === 3 && [0, 1, 2].every(i => Math.abs(x[i] - y[i]) <= 40);
  }

  function sweep() {
    const t = readTheme();
    let dirty = false;
    if (t && t !== themeBg) { themeBg = t; screens.clear(); checked = new WeakSet(); dirty = true; paintGlass(); }
    if (!themeBg) return;
    for (const el of document.querySelectorAll('#root [style*="background-color"]')) {
      if (checked.has(el)) continue;
      checked.add(el);
      if (el.style.backgroundColor === themeBg) {
        const pos = getComputedStyle(el).position;
        if (pos === 'sticky' || pos === 'fixed') el.setAttribute('data-cathodesky-bar', '');
        continue;
      }
      const st = el.getAttribute('style');
      if (screens.has(st) || !el.closest('main') || !isScreen(el)) continue;
      screens.add(st);
      dirty = true;
    }
    if (dirty || !rules) writeRules();
  }

  let queued = false, postsTimer = 0;
  function onMutations() {
    // At most every 0.7 s, even while the page never stops changing (a
    // playing video, a spinner), so the list can't be held off for ever.
    if (!postsTimer) postsTimer = setTimeout(() => { postsTimer = 0; sendPosts(); }, 700);
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; sweep(); });
  }

  // --- glass behind the feed -------------------------------------------------
  function rgba(rgb, a) {
    const m = rgb.match(/[\d.]+/g);
    return m ? `rgba(${m[0]}, ${m[1]}, ${m[2]}, ${a})` : `rgba(0, 0, 0, ${a})`;
  }
  function luma(rgb) {
    const m = rgb.match(/[\d.]+/g);
    return m ? (0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]) / 255 : 0;
  }

  function paintGlass() {
    if (!glass) return;
    const bg = themeBg || 'rgb(0,0,0)';
    veil.style.background = rgba(bg, luma(bg) > 0.5 ? 0.35 : 0.08);
    glass.style.background = rgba(bg, cfg.glass / 100);
    glass.style.backdropFilter = cfg.blur ? `blur(${cfg.blur}px)` : 'none';
    html.style.setProperty('--cathodesky-bg', bg);
    html.style.setProperty('--cathodesky-bar', rgba(bg, Math.max(0.85, cfg.glass / 100)));
  }

  // The feed column: the tallest panel with Bluesky's 600px max width. The
  // terminal lays itself out around it (bars to the right, the picture and
  // text to the left).
  let lastLayout = '';
  function sendLayout(r) {
    const light = luma(themeBg || 'rgb(0,0,0)') > 0.5;
    const l = r ? Math.round(r.left) : -1, w = r ? Math.round(r.width) : 0;
    const s = [l, w, innerWidth, innerHeight, light].join();
    if (s === lastLayout) return;
    lastLayout = s;
    post({ type: 'cathodesky:layout', l, w, vw: innerWidth, vh: innerHeight, light });
  }

  function placeGlass() {
    placeButton();
    checkThread();
    if (!glass) return;
    let best = null, bh = 0;
    for (const el of document.querySelectorAll('[style*="max-width: 600px"]')) {
      const h = el.offsetHeight;
      if (h > bh) { bh = h; best = el; }
    }
    const r = best?.getBoundingClientRect();
    const w = r ? r.width : Math.min(600, html.clientWidth);
    const l = r ? r.left : (html.clientWidth - w) / 2;
    glass.style.left = `${l}px`;
    glass.style.width = `${w}px`;
    sendLayout(r);
  }

  // --- on / off --------------------------------------------------------------
  function start() {
    if (!html.classList.contains('cathodesky-on')) pageBg = getComputedStyle(document.body).backgroundColor;
    html.classList.add('cathodesky-on');
    mountFrame();
    sweep();
    paintGlass();
    placeGlass();
    if (!observer) {
      observer = new MutationObserver(onMutations);
      observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] });
      timer = setInterval(placeGlass, 500);
      addEventListener('keydown', onKey, true);
      addEventListener('focus', onPageFocus);
      addEventListener('message', onFrameMessage);
      addEventListener('resize', placeGlass);
      document.addEventListener('mouseover', onHover, { passive: true });
    }
  }

  function stop() {
    setFull(false);
    observer?.disconnect(); observer = null;
    clearInterval(timer);
    clearTimeout(hoverTimer);
    clearTimeout(postsTimer);
    clearInterval(zoomTimer);
    removeEventListener('keydown', onKey, true);
    removeEventListener('focus', onPageFocus);
    removeEventListener('message', onFrameMessage);
    removeEventListener('resize', placeGlass);
    document.removeEventListener('mouseover', onHover);
    frame?.remove(); veil?.remove(); glass?.remove(); button?.remove();
    frame = veil = glass = button = null;
    ready = false;
    rules?.remove(); rules = null; screens.clear(); checked = new WeakSet();
    document.querySelectorAll('[data-cathodesky-bar]').forEach(el => el.removeAttribute('data-cathodesky-bar'));
    clearTimeout(readyTimer);
    clearTimeout(retryTimer);
    endThread();
    html.classList.remove('cathodesky-on', 'cathodesky-ready');
    themeBg = '';
    lastPosts = lastLayout = pending = shownKey = lastContext = '';
  }

  function apply(changed) {
    if (!cfg.enabled) return stop();
    if (!changed || changed.includes('enabled')) start();
    if (changed?.some(k => CATHODESKY_LIVE.includes(k))) sendCfg();
    paintGlass();
  }

  if (ext) {
    ext.storage.sync.get(CATHODESKY_DEFAULTS).then(c => { cfg = c; apply(); });
    // The popup's Full terminal button.
    ext.runtime.onMessage.addListener((msg, _sender, reply) => {
      if (msg !== 'cathodesky:full') return;
      setFull(cfg.enabled);
      reply(cfg.enabled);
    });
    ext.storage.onChanged.addListener((changes, area) => {
      if (area !== 'sync') return;
      for (const k in changes) cfg[k] = changes[k].newValue;
      apply(Object.keys(changes));
    });
  } else {
    Object.assign(cfg, window.CATHODESKY_TEST_CFG || {});
    apply();
    window.__cathodeskyTest = { stop, setFull, openThread, zoom, nextTab, apply: c => { Object.assign(cfg, c); apply(Object.keys(c)); } };
  }
})();
