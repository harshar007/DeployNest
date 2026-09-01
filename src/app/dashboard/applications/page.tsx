"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Layers,
  Play,
  StopCircle,
  RotateCcw,
  Rocket,
  Terminal as TerminalIcon,
  RefreshCw,
  Sliders,
  ExternalLink,
  Shield,
  Activity,
} from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";

export default function ApplicationsPage() {
  const [apps, setApps] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchApps = async () => {
    try {
      const res = await fetch("/api/repositories?filter=configured");
      if (res.ok) {
        const data = await res.json();
        setApps(data.repositories);
      }
    } catch (err) {
      console.error("Failed to load applications:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchApps();
    const interval = setInterval(fetchApps, 6000);
    return () => clearInterval(interval);
  }, []);

  const handleAction = async (repoId: string, action: "start" | "stop" | "restart" | "deploy") => {
    setActionLoading(repoId);
    try {
      await fetch(`/api/repositories/${repoId}/${action}`, { method: "POST" });
      setTimeout(fetchApps, 1000);
    } catch (err) {
      console.error(`Action ${action} failed:`, err);
    } finally {
      setActionLoading(null);
    }
  };

  const formatUptime = (seconds?: number) => {
    if (!seconds) return "--";
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hours > 0) return `${hours}h ${mins}m`;
    if (mins > 0) return `${mins}m ${secs}s`;
    return `${secs}s`;
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2.5">
            Managed Applications
            <span className="text-xs uppercase font-mono px-2 py-0.5 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-md">
              {apps.filter((a) => a.status === "RUNNING").length} Active
            </span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Real-time process status, ports, restart controls, and live output for VPS workloads.
          </p>
        </div>

        <button
          onClick={fetchApps}
          className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-slate-900 border border-slate-800 text-xs font-medium text-slate-300 hover:text-white transition"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Refresh Processes</span>
        </button>
      </div>

      {/* Applications Cards */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 rounded-2xl bg-[#0d1322] border border-slate-800 animate-pulse"></div>
          ))}
        </div>
      ) : apps.length === 0 ? (
        <div className="p-12 text-center rounded-2xl bg-[#0d1322] border border-slate-800/80 space-y-4">
          <Layers className="w-10 h-10 text-slate-600 mx-auto" />
          <div>
            <h3 className="text-base font-semibold text-slate-200">No applications configured yet</h3>
            <p className="text-xs text-slate-400 mt-1">
              Configure a repository in the Repositories tab to launch and manage applications.
            </p>
          </div>
          <Link
            href="/dashboard/repositories"
            className="inline-block px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg transition"
          >
            Configure Repositories
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {apps.map((app) => {
            const isRunning = app.status === "RUNNING";
            const runtime = app.runtime || {};

            return (
              <div
                key={app.id}
                className="p-6 rounded-2xl bg-[#0d1322] border border-slate-800/90 hover:border-slate-700 transition flex flex-col md:flex-row md:items-center justify-between gap-6"
              >
                {/* Left details */}
                <div className="space-y-2.5 min-w-0 flex-1">
                  <div className="flex items-center gap-3">
                    <Link
                      href={`/dashboard/repositories/${app.id}`}
                      className="text-lg font-bold text-slate-100 hover:text-blue-400 transition truncate"
                    >
                      {app.name}
                    </Link>
                    <StatusBadge status={app.status} size="sm" />
                  </div>

                  <div className="flex flex-wrap items-center gap-4 text-xs font-mono text-slate-400">
                    <div>
                      <span className="text-slate-500">Path: </span>
                      <span className="text-slate-300">{app.config?.basePath || `./data/deployments/${app.owner}/${app.name}`}</span>
                    </div>
                    {app.config?.port && (
                      <div>
                        <span className="text-slate-500">Port: </span>
                        <span className="text-emerald-400 font-semibold">{app.config.port}</span>
                      </div>
                    )}
                    {runtime.pid && (
                      <div>
                        <span className="text-slate-500">PID: </span>
                        <span className="text-blue-400 font-semibold">{runtime.pid}</span>
                      </div>
                    )}
                    {isRunning && (
                      <div>
                        <span className="text-slate-500">Uptime: </span>
                        <span className="text-slate-200">{formatUptime(runtime.uptime)}</span>
                      </div>
                    )}
                    <div>
                      <span className="text-slate-500">Command: </span>
                      <code className="text-slate-300 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">
                        {app.config?.startCommand || "npm start"}
                      </code>
                    </div>
                  </div>
                </div>

                {/* Right controls */}
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleAction(app.id, isRunning ? "stop" : "start")}
                    disabled={actionLoading === app.id}
                    className={`px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition border ${
                      isRunning
                        ? "border-rose-500/30 text-rose-400 hover:bg-rose-500/10"
                        : "border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
                    }`}
                  >
                    {isRunning ? <StopCircle className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                    <span>{isRunning ? "Stop" : "Start"}</span>
                  </button>

                  <button
                    onClick={() => handleAction(app.id, "restart")}
                    disabled={actionLoading === app.id}
                    className="px-3 py-2 rounded-lg text-xs font-semibold bg-slate-900 border border-slate-800 text-slate-300 hover:text-white transition flex items-center gap-1.5"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Restart</span>
                  </button>

                  <button
                    onClick={() => handleAction(app.id, "deploy")}
                    disabled={actionLoading === app.id}
                    className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white transition flex items-center gap-1.5 shadow-md shadow-blue-600/20"
                  >
                    <Rocket className="w-3.5 h-3.5" />
                    <span>Deploy</span>
                  </button>

                  <Link
                    href={`/dashboard/repositories/${app.id}`}
                    className="p-2 rounded-lg bg-slate-800 text-slate-400 hover:text-slate-200 transition"
                    title="Configure"
                  >
                    <Sliders className="w-4 h-4" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
