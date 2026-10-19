-- Siyanda Resources CMS: articles, careers, tenders, documents (with versions),
-- two staff roles (super_admin, admin), a recoverable bin and an audit log.
--
-- Run once in the Supabase SQL editor (or `supabase db push`). Then follow
-- supabase/README.md to create the first super admin.

-- ---------------------------------------------------------------- types
create type public.app_role as enum ('super_admin', 'admin');
create type public.content_status as enum ('draft', 'published');

-- ---------------------------------------------------------------- staff
create table public.user_roles (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  role       public.app_role not null,
  email      text,
  full_name  text,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id)
);

create function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = auth.uid() and active)
$$;

create function public.is_super_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles
                 where user_id = auth.uid() and active and role = 'super_admin')
$$;

-- A content row is public when published, not in the bin, past its publish
-- date and before its expiry date.
create function public.is_live(st public.content_status, pub timestamptz, exp timestamptz, del timestamptz)
returns boolean language sql stable as $$
  select del is null and st = 'published'
         and (pub is null or pub <= now()) and (exp is null or exp > now())
$$;

-- Never leave the site without an active super admin.
create function public.keep_a_super_admin() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (tg_op = 'DELETE' or new.role <> 'super_admin' or not new.active)
     and old.role = 'super_admin' and old.active
     and not exists (select 1 from public.user_roles
                     where role = 'super_admin' and active and user_id <> old.user_id) then
    raise exception 'There must be at least one active super admin';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

create trigger user_roles_keep_super before update or delete on public.user_roles
  for each row execute function public.keep_a_super_admin();

-- ---------------------------------------------------------------- content
create table public.articles (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  summary      text,
  body         text,
  image_url    text,
  source_url   text,                       -- link to an external article, if any
  published_at timestamptz,                -- null = as soon as status is published
  expires_at   timestamptz,                -- null = never expires
  status       public.content_status not null default 'draft',
  created_at   timestamptz not null default now(),
  created_by   uuid default auth.uid() references auth.users (id),
  updated_at   timestamptz not null default now(),
  updated_by   uuid references auth.users (id),
  deleted_at   timestamptz,
  deleted_by   uuid references auth.users (id)
);

create table public.careers (
  id              uuid primary key default gen_random_uuid(),
  title           text not null,
  department      text,
  location        text,
  employment_type text,
  description     text,
  how_to_apply    text,
  apply_url       text,
  apply_email     text,
  published_at    timestamptz,
  expires_at      timestamptz,             -- closing date
  status          public.content_status not null default 'draft',
  created_at      timestamptz not null default now(),
  created_by      uuid default auth.uid() references auth.users (id),
  updated_at      timestamptz not null default now(),
  updated_by      uuid references auth.users (id),
  deleted_at      timestamptz,
  deleted_by      uuid references auth.users (id)
);

create table public.tenders (
  id            uuid primary key default gen_random_uuid(),
  reference_no  text,
  title         text not null,
  description   text,
  briefing_at   timestamptz,               -- optional compulsory briefing
  contact_email text,
  published_at  timestamptz,
  expires_at    timestamptz,               -- closing date
  status        public.content_status not null default 'draft',
  created_at    timestamptz not null default now(),
  created_by    uuid default auth.uid() references auth.users (id),
  updated_at    timestamptz not null default now(),
  updated_by    uuid references auth.users (id),
  deleted_at    timestamptz,
  deleted_by    uuid references auth.users (id)
);

create table public.documents (
  id                 uuid primary key default gen_random_uuid(),
  title              text not null,
  description        text,
  category           text,
  tender_id          uuid references public.tenders (id),  -- set for tender documents
  current_version_id uuid,                                  -- FK added below
  published_at       timestamptz,
  expires_at         timestamptz,
  status             public.content_status not null default 'draft',
  created_at         timestamptz not null default now(),
  created_by         uuid default auth.uid() references auth.users (id),
  updated_at         timestamptz not null default now(),
  updated_by         uuid references auth.users (id),
  deleted_at         timestamptz,
  deleted_by         uuid references auth.users (id)
);

-- Every upload is a new, immutable version of a document.
create table public.document_versions (
  id             uuid primary key default gen_random_uuid(),
  document_id    uuid not null references public.documents (id) on delete cascade,
  version_number integer not null,
  storage_path   text not null unique,
  file_name      text not null,
  mime_type      text,
  size_bytes     bigint,
  change_note    text,
  uploaded_by    uuid default auth.uid() references auth.users (id),
  uploaded_at    timestamptz not null default now(),
  unique (document_id, version_number)
);

alter table public.documents
  add constraint documents_current_version_fk
  foreign key (current_version_id) references public.document_versions (id);

create index on public.documents (tender_id);
create index on public.document_versions (document_id);

-- A document is public if it is live itself and, when it belongs to a tender,
-- that tender is live too (a closed tender takes its documents down with it).
create function public.document_is_public(p_document uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.documents d
    where d.id = p_document
      and public.is_live(d.status, d.published_at, d.expires_at, d.deleted_at)
      and (d.tender_id is null or exists (
            select 1 from public.tenders t
            where t.id = d.tender_id
              and public.is_live(t.status, t.published_at, t.expires_at, t.deleted_at)))
  )
$$;

-- Only the current version of a public document may be downloaded by visitors.
create function public.version_path_is_public(p_path text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.document_versions v
    join public.documents d on d.id = v.document_id and d.current_version_id = v.id
    where v.storage_path = p_path and public.document_is_public(d.id)
  )
$$;

-- ---------------------------------------------------------------- triggers
-- Stamps updates and enforces the bin rules:
--   * admins can move items to the bin but not restore them or edit binned items
--   * only a super admin can restore
create function public.content_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.deleted_at is not null and not public.is_super_admin() then
    raise exception 'This item is in the bin; only a super admin can change it';
  end if;
  if new.deleted_at is not null and old.deleted_at is null then
    new.deleted_by := auth.uid();
  elsif new.deleted_at is null and old.deleted_at is not null then
    new.deleted_by := null;
  end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;

create trigger articles_guard  before update on public.articles  for each row execute function public.content_guard();
create trigger careers_guard   before update on public.careers   for each row execute function public.content_guard();
create trigger tenders_guard   before update on public.tenders   for each row execute function public.content_guard();
create trigger documents_guard before update on public.documents for each row execute function public.content_guard();

-- Add a new version to a document (next number, becomes current).
create function public.add_document_version(
  p_document uuid, p_path text, p_file_name text, p_mime text, p_size bigint, p_note text
) returns public.document_versions
language plpgsql security invoker set search_path = public as $$
declare v public.document_versions; n integer;
begin
  perform 1 from public.documents where id = p_document for update;
  if not found then raise exception 'Document not found'; end if;
  select coalesce(max(version_number), 0) + 1 into n
    from public.document_versions where document_id = p_document;
  insert into public.document_versions
    (document_id, version_number, storage_path, file_name, mime_type, size_bytes, change_note)
    values (p_document, n, p_path, p_file_name, p_mime, p_size, p_note)
    returning * into v;
  update public.documents set current_version_id = v.id where id = p_document;
  return v;
end $$;

-- Roll back (or forward) to any earlier version.
create function public.set_current_version(p_document uuid, p_version uuid) returns void
language plpgsql security invoker set search_path = public as $$
begin
  if not exists (select 1 from public.document_versions
                 where id = p_version and document_id = p_document) then
    raise exception 'That version does not belong to this document';
  end if;
  update public.documents set current_version_id = p_version where id = p_document;
end $$;

-- ---------------------------------------------------------------- audit log
create table public.audit_log (
  id         bigint generated always as identity primary key,
  at         timestamptz not null default now(),
  actor      uuid,
  actor_email text,
  action     text not null,
  table_name text not null,
  row_id     text,
  summary    text
);

create function public.audit_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare r jsonb; act text; who text;
begin
  r := to_jsonb(case when tg_op = 'DELETE' then old else new end);
  act := lower(tg_op);
  if tg_op = 'UPDATE' and tg_table_name in ('articles','careers','tenders','documents') then
    if old.deleted_at is null and new.deleted_at is not null then act := 'moved to bin';
    elsif old.deleted_at is not null and new.deleted_at is null then act := 'restored';
    end if;
  end if;
  select email into who from auth.users where id = auth.uid();
  insert into public.audit_log (actor, actor_email, action, table_name, row_id, summary)
  values (auth.uid(), who, act, tg_table_name,
          coalesce(r ->> 'id', r ->> 'user_id'),
          coalesce(r ->> 'title', r ->> 'file_name', r ->> 'email'));
  return null;
end $$;

create trigger articles_audit  after insert or update or delete on public.articles  for each row execute function public.audit_change();
create trigger careers_audit   after insert or update or delete on public.careers   for each row execute function public.audit_change();
create trigger tenders_audit   after insert or update or delete on public.tenders   for each row execute function public.audit_change();
create trigger documents_audit after insert or update or delete on public.documents for each row execute function public.audit_change();
create trigger versions_audit  after insert or delete on public.document_versions   for each row execute function public.audit_change();
create trigger roles_audit     after insert or update or delete on public.user_roles for each row execute function public.audit_change();

-- ---------------------------------------------------------------- row level security
alter table public.user_roles        enable row level security;
alter table public.articles          enable row level security;
alter table public.careers           enable row level security;
alter table public.tenders           enable row level security;
alter table public.documents         enable row level security;
alter table public.document_versions enable row level security;
alter table public.audit_log         enable row level security;

-- staff roles: everyone signed in can read their own row; super admins manage all
create policy roles_read   on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.is_super_admin());
create policy roles_write  on public.user_roles for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

-- articles / careers / tenders: public sees live rows; staff see everything;
-- staff create and edit; only a super admin can permanently delete.
create policy articles_read on public.articles for select to anon, authenticated
  using (public.is_live(status, published_at, expires_at, deleted_at) or public.is_staff());
create policy articles_add  on public.articles for insert to authenticated with check (public.is_staff());
create policy articles_edit on public.articles for update to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy articles_purge on public.articles for delete to authenticated using (public.is_super_admin());

create policy careers_read on public.careers for select to anon, authenticated
  using (public.is_live(status, published_at, expires_at, deleted_at) or public.is_staff());
create policy careers_add  on public.careers for insert to authenticated with check (public.is_staff());
create policy careers_edit on public.careers for update to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy careers_purge on public.careers for delete to authenticated using (public.is_super_admin());

create policy tenders_read on public.tenders for select to anon, authenticated
  using (public.is_live(status, published_at, expires_at, deleted_at) or public.is_staff());
create policy tenders_add  on public.tenders for insert to authenticated with check (public.is_staff());
create policy tenders_edit on public.tenders for update to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy tenders_purge on public.tenders for delete to authenticated using (public.is_super_admin());

create policy documents_read on public.documents for select to anon, authenticated
  using (public.document_is_public(id) or public.is_staff());
create policy documents_add  on public.documents for insert to authenticated with check (public.is_staff());
create policy documents_edit on public.documents for update to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy documents_purge on public.documents for delete to authenticated using (public.is_super_admin());

-- versions are immutable: staff can add and read; nobody edits; super admin purges
create policy versions_read on public.document_versions for select to anon, authenticated
  using (public.is_staff() or
         (public.document_is_public(document_id) and exists (
            select 1 from public.documents d
            where d.id = document_id and d.current_version_id = document_versions.id)));
create policy versions_add   on public.document_versions for insert to authenticated with check (public.is_staff());
create policy versions_purge on public.document_versions for delete to authenticated using (public.is_super_admin());

create policy audit_read on public.audit_log for select to authenticated using (public.is_super_admin());

-- ---------------------------------------------------------------- grants
grant select on public.articles, public.careers, public.tenders, public.documents,
                public.document_versions to anon;
grant select, insert, update, delete on public.articles, public.careers, public.tenders,
  public.documents, public.document_versions, public.user_roles to authenticated;
grant select on public.audit_log to authenticated;
grant execute on function public.add_document_version(uuid, text, text, text, bigint, text) to authenticated;
grant execute on function public.set_current_version(uuid, uuid) to authenticated;
grant execute on function public.is_staff(), public.is_super_admin() to anon, authenticated;

-- ---------------------------------------------------------------- storage
insert into storage.buckets (id, name, public, file_size_limit)
values ('documents', 'documents', false, 52428800),   -- private: served by signed links
       ('images',    'images',    true,  10485760)    -- public article images
on conflict (id) do nothing;

create policy documents_files_read on storage.objects for select to anon, authenticated
  using (bucket_id = 'documents' and (public.is_staff() or public.version_path_is_public(name)));
create policy cms_files_add on storage.objects for insert to authenticated
  with check (bucket_id in ('documents', 'images') and public.is_staff());
create policy cms_files_purge on storage.objects for delete to authenticated
  using (bucket_id in ('documents', 'images') and public.is_super_admin());
