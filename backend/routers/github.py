from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models import User, GithubConnection, Repository
from backend.schemas import GitHubConnectRequest
from backend.services.auth_service import get_current_user
from backend.services.crypto_service import encrypt, decrypt, mask_token
from backend.services.github_service import validate_github_token, fetch_user_repositories

router = APIRouter(prefix="/api/github", tags=["github"])


@router.post("/connect")
async def connect_github(
    payload: GitHubConnectRequest,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    token = payload.token.strip()
    if not token:
        raise HTTPException(status_code=400, detail="GitHub token is required")

    # Ensure user exists in DB
    user = db.query(User).filter(User.id == current_user["userId"]).first()
    if not user:
        user = db.query(User).order_by(User.createdAt.asc()).first()
        if not user:
            raise HTTPException(status_code=401, detail="User account not found")

    # 1. Validate token with GitHub API
    try:
        profile = await validate_github_token(token)
    except Exception as err:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid GitHub token: {str(err)}",
        )

    # 2. Encrypt token using AES-256-GCM
    encrypted_token = encrypt(token)

    # 3. Upsert GitHub connection
    connection = db.query(GithubConnection).filter(GithubConnection.userId == user.id).first()
    if connection:
        connection.githubUserId = profile["id"]
        connection.githubUsername = profile["username"]
        connection.avatarUrl = profile["avatarUrl"]
        connection.encryptedAccessToken = encrypted_token
        connection.lastValidatedAt = datetime.utcnow()
    else:
        connection = GithubConnection(
            userId=user.id,
            githubUserId=profile["id"],
            githubUsername=profile["username"],
            avatarUrl=profile["avatarUrl"],
            encryptedAccessToken=encrypted_token,
            lastValidatedAt=datetime.utcnow(),
        )
        db.add(connection)
    db.commit()

    # 4. Initial repository synchronization
    synced_count = 0
    try:
        repos = await fetch_user_repositories(token)
        for r in repos:
            repo_id_str = str(r["id"])
            existing_repo = db.query(Repository).filter(Repository.githubRepoId == repo_id_str).first()
            if existing_repo:
                existing_repo.owner = r["owner"]
                existing_repo.name = r["name"]
                existing_repo.fullName = r["fullName"]
                existing_repo.cloneUrl = r["cloneUrl"]
                existing_repo.htmlUrl = r["htmlUrl"]
                existing_repo.defaultBranch = r["defaultBranch"]
                existing_repo.isPrivate = r["isPrivate"]
                existing_repo.description = r["description"]
                existing_repo.language = r["language"]
                existing_repo.syncedAt = datetime.utcnow()
            else:
                new_repo = Repository(
                    githubRepoId=repo_id_str,
                    owner=r["owner"],
                    name=r["name"],
                    fullName=r["fullName"],
                    cloneUrl=r["cloneUrl"],
                    htmlUrl=r["htmlUrl"],
                    defaultBranch=r["defaultBranch"],
                    isPrivate=r["isPrivate"],
                    description=r["description"],
                    language=r["language"],
                    status="NOT_CONFIGURED",
                    syncedAt=datetime.utcnow(),
                )
                db.add(new_repo)
            synced_count += 1
        db.commit()
    except Exception as sync_err:
        print(f"Initial repo sync error: {sync_err}")

    return {
        "success": True,
        "profile": {
            "username": profile["username"],
            "avatarUrl": profile["avatarUrl"],
            "maskedToken": mask_token(token),
        },
        "syncedRepositories": synced_count,
    }


@router.delete("/disconnect")
def disconnect_github(
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    db.query(GithubConnection).filter(GithubConnection.userId == current_user["userId"]).delete()
    db.commit()
    return {"success": True}


@router.get("/status")
def github_status(
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    connection = (
        db.query(GithubConnection)
        .filter(GithubConnection.userId == current_user["userId"])
        .order_by(GithubConnection.createdAt.desc())
        .first()
    )

    if not connection:
        return {"connected": False, "connection": None}

    decrypted_token = decrypt(connection.encryptedAccessToken)
    return {
        "connected": True,
        "connection": {
            "id": connection.id,
            "githubUsername": connection.githubUsername,
            "avatarUrl": connection.avatarUrl,
            "maskedToken": mask_token(decrypted_token),
            "lastValidatedAt": connection.lastValidatedAt.isoformat() if connection.lastValidatedAt else None,
            "createdAt": connection.createdAt.isoformat() if connection.createdAt else None,
        },
    }


@router.post("/sync")
async def sync_github(
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    connection = (
        db.query(GithubConnection)
        .filter(GithubConnection.userId == current_user["userId"])
        .order_by(GithubConnection.createdAt.desc())
        .first()
    )

    if not connection:
        raise HTTPException(status_code=400, detail="No GitHub connection found")

    token = decrypt(connection.encryptedAccessToken)
    if not token:
        raise HTTPException(status_code=500, detail="Failed to decrypt GitHub token")

    repos = await fetch_user_repositories(token)
    synced_count = 0
    for r in repos:
        repo_id_str = str(r["id"])
        existing_repo = db.query(Repository).filter(Repository.githubRepoId == repo_id_str).first()
        if existing_repo:
            existing_repo.owner = r["owner"]
            existing_repo.name = r["name"]
            existing_repo.fullName = r["fullName"]
            existing_repo.cloneUrl = r["cloneUrl"]
            existing_repo.htmlUrl = r["htmlUrl"]
            existing_repo.defaultBranch = r["defaultBranch"]
            existing_repo.isPrivate = r["isPrivate"]
            existing_repo.description = r["description"]
            existing_repo.language = r["language"]
            existing_repo.syncedAt = datetime.utcnow()
        else:
            new_repo = Repository(
                githubRepoId=repo_id_str,
                owner=r["owner"],
                name=r["name"],
                fullName=r["fullName"],
                cloneUrl=r["cloneUrl"],
                htmlUrl=r["htmlUrl"],
                defaultBranch=r["defaultBranch"],
                isPrivate=r["isPrivate"],
                description=r["description"],
                language=r["language"],
                status="NOT_CONFIGURED",
                syncedAt=datetime.utcnow(),
            )
            db.add(new_repo)
        synced_count += 1

    connection.lastValidatedAt = datetime.utcnow()
    db.commit()

    return {
        "success": True,
        "syncedRepositories": synced_count,
    }
