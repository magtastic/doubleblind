import type { WebHandler } from './app-handler.ts'

/**
 * A minimal MCP client over the web handler: enough to initialize a session
 * and call a tool with whatever bearer token the test wants, which is the
 * whole point — one session, many tokens.
 */

export type ToolResult = {
  readonly error?: unknown
  readonly result: {
    readonly isError?: boolean
    readonly structuredContent?: unknown
  }
}

export type RpcOptions = {
  /** Session id from `initialize`. */
  readonly session?: string | null
  /** `undefined` sends no Authorization header, like an agent with no token. */
  readonly token?: string | undefined
}

/** Streamable HTTP responses may arrive as JSON or as a single SSE event. */
export const readRpc = async (res: Response): Promise<unknown> => {
  const text = await res.text()
  const data = text
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trim())
  return JSON.parse(data.length > 0 ? data.join('') : text)
}

let nextId = 1

export const rpc = (
  handler: WebHandler,
  body: Record<string, unknown>,
  options: RpcOptions = {}
): Promise<Response> =>
  handler(
    new Request('http://localhost/mcp', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        ...(options.session ? { 'mcp-session-id': options.session } : {}),
        ...(options.token === undefined
          ? {}
          : { authorization: `Bearer ${options.token}` }),
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: nextId++, ...body }),
    })
  )

/** Runs the initialize handshake and returns the session id for later calls. */
export const initialize = async (
  handler: WebHandler
): Promise<string | null> => {
  const res = await rpc(handler, {
    method: 'initialize',
    params: {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'test', version: '0' },
    },
  })
  return res.headers.get('mcp-session-id')
}

export const callTool = async (
  handler: WebHandler,
  name: string,
  args: Record<string, unknown>,
  options: RpcOptions = {}
): Promise<ToolResult> => {
  const res = await rpc(
    handler,
    { method: 'tools/call', params: { name, arguments: args } },
    options
  )
  return (await readRpc(res)) as ToolResult
}
