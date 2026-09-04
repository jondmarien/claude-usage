import { describe, it, expect } from 'vitest'
import {
  cronToWindowsSchedule,
  cronWeekdaysToSchtasks,
  buildSchtasksCreateArgs,
  getQuotedWindowsCommand,
  isCronSupported,
  WINDOWS_TASK_NAME
} from '../../src/wakeup/cron-installer.js'

describe('Windows Task Scheduler mapping', () => {
  it('maps interval cron to HOURLY', () => {
    expect(cronToWindowsSchedule('0 */6 * * *')).toEqual({
      sc: 'HOURLY',
      mo: '6',
      st: '00:00'
    })
  })

  it('keeps the cron minute as the hourly start time', () => {
    expect(cronToWindowsSchedule('30 */6 * * *')).toEqual({
      sc: 'HOURLY',
      mo: '6',
      st: '00:30'
    })
  })

  it('maps daily cron to DAILY', () => {
    expect(cronToWindowsSchedule('30 9 * * *')).toEqual({
      sc: 'DAILY',
      st: '09:30'
    })
  })

  it('uses the first hour for multi-time daily cron', () => {
    expect(cronToWindowsSchedule('0 9,17 * * *')).toEqual({
      sc: 'DAILY',
      st: '09:00'
    })
  })

  it('maps weekly cron', () => {
    expect(cronToWindowsSchedule('0 9 * * 1,5')).toEqual({
      sc: 'WEEKLY',
      st: '09:00',
      d: 'MON,FRI'
    })
  })

  it('maps cron weekday numbers to schtasks day names', () => {
    expect(cronWeekdaysToSchtasks('0')).toBe('SUN')
    expect(cronWeekdaysToSchtasks('7')).toBe('SUN')
    expect(cronWeekdaysToSchtasks('1,5')).toBe('MON,FRI')
    expect(cronWeekdaysToSchtasks('mon,fri')).toBe('MON,FRI')
  })

  it('returns null for invalid cron', () => {
    expect(cronToWindowsSchedule('not-a-cron')).toBeNull()
  })

  it('builds quoted schtasks args', () => {
    const args = buildSchtasksCreateArgs('0 */6 * * *')
    expect(args[0]).toBe('/Create')
    expect(args).toContain('/TN')
    expect(args).toContain(WINDOWS_TASK_NAME)
    expect(args).toContain('/TR')
    expect(args).toContain('/SC')
    expect(args).toContain('HOURLY')
    expect(args).toContain('/MO')
    expect(args).toContain('6')
    expect(args).toContain('/F')

    const tr = args[args.indexOf('/TR') + 1]
    expect(tr).toContain('wakeup trigger --scheduled')
    expect(tr.startsWith('"')).toBe(true)
  })

  it('quotes the Windows command', () => {
    const command = getQuotedWindowsCommand()
    expect(command).toContain('wakeup trigger --scheduled')
    expect(command).toContain(process.execPath)
  })

  it('treats Windows as a supported scheduler platform', () => {
    expect(isCronSupported('win32')).toBe(true)
    expect(isCronSupported('linux')).toBe(true)
    expect(isCronSupported('darwin')).toBe(true)
    expect(isCronSupported('freebsd')).toBe(false)
  })
})
