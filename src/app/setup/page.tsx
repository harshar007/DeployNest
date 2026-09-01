"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Rocket, ShieldCheck, Github, ArrowRight, CheckCircle2, AlertCircle, RefreshCw, Key } from "lucide-react";

export default function SetupPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Admin credentials
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // GitHub token
  const [githubToken, setGithubToken] = useState("");
  const [connectedUser, setConnectedUser] = useState<any>(null);

  useEffect(() => {
    // Check if setup is already complete
    fetch("/api/auth/setup")
      .then((res) => res.json())
      .then((data) => {
        if (!data.setupNeeded) {
          router.push("/dashboard");
        }
      })
      .catch(() => {});
  }, [router]);

  const handleAdminSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Setup failed");

      setStep(2);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGitHubConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/github/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: githubToken }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "GitHub connection failed");

      setConnectedUser(data.profile);
      setStep(3);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#070b13] flex flex-col justify-center items-center p-6 selection:bg-blue-600 selection:text-white">
      {/* Brand Header */}
      <div className="flex items-center gap-3 mb-8">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-purple-600 flex items-center justify-center shadow-xl shadow-blue-500/25">
          <Rocket className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            DeployNest
            <span className="text-xs uppercase font-mono px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded-md border border-blue-500/30">
              Setup Wizard
            </span>
          </h1>
          <p className="text-xs text-slate-400">Self-Hosted Centralized CI/CD Hub</p>
        </div>
      </div>

      {/* Progress Indicators */}
      <div className="flex items-center gap-3 mb-8">
        <div className={`flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-lg border ${step >= 1 ? "bg-blue-600/20 text-blue-400 border-blue-500/30" : "bg-slate-900 text-slate-500 border-slate-800"}`}>
          <span>1. Create Admin</span>
        </div>
        <ArrowRight className="w-3 h-3 text-slate-600" />
        <div className={`flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-lg border ${step >= 2 ? "bg-blue-600/20 text-blue-400 border-blue-500/30" : "bg-slate-900 text-slate-500 border-slate-800"}`}>
          <span>2. Connect GitHub</span>
        </div>
        <ArrowRight className="w-3 h-3 text-slate-600" />
        <div className={`flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-lg border ${step >= 3 ? "bg-emerald-600/20 text-emerald-400 border-emerald-500/30" : "bg-slate-900 text-slate-500 border-slate-800"}`}>
          <span>3. Complete</span>
        </div>
      </div>

      {/* Main Container */}
      <div className="w-full max-w-lg bg-[#0d1322] border border-slate-800/90 rounded-2xl p-8 shadow-2xl relative overflow-hidden">
        {error && (
          <div className="mb-6 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {step === 1 && (
          <form onSubmit={handleAdminSetup} className="space-y-4">
            <div>
              <h2 className="text-lg font-bold text-slate-100">Create Administrator Account</h2>
              <p className="text-xs text-slate-400 mt-1">
                You will use this account to access the control plane dashboard.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
                Full Name
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Administrator"
                className="w-full bg-slate-900/90 border border-slate-800 rounded-lg px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 transition"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
                Email Address
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@example.com"
                className="w-full bg-slate-900/90 border border-slate-800 rounded-lg px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 transition"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
                Admin Password
              </label>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full bg-slate-900/90 border border-slate-800 rounded-lg px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 transition"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-3 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-sm font-semibold rounded-lg shadow-lg shadow-blue-600/30 flex items-center justify-center gap-2 transition disabled:opacity-50"
            >
              {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
              <span>Create Admin & Continue</span>
            </button>
          </form>
        )}

        {step === 2 && (
          <form onSubmit={handleGitHubConnect} className="space-y-4">
            <div>
              <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                <Github className="w-5 h-5 text-blue-400" />
                Connect GitHub Integration
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Enter a GitHub Personal Access Token (PAT) with <code className="text-blue-400 bg-blue-500/10 px-1 py-0.5 rounded">repo</code> and <code className="text-blue-400 bg-blue-500/10 px-1 py-0.5 rounded">admin:repo_hook</code> scopes.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
                GitHub Token
              </label>
              <div className="relative">
                <input
                  type="password"
                  required
                  value={githubToken}
                  onChange={(e) => setGithubToken(e.target.value)}
                  placeholder="ghp_************************************"
                  className="w-full bg-slate-900/90 border border-slate-800 rounded-lg px-3.5 py-2.5 text-sm text-slate-100 font-mono placeholder-slate-500 focus:outline-none focus:border-blue-500 transition"
                />
                <Key className="w-4 h-4 text-slate-500 absolute right-3.5 top-3" />
              </div>
              <p className="text-[11px] text-slate-500 mt-1.5">
                Tokens are stored with AES-256-GCM hardware encryption and never exposed in logs or plaintext.
              </p>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => router.push("/dashboard")}
                className="w-1/3 py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg transition"
              >
                Skip for now
              </button>
              <button
                type="submit"
                disabled={loading}
                className="w-2/3 py-2.5 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-sm font-semibold rounded-lg shadow-lg shadow-blue-600/30 flex items-center justify-center gap-2 transition disabled:opacity-50"
              >
                {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Github className="w-4 h-4" />}
                <span>Validate & Connect</span>
              </button>
            </div>
          </form>
        )}

        {step === 3 && (
          <div className="text-center space-y-5 py-4">
            <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mx-auto text-emerald-400">
              <CheckCircle2 className="w-8 h-8" />
            </div>

            <div>
              <h2 className="text-xl font-bold text-slate-100">Setup Complete!</h2>
              <p className="text-xs text-slate-400 mt-1">
                Connected as <strong className="text-slate-200">@{connectedUser?.username}</strong>. All authorized GitHub repositories have been synchronized.
              </p>
            </div>

            <button
              onClick={() => router.push("/dashboard")}
              className="w-full py-3 px-4 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-sm font-semibold rounded-lg shadow-lg shadow-emerald-600/30 flex items-center justify-center gap-2 transition"
            >
              <Rocket className="w-4 h-4" />
              <span>Launch Control Plane Dashboard</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
