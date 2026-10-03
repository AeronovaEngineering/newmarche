-- 0006 — retrait du seed de TEST (0002_seed_test_catalogue = 0005_testgaz, fichiers identiques)
-- Supprime : les 2 fournisseurs de test (offres en cascade) + les 64 produits de test.
-- Ne touche PAS aux données réelles de 0003 / 0004 : un produit n'est supprimé que si
--   (a) sa désignation figure dans la liste du seed de test,
--   (b) il n'a pas de marque (les produits réels ont une marque),
--   (c) il n'a plus aucune offre d'un fournisseur réel.
-- Les catégories ne sont pas touchées (partagées avec 0003/0004, ex. reseau-gaz).
-- Idempotent : relançable sans effet si déjà nettoyé.

DO $$
DECLARE n_off int; n_prod int; n_four int;
BEGIN
  -- 1) offres des fournisseurs de test
  DELETE FROM public.fournisseur_produits
   WHERE fournisseur_id IN (SELECT id FROM public.fournisseurs WHERE nom LIKE 'Fournisseur Test - %');
  GET DIAGNOSTICS n_off = ROW_COUNT;

  -- 2) produits de test (sans marque, sans offre restante)
  DELETE FROM public.produits p
   WHERE p.marque IS NULL
     AND p.designation IN (
    'Vanne d''arrêt sphérique DN15',
    'Vanne d''arrêt sphérique DN25',
    'Vanne d''arrêt sphérique DN50',
    'Electro-vanne électromagnétique pour coupure gaz DN 25',
    'Electro-vanne électromagnétique pour coupure gaz DN 50',
    'Manomètre à cadran diam 80 type gaz, 0 à 400 mbar',
    'Manomètre à cadran diam 80 type gaz, 0 à 60 mbar',
    'Détendeur secondaire gaz naturel - Equipements Cuisine (300→0-21 mbar, 10 Nm3/h)',
    'Tuyauterie en cuivre rigide ø 50/52',
    'Tuyauterie en cuivre rigide ø 26/28',
    'Tuyauterie en cuivre rigide ø 14/16',
    'Flexible armé gaz en jaune DN 15',
    'Démontage du réseau gaz en acier existant',
    'Schéma de principe et schéma des installations gaz avec notice de fonctionnement et d''entretien',
    'Travaux de préinstallation de split-système simple y compris la fourniture et la pose des liaisons frigorifiques, du câble électrique, de la tuyauterie d''évacuation condensat en tube multicouches ø int 20, fourreaux-travaux de démolition dans la maçonnerie, et toutes sujétions pour une parfaite installation.',
    'Fourniture et pose d''une boite encastrable en plastique pour la pré-installation d''un split système.',
    'Fourniture et pose d’un extracteur individuel étanche classe II IP x 4 de 100m3/h équipé de clapet pour installation dans salles de bain et salles d’eau y compris raccordement électrique minuterie intégrée de 5 à 40 minutes et toutes sujétions.',
    'Fourniture et pose de grille de décompression en alu peint epoxy blanc pour ventilation basse des cuisines à installer sur une porte en aluminium sur les deux faces (section 150 cm²) (l''échantillon doit être approuvé par l''ingénieur avant fourniture)',
    'Idem article précèdent pour ventilation haute des cuisines (section 250cm2) composée d''un fourreau de traversés de mur et de deux grilles de rejet 20x20cm (l''échantillon doit être approuvé par l''ingénieur avant fourniture)',
    'Fourniture, pose et raccordement d’une gaine d’extraction en tôle galvanisé épaisseur 8/10ème y compris support en acier galvanisé, pièces spéciales, joints, assemblage et toutes sujétions. a) ø 100',
    'Fourniture, pose et raccordement d’une gaine d’extraction en tôle galvanisé épaisseur 8/10ème y compris support en acier galvanisé, pièces spéciales, joints, assemblage et toutes sujétions. b) ø 160',
    'Fourniture, pose et raccordement d’une gaine d’extraction en tôle galvanisé épaisseur 8/10ème y compris support en acier galvanisé, pièces spéciales, joints, assemblage et toutes sujétions. c) ø 200 (spiralée)',
    'Fourniture et pose de grille d''air neuf (en aluminium extrudé avec grillage de protection) pour ventilation basse et haute de la gaine gaz, toutes sujétions de fourniture et de pose incluses. a)Dim : 400x250 ( pour la VB et VH de la gaine gaz )',
    'Fourniture et pose de grille d''air neuf (en aluminium extrudé avec grillage de protection) pour ventilation basse et haute de la gaine gaz, toutes sujétions de fourniture et de pose incluses. b) Dim: 200x200 ( pour rejet extraction latérale SD )',
    'Fourniture et pose d''un extracteur mural hélicoïdale équipé d''une jalousie automatique. Débit: 300m3/h',
    'Fourniture et pose de gaine circulaire et fourreau ø 125 de traversés de mur et d''une grille de rejet 15 x 15 cm ( pour hotte cuisinière )',
    'Fourniture, pose, fixation, raccordement et mise en service d''un caisson d''extraction constitué de panneaux en tôle d''acier galvanisé, ventilateur centrifuge isolé du caisson par des plots antivibratiles y compris manchettes souples, jalousie, coupe courant étanche placé à l''extérieur à proximité du caisson,raccordement électrique , fourreau, chemin de câble et toutes sujétions. a) Débit :200 m3/h - pression disponible 10 mm C.E',
    'Fourniture, pose, fixation, raccordement et mise en service d''un caisson d''extraction constitué de panneaux en tôle d''acier galvanisé, ventilateur centrifuge isolé du caisson par des plots antivibratiles y compris manchettes souples, jalousie, coupe courant étanche placé à l''extérieur à proximité du caisson,raccordement électrique , fourreau, chemin de câble et toutes sujétions. b) Débit :300 m3/h - pression disponible 10 mm C.E',
    'Fourniture et pose de grille de reprise ou d''extraction en Alu anodisé peint époxy blanc à simple déflexion à ailettes fixes inclinées avec damper y compris cadre à sceller et toutes sujétions de finition et de fixation incluses.',
    'Fourniture, pose et raccordement d’une bouche d’extraction autoréglable paraflamme y compris flexible de raccordement en aluminium sur conduit d’extraction et toutes sujétions.',
    'Pose, raccordement et mise en service d''une chaudière à gaz murale mixte à ventouse y compris raccordement eau, gaz, électricité,pose et raccordement du thermostat filaires y compris fourniture et pose du fourreau et câble de commande.',
    'Pose, fixation et raccordement de radiateur , y compris fixation et scellement des supports, pose, raccordement des accessoires: robinet de réglage, té de réglage et purgeur d’air à clef et toutes sujétions.',
    'Pose, fixation et raccordement de séche serviette , y compris fixation et scellement des supports, pose, raccordement des accessoires: robinet de réglage, té de réglage et purgeur d’air à clef et toutes sujétions. a) TYPE 300W',
    'Pose, fixation et raccordement de séche serviette , y compris fixation et scellement des supports, pose, raccordement des accessoires: robinet de réglage, té de réglage et purgeur d’air à clef et toutes sujétions. b) TYPE 500W',
    'Fourniture et pose de vanne d''isolement à manchon taraudé',
    'Fourniture et pose de tuyauterie de chauffage central en polyéthylène réticulé (multicouches): PEX/AL/PEX- 95°C – 10Bars composés de cinq couches: 2 couches en polyéthylène réticulé , de deux couches d’adhésif et d’une couche aluminium dégraissé y compris tous les accessoires de pose et de raccordement, raccords à sertir en laiton chromé bague en inox, toutes sujétions incluses pour une parfaite pose sous carrelage, protection mécanique par tube gorge et essais sous pression. a) ø intérieur 12 – ø extérieur 16',
    'Fourniture et pose de tuyauterie de chauffage central en polyéthylène réticulé (multicouches): PEX/AL/PEX- 95°C – 10Bars composés de cinq couches: 2 couches en polyéthylène réticulé , de deux couches d’adhésif et d’une couche aluminium dégraissé y compris tous les accessoires de pose et de raccordement, raccords à sertir en laiton chromé bague en inox, toutes sujétions incluses pour une parfaite pose sous carrelage, protection mécanique par tube gorge et essais sous pression. b) ø intérieur 20 – ø extérieur 25',
    'Fourniture et pose d''un collecteur préfabriqué en laiton chromé, diamètre 1'''', avec vannes d''isolement pour chaque départ y compris raccords, purgeur automatique , supports galvanisés, accessoires et toutes sujétions. a) Collecteurs à 4 sorties',
    'Fourniture et pose d''un collecteur préfabriqué en laiton chromé, diamètre 1'''', avec vannes d''isolement pour chaque départ y compris raccords, purgeur automatique , supports galvanisés, accessoires et toutes sujétions. b) Collecteurs à 5 sorties',
    'Fourniture et pose d''un collecteur préfabriqué en laiton chromé, diamètre 1'''', avec vannes d''isolement pour chaque départ y compris raccords, purgeur automatique , supports galvanisés, accessoires et toutes sujétions. c) Collecteurs à 6 sorties',
    'Fourniture et pose d''un collecteur préfabriqué en laiton chromé, diamètre 1'''', avec vannes d''isolement pour chaque départ y compris raccords, purgeur automatique , supports galvanisés, accessoires et toutes sujétions. d) Collecteurs à 7 sorties',
    'Fourniture et pose d''un collecteur préfabriqué en laiton chromé, diamètre 1'''', avec vannes d''isolement pour chaque départ y compris raccords, purgeur automatique , supports galvanisés, accessoires et toutes sujétions. e) Collecteurs à 8 sorties',
    'Fourniture et pose de boite pour encastrer les collecteurs dans le mur dim. variables suivant les dim. des collecteurs y compris couvercle visitable et toutes sujétions. a) En matière plastique robuste',
    'Fourniture et pose de boite pour encastrer les collecteurs dans le mur dim. variables suivant les dim. des collecteurs y compris couvercle visitable et toutes sujétions. b) En acier peint époxy blanc',
    'Fourniture , pose et raccordement de tuyauterie apparente a) ø 26/28',
    'Fourniture , pose et raccordement de tuyauterie apparente b) ø 20/22',
    'Fourniture , pose et raccordement de tuyauterie apparente c) ø 14/16',
    'Fourniture, pose et raccordement d''une vanne d''arrêt a) DN 15 (avec tétine pour cuisinière).',
    'Fourniture, pose et raccordement d''une vanne d''arrêt b) DN 20 (pour alimentation chaudières)',
    'Fourniture, pose et raccordement d''un flexible armé (spécial gaz) agrée par la STEG pour raccorder les cuisinières ou plaques chauffantes',
    'Pose de vasque y compris raccordement de la robinetterie et accessoires de vidange pour une parfaite mise en marche de l''installation.',
    'Idem article précèdent pour lavabo sur colonne',
    'Idem article précèdent pour meuble vasque (élément bas)',
    'Idem article précèdent pour meuble vasque (élément haut comprenant miroir et élément de rangement vertical)',
    'Idem article précèdent pour évier double bacs',
    'Idem article précèdent pour évier simple bac',
    'Idem article précèdent pour caniveau de douche',
    'Idem article précèdent pour baignoire en fonte ou acrylique.',
    'Idem article précèdent pour cuvette suspendue+ chasse encastrée.',
    'Pose de robinet flexible ou mélangeur pour WC',
    'Fourniture et pose a) Siphon de sol 15x15 en inox ou en PVC dur',
    'Fourniture et pose b) Siphon de cour 25x25 en alu ou en PVC dur',
    'Fourniture et pose c) Robinet pour machine à laver / lave vaisselle',
    'Fourniture et pose d) Siphon pour machine à laver / lave vaisselle'
     )
     AND NOT EXISTS (SELECT 1 FROM public.fournisseur_produits fp WHERE fp.produit_id = p.id);
  GET DIAGNOSTICS n_prod = ROW_COUNT;

  -- 3) fournisseurs de test
  DELETE FROM public.fournisseurs WHERE nom LIKE 'Fournisseur Test - %';
  GET DIAGNOSTICS n_four = ROW_COUNT;

  RAISE NOTICE 'Nettoyage test : % offres, % produits, % fournisseurs supprimés', n_off, n_prod, n_four;
END $$;
