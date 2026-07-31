"use client";

import { useEffect, useMemo, useState, FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAuthUser } from "@/lib/useAuthUser";
import {
  Plus,
  MoreVertical,
  ExternalLink,
  Trash2,
  Pencil,
  X,
  Search,
  Building2,
  MapPin,
  Inbox,
} from "lucide-react";

type ApplicationStatus = "saved" | "applied" | "interview" | "offer" | "rejected";

type Application = {
  id: string;
  company: string;
  title: string;
  location: string | null;
  apply_url: string | null;
  status: ApplicationStatus;
  notes: string | null;
  applied_at: string | null;
  updated_at: string;
};

const COLUMNS: ApplicationStatus[] = ["saved", "applied", "interview", "offer", "rejected"];

const COLUMN_ACCENT: Record<ApplicationStatus, string> = {
  saved: "border-s-sand-400",
  applied: "border-s-sky-400",
  interview: "border-s-gold-400",
  offer: "border-s-emerald-500",
  rejected: "border-s-red-300",
};

const DEMO_APPLICATIONS: Application[] = [
  { id: "demo-1", company: "Careem", title: "Growth Marketing Manager", location: "Dubai, UAE", apply_url: null, status: "interview", notes: null, applied_at: null, updated_at: "" },
  { id: "demo-2", company: "STC", title: "Product Analyst", location: "Riyadh, Saudi Arabia", apply_url: null, status: "applied", notes: null, applied_at: null, updated_at: "" },
  { id: "demo-3", company: "Emirates NBD", title: "Digital Product Manager", location: "Dubai, UAE", apply_url: null, status: "saved", notes: null, applied_at: null, updated_at: "" },
  { id: "demo-4", company: "noon", title: "Senior Frontend Engineer", location: "Dubai, UAE", apply_url: null, status: "offer", notes: null, applied_at: null, updated_at: "" },
  { id: "demo-5", company: "Aramco Digital", title: "Data Analyst", location: "Dhahran, Saudi Arabia", apply_url: null, status: "rejected", notes: null, applied_at: null, updated_at: "" },
  { id: "demo-6", company: "Bank Audi", title: "Relationship Manager", location: "Beirut, Lebanon", apply_url: null, status: "applied", notes: null, applied_at: null, updated_at: "" },
  { id: "demo-7", company: "Talabat", title: "Operations Lead", location: "Kuwait City, Kuwait", apply_url: null, status: "saved", notes: null, applied_at: null, updated_at: "" },
];

type FormState = {
  id: string | null;
  company: string;
  title: string;
  location: string;
  apply_url: string;
  status: ApplicationStatus;
  notes: string;
};

const EMPTY_FORM: FormState = {
  id: null,
  company: "",
  title: "",
  location: "",
  apply_url: "",
  status: "saved",
  notes: "",
};

export default function ApplicationsPage() {
  const t = useTranslations("dashboard.applications");
  const { user, loading: userLoading, configured } = useAuthUser();

  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<ApplicationStatus | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const isDemo = !userLoading && (!configured || !user);

  useEffect(() => {
    if (userLoading) return;
    if (!user) {
      setApplications(DEMO_APPLICATIONS);
      setLoading(false);
      return;
    }
    let cancelled = false;
    async function load() {
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from("applications")
          .select("id, company, title, location, apply_url, status, notes, applied_at, updated_at")
          .eq("user_id", user!.id)
          .order("updated_at", { ascending: false });
        if (error) throw error;
        if (!cancelled) setApplications((data ?? []) as Application[]);
      } catch {
        if (!cancelled) setApplications([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [user, userLoading]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return applications;
    return applications.filter(
      (a) => a.company.toLowerCase().includes(q) || a.title.toLowerCase().includes(q)
    );
  }, [applications, search]);

  const byColumn = useMemo(() => {
    const map: Record<ApplicationStatus, Application[]> = {
      saved: [],
      applied: [],
      interview: [],
      offer: [],
      rejected: [],
    };
    for (const app of filtered) map[app.status].push(app);
    return map;
  }, [filtered]);

  async function persistStatus(id: string, status: ApplicationStatus) {
    setApplications((prev) =>
      prev.map((a) => (a.id === id ? { ...a, status } : a))
    );
    if (isDemo) return;
    try {
      const supabase = createClient();
      const patch: Record<string, unknown> = { status };
      if (status === "applied") {
        const current = applications.find((a) => a.id === id);
        if (!current?.applied_at) patch.applied_at = new Date().toISOString();
      }
      await supabase.from("applications").update(patch).eq("id", id);
    } catch {
      // Best-effort — the optimistic UI update above already reflects it;
      // a page refresh will re-sync from the database either way.
    }
  }

  function handleDrop(status: ApplicationStatus) {
    setDragOverColumn(null);
    if (!draggingId) return;
    const app = applications.find((a) => a.id === draggingId);
    setDraggingId(null);
    if (!app || app.status === status) return;
    persistStatus(app.id, status);
  }

  function openNewForm() {
    setForm({ ...EMPTY_FORM });
    setFormError(null);
  }

  function openEditForm(app: Application) {
    setOpenMenuId(null);
    setForm({
      id: app.id,
      company: app.company,
      title: app.title,
      location: app.location ?? "",
      apply_url: app.apply_url ?? "",
      status: app.status,
      notes: app.notes ?? "",
    });
    setFormError(null);
  }

  async function handleDelete(id: string) {
    setOpenMenuId(null);
    if (!window.confirm(t("confirmDelete"))) return;
    setApplications((prev) => prev.filter((a) => a.id !== id));
    if (isDemo) return;
    try {
      const supabase = createClient();
      await supabase.from("applications").delete().eq("id", id);
    } catch {
      // Ignore — row is already removed from the UI; worst case a stale
      // row reappears on next reload, which is recoverable.
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    if (!form.company.trim() || !form.title.trim()) {
      setFormError(t("formRequired"));
      return;
    }
    setSaving(true);
    setFormError(null);

    const payload = {
      company: form.company.trim(),
      title: form.title.trim(),
      location: form.location.trim() || null,
      apply_url: form.apply_url.trim() || null,
      status: form.status,
      notes: form.notes.trim() || null,
    };

    try {
      if (isDemo) {
        if (form.id) {
          setApplications((prev) =>
            prev.map((a) => (a.id === form.id ? { ...a, ...payload } : a))
          );
        } else {
          setApplications((prev) => [
            { id: `local-${Date.now()}`, updated_at: new Date().toISOString(), applied_at: null, ...payload },
            ...prev,
          ]);
        }
        setForm(null);
        return;
      }

      const supabase = createClient();
      if (form.id) {
        const { error } = await supabase.from("applications").update(payload).eq("id", form.id);
        if (error) throw error;
        setApplications((prev) =>
          prev.map((a) => (a.id === form.id ? { ...a, ...payload } : a))
        );
      } else {
        const { data, error } = await supabase
          .from("applications")
          .insert({ ...payload, user_id: user!.id })
          .select("id, company, title, location, apply_url, status, notes, applied_at, updated_at")
          .single();
        if (error) throw error;
        if (data) setApplications((prev) => [data as Application, ...prev]);
      }
      setForm(null);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t("formError"));
    } finally {
      setSaving(false);
    }
  }

  const totalCount = applications.length;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t("title")}</h1>
          <p className="mt-1 text-sm text-foreground/60">{t("subtitle")}</p>
        </div>
        <button
          type="button"
          onClick={openNewForm}
          disabled={userLoading}
          className="flex items-center gap-1.5 rounded-full bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          <Plus size={16} />
          {t("addApplication")}
        </button>
      </div>

      {isDemo && (
        <p className="mt-3 rounded-lg bg-gold-50 px-3 py-2 text-xs text-gold-700">
          {t("demoNotice")}
        </p>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-4">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute start-3.5 top-1/2 -translate-y-1/2 text-foreground/40" size={16} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="w-full rounded-full border border-border bg-surface py-2 ps-10 pe-4 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          />
        </div>
        <p className="text-sm text-foreground/50">{t("totalCount", { count: totalCount })}</p>
      </div>

      {loading ? (
        <p className="mt-8 text-sm text-foreground/50">{t("loading")}</p>
      ) : totalCount === 0 ? (
        <div className="mt-10 flex flex-col items-center rounded-2xl border border-dashed border-border bg-surface px-6 py-14 text-center">
          <Inbox className="mb-3 text-foreground/30" size={32} />
          <p className="text-sm font-semibold text-foreground">{t("emptyTitle")}</p>
          <p className="mt-1 max-w-sm text-sm text-foreground/60">{t("emptySubtitle")}</p>
          <Link
            href="/dashboard/jobs"
            className="mt-4 rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            {t("emptyCta")}
          </Link>
        </div>
      ) : (
        <div className="mt-6 grid gap-4 overflow-x-auto pb-2 sm:grid-cols-3 lg:grid-cols-5">
          {COLUMNS.map((col) => (
            <div
              key={col}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverColumn(col);
              }}
              onDragLeave={() => setDragOverColumn((c) => (c === col ? null : c))}
              onDrop={(e) => {
                e.preventDefault();
                handleDrop(col);
              }}
              className={`min-w-[220px] rounded-2xl border bg-surface p-4 transition-colors ${
                dragOverColumn === col ? "border-emerald-400 bg-emerald-50/40" : "border-border"
              }`}
            >
              <h2 className="mb-3 flex items-center justify-between text-xs font-bold uppercase tracking-wide text-foreground/50">
                {t(col)}
                <span className="rounded-full bg-sand-100 px-2 py-0.5 text-[10px] font-bold text-foreground/50">
                  {byColumn[col].length}
                </span>
              </h2>
              <div className="space-y-3">
                {byColumn[col].map((app) => (
                  <div
                    key={app.id}
                    draggable={!isDemo}
                    onDragStart={() => setDraggingId(app.id)}
                    onDragEnd={() => setDraggingId(null)}
                    className={`relative rounded-xl border-s-4 border border-border bg-background p-3 ${
                      COLUMN_ACCENT[app.status]
                    } ${draggingId === app.id ? "opacity-40" : ""} ${!isDemo ? "cursor-grab active:cursor-grabbing" : ""}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-foreground">{app.title}</p>
                        <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-foreground/60">
                          <Building2 size={11} />
                          {app.company}
                        </p>
                        {app.location && (
                          <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-foreground/45">
                            <MapPin size={11} />
                            {app.location}
                          </p>
                        )}
                      </div>

                      <div className="relative flex-none">
                        <button
                          type="button"
                          onClick={() => setOpenMenuId((id) => (id === app.id ? null : app.id))}
                          className="rounded-md p-1 text-foreground/40 hover:bg-sand-100 hover:text-foreground/70"
                        >
                          <MoreVertical size={15} />
                        </button>
                        {openMenuId === app.id && (
                          <>
                            <div className="fixed inset-0 z-10" onClick={() => setOpenMenuId(null)} />
                            <div className="absolute end-0 z-20 mt-1 w-44 overflow-hidden rounded-lg border border-border bg-surface p-1 shadow-lg">
                              <button
                                type="button"
                                onClick={() => openEditForm(app)}
                                className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-start text-xs font-medium text-foreground/80 hover:bg-sand-100"
                              >
                                <Pencil size={12} />
                                {t("edit")}
                              </button>
                              {COLUMNS.filter((c) => c !== app.status).map((c) => (
                                <button
                                  key={c}
                                  type="button"
                                  onClick={() => {
                                    setOpenMenuId(null);
                                    persistStatus(app.id, c);
                                  }}
                                  className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-start text-xs font-medium text-foreground/70 hover:bg-sand-100"
                                >
                                  {t("moveTo", { status: t(c) })}
                                </button>
                              ))}
                              {app.apply_url && (
                                <a
                                  href={app.apply_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-start text-xs font-medium text-foreground/70 hover:bg-sand-100"
                                >
                                  <ExternalLink size={12} />
                                  {t("viewPosting")}
                                </a>
                              )}
                              <button
                                type="button"
                                onClick={() => handleDelete(app.id)}
                                className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-start text-xs font-medium text-red-600 hover:bg-red-50"
                              >
                                <Trash2 size={12} />
                                {t("delete")}
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                    {app.notes && (
                      <p className="mt-2 line-clamp-2 text-xs text-foreground/50">{app.notes}</p>
                    )}
                  </div>
                ))}
                {byColumn[col].length === 0 && (
                  <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-foreground/40">
                    {t("columnEmpty")}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {form && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          onClick={() => !saving && setForm(null)}
        >
          <div
            className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-surface p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-foreground">
                {form.id ? t("editApplication") : t("addApplication")}
              </h2>
              <button
                type="button"
                onClick={() => setForm(null)}
                className="rounded-full p-1 text-foreground/40 hover:bg-sand-100 hover:text-foreground"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="mt-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="app-company" className="mb-1 block text-xs font-medium text-foreground/70">
                    {t("fieldCompany")}
                  </label>
                  <input
                    id="app-company"
                    required
                    value={form.company}
                    onChange={(e) => setForm({ ...form, company: e.target.value })}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>
                <div>
                  <label htmlFor="app-title" className="mb-1 block text-xs font-medium text-foreground/70">
                    {t("fieldTitle")}
                  </label>
                  <input
                    id="app-title"
                    required
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="app-location" className="mb-1 block text-xs font-medium text-foreground/70">
                  {t("fieldLocation")}
                </label>
                <input
                  id="app-location"
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>

              <div>
                <label htmlFor="app-url" className="mb-1 block text-xs font-medium text-foreground/70">
                  {t("fieldUrl")}
                </label>
                <input
                  id="app-url"
                  type="url"
                  value={form.apply_url}
                  onChange={(e) => setForm({ ...form, apply_url: e.target.value })}
                  placeholder="https://"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>

              <div>
                <label htmlFor="app-status" className="mb-1 block text-xs font-medium text-foreground/70">
                  {t("fieldStatus")}
                </label>
                <select
                  id="app-status"
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value as ApplicationStatus })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                >
                  {COLUMNS.map((c) => (
                    <option key={c} value={c}>
                      {t(c)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="app-notes" className="mb-1 block text-xs font-medium text-foreground/70">
                  {t("fieldNotes")}
                </label>
                <textarea
                  id="app-notes"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={3}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>

              {formError && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{formError}</p>
              )}

              <div className="flex items-center justify-end gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setForm(null)}
                  className="rounded-full px-4 py-2 text-sm font-medium text-foreground/60 hover:text-foreground"
                >
                  {t("cancel")}
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-full bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                >
                  {saving ? t("saving") : t("save")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
