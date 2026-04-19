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
      audit_logs: {
        Row: {
          action: string
          created_at: string
          entity_id: string | null
          entity_type: string
          group_id: string | null
          id: string
          new_data: Json | null
          old_data: Json | null
          reason: string | null
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          entity_id?: string | null
          entity_type: string
          group_id?: string | null
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          reason?: string | null
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          group_id?: string | null
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          reason?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      branding_settings: {
        Row: {
          created_at: string
          custom_name: string | null
          group_id: string
          id: string
          logo_url: string | null
          primary_color: string | null
          secondary_color: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          custom_name?: string | null
          group_id: string
          id?: string
          logo_url?: string | null
          primary_color?: string | null
          secondary_color?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          custom_name?: string | null
          group_id?: string
          id?: string
          logo_url?: string | null
          primary_color?: string | null
          secondary_color?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "branding_settings_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: true
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      comment_reactions: {
        Row: {
          comment_id: string
          created_at: string
          emoji: string
          id: string
          user_id: string
        }
        Insert: {
          comment_id: string
          created_at?: string
          emoji?: string
          id?: string
          user_id: string
        }
        Update: {
          comment_id?: string
          created_at?: string
          emoji?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comment_reactions_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
        ]
      }
      comments: {
        Row: {
          content: string
          created_at: string
          group_id: string
          id: string
          match_id: string | null
          parent_id: string | null
          round_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          group_id: string
          id?: string
          match_id?: string | null
          parent_id?: string | null
          round_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          group_id?: string
          id?: string
          match_id?: string | null
          parent_id?: string | null
          round_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comments_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      compare_favorites: {
        Row: {
          created_at: string
          group_id: string
          id: string
          label: string
          player_ids: string[]
          sort_order: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          group_id: string
          id?: string
          label: string
          player_ids: string[]
          sort_order?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          group_id?: string
          id?: string
          label?: string
          player_ids?: string[]
          sort_order?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      courts: {
        Row: {
          court_number: number
          created_at: string
          id: string
          name: string | null
          round_id: string
        }
        Insert: {
          court_number?: number
          created_at?: string
          id?: string
          name?: string | null
          round_id: string
        }
        Update: {
          court_number?: number
          created_at?: string
          id?: string
          name?: string | null
          round_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "courts_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      exports: {
        Row: {
          created_at: string
          file_url: string | null
          group_id: string
          id: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          file_url?: string | null
          group_id: string
          id?: string
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          file_url?: string | null
          group_id?: string
          id?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exports_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      group_admin_permissions: {
        Row: {
          can_edit_scores: boolean
          can_invite_members: boolean
          can_manage_rounds: boolean
          can_remove_members: boolean
          created_at: string
          group_id: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          can_edit_scores?: boolean
          can_invite_members?: boolean
          can_manage_rounds?: boolean
          can_remove_members?: boolean
          created_at?: string
          group_id: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          can_edit_scores?: boolean
          can_invite_members?: boolean
          can_manage_rounds?: boolean
          can_remove_members?: boolean
          created_at?: string
          group_id?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_admin_permissions_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      group_join_requests: {
        Row: {
          claimed_player_id: string | null
          claimed_player_kind: string | null
          created_at: string
          group_id: string
          id: string
          message: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
          user_id: string
        }
        Insert: {
          claimed_player_id?: string | null
          claimed_player_kind?: string | null
          created_at?: string
          group_id: string
          id?: string
          message?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          user_id: string
        }
        Update: {
          claimed_player_id?: string | null
          claimed_player_kind?: string | null
          created_at?: string
          group_id?: string
          id?: string
          message?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_join_requests_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      group_members: {
        Row: {
          group_id: string
          id: string
          joined_at: string
          role: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          group_id: string
          id?: string
          joined_at?: string
          role?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          group_id?: string
          id?: string
          joined_at?: string
          role?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      group_subscriptions: {
        Row: {
          created_at: string
          expires_at: string | null
          group_id: string
          id: string
          plan_id: string | null
          started_at: string | null
          status: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          group_id: string
          id?: string
          plan_id?: string | null
          started_at?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          group_id?: string
          id?: string
          plan_id?: string | null
          started_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_subscriptions_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "premium_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      groups: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          fixed_day: number | null
          id: string
          image_url: string | null
          is_public: boolean
          match_format: string
          max_players: number
          mode: string
          name: string
          presence_open_mode: string
          presence_open_time: string
          simultaneous_courts: number
          singles_group_type: string | null
          slots_per_round: number
          sport: string
          status: string
          updated_at: string
          visibility: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          fixed_day?: number | null
          id?: string
          image_url?: string | null
          is_public?: boolean
          match_format?: string
          max_players?: number
          mode?: string
          name: string
          presence_open_mode?: string
          presence_open_time?: string
          simultaneous_courts?: number
          singles_group_type?: string | null
          slots_per_round?: number
          sport?: string
          status?: string
          updated_at?: string
          visibility?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          fixed_day?: number | null
          id?: string
          image_url?: string | null
          is_public?: boolean
          match_format?: string
          max_players?: number
          mode?: string
          name?: string
          presence_open_mode?: string
          presence_open_time?: string
          simultaneous_courts?: number
          singles_group_type?: string | null
          slots_per_round?: number
          sport?: string
          status?: string
          updated_at?: string
          visibility?: string
        }
        Relationships: []
      }
      invite_links: {
        Row: {
          claim_placeholder_user_id: string | null
          code: string
          created_at: string
          created_by: string
          expires_at: string | null
          group_id: string
          id: string
          is_active: boolean
          max_uses: number | null
          use_count: number
        }
        Insert: {
          claim_placeholder_user_id?: string | null
          code: string
          created_at?: string
          created_by: string
          expires_at?: string | null
          group_id: string
          id?: string
          is_active?: boolean
          max_uses?: number | null
          use_count?: number
        }
        Update: {
          claim_placeholder_user_id?: string | null
          code?: string
          created_at?: string
          created_by?: string
          expires_at?: string | null
          group_id?: string
          id?: string
          is_active?: boolean
          max_uses?: number | null
          use_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "invite_links_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      match_confirmations: {
        Row: {
          confirmed: boolean
          confirmed_at: string | null
          created_at: string
          id: string
          match_id: string
          user_id: string
        }
        Insert: {
          confirmed?: boolean
          confirmed_at?: string | null
          created_at?: string
          id?: string
          match_id: string
          user_id: string
        }
        Update: {
          confirmed?: boolean
          confirmed_at?: string | null
          created_at?: string
          id?: string
          match_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_confirmations_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      match_players: {
        Row: {
          created_at: string
          id: string
          match_id: string
          team: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          match_id: string
          team: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          match_id?: string
          team?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_players_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      match_sets: {
        Row: {
          created_at: string
          id: string
          is_tiebreak: boolean
          match_id: string
          score_team_a: number
          score_team_b: number
          set_number: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_tiebreak?: boolean
          match_id: string
          score_team_a?: number
          score_team_b?: number
          set_number: number
        }
        Update: {
          created_at?: string
          id?: string
          is_tiebreak?: boolean
          match_id?: string
          score_team_a?: number
          score_team_b?: number
          set_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "match_sets_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      matches: {
        Row: {
          counts_for_ranking: boolean | null
          court_id: string | null
          created_at: string
          created_by: string | null
          id: string
          is_exhibition: boolean | null
          match_format: string
          match_number: number | null
          result_type: string | null
          round_id: string
          status: string
          updated_at: string
          winner_team: string | null
        }
        Insert: {
          counts_for_ranking?: boolean | null
          court_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_exhibition?: boolean | null
          match_format?: string
          match_number?: number | null
          result_type?: string | null
          round_id: string
          status?: string
          updated_at?: string
          winner_team?: string | null
        }
        Update: {
          counts_for_ranking?: boolean | null
          court_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_exhibition?: boolean | null
          match_format?: string
          match_number?: number | null
          result_type?: string | null
          round_id?: string
          status?: string
          updated_at?: string
          winner_team?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "matches_court_id_fkey"
            columns: ["court_id"]
            isOneToOne: false
            referencedRelation: "courts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          data: Json | null
          group_id: string | null
          id: string
          read: boolean
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          data?: Json | null
          group_id?: string | null
          id?: string
          read?: boolean
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          data?: Json | null
          group_id?: string | null
          id?: string
          read?: boolean
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      og_render_events: {
        Row: {
          created_at: string
          id: string
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          status: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      player_claims: {
        Row: {
          claimer_user_id: string
          created_at: string
          group_id: string
          id: string
          placeholder_user_id: string
          resolved_at: string | null
          resolved_by: string | null
          status: string
        }
        Insert: {
          claimer_user_id: string
          created_at?: string
          group_id: string
          id?: string
          placeholder_user_id: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
        }
        Update: {
          claimer_user_id?: string
          created_at?: string
          group_id?: string
          id?: string
          placeholder_user_id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
        }
        Relationships: []
      }
      player_stats_by_season: {
        Row: {
          games_lost: number | null
          games_won: number | null
          id: string
          matches_played: number | null
          matches_won: number | null
          reliability_score: number | null
          rounds_absent: number | null
          rounds_present: number | null
          season_id: string
          sets_lost: number | null
          sets_won: number | null
          updated_at: string
          user_id: string
          win_streak_current: number | null
          win_streak_max: number | null
        }
        Insert: {
          games_lost?: number | null
          games_won?: number | null
          id?: string
          matches_played?: number | null
          matches_won?: number | null
          reliability_score?: number | null
          rounds_absent?: number | null
          rounds_present?: number | null
          season_id: string
          sets_lost?: number | null
          sets_won?: number | null
          updated_at?: string
          user_id: string
          win_streak_current?: number | null
          win_streak_max?: number | null
        }
        Update: {
          games_lost?: number | null
          games_won?: number | null
          id?: string
          matches_played?: number | null
          matches_won?: number | null
          reliability_score?: number | null
          rounds_absent?: number | null
          rounds_present?: number | null
          season_id?: string
          sets_lost?: number | null
          sets_won?: number | null
          updated_at?: string
          user_id?: string
          win_streak_current?: number | null
          win_streak_max?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "player_stats_by_season_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      premium_plans: {
        Row: {
          created_at: string
          features: Json | null
          id: string
          is_active: boolean
          name: string
          price_brl: number
        }
        Insert: {
          created_at?: string
          features?: Json | null
          id?: string
          is_active?: boolean
          name: string
          price_brl?: number
        }
        Update: {
          created_at?: string
          features?: Json | null
          id?: string
          is_active?: boolean
          name?: string
          price_brl?: number
        }
        Relationships: []
      }
      ranking_snapshots: {
        Row: {
          created_at: string
          games_lost: number
          games_won: number
          id: string
          is_eligible: boolean
          last_5_results: string[] | null
          match_format: string
          matches_played: number
          matches_won: number
          position: number | null
          rating: number
          season_id: string
          sets_lost: number
          sets_won: number
          snapshot_date: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          games_lost?: number
          games_won?: number
          id?: string
          is_eligible?: boolean
          last_5_results?: string[] | null
          match_format?: string
          matches_played?: number
          matches_won?: number
          position?: number | null
          rating?: number
          season_id: string
          sets_lost?: number
          sets_won?: number
          snapshot_date?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          games_lost?: number
          games_won?: number
          id?: string
          is_eligible?: boolean
          last_5_results?: string[] | null
          match_format?: string
          matches_played?: number
          matches_won?: number
          position?: number | null
          rating?: number
          season_id?: string
          sets_lost?: number
          sets_won?: number
          snapshot_date?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ranking_snapshots_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      rating_events: {
        Row: {
          actual_score: number | null
          created_at: string
          expected_score: number | null
          id: string
          k_factor: number
          margin_multiplier: number | null
          match_format: string
          match_id: string
          rating_after: number
          rating_before: number
          rating_change: number
          season_id: string | null
          user_id: string
        }
        Insert: {
          actual_score?: number | null
          created_at?: string
          expected_score?: number | null
          id?: string
          k_factor?: number
          margin_multiplier?: number | null
          match_format?: string
          match_id: string
          rating_after: number
          rating_before: number
          rating_change: number
          season_id?: string | null
          user_id: string
        }
        Update: {
          actual_score?: number | null
          created_at?: string
          expected_score?: number | null
          id?: string
          k_factor?: number
          margin_multiplier?: number | null
          match_format?: string
          match_id?: string
          rating_after?: number
          rating_before?: number
          rating_change?: number
          season_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rating_events_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rating_events_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      round_presence: {
        Row: {
          confirmed_at: string | null
          created_at: string
          id: string
          position_in_queue: number | null
          round_id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          confirmed_at?: string | null
          created_at?: string
          id?: string
          position_in_queue?: number | null
          round_id: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          confirmed_at?: string | null
          created_at?: string
          id?: string
          position_in_queue?: number | null
          round_id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "round_presence_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      rounds: {
        Row: {
          created_at: string
          group_id: string
          id: string
          location: string | null
          match_format: string
          max_players: number
          notes: string | null
          presence_force_open_at: string | null
          round_number: number | null
          scheduled_date: string | null
          scheduled_time: string | null
          season_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          group_id: string
          id?: string
          location?: string | null
          match_format?: string
          max_players?: number
          notes?: string | null
          presence_force_open_at?: string | null
          round_number?: number | null
          scheduled_date?: string | null
          scheduled_time?: string | null
          season_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          group_id?: string
          id?: string
          location?: string | null
          match_format?: string
          max_players?: number
          notes?: string | null
          presence_force_open_at?: string | null
          round_number?: number | null
          scheduled_date?: string | null
          scheduled_time?: string | null
          season_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rounds_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rounds_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_leads: {
        Row: {
          contact: string
          contact_type: string
          created_at: string
          id: string
          message: string | null
          name: string
          plan_interest: string
          source: string | null
          user_id: string | null
        }
        Insert: {
          contact: string
          contact_type?: string
          created_at?: string
          id?: string
          message?: string | null
          name: string
          plan_interest?: string
          source?: string | null
          user_id?: string | null
        }
        Update: {
          contact?: string
          contact_type?: string
          created_at?: string
          id?: string
          message?: string | null
          name?: string
          plan_interest?: string
          source?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      seasons: {
        Row: {
          created_at: string
          created_by: string
          duration_type: string | null
          end_date: string | null
          group_id: string
          id: string
          match_format: string
          min_eligibility_pct: number
          name: string
          odd_player_rule: string | null
          rounds_per_week: number | null
          scoring_format: Json | null
          sets_mode: string
          sets_per_match: number | null
          singles_pairing_mode: string | null
          start_date: string | null
          status: string
          total_rounds: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          duration_type?: string | null
          end_date?: string | null
          group_id: string
          id?: string
          match_format?: string
          min_eligibility_pct?: number
          name: string
          odd_player_rule?: string | null
          rounds_per_week?: number | null
          scoring_format?: Json | null
          sets_mode?: string
          sets_per_match?: number | null
          singles_pairing_mode?: string | null
          start_date?: string | null
          status?: string
          total_rounds?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          duration_type?: string | null
          end_date?: string | null
          group_id?: string
          id?: string
          match_format?: string
          min_eligibility_pct?: number
          name?: string
          odd_player_rule?: string | null
          rounds_per_week?: number | null
          scoring_format?: Json | null
          sets_mode?: string
          sets_per_match?: number | null
          singles_pairing_mode?: string | null
          start_date?: string | null
          status?: string
          total_rounds?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "seasons_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          avatar_type: string | null
          avatar_url: string | null
          birth_date: string | null
          created_at: string
          created_by_admin: string | null
          dominant_hand: string | null
          id: string
          instagram_handle: string | null
          is_placeholder: boolean
          killer_shot: string | null
          name: string
          nickname: string | null
          preferred_position: string | null
          privacy_settings: Json
          share_tagline: string | null
          updated_at: string | null
          user_id: string
          worst_shot: string | null
        }
        Insert: {
          avatar_type?: string | null
          avatar_url?: string | null
          birth_date?: string | null
          created_at?: string
          created_by_admin?: string | null
          dominant_hand?: string | null
          id?: string
          instagram_handle?: string | null
          is_placeholder?: boolean
          killer_shot?: string | null
          name?: string
          nickname?: string | null
          preferred_position?: string | null
          privacy_settings?: Json
          share_tagline?: string | null
          updated_at?: string | null
          user_id: string
          worst_shot?: string | null
        }
        Update: {
          avatar_type?: string | null
          avatar_url?: string | null
          birth_date?: string | null
          created_at?: string
          created_by_admin?: string | null
          dominant_hand?: string | null
          id?: string
          instagram_handle?: string | null
          is_placeholder?: boolean
          killer_shot?: string | null
          name?: string
          nickname?: string | null
          preferred_position?: string | null
          privacy_settings?: Json
          share_tagline?: string | null
          updated_at?: string | null
          user_id?: string
          worst_shot?: string | null
        }
        Relationships: []
      }
      waiting_list: {
        Row: {
          added_at: string
          id: string
          position: number
          round_id: string
          user_id: string
        }
        Insert: {
          added_at?: string
          id?: string
          position: number
          round_id: string
          user_id: string
        }
        Update: {
          added_at?: string
          id?: string
          position?: number
          round_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "waiting_list_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_commands: {
        Row: {
          command: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
        }
        Insert: {
          command: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
        }
        Update: {
          command?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
        }
        Relationships: []
      }
      whatsapp_groups: {
        Row: {
          created_at: string
          group_id: string
          id: string
          is_active: boolean
          phone_number: string | null
          whatsapp_group_id: string | null
        }
        Insert: {
          created_at?: string
          group_id: string
          id?: string
          is_active?: boolean
          phone_number?: string | null
          whatsapp_group_id?: string | null
        }
        Update: {
          created_at?: string
          group_id?: string
          id?: string
          is_active?: boolean
          phone_number?: string | null
          whatsapp_group_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_groups_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_logs: {
        Row: {
          command: string | null
          created_at: string
          id: string
          request_data: Json | null
          response_data: Json | null
          user_phone: string | null
          wa_group_id: string | null
        }
        Insert: {
          command?: string | null
          created_at?: string
          id?: string
          request_data?: Json | null
          response_data?: Json | null
          user_phone?: string | null
          wa_group_id?: string | null
        }
        Update: {
          command?: string | null
          created_at?: string
          id?: string
          request_data?: Json | null
          response_data?: Json | null
          user_phone?: string | null
          wa_group_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_logs_wa_group_id_fkey"
            columns: ["wa_group_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_groups"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_group_member_count: { Args: { _group_id: string }; Returns: number }
      is_group_admin: {
        Args: { _group_id: string; _user_id: string }
        Returns: boolean
      }
      is_group_creator: {
        Args: { _group_id: string; _user_id: string }
        Returns: boolean
      }
      is_group_member: {
        Args: { _group_id: string; _user_id: string }
        Returns: boolean
      }
      merge_former_member_into_active: {
        Args: {
          _former_user_id: string
          _group_id: string
          _target_user_id: string
        }
        Returns: undefined
      }
      merge_placeholder_player: {
        Args: {
          _group_id: string
          _placeholder_user_id: string
          _real_user_id: string
        }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
