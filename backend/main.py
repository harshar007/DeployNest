from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from backend.config import HOST, PORT
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

# Global Exception Handler
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    print(f"[API Error] {request.method} {request.url.path}: {exc}")
    return JSONResponse(
        status_code=500,
        content={"error": str(exc)},
    )

# Register API Routers
app.include_router(auth.router)
app.include_router(github.router)
app.include_router(repositories.router)
app.include_router(deployments.router)
app.include_router(system.router)
app.include_router(webhooks.router)


@app.get("/")
def root_status():
    return {
        "status": "online",
        "service": "DeployNest Python Backend",
        "version": "1.0.0",
        "docs": "/docs",
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.main:app", host=HOST, port=PORT, reload=True)
