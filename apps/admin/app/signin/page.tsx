import { signIn } from '../../auth.ts'

/**
 * `callbackUrl` arrives from the proxy redirect and is attacker-supplied, so
 * only a same-site path is honoured. Auth.js also refuses cross-origin
 * redirects, but the cheaper check is the one that is obviously right.
 */
const safePath = (value = '/'): string =>
  value.startsWith('/') && !value.startsWith('//') ? value : '/'

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>
}) {
  const { callbackUrl } = await searchParams
  const redirectTo = safePath(callbackUrl)

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">
        doubleblind admin
      </h1>
      <p className="text-neutral-600 dark:text-neutral-400">
        Sign in with a <code>smitten.fun</code> or <code>smitten.co</code>{' '}
        account.
      </p>
      <form
        action={async () => {
          'use server'
          await signIn('google', { redirectTo })
        }}
      >
        <button
          type="submit"
          className="w-full rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
        >
          Continue with Google
        </button>
      </form>
    </main>
  )
}
