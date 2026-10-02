ALTER TABLE public.bid_lignes ADD COLUMN IF NOT EXISTS prix_pose numeric(14,3);
ALTER TABLE public.produits ADD COLUMN IF NOT EXISTS prix_pose_defaut numeric(14,3);
COMMENT ON COLUMN public.bid_lignes.prix_unitaire IS 'Prix unitaire total vendu = fourniture + pose';