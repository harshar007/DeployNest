import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSystemHealth } from "@/lib/system";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const health = await getSystemHealth();
    return NextResponse.json({ health });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
