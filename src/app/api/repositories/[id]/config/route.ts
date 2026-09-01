import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { decrypt } from "@/lib/crypto";
import { setupGitHubWebhook, deleteGitHubWebhook } from "@/lib/github";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const config = await prisma.deploymentConfig.findUnique({
      where: { repositoryId: params.id },
    });

    return NextResponse.json({ config });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const repo = await prisma.repository.findUnique({
      where: { id: params.id },
    });

    if (!repo) {
      return NextResponse.json({ error: "Repository not found" }, { status: 404 });
    }

    const body = await req.json();
    const {
      branch = "main",
      basePath = "",
      installCommand = "npm install",
      buildCommand = "npm run build",
      startCommand = "npm start",
      processManager = "node",
      port = 3000,
      healthCheckUrl = "/health",
      autoDeploy = true,
    } = body;

    const connection = await prisma.githubConnection.findFirst({
      orderBy: { createdAt: "desc" },
    });

    let webhookId: string | null = null;

    // Automatic webhook configuration on GitHub
    if (connection && autoDeploy) {
      try {
        const token = decrypt(connection.encryptedAccessToken);
        const appUrl = process.env.APP_URL || "http://localhost:8080";
        const webhookUrl = `${appUrl}/api/webhooks/github`;
        const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET || "deploynest_default_webhook_secret_key";

        webhookId = await setupGitHubWebhook(token, repo.owner, repo.name, webhookUrl, webhookSecret);
      } catch (err) {
        console.error("Auto webhook setup error:", err);
      }
    }

    const config = await prisma.deploymentConfig.upsert({
      where: { repositoryId: repo.id },
      update: {
        branch,
        basePath: basePath.trim(),
        installCommand: installCommand.trim(),
        buildCommand: buildCommand.trim(),
        startCommand: startCommand.trim(),
        processManager,
        port: port ? parseInt(String(port), 10) : null,
        healthCheckUrl: healthCheckUrl.trim(),
        autoDeploy: Boolean(autoDeploy),
        webhookId: webhookId || undefined,
      },
      create: {
        repositoryId: repo.id,
        branch,
        basePath: basePath.trim(),
        installCommand: installCommand.trim(),
        buildCommand: buildCommand.trim(),
        startCommand: startCommand.trim(),
        processManager,
        port: port ? parseInt(String(port), 10) : null,
        healthCheckUrl: healthCheckUrl.trim(),
        autoDeploy: Boolean(autoDeploy),
        webhookId,
      },
    });

    // Update repository status if it was not configured
    if (repo.status === "NOT_CONFIGURED") {
      await prisma.repository.update({
        where: { id: repo.id },
        data: { status: "CONFIGURED" },
      });
    }

    return NextResponse.json({ success: true, config });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
