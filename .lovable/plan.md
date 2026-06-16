## Obiectiv
Eliminarea politicilor RLS `Anon full access` și expunerea publică a PIN-urilor, mutând logica sensibilă în edge functions care validează server-side cu service role key. Frontend-ul rămâne anon, dar nu mai poate citi/scrie direct date sensibile.

## Faza 1 — Edge functions pentru autentificare și PIN-uri (BREAKING-SAFE, livrată prima)

Edge functions noi:
1. **`employee-login`** — primește `{card_code, pin?}`, validează în DB, întoarce `{id, name, role}` fără PIN-uri. Înlocuiește citirea directă din `employees` în `use-auth.tsx`.
2. **`validate-stock-pin`** — primește `{role, pin}`, validează contra `system_settings`, întoarce `{valid: bool}`. Înlocuiește citirea PIN-urilor în `ScoatereStoc.tsx` și `StockPinSettingsTab.tsx`.
3. **`get-stock-pins`** (doar admin) — întoarce PIN-urile pentru ecranul de setări (verifică server-side că apelantul e admin printr-un secret/token simplu).

Migrare DB (rulează după ce edge functions sunt în loc):
- DROP policies: `Anon can read employees`, `Oricine poate citi angajati`, SELECT anon pe `system_settings`.
- ADD policy `system_settings`: SELECT doar pentru `service_role` (sau bazat pe `has_role admin` când vom avea auth real).
- ADD policy `employees`: SELECT doar `service_role`.

## Faza 2 — Edge function pentru vânzări

4. **`create-sale`** — primește cart + payment + cashier_id, validează stocul, creează `sales` + `sale_items`, decrementează `inventory_stock`, opțional `commission_logs`. Înlocuiește toate insertările directe din `use-pos.ts` / POS.
5. **`cancel-sale`** / **`create-return`** — restaurează stocul server-side.

Migrare DB:
- DROP policies `Anon full access sales`, `Anon full access sale_items`.
- Policies rămân scrise pe `has_role` și `service_role`.

## Faza 3 — Stoc și produse

6. **`inventory-mutate`** — endpoint unificat pentru ajustări manuale (transfer, recepție outside-edge-functions, scoatere stoc) — sau extindem funcțiile existente.
- `bulk-import-inventory`, `initial-stock-load` rulează deja pe service role → OK.
- Mutațiile de produse (UPDATE/INSERT/DELETE) sunt deja în Admin → rămân, dar protejăm prin a elimina politica `Anon full access products` și a păstra doar policies role-based. **Notă:** asta înseamnă că UI-ul Admin trebuie să apeleze edge functions pentru a edita produse, sau primește un token de admin.

Pentru a evita un refactor masiv în Admin imediat: înlocuiesc UPDATE/INSERT/DELETE de produse cu edge function `admin-product-mutate` care verifică un header `x-admin-token` egal cu un secret stocat.

## Faza 4 — Hardening rămas
- `customers`: SELECT policy restrânsă (mutată în edge function `lookup-customer`).
- SECURITY DEFINER functions: `REVOKE EXECUTE ... FROM anon` pentru `get_admin_kpis`, `has_role`, `confirm_transfer`, `generate_sale_internal_id` — apelate doar din edge functions sau roluri autentificate.
- Storage `product-images`: înlocuiesc policy SELECT pe `(bucket_id = 'product-images')` cu una care permite GET pe obiect individual prin `publicUrl` (rămâne public read, dar listarea bucket-ului e blocată — Supabase deja blochează listarea când policy-ul nu acoperă `SELECT *`, doar accesul direct la URL funcționează).
- Activez **Leaked Password Protection** (chiar dacă nu folosim email auth — pregătit pentru viitor).

## Detalii tehnice
- Toate edge functions folosesc service role key (server-side) și CORS standard.
- Frontend introduce un **session token simplu**: la login, edge function întoarce un `session_token` (UUID semnat HMAC cu secret server). Pentru endpoint-urile sensibile, frontend trimite tokenul în header `x-employee-session`. Edge function-ul îl verifică și extrage `employee_id` + `role`.
- Token-ul e stocat în `localStorage` alături de `cesars_employee_session`.

## Risc & rollout
- Implementarea se face în 4 faze, fiecare cu test în preview înainte de a rula migrațiile care „taie" politicile anon.
- După fiecare fază, validez în preview că login + POS + stoc + admin funcționează.
- Memory `Core` actualizată: politicile anon nu mai sunt acceptate; toate scrierile sensibile trec prin edge functions.

## Ce livrez acum (dacă aprobi)
Doar **Faza 1**: edge functions `employee-login`, `validate-stock-pin`, `get-stock-pins` + refactor `use-auth.tsx`, `ScoatereStoc.tsx`, `StockPinSettingsTab.tsx` + migrația care elimină anon SELECT pe `employees` și `system_settings`. Voi prezenta Fazele 2–4 după ce confirmi că Faza 1 merge.
