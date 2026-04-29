
-- Audit log
CREATE TABLE public.admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_id uuid,
  action text NOT NULL,
  actor_id uuid,
  actor_email text,
  note text,
  before jsonb,
  after jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_entity ON public.admin_audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_created ON public.admin_audit_log(created_at DESC);
CREATE INDEX idx_audit_actor ON public.admin_audit_log(actor_id);
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "AuditLog staff read" ON public.admin_audit_log FOR SELECT TO authenticated USING (app_private.is_staff(auth.uid()));
CREATE POLICY "AuditLog staff insert" ON public.admin_audit_log FOR INSERT TO authenticated WITH CHECK (app_private.is_staff(auth.uid()));
CREATE POLICY "AuditLog admin delete" ON public.admin_audit_log FOR DELETE TO authenticated USING (app_private.has_role(auth.uid(),'admin'));

-- Alert acknowledgement
ALTER TABLE public.news_findings ADD COLUMN alert_seen_at timestamptz;
CREATE INDEX idx_news_findings_alert ON public.news_findings(alert_seen_at) WHERE alert_seen_at IS NULL;
