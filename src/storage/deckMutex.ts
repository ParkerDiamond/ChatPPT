/**
 * Per-deck mutation serialization lock.
 * Ensures that concurrent or overlapping mutations to the same deck
 * are serialized, preventing race conditions on PPTX and registry writes.
 */

type LockAcquirer = () => Promise<void>;

class DeckMutex {
  private locks = new Map<string, Promise<void>>();

  /**
   * Acquire an exclusive lock for the given deck ID.
   * Returns a release function that must be called when done.
   */
  async acquire(deckId: string): Promise<() => void> {
    // Wait for any existing lock to complete
    const existingLock = this.locks.get(deckId);
    if (existingLock) {
      await existingLock;
    }

    // Create a new lock promise
    let releaseLock: (() => void) | null = null;
    const lockPromise = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });

    this.locks.set(deckId, lockPromise);

    // Return a function to release this lock
    return () => {
      if (releaseLock) {
        releaseLock();
      }
      this.locks.delete(deckId);
    };
  }

  /**
   * Execute a function with exclusive access to a deck.
   * Automatically acquires and releases the lock.
   */
  async withLock<T>(deckId: string, fn: () => Promise<T>): Promise<T> {
    const release = await this.acquire(deckId);
    try {
      return await fn();
    } finally {
      release();
    }
  }
}

export const deckMutex = new DeckMutex();
