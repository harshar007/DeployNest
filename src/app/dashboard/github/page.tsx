"use client";

import React, { useState, useEffect } from "react";
import {
  Github,
  Key,
  ShieldCheck,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Trash2,
  Radio,
  Copy,
  Check,
} from "lucide-react";

export default function GitHubIntegrationPage() {
  const [connection, setConnection] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tokenInput, setTokenInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [mounted, setMounted] = useState(false);

  const fetchStatus = async () => {
    try {
      const res = await fetch("/api/github/status");
      if (res.ok) {
        const data = await res.json();
        setConnection(data.connected ? data.connection : null);
      }
    } catch (err) {
      console.error("Failed to load GitHub status:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setMounted(true);
    fetchStatus();
  }, []);

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tokenInput.trim()) return;

    setIsSubmitting(true);
    setMessage(null);
    try {
      const res = await fetch("/api/github/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: tokenInput }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to connect GitHub token");

      setMessage({
        type: "success",
        text: `Connected to GitHub as @${data.profile.username}! ${data.syncedRepositories} repositories synced.`,
      });
      setTokenInput("");
      await fetchStatus();
    } catch (err: any) {
      setMessage({ type: "error", text: err.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    setMessage(null);
    try {
      const res = await fetch("/api/github/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to sync repositories");

      setMessage({ type: "success", text: `Successfully synced ${data.syncedRepositories} repositories!` });
      await fetchStatus();
    } catch (err: any) {
      setMessage({ type: "error", text: err.message });
    } finally {
      setSyncing(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm("Are you sure you want to disconnect your GitHub integration?")) return;

    try {
      await fetch("/api/github/disconnect", { method: "DELETE" });
      setConnection(null);
      setMessage({ type: "success", text: "GitHub disconnected." });
    } catch (err: any) {
      setMessage({ type: "error", text: err.message });
    }
  };

  const webhookEndpoint = mounted && typeof window !== "undefined"
    ? `${window.location.origin}/api/webhooks/github`
    : "http://<VPS_PUBLIC_IP>:29870/api/webhooks/github";

  const handleCopyWebhook = () => {
    navigator.clipboard.writeText(webhookEndpoint);
    setCopiedWebhook(true);
    setTimeout(() => setCopiedWebhook(false), 2000);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300 max-w-4xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2.5">
          <Github className="w-6 h-6 text-slate-200" />
          GitHub Integration
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          Connect your GitHub account to retrieve authorized repositories and enable automatic webhook push-to-deploy.
        </p>
      </div>

      {message && (
        <div
          className={`p-3 rounded-lg border text-xs flex items-center gap-2 ${
            message.type === "success"
              ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
              : "bg-rose-500/10 border-rose-500/20 text-rose-400"
          }`}
        >
          {message.type === "success" ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
          <span>{message.text}</span>
        </div>
      )}

      {/* Active Connection Card */}
      {connection ? (
        <div className="p-6 rounded-2xl bg-[#0d1322] border border-slate-800/90 space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {connection.avatarUrl ? (
                <img
                  src={connection.avatarUrl}
                  alt={connection.githubUsername}
                  className="w-12 h-12 rounded-xl border border-slate-700 object-cover"
                />
              ) : (
                <div className="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center font-bold text-white uppercase">
                  {connection.githubUsername?.charAt(0)}
                </div>
              )}
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-slate-100">@{connection.githubUsername}</h3>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-semibold">
                    CONNECTED
                  </span>
                </div>
                <p className="text-xs text-slate-400 font-mono">
                  Token: {connection.maskedToken || "ghp_••••••••••••"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleSync}
                disabled={syncing}
                className="px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-1.5 transition shadow-sm disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} />
                <span>{syncing ? "Syncing..." : "Sync Repositories"}</span>
              </button>

              <button
                onClick={handleDisconnect}
                className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-rose-400 hover:border-rose-500/30 transition"
                title="Disconnect GitHub"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 text-xs text-slate-300 space-y-2">
            <div className="flex items-center gap-2 text-slate-200 font-semibold">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>AES-256-GCM Credential Protection</span>
            </div>
            <p className="text-slate-400 text-[11px] leading-relaxed">
              Your Personal Access Token is encrypted with a unique derived key before storage in the database. Plaintext tokens are never transmitted to the frontend or exposed in server logs.
            </p>
          </div>
        </div>
      ) : (
        /* Connect Form */
        <div className="p-6 rounded-2xl bg-[#0d1322] border border-slate-800/90 space-y-4">
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wider">
              Connect GitHub Personal Access Token
            </h3>
            <p className="text-xs text-slate-400">
              Generate a classic or fine-grained token with <code className="text-blue-400 bg-blue-500/10 px-1 py-0.5 rounded">repo</code> and <code className="text-blue-400 bg-blue-500/10 px-1 py-0.5 rounded">admin:repo_hook</code> permissions.
            </p>
          </div>

          <form onSubmit={handleConnect} className="space-y-4 pt-2">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
                GitHub Token
              </label>
              <div className="relative">
                <input
                  type="password"
                  required
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  placeholder="ghp_************************************"
                  className="w-full bg-slate-900/90 border border-slate-800 rounded-lg px-3.5 py-2.5 text-xs font-mono text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 transition"
                />
                <Key className="w-4 h-4 text-slate-500 absolute right-3.5 top-3" />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="py-2.5 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-semibold rounded-lg shadow-lg shadow-blue-600/25 flex items-center justify-center gap-2 transition disabled:opacity-50"
            >
              {isSubmitting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Github className="w-3.5 h-3.5" />}
              <span>Validate & Connect Account</span>
            </button>
          </form>
        </div>
      )}

      {/* Webhook Configuration Guide */}
      <div className="p-6 rounded-2xl bg-[#0d1322] border border-slate-800/90 space-y-4">
        <div className="flex items-center gap-2">
          <Radio className="w-4 h-4 text-blue-400" />
          <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wider">
            GitHub Push Webhook Receiver
          </h3>
        </div>

        <p className="text-xs text-slate-400 leading-relaxed">
          DeployNest automatically provisions webhooks on your selected GitHub repositories when Auto-Deploy is enabled. You can also configure webhooks manually:
        </p>

        <div className="p-3 bg-slate-900 rounded-lg border border-slate-800 flex items-center justify-between gap-3">
          <span className="text-xs font-mono text-blue-400 break-all">{webhookEndpoint}</span>
          <button
            onClick={handleCopyWebhook}
            className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition shrink-0"
            title="Copy URL"
          >
            {copiedWebhook ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>
    </div>
  );
}
