import qdrantService, { qdrantClient } from '../../config/vectordb.js';
import { _config } from '../../config/config.js';
import logger from '../../utils/logger.js';

/**
 * Test Qdrant connection and configuration
 * @returns {Promise<Object>} Test results
 */
export const testConnection = async () => {
  const results = {
    testName: 'Qdrant Connection Test',
    passed: false,
    tests: [],
    errors: [],
    startTime: Date.now(),
  };

  try {
    // Test 1: Check configuration
    console.log('\n[CONNECTION TEST] Checking Qdrant configuration...');
    const configTest = {
      name: 'Configuration Check',
      passed: false,
      details: {},
    };

    const qdrantUrl = _config.QDRANT_URL;
    const qdrantApiKey = _config.QDRANT_API_KEY;

    if (!qdrantUrl) {
      configTest.details.error = 'QDRANT_URL is not configured';
      results.tests.push(configTest);
      throw new Error('QDRANT_URL is not configured');
    }

    if (!qdrantApiKey) {
      configTest.details.error = 'QDRANT_API_KEY is not configured';
      results.tests.push(configTest);
      throw new Error('QDRANT_API_KEY is not configured');
    }

    configTest.details.url = qdrantUrl;
    configTest.details.apiKeyConfigured = !!qdrantApiKey;
    configTest.details.apiKeyLength = qdrantApiKey?.length || 0;
    configTest.passed = true;
    results.tests.push(configTest);
    console.log('✅ Configuration check passed');

    // Test 2: Check client initialization
    console.log('[CONNECTION TEST] Checking client initialization...');
    const clientTest = {
      name: 'Client Initialization',
      passed: false,
      details: {},
    };

    const client = qdrantService.getClient();
    if (!client) {
      clientTest.details.error = 'Client is null';
      results.tests.push(clientTest);
      throw new Error('Qdrant client is not initialized');
    }

    clientTest.details.clientInitialized = true;
    clientTest.details.isConnected = qdrantService.isClientConnected();
    clientTest.passed = true;
    results.tests.push(clientTest);
    console.log('✅ Client initialization check passed');

    // Test 3: Verify connection
    console.log('[CONNECTION TEST] Verifying connection...');
    const connectionTest = {
      name: 'Connection Verification',
      passed: false,
      details: {},
    };

    const connectionResult = await qdrantService.verifyConnection();
    
    if (!connectionResult.connected) {
      connectionTest.details.error = connectionResult.error || 'Connection verification failed';
      results.tests.push(connectionTest);
      throw new Error(connectionResult.error || 'Connection verification failed');
    }

    connectionTest.details.connected = true;
    connectionTest.details.collectionsCount = connectionResult.collections?.length || 0;
    connectionTest.details.collections = connectionResult.collections?.map(c => c.name) || [];
    connectionTest.passed = true;
    results.tests.push(connectionTest);
    console.log(`✅ Connection verified. Found ${connectionResult.collections?.length || 0} collections`);

    // Test 4: Test basic API call
    console.log('[CONNECTION TEST] Testing basic API call...');
    const apiTest = {
      name: 'Basic API Call',
      passed: false,
      details: {},
    };

    const collections = await qdrantClient.getCollections();
    
    if (!collections || !Array.isArray(collections.collections)) {
      apiTest.details.error = 'Invalid response from getCollections';
      results.tests.push(apiTest);
      throw new Error('Invalid response from getCollections');
    }

    apiTest.details.collectionsRetrieved = collections.collections.length;
    apiTest.details.collectionNames = collections.collections.map(c => c.name);
    apiTest.passed = true;
    results.tests.push(apiTest);
    console.log(`✅ Basic API call successful. Retrieved ${collections.collections.length} collections`);

    // All tests passed
    results.passed = results.tests.every(test => test.passed);
    results.duration = Date.now() - results.startTime;

    if (results.passed) {
      console.log('\n✅ All connection tests passed!');
    } else {
      console.log('\n❌ Some connection tests failed');
    }

    return results;
  } catch (error) {
    results.passed = false;
    results.errors.push({
      message: error.message,
      stack: error.stack,
    });
    results.duration = Date.now() - results.startTime;
    logger.error('[CONNECTION TEST] Error:', error);
    console.error('\n❌ Connection test failed:', error.message);
    return results;
  }
};

