-- 0009 — catalogue réel, pile 5 : COTUN (COGES) 2025, SAME (devis D2502933) et ensembles du bordereau "Villa Moussa Ahmed"
-- Sources : consultation_fournisseur_05102026.pdf
--   1) COTUN/COGES DEV-COTUN-250901591 (08/09/2025, remise 30 %) : Hitachi SET FREE SIGMA + splits New airHome 400
--   2) COTUN/COGES DEV-COTUN-250801518 (26/08/2025, remise 20 %) : plancher chauffant EUROTHERM (chantier Villa Borj Touil)
--   3) SAME D2502933 (03/09/2025) : chaufferie, plancher chauffant, radiateurs, régulation (projet Villa Moussa Ahmed)
--   4) Bordereau lot Fluides / chauffage et ECS (villa Borj Touil, Ariana) : ensembles sans fournisseur -> 'Projet Villa Moussa Ahmed (fournisseur à confirmer)'
-- ATTENTION : ces devis datent d'août-septembre 2025 (validités expirées : 10/10/2025 et 23/10/2025). date_maj = date du devis, pour que l'âge du prix reste visible.
-- Fournisseurs : COTUN existe déjà (0003, même contact et e-mail coges-tn.com) -> on complète adresse et matricule fiscal s'ils sont vides, sans rien écraser.
--                SAME et 'Projet Villa Moussa Ahmed (fournisseur à confirmer)' sont créés.
-- Prix = prix net HT par unité APRÈS remise (3 décimales, DT). Statut 'verifie'.
-- Disponibilité : non indiquée sur les devis COTUN -> sur_commande ; SAME : D.Liv MA -> en_stock, DE -> sur_commande.
-- Nouvelles catégories : chauffage (plancher-chauffant, radiateurs-seche-serviettes, production-chaleur, circulateurs-pompes, regulation-chauffage)
--                        et sous plomberie : tube-multicouche, raccords-robinetterie, traitement-eau. Unités 'm2' et 'kg' utilisées pour la première fois.
-- Idempotent : relançable sans doublon (fournisseur par nom, produit par désignation+marque, offre par produit+fournisseur).
-- Nettoyage du projet : DELETE FROM public.fournisseurs WHERE nom LIKE 'Projet Villa Moussa Ahmed%'; (les offres partent en cascade, les produits restent).
--             SAME : DELETE FROM public.fournisseurs WHERE nom = 'SAME';

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

-- Catégories (idempotent, un parent déjà rangé n'est pas déplacé). Un INSERT par niveau.
INSERT INTO public.categories(nom, slug, parent_id, ordre)
SELECT v.nom, v.slug, p.id, v.ordre FROM (VALUES
 ('Plomberie','plomberie',NULL::text,1),
 ('Chauffage et ECS','chauffage',NULL::text,5)
) AS v(nom, slug, parent, ordre)
LEFT JOIN public.categories p ON p.slug = v.parent
ON CONFLICT (slug) DO UPDATE SET nom = EXCLUDED.nom, parent_id = COALESCE(public.categories.parent_id, EXCLUDED.parent_id);

INSERT INTO public.categories(nom, slug, parent_id, ordre)
SELECT v.nom, v.slug, p.id, v.ordre FROM (VALUES
 ('Plancher chauffant','plancher-chauffant','chauffage'::text,1),
 ('Radiateurs et sèche-serviettes','radiateurs-seche-serviettes','chauffage'::text,2),
 ('Production de chaleur et ECS','production-chaleur','chauffage'::text,3),
 ('Circulateurs et pompes','circulateurs-pompes','chauffage'::text,4),
 ('Régulation chauffage','regulation-chauffage','chauffage'::text,5),
 ('Tubes multicouche et PER','tube-multicouche','plomberie'::text,6),
 ('Raccords et robinetterie','raccords-robinetterie','plomberie'::text,7),
 ('Adoucisseurs et traitement d''eau','traitement-eau','plomberie'::text,8)
) AS v(nom, slug, parent, ordre)
LEFT JOIN public.categories p ON p.slug = v.parent
ON CONFLICT (slug) DO UPDATE SET nom = EXCLUDED.nom, parent_id = COALESCE(public.categories.parent_id, EXCLUDED.parent_id);

DO $do$
DECLARE f uuid;
BEGIN

  -- ===== COTUN (= COGES, Comptoir Général Equipement Sanitaire) : fournisseur déjà présent (0003), on complète =====
  f := pg_temp.up_fourn('COTUN', 'Asma Ben Whiba (équipe climatisation Tunis)', '+216 28 872 742', 'asma.ben.whiba@coges-tn.com', 'Av. 13 Août, Z.I. Poudrière 1, CP 3099 Sfax (showroom Tunis : 70 Av. Fatouma Bourguiba, 2036 La Soukra)', '08386 T/A/M/000', 'Virement');
  -- Devis COTUN DEV-COTUN-250901591 (08/09/2025, remise 30 %, validité 23/10/2025 - expirée)
  -- PU 25567.191 -30 %
  PERFORM pg_temp.up_offre(f, 'unites-exterieures', 'Unité extérieure DRV SET FREE SIGMA 2 tubes 12 CV R410A - HITACHI RAS-12FSNSE1', 'U', 'HITACHI', 'RAS-12FSNSE1', '{"puissance_cv":12,"fluide":"R410A","gamme":"SET FREE SIGMA","type":"DRV 2 tubes"}'::jsonb, 'RAS-12FSNSE1', 17897.034, NULL, 'sur_commande', NULL, '2025-09-08'::timestamptz);
  -- PU 3354.012 -30 % (2 lignes de 2 sur le devis -> une seule offre)
  PERFORM pg_temp.up_offre(f, 'unites-interieures', 'Unité intérieure DRV gainable pression statique moyenne (150 Pa) 5,6 kW - HITACHI RPI-2.0FSR1E', 'U', 'HITACHI', 'RPI-2.0FSR1E', '{"puissance_kw":5.6,"pression_statique_pa":150}'::jsonb, 'RPI-2.0FSR1E', 2347.808, NULL, 'sur_commande', NULL, '2025-09-08'::timestamptz);
  -- PU 3645.346 -30 %
  PERFORM pg_temp.up_offre(f, 'unites-interieures', 'Unité intérieure DRV gainable pression statique moyenne (150 Pa) 8 kW - HITACHI RPI-3.0FSR1E', 'U', 'HITACHI', 'RPI-3.0FSR1E', '{"puissance_kw":8,"pression_statique_pa":150}'::jsonb, 'RPI-3.0FSR1E', 2551.742, NULL, 'sur_commande', NULL, '2025-09-08'::timestamptz);
  -- Accessoire de commande HITACHI HCWA10NEGQ (248.086) : ignoré, déjà présent via DEV-COTUN-260902651/661 (21/09/2026, même prix, plus récent)
  -- PU 312.850 -30 % ; ATTENTION référence partiellement coupée sur le scan ('…-102SN4'), 'MC-' déduit -> à vérifier
  PERFORM pg_temp.up_offre(f, 'accessoires-clim', 'Multikit DRV - HITACHI MC-102SN4', 'U', 'HITACHI', 'MC-102SN4', '{}'::jsonb, 'MC-102SN4', 218.995, NULL, 'sur_commande', NULL, '2025-09-08'::timestamptz);
  -- PU 394.321 -30 % ; référence partiellement coupée ('…-162SN4'), 'MC-' déduit -> à vérifier
  PERFORM pg_temp.up_offre(f, 'accessoires-clim', 'Multikit DRV - HITACHI MC-162SN4', 'U', 'HITACHI', 'MC-162SN4', '{}'::jsonb, 'MC-162SN4', 276.025, NULL, 'sur_commande', NULL, '2025-09-08'::timestamptz);
  -- PU 974.546 -30 %
  PERFORM pg_temp.up_offre(f, 'unites-interieures', 'Unité intérieure split mural inverter New airHome 400 9000 BTU/h - HITACHI RAK-DJ25RHAE', 'U', 'HITACHI', 'RAK-DJ25RHAE', '{"btu":9000,"gamme":"New airHome 400"}'::jsonb, 'RAK-DJ25RHAE', 682.182, NULL, 'sur_commande', NULL, '2025-09-08'::timestamptz);
  -- PU 1886.887 -30 %
  PERFORM pg_temp.up_offre(f, 'unites-exterieures', 'Unité extérieure split mural inverter New airHome 400 9000 BTU/h - HITACHI RAC-DJ25WHAE', 'U', 'HITACHI', 'RAC-DJ25WHAE', '{"btu":9000,"gamme":"New airHome 400"}'::jsonb, 'RAC-DJ25WHAE', 1320.821, NULL, 'sur_commande', NULL, '2025-09-08'::timestamptz);
  -- PU 1016.016 -30 %
  PERFORM pg_temp.up_offre(f, 'unites-interieures', 'Unité intérieure split mural inverter réversible New airHome 400 12000 BTU/h - HITACHI RAK-DJ35RHAE', 'U', 'HITACHI', 'RAK-DJ35RHAE', '{"btu":12000,"gamme":"New airHome 400","reversible":true}'::jsonb, 'RAK-DJ35RHAE', 711.211, NULL, 'sur_commande', NULL, '2025-09-08'::timestamptz);
  -- PU 2021.664 -30 %
  PERFORM pg_temp.up_offre(f, 'unites-exterieures', 'Unité extérieure split mural inverter réversible New airHome 400 12000 BTU/h - HITACHI RAC-DJ35WHAE', 'U', 'HITACHI', 'RAC-DJ35WHAE', '{"btu":12000,"gamme":"New airHome 400","reversible":true}'::jsonb, 'RAC-DJ35WHAE', 1415.165, NULL, 'sur_commande', NULL, '2025-09-08'::timestamptz);
  -- Devis COTUN DEV-COTUN-250801518 (26/08/2025, remise 20 %, validité 10/10/2025 - expirée, chantier Villa Borj Touil) : EUROTHERM plancher chauffant
  -- Références Eurotherm : premier caractère coupé sur le scan pour la plupart, chiffres visibles conservés
  -- prix au m² : PU 42.674 -20 %
  PERFORM pg_temp.up_offre(f, 'plancher-chauffant', 'Plaque à plots plancher chauffant TF 20/41-150 KPA (1,12 m²) - EUROTHERM', 'm2', 'EUROTHERM', '211030221', '{"epaisseur_mm":"20/41","surface_plaque_m2":1.12}'::jsonb, '211030221', 34.139, NULL, 'sur_commande', 'Plaque de 1,12 m²', '2025-08-26'::timestamptz);
  -- prix au ml : PU 3.361 -20 %
  PERFORM pg_temp.up_offre(f, 'tube-multicouche', 'Tube MIDIX PLUS 16x2 pour plancher chauffant - EUROTHERM', 'ml', 'EUROTHERM', '610160320', '{"diametre_mm":16,"epaisseur_mm":2}'::jsonb, '610160320', 2.689, NULL, 'sur_commande', 'Rouleau de 560 m', '2025-08-26'::timestamptz);
  -- PU 908.320 -20 %
  PERFORM pg_temp.up_offre(f, 'plancher-chauffant', 'Collecteur SL 1" 7+7 voies complet - EUROTHERM', 'U', 'EUROTHERM', '120010107', '{"voies":7,"diametre":"1\""}'::jsonb, '120010107', 726.656, NULL, 'sur_commande', NULL, '2025-08-26'::timestamptz);
  -- PU 999.098 -20 %
  PERFORM pg_temp.up_offre(f, 'plancher-chauffant', 'Collecteur SL 1" 8+8 voies complet - EUROTHERM', 'U', 'EUROTHERM', '120010108', '{"voies":8,"diametre":"1\""}'::jsonb, '120010108', 799.278, NULL, 'sur_commande', NULL, '2025-08-26'::timestamptz);
  -- PU 10.049 -20 %
  PERFORM pg_temp.up_offre(f, 'plancher-chauffant', 'Raccord à visser 16x3/4" F - EUROTHERM', 'U', 'EUROTHERM', '810162001', '{"diametre_tube_mm":16,"raccord":"3/4\" F"}'::jsonb, '810162001', 8.039, NULL, 'sur_commande', NULL, '2025-08-26'::timestamptz);
  -- PU 86.604 -20 %
  PERFORM pg_temp.up_offre(f, 'regulation-chauffage', 'Tête électrothermique 230 V - 2,5 W - EUROTHERM', 'U', 'EUROTHERM', '150020201', '{"tension":"230 V","puissance_w":2.5}'::jsonb, '150020201', 69.283, NULL, 'sur_commande', NULL, '2025-08-26'::timestamptz);
  -- prix au ml : PU 4.777 -20 %
  PERFORM pg_temp.up_offre(f, 'plancher-chauffant', 'Bande périphérique double (H 140x4+2) - EUROTHERM', 'ml', 'EUROTHERM', '111060114', '{}'::jsonb, '111060114', 3.821, NULL, 'sur_commande', NULL, '2025-08-26'::timestamptz);
  -- PU 394.678 -20 %
  PERFORM pg_temp.up_offre(f, 'regulation-chauffage', 'Thermostat programmable EVO avec affichage - EUROTHERM', 'U', 'EUROTHERM', '150020114', '{}'::jsonb, '150020114', 315.742, NULL, 'sur_commande', NULL, '2025-08-26'::timestamptz);
  -- prix au kg : PU 15.046 -20 %
  PERFORM pg_temp.up_offre(f, 'plancher-chauffant', 'Adjuvant EUROPLAST pour chape (bidon de 10 kg) - EUROTHERM', 'kg', 'EUROTHERM', '310010101', '{}'::jsonb, '310010101', 12.037, NULL, 'sur_commande', 'Bidon de 10 kg', '2025-08-26'::timestamptz);

  -- ===== SAME : nouveau fournisseur =====
  f := pg_temp.up_fourn('SAME', 'Nadhem (devis établi par)', '+216 71 330 164 / 71 256 165', NULL, '64 Bis Rue Ibn Khaldoun, 1001 Tunis', '0002335FAM000', NULL);
  -- Devis SAME D2502933 (03/09/2025, projet Villa Moussa Ahmed) : prix net = montant HT / quantité, 3 décimales.
  -- D.Liv 'MA' -> en_stock ; 'DE' -> sur_commande (sans délai). Ballon et vase d'expansion : TVA 7 % sur le devis. Marque non indiquée sur le devis -> NULL (noms de marque conservés dans les désignations).
  -- montant 4870.373 pour 2
  PERFORM pg_temp.up_offre(f, 'production-chaleur', 'Chaudière murale mixte à ventouse gaz naturel - MYNUTE S 35 CSI', 'U', NULL, NULL, '{"puissance_kw":35,"gaz":"naturel"}'::jsonb, '03520069392', 2435.187, NULL, 'en_stock', NULL, '2025-09-03'::timestamptz);
  PERFORM pg_temp.up_offre(f, 'production-chaleur', 'Ventouse pour chaudière standard COAS 60/100 AL/PPU (20162798/799)', 'U', NULL, NULL, '{}'::jsonb, '03720066929', 75.205, NULL, 'en_stock', NULL, '2025-09-03'::timestamptz);
  -- TVA 7 %
  PERFORM pg_temp.up_offre(f, 'production-chaleur', 'Ballon simple échangeur ST FB WB 200 V003 (200 L)', 'U', NULL, NULL, '{"capacite_l":200}'::jsonb, '036C2330042', 2019.485, NULL, 'en_stock', NULL, '2025-09-03'::timestamptz);
  PERFORM pg_temp.up_offre(f, 'production-chaleur', 'Mitigeur thermostatique 3/4" S101', 'U', NULL, NULL, '{}'::jsonb, '0361150529', 170.941, NULL, 'en_stock', NULL, '2025-09-03'::timestamptz);
  -- TVA 7 %
  PERFORM pg_temp.up_offre(f, 'production-chaleur', 'Vase d''expansion solaire 24 L', 'U', NULL, NULL, '{"capacite_l":24}'::jsonb, '0361150509', 157.325, NULL, 'en_stock', NULL, '2025-09-03'::timestamptz);
  PERFORM pg_temp.up_offre(f, 'circulateurs-pompes', 'Circulateur eau chaude sanitaire STAR-Z 25/6 MN', 'U', NULL, NULL, '{}'::jsonb, '099WSA40475', 671.500, NULL, 'en_stock', NULL, '2025-09-03'::timestamptz);
  PERFORM pg_temp.up_offre(f, 'circulateurs-pompes', 'Kit raccord G1"1/2 > G1" pour circulateur sanitaire', 'U', NULL, NULL, '{}'::jsonb, '099WAS11204', 17.000, NULL, 'en_stock', NULL, '2025-09-03'::timestamptz);
  -- ligne 'transfo avec mamelon et catalogue' (101TRADVW) sans prix : ignorée
  PERFORM pg_temp.up_offre(f, 'traitement-eau', 'Adoucisseur compact volumétrique PURICOM DENVER 30 L', 'U', NULL, NULL, '{}'::jsonb, '016ADVD30L', 1820.114, NULL, 'en_stock', NULL, '2025-09-03'::timestamptz);
  PERFORM pg_temp.up_offre(f, 'plancher-chauffant', 'Plaque à plots SAME FLOOR H45 1130x635 mm (0,71 m²)', 'U', NULL, NULL, '{"surface_m2":0.71,"hauteur_mm":45}'::jsonb, '39R07342512', 17.850, NULL, 'sur_commande', NULL, '2025-09-03'::timestamptz);
  PERFORM pg_temp.up_offre(f, 'plancher-chauffant', 'Isolation périphérique polyéthylène avec bande adhésive, longueur 25 m', 'U', NULL, NULL, '{}'::jsonb, '26ISOBOARDS', 99.206, NULL, 'sur_commande', NULL, '2025-09-03'::timestamptz);
  PERFORM pg_temp.up_offre(f, 'plancher-chauffant', 'Additif pour chape, bidon de 10 kg', 'U', NULL, NULL, '{}'::jsonb, '26UFHADN10', 169.578, NULL, 'sur_commande', 'Bidon de 10 kg', '2025-09-03'::timestamptz);
  -- prix au ml (rouleau de 50 m)
  PERFORM pg_temp.up_offre(f, 'tube-multicouche', 'Tube préisolé RIXc 26x3, isolant 6 mm, bleu', 'ml', NULL, NULL, '{"diametre_mm":26,"epaisseur_mm":3,"isolant_mm":6,"couleur":"bleu"}'::jsonb, '21RR50ISO4R', 10.187, NULL, 'sur_commande', 'Rouleau de 50 m', '2025-09-03'::timestamptz);
  -- même référence que le bleu sur le devis
  PERFORM pg_temp.up_offre(f, 'tube-multicouche', 'Tube préisolé RIXc 26x3, isolant 6 mm, rouge', 'ml', NULL, NULL, '{"diametre_mm":26,"epaisseur_mm":3,"isolant_mm":6,"couleur":"rouge"}'::jsonb, '21RR50ISO4R', 10.187, NULL, 'en_stock', 'Rouleau de 50 m', '2025-09-03'::timestamptz);
  -- prix au ml
  PERFORM pg_temp.up_offre(f, 'tube-multicouche', 'Tube multicouche RIXc 16x2 (HENCO PE-Xc/AL/PE-Xc), rouleau de 100 m', 'ml', NULL, NULL, '{"diametre_mm":16,"epaisseur_mm":2}'::jsonb, '21RR100R160', 2.700, NULL, 'sur_commande', 'Rouleau de 100 m', '2025-09-03'::timestamptz);
  PERFORM pg_temp.up_offre(f, 'plancher-chauffant', 'Module de distribution basse température 1B avec circulateur', 'U', NULL, NULL, '{}'::jsonb, '39R004', 1033.507, NULL, 'en_stock', NULL, '2025-09-03'::timestamptz);
  PERFORM pg_temp.up_offre(f, 'plancher-chauffant', 'Module de distribution haute température 1A avec circulateur', 'U', NULL, NULL, '{}'::jsonb, '39R003', 831.789, NULL, 'en_stock', NULL, '2025-09-03'::timestamptz);
  PERFORM pg_temp.up_offre(f, 'plancher-chauffant', 'Collecteur hydraulique pour module de distribution R003 ou R004', 'U', NULL, NULL, '{}'::jsonb, '39785', 342.219, NULL, 'en_stock', NULL, '2025-09-03'::timestamptz);
  PERFORM pg_temp.up_offre(f, 'plancher-chauffant', 'Kit de fixation sur le mur pour collecteur hydraulique', 'U', NULL, NULL, '{}'::jsonb, '39788', 59.500, NULL, 'en_stock', NULL, '2025-09-03'::timestamptz);
  PERFORM pg_temp.up_offre(f, 'plancher-chauffant', 'Bouchon pour collecteur hydraulique 785', 'U', NULL, NULL, '{}'::jsonb, '39790', 32.432, NULL, 'en_stock', NULL, '2025-09-03'::timestamptz);
  PERFORM pg_temp.up_offre(f, 'raccords-robinetterie', 'Bouchon collecteur laiton nickelé mâle 1"', 'U', NULL, NULL, '{}'::jsonb, '008BCLNM003', 3.152, NULL, 'en_stock', NULL, '2025-09-03'::timestamptz);
  PERFORM pg_temp.up_offre(f, 'plancher-chauffant', 'Collecteur plancher chauffant REGLAB avec mesure de débit 1" 12 voies synthétique', 'U', NULL, NULL, '{"voies":12}'::jsonb, '25CI03R12', 842.914, NULL, 'en_stock', NULL, '2025-09-03'::timestamptz);
  PERFORM pg_temp.up_offre(f, 'plancher-chauffant', 'Collecteur plancher chauffant REGLAB avec mesure de débit 1" 5 voies synthétique', 'U', NULL, NULL, '{"voies":5}'::jsonb, '25CI03R05', 575.058, NULL, 'en_stock', NULL, '2025-09-03'::timestamptz);
  PERFORM pg_temp.up_offre(f, 'plancher-chauffant', 'Raccord à visser eurocone 3/4" F 16', 'U', NULL, NULL, '{}'::jsonb, '24EK16', 6.975, NULL, 'en_stock', NULL, '2025-09-03'::timestamptz);
  PERFORM pg_temp.up_offre(f, 'raccords-robinetterie', 'Coude laiton nickelé MM 1"', 'U', NULL, NULL, '{}'::jsonb, '008CLNMM003', 10.969, NULL, 'en_stock', NULL, '2025-09-03'::timestamptz);
  PERFORM pg_temp.up_offre(f, 'raccords-robinetterie', 'Coude laiton jaune MM 1"', 'U', NULL, NULL, '{}'::jsonb, '008CLJMM003', 11.627, NULL, 'en_stock', NULL, '2025-09-03'::timestamptz);
  PERFORM pg_temp.up_offre(f, 'raccords-robinetterie', 'Vanne sphérique SAS 1030 passage standard 1"', 'U', NULL, NULL, '{}'::jsonb, '084VS003', 27.158, NULL, 'en_stock', NULL, '2025-09-03'::timestamptz);
  PERFORM pg_temp.up_offre(f, 'raccords-robinetterie', 'Mamelon laiton jaune 1"', 'U', NULL, NULL, '{}'::jsonb, '008MLJ003', 5.381, NULL, 'en_stock', NULL, '2025-09-03'::timestamptz);
  PERFORM pg_temp.up_offre(f, 'raccords-robinetterie', 'Raccord écrou prisonnier à sertir 26x1"', 'U', NULL, NULL, '{}'::jsonb, '013SREP263', 16.745, NULL, 'en_stock', NULL, '2025-09-03'::timestamptz);
  PERFORM pg_temp.up_offre(f, 'regulation-chauffage', 'Thermostat d''ambiance sans fil avec affichage digital', 'U', NULL, NULL, '{}'::jsonb, '26UFHTERM', 240.325, NULL, 'en_stock', NULL, '2025-09-03'::timestamptz);
  PERFORM pg_temp.up_offre(f, 'regulation-chauffage', 'Électrovanne 230 V normalement fermée C2', 'U', NULL, NULL, '{}'::jsonb, '26UFHACT23', 98.323, NULL, 'en_stock', NULL, '2025-09-03'::timestamptz);
  PERFORM pg_temp.up_offre(f, 'regulation-chauffage', 'Unité de commande programmable pour 6 thermostats avec fil 230 V + commande pompe', 'U', NULL, NULL, '{}'::jsonb, '26UFH-ZONE', 552.500, NULL, 'en_stock', NULL, '2025-09-03'::timestamptz);
  PERFORM pg_temp.up_offre(f, 'regulation-chauffage', 'Armoire de commande pour 3 pompes de distribution', 'U', NULL, NULL, '{}'::jsonb, '39AC3P', 582.250, NULL, 'en_stock', NULL, '2025-09-03'::timestamptz);
  PERFORM pg_temp.up_offre(f, 'radiateurs-seche-serviettes', 'Bloc de 6 éléments radiateur aluminium REGINA R 500 (724,8 W ΔT50°)', 'U', NULL, NULL, '{}'::jsonb, '087JS50006', 182.861, NULL, 'en_stock', NULL, '2025-09-03'::timestamptz);
  PERFORM pg_temp.up_offre(f, 'radiateurs-seche-serviettes', 'Couple robinet et té de réglage radiateur 1/2" x 1/2"', 'U', NULL, NULL, '{}'::jsonb, '396170R104', 20.819, NULL, 'en_stock', NULL, '2025-09-03'::timestamptz);
  PERFORM pg_temp.up_offre(f, 'radiateurs-seche-serviettes', 'Buse multicouche pour robinet radiateur 16x1/2"', 'U', NULL, NULL, '{}'::jsonb, '013VEK16', 2.309, NULL, 'en_stock', NULL, '2025-09-03'::timestamptz);
  PERFORM pg_temp.up_offre(f, 'radiateurs-seche-serviettes', 'Kit 11 pièces universel 1/2" avec support pour radiateur aluminium', 'U', NULL, NULL, '{}'::jsonb, '087AKIT002', 8.460, NULL, 'en_stock', NULL, '2025-09-03'::timestamptz);
  PERFORM pg_temp.up_offre(f, 'radiateurs-seche-serviettes', 'Kit paire de consoles de fixation pour radiateur aluminium', 'U', NULL, NULL, '{}'::jsonb, '087AKIT004', 2.700, NULL, 'en_stock', NULL, '2025-09-03'::timestamptz);
  PERFORM pg_temp.up_offre(f, 'radiateurs-seche-serviettes', 'Sèche-serviettes aluminium FAST HEAT+ H 1120 x L 480 entraxe 455 blanc', 'U', NULL, NULL, '{}'::jsonb, '086SSA11800', 313.650, NULL, 'en_stock', NULL, '2025-09-03'::timestamptz);

  -- ===== Projet Villa Moussa Ahmed (fournisseur à confirmer) =====
  f := pg_temp.up_fourn('Projet Villa Moussa Ahmed (fournisseur à confirmer)', NULL, NULL, NULL, NULL, NULL, NULL);
  -- Bordereau 'Lot Fluides - Chauffage et production d''ECS' (villa Borj Touil, Ariana) : prix unitaires surlignés. Pas de fournisseur indiqué.
  -- Seuls les ENSEMBLES sont enregistrés ici. Les lignes du bordereau identiques à un article SAME (ballon, mitigeur, vase, adoucisseur, thermostat,
  -- vanne thermoélectrique, tubes préisolé et multicouche) ne sont pas dupliquées : elles sont déjà au catalogue via SAME.
  -- Non enregistrés : IV.3 chauffe-eau solaire (N.D), IV.7.7 travaux électriques (prestation), IV.9.1 PPR calorifugé DN25/DN32 (ND).
  -- IV.1 = chaudière MYNUTE S 35 CSI (2435.187) + ventouse COAS 60/100 (75.205) du devis SAME
  PERFORM pg_temp.up_offre(f, 'production-chaleur', 'Chaudière à ventouse murale gaz naturel 35 kW avec ventouse (ensemble)', 'U', NULL, NULL, '{"puissance_kw":35}'::jsonb, NULL, 2510.391, NULL, 'en_stock', NULL, '2025-09-03'::timestamptz);
  -- IV.5 = circulateur STAR-Z 25/6 (671.500) + kit raccord (17.000) du devis SAME
  PERFORM pg_temp.up_offre(f, 'circulateurs-pompes', 'Pompe de retour eau chaude sanitaire à corps laiton Star-Z 25/6, 3 vitesses, 1 m³/h - 6 mCE, avec kit de raccord (ensemble)', 'U', NULL, NULL, '{"debit_m3h":1,"hmt_mce":6}'::jsonb, NULL, 688.500, NULL, 'en_stock', NULL, '2025-09-03'::timestamptz);
  -- IV.7.1 prix au m² : ensemble du bordereau, non reconstitué ligne par ligne
  PERFORM pg_temp.up_offre(f, 'plancher-chauffant', 'Plancher chauffant basse température au m² : tube PEX 16x2, dalle à plots 20 mm, bande périphérique, clips (fourniture)', 'm2', NULL, NULL, '{}'::jsonb, NULL, 58.340, NULL, 'sur_commande', NULL, '2025-09-03'::timestamptz);
  -- IV.7.2 (pompe RDC et pompe étage, même prix) = module 39R004 + collecteur hydraulique + kit fixation + bouchons du devis SAME
  PERFORM pg_temp.up_offre(f, 'plancher-chauffant', 'Ensemble de distribution basse température avec circulateur 2,5 m³/h - 6 mCE (module, collecteur hydraulique, kit de fixation, bouchons)', 'U', NULL, NULL, '{"debit_m3h":2.5,"hmt_mce":6}'::jsonb, NULL, 1470.809, NULL, 'en_stock', NULL, '2025-09-03'::timestamptz);
  -- IV.7.3 ensemble du bordereau, non reconstitué ligne par ligne
  PERFORM pg_temp.up_offre(f, 'plancher-chauffant', 'Collecteur modulaire plancher chauffant DN25 12 voies équipé (départ avec débitmètre, retour avec robinets thermostatisables, raccords)', 'U', NULL, NULL, '{"voies":12}'::jsonb, NULL, 1130.819, NULL, 'en_stock', NULL, '2025-09-03'::timestamptz);
  -- IV.7.3 ensemble du bordereau
  PERFORM pg_temp.up_offre(f, 'plancher-chauffant', 'Collecteur modulaire plancher chauffant DN25 5 voies équipé (départ avec débitmètre, retour avec robinets thermostatisables, raccords)', 'U', NULL, NULL, '{"voies":5}'::jsonb, NULL, 766.629, NULL, 'en_stock', NULL, '2025-09-03'::timestamptz);
  -- IV.7.3 : même prix que le 5 voies sur le bordereau (le devis SAME n'a que des 5 et 12 voies)
  PERFORM pg_temp.up_offre(f, 'plancher-chauffant', 'Collecteur modulaire plancher chauffant DN25 4 voies équipé (départ avec débitmètre, retour avec robinets thermostatisables, raccords)', 'U', NULL, NULL, '{"voies":4}'::jsonb, NULL, 766.629, NULL, 'en_stock', NULL, '2025-09-03'::timestamptz);
  -- IV.8.1 = module 39R003 + collecteur hydraulique + kit fixation + 2 bouchons du devis SAME
  PERFORM pg_temp.up_offre(f, 'plancher-chauffant', 'Ensemble de distribution haute température avec circulateur 2,5 m³/h - 6 mCE (module, collecteur hydraulique, kit de fixation, bouchons)', 'U', NULL, NULL, '{"debit_m3h":2.5,"hmt_mce":6}'::jsonb, NULL, 1298.372, NULL, 'en_stock', NULL, '2025-09-03'::timestamptz);
  -- IV.8.2 = bloc 6 éléments REGINA R 500 + robinet/té + buses + kit 11 pièces + consoles du devis SAME
  PERFORM pg_temp.up_offre(f, 'radiateurs-seche-serviettes', 'Radiateur aluminium hauteur 60 cm T22 600x480 avec robinetterie et accessoires de pose (ensemble)', 'U', NULL, NULL, '{}'::jsonb, NULL, 219.456, NULL, 'en_stock', NULL, '2025-09-03'::timestamptz);
  -- IV.8.3 = sèche-serviettes FAST HEAT+ + robinet/té + buses du devis SAME
  PERFORM pg_temp.up_offre(f, 'radiateurs-seche-serviettes', 'Radiateur sèche-serviettes pour salle de bain 700 W (75/65/22 °C) avec robinetterie (ensemble)', 'U', NULL, NULL, '{"puissance_w":700}'::jsonb, NULL, 339.086, NULL, 'en_stock', NULL, '2025-09-03'::timestamptz);
END $do$;
