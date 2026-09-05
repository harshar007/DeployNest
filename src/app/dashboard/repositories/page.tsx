"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  GitBranch,
  Search,
  RefreshCw,
  Sliders,
  Play,
  StopCircle,
  Rocket,
  Lock,
  Globe,
  ExternalLink,
  Code,
  CheckCircle2,
  AlertCircle,
  Plus,
} from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";

export default function RepositoriesPage() {
  const [repositories, setRepositories] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "configured" | "running">("all");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchRepos = async () => {
    try {
      const res = await fetch(`/api/repositories?filter=${filter}&search=${encodeURIComponent(search)}`);
      if (res.ok) {
        const data = await res.json();
        setRepositories(data.repositories);
      }
    } catch (err) {
      console.error("Failed to load repositories:", err);
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  };

  useEffect(() => {
    fetchRepos();
  }, [filter]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchRepos();
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      await fetch("/api/github/sync", { method: "POST" });
      await fetchRepos();
    } catch (err) {
      console.error("Failed to sync GitHub repositories:", err);
      setSyncing(false);
    }
  };

  const handleDeploy = async (repoId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setActionLoading(repoId);
    try {
      const res = await fetch(`/api/repositories/${repoId}/deploy`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        // Refresh status
        setTimeout(fetchRepos, 1000);
      }
    } catch (err) {
      console.error("Deploy trigger error:", err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleStartStop = async (repoId: string, isRunning: boolean, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setActionLoading(repoId);
    try {
      const endpoint = isRunning ? "stop" : "start";
      await fetch(`/api/repositories/${repoId}/${endpoint}`, { method: "POST" });
      setTimeout(fetchRepos, 800);
    } catch (err) {
      console.error("Process start/stop error:", err);
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2.5">
            Repositories
            <span className="text-xs uppercase font-mono px-2 py-0.5 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-md">
              {repositories.length} Total
            </span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Manage synchronized GitHub repositories, specify base paths, and execute builds.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-900 border border-slate-800 text-xs font-semibold text-slate-200 hover:text-white hover:bg-slate-800 transition shadow-sm"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? "animate-spin text-blue-400" : ""}`} />
            <span>{syncing ? "Syncing Repositories..." : "Sync from GitHub"}</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-[#0d1322] border border-slate-800/80 p-3 rounded-xl">
        <div className="flex items-center gap-1.5 w-full sm:w-auto">
          {(["all", "configured", "running"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition ${
                filter === tab
                  ? "bg-blue-600/20 text-blue-400 border border-blue-500/30"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        <form onSubmit={handleSearch} className="relative w-full sm:w-72">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search repositories..."
            className="w-full bg-slate-900/90 border border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 transition"
          />
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
        </form>
      </div>

      {/* Repositories Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-48 rounded-2xl bg-[#0d1322] border border-slate-800 animate-pulse"></div>
          ))}
        </div>
      ) : repositories.length === 0 ? (
        <div className="p-12 text-center rounded-2xl bg-[#0d1322] border border-slate-800/80 space-y-4">
          <GitBranch className="w-10 h-10 text-slate-600 mx-auto" />
          <div>
            <h3 className="text-base font-semibold text-slate-200">No repositories found</h3>
            <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
              Sync your repositories from GitHub or connect a new token in GitHub settings to get started.
            </p>
          </div>
          <button
            onClick={handleSync}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg transition shadow-lg shadow-blue-600/20"
          >
            Sync GitHub Repositories
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {repositories.map((repo) => {
            const isRunning = repo.status === "RUNNING";
            const isConfigured = repo.config !== null;

            return (
              <div
                key={repo.id}
                className="rounded-2xl bg-[#0d1322] border border-slate-800/90 p-5 hover:border-slate-700 transition flex flex-col justify-between space-y-4 group"
              >
                <div>
                  {/* Top Bar: Name + Visibility + Status */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <Link
                          href={`/dashboard/repositories/${repo.id}`}
                          className="font-bold text-slate-100 hover:text-blue-400 text-base truncate transition"
                        >
                          {repo.name}
                        </Link>
                        {repo.isPrivate ? (
                          <span title="Private"><Lock className="w-3 h-3 text-amber-400 shrink-0" /></span>
                        ) : (
                          <span title="Public"><Globe className="w-3 h-3 text-slate-500 shrink-0" /></span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400 font-mono truncate">{repo.fullName}</p>
                    </div>

                    <StatusBadge status={repo.status} size="sm" />
                  </div>

                  {/* Description */}
                  <p className="text-xs text-slate-400 mt-2.5 line-clamp-2 min-h-[32px]">
                    {repo.description || "No repository description provided."}
                  </p>

                  {/* Metadata tags */}
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] font-mono text-slate-400">
                    <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800">
                      branch: {repo.config?.branch || repo.defaultBranch}
                    </span>
                    {repo.language && (
                      <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-blue-400">
                        {repo.language}
                      </span>
                    )}
                    {repo.config?.port && (
                      <span className="px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                        port: {repo.config.port}
                      </span>
                    )}
                  </div>
                </div>

                {/* Bottom Actions */}
                <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2">
                  <Link
                    href={`/dashboard/repositories/${repo.id}`}
                    className="flex-1 py-1.5 px-3 rounded-lg bg-slate-800/80 hover:bg-slate-800 text-slate-300 text-xs font-semibold text-center transition flex items-center justify-center gap-1.5"
                  >
                    <Sliders className="w-3.5 h-3.5" />
                    <span>{isConfigured ? "Manage" : "Configure"}</span>
                  </Link>

                  {isConfigured && (
                    <button
                      onClick={(e) => handleDeploy(repo.id, e)}
                      disabled={actionLoading === repo.id}
                      className="py-1.5 px-3 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition flex items-center justify-center gap-1 shadow-md shadow-blue-600/20 disabled:opacity-50"
                      title="Trigger Deployment"
                    >
                      <Rocket className="w-3.5 h-3.5" />
                      <span>Deploy</span>
                    </button>
                  )}

                  {isConfigured && (
                    <button
                      onClick={(e) => handleStartStop(repo.id, isRunning, e)}
                      disabled={actionLoading === repo.id}
                      className={`p-1.5 rounded-lg border transition ${
                        isRunning
                          ? "border-rose-500/30 text-rose-400 hover:bg-rose-500/10"
                          : "border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
                      }`}
                      title={isRunning ? "Stop Application" : "Start Application"}
                    >
                      {isRunning ? <StopCircle className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
