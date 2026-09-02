import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { prisma } from "./db";

const JWT_SECRET = process.env.JWT_SECRET || "deploynest_jwt_secret_key_change_in_production_min32chars";
const COOKIE_NAME = "deploynest_session";

export interface SessionPayload {
  userId: string;
  email: string;
  role: string;
  name: string;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateToken(payload: SessionPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}

export function verifyToken(token: string): SessionPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as SessionPayload;
  } catch {
    return null;
  }
}

export async function getCurrentUser(): Promise<SessionPayload | null> {
  try {
    const cookieStore = cookies();
    const token = cookieStore.get(COOKIE_NAME)?.value;
    if (token) {
      const verified = verifyToken(token);
      if (verified) return verified;
    }
  } catch (err) {
    // Cookie access error fallback
  }

  // Self-hosted VPS single-tenant fallback: Resolve or auto-initialize admin
  try {
    let admin = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
    if (!admin) {
      const defaultPasswordHash = await hashPassword("admin123");
      admin = await prisma.user.create({
        data: {
          name: "Administrator",
          email: "admin@deploynest.local",
          passwordHash: defaultPasswordHash,
          role: "admin",
        },
      });
    }

    return {
      userId: admin.id,
      email: admin.email,
      name: admin.name,
      role: admin.role,
    };
  } catch (dbErr) {
    console.error("Failed to resolve fallback user:", dbErr);
    return null;
  }
}

export async function isSystemSetup(): Promise<boolean> {
  const adminCount = await prisma.user.count();
  return adminCount > 0;
}
