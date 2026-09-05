import { NextResponse } from "next/server";
import net from "net";
import { exec } from "child_process";
import { promisify } from "util";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { ProcessManager } from "@/server/process-manager";

const execAsync = promisify(exec);

async function testTcpPort(host: string, port: number, timeoutMs = 2000): Promise<{ open: boolean; error?: string }> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let isResolved = false;

    socket.setTimeout(timeoutMs);

    socket.on("connect", () => {
      if (!isResolved) {
        isResolved = true;
        socket.destroy();
        resolve({ open: true });
      }
    });

    socket.on("timeout", () => {
      if (!isResolved) {
        isResolved = true;
        socket.destroy();
        resolve({ open: false, error: "Connection timed out" });
      }
    });

    socket.on("error", (err) => {
      if (!isResolved) {
        isResolved = true;
        socket.destroy();
        resolve({ open: false, error: err.message });
      }
    });

    socket.connect(port, host);
  });
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const repo = await prisma.repository.findUnique({
      where: { id: params.id },
      include: { config: true },
    });

    if (!repo) {
      return NextResponse.json({ error: "Repository not found" }, { status: 404 });
    }

    const port = repo.config?.port || 3000;
    const processStatus = ProcessManager.getStatus(repo.id);

    // Test port connectivity locally
    const localProbe = await testTcpPort("127.0.0.1", port);

    // Check firewall status (Linux UFW)
    let ufwStatus = "unknown";
    let ufwPortAllowed = false;

    if (process.platform === "linux") {
      try {
        const { stdout } = await execAsync("sudo ufw status || ufw status");
        ufwStatus = stdout;
        if (stdout.includes(String(port))) {
          ufwPortAllowed = true;
        }
      } catch (err: any) {
        ufwStatus = `UFW check not available or requires sudo: ${err.message}`;
      }
    } else {
      ufwStatus = `Running on ${process.platform}`;
    }

    // Determine diagnosis summary
    let statusText = "HEALTHY";
    let suggestions: string[] = [];

    if (processStatus.status !== "RUNNING") {
      statusText = "PROCESS_STOPPED";
      suggestions.push("The application process is currently stopped. Click 'Start App' or 'Deploy Now'.");
    } else if (!localProbe.open) {
      statusText = "PORT_NOT_LISTENING";
      suggestions.push(`Process PID ${processStatus.pid} is registered, but nothing is listening on port ${port}. Check 'Application Logs' for crash details.`);
      suggestions.push(`Ensure your application start script binds to 0.0.0.0 (e.g. host 0.0.0.0 port ${port}).`);
    } else {
      statusText = "LISTENING_OK";
      suggestions.push(`Application is actively listening on port ${port}.`);
      if (process.platform === "linux" && !ufwPortAllowed) {
        suggestions.push(`If you cannot access http://<YOUR_IP>:${port} externally, open the port in your VPS firewall using the button below.`);
      }
    }

    return NextResponse.json({
      success: true,
      diagnosis: {
        repoId: repo.id,
        port,
        processStatus,
        localProbe,
        ufwPortAllowed,
        ufwStatus,
        statusText,
        suggestions,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
