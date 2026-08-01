# Connect HubSpot to TeamNest (Private App token)

HubSpot Private Apps work on **every HubSpot tier, including Free**. You'll create a
private app, copy its access token, and send it to TeamNest.

## Steps (~2 minutes)
1. Sign in to HubSpot as a **Super Admin** (or an account with app-creation rights).
2. Click the **Settings** gear (top-right).
3. Left sidebar → **Integrations** → **Private Apps**.
4. Click **Create a private app**.
5. **Basic Info** tab:
   - Name: `TeamNest`
   - (optional) Description: "Pull contact context into TeamNest chats."
6. **Scopes** tab → search and enable (start minimal — Pull only):
   - `crm.objects.contacts.read`
   - *(add later for Pull + push)* `crm.objects.contacts.write`, `crm.objects.notes.write`
7. Click **Create app** (top-right) → confirm in the dialog.
8. On the app's **Auth** tab, under **Access token**, click **Show token** → **Copy**.
   - The token looks like `pat-na1-xxxxxxxx…` (US) or `pat-eu1-xxxxxxxx…` (EU).
9. Send that `pat-…` token to TeamNest. It will be stored server-side as `HUBSPOT_ACCESS_TOKEN`.

## What the scope is for
| Scope | Why |
|---|---|
| `crm.objects.contacts.read` | Look up a contact by email/name and show their CRM context inside a chat |
| `crm.objects.contacts.write` *(later)* | Update contact fields from a chat |
| `crm.objects.notes.write` *(later)* | Push a chat summary as a note on the contact |

## Notes
- The token does **not** expire on its own, but you can rotate/revoke it anytime from the
  same **Private Apps** screen — if you do, just copy the new one and resend it.
- API region (na1 / eu1) is encoded in the token; both use base URL `https://api.hubapi.com`.
- Keep the token secret — treat it like a password. Only paste it into TeamNest.
