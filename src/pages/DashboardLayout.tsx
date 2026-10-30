import React, { useEffect, useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { Sidebar } from "@/components/Sidebar";
import { Navbar } from "@/components/Navbar";

export const DashboardLayout: React.FC = () => {
  const navigate = useNavigate();
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function verifyAuth() {
      try {
        const setupRes = await fetch("/api/auth/setup");
        if (setupRes.ok) {
          const setupData = await setupRes.json();
          if (setupData.setupNeeded) {
            if (mounted) navigate("/setup", { replace: true });
            return;
          }
        }

        const meRes = await fetch("/api/auth/me");
        if (meRes.ok) {
          const meData = await meRes.json();
          if (!meData.authenticated) {
            if (mounted) navigate("/login", { replace: true });
            return;
          }
        } else {
          if (mounted) navigate("/login", { replace: true });
          return;
        }

        if (mounted) setCheckingAuth(false);
      } catch {
        if (mounted) navigate("/login", { replace: true });
      }
    }

    verifyAuth();
    return () => {
      mounted = false;
    };
  }, [navigate]);

  if (checkingAuth) {
    return (
      <div className="flex min-h-screen bg-[#090d16] items-center justify-center text-slate-400">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-[#090d16] text-slate-100">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Navbar />
        <main className="flex-1 p-6 md:p-8 max-w-7xl w-full mx-auto space-y-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
