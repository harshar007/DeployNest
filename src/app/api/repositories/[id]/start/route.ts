import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { ProcessManager } from "@/server/process-manager";
import { decrypt } from "@/lib/crypto";
import path from "path";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const repo = await prisma.repository.findUnique({
      where: { id: params.id },
      include: { config: true, envVars: true },
    });

    if (!repo || !repo.config) {
      return NextResponse.json({ error: "Repository or configuration not found" }, { status: 404 });
    }

    const baseRoot = process.env.DEPLOYMENT_ROOT || path.join(process.cwd(), "data", "deployments");
    const targetDir = repo.config.basePath && repo.config.basePath.trim().length > 0
      ? path.resolve(repo.config.basePath)
      : path.resolve(path.join(baseRoot, repo.owner, repo.name));

    const envMap: Record<string, string> = {};
    for (const envVar of repo.envVars) {
      envMap[envVar.key] = decrypt(envVar.encryptedValue);
    }

    const result = await ProcessManager.start(
      repo.id,
      repo.config.startCommand,
      targetDir,
      envMap,
      repo.config.port || undefined
    );

    if (result.success) {
      await prisma.repository.update({
        where: { id: repo.id },
        data: { status: "RUNNING" },
      });
    }

    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
