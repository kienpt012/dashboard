import { BeforeApplicationShutdown, Injectable, Logger } from '@nestjs/common';

const PASSWORD_RESET_DELIVERY_DRAIN_TIMEOUT_MS = 8_000;
const DELIVERY_DRAIN_BUDGET_RATIO = 0.75;

interface TrackedPasswordResetDelivery {
  completion: Promise<void>;
  invalidate: () => Promise<void>;
  invalidation?: Promise<void>;
}

@Injectable()
export class PasswordResetDeliveryRegistry implements BeforeApplicationShutdown {
  private readonly logger = new Logger(PasswordResetDeliveryRegistry.name);
  private readonly inFlight = new Set<TrackedPasswordResetDelivery>();
  private shuttingDown = false;

  track(delivery: Promise<unknown>, invalidate: () => Promise<void>): Promise<void> {
    const rawDelivery = Promise.resolve(delivery);
    const tracked = {
      completion: Promise.resolve(),
      invalidate,
    } as TrackedPasswordResetDelivery;

    this.inFlight.add(tracked);
    if (this.shuttingDown) {
      // A request that was already executing when shutdown began must not leave a
      // usable OTP behind. The SMTP promise is still observed to avoid an
      // unhandled rejection, but shutdown only waits for invalidation.
      void rawDelivery.catch(() => undefined);
      tracked.completion = this.invalidateSafely(tracked)
        .finally(() => this.inFlight.delete(tracked));
      return tracked.completion;
    }

    tracked.completion = rawDelivery
      .then(() => undefined, () => this.invalidateSafely(tracked))
      .finally(() => this.inFlight.delete(tracked));
    return tracked.completion;
  }

  async drain(timeoutMs = PASSWORD_RESET_DELIVERY_DRAIN_TIMEOUT_MS): Promise<void> {
    this.shuttingDown = true;
    const boundedTimeoutMs = Math.max(0, timeoutMs);
    const deliveryBudgetMs = Math.floor(boundedTimeoutMs * DELIVERY_DRAIN_BUDGET_RATIO);
    const invalidationBudgetMs = boundedTimeoutMs - deliveryBudgetMs;

    const deliveries = [...this.inFlight].map(item => item.completion);
    if (deliveries.length > 0 && deliveryBudgetMs > 0) {
      await this.waitWithin(Promise.all(deliveries).then(() => undefined), deliveryBudgetMs);
    }

    const pending = [...this.inFlight];
    if (pending.length === 0) return;

    // SMTP cannot be cancelled safely. If it does not settle within the delivery
    // budget, consume the corresponding challenges before the database shuts
    // down so a delayed/abandoned email cannot carry a usable OTP.
    if (invalidationBudgetMs > 0) {
      await this.waitWithin(
        Promise.all(pending.map(item => this.invalidateSafely(item))).then(() => undefined),
        invalidationBudgetMs,
      );
    } else {
      // Even a caller-supplied zero timeout must start invalidation; it simply
      // does not wait for the database operation to finish.
      void Promise.all(pending.map(item => this.invalidateSafely(item)));
    }
  }

  async beforeApplicationShutdown(): Promise<void> {
    await this.drain();
  }

  private invalidateSafely(item: TrackedPasswordResetDelivery): Promise<void> {
    if (!item.invalidation) {
      item.invalidation = Promise.resolve()
        .then(item.invalidate)
        .catch(() => {
          // Never log recipient, OTP, challenge id, or raw SMTP/database errors.
          this.logger.error('Could not invalidate an undelivered password reset challenge');
        });
    }
    return item.invalidation;
  }

  private async waitWithin(task: Promise<void>, timeoutMs: number): Promise<boolean> {
    let timeout: NodeJS.Timeout | undefined;
    const timedOut = new Promise<false>(resolve => {
      timeout = setTimeout(() => resolve(false), timeoutMs);
    });
    const completed = task.then(() => true as const);
    const result = await Promise.race([completed, timedOut]);
    if (timeout) clearTimeout(timeout);
    return result;
  }
}
