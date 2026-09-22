from typing import List, Dict, Any

FRAMEWORK_PRESETS: List[Dict[str, Any]] = [
    {
        "id": "vite",
        "name": "Vite (React / Vue / Svelte)",
        "icon": "⚡",
        "category": "node",
        "description": "Vite SPA frontend with preview or static serve",
        "defaultRootDirectory": "frontend",
        "installCommand": "npm install",
        "buildCommand": "npm run build",
        "startCommand": "npx serve -s dist -l 3000",
        "defaultPort": 3000,
        "healthCheckUrl": "/",
        "processManager": "node",
    },
    {
        "id": "nextjs",
        "name": "Next.js",
        "icon": "▲",
        "category": "node",
        "description": "Next.js fullstack React application",
        "defaultRootDirectory": "",
        "installCommand": "npm install",
        "buildCommand": "npm run build",
        "startCommand": "npx next start -H 0.0.0.0 -p 3000",
        "defaultPort": 3000,
        "healthCheckUrl": "/",
        "processManager": "node",
    },
    {
        "id": "fastapi",
        "name": "Python (FastAPI / Uvicorn)",
        "icon": "⚡",
        "category": "python",
        "description": "High-performance Python FastAPI async backend",
        "defaultRootDirectory": "backend",
        "installCommand": "pip install -r requirements.txt",
        "buildCommand": "",
        "startCommand": "python -m uvicorn app.main:app --host 0.0.0.0 --port 8000",
        "defaultPort": 8000,
        "healthCheckUrl": "/docs",
        "processManager": "python",
    },
    {
        "id": "flask",
        "name": "Python (Flask / Gunicorn)",
        "icon": "🌶️",
        "category": "python",
        "description": "Flask web server running with Gunicorn",
        "defaultRootDirectory": "backend",
        "installCommand": "pip install -r requirements.txt",
        "buildCommand": "",
        "startCommand": "gunicorn -w 4 -b 0.0.0.0:5000 app:app",
        "defaultPort": 5000,
        "healthCheckUrl": "/",
        "processManager": "python",
    },
    {
        "id": "django",
        "name": "Python (Django)",
        "icon": "🎸",
        "category": "python",
        "description": "Django web framework with Gunicorn and static collection",
        "defaultRootDirectory": "",
        "installCommand": "pip install -r requirements.txt",
        "buildCommand": "python manage.py migrate --noinput && python manage.py collectstatic --noinput",
        "startCommand": "gunicorn --bind 0.0.0.0:8000 project.wsgi:application",
        "defaultPort": 8000,
        "healthCheckUrl": "/",
        "processManager": "python",
    },
    {
        "id": "express",
        "name": "Node.js (Express / NestJS / Fastify)",
        "icon": "🟢",
        "category": "node",
        "description": "Node.js backend API or server",
        "defaultRootDirectory": "",
        "installCommand": "npm install",
        "buildCommand": "npm run build",
        "startCommand": "node index.js",
        "defaultPort": 3000,
        "healthCheckUrl": "/",
        "processManager": "node",
    },
    {
        "id": "docker-compose",
        "name": "Docker Compose Stack",
        "icon": "🐳",
        "category": "docker",
        "description": "Multi-container application defined by docker-compose.yml",
        "defaultRootDirectory": "",
        "installCommand": "",
        "buildCommand": "docker compose build",
        "startCommand": "docker compose up -d",
        "defaultPort": 80,
        "healthCheckUrl": "/",
        "processManager": "docker-compose",
    },
    {
        "id": "dockerfile",
        "name": "Dockerfile Container",
        "icon": "📦",
        "category": "docker",
        "description": "Custom Docker container image",
        "defaultRootDirectory": "",
        "installCommand": "",
        "buildCommand": "docker build -t deploynest-app .",
        "startCommand": "docker run -d -p 3000:3000 deploynest-app",
        "defaultPort": 3000,
        "healthCheckUrl": "/",
        "processManager": "docker",
    },
    {
        "id": "static",
        "name": "Static HTML / JS / CSS Site",
        "icon": "📄",
        "category": "static",
        "description": "Plain HTML, CSS, and client-side JavaScript site",
        "defaultRootDirectory": "",
        "installCommand": "",
        "buildCommand": "",
        "startCommand": "npx serve -s . -l 3000",
        "defaultPort": 3000,
        "healthCheckUrl": "/",
        "processManager": "node",
    },
    {
        "id": "custom",
        "name": "Custom Configuration",
        "icon": "⚙️",
        "category": "other",
        "description": "User-defined build and execution pipeline",
        "defaultRootDirectory": "",
        "installCommand": "npm install",
        "buildCommand": "npm run build",
        "startCommand": "npm start",
        "defaultPort": 3000,
        "healthCheckUrl": "/",
        "processManager": "custom",
    },
]


def detect_preset_from_files(file_list: List[str]) -> Dict[str, Any]:
    """
    Analyzes project structure from file names and recommends the best preset and root directory
    """
    has_file = lambda p: p in file_list
    recommended_preset_id = "custom"
    recommended_root_dir = ""
    detection_reason = "Default generic preset"

    if has_file("docker-compose.yml") or has_file("docker-compose.yaml"):
        recommended_preset_id = "docker-compose"
        recommended_root_dir = ""
        detection_reason = "Found docker-compose.yml in project root"
    elif has_file("frontend/vite.config.js") or has_file("frontend/vite.config.ts") or has_file("frontend/package.json"):
        recommended_preset_id = "vite"
        recommended_root_dir = "frontend"
        detection_reason = "Found Vite/React project inside 'frontend/' folder"
    elif has_file("frontend/next.config.js") or has_file("frontend/next.config.mjs") or has_file("frontend/next.config.ts"):
        recommended_preset_id = "nextjs"
        recommended_root_dir = "frontend"
        detection_reason = "Found Next.js project inside 'frontend/' folder"
    elif has_file("backend/requirements.txt") or has_file("backend/main.py") or has_file("backend/app/main.py"):
        recommended_preset_id = "fastapi"
        recommended_root_dir = "backend"
        detection_reason = "Found Python backend inside 'backend/' folder"
    elif has_file("next.config.js") or has_file("next.config.mjs") or has_file("next.config.ts") or has_file("pages") or has_file("app"):
        recommended_preset_id = "nextjs"
        recommended_root_dir = ""
        detection_reason = "Found Next.js project structure in root"
    elif has_file("vite.config.js") or has_file("vite.config.ts"):
        recommended_preset_id = "vite"
        recommended_root_dir = ""
        detection_reason = "Found vite.config file in root"
    elif has_file("requirements.txt") or has_file("Pipfile") or has_file("pyproject.toml"):
        if has_file("manage.py"):
            recommended_preset_id = "django"
            detection_reason = "Found Django manage.py in root"
        else:
            recommended_preset_id = "fastapi"
            detection_reason = "Found Python requirements.txt in root"
        recommended_root_dir = ""
    elif has_file("package.json"):
        recommended_preset_id = "express"
        recommended_root_dir = ""
        detection_reason = "Found Node.js package.json in root"
    elif has_file("Dockerfile"):
        recommended_preset_id = "dockerfile"
        recommended_root_dir = ""
        detection_reason = "Found Dockerfile in root"

    preset = next((p for p in FRAMEWORK_PRESETS if p["id"] == recommended_preset_id), None)
    if not preset:
        preset = next(p for p in FRAMEWORK_PRESETS if p["id"] == "custom")

    return {
        "recommendedPresetId": recommended_preset_id,
        "recommendedRootDir": recommended_root_dir,
        "detectionReason": detection_reason,
        "preset": preset,
    }
