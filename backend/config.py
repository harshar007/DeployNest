import os
from pathlib import Path
from dotenv import load_dotenv

# Base project root
BASE_DIR = Path(__file__).resolve().parent.parent

# Load .env file from project root if it exists
env_path = BASE_DIR / ".env"
if env_path.exists():
    load_dotenv(dotenv_path=env_path)
else:
    load_dotenv()

# Server Settings
HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("BACKEND_PORT", os.getenv("PORT", "8000")))
APP_URL = os.getenv("APP_URL", "http://localhost:29870")
NODE_ENV = os.getenv("NODE_ENV", "development")

# Database URL
raw_db_url = os.getenv("DATABASE_URL", "file:./data/deploynest.db")
if raw_db_url.startswith("file:"):
    db_relative = raw_db_url.replace("file:", "").strip()
    # Check if relative to BASE_DIR
    resolved_db = (BASE_DIR / db_relative).resolve()
    if not resolved_db.parent.exists():
        resolved_db.parent.mkdir(parents=True, exist_ok=True)
    DATABASE_URL = f"sqlite:///{resolved_db.as_posix()}"
elif raw_db_url.startswith("sqlite"):
    DATABASE_URL = raw_db_url
else:
    DATABASE_URL = raw_db_url

# Security & Secrets
JWT_SECRET = os.getenv("JWT_SECRET", "deploynest_jwt_secret_key_change_in_production_min32chars")
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_DAYS = 7
COOKIE_NAME = "deploynest_session"

ENCRYPTION_KEY = os.getenv("ENCRYPTION_KEY", "deploynest_32_bytes_super_secure_encryption_key!")
GITHUB_WEBHOOK_SECRET = os.getenv("GITHUB_WEBHOOK_SECRET", "deploynest_default_webhook_secret_key")

# Deployments root directory
DEPLOYMENT_ROOT = os.getenv("DEPLOYMENT_ROOT", str(BASE_DIR / "data" / "deployments"))
if not os.path.isabs(DEPLOYMENT_ROOT):
    DEPLOYMENT_ROOT = str((BASE_DIR / DEPLOYMENT_ROOT).resolve())
