import { logger } from "../utils/logger";

/**
 * Minimal sequential publish queue.
 *
 * All publish jobs are executed strictly FIFO and one at a time.
 *
 * This prevents concurrent GitHub Contents API updates from racing over
 * the same public-data files, where each update depends on the previous
 * file SHA.
 *
 * The queue intentionally remains in-process for the current deployment
 * architecture. A future multi-instance deployment can replace the
 * implementation with Redis/BullMQ while preserving the same enqueue()
 * contract.
 */
class PublishQueue {
  private queue: Array<() => Promise<void>> = [];
  private isRunning = false;

  /**
   * Add a publish task to the FIFO queue.
   */
  enqueue(task: () => Promise<void>): void {
    this.queue.push(task);

    /*
     * Do not await here.
     *
     * enqueue() is intentionally fire-and-forget because HTTP requests
     * should return immediately after the PublishJob has been queued.
     */
    void this.run();
  }

  /**
   * Number of tasks waiting to be processed.
   */
  get pendingCount(): number {
    return this.queue.length;
  }

  /**
   * Whether the worker is currently processing a task.
   */
  get running(): boolean {
    return this.isRunning;
  }

  /**
   * Executes queued tasks sequentially.
   *
   * A task failure must never terminate the worker permanently.
   */
  private async run(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;

    try {
      while (this.queue.length > 0) {
        const task = this.queue.shift();

        if (!task) {
          continue;
        }

        try {
          await task();
        } catch (error) {
          /*
           * publishService normally catches and records its own failures.
           * This catch is defense-in-depth for unexpected errors escaping
           * the task.
           */
          logger.error(
            {
              err: error,
              pendingCount: this.queue.length,
            },
            "unhandled error in publish queue task"
          );
        }
      }
    } finally {
      /*
       * Always release the worker lock.
       *
       * Without finally, an unexpected error escaping the worker could
       * leave the queue permanently stuck in the running state.
       */
      this.isRunning = false;

      /*
       * A task may have enqueued another task during the final state
       * transition. Start another worker if anything remains.
       */
      if (this.queue.length > 0) {
        void this.run();
      }
    }
  }
}

export const publishQueue = new PublishQueue();
