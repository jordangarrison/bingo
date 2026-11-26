export interface AuthRequest {
  readonly headers: {
    readonly cookie?: string
    readonly 'x-forwarded-for'?: string
    readonly 'x-forwarded-proto'?: string
  }
  readonly socket?: {
    readonly remoteAddress?: string
    readonly encrypted?: boolean
  }
}

export interface AuthManagerOptions {
  readonly callerPin?: string
  readonly inviteCode?: string
  readonly sessionSecret?: string
}

export interface VerifySuccess {
  readonly ok: true
  readonly cookie: string
}

export interface VerifyFailure {
  readonly ok: false
  readonly status: number
  readonly error: string
}

export type VerifyResult = VerifySuccess | VerifyFailure

export interface AuthStatusPayload {
  readonly callerAuthenticated: boolean
  readonly viewerAuthenticated: boolean
  readonly inviteRequired: boolean
}

export interface AuthManager {
  readonly callerPin: string
  readonly generatedPin: boolean
  readonly inviteRequired: boolean
  readonly isCaller: (req: AuthRequest) => boolean
  readonly isViewer: (req: AuthRequest) => boolean
  readonly verifyCallerPin: (req: AuthRequest, candidate: string) => VerifyResult
  readonly verifyInviteCode: (req: AuthRequest, candidate: string) => VerifyResult
  readonly clearCallerCookie: (req: AuthRequest) => string
  readonly statusFor: (req: AuthRequest) => AuthStatusPayload
}

export function createAuthManager(options?: AuthManagerOptions): AuthManager
