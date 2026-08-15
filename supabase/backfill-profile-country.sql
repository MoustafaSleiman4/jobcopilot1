-- Same reasoning/pattern as backfill-profile-job-title-company.sql: most
-- accounts never filled in "country" (profiles.country already existed as
-- a column, used by people/suggestions' matching heuristic, but had no UI
-- to set it until now) even though many already have a resume with a
-- location line. Backfills from each account's PRIMARY resume's top-level
-- location field (e.g. "Beirut, Lebanon" — free text, not structured, so
-- this takes the segment after the last comma as the country when there is
-- one, else the whole string — imperfect for resumes that only wrote a
-- city with no comma, but still strictly better than leaving it blank).
-- Already applied live via Supabase MCP
-- (backfill_profile_country_from_resume migration) — checked in for repo
-- history. Safe to re-run: only ever fills a currently-null field.
update public.profiles p
set country = nullif(
  trim(both from
    case
      when position(',' in coalesce(r.content #>> '{structured,location}', '')) > 0
        then split_part(r.content #>> '{structured,location}', ',', array_length(string_to_array(r.content #>> '{structured,location}', ','), 1))
      else r.content #>> '{structured,location}'
    end
  ),
  ''
)
from public.resumes r
where r.user_id = p.id
  and r.is_primary = true
  and p.country is null
  and coalesce(r.content #>> '{structured,location}', '') <> '';
