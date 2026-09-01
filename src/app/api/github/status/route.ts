import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { decrypt, maskToken } from "@/lib/crypto";

export async function GET() {
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
      return NextResponse.json({ connected: false, connection: null });
    }

    const decryptedToken = decrypt(connection.encryptedAccessToken);

    return NextResponse.json({
      connected: true,
      connection: {
        id: connection.id,
        githubUsername: connection.githubUsername,
        avatarUrl: connection.avatarUrl,
        maskedToken: maskToken(decryptedToken),
        lastValidatedAt: connection.lastValidatedAt,
        createdAt: connection.createdAt,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
