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

    const targetDeployment = await prisma.deployment.findUnique({
      where: { id: params.id },
      include: {
        repository: {
          include: { config: true },
        },
      },
    });

    if (!targetDeployment) {
      return NextResponse.json({ error: "Target deployment not found" }, { status: 404 });
    }

    // Create a new rollback deployment
    const rollbackDeployment = await prisma.deployment.create({
      data: {
        repositoryId: targetDeployment.repositoryId,
        branch: targetDeployment.branch,
        commitSha: targetDeployment.commitSha,
        commitMessage: `Rollback to [${targetDeployment.commitSha || "previous"}]: ${targetDeployment.commitMessage || "Deployment"}`,
        triggerType: "ROLLBACK",
        rollbackFromId: targetDeployment.id,
        status: "QUEUED",
      },
    });

    // Enqueue
    deploymentQueue.add(rollbackDeployment.id);

    return NextResponse.json({
      success: true,
      message: `Rollback queued for deployment ${targetDeployment.commitSha || targetDeployment.id}`,
      deploymentId: rollbackDeployment.id,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
