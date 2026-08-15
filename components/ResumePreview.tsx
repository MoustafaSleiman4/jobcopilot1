import { Mail, Phone, MapPin, Link as LinkIcon } from "lucide-react";
import type { StructuredResume } from "@/lib/resume-types";
import { getFormatConfig, type SectionKey } from "@/lib/resume-formats";

/**
 * Read-only, styled resume preview. Used both as the AI-enhance result view
 * (app/[locale]/dashboard/resume/page.tsx) and as the live preview pane in
 * the manual CV builder (app/[locale]/dashboard/resume/builder/page.tsx) —
 * kept as a single component so both stay visually identical.
 *
 * Section order and styling now depend on `resume.format` (defaults to
 * "reverse-chronological" — the original single fixed layout this component
 * used to always render) — see lib/resume-formats.ts for what each format
 * changes. Nothing is ever hidden or deleted based on format, only
 * reordered/restyled, so switching formats is always non-destructive.
 *
 * `photoUrl` is a separate prop, not part of `resume` — a personal photo is
 * account-level (public.profiles.avatar_url) and shared across every resume
 * version, not saved-per-resume content. Callers fetch the profile's photo
 * once and pass it through here (and to downloadResumePdf) so the same
 * photo shows up no matter which resume version is being viewed.
 */
// Base font-size (px) for each fontSize setting. Every text-size class in
// this component is expressed as an em value relative to this base (see the
// FS() helper below) rather than Tailwind's fixed text-sm/text-xs/etc,
// specifically so that changing the base here rescales the *entire* preview
// proportionally — headings, body text, table text, all of it — instead of
// only the elements someone remembered to update.
const FONT_SIZE_PX: Record<NonNullable<StructuredResume["style"]>["fontSize"], number> = {
  compact: 13,
  standard: 14,
  large: 16,
};

const FONT_FAMILY_CLASS: Record<NonNullable<StructuredResume["style"]>["fontFamily"], string> = {
  sans: "font-sans",
  serif: "font-serif",
  mono: "font-mono",
};

export default function ResumePreview({
  resume,
  photoUrl,
  labels,
}: {
  resume: StructuredResume;
  photoUrl?: string | null;
  labels: {
    summary: string;
    skills: string;
    experience: string;
    education: string;
    certifications?: string;
    languages?: string;
  };
}) {
  const hasSkills = resume.skills.length > 0;
  const hasExperience = resume.experience.length > 0;
  const hasEducation = resume.education.length > 0;
  const hasCertifications = (resume.certifications ?? []).length > 0;
  const hasLanguages = (resume.languages ?? []).length > 0;
  const hasContact = Boolean(resume.email || resume.phone || resume.location || resume.links);
  const customSections = resume.customSections ?? [];

  const config = getFormatConfig(resume.format);
  const plain = config.plain;

  // Single source of truth for style: resume.style, saved with the resume
  // itself. Falls back to each field's original hardcoded default (plain
  // formats -> serif, otherwise sans; emerald accent; standard size) so
  // resumes saved before this setting existed still render exactly as
  // before.
  const accentColor = resume.style?.accentColor ?? "emerald";
  const fontFamily = resume.style?.fontFamily ?? (plain ? "serif" : "sans");
  const fontSize = resume.style?.fontSize ?? "standard";
  const basePx = FONT_SIZE_PX[fontSize];

  const headerGradient = plain
    ? ""
    : accentColor === "gold"
      ? "from-gold-600 to-gold-500"
      : accentColor === "slate"
        ? "from-slate-700 to-slate-600"
        : "from-emerald-700 to-emerald-600";

  const sections: Partial<Record<SectionKey, React.ReactNode>> = {};

  if (resume.summary) {
    sections.summary = (
      <section key="summary">
        <h4 className="text-[0.86em] font-bold uppercase tracking-wide text-gold-600">{labels.summary}</h4>
        <p className="mt-2 whitespace-pre-line text-[1em] leading-relaxed text-foreground/80">{resume.summary}</p>
      </section>
    );
  }

  if (hasSkills) {
    sections.skills = (
      <section key="skills">
        <h4 className="text-[0.86em] font-bold uppercase tracking-wide text-gold-600">{labels.skills}</h4>
        {plain ? (
          <p className="mt-2 text-[1em] text-foreground/80">{resume.skills.join(" · ")}</p>
        ) : (
          <div className="mt-2 flex flex-wrap gap-2">
            {resume.skills.map((skill, i) => (
              <span key={i} className="rounded-full bg-emerald-50 px-3 py-1 text-[0.86em] font-medium text-emerald-700">
                {skill}
              </span>
            ))}
          </div>
        )}
      </section>
    );
  }

  if (hasExperience) {
    sections.experience = (
      <section key="experience">
        <h4 className="text-[0.86em] font-bold uppercase tracking-wide text-gold-600">{labels.experience}</h4>
        <div className="mt-3 space-y-4">
          {resume.experience.map((job, i) => (
            <div key={i} className={plain ? "" : "border-s-2 border-emerald-200 ps-4"}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <p className="text-[1em] font-semibold text-foreground">
                  {job.role}
                  {job.company ? ` · ${job.company}` : ""}
                </p>
                {job.period && <p className="text-[0.86em] text-foreground/50">{job.period}</p>}
              </div>
              {job.location && <p className="text-[0.86em] text-foreground/50">{job.location}</p>}
              {job.bullets.length > 0 && (
                <ul className="mt-1.5 list-disc space-y-0.5 ps-4 text-[1em] text-foreground/70">
                  {job.bullets.map((b, bi) => (
                    <li key={bi}>{b}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (hasEducation) {
    sections.education = (
      <section key="education">
        <h4 className="text-[0.86em] font-bold uppercase tracking-wide text-gold-600">{labels.education}</h4>
        <table className="mt-2 w-full text-[1em]">
          <tbody>
            {resume.education.map((ed, i) => (
              <tr key={i} className="border-b border-border last:border-0">
                <td className="py-1.5 pe-3 font-medium text-foreground">{ed.degree}</td>
                <td className="py-1.5 pe-3 text-foreground/70">{ed.school}</td>
                <td className="py-1.5 text-end text-[0.86em] text-foreground/50">{ed.period}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    );
  }

  if (hasCertifications) {
    sections.certifications = (
      <section key="certifications">
        <h4 className="text-[0.86em] font-bold uppercase tracking-wide text-gold-600">
          {labels.certifications ?? "Certifications"}
        </h4>
        <table className="mt-2 w-full text-[1em]">
          <tbody>
            {(resume.certifications ?? []).map((c, i) => (
              <tr key={i} className="border-b border-border last:border-0">
                <td className="py-1.5 pe-3 font-medium text-foreground">{c.name}</td>
                <td className="py-1.5 pe-3 text-foreground/70">{c.issuer}</td>
                <td className="py-1.5 text-end text-[0.86em] text-foreground/50">{c.year}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    );
  }

  if (hasLanguages) {
    sections.languages = (
      <section key="languages">
        <h4 className="text-[0.86em] font-bold uppercase tracking-wide text-gold-600">
          {labels.languages ?? "Languages"}
        </h4>
        {plain ? (
          <p className="mt-2 text-[1em] text-foreground/80">
            {(resume.languages ?? []).map((l) => (l.level ? `${l.name} (${l.level})` : l.name)).join(" · ")}
          </p>
        ) : (
          <div className="mt-2 flex flex-wrap gap-2">
            {(resume.languages ?? []).map((l, i) => (
              <span key={i} className="rounded-full bg-sand-100 px-3 py-1 text-[0.86em] font-medium text-foreground/70">
                {l.name}
                {l.level ? ` · ${l.level}` : ""}
              </span>
            ))}
          </div>
        )}
      </section>
    );
  }

  if (customSections.length > 0) {
    sections.custom = (
      <>
        {customSections.map((cs) => {
          const rows = cs.rows.filter((r) => r.some((cell) => cell.trim()));
          if (rows.length === 0 && !cs.title.trim()) return null;
          return (
            <section key={cs.id}>
              {cs.title && (
                <h4 className="text-[0.86em] font-bold uppercase tracking-wide text-gold-600">{cs.title}</h4>
              )}
              {cs.type === "table" ? (
                <table className="mt-2 w-full text-[1em]">
                  {cs.columns.some((c) => c.trim()) && (
                    <thead>
                      <tr className="border-b border-border">
                        {cs.columns.map((col, ci) => (
                          <th key={ci} className="py-1.5 pe-3 text-start text-[0.86em] font-bold text-foreground/60">
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                  )}
                  <tbody>
                    {rows.map((row, ri) => (
                      <tr key={ri} className="border-b border-border last:border-0">
                        {row.map((cell, ci) => (
                          <td key={ci} className="py-1.5 pe-3 text-foreground/80">
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <ul className="mt-2 list-disc space-y-0.5 ps-4 text-[1em] text-foreground/80">
                  {rows.map((row, ri) => (
                    <li key={ri}>{row[0]}</li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </>
    );
  }

  return (
    <div
      className={`overflow-hidden rounded-2xl border border-border bg-surface shadow-sm ${FONT_FAMILY_CLASS[fontFamily]}`}
      style={{ fontSize: `${basePx}px` }}
    >
      <div className={plain ? "border-b-2 border-foreground/80 px-6 py-5" : `bg-gradient-to-r ${headerGradient} px-6 py-5 text-white`}>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h3 className={`text-[1.43em] font-bold ${plain ? "text-foreground" : ""}`}>{resume.fullName || "—"}</h3>
            {(resume.title || resume.currentCompany) && (
              <p className={`mt-1 text-[1em] ${plain ? "text-foreground/70" : "text-white/90"}`}>
                {[resume.title, resume.currentCompany].filter(Boolean).join(" · ")}
              </p>
            )}
            {hasContact && (
              <div className={`mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.86em] ${plain ? "text-foreground/60" : "text-white/80"}`}>
                {resume.email && (
                  <span className="flex items-center gap-1.5">
                    <Mail size={12} /> {resume.email}
                  </span>
                )}
                {resume.phone && (
                  <span className="flex items-center gap-1.5">
                    <Phone size={12} /> {resume.phone}
                  </span>
                )}
                {resume.location && (
                  <span className="flex items-center gap-1.5">
                    <MapPin size={12} /> {resume.location}
                  </span>
                )}
                {resume.links && (
                  <span className="flex items-center gap-1.5">
                    <LinkIcon size={12} /> {resume.links}
                  </span>
                )}
              </div>
            )}
          </div>
          {photoUrl && (
            // Remote, user-uploaded photo — a fixed set of next/image domains isn't a good fit here.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photoUrl}
              alt=""
              className={`h-16 w-16 flex-none rounded-full object-cover ${
                plain ? "border border-foreground/20" : "border-2 border-white/50"
              }`}
            />
          )}
        </div>
      </div>

      <div className="space-y-6 p-6">
        {config.order.map((key) => sections[key] ?? null)}
      </div>
    </div>
  );
}
