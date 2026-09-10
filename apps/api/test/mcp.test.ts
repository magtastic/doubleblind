import { describe, expect, test } from 'bun:test'
import { handler } from '../src/http.ts'

const TOOLS = [
  'doubleblind_publish',
  'doubleblind_candidates',
  'doubleblind_interest',
  'doubleblind_propose',
  'doubleblind_confirm',
  'doubleblind_setups',
  'doubleblind_delete',
]

/** Streamable HTTP responses may arrive as JSON or as a single SSE event. */
const readRpc = async (res: Response): Promise<unknown> => {
  const text = await res.text()
  const data = text
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trim())
  return JSON.parse(data.length > 0 ? data.join('') : text)
}

const rpc = (body: unknown, session?: string | null) =>
  handler(
    new Request('http://localhost/mcp', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        ...(session ? { 'mcp-session-id': session } : {}),
      },
      body: JSON.stringify(body),
    })
  )

describe('MCP /mcp', () => {
  test('lists the seven doubleblind tools', async () => {
    const init = await rpc({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'test', version: '0' },
      },
    })
    expect(init.status).toBe(200)
    const session = init.headers.get('mcp-session-id')

    const res = await rpc(
      { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
      session
    )
    expect(res.status).toBe(200)
    const json = (await readRpc(res)) as {
      result: { tools: { name: string }[] }
    }
    expect(json.result.tools.map((t) => t.name).sort()).toEqual(
      [...TOOLS].sort()
    )
  })
})
