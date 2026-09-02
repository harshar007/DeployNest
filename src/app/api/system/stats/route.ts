import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { ProcessManager } from "@/server/process-manager";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [totalRepos, totalDeployments, failedDeployments, recentDeployments, repos] = await Promise.all([
      prisma.repository.count(),
      prisma.deployment.count(),
      prisma.deployment.count({ where: { status: "FAILED" } }),
      prisma.deployment.findMany({
        take: 6,
        orderBy: { createdAt: "desc" },
        include: {
          repository: {
            select: {
              id: true,
              name: true,
              fullName: true,
            },
          },
        },
      }),
      prisma.repository.findMany({
        select: { id: true, status: true },
      }),
    ]);

    let runningCount = 0;
    for (const r of repos) {
      const runtime = ProcessManager.getStatus(r.id);
      if (runtime.status === "RUNNING" || r.status === "RUNNING") {
        runningCount++;
      }
    }

    return NextResponse.json({
      stats: {
        totalRepositories: totalRepos,
        runningApps: runningCount,
        totalDeployments,
        failedDeployments,
        recentDeployments,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
