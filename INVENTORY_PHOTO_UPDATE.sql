-- Campo usado pelo fluxo de inventário por fotos.
-- A migration já é idempotente e pode ser executada mais de uma vez.
ALTER TABLE public.tools
ADD COLUMN IF NOT EXISTS brand TEXT;
