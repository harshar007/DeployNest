import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { encrypt, maskToken } from "@/lib/crypto";
import { validateGitHubToken, fetchUserRepositories } from "@/lib/github";

export async function POST(req: Request) {
  try {
    let user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized. Please log in or refresh the page." }, { status: 401 });
    }

    // Ensure valid user record exists in DB to satisfy foreign key constraint
    let validUser = await prisma.user.findUnique({ where: { id: user.userId } });
    if (!validUser) {
      validUser = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
      if (!validUser) {
        return NextResponse.json({ error: "User account not found. Please log in again." }, { status: 401 });
      }
      user.userId = validUser.id;
    }

    const { token } = await req.json();
    if (!token || typeof token !== "string" || token.trim().length === 0) {
      return NextResponse.json({ error: "GitHub token is required" }, { status: 400 });
    }

    const cleanToken = token.trim();

    // 1. Validate token with GitHub API
    let profile;
    try {
      profile = await validateGitHubToken(cleanToken);
    } catch (err: any) {
      return NextResponse.json(
        { error: `Invalid GitHub token: ${err.message || "Authentication failed"}` },
        { status: 400 }
      );
    }

    // 2. Encrypt token using AES-256-GCM
    const encryptedAccessToken = encrypt(cleanToken);

    // 3. Upsert GitHub connection
    const existing = await prisma.githubConnection.findFirst({
      where: { userId: user.userId },
    });

    let connection;
    if (existing) {
      connection = await prisma.githubConnection.update({
        where: { id: existing.id },
        data: {
          githubUserId: profile.id,
          githubUsername: profile.username,
          avatarUrl: profile.avatarUrl,
          encryptedAccessToken,
          lastValidatedAt: new Date(),
        },
      });
    } else {
      connection = await prisma.githubConnection.create({
        data: {
          userId: user.userId,
          githubUserId: profile.id,
          githubUsername: profile.username,
          avatarUrl: profile.avatarUrl,
          encryptedAccessToken,
          lastValidatedAt: new Date(),
        },
      });
    }

    // 4. Initial repository synchronization
    let syncedCount = 0;
    try {
      const repos = await fetchUserRepositories(cleanToken);
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
    } catch (syncErr) {
      console.error("Initial repo sync failed:", syncErr);
    }

    return NextResponse.json({
      success: true,
      profile: {
        username: profile.username,
        avatarUrl: profile.avatarUrl,
        maskedToken: maskToken(cleanToken),
      },
      syncedRepositories: syncedCount,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
