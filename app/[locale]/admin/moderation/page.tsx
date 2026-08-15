"use client";

import { useState } from "react";
import { ShieldAlert, Loader2, CheckCircle2, XCircle, RefreshCcw } from "lucide-react";

type ReportRow = {
  id: string;
  reporterId?: string;
  targetType: "post" | "comment";
  targetId: string;
  reason: string | null;
  status: string;
  createdAt: string;
};

/**
 * Minimal admin tool to review reported posts/comments — Dismiss the report
 * or Remove the reported content. Exact pattern-copy of
 * app/[locale]/admin/whish/page.tsx: secret kept in component state only
 * (never persisted), re-entered every visit, no next-intl (internal tool,
 * not user-facing product surface), not linked from anywhere in the app's
 * nav, only reachable by URL.
 */
export default function AdminModerationPage() {
  const [secret, setSecret] = useState("");
  const [reports, setReports] = useState<ReportRow[] | null>(null);
  const [loadingReports, setLoadingReports] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);
  const [resultMsg, setResultMsg] = useState<{ ok: boolean; message: string } | null>(null);

  async function loadReports() {
    if (!secret) return;
    setLoadingReports(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/admin/moderation/reports?secret=${encodeURIComponent(secret)}`);
      const data = await res.json();
      if (!res.ok) {
        setLoadError(data.error || "Request failed");
        setReports(null);
        return;
      }
      setReports(Array.isArray(data) ? data : (data.items ?? []));
    } catch {
      setLoadError("Network error — request did not reach the server.");
      setReports(null);
    } finally {
      setLoadingReports(false);
    }
  }

  async function act(reportId: string, action: "dismiss" | "remove") {
    setActingId(reportId);
    setResultMsg(null);
    try {
      const res = await fetch("/api/admin/moderation/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret, reportId, action }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResultMsg({ ok: false, message: data.error || "Request failed" });
      } else {
        setResultMsg({
          ok: true,
          message: action === "remove" ? `Removed content for report ${reportId}.` : `Dismissed report ${reportId}.`,
        });
        setReports((prev) => (prev ? prev.filter((r) => r.id !== reportId) : prev));
      }
    } catch {
      setResultMsg({ ok: false, message: "Network error — request did not reach the server." });
    } finally {
      setActingId(null);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <div className="flex items-center gap-2.5">
        <ShieldAlert className="h-5 w-5 text-emerald-700" />
        <h1 className="text-lg font-bold text-foreground">Content moderation — open reports</h1>
      </div>
      <p className="mt-2 text-sm text-foreground/60">
        Review reported posts/comments. Dismiss clears the report with no action taken; Remove Content
        soft-deletes the reported post or comment and clears the report.
      </p>

      <div className="mt-8 space-y-4 rounded-2xl border border-border bg-surface p-6">
        <div>
          <label className="block text-sm font-medium text-foreground">Admin secret</label>
          <div className="mt-1.5 flex gap-2">
            <input
              type="password"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              placeholder="ADMIN_SECRET"
              className="flex-1 rounded-lg border border-border bg-background p-2.5 text-sm text-foreground focus:border-emerald-500 focus:outline-none"
            />
            <button
              type="button"
              onClick={loadReports}
              disabled={!secret || loadingReports}
              className="flex items-center gap-1.5 rounded-full bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-60"
            >
              {loadingReports ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
              Load reports
            </button>
          </div>
        </div>

        {loadError && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{loadError}</div>}

        {resultMsg && (
          <div
            className={`flex items-start gap-2 rounded-lg p-3 text-sm ${
              resultMsg.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"
            }`}
          >
            {resultMsg.ok ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 flex-none" />
            ) : (
              <XCircle className="mt-0.5 h-4 w-4 flex-none" />
            )}
            {resultMsg.message}
          </div>
        )}
      </div>

      <div className="mt-6">
        {reports === null ? (
          <p className="text-sm text-foreground/50">Enter the admin secret and load reports to review them.</p>
        ) : reports.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-4 text-sm text-foreground/50">
            No open reports.
          </p>
        ) : (
          <div className="space-y-3">
            {reports.map((report) => (
              <div key={report.id} className="rounded-xl border border-border bg-surface p-4">
                <div className="flex items-center justify-between">
                  <span className="rounded-full bg-sand-100 px-2.5 py-0.5 text-xs font-semibold text-foreground/60">
                    {report.targetType}
                  </span>
                  <span className="text-xs text-foreground/40">{new Date(report.createdAt).toLocaleString()}</span>
                </div>
                <p className="mt-2 text-sm text-foreground/80">
                  Target ID: <span className="font-mono text-xs">{report.targetId}</span>
                </p>
                {report.reason && <p className="mt-1 text-sm text-foreground/70">Reason: {report.reason}</p>}

                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => act(report.id, "remove")}
                    disabled={actingId !== null}
                    className="flex items-center gap-1.5 rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-60"
                  >
                    {actingId === report.id && <Loader2 className="h-4 w-4 animate-spin" />}
                    Remove content
                  </button>
                  <button
                    type="button"
                    onClick={() => act(report.id, "dismiss")}
                    disabled={actingId !== null}
                    className="flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-sand-100 disabled:opacity-60"
                  >
                    {actingId === report.id && <Loader2 className="h-4 w-4 animate-spin" />}
                    Dismiss
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
