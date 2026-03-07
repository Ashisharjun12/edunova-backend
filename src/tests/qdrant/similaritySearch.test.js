import { qdrantClient } from '../../config/vectordb.js';
import { createResumeCollection, storeResumeChunks, searchResumeByQuery, searchSimilarResumes } from '../../services/vectordb/resumeService.js';
import { getOpenAIClient, getModel } from '../../config/aiConfig.js';
import logger from '../../utils/logger.js';

const TEST_RESUME_ID = 'test-resume-search-' + Date.now();
const TEST_USER_ID = 'test-user-search';

/**
 * Test similarity search functionality
 * @returns {Promise<Object>} Test results
 */
export const testSimilaritySearch = async () => {
  const results = {
    testName: 'Similarity Search Test',
    passed: false,
    tests: [],
    errors: [],
    startTime: Date.now(),
    cleanup: [],
  };

  try {
    // Setup: Create test data
    console.log('\n[SEARCH TEST] Setting up test data...');
    await createResumeCollection();

    const testChunks = [
      'Software engineer with 5 years of experience in JavaScript and React. Proficient in Node.js and MongoDB.',
      'Experienced in building scalable web applications and REST APIs. Strong background in cloud computing and microservices architecture.',
      'Strong problem-solving skills and expertise in database design. Familiar with PostgreSQL and Redis caching strategies.',
      'Full-stack developer specializing in modern JavaScript frameworks. Experience with TypeScript and GraphQL.',
      'DevOps engineer with expertise in Docker, Kubernetes, and CI/CD pipelines. AWS certified solutions architect.',
    ];

    const client = getOpenAIClient('embedding');
    const model = getModel('embedding');
    
    const embeddings = [];
    for (const chunk of testChunks) {
      const response = await client.embeddings.create({
        model,
        input: chunk,
      });
      embeddings.push(response.data[0].embedding);
    }

    await storeResumeChunks(TEST_RESUME_ID, testChunks, embeddings, TEST_USER_ID);
    results.cleanup.push(() => deleteTestResume(TEST_RESUME_ID));
    console.log(`✅ Setup complete. Stored ${testChunks.length} test chunks`);

    // Test 1: Search by query text
    console.log('[SEARCH TEST] Testing search by query text...');
    const querySearchTest = {
      name: 'Query Text Search',
      passed: false,
      details: {},
    };

    const queryText = 'JavaScript and React development experience';
    const searchResults = await searchResumeByQuery(TEST_RESUME_ID, queryText, 3);

    querySearchTest.details.queryText = queryText;
    querySearchTest.details.resultsCount = searchResults.length;
    querySearchTest.details.expectedMinResults = 1;
    querySearchTest.details.results = searchResults.map(r => ({
      chunkIndex: r.chunkIndex,
      score: r.score,
      textPreview: r.text.substring(0, 50) + '...',
    }));

    // Check if results are relevant (should find JavaScript/React related chunks)
    const relevantResults = searchResults.filter(r => 
      r.text.toLowerCase().includes('javascript') || 
      r.text.toLowerCase().includes('react')
    );

    querySearchTest.details.relevantResults = relevantResults.length;
    querySearchTest.passed = searchResults.length > 0 && searchResults.length <= 3;
    results.tests.push(querySearchTest);
    console.log(`✅ Query search returned ${searchResults.length} results`);

    // Test 2: Similarity scores validation
    console.log('[SEARCH TEST] Validating similarity scores...');
    const scoreTest = {
      name: 'Similarity Score Validation',
      passed: false,
      details: {},
    };

    if (searchResults.length > 0) {
      const scores = searchResults.map(r => r.score);
      const allValidScores = scores.every(score => score >= 0 && score <= 1);
      const sortedCorrectly = scores.every((score, idx) => 
        idx === 0 || score <= scores[idx - 1]
      );

      scoreTest.details.scores = scores;
      scoreTest.details.allValid = allValidScores;
      scoreTest.details.sortedCorrectly = sortedCorrectly;
      scoreTest.details.highestScore = scores[0];
      scoreTest.details.lowestScore = scores[scores.length - 1];
      scoreTest.passed = allValidScores && sortedCorrectly;
    } else {
      scoreTest.details.error = 'No results to validate scores';
      scoreTest.passed = false;
    }

    results.tests.push(scoreTest);
    console.log(`✅ Score validation ${scoreTest.passed ? 'passed' : 'failed'}`);

    // Test 3: Search with different queries
    console.log('[SEARCH TEST] Testing different query types...');
    const multiQueryTest = {
      name: 'Multiple Query Types',
      passed: false,
      details: {},
    };

    const testQueries = [
      'database design and PostgreSQL',
      'cloud computing and AWS',
      'TypeScript and GraphQL',
    ];

    const queryResults = [];
    for (const query of testQueries) {
      const results = await searchResumeByQuery(TEST_RESUME_ID, query, 2);
      queryResults.push({
        query,
        resultsCount: results.length,
        topScore: results[0]?.score || 0,
      });
    }

    multiQueryTest.details.queries = queryResults;
    multiQueryTest.details.allQueriesReturnedResults = queryResults.every(q => q.resultsCount > 0);
    multiQueryTest.passed = queryResults.every(q => q.resultsCount > 0);
    results.tests.push(multiQueryTest);
    console.log(`✅ Tested ${testQueries.length} different queries`);

    // Test 4: Search with embedding vector directly
    console.log('[SEARCH TEST] Testing search with embedding vector...');
    const vectorSearchTest = {
      name: 'Direct Vector Search',
      passed: false,
      details: {},
    };

    // Generate embedding for a test query
    const testQuery = 'software engineering and web development';
    const queryEmbeddingResponse = await client.embeddings.create({
      model,
      input: testQuery,
    });
    const queryEmbedding = queryEmbeddingResponse.data[0].embedding;

    const vectorResults = await searchSimilarResumes(queryEmbedding, 5);

    vectorSearchTest.details.queryText = testQuery;
    vectorSearchTest.details.resultsCount = vectorResults.length;
    vectorSearchTest.details.results = vectorResults.map(r => ({
      resumeId: r.resumeId,
      chunkIndex: r.chunkIndex,
      score: r.score,
    }));

    // Should find our test resume
    const foundTestResume = vectorResults.some(r => r.resumeId === TEST_RESUME_ID);
    vectorSearchTest.details.foundTestResume = foundTestResume;
    vectorSearchTest.passed = vectorResults.length > 0;
    results.tests.push(vectorSearchTest);
    console.log(`✅ Vector search returned ${vectorResults.length} results`);

    // Test 5: Filter by resumeId
    console.log('[SEARCH TEST] Testing resumeId filtering...');
    const filterTest = {
      name: 'ResumeId Filter',
      passed: false,
      details: {},
    };

    const filteredResults = await searchResumeByQuery(TEST_RESUME_ID, 'software engineer', 10);
    const allMatchResumeId = filteredResults.every(r => r.resumeId === TEST_RESUME_ID);

    filterTest.details.resultsCount = filteredResults.length;
    filterTest.details.allMatchResumeId = allMatchResumeId;
    filterTest.passed = allMatchResumeId && filteredResults.length > 0;
    results.tests.push(filterTest);
    console.log(`✅ Filter test ${filterTest.passed ? 'passed' : 'failed'}`);

    // All tests passed
    results.passed = results.tests.every(test => test.passed);
    results.duration = Date.now() - results.startTime;

    if (results.passed) {
      console.log('\n✅ All similarity search tests passed!');
    } else {
      console.log('\n❌ Some similarity search tests failed');
    }

    return results;
  } catch (error) {
    results.passed = false;
    results.errors.push({
      message: error.message,
      stack: error.stack,
    });
    results.duration = Date.now() - results.startTime;
    logger.error('[SEARCH TEST] Error:', error);
    console.error('\n❌ Similarity search test failed:', error.message);
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

