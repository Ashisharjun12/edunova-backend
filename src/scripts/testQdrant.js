#!/usr/bin/env node

/**
 * Qdrant Test Runner
 * 
 * This script runs all Qdrant tests to verify:
 * - Connection and configuration
 * - Vector storage functionality
 * - Similarity search functionality
 * - Data consistency between PostgreSQL and Qdrant
 * 
 * Usage: node src/scripts/testQdrant.js
 */

import { testConnection } from '../tests/qdrant/connection.test.js';
import { testVectorStorage } from '../tests/qdrant/vectorStorage.test.js';
import { testSimilaritySearch } from '../tests/qdrant/similaritySearch.test.js';
import { testDataConsistency } from '../tests/qdrant/dataConsistency.test.js';
import logger from '../utils/logger.js';

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

const printHeader = (text) => {
  console.log(`\n${colors.cyan}${colors.bright}${'='.repeat(60)}${colors.reset}`);
  console.log(`${colors.cyan}${colors.bright}${text}${colors.reset}`);
  console.log(`${colors.cyan}${colors.bright}${'='.repeat(60)}${colors.reset}\n`);
};

const printTestResult = (result) => {
  const status = result.passed 
    ? `${colors.green}✅ PASSED${colors.reset}` 
    : `${colors.red}❌ FAILED${colors.reset}`;
  
  console.log(`\n${colors.bright}${result.testName}${colors.reset} - ${status}`);
  console.log(`Duration: ${result.duration}ms`);
  
  if (result.tests && result.tests.length > 0) {
    console.log(`\nTest Details:`);
    result.tests.forEach((test, index) => {
      const testStatus = test.passed 
        ? `${colors.green}✓${colors.reset}` 
        : `${colors.red}✗${colors.reset}`;
      console.log(`  ${testStatus} ${test.name}`);
      
      if (test.details && Object.keys(test.details).length > 0) {
        Object.entries(test.details).forEach(([key, value]) => {
          if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
            console.log(`    ${key}:`, JSON.stringify(value, null, 2));
          } else {
            console.log(`    ${key}: ${value}`);
          }
        });
      }
    });
  }
  
  if (result.errors && result.errors.length > 0) {
    console.log(`\n${colors.red}Errors:${colors.reset}`);
    result.errors.forEach((error, index) => {
      console.log(`  ${index + 1}. ${error.message}`);
      if (error.stack) {
        console.log(`     ${error.stack.split('\n')[1]?.trim() || ''}`);
      }
    });
  }
  
  if (result.summary) {
    console.log(`\n${colors.yellow}Summary:${colors.reset}`);
    Object.entries(result.summary).forEach(([key, value]) => {
      console.log(`  ${key}: ${value}`);
    });
  }
};

const printSummary = (results) => {
  const totalTests = results.length;
  const passedTests = results.filter(r => r.passed).length;
  const failedTests = totalTests - passedTests;
  const totalDuration = results.reduce((sum, r) => sum + (r.duration || 0), 0);
  
  printHeader('TEST SUMMARY');
  
  console.log(`Total Tests: ${totalTests}`);
  console.log(`${colors.green}Passed: ${passedTests}${colors.reset}`);
  if (failedTests > 0) {
    console.log(`${colors.red}Failed: ${failedTests}${colors.reset}`);
  }
  console.log(`Total Duration: ${totalDuration}ms`);
  
  const allPassed = failedTests === 0;
  console.log(`\n${colors.bright}Overall Status: ${allPassed ? colors.green + '✅ ALL TESTS PASSED' : colors.red + '❌ SOME TESTS FAILED'}${colors.reset}\n`);
  
  return allPassed;
};

const cleanup = async (results) => {
  console.log(`\n${colors.yellow}Cleaning up test data...${colors.reset}`);
  
  for (const result of results) {
    if (result.cleanup && Array.isArray(result.cleanup)) {
      for (const cleanupFn of result.cleanup) {
        try {
          await cleanupFn();
        } catch (error) {
          logger.warn('Cleanup error:', error);
        }
      }
    }
  }
  
  console.log(`${colors.green}Cleanup complete${colors.reset}\n`);
};

const main = async () => {
  printHeader('QDRANT TEST SUITE');
  
  console.log('Starting Qdrant tests...\n');
  
  const results = [];
  
  try {
    // Test 1: Connection
    printHeader('TEST 1: CONNECTION TEST');
    const connectionResult = await testConnection();
    results.push(connectionResult);
    printTestResult(connectionResult);
    
    // If connection fails, don't continue with other tests
    if (!connectionResult.passed) {
      console.log(`\n${colors.red}Connection test failed. Skipping remaining tests.${colors.reset}`);
      printSummary(results);
      process.exit(1);
    }
    
    // Test 2: Vector Storage
    printHeader('TEST 2: VECTOR STORAGE TEST');
    const storageResult = await testVectorStorage();
    results.push(storageResult);
    printTestResult(storageResult);
    
    // Test 3: Similarity Search
    printHeader('TEST 3: SIMILARITY SEARCH TEST');
    const searchResult = await testSimilaritySearch();
    results.push(searchResult);
    printTestResult(searchResult);
    
    // Test 4: Data Consistency
    printHeader('TEST 4: DATA CONSISTENCY TEST');
    const consistencyResult = await testDataConsistency();
    results.push(consistencyResult);
    printTestResult(consistencyResult);
    
    // Cleanup
    await cleanup(results);
    
    // Print final summary
    const allPassed = printSummary(results);
    
    // Exit with appropriate code
    process.exit(allPassed ? 0 : 1);
    
  } catch (error) {
    logger.error('Test runner error:', error);
    console.error(`\n${colors.red}${colors.bright}Fatal error: ${error.message}${colors.reset}`);
    console.error(error.stack);
    
    // Cleanup on error
    await cleanup(results);
    
    process.exit(1);
  }
};

// Run tests
main().catch((error) => {
  logger.error('Unhandled error:', error);
  console.error(`\n${colors.red}Fatal error: ${error.message}${colors.reset}`);
  process.exit(1);
});

