/**
 * Offline Claude Code usage from local JSONL transcripts
 *
 * Reads the same project logs ccusage uses:
 *   ~/.config/claude/projects/ and ~/.claude/projects/
 * Deduplicates on message id + request id so resumes/retries are not double-counted.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { debug } from '../core/logger.js'
import { ClaudeDataNotFoundError } from '../core/errors.js'
import type { ModelQuotaInfo, QuotaSnapshot } from '../quota/types.js'
import { getClaudeProjectsDirs } from '../claude/paths.js'

interface TranscriptUsage {
  input_tokens?: number
  output_tokens?: number
  cache_creation_input_tokens?: number
  cache_read_input_tokens?: number
}

interface TranscriptRow {
  type?: string
  uuid?: string
  messageId?: string
  requestId?: string
  request_id?: string
  timestamp?: string
  message?: {
    id?: string
    model?: string
    usage?: TranscriptUsage
  }
  usage?: TranscriptUsage
}

interface ModelTotals {
  input: number
  output: number
  cacheCreate: number
  cacheRead: number
  events: number
}

const MAX_FILES = 4000
const MAX_FILE_BYTES = 8 * 1024 * 1024

export function listTranscriptFiles(roots = getClaudeProjectsDirs()): string[] {
  const files: string[] = []

  for (const root of roots) {
    walkJsonl(root, files)
    if (files.length >= MAX_FILES) break
  }

  return files
}

function walkJsonl(dir: string, out: string[]): void {
  if (!existsSync(dir) || out.length >= MAX_FILES) return

  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return
  }

  for (const name of entries) {
    if (out.length >= MAX_FILES) return
    const full = join(dir, name)
    let stat
    try {
      stat = statSync(full)
    } catch {
      continue
    }

    if (stat.isDirectory()) {
      walkJsonl(full, out)
    } else if (name.endsWith('.jsonl') && stat.size <= MAX_FILE_BYTES) {
      out.push(full)
    }
  }
}

export function parseTranscripts(files: string[]): Map<string, ModelTotals> {
  const totals = new Map<string, ModelTotals>()
  const seen = new Set<string>()

  for (const file of files) {
    let content: string
    try {
      content = readFileSync(file, 'utf-8')
    } catch (err) {
      debug('transcripts', `Failed to read ${file}`, err)
      continue
    }

    for (const line of content.split('\n')) {
      if (!line.trim()) continue

      let row: TranscriptRow
      try {
        row = JSON.parse(line) as TranscriptRow
      } catch {
        continue
      }

      if (row.type && row.type !== 'assistant') {
        continue
      }

      const usage = row.message?.usage || row.usage
      if (!usage) continue

      const model = row.message?.model || 'unknown'
      const messageId = row.message?.id || row.messageId || row.uuid || ''
      const requestId = row.requestId || row.request_id || ''
      const dedupeKey = `${messageId}:${requestId}:${file}`
      if (seen.has(dedupeKey)) continue
      seen.add(dedupeKey)

      const current = totals.get(model) || {
        input: 0,
        output: 0,
        cacheCreate: 0,
        cacheRead: 0,
        events: 0
      }
      current.input += usage.input_tokens || 0
      current.output += usage.output_tokens || 0
      current.cacheCreate += usage.cache_creation_input_tokens || 0
      current.cacheRead += usage.cache_read_input_tokens || 0
      current.events += 1
      totals.set(model, current)
    }
  }

  return totals
}

export function buildLocalUsageSnapshot(email?: string): QuotaSnapshot {
  const files = listTranscriptFiles()
  if (files.length === 0) {
    throw new ClaudeDataNotFoundError()
  }

  const totals = parseTranscripts(files)
  const models: ModelQuotaInfo[] = []

  for (const [modelId, usage] of [...totals.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const tokensUsed = usage.input + usage.output + usage.cacheCreate + usage.cacheRead
    models.push({
      label: modelId,
      modelId,
      isExhausted: false,
      windowKind: 'usage',
      tokensUsed,
      inputTokens: usage.input + usage.cacheCreate + usage.cacheRead,
      outputTokens: usage.output
    })
  }

  debug('transcripts', `Parsed ${files.length} transcript files, ${models.length} models`)

  return {
    timestamp: new Date().toISOString(),
    method: 'local',
    email,
    models,
    notes: [
      'Local mode reads Claude Code JSONL transcripts. It shows token usage, not remaining plan quota.',
      'Live remaining % requires Claude Code OAuth credentials and --method cloud (or auto with login).'
    ]
  }
}

export function hasLocalTranscripts(): boolean {
  return listTranscriptFiles().length > 0
}
