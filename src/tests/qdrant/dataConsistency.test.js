import { db } from '../../config/database.js';
import { resumes } from '../../models/resume.model.js';
import { eq } from 'drizzle-orm';
import { getResumeChunks, verifyResumeInQdrant, checkVectorDimensions } from '../../services/vectordb/resumeService.js';
import logger from '../../utils/logger.js';

/**
 * Test data consistency between PostgreSQL and Qdrant
 * @returns {Promise<Object>} Test results
 */
export const testDataConsistency = async () => {
  const results = {
    testName: 'Data Consistency Test',
    passed: false,
    tests: [],
    errors: [],
    startTime: Date.now(),
    summary: {
      totalResumes: 0,
      resumesWithChunks: 0,
      consistentResumes: 0,
      inconsistentResumes: 0,
      orphanedVectors: 0,
    },
  };

  try {
    console.log('\n[CONSISTENCY TEST] Starting data consistency check...');

    // Test 1: Get all resumes from PostgreSQL
    console.log('[CONSISTENCY TEST] Fetching resumes from PostgreSQL...');
    const postgresTest = {
      name: 'PostgreSQL Data Retrieval',
      passed: false,
      details: {},
    };

    const allResumes = await db
      .select({
        id: resumes.id,
        userId: resumes.userId,
        fileName: resumes.fileName,
        processingStatus: resumes.processingStatus,
        chunks: resumes.chunks,
        extractedText: resumes.extractedText,
      })
      .from(resumes)
      .limit(100); // Limit to avoid timeout

    postgresTest.details.totalResumes = allResumes.length;
    postgresTest.details.resumesWithChunks = allResumes.filter(r => 
      Array.isArray(r.chunks) && r.chunks.length > 0
    ).length;
    postgresTest.passed = true;
    results.tests.push(postgresTest);
    results.summary.totalResumes = allResumes.length;
    console.log(`✅ Retrieved ${allResumes.length} resumes from PostgreSQL`);

    // Test 2: Check consistency for each resume
    console.log('[CONSISTENCY TEST] Checking consistency for each resume...');
    const consistencyChecks = [];

    for (const resume of allResumes) {
      if (!Array.isArray(resume.chunks) || resume.chunks.length === 0) {
        continue; // Skip resumes without chunks
      }

      try {
        const postgresChunksCount = resume.chunks.length;
        
        // Get Qdrant chunks
        const qdrantChunks = await getResumeChunks(resume.id);
        const qdrantChunksCount = qdrantChunks.length;

        const chunksMatch = postgresChunksCount === qdrantChunksCount;
        const hasQdrantData = qdrantChunksCount > 0;

        consistencyChecks.push({
          resumeId: resume.id,
          fileName: resume.fileName,
          postgresChunks: postgresChunksCount,
          qdrantChunks: qdrantChunksCount,
          consistent: chunksMatch,
          hasQdrantData,
        });

        if (chunksMatch) {
          results.summary.consistentResumes++;
        } else {
          results.summary.inconsistentResumes++;
        }

        if (hasQdrantData) {
          results.summary.resumesWithChunks++;
        }
      } catch (error) {
        logger.warn(`[CONSISTENCY TEST] Error checking resume ${resume.id}:`, error);
        consistencyChecks.push({
          resumeId: resume.id,
          fileName: resume.fileName,
          error: error.message,
          consistent: false,
        });
        results.summary.inconsistentResumes++;
      }
    }

    const consistencyTest = {
      name: 'Resume Consistency Check',
      passed: false,
      details: {
        checkedResumes: consistencyChecks.length,
        consistent: results.summary.consistentResumes,
        inconsistent: results.summary.inconsistentResumes,
        checks: consistencyChecks.slice(0, 10), // Show first 10 for brevity
      },
    };

    consistencyTest.passed = results.summary.inconsistentResumes === 0;
    results.tests.push(consistencyTest);
    console.log(`✅ Checked ${consistencyChecks.length} resumes. Consistent: ${results.summary.consistentResumes}, Inconsistent: ${results.summary.inconsistentResumes}`);

    // Test 3: Check for orphaned vectors in Qdrant
    console.log('[CONSISTENCY TEST] Checking for orphaned vectors...');
    const orphanTest = {
      name: 'Orphaned Vectors Check',
      passed: false,
      details: {},
    };

    const { getCollectionStatistics } = await import('../../services/vectordb/resumeService.js');
    const stats = await getCollectionStatistics();
    
    const resumeIdsInQdrant = new Set(stats.resumeIds || []);
    const resumeIdsInPostgres = new Set(allResumes.map(r => r.id));

    const orphanedResumeIds = Array.from(resumeIdsInQdrant).filter(
      id => !resumeIdsInPostgres.has(id)
    );

    orphanTest.details.totalVectorsInQdrant = stats.totalPoints || 0;
    orphanTest.details.uniqueResumesInQdrant = resumeIdsInQdrant.size;
    orphanTest.details.uniqueResumesInPostgres = resumeIdsInPostgres.size;
    orphanTest.details.orphanedResumeIds = orphanedResumeIds;
    orphanTest.details.orphanedCount = orphanedResumeIds.length;
    orphanTest.passed = orphanedResumeIds.length === 0;
    results.tests.push(orphanTest);
    results.summary.orphanedVectors = orphanedResumeIds.length;
    console.log(`✅ Found ${orphanedResumeIds.length} orphaned resume vectors`);

    // Test 4: Vector dimension consistency
    console.log('[CONSISTENCY TEST] Checking vector dimensions...');
    const dimensionTest = {
      name: 'Vector Dimension Consistency',
      passed: false,
      details: {},
    };

    const dimensionCheck = await checkVectorDimensions();
    
    dimensionTest.details.expectedSize = dimensionCheck.expectedSize;
    dimensionTest.details.totalChecked = dimensionCheck.totalChecked;
    dimensionTest.details.consistent = dimensionCheck.consistent;
    dimensionTest.details.inconsistent = dimensionCheck.inconsistent;
    dimensionTest.details.allConsistent = dimensionCheck.allConsistent;
    dimensionTest.passed = dimensionCheck.allConsistent;
    results.tests.push(dimensionTest);
    console.log(`✅ Dimension check: ${dimensionCheck.consistent}/${dimensionCheck.totalChecked} vectors consistent`);

    // Test 5: Verify specific resume (if any exist)
    if (allResumes.length > 0 && consistencyChecks.length > 0) {
      console.log('[CONSISTENCY TEST] Verifying sample resume...');
      const sampleResume = consistencyChecks.find(c => c.hasQdrantData && c.consistent);
      
      if (sampleResume) {
        const verificationTest = {
          name: 'Sample Resume Verification',
          passed: false,
          details: {},
        };

        const verification = await verifyResumeInQdrant(sampleResume.resumeId);
        
        verificationTest.details.resumeId = sampleResume.resumeId;
        verificationTest.details.found = verification.found;
        verificationTest.details.chunkCount = verification.chunkCount;
        verificationTest.passed = verification.found && verification.chunkCount > 0;
        results.tests.push(verificationTest);
        console.log(`✅ Verified sample resume ${sampleResume.resumeId}`);
      }
    }

    // Summary
    const summaryTest = {
      name: 'Consistency Summary',
      passed: results.summary.inconsistentResumes === 0 && results.summary.orphanedVectors === 0,
      details: results.summary,
    };
    results.tests.push(summaryTest);

    // All tests passed if no inconsistencies found
    results.passed = results.summary.inconsistentResumes === 0 && 
                     results.summary.orphanedVectors === 0 &&
                     dimensionTest.passed;
    results.duration = Date.now() - results.startTime;

    if (results.passed) {
      console.log('\n✅ All consistency tests passed!');
    } else {
      console.log('\n❌ Some consistency issues found');
      console.log(`   Inconsistent resumes: ${results.summary.inconsistentResumes}`);
      console.log(`   Orphaned vectors: ${results.summary.orphanedVectors}`);
    }

    return results;
  } catch (error) {
    results.passed = false;
    results.errors.push({
      message: error.message,
      stack: error.stack,
    });
    results.duration = Date.now() - results.startTime;
    logger.error('[CONSISTENCY TEST] Error:', error);
    console.error('\n❌ Consistency test failed:', error.message);
    return results;
  }
};

