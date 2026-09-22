import os
import sys
import time
import socket
import asyncio
import signal
import subprocess
import threading
from datetime import datetime
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, field

MAX_LOG_BUFFER = 500


@dataclass
class RunningProcess:
    repo_id: str
    command: str
    cwd: str
    env: Dict[str, str]
    port: Optional[int]
    process: Optional[subprocess.Popen]
    pid: Optional[int]
    status: str  # "RUNNING" | "STOPPED" | "FAILED"
    started_at: Optional[datetime]
    logs: List[Dict[str, Any]] = field(default_factory=list)


# Global process storage
_processes: Dict[str, RunningProcess] = {}
_lock = threading.Lock()


class ProcessManager:
    @classmethod
    def start(
        cls,
        repo_id: str,
        command: str,
        cwd: str,
        env: Optional[Dict[str, str]] = None,
        port: Optional[int] = None,
    ) -> Dict[str, Any]:
        """
        Starts an application process in the background and tracks its lifecycle
        """
        env = env or {}

        # If already running, stop existing instance
        if repo_id in _processes:
            existing = _processes[repo_id]
            if existing.status == "RUNNING":
                cls.stop(repo_id)

        if not os.path.exists(cwd):
            return {
                "success": False,
                "message": f"Working directory does not exist: {cwd}",
            }

        try:
            is_windows = os.name == "nt"
            merged_env = os.environ.copy()
            merged_env.update(env)
            merged_env["PORT"] = str(port) if port else env.get("PORT", "3000")

            log_file_path = os.path.join(cwd, "deploynest.log")

            # Platform-specific process group creation
            kwargs = {
                "cwd": cwd,
                "env": merged_env,
                "shell": True,
                "stdout": subprocess.PIPE,
                "stderr": subprocess.PIPE,
                "stdin": subprocess.DEVNULL,
                "text": True,
                "bufsize": 1,
            }

            if is_windows:
                kwargs["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP
            else:
                kwargs["preexec_fn"] = os.setsid

            proc = subprocess.Popen(command, **kwargs)

            proc_record = RunningProcess(
                repo_id=repo_id,
                command=command,
                cwd=cwd,
                env=env,
                port=port,
                process=proc,
                pid=proc.pid,
                status="RUNNING",
                started_at=datetime.utcnow(),
                logs=[],
            )

            with _lock:
                _processes[repo_id] = proc_record

            def append_to_file(text: str):
                try:
                    with open(log_file_path, "a", encoding="utf-8") as f:
                        f.write(f"[{datetime.utcnow().isoformat()}] {text}\n")
                except Exception:
                    pass

            def read_stream(stream, stream_name: str):
                try:
                    for line in iter(stream.readline, ""):
                        if not line:
                            break
                        clean_line = line.rstrip("\r\n")
                        if clean_line:
                            cls._append_log(repo_id, clean_line, stream_name)
                            prefix = "[STDERR] " if stream_name == "stderr" else ""
                            append_to_file(f"{prefix}{clean_line}")
                except Exception:
                    pass
                finally:
                    try:
                        stream.close()
                    except Exception:
                        pass

            # Spawn reader threads
            t_out = threading.Thread(target=read_stream, args=(proc.stdout, "stdout"), daemon=True)
            t_err = threading.Thread(target=read_stream, args=(proc.stderr, "stderr"), daemon=True)
            t_out.start()
            t_err.start()

            # Spawn monitor thread
            def monitor_exit():
                return_code = proc.wait()
                exit_msg = f"Process exited with code {return_code}"
                cls._append_log(repo_id, exit_msg, "stdout" if return_code == 0 else "stderr")
                append_to_file(f"[EXIT] {exit_msg}")

                with _lock:
                    if repo_id in _processes and _processes[repo_id].status == "RUNNING":
                        _processes[repo_id].status = "STOPPED" if return_code == 0 else "FAILED"

            t_mon = threading.Thread(target=monitor_exit, daemon=True)
            t_mon.start()

            return {
                "success": True,
                "message": f"Process started successfully with PID {proc.pid}",
                "pid": proc.pid,
            }
        except Exception as err:
            return {
                "success": False,
                "message": f"Failed to spawn process: {str(err)}",
            }

    @classmethod
    def is_alive(cls, repo_id: str) -> bool:
        """
        Checks whether the application process is actively running
        """
        with _lock:
            proc_record = _processes.get(repo_id)

        if not proc_record or proc_record.status != "RUNNING" or not proc_record.process:
            return False

        poll_result = proc_record.process.poll()
        if poll_result is not None:
            proc_record.status = "STOPPED" if poll_result == 0 else "FAILED"
            return False

        return True

    @classmethod
    def stop(cls, repo_id: str) -> Dict[str, Any]:
        """
        Stops a running application process
        """
        with _lock:
            proc_record = _processes.get(repo_id)

        if not proc_record or not proc_record.process:
            return {"success": True, "message": "Process was not running"}

        try:
            pid = proc_record.pid
            if pid:
                if os.name == "nt":
                    try:
                        subprocess.run(
                            f"taskkill /pid {pid} /T /F",
                            shell=True,
                            capture_output=True,
                            timeout=5,
                        )
                    except Exception:
                        pass
                else:
                    try:
                        pgid = os.getpgid(pid)
                        os.killpg(pgid, signal.SIGTERM)
                    except Exception:
                        try:
                            proc_record.process.terminate()
                        except Exception:
                            pass

                    # Wait and force kill if still alive
                    time.sleep(0.5)
                    try:
                        os.kill(pid, 0)
                        try:
                            os.killpg(os.getpgid(pid), signal.SIGKILL)
                        except Exception:
                            proc_record.process.kill()
                    except Exception:
                        pass

            proc_record.status = "STOPPED"
            proc_record.process = None
            return {"success": True, "message": "Process stopped successfully"}
        except Exception as err:
            return {"success": False, "message": f"Failed to stop process: {str(err)}"}

    @classmethod
    def restart(cls, repo_id: str) -> Dict[str, Any]:
        """
        Restarts a configured application
        """
        with _lock:
            proc_record = _processes.get(repo_id)

        if not proc_record:
            return {"success": False, "message": "No previous process configuration found"}

        cls.stop(repo_id)
        return cls.start(
            repo_id=repo_id,
            command=proc_record.command,
            cwd=proc_record.cwd,
            env=proc_record.env,
            port=proc_record.port,
        )

    @classmethod
    def test_port_open(cls, port: int, timeout_s: float = 2.0) -> bool:
        """
        Tests whether a given TCP port is open and listening locally (IPv4 and IPv6)
        """
        for host in ("127.0.0.1", "::1"):
            try:
                family = socket.AF_INET if host == "127.0.0.1" else socket.AF_INET6
                s = socket.socket(family, socket.SOCK_STREAM)
                s.settimeout(timeout_s)
                s.connect((host, port))
                s.close()
                return True
            except Exception:
                continue
        return False

    @classmethod
    def get_status(cls, repo_id: str) -> Dict[str, Any]:
        """
        Gets the current runtime status for a repository
        """
        with _lock:
            proc_record = _processes.get(repo_id)

        if not proc_record:
            return {"status": "STOPPED"}

        alive = cls.is_alive(repo_id)
        status = "RUNNING" if alive else ("STOPPED" if proc_record.status == "RUNNING" else proc_record.status)

        uptime = None
        if proc_record.started_at and status == "RUNNING":
            uptime = int((datetime.utcnow() - proc_record.started_at).total_seconds())

        return {
            "status": status,
            "pid": proc_record.pid,
            "port": proc_record.port,
            "startedAt": proc_record.started_at.isoformat() if proc_record.started_at else None,
            "uptime": uptime,
            "isAlive": alive,
        }

    @classmethod
    def get_logs(cls, repo_id: str, limit: int = 100) -> List[Dict[str, Any]]:
        """
        Gets the buffered application logs
        """
        with _lock:
            proc_record = _processes.get(repo_id)
            if not proc_record:
                return []
            return list(proc_record.logs[-limit:])

    @classmethod
    def _append_log(cls, repo_id: str, text: str, stream: str):
        with _lock:
            proc_record = _processes.get(repo_id)
            if not proc_record:
                return

            for line in text.split("\n"):
                clean = line.strip()
                if clean:
                    proc_record.logs.append({
                        "timestamp": datetime.utcnow().isoformat(),
                        "text": clean,
                        "stream": stream,
                    })

            if len(proc_record.logs) > MAX_LOG_BUFFER:
                proc_record.logs = proc_record.logs[-MAX_LOG_BUFFER:]
