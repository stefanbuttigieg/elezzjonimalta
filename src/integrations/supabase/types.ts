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
      admin_audit_log: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          after: Json | null
          before: Json | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          metadata: Json
          note: string | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          metadata?: Json
          note?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          metadata?: Json
          note?: string | null
        }
        Relationships: []
      }
      api_request_logs: {
        Row: {
          created_at: string
          endpoint: string
          id: string
          ip_hash: string | null
          method: string
          query_string: string | null
          response_time_ms: number | null
          status_code: number
          user_agent: string | null
        }
        Insert: {
          created_at?: string
          endpoint: string
          id?: string
          ip_hash?: string | null
          method: string
          query_string?: string | null
          response_time_ms?: number | null
          status_code: number
          user_agent?: string | null
        }
        Update: {
          created_at?: string
          endpoint?: string
          id?: string
          ip_hash?: string | null
          method?: string
          query_string?: string | null
          response_time_ms?: number | null
          status_code?: number
          user_agent?: string | null
        }
        Relationships: []
      }
      candidate_contributions: {
        Row: {
          attendance_pct: number | null
          bills_cosponsored: number | null
          bills_sponsored: number | null
          candidate_id: string
          created_at: string
          id: string
          legislature_number: number
          pmqs_count: number | null
          source_url: string | null
          speeches_count: number | null
          summary_en: string | null
          summary_mt: string | null
          synced_at: string | null
          updated_at: string
        }
        Insert: {
          attendance_pct?: number | null
          bills_cosponsored?: number | null
          bills_sponsored?: number | null
          candidate_id: string
          created_at?: string
          id?: string
          legislature_number: number
          pmqs_count?: number | null
          source_url?: string | null
          speeches_count?: number | null
          summary_en?: string | null
          summary_mt?: string | null
          synced_at?: string | null
          updated_at?: string
        }
        Update: {
          attendance_pct?: number | null
          bills_cosponsored?: number | null
          bills_sponsored?: number | null
          candidate_id?: string
          created_at?: string
          id?: string
          legislature_number?: number
          pmqs_count?: number | null
          source_url?: string | null
          speeches_count?: number | null
          summary_en?: string | null
          summary_mt?: string | null
          synced_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "candidate_contributions_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
        ]
      }
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
      candidate_endorsements: {
        Row: {
          attributed_role: string | null
          attributed_to: string
          candidate_id: string
          created_at: string
          id: string
          published_at: string | null
          quote_en: string | null
          quote_mt: string | null
          sort_order: number
          source_url: string | null
          status: Database["public"]["Enums"]["review_status"]
          updated_at: string
        }
        Insert: {
          attributed_role?: string | null
          attributed_to: string
          candidate_id: string
          created_at?: string
          id?: string
          published_at?: string | null
          quote_en?: string | null
          quote_mt?: string | null
          sort_order?: number
          source_url?: string | null
          status?: Database["public"]["Enums"]["review_status"]
          updated_at?: string
        }
        Update: {
          attributed_role?: string | null
          attributed_to?: string
          candidate_id?: string
          created_at?: string
          id?: string
          published_at?: string | null
          quote_en?: string | null
          quote_mt?: string | null
          sort_order?: number
          source_url?: string | null
          status?: Database["public"]["Enums"]["review_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "candidate_endorsements_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
        ]
      }
      candidate_media: {
        Row: {
          candidate_id: string
          created_at: string
          description: string | null
          embed_id: string | null
          id: string
          kind: Database["public"]["Enums"]["candidate_media_kind"]
          language: string | null
          provider: string | null
          published_at: string | null
          sort_order: number
          source_url: string | null
          status: Database["public"]["Enums"]["review_status"]
          thumbnail_url: string | null
          title: string | null
          updated_at: string
          url: string
        }
        Insert: {
          candidate_id: string
          created_at?: string
          description?: string | null
          embed_id?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["candidate_media_kind"]
          language?: string | null
          provider?: string | null
          published_at?: string | null
          sort_order?: number
          source_url?: string | null
          status?: Database["public"]["Enums"]["review_status"]
          thumbnail_url?: string | null
          title?: string | null
          updated_at?: string
          url: string
        }
        Update: {
          candidate_id?: string
          created_at?: string
          description?: string | null
          embed_id?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["candidate_media_kind"]
          language?: string | null
          provider?: string | null
          published_at?: string | null
          sort_order?: number
          source_url?: string | null
          status?: Database["public"]["Enums"]["review_status"]
          thumbnail_url?: string | null
          title?: string | null
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "candidate_media_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
        ]
      }
      candidate_positions: {
        Row: {
          body: string | null
          candidate_id: string
          created_at: string
          end_date: string | null
          id: string
          is_current: boolean
          legislature_number: number | null
          source_url: string | null
          start_date: string | null
          title: string
          updated_at: string
        }
        Insert: {
          body?: string | null
          candidate_id: string
          created_at?: string
          end_date?: string | null
          id?: string
          is_current?: boolean
          legislature_number?: number | null
          source_url?: string | null
          start_date?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          body?: string | null
          candidate_id?: string
          created_at?: string
          end_date?: string | null
          id?: string
          is_current?: boolean
          legislature_number?: number | null
          source_url?: string | null
          start_date?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "candidate_positions_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
        ]
      }
      candidate_sources: {
        Row: {
          candidate_id: string
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["source_kind"]
          label: string
          note_en: string | null
          note_mt: string | null
          publisher: string | null
          retrieved_at: string
          updated_at: string
          url: string
        }
        Insert: {
          candidate_id: string
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["source_kind"]
          label: string
          note_en?: string | null
          note_mt?: string | null
          publisher?: string | null
          retrieved_at?: string
          updated_at?: string
          url: string
        }
        Update: {
          candidate_id?: string
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["source_kind"]
          label?: string
          note_en?: string | null
          note_mt?: string | null
          publisher?: string | null
          retrieved_at?: string
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "candidate_sources_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
        ]
      }
      candidates: {
        Row: {
          bio_en: string | null
          bio_mt: string | null
          birthplace: string | null
          commission_confirmed: boolean
          created_at: string
          date_of_birth: string | null
          education: string | null
          electoral_confirmed: boolean
          email: string | null
          facebook: string | null
          full_name: string
          id: string
          imported_from: string | null
          instagram: string | null
          is_incumbent: boolean
          languages: string[] | null
          leadership_role: string | null
          linkedin: string | null
          not_contesting_2026: boolean
          not_contesting_note_en: string | null
          not_contesting_note_mt: string | null
          not_contesting_source_url: string | null
          notes: string | null
          office_address: string | null
          parlament_mt_url: string | null
          parliament_member_id: string | null
          parliament_synced_at: string | null
          party_id: string | null
          phone: string | null
          photo_url: string | null
          primary_district_id: string | null
          profession: string | null
          slug: string
          source_url: string | null
          status: Database["public"]["Enums"]["review_status"]
          tiktok: string | null
          twitter: string | null
          updated_at: string
          website: string | null
          youtube: string | null
        }
        Insert: {
          bio_en?: string | null
          bio_mt?: string | null
          birthplace?: string | null
          commission_confirmed?: boolean
          created_at?: string
          date_of_birth?: string | null
          education?: string | null
          electoral_confirmed?: boolean
          email?: string | null
          facebook?: string | null
          full_name: string
          id?: string
          imported_from?: string | null
          instagram?: string | null
          is_incumbent?: boolean
          languages?: string[] | null
          leadership_role?: string | null
          linkedin?: string | null
          not_contesting_2026?: boolean
          not_contesting_note_en?: string | null
          not_contesting_note_mt?: string | null
          not_contesting_source_url?: string | null
          notes?: string | null
          office_address?: string | null
          parlament_mt_url?: string | null
          parliament_member_id?: string | null
          parliament_synced_at?: string | null
          party_id?: string | null
          phone?: string | null
          photo_url?: string | null
          primary_district_id?: string | null
          profession?: string | null
          slug: string
          source_url?: string | null
          status?: Database["public"]["Enums"]["review_status"]
          tiktok?: string | null
          twitter?: string | null
          updated_at?: string
          website?: string | null
          youtube?: string | null
        }
        Update: {
          bio_en?: string | null
          bio_mt?: string | null
          birthplace?: string | null
          commission_confirmed?: boolean
          created_at?: string
          date_of_birth?: string | null
          education?: string | null
          electoral_confirmed?: boolean
          email?: string | null
          facebook?: string | null
          full_name?: string
          id?: string
          imported_from?: string | null
          instagram?: string | null
          is_incumbent?: boolean
          languages?: string[] | null
          leadership_role?: string | null
          linkedin?: string | null
          not_contesting_2026?: boolean
          not_contesting_note_en?: string | null
          not_contesting_note_mt?: string | null
          not_contesting_source_url?: string | null
          notes?: string | null
          office_address?: string | null
          parlament_mt_url?: string | null
          parliament_member_id?: string | null
          parliament_synced_at?: string | null
          party_id?: string | null
          phone?: string | null
          photo_url?: string | null
          primary_district_id?: string | null
          profession?: string | null
          slug?: string
          source_url?: string | null
          status?: Database["public"]["Enums"]["review_status"]
          tiktok?: string | null
          twitter?: string | null
          updated_at?: string
          website?: string | null
          youtube?: string | null
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
      news_articles: {
        Row: {
          created_at: string
          error: string | null
          fetched_at: string
          id: string
          published_at: string | null
          scan_status: string
          source_id: string
          title: string | null
          url: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          fetched_at?: string
          id?: string
          published_at?: string | null
          scan_status?: string
          source_id: string
          title?: string | null
          url: string
        }
        Update: {
          created_at?: string
          error?: string | null
          fetched_at?: string
          id?: string
          published_at?: string | null
          scan_status?: string
          source_id?: string
          title?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "news_articles_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "news_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      news_findings: {
        Row: {
          alert_seen_at: string | null
          article_id: string
          candidate_id: string | null
          confidence: number
          created_at: string
          extracted: Json
          id: string
          kind: Database["public"]["Enums"]["news_finding_kind"]
          proposal_id: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          source_id: string
          status: Database["public"]["Enums"]["news_finding_status"]
          summary_en: string | null
          summary_mt: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          alert_seen_at?: string | null
          article_id: string
          candidate_id?: string | null
          confidence?: number
          created_at?: string
          extracted?: Json
          id?: string
          kind: Database["public"]["Enums"]["news_finding_kind"]
          proposal_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_id: string
          status?: Database["public"]["Enums"]["news_finding_status"]
          summary_en?: string | null
          summary_mt?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          alert_seen_at?: string | null
          article_id?: string
          candidate_id?: string | null
          confidence?: number
          created_at?: string
          extracted?: Json
          id?: string
          kind?: Database["public"]["Enums"]["news_finding_kind"]
          proposal_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_id?: string
          status?: Database["public"]["Enums"]["news_finding_status"]
          summary_en?: string | null
          summary_mt?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "news_findings_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "news_articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "news_findings_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "news_findings_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "news_findings_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "news_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      news_scan_runs: {
        Row: {
          articles_discovered: number
          articles_scanned: number
          created_at: string
          error: string | null
          findings_created: number
          finished_at: string | null
          id: string
          source_id: string | null
          started_at: string
          trigger: Database["public"]["Enums"]["news_scan_trigger"]
          triggered_by: string | null
        }
        Insert: {
          articles_discovered?: number
          articles_scanned?: number
          created_at?: string
          error?: string | null
          findings_created?: number
          finished_at?: string | null
          id?: string
          source_id?: string | null
          started_at?: string
          trigger: Database["public"]["Enums"]["news_scan_trigger"]
          triggered_by?: string | null
        }
        Update: {
          articles_discovered?: number
          articles_scanned?: number
          created_at?: string
          error?: string | null
          findings_created?: number
          finished_at?: string | null
          id?: string
          source_id?: string | null
          started_at?: string
          trigger?: Database["public"]["Enums"]["news_scan_trigger"]
          triggered_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "news_scan_runs_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "news_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      news_sources: {
        Row: {
          base_url: string
          created_at: string
          enabled: boolean
          id: string
          last_scanned_at: string | null
          name: string
          sitemap_url: string | null
          slug: string
          updated_at: string
        }
        Insert: {
          base_url: string
          created_at?: string
          enabled?: boolean
          id?: string
          last_scanned_at?: string | null
          name: string
          sitemap_url?: string | null
          slug: string
          updated_at?: string
        }
        Update: {
          base_url?: string
          created_at?: string
          enabled?: boolean
          id?: string
          last_scanned_at?: string | null
          name?: string
          sitemap_url?: string | null
          slug?: string
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
          cover_image_url: string | null
          created_at: string
          description_en: string | null
          description_mt: string | null
          founded_year: number | null
          id: string
          imported_from: string | null
          leader_name: string | null
          logo_url: string | null
          name_en: string
          name_mt: string | null
          short_name: string | null
          slogan_en: string | null
          slogan_mt: string | null
          slug: string
          source_url: string | null
          status: Database["public"]["Enums"]["review_status"]
          updated_at: string
          website: string | null
          wikipedia_url: string | null
        }
        Insert: {
          color?: string | null
          cover_image_url?: string | null
          created_at?: string
          description_en?: string | null
          description_mt?: string | null
          founded_year?: number | null
          id?: string
          imported_from?: string | null
          leader_name?: string | null
          logo_url?: string | null
          name_en: string
          name_mt?: string | null
          short_name?: string | null
          slogan_en?: string | null
          slogan_mt?: string | null
          slug: string
          source_url?: string | null
          status?: Database["public"]["Enums"]["review_status"]
          updated_at?: string
          website?: string | null
          wikipedia_url?: string | null
        }
        Update: {
          color?: string | null
          cover_image_url?: string | null
          created_at?: string
          description_en?: string | null
          description_mt?: string | null
          founded_year?: number | null
          id?: string
          imported_from?: string | null
          leader_name?: string | null
          logo_url?: string | null
          name_en?: string
          name_mt?: string | null
          short_name?: string | null
          slogan_en?: string | null
          slogan_mt?: string | null
          slug?: string
          source_url?: string | null
          status?: Database["public"]["Enums"]["review_status"]
          updated_at?: string
          website?: string | null
          wikipedia_url?: string | null
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
      proposal_categories: {
        Row: {
          created_at: string
          description_en: string | null
          id: string
          name_en: string
          name_mt: string | null
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description_en?: string | null
          id?: string
          name_en: string
          name_mt?: string | null
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description_en?: string | null
          id?: string
          name_en?: string
          name_mt?: string | null
          slug?: string
          sort_order?: number
          updated_at?: string
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
      candidate_media_kind:
        | "video"
        | "podcast"
        | "interview"
        | "speech"
        | "article"
      news_finding_kind:
        | "proposal"
        | "new_candidate"
        | "election_development"
        | "not_relevant"
      news_finding_status: "pending" | "accepted" | "dismissed" | "reviewed"
      news_scan_trigger: "cron" | "manual"
      review_status: "draft" | "pending_review" | "published" | "archived"
      source_kind: "official" | "manifesto" | "news" | "social" | "other"
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
      candidate_media_kind: [
        "video",
        "podcast",
        "interview",
        "speech",
        "article",
      ],
      news_finding_kind: [
        "proposal",
        "new_candidate",
        "election_development",
        "not_relevant",
      ],
      news_finding_status: ["pending", "accepted", "dismissed", "reviewed"],
      news_scan_trigger: ["cron", "manual"],
      review_status: ["draft", "pending_review", "published", "archived"],
      source_kind: ["official", "manifesto", "news", "social", "other"],
    },
  },
} as const
