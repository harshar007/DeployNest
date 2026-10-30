from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any
import bcrypt
import jwt
from fastapi import Request, Depends, HTTPException, status
from sqlalchemy.orm import Session
from backend.config import JWT_SECRET, JWT_ALGORITHM, JWT_EXPIRATION_DAYS, COOKIE_NAME
from backend.database import get_db
from backend.models import User


def hash_password(password: str) -> str:
    """
    Hashes a password using bcrypt with salt factor 10
    """
    salt = bcrypt.gensalt(rounds=10)
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


def compare_password(password: str, hashed: str) -> bool:
    """
    Compares a plaintext password against a bcrypt hash
    """
    try:
        return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def generate_token(payload: Dict[str, Any]) -> str:
    """
    Generates a JWT session token with expiration
    """
    data = payload.copy()
    data["exp"] = datetime.now(timezone.utc) + timedelta(days=JWT_EXPIRATION_DAYS)
    return jwt.encode(data, JWT_SECRET, algorithm=JWT_ALGORITHM)


def verify_token(token: str) -> Optional[Dict[str, Any]]:
    """
    Verifies and decodes a JWT token
    """
    try:
        decoded = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return decoded
    except Exception:
        return None


def get_current_user_optional(
    request: Request,
    db: Session = Depends(get_db)
) -> Optional[Dict[str, Any]]:
    """
    Resolves current user from cookie or Authorization header.
    Returns None if unauthenticated.
    """
    # 1. Try extracting token from cookie
    token = request.cookies.get(COOKIE_NAME)

    # 2. Try extracting from Authorization header
    if not token:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header.split(" ", 1)[1].strip()

    if token:
        verified = verify_token(token)
        if verified and "userId" in verified:
            user = db.query(User).filter(User.id == verified["userId"]).first()
            if user:
                return {
                    "userId": user.id,
                    "email": user.email,
                    "name": user.name,
                    "role": user.role,
                }

    return None


def get_current_user(
    current_user: Optional[Dict[str, Any]] = Depends(get_current_user_optional)
) -> Dict[str, Any]:
    """
    Strict dependency requiring an authenticated user
    """
    if not current_user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Unauthorized. Please log in or refresh the page."
        )
    return current_user


def is_system_setup(db: Session) -> bool:
    """
    Checks if at least one user exists in the database
    """
    return db.query(User).count() > 0
