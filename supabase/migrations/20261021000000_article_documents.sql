-- Let documents be attached to an article (as they can be to a tender).
--
-- A document belongs to at most one parent: a tender, an article, or neither
-- (a general library document). A document attached to an article is public only
-- while the article is public, exactly like tender documents.

alter table public.documents add column article_id uuid references public.articles (id);
alter table public.documents
  add constraint documents_one_parent check (tender_id is null or article_id is null);
create index on public.documents (article_id);

create or replace function public.document_is_public(p_document uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.documents d
    where d.id = p_document
      and public.is_live(d.status, d.published_at, d.expires_at, d.deleted_at)
      and (d.tender_id is null or exists (
            select 1 from public.tenders t
            where t.id = d.tender_id
              and public.is_live(t.status, t.published_at, t.expires_at, t.deleted_at)))
      and (d.article_id is null or exists (
            select 1 from public.articles a
            where a.id = d.article_id
              and public.is_live(a.status, a.published_at, a.expires_at, a.deleted_at)))
  )
$$;
