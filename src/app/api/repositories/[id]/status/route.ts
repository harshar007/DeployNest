import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { ProcessManager } from "@/server/process-manager";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const repo = await prisma.repository.findUnique({
      where: { id: params.id },
      include: {
        config: true,
        deployments: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });

    if (!repo) {
      return NextResponse.json({ error: "Repository not found" }, { status: 404 });
    }

    const runtime = ProcessManager.getStatus(repo.id);

    return NextResponse.json({
      status: runtime.status !== "STOPPED" ? runtime.status : repo.status,
      runtime,
      latestDeployment: repo.deployments[0] || null,
      config: repo.config,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
