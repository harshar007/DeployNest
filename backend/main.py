from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException

from backend.config import HOST, PORT, BASE_DIR
from backend.database import init_db
from backend.services.queue_service import deployment_queue
from backend.routers import (
    auth,
    github,
    repositories,
    deployments,
    system,
    webhooks,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Initialize DB tables and start background queue worker
    init_db()
    await deployment_queue.start_worker()
    yield
    # Shutdown: Stop worker cleanly
    await deployment_queue.stop_worker()


app = FastAPI(
    title="DeployNest Backend API",
    description="Centralized Self-Hosted CI/CD Hub Python FastAPI Backend",
    version="1.0.0",
    lifespan=lifespan,
)

# Configure CORS for dashboard UI & external tools
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# HTTP Exception Handler ensuring consistent error and detail fields
@app.exception_handler(StarletteHTTPException)
async def custom_http_exception_handler(request: Request, exc: StarletteHTTPException):
    detail_msg = exc.detail if isinstance(exc.detail, str) else str(exc.detail)
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": detail_msg, "error": detail_msg},
    )


# Request Validation Exception Handler
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    errors = exc.errors()
    first_err = errors[0].get("msg") if errors else "Invalid request data"
    return JSONResponse(
        status_code=422,
        content={"detail": first_err, "error": first_err, "errors": errors},
    )


# Global Exception Handler
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    print(f"[API Error] {request.method} {request.url.path}: {exc}")
    err_msg = str(exc)
    return JSONResponse(
        status_code=500,
        content={"detail": err_msg, "error": err_msg},
    )


# Register API Routers
app.include_router(auth.router)
app.include_router(github.router)
app.include_router(repositories.router)
app.include_router(deployments.router)
app.include_router(system.router)
app.include_router(webhooks.router)

dist_dir = BASE_DIR / "dist"
if (dist_dir / "assets").exists():
    app.mount("/assets", StaticFiles(directory=str(dist_dir / "assets")), name="assets")


@app.get("/")
def root_status(request: Request):
    index_file = dist_dir / "index.html"
    accept_header = request.headers.get("accept", "")
    if index_file.exists() and "text/html" in accept_header:
        return FileResponse(index_file)
    return {
        "status": "online",
        "service": "DeployNest Python Backend",
        "version": "1.0.0",
        "docs": "/docs",
    }


@app.get("/{full_path:path}")
async def serve_spa_fallback(request: Request, full_path: str):
    if full_path == "api" or full_path.startswith("api/") or full_path in ("docs", "openapi.json", "redoc"):
        return JSONResponse(status_code=404, content={"detail": "Not Found", "error": "Not Found"})

    file_path = dist_dir / full_path
    if full_path and file_path.is_file():
        return FileResponse(file_path)

    index_file = dist_dir / "index.html"
    if index_file.exists():
        return FileResponse(index_file)

    return JSONResponse(status_code=404, content={"detail": "Not Found", "error": "Not Found"})


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.main:app", host=HOST, port=PORT, reload=True)
