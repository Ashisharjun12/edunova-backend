import { Worker } from "bullmq";
import { RedisCacheConnection } from "../config/redis.js";
import logger from "../utils/logger.js";

// Import your workers here
// import { ExampleWorker } from "./workers/exampleWorker.js";

/**
 * BullMQ Worker Factory - Boilerplate Template
 * 
 * This file manages all queue workers. Add new workers here as needed.
 * 
 * Usage in server.js:
 *   import { StartAllWorkers, StopAllWorkers } from './queue/workerfactory.js'
 *   
 *   // Start workers on server startup
 *   await StartAllWorkers()
 *   
 *   // Stop workers on server shutdown (graceful shutdown)
 *   await StopAllWorkers()
 */

// Store worker instances
let workers = {};

/**
 * Wait for Redis connection to be ready
 * This ensures Redis is available before starting workers
 */
const waitForRedisReady = async (maxWaitTime = 10000) => {
  const startTime = Date.now();
  
  while (Date.now() - startTime < maxWaitTime) {
    try {
      if (RedisCacheConnection.status === 'ready') {
        // Double check with ping
        await RedisCacheConnection.ping();
        return true;
      }
      // Wait a bit before checking again
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
      // Connection not ready yet, wait and retry
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  return false;
};

/**
 * Start all queue workers
 * Waits for Redis to be ready before starting workers
 * 
 * @returns {Object} Object containing all started worker instances
 */
export const StartAllWorkers = async () => {
  try {
    // Wait for Redis to be ready before starting workers
    logger.info("⏳ Waiting for Redis Cache connection to be ready...");
    const redisReady = await waitForRedisReady(10000);
    
    if (!redisReady) {
      logger.warn("⚠️ Redis Cache not ready, but starting workers anyway (will retry on connection)");
    } else {
      logger.info("✅ Redis Cache connection is ready");
    }

    // ============================================
    // Add your workers here
    // ============================================

    // Example: Start Example Worker
    // workers.exampleWorker = new Worker(
    //   "example-queue", // Queue name (must match producer.js)
    //   async (job) => {
    //     return await ExampleWorker(job);
    //   },
    //   {
    //     connection: RedisCacheConnection,
    //     concurrency: 5, // Process 5 jobs concurrently
    //     limiter: {
    //       max: 10, // Max 10 jobs per second
    //       duration: 1000,
    //     },
    //     removeOnComplete: {
    //       age: 3600, // Keep completed jobs for 1 hour
    //       count: 1000, // Keep last 1000 completed jobs
    //     },
    //     removeOnFail: {
    //       age: 24 * 3600, // Keep failed jobs for 24 hours
    //     },
    //   }
    // );

    // Setup event handlers for Example Worker
    // workers.exampleWorker.on("completed", (job) => {
    //   logger.info(`✅ Example job ${job.id} completed successfully`);
    // });

    // workers.exampleWorker.on("failed", (job, err) => {
    //   logger.error(`❌ Example job ${job?.id} failed:`, err.message || err);
    // });

    // workers.exampleWorker.on("error", (err) => {
    //   logger.error(`❌ Example worker error:`, err);
    // });

    // workers.exampleWorker.on("active", (job) => {
    //   logger.debug(`🔄 Processing example job ${job.id}`);
    // });

    // workers.exampleWorker.on("stalled", (jobId) => {
    //   logger.warn(`⚠️ Example job ${jobId} stalled, will be retried`);
    // });

    // ============================================
    // End of worker definitions
    // ============================================

    logger.info("✅ All queue workers started successfully");

    return workers;
  } catch (error) {
    logger.error(`❌ Error starting workers:`, error);
    // Don't throw - allow server to start even if workers fail
    // Workers will retry when Redis connects
    return null;
  }
};

/**
 * Stop all workers gracefully
 * Call this during server shutdown to ensure jobs complete
 * 
 * Usage:
 *   process.on('SIGTERM', async () => {
 *     await StopAllWorkers()
 *     process.exit(0)
 *   })
 */
export const StopAllWorkers = async () => {
  try {
    const workerNames = Object.keys(workers);
    
    if (workerNames.length === 0) {
      logger.info("No workers to stop");
      return;
    }

    await Promise.all(
      workerNames.map(async (workerName) => {
        try {
          if (workers[workerName]) {
            await workers[workerName].close();
            logger.info(`✅ ${workerName} stopped`);
          }
        } catch (error) {
          logger.error(`❌ Error stopping ${workerName}:`, error);
        }
      })
    );

    // Clear workers object
    workers = {};
    logger.info("✅ All workers stopped");
  } catch (error) {
    logger.error(`❌ Error stopping workers:`, error);
  }
};

/**
 * Get status of all workers
 * Useful for health checks or monitoring
 */
export const getWorkersStatus = () => {
  const status = {};
  Object.keys(workers).forEach((workerName) => {
    const worker = workers[workerName];
    status[workerName] = {
      isRunning: worker && !worker.closing,
      name: worker?.name || workerName,
    };
  });
  return status;
};

