import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { deploymentQueue } from "@/lib/queue";

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

    const body = await req.json().catch(() => ({}));
    const branch = body.branch || repo.config?.branch || repo.defaultBranch || "main";

    // Create deployment record
    const deployment = await prisma.deployment.create({
      data: {
        repositoryId: repo.id,
        branch,
        triggerType: "MANUAL",
        status: "QUEUED",
      },
    });

    // Enqueue job for background execution
    deploymentQueue.add(deployment.id);

    return NextResponse.json({
      success: true,
      message: "Deployment queued successfully",
      deploymentId: deployment.id,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
