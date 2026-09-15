import { makeWebHandler } from './http.ts'
import { AppLive } from './layers.ts'

// Vercel Functions entrypoint: one function serves every route — REST and
// /mcp alike — and the vercel.json rewrite funnels all traffic here. The
// build bundles this module to plain JS at dist/entry.js, which api/index.js
// re-exports, because Vercel's Node builder cannot compile this workspace's
// TypeScript itself: the source uses .ts import specifiers and depends on
// unbuilt workspace packages outside the project's root directory.
const { handler } = makeWebHandler(AppLive)

export const GET = handler
export const POST = handler
export const PATCH = handler
export const DELETE = handler
