import { logger } from "../utils/logger";

/**
 * Minimal sequential job queue (spec section 26: "Prevent concurrent
 * GitHub updates from causing race conditions"). GitHub's Contents API
 * requires a file's current `sha` to update it — two concurrent writers
 * racing on the same file (e.g. products.json) would corrupt or reject
 * one of the commits. Running every publish job through this single
 * FIFO worker guarantees only one GitHub write is ever in flight.
 *
 * This is intentionally in-process rather than a separate service (Redis/
 * BullMQ) to keep Phase 1-5 runnable with zero extra infrastructure. For
 * a multi-instance production deployment, swap this for a real queue
 * (e.g. BullMQ backed by Redis) behind the same enqueue() interface —
 * nothing else in the codebase needs to change.
 */
class PublishQueue {
  private queue: Array<() => Promise<void>> = [];
  private isRunning = false;

  enqueue(task: () => Promise<void>): void {
    this.queue.push(task);
    void this.run();
  }

  private async run() {
    if (this.isRunning) return;
    this.isRunning = true;

    while (this.queue.length > 0) {
      const task = this.queue.shift()!;
      try {
        await task();
      } catch (err) {
        // Individual task failures are handled/recorded inside the task
        // itself (publishService marks the PublishJob FAILED); this catch
        // only prevents one bad job from stopping the whole queue.
        logger.error({ err }, "unhandled error in publish queue task");
      }
    }

    this.isRunning = false;
  }
}

export const publishQueue = new PublishQueue();
