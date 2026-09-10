export default function Page() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-6 px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">
        doubleblind admin
      </h1>
      <p className="text-neutral-600 dark:text-neutral-400">
        Operations console. Nothing is wired up yet.
      </p>
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
        <p className="font-medium">TODO: authentication</p>
        <p className="mt-1">
          This route is unprotected. Wire NextAuth v5 with the Google provider
          and restrict sign-in to the <code>smitten.fun</code> and{' '}
          <code>smitten.co</code> hosted domains before deploying anything real
          here.
        </p>
      </div>
    </main>
  )
}
