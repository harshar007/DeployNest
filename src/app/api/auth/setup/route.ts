import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hashPassword, generateToken } from "@/lib/auth";

export async function GET() {
  try {
    const adminCount = await prisma.user.count();
    return NextResponse.json({ setupNeeded: adminCount === 0 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const adminCount = await prisma.user.count();
    if (adminCount > 0) {
      return NextResponse.json({ error: "System is already set up" }, { status: 400 });
    }

    const { name, email, password } = await req.json();
    if (!name || !email || !password || password.length < 6) {
      return NextResponse.json({ error: "Invalid name, email, or password (min 6 characters)" }, { status: 400 });
    }

    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({
      data: {
        name,
        email: email.toLowerCase().trim(),
        passwordHash,
        role: "admin",
      },
    });

    const token = generateToken({
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    });

    const response = NextResponse.json({
      success: true,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    });

    response.cookies.set("deploynest_session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: "/",
    });

    return response;
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
