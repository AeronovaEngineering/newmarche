-- Seed de TEST du catalogue, généré depuis deux bordereaux clients réels, pour mesurer la qualité du matching :
--   * Bordereau_des_prix_Reseau_Gaz.xlsx  -> les 14 articles, désignations + prix unitaires réels
--   * MANDARIN bloc B-C (lot fluides)     -> 50 des 87 lignes, désignations exactes. Le fichier n'a PAS de prix :
--     prix placeholder 1.000 DT, offres en statut 'brouillon' (à remplacer avant tout usage réel).
-- Les 37 lignes Mandarin volontairement absentes forment le groupe témoin « aucun match catalogue ».
-- Idempotent : ne fait rien si les fournisseurs de test existent déjà.
-- Nettoyage : DELETE FROM public.fournisseurs WHERE nom LIKE 'Fournisseur Test - %';  (supprime les offres en cascade ;
--            les produits de test restent : les retrouver via les catégories ci-dessus si besoin).

DO $$
DECLARE
  cat_id uuid; prod_id uuid; fourn_gaz uuid; fourn_mandarin uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM public.fournisseurs WHERE nom IN ('Fournisseur Test - Réseau Gaz', 'Fournisseur Test - MANDARIN (prix placeholder)')) THEN
    RAISE NOTICE 'Seed catalogue de test déjà présent - ignoré';
    RETURN;
  END IF;

  INSERT INTO public.fournisseurs (nom, actif) VALUES ('Fournisseur Test - Réseau Gaz', true) RETURNING id INTO fourn_gaz;
  INSERT INTO public.fournisseurs (nom, actif) VALUES ('Fournisseur Test - MANDARIN (prix placeholder)', true) RETURNING id INTO fourn_mandarin;

  INSERT INTO public.categories (nom, slug) VALUES ('Réseau Gaz', 'reseau-gaz')
    ON CONFLICT (slug) DO UPDATE SET nom = EXCLUDED.nom RETURNING id INTO cat_id;
  INSERT INTO public.produits (designation, category_id, unite_reference)
    VALUES ('Vanne d''arrêt sphérique DN15', cat_id, 'U') RETURNING id INTO prod_id;
  INSERT INTO public.fournisseur_produits (produit_id, fournisseur_id, prix_fourniture, devise, statut)
    VALUES (prod_id, fourn_gaz, 35.000, 'DT', 'verifie');
  INSERT INTO public.produits (designation, category_id, unite_reference)
    VALUES ('Vanne d''arrêt sphérique DN25', cat_id, 'U') RETURNING id INTO prod_id;
  INSERT INTO public.fournisseur_produits (produit_id, fournisseur_id, prix_fourniture, devise, statut)
    VALUES (prod_id, fourn_gaz, 80.000, 'DT', 'verifie');
  INSERT INTO public.produits (designation, category_id, unite_reference)
    VALUES ('Vanne d''arrêt sphérique DN50', cat_id, 'U') RETURNING id INTO prod_id;
  INSERT INTO public.fournisseur_produits (produit_id, fournisseur_id, prix_fourniture, devise, statut)
    VALUES (prod_id, fourn_gaz, 240.000, 'DT', 'verifie');
  INSERT INTO public.produits (designation, category_id, unite_reference)
    VALUES ('Electro-vanne électromagnétique pour coupure gaz DN 25', cat_id, 'U') RETURNING id INTO prod_id;
  INSERT INTO public.fournisseur_produits (produit_id, fournisseur_id, prix_fourniture, devise, statut)
    VALUES (prod_id, fourn_gaz, 300.000, 'DT', 'verifie');
  INSERT INTO public.produits (designation, category_id, unite_reference)
    VALUES ('Electro-vanne électromagnétique pour coupure gaz DN 50', cat_id, 'U') RETURNING id INTO prod_id;
  INSERT INTO public.fournisseur_produits (produit_id, fournisseur_id, prix_fourniture, devise, statut)
    VALUES (prod_id, fourn_gaz, 500.000, 'DT', 'verifie');
  INSERT INTO public.produits (designation, category_id, unite_reference)
    VALUES ('Manomètre à cadran diam 80 type gaz, 0 à 400 mbar', cat_id, 'U') RETURNING id INTO prod_id;
  INSERT INTO public.fournisseur_produits (produit_id, fournisseur_id, prix_fourniture, devise, statut)
    VALUES (prod_id, fourn_gaz, 180.000, 'DT', 'verifie');
  INSERT INTO public.produits (designation, category_id, unite_reference)
    VALUES ('Manomètre à cadran diam 80 type gaz, 0 à 60 mbar', cat_id, 'U') RETURNING id INTO prod_id;
  INSERT INTO public.fournisseur_produits (produit_id, fournisseur_id, prix_fourniture, devise, statut)
    VALUES (prod_id, fourn_gaz, 200.000, 'DT', 'verifie');
  INSERT INTO public.produits (designation, category_id, unite_reference)
    VALUES ('Détendeur secondaire gaz naturel - Equipements Cuisine (300→0-21 mbar, 10 Nm3/h)', cat_id, 'U') RETURNING id INTO prod_id;
  INSERT INTO public.fournisseur_produits (produit_id, fournisseur_id, prix_fourniture, devise, statut)
    VALUES (prod_id, fourn_gaz, 300.000, 'DT', 'verifie');
  INSERT INTO public.produits (designation, category_id, unite_reference)
    VALUES ('Tuyauterie en cuivre rigide ø 50/52', cat_id, 'ML') RETURNING id INTO prod_id;
  INSERT INTO public.fournisseur_produits (produit_id, fournisseur_id, prix_fourniture, devise, statut)
    VALUES (prod_id, fourn_gaz, 114.000, 'DT', 'verifie');
  INSERT INTO public.produits (designation, category_id, unite_reference)
    VALUES ('Tuyauterie en cuivre rigide ø 26/28', cat_id, 'ML') RETURNING id INTO prod_id;
  INSERT INTO public.fournisseur_produits (produit_id, fournisseur_id, prix_fourniture, devise, statut)
    VALUES (prod_id, fourn_gaz, 80.000, 'DT', 'verifie');
  INSERT INTO public.produits (designation, category_id, unite_reference)
    VALUES ('Tuyauterie en cuivre rigide ø 14/16', cat_id, 'ML') RETURNING id INTO prod_id;
  INSERT INTO public.fournisseur_produits (produit_id, fournisseur_id, prix_fourniture, devise, statut)
    VALUES (prod_id, fourn_gaz, 50.000, 'DT', 'verifie');
  INSERT INTO public.produits (designation, category_id, unite_reference)
    VALUES ('Flexible armé gaz en jaune DN 15', cat_id, 'U') RETURNING id INTO prod_id;
  INSERT INTO public.fournisseur_produits (produit_id, fournisseur_id, prix_fourniture, devise, statut)
    VALUES (prod_id, fourn_gaz, 80.000, 'DT', 'verifie');
  INSERT INTO public.produits (designation, category_id, unite_reference)
    VALUES ('Démontage du réseau gaz en acier existant', cat_id, 'U') RETURNING id INTO prod_id;
  INSERT INTO public.fournisseur_produits (produit_id, fournisseur_id, prix_fourniture, devise, statut)
    VALUES (prod_id, fourn_gaz, 500.000, 'DT', 'verifie');
  INSERT INTO public.produits (designation, category_id, unite_reference)
    VALUES ('Schéma de principe et schéma des installations gaz avec notice de fonctionnement et d''entretien', cat_id, 'U') RETURNING id INTO prod_id;
  INSERT INTO public.fournisseur_produits (produit_id, fournisseur_id, prix_fourniture, devise, statut)
    VALUES (prod_id, fourn_gaz, 300.000, 'DT', 'verifie');

  INSERT INTO public.categories (nom, slug) VALUES ('Production des frigories', 'production-des-frigories')
    ON CONFLICT (slug) DO UPDATE SET nom = EXCLUDED.nom RETURNING id INTO cat_id;
  INSERT INTO public.produits (designation, category_id, unite_reference)
    VALUES ('Travaux de préinstallation de split-système simple y compris la fourniture et la pose des liaisons frigorifiques, du câble électrique, de la tuyauterie d''évacuation condensat en tube multicouches ø int 20, fourreaux-travaux de démolition dans la maçonnerie, et toutes sujétions pour une parfaite installation.', cat_id, 'ENS') RETURNING id INTO prod_id;
  INSERT INTO public.fournisseur_produits (produit_id, fournisseur_id, prix_fourniture, devise, statut)
    VALUES (prod_id, fourn_mandarin, 1.000, 'DT', 'brouillon'); -- PLACEHOLDER
  INSERT INTO public.produits (designation, category_id, unite_reference)
    VALUES ('Fourniture et pose d''une boite encastrable en plastique pour la pré-installation d''un split système.', cat_id, 'U') RETURNING id INTO prod_id;
  INSERT INTO public.fournisseur_produits (produit_id, fournisseur_id, prix_fourniture, devise, statut)
    VALUES (prod_id, fourn_mandarin, 1.000, 'DT', 'brouillon'); -- PLACEHOLDER

  INSERT INTO public.categories (nom, slug) VALUES ('Equipements de ventilation', 'equipements-de-ventilation')
    ON CONFLICT (slug) DO UPDATE SET nom = EXCLUDED.nom RETURNING id INTO cat_id;
  INSERT INTO public.produits (designation, category_id, unite_reference)
    VALUES ('Fourniture et pose d’un extracteur individuel étanche classe II IP x 4 de 100m3/h équipé de clapet pour installation dans salles de bain et salles d’eau y compris raccordement électrique minuterie intégrée de 5 à 40 minutes et toutes sujétions.', cat_id, 'U') RETURNING id INTO prod_id;
  INSERT INTO public.fournisseur_produits (produit_id, fournisseur_id, prix_fourniture, devise, statut)
    VALUES (prod_id, fourn_mandarin, 1.000, 'DT', 'brouillon'); -- PLACEHOLDER
  INSERT INTO public.produits (designation, category_id, unite_reference)
    VALUES ('Fourniture et pose de grille de décompression en alu peint epoxy blanc pour ventilation basse des cuisines à installer sur une porte en aluminium sur les deux faces (section 150 cm²) (l''échantillon doit être approuvé par l''ingénieur avant fourniture)', cat_id, 'U') RETURNING id INTO prod_id;
  INSERT INTO public.fournisseur_produits (produit_id, fournisseur_id, prix_fourniture, devise, statut)
    VALUES (prod_id, fourn_mandarin, 1.000, 'DT', 'brouillon'); -- PLACEHOLDER
  INSERT INTO public.produits (designation, category_id, unite_reference)
    VALUES ('Idem article précèdent pour ventilation haute des cuisines (section 250cm2) composée d''un fourreau de traversés de mur et de deux grilles de rejet 20x20cm (l''échantillon doit être approuvé par l''ingénieur avant fourniture)', cat_id, 'ENS') RETURNING id INTO prod_id;
  INSERT INTO public.fournisseur_produits (produit_id, fournisseur_id, prix_fourniture, devise, statut)
    VALUES (prod_id, fourn_mandarin, 1.000, 'DT', 'brouillon'); -- PLACEHOLDER
  INSERT INTO public.produits (designation, category_id, unite_reference)
    VALUES ('Fourniture, pose et raccordement d’une gaine d’extraction en tôle galvanisé épaisseur 8/10ème y compris support en acier galvanisé, pièces spéciales, joints, assemblage et toutes sujétions. a) ø 100', cat_id, 'ML') RETURNING id INTO prod_id;
  INSERT INTO public.fournisseur_produits (produit_id, fournisseur_id, prix_fourniture, devise, statut)
    VALUES (prod_id, fourn_mandarin, 1.000, 'DT', 'brouillon'); -- PLACEHOLDER
  INSERT INTO public.produits (designation, category_id, unite_reference)
    VALUES ('Fourniture, pose et raccordement d’une gaine d’extraction en tôle galvanisé épaisseur 8/10ème y compris support en acier galvanisé, pièces spéciales, joints, assemblage et toutes sujétions. b) ø 160', cat_id, 'ML') RETURNING id INTO prod_id;
  INSERT INTO public.fournisseur_produits (produit_id, fournisseur_id, prix_fourniture, devise, statut)
    VALUES (prod_id, fourn_mandarin, 1.000, 'DT', 'brouillon'); -- PLACEHOLDER
  INSERT INTO public.produits (designation, category_id, unite_reference)
    VALUES ('Fourniture, pose et raccordement d’une gaine d’extraction en tôle galvanisé épaisseur 8/10ème y compris support en acier galvanisé, pièces spéciales, joints, assemblage et toutes sujétions. c) ø 200 (spiralée)', cat_id, 'ML') RETURNING id INTO prod_id;
  INSERT INTO public.fournisseur_produits (produit_id, fournisseur_id, prix_fourniture, devise, statut)
    VALUES (prod_id, fourn_mandarin, 1.000, 'DT', 'brouillon'); -- PLACEHOLDER
  INSERT INTO public.produits (designation, category_id, unite_reference)
    VALUES ('Fourniture et pose de grille d''air neuf (en aluminium extrudé avec grillage de protection) pour ventilation basse et haute de la gaine gaz, toutes sujétions de fourniture et de pose incluses. a)Dim : 400x250 ( pour la VB et VH de la gaine gaz )', cat_id, 'U') RETURNING id INTO prod_id;
  INSERT INTO public.fournisseur_produits (produit_id, fournisseur_id, prix_fourniture, devise, statut)
    VALUES (prod_id, fourn_mandarin, 1.000, 'DT', 'brouillon'); -- PLACEHOLDER
  INSERT INTO public.produits (designation, category_id, unite_reference)
    VALUES ('Fourniture et pose de grille d''air neuf (en aluminium extrudé avec grillage de protection) pour ventilation basse et haute de la gaine gaz, toutes sujétions de fourniture et de pose incluses. b) Dim: 200x200 ( pour rejet extraction latérale SD )', cat_id, 'U') RETURNING id INTO prod_id;
  INSERT INTO public.fournisseur_produits (produit_id, fournisseur_id, prix_fourniture, devise, statut)
    VALUES (prod_id, fourn_mandarin, 1.000, 'DT', 'brouillon'); -- PLACEHOLDER
  INSERT INTO public.produits (designation, category_id, unite_reference)
    VALUES ('Fourniture et pose d''un extracteur mural hélicoïdale équipé d''une jalousie automatique. Débit: 300m3/h', cat_id, 'U') RETURNING id INTO prod_id;
  INSERT INTO public.fournisseur_produits (produit_id, fournisseur_id, prix_fourniture, devise, statut)
    VALUES (prod_id, fourn_mandarin, 1.000, 'DT', 'brouillon'); -- PLACEHOLDER
  INSERT INTO public.produits (designation, category_id, unite_reference)
    VALUES ('Fourniture et pose de gaine circulaire et fourreau ø 125 de traversés de mur et d''une grille de rejet 15 x 15 cm ( pour hotte cuisinière )', cat_id, 'U') RETURNING id INTO prod_id;
  INSERT INTO public.fournisseur_produits (produit_id, fournisseur_id, prix_fourniture, devise, statut)
    VALUES (prod_id, fourn_mandarin, 1.000, 'DT', 'brouillon'); -- PLACEHOLDER
  INSERT INTO public.produits (designation, category_id, unite_reference)
    VALUES ('Fourniture, pose, fixation, raccordement et mise en service d''un caisson d''extraction constitué de panneaux en tôle d''acier galvanisé, ventilateur centrifuge isolé du caisson par des plots antivibratiles y compris manchettes souples, jalousie, coupe courant étanche placé à l''extérieur à proximité du caisson,raccordement électrique , fourreau, chemin de câble et toutes sujétions. a) Débit :200 m3/h - pression disponible 10 mm C.E', cat_id, 'U') RETURNING id INTO prod_id;
  INSERT INTO public.fournisseur_produits (produit_id, fournisseur_id, prix_fourniture, devise, statut)
    VALUES (prod_id, fourn_mandarin, 1.000, 'DT', 'brouillon'); -- PLACEHOLDER
  INSERT INTO public.produits (designation, category_id, unite_reference)
    VALUES ('Fourniture, pose, fixation, raccordement et mise en service d''un caisson d''extraction constitué de panneaux en tôle d''acier galvanisé, ventilateur centrifuge isolé du caisson par des plots antivibratiles y compris manchettes souples, jalousie, coupe courant étanche placé à l''extérieur à proximité du caisson,raccordement électrique , fourreau, chemin de câble et toutes sujétions. b) Débit :300 m3/h - pression disponible 10 mm C.E', cat_id, 'U') RETURNING id INTO prod_id;
  INSERT INTO public.fournisseur_produits (produit_id, fournisseur_id, prix_fourniture, devise, statut)
    VALUES (prod_id, fourn_mandarin, 1.000, 'DT', 'brouillon'); -- PLACEHOLDER
  INSERT INTO public.produits (designation, category_id, unite_reference)
    VALUES ('Fourniture et pose de grille de reprise ou d''extraction en Alu anodisé peint époxy blanc à simple déflexion à ailettes fixes inclinées avec damper y compris cadre à sceller et toutes sujétions de finition et de fixation incluses.', cat_id, 'U') RETURNING id INTO prod_id;
  INSERT INTO public.fournisseur_produits (produit_id, fournisseur_id, prix_fourniture, devise, statut)
    VALUES (prod_id, fourn_mandarin, 1.000, 'DT', 'brouillon'); -- PLACEHOLDER
  INSERT INTO public.produits (designation, category_id, unite_reference)
    VALUES ('Fourniture, pose et raccordement d’une bouche d’extraction autoréglable paraflamme y compris flexible de raccordement en aluminium sur conduit d’extraction et toutes sujétions.', cat_id, 'U') RETURNING id INTO prod_id;
  INSERT INTO public.fournisseur_produits (produit_id, fournisseur_id, prix_fourniture, devise, statut)
    VALUES (prod_id, fourn_mandarin, 1.000, 'DT', 'brouillon'); -- PLACEHOLDER

  INSERT INTO public.categories (nom, slug) VALUES ('Chauffage central', 'chauffage-central')
    ON CONFLICT (slug) DO UPDATE SET nom = EXCLUDED.nom RETURNING id INTO cat_id;
  INSERT INTO public.produits (designation, category_id, unite_reference)
    VALUES ('Pose, raccordement et mise en service d''une chaudière à gaz murale mixte à ventouse y compris raccordement eau, gaz, électricité,pose et raccordement du thermostat filaires y compris fourniture et pose du fourreau et câble de commande.', cat_id, 'ENS') RETURNING id INTO prod_id;
  INSERT INTO public.fournisseur_produits (produit_id, fournisseur_id, prix_fourniture, devise, statut)
    VALUES (prod_id, fourn_mandarin, 1.000, 'DT', 'brouillon'); -- PLACEHOLDER
  INSERT INTO public.produits (designation, category_id, unite_reference)
    VALUES ('Pose, fixation et raccordement de radiateur , y compris fixation et scellement des supports, pose, raccordement des accessoires: robinet de réglage, té de réglage et purgeur d’air à clef et toutes sujétions.', cat_id, 'U') RETURNING id INTO prod_id;
  INSERT INTO public.fournisseur_produits (produit_id, fournisseur_id, prix_fourniture, devise, statut)
    VALUES (prod_id, fourn_mandarin, 1.000, 'DT', 'brouillon'); -- PLACEHOLDER
  INSERT INTO public.produits (designation, category_id, unite_reference)
    VALUES ('Pose, fixation et raccordement de séche serviette , y compris fixation et scellement des supports, pose, raccordement des accessoires: robinet de réglage, té de réglage et purgeur d’air à clef et toutes sujétions. a) TYPE 300W', cat_id, 'ENS') RETURNING id INTO prod_id;
  INSERT INTO public.fournisseur_produits (produit_id, fournisseur_id, prix_fourniture, devise, statut)
    VALUES (prod_id, fourn_mandarin, 1.000, 'DT', 'brouillon'); -- PLACEHOLDER
  INSERT INTO public.produits (designation, category_id, unite_reference)
    VALUES ('Pose, fixation et raccordement de séche serviette , y compris fixation et scellement des supports, pose, raccordement des accessoires: robinet de réglage, té de réglage et purgeur d’air à clef et toutes sujétions. b) TYPE 500W', cat_id, 'ENS') RETURNING id INTO prod_id;
  INSERT INTO public.fournisseur_produits (produit_id, fournisseur_id, prix_fourniture, devise, statut)
    VALUES (prod_id, fourn_mandarin, 1.000, 'DT', 'brouillon'); -- PLACEHOLDER
  INSERT INTO public.produits (designation, category_id, unite_reference)
    VALUES ('Fourniture et pose de vanne d''isolement à manchon taraudé', cat_id, 'U') RETURNING id INTO prod_id;
  INSERT INTO public.fournisseur_produits (produit_id, fournisseur_id, prix_fourniture, devise, statut)
    VALUES (prod_id, fourn_mandarin, 1.000, 'DT', 'brouillon'); -- PLACEHOLDER
  INSERT INTO public.produits (designation, category_id, unite_reference)
    VALUES ('Fourniture et pose de tuyauterie de chauffage central en polyéthylène réticulé (multicouches): PEX/AL/PEX- 95°C – 10Bars composés de cinq couches: 2 couches en polyéthylène réticulé , de deux couches d’adhésif et d’une couche aluminium dégraissé y compris tous les accessoires de pose et de raccordement, raccords à sertir en laiton chromé bague en inox, toutes sujétions incluses pour une parfaite pose sous carrelage, protection mécanique par tube gorge et essais sous pression. a) ø intérieur 12 – ø extérieur 16', cat_id, 'ML') RETURNING id INTO prod_id;
  INSERT INTO public.fournisseur_produits (produit_id, fournisseur_id, prix_fourniture, devise, statut)
    VALUES (prod_id, fourn_mandarin, 1.000, 'DT', 'brouillon'); -- PLACEHOLDER
  INSERT INTO public.produits (designation, category_id, unite_reference)
    VALUES ('Fourniture et pose de tuyauterie de chauffage central en polyéthylène réticulé (multicouches): PEX/AL/PEX- 95°C – 10Bars composés de cinq couches: 2 couches en polyéthylène réticulé , de deux couches d’adhésif et d’une couche aluminium dégraissé y compris tous les accessoires de pose et de raccordement, raccords à sertir en laiton chromé bague en inox, toutes sujétions incluses pour une parfaite pose sous carrelage, protection mécanique par tube gorge et essais sous pression. b) ø intérieur 20 – ø extérieur 25', cat_id, 'ML') RETURNING id INTO prod_id;
  INSERT INTO public.fournisseur_produits (produit_id, fournisseur_id, prix_fourniture, devise, statut)
    VALUES (prod_id, fourn_mandarin, 1.000, 'DT', 'brouillon'); -- PLACEHOLDER
  INSERT INTO public.produits (designation, category_id, unite_reference)
    VALUES ('Fourniture et pose d''un collecteur préfabriqué en laiton chromé, diamètre 1'''', avec vannes d''isolement pour chaque départ y compris raccords, purgeur automatique , supports galvanisés, accessoires et toutes sujétions. a) Collecteurs à 4 sorties', cat_id, 'U') RETURNING id INTO prod_id;
  INSERT INTO public.fournisseur_produits (produit_id, fournisseur_id, prix_fourniture, devise, statut)
    VALUES (prod_id, fourn_mandarin, 1.000, 'DT', 'brouillon'); -- PLACEHOLDER
  INSERT INTO public.produits (designation, category_id, unite_reference)
    VALUES ('Fourniture et pose d''un collecteur préfabriqué en laiton chromé, diamètre 1'''', avec vannes d''isolement pour chaque départ y compris raccords, purgeur automatique , supports galvanisés, accessoires et toutes sujétions. b) Collecteurs à 5 sorties', cat_id, 'U') RETURNING id INTO prod_id;
  INSERT INTO public.fournisseur_produits (produit_id, fournisseur_id, prix_fourniture, devise, statut)
    VALUES (prod_id, fourn_mandarin, 1.000, 'DT', 'brouillon'); -- PLACEHOLDER
  INSERT INTO public.produits (designation, category_id, unite_reference)
    VALUES ('Fourniture et pose d''un collecteur préfabriqué en laiton chromé, diamètre 1'''', avec vannes d''isolement pour chaque départ y compris raccords, purgeur automatique , supports galvanisés, accessoires et toutes sujétions. c) Collecteurs à 6 sorties', cat_id, 'U') RETURNING id INTO prod_id;
  INSERT INTO public.fournisseur_produits (produit_id, fournisseur_id, prix_fourniture, devise, statut)
    VALUES (prod_id, fourn_mandarin, 1.000, 'DT', 'brouillon'); -- PLACEHOLDER
  INSERT INTO public.produits (designation, category_id, unite_reference)
    VALUES ('Fourniture et pose d''un collecteur préfabriqué en laiton chromé, diamètre 1'''', avec vannes d''isolement pour chaque départ y compris raccords, purgeur automatique , supports galvanisés, accessoires et toutes sujétions. d) Collecteurs à 7 sorties', cat_id, 'U') RETURNING id INTO prod_id;
  INSERT INTO public.fournisseur_produits (produit_id, fournisseur_id, prix_fourniture, devise, statut)
    VALUES (prod_id, fourn_mandarin, 1.000, 'DT', 'brouillon'); -- PLACEHOLDER
  INSERT INTO public.produits (designation, category_id, unite_reference)
    VALUES ('Fourniture et pose d''un collecteur préfabriqué en laiton chromé, diamètre 1'''', avec vannes d''isolement pour chaque départ y compris raccords, purgeur automatique , supports galvanisés, accessoires et toutes sujétions. e) Collecteurs à 8 sorties', cat_id, 'U') RETURNING id INTO prod_id;
  INSERT INTO public.fournisseur_produits (produit_id, fournisseur_id, prix_fourniture, devise, statut)
    VALUES (prod_id, fourn_mandarin, 1.000, 'DT', 'brouillon'); -- PLACEHOLDER
  INSERT INTO public.produits (designation, category_id, unite_reference)
    VALUES ('Fourniture et pose de boite pour encastrer les collecteurs dans le mur dim. variables suivant les dim. des collecteurs y compris couvercle visitable et toutes sujétions. a) En matière plastique robuste', cat_id, 'U') RETURNING id INTO prod_id;
  INSERT INTO public.fournisseur_produits (produit_id, fournisseur_id, prix_fourniture, devise, statut)
    VALUES (prod_id, fourn_mandarin, 1.000, 'DT', 'brouillon'); -- PLACEHOLDER
  INSERT INTO public.produits (designation, category_id, unite_reference)
    VALUES ('Fourniture et pose de boite pour encastrer les collecteurs dans le mur dim. variables suivant les dim. des collecteurs y compris couvercle visitable et toutes sujétions. b) En acier peint époxy blanc', cat_id, 'U') RETURNING id INTO prod_id;
  INSERT INTO public.fournisseur_produits (produit_id, fournisseur_id, prix_fourniture, devise, statut)
    VALUES (prod_id, fourn_mandarin, 1.000, 'DT', 'brouillon'); -- PLACEHOLDER

  INSERT INTO public.categories (nom, slug) VALUES ('Réseau Gaz', 'reseau-gaz')
    ON CONFLICT (slug) DO UPDATE SET nom = EXCLUDED.nom RETURNING id INTO cat_id;
  INSERT INTO public.produits (designation, category_id, unite_reference)
    VALUES ('Fourniture , pose et raccordement de tuyauterie apparente a) ø 26/28', cat_id, 'ML') RETURNING id INTO prod_id;
  INSERT INTO public.fournisseur_produits (produit_id, fournisseur_id, prix_fourniture, devise, statut)
    VALUES (prod_id, fourn_mandarin, 1.000, 'DT', 'brouillon'); -- PLACEHOLDER
  INSERT INTO public.produits (designation, category_id, unite_reference)
    VALUES ('Fourniture , pose et raccordement de tuyauterie apparente b) ø 20/22', cat_id, 'ML') RETURNING id INTO prod_id;
  INSERT INTO public.fournisseur_produits (produit_id, fournisseur_id, prix_fourniture, devise, statut)
    VALUES (prod_id, fourn_mandarin, 1.000, 'DT', 'brouillon'); -- PLACEHOLDER
  INSERT INTO public.produits (designation, category_id, unite_reference)
    VALUES ('Fourniture , pose et raccordement de tuyauterie apparente c) ø 14/16', cat_id, 'ML') RETURNING id INTO prod_id;
  INSERT INTO public.fournisseur_produits (produit_id, fournisseur_id, prix_fourniture, devise, statut)
    VALUES (prod_id, fourn_mandarin, 1.000, 'DT', 'brouillon'); -- PLACEHOLDER
  INSERT INTO public.produits (designation, category_id, unite_reference)
    VALUES ('Fourniture, pose et raccordement d''une vanne d''arrêt a) DN 15 (avec tétine pour cuisinière).', cat_id, 'U') RETURNING id INTO prod_id;
  INSERT INTO public.fournisseur_produits (produit_id, fournisseur_id, prix_fourniture, devise, statut)
    VALUES (prod_id, fourn_mandarin, 1.000, 'DT', 'brouillon'); -- PLACEHOLDER
  INSERT INTO public.produits (designation, category_id, unite_reference)
    VALUES ('Fourniture, pose et raccordement d''une vanne d''arrêt b) DN 20 (pour alimentation chaudières)', cat_id, 'U') RETURNING id INTO prod_id;
  INSERT INTO public.fournisseur_produits (produit_id, fournisseur_id, prix_fourniture, devise, statut)
    VALUES (prod_id, fourn_mandarin, 1.000, 'DT', 'brouillon'); -- PLACEHOLDER
  INSERT INTO public.produits (designation, category_id, unite_reference)
    VALUES ('Fourniture, pose et raccordement d''un flexible armé (spécial gaz) agrée par la STEG pour raccorder les cuisinières ou plaques chauffantes', cat_id, 'U') RETURNING id INTO prod_id;
  INSERT INTO public.fournisseur_produits (produit_id, fournisseur_id, prix_fourniture, devise, statut)
    VALUES (prod_id, fourn_mandarin, 1.000, 'DT', 'brouillon'); -- PLACEHOLDER

  INSERT INTO public.categories (nom, slug) VALUES ('Plomberie sanitaire', 'plomberie-sanitaire')
    ON CONFLICT (slug) DO UPDATE SET nom = EXCLUDED.nom RETURNING id INTO cat_id;
  INSERT INTO public.produits (designation, category_id, unite_reference)
    VALUES ('Pose de vasque y compris raccordement de la robinetterie et accessoires de vidange pour une parfaite mise en marche de l''installation.', cat_id, 'U') RETURNING id INTO prod_id;
  INSERT INTO public.fournisseur_produits (produit_id, fournisseur_id, prix_fourniture, devise, statut)
    VALUES (prod_id, fourn_mandarin, 1.000, 'DT', 'brouillon'); -- PLACEHOLDER
  INSERT INTO public.produits (designation, category_id, unite_reference)
    VALUES ('Idem article précèdent pour lavabo sur colonne', cat_id, 'U') RETURNING id INTO prod_id;
  INSERT INTO public.fournisseur_produits (produit_id, fournisseur_id, prix_fourniture, devise, statut)
    VALUES (prod_id, fourn_mandarin, 1.000, 'DT', 'brouillon'); -- PLACEHOLDER
  INSERT INTO public.produits (designation, category_id, unite_reference)
    VALUES ('Idem article précèdent pour meuble vasque (élément bas)', cat_id, 'U') RETURNING id INTO prod_id;
  INSERT INTO public.fournisseur_produits (produit_id, fournisseur_id, prix_fourniture, devise, statut)
    VALUES (prod_id, fourn_mandarin, 1.000, 'DT', 'brouillon'); -- PLACEHOLDER
  INSERT INTO public.produits (designation, category_id, unite_reference)
    VALUES ('Idem article précèdent pour meuble vasque (élément haut comprenant miroir et élément de rangement vertical)', cat_id, 'U') RETURNING id INTO prod_id;
  INSERT INTO public.fournisseur_produits (produit_id, fournisseur_id, prix_fourniture, devise, statut)
    VALUES (prod_id, fourn_mandarin, 1.000, 'DT', 'brouillon'); -- PLACEHOLDER
  INSERT INTO public.produits (designation, category_id, unite_reference)
    VALUES ('Idem article précèdent pour évier double bacs', cat_id, 'U') RETURNING id INTO prod_id;
  INSERT INTO public.fournisseur_produits (produit_id, fournisseur_id, prix_fourniture, devise, statut)
    VALUES (prod_id, fourn_mandarin, 1.000, 'DT', 'brouillon'); -- PLACEHOLDER
  INSERT INTO public.produits (designation, category_id, unite_reference)
    VALUES ('Idem article précèdent pour évier simple bac', cat_id, 'U') RETURNING id INTO prod_id;
  INSERT INTO public.fournisseur_produits (produit_id, fournisseur_id, prix_fourniture, devise, statut)
    VALUES (prod_id, fourn_mandarin, 1.000, 'DT', 'brouillon'); -- PLACEHOLDER
  INSERT INTO public.produits (designation, category_id, unite_reference)
    VALUES ('Idem article précèdent pour caniveau de douche', cat_id, 'U') RETURNING id INTO prod_id;
  INSERT INTO public.fournisseur_produits (produit_id, fournisseur_id, prix_fourniture, devise, statut)
    VALUES (prod_id, fourn_mandarin, 1.000, 'DT', 'brouillon'); -- PLACEHOLDER
  INSERT INTO public.produits (designation, category_id, unite_reference)
    VALUES ('Idem article précèdent pour baignoire en fonte ou acrylique.', cat_id, 'U') RETURNING id INTO prod_id;
  INSERT INTO public.fournisseur_produits (produit_id, fournisseur_id, prix_fourniture, devise, statut)
    VALUES (prod_id, fourn_mandarin, 1.000, 'DT', 'brouillon'); -- PLACEHOLDER
  INSERT INTO public.produits (designation, category_id, unite_reference)
    VALUES ('Idem article précèdent pour cuvette suspendue+ chasse encastrée.', cat_id, 'U') RETURNING id INTO prod_id;
  INSERT INTO public.fournisseur_produits (produit_id, fournisseur_id, prix_fourniture, devise, statut)
    VALUES (prod_id, fourn_mandarin, 1.000, 'DT', 'brouillon'); -- PLACEHOLDER
  INSERT INTO public.produits (designation, category_id, unite_reference)
    VALUES ('Pose de robinet flexible ou mélangeur pour WC', cat_id, 'U') RETURNING id INTO prod_id;
  INSERT INTO public.fournisseur_produits (produit_id, fournisseur_id, prix_fourniture, devise, statut)
    VALUES (prod_id, fourn_mandarin, 1.000, 'DT', 'brouillon'); -- PLACEHOLDER
  INSERT INTO public.produits (designation, category_id, unite_reference)
    VALUES ('Fourniture et pose a) Siphon de sol 15x15 en inox ou en PVC dur', cat_id, 'U') RETURNING id INTO prod_id;
  INSERT INTO public.fournisseur_produits (produit_id, fournisseur_id, prix_fourniture, devise, statut)
    VALUES (prod_id, fourn_mandarin, 1.000, 'DT', 'brouillon'); -- PLACEHOLDER
  INSERT INTO public.produits (designation, category_id, unite_reference)
    VALUES ('Fourniture et pose b) Siphon de cour 25x25 en alu ou en PVC dur', cat_id, 'U') RETURNING id INTO prod_id;
  INSERT INTO public.fournisseur_produits (produit_id, fournisseur_id, prix_fourniture, devise, statut)
    VALUES (prod_id, fourn_mandarin, 1.000, 'DT', 'brouillon'); -- PLACEHOLDER
  INSERT INTO public.produits (designation, category_id, unite_reference)
    VALUES ('Fourniture et pose c) Robinet pour machine à laver / lave vaisselle', cat_id, 'U') RETURNING id INTO prod_id;
  INSERT INTO public.fournisseur_produits (produit_id, fournisseur_id, prix_fourniture, devise, statut)
    VALUES (prod_id, fourn_mandarin, 1.000, 'DT', 'brouillon'); -- PLACEHOLDER
  INSERT INTO public.produits (designation, category_id, unite_reference)
    VALUES ('Fourniture et pose d) Siphon pour machine à laver / lave vaisselle', cat_id, 'U') RETURNING id INTO prod_id;
  INSERT INTO public.fournisseur_produits (produit_id, fournisseur_id, prix_fourniture, devise, statut)
    VALUES (prod_id, fourn_mandarin, 1.000, 'DT', 'brouillon'); -- PLACEHOLDER

END $$;
