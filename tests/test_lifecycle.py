import os
import sys
import time
import shutil
import asyncio
import httpx
from pathlib import Path

# Add project root to sys.path
BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))

from backend.services.process_manager import ProcessManager


async def run_lifecycle_tests():
    print("=== STARTING DEPLOYNEST PROCESS & LIFECYCLE TESTS (PYTHON) ===\n")

    test_dir = os.path.join(str(BASE_DIR), "data", "test_app_python_temp")
    if os.path.exists(test_dir):
        shutil.rmtree(test_dir, ignore_errors=True)
    os.makedirs(test_dir, exist_ok=True)

    # 1. Create mock Node/Python app 1
    server_code_1 = """
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
"""
    with open(os.path.join(test_dir, "app1.js"), "w", encoding="utf-8") as f:
        f.write(server_code_1)

    # 2. Create mock Node app 2
    server_code_2 = """
const http = require('http');
const port = process.env.PORT || 39802;
const server = http.createServer((req, res) => {
  res.writeHead(200);
  res.end('Hello from App 2');
});
server.listen(port, '0.0.0.0', () => {
  console.log('App 2 listening on ' + port);
});
"""
    with open(os.path.join(test_dir, "app2.js"), "w", encoding="utf-8") as f:
        f.write(server_code_2)

    # 3. Create mock crashing app
    crash_code = """
console.log('Starting failing app...');
process.exit(1);
"""
    with open(os.path.join(test_dir, "crash.js"), "w", encoding="utf-8") as f:
        f.write(crash_code)

    passed = 0
    failed = 0

    def assert_test(condition: bool, name: str):
        nonlocal passed, failed
        if condition:
            print(f"  [PASS] {name}")
            passed += 1
        else:
            print(f"  [FAIL] {name}")
            failed += 1

    try:
        # TEST 1: Start App 1 on Port 39801
        print("TEST 1: Starting Application 1 on port 39801...")
        res1 = ProcessManager.start("repo-1", "node app1.js", test_dir, {}, 39801)
        assert_test(res1.get("success") is True, "ProcessManager.start succeeded for App 1")
        assert_test(isinstance(res1.get("pid"), int), "Process returned a valid PID")

        # TEST 2: Wait for Port and Verify TCP Socket
        print("TEST 2: Verifying TCP port 39801 is open...")
        port1_open = False
        for _ in range(15):
            port1_open = ProcessManager.test_port_open(39801, 0.5)
            if port1_open:
                break
            time.sleep(0.3)
        assert_test(port1_open, "Port 39801 is actively listening")
        assert_test(ProcessManager.is_alive("repo-1"), "ProcessManager.is_alive returns true for App 1")

        # TEST 3: HTTP Request & Health Check Probe
        print("TEST 3: Verifying HTTP response from App 1...")
        async with httpx.AsyncClient() as client:
            http_res = await client.get("http://127.0.0.1:39801/health", timeout=5.0)
            http_data = http_res.json()
            assert_test(http_res.status_code == 200, "HTTP /health returned status 200")
            assert_test(http_data.get("status") == "ok", "HTTP /health returned expected payload")

        # TEST 4: Log File Streaming Verification
        print("TEST 4: Checking deploynest.log file creation and contents...")
        log_file_path = os.path.join(test_dir, "deploynest.log")
        assert_test(os.path.exists(log_file_path), "deploynest.log exists in working directory")
        with open(log_file_path, "r", encoding="utf-8") as f:
            log_content = f.read()
        assert_test("App 1 listening on 39801" in log_content, "deploynest.log contains application stdout")

        # TEST 5: Start Concurrent App 2 on Port 39802
        print("TEST 5: Starting Application 2 concurrently on port 39802...")
        res2 = ProcessManager.start("repo-2", "node app2.js", test_dir, {}, 39802)
        assert_test(res2.get("success") is True, "ProcessManager.start succeeded for App 2")

        port2_open = False
        for _ in range(15):
            port2_open = ProcessManager.test_port_open(39802, 0.5)
            if port2_open:
                break
            time.sleep(0.3)
        assert_test(port2_open, "Port 39802 is actively listening")

        # TEST 6: Stop App 1 while App 2 remains active
        print("TEST 6: Stopping Application 1...")
        stop_res1 = ProcessManager.stop("repo-1")
        assert_test(stop_res1.get("success") is True, "ProcessManager.stop succeeded for App 1")
        time.sleep(0.5)
        assert_test(not ProcessManager.is_alive("repo-1"), "App 1 is confirmed stopped")
        assert_test(ProcessManager.is_alive("repo-2"), "App 2 is still actively running concurrently")

        # TEST 7: Restart Application 1
        print("TEST 7: Restarting Application 1...")
        restart_res1 = ProcessManager.restart("repo-1")
        assert_test(restart_res1.get("success") is True, "ProcessManager.restart succeeded for App 1")
        time.sleep(1.0)
        assert_test(ProcessManager.is_alive("repo-1"), "App 1 is running again after restart")

        # TEST 8: Test Crashing Application Handling
        print("TEST 8: Testing crashing application handling...")
        res_crash = ProcessManager.start("repo-crash", "node crash.js", test_dir, {}, 39803)
        time.sleep(1.0)
        assert_test(not ProcessManager.is_alive("repo-crash"), "Crashing process is recognized as not alive")
        status_crash = ProcessManager.get_status("repo-crash")
        assert_test(status_crash.get("status") in ("STOPPED", "FAILED"), "Status of crashed app is STOPPED/FAILED")

        # CLEANUP
        print("\nCLEANING UP TEST PROCESSES...")
        ProcessManager.stop("repo-1")
        ProcessManager.stop("repo-2")
        ProcessManager.stop("repo-crash")
        shutil.rmtree(test_dir, ignore_errors=True)

    except Exception as e:
        print(f"Exception during test run: {e}")
        failed += 1

    print(f"\n=== TEST SUMMARY: {passed} PASSED, {failed} FAILED ===")
    return failed == 0


def test_process_lifecycle():
    success = asyncio.run(run_lifecycle_tests())
    assert success is True


if __name__ == "__main__":
    success = asyncio.run(run_lifecycle_tests())
    sys.exit(0 if success else 1)
