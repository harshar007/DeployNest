from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models import Repository, Deployment
from backend.services.auth_service import get_current_user
from backend.services.system_service import get_system_health
from backend.services.process_manager import ProcessManager

router = APIRouter(prefix="/api/system", tags=["system"])


@router.get("/health")
def system_health_endpoint(current_user=Depends(get_current_user)):
    health_data = get_system_health()
    return {"health": health_data}


@router.get("/stats")
def system_stats_endpoint(
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    total_repos = db.query(Repository).count()
    total_deployments = db.query(Deployment).count()
    failed_deployments = db.query(Deployment).filter(Deployment.status == "FAILED").count()

    recent_deployments_query = (
        db.query(Deployment)
        .order_by(Deployment.createdAt.desc())
        .limit(6)
        .all()
    )
    recent_deployments = [d.to_dict(include_repo=True) for d in recent_deployments_query]

    repos = db.query(Repository.id, Repository.status).all()
    running_count = 0
    for r_id, r_status in repos:
        runtime = ProcessManager.get_status(r_id)
        if runtime.get("status") == "RUNNING" or r_status == "RUNNING":
            running_count += 1

    return {
        "stats": {
            "totalRepositories": total_repos,
            "runningApps": running_count,
            "totalDeployments": total_deployments,
            "failedDeployments": failed_deployments,
            "recentDeployments": recent_deployments,
        }
    }
