-- 0009 — correction des prix du catalogue réel : prix de LISTE (avant remise) au lieu du prix net après remise
-- Règle : la remise accordée par le fournisseur est la marge d'Aeronova, pas un droit à réclamer.
--         prix_fourniture = P.U. HT du devis AVANT remise (premier prix), 3 décimales, en DT.
-- Corrige les offres posées par 0003, 0004, 0007 et 0008 (114 offres modifiées).
-- Non modifiées (16 offres) : STC, COTUN (devis sans remise, prix = prix net), manomètre / robinet porte-manomètre / tube Ø54 General Metal (cotés sans remise).
-- Ne touche QUE prix_fourniture (aucune désignation, référence, disponibilité ni délai).
-- Idempotent : relançable sans effet de bord. À lancer APRÈS 0003, 0004, 0007, 0008
--   (relancer l'un de ces fichiers après 0009 remettrait les anciens prix nets : relancer 0009 ensuite).
-- Sécurité : si le nombre d'offres trouvées ≠ 114, la migration échoue et rien n'est modifié.

DO $do$
DECLARE n int;
BEGIN
  WITH v(fournisseur, designation, marque, prix_liste) AS (VALUES
    ('MEDCLIM', 'Split gainable inverter R410A HAIER AD96HN1ERA/1U96WS1ERB (PF 28 kW à 35 °C)', 'HAIER', 19900.000),
    ('MEDCLIM', 'Grille de soufflage à ailettes orientables simple déflexion, alu laqué blanc RAL 9010 - MP3 UMR1HC 500x150', 'MP3', 55.000),
    ('MEDCLIM', 'Grille de reprise et extraction à ailettes orientables simple déflexion, alu laqué blanc RAL 9010 - MP3 UMR1HC 1000x150', 'MP3', 112.000),
    ('MEDCLIM', 'Grille de reprise et extraction à ailettes orientables simple déflexion, alu laqué blanc RAL 9010 - MP3 UMR1HC 800x200', 'MP3', 108.000),
    ('MEDCLIM', 'Grille de reprise et extraction à ailettes orientables simple déflexion, alu laqué blanc RAL 9010 - MP3 UMR1HC 400x150', 'MP3', 50.000),
    ('MEDCLIM', 'Grille de rejet d''air neuf - MP3 URRFRE 600x300', 'MP3', 125.000),
    ('MEDCLIM', 'Grille de rejet d''air neuf - MP3 URRFRE 300x300', 'MP3', 88.000),
    ('MEDCLIM', 'Grille de transfert - MP3 UTR2 400x200', 'MP3', 121.000),
    ('MEDCLIM', 'Bouche d''extraction à corps central réglable, tôle d''acier galvanisé laqué blanc - MP3 UVE-100', 'MP3', 13.000),
    ('MEDCLIM', 'Bouche d''extraction à corps central réglable, tôle d''acier galvanisé laqué blanc - MP3 UVE-125', 'MP3', 17.000),
    ('MEDCLIM', 'Caisson d''extraction centrifuge à accouplement direct, tôle d''acier galvanisé, isolation phonique - BOX BD 10/10 M4 0,59 kW', NULL::text, 2050.000),
    ('MEDCLIM', 'Variateur de vitesse monophasé REG 5A', NULL::text, 490.000),
    ('MEDCLIM', 'Coupe-courant étanche simple vitesse', NULL::text, 235.000),
    ('MEDCLIM', 'Tourelle d''extraction de désenfumage F400 °C - CASALS KENTALROOF 355 T4 0,25 kW', 'CASALS', 2800.000),
    ('MEDCLIM', 'Variateur de vitesse type SFC 3,6A', NULL::text, 1400.000),
    ('MEDCLIM', 'Tourelle d''extraction centrifuge simple vitesse de désenfumage 400 °C/2 h, chapeau ABS - CASALS KENTALROOF 450 T4 1,1 kW F400', 'CASALS', 3700.000),
    ('MEDCLIM', 'Coffret de relayage type DS1 E 6A', NULL::text, 2500.000),
    ('MEDCLIM', 'Interrupteur de proximité', NULL::text, 235.000),
    ('MEDCLIM', 'Grille coupe-feu 400 °C/2 h - ECOCLIMA GE120-XL 600x600', 'ECOCLIMA', 3700.000),
    ('MEDCLIM', 'Ouvrant d''amenée d''air neuf CF 2 h - ECOCLIMA OUVRAGE 600x595 RAL9006', 'ECOCLIMA', 2600.000),
    ('MEDCLIM', 'Ouvrant d''amenée d''air neuf CF 2 h - ECOCLIMA OUVRAGE 1000x715 RAL9006', 'ECOCLIMA', 2800.000),
    ('Global Equipement Fluides', 'Couronne cuivre 1/4" calorifugé - 50 ML - HALCOR', 'HALCOR', 545.500),
    ('Global Equipement Fluides', 'Couronne cuivre 3/8" calorifugé - 50 ML - HALCOR', 'HALCOR', 830.200),
    ('Global Equipement Fluides', 'Couronne cuivre 1/2" calorifugé - 50 ML - HALCOR', 'HALCOR', 1162.000),
    ('Global Equipement Fluides', 'Couronne cuivre 5/8" calorifugé - 50 ML - HALCOR', 'HALCOR', 1630.800),
    ('Global Equipement Fluides', 'Couronne cuivre 7/8" calorifugé - 25 ML - HALCOR', 'HALCOR', 1278.000),
    ('A2C - Air Conditioning Company', 'Tube PPR Niron fibre verre Ø110 SDR9', 'NIRON', 150.796),
    ('A2C - Air Conditioning Company', 'Tube PPR Niron fibre verre Ø90 SDR9', 'NIRON', 80.696),
    ('A2C - Air Conditioning Company', 'Tube PPR Niron fibre verre Ø75 SDR9', 'NIRON', 56.162),
    ('A2C - Air Conditioning Company', 'Tube PPR Niron fibre verre Ø63 SDR9', 'NIRON', 40.141),
    ('A2C - Air Conditioning Company', 'Tube PPR Niron fibre verre Ø50 SDR9', 'NIRON', 25.369),
    ('A2C - Air Conditioning Company', 'Tube PPR Niron fibre verre Ø40 SDR9', 'NIRON', 16.273),
    ('A2C - Air Conditioning Company', 'Tube PPR Niron fibre verre Ø32 SDR9', 'NIRON', 10.601),
    ('A2C - Air Conditioning Company', 'Tube Niron Clima PP-RCT Ø25x3,5 SDR7,4 (barre de 4 m)', 'NIRON', 7.850),
    ('A2C - Air Conditioning Company', 'Tube PPR Ø110 SDR11', NULL::text, 61.809),
    ('A2C - Air Conditioning Company', 'Tube PPR Ø90 SDR11', NULL::text, 39.850),
    ('A2C - Air Conditioning Company', 'Tube PPR Ø75 SDR11', NULL::text, 26.880),
    ('A2C - Air Conditioning Company', 'Tube PPR Ø50 SDR11', NULL::text, 12.918),
    ('A2C - Air Conditioning Company', 'Tube PPR Ø32 SDR11', NULL::text, 5.310),
    ('A2C - Air Conditioning Company', 'Tube PPR Niron fibre verre Ø63 SDR11', 'NIRON', 32.128),
    ('A2C - Air Conditioning Company', 'Tube PPR Niron fibre verre Ø110 SDR11', 'NIRON', 99.140),
    ('A2C - Air Conditioning Company', 'Tube PPR Niron fibre verre Ø90 SDR11', 'NIRON', 66.594),
    ('A2C - Air Conditioning Company', 'Tube PPR Niron fibre verre Ø75 SDR11', 'NIRON', 46.232),
    ('A2C - Air Conditioning Company', 'Tube PPR Niron fibre verre Ø50 SDR11', 'NIRON', 20.862),
    ('A2C - Air Conditioning Company', 'Tube PPR Niron fibre verre Ø40 SDR11', 'NIRON', 13.354),
    ('A2C - Air Conditioning Company', 'Tube PPR Niron fibre verre Ø32 SDR11', 'NIRON', 8.679),
    ('General Metal', 'Robinet sphérique gaz 1/2" - BONOMI', 'BONOMI', 19.897),
    ('General Metal', 'Robinet sphérique gaz 1" - BONOMI', 'BONOMI', 48.120),
    ('General Metal', 'Vanne papillon gaz DN 50 - FAF', 'FAF', 178.602),
    ('General Metal', 'Tube cuivre gaz R290 Ø28x1,0 EN 1057', NULL::text, 83.904),
    ('General Metal', 'Tube cuivre gaz R290 Ø16x1,0 EN 1057', NULL::text, 51.981),
    ('SOGET', 'Grille de reprise et soufflage - BROFER LAF 500x150', 'BROFER', 80.000),
    ('SOGET', 'Grille de reprise et soufflage - BROFER LAF 1000x150', 'BROFER', 128.000),
    ('SOGET', 'Grille de reprise et soufflage - BROFER LAF 800x200', 'BROFER', 135.000),
    ('SOGET', 'Grille de reprise et soufflage - BROFER LAF 400x150', 'BROFER', 95.000),
    ('SOGET', 'Grille pare-pluie - BROFER GRA RZ 600x300', 'BROFER', 140.000),
    ('SOGET', 'Grille pare-pluie - BROFER GRA RZ 300x300', 'BROFER', 81.000),
    ('SOGET', 'Grille de transfert - BROFER GTA 400x200', 'BROFER', 100.000),
    ('SOGET', 'Bouche d''extraction (non paraflam) - CAIROX DVS 100', 'CAIROX', 17.000),
    ('SOGET', 'Bouche d''extraction (non paraflam) - CAIROX DVS 125', 'CAIROX', 20.000),
    ('SOGET', 'Registre de réglage avec clé manuelle - BROFER DBC + clé DN 100', 'BROFER', 115.000),
    ('SOGET', 'Registre de réglage avec clé manuelle - BROFER DBC + clé DN 125', 'BROFER', 115.000),
    ('SOGET', 'Registre de réglage avec clé manuelle - BROFER DBC + clé DN 200', 'BROFER', 125.000),
    ('SOGET', 'Registre de réglage avec clé manuelle - BROFER DBC + clé DN 250', 'BROFER', 162.000),
    ('SOGET', 'Caisson d''extraction isolé - TECNIFAN MB 12/33 - 6P - M - 1V', 'TECNIFAN', 1950.000),
    ('SOGET', 'Variateur de fréquence 10 A', NULL::text, 350.000),
    ('SOGET', 'Tourelle d''extraction agréée 400 °C/2 h avec interrupteur - CAIROX RFV 35/1', 'CAIROX', 2200.000),
    ('SOGET', 'Caisson d''extraction de désenfumage agréé 400 °C/2 h - CAIROX DFA 500 - 4 pôles', 'CAIROX', 3990.000),
    ('SOGET', 'Coffret de relayage 6A avec interrupteur cadenassable, boîtier de réarmement, boîtier arrêt pompier et pressostat différentiel', NULL::text, 2500.000),
    ('SOGET', 'Volet de désenfumage + cadre + grille d''habillage - CAIROX AVANTAGE 2H 1V Dm²=36 700x565', 'CAIROX', 1948.000),
    ('SOGET', 'Ouvrant de façade - CAIROX OUVRAGE 800x565', 'CAIROX', 3246.000),
    ('SOGET', 'Ouvrant de façade - CAIROX OUVRAGE 1050x805', 'CAIROX', 3787.000),
    ('SMC - Société de Matériel de Climatisation (York)', 'Unité extérieure VRF HAPQ 28 kW R410A DC inverter - YORK JTOH100VPETCQ', 'YORK', 24200.000),
    ('SMC - Société de Matériel de Climatisation (York)', 'Unité extérieure mini-VRF 18 kW - YORK YV2VYH018KAR-DAX', 'YORK', 13335.000),
    ('SMC - Société de Matériel de Climatisation (York)', 'Unité intérieure gainable 28 kW / 150 Pa avec commande tactile - YORK JDDH280H0NSBQ', 'YORK', 6990.000),
    ('SMC - Société de Matériel de Climatisation (York)', 'Cassette Round Flow 840x840 6,5 HP (16 kW) avec commande IR et panneau décoratif - YORK YV9VXH160WAR--GY', 'YORK', 4950.000),
    ('SEAT - Société d''Equipements Aéraulique et Thermique', 'Tourelle d''extraction centrifuge de désenfumage 1 vitesse 400 °C/2 h avec interrupteur de proximité - CALADAIR RFV 56/2 4P', 'CALADAIR', 4587.699),
    ('SEAT - Société d''Equipements Aéraulique et Thermique', 'Coffret de relayage désenfumage - CALADAIR TRI-6', 'CALADAIR', 1725.720),
    ('SEAT - Société d''Equipements Aéraulique et Thermique', 'Tourelle d''extraction centrifuge de désenfumage 1 vitesse 400 °C/2 h avec interrupteur de proximité - CALADAIR RFV 63/3 4P', 'CALADAIR', 6447.788),
    ('SEAT - Société d''Equipements Aéraulique et Thermique', 'Coffret de relayage désenfumage - CALADAIR TRI-15', 'CALADAIR', 1848.175),
    ('SEAT - Société d''Equipements Aéraulique et Thermique', 'Caisson d''extraction de désenfumage 400 °C/2 h accouplement direct avec interrupteur de proximité et capot moteur - CALADAIR DIABLO 500 F4', 'CALADAIR', 4988.713),
    ('SEAT - Société d''Equipements Aéraulique et Thermique', 'Boîtier arrêt pompier - CALADAIR BAP', 'CALADAIR', 112.000),
    ('SEAT - Société d''Equipements Aéraulique et Thermique', 'Boîtier de réarmement - CALADAIR BR', 'CALADAIR', 119.000),
    ('SEAT - Société d''Equipements Aéraulique et Thermique', 'Ouvrant de façade d''amenée d''air frais NFS 61937, déclencheur électrique 24 Vcc (refermeture manuelle) - AIRLAM 975x725', 'AIRLAM', 2882.783),
    ('SEAT - Société d''Equipements Aéraulique et Thermique', 'Ouvrant de façade d''amenée d''air frais NFS 61937, déclencheur électrique 24 Vcc (refermeture manuelle) - AIRLAM 1350x725', 'AIRLAM', 3172.751),
    ('SEAT - Société d''Equipements Aéraulique et Thermique', 'Ouvrant de façade d''amenée d''air frais NFS 61937, déclencheur électrique 24 Vcc (refermeture manuelle) - AIRLAM 850x725', 'AIRLAM', 2836.999),
    ('SEAT - Société d''Equipements Aéraulique et Thermique', 'Grille aluminium laquée blanc à ailettes fixes inclinées à 45° (profil parapluie) - KOOLAIR 25-H 975x725', 'KOOLAIR', 317.200),
    ('SEAT - Société d''Equipements Aéraulique et Thermique', 'Grille aluminium laquée blanc à ailettes fixes inclinées à 45° (profil parapluie) - KOOLAIR 25-H 1350x725', 'KOOLAIR', 450.180),
    ('SEAT - Société d''Equipements Aéraulique et Thermique', 'Grille aluminium laquée blanc à ailettes fixes inclinées à 45° (profil parapluie) - KOOLAIR 25-H 850x725', 'KOOLAIR', 239.547),
    ('SEAT - Société d''Equipements Aéraulique et Thermique', 'Grille aluminium laquée blanc à ailettes fixes inclinées à 45° (profil parapluie) - KOOLAIR 25-H 1200x300', 'KOOLAIR', 230.580),
    ('SEAT - Société d''Equipements Aéraulique et Thermique', 'Grille aluminium laquée blanc à ailettes fixes inclinées à 45° (profil parapluie) - KOOLAIR 25-H 1000x300', 'KOOLAIR', 154.330),
    ('SEAT - Société d''Equipements Aéraulique et Thermique', 'Grille aluminium laquée blanc à ailettes fixes inclinées à 45° (profil parapluie) - KOOLAIR 25-H 1000x200', 'KOOLAIR', 113.521),
    ('SEAT - Société d''Equipements Aéraulique et Thermique', 'Grille coupe-feu 2 h - RF-T TECHNOLOGIES GE 120 1200x300', 'RF-T TECHNOLOGIES', 3503.000),
    ('SEAT - Société d''Equipements Aéraulique et Thermique', 'Grille coupe-feu 2 h - RF-T TECHNOLOGIES GE 120 1000x300', 'RF-T TECHNOLOGIES', 2876.800),
    ('SEAT - Société d''Equipements Aéraulique et Thermique', 'Grille coupe-feu 2 h - RF-T TECHNOLOGIES GE 120 1000x200', 'RF-T TECHNOLOGIES', 2300.200),
    ('SEAT - Société d''Equipements Aéraulique et Thermique', 'Exutoire de désenfumage 1 m² en verre acrylique translucide à commande par fusible thermique - BLUTEK HEXASTEEL MOT C 100 1000x1000', 'BLUTEK', 2200.000),
    ('SEAT - Société d''Equipements Aéraulique et Thermique', 'Pack treuil mécanique pour exutoire - BLUTEK HKIT500AS', 'BLUTEK', 750.000),
    ('SEAT - Société d''Equipements Aéraulique et Thermique', 'Module pour treuil électromagnétique 24 Vcc - BLUTEK HO3456-8', 'BLUTEK', 290.000),
    ('SEAT - Société d''Equipements Aéraulique et Thermique', 'Volet à tunnel rectangulaire normalement fermé à repos, bobine à émission 24 Vcc et contact début/fin de course - RF-T TECHNOLOGIES VU120+MANF VD FDCU 500x350', 'RF-T TECHNOLOGIES', 1186.528),
    ('SEAT - Société d''Equipements Aéraulique et Thermique', 'Volet à tunnel rectangulaire normalement fermé à repos, bobine à émission 24 Vcc et contact début/fin de course - RF-T TECHNOLOGIES VU120+MANF VD FDCU 550x400', 'RF-T TECHNOLOGIES', 1267.101),
    ('SEAT - Société d''Equipements Aéraulique et Thermique', 'Volet à tunnel rectangulaire normalement fermé à repos, bobine à émission 24 Vcc et contact début/fin de course - RF-T TECHNOLOGIES VU120+MANF VD FDCU 600x400', 'RF-T TECHNOLOGIES', 1286.025),
    ('SEAT - Société d''Equipements Aéraulique et Thermique', 'Volet à tunnel rectangulaire normalement fermé à repos, bobine à émission 24 Vcc et contact début/fin de course - RF-T TECHNOLOGIES VU120+MANF VD FDCU 800x400', 'RF-T TECHNOLOGIES', 1361.756),
    ('FIPRO - Filtration et Process', 'Sécheur d''air comprimé à adsorption sans chaleur, point de rosée -40 °C, 620 m³/h à 7 bar, sonde hygrométrique, avec 2 filtres de ligne - PARKER K60/16D3-G230MT', 'PARKER', 68000.000),
    ('FIPRO - Filtration et Process', 'Tube aluminium bleu Ø50, longueur 6 m - PARKER 1006A50 04', 'PARKER', 594.000),
    ('FIPRO - Filtration et Process', 'Clip de fixation Ø50 M10x1,5 - PARKER 6697 50 00', 'PARKER', 17.900),
    ('FIPRO - Filtration et Process', 'Tube aluminium bleu Ø25, longueur 6 m - PARKER 1006A25 04 00', 'PARKER', 300.000),
    ('FIPRO - Filtration et Process', 'Clip de fixation Ø25 M8x1,25 - PARKER 6697 25 00', 'PARKER', 11.500),
    ('FIPRO - Filtration et Process', 'Adaptateur pour clip - PARKER 6697 00 02', 'PARKER', 9.510),
    ('FIPRO - Filtration et Process', 'Tuyau souple 2 m pour ligne Ø50 - PARKER 1001E50 00 04', 'PARKER', 1100.000),
    ('FIPRO - Filtration et Process', 'Ensemble anti-coup de fouet pour tuyau souple Transair Ø50 - PARKER 6698 99 03', 'PARKER', 214.000),
    ('FIPRO - Filtration et Process', 'Piquage fileté BSP conique 2" S, sécheur vers tuyaux souples Ø50 - PARKER 6605 50 48', 'PARKER', 235.000),
    ('FIPRO - Filtration et Process', 'Bride simple à pose rapide Ø50 vers Ø25 - PARKER RA69 50 25', 'PARKER', 163.000),
    ('FIPRO - Filtration et Process', 'Purgeur de condensats automatique G 1/2 - PARKER ED3004_G_230', 'PARKER', 955.000),
    ('FIPRO - Filtration et Process', 'Filtre / régulateur 1" - PARKER FP3YEA98ESABNFN', 'PARKER', 795.000)
  ),
  maj AS (
    UPDATE public.fournisseur_produits fp
       SET prix_fourniture = v.prix_liste
      FROM v
      JOIN public.fournisseurs f ON f.nom = v.fournisseur
      JOIN public.produits p ON p.designation = v.designation AND p.marque IS NOT DISTINCT FROM v.marque
     WHERE fp.fournisseur_id = f.id AND fp.produit_id = p.id
    RETURNING 1
  )
  SELECT count(*) INTO n FROM maj;

  IF n <> 114 THEN
    RAISE EXCEPTION '0009 : % offres mises à jour au lieu de 114 (une migration 0003/0004/0007/0008 manque ?)', n;
  END IF;
END $do$;
