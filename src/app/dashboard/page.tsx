"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  GitBranch,
  Layers,
  Rocket,
  AlertOctagon,
  Server,
  RefreshCw,
  ArrowUpRight,
  ExternalLink,
  Plus,
  PlayCircle,
  Activity,
  CheckCircle2,
} from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import { HealthGauge } from "@/components/HealthGauge";

export default function DashboardOverviewPage() {
  const [stats, setStats] = useState<any>(null);
  const [health, setHealth] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchData = async () => {
    try {
      const [statsRes, healthRes] = await Promise.all([
        fetch("/api/system/stats"),
        fetch("/api/system/health"),
      ]);

      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData.stats);
      }

      if (healthRes.ok) {
        const healthData = await healthRes.json();
        setHealth(healthData.health);
      }
    } catch (err) {
      console.error("Failed to load dashboard overview data:", err);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 8000);
    return () => clearInterval(interval);
  }, []);

  const handleRefresh = () => {
    setIsRefreshing(true);
    fetchData();
  };

  const formatBytes = (bytes: number) => {
    if (!bytes) return "0 GB";
    const gb = bytes / (1024 * 1024 * 1024);
    return `${gb.toFixed(1)} GB`;
  };

  const formatUptime = (seconds: number) => {
    if (!seconds) return "0m";
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2.5">
            Centralized CI/CD Hub
            <span className="text-xs uppercase font-mono px-2 py-0.5 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-md">
              VPS Control Plane
            </span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Connect GitHub once, configure runnable paths, and automate push-to-deploy for all your applications.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-slate-900 border border-slate-800 text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800/80 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-blue-400" : ""}`} />
            <span>Refresh</span>
          </button>

          <Link
            href="/dashboard/repositories"
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-semibold shadow-lg shadow-blue-600/20 transition"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Configure Repository</span>
          </Link>
        </div>
      </div>

      {/* 4 KPI Counter Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Link
          href="/dashboard/repositories"
          className="p-5 rounded-2xl bg-[#0d1322] border border-slate-800/90 hover:border-blue-500/40 transition group relative overflow-hidden"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Repositories</span>
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
              <GitBranch className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-slate-100">
              {stats?.totalRepositories ?? "--"}
            </span>
            <span className="text-[11px] text-slate-500">synced</span>
          </div>
          <div className="mt-2 flex items-center gap-1 text-[11px] text-blue-400 font-medium group-hover:translate-x-0.5 transition-transform">
            <span>Manage repos</span>
            <ArrowUpRight className="w-3 h-3" />
          </div>
        </Link>

        <Link
          href="/dashboard/applications"
          className="p-5 rounded-2xl bg-[#0d1322] border border-slate-800/90 hover:border-emerald-500/40 transition group relative overflow-hidden"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Running Apps</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-emerald-400">
              {stats?.runningApps ?? "--"}
            </span>
            <span className="text-[11px] text-slate-500">live on VPS</span>
          </div>
          <div className="mt-2 flex items-center gap-1 text-[11px] text-emerald-400 font-medium group-hover:translate-x-0.5 transition-transform">
            <span>View runtime</span>
            <ArrowUpRight className="w-3 h-3" />
          </div>
        </Link>

        <Link
          href="/dashboard/deployments"
          className="p-5 rounded-2xl bg-[#0d1322] border border-slate-800/90 hover:border-indigo-500/40 transition group relative overflow-hidden"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Total Deployments</span>
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
              <Rocket className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-slate-100">
              {stats?.totalDeployments ?? "--"}
            </span>
            <span className="text-[11px] text-slate-500">triggers executed</span>
          </div>
          <div className="mt-2 flex items-center gap-1 text-[11px] text-indigo-400 font-medium group-hover:translate-x-0.5 transition-transform">
            <span>View history</span>
            <ArrowUpRight className="w-3 h-3" />
          </div>
        </Link>

        <div className="p-5 rounded-2xl bg-[#0d1322] border border-slate-800/90 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Failed Builds</span>
            <div className="w-8 h-8 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
              <AlertOctagon className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-rose-400">
              {stats?.failedDeployments ?? "0"}
            </span>
            <span className="text-[11px] text-slate-500">errors logged</span>
          </div>
          <div className="mt-2 text-[11px] text-slate-500">
            Self-contained logs available
          </div>
        </div>
      </div>

      {/* VPS Live Health Panel */}
      <div className="p-6 rounded-2xl bg-[#0d1322] border border-slate-800/90 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
              <Activity className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-100 uppercase tracking-wider">VPS Host Infrastructure Health</h2>
              <p className="text-[11px] text-slate-400 font-mono">
                {health?.os?.distro || "Linux VPS"} ({health?.os?.platform || "x64"}) • Uptime: {formatUptime(health?.os?.uptime)} • Host: {health?.os?.hostname || "localhost"}
              </p>
            </div>
          </div>
          <Link
            href="/dashboard/servers"
            className="text-xs text-blue-400 hover:text-blue-300 font-medium flex items-center gap-1"
          >
            <span>Detailed metrics</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
          <HealthGauge
            label="CPU Load"
            percent={health?.cpu?.usagePercent || 0}
            subtext={`${health?.cpu?.cores || 1} Cores • ${health?.cpu?.model?.substring(0, 24) || "CPU"}`}
            color="blue"
          />
          <HealthGauge
            label="Memory (RAM)"
            percent={health?.memory?.usagePercent || 0}
            subtext={`${formatBytes(health?.memory?.usedBytes)} / ${formatBytes(health?.memory?.totalBytes)} used`}
            color="purple"
          />
          <HealthGauge
            label="Disk Storage"
            percent={health?.disk?.usagePercent || 0}
            subtext={`${formatBytes(health?.disk?.usedBytes)} / ${formatBytes(health?.disk?.totalBytes)} used`}
            color="emerald"
          />
        </div>
      </div>

      {/* Recent Deployments Table */}
      <div className="p-6 rounded-2xl bg-[#0d1322] border border-slate-800/90 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-4">
          <div>
            <h2 className="text-sm font-bold text-slate-100 uppercase tracking-wider">Recent Deployments</h2>
            <p className="text-[11px] text-slate-400">Live deployment pipelines and webhook triggers</p>
          </div>
          <Link
            href="/dashboard/deployments"
            className="text-xs text-blue-400 hover:text-blue-300 font-medium flex items-center gap-1"
          >
            <span>View all deployments</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 font-mono uppercase text-[10px]">
                <th className="pb-3 font-semibold">Repository</th>
                <th className="pb-3 font-semibold">Branch</th>
                <th className="pb-3 font-semibold">Commit</th>
                <th className="pb-3 font-semibold">Trigger</th>
                <th className="pb-3 font-semibold">Status</th>
                <th className="pb-3 font-semibold">Duration</th>
                <th className="pb-3 font-semibold text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {!stats?.recentDeployments || stats.recentDeployments.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500 italic">
                    No deployments yet. Configure a repository and trigger your first build.
                  </td>
                </tr>
              ) : (
                stats.recentDeployments.map((d: any) => (
                  <tr key={d.id} className="hover:bg-slate-900/40 transition">
                    <td className="py-3.5">
                      <div className="font-semibold text-slate-200">
                        {d.repository?.name || "Repository"}
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono">
                        {d.repository?.fullName}
                      </div>
                    </td>
                    <td className="py-3.5 font-mono text-slate-300">
                      <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-[11px]">
                        {d.branch}
                      </span>
                    </td>
                    <td className="py-3.5">
                      {d.commitSha ? (
                        <span className="font-mono text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded border border-blue-500/20 text-[11px]">
                          {d.commitSha}
                        </span>
                      ) : (
                        <span className="text-slate-500 font-mono">--</span>
                      )}
                    </td>
                    <td className="py-3.5">
                      <span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider bg-slate-900 border border-slate-800 text-slate-400">
                        {d.triggerType}
                      </span>
                    </td>
                    <td className="py-3.5">
                      <StatusBadge status={d.status} size="sm" />
                    </td>
                    <td className="py-3.5 font-mono text-slate-400">
                      {d.duration ? `${d.duration}s` : "--"}
                    </td>
                    <td className="py-3.5 text-right">
                      <Link
                        href={`/dashboard/deployments/${d.id}`}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition"
                      >
                        <span>Logs</span>
                        <ArrowUpRight className="w-3 h-3" />
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
