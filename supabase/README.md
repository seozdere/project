# Supabase Security Migrations

Apply these SQL files in order before deploying the updated frontend:

1. `migrations/001_parent_link_sessions.sql`
2. `migrations/002_auth_audit_support.sql`

The first migration adds the parent-link exchange layer:

- Admin creates a share code with `cl_get_parent_link_v2`.
- Parent opens `parent.html?link=...`.
- The frontend exchanges that code with `cl_parent_exchange_link`.
- The browser stores only a short-lived parent session in `sessionStorage`.
- Parent data is read with `cl_get_parent_view_v2`.

The migration intentionally wraps the existing `cl_get_parent_link` and `cl_get_parent_view` RPCs, so it can be applied without redesigning the existing data tables first.

Production checks after applying:

- Old `parent.html?id=...` links should be phased out and rotated.
- A copied `link=` URL should produce only a 10 minute session.
- Deactivating a row in `cl_parent_links` should immediately stop future exchanges.
- Expired rows in `cl_parent_sessions` should no longer read data.
- Teachers/admins can revoke active class links through `cl_revoke_parent_links_v2`.

The second migration creates locked-down support tables and helper functions for
server-side login throttling and audit logging. Because the current repo does not
include the original `cl_authenticate` / teacher-management SQL definitions, those
existing functions still need to call the new helpers where marked in your Supabase
function definitions.
