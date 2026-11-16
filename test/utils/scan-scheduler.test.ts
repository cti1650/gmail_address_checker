import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createScanScheduler } from '../../utils/scan-scheduler'

const setTimer = (handler: () => void, ms: number) => setTimeout(handler, ms)

describe('createScanScheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('待ち時間内の複数回の要求を 1 回の実行にまとめる', async () => {
    const run = vi.fn()
    const request = createScanScheduler(run, 300, setTimer)

    request()
    request()
    request()
    await vi.advanceTimersByTimeAsync(300)

    expect(run).toHaveBeenCalledTimes(1)
  })

  it('待ち時間が経過するまでは実行しない', async () => {
    const run = vi.fn()
    const request = createScanScheduler(run, 300, setTimer)

    request()
    await vi.advanceTimersByTimeAsync(299)
    expect(run).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('実行中は同時に実行せず、完了後に 1 回だけ再実行する', async () => {
    let active = 0
    let maxActive = 0
    let resolveRun: () => void = () => {}
    const run = vi.fn(() => {
      active++
      maxActive = Math.max(maxActive, active)
      return new Promise<void>((resolve) => {
        resolveRun = () => {
          active--
          resolve()
        }
      })
    })
    const request = createScanScheduler(run, 300, setTimer)

    request()
    await vi.advanceTimersByTimeAsync(300)
    expect(run).toHaveBeenCalledTimes(1)

    // 実行中の要求はまとめて保留される
    request()
    request()
    await vi.advanceTimersByTimeAsync(1000)
    expect(run).toHaveBeenCalledTimes(1)

    resolveRun()
    await vi.advanceTimersByTimeAsync(300)
    expect(run).toHaveBeenCalledTimes(2)

    resolveRun()
    await vi.advanceTimersByTimeAsync(1000)
    expect(run).toHaveBeenCalledTimes(2)
    expect(maxActive).toBe(1)
  })

  it('実行が失敗しても次の要求を受け付ける', async () => {
    const run = vi.fn().mockRejectedValueOnce(new Error('fail')).mockResolvedValue(undefined)
    const request = createScanScheduler(run, 300, setTimer)

    request()
    await vi.advanceTimersByTimeAsync(300)
    request()
    await vi.advanceTimersByTimeAsync(300)

    expect(run).toHaveBeenCalledTimes(2)
  })
})
