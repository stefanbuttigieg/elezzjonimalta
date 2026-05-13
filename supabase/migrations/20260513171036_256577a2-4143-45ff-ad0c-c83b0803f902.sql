
-- Profession buckets (curated short list)
CREATE TABLE public.profession_buckets (
  slug text PRIMARY KEY,
  label_en text NOT NULL,
  label_mt text,
  icon text,
  description_en text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profession_buckets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ProfessionBuckets public read" ON public.profession_buckets
  FOR SELECT TO public USING (true);
CREATE POLICY "ProfessionBuckets staff insert" ON public.profession_buckets
  FOR INSERT TO authenticated WITH CHECK (app_private.is_staff(auth.uid()));
CREATE POLICY "ProfessionBuckets staff update" ON public.profession_buckets
  FOR UPDATE TO authenticated USING (app_private.is_staff(auth.uid()));
CREATE POLICY "ProfessionBuckets admin delete" ON public.profession_buckets
  FOR DELETE TO authenticated USING (app_private.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_profession_buckets_updated_at
  BEFORE UPDATE ON public.profession_buckets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ISCO-08 codes (curated subset)
CREATE TABLE public.profession_codes (
  code text PRIMARY KEY,
  title_en text NOT NULL,
  title_mt text,
  bucket text REFERENCES public.profession_buckets(slug) ON UPDATE CASCADE ON DELETE SET NULL,
  major_group text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_profession_codes_bucket ON public.profession_codes(bucket);

ALTER TABLE public.profession_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ProfessionCodes public read" ON public.profession_codes
  FOR SELECT TO public USING (true);
CREATE POLICY "ProfessionCodes staff insert" ON public.profession_codes
  FOR INSERT TO authenticated WITH CHECK (app_private.is_staff(auth.uid()));
CREATE POLICY "ProfessionCodes staff update" ON public.profession_codes
  FOR UPDATE TO authenticated USING (app_private.is_staff(auth.uid()));
CREATE POLICY "ProfessionCodes admin delete" ON public.profession_codes
  FOR DELETE TO authenticated USING (app_private.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_profession_codes_updated_at
  BEFORE UPDATE ON public.profession_codes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Add profession columns to candidates
ALTER TABLE public.candidates
  ADD COLUMN profession_code text REFERENCES public.profession_codes(code) ON UPDATE CASCADE ON DELETE SET NULL,
  ADD COLUMN profession_bucket text REFERENCES public.profession_buckets(slug) ON UPDATE CASCADE ON DELETE SET NULL;

CREATE INDEX idx_candidates_profession_bucket ON public.candidates(profession_bucket);
CREATE INDEX idx_candidates_profession_code ON public.candidates(profession_code);

-- Seed buckets (~40 Malta-tailored)
INSERT INTO public.profession_buckets (slug, label_en, label_mt, icon, sort_order) VALUES
  ('lawyer', 'Lawyer', 'Avukat', 'scale', 10),
  ('notary', 'Notary', 'Nutar', 'file-signature', 11),
  ('legal_other', 'Legal professional (other)', 'Professjonist legali', 'gavel', 12),
  ('doctor', 'Medical doctor', 'Tabib', 'stethoscope', 20),
  ('dentist', 'Dentist', 'Dentist', 'tooth', 21),
  ('pharmacist', 'Pharmacist', 'Spiżjar', 'pill', 22),
  ('nurse', 'Nurse / midwife', 'Infermier', 'heart-pulse', 23),
  ('health_other', 'Health professional (other)', 'Professjonist tas-saħħa', 'activity', 24),
  ('educator_secondary', 'Teacher (primary/secondary)', 'Għalliem', 'graduation-cap', 30),
  ('academic', 'Academic / university lecturer', 'Akkademiku', 'book-open', 31),
  ('researcher', 'Researcher', 'Riċerkatur', 'microscope', 32),
  ('engineer', 'Engineer', 'Inġinier', 'cog', 40),
  ('architect', 'Architect / planner', 'Perit', 'compass', 41),
  ('it_professional', 'IT / software professional', 'Professjonist tal-IT', 'laptop', 42),
  ('scientist', 'Scientist', 'Xjenzat', 'flask', 43),
  ('accountant', 'Accountant / auditor', 'Accountant', 'calculator', 50),
  ('finance_professional', 'Banker / finance professional', 'Bankier', 'banknote', 51),
  ('economist', 'Economist', 'Ekonomista', 'trending-up', 52),
  ('entrepreneur', 'Entrepreneur / business owner', 'Intraprenditur', 'briefcase', 60),
  ('manager_executive', 'Manager / executive', 'Manager', 'building', 61),
  ('consultant', 'Consultant', 'Konsulent', 'lightbulb', 62),
  ('marketing_pr', 'Marketing / PR / communications', 'Marketing', 'megaphone', 63),
  ('journalist', 'Journalist', 'Ġurnalist', 'newspaper', 70),
  ('writer_artist', 'Writer / artist / creative', 'Artist', 'palette', 71),
  ('broadcaster', 'Broadcaster / media presenter', 'Preżentatur', 'mic', 72),
  ('civil_servant', 'Civil servant / public official', 'Uffiċjal pubbliku', 'landmark', 80),
  ('diplomat', 'Diplomat', 'Diplomatiku', 'globe', 81),
  ('military_police', 'Military / police officer', 'Suldat / Pulizija', 'shield', 82),
  ('local_govt', 'Local government official', 'Uffiċjal ta'' kunsill lokali', 'map-pin', 83),
  ('trade_unionist', 'Trade unionist', 'Trejdjunjonist', 'users', 90),
  ('ngo_civil_society', 'NGO / civil society leader', 'Soċjetà ċivili', 'hand-helping', 91),
  ('clergy', 'Clergy / religious leader', 'Saċerdot', 'church', 92),
  ('farmer_fisher', 'Farmer / fisherman', 'Bidwi / Sajjied', 'sprout', 100),
  ('skilled_trades', 'Skilled trades / craftsman', 'Sengħa', 'wrench', 101),
  ('hospitality', 'Hospitality / catering', 'Ospitalità', 'utensils', 102),
  ('transport', 'Transport / logistics worker', 'Trasport', 'truck', 103),
  ('retail_sales', 'Retail / sales worker', 'Bejjiegħ', 'shopping-bag', 104),
  ('sportsperson', 'Athlete / sports professional', 'Atleta', 'trophy', 110),
  ('student', 'Student', 'Student', 'book', 120),
  ('retired', 'Retired', 'Pensjonant', 'armchair', 121),
  ('homemaker', 'Homemaker', 'Mara tad-dar', 'home', 122),
  ('career_politician', 'Career politician', 'Politiku', 'vote', 130),
  ('other', 'Other / unspecified', 'Oħra', 'help-circle', 999);

-- Seed ISCO-08 codes (curated subset commonly appearing in Maltese politics)
INSERT INTO public.profession_codes (code, title_en, bucket, major_group) VALUES
  -- Major group 1 — Managers
  ('1111', 'Legislators', 'career_politician', '1'),
  ('1112', 'Senior government officials', 'civil_servant', '1'),
  ('1114', 'Senior officials of special-interest organisations', 'ngo_civil_society', '1'),
  ('1120', 'Managing directors and chief executives', 'manager_executive', '1'),
  ('1211', 'Finance managers', 'finance_professional', '1'),
  ('1212', 'Human resource managers', 'manager_executive', '1'),
  ('1213', 'Policy and planning managers', 'civil_servant', '1'),
  ('1219', 'Business services and administration managers nec', 'manager_executive', '1'),
  ('1221', 'Sales and marketing managers', 'marketing_pr', '1'),
  ('1222', 'Advertising and public relations managers', 'marketing_pr', '1'),
  ('1321', 'Manufacturing managers', 'manager_executive', '1'),
  ('1330', 'Information and communications technology service managers', 'it_professional', '1'),
  ('1341', 'Child care services managers', 'manager_executive', '1'),
  ('1342', 'Health services managers', 'health_other', '1'),
  ('1345', 'Education managers', 'educator_secondary', '1'),
  ('1346', 'Financial and insurance services branch managers', 'finance_professional', '1'),
  ('1411', 'Hotel managers', 'hospitality', '1'),
  ('1412', 'Restaurant managers', 'hospitality', '1'),
  ('1431', 'Sports, recreation and cultural centre managers', 'sportsperson', '1'),
  -- Major group 2 — Professionals
  ('2111', 'Physicists and astronomers', 'scientist', '2'),
  ('2113', 'Chemists', 'scientist', '2'),
  ('2120', 'Mathematicians, actuaries and statisticians', 'scientist', '2'),
  ('2131', 'Biologists, botanists, zoologists and related professionals', 'scientist', '2'),
  ('2141', 'Industrial and production engineers', 'engineer', '2'),
  ('2142', 'Civil engineers', 'engineer', '2'),
  ('2143', 'Environmental engineers', 'engineer', '2'),
  ('2144', 'Mechanical engineers', 'engineer', '2'),
  ('2145', 'Chemical engineers', 'engineer', '2'),
  ('2146', 'Mining engineers, metallurgists and related professionals', 'engineer', '2'),
  ('2149', 'Engineering professionals nec', 'engineer', '2'),
  ('2151', 'Electrical engineers', 'engineer', '2'),
  ('2152', 'Electronics engineers', 'engineer', '2'),
  ('2153', 'Telecommunications engineers', 'engineer', '2'),
  ('2161', 'Building architects', 'architect', '2'),
  ('2162', 'Landscape architects', 'architect', '2'),
  ('2164', 'Town and traffic planners', 'architect', '2'),
  ('2165', 'Cartographers and surveyors', 'architect', '2'),
  ('2166', 'Graphic and multimedia designers', 'writer_artist', '2'),
  ('2211', 'Generalist medical practitioners', 'doctor', '2'),
  ('2212', 'Specialist medical practitioners', 'doctor', '2'),
  ('2221', 'Nursing professionals', 'nurse', '2'),
  ('2222', 'Midwifery professionals', 'nurse', '2'),
  ('2230', 'Traditional and complementary medicine professionals', 'health_other', '2'),
  ('2240', 'Paramedical practitioners', 'health_other', '2'),
  ('2250', 'Veterinarians', 'health_other', '2'),
  ('2261', 'Dentists', 'dentist', '2'),
  ('2262', 'Pharmacists', 'pharmacist', '2'),
  ('2263', 'Environmental and occupational health professionals', 'health_other', '2'),
  ('2264', 'Physiotherapists', 'health_other', '2'),
  ('2265', 'Dieticians and nutritionists', 'health_other', '2'),
  ('2266', 'Audiologists and speech therapists', 'health_other', '2'),
  ('2267', 'Optometrists and ophthalmic opticians', 'health_other', '2'),
  ('2269', 'Health professionals nec', 'health_other', '2'),
  ('2310', 'University and higher education teachers', 'academic', '2'),
  ('2320', 'Vocational education teachers', 'educator_secondary', '2'),
  ('2330', 'Secondary education teachers', 'educator_secondary', '2'),
  ('2341', 'Primary school teachers', 'educator_secondary', '2'),
  ('2342', 'Early childhood educators', 'educator_secondary', '2'),
  ('2351', 'Education methods specialists', 'educator_secondary', '2'),
  ('2352', 'Special needs teachers', 'educator_secondary', '2'),
  ('2353', 'Other language teachers', 'educator_secondary', '2'),
  ('2354', 'Other music teachers', 'educator_secondary', '2'),
  ('2355', 'Other arts teachers', 'educator_secondary', '2'),
  ('2356', 'Information technology trainers', 'it_professional', '2'),
  ('2359', 'Teaching professionals nec', 'educator_secondary', '2'),
  ('2411', 'Accountants', 'accountant', '2'),
  ('2412', 'Financial and investment advisers', 'finance_professional', '2'),
  ('2413', 'Financial analysts', 'finance_professional', '2'),
  ('2421', 'Management and organisation analysts', 'consultant', '2'),
  ('2422', 'Policy administration professionals', 'civil_servant', '2'),
  ('2423', 'Personnel and careers professionals', 'manager_executive', '2'),
  ('2424', 'Training and staff development professionals', 'consultant', '2'),
  ('2431', 'Advertising and marketing professionals', 'marketing_pr', '2'),
  ('2432', 'Public relations professionals', 'marketing_pr', '2'),
  ('2433', 'Technical and medical sales professionals', 'retail_sales', '2'),
  ('2434', 'Information and communications technology sales professionals', 'it_professional', '2'),
  ('2511', 'Systems analysts', 'it_professional', '2'),
  ('2512', 'Software developers', 'it_professional', '2'),
  ('2513', 'Web and multimedia developers', 'it_professional', '2'),
  ('2514', 'Applications programmers', 'it_professional', '2'),
  ('2519', 'Software and applications developers and analysts nec', 'it_professional', '2'),
  ('2521', 'Database designers and administrators', 'it_professional', '2'),
  ('2522', 'Systems administrators', 'it_professional', '2'),
  ('2523', 'Computer network professionals', 'it_professional', '2'),
  ('2611', 'Lawyers', 'lawyer', '2'),
  ('2612', 'Judges', 'legal_other', '2'),
  ('2619', 'Legal professionals nec', 'legal_other', '2'),
  ('2621', 'Archivists and curators', 'writer_artist', '2'),
  ('2622', 'Librarians and related information professionals', 'writer_artist', '2'),
  ('2631', 'Economists', 'economist', '2'),
  ('2632', 'Sociologists, anthropologists and related professionals', 'academic', '2'),
  ('2633', 'Philosophers, historians and political scientists', 'academic', '2'),
  ('2634', 'Psychologists', 'health_other', '2'),
  ('2635', 'Social work and counselling professionals', 'ngo_civil_society', '2'),
  ('2636', 'Religious professionals', 'clergy', '2'),
  ('2641', 'Authors and related writers', 'writer_artist', '2'),
  ('2642', 'Journalists', 'journalist', '2'),
  ('2643', 'Translators, interpreters and other linguists', 'writer_artist', '2'),
  ('2651', 'Visual artists', 'writer_artist', '2'),
  ('2652', 'Musicians, singers and composers', 'writer_artist', '2'),
  ('2653', 'Dancers and choreographers', 'writer_artist', '2'),
  ('2654', 'Film, stage and related directors and producers', 'writer_artist', '2'),
  ('2655', 'Actors', 'writer_artist', '2'),
  ('2656', 'Announcers on radio, television and other media', 'broadcaster', '2'),
  ('2659', 'Creative and performing artists nec', 'writer_artist', '2'),
  -- Major group 3 — Technicians and associate professionals
  ('3142', 'Agricultural technicians', 'farmer_fisher', '3'),
  ('3221', 'Nursing associate professionals', 'nurse', '3'),
  ('3251', 'Dental assistants and therapists', 'dentist', '3'),
  ('3253', 'Community health workers', 'health_other', '3'),
  ('3322', 'Commercial sales representatives', 'retail_sales', '3'),
  ('3343', 'Administrative and executive secretaries', 'manager_executive', '3'),
  ('3411', 'Legal and related associate professionals', 'legal_other', '3'),
  ('3412', 'Social work associate professionals', 'ngo_civil_society', '3'),
  ('3413', 'Religious associate professionals', 'clergy', '3'),
  ('3421', 'Athletes and sports players', 'sportsperson', '3'),
  ('3422', 'Sports coaches, instructors and officials', 'sportsperson', '3'),
  ('3431', 'Photographers', 'writer_artist', '3'),
  ('3432', 'Interior designers and decorators', 'writer_artist', '3'),
  ('3435', 'Other artistic and cultural associate professionals', 'writer_artist', '3'),
  -- Major group 5 — Service and sales workers
  ('5120', 'Cooks', 'hospitality', '5'),
  ('5131', 'Waiters', 'hospitality', '5'),
  ('5132', 'Bartenders', 'hospitality', '5'),
  ('5223', 'Shop sales assistants', 'retail_sales', '5'),
  -- Major group 6 — Skilled agricultural, forestry and fishery workers
  ('6111', 'Field crop and vegetable growers', 'farmer_fisher', '6'),
  ('6113', 'Gardeners, horticultural and nursery growers', 'farmer_fisher', '6'),
  ('6121', 'Livestock and dairy producers', 'farmer_fisher', '6'),
  ('6222', 'Inland and coastal waters fishery workers', 'farmer_fisher', '6'),
  -- Major group 7 — Craft and related trades workers
  ('7112', 'Bricklayers and related workers', 'skilled_trades', '7'),
  ('7115', 'Carpenters and joiners', 'skilled_trades', '7'),
  ('7126', 'Plumbers and pipe fitters', 'skilled_trades', '7'),
  ('7411', 'Building and related electricians', 'skilled_trades', '7'),
  ('7412', 'Electrical mechanics and fitters', 'skilled_trades', '7'),
  -- Major group 8 — Plant and machine operators, assemblers
  ('8322', 'Car, taxi and van drivers', 'transport', '8'),
  ('8331', 'Bus and tram drivers', 'transport', '8'),
  ('8332', 'Heavy truck and lorry drivers', 'transport', '8'),
  -- Armed forces
  ('0110', 'Commissioned armed forces officers', 'military_police', '0'),
  ('0210', 'Non-commissioned armed forces officers', 'military_police', '0');
