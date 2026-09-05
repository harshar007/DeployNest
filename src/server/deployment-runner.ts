import fs from "fs";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import { prisma } from "../lib/db";
import { decrypt } from "../lib/crypto";
import { ProcessManager } from "./process-manager";

const execAsync = promisify(exec);

export interface RunDeploymentOptions {
  deploymentId: string;
}

export class DeploymentRunner {
  static async runDeployment({ deploymentId }: RunDeploymentOptions) {
    const deployment = await prisma.deployment.findUnique({
      where: { id: deploymentId },
      include: {
        repository: {
          include: {
            config: true,
            envVars: true,
          },
        },
      },
    });

    if (!deployment) {
      console.error(`Deployment ${deploymentId} not found`);
      return;
    }

    const { repository } = deployment;
    const config = repository.config;

    const startTime = new Date();
    await prisma.deployment.update({
      where: { id: deploymentId },
      data: {
        status: "PREPARING",
        startedAt: startTime,
      },
    });
    await prisma.repository.update({
      where: { id: repository.id },
      data: { status: "DEPLOYING" },
    });

    const addLog = async (stage: string, message: string, level: "info" | "warn" | "error" = "info") => {
      console.log(`[Deploy ${deploymentId.substring(0, 6)}][${stage}] ${message}`);
      await prisma.deploymentLog.create({
        data: {
          deploymentId,
          stage,
          level,
          message,
        },
      });
    };

    try {
      await addLog("PREPARING", "Deployment pipeline initialized. Loading configuration...");

      // 1. Determine target directory
      const baseRoot = process.env.DEPLOYMENT_ROOT || path.join(process.cwd(), "data", "deployments");
      const targetDir = config?.basePath && config.basePath.trim().length > 0
        ? path.resolve(config.basePath)
        : path.resolve(path.join(baseRoot, repository.owner, repository.name));

      try {
        if (!fs.existsSync(targetDir)) {
          fs.mkdirSync(targetDir, { recursive: true, mode: 0o777 });
        }
      } catch (mkdirErr: any) {
        if (mkdirErr.code === "EACCES") {
          throw new Error(`Permission denied creating directory '${targetDir}'. Please run 'sudo chmod -R 777 ./data' on your VPS server.`);
        }
        throw mkdirErr;
      }

      await addLog("PREPARING", `Target directory ready: ${targetDir}`);

      // 2. Resolve GitHub credentials
      const ghConn = await prisma.githubConnection.findFirst({
        orderBy: { createdAt: "desc" },
      });

      let cloneUrl = repository.cloneUrl;
      if (ghConn?.encryptedAccessToken) {
        const token = decrypt(ghConn.encryptedAccessToken);
        if (token) {
          // Format authenticated clone url: https://oauth2:token@github.com/owner/repo.git
          cloneUrl = repository.cloneUrl.replace(
            "https://github.com",
            `https://oauth2:${token}@github.com`
          );
        }
      }

      const branch = deployment.branch || config?.branch || repository.defaultBranch || "main";

      // 3. Checkout code
      await prisma.deployment.update({
        where: { id: deploymentId },
        data: { status: "CHECKING_OUT" },
      });
      await addLog("CHECKOUT", `Checking out branch '${branch}'...`);

      // Ensure Git safe directory configuration to prevent dubious ownership errors
      try {
        await execAsync(`git config --global --add safe.directory "${targetDir}"`);
        await execAsync(`git config --global --add safe.directory "*"`);
      } catch (gitErr) {
        // Non-fatal
      }

      const isGitRepo = fs.existsSync(path.join(targetDir, ".git"));
      if (!isGitRepo) {
        await addLog("CHECKOUT", `Cloning repository from GitHub into ${targetDir}...`);
        await this.runShellCommand(`git clone --depth 50 --branch ${branch} ${cloneUrl} .`, targetDir, addLog, "CHECKOUT");
      } else {
        await addLog("CHECKOUT", `Fetching latest commits for branch '${branch}'...`);
        try {
          await this.runShellCommand(`git fetch origin ${branch}`, targetDir, addLog, "CHECKOUT");
          await this.runShellCommand(`git checkout ${branch}`, targetDir, addLog, "CHECKOUT");
          await this.runShellCommand(`git pull origin ${branch}`, targetDir, addLog, "CHECKOUT");
        } catch (err: any) {
          await addLog("CHECKOUT", `Pull warning: ${err.message}. Attempting reset.`, "warn");
          await this.runShellCommand(`git reset --hard origin/${branch}`, targetDir, addLog, "CHECKOUT");
        }
      }

      // Read commit metadata
      try {
        const { stdout: commitSha } = await execAsync("git rev-parse --short HEAD", { cwd: targetDir });
        const { stdout: commitMsg } = await execAsync("git log -1 --pretty=%B", { cwd: targetDir });
        const { stdout: commitAuthor } = await execAsync("git log -1 --pretty=%an", { cwd: targetDir });

        await prisma.deployment.update({
          where: { id: deploymentId },
          data: {
            commitSha: commitSha.trim(),
            commitMessage: commitMsg.trim().split("\n")[0],
            commitAuthor: commitAuthor.trim(),
          },
        });
        await addLog("CHECKOUT", `Active commit: [${commitSha.trim()}] ${commitMsg.trim().split("\n")[0]} by ${commitAuthor.trim()}`);
      } catch (err) {
        // Non-fatal
      }

      // 4. Determine Working Directory for Monorepos / Subdirectories
      let workingDir = targetDir;
      if (config?.rootDirectory && config.rootDirectory.trim().length > 0) {
        const candidate = path.resolve(targetDir, config.rootDirectory.trim());
        if (fs.existsSync(candidate)) {
          workingDir = candidate;
          await addLog("PREPARING", `📁 Using working subdirectory: '${config.rootDirectory.trim()}' (${workingDir})`);
        } else {
          await addLog("PREPARING", `⚠️ Specified root directory '${config.rootDirectory.trim()}' does not exist inside repository. Defaulting to repository root.`, "warn");
        }
      }

      // 5. Inject Environment Variables
      await addLog("PREPARING", "Preparing environment variables & writing .env file...");
      const envMap: Record<string, string> = {};
      const envFileLines: string[] = [];

      for (const envVar of repository.envVars) {
        const decryptedVal = decrypt(envVar.encryptedValue);
        envMap[envVar.key] = decryptedVal;
        envFileLines.push(`${envVar.key}=${decryptedVal}`);
      }

      if (config?.port) {
        envMap["PORT"] = String(config.port);
      }

      if (envFileLines.length > 0) {
        fs.writeFileSync(path.join(targetDir, ".env"), envFileLines.join("\n"), "utf8");
        if (workingDir !== targetDir) {
          try {
            fs.writeFileSync(path.join(workingDir, ".env"), envFileLines.join("\n"), "utf8");
          } catch {}
        }
        await addLog("PREPARING", `Injected ${envFileLines.length} environment variables into .env`);
      }

      // 6. Install Dependencies
      if (config?.installCommand && config.installCommand.trim().length > 0) {
        await prisma.deployment.update({
          where: { id: deploymentId },
          data: { status: "INSTALLING" },
        });
        await addLog("INSTALL", `Running install command in [${path.relative(targetDir, workingDir) || "."}]: ${config.installCommand}`);
        await this.runShellCommand(config.installCommand, workingDir, addLog, "INSTALL");
        await addLog("INSTALL", "Dependencies installed successfully.");
      }

      // 7. Build Project
      if (config?.buildCommand && config.buildCommand.trim().length > 0) {
        await prisma.deployment.update({
          where: { id: deploymentId },
          data: { status: "BUILDING" },
        });
        await addLog("BUILD", `Running build command in [${path.relative(targetDir, workingDir) || "."}]: ${config.buildCommand}`);
        await this.runShellCommand(config.buildCommand, workingDir, addLog, "BUILD");
        await addLog("BUILD", "Build completed successfully.");
      }

      // 8. Start / Restart Application
      if (config?.startCommand && config.startCommand.trim().length > 0) {
        await prisma.deployment.update({
          where: { id: deploymentId },
          data: { status: "DEPLOYING" },
        });
        await addLog("DEPLOY", `Executing start command in [${path.relative(targetDir, workingDir) || "."}]: ${config.startCommand}`);

        const result = await ProcessManager.start(
          repository.id,
          config.startCommand,
          workingDir,
          envMap,
          config.port || undefined
        );

        if (!result.success) {
          throw new Error(`Process start failed: ${result.message}`);
        }

        await addLog("DEPLOY", `Application process started (PID: ${result.pid}).`);
      }

      // 9. Health Check Probe
      if (config?.port && config.healthCheckUrl) {
        await prisma.deployment.update({
          where: { id: deploymentId },
          data: { status: "HEALTH_CHECK" },
        });
        await addLog("HEALTH_CHECK", `Verifying application health on http://localhost:${config.port}${config.healthCheckUrl}...`);

        const isHealthy = await this.probeHealthCheck(config.port, config.healthCheckUrl, 10, addLog);
        if (!isHealthy) {
          await addLog("HEALTH_CHECK", "Health check did not respond with 200 OK within timeout period.", "warn");
        } else {
          await addLog("HEALTH_CHECK", "Health check passed successfully! Application is live and serving requests.");
        }
      }

      // Complete Deployment
      const completedAt = new Date();
      const durationSeconds = Math.round((completedAt.getTime() - startTime.getTime()) / 1000);

      await prisma.deployment.update({
        where: { id: deploymentId },
        data: {
          status: "SUCCESS",
          completedAt,
          duration: durationSeconds,
        },
      });

      await prisma.repository.update({
        where: { id: repository.id },
        data: { status: "RUNNING" },
      });

      await addLog("SUCCESS", `Deployment #${deploymentId.substring(0, 6)} completed successfully in ${durationSeconds}s!`);
    } catch (err: any) {
      console.error(`Deployment ${deploymentId} failed:`, err);
      const completedAt = new Date();
      const durationSeconds = Math.round((completedAt.getTime() - startTime.getTime()) / 1000);

      await prisma.deployment.update({
        where: { id: deploymentId },
        data: {
          status: "FAILED",
          completedAt,
          duration: durationSeconds,
          errorMessage: err.message,
        },
      });

      await prisma.repository.update({
        where: { id: repository.id },
        data: { status: "FAILED" },
      });

      await addLog("ERROR", `Deployment failed: ${err.message}`, "error");
    }
  }

  private static runShellCommand(
    command: string,
    cwd: string,
    addLog: (stage: string, message: string, level?: "info" | "warn" | "error") => Promise<void>,
    stage: string
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = exec(command, { cwd, maxBuffer: 10 * 1024 * 1024 });

      child.stdout?.on("data", async (data) => {
        const text = data.toString();
        for (const line of text.split("\n")) {
          if (line.trim()) await addLog(stage, line.trim(), "info");
        }
      });

      child.stderr?.on("data", async (data) => {
        const text = data.toString();
        for (const line of text.split("\n")) {
          if (line.trim()) await addLog(stage, line.trim(), "warn");
        }
      });

      child.on("close", (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Command '${command}' exited with code ${code}`));
        }
      });

      child.on("error", (err) => {
        reject(err);
      });
    });
  }

  private static async probeHealthCheck(
    port: number,
    healthPath: string,
    maxRetries = 10,
    addLog: (stage: string, message: string, level?: "info" | "warn" | "error") => Promise<void>
  ): Promise<boolean> {
    const url = `http://127.0.0.1:${port}${healthPath.startsWith("/") ? healthPath : `/${healthPath}`}`;
    for (let i = 1; i <= maxRetries; i++) {
      try {
        await new Promise((r) => setTimeout(r, 1500));
        const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
        if (res.status >= 200 && res.status < 400) {
          return true;
        }
        await addLog("HEALTH_CHECK", `Probe attempt ${i}/${maxRetries} status: ${res.status}`);
      } catch (err: any) {
        await addLog("HEALTH_CHECK", `Probe attempt ${i}/${maxRetries} waiting for port ${port}...`);
      }
    }
    return false;
  }
}
