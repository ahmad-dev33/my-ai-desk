export function createBridgeQueue({ redis, processMessage, logger, maxRetries = 3, initialBackoffMs = 100, autoStart = true }) {
  const PENDING_QUEUE = 'bridge:queue:pending';
  const PROCESSING_QUEUE = 'bridge:queue:processing';
  const DLQ_KEY = 'bridge:queue:dlq';
  const inMemoryQueues = new Map();
  let running = true;
  let processingPromise = null;

  const rPush = async (key, val) => {
    if (typeof redis.rPush === 'function') return redis.rPush(key, val);
    if (typeof redis.rpush === 'function') return redis.rpush(key, val);
    throw new Error('Redis client missing rPush method');
  };

  const lPop = async (key) => {
    if (typeof redis.lPop === 'function') return redis.lPop(key);
    if (typeof redis.lpop === 'function') return redis.lpop(key);
    throw new Error('Redis client missing lPop method');
  };

  const lRange = async (key, start, stop) => {
    if (typeof redis.lRange === 'function') return redis.lRange(key, start, stop);
    if (typeof redis.lrange === 'function') return redis.lrange(key, start, stop);
    return [];
  };

  const lRem = async (key, count, value) => {
    if (typeof redis.lRem === 'function') return redis.lRem(key, count, value);
    if (typeof redis.lrem === 'function') return redis.lrem(key, count, value);
    throw new Error('Redis client missing lRem method');
  };

  const claimNextJob = async () => {
    if (typeof redis.lMove === 'function') {
      return redis.lMove(PENDING_QUEUE, PROCESSING_QUEUE, 'LEFT', 'RIGHT');
    }
    if (typeof redis.lmove === 'function') {
      return redis.lmove(PENDING_QUEUE, PROCESSING_QUEUE, 'LEFT', 'RIGHT');
    }
    const raw = await lPop(PENDING_QUEUE);
    if (raw) await rPush(PROCESSING_QUEUE, raw);
    return raw;
  };

  const recoverInFlightJobs = async () => {
    const jobs = await lRange(PROCESSING_QUEUE, 0, -1);
    for (const raw of jobs) {
      await lRem(PROCESSING_QUEUE, 1, raw);
      await rPush(PENDING_QUEUE, raw);
    }
  };

  const pushToDlq = async (job, error) => {
    const dlqItem = JSON.stringify({
      message: job.message,
      attempts: job.attempts,
      failedAt: new Date().toISOString(),
      error: error?.message || String(error),
      stack: error?.stack,
    });
    if (redis) {
      await rPush(DLQ_KEY, dlqItem);
    }
  };

  const processNextRedisJob = async () => {
    if (!redis) return false;
    const raw = await claimNextJob();
    if (!raw) return false;

    let job;
    try {
      job = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch {
      logger?.error({ raw }, 'Invalid JSON in bridge pending queue');
      await lRem(PROCESSING_QUEUE, 1, raw);
      return true;
    }

    job.attempts = (job.attempts || 0) + 1;

    try {
      await processMessage(job.message);
      await lRem(PROCESSING_QUEUE, 1, raw);
      return true;
    } catch (error) {
      logger?.warn({ err: error, attempt: job.attempts, messageId: job.message?.messageId }, 'Bridge job execution failed');

      if (job.attempts < maxRetries) {
        const delay = initialBackoffMs * Math.pow(2, job.attempts - 1);
        await new Promise((resolve) => setTimeout(resolve, delay));
        await lRem(PROCESSING_QUEUE, 1, raw);
        await rPush(PENDING_QUEUE, JSON.stringify(job));
      } else {
        logger?.error({ err: error, messageId: job.message?.messageId }, 'Bridge job exceeded max retries, moving to DLQ');
        await pushToDlq(job, error);
        await lRem(PROCESSING_QUEUE, 1, raw);
      }
      return true;
    }
  };

  const workerLoop = async () => {
    while (running) {
      try {
        const processed = await processNextRedisJob();
        if (!processed) {
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
      } catch (err) {
        logger?.error({ err }, 'Error in bridge worker loop');
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
  };

  if (redis && autoStart) {
    processingPromise = recoverInFlightJobs().then(workerLoop);
  }

  const enqueueInMemory = (message) => {
    const key = `${message.accountId}:${message.conversationId}`;
    const previous = inMemoryQueues.get(key) || Promise.resolve();

    const current = previous
      .catch(() => {})
      .then(async () => {
        let attempts = 0;
        while (attempts < maxRetries) {
          attempts += 1;
          try {
            return await processMessage(message);
          } catch (error) {
            if (attempts < maxRetries) {
              const delay = initialBackoffMs * Math.pow(2, attempts - 1);
              await new Promise((resolve) => setTimeout(resolve, delay));
            } else {
              await pushToDlq({ message, attempts }, error);
              throw error;
            }
          }
        }
      });

    inMemoryQueues.set(key, current);
    current.finally(() => {
      if (inMemoryQueues.get(key) === current) inMemoryQueues.delete(key);
    });
    return current;
  };

  const enqueue = async (message) => {
    if (redis) {
      const job = { message, attempts: 0, enqueuedAt: new Date().toISOString() };
      await rPush(PENDING_QUEUE, JSON.stringify(job));
      return { status: 'queued' };
    }
    return enqueueInMemory(message);
  };

  const getDlq = async () => {
    if (!redis) return [];
    const items = await lRange(DLQ_KEY, 0, -1);
    return items.map((i) => (typeof i === 'string' ? JSON.parse(i) : i));
  };

  const stop = async () => {
    running = false;
    if (processingPromise) await processingPromise;
  };

  return {
    enqueue,
    processNextRedisJob,
    getDlq,
    stop,
    PENDING_QUEUE,
    DLQ_KEY,
    PROCESSING_QUEUE,
    recoverInFlightJobs,
  };
}
