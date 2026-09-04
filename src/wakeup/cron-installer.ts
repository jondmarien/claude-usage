/**
 * Scheduler installer for auto wake-up
 * - macOS/Linux: crontab
 * - Windows: Task Scheduler via schtasks
 */

import { execFile, execSync, exec } from 'child_process'
import { dirname, delimiter } from 'path'
import { promisify } from 'util'
import { debug } from '../core/logger.js'
import { CLI_NAME } from '../core/env.js'
import type { CronInstallResult, CronStatus } from './types.js'

const execAsync = promisify(exec)
const execFileAsync = promisify(execFile)

export const CRON_COMMENT_MARKER = 'claude-usage-wakeup'
export const WINDOWS_TASK_NAME = 'claude-usage-wakeup'

function getPlatform(platform = process.platform): NodeJS.Platform {
  return platform
}

function getBinDirectories(): string[] {
  const dirs = new Set<string>()

  try {
    dirs.add(dirname(process.execPath))
  } catch {
    debug('cron-installer', 'Could not determine node bin directory')
  }

  try {
    const npmBin = execSync('npm bin -g', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    }).trim()
    if (npmBin) {
      dirs.add(npmBin)
    }
  } catch {
    debug('cron-installer', 'Could not determine npm global bin directory')
  }

  if (process.env.PATH) {
    for (const p of process.env.PATH.split(delimiter)) {
      if (!p) continue
      const lower = p.toLowerCase()
      if (
        lower.includes('node') ||
        lower.includes('npm') ||
        lower.includes('nvm') ||
        lower.includes('.local') ||
        p === '/usr/local/bin' ||
        p === '/opt/homebrew/bin'
      ) {
        dirs.add(p)
      }
    }
  }

  if (process.platform !== 'win32') {
    dirs.add('/usr/local/bin')
    dirs.add('/usr/bin')
    dirs.add('/bin')
    dirs.add('/opt/homebrew/bin')
  }

  return Array.from(dirs)
}

export function getTriggerCommand(): string {
  return `${CLI_NAME} wakeup trigger --scheduled`
}

export function getQuotedWindowsCommand(): string {
  const node = process.execPath
  const entry = process.argv[1] || CLI_NAME
  return `"${node}" "${entry}" wakeup trigger --scheduled`
}

export interface WindowsSchedule {
  sc: 'HOURLY' | 'DAILY' | 'WEEKLY'
  mo?: string
  st?: string
  d?: string
}

/**
 * Map a 5-field cron expression onto schtasks /SC flags.
 * Multiple daily hours use the first time; remaining times need extra tasks.
 */
export function cronToWindowsSchedule(cronExpression: string): WindowsSchedule | null {
  const parts = cronExpression.trim().split(/\s+/)
  if (parts.length !== 5) return null

  const [minute, hour, day, month, weekday] = parts
  if (!/^\d+$/.test(minute)) return null

  const st = `${hour.split(',')[0]?.replace('*/', '').padStart(2, '0') || '00'}:${minute.padStart(2, '0')}`

  if (hour.startsWith('*/') && day === '*' && month === '*' && weekday === '*') {
    const interval = parseInt(hour.slice(2), 10)
    if (!Number.isFinite(interval) || interval < 1) return null
    return { sc: 'HOURLY', mo: String(interval), st: `00:${minute.padStart(2, '0')}` }
  }

  if (day === '*' && month === '*' && weekday === '*' && /^\d+(,\d+)*$/.test(hour)) {
    const firstHour = hour.split(',')[0]
    return { sc: 'DAILY', st: `${firstHour.padStart(2, '0')}:${minute.padStart(2, '0')}` }
  }

  if (day === '*' && month === '*' && weekday !== '*' && /^\d+$/.test(hour)) {
    return { sc: 'WEEKLY', st, d: weekday }
  }

  return null
}

export function buildSchtasksCreateArgs(
  cronExpression: string,
  taskName = WINDOWS_TASK_NAME
): string[] {
  const schedule = cronToWindowsSchedule(cronExpression)
  const args = [
    '/Create',
    '/TN', taskName,
    '/TR', getQuotedWindowsCommand(),
    '/F',
    '/RL', 'LIMITED'
  ]

  if (schedule) {
    args.push('/SC', schedule.sc)
    if (schedule.mo) args.push('/MO', schedule.mo)
    if (schedule.st) args.push('/ST', schedule.st)
    if (schedule.d) args.push('/D', schedule.d)
  } else {
    args.push('/SC', 'HOURLY', '/MO', '6')
  }

  return args
}

async function loadCrontab(): Promise<string[]> {
  try {
    const { stdout } = await execAsync('crontab -l 2>/dev/null || echo ""')
    return stdout.split('\n').filter(line => line.trim())
  } catch {
    return []
  }
}

async function saveCrontab(lines: string[]): Promise<void> {
  const content = lines.join('\n') + '\n'

  await new Promise<void>((resolve, reject) => {
    const proc = exec('crontab -', err => {
      if (err) reject(err)
      else resolve()
    })
    proc.stdin?.write(content)
    proc.stdin?.end()
  })
}

function removeWakeupEntries(lines: string[]): string[] {
  return lines.filter(line => !line.includes(CRON_COMMENT_MARKER) && !line.includes('antigravity-usage-wakeup'))
}

export function isCronSupported(platform = process.platform): boolean {
  return platform === 'darwin' || platform === 'linux' || platform === 'win32'
}

export function isWindows(platform = process.platform): boolean {
  return platform === 'win32'
}

async function installUnixCronJob(cronExpression: string): Promise<CronInstallResult> {
  try {
    const binDirs = getBinDirectories()
    const pathValue = binDirs.join(':')
    const lines = await loadCrontab()
    const filteredLines = removeWakeupEntries(lines)

    const hasPath = filteredLines.some(line => line.startsWith('PATH='))
    if (!hasPath) {
      filteredLines.unshift(`PATH=${pathValue}`)
    }

    const cronLine = `${cronExpression} ${getTriggerCommand()} # ${CRON_COMMENT_MARKER}`
    filteredLines.push(cronLine)
    await saveCrontab(filteredLines)

    debug('cron-installer', `Installed cron job: ${cronLine}`)
    return { success: true, cronExpression }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    return {
      success: false,
      error: errorMessage,
      manualInstructions: getManualInstructions(cronExpression)
    }
  }
}

async function installWindowsTask(cronExpression: string): Promise<CronInstallResult> {
  try {
    const args = buildSchtasksCreateArgs(cronExpression)
    await execFileAsync('schtasks', args, { windowsHide: true })
    debug('cron-installer', `Installed Windows task ${WINDOWS_TASK_NAME}`)
    return { success: true, cronExpression }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    return {
      success: false,
      error: errorMessage,
      manualInstructions: getWindowsInstructions(cronExpression)
    }
  }
}

export async function installCronJob(cronExpression: string): Promise<CronInstallResult> {
  if (!isCronSupported()) {
    return {
      success: false,
      error: `Scheduler is not supported on ${getPlatform()}.`,
      manualInstructions: getWindowsInstructions(cronExpression)
    }
  }

  if (isWindows()) {
    return installWindowsTask(cronExpression)
  }

  return installUnixCronJob(cronExpression)
}

export async function uninstallCronJob(): Promise<boolean> {
  if (isWindows()) {
    try {
      await execFileAsync('schtasks', ['/Delete', '/TN', WINDOWS_TASK_NAME, '/F'], { windowsHide: true })
      return true
    } catch (err) {
      debug('cron-installer', 'Failed to uninstall Windows task:', err)
      return false
    }
  }

  if (!isCronSupported()) {
    return false
  }

  try {
    const lines = await loadCrontab()
    const filteredLines = removeWakeupEntries(lines)
    if (filteredLines.length === lines.length) {
      return true
    }
    await saveCrontab(filteredLines)
    return true
  } catch (err) {
    debug('cron-installer', 'Failed to uninstall cron job:', err)
    return false
  }
}

export async function isCronJobInstalled(): Promise<boolean> {
  const status = await getCronStatus()
  return status.installed
}

export async function getCronStatus(): Promise<CronStatus> {
  if (isWindows()) {
    try {
      const { stdout } = await execFileAsync('schtasks', ['/Query', '/TN', WINDOWS_TASK_NAME, '/FO', 'LIST'], {
        windowsHide: true
      })
      if (stdout.toLowerCase().includes(WINDOWS_TASK_NAME.toLowerCase()) || stdout.includes('TaskName')) {
        return {
          installed: true,
          cronExpression: WINDOWS_TASK_NAME,
          nextRun: 'See Task Scheduler'
        }
      }
      return { installed: false }
    } catch {
      return { installed: false }
    }
  }

  if (!isCronSupported()) {
    return { installed: false }
  }

  try {
    const lines = await loadCrontab()
    const cronLine = lines.find(line => line.includes(CRON_COMMENT_MARKER) || line.includes('antigravity-usage-wakeup'))

    if (!cronLine) {
      return { installed: false }
    }

    const parts = cronLine.trim().split(/\s+/)
    const cronExpression = parts.slice(0, 5).join(' ')

    return {
      installed: true,
      cronExpression,
      nextRun: getNextRunDescription(cronExpression)
    }
  } catch {
    return { installed: false }
  }
}

function getManualInstructions(cronExpression: string): string {
  const binDirs = getBinDirectories()
  const pathValue = binDirs.join(':')

  return `
Failed to automatically install cron job. Please add manually:

1. Open terminal and run: crontab -e

2. Add these lines:
   PATH=${pathValue}
   ${cronExpression} ${getTriggerCommand()} # ${CRON_COMMENT_MARKER}

3. Save and exit the editor

To verify, run: crontab -l
`.trim()
}

export function getWindowsInstructions(cronExpression: string): string {
  const command = getQuotedWindowsCommand()
  const schedule = cronToWindowsSchedule(cronExpression)
  const sc = schedule ? `/SC ${schedule.sc}${schedule.mo ? ` /MO ${schedule.mo}` : ''}${schedule.st ? ` /ST ${schedule.st}` : ''}` : '/SC HOURLY /MO 6'

  return `
Automatic Task Scheduler install failed or is unavailable.

Create the task manually:

  schtasks /Create /TN "${WINDOWS_TASK_NAME}" /TR ${JSON.stringify(command)} ${sc} /F /RL LIMITED

Or use Task Scheduler (taskschd.msc):
1. Create a Basic Task named ${WINDOWS_TASK_NAME}
2. Trigger: ${cronExpression}
3. Action: Start a program
   - Program: ${process.execPath}
   - Arguments: "${process.argv[1] || CLI_NAME}" wakeup trigger --scheduled
`.trim()
}

function getNextRunDescription(cronExpression: string): string {
  try {
    const parts = cronExpression.split(/\s+/)
    if (parts.length !== 5) return 'Unknown'

    const [minute, hour] = parts

    if (hour.startsWith('*/')) {
      const hours = parseInt(hour.substring(2), 10)
      const now = new Date()
      const currentHour = now.getHours()
      const nextHour = Math.ceil((currentHour + 1) / hours) * hours
      const isToday = nextHour < 24
      return isToday ? `Today around ${nextHour}:00` : 'Tomorrow'
    }

    const hourNum = parseInt(hour.split(',')[0], 10)
    const minuteNum = parseInt(minute, 10)
    const now = new Date()
    const currentMinutes = now.getHours() * 60 + now.getMinutes()
    const targetMinutes = hourNum * 60 + minuteNum

    if (targetMinutes > currentMinutes) {
      return `Today at ${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`
    }
    return `Tomorrow at ${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`
  } catch {
    return 'Unknown'
  }
}
