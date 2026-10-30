import os
import sys
import hmac
import hashlib
import json
import pytest
from pathlib import Path
from fastapi.testclient import TestClient

# Add project root to sys.path
BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))

from backend.main import app
from backend.database import SessionLocal, init_db
from backend.models import User, Repository, Deployment, DeploymentConfig, EnvironmentVariable, GithubConnection
from backend.services.auth_service import hash_password, generate_token
from backend.services.crypto_service import encrypt
from backend.config import GITHUB_WEBHOOK_SECRET, COOKIE_NAME


@pytest.fixture(scope="session", autouse=True)
def setup_database():
    init_db()


def test_root():
    client = TestClient(app)
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert data.get("status") == "online"
    assert data.get("service") == "DeployNest Python Backend"


def test_auth_flow():
    client = TestClient(app)
    db = SessionLocal()

    # 1. Check unauthenticated /api/auth/me returns authenticated: False
    unauth_me = client.get("/api/auth/me")
    assert unauth_me.status_code == 200
    assert unauth_me.json().get("authenticated") is False

    # 2. Check protected route without credentials returns 401
    unauth_prot = client.get("/api/system/health")
    assert unauth_prot.status_code == 401
    assert "error" in unauth_prot.json()

    # Check setup status
    res = client.get("/api/auth/setup")
    assert res.status_code == 200

    # Ensure admin user exists
    admin = db.query(User).filter(User.email == "admin@deploynest.local").first()
    if not admin:
        admin = User(
            name="Administrator",
            email="admin@deploynest.local",
            passwordHash=hash_password("admin123"),
            role="admin",
        )
        db.add(admin)
        db.commit()
        db.refresh(admin)

    # Test login
    login_res = client.post("/api/auth/login", json={"email": "admin@deploynest.local", "password": "admin123"})
    assert login_res.status_code == 200
    data = login_res.json()
    assert data.get("success") is True
    assert data.get("user", {}).get("email") == "admin@deploynest.local"

    # Test /api/auth/me with authenticated client
    me_res = client.get("/api/auth/me")
    assert me_res.status_code == 200
    me_data = me_res.json()
    assert me_data.get("authenticated") is True
    assert me_data.get("user", {}).get("email") == "admin@deploynest.local"

    # Test /api/auth/logout
    logout_res = client.post("/api/auth/logout")
    assert logout_res.status_code == 200

    # Verify unauthenticated after logout
    after_logout_client = TestClient(app)
    after_logout_me = after_logout_client.get("/api/auth/me")
    assert after_logout_me.status_code == 200
    assert after_logout_me.json().get("authenticated") is False

    db.close()


def test_system_endpoints():
    client = TestClient(app)
    # Login as admin
    login_res = client.post("/api/auth/login", json={"email": "admin@deploynest.local", "password": "admin123"})
    assert login_res.status_code == 200

    # Health
    res_health = client.get("/api/system/health")
    assert res_health.status_code == 200
    health = res_health.json().get("health", {})
    assert "cpu" in health
    assert "memory" in health
    assert "disk" in health
    assert "os" in health

    # Stats
    res_stats = client.get("/api/system/stats")
    assert res_stats.status_code == 200
    stats = res_stats.json().get("stats", {})
    assert "totalRepositories" in stats
    assert "runningApps" in stats
    assert "totalDeployments" in stats


def test_repository_lifecycle():
    client = TestClient(app)
    db = SessionLocal()
    login_res = client.post("/api/auth/login", json={"email": "admin@deploynest.local", "password": "admin123"})
    assert login_res.status_code == 200

    # 1. Create a dummy test repo in DB
    dummy_repo = db.query(Repository).filter(Repository.githubRepoId == "999999").first()
    if not dummy_repo:
        dummy_repo = Repository(
            githubRepoId="999999",
            owner="testowner",
            name="testrepo",
            fullName="testowner/testrepo",
            cloneUrl="https://github.com/testowner/testrepo.git",
            status="NOT_CONFIGURED",
        )
        db.add(dummy_repo)
        db.commit()
        db.refresh(dummy_repo)

    repo_id = dummy_repo.id

    # 2. List repositories
    list_res = client.get("/api/repositories")
    assert list_res.status_code == 200
    repos = list_res.json().get("repositories", [])
    assert any(r["id"] == repo_id for r in repos)

    # 3. Get single repository
    get_res = client.get(f"/api/repositories/{repo_id}")
    assert get_res.status_code == 200
    assert get_res.json().get("repository", {}).get("id") == repo_id

    # 4. Save repository configuration
    config_payload = {
        "branch": "main",
        "basePath": "",
        "rootDirectory": "backend",
        "frameworkPreset": "fastapi",
        "installCommand": "pip install -r requirements.txt",
        "buildCommand": "",
        "startCommand": "python -m uvicorn main:app",
        "processManager": "python",
        "port": 8080,
        "healthCheckUrl": "/docs",
        "autoDeploy": True,
    }
    config_res = client.post(f"/api/repositories/{repo_id}/config", json=config_payload)
    assert config_res.status_code == 200
    assert config_res.json().get("success") is True
    assert config_res.json().get("config", {}).get("port") == 8080

    # 5. Environment variable operations
    env_res = client.post(
        f"/api/repositories/{repo_id}/env",
        json={"key": "SECRET_KEY", "value": "super_secret_jwt_value", "isSecret": True},
    )
    assert env_res.status_code == 200
    env_data = env_res.json().get("envVar", {})
    assert env_data.get("key") == "SECRET_KEY"
    assert env_data.get("value") == "••••••••••••"
    env_id = env_data.get("id")

    # List env vars
    list_env_res = client.get(f"/api/repositories/{repo_id}/env")
    assert list_env_res.status_code == 200
    assert any(e["key"] == "SECRET_KEY" for e in list_env_res.json().get("envVars", []))

    # Delete env var
    del_env_res = client.delete(f"/api/repositories/{repo_id}/env?envId={env_id}")
    assert del_env_res.status_code == 200

    # 6. Repository Diagnosis
    diag_res = client.get(f"/api/repositories/{repo_id}/diagnose")
    assert diag_res.status_code == 200
    diagnosis = diag_res.json().get("diagnosis", {})
    assert diagnosis.get("port") == 8080
    assert "statusText" in diagnosis

    # 7. Trigger Manual Deployment
    deploy_res = client.post(f"/api/repositories/{repo_id}/deploy", json={"branch": "main"})
    assert deploy_res.status_code == 200
    deploy_data = deploy_res.json()
    assert deploy_data.get("success") is True
    deployment_id = deploy_data.get("deploymentId")
    assert deployment_id is not None

    # 8. Fetch Deployment details
    dep_detail_res = client.get(f"/api/deployments/{deployment_id}")
    assert dep_detail_res.status_code == 200
    assert dep_detail_res.json().get("deployment", {}).get("id") == deployment_id

    # 9. Test Rollback Deployment
    rollback_res = client.post(f"/api/deployments/{deployment_id}/rollback")
    assert rollback_res.status_code == 200
    assert rollback_res.json().get("success") is True
    rollback_id = rollback_res.json().get("deploymentId")

    # Verify rollback deployment preserved rollbackFromId
    rb_dep = db.query(Deployment).filter(Deployment.id == rollback_id).first()
    assert rb_dep is not None
    assert rb_dep.triggerType == "ROLLBACK"
    assert rb_dep.rollbackFromId == deployment_id

    # Cleanup test repo
    del_repo_res = client.delete(f"/api/repositories/{repo_id}")
    assert del_repo_res.status_code == 200

    db.close()


def test_github_webhook():
    client = TestClient(app)
    db = SessionLocal()

    # Create dummy repo
    dummy_repo = db.query(Repository).filter(Repository.fullName == "org/sample-app").first()
    if not dummy_repo:
        dummy_repo = Repository(
            githubRepoId="888888",
            owner="org",
            name="sample-app",
            fullName="org/sample-app",
            cloneUrl="https://github.com/org/sample-app.git",
            status="CONFIGURED",
        )
        db.add(dummy_repo)
        db.commit()
        db.refresh(dummy_repo)

        config = DeploymentConfig(
            repositoryId=dummy_repo.id,
            branch="main",
            autoDeploy=True,
        )
        db.add(config)
        db.commit()

    # 1. Ping webhook
    ping_res = client.post("/api/webhooks/github", headers={"x-github-event": "ping"}, content=b"{}")
    assert ping_res.status_code == 200
    assert "Pong" in ping_res.json().get("message", "")

    # 2. Webhook push without signature should fail 401
    payload = {
        "ref": "refs/heads/main",
        "repository": {
            "full_name": "org/sample-app",
            "name": "sample-app",
            "owner": {"login": "org"},
        },
        "head_commit": {
            "id": "abcdef1234567890",
            "message": "Update core features",
            "author": {"name": "Developer"},
        },
    }
    payload_bytes = json.dumps(payload).encode("utf-8")

    unsigned_res = client.post(
        "/api/webhooks/github",
        headers={"x-github-event": "push", "content-type": "application/json"},
        content=payload_bytes,
    )
    assert unsigned_res.status_code == 401

    # 3. Webhook push with invalid HMAC signature should fail 401
    bad_sig_res = client.post(
        "/api/webhooks/github",
        headers={
            "x-github-event": "push",
            "x-hub-signature-256": "sha256=invalidhexsignature12345",
            "content-type": "application/json",
        },
        content=payload_bytes,
    )
    assert bad_sig_res.status_code == 401

    # 4. Push webhook with valid HMAC signature
    secret = GITHUB_WEBHOOK_SECRET or "deploynest_default_webhook_secret_key"
    sig = "sha256=" + hmac.new(secret.encode("utf-8"), payload_bytes, hashlib.sha256).hexdigest()

    push_res = client.post(
        "/api/webhooks/github",
        headers={
            "x-github-event": "push",
            "x-hub-signature-256": sig,
            "content-type": "application/json",
        },
        content=payload_bytes,
    )
    assert push_res.status_code == 200
    push_data = push_res.json()
    assert push_data.get("success") is True
    assert "deploymentId" in push_data

    # Cleanup
    db.delete(dummy_repo)
    db.commit()
    db.close()
