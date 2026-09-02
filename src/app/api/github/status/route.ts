import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { decrypt, maskToken } from "@/lib/crypto";

export async function GET() {
  try {
    let user = await getCurrentUser();
    if (!user) {
      const adminUser = await prisma.user.findFirst({ where: { role: "admin" } });
      if (adminUser) {
        user = {
          userId: adminUser.id,
          email: adminUser.email,
          name: adminUser.name,
          role: adminUser.role,
        };
      } else {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
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
