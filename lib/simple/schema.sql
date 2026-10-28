CREATE TABLE IF NOT EXISTS simple_versions(version integer PRIMARY KEY,installed_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS cost_centers(id bigserial PRIMARY KEY,name text NOT NULL UNIQUE,budget bigint NOT NULL DEFAULT 0 CHECK(budget>=0),active boolean NOT NULL DEFAULT true);
INSERT INTO cost_centers(name) SELECT DISTINCT division FROM users WHERE division IS NOT NULL AND division<>'' ON CONFLICT DO NOTHING;
INSERT INTO cost_centers(name) SELECT DISTINCT division FROM requests ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS gl_accounts(code text PRIMARY KEY,name text NOT NULL,type text NOT NULL CHECK(type IN ('ASSET','LIABILITY','EQUITY','EXPENSE','INCOME')),active boolean NOT NULL DEFAULT true);
INSERT INTO gl_accounts(code,name,type) VALUES('1100','Kas / Bank Tim','ASSET'),('2100','Hutang Reimbursement / Vendor','LIABILITY'),('3100','Saldo Awal','EQUITY'),('4100','Penerimaan Dana Tim','INCOME'),('5100','Pengeluaran Operasional','EXPENSE'),('5200','Komponen dan Material','EXPENSE'),('5300','Administrasi dan Kegiatan','EXPENSE') ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS simple_requests(
 id bigserial PRIMARY KEY,demo_key text UNIQUE,number text NOT NULL UNIQUE,proposer_id bigint NOT NULL REFERENCES users(id),cost_center_id bigint NOT NULL REFERENCES cost_centers(id),
 title text NOT NULL,vendor text NOT NULL,purpose text NOT NULL,amount bigint NOT NULL CHECK(amount>=10000 AND amount<=100000000000),purchase_date date NOT NULL,due_date date NOT NULL,bank_details text NOT NULL,
 account_code text NOT NULL REFERENCES gl_accounts(code),status text NOT NULL DEFAULT 'Diajukan' CHECK(status IN ('Diajukan','Perlu Perbaikan','Diverifikasi','Disetujui','Dicairkan','Ditolak','Dibatalkan')),
 verifier_id bigint REFERENCES users(id),approver_id bigint REFERENCES users(id),note text NOT NULL DEFAULT '',approved_at timestamptz,paid_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(verifier_id IS NULL OR verifier_id<>proposer_id),CHECK(approver_id IS NULL OR (approver_id<>proposer_id AND approver_id<>verifier_id))
);
CREATE SEQUENCE IF NOT EXISTS simple_request_numbers;
CREATE TABLE IF NOT EXISTS simple_files(id bigserial PRIMARY KEY,request_id bigint NOT NULL REFERENCES simple_requests(id),uploaded_by bigint NOT NULL REFERENCES users(id),kind text NOT NULL CHECK(kind IN ('NOTA','TRANSFER')),name text NOT NULL,storage_key text NOT NULL UNIQUE,mime text NOT NULL,size integer NOT NULL,sha256 text NOT NULL,active boolean NOT NULL DEFAULT true,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS simple_files_hash ON simple_files(sha256);
CREATE TABLE IF NOT EXISTS simple_events(id bigserial PRIMARY KEY,request_id bigint REFERENCES simple_requests(id),actor_id bigint REFERENCES users(id),action text NOT NULL,note text NOT NULL DEFAULT '',details jsonb NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS simple_payments(id bigserial PRIMARY KEY,request_key text NOT NULL UNIQUE,request_id bigint NOT NULL REFERENCES simple_requests(id),actor_id bigint NOT NULL REFERENCES users(id),amount bigint NOT NULL CHECK(amount>0),reference text NOT NULL,file_id bigint NOT NULL UNIQUE REFERENCES simple_files(id),created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS journal_entries(id bigserial PRIMARY KEY,source_key text NOT NULL UNIQUE,request_id bigint REFERENCES simple_requests(id),actor_id bigint REFERENCES users(id),description text NOT NULL,reversal_of bigint UNIQUE REFERENCES journal_entries(id),created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS journal_lines(id bigserial PRIMARY KEY,entry_id bigint NOT NULL REFERENCES journal_entries(id),account_code text NOT NULL REFERENCES gl_accounts(code),cost_center_id bigint REFERENCES cost_centers(id),debit bigint NOT NULL DEFAULT 0,credit bigint NOT NULL DEFAULT 0,CHECK((debit>0 AND credit=0) OR (credit>0 AND debit=0)));
CREATE INDEX IF NOT EXISTS simple_requests_queue ON simple_requests(status,created_at);
CREATE INDEX IF NOT EXISTS simple_requests_owner ON simple_requests(proposer_id,created_at);
CREATE INDEX IF NOT EXISTS simple_requests_center ON simple_requests(cost_center_id,status);
CREATE INDEX IF NOT EXISTS journal_lines_entry ON journal_lines(entry_id);
CREATE INDEX IF NOT EXISTS simple_payments_request ON simple_payments(request_id);
CREATE OR REPLACE FUNCTION simple_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Riwayat yang dibukukan tidak dapat diubah'; END; $$;
CREATE OR REPLACE FUNCTION simple_check_journal() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE eid bigint; n bigint; dr numeric; cr numeric;
BEGIN
 IF TG_TABLE_NAME='journal_entries' THEN eid=NEW.id; ELSE eid=NEW.entry_id; END IF;
 SELECT count(*),COALESCE(sum(debit),0),COALESCE(sum(credit),0) INTO n,dr,cr FROM journal_lines WHERE entry_id=eid;
 IF n<2 OR dr<>cr THEN RAISE EXCEPTION 'Jurnal harus memiliki minimal dua baris dan debit sama dengan kredit'; END IF;
 RETURN NULL;
END; $$;
-- Baris baru hanya boleh ditambahkan dalam transaksi yang membuat header jurnal.
CREATE OR REPLACE FUNCTION simple_line_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM journal_entries WHERE id=NEW.entry_id AND xmin::text=pg_current_xact_id()::text) THEN RAISE EXCEPTION 'Jurnal sudah dibukukan'; END IF;
 RETURN NEW;
END; $$;
DO $$ DECLARE tab text; role_name text; seq text; BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='simple_journal_header_balance') THEN
 CREATE CONSTRAINT TRIGGER simple_journal_header_balance AFTER INSERT ON journal_entries DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION simple_check_journal();
 CREATE CONSTRAINT TRIGGER simple_journal_line_balance AFTER INSERT ON journal_lines DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION simple_check_journal();
 CREATE TRIGGER simple_journal_line_guard BEFORE INSERT ON journal_lines FOR EACH ROW EXECUTE FUNCTION simple_line_guard();
 END IF;
 FOREACH tab IN ARRAY ARRAY['journal_entries','journal_lines','simple_events','simple_payments'] LOOP
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname=tab||'_immutable') THEN
 EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE OR TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION simple_immutable()',tab||'_immutable',tab);
 END IF;
 END LOOP;
 FOREACH tab IN ARRAY ARRAY['simple_versions','cost_centers','gl_accounts','simple_requests','simple_files','simple_events','simple_payments','journal_entries','journal_lines'] LOOP
 EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',tab);
 FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
 EXECUTE format('REVOKE ALL ON TABLE %I FROM %I',tab,role_name);
 END IF;
 END LOOP;
 END LOOP;
 FOR seq IN SELECT sequencename FROM pg_sequences WHERE schemaname='public' AND sequencename IN ('simple_request_numbers','cost_centers_id_seq','simple_requests_id_seq','simple_files_id_seq','simple_events_id_seq','simple_payments_id_seq','journal_entries_id_seq','journal_lines_id_seq') LOOP
 FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN EXECUTE format('REVOKE ALL ON SEQUENCE %I FROM %I',seq,role_name); END IF;
 END LOOP;
 END LOOP;
END $$;
INSERT INTO simple_versions(version) VALUES(1) ON CONFLICT DO NOTHING;

-- Fence old deployments after cut-over, not only the new UI.
CREATE OR REPLACE FUNCTION simple_legacy_frozen() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM simple_versions WHERE version=2) THEN RAISE EXCEPTION 'Versi lama read-only. Gunakan aplikasi sederhana terbaru.'; END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END; $$;
DO $$ DECLARE tab text; BEGIN
 FOREACH tab IN ARRAY ARRAY['requests','request_items','documents','cash_entries','disbursements'] LOOP
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname=tab||'_legacy_frozen') THEN
 EXECUTE format('CREATE TRIGGER %I BEFORE INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION simple_legacy_frozen()',tab||'_legacy_frozen',tab);
 END IF;
 END LOOP;
END $$;

INSERT INTO simple_versions(version) VALUES(3) ON CONFLICT DO NOTHING;
