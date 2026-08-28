// Мини-сервер для раздачи собранного приложения из папки dist.
// Слушает на 0.0.0.0, чтобы телефон в той же Wi-Fi сети мог открыть Life OS.
// Порт: переменная окружения PORT или 8080.
import http from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('./dist/', import.meta.url))
const port = Number(process.env.PORT) || 8080

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
}

http
  .createServer(async (req, res) => {
    try {
      let p = decodeURIComponent((req.url || '/').split('?')[0])
      if (p === '/') p = '/index.html'
      const file = normalize(join(root, p))
      if (!file.startsWith(normalize(root))) {
        res.writeHead(403)
        res.end('Forbidden')
        return
      }
      const data = await readFile(file)
      res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream' })
      res.end(data)
    } catch {
      res.writeHead(404)
      res.end('Not found')
    }
  })
  .listen(port, '0.0.0.0', () => {
    console.log('Life OS запущен: http://localhost:' + port)
    console.log('С телефона (та же Wi-Fi): http://<IP-компьютера>:' + port)
  })