import http from "http";
import fs from "fs";
import path from "path";
import { ProcessManager } from "../src/server/process-manager";

async function runTests() {
  console.log("=== STARTING DEPLOYNEST PROCESS & LIFECYCLE TESTS ===\n");

  const testDir = path.join(process.cwd(), "data", "test_app_temp");
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true });
  }

  // Create mock Node app 1
  const serverCode1 = `
    const http = require('http');
    const port = process.env.PORT || 39801;
    const server = http.createServer((req, res) => {
      if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', port }));
      } else {
        res.writeHead(200);
        res.end('Hello from App 1');
      }
    });
    server.listen(port, '0.0.0.0', () => {
      console.log('App 1 listening on ' + port);
    });
  `;
  fs.writeFileSync(path.join(testDir, "app1.js"), serverCode1, "utf8");

  // Create mock Node app 2
  const serverCode2 = `
    const http = require('http');
    const port = process.env.PORT || 39802;
    const server = http.createServer((req, res) => {
      res.writeHead(200);
      res.end('Hello from App 2');
    });
    server.listen(port, '0.0.0.0', () => {
      console.log('App 2 listening on ' + port);
    });
  `;
  fs.writeFileSync(path.join(testDir, "app2.js"), serverCode2, "utf8");

  // Create mock crashing app
  const crashCode = `
    console.log('Starting failing app...');
    process.exit(1);
  `;
  fs.writeFileSync(path.join(testDir, "crash.js"), crashCode, "utf8");

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, name: string) {
    if (condition) {
      console.log(`  [PASS] ${name}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${name}`);
      failed++;
    }
  }

  try {
    // TEST 1: Start App 1 on Port 39801
    console.log("TEST 1: Starting Application 1 on port 39801...");
    const res1 = await ProcessManager.start("repo-1", "node app1.js", testDir, {}, 39801);
    assert(res1.success, "ProcessManager.start succeeded for App 1");
    assert(typeof res1.pid === "number", "Process returned a valid PID");

    // TEST 2: Wait for Port and Verify TCP Socket
    console.log("TEST 2: Verifying TCP port 39801 is open...");
    let port1Open = false;
    for (let i = 0; i < 10; i++) {
      port1Open = await ProcessManager.testPortOpen(39801, 500);
      if (port1Open) break;
      await new Promise((r) => setTimeout(r, 200));
    }
    assert(port1Open, "Port 39801 is actively listening");
    assert(ProcessManager.isAlive("repo-1"), "ProcessManager.isAlive returns true for App 1");

    // TEST 3: HTTP Request & Health Check Probe
    console.log("TEST 3: Verifying HTTP response from App 1...");
    const httpRes = await fetch("http://127.0.0.1:39801/health");
    const httpData = await httpRes.json();
    assert(httpRes.status === 200, "HTTP /health returned status 200");
    assert(httpData.status === "ok", "HTTP /health returned expected payload");

    // TEST 4: Log File Streaming Verification
    console.log("TEST 4: Checking deploynest.log file creation and contents...");
    const logFilePath = path.join(testDir, "deploynest.log");
    assert(fs.existsSync(logFilePath), "deploynest.log exists in working directory");
    const logContent = fs.readFileSync(logFilePath, "utf8");
    assert(logContent.includes("App 1 listening on 39801"), "deploynest.log contains application stdout");

    // TEST 5: Start Concurrent App 2 on Port 39802
    console.log("TEST 5: Starting Application 2 concurrently on port 39802...");
    const res2 = await ProcessManager.start("repo-2", "node app2.js", testDir, {}, 39802);
    assert(res2.success, "ProcessManager.start succeeded for App 2");

    let port2Open = false;
    for (let i = 0; i < 10; i++) {
      port2Open = await ProcessManager.testPortOpen(39802, 500);
      if (port2Open) break;
      await new Promise((r) => setTimeout(r, 200));
    }
    assert(port2Open, "Port 39802 is actively listening");
    assert(ProcessManager.isAlive("repo-1"), "App 1 is STILL running concurrently");
    assert(ProcessManager.isAlive("repo-2"), "App 2 is running concurrently");

    // TEST 6: Crashing App Handling
    console.log("TEST 6: Testing crashing application lifecycle...");
    const resCrash = await ProcessManager.start("repo-crash", "node crash.js", testDir, {});
    assert(resCrash.success, "ProcessManager initiated spawn for crash app");
    await new Promise((r) => setTimeout(r, 600));
    assert(!ProcessManager.isAlive("repo-crash"), "Crashing process is recognized as NOT alive");
    const crashStatus = ProcessManager.getStatus("repo-crash");
    assert(crashStatus.status === "FAILED", "Crashing process status is FAILED");

    // TEST 7: Port Probe on Closed Port
    console.log("TEST 7: Testing TCP port probe on unused port 39899...");
    const unusedPortOpen = await ProcessManager.testPortOpen(39899, 400);
    assert(!unusedPortOpen, "Unused port 39899 correctly reported as closed");

    // TEST 8: App Restart Verification
    console.log("TEST 8: Testing application restart for App 1...");
    const restartRes = await ProcessManager.restart("repo-1");
    assert(restartRes.success, "ProcessManager.restart succeeded");
    await new Promise((r) => setTimeout(r, 500));
    const port1AfterRestart = await ProcessManager.testPortOpen(39801, 1000);
    assert(port1AfterRestart, "Port 39801 is open after restart");

    // TEST 9: Teardown & Stop
    console.log("TEST 9: Testing application stop and port release...");
    await ProcessManager.stop("repo-1");
    await ProcessManager.stop("repo-2");
    await new Promise((r) => setTimeout(r, 500));
    assert(!ProcessManager.isAlive("repo-1"), "App 1 is stopped");
    assert(!ProcessManager.isAlive("repo-2"), "App 2 is stopped");
    const port1Closed = !(await ProcessManager.testPortOpen(39801, 400));
    const port2Closed = !(await ProcessManager.testPortOpen(39802, 400));
    assert(port1Closed, "Port 39801 is closed and released");
    assert(port2Closed, "Port 39802 is closed and released");

    console.log(`\n=== TEST RESULTS: ${passed} PASSED, ${failed} FAILED ===\n`);
    if (failed > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error("Test execution failed:", err);
    process.exit(1);
  } finally {
    try {
      await ProcessManager.stop("repo-1");
      await ProcessManager.stop("repo-2");
      await ProcessManager.stop("repo-crash");
      fs.rmSync(testDir, { recursive: true, force: true });
    } catch {}
  }
}

runTests();
