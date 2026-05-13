
CREATE OR REPLACE VIEW public.candidate_experience_summary
WITH (security_invoker = on) AS
SELECT
  c.id AS candidate_id,
  -- Parliament
  COALESCE(pt.terms_count, 0) AS parliamentary_terms_count,
  pt.first_legislature,
  pt.last_legislature,
  COALESCE(pt.currently_sitting, false) AS currently_sitting,
  -- Cabinet / ministerial
  COALESCE(cp.cabinet_count, 0) AS cabinet_terms_count,
  cp.current_portfolio,
  cp.current_position_kind,
  COALESCE(cp.has_ever_been_minister, false) AS has_ever_been_minister,
  COALESCE(cp.has_ever_been_pm, false) AS has_ever_been_pm,
  COALESCE(cp.has_ever_been_mep, false) AS has_ever_been_mep,
  -- Local council
  COALESCE(lc.council_terms_count, 0) AS local_council_terms_count,
  COALESCE(lc.is_current_mayor, false) AS is_current_mayor,
  COALESCE(lc.is_current_councillor, false) AS is_current_councillor,
  lc.councils_served
FROM public.candidates c
LEFT JOIN (
  SELECT
    candidate_id,
    COUNT(*) AS terms_count,
    MIN(legislature_number) AS first_legislature,
    MAX(legislature_number) AS last_legislature,
    bool_or(end_date IS NULL OR end_date >= CURRENT_DATE) AS currently_sitting
  FROM public.parliament_terms
  GROUP BY candidate_id
) pt ON pt.candidate_id = c.id
LEFT JOIN (
  SELECT
    candidate_id,
    COUNT(*) FILTER (
      WHERE position_kind IN ('prime_minister','deputy_pm','minister','parliamentary_secretary','cabinet_member','shadow_minister')
    ) AS cabinet_count,
    (
      array_agg(portfolio ORDER BY is_current DESC, COALESCE(end_date, CURRENT_DATE) DESC)
      FILTER (WHERE is_current AND portfolio IS NOT NULL)
    )[1] AS current_portfolio,
    (
      array_agg(position_kind::text ORDER BY is_current DESC, COALESCE(end_date, CURRENT_DATE) DESC)
      FILTER (WHERE is_current)
    )[1] AS current_position_kind,
    bool_or(position_kind IN ('prime_minister','minister','parliamentary_secretary','cabinet_member')) AS has_ever_been_minister,
    bool_or(position_kind = 'prime_minister') AS has_ever_been_pm,
    bool_or(position_kind = 'mep') AS has_ever_been_mep
  FROM public.candidate_positions
  GROUP BY candidate_id
) cp ON cp.candidate_id = c.id
LEFT JOIN (
  SELECT
    candidate_id,
    COUNT(*) AS council_terms_count,
    bool_or(is_current AND role = 'mayor') AS is_current_mayor,
    bool_or(is_current) AS is_current_councillor,
    array_agg(DISTINCT council_name) AS councils_served
  FROM public.candidate_local_council_terms
  GROUP BY candidate_id
) lc ON lc.candidate_id = c.id;

GRANT SELECT ON public.candidate_experience_summary TO anon, authenticated;
