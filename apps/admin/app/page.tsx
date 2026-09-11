import { auth, signOut } from '../auth.ts'
import {
  type AdminEvent,
  type Dashboard,
  loadDashboard,
  type SetupCount,
} from '../lib/dashboard.ts'

/** Every read is per-request, and `next build` runs without a database. */
export const dynamic = 'force-dynamic'

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-neutral-200 px-4 py-3 dark:border-neutral-800">
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      <div className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
        {label}
      </div>
    </div>
  )
}

function Profiles({ counts }: { counts: Dashboard['profiles'] }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-medium text-neutral-500 dark:text-neutral-500">
        Profiles
      </h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="live" value={counts.live} />
        <Stat label="expiring in 7d" value={counts.expiringSoon} />
        <Stat label="expired" value={counts.expired} />
        <Stat label="total rows" value={counts.total} />
      </div>
    </section>
  )
}

function Setups({ counts }: { counts: ReadonlyArray<SetupCount> }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-medium text-neutral-500 dark:text-neutral-500">
        Setups by status
      </h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {counts.map((entry) => (
          <Stat
            key={entry.status}
            label={entry.status.replace('_', ' ')}
            value={entry.count}
          />
        ))}
      </div>
    </section>
  )
}

function Events({ events }: { events: ReadonlyArray<AdminEvent> }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-medium text-neutral-500 dark:text-neutral-500">
        Recent events
      </h2>
      {events.length === 0 ? (
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Nothing recorded yet.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-neutral-200 text-neutral-500 dark:border-neutral-800 dark:text-neutral-500">
              <tr>
                <th className="px-4 py-2 font-medium">time</th>
                <th className="px-4 py-2 font-medium">kind</th>
                <th className="px-4 py-2 font-medium">profile</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr
                  key={event.id}
                  className="border-t border-neutral-100 dark:border-neutral-900"
                >
                  <td className="whitespace-nowrap px-4 py-2 tabular-nums text-neutral-600 dark:text-neutral-400">
                    {event.createdAt}
                  </td>
                  <td className="px-4 py-2">
                    <code>{event.kind}</code>
                  </td>
                  <td className="px-4 py-2 text-neutral-600 dark:text-neutral-400">
                    <code>{event.profileId ?? '—'}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

export default async function Page() {
  const [session, result] = await Promise.all([auth(), loadDashboard()])

  return (
    <main className="mx-auto flex min-h-dvh max-w-4xl flex-col gap-10 px-6 py-12">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">
          doubleblind admin
        </h1>
        <div className="flex items-baseline gap-3 text-sm text-neutral-600 dark:text-neutral-400">
          <span>{session?.user?.email}</span>
          <form
            action={async () => {
              'use server'
              await signOut({ redirectTo: '/signin' })
            }}
          >
            <button
              type="submit"
              className="underline underline-offset-4 hover:no-underline"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>

      {result._tag === 'Unavailable' ? (
        <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          <p className="font-medium">The database is not answering</p>
          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-xs">
            {result.reason}
          </pre>
        </div>
      ) : (
        <>
          <Profiles counts={result.dashboard.profiles} />
          <Setups counts={result.dashboard.setups} />
          <Events events={result.dashboard.events} />
        </>
      )}
    </main>
  )
}
