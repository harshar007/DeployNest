from fastapi import APIRouter, Depends, HTTPException, Response, Request, status
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models import User
from backend.schemas import LoginRequest, SetupRequest
from backend.services.auth_service import (
    compare_password,
    hash_password,
    generate_token,
    get_current_user_optional,
    is_system_setup,
)
from backend.config import COOKIE_NAME

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login")
def login(payload: LoginRequest, response: Response, db: Session = Depends(get_db)):
    email = payload.email.lower().strip()
    password = payload.password

    if not email or not password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email and password are required",
        )

    user = db.query(User).filter(User.email == email).first()
    if not user or not compare_password(password, user.passwordHash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )

    token = generate_token({
        "userId": user.id,
        "email": user.email,
        "name": user.name,
        "role": user.role,
    })

    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        httponly=True,
        samesite="lax",
        max_age=60 * 60 * 24 * 7,
        path="/",
    )

    return {
        "success": True,
        "user": {
            "id": user.id,
            "name": user.name,
            "email": user.email,
            "role": user.role,
        },
    }


@router.post("/logout")
def logout(response: Response):
    response.delete_cookie(key=COOKIE_NAME, path="/")
    return {"success": True}


@router.get("/me")
def me(current_user=Depends(get_current_user_optional)):
    if not current_user:
        return {"authenticated": False, "user": None}
    return {"authenticated": True, "user": current_user}


@router.get("/setup")
def setup_status(db: Session = Depends(get_db)):
    admin_count = db.query(User).count()
    return {"setupNeeded": admin_count == 0}


@router.post("/setup")
def setup_initial_admin(
    payload: SetupRequest,
    response: Response,
    db: Session = Depends(get_db)
):
    admin_count = db.query(User).count()
    if admin_count > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="System is already set up",
        )

    name = payload.name.strip()
    email = payload.email.lower().strip()
    password = payload.password

    if not name or not email or not password or len(password) < 6:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid name, email, or password (min 6 characters)",
        )

    password_hash = hash_password(password)
    user = User(
        name=name,
        email=email,
        passwordHash=password_hash,
        role="admin",
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = generate_token({
        "userId": user.id,
        "email": user.email,
        "name": user.name,
        "role": user.role,
    })

    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        httponly=True,
        samesite="lax",
        max_age=60 * 60 * 24 * 7,
        path="/",
    )

    return {
        "success": True,
        "user": {
            "id": user.id,
            "name": user.name,
            "email": user.email,
            "role": user.role,
        },
    }
