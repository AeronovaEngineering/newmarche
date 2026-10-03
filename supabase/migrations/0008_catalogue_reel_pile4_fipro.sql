-- 0008 — catalogue réel, pile 4 : devis FIPRO DC2609-0451 (air comprimé PARKER, 30/09/2026)
-- Source : devis FIPRO DC2609-0451 du 30/09/2026 (valable jusqu'au 30/10/2026), adressé à Ste BEN MARIEM DE PLOMBERIE ET CHAUFFAGE.
-- Notes : prix = prix net HT par unité APRÈS remise du devis (15 % sécheur K60, 25 % tout le reste), 3 décimales, en DT. Statut 'verifie'.
--         Tubes alu Ø50 / Ø25 : prix par barre de 6 m (unité U, conditionnement 'Barre de 6 m').
--         Marque PARKER pour toutes les lignes (références de la gamme Transair / filtration Parker).
--         Disponibilité et délai non indiqués sur le devis -> sur_commande, délai NULL (à préciser).
--         Nouvelle catégorie racine 'Air comprimé' (air-comprime).
-- Idempotent : relançable sans doublon (fournisseur trouvé par nom, produit par désignation+marque, offre par produit+fournisseur).
-- Nettoyage : DELETE FROM public.fournisseurs WHERE nom LIKE 'FIPRO - %' supprime les offres en cascade ; les produits restent.

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

-- Catégorie nécessaire (idempotent).
INSERT INTO public.categories(nom, slug, parent_id, ordre)
VALUES ('Air comprimé','air-comprime',NULL,4)
ON CONFLICT (slug) DO UPDATE SET nom = EXCLUDED.nom;

DO $do$
DECLARE f uuid;
BEGIN

  -- ===== FIPRO - Filtration et Process =====
  f := pg_temp.up_fourn('FIPRO - Filtration et Process', NULL, '+216 71 29 80 45 / 46', 'contact@fiprotunisie.com', '5 rue 20 Mars, Immeuble Hbiba, appt B4, 2040 Radès', '1170999/L/A/M/000', 'À réception');
  -- Devis : FIPRO DC2609-0451 (30/09/2026, valable jusqu'au 30/10/2026, remise 15 % sécheur / 25 % accessoires)
  -- Sécheur d'air comprimé à adsorption sans chaleur, point de r… : remise 15% sur PU 68000.000
  PERFORM pg_temp.up_offre(f, 'air-comprime', 'Sécheur d''air comprimé à adsorption sans chaleur, point de rosée -40 °C, 620 m³/h à 7 bar, sonde hygrométrique, avec 2 filtres de ligne - PARKER K60/16D3-G230MT', 'U', 'PARKER', 'K60/16D3-G230MT', '{"point_rosee_c":-40,"debit_m3h":620,"pression_ref_bar":7,"pression_min_bar":4,"pression_max_bar":16,"orifice":"2\"","temp_ambiante_max_c":50,"alimentation":"230V 1ph 50/60Hz","etancheite":"IP65","classe_iso_air":"2.2.2","filtres":"AOPX040 1 µm + AAPX040 0,01 µm","garantie_ans":5}'::jsonb, 'K60/16D3-G230MT', 57800.000, NULL, 'sur_commande', NULL, '2026-09-30'::timestamptz);
  -- Tube aluminium bleu Ø50, longueur 6 m - PARKER 1006A50 04 : remise 25% sur PU 594.000
  PERFORM pg_temp.up_offre(f, 'air-comprime', 'Tube aluminium bleu Ø50, longueur 6 m - PARKER 1006A50 04', 'U', 'PARKER', '1006A50 04', '{"diametre_mm":50,"longueur_m":6,"matiere":"aluminium"}'::jsonb, '1006A50 04', 445.500, NULL, 'sur_commande', 'Barre de 6 m', '2026-09-30'::timestamptz);
  -- Clip de fixation Ø50 M10x1,5 - PARKER 6697 50 00 : remise 25% sur PU 17.900
  PERFORM pg_temp.up_offre(f, 'air-comprime', 'Clip de fixation Ø50 M10x1,5 - PARKER 6697 50 00', 'U', 'PARKER', '6697 50 00', '{"diametre_mm":50,"filetage":"M10x1,5"}'::jsonb, '6697 50 00', 13.425, NULL, 'sur_commande', NULL, '2026-09-30'::timestamptz);
  -- Tube aluminium bleu Ø25, longueur 6 m - PARKER 1006A25 04 00 : remise 25% sur PU 300.000
  PERFORM pg_temp.up_offre(f, 'air-comprime', 'Tube aluminium bleu Ø25, longueur 6 m - PARKER 1006A25 04 00', 'U', 'PARKER', '1006A25 04 00', '{"diametre_mm":25,"longueur_m":6,"matiere":"aluminium"}'::jsonb, '1006A25 04 00', 225.000, NULL, 'sur_commande', 'Barre de 6 m', '2026-09-30'::timestamptz);
  -- Clip de fixation Ø25 M8x1,25 - PARKER 6697 25 00 : remise 25% sur PU 11.500
  PERFORM pg_temp.up_offre(f, 'air-comprime', 'Clip de fixation Ø25 M8x1,25 - PARKER 6697 25 00', 'U', 'PARKER', '6697 25 00', '{"diametre_mm":25,"filetage":"M8x1,25"}'::jsonb, '6697 25 00', 8.625, NULL, 'sur_commande', NULL, '2026-09-30'::timestamptz);
  -- Adaptateur pour clip - PARKER 6697 00 02 : remise 25% sur PU 9.510
  PERFORM pg_temp.up_offre(f, 'air-comprime', 'Adaptateur pour clip - PARKER 6697 00 02', 'U', 'PARKER', '6697 00 02', '{}'::jsonb, '6697 00 02', 7.133, NULL, 'sur_commande', NULL, '2026-09-30'::timestamptz);
  -- Tuyau souple 2 m pour ligne Ø50 - PARKER 1001E50 00 04 : remise 25% sur PU 1100.000
  PERFORM pg_temp.up_offre(f, 'air-comprime', 'Tuyau souple 2 m pour ligne Ø50 - PARKER 1001E50 00 04', 'U', 'PARKER', '1001E50 00 04', '{"diametre_mm":50,"longueur_m":2}'::jsonb, '1001E50 00 04', 825.000, NULL, 'sur_commande', NULL, '2026-09-30'::timestamptz);
  -- Ensemble anti-coup de fouet pour tuyau souple Transair Ø50 -… : remise 25% sur PU 214.000
  PERFORM pg_temp.up_offre(f, 'air-comprime', 'Ensemble anti-coup de fouet pour tuyau souple Transair Ø50 - PARKER 6698 99 03', 'U', 'PARKER', '6698 99 03', '{"diametre_mm":50}'::jsonb, '6698 99 03', 160.500, NULL, 'sur_commande', NULL, '2026-09-30'::timestamptz);
  -- Piquage fileté BSP conique 2" S, sécheur vers tuyaux souples… : remise 25% sur PU 235.000
  PERFORM pg_temp.up_offre(f, 'air-comprime', 'Piquage fileté BSP conique 2" S, sécheur vers tuyaux souples Ø50 - PARKER 6605 50 48', 'U', 'PARKER', '6605 50 48', '{"diametre_mm":50,"filetage":"BSP conique 2\""}'::jsonb, '6605 50 48', 176.250, NULL, 'sur_commande', NULL, '2026-09-30'::timestamptz);
  -- Bride simple à pose rapide Ø50 vers Ø25 - PARKER RA69 50 25 : remise 25% sur PU 163.000
  PERFORM pg_temp.up_offre(f, 'air-comprime', 'Bride simple à pose rapide Ø50 vers Ø25 - PARKER RA69 50 25', 'U', 'PARKER', 'RA69 50 25', '{"diametre_mm":50,"diametre_sortie_mm":25}'::jsonb, 'RA69 50 25', 122.250, NULL, 'sur_commande', NULL, '2026-09-30'::timestamptz);
  -- Purgeur de condensats automatique G 1/2 - PARKER ED3004_G_23… : remise 25% sur PU 955.000
  PERFORM pg_temp.up_offre(f, 'air-comprime', 'Purgeur de condensats automatique G 1/2 - PARKER ED3004_G_230', 'U', 'PARKER', 'ED3004_G_230', '{"raccord":"G 1/2","alimentation":"230V"}'::jsonb, 'ED3004_G_230', 716.250, NULL, 'sur_commande', NULL, '2026-09-30'::timestamptz);
  -- Filtre / régulateur 1" - PARKER FP3YEA98ESABNFN : remise 25% sur PU 795.000
  PERFORM pg_temp.up_offre(f, 'air-comprime', 'Filtre / régulateur 1" - PARKER FP3YEA98ESABNFN', 'U', 'PARKER', 'FP3YEA98ESABNFN', '{"raccord":"1\""}'::jsonb, 'FP3YEA98ESABNFN', 596.250, NULL, 'sur_commande', NULL, '2026-09-30'::timestamptz);
END $do$;
