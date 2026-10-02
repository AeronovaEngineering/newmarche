-- 0003 — catalogue réel, pile 1 : devis MEDCLIM, STC, COTUN, Global Equipement Fluides, A2C, General Metal
-- Sources : offres de prix de septembre 2026 (MEDCLIM 26091225/AB et 26091246/AB, STC STCDV26095144, COTUN DEV-COTUN-260902651/-2661,
--           Global Equipement Fluides DV264834, A2C DV-26/3980-3982-3984, General Metal 52609251) + fiches techniques jointes.
-- Notes : devis A2C -> un seul prix par article (le plus bas) ; la ligne CL40 du 3982 (libellée SDR11, prix/code du SDR9) est rangée en SDR9.
--         General Metal : manomètre, robinet porte-manomètre et tube Ø54 sont cotés sans remise ni quantité (prix liste = prix net).
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
 ('Protection incendie','incendie',NULL::text,3),
 ('Réseau Gaz','reseau-gaz',NULL::text,0)
) AS v(nom, slug, parent, ordre)
LEFT JOIN public.categories p ON p.slug = v.parent
ON CONFLICT (slug) DO UPDATE SET nom = EXCLUDED.nom, parent_id = COALESCE(public.categories.parent_id, EXCLUDED.parent_id);

INSERT INTO public.categories(nom, slug, parent_id, ordre)
SELECT v.nom, v.slug, p.id, v.ordre FROM (VALUES
 ('Climatisation','clim','cvc'::text,1),
 ('Grilles et bouches d''air','grilles-bouches','cvc'::text,3),
 ('Caissons et ventilateurs d''extraction','caissons-ventilateurs','cvc'::text,4),
 ('Variateurs, registres et coupe-courants','regulation-ventilation','cvc'::text,5),
 ('Désenfumage','desenfumage','incendie'::text,2),
 ('Tuyauterie PPR','tuyau-ppr','plomberie'::text,5)
) AS v(nom, slug, parent, ordre)
LEFT JOIN public.categories p ON p.slug = v.parent
ON CONFLICT (slug) DO UPDATE SET nom = EXCLUDED.nom, parent_id = COALESCE(public.categories.parent_id, EXCLUDED.parent_id);

INSERT INTO public.categories(nom, slug, parent_id, ordre)
SELECT v.nom, v.slug, p.id, v.ordre FROM (VALUES
 ('Splits et systèmes gainables','clim-split','clim'::text,1),
 ('Unités extérieures (VRV / DRV / split)','unites-exterieures','clim'::text,2),
 ('Unités intérieures (gainables, cassettes)','unites-interieures','clim'::text,3),
 ('Accessoires de climatisation','accessoires-clim','clim'::text,4),
 ('Cuivre frigorifique','cuivre-frigorifique','clim'::text,5)
) AS v(nom, slug, parent, ordre)
LEFT JOIN public.categories p ON p.slug = v.parent
ON CONFLICT (slug) DO UPDATE SET nom = EXCLUDED.nom, parent_id = COALESCE(public.categories.parent_id, EXCLUDED.parent_id);

DO $do$
DECLARE f uuid;
BEGIN

  -- ===== MEDCLIM =====
  f := pg_temp.up_fourn('MEDCLIM', 'Arbia BEJI', '+216 71 90 33 44', 'medclim@gnet.tn', '48, Rue du Niger, 1002 Tunis', NULL, 'A convenir');
  -- Devis : MEDCLIM 26091225/AB (Salon de thé Lafayette, 22/09/2026)
  -- Devis : MEDCLIM 26091246/AB (Tek-Up, 28/09/2026)
  -- Split gainable inverter R410A HAIER AD96HN1ERA/1U96WS1ERB (PF 28 kW à 35 °C) : remise 20% sur PU 19900
  PERFORM pg_temp.up_offre(f, 'clim-split', 'Split gainable inverter R410A HAIER AD96HN1ERA/1U96WS1ERB (PF 28 kW à 35 °C)', 'U', 'HAIER', 'AD96HN1ERA/1U96WS1ERB', '{"type":"split gainable inverter","fluide":"R410A","puissance_froid_kw":28}'::jsonb, 'AD96HN1ERA/1U96WS1ERB', 15920.000, NULL, 'sur_commande', NULL, '2026-09-22'::timestamptz);
  -- Grille de soufflage à ailettes orientables simple déflexion, alu laqué blanc RA… : remise 20% sur PU 55
  PERFORM pg_temp.up_offre(f, 'grilles-bouches', 'Grille de soufflage à ailettes orientables simple déflexion, alu laqué blanc RAL 9010 - MP3 UMR1HC 500x150', 'U', 'MP3', 'UMR1HC 500x150', '{"largeur_mm":500,"hauteur_mm":150,"usage":"soufflage","finition":"alu laqué blanc RAL 9010"}'::jsonb, 'UMR1HC 500x150', 44.000, NULL, 'sur_commande', NULL, '2026-09-22'::timestamptz);
  -- Grille de reprise et extraction à ailettes orientables simple déflexion, alu la… : remise 20% sur PU 112
  PERFORM pg_temp.up_offre(f, 'grilles-bouches', 'Grille de reprise et extraction à ailettes orientables simple déflexion, alu laqué blanc RAL 9010 - MP3 UMR1HC 1000x150', 'U', 'MP3', 'UMR1HC 1000x150', '{"largeur_mm":1000,"hauteur_mm":150,"usage":"reprise/extraction","finition":"alu laqué blanc RAL 9010"}'::jsonb, 'UMR1HC 1000x150', 89.600, NULL, 'sur_commande', NULL, '2026-09-22'::timestamptz);
  -- Grille de reprise et extraction à ailettes orientables simple déflexion, alu la… : remise 20% sur PU 108
  PERFORM pg_temp.up_offre(f, 'grilles-bouches', 'Grille de reprise et extraction à ailettes orientables simple déflexion, alu laqué blanc RAL 9010 - MP3 UMR1HC 800x200', 'U', 'MP3', 'UMR1HC 800x200', '{"largeur_mm":800,"hauteur_mm":200,"usage":"reprise/extraction","finition":"alu laqué blanc RAL 9010"}'::jsonb, 'UMR1HC 800x200', 86.400, NULL, 'sur_commande', NULL, '2026-09-22'::timestamptz);
  -- Grille de reprise et extraction à ailettes orientables simple déflexion, alu la… : remise 20% sur PU 50
  PERFORM pg_temp.up_offre(f, 'grilles-bouches', 'Grille de reprise et extraction à ailettes orientables simple déflexion, alu laqué blanc RAL 9010 - MP3 UMR1HC 400x150', 'U', 'MP3', 'UMR1HC 400x150', '{"largeur_mm":400,"hauteur_mm":150,"usage":"reprise/extraction","finition":"alu laqué blanc RAL 9010"}'::jsonb, 'UMR1HC 400x150', 40.000, NULL, 'sur_commande', NULL, '2026-09-22'::timestamptz);
  -- Grille de rejet d'air neuf - MP3 URRFRE 600x300 : remise 20% sur PU 125
  PERFORM pg_temp.up_offre(f, 'grilles-bouches', 'Grille de rejet d''air neuf - MP3 URRFRE 600x300', 'U', 'MP3', 'URRFRE 600x300', '{"largeur_mm":600,"hauteur_mm":300,"usage":"rejet air neuf"}'::jsonb, 'URRFRE 600x300', 100.000, NULL, 'sur_commande', NULL, '2026-09-22'::timestamptz);
  -- Grille de rejet d'air neuf - MP3 URRFRE 300x300 : remise 20% sur PU 88
  PERFORM pg_temp.up_offre(f, 'grilles-bouches', 'Grille de rejet d''air neuf - MP3 URRFRE 300x300', 'U', 'MP3', 'URRFRE 300x300', '{"largeur_mm":300,"hauteur_mm":300,"usage":"rejet air neuf"}'::jsonb, 'URRFRE 300x300', 70.400, NULL, 'sur_commande', NULL, '2026-09-22'::timestamptz);
  -- Grille de transfert - MP3 UTR2 400x200 : remise 20% sur PU 121
  PERFORM pg_temp.up_offre(f, 'grilles-bouches', 'Grille de transfert - MP3 UTR2 400x200', 'U', 'MP3', 'UTR2 400x200', '{"largeur_mm":400,"hauteur_mm":200,"usage":"transfert"}'::jsonb, 'UTR2 400x200', 96.800, NULL, 'sur_commande', NULL, '2026-09-22'::timestamptz);
  -- Bouche d'extraction à corps central réglable, tôle d'acier galvanisé laqué blan… : remise 20% sur PU 13
  PERFORM pg_temp.up_offre(f, 'grilles-bouches', 'Bouche d''extraction à corps central réglable, tôle d''acier galvanisé laqué blanc - MP3 UVE-100', 'U', 'MP3', 'UVE-100', '{"diametre_mm":100}'::jsonb, 'UVE-100', 10.400, NULL, 'sur_commande', NULL, '2026-09-22'::timestamptz);
  -- Bouche d'extraction à corps central réglable, tôle d'acier galvanisé laqué blan… : remise 20% sur PU 17
  PERFORM pg_temp.up_offre(f, 'grilles-bouches', 'Bouche d''extraction à corps central réglable, tôle d''acier galvanisé laqué blanc - MP3 UVE-125', 'U', 'MP3', 'UVE-125', '{"diametre_mm":125}'::jsonb, 'UVE-125', 13.600, NULL, 'sur_commande', NULL, '2026-09-22'::timestamptz);
  -- Caisson d'extraction centrifuge à accouplement direct, tôle d'acier galvanisé, … : remise 20% sur PU 2050
  PERFORM pg_temp.up_offre(f, 'caissons-ventilateurs', 'Caisson d''extraction centrifuge à accouplement direct, tôle d''acier galvanisé, isolation phonique - BOX BD 10/10 M4 0,59 kW', 'U', NULL, 'BOX BD 10/10 M4', '{"puissance_kw":0.59,"points_fonctionnement":[{"debit_m3h":2500,"hmt_mmce":20},{"debit_m3h":3000,"hmt_mmce":25}]}'::jsonb, 'BOX BD 10/10 M4', 1640.000, NULL, 'sur_commande', NULL, '2026-09-22'::timestamptz);
  -- Variateur de vitesse monophasé REG 5A : remise 20% sur PU 490
  PERFORM pg_temp.up_offre(f, 'regulation-ventilation', 'Variateur de vitesse monophasé REG 5A', 'U', NULL, 'REG 5A', '{"intensite_a":5}'::jsonb, 'REG 5A', 392.000, NULL, 'sur_commande', NULL, '2026-09-22'::timestamptz);
  -- Coupe-courant étanche simple vitesse : remise 20% sur PU 235
  PERFORM pg_temp.up_offre(f, 'regulation-ventilation', 'Coupe-courant étanche simple vitesse', 'U', NULL, NULL, '{}'::jsonb, NULL, 188.000, NULL, 'sur_commande', NULL, '2026-09-22'::timestamptz);
  -- Tourelle d'extraction de désenfumage F400 °C - CASALS KENTALROOF 355 T4 0,25 kW : remise 20% sur PU 2800
  PERFORM pg_temp.up_offre(f, 'desenfumage', 'Tourelle d''extraction de désenfumage F400 °C - CASALS KENTALROOF 355 T4 0,25 kW', 'U', 'CASALS', 'KENTALROOF 355 T4', '{"puissance_kw":0.25,"resistance_feu":"F400","debit_m3h":2000,"hmt_mmce":25}'::jsonb, 'KENTALROOF 355 T4 0,25 KW', 2240.000, NULL, 'sur_commande', NULL, '2026-09-22'::timestamptz);
  -- Variateur de vitesse type SFC 3,6A : remise 20% sur PU 1400
  PERFORM pg_temp.up_offre(f, 'regulation-ventilation', 'Variateur de vitesse type SFC 3,6A', 'U', NULL, 'SFC 3,6A', '{"intensite_a":3.6}'::jsonb, 'SFC 3,6A', 1120.000, NULL, 'sur_commande', NULL, '2026-09-22'::timestamptz);
  -- Tourelle d'extraction centrifuge simple vitesse de désenfumage 400 °C/2 h, chap… : remise 20% sur PU 3700
  PERFORM pg_temp.up_offre(f, 'desenfumage', 'Tourelle d''extraction centrifuge simple vitesse de désenfumage 400 °C/2 h, chapeau ABS - CASALS KENTALROOF 450 T4 1,1 kW F400', 'U', 'CASALS', 'KENTALROOF 450 T4', '{"puissance_kw":1.1,"debit_m3h":5400,"pression_pa":200,"resistance_feu":"F400/120"}'::jsonb, 'KENTALROOF 450 T4 1,1 kW F400', 2960.000, NULL, 'sur_commande', NULL, '2026-09-28'::timestamptz);
  -- Coffret de relayage type DS1 E 6A : remise 20% sur PU 2500
  PERFORM pg_temp.up_offre(f, 'desenfumage', 'Coffret de relayage type DS1 E 6A', 'U', NULL, 'DS1 E 6A', '{"intensite_a":6}'::jsonb, 'DS1 E 6A', 2000.000, NULL, 'sur_commande', NULL, '2026-09-28'::timestamptz);
  -- Interrupteur de proximité : remise 20% sur PU 235
  PERFORM pg_temp.up_offre(f, 'desenfumage', 'Interrupteur de proximité', 'U', NULL, NULL, '{}'::jsonb, NULL, 188.000, NULL, 'sur_commande', NULL, '2026-09-28'::timestamptz);
  -- Grille coupe-feu 400 °C/2 h - ECOCLIMA GE120-XL 600x600 : remise 20% sur PU 3700
  PERFORM pg_temp.up_offre(f, 'desenfumage', 'Grille coupe-feu 400 °C/2 h - ECOCLIMA GE120-XL 600x600', 'U', 'ECOCLIMA', 'GE120-XL 600x600', '{"dimensions_mm":"600x600","section_libre_dm2":36,"resistance_feu":"400°C/2h"}'::jsonb, 'GE120-XL 600x600', 2960.000, NULL, 'sur_commande', NULL, '2026-09-28'::timestamptz);
  -- Ouvrant d'amenée d'air neuf CF 2 h - ECOCLIMA OUVRAGE 600x595 RAL9006 : remise 20% sur PU 2600
  PERFORM pg_temp.up_offre(f, 'desenfumage', 'Ouvrant d''amenée d''air neuf CF 2 h - ECOCLIMA OUVRAGE 600x595 RAL9006', 'U', 'ECOCLIMA', 'OUVRAGE 600x595', '{"dimensions_mm":"600x595","section_libre_dm2":36,"coupe_feu_h":2,"ral":"9006"}'::jsonb, 'OUVRAGE 600x595 RAL9006', 2080.000, NULL, 'sur_commande', NULL, '2026-09-28'::timestamptz);
  -- Ouvrant d'amenée d'air neuf CF 2 h - ECOCLIMA OUVRAGE 1000x715 RAL9006 : remise 20% sur PU 2800
  PERFORM pg_temp.up_offre(f, 'desenfumage', 'Ouvrant d''amenée d''air neuf CF 2 h - ECOCLIMA OUVRAGE 1000x715 RAL9006', 'U', 'ECOCLIMA', 'OUVRAGE 1000x715', '{"dimensions_mm":"1000x715","section_libre_dm2":72,"coupe_feu_h":2,"ral":"9006"}'::jsonb, 'OUVRAGE 1000x715 RAL9006', 2240.000, NULL, 'sur_commande', NULL, '2026-09-28'::timestamptz);

  -- ===== STC - Société Tunisienne de Chauffage =====
  f := pg_temp.up_fourn('STC - Société Tunisienne de Chauffage', 'Mohamed Amine Maghraoui', '+216 31 326 000', 'Commercial@stc-tn.tn', 'Nouvelle Zone Industrielle, Ben Arous', NULL, NULL);
  -- Devis : STC STCDV26095144 (22/09/2026)
  -- Unité intérieure split cassette R410A 60 000 BTU (15,5 kW) - HISENSE AUC-60UR4S… : PU 1667.288
  PERFORM pg_temp.up_offre(f, 'unites-interieures', 'Unité intérieure split cassette R410A 60 000 BTU (15,5 kW) - HISENSE AUC-60UR4SKC5', 'U', 'HISENSE', 'AUC-60UR4SKC5', '{"puissance_kw":15.5,"btu":60000,"fluide":"R410A"}'::jsonb, 'AUC-60UR4SKC5', 1667.288, NULL, 'en_stock', NULL, '2026-09-22'::timestamptz);
  -- Unité extérieure split cassette R410A 60 000 BTU (15,5 kW) - HISENSE AUW-60U6SN5 : PU 4991.316
  PERFORM pg_temp.up_offre(f, 'unites-exterieures', 'Unité extérieure split cassette R410A 60 000 BTU (15,5 kW) - HISENSE AUW-60U6SN5', 'U', 'HISENSE', 'AUW-60U6SN5', '{"puissance_kw":15.5,"btu":60000,"fluide":"R410A"}'::jsonb, 'AUW-60U6SN5', 4991.316, NULL, 'en_stock', NULL, '2026-09-22'::timestamptz);
  -- Panneau décoratif cassette 4 voies - HISENSE PE-QFA/B : PU 426.997
  PERFORM pg_temp.up_offre(f, 'accessoires-clim', 'Panneau décoratif cassette 4 voies - HISENSE PE-QFA/B', 'U', 'HISENSE', 'PE-QFA/B', '{}'::jsonb, 'PE-QFA/B', 426.997, NULL, 'en_stock', NULL, '2026-09-22'::timestamptz);
  -- Unité intérieure split gainable R410A 26 kW - HISENSE AUD-96HJFUH : PU 4137.452
  PERFORM pg_temp.up_offre(f, 'unites-interieures', 'Unité intérieure split gainable R410A 26 kW - HISENSE AUD-96HJFUH', 'U', 'HISENSE', 'AUD-96HJFUH', '{"puissance_kw":26,"fluide":"R410A"}'::jsonb, 'AUD-96HJFUH', 4137.452, NULL, 'en_stock', NULL, '2026-09-22'::timestamptz);
  -- Unité extérieure split gainable inverter R410A 26 kW - HISENSE AUW-96HKFUE : PU 9465.859
  PERFORM pg_temp.up_offre(f, 'unites-exterieures', 'Unité extérieure split gainable inverter R410A 26 kW - HISENSE AUW-96HKFUE', 'U', 'HISENSE', 'AUW-96HKFUE', '{"puissance_kw":26,"fluide":"R410A"}'::jsonb, 'AUW-96HKFUE', 9465.859, NULL, 'en_stock', NULL, '2026-09-22'::timestamptz);
  -- Commande filaire - HISENSE HYXE-VC01 : PU 243.411
  PERFORM pg_temp.up_offre(f, 'accessoires-clim', 'Commande filaire - HISENSE HYXE-VC01', 'U', 'HISENSE', 'HYXE-VC01', '{}'::jsonb, 'HYXE-VC01', 243.411, NULL, 'en_stock', NULL, '2026-09-22'::timestamptz);

  -- ===== COTUN =====
  f := pg_temp.up_fourn('COTUN', 'Asma Ben Whiba (équipe climatisation Tunis)', '+216 28 872 742', 'asma.ben.whiba@coges-tn.com', NULL, NULL, 'Virement');
  -- Devis : COTUN DEV-COTUN-260902651 (21/09/2026)
  -- Devis : COTUN DEV-COTUN-260902661 (21/09/2026)
  -- Unité extérieure mini DRV 2 tubes 28,0 kW R410A - HITACHI RAS-100HNBSTQ : PU 15347.797
  PERFORM pg_temp.up_offre(f, 'unites-exterieures', 'Unité extérieure mini DRV 2 tubes 28,0 kW R410A - HITACHI RAS-100HNBSTQ', 'U', 'HITACHI', 'RAS-100HNBSTQ', '{"puissance_kw":28,"fluide":"R410A","type":"mini DRV 2 tubes"}'::jsonb, 'RAS-100HNBSTQ', 15347.797, NULL, 'en_stock', NULL, '2026-09-21'::timestamptz);
  -- Unité intérieure DRV gainable haute pression statique 150 Pa 28,0 kW - HITACHI … : PU 6130.037
  PERFORM pg_temp.up_offre(f, 'unites-interieures', 'Unité intérieure DRV gainable haute pression statique 150 Pa 28,0 kW - HITACHI RPIH-10.0HNDUSQ', 'U', 'HITACHI', 'RPIH-10.0HNDUSQ', '{"puissance_kw":28,"pression_statique_pa":150}'::jsonb, 'RPIH-10.0HNDUSQ', 6130.037, NULL, 'en_stock', NULL, '2026-09-21'::timestamptz);
  -- Accessoire de commande - HITACHI HCWA10NEGQ : PU 248.086
  PERFORM pg_temp.up_offre(f, 'accessoires-clim', 'Accessoire de commande - HITACHI HCWA10NEGQ', 'U', 'HITACHI', 'HCWA10NEGQ', '{}'::jsonb, 'HCWA10NEGQ', 248.086, NULL, 'en_stock', NULL, '2026-09-21'::timestamptz);
  -- Unité extérieure mini DRV AIR365 2 tubes 15,5 kW R410A - HITACHI RAS-6.0FSLN3QE : PU 6457.662
  PERFORM pg_temp.up_offre(f, 'unites-exterieures', 'Unité extérieure mini DRV AIR365 2 tubes 15,5 kW R410A - HITACHI RAS-6.0FSLN3QE', 'U', 'HITACHI', 'RAS-6.0FSLN3QE', '{"puissance_kw":15.5,"fluide":"R410A","gamme":"AIR365"}'::jsonb, 'RAS-6.0FSLN3QE', 6457.662, NULL, 'en_stock', NULL, '2026-09-21'::timestamptz);
  -- Unité intérieure DRV cassette 800x800 16,0 kW - HITACHI RCI-6.0FSKDN1Q : PU 2808.398
  PERFORM pg_temp.up_offre(f, 'unites-interieures', 'Unité intérieure DRV cassette 800x800 16,0 kW - HITACHI RCI-6.0FSKDN1Q', 'U', 'HITACHI', 'RCI-6.0FSKDN1Q', '{"puissance_kw":16,"dimensions_mm":"800x800"}'::jsonb, 'RCI-6.0FSKDN1Q', 2808.398, NULL, 'en_stock', NULL, '2026-09-21'::timestamptz);
  -- Panneau - HITACHI P-N23NA2 : PU 784.335
  PERFORM pg_temp.up_offre(f, 'accessoires-clim', 'Panneau - HITACHI P-N23NA2', 'U', 'HITACHI', 'P-N23NA2', '{}'::jsonb, 'P-N23NA2', 784.335, NULL, 'en_stock', NULL, '2026-09-21'::timestamptz);
  -- Panneau S4I pour cassette RCI-FSR - HITACHI P-GP160NAP-EU : PU 1937.500
  PERFORM pg_temp.up_offre(f, 'accessoires-clim', 'Panneau S4I pour cassette RCI-FSR - HITACHI P-GP160NAP-EU', 'U', 'HITACHI', 'P-GP160NAP-EU', '{"gamme":"Silent Iconic"}'::jsonb, 'P-GP160NAP-EU', 1937.500, NULL, 'en_stock', NULL, '2026-09-21'::timestamptz);

  -- ===== Global Equipement Fluides =====
  f := pg_temp.up_fourn('Global Equipement Fluides', NULL, '+216 71 773 180', NULL, '10 Rue de la Mosquée Touta, 1003 Tunis', '1369467HAM000', NULL);
  -- Devis : Global Equipement Fluides DV264834 (22/09/2026)
  -- Couronne cuivre 1/4" calorifugé - 50 ML - HALCOR : remise 25% sur PU 545.500
  PERFORM pg_temp.up_offre(f, 'cuivre-frigorifique', 'Couronne cuivre 1/4" calorifugé - 50 ML - HALCOR', 'U', 'HALCOR', 'HALCOR-ISO_1/4-50', '{"diametre":"1/4\"","longueur_m":50,"isolation":"calorifugé"}'::jsonb, 'HALCOR-ISO_1/4-50', 409.125, NULL, 'en_stock', 'Couronne de 50 ml', '2026-09-22'::timestamptz);
  -- Couronne cuivre 3/8" calorifugé - 50 ML - HALCOR : remise 25% sur PU 830.200
  PERFORM pg_temp.up_offre(f, 'cuivre-frigorifique', 'Couronne cuivre 3/8" calorifugé - 50 ML - HALCOR', 'U', 'HALCOR', 'HALCOR-ISO_3/8-50', '{"diametre":"3/8\"","longueur_m":50,"isolation":"calorifugé"}'::jsonb, 'HALCOR-ISO_3/8-50', 622.650, NULL, 'en_stock', 'Couronne de 50 ml', '2026-09-22'::timestamptz);
  -- Couronne cuivre 1/2" calorifugé - 50 ML - HALCOR : remise 25% sur PU 1162.000
  PERFORM pg_temp.up_offre(f, 'cuivre-frigorifique', 'Couronne cuivre 1/2" calorifugé - 50 ML - HALCOR', 'U', 'HALCOR', 'HALCOR-ISO_1/2-50', '{"diametre":"1/2\"","longueur_m":50,"isolation":"calorifugé"}'::jsonb, 'HALCOR-ISO_1/2-50', 871.500, NULL, 'en_stock', 'Couronne de 50 ml', '2026-09-22'::timestamptz);
  -- Couronne cuivre 5/8" calorifugé - 50 ML - HALCOR : remise 25% sur PU 1630.800
  PERFORM pg_temp.up_offre(f, 'cuivre-frigorifique', 'Couronne cuivre 5/8" calorifugé - 50 ML - HALCOR', 'U', 'HALCOR', 'HALCOR-ISO_5/8-50', '{"diametre":"5/8\"","longueur_m":50,"isolation":"calorifugé"}'::jsonb, 'HALCOR-ISO_5/8-50', 1223.100, NULL, 'en_stock', 'Couronne de 50 ml', '2026-09-22'::timestamptz);
  -- Couronne cuivre 7/8" calorifugé - 25 ML - HALCOR : remise 25% sur PU 1278.000
  PERFORM pg_temp.up_offre(f, 'cuivre-frigorifique', 'Couronne cuivre 7/8" calorifugé - 25 ML - HALCOR', 'U', 'HALCOR', 'HALCOR-ISO_7/8-25', '{"diametre":"7/8\"","longueur_m":25,"isolation":"calorifugé"}'::jsonb, 'HALCOR-ISO_7/8-25', 958.500, NULL, 'en_stock', 'Couronne de 25 ml', '2026-09-22'::timestamptz);

  -- ===== A2C - Air Conditioning Company =====
  f := pg_temp.up_fourn('A2C - Air Conditioning Company', 'Slim (vendeur)', '+216 31 344 344', NULL, '12 Rue de l''Électricité, ZI Charguia 1, Tunis', NULL, NULL);
  -- Devis : A2C DV-26/3980 (28/09/2026)
  -- Devis : A2C DV-26/3982 (28/09/2026)
  -- Devis : A2C DV-26/3984 (28/09/2026)
  -- Tube PPR Niron fibre verre Ø110 SDR9 : remise 32% sur PU 150.796
  PERFORM pg_temp.up_offre(f, 'tuyau-ppr', 'Tube PPR Niron fibre verre Ø110 SDR9', 'ml', 'NIRON', '03TNIRRCTCL11', '{"diametre_mm":110,"sdr":9,"matiere":"PPR"}'::jsonb, '03TNIRRCTCL11', 102.541, NULL, 'en_stock', NULL, '2026-09-28'::timestamptz);
  -- Tube PPR Niron fibre verre Ø90 SDR9 : remise 32% sur PU 80.696
  PERFORM pg_temp.up_offre(f, 'tuyau-ppr', 'Tube PPR Niron fibre verre Ø90 SDR9', 'ml', 'NIRON', '03TNIRRCTCL90', '{"diametre_mm":90,"sdr":9,"matiere":"PPR"}'::jsonb, '03TNIRRCTCL90', 54.873, NULL, 'en_stock', NULL, '2026-09-28'::timestamptz);
  -- Tube PPR Niron fibre verre Ø75 SDR9 : remise 32% sur PU 56.162
  PERFORM pg_temp.up_offre(f, 'tuyau-ppr', 'Tube PPR Niron fibre verre Ø75 SDR9', 'ml', 'NIRON', '03TNIRRCTCL75', '{"diametre_mm":75,"sdr":9,"matiere":"PPR"}'::jsonb, '03TNIRRCTCL75', 38.190, NULL, 'en_stock', NULL, '2026-09-28'::timestamptz);
  -- Tube PPR Niron fibre verre Ø63 SDR9 : remise 32% sur PU 40.141
  PERFORM pg_temp.up_offre(f, 'tuyau-ppr', 'Tube PPR Niron fibre verre Ø63 SDR9', 'ml', 'NIRON', '03TNIRRCTCL63', '{"diametre_mm":63,"sdr":9,"matiere":"PPR"}'::jsonb, '03TNIRRCTCL63', 27.296, NULL, 'en_stock', NULL, '2026-09-28'::timestamptz);
  -- Tube PPR Niron fibre verre Ø50 SDR9 : remise 32% sur PU 25.369
  PERFORM pg_temp.up_offre(f, 'tuyau-ppr', 'Tube PPR Niron fibre verre Ø50 SDR9', 'ml', 'NIRON', '03TNIRRCTCL50', '{"diametre_mm":50,"sdr":9,"matiere":"PPR"}'::jsonb, '03TNIRRCTCL50', 17.251, NULL, 'en_stock', NULL, '2026-09-28'::timestamptz);
  -- Tube PPR Niron fibre verre Ø40 SDR9 : remise 35% sur PU 16.273
  PERFORM pg_temp.up_offre(f, 'tuyau-ppr', 'Tube PPR Niron fibre verre Ø40 SDR9', 'ml', 'NIRON', '03TNIRRCTCL40', '{"diametre_mm":40,"sdr":9,"matiere":"PPR"}'::jsonb, '03TNIRRCTCL40', 10.577, NULL, 'en_stock', NULL, '2026-09-28'::timestamptz);
  -- Tube PPR Niron fibre verre Ø32 SDR9 : remise 32% sur PU 10.601
  PERFORM pg_temp.up_offre(f, 'tuyau-ppr', 'Tube PPR Niron fibre verre Ø32 SDR9', 'ml', 'NIRON', '03TNIRRCTCL32', '{"diametre_mm":32,"sdr":9,"matiere":"PPR"}'::jsonb, '03TNIRRCTCL32', 7.209, NULL, 'en_stock', NULL, '2026-09-28'::timestamptz);
  -- Tube Niron Clima PP-RCT Ø25x3,5 SDR7,4 (barre de 4 m) : remise 35% sur PU 7.850
  PERFORM pg_temp.up_offre(f, 'tuyau-ppr', 'Tube Niron Clima PP-RCT Ø25x3,5 SDR7,4 (barre de 4 m)', 'ml', 'NIRON', '03TNIRRCTCL25', '{"diametre_mm":25,"sdr":7.4,"matiere":"PPR"}'::jsonb, '03TNIRRCTCL25', 5.103, NULL, 'en_stock', 'Barre de 4 m', '2026-09-28'::timestamptz);
  -- Tube PPR Ø110 SDR11 : remise 35% sur PU 61.809
  PERFORM pg_temp.up_offre(f, 'tuyau-ppr', 'Tube PPR Ø110 SDR11', 'ml', NULL, 'M9102110110.2', '{"diametre_mm":110,"sdr":11,"matiere":"PPR"}'::jsonb, 'M9102110110.2', 40.176, NULL, 'en_stock', NULL, '2026-09-28'::timestamptz);
  -- Tube PPR Ø90 SDR11 : remise 35% sur PU 39.850
  PERFORM pg_temp.up_offre(f, 'tuyau-ppr', 'Tube PPR Ø90 SDR11', 'ml', NULL, 'M9102090090.2', '{"diametre_mm":90,"sdr":11,"matiere":"PPR"}'::jsonb, 'M9102090090.2', 25.903, NULL, 'en_stock', NULL, '2026-09-28'::timestamptz);
  -- Tube PPR Ø75 SDR11 : remise 35% sur PU 26.880
  PERFORM pg_temp.up_offre(f, 'tuyau-ppr', 'Tube PPR Ø75 SDR11', 'ml', NULL, 'M9102075075.2', '{"diametre_mm":75,"sdr":11,"matiere":"PPR"}'::jsonb, 'M9102075075.2', 17.472, NULL, 'en_stock', NULL, '2026-09-28'::timestamptz);
  -- Tube PPR Ø50 SDR11 : remise 35% sur PU 12.918
  PERFORM pg_temp.up_offre(f, 'tuyau-ppr', 'Tube PPR Ø50 SDR11', 'ml', NULL, '03TNIRRCTCL50', '{"diametre_mm":50,"sdr":11,"matiere":"PPR"}'::jsonb, '03TNIRRCTCL50', 8.397, NULL, 'en_stock', NULL, '2026-09-28'::timestamptz);
  -- Tube PPR Ø32 SDR11 : remise 35% sur PU 5.310
  PERFORM pg_temp.up_offre(f, 'tuyau-ppr', 'Tube PPR Ø32 SDR11', 'ml', NULL, 'M9102032032.2', '{"diametre_mm":32,"sdr":11,"matiere":"PPR"}'::jsonb, 'M9102032032.2', 3.452, NULL, 'en_stock', NULL, '2026-09-28'::timestamptz);
  -- Tube PPR Niron fibre verre Ø63 SDR11 : remise 35% sur PU 32.128
  PERFORM pg_temp.up_offre(f, 'tuyau-ppr', 'Tube PPR Niron fibre verre Ø63 SDR11', 'ml', 'NIRON', '03TNIRRCTCL63', '{"diametre_mm":63,"sdr":11,"matiere":"PPR"}'::jsonb, '03TNIRRCTCL63', 20.883, NULL, 'en_stock', NULL, '2026-09-28'::timestamptz);
  -- Tube PPR Niron fibre verre Ø110 SDR11 : remise 32% sur PU 99.140
  PERFORM pg_temp.up_offre(f, 'tuyau-ppr', 'Tube PPR Niron fibre verre Ø110 SDR11', 'ml', 'NIRON', '03TNIRRCTCL11', '{"diametre_mm":110,"sdr":11,"matiere":"PPR"}'::jsonb, '03TNIRRCTCL11', 67.415, NULL, 'en_stock', NULL, '2026-09-28'::timestamptz);
  -- Tube PPR Niron fibre verre Ø90 SDR11 : remise 32% sur PU 66.594
  PERFORM pg_temp.up_offre(f, 'tuyau-ppr', 'Tube PPR Niron fibre verre Ø90 SDR11', 'ml', 'NIRON', '03TNIRRCTCL9011', '{"diametre_mm":90,"sdr":11,"matiere":"PPR"}'::jsonb, '03TNIRRCTCL9011', 45.284, NULL, 'en_stock', NULL, '2026-09-28'::timestamptz);
  -- Tube PPR Niron fibre verre Ø75 SDR11 : remise 32% sur PU 46.232
  PERFORM pg_temp.up_offre(f, 'tuyau-ppr', 'Tube PPR Niron fibre verre Ø75 SDR11', 'ml', 'NIRON', '03TNIRRCTCL7511', '{"diametre_mm":75,"sdr":11,"matiere":"PPR"}'::jsonb, '03TNIRRCTCL7511', 31.438, NULL, 'en_stock', NULL, '2026-09-28'::timestamptz);
  -- Tube PPR Niron fibre verre Ø50 SDR11 : remise 32% sur PU 20.862
  PERFORM pg_temp.up_offre(f, 'tuyau-ppr', 'Tube PPR Niron fibre verre Ø50 SDR11', 'ml', 'NIRON', '03TNIRRCTCL5011', '{"diametre_mm":50,"sdr":11,"matiere":"PPR"}'::jsonb, '03TNIRRCTCL5011', 14.186, NULL, 'en_stock', NULL, '2026-09-28'::timestamptz);
  -- Tube PPR Niron fibre verre Ø40 SDR11 : remise 32% sur PU 13.354
  PERFORM pg_temp.up_offre(f, 'tuyau-ppr', 'Tube PPR Niron fibre verre Ø40 SDR11', 'ml', 'NIRON', '03TNIRRCTCL4011', '{"diametre_mm":40,"sdr":11,"matiere":"PPR"}'::jsonb, '03TNIRRCTCL4011', 9.081, NULL, 'en_stock', NULL, '2026-09-28'::timestamptz);
  -- Tube PPR Niron fibre verre Ø32 SDR11 : remise 32% sur PU 8.679
  PERFORM pg_temp.up_offre(f, 'tuyau-ppr', 'Tube PPR Niron fibre verre Ø32 SDR11', 'ml', 'NIRON', '03TNIRRCTCL3211', '{"diametre_mm":32,"sdr":11,"matiere":"PPR"}'::jsonb, '03TNIRRCTCL3211', 5.902, NULL, 'en_stock', NULL, '2026-09-28'::timestamptz);

  -- ===== General Metal =====
  f := pg_temp.up_fourn('General Metal', NULL, '+216 70 248 900', NULL, 'Magasin 205 Saint-Gobain, Z.I. Saint-Gobain, Mégrine, Tunis', '045149QAM000', NULL);
  -- Devis : General Metal 52609251 (28/09/2026)
  -- Robinet sphérique gaz 1/2" - BONOMI : remise 25% puis 18% sur PU 19.897
  PERFORM pg_temp.up_offre(f, 'reseau-gaz', 'Robinet sphérique gaz 1/2" - BONOMI', 'U', 'BONOMI', NULL, '{"dn":"1/2\""}'::jsonb, '20220300000131', 12.237, NULL, 'en_stock', NULL, '2026-09-28'::timestamptz);
  -- Robinet sphérique gaz 1" - BONOMI : remise 25% puis 18% sur PU 48.120
  PERFORM pg_temp.up_offre(f, 'reseau-gaz', 'Robinet sphérique gaz 1" - BONOMI', 'U', 'BONOMI', NULL, '{"dn":"1\""}'::jsonb, '20220300000134', 29.594, NULL, 'en_stock', NULL, '2026-09-28'::timestamptz);
  -- Vanne papillon gaz DN 50 - FAF : remise 25% sur PU 178.602
  PERFORM pg_temp.up_offre(f, 'reseau-gaz', 'Vanne papillon gaz DN 50 - FAF', 'U', 'FAF', NULL, '{"dn":50}'::jsonb, '20220200000706', 133.952, NULL, 'en_stock', NULL, '2026-09-28'::timestamptz);
  -- Manomètre à gaz 0-600 mbar : PU 84.762
  PERFORM pg_temp.up_offre(f, 'reseau-gaz', 'Manomètre à gaz 0-600 mbar', 'U', NULL, NULL, '{"plage_mbar":"0-600"}'::jsonb, '20220600000112', 84.762, NULL, 'en_stock', NULL, '2026-09-28'::timestamptz);
  -- Robinet porte-manomètre 3 voies 1/2" : PU 50.280
  PERFORM pg_temp.up_offre(f, 'reseau-gaz', 'Robinet porte-manomètre 3 voies 1/2"', 'U', NULL, NULL, '{"dn":"1/2\""}'::jsonb, '20220300000096', 50.280, NULL, 'en_stock', NULL, '2026-09-28'::timestamptz);
  -- Tube cuivre gaz R290 Ø54x1,0 EN 1057 : PU 182.250
  PERFORM pg_temp.up_offre(f, 'reseau-gaz', 'Tube cuivre gaz R290 Ø54x1,0 EN 1057', 'ml', NULL, NULL, '{"diametre_mm":54,"epaisseur_mm":1.0,"norme":"EN 1057","etat":"R290"}'::jsonb, '20202000000090', 182.250, NULL, 'en_stock', NULL, '2026-09-28'::timestamptz);
  -- Tube cuivre gaz R290 Ø28x1,0 EN 1057 : remise 25% sur PU 83.904
  PERFORM pg_temp.up_offre(f, 'reseau-gaz', 'Tube cuivre gaz R290 Ø28x1,0 EN 1057', 'ml', NULL, NULL, '{"diametre_mm":28,"epaisseur_mm":1.0,"norme":"EN 1057","etat":"R290"}'::jsonb, '20202000000087', 62.928, NULL, 'en_stock', NULL, '2026-09-28'::timestamptz);
  -- Tube cuivre gaz R290 Ø16x1,0 EN 1057 : remise 25% sur PU 51.981
  PERFORM pg_temp.up_offre(f, 'reseau-gaz', 'Tube cuivre gaz R290 Ø16x1,0 EN 1057', 'ml', NULL, NULL, '{"diametre_mm":16,"epaisseur_mm":1.0,"norme":"EN 1057","etat":"R290"}'::jsonb, '20202000000085', 38.986, NULL, 'en_stock', NULL, '2026-09-28'::timestamptz);
END $do$;
