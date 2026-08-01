# Supabase patches

Apply these SQL files **in numeric order** when upgrading an existing database. New projects can use `supabase/schema.sql`, which should already include the cumulative shape; still run any patch if your live DB was created before a change landed in `schema.sql`.

| Order | File | Purpose |
| ------ | ------ | -------- |
| 01 | `01_email_signup_and_is_blockchain.sql` | Email-based organizers and `is_blockchain` on events |
| 02 | `02_organizer_display_name.sql` | Organizer display name column |
| 02b | `02_tickets_payments.sql` | Paid tickets and registration payment columns |
| 03 | `03_attendance_email.sql` | Attendance rows keyed by email where needed |
| 04 | `04_wallet_registration_name_email.sql` | Wallet registration name/email fields |
| 05 | `05_ticket_payment_modes.sql` | Paid ticket columns on `events` (`ticket_price_usdc`, `mobile_money_instructions`, `ticket_accept_usdc`, `ticket_accept_mobile_money`) — idempotent; matches in-app migration hint |
| 06 | `06_ticket_accept_stellar.sql` | Opt-in `ticket_accept_stellar` — USDC on Stellar for paid tickets |
| 07 | `07_hosting_ops.sql` | Soft-cancel (`cancelled_at`), unique payment tx/ref indexes, MoMo pending statuses |
| 08 | `08_admin_cancel.sql` | Admin misconduct cancel (`cancelled_by_admin`, `cancel_reason`) — hosts cannot restore |
| 09 | `09_attendance_mint.sql` | Soroban (then Base) mint receipt columns on `attendance` |

After altering tables exposed to PostgREST, patches that end with `notify pgrst, 'reload schema';` refresh the API schema cache.
