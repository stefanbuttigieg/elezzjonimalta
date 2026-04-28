INSERT INTO storage.buckets (id, name, public) VALUES ('party-assets', 'party-assets', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "PartyAssets public read" ON storage.objects FOR SELECT USING (bucket_id = 'party-assets');
CREATE POLICY "PartyAssets staff write" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'party-assets' AND public.is_staff(auth.uid()));
CREATE POLICY "PartyAssets staff update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'party-assets' AND public.is_staff(auth.uid()));
CREATE POLICY "PartyAssets staff delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'party-assets' AND public.is_staff(auth.uid()));