import { NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/db";
import { deploymentQueue } from "@/lib/queue";

export async function POST(req: Request) {
  try {
    const event = req.headers.get("x-github-event");
    const signature = req.headers.get("x-hub-signature-256");
    const payloadRaw = await req.text();

    if (event === "ping") {
      return NextResponse.json({ message: "Pong! DeployNest webhook is active." });
    }

    if (event !== "push") {
      return NextResponse.json({ message: `Ignored event: ${event}` });
    }

    // Verify signature if secret is configured
    const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET || "deploynest_default_webhook_secret_key";
    if (signature && webhookSecret) {
      const hmac = crypto.createHmac("sha256", webhookSecret);
      const digest = "sha256=" + hmac.update(payloadRaw).digest("hex");
      if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest))) {
        return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
      }
    }

    const payload = JSON.parse(payloadRaw);
    const repoFullName = payload.repository?.full_name;
    const ref = payload.ref; // "refs/heads/main"

    if (!repoFullName || !ref) {
      return NextResponse.json({ error: "Invalid webhook payload structure" }, { status: 400 });
    }

    const branch = ref.replace("refs/heads/", "");

    // Find repository in database
    const repo = await prisma.repository.findFirst({
      where: { fullName: repoFullName },
      include: { config: true },
    });

    if (!repo) {
      return NextResponse.json({ message: `Repository ${repoFullName} is not managed in DeployNest.` });
    }

    if (!repo.config) {
      return NextResponse.json({ message: `Repository ${repoFullName} is not configured.` });
    }

    if (!repo.config.autoDeploy) {
      return NextResponse.json({ message: `Auto-deploy is disabled for ${repoFullName}.` });
    }

    if (repo.config.branch && repo.config.branch !== branch) {
      return NextResponse.json({
        message: `Push was on branch '${branch}', but configured deploy branch is '${repo.config.branch}'. Ignoring.`,
      });
    }

    const headCommit = payload.head_commit;
    const commitSha = headCommit?.id ? headCommit.id.substring(0, 7) : undefined;
    const commitMessage = headCommit?.message ? headCommit.message.split("\n")[0] : undefined;
    const commitAuthor = headCommit?.author?.name || payload.pusher?.name || "GitHub Push";

    // Create deployment record
    const deployment = await prisma.deployment.create({
      data: {
        repositoryId: repo.id,
        branch,
        commitSha,
        commitMessage,
        commitAuthor,
        triggerType: "WEBHOOK",
        status: "QUEUED",
      },
    });

    // Enqueue
    deploymentQueue.add(deployment.id);

    return NextResponse.json({
      success: true,
      message: `Automatic deployment queued for ${repoFullName}@${branch} [${commitSha}]`,
      deploymentId: deployment.id,
    });
  } catch (err: any) {
    console.error("Webhook processing error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
