import { qdrantClient } from '../../config/vectordb.js';
import { createResumeCollection, storeResumeChunks, getResumeChunks } from '../../services/vectordb/resumeService.js';
import { getOpenAIClient, getModel } from '../../config/aiConfig.js';
import logger from '../../utils/logger.js';

const TEST_COLLECTION_NAME = 'resumes';
const TEST_RESUME_ID = 'test-resume-storage-' + Date.now();
const TEST_USER_ID = 'test-user-storage';

/**
 * Test vector embedding storage in Qdrant
 * @returns {Promise<Object>} Test results
 */
export const testVectorStorage = async () => {
  const results = {
    testName: 'Vector Storage Test',
    passed: false,
    tests: [],
    errors: [],
    startTime: Date.now(),
    cleanup: [],
  };

  try {
    // Test 1: Create collection
    console.log('\n[STORAGE TEST] Creating test collection...');
    const collectionTest = {
      name: 'Collection Creation',
      passed: false,
      details: {},
    };

    await createResumeCollection();
    const collectionInfo = await qdrantClient.getCollection(TEST_COLLECTION_NAME);
    
    collectionTest.details.collectionName = TEST_COLLECTION_NAME;
    collectionTest.details.vectorSize = collectionInfo.config?.params?.vectors?.size || 'unknown';
    collectionTest.details.distance = collectionInfo.config?.params?.vectors?.distance || 'unknown';
    collectionTest.passed = true;
    results.tests.push(collectionTest);
    console.log('✅ Collection created/verified');

    // Test 2: Generate test embeddings
    console.log('[STORAGE TEST] Generating test embeddings...');
    const embeddingTest = {
      name: 'Embedding Generation',
      passed: false,
      details: {},
    };

    const testChunks = [
      'Software engineer with 5 years of experience in JavaScript and React.',
      'Experienced in building scalable web applications and REST APIs.',
      'Strong problem-solving skills and expertise in database design.',
    ];

    const client = getOpenAIClient('embedding');
    const model = getModel('embedding');
    
    const embeddings = [];
    for (let i = 0; i < testChunks.length; i++) {
      const response = await client.embeddings.create({
        model,
        input: testChunks[i],
      });
      embeddings.push(response.data[0].embedding);
    }

    const expectedVectorSize = collectionInfo.config?.params?.vectors?.size || 1536;
    const allCorrectSize = embeddings.every(emb => emb.length === expectedVectorSize);

    embeddingTest.details.chunksCount = testChunks.length;
    embeddingTest.details.embeddingsGenerated = embeddings.length;
    embeddingTest.details.vectorSize = embeddings[0]?.length || 0;
    embeddingTest.details.expectedSize = expectedVectorSize;
    embeddingTest.details.allCorrectSize = allCorrectSize;
    embeddingTest.passed = allCorrectSize && embeddings.length === testChunks.length;
    results.tests.push(embeddingTest);
    console.log(`✅ Generated ${embeddings.length} embeddings with size ${embeddings[0]?.length || 0}`);

    if (!embeddingTest.passed) {
      throw new Error('Embedding generation failed or size mismatch');
    }

    // Test 3: Store vectors
    console.log('[STORAGE TEST] Storing vectors in Qdrant...');
    const storageTest = {
      name: 'Vector Storage',
      passed: false,
      details: {},
    };

    await storeResumeChunks(TEST_RESUME_ID, testChunks, embeddings, TEST_USER_ID);
    results.cleanup.push(() => deleteTestResume(TEST_RESUME_ID));

    storageTest.details.chunksStored = testChunks.length;
    storageTest.details.resumeId = TEST_RESUME_ID;
    storageTest.passed = true;
    results.tests.push(storageTest);
    console.log(`✅ Stored ${testChunks.length} chunks`);

    // Test 4: Verify storage
    console.log('[STORAGE TEST] Verifying stored vectors...');
    const verificationTest = {
      name: 'Storage Verification',
      passed: false,
      details: {},
    };

    const storedChunks = await getResumeChunks(TEST_RESUME_ID);
    
    verificationTest.details.chunksRetrieved = storedChunks.length;
    verificationTest.details.expectedCount = testChunks.length;
    verificationTest.details.matches = storedChunks.length === testChunks.length;
    verificationTest.passed = storedChunks.length === testChunks.length;

    if (verificationTest.passed) {
      // Verify chunk content
      const contentMatches = storedChunks.every((chunk, idx) => {
        return chunk.text === testChunks[idx] && chunk.chunkIndex === idx;
      });
      verificationTest.details.contentMatches = contentMatches;
      verificationTest.passed = contentMatches;
    }

    results.tests.push(verificationTest);
    console.log(`✅ Verified ${storedChunks.length} stored chunks`);

    // Test 5: Test batch upsert
    console.log('[STORAGE TEST] Testing batch upsert...');
    const batchTest = {
      name: 'Batch Upsert',
      passed: false,
      details: {},
    };

    const additionalChunks = ['Additional test chunk for batch operation.'];
    const additionalEmbedding = await client.embeddings.create({
      model,
      input: additionalChunks[0],
    });
    const additionalEmbeddings = [additionalEmbedding.data[0].embedding];

    await storeResumeChunks(TEST_RESUME_ID, additionalChunks, additionalEmbeddings, TEST_USER_ID);
    
    const updatedChunks = await getResumeChunks(TEST_RESUME_ID);
    batchTest.details.totalChunksAfterBatch = updatedChunks.length;
    batchTest.details.expectedTotal = testChunks.length + additionalChunks.length;
    batchTest.passed = updatedChunks.length === (testChunks.length + additionalChunks.length);
    results.tests.push(batchTest);
    console.log(`✅ Batch upsert successful. Total chunks: ${updatedChunks.length}`);

    // All tests passed
    results.passed = results.tests.every(test => test.passed);
    results.duration = Date.now() - results.startTime;

    if (results.passed) {
      console.log('\n✅ All storage tests passed!');
    } else {
      console.log('\n❌ Some storage tests failed');
    }

    return results;
  } catch (error) {
    results.passed = false;
    results.errors.push({
      message: error.message,
      stack: error.stack,
    });
    results.duration = Date.now() - results.startTime;
    logger.error('[STORAGE TEST] Error:', error);
    console.error('\n❌ Storage test failed:', error.message);
    return results;
  }
};

/**
 * Cleanup test data
 */
const deleteTestResume = async (resumeId) => {
  try {
    const { deleteResumeChunks } = await import('../../services/vectordb/resumeService.js');
    await deleteResumeChunks(resumeId);
    console.log(`[CLEANUP] Deleted test resume ${resumeId}`);
  } catch (error) {
    logger.warn(`[CLEANUP] Failed to delete test resume ${resumeId}:`, error);
  }
};

