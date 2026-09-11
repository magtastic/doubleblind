/**
 * Auth.js's error page. It is reachable without a session on purpose: a
 * rejected domain has none and never will, so sending it to sign-in instead
 * would loop.
 */
export default async function DeniedPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams
  const denied = error === 'AccessDenied'

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">
        {denied ? 'Not authorised' : 'Sign-in failed'}
      </h1>
      <p className="text-neutral-600 dark:text-neutral-400">
        {denied
          ? 'This console is limited to verified smitten.fun and smitten.co accounts. Signing in with another account will not work.'
          : 'Something went wrong during sign-in. Try again, and tell whoever runs this if it keeps happening.'}
      </p>
      {error !== undefined && (
        <p className="text-sm text-neutral-500 dark:text-neutral-500">
          Reason: <code>{error}</code>
        </p>
      )}
      <a
        href="/signin"
        className="text-sm underline underline-offset-4 hover:no-underline"
      >
        Back to sign-in
      </a>
    </main>
  )
}
