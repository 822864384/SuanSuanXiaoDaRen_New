/**
 * 本地静态服务器：托管 H5 产物，用于浏览器验收（读题文案 + 音效 + 版式）
 *
 * 前提：先执行 `D:\uni_app_Tool\HBuilderX\cli.exe publish web --project <项目绝对路径>`
 * 用法：node tests/serve-web.mjs [端口]
 */
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..', 'unpackage', 'dist', 'build', 'web')
const port = Number(process.argv[2] || 5174)

if (!fs.existsSync(path.join(root, 'index.html'))) {
  console.error('找不到 H5 产物：' + root)
  console.error('请先运行：cli.exe publish web --project <项目绝对路径>')
  process.exit(1)
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

http
  .createServer((req, res) => {
    const url = decodeURIComponent((req.url || '/').split('?')[0])
    let file = path.join(root, url === '/' ? 'index.html' : url)
    // 防目录穿越
    if (!file.startsWith(root)) {
      res.writeHead(403).end('forbidden')
      return
    }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
      file = path.join(file, 'index.html')
    }
    if (!fs.existsSync(file)) {
      // hash 路由下理论上不会走到这里；兜底回首页
      file = path.join(root, 'index.html')
    }
    const ext = path.extname(file).toLowerCase()
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' })
    fs.createReadStream(file).pipe(res)
  })
  .listen(port, '127.0.0.1', () => {
    console.log('H5 预览：http://localhost:' + port)
    console.log('目录：' + root)
  })
