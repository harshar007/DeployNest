import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { decrypt } from "@/lib/crypto";
import { fetchRepoBranches } from "@/lib/github";

export async function GET(req: Request, { params }: { params: { id: string } }) {
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

    const connection = await prisma.githubConnection.findFirst({
      orderBy: { createdAt: "desc" },
    });

    if (!connection) {
      return NextResponse.json({ branches: [repo.defaultBranch || "main"] });
    }

    const token = decrypt(connection.encryptedAccessToken);
    const branches = await fetchRepoBranches(token, repo.owner, repo.name);

    return NextResponse.json({ branches });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
