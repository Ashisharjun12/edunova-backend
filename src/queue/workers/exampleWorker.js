import logger from "../../utils/logger.js";

/**
 * Example Worker - Boilerplate Template
 * 
 * This is a template for creating new BullMQ workers.
 * Copy this file and modify it for your specific use case.
 * 
 * Worker Function Signature:
 *   - Receives a BullMQ job object
 *   - Must return a result (or throw an error)
 *   - Errors will trigger retry mechanism (configured in producer.js)
 * 
 * Usage:
 *   1. Copy this file: exampleWorker.js -> yourWorker.js
 *   2. Import your service functions
 *   3. Implement the job processing logic
 *   4. Add worker to workerfactory.js
 *   5. Add queue to producer.js
 */

/**
 * Example Worker - Process example jobs
 * 
 * @param {Object} job - BullMQ job object
 * @param {Object} job.data - Job data passed from producer
 * @param {string} job.id - Unique job ID
 * @param {number} job.attemptsMade - Number of retry attempts
 * @returns {Object} Result object
 */
export const ExampleWorker = async (job) => {
  const startTime = Date.now();
  const { type, data } = job.data;

  try {
    logger.info(`Processing example job ${job.id} of type: ${type}`);

    // ============================================
    // Implement your job processing logic here
    // ============================================

    switch (type) {
      case "process-data":
        // Example: Process some data
        const { userId, data: jobData } = data;
        
        // Your processing logic here
        // await processUserData(userId, jobData);
        
        logger.info(`Processed data for user ${userId}`);
        break;

      case "send-email":
        // Example: Send an email
        const { to, subject, body } = data;
        
        // Your email sending logic here
        // await sendEmail(to, subject, body);
        
        logger.info(`Sent email to ${to}`);
        break;

      default:
        throw new Error(`Unknown job type: ${type}`);
    }

    const duration = Date.now() - startTime;
    logger.info(
      `✅ Successfully processed example job ${job.id} in ${duration}ms`
    );

    return {
      success: true,
      jobId: job.id,
      duration,
      processedAt: new Date().toISOString(),
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error(
      `❌ Error processing example job ${job.id} after ${duration}ms:`,
      error
    );
    
    // Re-throw to trigger retry mechanism (configured in producer.js)
    // If max retries exceeded, job will be marked as failed
    throw error;
  }
};

/**
 * Tips for creating workers:
 * 
 * 1. Always log start and completion
 * 2. Handle errors gracefully
 * 3. Return meaningful results
 * 4. Use job.data to access job parameters
 * 5. Consider idempotency (same job can be retried)
 * 6. For long-running jobs, use job.updateProgress()
 * 
 * Example with progress updates:
 *   await job.updateProgress(50); // 50% complete
 *   await job.updateProgress(100); // 100% complete
 */

