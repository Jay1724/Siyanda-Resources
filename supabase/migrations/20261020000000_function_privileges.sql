-- Tighten who can call the CMS helper functions (found via Supabase's security advisor).

-- Trigger functions are run by the database, never called from the API.
revoke execute on function public.audit_change()        from public, anon, authenticated;
revoke execute on function public.content_guard()       from public, anon, authenticated;
revoke execute on function public.keep_a_super_admin()  from public, anon, authenticated;

-- RPC helpers are for signed-in staff only (they are also protected by row level security).
revoke execute on function public.add_document_version(uuid, text, text, text, bigint, text) from public, anon;
revoke execute on function public.set_current_version(uuid, uuid) from public, anon;

-- Pin the search path of the date helper.
alter function public.is_live(public.content_status, timestamptz, timestamptz, timestamptz) set search_path = public;

-- Deliberately still callable by anon/authenticated: is_staff, is_super_admin,
-- document_is_public, version_path_is_public. The row level security rules call
-- them as the visitor, so they must be executable. They only return true/false
-- about the caller's own role or whether a given item is already public.
