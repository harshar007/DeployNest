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

    let repoConfig = repo.config;
    if (!repoConfig) {
      repoConfig = await prisma.deploymentConfig.create({
        data: {
          repositoryId: repo.id,
          branch: repo.defaultBranch || "main",
          frameworkPreset: "custom",
          installCommand: "npm install",
          buildCommand: "npm run build",
          startCommand: "npm start",
          port: 3000,
          healthCheckUrl: "/",
          autoDeploy: true,
        },
      });
      await prisma.repository.update({
        where: { id: repo.id },
        data: { status: "CONFIGURED" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const branch = body.branch || repoConfig?.branch || repo.defaultBranch || "main";

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
