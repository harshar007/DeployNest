from typing import Optional, List, Dict, Any
from pydantic import BaseModel, EmailStr, Field


# Auth Schemas
class LoginRequest(BaseModel):
    email: str
    password: str


class SetupRequest(BaseModel):
    name: str
    email: str
    password: str


class UserResponse(BaseModel):
    id: str
    name: str
    email: str
    role: str


# GitHub Schemas
class GitHubConnectRequest(BaseModel):
    token: str


# Repository Schemas
class DeploymentConfigSchema(BaseModel):
    branch: Optional[str] = "main"
    basePath: Optional[str] = ""
    rootDirectory: Optional[str] = ""
    frameworkPreset: Optional[str] = "custom"
    installCommand: Optional[str] = "npm install"
    buildCommand: Optional[str] = "npm run build"
    startCommand: Optional[str] = "npm start"
    processManager: Optional[str] = "node"
    port: Optional[int] = 3000
    healthCheckUrl: Optional[str] = "/health"
    autoDeploy: Optional[bool] = True


class DeployRequest(BaseModel):
    branch: Optional[str] = None


class EnvVarCreateRequest(BaseModel):
    key: str
    value: Optional[str] = ""
    isSecret: Optional[bool] = True


# System Diagnosis & Firewall Schemas
class FirewallRequest(BaseModel):
    port: Optional[int] = None
