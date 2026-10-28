import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Rocket } from "lucide-react";

export const HomeRedirect: React.FC = () => {
  const navigate = useNavigate();

  useEffect(() => {
    async function checkAuthAndSetup() {
      try {
        const setupRes = await fetch("/api/auth/setup");
        if (setupRes.ok) {
          const setupData = await setupRes.json();
          if (setupData.setupNeeded) {
            navigate("/setup", { replace: true });
            return;
          }
        }

        const authRes = await fetch("/api/auth/me");
        if (authRes.ok) {
          const authData = await authRes.json();
          if (authData.authenticated) {
            navigate("/dashboard", { replace: true });
            return;
          }
        }

        navigate("/login", { replace: true });
      } catch (err) {
        navigate("/login", { replace: true });
      }
    }

    checkAuthAndSetup();
  }, [navigate]);

  return (
    <div className="min-h-screen bg-[#070b13] flex flex-col items-center justify-center text-slate-400">
      <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center shadow-xl shadow-blue-500/25 mb-4 animate-bounce">
        <Rocket className="w-6 h-6 text-white" />
      </div>
      <p className="text-sm font-medium">Connecting to DeployNest...</p>
    </div>
  );
};
