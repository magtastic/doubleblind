// The Vercel Function. Vercel discovers functions by scanning the committed
// source tree before the build runs, so this file is checked in while the
// bundle it re-exports — dist/entry.js, written by `bun run build` — is not.
// It has to be plain JavaScript: Vercel's Node builder compiles whatever it
// finds here itself, and it cannot compile this workspace's TypeScript.
export { DELETE, GET, PATCH, POST } from '../dist/entry.js'
