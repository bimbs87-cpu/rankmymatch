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
      groups: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          fixed_day: number | null
          id: string
          image_url: string | null
          is_public: boolean
          max_players: number
          mode: string
          name: string
          simultaneous_courts: number
          slots_per_round: number
          sport: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          fixed_day?: number | null
          id?: string
          image_url?: string | null
          is_public?: boolean
          max_players?: number
          mode?: string
          name: string
          simultaneous_courts?: number
          slots_per_round?: number
          sport?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          fixed_day?: number | null
          id?: string
          image_url?: string | null
          is_public?: boolean
          max_players?: number
          mode?: string
          name?: string
          simultaneous_courts?: number
          slots_per_round?: number
          sport?: string
          updated_at?: string
        }
        Relationships: []
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
          court_id: string | null
          created_at: string
          created_by: string | null
          id: string
          match_number: number | null
          result_type: string | null
          round_id: string
          status: string
          updated_at: string
          winner_team: string | null
        }
        Insert: {
          court_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          match_number?: number | null
          result_type?: string | null
          round_id: string
          status?: string
          updated_at?: string
          winner_team?: string | null
        }
        Update: {
          court_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
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
      ranking_snapshots: {
        Row: {
          created_at: string
          games_lost: number
          games_won: number
          id: string
          is_eligible: boolean
          last_5_results: string[] | null
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
          max_players: number
          notes: string | null
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
          max_players?: number
          notes?: string | null
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
          max_players?: number
          notes?: string | null
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
          rounds_per_week: number | null
          scoring_format: Json | null
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
          rounds_per_week?: number | null
          scoring_format?: Json | null
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
          rounds_per_week?: number | null
          scoring_format?: Json | null
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
          dominant_hand: string | null
          id: string
          instagram_handle: string | null
          killer_shot: string | null
          name: string
          nickname: string | null
          preferred_position: string | null
          updated_at: string | null
          user_id: string
          worst_shot: string | null
        }
        Insert: {
          avatar_type?: string | null
          avatar_url?: string | null
          birth_date?: string | null
          created_at?: string
          dominant_hand?: string | null
          id?: string
          instagram_handle?: string | null
          killer_shot?: string | null
          name?: string
          nickname?: string | null
          preferred_position?: string | null
          updated_at?: string | null
          user_id: string
          worst_shot?: string | null
        }
        Update: {
          avatar_type?: string | null
          avatar_url?: string | null
          birth_date?: string | null
          created_at?: string
          dominant_hand?: string | null
          id?: string
          instagram_handle?: string | null
          killer_shot?: string | null
          name?: string
          nickname?: string | null
          preferred_position?: string | null
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
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
