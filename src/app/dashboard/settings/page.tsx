"use client";

import React, { useState, useEffect } from "react";
import {
  Settings as SettingsIcon,
  User,
  Shield,
  Key,
  Folder,
  Globe,
  Database,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
} from "lucide-react";

export default function SettingsPage() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [copiedKey, setCopiedKey] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((data) => {
        if (data.authenticated) {
          setUser(data.user);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6 animate-in fade-in duration-300 max-w-4xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2.5">
          <SettingsIcon className="w-6 h-6 text-slate-200" />
          System Settings & Control Plane Configuration
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          Review administrator account details, cryptographic security parameters, and runtime directories.
        </p>
      </div>

      {/* Admin Profile */}
      <div className="p-6 rounded-2xl bg-[#0d1322] border border-slate-800/90 space-y-4">
        <div className="flex items-center gap-2.5 border-b border-slate-800/80 pb-3">
          <User className="w-4 h-4 text-blue-400" />
          <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wider">
            Administrator Account
          </h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs font-mono">
          <div>
            <span className="text-slate-500 text-[11px] block uppercase">Name</span>
            <span className="text-slate-200 font-semibold">{user?.name || "Administrator"}</span>
          </div>
          <div>
            <span className="text-slate-500 text-[11px] block uppercase">Email</span>
            <span className="text-slate-200 font-semibold">{user?.email || "admin@example.com"}</span>
          </div>
          <div>
            <span className="text-slate-500 text-[11px] block uppercase">Role</span>
            <span className="px-2 py-0.5 rounded bg-blue-500/10 border border-blue-500/20 text-blue-400 font-semibold uppercase text-[10px]">
              {user?.role || "ADMIN"}
            </span>
          </div>
        </div>
      </div>

      {/* Security & Cryptography */}
      <div className="p-6 rounded-2xl bg-[#0d1322] border border-slate-800/90 space-y-4">
        <div className="flex items-center gap-2.5 border-b border-slate-800/80 pb-3">
          <Shield className="w-4 h-4 text-emerald-400" />
          <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wider">
            Security & Encryption
          </h3>
        </div>

        <div className="space-y-3 text-xs text-slate-300">
          <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 space-y-1">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Encryption Protocol
            </span>
            <p className="text-slate-200 font-mono">AES-256-GCM (Authenticated Galoise/Counter Mode)</p>
            <p className="text-slate-500 text-[11px]">
              All GitHub tokens and application environment secrets are encrypted at rest with hardware-accelerated AES-256-GCM.
            </p>
          </div>

          <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 space-y-1">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Session Management
            </span>
            <p className="text-slate-200 font-mono">JSON Web Tokens (JWT) with HTTP-only Cookies</p>
          </div>
        </div>
      </div>

      {/* Paths & Directories */}
      <div className="p-6 rounded-2xl bg-[#0d1322] border border-slate-800/90 space-y-4">
        <div className="flex items-center gap-2.5 border-b border-slate-800/80 pb-3">
          <Folder className="w-4 h-4 text-amber-400" />
          <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wider">
            Runtime Paths & Storage
          </h3>
        </div>

        <div className="space-y-3 text-xs font-mono">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3 bg-slate-900 rounded-xl border border-slate-800 gap-2">
            <div>
              <span className="text-slate-500 text-[10px] uppercase block">Deployments Root</span>
              <span className="text-slate-200">./data/deployments/</span>
            </div>
            <span className="text-[11px] text-slate-500 font-sans">Directory where managed apps are cloned & run</span>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3 bg-slate-900 rounded-xl border border-slate-800 gap-2">
            <div>
              <span className="text-slate-500 text-[10px] uppercase block">Database Engine</span>
              <span className="text-slate-200">SQLite (Zero-dependency local DB file: ./data/deploynest.db)</span>
            </div>
            <span className="text-[11px] text-emerald-400 font-sans">Self-Hosted Active</span>
          </div>
        </div>
      </div>
    </div>
  );
}
