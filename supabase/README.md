# Content portal setup (Supabase)

The portal lives at `/admin/` on the site. Staff sign in there to manage
**articles, careers, tenders and documents**. Everything is stored in your
Supabase project; the website pages read the live items from it.

## Roles

| | Super admin | Admin |
|---|---|---|
| Create / edit articles, careers, tenders, documents | yes | yes |
| Set publish and expiry dates | yes | yes |
| Upload new document versions, roll back to an older one | yes | yes |
| Delete (moves to the **bin**) | yes | yes |
| Restore from the bin / delete permanently | yes | no |
| Invite, switch off and change roles of users | yes | no |
| See the activity log | yes | no |

These rules are enforced by the database (row level security), not just
hidden in the screens. Expired, unpublished or binned items are invisible to
website visitors, including their downloadable files.

## One-time setup

1. **Create the tables and rules.** Supabase dashboard > SQL editor > paste
   `supabase/migrations/20261019000000_cms.sql` > Run.
2. **Turn off public sign-ups.** Authentication > Sign In / Providers > Email
   > switch off *Allow new users to sign up*. (People can then only join by
   invitation.)
3. **Allow the portal address.** Authentication > URL Configuration: set *Site
   URL* to the site address and add `<site address>/admin/` under *Redirect
   URLs*. Invitation and password-reset emails link back there.
4. **Create yourself as the first super admin.** Authentication > Users > Add
   user > Create new user (tick *Auto Confirm User*). Then in the SQL editor:

   ```sql
   insert into public.user_roles (user_id, role, email, full_name)
   select id, 'super_admin', email, 'Your Name'
   from auth.users where email = 'you@example.co.za';
   ```
5. **Deploy the invite function** (needed for the Users page). With the
   Supabase CLI: `supabase functions deploy admin-users --project-ref <ref>`.
   Or create a function named `admin-users` in the dashboard (Edge Functions)
   and paste in `supabase/functions/admin-users/index.ts`. It uses keys that
   Supabase provides to functions automatically; nothing to configure.
6. **Connect the portal.** Edit `assets/cms-config.js` and fill in the project URL
   and the **anon / publishable** key (Project Settings > API). Never the
   `service_role` key.
7. Commit and push. The site deploys, and `/admin/` is live.

Optional: set up an email provider (Authentication > SMTP) before inviting
many people, as Supabase's built-in sender is rate limited.

## How things work

- **Expiry:** items have an optional *show from* and *expires on* date. The
  database decides what visitors can see at the moment they ask, so expired
  items disappear on their own with no scheduled job.
- **Tender documents** belong to a tender. When the tender closes or is
  deleted its documents stop being available too.
- **Document versions:** every upload is a new version; old ones are kept and
  can be made current again. Visitors only get the current version. Files sit in
  a private storage bucket and are served through short-lived links.
- **Bin:** deleting never destroys anything. Only a super admin can restore
  or permanently delete.
- **Activity:** every create, edit, delete and role change is logged for
  super admins.

## Status

The project **Siyanda Resources** (`yvmivogkfjgvwmsssnfd`) has the schema
(both migrations), the storage buckets and the `admin-users` function
deployed, and `assets/cms-config.js` points at it. Still to do by hand (steps 2, 3
and 4 above): turn off public sign-ups, set the Site URL / redirect URL, and
create the first super admin.

## Public pages

- **Careers** (`careers.html`) lists open vacancies from the portal under
  "Current Vacancies". The CV-registration text below it is unchanged.
- **Tenders** (`tenders.html`, new, linked in the menu) lists open tenders with
  their closing date, briefing session, contact and downloadable documents
  (current version only, via 5-minute signed links).
- Both read through `assets/cms-public.js`, using the public key in
  `assets/cms-config.js`. Visitors only ever receive items that are published
  and not expired; the database enforces that, not the page.
- Because the lists are loaded after the page opens, search engines that do not
  run JavaScript will not index individual vacancies or tenders.

## Not done yet

- News (articles) and the general Documents library still use static content.
- Email reminders before an item expires.
