import type { ResumeFormat } from "@/lib/resume-types";

export type SectionKey =
  | "summary"
  | "skills"
  | "experience"
  | "education"
  | "certifications"
  | "languages"
  | "custom";

export type FormatConfig = {
  /** Render order for the built-in sections, plus where user-added custom
   * sections (tables/lists) slot in — "custom" can appear anywhere in the
   * order, not just at the end, since e.g. an Academic CV wants Publications
   * right after Education, not buried at the bottom. */
  order: SectionKey[];
  /** ATS-Friendly only: strips the colored header gradient and colorful
   * skill pills in favor of plain black-on-white text — some (older/basic)
   * ATS parsers handle plain text more reliably than styled HTML/PDF
   * elements, and it signals to the person that this version is the
   * "safe for automated screening" one. */
  plain: boolean;
};

// See the long comment in lib/resume-types.ts for why these 6 (out of a
// much longer requested list) were chosen as the meaningfully distinct set.
export const FORMAT_CONFIG: Record<ResumeFormat, FormatConfig> = {
  // Unchanged from this app's original single layout, kept as the default
  // so every resume saved before this feature existed still renders
  // identically.
  "reverse-chronological": {
    order: ["summary", "skills", "experience", "education", "certifications", "languages", "custom"],
    plain: false,
  },
  // Skills-first and prominent, with any custom sections (e.g. "Key
  // Projects") surfaced right after — the classic pick for a career change
  // or an employment gap, where leading with chronological job history
  // isn't the strongest opening.
  functional: {
    order: ["summary", "skills", "custom", "experience", "education", "certifications", "languages"],
    plain: false,
  },
  // Full chronological history, but with skills promoted ahead of it —
  // the modern "best of both" default most career coaches recommend.
  combination: {
    order: ["summary", "experience", "skills", "education", "certifications", "languages", "custom"],
    plain: false,
  },
  // Plain, linear, single-column order with no color/graphics — optimized
  // to parse cleanly through automated résumé screening.
  "ats-friendly": {
    order: ["summary", "experience", "education", "skills", "certifications", "languages", "custom"],
    plain: true,
  },
  // Academic convention: education leads, with custom sections (Publications,
  // Research, Teaching, Conferences, Grants) directly after it — well ahead
  // of a "Skills" section, which matters far less for academic/research roles.
  "academic-cv": {
    order: ["summary", "education", "custom", "experience", "skills", "certifications", "languages"],
    plain: false,
  },
  // Custom sections (typically "Key Achievements" / "Board Memberships")
  // get top billing right after the summary, ahead of a detailed job-by-job
  // history — the convention for senior/leadership candidates.
  executive: {
    order: ["summary", "custom", "experience", "education", "skills", "certifications", "languages"],
    plain: false,
  },
};

export function getFormatConfig(format: ResumeFormat | undefined): FormatConfig {
  return FORMAT_CONFIG[format ?? "reverse-chronological"];
}
