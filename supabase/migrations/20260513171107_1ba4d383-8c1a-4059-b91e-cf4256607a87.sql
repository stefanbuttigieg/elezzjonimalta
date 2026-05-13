
CREATE TYPE public.position_kind AS ENUM (
  'prime_minister',
  'deputy_pm',
  'minister',
  'parliamentary_secretary',
  'cabinet_member',
  'opposition_leader',
  'shadow_minister',
  'speaker',
  'deputy_speaker',
  'whip',
  'committee_chair',
  'committee_member',
  'mep',
  'other'
);

ALTER TABLE public.candidate_positions
  ADD COLUMN position_kind public.position_kind NOT NULL DEFAULT 'other',
  ADD COLUMN portfolio text;

CREATE INDEX idx_candidate_positions_kind ON public.candidate_positions(position_kind);
