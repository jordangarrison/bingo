import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto'

const CALLER_COOKIE = 'bingo_caller'
const VIEWER_COOKIE = 'bingo_viewer'
const MAX_ATTEMPTS = 10
const WINDOW_MS = 5 * 60 * 1000
const COOKIE_MAX_AGE_SECONDS = 24 * 60 * 60

const safeEqual = (left, right) => {
  const leftBuf = Buffer.from(left, 'utf8')
  const rightBuf = Buffer.from(right, 'utf8')
  if (leftBuf.length !== rightBuf.length) {
    return false
  }
  return timingSafeEqual(leftBuf, rightBuf)
}

const parseCookies = (cookieHeader) => {
  const result = new Map()
  if (typeof cookieHeader !== 'string' || cookieHeader.length === 0) {
    return result
  }
  for (const part of cookieHeader.split(';')) {
    const eqIndex = part.indexOf('=')
    if (eqIndex > 0) {
      const name = part.slice(0, eqIndex).trim()
      const value = part.slice(eqIndex + 1).trim()
      result.set(name, value)
    }
  }
  return result
}

const isHttpsRequest = (req) => {
  const proto = req.headers['x-forwarded-proto']
  return proto === 'https' || Boolean(req.socket?.encrypted)
}

const formatCookie = (name, value, maxAgeSeconds, secure) => {
  const parts = [`${name}=${value}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAgeSeconds}`]
  if (secure) {
    parts.push('Secure')
  }
  return parts.join('; ')
}

export const createAuthManager = (options = {}) => {
  const envPin = (options.callerPin ?? process.env.BINGO_CALLER_PIN ?? '').trim()
  const generatedPin = envPin.length === 0
  const callerPin = generatedPin ? String(randomInt(100_000, 999_999)) : envPin
  const inviteCode = (options.inviteCode ?? process.env.BINGO_INVITE_CODE ?? '').trim()
  const inviteRequired = inviteCode.length > 0
  const secret = (options.sessionSecret ?? process.env.BINGO_SESSION_SECRET ?? '').trim() || randomBytes(32).toString('hex')

  const attempts = new Map()

  const signToken = (role) => {
    const sig = createHmac('sha256', secret).update(`bingo:${role}:v1`).digest('hex')
    return `${role}.${sig}`
  }

  const verifyCookie = (req, cookieName, role) => {
    const cookies = parseCookies(req.headers.cookie)
    const token = cookies.get(cookieName)
    if (typeof token !== 'string' || token.length === 0) {
      return false
    }
    return safeEqual(token, signToken(role))
  }

  const isCaller = (req) => verifyCookie(req, CALLER_COOKIE, 'caller')

  const isViewer = (req) => !inviteRequired || isCaller(req) || verifyCookie(req, VIEWER_COOKIE, 'viewer')

  const clientKey = (req) => {
    const forwarded = req.headers['x-forwarded-for']
    if (typeof forwarded === 'string' && forwarded.length > 0) {
      return forwarded.split(',')[0].trim()
    }
    return req.socket?.remoteAddress ?? 'local'
  }

  const checkRateLimit = (req) => {
    const key = clientKey(req)
    const now = Date.now()
    const entry = attempts.get(key)
    if (!entry || now - entry.windowStart > WINDOW_MS) {
      return { allowed: true }
    }
    return { allowed: entry.count < MAX_ATTEMPTS }
  }

  const recordFailure = (req) => {
    const key = clientKey(req)
    const now = Date.now()
    const entry = attempts.get(key)
    if (!entry || now - entry.windowStart > WINDOW_MS) {
      attempts.set(key, { count: 1, windowStart: now })
      return
    }
    attempts.set(key, { count: entry.count + 1, windowStart: entry.windowStart })
  }

  const clearFailures = (req) => {
    attempts.delete(clientKey(req))
  }

  const verifyCallerPin = (req, candidate) => {
    const limit = checkRateLimit(req)
    if (!limit.allowed) {
      return { ok: false, status: 429, error: 'Too many attempts. Try again in a few minutes.' }
    }
    if (typeof candidate !== 'string' || !safeEqual(candidate.trim(), callerPin)) {
      recordFailure(req)
      return { ok: false, status: 401, error: 'Incorrect caller PIN.' }
    }
    clearFailures(req)
    return {
      ok: true,
      cookie: formatCookie(CALLER_COOKIE, signToken('caller'), COOKIE_MAX_AGE_SECONDS, isHttpsRequest(req)),
    }
  }

  const verifyInviteCode = (req, candidate) => {
    if (!inviteRequired) {
      return { ok: true, cookie: '' }
    }
    const limit = checkRateLimit(req)
    if (!limit.allowed) {
      return { ok: false, status: 429, error: 'Too many attempts. Try again in a few minutes.' }
    }
    if (typeof candidate !== 'string' || !safeEqual(candidate.trim(), inviteCode)) {
      recordFailure(req)
      return { ok: false, status: 401, error: 'Incorrect room code.' }
    }
    clearFailures(req)
    return {
      ok: true,
      cookie: formatCookie(VIEWER_COOKIE, signToken('viewer'), COOKIE_MAX_AGE_SECONDS, isHttpsRequest(req)),
    }
  }

  const clearCallerCookie = (req) => formatCookie(CALLER_COOKIE, '', 0, isHttpsRequest(req))

  const statusFor = (req) => ({
    callerAuthenticated: isCaller(req),
    viewerAuthenticated: isViewer(req),
    inviteRequired,
  })

  return {
    callerPin,
    generatedPin,
    inviteRequired,
    isCaller,
    isViewer,
    verifyCallerPin,
    verifyInviteCode,
    clearCallerCookie,
    statusFor,
  }
}
