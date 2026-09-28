import os
import sys
import time
import asyncio
import subprocess
from datetime import datetime, timezone
from typing import Dict, Optional, Callable, Any
import httpx

from backend.config import DEPLOYMENT_ROOT
from backend.database import SessionLocal
from backend.models import Deployment, Repository, DeploymentConfig, DeploymentLog, GithubConnection
from backend.services.crypto_service import decrypt
from backend.services.process_manager import ProcessManager


class DeploymentRunner:
    @classmethod
    async def run_deployment(cls, deployment_id: str):
        """
        Executes the end-to-end deployment lifecycle for a given deployment ID
        """
        db = SessionLocal()
        try:
            deployment = db.query(Deployment).filter(Deployment.id == deployment_id).first()
            if not deployment:
                print(f"[DEPLOY] Deployment {deployment_id} not found")
                return

            repository = deployment.repository
            config = repository.config

            start_time = datetime.now(timezone.utc)
            deployment.status = "PREPARING"
            deployment.startedAt = start_time
            repository.status = "DEPLOYING"
            db.commit()

            def add_log(stage: str, message: str, level: str = "info"):
                print(f"[Deploy {deployment_id[:6]}][{stage}] {message}")
                try:
                    log_entry = DeploymentLog(
                        deploymentId=deployment_id,
                        stage=stage,
                        level=level,
                        message=message,
                    )
                    db.add(log_entry)
                    db.commit()
                except Exception as log_err:
                    print(f"Failed to record log: {log_err}")

            add_log("PREPARING", "Deployment pipeline initialized. Loading configuration...")

            # 1. Determine target directory
            base_root = DEPLOYMENT_ROOT
            if config and config.basePath and config.basePath.strip():
                target_dir = os.path.abspath(config.basePath.strip())
            else:
                target_dir = os.path.abspath(os.path.join(base_root, repository.owner, repository.name))

            try:
                os.makedirs(target_dir, exist_ok=True)
            except PermissionError:
                raise RuntimeError(
                    f"Permission denied creating directory '{target_dir}'. Please grant write permissions to this directory."
                )

            add_log("PREPARING", f"Target directory ready: {target_dir}")

            # 2. Resolve GitHub credentials
            gh_conn = db.query(GithubConnection).order_by(GithubConnection.createdAt.desc()).first()
            clone_url = repository.cloneUrl
            if gh_conn and gh_conn.encryptedAccessToken:
                token = decrypt(gh_conn.encryptedAccessToken)
                if token:
                    clone_url = repository.cloneUrl.replace(
                        "https://github.com",
                        f"https://oauth2:{token}@github.com",
                    )

            branch = deployment.branch or (config.branch if config else None) or repository.defaultBranch or "main"

            # 3. Checkout code
            deployment.status = "CHECKING_OUT"
            db.commit()
            add_log("CHECKOUT", f"Checking out branch '{branch}'...")

            # Git safe directory config
            try:
                subprocess.run(
                    f'git config --global --add safe.directory "{target_dir}"',
                    shell=True,
                    capture_output=True,
                )
                subprocess.run(
                    'git config --global --add safe.directory "*"',
                    shell=True,
                    capture_output=True,
                )
            except Exception:
                pass

            is_git_repo = os.path.exists(os.path.join(target_dir, ".git"))
            if not is_git_repo:
                add_log("CHECKOUT", f"Cloning repository from GitHub into {target_dir}...")
                await cls._run_shell_command(
                    f"git clone --depth 50 --branch {branch} {clone_url} .",
                    target_dir,
                    add_log,
                    "CHECKOUT",
                )
            else:
                add_log("CHECKOUT", f"Fetching latest commits for branch '{branch}'...")
                try:
                    await cls._run_shell_command(f"git fetch origin {branch}", target_dir, add_log, "CHECKOUT")
                    await cls._run_shell_command(f"git checkout {branch}", target_dir, add_log, "CHECKOUT")
                    await cls._run_shell_command(f"git pull origin {branch}", target_dir, add_log, "CHECKOUT")
                except Exception as pull_err:
                    add_log("CHECKOUT", f"Pull warning: {pull_err}. Attempting hard reset to origin/{branch}.", "warn")
                    await cls._run_shell_command(f"git reset --hard origin/{branch}", target_dir, add_log, "CHECKOUT")

            # Read commit metadata
            try:
                res_sha = subprocess.run("git rev-parse --short HEAD", cwd=target_dir, shell=True, capture_output=True, text=True)
                res_msg = subprocess.run("git log -1 --pretty=%B", cwd=target_dir, shell=True, capture_output=True, text=True)
                res_auth = subprocess.run("git log -1 --pretty=%an", cwd=target_dir, shell=True, capture_output=True, text=True)

                if res_sha.returncode == 0:
                    commit_sha = res_sha.stdout.strip()
                    commit_msg = res_msg.stdout.strip().split("\n")[0] if res_msg.returncode == 0 else ""
                    commit_auth = res_auth.stdout.strip() if res_auth.returncode == 0 else "Unknown"

                    deployment.commitSha = commit_sha
                    deployment.commitMessage = commit_msg
                    deployment.commitAuthor = commit_auth
                    db.commit()

                    add_log("CHECKOUT", f"Active commit: [{commit_sha}] {commit_msg} by {commit_auth}")
            except Exception:
                pass

            # 4. Determine Working Directory for Subdirectories / Monorepos
            working_dir = target_dir
            if config and config.rootDirectory and config.rootDirectory.strip():
                candidate = os.path.abspath(os.path.join(target_dir, config.rootDirectory.strip()))
                if os.path.exists(candidate):
                    working_dir = candidate
                    add_log("PREPARING", f"📁 Using working subdirectory: '{config.rootDirectory.strip()}' ({working_dir})")
                else:
                    add_log("PREPARING", f"⚠️ Specified root directory '{config.rootDirectory.strip()}' does not exist inside repository. Defaulting to repository root.", "warn")

            # 5. Inject Environment Variables
            add_log("PREPARING", "Preparing environment variables & writing .env file...")
            env_map: Dict[str, str] = {}
            env_file_lines = []

            for env_var in repository.envVars:
                decrypted_val = decrypt(env_var.encryptedValue)
                env_map[env_var.key] = decrypted_val
                env_file_lines.append(f"{env_var.key}={decrypted_val}")

            if config and config.port:
                env_map["PORT"] = str(config.port)

            if env_file_lines:
                with open(os.path.join(target_dir, ".env"), "w", encoding="utf-8") as f:
                    f.write("\n".join(env_file_lines) + "\n")
                if working_dir != target_dir:
                    try:
                        with open(os.path.join(working_dir, ".env"), "w", encoding="utf-8") as f:
                            f.write("\n".join(env_file_lines) + "\n")
                    except Exception:
                        pass
                add_log("PREPARING", f"Injected {len(env_file_lines)} environment variables into .env")

            # 6. Install Dependencies
            if config and config.installCommand and config.installCommand.strip():
                deployment.status = "INSTALLING"
                db.commit()
                add_log("INSTALL", f"Running: {config.installCommand.strip()}")
                await cls._run_shell_command(
                    config.installCommand.strip(),
                    working_dir,
                    add_log,
                    "INSTALL",
                    env_map,
                )
                add_log("INSTALL", "Dependencies installed successfully.")

            # 7. Build Project
            if config and config.buildCommand and config.buildCommand.strip():
                deployment.status = "BUILDING"
                db.commit()
                add_log("BUILD", f"Running: {config.buildCommand.strip()}")
                await cls._run_shell_command(
                    config.buildCommand.strip(),
                    working_dir,
                    add_log,
                    "BUILD",
                    env_map,
                )
                add_log("BUILD", "Build completed successfully.")

            # 8. Start / Launch Application
            if config and config.startCommand and config.startCommand.strip():
                deployment.status = "DEPLOYING"
                db.commit()
                start_cmd = config.startCommand.strip()
                add_log("DEPLOY", f"Executing start command: {start_cmd}")

                is_docker_compose = "docker compose" in start_cmd or "docker-compose" in start_cmd
                if is_docker_compose:
                    add_log("CONTAINER", "Launching Docker Compose stack...")
                    await cls._run_shell_command(start_cmd, working_dir, add_log, "CONTAINER", env_map)
                    add_log("CONTAINER", "Docker Compose stack launched.")
                else:
                    start_res = ProcessManager.start(
                        repository.id,
                        start_cmd,
                        working_dir,
                        env_map,
                        config.port,
                    )
                    if not start_res.get("success"):
                        raise RuntimeError(f"Process start failed: {start_res.get('message')}")

                    add_log("PROCESS", f"Application process spawned (PID: {start_res.get('pid')}).")

                    # Runtime crash check after 1s
                    await asyncio.sleep(1.0)
                    if not ProcessManager.is_alive(repository.id):
                        logs = ProcessManager.get_logs(repository.id, 10)
                        snippet = " | ".join([l["text"] for l in logs])
                        raise RuntimeError(f"Application process terminated immediately after startup. Details: {snippet or 'Process closed prematurely.'}")

            # 9. Port Availability Check
            target_port = config.port if config else None
            if target_port and target_port > 0:
                deployment.status = "HEALTH_CHECK"
                db.commit()
                add_log("PORT", f"Verifying TCP socket listening on port {target_port}...")

                port_open = False
                max_retries = 15
                for attempt in range(1, max_retries + 1):
                    port_open = ProcessManager.test_port_open(target_port, timeout_s=1.2)
                    if port_open:
                        add_log("PORT", f"Port {target_port} is actively listening on TCP interface.")
                        break

                    if config and "docker" not in config.startCommand and not ProcessManager.is_alive(repository.id):
                        logs = ProcessManager.get_logs(repository.id, 10)
                        snippet = " | ".join([l["text"] for l in logs])
                        raise RuntimeError(f"Application process died while waiting for port {target_port}. Details: {snippet or 'Process exited.'}")

                    add_log("PORT", f"Port {target_port} probe {attempt}/{max_retries} - waiting for socket bind...")
                    await asyncio.sleep(1.0)

                if not port_open:
                    raise RuntimeError(f"Port {target_port} failed to open within {max_retries}s timeout. Ensure your start command binds to 0.0.0.0:{target_port}.")

            # 10. HTTP Health Check Probe
            if target_port and config and config.healthCheckUrl and config.healthCheckUrl.strip():
                health_path = config.healthCheckUrl.strip()
                add_log("HEALTH", f"Verifying HTTP endpoint http://127.0.0.1:{target_port}{health_path}...")
                is_healthy = await cls._probe_health_check(target_port, health_path, 10, add_log)

                if not is_healthy:
                    raise RuntimeError(f"Health check probe failed on http://127.0.0.1:{target_port}{health_path}. Application did not return 200-399 status.")

                add_log("HEALTH", "Health check passed! Application is live and serving HTTP requests.")

            # 11. Post-Health-Check Stabilization Check
            add_log("VERIFY", "Performing post-startup stabilization check...")
            await asyncio.sleep(2.0)

            if config and "docker" not in config.startCommand and not ProcessManager.is_alive(repository.id):
                raise RuntimeError("Application process died shortly after passing health check. Review application logs for runtime crash details.")

            if target_port and target_port > 0:
                if not ProcessManager.test_port_open(target_port, timeout_s=1.5):
                    raise RuntimeError(f"Port {target_port} closed unexpectedly during stabilization check.")

            add_log("VERIFY", "Application process and port verified stable.")

            # 12. Complete Deployment as SUCCESS
            completed_at = datetime.now(timezone.utc)
            duration_s = int((completed_at - start_time).total_seconds())

            deployment.status = "SUCCESS"
            deployment.completedAt = completed_at
            deployment.duration = duration_s
            repository.status = "RUNNING"
            db.commit()

            add_log("SUCCESS", f"Deployment #{deployment_id[:6]} completed successfully in {duration_s}s! Public port: {target_port or 'N/A'}")

        except Exception as err:
            print(f"[DEPLOY] Deployment {deployment_id} failed: {err}")
            completed_at = datetime.now(timezone.utc)
            duration_s = int((completed_at - start_time).total_seconds()) if "start_time" in locals() else 0

            try:
                deployment = db.query(Deployment).filter(Deployment.id == deployment_id).first()
                if deployment:
                    deployment.status = "FAILED"
                    deployment.completedAt = completed_at
                    deployment.duration = duration_s
                    deployment.errorMessage = str(err)
                    if deployment.repository:
                        deployment.repository.status = "FAILED"
                    db.commit()

                log_entry = DeploymentLog(
                    deploymentId=deployment_id,
                    stage="ERROR",
                    level="error",
                    message=f"Deployment failed: {str(err)}",
                )
                db.add(log_entry)
                db.commit()
            except Exception:
                pass
        finally:
            db.close()

    @classmethod
    async def _run_shell_command(
        cls,
        command: str,
        cwd: str,
        add_log: Callable[[str, str, str], None],
        stage: str,
        custom_env: Optional[Dict[str, str]] = None,
    ):
        """
        Executes a shell command asynchronously while streaming stdout/stderr into deployment logs
        """
        custom_env = custom_env or {}
        merged_env = os.environ.copy()
        if stage in ("INSTALL", "BUILD"):
            merged_env["NODE_ENV"] = "development"
        merged_env.update(custom_env)

        proc = await asyncio.create_subprocess_shell(
            command,
            cwd=cwd,
            env=merged_env,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )

        async def read_stream(stream, level: str):
            while True:
                line = await stream.readline()
                if not line:
                    break
                text = line.decode("utf-8", errors="replace").rstrip("\r\n")
                if text.strip():
                    add_log(stage, text.strip(), level)

        await asyncio.gather(
            read_stream(proc.stdout, "info"),
            read_stream(proc.stderr, "warn"),
        )

        return_code = await proc.wait()
        if return_code != 0:
            raise RuntimeError(f"Command '{command}' exited with code {return_code}")

    @classmethod
    async def _probe_health_check(
        cls,
        port: int,
        health_path: str,
        max_retries: int,
        add_log: Callable[[str, str, str], None],
    ) -> bool:
        if not health_path.startswith("/"):
            health_path = f"/{health_path}"
        url = f"http://127.0.0.1:{port}{health_path}"

        async with httpx.AsyncClient() as client:
            for i in range(1, max_retries + 1):
                try:
                    await asyncio.sleep(1.0)
                    res = await client.get(url, timeout=3.0)
                    if 200 <= res.status_code < 400:
                        return True
                    add_log("HEALTH", f"Probe attempt {i}/{max_retries} responded with HTTP {res.status_code}")
                except Exception:
                    add_log("HEALTH", f"Probe attempt {i}/{max_retries} waiting for HTTP response on port {port}...")
        return False
