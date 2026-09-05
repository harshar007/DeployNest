import { spawn, ChildProcess } from "child_process";
import path from "path";
import fs from "fs";
import net from "net";

export interface RunningProcess {
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

const MAX_LOG_BUFFER = 500;

// Preserve processes map across Next.js route reloads and module boundaries
const globalForProcess = globalThis as unknown as {
  deploynestProcesses?: Map<string, RunningProcess>;
};

const processes: Map<string, RunningProcess> =
  globalForProcess.deploynestProcesses || new Map<string, RunningProcess>();

globalForProcess.deploynestProcesses = processes;

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
    // If already running, stop the existing process first
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

      const processEnv: NodeJS.ProcessEnv = {
        ...process.env,
        ...env,
        PORT: port ? String(port) : (env.PORT || "3000"),
      };

      // Prepare log file in working directory for persistence
      const logFilePath = path.join(cwd, "deploynest.log");

      const child = spawn(shell, [shellArg, command], {
        cwd,
        env: processEnv,
        detached: !isWindows, // Creates a separate process group on Unix/Linux
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

      const appendToFile = (text: string) => {
        try {
          fs.appendFileSync(logFilePath, `[${new Date().toISOString()}] ${text}\n`, "utf8");
        } catch {
          // Non-fatal
        }
      };

      child.stdout?.on("data", (data: Buffer) => {
        const text = data.toString();
        this.appendLog(repoId, text, "stdout");
        appendToFile(text.trimEnd());
      });

      child.stderr?.on("data", (data: Buffer) => {
        const text = data.toString();
        this.appendLog(repoId, text, "stderr");
        appendToFile(`[STDERR] ${text.trimEnd()}`);
      });

      child.on("error", (err) => {
        const errMsg = `Process spawn error: ${err.message}`;
        this.appendLog(repoId, errMsg, "stderr");
        appendToFile(`[ERROR] ${errMsg}`);
        procRecord.status = "FAILED";
      });

      child.on("close", (code, signal) => {
        const exitMsg = `Process exited with code ${code ?? "none"} (signal: ${signal ?? "none"})`;
        this.appendLog(repoId, exitMsg, code === 0 ? "stdout" : "stderr");
        appendToFile(`[EXIT] ${exitMsg}`);
        if (procRecord.status === "RUNNING") {
          procRecord.status = code === 0 ? "STOPPED" : "FAILED";
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
   * Checks whether the application process is actively running
   */
  static isAlive(repoId: string): boolean {
    const procRecord = processes.get(repoId);
    if (!procRecord || procRecord.status !== "RUNNING" || !procRecord.pid) {
      return false;
    }

    try {
      // Sending signal 0 checks whether the process exists without killing it
      process.kill(procRecord.pid, 0);
      return true;
    } catch {
      procRecord.status = "STOPPED";
      return false;
    }
  }

  /**
   * Stops a running application process
   */
  static async stop(repoId: string): Promise<{ success: boolean; message: string }> {
    const procRecord = processes.get(repoId);
    if (!procRecord || !procRecord.process) {
      return { success: true, message: "Process was not running" };
    }

    try {
      const pid = procRecord.pid;
      if (pid) {
        if (process.platform === "win32") {
          const { execSync } = await import("child_process");
          try {
            execSync(`taskkill /pid ${pid} /T /F`);
          } catch {
            // Already stopped
          }
        } else {
          // Send SIGTERM to process group on Unix/Linux
          try {
            process.kill(-pid, "SIGTERM");
          } catch {
            try {
              procRecord.process.kill("SIGTERM");
            } catch {
              // Already stopped
            }
          }

          // Wait briefly and verify, then force kill if still running
          await new Promise((r) => setTimeout(r, 1000));
          try {
            process.kill(pid, 0);
            // If still alive, SIGKILL
            try {
              process.kill(-pid, "SIGKILL");
            } catch {
              procRecord.process.kill("SIGKILL");
            }
          } catch {
            // Process terminated successfully
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
   * Tests whether a given TCP port is open and listening locally
   */
  static testPortOpen(port: number, timeoutMs = 2000): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      let resolved = false;

      socket.setTimeout(timeoutMs);

      socket.on("connect", () => {
        if (!resolved) {
          resolved = true;
          socket.destroy();
          resolve(true);
        }
      });

      socket.on("timeout", () => {
        if (!resolved) {
          resolved = true;
          socket.destroy();
          resolve(false);
        }
      });

      socket.on("error", () => {
        if (!resolved) {
          resolved = true;
          socket.destroy();
          resolve(false);
        }
      });

      socket.connect(port, "127.0.0.1");
    });
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
    isAlive?: boolean;
  } {
    const procRecord = processes.get(repoId);
    if (!procRecord) {
      return { status: "STOPPED" };
    }

    const alive = this.isAlive(repoId);
    const status = alive ? "RUNNING" : procRecord.status === "RUNNING" ? "STOPPED" : procRecord.status;

    const uptime = procRecord.startedAt && status === "RUNNING"
      ? Math.floor((Date.now() - procRecord.startedAt.getTime()) / 1000)
      : undefined;

    return {
      status,
      pid: procRecord.pid,
      port: procRecord.port,
      startedAt: procRecord.startedAt,
      uptime,
      isAlive: alive,
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
