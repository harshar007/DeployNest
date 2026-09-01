import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { decrypt } from "@/lib/crypto";
import { fetchUserRepositories } from "@/lib/github";

export async function POST() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const connection = await prisma.githubConnection.findFirst({
      where: { userId: user.userId },
      orderBy: { createdAt: "desc" },
    });

    if (!connection) {
      return NextResponse.json({ error: "No GitHub connection found" }, { status: 400 });
    }

    const token = decrypt(connection.encryptedAccessToken);
    if (!token) {
      return NextResponse.json({ error: "Failed to decrypt GitHub token" }, { status: 500 });
    }

    const repos = await fetchUserRepositories(token);

    let syncedCount = 0;
    for (const repo of repos) {
      await prisma.repository.upsert({
        where: { githubRepoId: String(repo.id) },
        update: {
          owner: repo.owner,
          name: repo.name,
          fullName: repo.fullName,
          cloneUrl: repo.cloneUrl,
          htmlUrl: repo.htmlUrl,
          defaultBranch: repo.defaultBranch,
          isPrivate: repo.isPrivate,
          description: repo.description,
          language: repo.language,
          syncedAt: new Date(),
        },
        create: {
          githubRepoId: String(repo.id),
          owner: repo.owner,
          name: repo.name,
          fullName: repo.fullName,
          cloneUrl: repo.cloneUrl,
          htmlUrl: repo.htmlUrl,
          defaultBranch: repo.defaultBranch,
          isPrivate: repo.isPrivate,
          description: repo.description,
          language: repo.language,
          status: "NOT_CONFIGURED",
        },
      });
      syncedCount++;
    }

    await prisma.githubConnection.update({
      where: { id: connection.id },
      data: { lastValidatedAt: new Date() },
    });

    return NextResponse.json({
      success: true,
      syncedRepositories: syncedCount,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
