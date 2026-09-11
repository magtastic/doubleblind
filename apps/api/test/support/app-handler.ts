import type { Layer } from 'effect'
import type { Caller } from '../../src/caller.ts'
import { makeWebHandler } from '../../src/http.ts'
import type { Doubleblind } from '../../src/service.ts'

export type WebHandler = (request: Request) => Promise<Response>

/**
 * Each test builds its own handler over its own fake, so the fakes stay
 * one-line and nothing leaks between tests. Every runtime opened here is
 * remembered so the file can release them all afterwards.
 */
const opened: Array<() => Promise<void>> = []

export const openHandler = <E>(
  appLayer: Layer.Layer<Doubleblind | Caller, E>
): WebHandler => {
  const { handler, dispose } = makeWebHandler(appLayer)
  opened.push(dispose)
  return handler
}

export const disposeHandlers = async (): Promise<void> => {
  await Promise.all(opened.splice(0).map((dispose) => dispose()))
}
