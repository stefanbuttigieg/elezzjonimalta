-- Add columns for attachments / social posts
ALTER TABLE public.proposal_sources
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'link',
  ADD COLUMN IF NOT EXISTS storage_path text,
  ADD COLUMN IF NOT EXISTS media_type text,
  ADD COLUMN IF NOT EXISTS file_size bigint;

ALTER TABLE public.proposal_sources
  DROP CONSTRAINT IF EXISTS proposal_sources_kind_check;
ALTER TABLE public.proposal_sources
  ADD CONSTRAINT proposal_sources_kind_check
  CHECK (kind IN ('link', 'attachment', 'social'));

-- Public storage bucket for proposal attachments
INSERT INTO storage.buckets (id, name, public)
VALUES ('proposal-attachments', 'proposal-attachments', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Public read access
DROP POLICY IF EXISTS "ProposalAttachments public read" ON storage.objects;
CREATE POLICY "ProposalAttachments public read"
ON storage.objects FOR SELECT
USING (bucket_id = 'proposal-attachments');

-- Staff can upload
DROP POLICY IF EXISTS "ProposalAttachments staff insert" ON storage.objects;
CREATE POLICY "ProposalAttachments staff insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'proposal-attachments' AND app_private.is_staff(auth.uid()));

-- Staff can update
DROP POLICY IF EXISTS "ProposalAttachments staff update" ON storage.objects;
CREATE POLICY "ProposalAttachments staff update"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'proposal-attachments' AND app_private.is_staff(auth.uid()));

-- Staff can delete
DROP POLICY IF EXISTS "ProposalAttachments staff delete" ON storage.objects;
CREATE POLICY "ProposalAttachments staff delete"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'proposal-attachments' AND app_private.is_staff(auth.uid()));