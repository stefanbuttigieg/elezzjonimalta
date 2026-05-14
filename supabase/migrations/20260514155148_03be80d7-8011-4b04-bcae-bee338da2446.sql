ALTER TABLE public.proposal_category_assignments
  ADD COLUMN IF NOT EXISTS assigned_by text NOT NULL DEFAULT 'human',
  ADD COLUMN IF NOT EXISTS ai_confidence text,
  ADD COLUMN IF NOT EXISTS ai_reason text,
  ADD COLUMN IF NOT EXISTS ai_model text,
  ADD COLUMN IF NOT EXISTS assigned_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.proposal_category_assignments
  DROP CONSTRAINT IF EXISTS proposal_category_assignments_assigned_by_chk;
ALTER TABLE public.proposal_category_assignments
  ADD CONSTRAINT proposal_category_assignments_assigned_by_chk
  CHECK (assigned_by IN ('ai','human'));

ALTER TABLE public.proposal_category_assignments
  DROP CONSTRAINT IF EXISTS proposal_category_assignments_ai_confidence_chk;
ALTER TABLE public.proposal_category_assignments
  ADD CONSTRAINT proposal_category_assignments_ai_confidence_chk
  CHECK (ai_confidence IS NULL OR ai_confidence IN ('high','medium','low'));

CREATE INDEX IF NOT EXISTS proposal_category_assignments_assigned_by_idx
  ON public.proposal_category_assignments(assigned_by);