import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize, resolve } from 'node:path'

import { createAuthManager } from './auth.mjs'
import { createGameStore } from './store.mjs'

const MAX_BODY_BYTES = 16 * 1024

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
}

const readJsonBody = (req) =>
  new Promise((resolveBody, rejectBody) => {
    const chunks = []
    let totalBytes = 0
    req.on('data', (chunk) => {
      totalBytes += chunk.length
      if (totalBytes > MAX_BODY_BYTES) {
        rejectBody(new Error('Body too large'))
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      try {
        resolveBody(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch (error) {
        rejectBody(error)
      }
    })
    req.on('error', rejectBody)
  })

const sendJson = (res, statusCode, payload) => {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(payload))
}

const distDir = resolve(process.env.BINGO_DIST_DIR ?? join(import.meta.dirname, '..', 'dist'))
const dbPath = process.env.BINGO_DB_PATH ?? 'bingo.db'
const host = process.env.HOST ?? '127.0.0.1'
const port = Number(process.env.PORT ?? 4173)

const store = createGameStore(dbPath)
const auth = createAuthManager()

const serveStaticFile = (res, filePath, isImmutableAsset) => {
  const ext = extname(filePath).toLowerCase()
  res.statusCode = 200
  res.setHeader('Content-Type', MIME_TYPES[ext] ?? 'application/octet-stream')
  res.setHeader('Cache-Control', isImmutableAsset ? 'public, max-age=31536000, immutable' : 'no-cache')
  createReadStream(filePath).pipe(res)
}

const server = createServer(async (req, res) => {
  const rawUrl = req.url ?? '/'
  const url = new URL(rawUrl, 'http://localhost')
  const pathname = url.pathname

  if (req.method === 'GET' && pathname === '/' && url.searchParams.has('join')) {
    const joinCode = url.searchParams.get('join') ?? ''
    const check = auth.verifyInviteCode(req, joinCode)
    if (check.ok && check.cookie.length > 0) {
      res.setHeader('Set-Cookie', check.cookie)
    }
    res.statusCode = 302
    res.setHeader('Location', '/')
    res.end()
    return
  }

  if (pathname === '/api/auth/status' && req.method === 'GET') {
    sendJson(res, 200, auth.statusFor(req))
    return
  }

  if (pathname === '/api/auth/caller' && req.method === 'POST') {
    try {
      const body = await readJsonBody(req)
      const result = auth.verifyCallerPin(req, body?.pin)
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error })
        return
      }
      res.setHeader('Set-Cookie', result.cookie)
      sendJson(res, 200, {
        callerAuthenticated: true,
        viewerAuthenticated: true,
        inviteRequired: auth.inviteRequired,
      })
    } catch {
      sendJson(res, 400, { error: 'Invalid request' })
    }
    return
  }

  if (pathname === '/api/auth/join' && req.method === 'POST') {
    try {
      const body = await readJsonBody(req)
      const result = auth.verifyInviteCode(req, body?.code)
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error })
        return
      }
      if (result.cookie.length > 0) {
        res.setHeader('Set-Cookie', result.cookie)
      }
      sendJson(res, 200, {
        callerAuthenticated: auth.isCaller(req),
        viewerAuthenticated: true,
        inviteRequired: auth.inviteRequired,
      })
    } catch {
      sendJson(res, 400, { error: 'Invalid request' })
    }
    return
  }

  if (pathname === '/api/auth/logout' && req.method === 'POST') {
    res.setHeader('Set-Cookie', auth.clearCallerCookie(req))
    sendJson(res, 200, {
      callerAuthenticated: false,
      viewerAuthenticated: auth.isViewer(req),
      inviteRequired: auth.inviteRequired,
    })
    return
  }

  if (pathname === '/api/events' && req.method === 'GET') {
    if (!auth.isViewer(req)) {
      sendJson(res, 401, { error: 'Room code required' })
      return
    }
    store.subscribe(res)
    return
  }

  if (pathname === '/api/game') {
    if (req.method === 'GET') {
      if (!auth.isViewer(req)) {
        sendJson(res, 401, { error: 'Room code required' })
        return
      }
      sendJson(res, 200, store.read())
      return
    }
    if (req.method === 'PUT') {
      if (!auth.isCaller(req)) {
        sendJson(res, 401, { error: 'Caller PIN required' })
        return
      }
      try {
        const body = await readJsonBody(req)
        const saved = store.write(body)
        sendJson(res, 200, saved)
      } catch {
        sendJson(res, 400, { error: 'Invalid JSON payload' })
      }
      return
    }
  }

  if (req.method === 'GET' || req.method === 'HEAD') {
    const safeRelative = normalize(pathname).replace(/^(\.\.(\/|\\|$))+/, '')
    const candidate = resolve(distDir, safeRelative.replace(/^\/+/, ''))
    if (candidate.startsWith(distDir) && existsSync(candidate) && statSync(candidate).isFile()) {
      serveStaticFile(res, candidate, pathname.startsWith('/assets/'))
      return
    }
    const indexPath = join(distDir, 'index.html')
    if (existsSync(indexPath)) {
      serveStaticFile(res, indexPath, false)
      return
    }
  }

  sendJson(res, 404, { error: 'Not found' })
})

const shutdown = () => {
  server.close(() => {
    store.close()
    process.exit(0)
  })
}

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)

server.listen(port, host, () => {
  const pinSource = auth.generatedPin ? 'auto-generated (set BINGO_CALLER_PIN to customize)' : 'from BINGO_CALLER_PIN'
  console.log(`[bingo] listening on http://${host}:${port} (db: ${dbPath})`)
  console.log(`[bingo-auth] Caller PIN: ${auth.callerPin} (${pinSource})`)
  console.log(
    auth.inviteRequired
      ? '[bingo-auth] Room invite code: enabled (share /?join=<code>)'
      : '[bingo-auth] Room invite code: off (read-only Live Board is open)',
  )
})
