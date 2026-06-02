#!/usr/bin/env node

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONFIG_PATH = path.join(__dirname, '../config.json');
const TEST_TIMEOUT = 30000; // 30 seconds per server

// ANSI colors
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
  bold: '\x1b[1m',
  magenta: '\x1b[35m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// Import test files
async function loadTests() {
  const tests = {};

  try {
    const filesystemTests = await import('./filesystem.test.js');
    tests.filesystem = filesystemTests.default;
  } catch (e) {
    log(`Warning: Could not load filesystem tests: ${e.message}`, 'yellow');
  }

  try {
    const automationTests = await import('./automation.test.js');
    tests.automation = automationTests.default;
  } catch (e) {
    log(`Warning: Could not load automation tests: ${e.message}`, 'yellow');
  }

  try {
    const productivityTests = await import('./productivity.test.js');
    tests.productivity = productivityTests.default;
  } catch (e) {
    log(`Warning: Could not load productivity tests: ${e.message}`, 'yellow');
  }

  try {
    const browserTests = await import('./browser.test.js');
    tests.browser = browserTests.default;
  } catch (e) {
    log(`Warning: Could not load browser tests: ${e.message}`, 'yellow');
  }

  try {
    const mediaTests = await import('./media.test.js');
    tests.media = mediaTests.default;
  } catch (e) {
    log(`Warning: Could not load media tests: ${e.message}`, 'yellow');
  }

  return tests;
}

async function testServerTools(serverName, config, tests) {
  log(`\n${colors.bold}Testing: ${serverName}${colors.reset}`, 'cyan');
  log(`Command: ${config.command} ${config.args.join(' ')}`, 'gray');
  log(`Testing ${tests.length} tools...`, 'gray');

  const results = {
    serverName,
    totalTools: tests.length,
    passed: 0,
    failed: 0,
    timeout: 0,
    tests: []
  };

  return new Promise((resolve) => {
    let hasFinished = false;
    let stdout = '';
    let initialized = false;
    let currentTestIndex = 0;
    const pendingResponses = new Map();

    const child = spawn(config.command, config.args, {
      cwd: path.join(__dirname, '../..'),
      env: { ...process.env },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    child.stdout.on('data', (data) => {
      stdout += data.toString();
      const lines = stdout.split('\n');
      stdout = lines.pop() || '';

      for (const line of lines) {
        if (line.trim().startsWith('{')) {
          try {
            const response = JSON.parse(line);
            handleResponse(response);
          } catch (e) {
            // Not valid JSON, ignore
          }
        }
      }
    });

    child.stderr.on('data', () => {
      // Ignore stderr
    });

    child.on('error', (error) => {
      if (!hasFinished) {
        log(`  ✗ Server error: ${error.message}`, 'red');
        finish();
      }
    });

    child.on('close', () => {
      if (!hasFinished) {
        finish();
      }
    });

    function handleResponse(response) {
      // Handle initialization
      if (response.id === 0 && !initialized) {
        initialized = true;
        log(`  ✓ Server initialized`, 'gray');
        setTimeout(() => runNextTest(), 200);
        return;
      }

      // Handle tool responses
      if (response.id > 0 && pendingResponses.has(response.id)) {
        const { test, timeout } = pendingResponses.get(response.id);
        clearTimeout(timeout);
        pendingResponses.delete(response.id);

        const hasError = response.error || (response.result && response.result.isError);
        const content = response.result?.content?.[0]?.text || '';

        if (hasError) {
          results.failed++;
          results.tests.push({
            name: test.name,
            description: test.description,
            status: 'failed',
            error: response.error?.message || content
          });
          log(`    ✗ FAILED: ${response.error?.message || content.substring(0, 60)}`, 'red');
        } else {
          results.passed++;
          results.tests.push({
            name: test.name,
            description: test.description,
            status: 'passed',
            response: content.substring(0, 100)
          });
          log(`    ✓ PASSED`, 'green');
          if (content && content.length > 0 && content.length < 100) {
            log(`      ${content}`, 'gray');
          }
        }

        setTimeout(() => runNextTest(), 200);
      }
    }

    function runNextTest() {
      if (hasFinished) return;

      if (currentTestIndex >= tests.length) {
        finish();
        return;
      }

      const test = tests[currentTestIndex];
      const testId = currentTestIndex + 1;
      currentTestIndex++;

      log(`\n  [${testId}/${tests.length}] ${test.name}`, 'yellow');
      log(`    ${test.description}`, 'gray');

      const request = JSON.stringify({
        jsonrpc: '2.0',
        id: testId,
        method: 'tools/call',
        params: {
          name: test.name,
          arguments: test.args
        }
      });

      try {
        child.stdin.write(request + '\n');

        const timeout = setTimeout(() => {
          if (pendingResponses.has(testId)) {
            pendingResponses.delete(testId);
            results.timeout++;
            results.tests.push({
              name: test.name,
              description: test.description,
              status: 'timeout',
              error: 'No response within 5 seconds'
            });
            log(`    ⏱ TIMEOUT`, 'yellow');
            runNextTest();
          }
        }, 5000);

        pendingResponses.set(testId, { test, timeout });
      } catch (error) {
        results.failed++;
        results.tests.push({
          name: test.name,
          description: test.description,
          status: 'error',
          error: error.message
        });
        log(`    ✗ ERROR: ${error.message}`, 'red');
        runNextTest();
      }
    }

    function finish() {
      if (hasFinished) return;
      hasFinished = true;

      for (const [, { timeout }] of pendingResponses) {
        clearTimeout(timeout);
      }

      try {
        child.kill();
      } catch (e) {}

      resolve(results);
    }

    // Initialize server
    setTimeout(() => {
      const initMessage = JSON.stringify({
        jsonrpc: '2.0',
        id: 0,
        method: 'initialize',
        params: {
          protocolVersion: '2026-11-05',
          capabilities: {},
          clientInfo: {
            name: 'mcp-functional-test',
            version: '1.0.0'
          }
        }
      });

      try {
        child.stdin.write(initMessage + '\n');
      } catch (e) {
        log(`  Failed to initialize: ${e.message}`, 'red');
        finish();
      }
    }, 500);

    setTimeout(() => {
      if (!hasFinished) {
        log(`  ⏱ Overall server timeout`, 'yellow');
        finish();
      }
    }, TEST_TIMEOUT);
  });
}

async function runAllTests() {
  log(`${colors.bold}═══════════════════════════════════════════════════${colors.reset}`, 'blue');
  log(`${colors.bold}     MCP Servers Functional Test Suite            ${colors.reset}`, 'blue');
  log(`${colors.bold}═══════════════════════════════════════════════════${colors.reset}`, 'blue');

  const configContent = fs.readFileSync(CONFIG_PATH, 'utf-8');
  const config = JSON.parse(configContent);
  const servers = config.mcpServers;

  const FUNCTIONAL_TESTS = await loadTests();
  const allResults = [];

  for (const [serverName, serverConfig] of Object.entries(servers)) {

    const tests = FUNCTIONAL_TESTS[serverName];
    if (!tests || tests.length === 0) {
      log(`\n${colors.bold}Skipping: ${serverName}${colors.reset}`, 'yellow');
      log(`  No tests defined`, 'gray');
      continue;
    }

    const results = await testServerTools(serverName, serverConfig, tests);
    allResults.push(results);
  }

  // Summary
  log(`\n${colors.bold}═══════════════════════════════════════════════════${colors.reset}`, 'blue');
  log(`${colors.bold}                  Test Summary                      ${colors.reset}`, 'blue');
  log(`${colors.bold}═══════════════════════════════════════════════════${colors.reset}`, 'blue');

  const totalPassed = allResults.reduce((sum, r) => sum + r.passed, 0);
  const totalFailed = allResults.reduce((sum, r) => sum + r.failed, 0);
  const totalTimeout = allResults.reduce((sum, r) => sum + r.timeout, 0);
  const totalTests = totalPassed + totalFailed + totalTimeout;

  log(`\nTotal Tests: ${totalTests}`, 'bold');
  log(`✓ Passed: ${totalPassed}`, 'green');
  log(`✗ Failed: ${totalFailed}`, 'red');
  log(`⏱ Timeout: ${totalTimeout}`, 'yellow');

  log(`\n${colors.bold}Results by Server:${colors.reset}`, 'cyan');
  for (const result of allResults) {
    const total = result.passed + result.failed + result.timeout;
    const status = result.failed === 0 && result.timeout === 0 ? '✓' : '✗';
    const color = result.failed === 0 && result.timeout === 0 ? 'green' : 'red';

    log(`\n${status} ${result.serverName} (${result.passed}/${result.totalTools} tools passed)`, color);
    log(`  Total tools: ${result.totalTools}`, 'gray');
    log(`  Passed: ${result.passed}, Failed: ${result.failed}, Timeout: ${result.timeout}`, 'gray');

    const testedTools = [...new Set(result.tests.map(t => t.name))];
    log(`  Tested: ${testedTools.join(', ')}`, 'gray');

    const problemTests = result.tests.filter(t => t.status === 'failed' || t.status === 'timeout');
    if (problemTests.length > 0) {
      log(`  Issues:`, 'red');
      problemTests.forEach(t => {
        log(`    • ${t.name}: ${t.error || 'timeout'}`, 'red');
      });
    }
  }

  const resultsPath = path.join(__dirname, 'functional-results.json');
  fs.writeFileSync(resultsPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    summary: {
      totalTests,
      passed: totalPassed,
      failed: totalFailed,
      timeout: totalTimeout
    },
    servers: allResults
  }, null, 2));

  log(`\nDetailed results saved to: ${resultsPath}`, 'gray');
  log(`${colors.bold}═══════════════════════════════════════════════════${colors.reset}\n`, 'blue');

  process.exit(totalFailed > 0 ? 1 : 0);
}

runAllTests().catch(err => {
  log(`\nFatal error: ${err.message}`, 'red');
  console.error(err);
  process.exit(1);
});
