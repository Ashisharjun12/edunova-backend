import { Queue } from "bullmq";
import { RedisCacheConnection } from "../config/redis.js";

/**
 * BullMQ Queue Producer - Boilerplate Template
 * 
 * This file exports queue instances for different job types.
 * Add new queues here as needed for your use cases.
 * 
 * Usage:
 *   import { ExampleQueue } from './queue/producer.js'
 *   await ExampleQueue.add('job-name', { data: {...} })
 */

// Common job options for all queues
const defaultJobOptions = {
  removeOnComplete: {
    age: 3600, // Keep completed jobs for 1 hour
    count: 1000, // Keep last 1000 completed jobs
  },
  removeOnFail: {
    age: 24 * 3600, // Keep failed jobs for 24 hours
  },
  attempts: 3, // Retry failed jobs 3 times
  backoff: {
    type: 'exponential',
    delay: 2000, // Start with 2 second delay
  },
};

/**
 * Example Queue - Replace with your actual queue name
 * 
 * Usage:
 *   import { ExampleQueue } from './queue/producer.js'
 *   
 *   // Add a job to the queue
 *   await ExampleQueue.add('process-data', {
 *     userId: '123',
 *     data: { ... }
 *   }, {
 *     priority: 1, // Optional: Higher priority = processed first
 *     delay: 5000, // Optional: Delay job execution by 5 seconds
 *   })
 */
export const ExampleQueue = new Queue("example-queue", {
  connection: RedisCacheConnection,
  defaultJobOptions,
});

