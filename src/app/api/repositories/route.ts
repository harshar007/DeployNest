import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { ProcessManager } from "@/server/process-manager";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const filter = searchParams.get("filter"); // "all", "configured", "running"
    const search = searchParams.get("search")?.toLowerCase();

    const repos = await prisma.repository.findMany({
      include: {
        config: true,
        deployments: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    const enriched = repos.map((repo) => {
      const runtime = ProcessManager.getStatus(repo.id);
      let status = repo.status;
      if (runtime.status === "RUNNING") {
        status = "RUNNING";
      } else if (runtime.status === "STOPPED" && repo.status === "RUNNING") {
        status = "STOPPED";
      }

      return {
        ...repo,
        status,
        runtime,
        latestDeployment: repo.deployments[0] || null,
      };
    });

    let filtered = enriched;
    if (filter === "configured") {
      filtered = filtered.filter((r) => r.config !== null);
    } else if (filter === "running") {
      filtered = filtered.filter((r) => r.status === "RUNNING");
    }

    if (search) {
      filtered = filtered.filter(
        (r) =>
          r.name.toLowerCase().includes(search) ||
          r.fullName.toLowerCase().includes(search) ||
          (r.description && r.description.toLowerCase().includes(search))
      );
    }

    return NextResponse.json({ repositories: filtered });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
