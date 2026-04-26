import fs from 'fs'
import path from 'path'

const LOG_DIR = path.join(process.cwd(), 'logs')
const LOG_FILE = path.join(LOG_DIR, 'activity.jsonl')
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

export interface ActivityEntry {
  timestamp: string
  action: string
  userId: string
  email: string
  ip: string
  userAgent: string
  device: string
  details?: Record<string, unknown>
}

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true })
  }
}

function rotateIfNeeded() {
  try {
    if (!fs.existsSync(LOG_FILE)) return
    const stats = fs.statSync(LOG_FILE)
    if (stats.size > MAX_FILE_SIZE) {
      const rotatedPath = LOG_FILE + '.1'
      if (fs.existsSync(rotatedPath)) {
        fs.unlinkSync(rotatedPath)
      }
      fs.renameSync(LOG_FILE, rotatedPath)
    }
  } catch {
    // rotation failed, continue writing to current file
  }
}

export async function logActivity(
  entry: Omit<ActivityEntry, 'timestamp'>
): Promise<void> {
  try {
    ensureLogDir()
    rotateIfNeeded()
    const line = JSON.stringify({
      timestamp: new Date().toISOString(),
      ...entry,
    }) + '\n'
    await fs.promises.appendFile(LOG_FILE, line, 'utf-8')
  } catch {
    // fire-and-forget — never throw
  }
}

export async function readActivityLogs(options?: {
  limit?: number
  offset?: number
  action?: string
}): Promise<ActivityEntry[]> {
  try {
    if (!fs.existsSync(LOG_FILE)) return []
    const content = await fs.promises.readFile(LOG_FILE, 'utf-8')
    const lines = content.split('\n').filter((l) => l.trim().length > 0)

    let entries: ActivityEntry[] = []
    for (const line of lines) {
      try {
        entries.push(JSON.parse(line))
      } catch {
        // skip malformed lines
      }
    }

    // Sort newest first
    entries.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    )

    // Filter by action
    if (options?.action) {
      entries = entries.filter((e) => e.action === options.action)
    }

    // Pagination
    const offset = options?.offset ?? 0
    const limit = options?.limit ?? 100
    return entries.slice(offset, offset + limit)
  } catch {
    return []
  }
}
