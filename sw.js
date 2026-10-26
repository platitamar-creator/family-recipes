// Service worker: האתר נפתח מהר כמו אפליקציה, וגם בלי רשת מוצגת לפחות המעטפת.
// קבצי האתר: קודם רשת (כדי לקבל תמיד את הגרסה העדכנית), ואם אין רשת – מהמטמון.
// תמונות מתכונים: מהמטמון (הכתובת של כל תמונה ייחודית ולא משתנה).
// נתונים מ-Supabase לא נשמרים במטמון.
const VERSION = 'v3';
const SHELL = `shell-${VERSION}`;
const IMAGES = 'recipe-images';
const SHELL_FILES = [
  './', 'index.html', 'css/app.css', 'manifest.webmanifest', 'icons/icon-192.png', 'img/doodles.svg',
  'js/app.js', 'js/api.js', 'js/config.js', 'js/images.js', 'js/quotes.js', 'js/store.js', 'js/ui.js', 'js/install.js', 'js/decor.js',
  'js/views/common.js', 'js/views/editor.js', 'js/views/home.js', 'js/views/house.js', 'js/views/join.js',
  'js/views/recipe.js', 'js/views/settings.js', 'js/views/tags.js', 'js/views/timeline.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('shell-') && k !== SHELL).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function networkFirst(req) {
  const cache = await caches.open(SHELL);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    return (await cache.match(req, { ignoreSearch: true })) || (await cache.match('index.html'));
  }
}

async function cacheFirst(req, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
  return res;
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) return e.respondWith(networkFirst(req));
  if (url.pathname.includes('/storage/v1/object/public/')) return e.respondWith(cacheFirst(req, IMAGES));
  if (url.hostname.endsWith('fonts.googleapis.com') || url.hostname.endsWith('fonts.gstatic.com')) {
    return e.respondWith(cacheFirst(req, 'fonts'));
  }
});
