import { makeWebHandler } from '../src/http.ts'
import { AppLive } from '../src/layers.ts'

// Vercel Functions entrypoint: one function serves every route — REST and
// /mcp alike — and the vercel.json rewrite funnels all traffic here.
const { handler } = makeWebHandler(AppLive)

export const GET = handler
export const POST = handler
export const PATCH = handler
export const DELETE = handler
