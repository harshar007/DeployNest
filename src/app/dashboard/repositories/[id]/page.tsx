"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  GitBranch,
  Rocket,
  Play,
  StopCircle,
  RotateCcw,
  Trash2,
  ExternalLink,
  Shield,
  Save,
  Plus,
  RefreshCw,
  Clock,
  Terminal as TerminalIcon,
  Layers,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  Key,
} from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import { TerminalViewer } from "@/components/TerminalViewer";

export default function RepositoryDetailPage() {
  const params = useParams();
  const router = useRouter();
  const repoId = params.id as string;

  const [repo, setRepo] = useState<any>(null);
  const [branches, setBranches] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<"config" | "env" | "logs" | "deployments">("config");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [liveLogs, setLiveLogs] = useState<any[]>([]);

  // Configuration Form State
  const [branch, setBranch] = useState("main");
  const [basePath, setBasePath] = useState("");
  const [installCommand, setInstallCommand] = useState("npm install");
  const [buildCommand, setBuildCommand] = useState("npm run build");
  const [startCommand, setStartCommand] = useState("npm start");
  const [processManager, setProcessManager] = useState("node");
  const [port, setPort] = useState<number | string>(3000);
  const [healthCheckUrl, setHealthCheckUrl] = useState("/health");
  const [autoDeploy, setAutoDeploy] = useState(true);

  // Environment Variables State
  const [envVars, setEnvVars] = useState<any[]>([]);
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [newIsSecret, setNewIsSecret] = useState(true);

  // Notification message
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const fetchRepoData = async () => {
    try {
      const [repoRes, branchesRes, envRes] = await Promise.all([
        fetch(`/api/repositories/${repoId}`),
        fetch(`/api/repositories/${repoId}/branches`),
        fetch(`/api/repositories/${repoId}/env`),
      ]);

      if (repoRes.ok) {
        const repoData = await repoRes.json();
        const r = repoData.repository;
        setRepo(r);

        if (r.config) {
          setBranch(r.config.branch || r.defaultBranch || "main");
          setBasePath(r.config.basePath || "");
          setInstallCommand(r.config.installCommand || "npm install");
          setBuildCommand(r.config.buildCommand || "npm run build");
          setStartCommand(r.config.startCommand || "npm start");
          setProcessManager(r.config.processManager || "node");
          setPort(r.config.port ?? 3000);
          setHealthCheckUrl(r.config.healthCheckUrl || "/health");
          setAutoDeploy(r.config.autoDeploy ?? true);
        } else {
          setBranch(r.defaultBranch || "main");
        }
      }

      if (branchesRes.ok) {
        const branchData = await branchesRes.json();
        setBranches(branchData.branches || []);
      }

      if (envRes.ok) {
        const envData = await envRes.json();
        setEnvVars(envData.envVars || []);
      }
    } catch (err) {
      console.error("Failed to load repository detail:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchLiveLogs = async () => {
    try {
      const res = await fetch(`/api/repositories/${repoId}/logs`);
      if (res.ok) {
        const data = await res.json();
        setLiveLogs(data.logs || []);
      }
    } catch {}
  };

  useEffect(() => {
    fetchRepoData();
  }, [repoId]);

  useEffect(() => {
    let interval: any;
    if (activeTab === "logs") {
      fetchLiveLogs();
      interval = setInterval(fetchLiveLogs, 3000);
    }
    return () => clearInterval(interval);
  }, [activeTab, repoId]);

  const handleSaveConfig = async (e: React.FormEvent, deployAfter = false) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch(`/api/repositories/${repoId}/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branch,
          basePath,
          installCommand,
          buildCommand,
          startCommand,
          processManager,
          port: port ? parseInt(String(port), 10) : null,
          healthCheckUrl,
          autoDeploy,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save configuration");

      setMessage({ type: "success", text: "Configuration saved successfully!" });
      await fetchRepoData();

      if (deployAfter) {
        handleDeploy();
      }
    } catch (err: any) {
      setMessage({ type: "error", text: err.message });
    } finally {
      setSaving(false);
    }
  };

  const handleDeploy = async () => {
    setActionLoading(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/repositories/${repoId}/deploy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branch }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to trigger deployment");

      router.push(`/dashboard/deployments/${data.deploymentId}`);
    } catch (err: any) {
      setMessage({ type: "error", text: err.message });
      setActionLoading(false);
    }
  };

  const handleProcessAction = async (action: "start" | "stop" | "restart") => {
    setActionLoading(true);
    try {
      await fetch(`/api/repositories/${repoId}/${action}`, { method: "POST" });
      setTimeout(fetchRepoData, 800);
    } catch (err: any) {
      setMessage({ type: "error", text: err.message });
    } finally {
      setActionLoading(false);
    }
  };

  const handleAddEnv = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKey.trim()) return;

    try {
      const res = await fetch(`/api/repositories/${repoId}/env`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: newKey.trim(),
          value: newValue,
          isSecret: newIsSecret,
        }),
      });

      if (res.ok) {
        setNewKey("");
        setNewValue("");
        const envRes = await fetch(`/api/repositories/${repoId}/env`);
        const envData = await envRes.json();
        setEnvVars(envData.envVars || []);
      }
    } catch (err: any) {
      setMessage({ type: "error", text: err.message });
    }
  };

  const handleDeleteEnv = async (envId: string) => {
    try {
      const res = await fetch(`/api/repositories/${repoId}/env?envId=${envId}`, { method: "DELETE" });
      if (res.ok) {
        setEnvVars(envVars.filter((v) => v.id !== envId));
      }
    } catch (err: any) {
      setMessage({ type: "error", text: err.message });
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-slate-400">Loading repository details...</div>;
  }

  if (!repo) {
    return <div className="p-8 text-center text-slate-400">Repository not found.</div>;
  }

  const isRunning = repo.status === "RUNNING";

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Top Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-slate-400">
        <Link href="/dashboard/repositories" className="hover:text-slate-200 flex items-center gap-1">
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Repositories</span>
        </Link>
        <span>/</span>
        <span className="text-slate-200 font-mono">{repo.name}</span>
      </div>

      {/* Main Header Card */}
      <div className="p-6 rounded-2xl bg-[#0d1322] border border-slate-800/90 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold text-white tracking-tight">{repo.name}</h1>
            <StatusBadge status={repo.status} size="md" />
            {repo.htmlUrl && (
              <a
                href={repo.htmlUrl}
                target="_blank"
                rel="noreferrer"
                className="text-slate-400 hover:text-slate-200"
                title="Open GitHub"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            )}
          </div>
          <p className="text-xs text-slate-400 font-mono">{repo.fullName}</p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={handleDeploy}
            disabled={actionLoading}
            className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-semibold rounded-lg shadow-lg shadow-blue-600/25 flex items-center gap-1.5 transition disabled:opacity-50"
          >
            <Rocket className="w-3.5 h-3.5" />
            <span>Deploy Now</span>
          </button>

          <button
            onClick={() => handleProcessAction(isRunning ? "stop" : "start")}
            disabled={actionLoading}
            className={`px-3 py-2 border rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
              isRunning
                ? "border-rose-500/30 text-rose-400 hover:bg-rose-500/10"
                : "border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
            }`}
          >
            {isRunning ? <StopCircle className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 text-emerald-400" />}
            <span>{isRunning ? "Stop App" : "Start App"}</span>
          </button>

          {isRunning && (
            <button
              onClick={() => handleProcessAction("restart")}
              disabled={actionLoading}
              className="px-3 py-2 border border-slate-700 bg-slate-800/80 hover:bg-slate-800 text-slate-300 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Restart</span>
            </button>
          )}
        </div>
      </div>

      {/* Notifications */}
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

      {/* Navigation Tabs */}
      <div className="flex items-center gap-1 border-b border-slate-800/80 pb-px">
        {[
          { id: "config", label: "Deployment Configuration", icon: GitBranch },
          { id: "env", label: "Environment & Secrets", icon: Key },
          { id: "logs", label: "Application Logs", icon: TerminalIcon },
          { id: "deployments", label: "Deployment History", icon: Clock },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-t-lg transition border-b-2 ${
                isActive
                  ? "border-blue-500 text-blue-400 bg-blue-500/5"
                  : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab 1: Deployment Configuration */}
      {activeTab === "config" && (
        <form onSubmit={(e) => handleSaveConfig(e, false)} className="space-y-6">
          <div className="p-6 rounded-2xl bg-[#0d1322] border border-slate-800/90 space-y-5">
            <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wider">
              VPS Runnable Path & Build Settings
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Branch */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
                  Target Branch
                </label>
                <select
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  className="w-full bg-slate-900/90 border border-slate-800 rounded-lg px-3.5 py-2.5 text-xs font-mono text-slate-100 focus:outline-none focus:border-blue-500 transition"
                >
                  {branches.length > 0 ? (
                    branches.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))
                  ) : (
                    <option value="main">main</option>
                  )}
                </select>
              </div>

              {/* Base Runnable Path */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
                  Base Runnable Path (VPS Directory)
                </label>
                <input
                  type="text"
                  value={basePath}
                  onChange={(e) => setBasePath(e.target.value)}
                  placeholder={`/var/www/${repo.name} (Leave empty for default ./data/deployments)`}
                  className="w-full bg-slate-900/90 border border-slate-800 rounded-lg px-3.5 py-2.5 text-xs font-mono text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 transition"
                />
              </div>

              {/* Install Command */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
                  Install / Dependency Command
                </label>
                <input
                  type="text"
                  value={installCommand}
                  onChange={(e) => setInstallCommand(e.target.value)}
                  placeholder="npm install"
                  className="w-full bg-slate-900/90 border border-slate-800 rounded-lg px-3.5 py-2.5 text-xs font-mono text-slate-100 focus:outline-none focus:border-blue-500 transition"
                />
              </div>

              {/* Build Command */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
                  Build Command
                </label>
                <input
                  type="text"
                  value={buildCommand}
                  onChange={(e) => setBuildCommand(e.target.value)}
                  placeholder="npm run build"
                  className="w-full bg-slate-900/90 border border-slate-800 rounded-lg px-3.5 py-2.5 text-xs font-mono text-slate-100 focus:outline-none focus:border-blue-500 transition"
                />
              </div>

              {/* Execute / Start Command */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
                  Execute / Start Command
                </label>
                <input
                  type="text"
                  value={startCommand}
                  onChange={(e) => setStartCommand(e.target.value)}
                  placeholder="npm start"
                  className="w-full bg-slate-900/90 border border-slate-800 rounded-lg px-3.5 py-2.5 text-xs font-mono text-slate-100 focus:outline-none focus:border-blue-500 transition"
                />
              </div>

              {/* Port */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
                  Port
                </label>
                <input
                  type="number"
                  value={port}
                  onChange={(e) => setPort(e.target.value)}
                  placeholder="3000"
                  className="w-full bg-slate-900/90 border border-slate-800 rounded-lg px-3.5 py-2.5 text-xs font-mono text-slate-100 focus:outline-none focus:border-blue-500 transition"
                />
              </div>

              {/* Health Check Path */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
                  Health Check URL Path
                </label>
                <input
                  type="text"
                  value={healthCheckUrl}
                  onChange={(e) => setHealthCheckUrl(e.target.value)}
                  placeholder="/health"
                  className="w-full bg-slate-900/90 border border-slate-800 rounded-lg px-3.5 py-2.5 text-xs font-mono text-slate-100 focus:outline-none focus:border-blue-500 transition"
                />
              </div>

              {/* Process Manager */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
                  Process Manager
                </label>
                <select
                  value={processManager}
                  onChange={(e) => setProcessManager(e.target.value)}
                  className="w-full bg-slate-900/90 border border-slate-800 rounded-lg px-3.5 py-2.5 text-xs font-mono text-slate-100 focus:outline-none focus:border-blue-500 transition"
                >
                  <option value="node">Node.js Background Process</option>
                  <option value="pm2">PM2 Process Manager</option>
                  <option value="custom">Direct Executable / Custom</option>
                </select>
              </div>
            </div>

            {/* Auto Deploy Toggle */}
            <div className="pt-4 border-t border-slate-800/80 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-200">Automatic Push-To-Deploy (Webhook)</p>
                <p className="text-[11px] text-slate-400">
                  Automatically configure GitHub repository webhooks and trigger redeployment when code is pushed to <code className="text-blue-400">{branch}</code>.
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoDeploy}
                  onChange={(e) => setAutoDeploy(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>
          </div>

          {/* Save Bar */}
          <div className="flex items-center justify-end gap-3">
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition disabled:opacity-50"
            >
              {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              <span>Save Configuration</span>
            </button>

            <button
              type="button"
              onClick={(e) => handleSaveConfig(e, true)}
              disabled={saving}
              className="px-5 py-2.5 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-semibold shadow-lg shadow-blue-600/30 flex items-center gap-1.5 transition disabled:opacity-50"
            >
              <Rocket className="w-3.5 h-3.5" />
              <span>Save & Deploy</span>
            </button>
          </div>
        </form>
      )}

      {/* Tab 2: Environment Variables & Secrets */}
      {activeTab === "env" && (
        <div className="p-6 rounded-2xl bg-[#0d1322] border border-slate-800/90 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wider">
                Environment Variables & Encrypted Secrets
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Variables are encrypted with AES-256-GCM and written to the project's <code className="text-blue-400">.env</code> file before deployment.
              </p>
            </div>
          </div>

          {/* Add New Var Form */}
          <form onSubmit={handleAddEnv} className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1 uppercase tracking-wider">
                Key
              </label>
              <input
                type="text"
                required
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                placeholder="e.g. DATABASE_URL"
                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 transition"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-[11px] font-semibold text-slate-400 mb-1 uppercase tracking-wider">
                Value
              </label>
              <input
                type="text"
                required
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                placeholder="Secret value / string"
                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 transition"
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                type="submit"
                className="w-full py-2 px-3 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 shadow-md shadow-blue-600/20 transition"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Variable</span>
              </button>
            </div>
          </form>

          {/* Env Vars Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-mono uppercase text-[10px]">
                  <th className="pb-3 font-semibold">Key</th>
                  <th className="pb-3 font-semibold">Encrypted Value</th>
                  <th className="pb-3 font-semibold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {envVars.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="py-6 text-center text-slate-500 italic font-sans">
                      No environment variables configured.
                    </td>
                  </tr>
                ) : (
                  envVars.map((v) => (
                    <tr key={v.id} className="hover:bg-slate-900/40 transition">
                      <td className="py-3 font-semibold text-slate-200">{v.key}</td>
                      <td className="py-3 text-slate-400">{v.value}</td>
                      <td className="py-3 text-right">
                        <button
                          onClick={() => handleDeleteEnv(v.id)}
                          className="p-1 text-slate-500 hover:text-rose-400 transition"
                          title="Delete Variable"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: Application Live Logs */}
      {activeTab === "logs" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Live Application Console Stream (stdout/stderr)
            </span>
            <button
              onClick={fetchLiveLogs}
              className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Refresh Output</span>
            </button>
          </div>
          <TerminalViewer logs={liveLogs} title={`${repo.name} Runtime Logs`} maxHeight="500px" />
        </div>
      )}

      {/* Tab 4: Deployment History */}
      {activeTab === "deployments" && (
        <div className="p-6 rounded-2xl bg-[#0d1322] border border-slate-800/90 space-y-4">
          <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wider">
            Repository Deployment History
          </h3>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-mono uppercase text-[10px]">
                  <th className="pb-3 font-semibold">Commit</th>
                  <th className="pb-3 font-semibold">Branch</th>
                  <th className="pb-3 font-semibold">Trigger</th>
                  <th className="pb-3 font-semibold">Status</th>
                  <th className="pb-3 font-semibold">Duration</th>
                  <th className="pb-3 font-semibold">Date</th>
                  <th className="pb-3 font-semibold text-right">Logs</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-sans">
                {!repo.deployments || repo.deployments.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-6 text-center text-slate-500 italic">
                      No deployments recorded for this repository.
                    </td>
                  </tr>
                ) : (
                  repo.deployments.map((d: any) => (
                    <tr key={d.id} className="hover:bg-slate-900/40 transition">
                      <td className="py-3">
                        <span className="font-mono text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded border border-blue-500/20 text-[11px]">
                          {d.commitSha || "--"}
                        </span>
                      </td>
                      <td className="py-3 font-mono text-slate-300">{d.branch}</td>
                      <td className="py-3 uppercase text-[10px] font-bold text-slate-400">{d.triggerType}</td>
                      <td className="py-3">
                        <StatusBadge status={d.status} size="sm" />
                      </td>
                      <td className="py-3 font-mono text-slate-400">{d.duration ? `${d.duration}s` : "--"}</td>
                      <td className="py-3 text-slate-500 font-mono text-[11px]">
                        {new Date(d.createdAt).toLocaleString()}
                      </td>
                      <td className="py-3 text-right">
                        <Link
                          href={`/dashboard/deployments/${d.id}`}
                          className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition"
                        >
                          View Logs
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
