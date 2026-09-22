import uuid
from datetime import datetime
from sqlalchemy import (
    Column,
    String,
    Boolean,
    Integer,
    DateTime,
    ForeignKey,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import relationship
from backend.database import Base


def generate_uuid() -> str:
    return str(uuid.uuid4())


class User(Base):
    __tablename__ = "User"

    id = Column(String, primary_key=True, default=generate_uuid)
    name = Column(String, nullable=False)
    email = Column(String, unique=True, nullable=False)
    passwordHash = Column(String, nullable=False)
    role = Column(String, nullable=False, default="admin")
    createdAt = Column(DateTime, nullable=False, default=datetime.utcnow)
    updatedAt = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    githubConns = relationship("GithubConnection", back_populates="user", cascade="all, delete-orphan")

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "email": self.email,
            "role": self.role,
            "createdAt": self.createdAt.isoformat() if self.createdAt else None,
            "updatedAt": self.updatedAt.isoformat() if self.updatedAt else None,
        }


class GithubConnection(Base):
    __tablename__ = "GithubConnection"

    id = Column(String, primary_key=True, default=generate_uuid)
    userId = Column(String, ForeignKey("User.id", ondelete="CASCADE", onupdate="CASCADE"), nullable=False)
    githubUserId = Column(String, nullable=False)
    githubUsername = Column(String, nullable=False)
    avatarUrl = Column(String, nullable=True)
    encryptedAccessToken = Column(String, nullable=False)
    lastValidatedAt = Column(DateTime, nullable=True)
    createdAt = Column(DateTime, nullable=False, default=datetime.utcnow)
    updatedAt = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User", back_populates="githubConns")

    def to_dict(self):
        return {
            "id": self.id,
            "userId": self.userId,
            "githubUserId": self.githubUserId,
            "githubUsername": self.githubUsername,
            "avatarUrl": self.avatarUrl,
            "lastValidatedAt": self.lastValidatedAt.isoformat() if self.lastValidatedAt else None,
            "createdAt": self.createdAt.isoformat() if self.createdAt else None,
            "updatedAt": self.updatedAt.isoformat() if self.updatedAt else None,
        }


class Repository(Base):
    __tablename__ = "Repository"

    id = Column(String, primary_key=True, default=generate_uuid)
    githubRepoId = Column(String, unique=True, nullable=False)
    owner = Column(String, nullable=False)
    name = Column(String, nullable=False)
    fullName = Column(String, unique=True, nullable=False)
    cloneUrl = Column(String, nullable=False)
    htmlUrl = Column(String, nullable=True)
    defaultBranch = Column(String, nullable=False, default="main")
    isPrivate = Column(Boolean, nullable=False, default=False)
    description = Column(String, nullable=True)
    language = Column(String, nullable=True)
    status = Column(String, nullable=False, default="NOT_CONFIGURED")
    syncedAt = Column(DateTime, nullable=False, default=datetime.utcnow)
    createdAt = Column(DateTime, nullable=False, default=datetime.utcnow)
    updatedAt = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    config = relationship("DeploymentConfig", back_populates="repository", uselist=False, cascade="all, delete-orphan")
    deployments = relationship("Deployment", back_populates="repository", cascade="all, delete-orphan", order_by="desc(Deployment.createdAt)")
    envVars = relationship("EnvironmentVariable", back_populates="repository", cascade="all, delete-orphan")

    def to_dict(self, include_config=True, include_deployments=False, include_env=False):
        data = {
            "id": self.id,
            "githubRepoId": self.githubRepoId,
            "owner": self.owner,
            "name": self.name,
            "fullName": self.fullName,
            "cloneUrl": self.cloneUrl,
            "htmlUrl": self.htmlUrl,
            "defaultBranch": self.defaultBranch,
            "isPrivate": self.isPrivate,
            "description": self.description,
            "language": self.language,
            "status": self.status,
            "syncedAt": self.syncedAt.isoformat() if self.syncedAt else None,
            "createdAt": self.createdAt.isoformat() if self.createdAt else None,
            "updatedAt": self.updatedAt.isoformat() if self.updatedAt else None,
        }
        if include_config:
            data["config"] = self.config.to_dict() if self.config else None
        if include_deployments:
            data["deployments"] = [d.to_dict() for d in self.deployments]
        if include_env:
            data["envVars"] = [e.to_dict() for e in self.envVars]
        return data


class DeploymentConfig(Base):
    __tablename__ = "DeploymentConfig"

    id = Column(String, primary_key=True, default=generate_uuid)
    repositoryId = Column(String, ForeignKey("Repository.id", ondelete="CASCADE", onupdate="CASCADE"), unique=True, nullable=False)
    branch = Column(String, nullable=False, default="main")
    basePath = Column(String, nullable=False, default="")
    rootDirectory = Column(String, nullable=False, default="")
    frameworkPreset = Column(String, nullable=False, default="custom")
    installCommand = Column(String, nullable=False, default="npm install")
    buildCommand = Column(String, nullable=False, default="npm run build")
    startCommand = Column(String, nullable=False, default="npm start")
    processManager = Column(String, nullable=False, default="node")
    port = Column(Integer, nullable=True, default=3000)
    healthCheckUrl = Column(String, nullable=True, default="/health")
    autoDeploy = Column(Boolean, nullable=False, default=True)
    webhookId = Column(String, nullable=True)
    createdAt = Column(DateTime, nullable=False, default=datetime.utcnow)
    updatedAt = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    repository = relationship("Repository", back_populates="config")

    def to_dict(self):
        return {
            "id": self.id,
            "repositoryId": self.repositoryId,
            "branch": self.branch,
            "basePath": self.basePath,
            "rootDirectory": self.rootDirectory,
            "frameworkPreset": self.frameworkPreset,
            "installCommand": self.installCommand,
            "buildCommand": self.buildCommand,
            "startCommand": self.startCommand,
            "processManager": self.processManager,
            "port": self.port,
            "healthCheckUrl": self.healthCheckUrl,
            "autoDeploy": self.autoDeploy,
            "webhookId": self.webhookId,
            "createdAt": self.createdAt.isoformat() if self.createdAt else None,
            "updatedAt": self.updatedAt.isoformat() if self.updatedAt else None,
        }


class Deployment(Base):
    __tablename__ = "Deployment"

    id = Column(String, primary_key=True, default=generate_uuid)
    repositoryId = Column(String, ForeignKey("Repository.id", ondelete="CASCADE", onupdate="CASCADE"), nullable=False)
    commitSha = Column(String, nullable=True)
    commitMessage = Column(String, nullable=True)
    commitAuthor = Column(String, nullable=True)
    branch = Column(String, nullable=False, default="main")
    status = Column(String, nullable=False, default="QUEUED")
    triggerType = Column(String, nullable=False, default="MANUAL")
    startedAt = Column(DateTime, nullable=True)
    completedAt = Column(DateTime, nullable=True)
    duration = Column(Integer, nullable=True)
    errorMessage = Column(String, nullable=True)
    rollbackFromId = Column(String, nullable=True)
    createdAt = Column(DateTime, nullable=False, default=datetime.utcnow)
    updatedAt = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    repository = relationship("Repository", back_populates="deployments")
    logs = relationship("DeploymentLog", back_populates="deployment", cascade="all, delete-orphan", order_by="asc(DeploymentLog.timestamp)")

    def to_dict(self, include_logs=False, include_repo=False):
        data = {
            "id": self.id,
            "repositoryId": self.repositoryId,
            "commitSha": self.commitSha,
            "commitMessage": self.commitMessage,
            "commitAuthor": self.commitAuthor,
            "branch": self.branch,
            "status": self.status,
            "triggerType": self.triggerType,
            "startedAt": self.startedAt.isoformat() if self.startedAt else None,
            "completedAt": self.completedAt.isoformat() if self.completedAt else None,
            "duration": self.duration,
            "errorMessage": self.errorMessage,
            "rollbackFromId": self.rollbackFromId,
            "createdAt": self.createdAt.isoformat() if self.createdAt else None,
            "updatedAt": self.updatedAt.isoformat() if self.updatedAt else None,
        }
        if include_repo and self.repository:
            data["repository"] = {
                "id": self.repository.id,
                "name": self.repository.name,
                "fullName": self.repository.fullName,
                "owner": self.repository.owner,
                "config": self.repository.config.to_dict() if self.repository.config else None,
            }
        if include_logs:
            data["logs"] = [log.to_dict() for log in self.logs]
        return data


class DeploymentLog(Base):
    __tablename__ = "DeploymentLog"

    id = Column(String, primary_key=True, default=generate_uuid)
    deploymentId = Column(String, ForeignKey("Deployment.id", ondelete="CASCADE", onupdate="CASCADE"), nullable=False)
    timestamp = Column(DateTime, nullable=False, default=datetime.utcnow)
    level = Column(String, nullable=False, default="info")
    stage = Column(String, nullable=False, default="GENERAL")
    message = Column(String, nullable=False)

    deployment = relationship("Deployment", back_populates="logs")

    def to_dict(self):
        return {
            "id": self.id,
            "deploymentId": self.deploymentId,
            "timestamp": self.timestamp.isoformat() if self.timestamp else None,
            "level": self.level,
            "stage": self.stage,
            "message": self.message,
        }


class EnvironmentVariable(Base):
    __tablename__ = "EnvironmentVariable"

    id = Column(String, primary_key=True, default=generate_uuid)
    repositoryId = Column(String, ForeignKey("Repository.id", ondelete="CASCADE", onupdate="CASCADE"), nullable=False)
    key = Column(String, nullable=False)
    encryptedValue = Column(String, nullable=False)
    isSecret = Column(Boolean, nullable=False, default=True)
    createdAt = Column(DateTime, nullable=False, default=datetime.utcnow)
    updatedAt = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (UniqueConstraint("repositoryId", "key", name="EnvironmentVariable_repositoryId_key_key"),)

    repository = relationship("Repository", back_populates="envVars")

    def to_dict(self):
        return {
            "id": self.id,
            "repositoryId": self.repositoryId,
            "key": self.key,
            "isSecret": self.isSecret,
            "createdAt": self.createdAt.isoformat() if self.createdAt else None,
            "updatedAt": self.updatedAt.isoformat() if self.updatedAt else None,
        }


class SystemSetting(Base):
    __tablename__ = "SystemSetting"

    id = Column(String, primary_key=True, default=generate_uuid)
    key = Column(String, unique=True, nullable=False)
    value = Column(String, nullable=False)
    updatedAt = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "key": self.key,
            "value": self.value,
            "updatedAt": self.updatedAt.isoformat() if self.updatedAt else None,
        }
