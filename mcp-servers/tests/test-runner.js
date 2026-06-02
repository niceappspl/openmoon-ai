#!/usr/bin/env node

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONFIG_PATH = path.join(__dirname, '../config.json');
const TEST_TIMEOUT = 10000; // 10 seconds per test

// ANSI colors
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  gray: '\x1b[90m',
  bold: '\x1b[1m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function testMCPServer(name, config) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    let stdout = '';
    let stderr = '';
    let hasResponded = false;

    log(`\n${colors.bold}Testing: ${name}${colors.reset}`, 'blue');
    log(`Command: ${config.command} ${config.args.join(' ')}`, 'gray');
    log(`Description: ${config.description}`, 'gray');

    const child = spawn(config.command, config.args, {
      cwd: path.join(__dirname, '../..'),
      env: { ...process.env },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    // Test if server responds to initialization
    const initMessage = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2026-11-05',
        capabilities: {},
        clientInfo: {
          name: 'mcp-test-runner',
          version: '1.0.0'
        }
      }
    });

    child.stdout.on('data', (data) => {
      stdout += data.toString();
      const lines = stdout.split('\n');

      for (const line of lines) {
        if (line.trim().startsWith('{')) {
          try {
            const response = JSON.parse(line);
            if (response.id === 1 && !hasResponded) {
              hasResponded = true;
              const duration = Date.now() - startTime;
              log(`✓ PASSED (${duration}ms)`, 'green');
              log(`  Server initialized successfully`, 'gray');
              child.kill();
              resolve({
                name,
                status: 'passed',
                duration,
                response
              });
            }
          } catch (e) {
            // Not valid JSON, continue
          }
        }
      }
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('error', (error) => {
      if (!hasResponded) {
        hasResponded = true;
        const duration = Date.now() - startTime;
        log(`✗ FAILED (${duration}ms)`, 'red');
        log(`  Error: ${error.message}`, 'red');
        resolve({
          name,
          status: 'failed',
          duration,
          error: error.message
        });
      }
    });

    child.on('close', (code) => {
      if (!hasResponded) {
        hasResponded = true;
        const duration = Date.now() - startTime;
        if (code === 0 || stdout.includes('result')) {
          log(`✓ PASSED (${duration}ms)`, 'green');
          resolve({
            name,
            status: 'passed',
            duration
          });
        } else {
          log(`✗ FAILED (${duration}ms)`, 'red');
          log(`  Exit code: ${code}`, 'red');
          if (stderr) log(`  Error: ${stderr.substring(0, 200)}`, 'red');
          resolve({
            name,
            status: 'failed',
            duration,
            error: `Exit code ${code}`,
            stderr: stderr.substring(0, 500)
          });
        }
      }
    });

    // Send initialization message after a short delay
    setTimeout(() => {
      try {
        child.stdin.write(initMessage + '\n');
      } catch (e) {
        // Ignore write errors
      }
    }, 500);

    // Timeout
    setTimeout(() => {
      if (!hasResponded) {
        hasResponded = true;
        const duration = Date.now() - startTime;
        log(`✗ TIMEOUT (${duration}ms)`, 'yellow');
        log(`  Server did not respond within ${TEST_TIMEOUT}ms`, 'yellow');
        child.kill();
        resolve({
          name,
          status: 'timeout',
          duration,
          error: 'Timeout'
        });
      }
    }, TEST_TIMEOUT);
  });
}

async function runAllTests() {
  log(`${colors.bold}═══════════════════════════════════════════════════${colors.reset}`, 'blue');
  log(`${colors.bold}        MCP Servers Health Check Test Suite        ${colors.reset}`, 'blue');
  log(`${colors.bold}═══════════════════════════════════════════════════${colors.reset}`, 'blue');

  // Load config
  const configContent = fs.readFileSync(CONFIG_PATH, 'utf-8');
  const config = JSON.parse(configContent);
  const servers = config.mcpServers;

  const results = [];

  // Run tests sequentially to avoid resource conflicts
  for (const [name, serverConfig] of Object.entries(servers)) {
    const result = await testMCPServer(name, serverConfig);
    results.push(result);
  }

  // Summary
  log(`\n${colors.bold}═══════════════════════════════════════════════════${colors.reset}`, 'blue');
  log(`${colors.bold}                    Test Summary                    ${colors.reset}`, 'blue');
  log(`${colors.bold}═══════════════════════════════════════════════════${colors.reset}`, 'blue');

  const passed = results.filter(r => r.status === 'passed');
  const failed = results.filter(r => r.status === 'failed');
  const timeout = results.filter(r => r.status === 'timeout');

  log(`\nTotal: ${results.length}`, 'bold');
  log(`✓ Passed: ${passed.length}`, 'green');
  log(`✗ Failed: ${failed.length}`, 'red');
  log(`⏱ Timeout: ${timeout.length}`, 'yellow');

  if (passed.length > 0) {
    log(`\n${colors.bold}Working Servers:${colors.reset}`, 'green');
    passed.forEach(r => log(`  • ${r.name} (${r.duration}ms)`, 'green'));
  }

  if (failed.length > 0) {
    log(`\n${colors.bold}Failed Servers:${colors.reset}`, 'red');
    failed.forEach(r => log(`  • ${r.name}: ${r.error}`, 'red'));
  }

  if (timeout.length > 0) {
    log(`\n${colors.bold}Timeout Servers:${colors.reset}`, 'yellow');
    timeout.forEach(r => log(`  • ${r.name}`, 'yellow'));
  }

  // Save results to JSON
  const resultsPath = path.join(__dirname, 'results.json');
  fs.writeFileSync(resultsPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    summary: {
      total: results.length,
      passed: passed.length,
      failed: failed.length,
      timeout: timeout.length
    },
    results
  }, null, 2));

  log(`\nResults saved to: ${resultsPath}`, 'gray');
  log(`${colors.bold}═══════════════════════════════════════════════════${colors.reset}\n`, 'blue');

  // Exit with error code if any tests failed
  process.exit(failed.length > 0 || timeout.length > 0 ? 1 : 0);
}

runAllTests().catch(err => {
  log(`\nFatal error: ${err.message}`, 'red');
  console.error(err);
  process.exit(1);
});
