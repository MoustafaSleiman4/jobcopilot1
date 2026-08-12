"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { UserPlus, Loader2, CheckCircle2, AlertCircle, Send, Clock } from "lucide-react";

type ReferralRow = {
  invitee_email: string;
  status: "sent" | "joined";
  created_at: string;
};

type SendResult = {
  sent: string[];
  skipped: string[];
  failed: string[];
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAILS = 10;

export default function InviteFriendsPage() {
  const t = useTranslations("dashboard.invite");

  const [emailsInput, setEmailsInput] = useState("");
  const [showName, setShowName] = useState(true);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<SendResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [history, setHistory] = useState<ReferralRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  const parsedEmails = useMemo(() => {
    const seen = new Set<string>();
    const emails: string[] = [];
    for (const raw of emailsInput.split(/[\n,;]+/)) {
      const email = raw.trim().toLowerCase();
      if (!email || !EMAIL_RE.test(email) || seen.has(email)) continue;
      seen.add(email);
      emails.push(email);
    }
    return emails;
  }, [emailsInput]);

  async function loadHistory() {
    setHistoryLoading(true);
    try {
      const supabase = createClient();
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) return;
      const { data } = await supabase
        .from("referrals")
        .select("invitee_email, status, created_at")
        .eq("inviter_id", uid)
        .order("created_at", { ascending: false })
        .limit(50);
      setHistory((data ?? []) as ReferralRow[]);
    } catch {
      // Not logged in / Supabase not configured — history just stays empty.
    } finally {
      setHistoryLoading(false);
    }
  }

  useEffect(() => {
    loadHistory();
  }, []);

  async function handleSend() {
    setErrorMsg(null);
    setResult(null);

    if (parsedEmails.length === 0) {
      setErrorMsg(t("invalidEmail"));
      return;
    }
    if (parsedEmails.length > MAX_EMAILS) {
      setErrorMsg(t("tooMany"));
      return;
    }

    setSending(true);
    try {
      const res = await fetch("/api/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emails: parsedEmails, showName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? t("error"));
      setResult(data as SendResult);
      setEmailsInput("");
      loadHistory();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : t("error"));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
          <UserPlus size={20} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t("title")}</h1>
          <p className="mt-1 text-sm text-foreground/60">{t("subtitle")}</p>
        </div>
      </div>

      <div className="mt-8 rounded-2xl border border-border bg-surface p-6">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-foreground/80">{t("emailsLabel")}</span>
          <textarea
            value={emailsInput}
            onChange={(e) => setEmailsInput(e.target.value)}
            placeholder={t("emailsPlaceholder")}
            rows={4}
            className="resize-y rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          />
          <span className="text-xs text-foreground/50">{t("emailsHint")}</span>
        </label>

        {/* Show/hide inviter name — the whole point of this control is that
            it's the user's explicit, visible choice each time they send,
            not a buried account setting. */}
        <div className="mt-5 flex items-start justify-between gap-4 rounded-xl border border-border bg-background px-4 py-3.5">
          <div>
            <p className="text-sm font-medium text-foreground/80">{t("showNameLabel")}</p>
            <p className="mt-0.5 text-xs text-foreground/50">{t("showNameHint")}</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={showName}
            onClick={() => setShowName((v) => !v)}
            className={`relative inline-flex h-6 w-11 flex-none items-center rounded-full transition-colors ${
              showName ? "bg-emerald-600" : "bg-sand-300"
            }`}
          >
            <span
              className={`inline-block h-4.5 w-4.5 transform rounded-full bg-white shadow transition-transform ${
                showName ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>

        <button
          onClick={handleSend}
          disabled={sending || parsedEmails.length === 0}
          className="mt-6 flex items-center gap-1.5 rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          {sending ? <Loader2 className="animate-spin" size={16} /> : <Send size={16} />}
          {sending ? t("sending") : t("sendButton")}
        </button>

        {errorMsg && (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <AlertCircle className="mt-0.5 flex-none" size={16} />
            <span>{errorMsg}</span>
          </div>
        )}

        {result && (
          <div className="mt-4 space-y-2">
            {result.sent.length > 0 && (
              <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                <CheckCircle2 className="mt-0.5 flex-none" size={16} />
                <span>{t("successMessage", { count: result.sent.length })}</span>
              </div>
            )}
            {result.skipped.length > 0 && (
              <div className="flex items-start gap-2 rounded-xl border border-border bg-sand-100 px-4 py-3 text-sm text-foreground/70">
                <Clock className="mt-0.5 flex-none" size={16} />
                <span>{t("skippedMessage", { count: result.skipped.length })}</span>
              </div>
            )}
            {result.failed.length > 0 && (
              <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                <AlertCircle className="mt-0.5 flex-none" size={16} />
                <span>{t("failedMessage", { count: result.failed.length })}</span>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="mt-10">
        <h2 className="text-sm font-semibold text-foreground">{t("historyTitle")}</h2>
        {historyLoading ? (
          <p className="mt-3 text-sm text-foreground/50">{t("loading")}</p>
        ) : history.length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed border-border p-4 text-sm text-foreground/50">
            {t("historyEmpty")}
          </p>
        ) : (
          <div className="mt-3 overflow-hidden rounded-xl border border-border">
            <table className="w-full text-sm">
              <tbody>
                {history.map((row) => (
                  <tr key={row.invitee_email} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 text-foreground/80">{row.invitee_email}</td>
                    <td className="px-4 py-3 text-xs text-foreground/50">
                      {new Date(row.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-end">
                      <span
                        className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${
                          row.status === "joined"
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-sand-100 text-foreground/60"
                        }`}
                      >
                        {row.status === "joined" ? t("statusJoined") : t("statusSent")}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
