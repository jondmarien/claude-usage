import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseTranscripts, listTranscriptFiles, buildLocalUsageSnapshot } from '../../src/local/transcripts.js'

describe('transcript parser', () => {
  let root: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'claude-usage-transcripts-'))
    mkdirSync(join(root, 'proj'), { recursive: true })
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('aggregates assistant usage and dedupes identical message/request ids', () => {
    const file = join(root, 'proj', 'session.jsonl')
    writeFileSync(file, [
      JSON.stringify({
        type: 'assistant',
        uuid: 'm1',
        requestId: 'r1',
        message: { id: 'm1', model: 'claude-sonnet-4-5', usage: { input_tokens: 10, output_tokens: 2 } }
      }),
      JSON.stringify({
        type: 'assistant',
        uuid: 'm1',
        requestId: 'r1',
        message: { id: 'm1', model: 'claude-sonnet-4-5', usage: { input_tokens: 10, output_tokens: 2 } }
      }),
      JSON.stringify({
        type: 'user',
        message: { content: 'hi' }
      }),
      JSON.stringify({
        type: 'assistant',
        uuid: 'm2',
        requestId: 'r2',
        message: { id: 'm2', model: 'claude-haiku-4-5', usage: { input_tokens: 5, output_tokens: 1, cache_read_input_tokens: 20 } }
      })
    ].join('\n'))

    const totals = parseTranscripts([file])
    expect(totals.get('claude-sonnet-4-5')?.input).toBe(10)
    expect(totals.get('claude-sonnet-4-5')?.events).toBe(1)
    expect(totals.get('claude-haiku-4-5')?.cacheRead).toBe(20)
  })

  it('lists jsonl files under project dirs', () => {
    writeFileSync(join(root, 'proj', 'a.jsonl'), '{}\n')
    writeFileSync(join(root, 'proj', 'notes.txt'), 'nope')
    const files = listTranscriptFiles([root])
    expect(files.some(f => f.endsWith('a.jsonl'))).toBe(true)
    expect(files.some(f => f.endsWith('notes.txt'))).toBe(false)
  })

  it('exposes buildLocalUsageSnapshot', () => {
    expect(typeof buildLocalUsageSnapshot).toBe('function')
  })
})
