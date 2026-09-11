import { NextResponse } from 'next/server'
import { auth } from './auth.ts'

/**
 * The only routes reachable without a session. Sign-in obviously has to be,
 * and so does the error page: a rejected domain never gets a session, so
 * redirecting it to sign-in would bounce it straight back here forever.
 */
const PUBLIC_PATHS: ReadonlySet<string> = new Set(['/signin', '/denied'])

export default auth((request) => {
  if (request.auth !== null) return undefined
  if (PUBLIC_PATHS.has(request.nextUrl.pathname)) return undefined

  const signIn = new URL('/signin', request.nextUrl)
  signIn.searchParams.set(
    'callbackUrl',
    `${request.nextUrl.pathname}${request.nextUrl.search}`
  )
  return NextResponse.redirect(signIn)
})

/**
 * Everything, including `/`. Auth.js's own routes are excluded because the
 * sign-in handshake runs through them while there is no session yet.
 */
export const config = {
  matcher: ['/((?!api/auth|_next/static|_next/image|favicon.ico).*)'],
}
