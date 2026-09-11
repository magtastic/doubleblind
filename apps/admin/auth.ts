import type { Profile } from 'next-auth'
import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'

/**
 * PRODUCT.md, Stack: the admin is "behind Google OAuth restricted to
 * `@smitten.fun` and `@smitten.co`".
 */
const ALLOWED_DOMAINS: ReadonlySet<string> = new Set([
  'smitten.fun',
  'smitten.co',
])

/**
 * The security boundary. Google's `hd` authorization parameter is a hint the
 * client controls, so it decides nothing; this runs on the token Google signed
 * and is the only thing that grants a session.
 *
 * An unverified address is rejected outright: without `email_verified` the
 * domain says nothing about who owns the mailbox.
 */
const isAllowed = (profile: Profile | undefined): boolean => {
  if (profile?.email_verified !== true) return false
  const email = profile.email
  if (typeof email !== 'string') return false
  const at = email.lastIndexOf('@')
  return at !== -1 && ALLOWED_DOMAINS.has(email.slice(at + 1).toLowerCase())
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  /** Vercel terminates TLS upstream, so the forwarded host is authoritative. */
  trustHost: true,
  /** No adapter: the console stores nothing about who looked at it. */
  session: { strategy: 'jwt' },
  providers: [
    Google({
      authorization: {
        params: {
          /**
           * A hint only, so the account chooser hides personal accounts.
           * `*` rather than a domain because there are two allowed domains
           * and Google accepts one value; `signIn` below does the deciding.
           */
          hd: '*',
          prompt: 'select_account',
        },
      },
    }),
  ],
  pages: { signIn: '/signin', error: '/denied' },
  callbacks: {
    signIn: ({ account, profile }) =>
      account?.provider === 'google' && isAllowed(profile),
  },
})
