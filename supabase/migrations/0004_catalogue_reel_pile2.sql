-- 0004 — catalogue réel, pile 2 : devis SOGET et SMC (York) + fiches techniques Cairox / Tecnifan / York
-- Sources : SOGET 500-2026 (21/09, remise 15 %), SOGET 501-2026 version du 23/09 (remise 20 % ; remplace la version du 21/09),
--           SMC 26 09 0611/NA (22/09, remise 25 %) + fiches DFA, RFV, AVANTAGE, LAF, GRA, GTA, MB, JTOH100, JDDH280, YV2VYH018, YV9VXH160.
-- Notes : SOGET 'M.Disponible' -> en_stock ; sinon sur_commande, délai 56 j (7 à 8 semaines). DN200 : quantité PM sur le devis, prix conservé.
-- Prix = prix net HT par unité APRÈS remise du devis (ce que paie Aeronova), 3 décimales, en DT. Statut 'verifie' (vrais devis).
-- Idempotent : relançable sans doublon (fournisseur trouvé par nom, produit par désignation+marque, offre par produit+fournisseur).
-- Nettoyage : DELETE FROM public.fournisseurs WHERE nom IN (…) supprime les offres en cascade ; les produits restent.

-- Fonctions temporaires (disparaissent à la fin de la session) : trouvent-ou-créent le fournisseur / le produit,
-- puis posent l'offre (UNIQUE produit+fournisseur -> mise à jour si elle existe déjà). Le trigger fp_history
-- écrit le prix initial dans l'historique.
CREATE OR REPLACE FUNCTION pg_temp.up_fourn(p_nom text, p_contact text, p_tel text, p_email text, p_adresse text, p_mf text, p_cond text)
RETURNS uuid LANGUAGE plpgsql AS $f$
DECLARE fid uuid;
BEGIN
  SELECT id INTO fid FROM public.fournisseurs WHERE nom = p_nom LIMIT 1;
  IF fid IS NULL THEN
    INSERT INTO public.fournisseurs(nom, contact, telephone, email, adresse, matricule_fiscal, conditions_paiement, actif)
    VALUES (p_nom, p_contact, p_tel, p_email, p_adresse, p_mf, p_cond, true) RETURNING id INTO fid;
  ELSE
    UPDATE public.fournisseurs SET contact = COALESCE(contact, p_contact), telephone = COALESCE(telephone, p_tel),
      email = COALESCE(email, p_email), adresse = COALESCE(adresse, p_adresse),
      matricule_fiscal = COALESCE(matricule_fiscal, p_mf), conditions_paiement = COALESCE(conditions_paiement, p_cond)
    WHERE id = fid;
  END IF;
  RETURN fid;
END $f$;

CREATE OR REPLACE FUNCTION pg_temp.up_offre(p_four uuid, p_cat text, p_des text, p_unite text, p_marque text, p_refc text,
  p_specs jsonb, p_ref_f text, p_prix numeric, p_delai int, p_dispo text, p_cond text, p_date timestamptz)
RETURNS void LANGUAGE plpgsql AS $f$
DECLARE pid uuid;
BEGIN
  SELECT id INTO pid FROM public.produits WHERE designation = p_des AND marque IS NOT DISTINCT FROM p_marque LIMIT 1;
  IF pid IS NULL THEN
    INSERT INTO public.produits(designation, category_id, unite_reference, marque, reference_constructeur, specs)
    VALUES (p_des, (SELECT id FROM public.categories WHERE slug = p_cat), p_unite, p_marque, p_refc, COALESCE(p_specs, '{}'::jsonb))
    RETURNING id INTO pid;
  END IF;
  INSERT INTO public.fournisseur_produits(produit_id, fournisseur_id, reference_fournisseur, prix_fourniture, devise,
      delai_livraison_jours, conditionnement, disponibilite, statut, date_maj)
  VALUES (pid, p_four, p_ref_f, p_prix, 'DT', p_delai, p_cond, p_dispo::public.disponibilite, 'verifie', p_date)
  ON CONFLICT (produit_id, fournisseur_id) DO UPDATE SET reference_fournisseur = EXCLUDED.reference_fournisseur,
    prix_fourniture = EXCLUDED.prix_fourniture, delai_livraison_jours = EXCLUDED.delai_livraison_jours,
    conditionnement = EXCLUDED.conditionnement, disponibilite = EXCLUDED.disponibilite, statut = 'verifie', date_maj = EXCLUDED.date_maj;
END $f$;

-- Catégories (idempotent : ON CONFLICT sur le slug ; un parent déjà rangé n'est pas déplacé).
-- Un INSERT par niveau de l'arbre pour que le parent existe avant ses enfants.
INSERT INTO public.categories(nom, slug, parent_id, ordre)
SELECT v.nom, v.slug, p.id, v.ordre FROM (VALUES
 ('CVC','cvc',NULL::text,2),
 ('Plomberie','plomberie',NULL::text,1),
 ('Protection incendie','incendie',NULL::text,3)
) AS v(nom, slug, parent, ordre)
LEFT JOIN public.categories p ON p.slug = v.parent
ON CONFLICT (slug) DO UPDATE SET nom = EXCLUDED.nom, parent_id = COALESCE(public.categories.parent_id, EXCLUDED.parent_id);

INSERT INTO public.categories(nom, slug, parent_id, ordre)
SELECT v.nom, v.slug, p.id, v.ordre FROM (VALUES
 ('Climatisation','clim','cvc'::text,1),
 ('Grilles et bouches d''air','grilles-bouches','cvc'::text,3),
 ('Caissons et ventilateurs d''extraction','caissons-ventilateurs','cvc'::text,4),
 ('Variateurs, registres et coupe-courants','regulation-ventilation','cvc'::text,5),
 ('Désenfumage','desenfumage','incendie'::text,2)
) AS v(nom, slug, parent, ordre)
LEFT JOIN public.categories p ON p.slug = v.parent
ON CONFLICT (slug) DO UPDATE SET nom = EXCLUDED.nom, parent_id = COALESCE(public.categories.parent_id, EXCLUDED.parent_id);

INSERT INTO public.categories(nom, slug, parent_id, ordre)
SELECT v.nom, v.slug, p.id, v.ordre FROM (VALUES
 ('Unités extérieures (VRV / DRV / split)','unites-exterieures','clim'::text,2),
 ('Unités intérieures (gainables, cassettes)','unites-interieures','clim'::text,3)
) AS v(nom, slug, parent, ordre)
LEFT JOIN public.categories p ON p.slug = v.parent
ON CONFLICT (slug) DO UPDATE SET nom = EXCLUDED.nom, parent_id = COALESCE(public.categories.parent_id, EXCLUDED.parent_id);

DO $do$
DECLARE f uuid;
BEGIN

  -- ===== SOGET =====
  f := pg_temp.up_fourn('SOGET', NULL, '+216 71 940 240', 'contact@soget.com.tn', '10 Rue des Métiers, BP 415, Z.I. Ariana Aéroport, 1080 Tunis Cedex', '1522451/K/A/M/000', NULL);
  -- Devis : SOGET 500-2026 (21/09/2026, remise 15 %)
  -- Devis : SOGET 501-2026 v2 (23/09/2026, remise 20 %)
  -- Grille de reprise et soufflage - BROFER LAF 500x150 : remise 15% sur PU 80
  PERFORM pg_temp.up_offre(f, 'grilles-bouches', 'Grille de reprise et soufflage - BROFER LAF 500x150', 'U', 'BROFER', 'LAF 500x150', '{"largeur_mm":500,"hauteur_mm":150,"usage":"reprise/soufflage"}'::jsonb, 'LAF 500x150', 68.000, NULL, 'en_stock', NULL, '2026-09-21'::timestamptz);
  -- Grille de reprise et soufflage - BROFER LAF 1000x150 : remise 15% sur PU 128
  PERFORM pg_temp.up_offre(f, 'grilles-bouches', 'Grille de reprise et soufflage - BROFER LAF 1000x150', 'U', 'BROFER', 'LAF 1000x150', '{"largeur_mm":1000,"hauteur_mm":150,"usage":"reprise/soufflage"}'::jsonb, 'LAF 1000x150', 108.800, NULL, 'en_stock', NULL, '2026-09-21'::timestamptz);
  -- Grille de reprise et soufflage - BROFER LAF 800x200 : remise 15% sur PU 135
  PERFORM pg_temp.up_offre(f, 'grilles-bouches', 'Grille de reprise et soufflage - BROFER LAF 800x200', 'U', 'BROFER', 'LAF 800x200', '{"largeur_mm":800,"hauteur_mm":200,"usage":"reprise/soufflage"}'::jsonb, 'LAF 800x200', 114.750, NULL, 'en_stock', NULL, '2026-09-21'::timestamptz);
  -- Grille de reprise et soufflage - BROFER LAF 400x150 : remise 15% sur PU 95
  PERFORM pg_temp.up_offre(f, 'grilles-bouches', 'Grille de reprise et soufflage - BROFER LAF 400x150', 'U', 'BROFER', 'LAF 400x150', '{"largeur_mm":400,"hauteur_mm":150,"usage":"reprise/soufflage"}'::jsonb, 'LAF 400x150', 80.750, 56, 'sur_commande', NULL, '2026-09-21'::timestamptz);
  -- Grille pare-pluie - BROFER GRA RZ 600x300 : remise 15% sur PU 140
  PERFORM pg_temp.up_offre(f, 'grilles-bouches', 'Grille pare-pluie - BROFER GRA RZ 600x300', 'U', 'BROFER', 'GRA RZ 600x300', '{"largeur_mm":600,"hauteur_mm":300,"usage":"pare-pluie"}'::jsonb, 'GRA RZ 600x300', 119.000, 56, 'sur_commande', NULL, '2026-09-21'::timestamptz);
  -- Grille pare-pluie - BROFER GRA RZ 300x300 : remise 15% sur PU 81
  PERFORM pg_temp.up_offre(f, 'grilles-bouches', 'Grille pare-pluie - BROFER GRA RZ 300x300', 'U', 'BROFER', 'GRA RZ 300x300', '{"largeur_mm":300,"hauteur_mm":300,"usage":"pare-pluie"}'::jsonb, 'GRA RZ 300x300', 68.850, 56, 'sur_commande', NULL, '2026-09-21'::timestamptz);
  -- Grille de transfert - BROFER GTA 400x200 : remise 15% sur PU 100
  PERFORM pg_temp.up_offre(f, 'grilles-bouches', 'Grille de transfert - BROFER GTA 400x200', 'U', 'BROFER', 'GTA 400x200', '{"largeur_mm":400,"hauteur_mm":200,"usage":"transfert"}'::jsonb, 'GTA 400x200', 85.000, 56, 'sur_commande', NULL, '2026-09-21'::timestamptz);
  -- Bouche d'extraction (non paraflam) - CAIROX DVS 100 : remise 15% sur PU 17
  PERFORM pg_temp.up_offre(f, 'grilles-bouches', 'Bouche d''extraction (non paraflam) - CAIROX DVS 100', 'U', 'CAIROX', 'DVS 100', '{"diametre_mm":100}'::jsonb, 'DVS 100', 14.450, NULL, 'en_stock', NULL, '2026-09-21'::timestamptz);
  -- Bouche d'extraction (non paraflam) - CAIROX DVS 125 : remise 15% sur PU 20
  PERFORM pg_temp.up_offre(f, 'grilles-bouches', 'Bouche d''extraction (non paraflam) - CAIROX DVS 125', 'U', 'CAIROX', 'DVS 125', '{"diametre_mm":125}'::jsonb, 'DVS 125', 17.000, NULL, 'en_stock', NULL, '2026-09-21'::timestamptz);
  -- Registre de réglage avec clé manuelle - BROFER DBC + clé DN 100 : remise 15% sur PU 115
  PERFORM pg_temp.up_offre(f, 'regulation-ventilation', 'Registre de réglage avec clé manuelle - BROFER DBC + clé DN 100', 'U', 'BROFER', 'DBC DN100', '{"dn":100}'::jsonb, 'DBC DN100', 97.750, 56, 'sur_commande', NULL, '2026-09-21'::timestamptz);
  -- Registre de réglage avec clé manuelle - BROFER DBC + clé DN 125 : remise 15% sur PU 115
  PERFORM pg_temp.up_offre(f, 'regulation-ventilation', 'Registre de réglage avec clé manuelle - BROFER DBC + clé DN 125', 'U', 'BROFER', 'DBC DN125', '{"dn":125}'::jsonb, 'DBC DN125', 97.750, 56, 'sur_commande', NULL, '2026-09-21'::timestamptz);
  -- Registre de réglage avec clé manuelle - BROFER DBC + clé DN 200 : remise 15% sur PU 125
  PERFORM pg_temp.up_offre(f, 'regulation-ventilation', 'Registre de réglage avec clé manuelle - BROFER DBC + clé DN 200', 'U', 'BROFER', 'DBC DN200', '{"dn":200}'::jsonb, 'DBC DN200', 106.250, 56, 'sur_commande', NULL, '2026-09-21'::timestamptz);
  -- Registre de réglage avec clé manuelle - BROFER DBC + clé DN 250 : remise 15% sur PU 162
  PERFORM pg_temp.up_offre(f, 'regulation-ventilation', 'Registre de réglage avec clé manuelle - BROFER DBC + clé DN 250', 'U', 'BROFER', 'DBC DN250', '{"dn":250}'::jsonb, 'DBC DN250', 137.700, 56, 'sur_commande', NULL, '2026-09-21'::timestamptz);
  -- Caisson d'extraction isolé - TECNIFAN MB 12/33 - 6P - M - 1V : remise 15% sur PU 1950
  PERFORM pg_temp.up_offre(f, 'caissons-ventilateurs', 'Caisson d''extraction isolé - TECNIFAN MB 12/33 - 6P - M - 1V', 'U', 'TECNIFAN', 'MB 12/33 - 6P - M - 1V', '{"poles":6,"alimentation":"monophasé","points_fonctionnement":[{"debit_m3h":2500,"hmt_pa":200},{"debit_m3h":3000,"hmt_pa":200}]}'::jsonb, 'MB 12/33 - 6P - M - 1V', 1657.500, NULL, 'en_stock', NULL, '2026-09-21'::timestamptz);
  -- Variateur de fréquence 10 A : remise 15% sur PU 350
  PERFORM pg_temp.up_offre(f, 'regulation-ventilation', 'Variateur de fréquence 10 A', 'U', NULL, NULL, '{"intensite_a":10}'::jsonb, NULL, 297.500, NULL, 'en_stock', NULL, '2026-09-21'::timestamptz);
  -- Tourelle d'extraction agréée 400 °C/2 h avec interrupteur - CAIROX RFV 35/1 : remise 15% sur PU 2200
  PERFORM pg_temp.up_offre(f, 'desenfumage', 'Tourelle d''extraction agréée 400 °C/2 h avec interrupteur - CAIROX RFV 35/1', 'U', 'CAIROX', 'RFV 35/1', '{"debit_m3h":2000,"hmt_pa":250,"resistance_feu":"F400/120"}'::jsonb, 'RFV 35/1', 1870.000, NULL, 'en_stock', NULL, '2026-09-21'::timestamptz);
  -- Caisson d'extraction de désenfumage agréé 400 °C/2 h - CAIROX DFA 500 - 4 pôles : remise 20% sur PU 3990
  PERFORM pg_temp.up_offre(f, 'desenfumage', 'Caisson d''extraction de désenfumage agréé 400 °C/2 h - CAIROX DFA 500 - 4 pôles', 'U', 'CAIROX', 'DFA 500 - 4P', '{"debit_m3h":5400,"hmt_pa":200,"poles":4,"resistance_feu":"F400/120"}'::jsonb, 'DFA 500 - 4 POLES', 3192.000, 56, 'sur_commande', NULL, '2026-09-23'::timestamptz);
  -- Coffret de relayage 6A avec interrupteur cadenassable, boîtier de réarmement, b… : remise 20% sur PU 2500
  PERFORM pg_temp.up_offre(f, 'desenfumage', 'Coffret de relayage 6A avec interrupteur cadenassable, boîtier de réarmement, boîtier arrêt pompier et pressostat différentiel', 'U', NULL, NULL, '{"intensite_a":6}'::jsonb, NULL, 2000.000, 56, 'sur_commande', NULL, '2026-09-23'::timestamptz);
  -- Volet de désenfumage + cadre + grille d'habillage - CAIROX AVANTAGE 2H 1V Dm²=3… : remise 20% sur PU 1948
  PERFORM pg_temp.up_offre(f, 'desenfumage', 'Volet de désenfumage + cadre + grille d''habillage - CAIROX AVANTAGE 2H 1V Dm²=36 700x565', 'U', 'CAIROX', 'AVANTAGE 2H 1V 700x565', '{"dimensions_mm":"700x565","section_libre_dm2":36,"vantaux":1,"resistance_feu_min":120}'::jsonb, 'AVANTAGE 2H 1V 700x565', 1558.400, 56, 'sur_commande', NULL, '2026-09-23'::timestamptz);
  -- Ouvrant de façade - CAIROX OUVRAGE 800x565 : remise 20% sur PU 3246
  PERFORM pg_temp.up_offre(f, 'desenfumage', 'Ouvrant de façade - CAIROX OUVRAGE 800x565', 'U', 'CAIROX', 'OUVRAGE 800x565', '{"dimensions_mm":"800x565"}'::jsonb, 'OUVRAGE 800x565', 2596.800, 56, 'sur_commande', NULL, '2026-09-23'::timestamptz);
  -- Ouvrant de façade - CAIROX OUVRAGE 1050x805 : remise 20% sur PU 3787
  PERFORM pg_temp.up_offre(f, 'desenfumage', 'Ouvrant de façade - CAIROX OUVRAGE 1050x805', 'U', 'CAIROX', 'OUVRAGE 1050x805', '{"dimensions_mm":"1050x805"}'::jsonb, 'OUVRAGE 1050x805', 3029.600, 56, 'sur_commande', NULL, '2026-09-23'::timestamptz);

  -- ===== SMC - Société de Matériel de Climatisation (York) =====
  f := pg_temp.up_fourn('SMC - Société de Matériel de Climatisation (York)', 'Nader Laajili', '+216 71 806 706', NULL, '71 Rue 8601, ZI Charguia I, 2035 Tunis-Carthage', NULL, 'A convenir');
  -- Devis : SMC 26 09 0611/NA (22/09/2026, remise 25 %)
  -- Unité extérieure VRF HAPQ 28 kW R410A DC inverter - YORK JTOH100VPETCQ : remise 25% sur PU 24200
  PERFORM pg_temp.up_offre(f, 'unites-exterieures', 'Unité extérieure VRF HAPQ 28 kW R410A DC inverter - YORK JTOH100VPETCQ', 'U', 'YORK', 'JTOH100VPETCQ', '{"puissance_kw":28,"fluide":"R410A","alimentation":"3~ 380-415V 50/60Hz","pression_sonore_dba":60,"poids_net_kg":244,"tuyau_gaz_mm":22.2,"tuyau_liquide_mm":9.53,"nb_max_unites_interieures":16}'::jsonb, 'JTOH100VPETCQ', 18150.000, NULL, 'sur_commande', NULL, '2026-09-22'::timestamptz);
  -- Unité extérieure mini-VRF 18 kW - YORK YV2VYH018KAR-DAX : remise 25% sur PU 13335
  PERFORM pg_temp.up_offre(f, 'unites-exterieures', 'Unité extérieure mini-VRF 18 kW - YORK YV2VYH018KAR-DAX', 'U', 'YORK', 'YV2VYH018KAR-DAX', '{"puissance_kw":18,"capacite_froid_kw":18.5,"capacite_chaud_kw":20.5,"alimentation":"1~ 220-240V","pression_sonore_dba":54,"debit_air_m3h":7200,"poids_net_kg":108}'::jsonb, 'YV2VYH018KAR-DAX', 10001.250, NULL, 'sur_commande', NULL, '2026-09-22'::timestamptz);
  -- Unité intérieure gainable 28 kW / 150 Pa avec commande tactile - YORK JDDH280H0… : remise 25% sur PU 6990
  PERFORM pg_temp.up_offre(f, 'unites-interieures', 'Unité intérieure gainable 28 kW / 150 Pa avec commande tactile - YORK JDDH280H0NSBQ', 'U', 'YORK', 'JDDH280H0NSBQ', '{"puissance_kw":28,"pression_statique_pa":150,"alimentation":"1~ 220-240V","pression_sonore_dba":"53/52/50","dimensions_mm":"470x1250x1120","poids_net_kg":104}'::jsonb, 'JDDH280H0NSBQ', 5242.500, NULL, 'sur_commande', NULL, '2026-09-22'::timestamptz);
  -- Cassette Round Flow 840x840 6,5 HP (16 kW) avec commande IR et panneau décorati… : remise 25% sur PU 4950
  PERFORM pg_temp.up_offre(f, 'unites-interieures', 'Cassette Round Flow 840x840 6,5 HP (16 kW) avec commande IR et panneau décoratif - YORK YV9VXH160WAR--GY', 'U', 'YORK', 'YV9VXH160WAR--GY', '{"puissance_kw":16,"capacite_chaud_kw":18,"dimensions_mm":"840x840x288","debit_air_m3h":2100,"niveau_sonore_dba":"44/40/36","alimentation":"1~ 220-230V","note":"fiche technique reçue : YV9VXH160WAR--GX"}'::jsonb, 'YV9VXH160WAR--GY', 3712.500, NULL, 'sur_commande', NULL, '2026-09-22'::timestamptz);
END $do$;
