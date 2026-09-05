import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

const execAsync = promisify(exec);

export async function POST(req: Request, { params }: { params: { id: string } }) {
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

    if (process.platform !== "linux") {
      return NextResponse.json({
        success: true,
        message: `Firewall automation is only required on Linux VPS. Current OS: ${process.platform}. Please ensure port ${port} is open in Windows Defender or cloud security groups.`,
      });
    }

    try {
      const { stdout } = await execAsync(`sudo ufw allow ${port}/tcp && sudo ufw reload || ufw allow ${port}/tcp`);
      return NextResponse.json({
        success: true,
        message: `Successfully opened port ${port}/tcp in VPS firewall (UFW)!`,
        output: stdout,
      });
    } catch (cmdErr: any) {
      return NextResponse.json({
        success: false,
        error: `Could not run ufw command directly: ${cmdErr.message}. You can manually run: sudo ufw allow ${port}/tcp`,
      }, { status: 500 });
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
