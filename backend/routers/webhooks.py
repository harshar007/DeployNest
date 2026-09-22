import hmac
import hashlib
import json
from fastapi import APIRouter, Request, HTTPException, Depends, status
from sqlalchemy.orm import Session

from backend.config import GITHUB_WEBHOOK_SECRET
from backend.database import get_db
from backend.models import Repository, Deployment
from backend.services.queue_service import deployment_queue

router = APIRouter(prefix="/api/webhooks", tags=["webhooks"])


@router.get("/github")
def github_webhook_info():
    return {
        "status": "online",
        "message": "DeployNest GitHub Webhook endpoint is active. GitHub delivers POST payloads to this URL.",
    }


@router.post("/github")
async def handle_github_webhook(
    request: Request,
    db: Session = Depends(get_db),
):
    event = request.headers.get("x-github-event")
    signature = request.headers.get("x-hub-signature-256")
    body_bytes = await request.body()

    if event == "ping":
        return {"message": "Pong! DeployNest webhook is active."}

    if event != "push":
        return {"message": f"Ignored event: {event}"}

    # Verify HMAC-SHA256 signature if secret is configured
    secret = GITHUB_WEBHOOK_SECRET or "deploynest_default_webhook_secret_key"
    if signature and secret:
        computed_sig = "sha256=" + hmac.new(
            secret.encode("utf-8"),
            body_bytes,
            hashlib.sha256
        ).hexdigest()

        if not hmac.compare_digest(signature, computed_sig):
            raise HTTPException(status_code=401, detail="Invalid webhook signature")

    try:
        payload = json.loads(body_bytes.decode("utf-8"))
    except Exception:
        raise HTTPException(status_code=400, detail="Malformed JSON payload")

    repo_data = payload.get("repository", {})
    repo_full_name = repo_data.get("full_name")
    ref = payload.get("ref")

    if not repo_full_name or not ref:
        raise HTTPException(status_code=400, detail="Invalid webhook payload structure")

    branch = ref.replace("refs/heads/", "")

    repo = db.query(Repository).filter(Repository.fullName == repo_full_name).first()
    if not repo:
        return {"message": f"Repository {repo_full_name} is not managed in DeployNest."}

    if not repo.config:
        return {"message": f"Repository {repo_full_name} is not configured."}

    if not repo.config.autoDeploy:
        return {"message": f"Auto-deploy is disabled for {repo_full_name}."}

    if repo.config.branch and repo.config.branch != branch:
        return {
            "message": f"Push was on branch '{branch}', but configured deploy branch is '{repo.config.branch}'. Ignoring."
        }

    head_commit = payload.get("head_commit", {})
    commit_sha = head_commit.get("id", "")[:7] if head_commit.get("id") else None
    commit_message = head_commit.get("message", "").split("\n")[0] if head_commit.get("message") else None
    commit_author = head_commit.get("author", {}).get("name") or payload.get("pusher", {}).get("name") or "GitHub Push"

    deployment = Deployment(
        repositoryId=repo.id,
        branch=branch,
        commitSha=commit_sha,
        commitMessage=commit_message,
        commitAuthor=commit_author,
        triggerType="WEBHOOK",
        status="QUEUED",
    )
    db.add(deployment)
    db.commit()
    db.refresh(deployment)

    deployment_queue.add(deployment.id)

    return {
        "success": True,
        "message": f"Automatic deployment queued for {repo_full_name}@{branch} [{commit_sha}]",
        "deploymentId": deployment.id,
    }
