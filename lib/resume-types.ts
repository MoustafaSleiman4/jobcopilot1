export type StructuredResume = {
  fullName: string;
  title: string;
  summary: string;
  skills: string[];
  experience: { role: string; company: string; location: string; period: string; bullets: string[] }[];
  education: { degree: string; school: string; period: string }[];
};
