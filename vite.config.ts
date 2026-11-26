import { foldkit } from '@foldkit/vite-plugin'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

import { createAuthManager } from './server/auth.mjs'
import { createGameStore } from './server/store.mjs'

const MAX_BODY_BYTES = 16 * 1024

const readJsonBody = (req) =>
  new Promise((resolve, reject) => {
    const chunks = []
    let totalBytes = 0
    req.on('data', (chunk) => {
      totalBytes += chunk.length
      if (totalBytes > MAX_BODY_BYTES) {
        reject(new Error('Body too large'))
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch (error) {
        reject(error)
      }
    })
    req.on('error', reject)
  })

const sendJson = (res, statusCode, payload) => {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(payload))
}

const bingoSqlitePlugin = () => {
  const store = createGameStore('bingo.db')
  const auth = createAuthManager()
  let printedBanner = false

  const logAuthBanner = () => {
    if (printedBanner) {
      return
    }
    printedBanner = true
    const pinSource = auth.generatedPin ? 'auto-generated (set BINGO_CALLER_PIN to customize)' : 'from BINGO_CALLER_PIN'
    console.log(`\n[bingo-auth] Caller PIN: ${auth.callerPin} (${pinSource})`)
    console.log(
      auth.inviteRequired
        ? '[bingo-auth] Room invite code: enabled (from BINGO_INVITE_CODE — share /?join=<code>)'
        : '[bingo-auth] Room invite code: off (read-only Live Board is open; set BINGO_INVITE_CODE to gate viewing)\n',
    )
  }

  const attachMiddleware = (middlewares) => {
    logAuthBanner()

    middlewares.use((req, res, next) => {
      if (req.method === 'GET' && typeof req.url === 'string' && req.url.startsWith('/?')) {
        const url = new URL(req.url, 'http://localhost')
        const joinCode = url.searchParams.get('join')
        if (joinCode !== null) {
          const check = auth.verifyInviteCode(req, joinCode)
          if (check.ok && check.cookie.length > 0) {
            res.setHeader('Set-Cookie', check.cookie)
          }
          res.statusCode = 302
          res.setHeader('Location', '/')
          res.end()
          return
        }
      }
      next()
    })

    middlewares.use('/api/auth/status', (req, res, next) => {
      if (req.method === 'GET') {
        sendJson(res, 200, auth.statusFor(req))
        return
      }
      next()
    })

    middlewares.use('/api/auth/caller', async (req, res, next) => {
      if (req.method !== 'POST') {
        next()
        return
      }
      try {
        const body = await readJsonBody(req)
        const result = auth.verifyCallerPin(req, body?.pin)
        if (!result.ok) {
          sendJson(res, result.status, { error: result.error })
          return
        }
        res.setHeader('Set-Cookie', result.cookie)
        sendJson(res, 200, { callerAuthenticated: true, viewerAuthenticated: true, inviteRequired: auth.inviteRequired })
      } catch {
        sendJson(res, 400, { error: 'Invalid request' })
      }
    })

    middlewares.use('/api/auth/join', async (req, res, next) => {
      if (req.method !== 'POST') {
        next()
        return
      }
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
    })

    middlewares.use('/api/auth/logout', (req, res, next) => {
      if (req.method !== 'POST') {
        next()
        return
      }
      res.setHeader('Set-Cookie', auth.clearCallerCookie(req))
      sendJson(res, 200, {
        callerAuthenticated: false,
        viewerAuthenticated: auth.isViewer(req),
        inviteRequired: auth.inviteRequired,
      })
    })

    middlewares.use('/api/events', (req, res) => {
      if (!auth.isViewer(req)) {
        sendJson(res, 401, { error: 'Room code required' })
        return
      }
      store.subscribe(res)
    })

    middlewares.use('/api/game', async (req, res, next) => {
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
      next()
    })
  }

  return {
    name: 'bingo-sqlite-api',
    configureServer(server) {
      attachMiddleware(server.middlewares)
    },
    configurePreviewServer(server) {
      attachMiddleware(server.middlewares)
    },
  }
}

export default defineConfig({
  plugins: [tailwindcss(), foldkit(), bingoSqlitePlugin()],
  server: {
    host: true,
    port: 5173,
    allowedHosts: true,
  },
  preview: {
    host: true,
    port: 4173,
    allowedHosts: true,
  },
})
