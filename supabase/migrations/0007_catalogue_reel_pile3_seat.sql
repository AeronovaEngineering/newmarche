-- 0007 — catalogue réel, pile 3 : devis SEAT (affaire APPART-HOTEL IMMEUBLE EVOLE PF01, 01/10/2026)
-- Source : devis SEAT du 01/10/2026 (CALADAIR, AIRLAM, KOOLAIR, RF-T Technologies, BLUTEK), remise 20 % sur tous les prix.
-- Notes : prix = prix net HT par unité APRÈS remise de 20 % (ce que paie Aeronova), 3 décimales, en DT. Statut 'verifie'.
--         Disponibilité : 6 à 8 semaines après commande ferme -> sur_commande, délai 56 j.
--         Boîtiers BAP / BR : quantité PM sur le devis, prix conservé. Coffret TRI-6 présent 2 fois sur le devis -> une seule offre.
--         Volet VU120 600x400 présent aux postes 8 et 9 -> une seule offre.
--         Validité de l'offre liée au taux €/DT = 3,34 (révision si variation > 3 % à la facturation).
--         Les 3 devis A2C (DV-26/3982 et DV-26/3984, fournis en double) sont déjà dans 0003 : rien à ajouter.
-- Idempotent : relançable sans doublon (fournisseur trouvé par nom, produit par désignation+marque, offre par produit+fournisseur).
-- Nettoyage : DELETE FROM public.fournisseurs WHERE nom LIKE 'SEAT - %' supprime les offres en cascade ; les produits restent.

-- Fonctions temporaires (disparaissent à la fin de la session).
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

-- Catégories nécessaires (déjà créées par 0003 / 0004 ; idempotent, ne déplace pas un parent déjà rangé).
INSERT INTO public.categories(nom, slug, parent_id, ordre)
SELECT v.nom, v.slug, p.id, v.ordre FROM (VALUES
 ('CVC','cvc',NULL::text,2),
 ('Protection incendie','incendie',NULL::text,3)
) AS v(nom, slug, parent, ordre)
LEFT JOIN public.categories p ON p.slug = v.parent
ON CONFLICT (slug) DO UPDATE SET nom = EXCLUDED.nom, parent_id = COALESCE(public.categories.parent_id, EXCLUDED.parent_id);

INSERT INTO public.categories(nom, slug, parent_id, ordre)
SELECT v.nom, v.slug, p.id, v.ordre FROM (VALUES
 ('Grilles et bouches d''air','grilles-bouches','cvc'::text,3),
 ('Désenfumage','desenfumage','incendie'::text,2)
) AS v(nom, slug, parent, ordre)
LEFT JOIN public.categories p ON p.slug = v.parent
ON CONFLICT (slug) DO UPDATE SET nom = EXCLUDED.nom, parent_id = COALESCE(public.categories.parent_id, EXCLUDED.parent_id);

DO $do$
DECLARE f uuid;
BEGIN

  -- ===== SEAT - Société d'Equipements Aéraulique et Thermique =====
  f := pg_temp.up_fourn('SEAT - Société d''Equipements Aéraulique et Thermique', 'Chaima Ben Lakhel (chargée d''affaire)', '+216 70 858 208', 'seat@gnet.tn', '5 rue Ennouiri, Sidi Fradj, La Soukra 2036, Tunis - BP 239 Ariana', '978593/W/B/M/000', NULL);
  -- Devis : SEAT, affaire APPART-HOTEL IMMEUBLE EVOLE PF01 (01/10/2026, remise 20 %)
  -- Tourelle d'extraction centrifuge de désenfumage 1 vitesse 400 °C/2 h a… : remise 20% sur PU 4587.699
  PERFORM pg_temp.up_offre(f, 'desenfumage', 'Tourelle d''extraction centrifuge de désenfumage 1 vitesse 400 °C/2 h avec interrupteur de proximité - CALADAIR RFV 56/2 4P', 'U', 'CALADAIR', 'RFV 56/2 4P', '{"debit_m3h":8640,"hmt_mmce":20,"poles":4,"resistance_feu":"F400/120"}'::jsonb, 'RFV 56/2 4P', 3670.159, 56, 'sur_commande', NULL, '2026-10-01'::timestamptz);
  -- Coffret de relayage désenfumage - CALADAIR TRI-6 : remise 20% sur PU 1725.720
  PERFORM pg_temp.up_offre(f, 'desenfumage', 'Coffret de relayage désenfumage - CALADAIR TRI-6', 'U', 'CALADAIR', 'TRI-6', '{}'::jsonb, 'TRI-6', 1380.576, 56, 'sur_commande', NULL, '2026-10-01'::timestamptz);
  -- Tourelle d'extraction centrifuge de désenfumage 1 vitesse 400 °C/2 h a… : remise 20% sur PU 6447.788
  PERFORM pg_temp.up_offre(f, 'desenfumage', 'Tourelle d''extraction centrifuge de désenfumage 1 vitesse 400 °C/2 h avec interrupteur de proximité - CALADAIR RFV 63/3 4P', 'U', 'CALADAIR', 'RFV 63/3 4P', '{"debit_m3h":15120,"hmt_mmce":20,"poles":4,"resistance_feu":"F400/120"}'::jsonb, 'RFV 63/3 4P', 5158.230, 56, 'sur_commande', NULL, '2026-10-01'::timestamptz);
  -- Coffret de relayage désenfumage - CALADAIR TRI-15 : remise 20% sur PU 1848.175
  PERFORM pg_temp.up_offre(f, 'desenfumage', 'Coffret de relayage désenfumage - CALADAIR TRI-15', 'U', 'CALADAIR', 'TRI-15', '{}'::jsonb, 'TRI-15', 1478.540, 56, 'sur_commande', NULL, '2026-10-01'::timestamptz);
  -- Caisson d'extraction de désenfumage 400 °C/2 h accouplement direct ave… : remise 20% sur PU 4988.713
  PERFORM pg_temp.up_offre(f, 'desenfumage', 'Caisson d''extraction de désenfumage 400 °C/2 h accouplement direct avec interrupteur de proximité et capot moteur - CALADAIR DIABLO 500 F4', 'U', 'CALADAIR', 'DIABLO 500 F4', '{"debit_m3h":5140,"hmt_mmce":20,"resistance_feu":"F400/120"}'::jsonb, 'DIABLO 500 F4', 3990.971, 56, 'sur_commande', NULL, '2026-10-01'::timestamptz);
  -- Boîtier arrêt pompier - CALADAIR BAP : remise 20% sur PU 112.000 (quantité PM sur le devis, prix conservé)
  PERFORM pg_temp.up_offre(f, 'desenfumage', 'Boîtier arrêt pompier - CALADAIR BAP', 'U', 'CALADAIR', 'BAP', '{}'::jsonb, 'BAP', 89.600, 56, 'sur_commande', NULL, '2026-10-01'::timestamptz);
  -- Boîtier de réarmement - CALADAIR BR : remise 20% sur PU 119.000 (quantité PM sur le devis, prix conservé)
  PERFORM pg_temp.up_offre(f, 'desenfumage', 'Boîtier de réarmement - CALADAIR BR', 'U', 'CALADAIR', 'BR', '{}'::jsonb, 'BR', 95.200, 56, 'sur_commande', NULL, '2026-10-01'::timestamptz);
  -- Ouvrant de façade d'amenée d'air frais NFS 61937, déclencheur électriq… : remise 20% sur PU 2882.783
  PERFORM pg_temp.up_offre(f, 'desenfumage', 'Ouvrant de façade d''amenée d''air frais NFS 61937, déclencheur électrique 24 Vcc (refermeture manuelle) - AIRLAM 975x725', 'U', 'AIRLAM', 'OUVRANT 975x725', '{"dimensions_mm":"975x725","norme":"NFS 61937","declencheur":"24 Vcc"}'::jsonb, 'OUVRANT 975x725', 2306.227, 56, 'sur_commande', NULL, '2026-10-01'::timestamptz);
  -- Ouvrant de façade d'amenée d'air frais NFS 61937, déclencheur électriq… : remise 20% sur PU 3172.751
  PERFORM pg_temp.up_offre(f, 'desenfumage', 'Ouvrant de façade d''amenée d''air frais NFS 61937, déclencheur électrique 24 Vcc (refermeture manuelle) - AIRLAM 1350x725', 'U', 'AIRLAM', 'OUVRANT 1350x725', '{"dimensions_mm":"1350x725","norme":"NFS 61937","declencheur":"24 Vcc"}'::jsonb, 'OUVRANT 1350x725', 2538.201, 56, 'sur_commande', NULL, '2026-10-01'::timestamptz);
  -- Ouvrant de façade d'amenée d'air frais NFS 61937, déclencheur électriq… : remise 20% sur PU 2836.999
  PERFORM pg_temp.up_offre(f, 'desenfumage', 'Ouvrant de façade d''amenée d''air frais NFS 61937, déclencheur électrique 24 Vcc (refermeture manuelle) - AIRLAM 850x725', 'U', 'AIRLAM', 'OUVRANT 850x725', '{"dimensions_mm":"850x725","norme":"NFS 61937","declencheur":"24 Vcc"}'::jsonb, 'OUVRANT 850x725', 2269.599, 56, 'sur_commande', NULL, '2026-10-01'::timestamptz);
  -- Grille aluminium laquée blanc à ailettes fixes inclinées à 45° (profil… : remise 20% sur PU 317.200
  PERFORM pg_temp.up_offre(f, 'grilles-bouches', 'Grille aluminium laquée blanc à ailettes fixes inclinées à 45° (profil parapluie) - KOOLAIR 25-H 975x725', 'U', 'KOOLAIR', '25-H 975x725', '{"dimensions_mm":"975x725","matiere":"aluminium","ailettes":"fixes 45°"}'::jsonb, '25-H 975x725', 253.760, 56, 'sur_commande', NULL, '2026-10-01'::timestamptz);
  -- Grille aluminium laquée blanc à ailettes fixes inclinées à 45° (profil… : remise 20% sur PU 450.180
  PERFORM pg_temp.up_offre(f, 'grilles-bouches', 'Grille aluminium laquée blanc à ailettes fixes inclinées à 45° (profil parapluie) - KOOLAIR 25-H 1350x725', 'U', 'KOOLAIR', '25-H 1350x725', '{"dimensions_mm":"1350x725","matiere":"aluminium","ailettes":"fixes 45°"}'::jsonb, '25-H 1350x725', 360.144, 56, 'sur_commande', NULL, '2026-10-01'::timestamptz);
  -- Grille aluminium laquée blanc à ailettes fixes inclinées à 45° (profil… : remise 20% sur PU 239.547
  PERFORM pg_temp.up_offre(f, 'grilles-bouches', 'Grille aluminium laquée blanc à ailettes fixes inclinées à 45° (profil parapluie) - KOOLAIR 25-H 850x725', 'U', 'KOOLAIR', '25-H 850x725', '{"dimensions_mm":"850x725","matiere":"aluminium","ailettes":"fixes 45°"}'::jsonb, '25-H 850x725', 191.638, 56, 'sur_commande', NULL, '2026-10-01'::timestamptz);
  -- Grille aluminium laquée blanc à ailettes fixes inclinées à 45° (profil… : remise 20% sur PU 230.580
  PERFORM pg_temp.up_offre(f, 'grilles-bouches', 'Grille aluminium laquée blanc à ailettes fixes inclinées à 45° (profil parapluie) - KOOLAIR 25-H 1200x300', 'U', 'KOOLAIR', '25-H 1200x300', '{"dimensions_mm":"1200x300","matiere":"aluminium","ailettes":"fixes 45°"}'::jsonb, '25-H 1200x300', 184.464, 56, 'sur_commande', NULL, '2026-10-01'::timestamptz);
  -- Grille aluminium laquée blanc à ailettes fixes inclinées à 45° (profil… : remise 20% sur PU 154.330
  PERFORM pg_temp.up_offre(f, 'grilles-bouches', 'Grille aluminium laquée blanc à ailettes fixes inclinées à 45° (profil parapluie) - KOOLAIR 25-H 1000x300', 'U', 'KOOLAIR', '25-H 1000x300', '{"dimensions_mm":"1000x300","matiere":"aluminium","ailettes":"fixes 45°"}'::jsonb, '25-H 1000x300', 123.464, 56, 'sur_commande', NULL, '2026-10-01'::timestamptz);
  -- Grille aluminium laquée blanc à ailettes fixes inclinées à 45° (profil… : remise 20% sur PU 113.521
  PERFORM pg_temp.up_offre(f, 'grilles-bouches', 'Grille aluminium laquée blanc à ailettes fixes inclinées à 45° (profil parapluie) - KOOLAIR 25-H 1000x200', 'U', 'KOOLAIR', '25-H 1000x200', '{"dimensions_mm":"1000x200","matiere":"aluminium","ailettes":"fixes 45°"}'::jsonb, '25-H 1000x200', 90.817, 56, 'sur_commande', NULL, '2026-10-01'::timestamptz);
  -- Grille coupe-feu 2 h - RF-T TECHNOLOGIES GE 120 1200x300 : remise 20% sur PU 3503.000
  PERFORM pg_temp.up_offre(f, 'desenfumage', 'Grille coupe-feu 2 h - RF-T TECHNOLOGIES GE 120 1200x300', 'U', 'RF-T TECHNOLOGIES', 'GE 120 1200x300', '{"dimensions_mm":"1200x300","coupe_feu_h":2}'::jsonb, 'GE 120 1200x300', 2802.400, 56, 'sur_commande', NULL, '2026-10-01'::timestamptz);
  -- Grille coupe-feu 2 h - RF-T TECHNOLOGIES GE 120 1000x300 : remise 20% sur PU 2876.800
  PERFORM pg_temp.up_offre(f, 'desenfumage', 'Grille coupe-feu 2 h - RF-T TECHNOLOGIES GE 120 1000x300', 'U', 'RF-T TECHNOLOGIES', 'GE 120 1000x300', '{"dimensions_mm":"1000x300","coupe_feu_h":2}'::jsonb, 'GE 120 1000x300', 2301.440, 56, 'sur_commande', NULL, '2026-10-01'::timestamptz);
  -- Grille coupe-feu 2 h - RF-T TECHNOLOGIES GE 120 1000x200 : remise 20% sur PU 2300.200
  PERFORM pg_temp.up_offre(f, 'desenfumage', 'Grille coupe-feu 2 h - RF-T TECHNOLOGIES GE 120 1000x200', 'U', 'RF-T TECHNOLOGIES', 'GE 120 1000x200', '{"dimensions_mm":"1000x200","coupe_feu_h":2}'::jsonb, 'GE 120 1000x200', 1840.160, 56, 'sur_commande', NULL, '2026-10-01'::timestamptz);
  -- Exutoire de désenfumage 1 m² en verre acrylique translucide à commande… : remise 20% sur PU 2200.000
  PERFORM pg_temp.up_offre(f, 'desenfumage', 'Exutoire de désenfumage 1 m² en verre acrylique translucide à commande par fusible thermique - BLUTEK HEXASTEEL MOT C 100 1000x1000', 'U', 'BLUTEK', 'HEXASTEEL MOT C 100', '{"dimensions_mm":"1000x1000","surface_m2":1}'::jsonb, 'HEXASTEEL MOT C 100', 1760.000, 56, 'sur_commande', NULL, '2026-10-01'::timestamptz);
  -- Pack treuil mécanique pour exutoire - BLUTEK HKIT500AS : remise 20% sur PU 750.000
  PERFORM pg_temp.up_offre(f, 'desenfumage', 'Pack treuil mécanique pour exutoire - BLUTEK HKIT500AS', 'U', 'BLUTEK', 'HKIT500AS', '{}'::jsonb, 'HKIT500AS', 600.000, 56, 'sur_commande', NULL, '2026-10-01'::timestamptz);
  -- Module pour treuil électromagnétique 24 Vcc - BLUTEK HO3456-8 : remise 20% sur PU 290.000
  PERFORM pg_temp.up_offre(f, 'desenfumage', 'Module pour treuil électromagnétique 24 Vcc - BLUTEK HO3456-8', 'U', 'BLUTEK', 'HO3456-8', '{"tension":"24 Vcc"}'::jsonb, 'HO3456-8', 232.000, 56, 'sur_commande', NULL, '2026-10-01'::timestamptz);
  -- Volet à tunnel rectangulaire normalement fermé à repos, bobine à émiss… : remise 20% sur PU 1186.528
  PERFORM pg_temp.up_offre(f, 'desenfumage', 'Volet à tunnel rectangulaire normalement fermé à repos, bobine à émission 24 Vcc et contact début/fin de course - RF-T TECHNOLOGIES VU120+MANF VD FDCU 500x350', 'U', 'RF-T TECHNOLOGIES', 'VU120+MANF VD FDCU 500x350', '{"dimensions_mm":"500x350","position_repos":"fermé","commande":"bobine émission 24 Vcc"}'::jsonb, 'VU120+MANF VD FDCU 500x350', 949.223, 56, 'sur_commande', NULL, '2026-10-01'::timestamptz);
  -- Volet à tunnel rectangulaire normalement fermé à repos, bobine à émiss… : remise 20% sur PU 1267.101
  PERFORM pg_temp.up_offre(f, 'desenfumage', 'Volet à tunnel rectangulaire normalement fermé à repos, bobine à émission 24 Vcc et contact début/fin de course - RF-T TECHNOLOGIES VU120+MANF VD FDCU 550x400', 'U', 'RF-T TECHNOLOGIES', 'VU120+MANF VD FDCU 550x400', '{"dimensions_mm":"550x400","position_repos":"fermé","commande":"bobine émission 24 Vcc"}'::jsonb, 'VU120+MANF VD FDCU 550x400', 1013.681, 56, 'sur_commande', NULL, '2026-10-01'::timestamptz);
  -- Volet à tunnel rectangulaire normalement fermé à repos, bobine à émiss… : remise 20% sur PU 1286.025
  PERFORM pg_temp.up_offre(f, 'desenfumage', 'Volet à tunnel rectangulaire normalement fermé à repos, bobine à émission 24 Vcc et contact début/fin de course - RF-T TECHNOLOGIES VU120+MANF VD FDCU 600x400', 'U', 'RF-T TECHNOLOGIES', 'VU120+MANF VD FDCU 600x400', '{"dimensions_mm":"600x400","position_repos":"fermé","commande":"bobine émission 24 Vcc"}'::jsonb, 'VU120+MANF VD FDCU 600x400', 1028.820, 56, 'sur_commande', NULL, '2026-10-01'::timestamptz);
  -- Volet à tunnel rectangulaire normalement fermé à repos, bobine à émiss… : remise 20% sur PU 1361.756
  PERFORM pg_temp.up_offre(f, 'desenfumage', 'Volet à tunnel rectangulaire normalement fermé à repos, bobine à émission 24 Vcc et contact début/fin de course - RF-T TECHNOLOGIES VU120+MANF VD FDCU 800x400', 'U', 'RF-T TECHNOLOGIES', 'VU120+MANF VD FDCU 800x400', '{"dimensions_mm":"800x400","position_repos":"fermé","commande":"bobine émission 24 Vcc"}'::jsonb, 'VU120+MANF VD FDCU 800x400', 1089.405, 56, 'sur_commande', NULL, '2026-10-01'::timestamptz);
END $do$;
