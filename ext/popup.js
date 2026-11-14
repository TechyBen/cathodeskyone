const UNITS = { vol: '%', delay: ' s', glow: '%', glass: '%', blur: ' px', fps: ' fps' };

chrome.storage.sync.get(CATHODESKY_DEFAULTS).then(cfg => {
  for (const key of Object.keys(CATHODESKY_DEFAULTS)) {
    const el = document.getElementById(key);
    if (!el) continue;
    const out = document.querySelector(`output[for="${key}"]`);
    const show = () => { if (out) out.textContent = el.value + (UNITS[key] || ''); };
    if (el.type === 'checkbox') {
      el.checked = cfg[key];
      el.addEventListener('change', () => chrome.storage.sync.set({ [key]: el.checked }));
    } else {
      el.value = cfg[key];
      show();
      el.addEventListener('input', show);
      el.addEventListener('input', () => chrome.storage.sync.set({ [key]: +el.value }));
    }
  }
});

// Full terminal: ask the content script in this tab to bring it to the front.
document.getElementById('full').addEventListener('click', async () => {
  const note = document.getElementById('full-note');
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const ok = await chrome.tabs.sendMessage(tab.id, 'cathodesky:full');
    if (ok) window.close();
    else note.textContent = 'Turn on “Terminal behind Bluesky” first.';
  } catch {
    note.textContent = 'Open bsky.app in this tab first.';
  }
});

// The example: the terminal in its own tab with made-up demo posts, no feed or network needed.
document.getElementById('demo').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('term/index.html?demo=1') });
  window.close();
});
