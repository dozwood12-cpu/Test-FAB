ALTER TABLE users ADD COLUMN IF NOT EXISTS deputy boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarded_at timestamptz;
ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS details jsonb NOT NULL DEFAULT '{}';
CREATE TABLE IF NOT EXISTS policy (
 id integer PRIMARY KEY CHECK(id=1), version integer NOT NULL DEFAULT 1,
 mechanical bigint NOT NULL DEFAULT 350000 CHECK(mechanical>=0),
 electrical bigint NOT NULL DEFAULT 350000 CHECK(electrical>=0),
 nontechnical bigint NOT NULL DEFAULT 100000 CHECK(nontechnical>=0),
 total_weekly bigint NOT NULL DEFAULT 800000 CHECK(total_weekly>=0),
 direct_threshold bigint NOT NULL DEFAULT 800000 CHECK(direct_threshold>=10000),
 carry_percent integer NOT NULL DEFAULT 25 CHECK(carry_percent BETWEEN 0 AND 100),
 advance_days integer NOT NULL DEFAULT 5 CHECK(advance_days BETWEEN 3 AND 7),
 urgent_hours integer NOT NULL DEFAULT 3 CHECK(urgent_hours BETWEEN 2 AND 4),
 lost_limit integer NOT NULL DEFAULT 1 CHECK(lost_limit BETWEEN 1 AND 10),
 payout_days integer NOT NULL DEFAULT 7 CHECK(payout_days BETWEEN 1 AND 7),
 payout_weekday integer NOT NULL DEFAULT 5 CHECK(payout_weekday BETWEEN 1 AND 7),
 generation text NOT NULL DEFAULT 'Gen 8',
 contacts jsonb NOT NULL DEFAULT '[{"name":"PIC Finance","contact":"Belum diisi"},{"name":"PIC Administrasi","contact":"Belum diisi"}]',
 updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO policy(id) VALUES(1) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS policy_history(id bigserial PRIMARY KEY, version integer NOT NULL, snapshot jsonb NOT NULL, actor_id bigint REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS approval_policies(
 id bigserial PRIMARY KEY, route text UNIQUE NOT NULL CHECK(route IN ('REGULER','LANGSUNG','URGENT')),
 verifier_role text NOT NULL DEFAULT 'FA' CHECK(verifier_role='FA'),
 approver_role text NOT NULL DEFAULT 'GM' CHECK(approver_role='GM'),
 require_hod boolean NOT NULL DEFAULT false CHECK(require_hod=false)
);
INSERT INTO approval_policies(route) VALUES('REGULER'),('LANGSUNG'),('URGENT') ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS rab_items(
 id bigserial PRIMARY KEY, code text UNIQUE NOT NULL, title text NOT NULL,
 division text NOT NULL CHECK(division IN ('Mechanical','Electrical','Non-Technical')),
 budget bigint NOT NULL CHECK(budget>=0), generation text NOT NULL DEFAULT 'Gen 8', active boolean NOT NULL DEFAULT true
);
CREATE TABLE IF NOT EXISTS inventory(
 id bigserial PRIMARY KEY, name text NOT NULL, division text NOT NULL, quantity integer NOT NULL CHECK(quantity>=0),
 location text NOT NULL, condition text NOT NULL DEFAULT 'Baik', updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE SEQUENCE IF NOT EXISTS request_numbers;
CREATE TABLE IF NOT EXISTS requests(
 id bigserial PRIMARY KEY, number text NOT NULL UNIQUE DEFAULT ('AG8-' || to_char(now() AT TIME ZONE 'Asia/Jakarta','YYYY') || '-' || lpad(nextval('request_numbers')::text,6,'0')),
 proposer_id bigint NOT NULL REFERENCES users(id), division text NOT NULL,
 title text NOT NULL, vendor text NOT NULL, vendor_key text NOT NULL, purpose text NOT NULL, purpose_key text NOT NULL,
 amount bigint NOT NULL CHECK(amount>=10000), purchase_date date NOT NULL,
 kind text NOT NULL CHECK(kind IN ('REIMBURSEMENT','ADVANCE')), channel text NOT NULL CHECK(channel IN ('MANUAL','ONLINE')),
 route text NOT NULL CHECK(route IN ('REGULER','LANGSUNG','URGENT')),
 status text NOT NULL DEFAULT 'Diajukan' CHECK(status IN ('Diajukan','Diverifikasi','Perlu Perbaikan','Disetujui','Dicairkan','Ditolak')),
 tracking_number text NOT NULL DEFAULT '', bank_details text NOT NULL,
 generation text NOT NULL, policy_snapshot jsonb NOT NULL,
 flags jsonb NOT NULL DEFAULT '[]', note text NOT NULL DEFAULT '',
 verifier_id bigint REFERENCES users(id), approver_id bigint REFERENCES users(id), payer_id bigint REFERENCES users(id),
 submitted_at timestamptz NOT NULL DEFAULT now(), verified_at timestamptz, approved_at timestamptz, paid_at timestamptz,
 correction_due timestamptz, purchase_due date NOT NULL, urgent_due timestamptz, payout_due timestamptz, advance_due timestamptz,
 settled_at timestamptz, settlement_verifier_id bigint REFERENCES users(id), settlement_approver_id bigint REFERENCES users(id),
 urgent_responded_at timestamptz, escalation_at timestamptz, funding_note text NOT NULL DEFAULT '',
 CHECK(verifier_id IS NULL OR verifier_id<>proposer_id),
 CHECK(approver_id IS NULL OR (approver_id<>proposer_id AND approver_id<>verifier_id)),
 CHECK(payer_id IS NULL OR (payer_id<>proposer_id AND payer_id<>verifier_id AND payer_id<>approver_id))
);
CREATE INDEX IF NOT EXISTS requests_splitting ON requests(vendor_key,purpose_key,purchase_date);
CREATE TABLE IF NOT EXISTS request_items(
 id bigserial PRIMARY KEY, request_id bigint NOT NULL REFERENCES requests(id), rab_id bigint NOT NULL REFERENCES rab_items(id),
 component text NOT NULL, quantity integer NOT NULL CHECK(quantity>0), unit_price bigint NOT NULL CHECK(unit_price>0)
);
CREATE TABLE IF NOT EXISTS documents(
 id bigserial PRIMARY KEY, request_id bigint NOT NULL REFERENCES requests(id), uploaded_by bigint NOT NULL REFERENCES users(id),
 category text NOT NULL CHECK(category IN ('NOTA','INVOICE','FOTO_BARANG','TRACKING','PERNYATAAN','MUTASI','BUKTI_TRANSFER','BUKTI_REFUND')),
 original_name text NOT NULL, storage_key text NOT NULL UNIQUE, mime text NOT NULL, size integer NOT NULL,
 sha256 text NOT NULL, perceptual_hash text, vendor_key text, receipt_date date, receipt_amount bigint,
 stamped boolean NOT NULL DEFAULT false, legible_confirmed boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS documents_duplicate_hash ON documents(sha256);
CREATE INDEX IF NOT EXISTS documents_receipt_tuple ON documents(vendor_key,receipt_date,receipt_amount);
CREATE TABLE IF NOT EXISTS request_events(
 id bigserial PRIMARY KEY, request_id bigint NOT NULL REFERENCES requests(id), actor_id bigint REFERENCES users(id),
 action text NOT NULL, from_status text, to_status text, note text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS reviews(
 id bigserial PRIMARY KEY, request_id bigint NOT NULL REFERENCES requests(id), actor_id bigint NOT NULL REFERENCES users(id),
 decision text NOT NULL, checklist jsonb NOT NULL DEFAULT '{}', reasons text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS weekly_budgets(
 week date NOT NULL, division text NOT NULL, base_amount bigint NOT NULL CHECK(base_amount>=0),
 carry bigint NOT NULL DEFAULT 0 CHECK(carry>=0), adjustment bigint NOT NULL DEFAULT 0,
 PRIMARY KEY(week,division), CHECK(base_amount+carry+adjustment>=0)
);
CREATE TABLE IF NOT EXISTS budget_reservations(
 request_id bigint PRIMARY KEY REFERENCES requests(id), week date NOT NULL, division text NOT NULL,
 amount bigint NOT NULL CHECK(amount>0), released boolean NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS reallocations(
 id bigserial PRIMARY KEY, week date NOT NULL, source text NOT NULL, destination text NOT NULL,
 amount bigint NOT NULL CHECK(amount>0), note text NOT NULL, actor_id bigint NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS cash_entries(
 id bigserial PRIMARY KEY, request_id bigint REFERENCES requests(id), kind text NOT NULL CHECK(kind IN ('MASUK','KELUAR','REFUND')),
 amount bigint NOT NULL CHECK(amount>0), note text NOT NULL, actor_id bigint NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS disbursements(
 id bigserial PRIMARY KEY, request_id bigint UNIQUE NOT NULL REFERENCES requests(id), actor_id bigint NOT NULL REFERENCES users(id),
 amount bigint NOT NULL CHECK(amount>0), reference text NOT NULL, document_id bigint NOT NULL REFERENCES documents(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS receipt_handoffs(
 id bigserial PRIMARY KEY, request_id bigint NOT NULL REFERENCES requests(id), sender_id bigint NOT NULL REFERENCES users(id),
 receiver_id bigint NOT NULL REFERENCES users(id), location text NOT NULL, status text NOT NULL CHECK(status IN ('Diterima','Diarsipkan')),
 created_at timestamptz NOT NULL DEFAULT now(), CHECK(sender_id<>receiver_id)
);
CREATE TABLE IF NOT EXISTS lost_receipts(
 id bigserial PRIMARY KEY, request_id bigint UNIQUE NOT NULL REFERENCES requests(id), reason text NOT NULL,
 status text NOT NULL DEFAULT 'Menunggu' CHECK(status IN ('Menunggu','Disetujui','Ditolak')),
 approver_id bigint REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS appeals(
 id bigserial PRIMARY KEY, request_id bigint NOT NULL REFERENCES requests(id), reason text NOT NULL,
 status text NOT NULL DEFAULT 'Menunggu' CHECK(status IN ('Menunggu','Diterima','Ditolak')),
 decision_note text NOT NULL DEFAULT '', reviewer_id bigint REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS one_pending_appeal ON appeals(request_id) WHERE status='Menunggu';
CREATE TABLE IF NOT EXISTS returns(
 id bigserial PRIMARY KEY, request_id bigint NOT NULL REFERENCES requests(id), amount bigint NOT NULL CHECK(amount>0),
 reason text NOT NULL, status text NOT NULL DEFAULT 'Menunggu' CHECK(status IN ('Menunggu','Dikonfirmasi')),
 confirmer_id bigint REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sanctions(
 id bigserial PRIMARY KEY, user_id bigint NOT NULL REFERENCES users(id), actor_id bigint NOT NULL REFERENCES users(id),
 level integer NOT NULL CHECK(level BETWEEN 1 AND 3), reason text NOT NULL, until_date date, active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS notifications(
 id bigserial PRIMARY KEY, user_id bigint NOT NULL REFERENCES users(id), request_id bigint REFERENCES requests(id),
 subject text NOT NULL, message text NOT NULL, event_key text UNIQUE,
 read_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
 email_status text NOT NULL DEFAULT 'pending' CHECK(email_status IN ('pending','sent','unavailable','failed')),
 attempts integer NOT NULL DEFAULT 0, next_attempt timestamptz NOT NULL DEFAULT now(), last_error text, email_sent_at timestamptz
);
CREATE TABLE IF NOT EXISTS reconciliations(
 id bigserial PRIMARY KEY, month date NOT NULL UNIQUE, statement_balance bigint NOT NULL,
 ledger_balance bigint NOT NULL, difference bigint NOT NULL, note text NOT NULL,
 actor_id bigint NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS handover_notes(
 id bigserial PRIMARY KEY, title text NOT NULL, note text NOT NULL, resolved boolean NOT NULL DEFAULT false,
 actor_id bigint NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE documents ADD COLUMN IF NOT EXISTS retired_at timestamptz;
CREATE TABLE IF NOT EXISTS budget_weeks(week date PRIMARY KEY,total_limit bigint NOT NULL CHECK(total_limit>=0));
DROP TRIGGER IF EXISTS request_events_immutable ON request_events;
CREATE TRIGGER request_events_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON request_events FOR EACH STATEMENT EXECUTE FUNCTION prevent_audit_changes();
DROP TRIGGER IF EXISTS cash_entries_immutable ON cash_entries;
CREATE TRIGGER cash_entries_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON cash_entries FOR EACH STATEMENT EXECUTE FUNCTION prevent_audit_changes();
CREATE TABLE IF NOT EXISTS export_archives(
 storage_key text PRIMARY KEY CHECK(storage_key ~ '^[a-f0-9]{48}$'),
 user_id bigint NOT NULL REFERENCES users(id),
 expires_at timestamptz NOT NULL DEFAULT now()+interval '1 day',
 created_at timestamptz NOT NULL DEFAULT now()
);
-- The app uses its private server database connection, not anonymous PostgREST.
-- RLS and revoked grants prevent public Supabase keys reading app/password data.
DO $$
DECLARE tab text; role_name text; seq_name text;
BEGIN
 FOREACH tab IN ARRAY ARRAY['users','sessions','login_attempts','audit_events','policy','policy_history','approval_policies','rab_items','inventory','requests','request_items','documents','request_events','reviews','weekly_budgets','budget_weeks','budget_reservations','reallocations','cash_entries','disbursements','receipt_handoffs','lost_receipts','appeals','returns','sanctions','notifications','reconciliations','handover_notes','export_archives'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',tab);
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
   IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM %I',tab,role_name);
   END IF;
  END LOOP;
 END LOOP;
 FOR seq_name IN SELECT sequence_name FROM information_schema.sequences WHERE sequence_schema='public' LOOP
  IF seq_name='request_numbers' OR seq_name=ANY(ARRAY['users_id_seq','audit_events_id_seq','policy_history_id_seq','approval_policies_id_seq','rab_items_id_seq','inventory_id_seq','requests_id_seq','request_items_id_seq','documents_id_seq','request_events_id_seq','reviews_id_seq','reallocations_id_seq','cash_entries_id_seq','disbursements_id_seq','receipt_handoffs_id_seq','lost_receipts_id_seq','appeals_id_seq','returns_id_seq','sanctions_id_seq','notifications_id_seq','reconciliations_id_seq','handover_notes_id_seq']) THEN
   FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN EXECUTE format('REVOKE ALL PRIVILEGES ON SEQUENCE public.%I FROM %I',seq_name,role_name); END IF;
   END LOOP;
  END IF;
 END LOOP;
END $$;
