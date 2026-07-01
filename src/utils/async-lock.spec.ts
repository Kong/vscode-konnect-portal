import { describe, it, expect } from 'vitest'
import { createAsyncLock } from './async-lock'

describe('utils/async-lock', () => {
  it('runs a single task and returns its result', async () => {
    const lock = createAsyncLock()

    const result = await lock.run(async () => 'done')

    expect(result).toBe('done')
  })

  it('serializes concurrent tasks so only one runs at a time', async () => {
    const lock = createAsyncLock()
    const order: string[] = []
    let activeCount = 0
    let maxActiveCount = 0

    const runTask = (name: string, delayMs: number) => lock.run(async () => {
      activeCount++
      maxActiveCount = Math.max(maxActiveCount, activeCount)
      order.push(`${name}:start`)
      await new Promise(resolve => setTimeout(resolve, delayMs))
      order.push(`${name}:end`)
      activeCount--
    })

    // Kick off three tasks concurrently, first one slowest
    await Promise.all([
      runTask('a', 30),
      runTask('b', 10),
      runTask('c', 0),
    ])

    // Never more than one task in flight at a time
    expect(maxActiveCount).toBe(1)

    // Tasks run strictly in the order they called .run(), each fully
    // completing before the next starts (FIFO, no interleaving)
    expect(order).toEqual([
      'a:start', 'a:end',
      'b:start', 'b:end',
      'c:start', 'c:end',
    ])
  })

  it('propagates a rejection to its own caller without blocking later tasks', async () => {
    const lock = createAsyncLock()

    const failing = lock.run(async () => {
      throw new Error('task failed')
    })

    const succeeding = lock.run(async () => 'still works')

    await expect(failing).rejects.toThrow('task failed')
    await expect(succeeding).resolves.toBe('still works')
  })

  it('releases the lock even when a task throws synchronously', async () => {
    const lock = createAsyncLock()

    await expect(lock.run(() => {
      throw new Error('sync failure')
    })).rejects.toThrow('sync failure')

    // Lock must not be stuck held -- a subsequent task should still run
    const result = await lock.run(async () => 'unblocked')
    expect(result).toBe('unblocked')
  })
})
