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
      candidate_districts: {
        Row: {
          candidate_id: string
          created_at: string
          district_id: string
          elected: boolean
          election_year: number
          id: string
          updated_at: string
          votes_first_count: number | null
        }
        Insert: {
          candidate_id: string
          created_at?: string
          district_id: string
          elected?: boolean
          election_year: number
          id?: string
          updated_at?: string
          votes_first_count?: number | null
        }
        Update: {
          candidate_id?: string
          created_at?: string
          district_id?: string
          elected?: boolean
          election_year?: number
          id?: string
          updated_at?: string
          votes_first_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "candidate_districts_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidate_districts_district_id_fkey"
            columns: ["district_id"]
            isOneToOne: false
            referencedRelation: "districts"
            referencedColumns: ["id"]
          },
        ]
      }
      candidates: {
        Row: {
          bio_en: string | null
          bio_mt: string | null
          created_at: string
          electoral_confirmed: boolean
          facebook: string | null
          full_name: string
          id: string
          imported_from: string | null
          is_incumbent: boolean
          notes: string | null
          parlament_mt_url: string | null
          party_id: string | null
          photo_url: string | null
          primary_district_id: string | null
          slug: string
          source_url: string | null
          status: Database["public"]["Enums"]["review_status"]
          twitter: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          bio_en?: string | null
          bio_mt?: string | null
          created_at?: string
          electoral_confirmed?: boolean
          facebook?: string | null
          full_name: string
          id?: string
          imported_from?: string | null
          is_incumbent?: boolean
          notes?: string | null
          parlament_mt_url?: string | null
          party_id?: string | null
          photo_url?: string | null
          primary_district_id?: string | null
          slug: string
          source_url?: string | null
          status?: Database["public"]["Enums"]["review_status"]
          twitter?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          bio_en?: string | null
          bio_mt?: string | null
          created_at?: string
          electoral_confirmed?: boolean
          facebook?: string | null
          full_name?: string
          id?: string
          imported_from?: string | null
          is_incumbent?: boolean
          notes?: string | null
          parlament_mt_url?: string | null
          party_id?: string | null
          photo_url?: string | null
          primary_district_id?: string | null
          slug?: string
          source_url?: string | null
          status?: Database["public"]["Enums"]["review_status"]
          twitter?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "candidates_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidates_primary_district_id_fkey"
            columns: ["primary_district_id"]
            isOneToOne: false
            referencedRelation: "districts"
            referencedColumns: ["id"]
          },
        ]
      }
      districts: {
        Row: {
          created_at: string
          id: string
          localities_en: string | null
          localities_mt: string | null
          name_en: string
          name_mt: string | null
          number: number
          source_url: string | null
          status: Database["public"]["Enums"]["review_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          localities_en?: string | null
          localities_mt?: string | null
          name_en: string
          name_mt?: string | null
          number: number
          source_url?: string | null
          status?: Database["public"]["Enums"]["review_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          localities_en?: string | null
          localities_mt?: string | null
          name_en?: string
          name_mt?: string | null
          number?: number
          source_url?: string | null
          status?: Database["public"]["Enums"]["review_status"]
          updated_at?: string
        }
        Relationships: []
      }
      parliament_terms: {
        Row: {
          candidate_id: string
          created_at: string
          district_id: string | null
          end_date: string | null
          id: string
          legislature_number: number
          notes: string | null
          party_id: string | null
          role: string | null
          source_url: string | null
          start_date: string
          updated_at: string
        }
        Insert: {
          candidate_id: string
          created_at?: string
          district_id?: string | null
          end_date?: string | null
          id?: string
          legislature_number: number
          notes?: string | null
          party_id?: string | null
          role?: string | null
          source_url?: string | null
          start_date: string
          updated_at?: string
        }
        Update: {
          candidate_id?: string
          created_at?: string
          district_id?: string | null
          end_date?: string | null
          id?: string
          legislature_number?: number
          notes?: string | null
          party_id?: string | null
          role?: string | null
          source_url?: string | null
          start_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "parliament_terms_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parliament_terms_district_id_fkey"
            columns: ["district_id"]
            isOneToOne: false
            referencedRelation: "districts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parliament_terms_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
        ]
      }
      parties: {
        Row: {
          color: string | null
          created_at: string
          description_en: string | null
          description_mt: string | null
          id: string
          imported_from: string | null
          name_en: string
          name_mt: string | null
          short_name: string | null
          slug: string
          source_url: string | null
          status: Database["public"]["Enums"]["review_status"]
          updated_at: string
          website: string | null
        }
        Insert: {
          color?: string | null
          created_at?: string
          description_en?: string | null
          description_mt?: string | null
          id?: string
          imported_from?: string | null
          name_en: string
          name_mt?: string | null
          short_name?: string | null
          slug: string
          source_url?: string | null
          status?: Database["public"]["Enums"]["review_status"]
          updated_at?: string
          website?: string | null
        }
        Update: {
          color?: string | null
          created_at?: string
          description_en?: string | null
          description_mt?: string | null
          id?: string
          imported_from?: string | null
          name_en?: string
          name_mt?: string | null
          short_name?: string | null
          slug?: string
          source_url?: string | null
          status?: Database["public"]["Enums"]["review_status"]
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      proposals: {
        Row: {
          candidate_id: string | null
          category: string | null
          created_at: string
          description_en: string | null
          description_mt: string | null
          id: string
          party_id: string | null
          source_url: string | null
          status: Database["public"]["Enums"]["review_status"]
          title_en: string
          title_mt: string | null
          updated_at: string
        }
        Insert: {
          candidate_id?: string | null
          category?: string | null
          created_at?: string
          description_en?: string | null
          description_mt?: string | null
          id?: string
          party_id?: string | null
          source_url?: string | null
          status?: Database["public"]["Enums"]["review_status"]
          title_en: string
          title_mt?: string | null
          updated_at?: string
        }
        Update: {
          candidate_id?: string | null
          category?: string | null
          created_at?: string
          description_en?: string | null
          description_mt?: string | null
          id?: string
          party_id?: string | null
          source_url?: string | null
          status?: Database["public"]["Enums"]["review_status"]
          title_en?: string
          title_mt?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "proposals_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposals_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_my_roles: {
        Args: never
        Returns: Database["public"]["Enums"]["app_role"][]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_staff: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "editor" | "viewer"
      review_status: "draft" | "pending_review" | "published" | "archived"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
      app_role: ["admin", "editor", "viewer"],
      review_status: ["draft", "pending_review", "published", "archived"],
    },
  },
} as const
