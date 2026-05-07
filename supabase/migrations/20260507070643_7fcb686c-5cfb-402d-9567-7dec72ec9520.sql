
CREATE TYPE public.resource_icon AS ENUM ('globe','landmark','barchart','newspaper','book','scale','users','flag','filetext','helpcircle','messages','map','network');

CREATE TABLE public.site_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  url text NOT NULL,
  host text NOT NULL,
  icon public.resource_icon NOT NULL DEFAULT 'globe',
  tag_en text NOT NULL DEFAULT '',
  tag_mt text NOT NULL DEFAULT '',
  title_en text NOT NULL,
  title_mt text NOT NULL DEFAULT '',
  description_en text NOT NULL DEFAULT '',
  description_mt text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  is_published boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_site_resources_updated
  BEFORE UPDATE ON public.site_resources
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.site_resources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "SiteResources public read published"
  ON public.site_resources FOR SELECT
  TO public
  USING (is_published = true);

CREATE POLICY "SiteResources staff read all"
  ON public.site_resources FOR SELECT
  TO authenticated
  USING (app_private.is_staff(auth.uid()));

CREATE POLICY "SiteResources staff insert"
  ON public.site_resources FOR INSERT
  TO authenticated
  WITH CHECK (app_private.is_staff(auth.uid()));

CREATE POLICY "SiteResources staff update"
  ON public.site_resources FOR UPDATE
  TO authenticated
  USING (app_private.is_staff(auth.uid()));

CREATE POLICY "SiteResources admin delete"
  ON public.site_resources FOR DELETE
  TO authenticated
  USING (app_private.has_role(auth.uid(), 'admin'::app_role));

INSERT INTO public.site_resources (slug,url,host,icon,tag_en,tag_mt,title_en,title_mt,description_en,description_mt,sort_order) VALUES
('vot-mt','https://vot.mt/','vot.mt','globe','Civic tool','Għodda ċivika',
 'vot.mt — Voter Advice Application','vot.mt — Għodda ta'' Pariri għall-Vot',
 'An independent voter advice tool that matches you with parties and candidates based on where you stand on key Maltese policy questions. Useful for exploring how your views align with each contestant before election day.',
 'Għodda indipendenti ta'' pariri għall-vot li tlaqqgħek mal-partiti u kandidati skont fejn tinsab fuq mistoqsijiet ewlenin tal-politika Maltija. Utli biex tesplora kif il-fehmiet tiegħek jaqblu ma'' kull kontestant qabel il-jum tal-elezzjoni.',
 10),
('electoral-gov-mt','https://electoral.gov.mt','electoral.gov.mt','landmark','Official','Uffiċjali',
 'Electoral Commission of Malta','Kummissjoni Elettorali ta'' Malta',
 'The official body responsible for running Maltese elections. Check your voter registration, find your polling place, download official candidate nomination lists, and read the rules and results published by the State.',
 'Il-korp uffiċjali responsabbli mill-elezzjonijiet f''Malta. Iċċekkja r-reġistrazzjoni tiegħek bħala votant, sib il-post tal-votazzjoni tiegħek, niżżel listi uffiċjali ta'' nominazzjoni tal-kandidati, u aqra r-regoli u r-riżultati ppubblikati mill-Istat.',
 20),
('maltaelections-io','https://maltaelections.io/','maltaelections.io','barchart','Data & history','Data u storja',
 'Malta Elections — historical results','Malta Elections — riżultati storiċi',
 'An open dataset and explorer of Maltese election results going back decades — district by district, party by party, count by count. Indispensable for understanding how districts have voted historically.',
 'Dataset miftuħ u explorer tar-riżultati elettorali Maltin li jmorru lura għexieren ta'' snin — distrett b''distrett, partit b''partit, għadd b''għadd. Indispensabbli biex tifhem kif ivvutaw id-distretti tul iż-żmien.',
 30),
('filqosor','https://filqosor.com/','filqosor.com','newspaper','News','Aħbarijiet',
 'Fil-Qosor — Malta news without the spin','Fil-Qosor — l-aħbarijiet ta'' Malta mingħajr spin',
 'An AI-powered news digest that reads every Maltese news outlet and summarises each story from every angle, with bias indicators. Useful for getting a balanced view of campaign coverage and political developments without wading through partisan reporting.',
 'Digest tal-aħbarijiet ibbażat fuq AI li jaqra kull mezz tal-aħbarijiet Malti u jiġbor fil-qosor kull storja minn kull angolu, b''indikaturi tal-preġudizzju. Utli biex tikseb stampa bilanċjata tal-kopertura tal-kampanja mingħajr ma tgħaddi minn rappurtaġġ partiġjan.',
 40),
('lovinmalta-elections','https://elections.lovinmalta.com/','elections.lovinmalta.com','newspaper','News','Aħbarijiet',
 'Lovin Malta — Elections 2026 hub','Lovin Malta — Hub Elezzjoni 2026',
 'Lovin Malta''s dedicated 2026 General Election hub, with rolling news, candidate profiles, opinion pieces, and analysis of the campaign as it unfolds.',
 'Il-hub ta'' Lovin Malta dedikat għall-Elezzjoni Ġenerali 2026, b''aħbarijiet kontinwi, profili tal-kandidati, opinjonijiet, u analiżi tal-kampanja hekk kif tiżvolġi.',
 50);
