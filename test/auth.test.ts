import { describe, expect, it } from 'vitest'

import { createAuthManager } from '../server/auth.mjs'

const fakeRequest = (cookie = '', remoteAddress = '127.0.0.1') => ({
  headers: cookie.length > 0 ? { cookie } : {},
  socket: { remoteAddress, encrypted: false },
})

describe('server auth manager', () => {
  it('verifies Caller PIN and issues a signed HttpOnly cookie', () => {
    const auth = createAuthManager({ callerPin: '2468', sessionSecret: 'test-secret' })
    const anonReq = fakeRequest()
    expect(auth.isCaller(anonReq)).toBe(false)
    expect(auth.isViewer(anonReq)).toBe(true)

    const wrong = auth.verifyCallerPin(anonReq, '0000')
    expect(wrong.ok).toBe(false)

    const right = auth.verifyCallerPin(anonReq, '2468')
    expect(right.ok).toBe(true)
    const cookieHeader = right.ok ? right.cookie : ''
    const cookiePair = cookieHeader.split(';')[0] ?? ''

    expect(auth.isCaller(fakeRequest(cookiePair))).toBe(true)
    expect(auth.isCaller(fakeRequest('bingo_caller=caller.tampered'))).toBe(false)
  })

  it('gates viewer access when inviteCode is configured', () => {
    const auth = createAuthManager({
      callerPin: '2468',
      inviteCode: 'turkey26',
      sessionSecret: 'test-secret',
    })
    const anonReq = fakeRequest()
    expect(auth.inviteRequired).toBe(true)
    expect(auth.isViewer(anonReq)).toBe(false)

    const right = auth.verifyInviteCode(anonReq, 'turkey26')
    expect(right.ok).toBe(true)
    const cookieHeader = right.ok ? right.cookie : ''
    const cookiePair = cookieHeader.split(';')[0] ?? ''

    expect(auth.isViewer(fakeRequest(cookiePair))).toBe(true)
    expect(auth.isCaller(fakeRequest(cookiePair))).toBe(false)
  })

  it('rate limits repeated failed PIN attempts per IP', () => {
    const auth = createAuthManager({ callerPin: '9999', sessionSecret: 'test-secret' })
    const attacker = fakeRequest('', '203.0.113.10')

    const results = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(() => auth.verifyCallerPin(attacker, '1111'))
    const tenth = results.at(9)
    const eleventh = results.at(10)
    expect(tenth !== undefined && !tenth.ok ? tenth.status : 0).toBe(401)
    expect(eleventh !== undefined && !eleventh.ok ? eleventh.status : 0).toBe(429)
  })
})
