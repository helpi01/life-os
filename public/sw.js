// Простой сервис-воркер: приложение целиком работает в браузере (localStorage),
// поэтому после первого открытия оно доступно даже без интернета.
const CACHE = 'life-os-v3'

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(['./', './index.html']))
  )
  self.skipWaiting()
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  // Для самой страницы — сначала сеть: всегда свежая версия, кэш лишь на случай офлайна
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put(req, copy))
          return res
        })
        .catch(() => caches.match(req).then((cached) => cached || caches.match('./')))
    )
    return
  }
  // Остальное (иконки, манифест) — из кэша, иначе из сети
  e.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached
      return fetch(req).then((res) => {
        const copy = res.clone()
        caches.open(CACHE).then((c) => c.put(req, copy))
        return res
      })
    })
  )
})