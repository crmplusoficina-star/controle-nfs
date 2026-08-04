-- Update nfs table to support multiple boletos and delivery invoice tracking
ALTER TABLE nfs ADD COLUMN IF NOT EXISTS boleto_urls text[] DEFAULT '{}';
ALTER TABLE nfs ADD COLUMN IF NOT EXISTS delivery_invoice_url text;
ALTER TABLE nfs ADD COLUMN IF NOT EXISTS delivery_invoice_number text;
ALTER TABLE nfs ADD COLUMN IF NOT EXISTS is_volvo boolean DEFAULT false;
ALTER TABLE nfs ADD COLUMN IF NOT EXISTS tool_name text;
ALTER TABLE nfs ADD COLUMN IF NOT EXISTS tool_code text;
ALTER TABLE nfs ADD COLUMN IF NOT EXISTS quantity integer DEFAULT 1;
ALTER TABLE nfs ADD COLUMN IF NOT EXISTS group_id uuid;
ALTER TABLE nfs ADD COLUMN IF NOT EXISTS inventory_synced boolean DEFAULT false;

-- The ticket_number column already exists from initial setup.
-- We no longer need line_number as per user request.
