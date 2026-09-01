import { redirect } from "next/navigation";
import { isSystemSetup, getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const isSetup = await isSystemSetup();
  if (!isSetup) {
    redirect("/setup");
  }

  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  redirect("/dashboard");
}
