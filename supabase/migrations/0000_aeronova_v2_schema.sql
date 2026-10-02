
CREATE TYPE public.chantier_statut AS ENUM ('brouillon','en_cours','soumis','gagne','perdu');
CREATE TYPE public.ligne_statut AS ENUM ('non_rempli','suggestion_ia','verifie');
CREATE TYPE public.disponibilite AS ENUM ('en_stock','sur_commande','rupture');
CREATE TYPE public.offre_statut AS ENUM ('brouillon','verifie');
CREATE TYPE public.staging_action AS ENUM ('nouveau_produit','nouvelle_offre','maj_prix','inchange');
CREATE TYPE public.staging_statut AS ENUM ('en_attente','approuve','rejete');
CREATE TYPE public.remise_type AS ENUM ('pct','montant');
CREATE TYPE public.confiance AS ENUM ('high','medium','low','none');

-- Granular per-user permissions instead of fixed roles. is_admin bypasses every
-- check. Every other column is an independent on/off switch the admin sets per
-- person in /admin — a user can hold any combination (e.g. catalogue_write +
-- bids_export but nothing else).
CREATE TABLE public.user_permissions (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  is_admin boolean NOT NULL DEFAULT false,
  catalogue_write boolean NOT NULL DEFAULT false,      -- edit produits/fournisseur_produits/categories, submit imports
  catalogue_approve boolean NOT NULL DEFAULT false,    -- approve staged catalogue imports into the live catalogue
  fournisseurs_write boolean NOT NULL DEFAULT false,   -- edit the fournisseurs table
  bids_write boolean NOT NULL DEFAULT false,           -- edit chantiers/marches/lignes, run/accept matching
  bids_export boolean NOT NULL DEFAULT false,          -- export a bid to Excel/PDF
  view_purchase_prices boolean NOT NULL DEFAULT false, -- see prix_achat/marge (app-layer gate, not RLS)
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_permissions TO authenticated;
GRANT ALL ON public.user_permissions TO service_role;
ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;

-- True for anyone with an account row at all (created automatically on first
-- login by bootstrap_user below) — gates read access, same as the old "any role".
CREATE OR REPLACE FUNCTION public.is_active(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_permissions WHERE user_id = _user_id)
$$;
CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT is_admin FROM public.user_permissions WHERE user_id = _user_id), false)
$$;
-- Generic check: admin always passes; otherwise looks up the named boolean column.
CREATE OR REPLACE FUNCTION public.has_perm(_user_id uuid, _perm text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.user_permissions;
BEGIN
  SELECT * INTO r FROM public.user_permissions WHERE user_id = _user_id;
  IF r IS NULL THEN RETURN false; END IF;
  IF r.is_admin THEN RETURN true; END IF;
  RETURN CASE _perm
    WHEN 'catalogue_write' THEN r.catalogue_write
    WHEN 'catalogue_approve' THEN r.catalogue_approve
    WHEN 'fournisseurs_write' THEN r.fournisseurs_write
    WHEN 'bids_write' THEN r.bids_write
    WHEN 'bids_export' THEN r.bids_export
    WHEN 'view_purchase_prices' THEN r.view_purchase_prices
    ELSE false
  END;
END $$;

CREATE POLICY "perms: read own or admin" ON public.user_permissions FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin(auth.uid()));
CREATE POLICY "perms: admin insert" ON public.user_permissions FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "perms: admin update" ON public.user_permissions FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()));
CREATE POLICY "perms: admin delete" ON public.user_permissions FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  nom text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles: read" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_active(auth.uid()));
CREATE POLICY "profiles: update own" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid());

-- Creates the profile row and, for a brand-new user, a permissions row: the
-- very first user to ever sign in becomes admin automatically; everyone after
-- that gets a row with every flag off until an admin turns some on in /admin.
CREATE OR REPLACE FUNCTION public.bootstrap_user()
RETURNS public.user_permissions LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); em text; result public.user_permissions;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT email INTO em FROM auth.users WHERE id = uid;
  INSERT INTO public.profiles(id, email, nom) VALUES (uid, em, split_part(em,'@',1)) ON CONFLICT (id) DO NOTHING;
  IF NOT EXISTS (SELECT 1 FROM public.user_permissions WHERE user_id = uid) THEN
    INSERT INTO public.user_permissions(user_id, is_admin)
      VALUES (uid, NOT EXISTS (SELECT 1 FROM public.user_permissions));
  END IF;
  SELECT * INTO result FROM public.user_permissions WHERE user_id = uid;
  RETURN result;
END $$;
GRANT EXECUTE ON FUNCTION public.bootstrap_user() TO authenticated;

CREATE TABLE public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nom text NOT NULL,
  parent_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  slug text NOT NULL UNIQUE,
  ordre int NOT NULL DEFAULT 0,
  attribute_schema jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.fournisseurs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nom text NOT NULL,
  matricule_fiscal text, contact text, telephone text, email text, adresse text,
  conditions_paiement text, delai_paiement_jours int,
  note_fiabilite int CHECK (note_fiabilite BETWEEN 1 AND 5),
  actif boolean NOT NULL DEFAULT true,
  logo_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.produits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  designation text NOT NULL,
  category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  unite_reference text NOT NULL DEFAULT 'U',
  marque text, reference_constructeur text, description text,
  specs jsonb NOT NULL DEFAULT '{}'::jsonb,
  images text[] NOT NULL DEFAULT '{}',
  fiche_technique_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);
CREATE INDEX ON public.produits(category_id);

CREATE TABLE public.fournisseur_produits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  produit_id uuid NOT NULL REFERENCES public.produits(id) ON DELETE CASCADE,
  fournisseur_id uuid NOT NULL REFERENCES public.fournisseurs(id) ON DELETE CASCADE,
  reference_fournisseur text,
  prix_fourniture numeric(14,3) NOT NULL CHECK (prix_fourniture >= 0),
  devise text NOT NULL DEFAULT 'DT',
  delai_livraison_jours int,
  quantite_min_commande numeric(12,3),
  conditionnement text,
  paliers_remise jsonb,
  disponibilite public.disponibilite NOT NULL DEFAULT 'en_stock',
  statut public.offre_statut NOT NULL DEFAULT 'verifie',
  date_maj timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (produit_id, fournisseur_id)
);
CREATE INDEX ON public.fournisseur_produits(fournisseur_id);

CREATE TABLE public.fournisseur_produits_historique_prix (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fournisseur_produit_id uuid NOT NULL REFERENCES public.fournisseur_produits(id) ON DELETE CASCADE,
  prix_fourniture numeric(14,3) NOT NULL,
  date_effective timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);
CREATE INDEX ON public.fournisseur_produits_historique_prix(fournisseur_produit_id, date_effective DESC);

CREATE OR REPLACE FUNCTION public.track_prix_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.prix_fourniture IS DISTINCT FROM OLD.prix_fourniture THEN
    INSERT INTO public.fournisseur_produits_historique_prix(fournisseur_produit_id, prix_fourniture, created_by)
    VALUES (NEW.id, NEW.prix_fourniture, auth.uid());
  END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.touch_date_maj()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.prix_fourniture IS DISTINCT FROM OLD.prix_fourniture THEN NEW.date_maj := now(); END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER fp_touch BEFORE UPDATE ON public.fournisseur_produits FOR EACH ROW EXECUTE FUNCTION public.touch_date_maj();
CREATE TRIGGER fp_history AFTER INSERT OR UPDATE ON public.fournisseur_produits FOR EACH ROW EXECUTE FUNCTION public.track_prix_change();

CREATE TABLE public.catalogue_staging (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL,
  fournisseur_id uuid NOT NULL REFERENCES public.fournisseurs(id) ON DELETE CASCADE,
  raw_designation text NOT NULL,
  raw_reference text,
  unite text,
  prix_fourniture numeric(14,3) NOT NULL,
  delai_livraison_jours int,
  action public.staging_action NOT NULL,
  matched_produit_id uuid REFERENCES public.produits(id) ON DELETE SET NULL,
  matched_offre_id uuid REFERENCES public.fournisseur_produits(id) ON DELETE SET NULL,
  ancien_prix numeric(14,3),
  score numeric,
  category_guess uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  specs_guess jsonb NOT NULL DEFAULT '{}'::jsonb,
  statut public.staging_statut NOT NULL DEFAULT 'en_attente',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.chantiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nom text NOT NULL,
  client text,
  reference_ao text,
  date_limite date,
  statut public.chantier_statut NOT NULL DEFAULT 'brouillon',
  tva_taux numeric(5,2) NOT NULL DEFAULT 19 CHECK (tva_taux IN (0,7,13,19)),
  timbre_fiscal numeric(10,3) NOT NULL DEFAULT 1.000,
  remise_globale_type public.remise_type NOT NULL DEFAULT 'pct',
  remise_globale_valeur numeric(14,3) NOT NULL DEFAULT 0,
  marge_defaut_pct numeric(6,2) NOT NULL DEFAULT 20,
  soumis_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

CREATE TABLE public.marches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chantier_id uuid NOT NULL REFERENCES public.chantiers(id) ON DELETE CASCADE,
  nom text NOT NULL,
  ordre int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.marche_chapitres (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  marche_id uuid NOT NULL REFERENCES public.marches(id) ON DELETE CASCADE,
  code text NOT NULL,
  titre text,
  ordre int NOT NULL DEFAULT 0,
  remise_type public.remise_type NOT NULL DEFAULT 'pct',
  remise_valeur numeric(14,3) NOT NULL DEFAULT 0
);

CREATE TABLE public.marche_lignes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  marche_id uuid NOT NULL REFERENCES public.marches(id) ON DELETE CASCADE,
  chapitre_id uuid REFERENCES public.marche_chapitres(id) ON DELETE SET NULL,
  numero text,
  designation text NOT NULL,
  quantite numeric(14,3) NOT NULL DEFAULT 0,
  unite text,
  ordre int NOT NULL DEFAULT 0,
  statut public.ligne_statut NOT NULL DEFAULT 'non_rempli',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.marche_lignes(marche_id, ordre);

CREATE TABLE public.bid_lignes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  marche_ligne_id uuid NOT NULL UNIQUE REFERENCES public.marche_lignes(id) ON DELETE CASCADE,
  fournisseur_produit_id uuid REFERENCES public.fournisseur_produits(id) ON DELETE SET NULL,
  prix_achat numeric(14,3),
  marge_pct numeric(6,2),
  prix_unitaire numeric(14,3),
  source text NOT NULL DEFAULT 'ia',
  confiance public.confiance,
  justification text,
  candidats jsonb NOT NULL DEFAULT '[]'::jsonb,
  verified_by uuid,
  verified_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  action text NOT NULL,
  entity text,
  entity_id uuid,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

DO $$
DECLARE t text; write_perm text;
BEGIN
  FOREACH t IN ARRAY ARRAY['categories','fournisseurs','produits','fournisseur_produits','catalogue_staging',
    'chantiers','marches','marche_chapitres','marche_lignes','bid_lignes'] LOOP
    write_perm := CASE
      WHEN t = 'fournisseurs' THEN 'fournisseurs_write'
      WHEN t IN ('chantiers','marches','marche_chapitres','marche_lignes','bid_lignes') THEN 'bids_write'
      ELSE 'catalogue_write' -- categories, produits, fournisseur_produits, catalogue_staging
    END;
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY "read: active users" ON public.%I FOR SELECT TO authenticated USING (public.is_active(auth.uid()))', t);
    EXECUTE format('CREATE POLICY "insert: permitted" ON public.%I FOR INSERT TO authenticated WITH CHECK (public.has_perm(auth.uid(), %L))', t, write_perm);
    EXECUTE format('CREATE POLICY "update: permitted" ON public.%I FOR UPDATE TO authenticated USING (public.has_perm(auth.uid(), %L))', t, write_perm);
    EXECUTE format('CREATE POLICY "delete: permitted" ON public.%I FOR DELETE TO authenticated USING (public.has_perm(auth.uid(), %L))', t, write_perm);
  END LOOP;
END $$;

GRANT SELECT ON public.fournisseur_produits_historique_prix TO authenticated;
GRANT ALL ON public.fournisseur_produits_historique_prix TO service_role;
ALTER TABLE public.fournisseur_produits_historique_prix ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hist: read" ON public.fournisseur_produits_historique_prix FOR SELECT TO authenticated USING (public.is_active(auth.uid()));

GRANT SELECT, INSERT ON public.activity_log TO authenticated;
GRANT ALL ON public.activity_log TO service_role;
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "log: read" ON public.activity_log FOR SELECT TO authenticated USING (public.is_active(auth.uid()));
CREATE POLICY "log: insert own" ON public.activity_log FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND public.is_active(auth.uid()));

CREATE OR REPLACE FUNCTION public.promote_staging(p_ids uuid[])
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; pid uuid; n int := 0;
BEGIN
  IF NOT public.has_perm(auth.uid(),'catalogue_approve') THEN RAISE EXCEPTION 'permission catalogue_approve requise'; END IF;
  FOR r IN SELECT * FROM public.catalogue_staging WHERE id = ANY(p_ids) AND statut = 'en_attente' LOOP
    IF r.action = 'nouveau_produit' THEN
      INSERT INTO public.produits(designation, category_id, unite_reference, specs, created_by)
      VALUES (r.raw_designation, r.category_guess, coalesce(nullif(r.unite,''),'U'), r.specs_guess, auth.uid())
      RETURNING id INTO pid;
      INSERT INTO public.fournisseur_produits(produit_id, fournisseur_id, reference_fournisseur, prix_fourniture, delai_livraison_jours)
      VALUES (pid, r.fournisseur_id, r.raw_reference, r.prix_fourniture, r.delai_livraison_jours);
    ELSIF r.action = 'nouvelle_offre' THEN
      INSERT INTO public.fournisseur_produits(produit_id, fournisseur_id, reference_fournisseur, prix_fourniture, delai_livraison_jours)
      VALUES (r.matched_produit_id, r.fournisseur_id, r.raw_reference, r.prix_fourniture, r.delai_livraison_jours)
      ON CONFLICT (produit_id, fournisseur_id) DO UPDATE SET prix_fourniture = EXCLUDED.prix_fourniture;
    ELSIF r.action = 'maj_prix' THEN
      UPDATE public.fournisseur_produits SET prix_fourniture = r.prix_fourniture,
        delai_livraison_jours = coalesce(r.delai_livraison_jours, delai_livraison_jours)
      WHERE id = r.matched_offre_id;
    END IF;
    UPDATE public.catalogue_staging SET statut = 'approuve' WHERE id = r.id;
    n := n + 1;
  END LOOP;
  INSERT INTO public.activity_log(user_id, action, entity, details) VALUES (auth.uid(),'promote_staging','catalogue_staging', jsonb_build_object('count', n));
  RETURN n;
END $$;
GRANT EXECUTE ON FUNCTION public.promote_staging(uuid[]) TO authenticated;

INSERT INTO public.categories(nom, slug, ordre, attribute_schema) VALUES
 ('Plomberie','plomberie',1,'{}'),
 ('CVC','cvc',2,'{}'),
 ('Protection incendie','incendie',3,'{}');
INSERT INTO public.categories(nom, slug, parent_id, ordre, attribute_schema) VALUES
 ('Tuyauterie PVC','tuyau-pvc',(SELECT id FROM public.categories WHERE slug='plomberie'),1,
  '{"diametre_mm":{"type":"number","label":"Diamètre (mm)"},"pression_bar":{"type":"number","label":"Pression (bar)"},"matiere":{"type":"enum","label":"Matière","options":["PVC","PEHD"]}}'),
 ('Tuyauterie cuivre','tuyau-cuivre',(SELECT id FROM public.categories WHERE slug='plomberie'),2,
  '{"diametre_mm":{"type":"number","label":"Diamètre (mm)"},"matiere":{"type":"enum","label":"Matière","options":["cuivre"]}}'),
 ('Tube PER','tube-per',(SELECT id FROM public.categories WHERE slug='plomberie'),3,
  '{"diametre_mm":{"type":"number","label":"Diamètre (mm)"},"pression_bar":{"type":"number","label":"Pression (bar)"}}'),
 ('Robinetterie','robinetterie',(SELECT id FROM public.categories WHERE slug='plomberie'),4,
  '{"diametre_mm":{"type":"number","label":"DN (mm)"},"pression_bar":{"type":"number","label":"PN (bar)"}}'),
 ('Climatisation','clim',(SELECT id FROM public.categories WHERE slug='cvc'),1,
  '{"puissance_btu":{"type":"number","label":"Puissance (BTU)"}}'),
 ('Extincteurs','extincteurs',(SELECT id FROM public.categories WHERE slug='incendie'),1,
  '{"capacite_kg":{"type":"number","label":"Capacité (kg)"}}');

INSERT INTO public.fournisseurs(nom, contact, telephone, email, conditions_paiement, delai_paiement_jours, note_fiabilite) VALUES
 ('SOTUPLAST','M. Ben Salah','+216 71 000 111','contact@sotuplast.tn','Traite 60j',60,4),
 ('Hydro Distribution','Mme Trabelsi','+216 71 000 222','ventes@hydro.tn','Chèque 30j',30,5),
 ('MEP Import Sfax','M. Gharbi','+216 74 000 333','info@mepsfax.tn','Virement 90j',90,3);

INSERT INTO public.produits(designation, category_id, unite_reference, marque, specs) VALUES
 ('Tube PVC pression Ø110 PN10',(SELECT id FROM public.categories WHERE slug='tuyau-pvc'),'ml','SOTUPLAST','{"diametre_mm":110,"pression_bar":10,"matiere":"PVC"}'),
 ('Tube PVC pression Ø90 PN10',(SELECT id FROM public.categories WHERE slug='tuyau-pvc'),'ml','SOTUPLAST','{"diametre_mm":90,"pression_bar":10,"matiere":"PVC"}'),
 ('Tube PVC évacuation Ø110',(SELECT id FROM public.categories WHERE slug='tuyau-pvc'),'ml','SOTUPLAST','{"diametre_mm":110,"pression_bar":4,"matiere":"PVC"}'),
 ('Tube PVC évacuation Ø50',(SELECT id FROM public.categories WHERE slug='tuyau-pvc'),'ml','SOTUPLAST','{"diametre_mm":50,"pression_bar":4,"matiere":"PVC"}'),
 ('Tube cuivre Ø22',(SELECT id FROM public.categories WHERE slug='tuyau-cuivre'),'ml','KME','{"diametre_mm":22,"matiere":"cuivre"}'),
 ('Tube cuivre Ø16',(SELECT id FROM public.categories WHERE slug='tuyau-cuivre'),'ml','KME','{"diametre_mm":16,"matiere":"cuivre"}'),
 ('Tube PER Ø20 gainé',(SELECT id FROM public.categories WHERE slug='tube-per'),'ml','Giacomini','{"diametre_mm":20,"pression_bar":6}'),
 ('Vanne d''arrêt à boisseau sphérique DN25',(SELECT id FROM public.categories WHERE slug='robinetterie'),'U','Giacomini','{"diametre_mm":25,"pression_bar":16}'),
 ('Vanne d''arrêt à boisseau sphérique DN50',(SELECT id FROM public.categories WHERE slug='robinetterie'),'U','Giacomini','{"diametre_mm":50,"pression_bar":16}'),
 ('Climatiseur split mural 12000 BTU',(SELECT id FROM public.categories WHERE slug='clim'),'U','Gree','{"puissance_btu":12000}'),
 ('Climatiseur split mural 18000 BTU',(SELECT id FROM public.categories WHERE slug='clim'),'U','Gree','{"puissance_btu":18000}'),
 ('Extincteur poudre ABC 6 kg',(SELECT id FROM public.categories WHERE slug='extincteurs'),'U','Sicli','{"capacite_kg":6}');

INSERT INTO public.fournisseur_produits(produit_id, fournisseur_id, reference_fournisseur, prix_fourniture, delai_livraison_jours, disponibilite)
SELECT p.id, f.id, v.ref, v.prix, v.delai, v.dispo::public.disponibilite
FROM (VALUES
 ('Tube PVC pression Ø110 PN10','SOTUPLAST','SP-110-10',14.200,3,'en_stock'),
 ('Tube PVC pression Ø110 PN10','Hydro Distribution','HD-PVC110',13.650,7,'en_stock'),
 ('Tube PVC pression Ø110 PN10','MEP Import Sfax','MS-P110',12.900,21,'sur_commande'),
 ('Tube PVC pression Ø90 PN10','SOTUPLAST','SP-090-10',10.100,3,'en_stock'),
 ('Tube PVC pression Ø90 PN10','Hydro Distribution','HD-PVC90',10.450,5,'en_stock'),
 ('Tube PVC évacuation Ø110','SOTUPLAST','SP-E110',8.300,2,'en_stock'),
 ('Tube PVC évacuation Ø50','SOTUPLAST','SP-E050',3.900,2,'en_stock'),
 ('Tube cuivre Ø22','Hydro Distribution','HD-CU22',31.500,5,'en_stock'),
 ('Tube cuivre Ø22','MEP Import Sfax','MS-CU22',29.800,30,'sur_commande'),
 ('Tube cuivre Ø16','Hydro Distribution','HD-CU16',22.400,5,'en_stock'),
 ('Tube PER Ø20 gainé','Hydro Distribution','HD-PER20',4.750,4,'en_stock'),
 ('Vanne d''arrêt à boisseau sphérique DN25','Hydro Distribution','HD-VB25',38.000,4,'en_stock'),
 ('Vanne d''arrêt à boisseau sphérique DN25','MEP Import Sfax','MS-VB25',33.500,14,'en_stock'),
 ('Vanne d''arrêt à boisseau sphérique DN50','Hydro Distribution','HD-VB50',92.000,7,'en_stock'),
 ('Climatiseur split mural 12000 BTU','MEP Import Sfax','MS-GR12',1290.000,10,'en_stock'),
 ('Climatiseur split mural 18000 BTU','MEP Import Sfax','MS-GR18',1780.000,10,'sur_commande'),
 ('Extincteur poudre ABC 6 kg','Hydro Distribution','HD-EXT6',95.000,3,'en_stock')
) AS v(des, four, ref, prix, delai, dispo)
JOIN public.produits p ON p.designation = v.des
JOIN public.fournisseurs f ON f.nom = v.four;

ALTER TABLE public.fournisseur_produits DISABLE TRIGGER fp_touch;
UPDATE public.fournisseur_produits SET date_maj = now() - interval '140 days' WHERE reference_fournisseur IN ('MS-CU22','SP-E050');
ALTER TABLE public.fournisseur_produits ENABLE TRIGGER fp_touch;

INSERT INTO public.chantiers(nom, client, reference_ao, date_limite, statut) VALUES
 ('Résidence Les Jasmins — Lot Fluides','SNIT','AO-2026-041', (now() + interval '9 days')::date,'en_cours');
INSERT INTO public.marches(chantier_id, nom, ordre)
 SELECT id,'Lot 03 — Plomberie sanitaire',1 FROM public.chantiers WHERE reference_ao='AO-2026-041';
INSERT INTO public.marche_chapitres(marche_id, code, titre, ordre)
 SELECT m.id, v.code, v.titre, v.o FROM public.marches m,
 (VALUES ('A','Alimentation eau froide / chaude',1),('B','Évacuations',2),('C','Équipements',3)) v(code,titre,o)
 WHERE m.nom='Lot 03 — Plomberie sanitaire';
INSERT INTO public.marche_lignes(marche_id, chapitre_id, numero, designation, quantite, unite, ordre)
SELECT m.id, c.id, v.num, v.des, v.qte, v.u, v.o
FROM public.marches m
JOIN (VALUES
 ('A','A.1','Fourniture et pose tuyauterie PVC pression Ø110 PN10 y compris raccords',240,'ml',1),
 ('A','A.2','Tuyauterie PVC Ø90mm PN 10 bars, fourniture et pose',180,'ml',2),
 ('A','A.3','Tube cuivre écroui Ø22 pour distribution ECS',95,'ml',3),
 ('A','A.4','Tube PER gainé diamètre 20 mm',420,'ml',4),
 ('A','A.5','Vanne d''arrêt 1/4 de tour DN25',36,'U',5),
 ('A','A.6','Vanne d''arrêt DN50 à boisseau sphérique',6,'U',6),
 ('B','B.1','Canalisation PVC évacuation Ø110 y compris coudes et tés',160,'ml',7),
 ('B','B.2','Évacuation PVC Ø50 lavabos et éviers',210,'ml',8),
 ('C','C.1','Climatiseur mural type split 12000 BTU y compris liaisons frigorifiques',14,'U',9),
 ('C','C.2','Extincteur à poudre polyvalente ABC 6kg',22,'U',10),
 ('C','C.3','Chauffe-eau solaire 300 L thermosiphon',4,'U',11)
) v(ch,num,des,qte,u,o) ON true
JOIN public.marche_chapitres c ON c.marche_id = m.id AND c.code = v.ch
WHERE m.nom='Lot 03 — Plomberie sanitaire';
