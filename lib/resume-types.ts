// The 6 formats below were chosen as the meaningfully distinct subset of a
// much longer list a user asked for (30+ named "resume types" — Chronological,
// Reverse-Chronological, Functional, Skills-Based, Combination, Hybrid,
// Targeted, Mini, Infographic, Profile, Achievement-Based, ATS-Friendly,
// One-Page, Two-Page, Academic CV, CV, Federal, Executive, Technical,
// Creative, Portfolio, Video, Online, Web, Europass, Canadian, US, UK,
// Australian, Graduate/Entry-Level, Career Change, Military-to-Civilian,
// Project-Based, Freelance/Consultant, Executive Bio). Most of those are
// either near-duplicates of each other (Chronological ≈ Reverse-Chronological;
// Functional ≈ Skills-Based; CV ≈ Academic CV; regional variants like
// US/UK/Canadian/Australian are formatting conventions, not structural
// differences), length constraints rather than formats (One-Page/Two-Page),
// or not a document format at all (Video/Online/Web resume, Executive Bio).
// These 6 are the ones that genuinely reorder/re-emphasize sections and
// cover the real range of what Gulf/MEA job seekers using this tool need.
export type ResumeFormat =
  | "reverse-chronological"
  | "functional"
  | "combination"
  | "ats-friendly"
  | "academic-cv"
  | "executive";

export const RESUME_FORMATS: ResumeFormat[] = [
  "reverse-chronological",
  "functional",
  "combination",
  "ats-friendly",
  "academic-cv",
  "executive",
];

/**
 * A user-added section beyond the fixed built-in ones (Summary, Skills,
 * Experience, Education, Certifications, Languages) — the general mechanism
 * for "let me add a table" as well as format-specific content the fixed
 * schema doesn't have a dedicated field for (Publications, Key Achievements,
 * Board Memberships, Research, Awards, etc.), without needing a bespoke
 * field per resume type.
 *
 * `type: "table"` renders `columns` as a header row and `rows` as the body.
 * `type: "list"` ignores `columns` and renders each row's first cell as a
 * bullet — the two share the same `rows` shape so the builder UI and
 * renderers don't need two parallel data structures.
 */
export type CustomSection = {
  id: string;
  title: string;
  type: "table" | "list";
  columns: string[];
  rows: string[][];
};

// A single, saved-with-the-resume style setting applied consistently across
// every section — both on screen (ResumePreview.tsx) and in the downloaded
// PDF (lib/resume-pdf.ts) read the exact same `resume.style` object, so
// switching font/size/color once always changes the whole document
// everywhere it's rendered, rather than each surface (or each section)
// drifting out of sync with its own separate setting.
export type ResumeFontFamily = "sans" | "serif" | "mono";
export type ResumeFontSize = "compact" | "standard" | "large";
export type ResumeAccentColor = "emerald" | "gold" | "slate";

export type ResumeStyle = {
  fontFamily: ResumeFontFamily;
  fontSize: ResumeFontSize;
  accentColor: ResumeAccentColor;
};

export const DEFAULT_RESUME_STYLE: ResumeStyle = {
  fontFamily: "sans",
  fontSize: "standard",
  accentColor: "emerald",
};

export type StructuredResume = {
  fullName: string;
  title: string;
  summary: string;
  skills: string[];
  experience: { role: string; company: string; location: string; period: string; bullets: string[] }[];
  education: { degree: string; school: string; period: string }[];
  // All added later, for the manual CV builder — optional so existing saved
  // resumes (and the AI-enhance pipeline, which doesn't populate these yet)
  // keep working without a migration. Always default to "" / [] when read,
  // never undefined, so the builder form and preview don't need null-checks
  // scattered everywhere.
  email?: string;
  phone?: string;
  location?: string;
  links?: string; // free text — LinkedIn/portfolio/GitHub, comma or newline separated
  certifications?: { name: string; issuer: string; year: string }[];
  languages?: { name: string; level: string }[];
  // Format + custom sections — optional/defaulted the same way, so resumes
  // saved before this feature existed still load fine as
  // "reverse-chronological" with no custom sections.
  format?: ResumeFormat;
  customSections?: CustomSection[];
  style?: ResumeStyle;
  // Note: there is deliberately NO photo field here. A personal photo is an
  // account-level thing (public.profiles.avatar_url), shared across every
  // resume version, not something that changes per resume — see
  // ResumePreview.tsx's separate `photoUrl` prop and
  // downloadResumePdf()'s separate `photoUrl` argument, both sourced from
  // the profile rather than from resume.content.
};

/** A fully-populated empty resume — the one place every optional field gets
 * its default, so callers never have to repeat `?? ""` / `?? []`. */
export function emptyStructuredResume(): StructuredResume {
  return {
    fullName: "",
    title: "",
    summary: "",
    skills: [],
    experience: [],
    education: [],
    email: "",
    phone: "",
    location: "",
    links: "",
    certifications: [],
    languages: [],
    format: "reverse-chronological",
    customSections: [],
    style: { ...DEFAULT_RESUME_STYLE },
  };
}
