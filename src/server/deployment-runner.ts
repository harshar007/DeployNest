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
      console.error(`[DEPLOY] Deployment ${deploymentId} not found`);
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
          throw new Error(`Permission denied creating directory '${targetDir}'. Please run 'sudo chmod -R 777 ./data' or 'sudo chmod -R 777 /var/www' on your VPS server.`);
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

      // Configure Git safe directory to prevent ownership warnings
      try {
        await execAsync(`git config --global --add safe.directory "${targetDir}"`);
        await execAsync(`git config --global --add safe.directory "*"`);
      } catch {
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
          await addLog("CHECKOUT", `Pull warning: ${err.message}. Attempting hard reset to origin/${branch}.`, "warn");
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
      } catch {
        // Non-fatal
      }

      // 4. Determine Working Directory for Subdirectories / Monorepos
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
        await addLog("INSTALL", `Running: ${config.installCommand}`);
        await this.runShellCommand(config.installCommand, workingDir, addLog, "INSTALL", envMap);
        await addLog("INSTALL", "Dependencies installed successfully.");
      }

      // 7. Build Project
      if (config?.buildCommand && config.buildCommand.trim().length > 0) {
        await prisma.deployment.update({
          where: { id: deploymentId },
          data: { status: "BUILDING" },
        });
        await addLog("BUILD", `Running: ${config.buildCommand}`);
        await this.runShellCommand(config.buildCommand, workingDir, addLog, "BUILD", envMap);
        await addLog("BUILD", "Build completed successfully.");
      }

      // 8. Start / Launch Application
      if (config?.startCommand && config.startCommand.trim().length > 0) {
        await prisma.deployment.update({
          where: { id: deploymentId },
          data: { status: "DEPLOYING" },
        });
        await addLog("DEPLOY", `Executing start command: ${config.startCommand}`);

        const isDockerCompose = config.startCommand.includes("docker compose") || config.startCommand.includes("docker-compose");

        if (isDockerCompose) {
          await addLog("CONTAINER", "Launching Docker Compose stack...");
          await this.runShellCommand(config.startCommand, workingDir, addLog, "CONTAINER", envMap);
          await addLog("CONTAINER", "Docker Compose stack launched.");
        } else {
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

          await addLog("PROCESS", `Application process spawned (PID: ${result.pid}).`);

          // Allow 1 second for immediate runtime crash check
          await new Promise((r) => setTimeout(r, 1000));
          if (!ProcessManager.isAlive(repository.id)) {
            const logs = ProcessManager.getLogs(repository.id, 10);
            const logSnippet = logs.map(l => l.text).join(" | ");
            throw new Error(`Application process terminated immediately after startup. Details: ${logSnippet || "Process closed prematurely."}`);
          }
        }
      }

      // 9. Port Availability Check
      const targetPort = config?.port;
      if (targetPort && targetPort > 0) {
        await prisma.deployment.update({
          where: { id: deploymentId },
          data: { status: "HEALTH_CHECK" },
        });

        await addLog("PORT", `Verifying TCP socket listening on port ${targetPort}...`);
        let portOpen = false;
        const maxPortRetries = 15;

        for (let attempt = 1; attempt <= maxPortRetries; attempt++) {
          portOpen = await ProcessManager.testPortOpen(targetPort, 1200);
          if (portOpen) {
            await addLog("PORT", `Port ${targetPort} is actively listening on TCP interface.`);
            break;
          }

          // Check if process crashed while waiting for port
          if (!config?.startCommand?.includes("docker") && !ProcessManager.isAlive(repository.id)) {
            const logs = ProcessManager.getLogs(repository.id, 10);
            const logSnippet = logs.map(l => l.text).join(" | ");
            throw new Error(`Application process died while waiting for port ${targetPort}. Details: ${logSnippet || "Process exited."}`);
          }

          await addLog("PORT", `Port ${targetPort} probe ${attempt}/${maxPortRetries} - waiting for socket bind...`);
          await new Promise((r) => setTimeout(r, 1000));
        }

        if (!portOpen) {
          throw new Error(`Port ${targetPort} failed to open within ${maxPortRetries}s timeout. Ensure your start command binds to 0.0.0.0:${targetPort}.`);
        }
      }

      // 10. HTTP Health Check Probe
      if (targetPort && config?.healthCheckUrl && config.healthCheckUrl.trim().length > 0) {
        await addLog("HEALTH", `Verifying HTTP endpoint http://127.0.0.1:${targetPort}${config.healthCheckUrl}...`);
        const isHealthy = await this.probeHealthCheck(targetPort, config.healthCheckUrl, 10, addLog);

        if (!isHealthy) {
          throw new Error(`Health check probe failed on http://127.0.0.1:${targetPort}${config.healthCheckUrl}. Application did not return 200-399 status.`);
        }

        await addLog("HEALTH", "Health check passed! Application is live and serving HTTP requests.");
      }

      // 11. Post-Health-Check Stabilization Check
      await addLog("VERIFY", "Performing post-startup stabilization check...");
      await new Promise((r) => setTimeout(r, 2000));

      if (!config?.startCommand?.includes("docker") && !ProcessManager.isAlive(repository.id)) {
        throw new Error("Application process died shortly after passing health check. Review application logs for runtime crash details.");
      }

      if (targetPort && targetPort > 0) {
        const portStillOpen = await ProcessManager.testPortOpen(targetPort, 1500);
        if (!portStillOpen) {
          throw new Error(`Port ${targetPort} closed unexpectedly during stabilization check.`);
        }
      }

      await addLog("VERIFY", "Application process and port verified stable.");

      // 12. Complete Deployment as SUCCESS
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

      await addLog("SUCCESS", `Deployment #${deploymentId.substring(0, 6)} completed successfully in ${durationSeconds}s! Public port: ${targetPort || "N/A"}`);
    } catch (err: any) {
      console.error(`[DEPLOY] Deployment ${deploymentId} failed:`, err);
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
    stage: string,
    customEnv: Record<string, string> = {}
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      // During INSTALL and BUILD stages, ensure NODE_ENV does not cause npm to omit devDependencies
      const mergedEnv = {
        ...process.env,
        ...(stage === "INSTALL" || stage === "BUILD" ? { NODE_ENV: "development" } : {}),
        ...customEnv,
      };

      const child = exec(command, { cwd, maxBuffer: 10 * 1024 * 1024, env: mergedEnv as NodeJS.ProcessEnv });

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
        await new Promise((r) => setTimeout(r, 1000));
        const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
        if (res.status >= 200 && res.status < 400) {
          return true;
        }
        await addLog("HEALTH", `Probe attempt ${i}/${maxRetries} responded with HTTP ${res.status}`);
      } catch (err: any) {
        await addLog("HEALTH", `Probe attempt ${i}/${maxRetries} waiting for HTTP response on port ${port}...`);
      }
    }
    return false;
  }
}
