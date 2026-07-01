/**
 * A FIFO mutex for serializing access to a shared, non-reentrant resource
 * (e.g. a single VS Code terminal) across concurrent async callers.
 */
export interface AsyncLock {
  /**
   * Runs `fn` exclusively: waits for any previously queued task to finish
   * (successfully or not) before starting, and releases the lock for the
   * next queued task once `fn` settles.
   * @param fn The task to run while holding the lock
   * @returns Promise resolving/rejecting with `fn`'s own outcome
   */
  run: <T>(fn: () => Promise<T>) => Promise<T>
}

/**
 * Creates a new, independent async lock.
 * @returns A fresh AsyncLock instance
 */
export function createAsyncLock(): AsyncLock {
  let tail: Promise<void> = Promise.resolve()

  return {
    async run<T>(fn: () => Promise<T>): Promise<T> {
      const previous = tail
      let release: () => void
      tail = new Promise<void>((resolve) => {
        release = resolve
      })

      await previous
      try {
        return await fn()
      } finally {
        release!()
      }
    },
  }
}
