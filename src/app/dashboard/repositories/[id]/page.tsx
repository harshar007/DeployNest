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
  Sparkles,
  Activity,
  Globe,
  Wrench,
  Cpu,
  FolderTree,
  Check,
} from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import { TerminalViewer } from "@/components/TerminalViewer";
import { FRAMEWORK_PRESETS, FrameworkPreset } from "@/lib/presets";

export default function RepositoryDetailPage() {
  const params = useParams();
  const router = useRouter();
  const repoId = params.id as string;

  const [repo, setRepo] = useState<any>(null);
  const [branches, setBranches] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<"config" | "env" | "diagnostics" | "logs" | "deployments">("config");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [detectedData, setDetectedData] = useState<any>(null);
  const [liveLogs, setLiveLogs] = useState<any[]>([]);

  // Configuration Form State
  const [branch, setBranch] = useState("main");
  const [basePath, setBasePath] = useState("");
  const [rootDirectory, setRootDirectory] = useState("");
  const [frameworkPreset, setFrameworkPreset] = useState("custom");
  const [installCommand, setInstallCommand] = useState("npm install");
  const [buildCommand, setBuildCommand] = useState("npm run build");
  const [startCommand, setStartCommand] = useState("npm start");
  const [processManager, setProcessManager] = useState("node");
  const [port, setPort] = useState<number | string>(3000);
  const [healthCheckUrl, setHealthCheckUrl] = useState("/health");
  const [autoDeploy, setAutoDeploy] = useState(true);

  // Diagnostics State
  const [diagnostics, setDiagnostics] = useState<any>(null);
  const [diagnosing, setDiagnosing] = useState(false);
  const [firewallLoading, setFirewallLoading] = useState(false);

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
          setRootDirectory(r.config.rootDirectory || "");
          setFrameworkPreset(r.config.frameworkPreset || "custom");
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

  const runDiagnostics = async () => {
    setDiagnosing(true);
    try {
      const res = await fetch(`/api/repositories/${repoId}/diagnose`);
      if (res.ok) {
        const data = await res.json();
        setDiagnostics(data.diagnosis);
      }
    } catch (err) {
      console.error("Diagnostics error:", err);
    } finally {
      setDiagnosing(false);
    }
  };

  const handleOpenFirewall = async () => {
    setFirewallLoading(true);
    try {
      const res = await fetch(`/api/repositories/${repoId}/firewall`, { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: "success", text: data.message || "Firewall updated!" });
        runDiagnostics();
      } else {
        setMessage({ type: "error", text: data.error || "Failed to open firewall" });
      }
    } catch (err: any) {
      setMessage({ type: "error", text: err.message });
    } finally {
      setFirewallLoading(false);
    }
  };

  const handleAutoDetect = async () => {
    setDetecting(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/repositories/${repoId}/detect`);
      if (!res.ok) throw new Error("Auto-detection failed");
      const data = await res.json();
      if (data.success && data.detection) {
        setDetectedData(data.detection);
        const p: FrameworkPreset = data.detection.preset;
        if (p) {
          applyPreset(p, data.detection.recommendedRootDir);
          setMessage({
            type: "success",
            text: `Detected: ${p.name} (${data.detection.detectionReason}). Settings updated!`,
          });
        }
      }
    } catch (err: any) {
      setMessage({ type: "error", text: err.message });
    } finally {
      setDetecting(false);
    }
  };

  const applyPreset = (p: FrameworkPreset, customRootDir?: string) => {
    setFrameworkPreset(p.id);
    if (customRootDir !== undefined) {
      setRootDirectory(customRootDir);
    } else {
      setRootDirectory(p.defaultRootDirectory);
    }
    setInstallCommand(p.installCommand);
    setBuildCommand(p.buildCommand);
    setStartCommand(p.startCommand);
    setPort(p.defaultPort);
    setHealthCheckUrl(p.healthCheckUrl);
    setProcessManager(p.processManager);
  };

  useEffect(() => {
    fetchRepoData();
  }, [repoId]);

  useEffect(() => {
    let interval: any;
    if (activeTab === "logs") {
      fetchLiveLogs();
      interval = setInterval(fetchLiveLogs, 3000);
    } else if (activeTab === "diagnostics") {
      runDiagnostics();
      interval = setInterval(runDiagnostics, 5000);
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
          rootDirectory,
          frameworkPreset,
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
    } finally {
      setActionLoading(false);
    }
  };

  const handleProcessAction = async (action: "start" | "stop" | "restart") => {
    setActionLoading(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/repositories/${repoId}/${action}`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Failed to ${action} application`);

      setMessage({ type: "success", text: `Application ${action}ed successfully!` });
      await fetchRepoData();
      if (activeTab === "diagnostics") runDiagnostics();
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

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to add environment variable");
      }

      setNewKey("");
      setNewValue("");
      setMessage({ type: "success", text: "Environment variable added successfully!" });
      fetchRepoData();
    } catch (err: any) {
      setMessage({ type: "error", text: err.message });
    }
  };

  const handleDeleteEnv = async (envId: string) => {
    try {
      const res = await fetch(`/api/repositories/${repoId}/env?envId=${envId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setMessage({ type: "success", text: "Environment variable deleted" });
        fetchRepoData();
      }
    } catch (err: any) {
      setMessage({ type: "error", text: err.message });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3 text-slate-400">
          <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
          <p className="text-sm font-mono">Loading repository configuration...</p>
        </div>
      </div>
    );
  }

  if (!repo) {
    return (
      <div className="p-8 text-center space-y-4">
        <h2 className="text-xl font-bold text-white">Repository Not Found</h2>
        <Link href="/dashboard/repositories" className="text-sm text-blue-400 hover:underline">
          Return to Repositories
        </Link>
      </div>
    );
  }

  const isRunning = repo.status === "RUNNING";
  const publicHost = typeof window !== "undefined" ? window.location.hostname : "localhost";

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-16">
      {/* Breadcrumb Header */}
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
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-bold text-white tracking-tight">{repo.name}</h1>
            <StatusBadge status={repo.status} size="md" />
            <span className="px-2.5 py-0.5 text-xs font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 rounded-md flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              Port :{port || 3000}
            </span>
            {rootDirectory && (
              <span className="px-2 py-0.5 text-[11px] font-mono bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded flex items-center gap-1">
                <FolderTree className="w-3 h-3" />
                {rootDirectory}/
              </span>
            )}
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
          <p className="text-xs text-slate-400 font-mono">
            {repo.fullName} • Serving on Port <span className="text-emerald-400 font-bold">:{port || 3000}</span>
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5">
          {isRunning && (
            <a
              href={`http://${publicHost}:${port || 3000}`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg shadow-lg shadow-emerald-600/20 flex items-center gap-1.5 transition"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Open Live App (:{port || 3000})</span>
            </a>
          )}
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
      <div className="flex items-center gap-1 border-b border-slate-800/80 pb-px overflow-x-auto">
        {[
          { id: "config", label: "Deployment Configuration", icon: GitBranch },
          { id: "diagnostics", label: "Network & Port Diagnostics", icon: Activity },
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
              className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-t-lg transition whitespace-nowrap border-b-2 ${
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
          {/* Framework Presets & Auto-Detect Banner */}
          <div className="p-5 rounded-2xl bg-[#0d1322] border border-slate-800/90 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wider flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  <span>Framework Presets & Auto-Detection</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Pick a pre-configured template or click Auto-Detect to scan this repository automatically.
                </p>
              </div>

              <button
                type="button"
                onClick={handleAutoDetect}
                disabled={detecting}
                className="px-3.5 py-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-bold text-xs rounded-lg shadow-md flex items-center gap-1.5 transition disabled:opacity-50 shrink-0"
              >
                {detecting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                <span>{detecting ? "Scanning Project..." : "⚡ Auto-Detect Project"}</span>
              </button>
            </div>

            {/* Detected Badges if available */}
            {detectedData?.subdirectories?.length > 0 && (
              <div className="p-3 bg-slate-900/80 rounded-xl border border-slate-800 flex flex-wrap items-center gap-2 text-xs">
                <span className="text-slate-400 font-medium">Detected subfolders:</span>
                {detectedData.subdirectories.map((sub: string) => (
                  <button
                    key={sub}
                    type="button"
                    onClick={() => setRootDirectory(sub)}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-mono transition flex items-center gap-1 border ${
                      rootDirectory === sub
                        ? "bg-blue-600 text-white border-blue-500 font-bold"
                        : "bg-slate-800 text-slate-300 border-slate-700 hover:border-slate-600"
                    }`}
                  >
                    <FolderTree className="w-3 h-3" />
                    <span>{sub}/</span>
                  </button>
                ))}
              </div>
            )}

            {/* Preset Selector Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5 pt-1">
              {FRAMEWORK_PRESETS.map((p) => {
                const isSelected = frameworkPreset === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => applyPreset(p)}
                    className={`p-3 rounded-xl border text-left transition flex flex-col justify-between gap-1.5 ${
                      isSelected
                        ? "bg-blue-600/15 border-blue-500 text-blue-400 ring-1 ring-blue-500/40"
                        : "bg-slate-900/60 border-slate-800/80 hover:bg-slate-900 hover:border-slate-700 text-slate-300"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-lg">{p.icon}</span>
                      {isSelected && <Check className="w-3.5 h-3.5 text-blue-400" />}
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-100">{p.name}</p>
                      <p className="text-[10px] text-slate-400 line-clamp-1">{p.description}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Main Pipeline Settings */}
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

              {/* Root Directory / Monorepo Subfolder */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider flex items-center justify-between">
                  <span>Root Directory (Subfolder)</span>
                  <span className="text-[10px] text-slate-500 lowercase">e.g. frontend or backend</span>
                </label>
                <input
                  type="text"
                  value={rootDirectory}
                  onChange={(e) => setRootDirectory(e.target.value)}
                  placeholder="Leave empty for root, or enter 'frontend' / 'backend'"
                  className="w-full bg-slate-900/90 border border-slate-800 rounded-lg px-3.5 py-2.5 text-xs font-mono text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 transition"
                />
              </div>

              {/* Base Runnable Path */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
                  Base VPS Clone Directory
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
                  placeholder="npm install (or pip install -r requirements.txt)"
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
                  placeholder="npm run build (leave empty if not needed)"
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
                  placeholder="npm start (or uvicorn app.main:app --host 0.0.0.0 --port 8000)"
                  className="w-full bg-slate-900/90 border border-slate-800 rounded-lg px-3.5 py-2.5 text-xs font-mono text-slate-100 focus:outline-none focus:border-blue-500 transition"
                />
              </div>

              {/* Port */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
                  Application Port
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
                  placeholder="/health (or /)"
                  className="w-full bg-slate-900/90 border border-slate-800 rounded-lg px-3.5 py-2.5 text-xs font-mono text-slate-100 focus:outline-none focus:border-blue-500 transition"
                />
              </div>

              {/* Process Manager */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
                  Process Manager Engine
                </label>
                <select
                  value={processManager}
                  onChange={(e) => setProcessManager(e.target.value)}
                  className="w-full bg-slate-900/90 border border-slate-800 rounded-lg px-3.5 py-2.5 text-xs font-mono text-slate-100 focus:outline-none focus:border-blue-500 transition"
                >
                  <option value="node">Node.js Background Process</option>
                  <option value="python">Python Background Process</option>
                  <option value="docker-compose">Docker Compose Engine</option>
                  <option value="docker">Docker Container Engine</option>
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

      {/* Tab 2: Network & Port Diagnostics */}
      {activeTab === "diagnostics" && (
        <div className="p-6 rounded-2xl bg-[#0d1322] border border-slate-800/90 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wider flex items-center gap-2">
                <Activity className="w-4 h-4 text-emerald-400" />
                <span>Network & Port Diagnostics</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Check socket binding, firewall rules, and live external port accessibility.
              </p>
            </div>

            <button
              type="button"
              onClick={runDiagnostics}
              disabled={diagnosing}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${diagnosing ? "animate-spin" : ""}`} />
              <span>Refresh Diagnostics</span>
            </button>
          </div>

          {diagnostics && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Process Status */}
              <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800 space-y-2">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Process State</span>
                <div className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${diagnostics.processStatus?.status === "RUNNING" ? "bg-emerald-400 animate-pulse" : "bg-rose-500"}`} />
                  <span className="text-sm font-bold text-white">{diagnostics.processStatus?.status || "STOPPED"}</span>
                </div>
                {diagnostics.processStatus?.pid && (
                  <p className="text-[11px] font-mono text-slate-400">PID: {diagnostics.processStatus.pid} (uptime: {diagnostics.processStatus.uptime || 0}s)</p>
                )}
              </div>

              {/* Local Port Listener */}
              <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800 space-y-2">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Socket Listener (Port {diagnostics.port})</span>
                <div className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${diagnostics.localProbe?.open ? "bg-emerald-400" : "bg-amber-400"}`} />
                  <span className="text-sm font-bold text-white">
                    {diagnostics.localProbe?.open ? "Listening (Active)" : "Not Responding"}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">
                  {diagnostics.localProbe?.open ? `Port ${diagnostics.port} accepts connections` : diagnostics.localProbe?.error || "Socket closed"}
                </p>
              </div>

              {/* Firewall / UFW */}
              <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800 space-y-2">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">VPS Firewall (UFW)</span>
                <div className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${diagnostics.ufwPortAllowed ? "bg-emerald-400" : "bg-amber-400"}`} />
                  <span className="text-sm font-bold text-white">
                    {diagnostics.ufwPortAllowed ? "Port Allowed" : "Rule Status"}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 font-mono line-clamp-1">{diagnostics.ufwStatus}</p>
              </div>
            </div>
          )}

          {/* Diagnostic Advice & 1-Click Fixes */}
          <div className="p-4 rounded-xl bg-blue-950/20 border border-blue-900/40 space-y-3">
            <h4 className="text-xs font-bold text-blue-400 uppercase tracking-wider flex items-center gap-1.5">
              <Wrench className="w-3.5 h-3.5" />
              <span>Troubleshooting & One-Click Fixes</span>
            </h4>

            {diagnostics?.suggestions?.length > 0 ? (
              <ul className="space-y-1.5 text-xs text-slate-300 list-disc list-inside">
                {diagnostics.suggestions.map((s: string, idx: number) => (
                  <li key={idx}>{s}</li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-slate-400">Run diagnostics to inspect port connectivity.</p>
            )}

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                type="button"
                onClick={handleOpenFirewall}
                disabled={firewallLoading}
                className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 transition disabled:opacity-50"
              >
                <Shield className="w-3.5 h-3.5" />
                <span>{firewallLoading ? "Opening..." : `Open Port ${port || 3000} in VPS Firewall (UFW)`}</span>
              </button>

              <a
                href={`http://${publicHost}:${port || 3000}`}
                target="_blank"
                rel="noreferrer"
                className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition"
              >
                <Globe className="w-3.5 h-3.5 text-emerald-400" />
                <span>Test Link: http://{publicHost}:{port || 3000}</span>
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Environment Variables & Secrets */}
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

      {/* Tab 4: Application Live Logs */}
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

      {/* Tab 5: Deployment History */}
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
