/** The only owner/session fields exposed to the browser. */
export interface MeResponse {
  readonly owner: {
    readonly id: string
    readonly name: string
    readonly email: string
    readonly emailVerified: true
  }
  readonly session: {
    readonly createdAt: string
    readonly expiresAt: string
    readonly freshUntil: string
  }
}
