import { handler } from '../src/http.ts'

// Vercel Functions entrypoint: one function serves every route — REST and
// /mcp alike — and the vercel.json rewrite funnels all traffic here.
export const GET = handler
export const POST = handler
export const PATCH = handler
export const DELETE = handler
