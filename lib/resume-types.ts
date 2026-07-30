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
  };
}
