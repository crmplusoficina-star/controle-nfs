-- SQL Script to update the unique constraint on the tools table
-- This allows the same tool code to exist in multiple branches,
-- but ensures it cannot be duplicated within the *same* branch.

ALTER TABLE tools DROP CONSTRAINT IF EXISTS tools_code_key;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tools_code_branch_key') THEN
        ALTER TABLE tools ADD CONSTRAINT tools_code_branch_key UNIQUE (code, branch_id);
    END IF;
END $$;

-- Fix for the "column cautelia_reports.responsible_name does not exist" error
-- This attempts to add the column if it's really missing from the reports table/view
ALTER TABLE IF EXISTS cautelia_reports ADD COLUMN IF NOT EXISTS responsible_name TEXT;
