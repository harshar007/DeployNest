import { spawn, ChildProcess } from "child_process";
import path from "path";
import fs from "fs";

interface RunningProcess {
  repoId: string;
  command: string;
  cwd: string;
  env: Record<string, string>;
  port?: number;
  process: ChildProcess | null;
  pid?: number;
  status: "RUNNING" | "STOPPED" | "FAILED";
  startedAt?: Date;
  logs: Array<{ timestamp: Date; text: string; stream: "stdout" | "stderr" }>;
}

const processes = new Map<string, RunningProcess>();
const MAX_LOG_BUFFER = 200;

export class ProcessManager {
  /**
   * Starts an application in the background and tracks it
   */
  static async start(
    repoId: string,
    command: string,
    cwd: string,
    env: Record<string, string> = {},
    port?: number
  ): Promise<{ success: boolean; message: string; pid?: number }> {
    // If already running, stop it first
    if (processes.has(repoId)) {
      const existing = processes.get(repoId)!;
      if (existing.status === "RUNNING") {
        await this.stop(repoId);
      }
    }

    if (!fs.existsSync(cwd)) {
      return { success: false, message: `Working directory does not exist: ${cwd}` };
    }

    try {
      const isWindows = process.platform === "win32";
      const shell = isWindows ? "cmd.exe" : "/bin/sh";
      const shellArg = isWindows ? "/c" : "-c";

      const processEnv = {
        ...process.env,
        ...env,
        PORT: port ? String(port) : (env.PORT || "3000"),
      };

      const child = spawn(shell, [shellArg, command], {
        cwd,
        env: processEnv,
        detached: !isWindows, // Allow it to run in separate process group on Linux/macOS
        stdio: ["ignore", "pipe", "pipe"],
      });

      const procRecord: RunningProcess = {
        repoId,
        command,
        cwd,
        env,
        port,
        process: child,
        pid: child.pid,
        status: "RUNNING",
        startedAt: new Date(),
        logs: [],
      };

      processes.set(repoId, procRecord);

      child.stdout?.on("data", (data: Buffer) => {
        const text = data.toString();
        this.appendLog(repoId, text, "stdout");
      });

      child.stderr?.on("data", (data: Buffer) => {
        const text = data.toString();
        this.appendLog(repoId, text, "stderr");
      });

      child.on("error", (err) => {
        this.appendLog(repoId, `Process error: ${err.message}`, "stderr");
        if (procRecord.status === "RUNNING") {
          procRecord.status = "FAILED";
        }
      });

      child.on("close", (code) => {
        this.appendLog(repoId, `Process exited with code ${code}`, code === 0 ? "stdout" : "stderr");
        if (code !== 0 && procRecord.status === "RUNNING") {
          procRecord.status = "FAILED";
        } else if (procRecord.status === "RUNNING") {
          procRecord.status = "STOPPED";
        }
      });

      return {
        success: true,
        message: `Process started successfully with PID ${child.pid}`,
        pid: child.pid,
      };
    } catch (err: any) {
      return {
        success: false,
        message: `Failed to spawn process: ${err.message}`,
      };
    }
  }

  /**
   * Stops a running application
   */
  static async stop(repoId: string): Promise<{ success: boolean; message: string }> {
    const procRecord = processes.get(repoId);
    if (!procRecord || !procRecord.process) {
      return { success: true, message: "Process was not running" };
    }

    try {
      if (procRecord.process.pid) {
        if (process.platform === "win32") {
          // Force kill process tree on Windows
          const { execSync } = await import("child_process");
          try {
            execSync(`taskkill /pid ${procRecord.process.pid} /T /F`);
          } catch {
            // Process might have already exited
          }
        } else {
          // Send SIGTERM to process group on Unix
          try {
            process.kill(-procRecord.process.pid, "SIGTERM");
          } catch {
            procRecord.process.kill("SIGTERM");
          }
        }
      }

      procRecord.status = "STOPPED";
      procRecord.process = null;
      return { success: true, message: "Process stopped successfully" };
    } catch (err: any) {
      return { success: false, message: `Failed to stop process: ${err.message}` };
    }
  }

  /**
   * Restarts an application
   */
  static async restart(repoId: string): Promise<{ success: boolean; message: string; pid?: number }> {
    const procRecord = processes.get(repoId);
    if (!procRecord) {
      return { success: false, message: "No previous process configuration found" };
    }

    await this.stop(repoId);
    return this.start(
      repoId,
      procRecord.command,
      procRecord.cwd,
      procRecord.env,
      procRecord.port
    );
  }

  /**
   * Gets current runtime status for a repository
   */
  static getStatus(repoId: string): {
    status: "RUNNING" | "STOPPED" | "FAILED" | "NOT_CONFIGURED";
    pid?: number;
    port?: number;
    startedAt?: Date;
    uptime?: number;
  } {
    const procRecord = processes.get(repoId);
    if (!procRecord) {
      return { status: "STOPPED" };
    }

    const uptime = procRecord.startedAt && procRecord.status === "RUNNING"
      ? Math.floor((Date.now() - procRecord.startedAt.getTime()) / 1000)
      : undefined;

    return {
      status: procRecord.status,
      pid: procRecord.pid,
      port: procRecord.port,
      startedAt: procRecord.startedAt,
      uptime,
    };
  }

  /**
   * Gets buffered application logs
   */
  static getLogs(repoId: string, limit = 100) {
    const procRecord = processes.get(repoId);
    if (!procRecord) return [];
    return procRecord.logs.slice(-limit);
  }

  private static appendLog(repoId: string, text: string, stream: "stdout" | "stderr") {
    const procRecord = processes.get(repoId);
    if (!procRecord) return;

    const lines = text.split("\n");
    for (const line of lines) {
      if (line.trim().length > 0) {
        procRecord.logs.push({
          timestamp: new Date(),
          text: line,
          stream,
        });
      }
    }

    if (procRecord.logs.length > MAX_LOG_BUFFER) {
      procRecord.logs = procRecord.logs.slice(-MAX_LOG_BUFFER);
    }
  }
}
