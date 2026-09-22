import sys
import uvicorn
from backend.config import HOST, PORT

if __name__ == "__main__":
    print(f"🚀 Starting DeployNest Python FastAPI Backend on http://{HOST}:{PORT}")
    uvicorn.run("backend.main:app", host=HOST, port=PORT, reload=True)
