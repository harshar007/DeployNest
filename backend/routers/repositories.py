import os
import subprocess
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
import httpx

from backend.config import APP_URL, GITHUB_WEBHOOK_SECRET, DEPLOYMENT_ROOT
from backend.database import get_db
from backend.models import (
    Repository,
    DeploymentConfig,
    Deployment,
    EnvironmentVariable,
    GithubConnection,
)
from backend.schemas import (
    DeploymentConfigSchema,
    DeployRequest,
    EnvVarCreateRequest,
)
from backend.services.auth_service import get_current_user
from backend.services.crypto_service import encrypt, decrypt
from backend.services.github_service import (
    fetch_repo_branches,
    setup_github_webhook,
    delete_github_webhook,
)
from backend.services.presets_service import FRAMEWORK_PRESETS, detect_preset_from_files
from backend.services.process_manager import ProcessManager
from backend.services.queue_service import deployment_queue

router = APIRouter(prefix="/api/repositories", tags=["repositories"])


@router.get("")
def list_repositories(
    filter: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    repos = db.query(Repository).order_by(Repository.updatedAt.desc()).all()
    enriched = []

    for repo in repos:
        runtime = ProcessManager.get_status(repo.id)
        current_status = repo.status
        if runtime.get("status") == "RUNNING":
            current_status = "RUNNING"
        elif runtime.get("status") == "STOPPED" and repo.status == "RUNNING":
            current_status = "STOPPED"

        latest_deploy = (
            db.query(Deployment)
            .filter(Deployment.repositoryId == repo.id)
            .order_by(Deployment.createdAt.desc())
            .first()
        )

        repo_dict = repo.to_dict(include_config=True)
        repo_dict["status"] = current_status
        repo_dict["runtime"] = runtime
        repo_dict["latestDeployment"] = latest_deploy.to_dict() if latest_deploy else None
        enriched.append(repo_dict)

    filtered = enriched
    if filter == "configured":
        filtered = [r for r in filtered if r.get("config") is not None]
    elif filter == "running":
        filtered = [r for r in filtered if r.get("status") == "RUNNING"]

    if search:
        s = search.lower()
        filtered = [
            r for r in filtered
            if s in r["name"].lower()
            or s in r["fullName"].lower()
            or (r.get("description") and s in r["description"].lower())
        ]

    return {"repositories": filtered}


@router.get("/{repo_id}")
def get_repository(
    repo_id: str,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    repo = db.query(Repository).filter(Repository.id == repo_id).first()
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    runtime = ProcessManager.get_status(repo.id)
    repo_dict = repo.to_dict(include_config=True, include_deployments=True, include_env=True)
    repo_dict["runtime"] = runtime

    return {"repository": repo_dict}


@router.delete("/{repo_id}")
def delete_repository(
    repo_id: str,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    repo = db.query(Repository).filter(Repository.id == repo_id).first()
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    ProcessManager.stop(repo_id)
    db.delete(repo)
    db.commit()

    return {"success": True}


@router.get("/{repo_id}/branches")
async def get_branches(
    repo_id: str,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    repo = db.query(Repository).filter(Repository.id == repo_id).first()
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    gh_conn = db.query(GithubConnection).order_by(GithubConnection.createdAt.desc()).first()
    if not gh_conn:
        return {"branches": [repo.defaultBranch or "main"]}

    token = decrypt(gh_conn.encryptedAccessToken)
    branches = await fetch_repo_branches(token, repo.owner, repo.name)
    return {"branches": branches}


@router.get("/{repo_id}/config")
def get_config(
    repo_id: str,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    config = db.query(DeploymentConfig).filter(DeploymentConfig.repositoryId == repo_id).first()
    return {"config": config.to_dict() if config else None}


@router.post("/{repo_id}/config")
async def save_config(
    repo_id: str,
    payload: DeploymentConfigSchema,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    repo = db.query(Repository).filter(Repository.id == repo_id).first()
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    gh_conn = db.query(GithubConnection).order_by(GithubConnection.createdAt.desc()).first()
    webhook_id = None

    # Automatic webhook configuration on GitHub
    if gh_conn and payload.autoDeploy:
        try:
            token = decrypt(gh_conn.encryptedAccessToken)
            webhook_url = f"{APP_URL}/api/webhooks/github"
            webhook_id = await setup_github_webhook(
                token,
                repo.owner,
                repo.name,
                webhook_url,
                GITHUB_WEBHOOK_SECRET,
            )
        except Exception as wh_err:
            print(f"Auto webhook setup error: {wh_err}")

    config = db.query(DeploymentConfig).filter(DeploymentConfig.repositoryId == repo.id).first()
    if config:
        config.branch = (payload.branch or "main").strip()
        config.basePath = (payload.basePath or "").strip()
        config.rootDirectory = (payload.rootDirectory or "").strip()
        config.frameworkPreset = (payload.frameworkPreset or "custom").strip()
        config.installCommand = (payload.installCommand or "npm install").strip()
        config.buildCommand = (payload.buildCommand or "npm run build").strip()
        config.startCommand = (payload.startCommand or "npm start").strip()
        config.processManager = (payload.processManager or "node").strip()
        config.port = payload.port
        config.healthCheckUrl = (payload.healthCheckUrl or "/health").strip()
        config.autoDeploy = bool(payload.autoDeploy)
        if webhook_id:
            config.webhookId = webhook_id
    else:
        config = DeploymentConfig(
            repositoryId=repo.id,
            branch=(payload.branch or "main").strip(),
            basePath=(payload.basePath or "").strip(),
            rootDirectory=(payload.rootDirectory or "").strip(),
            frameworkPreset=(payload.frameworkPreset or "custom").strip(),
            installCommand=(payload.installCommand or "npm install").strip(),
            buildCommand=(payload.buildCommand or "npm run build").strip(),
            startCommand=(payload.startCommand or "npm start").strip(),
            processManager=(payload.processManager or "node").strip(),
            port=payload.port,
            healthCheckUrl=(payload.healthCheckUrl or "/health").strip(),
            autoDeploy=bool(payload.autoDeploy),
            webhookId=webhook_id,
        )
        db.add(config)

    if repo.status == "NOT_CONFIGURED":
        repo.status = "CONFIGURED"

    db.commit()
    db.refresh(config)

    return {"success": True, "config": config.to_dict()}


@router.post("/{repo_id}/deploy")
def trigger_deployment(
    repo_id: str,
    payload: Optional[DeployRequest] = None,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    repo = db.query(Repository).filter(Repository.id == repo_id).first()
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    repo_config = repo.config
    if not repo_config:
        repo_config = DeploymentConfig(
            repositoryId=repo.id,
            branch=repo.defaultBranch or "main",
            frameworkPreset="custom",
            installCommand="npm install",
            buildCommand="npm run build",
            startCommand="npm start",
            port=3000,
            healthCheckUrl="/",
            autoDeploy=True,
        )
        db.add(repo_config)
        repo.status = "CONFIGURED"
        db.commit()

    branch = (payload.branch if payload and payload.branch else None) or repo_config.branch or repo.defaultBranch or "main"

    deployment = Deployment(
        repositoryId=repo.id,
        branch=branch,
        triggerType="MANUAL",
        status="QUEUED",
    )
    db.add(deployment)
    db.commit()
    db.refresh(deployment)

    deployment_queue.add(deployment.id)

    return {
        "success": True,
        "message": "Deployment queued successfully",
        "deploymentId": deployment.id,
    }


@router.get("/{repo_id}/detect")
async def detect_repository_stack(
    repo_id: str,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    repo = db.query(Repository).filter(Repository.id == repo_id).first()
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    base_root = DEPLOYMENT_ROOT
    local_dir = (
        os.path.abspath(repo.config.basePath.strip())
        if (repo.config and repo.config.basePath and repo.config.basePath.strip())
        else os.path.abspath(os.path.join(base_root, repo.owner, repo.name))
    )

    file_list = []
    subdirectories = []

    # 1. Local filesystem scan if directory exists
    if os.path.exists(local_dir):
        try:
            for entry in os.scandir(local_dir):
                if entry.name in (".git", "node_modules", ".next", "__pycache__"):
                    continue
                if entry.is_dir():
                    subdirectories.append(entry.name)
                    file_list.append(f"{entry.name}/")
                    try:
                        for sub in os.scandir(entry.path):
                            file_list.append(f"{entry.name}/{sub.name}")
                    except Exception:
                        pass
                else:
                    file_list.append(entry.name)
        except Exception as scan_err:
            print(f"Local scan warning: {scan_err}")

    # 2. Remote GitHub scan if local directory is empty
    if not file_list:
        gh_conn = db.query(GithubConnection).order_by(GithubConnection.createdAt.desc()).first()
        if gh_conn:
            try:
                token = decrypt(gh_conn.encryptedAccessToken)
                async with httpx.AsyncClient() as client:
                    res = await client.get(
                        f"https://api.github.com/repos/{repo.owner}/{repo.name}/contents",
                        headers={
                            "Authorization": f"Bearer {token}",
                            "Accept": "application/vnd.github+json",
                            "User-Agent": "DeployNest-Python-Backend",
                        },
                        timeout=10.0,
                    )
                    if res.status_code == 200:
                        contents = res.json()
                        if isinstance(contents, list):
                            for item in contents:
                                name = item.get("name", "")
                                if item.get("type") == "dir":
                                    subdirectories.append(name)
                                    file_list.append(f"{name}/")
                                else:
                                    file_list.append(name)

                            for sub in ("frontend", "backend", "client", "server", "app", "web", "api"):
                                if sub in subdirectories:
                                    try:
                                        sub_res = await client.get(
                                            f"https://api.github.com/repos/{repo.owner}/{repo.name}/contents/{sub}",
                                            headers={
                                                "Authorization": f"Bearer {token}",
                                                "Accept": "application/vnd.github+json",
                                                "User-Agent": "DeployNest-Python-Backend",
                                            },
                                            timeout=10.0,
                                        )
                                        if sub_res.status_code == 200:
                                            sub_contents = sub_res.json()
                                            if isinstance(sub_contents, list):
                                                for s_item in sub_contents:
                                                    file_list.append(f"{sub}/{s_item.get('name')}")
                                    except Exception:
                                        pass
            except Exception as gh_err:
                print(f"GitHub contents fetch warning: {gh_err}")

    detection = detect_preset_from_files(file_list)
    detection["detectedFiles"] = file_list[:30]
    detection["subdirectories"] = subdirectories

    return {
        "success": True,
        "detection": detection,
        "availablePresets": FRAMEWORK_PRESETS,
    }


@router.get("/{repo_id}/diagnose")
def diagnose_repository(
    repo_id: str,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    repo = db.query(Repository).filter(Repository.id == repo_id).first()
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    port = repo.config.port if repo.config and repo.config.port else 3000
    process_status = ProcessManager.get_status(repo.id)
    is_listening = ProcessManager.test_port_open(port, timeout_s=1.5)

    ufw_status = f"Running on {os.name}"
    ufw_port_allowed = False

    if os.name != "nt":
        try:
            res = subprocess.run("sudo ufw status || ufw status", shell=True, capture_output=True, text=True, timeout=3)
            ufw_status = res.stdout
            if str(port) in res.stdout:
                ufw_port_allowed = True
        except Exception as ufw_err:
            ufw_status = f"UFW check not available: {ufw_err}"

    status_text = "HEALTHY"
    suggestions = []

    if process_status.get("status") != "RUNNING":
        status_text = "PROCESS_STOPPED"
        suggestions.append("The application process is currently stopped. Click 'Start App' or 'Deploy Now'.")
    elif not is_listening:
        status_text = "PORT_NOT_LISTENING"
        suggestions.append(f"Process PID {process_status.get('pid')} is registered, but nothing is listening on port {port}. Check 'Application Logs' for crash details.")
        suggestions.append(f"Ensure your application start script binds to 0.0.0.0 (e.g. host 0.0.0.0 port {port}).")
    else:
        status_text = "LISTENING_OK"
        suggestions.append(f"Application is actively listening on port {port}.")
        if os.name != "nt" and not ufw_port_allowed:
            suggestions.append(f"If you cannot access http://<YOUR_IP>:{port} externally, open the port in your VPS firewall.")

    return {
        "success": True,
        "diagnosis": {
            "repoId": repo.id,
            "port": port,
            "processStatus": process_status,
            "localProbe": {"open": is_listening},
            "ufwPortAllowed": ufw_port_allowed,
            "ufwStatus": ufw_status,
            "statusText": status_text,
            "suggestions": suggestions,
        },
    }


@router.get("/{repo_id}/env")
def get_env_vars(
    repo_id: str,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    env_vars = db.query(EnvironmentVariable).filter(EnvironmentVariable.repositoryId == repo_id).order_by(EnvironmentVariable.key.asc()).all()
    formatted = []
    for v in env_vars:
        formatted.append({
            "id": v.id,
            "key": v.key,
            "value": "••••••••••••" if v.isSecret else decrypt(v.encryptedValue),
            "isSecret": v.isSecret,
            "updatedAt": v.updatedAt.isoformat() if v.updatedAt else None,
        })
    return {"envVars": formatted}


@router.post("/{repo_id}/env")
def save_env_var(
    repo_id: str,
    payload: EnvVarCreateRequest,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    key = payload.key.strip()
    if not key:
        raise HTTPException(status_code=400, detail="Key is required")

    encrypted_val = encrypt(payload.value or "")
    existing = db.query(EnvironmentVariable).filter(
        EnvironmentVariable.repositoryId == repo_id,
        EnvironmentVariable.key == key,
    ).first()

    if existing:
        existing.encryptedValue = encrypted_val
        existing.isSecret = bool(payload.isSecret)
        env_var = existing
    else:
        env_var = EnvironmentVariable(
            repositoryId=repo_id,
            key=key,
            encryptedValue=encrypted_val,
            isSecret=bool(payload.isSecret),
        )
        db.add(env_var)

    db.commit()
    db.refresh(env_var)

    return {
        "success": True,
        "envVar": {
            "id": env_var.id,
            "key": env_var.key,
            "value": "••••••••••••" if env_var.isSecret else payload.value,
            "isSecret": env_var.isSecret,
        },
    }


@router.delete("/{repo_id}/env")
def delete_env_var(
    repo_id: str,
    envId: str = Query(...),
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    db.query(EnvironmentVariable).filter(
        EnvironmentVariable.id == envId,
        EnvironmentVariable.repositoryId == repo_id,
    ).delete()
    db.commit()
    return {"success": True}


@router.post("/{repo_id}/firewall")
def configure_firewall(
    repo_id: str,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    repo = db.query(Repository).filter(Repository.id == repo_id).first()
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    port = repo.config.port if repo.config and repo.config.port else 3000
    if os.name == "nt":
        return {
            "success": True,
            "message": f"Firewall automation is only required on Linux VPS. Current OS: Windows. Please ensure port {port} is open in Windows Defender or cloud security groups.",
        }

    try:
        res = subprocess.run(
            f"sudo ufw allow {port}/tcp && sudo ufw reload || ufw allow {port}/tcp",
            shell=True,
            capture_output=True,
            text=True,
            timeout=5,
        )
        return {
            "success": True,
            "message": f"Successfully opened port {port}/tcp in VPS firewall (UFW)!",
            "output": res.stdout,
        }
    except Exception as cmd_err:
        raise HTTPException(
            status_code=500,
            detail=f"Could not run ufw command directly: {cmd_err}. You can manually run: sudo ufw allow {port}/tcp",
        )


@router.get("/{repo_id}/logs")
def get_app_logs(
    repo_id: str,
    current_user=Depends(get_current_user),
):
    logs = ProcessManager.get_logs(repo_id, limit=150)
    return {"logs": logs}


@router.post("/{repo_id}/restart")
def restart_app(
    repo_id: str,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    repo = db.query(Repository).filter(Repository.id == repo_id).first()
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    result = ProcessManager.restart(repo.id)
    if result.get("success"):
        repo.status = "RUNNING"
        db.commit()

    return result


@router.post("/{repo_id}/start")
def start_app(
    repo_id: str,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    repo = db.query(Repository).filter(Repository.id == repo_id).first()
    if not repo or not repo.config:
        raise HTTPException(status_code=404, detail="Repository or configuration not found")

    base_root = DEPLOYMENT_ROOT
    target_dir = (
        os.path.abspath(repo.config.basePath.strip())
        if repo.config.basePath and repo.config.basePath.strip()
        else os.path.abspath(os.path.join(base_root, repo.owner, repo.name))
    )

    env_map = {}
    for ev in repo.envVars:
        env_map[ev.key] = decrypt(ev.encryptedValue)

    result = ProcessManager.start(
        repo.id,
        repo.config.startCommand,
        target_dir,
        env_map,
        repo.config.port,
    )

    if result.get("success"):
        repo.status = "RUNNING"
        db.commit()

    return result


@router.get("/{repo_id}/status")
def get_repo_status(
    repo_id: str,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    repo = db.query(Repository).filter(Repository.id == repo_id).first()
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    runtime = ProcessManager.get_status(repo.id)
    latest_deploy = (
        db.query(Deployment)
        .filter(Deployment.repositoryId == repo.id)
        .order_by(Deployment.createdAt.desc())
        .first()
    )

    status_val = runtime.get("status") if runtime.get("status") != "STOPPED" else repo.status

    return {
        "status": status_val,
        "runtime": runtime,
        "latestDeployment": latest_deploy.to_dict() if latest_deploy else None,
        "config": repo.config.to_dict() if repo.config else None,
    }


@router.post("/{repo_id}/stop")
def stop_app(
    repo_id: str,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    repo = db.query(Repository).filter(Repository.id == repo_id).first()
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    result = ProcessManager.stop(repo.id)
    repo.status = "STOPPED"
    db.commit()

    return result
