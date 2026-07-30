import { Mail, Phone, MapPin, Link as LinkIcon } from "lucide-react";
import type { StructuredResume } from "@/lib/resume-types";

/**
 * Read-only, styled resume preview. Used both as the AI-enhance result view
 * (app/[locale]/dashboard/resume/page.tsx) and as the live preview pane in
 * the manual CV builder (app/[locale]/dashboard/resume/builder/page.tsx) —
 * kept as a single component so both stay visually identical.
 */
export default function ResumePreview({
  resume,
  labels,
  accentColor = "emerald",
}: {
  resume: StructuredResume;
  labels: {
    summary: string;
    skills: string;
    experience: string;
    education: string;
    certifications?: string;
    languages?: string;
  };
  accentColor?: "emerald" | "gold" | "slate";
}) {
  const hasSkills = resume.skills.length > 0;
  const hasExperience = resume.experience.length > 0;
  const hasEducation = resume.education.length > 0;
  const hasCertifications = (resume.certifications ?? []).length > 0;
  const hasLanguages = (resume.languages ?? []).length > 0;
  const hasContact = Boolean(resume.email || resume.phone || resume.location || resume.links);

  const headerGradient =
    accentColor === "gold"
      ? "from-gold-600 to-gold-500"
      : accentColor === "slate"
        ? "from-slate-700 to-slate-600"
        : "from-emerald-700 to-emerald-600";

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
      <div className={`bg-gradient-to-r ${headerGradient} px-6 py-5 text-white`}>
        <h3 className="text-xl font-bold">{resume.fullName || "—"}</h3>
        {resume.title && <p className="mt-1 text-sm text-white/90">{resume.title}</p>}
        {hasContact && (
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-white/80">
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

      <div className="space-y-6 p-6">
        {resume.summary && (
          <section>
            <h4 className="text-xs font-bold uppercase tracking-wide text-gold-600">{labels.summary}</h4>
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-foreground/80">
              {resume.summary}
            </p>
          </section>
        )}

        {hasSkills && (
          <section>
            <h4 className="text-xs font-bold uppercase tracking-wide text-gold-600">{labels.skills}</h4>
            <div className="mt-2 flex flex-wrap gap-2">
              {resume.skills.map((skill, i) => (
                <span
                  key={i}
                  className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700"
                >
                  {skill}
                </span>
              ))}
            </div>
          </section>
        )}

        {hasExperience && (
          <section>
            <h4 className="text-xs font-bold uppercase tracking-wide text-gold-600">{labels.experience}</h4>
            <div className="mt-3 space-y-4">
              {resume.experience.map((job, i) => (
                <div key={i} className="border-s-2 border-emerald-200 ps-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <p className="text-sm font-semibold text-foreground">
                      {job.role}
                      {job.company ? ` · ${job.company}` : ""}
                    </p>
                    {job.period && <p className="text-xs text-foreground/50">{job.period}</p>}
                  </div>
                  {job.location && <p className="text-xs text-foreground/50">{job.location}</p>}
                  {job.bullets.length > 0 && (
                    <ul className="mt-1.5 list-disc space-y-0.5 ps-4 text-sm text-foreground/70">
                      {job.bullets.map((b, bi) => (
                        <li key={bi}>{b}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {hasEducation && (
          <section>
            <h4 className="text-xs font-bold uppercase tracking-wide text-gold-600">{labels.education}</h4>
            <table className="mt-2 w-full text-sm">
              <tbody>
                {resume.education.map((ed, i) => (
                  <tr key={i} className="border-b border-border last:border-0">
                    <td className="py-1.5 pe-3 font-medium text-foreground">{ed.degree}</td>
                    <td className="py-1.5 pe-3 text-foreground/70">{ed.school}</td>
                    <td className="py-1.5 text-end text-xs text-foreground/50">{ed.period}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {hasCertifications && (
          <section>
            <h4 className="text-xs font-bold uppercase tracking-wide text-gold-600">
              {labels.certifications ?? "Certifications"}
            </h4>
            <table className="mt-2 w-full text-sm">
              <tbody>
                {(resume.certifications ?? []).map((c, i) => (
                  <tr key={i} className="border-b border-border last:border-0">
                    <td className="py-1.5 pe-3 font-medium text-foreground">{c.name}</td>
                    <td className="py-1.5 pe-3 text-foreground/70">{c.issuer}</td>
                    <td className="py-1.5 text-end text-xs text-foreground/50">{c.year}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {hasLanguages && (
          <section>
            <h4 className="text-xs font-bold uppercase tracking-wide text-gold-600">
              {labels.languages ?? "Languages"}
            </h4>
            <div className="mt-2 flex flex-wrap gap-2">
              {(resume.languages ?? []).map((l, i) => (
                <span
                  key={i}
                  className="rounded-full bg-sand-100 px-3 py-1 text-xs font-medium text-foreground/70"
                >
                  {l.name}
                  {l.level ? ` · ${l.level}` : ""}
                </span>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
