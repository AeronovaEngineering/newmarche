export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      activity_log: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          entity: string | null
          entity_id: string | null
          id: string
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          entity?: string | null
          entity_id?: string | null
          id?: string
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          entity?: string | null
          entity_id?: string | null
          id?: string
          user_id?: string | null
        }
        Relationships: []
      }
      bid_lignes: {
        Row: {
          candidats: Json
          confiance: Database["public"]["Enums"]["confiance"] | null
          fournisseur_produit_id: string | null
          id: string
          justification: string | null
          marche_ligne_id: string
          marge_pct: number | null
          prix_achat: number | null
          prix_pose: number | null
          prix_unitaire: number | null
          source: string
          updated_at: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          candidats?: Json
          confiance?: Database["public"]["Enums"]["confiance"] | null
          fournisseur_produit_id?: string | null
          id?: string
          justification?: string | null
          marche_ligne_id: string
          marge_pct?: number | null
          prix_achat?: number | null
          prix_pose?: number | null
          prix_unitaire?: number | null
          source?: string
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          candidats?: Json
          confiance?: Database["public"]["Enums"]["confiance"] | null
          fournisseur_produit_id?: string | null
          id?: string
          justification?: string | null
          marche_ligne_id?: string
          marge_pct?: number | null
          prix_achat?: number | null
          prix_pose?: number | null
          prix_unitaire?: number | null
          source?: string
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bid_lignes_fournisseur_produit_id_fkey"
            columns: ["fournisseur_produit_id"]
            isOneToOne: false
            referencedRelation: "fournisseur_produits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bid_lignes_marche_ligne_id_fkey"
            columns: ["marche_ligne_id"]
            isOneToOne: true
            referencedRelation: "marche_lignes"
            referencedColumns: ["id"]
          },
        ]
      }
      catalogue_staging: {
        Row: {
          action: Database["public"]["Enums"]["staging_action"]
          ancien_prix: number | null
          batch_id: string
          category_guess: string | null
          created_at: string
          created_by: string | null
          delai_livraison_jours: number | null
          fournisseur_id: string
          id: string
          matched_offre_id: string | null
          matched_produit_id: string | null
          prix_fourniture: number
          raw_designation: string
          raw_reference: string | null
          score: number | null
          specs_guess: Json
          statut: Database["public"]["Enums"]["staging_statut"]
          unite: string | null
        }
        Insert: {
          action: Database["public"]["Enums"]["staging_action"]
          ancien_prix?: number | null
          batch_id: string
          category_guess?: string | null
          created_at?: string
          created_by?: string | null
          delai_livraison_jours?: number | null
          fournisseur_id: string
          id?: string
          matched_offre_id?: string | null
          matched_produit_id?: string | null
          prix_fourniture: number
          raw_designation: string
          raw_reference?: string | null
          score?: number | null
          specs_guess?: Json
          statut?: Database["public"]["Enums"]["staging_statut"]
          unite?: string | null
        }
        Update: {
          action?: Database["public"]["Enums"]["staging_action"]
          ancien_prix?: number | null
          batch_id?: string
          category_guess?: string | null
          created_at?: string
          created_by?: string | null
          delai_livraison_jours?: number | null
          fournisseur_id?: string
          id?: string
          matched_offre_id?: string | null
          matched_produit_id?: string | null
          prix_fourniture?: number
          raw_designation?: string
          raw_reference?: string | null
          score?: number | null
          specs_guess?: Json
          statut?: Database["public"]["Enums"]["staging_statut"]
          unite?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "catalogue_staging_category_guess_fkey"
            columns: ["category_guess"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalogue_staging_fournisseur_id_fkey"
            columns: ["fournisseur_id"]
            isOneToOne: false
            referencedRelation: "fournisseurs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalogue_staging_matched_offre_id_fkey"
            columns: ["matched_offre_id"]
            isOneToOne: false
            referencedRelation: "fournisseur_produits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalogue_staging_matched_produit_id_fkey"
            columns: ["matched_produit_id"]
            isOneToOne: false
            referencedRelation: "produits"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          attribute_schema: Json
          created_at: string
          id: string
          nom: string
          ordre: number
          parent_id: string | null
          slug: string
        }
        Insert: {
          attribute_schema?: Json
          created_at?: string
          id?: string
          nom: string
          ordre?: number
          parent_id?: string | null
          slug: string
        }
        Update: {
          attribute_schema?: Json
          created_at?: string
          id?: string
          nom?: string
          ordre?: number
          parent_id?: string | null
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      chantiers: {
        Row: {
          client: string | null
          created_at: string
          created_by: string | null
          date_limite: string | null
          id: string
          marge_defaut_pct: number
          nom: string
          reference_ao: string | null
          remise_globale_type: Database["public"]["Enums"]["remise_type"]
          remise_globale_valeur: number
          soumis_at: string | null
          statut: Database["public"]["Enums"]["chantier_statut"]
          timbre_fiscal: number
          tva_taux: number
        }
        Insert: {
          client?: string | null
          created_at?: string
          created_by?: string | null
          date_limite?: string | null
          id?: string
          marge_defaut_pct?: number
          nom: string
          reference_ao?: string | null
          remise_globale_type?: Database["public"]["Enums"]["remise_type"]
          remise_globale_valeur?: number
          soumis_at?: string | null
          statut?: Database["public"]["Enums"]["chantier_statut"]
          timbre_fiscal?: number
          tva_taux?: number
        }
        Update: {
          client?: string | null
          created_at?: string
          created_by?: string | null
          date_limite?: string | null
          id?: string
          marge_defaut_pct?: number
          nom?: string
          reference_ao?: string | null
          remise_globale_type?: Database["public"]["Enums"]["remise_type"]
          remise_globale_valeur?: number
          soumis_at?: string | null
          statut?: Database["public"]["Enums"]["chantier_statut"]
          timbre_fiscal?: number
          tva_taux?: number
        }
        Relationships: []
      }
      fournisseur_produits: {
        Row: {
          conditionnement: string | null
          created_at: string
          date_maj: string
          delai_livraison_jours: number | null
          devise: string
          disponibilite: Database["public"]["Enums"]["disponibilite"]
          fournisseur_id: string
          id: string
          paliers_remise: Json | null
          prix_fourniture: number
          produit_id: string
          quantite_min_commande: number | null
          reference_fournisseur: string | null
          statut: Database["public"]["Enums"]["offre_statut"]
        }
        Insert: {
          conditionnement?: string | null
          created_at?: string
          date_maj?: string
          delai_livraison_jours?: number | null
          devise?: string
          disponibilite?: Database["public"]["Enums"]["disponibilite"]
          fournisseur_id: string
          id?: string
          paliers_remise?: Json | null
          prix_fourniture: number
          produit_id: string
          quantite_min_commande?: number | null
          reference_fournisseur?: string | null
          statut?: Database["public"]["Enums"]["offre_statut"]
        }
        Update: {
          conditionnement?: string | null
          created_at?: string
          date_maj?: string
          delai_livraison_jours?: number | null
          devise?: string
          disponibilite?: Database["public"]["Enums"]["disponibilite"]
          fournisseur_id?: string
          id?: string
          paliers_remise?: Json | null
          prix_fourniture?: number
          produit_id?: string
          quantite_min_commande?: number | null
          reference_fournisseur?: string | null
          statut?: Database["public"]["Enums"]["offre_statut"]
        }
        Relationships: [
          {
            foreignKeyName: "fournisseur_produits_fournisseur_id_fkey"
            columns: ["fournisseur_id"]
            isOneToOne: false
            referencedRelation: "fournisseurs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fournisseur_produits_produit_id_fkey"
            columns: ["produit_id"]
            isOneToOne: false
            referencedRelation: "produits"
            referencedColumns: ["id"]
          },
        ]
      }
      fournisseur_produits_historique_prix: {
        Row: {
          created_by: string | null
          date_effective: string
          fournisseur_produit_id: string
          id: string
          prix_fourniture: number
        }
        Insert: {
          created_by?: string | null
          date_effective?: string
          fournisseur_produit_id: string
          id?: string
          prix_fourniture: number
        }
        Update: {
          created_by?: string | null
          date_effective?: string
          fournisseur_produit_id?: string
          id?: string
          prix_fourniture?: number
        }
        Relationships: [
          {
            foreignKeyName: "fournisseur_produits_historique_pri_fournisseur_produit_id_fkey"
            columns: ["fournisseur_produit_id"]
            isOneToOne: false
            referencedRelation: "fournisseur_produits"
            referencedColumns: ["id"]
          },
        ]
      }
      fournisseurs: {
        Row: {
          actif: boolean
          adresse: string | null
          conditions_paiement: string | null
          contact: string | null
          created_at: string
          delai_paiement_jours: number | null
          email: string | null
          id: string
          logo_url: string | null
          matricule_fiscal: string | null
          nom: string
          note_fiabilite: number | null
          telephone: string | null
        }
        Insert: {
          actif?: boolean
          adresse?: string | null
          conditions_paiement?: string | null
          contact?: string | null
          created_at?: string
          delai_paiement_jours?: number | null
          email?: string | null
          id?: string
          logo_url?: string | null
          matricule_fiscal?: string | null
          nom: string
          note_fiabilite?: number | null
          telephone?: string | null
        }
        Update: {
          actif?: boolean
          adresse?: string | null
          conditions_paiement?: string | null
          contact?: string | null
          created_at?: string
          delai_paiement_jours?: number | null
          email?: string | null
          id?: string
          logo_url?: string | null
          matricule_fiscal?: string | null
          nom?: string
          note_fiabilite?: number | null
          telephone?: string | null
        }
        Relationships: []
      }
      marche_chapitres: {
        Row: {
          code: string
          id: string
          marche_id: string
          ordre: number
          remise_type: Database["public"]["Enums"]["remise_type"]
          remise_valeur: number
          titre: string | null
        }
        Insert: {
          code: string
          id?: string
          marche_id: string
          ordre?: number
          remise_type?: Database["public"]["Enums"]["remise_type"]
          remise_valeur?: number
          titre?: string | null
        }
        Update: {
          code?: string
          id?: string
          marche_id?: string
          ordre?: number
          remise_type?: Database["public"]["Enums"]["remise_type"]
          remise_valeur?: number
          titre?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "marche_chapitres_marche_id_fkey"
            columns: ["marche_id"]
            isOneToOne: false
            referencedRelation: "marches"
            referencedColumns: ["id"]
          },
        ]
      }
      marche_lignes: {
        Row: {
          chapitre_id: string | null
          created_at: string
          designation: string
          id: string
          marche_id: string
          numero: string | null
          ordre: number
          quantite: number
          statut: Database["public"]["Enums"]["ligne_statut"]
          unite: string | null
        }
        Insert: {
          chapitre_id?: string | null
          created_at?: string
          designation: string
          id?: string
          marche_id: string
          numero?: string | null
          ordre?: number
          quantite?: number
          statut?: Database["public"]["Enums"]["ligne_statut"]
          unite?: string | null
        }
        Update: {
          chapitre_id?: string | null
          created_at?: string
          designation?: string
          id?: string
          marche_id?: string
          numero?: string | null
          ordre?: number
          quantite?: number
          statut?: Database["public"]["Enums"]["ligne_statut"]
          unite?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "marche_lignes_chapitre_id_fkey"
            columns: ["chapitre_id"]
            isOneToOne: false
            referencedRelation: "marche_chapitres"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marche_lignes_marche_id_fkey"
            columns: ["marche_id"]
            isOneToOne: false
            referencedRelation: "marches"
            referencedColumns: ["id"]
          },
        ]
      }
      marches: {
        Row: {
          chantier_id: string
          created_at: string
          id: string
          nom: string
          ordre: number
        }
        Insert: {
          chantier_id: string
          created_at?: string
          id?: string
          nom: string
          ordre?: number
        }
        Update: {
          chantier_id?: string
          created_at?: string
          id?: string
          nom?: string
          ordre?: number
        }
        Relationships: [
          {
            foreignKeyName: "marches_chantier_id_fkey"
            columns: ["chantier_id"]
            isOneToOne: false
            referencedRelation: "chantiers"
            referencedColumns: ["id"]
          },
        ]
      }
      produits: {
        Row: {
          category_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          designation: string
          fiche_technique_url: string | null
          id: string
          images: string[]
          marque: string | null
          prix_pose_defaut: number | null
          reference_constructeur: string | null
          specs: Json
          unite_reference: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          designation: string
          fiche_technique_url?: string | null
          id?: string
          images?: string[]
          marque?: string | null
          prix_pose_defaut?: number | null
          reference_constructeur?: string | null
          specs?: Json
          unite_reference?: string
        }
        Update: {
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          designation?: string
          fiche_technique_url?: string | null
          id?: string
          images?: string[]
          marque?: string | null
          prix_pose_defaut?: number | null
          reference_constructeur?: string | null
          specs?: Json
          unite_reference?: string
        }
        Relationships: [
          {
            foreignKeyName: "produits_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          id: string
          nom: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          id: string
          nom?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          nom?: string | null
        }
        Relationships: []
      }
      user_permissions: {
        Row: {
          user_id: string
          is_admin: boolean
          catalogue_write: boolean
          catalogue_approve: boolean
          fournisseurs_write: boolean
          bids_write: boolean
          bids_export: boolean
          view_purchase_prices: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          user_id: string
          is_admin?: boolean
          catalogue_write?: boolean
          catalogue_approve?: boolean
          fournisseurs_write?: boolean
          bids_write?: boolean
          bids_export?: boolean
          view_purchase_prices?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          user_id?: string
          is_admin?: boolean
          catalogue_write?: boolean
          catalogue_approve?: boolean
          fournisseurs_write?: boolean
          bids_write?: boolean
          bids_export?: boolean
          view_purchase_prices?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      bootstrap_user: {
        Args: never
        Returns: Database["public"]["Tables"]["user_permissions"]["Row"]
      }
      has_perm: { Args: { _user_id: string; _perm: string }; Returns: boolean }
      is_active: { Args: { _user_id: string }; Returns: boolean }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      promote_staging: { Args: { p_ids: string[] }; Returns: number }
    }
    Enums: {
      chantier_statut: "brouillon" | "en_cours" | "soumis" | "gagne" | "perdu"
      confiance: "high" | "medium" | "low" | "none"
      disponibilite: "en_stock" | "sur_commande" | "rupture"
      ligne_statut: "non_rempli" | "suggestion_ia" | "verifie"
      offre_statut: "brouillon" | "verifie"
      remise_type: "pct" | "montant"
      staging_action:
        | "nouveau_produit"
        | "nouvelle_offre"
        | "maj_prix"
        | "inchange"
      staging_statut: "en_attente" | "approuve" | "rejete"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      chantier_statut: ["brouillon", "en_cours", "soumis", "gagne", "perdu"],
      confiance: ["high", "medium", "low", "none"],
      disponibilite: ["en_stock", "sur_commande", "rupture"],
      ligne_statut: ["non_rempli", "suggestion_ia", "verifie"],
      offre_statut: ["brouillon", "verifie"],
      remise_type: ["pct", "montant"],
      staging_action: [
        "nouveau_produit",
        "nouvelle_offre",
        "maj_prix",
        "inchange",
      ],
      staging_statut: ["en_attente", "approuve", "rejete"],
    },
  },
} as const
