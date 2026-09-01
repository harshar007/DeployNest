import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { encrypt, decrypt } from "@/lib/crypto";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const envVars = await prisma.environmentVariable.findMany({
      where: { repositoryId: params.id },
      orderBy: { key: "asc" },
    });

    const formatted = envVars.map((v) => ({
      id: v.id,
      key: v.key,
      value: v.isSecret ? "••••••••••••" : decrypt(v.encryptedValue),
      isSecret: v.isSecret,
      updatedAt: v.updatedAt,
    }));

    return NextResponse.json({ envVars: formatted });
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

    const { key, value, isSecret = true } = await req.json();
    if (!key || typeof key !== "string") {
      return NextResponse.json({ error: "Key is required" }, { status: 400 });
    }

    const encryptedValue = encrypt(value || "");

    const envVar = await prisma.environmentVariable.upsert({
      where: {
        repositoryId_key: {
          repositoryId: params.id,
          key: key.trim(),
        },
      },
      update: {
        encryptedValue,
        isSecret: Boolean(isSecret),
      },
      create: {
        repositoryId: params.id,
        key: key.trim(),
        encryptedValue,
        isSecret: Boolean(isSecret),
      },
    });

    return NextResponse.json({
      success: true,
      envVar: {
        id: envVar.id,
        key: envVar.key,
        value: envVar.isSecret ? "••••••••••••" : value,
        isSecret: envVar.isSecret,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const envVarId = searchParams.get("envId");

    if (!envVarId) {
      return NextResponse.json({ error: "Environment variable ID is required" }, { status: 400 });
    }

    await prisma.environmentVariable.delete({
      where: { id: envVarId },
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
