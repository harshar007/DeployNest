from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models import Deployment
from backend.services.auth_service import get_current_user
from backend.services.queue_service import deployment_queue

router = APIRouter(prefix="/api/deployments", tags=["deployments"])


@router.get("")
def list_deployments(
    repoId: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    limit: int = Query(50),
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(Deployment)
    if repoId:
        query = query.filter(Deployment.repositoryId == repoId)
    if status:
        query = query.filter(Deployment.status == status)

    deployments = query.order_by(Deployment.createdAt.desc()).limit(limit).all()
    results = [d.to_dict(include_repo=True) for d in deployments]

    return {"deployments": results}


@router.get("/{deployment_id}")
def get_deployment(
    deployment_id: str,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    deployment = db.query(Deployment).filter(Deployment.id == deployment_id).first()
    if not deployment:
        raise HTTPException(status_code=404, detail="Deployment not found")

    return {
        "deployment": deployment.to_dict(include_logs=True, include_repo=True)
    }


@router.post("/{deployment_id}/rollback")
def rollback_deployment(
    deployment_id: str,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    target = db.query(Deployment).filter(Deployment.id == deployment_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="Target deployment not found")

    rollback_deployment = Deployment(
        repositoryId=target.repositoryId,
        branch=target.branch,
        commitSha=target.commitSha,
        commitMessage=f"Rollback to [{target.commitSha or 'previous'}]: {target.commitMessage or 'Deployment'}",
        triggerType="ROLLBACK",
        rollbackFromId=target.id,
        status="QUEUED",
    )
    db.add(rollback_deployment)
    db.commit()
    db.refresh(rollback_deployment)

    deployment_queue.add(rollback_deployment.id)

    return {
        "success": True,
        "message": f"Rollback queued for deployment {target.commitSha or target.id}",
        "deploymentId": rollback_deployment.id,
    }
