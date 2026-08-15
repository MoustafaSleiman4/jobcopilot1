-- People-search / connections subtitles ("job title @ company") were blank
-- for most existing accounts because profiles.job_title/current_company
-- are only ever set via the "About you" form, which most users haven't
-- filled in — even though many already uploaded a resume with real
-- experience data. Backfills both fields from each account's PRIMARY
-- resume's most recent role (experience[0] — resumes are entered/stored
-- most-recent-first, same convention ResumePreview/resume-pdf already
-- render in). Already applied live via Supabase MCP
-- (backfill_profile_job_title_company_from_resume migration) — checked in
-- here for the repo history, matching this project's convention. Safe to
-- re-run: only ever fills a currently-null field, never overwrites a job
-- title/company someone already typed into "About you" themselves.
update public.profiles p
set
  job_title = coalesce(p.job_title, nullif(trim(both from r.content #>> '{structured,experience,0,role}'), '')),
  current_company = coalesce(p.current_company, nullif(trim(both from r.content #>> '{structured,experience,0,company}'), ''))
from public.resumes r
where r.user_id = p.id
  and r.is_primary = true
  and (p.job_title is null or p.current_company is null)
  and jsonb_typeof(r.content #> '{structured,experience}') = 'array'
  and jsonb_array_length(r.content #> '{structured,experience}') > 0;
