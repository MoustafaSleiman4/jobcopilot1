import type { StructuredResume } from "@/lib/resume-types";

/**
 * Read-only, styled resume preview — replaces the old plain textarea. Users
 * can view (and, once on Pro, download) this, but cannot edit it inline;
 * changes only come from re-running the AI enhancement on a newly uploaded
 * file, by design (see the resume dashboard page).
 */
export default function ResumePreview({
  resume,
  labels,
}: {
  resume: StructuredResume;
  labels: { summary: string; skills: string; experience: string; education: string };
}) {
  const hasSkills = resume.skills.length > 0;
  const hasExperience = resume.experience.length > 0;
  const hasEducation = resume.education.length > 0;

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
      <div className="bg-gradient-to-r from-emerald-700 to-emerald-600 px-6 py-5 text-white">
        <h3 className="text-xl font-bold">{resume.fullName || "—"}</h3>
        {resume.title && <p className="mt-1 text-sm text-emerald-50/90">{resume.title}</p>}
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
      </div>
    </div>
  );
}
