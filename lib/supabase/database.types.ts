export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      account_requests: {
        Row: {
          created_at: string
          email: string
          full_name: string
          id: string
          reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["account_request_status"]
        }
        Insert: {
          created_at?: string
          email: string
          full_name: string
          id?: string
          reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["account_request_status"]
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["account_request_status"]
        }
        Relationships: []
      }
      content_pages: {
        Row: {
          body_md: string
          id: string
          section: Database["public"]["Enums"]["content_section"]
          slug: string
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          body_md?: string
          id?: string
          section: Database["public"]["Enums"]["content_section"]
          slug: string
          sort_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          body_md?: string
          id?: string
          section?: Database["public"]["Enums"]["content_section"]
          slug?: string
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      game_appearances: {
        Row: {
          game_id: string
          is_sub: boolean
          player_id: string
          team_id: string
        }
        Insert: {
          game_id: string
          is_sub?: boolean
          player_id: string
          team_id: string
        }
        Update: {
          game_id?: string
          is_sub?: boolean
          player_id?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_appearances_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_appearances_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_appearances_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      game_availability: {
        Row: {
          game_id: string
          player_id: string
          status: Database["public"]["Enums"]["availability_status"]
          updated_at: string
        }
        Insert: {
          game_id: string
          player_id: string
          status: Database["public"]["Enums"]["availability_status"]
          updated_at?: string
        }
        Update: {
          game_id?: string
          player_id?: string
          status?: Database["public"]["Enums"]["availability_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_availability_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_availability_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      game_events: {
        Row: {
          assist1_player_id: string | null
          assist2_player_id: string | null
          clock_seconds: number
          created_at: string
          game_id: string
          id: string
          notes: string | null
          penalty_shot_result:
            | Database["public"]["Enums"]["penalty_shot_result"]
            | null
          penalty_shot_taker_id: string | null
          penalty_type: string | null
          penalty_type_other: string | null
          period: number
          player_id: string | null
          team_id: string
          type: Database["public"]["Enums"]["game_event_type"]
        }
        Insert: {
          assist1_player_id?: string | null
          assist2_player_id?: string | null
          clock_seconds: number
          created_at?: string
          game_id: string
          id?: string
          notes?: string | null
          penalty_shot_result?:
            | Database["public"]["Enums"]["penalty_shot_result"]
            | null
          penalty_shot_taker_id?: string | null
          penalty_type?: string | null
          penalty_type_other?: string | null
          period: number
          player_id?: string | null
          team_id: string
          type: Database["public"]["Enums"]["game_event_type"]
        }
        Update: {
          assist1_player_id?: string | null
          assist2_player_id?: string | null
          clock_seconds?: number
          created_at?: string
          game_id?: string
          id?: string
          notes?: string | null
          penalty_shot_result?:
            | Database["public"]["Enums"]["penalty_shot_result"]
            | null
          penalty_shot_taker_id?: string | null
          penalty_type?: string | null
          penalty_type_other?: string | null
          period?: number
          player_id?: string | null
          team_id?: string
          type?: Database["public"]["Enums"]["game_event_type"]
        }
        Relationships: [
          {
            foreignKeyName: "game_events_assist1_player_id_fkey"
            columns: ["assist1_player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_events_assist2_player_id_fkey"
            columns: ["assist2_player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_events_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_events_penalty_shot_taker_id_fkey"
            columns: ["penalty_shot_taker_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_events_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_events_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      games: {
        Row: {
          away_score: number
          away_team_id: string | null
          clock_seconds: number
          created_at: string
          decided_in: Database["public"]["Enums"]["game_decided_in"] | null
          home_score: number
          home_team_id: string | null
          id: string
          kind: Database["public"]["Enums"]["game_kind"]
          location: string | null
          period: number
          playoff_round: Database["public"]["Enums"]["playoff_round"] | null
          scheduled_at: string
          season_id: string
          shootout_away_goals: number | null
          shootout_home_goals: number | null
          status: Database["public"]["Enums"]["game_status"]
          updated_at: string
        }
        Insert: {
          away_score?: number
          away_team_id?: string | null
          clock_seconds?: number
          created_at?: string
          decided_in?: Database["public"]["Enums"]["game_decided_in"] | null
          home_score?: number
          home_team_id?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["game_kind"]
          location?: string | null
          period?: number
          playoff_round?: Database["public"]["Enums"]["playoff_round"] | null
          scheduled_at: string
          season_id: string
          shootout_away_goals?: number | null
          shootout_home_goals?: number | null
          status?: Database["public"]["Enums"]["game_status"]
          updated_at?: string
        }
        Update: {
          away_score?: number
          away_team_id?: string | null
          clock_seconds?: number
          created_at?: string
          decided_in?: Database["public"]["Enums"]["game_decided_in"] | null
          home_score?: number
          home_team_id?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["game_kind"]
          location?: string | null
          period?: number
          playoff_round?: Database["public"]["Enums"]["playoff_round"] | null
          scheduled_at?: string
          season_id?: string
          shootout_away_goals?: number | null
          shootout_home_goals?: number | null
          status?: Database["public"]["Enums"]["game_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "games_away_team_id_fkey"
            columns: ["away_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "games_home_team_id_fkey"
            columns: ["home_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "games_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      player_awards: {
        Row: {
          award_type: string
          created_at: string
          id: string
          notes: string | null
          player_id: string
          season_id: string | null
        }
        Insert: {
          award_type: string
          created_at?: string
          id?: string
          notes?: string | null
          player_id: string
          season_id?: string | null
        }
        Update: {
          award_type?: string
          created_at?: string
          id?: string
          notes?: string | null
          player_id?: string
          season_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "player_awards_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_awards_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      players: {
        Row: {
          created_at: string
          first_name: string
          id: string
          last_name: string
          photo_url: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          first_name: string
          id?: string
          last_name: string
          photo_url?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          first_name?: string
          id?: string
          last_name?: string
          photo_url?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      schedule_skips: {
        Row: {
          created_at: string
          id: string
          reason: string
          season_id: string
          skip_date: string
        }
        Insert: {
          created_at?: string
          id?: string
          reason: string
          season_id: string
          skip_date: string
        }
        Update: {
          created_at?: string
          id?: string
          reason?: string
          season_id?: string
          skip_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_skips_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      season_player_stats: {
        Row: {
          assists: number
          games_played: number
          goals: number
          goals_against: number | null
          penalties: number
          penalty_shots_faced: number | null
          penalty_shots_made: number
          penalty_shots_saved: number | null
          penalty_shots_taken: number
          player_id: string
          position: Database["public"]["Enums"]["player_position"]
          season_id: string
          team_id: string | null
        }
        Insert: {
          assists?: number
          games_played?: number
          goals?: number
          goals_against?: number | null
          penalties?: number
          penalty_shots_faced?: number | null
          penalty_shots_made?: number
          penalty_shots_saved?: number | null
          penalty_shots_taken?: number
          player_id: string
          position?: Database["public"]["Enums"]["player_position"]
          season_id: string
          team_id?: string | null
        }
        Update: {
          assists?: number
          games_played?: number
          goals?: number
          goals_against?: number | null
          penalties?: number
          penalty_shots_faced?: number | null
          penalty_shots_made?: number
          penalty_shots_saved?: number | null
          penalty_shots_taken?: number
          player_id?: string
          position?: Database["public"]["Enums"]["player_position"]
          season_id?: string
          team_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "season_player_stats_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "season_player_stats_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "season_player_stats_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      seasons: {
        Row: {
          created_at: string
          default_location: string | null
          end_date: string | null
          id: string
          is_current: boolean
          name: string
          period_length_minutes: number
          point_system: string
          regular_weeks: number | null
          season_type: Database["public"]["Enums"]["season_type"]
          start_date: string
          tiebreakers: string[]
          year: number
        }
        Insert: {
          created_at?: string
          default_location?: string | null
          end_date?: string | null
          id?: string
          is_current?: boolean
          name: string
          period_length_minutes?: number
          point_system?: string
          regular_weeks?: number | null
          season_type: Database["public"]["Enums"]["season_type"]
          start_date: string
          tiebreakers?: string[]
          year: number
        }
        Update: {
          created_at?: string
          default_location?: string | null
          end_date?: string | null
          id?: string
          is_current?: boolean
          name?: string
          period_length_minutes?: number
          point_system?: string
          regular_weeks?: number | null
          season_type?: Database["public"]["Enums"]["season_type"]
          start_date?: string
          tiebreakers?: string[]
          year?: number
        }
        Relationships: []
      }
      team_captains: {
        Row: {
          created_at: string
          season_id: string
          team_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          season_id: string
          team_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          season_id?: string
          team_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_captains_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_captains_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_players: {
        Row: {
          is_captain: boolean
          jersey_number: number | null
          player_id: string
          position: Database["public"]["Enums"]["player_position"]
          season_id: string
          team_id: string
        }
        Insert: {
          is_captain?: boolean
          jersey_number?: number | null
          player_id: string
          position?: Database["public"]["Enums"]["player_position"]
          season_id: string
          team_id: string
        }
        Update: {
          is_captain?: boolean
          jersey_number?: number | null
          player_id?: string
          position?: Database["public"]["Enums"]["player_position"]
          season_id?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_players_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_players_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_players_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          color: string
          created_at: string
          id: string
          logo_url: string | null
          name: string
          season_id: string
          slug: string
        }
        Insert: {
          color: string
          created_at?: string
          id?: string
          logo_url?: string | null
          name: string
          season_id: string
          slug: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          logo_url?: string | null
          name?: string
          season_id?: string
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "teams_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          created_at: string
          email: string
          full_name: string | null
          phone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email: string
          full_name?: string | null
          phone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string | null
          phone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          role: Database["public"]["Enums"]["user_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          role: Database["public"]["Enums"]["user_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          role?: Database["public"]["Enums"]["user_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      is_admin: { Args: never; Returns: boolean }
      is_scorekeeper_or_admin: { Args: never; Returns: boolean }
      is_team_captain_or_admin: { Args: never; Returns: boolean }
      reconcile_team_captain: {
        Args: { p_season: string; p_team: string }
        Returns: undefined
      }
    }
    Enums: {
      account_request_status: "pending" | "approved" | "denied"
      availability_status: "in" | "out"
      content_section: "rules" | "faq" | "league"
      game_decided_in: "regulation" | "ot" | "shootout"
      game_event_type: "goal" | "penalty"
      game_kind: "regular" | "playoff"
      game_status: "scheduled" | "live" | "final"
      penalty_shot_result: "goal" | "saved"
      player_position: "forward" | "defense" | "goalie"
      playoff_round: "qf1" | "qf2" | "qf3" | "qf4" | "sf1" | "sf2" | "final"
      season_type: "spring" | "summer" | "fall" | "winter"
      user_role: "admin" | "scorekeeper" | "team_captain" | "player"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      account_request_status: ["pending", "approved", "denied"],
      availability_status: ["in", "out"],
      content_section: ["rules", "faq", "league"],
      game_decided_in: ["regulation", "ot", "shootout"],
      game_event_type: ["goal", "penalty"],
      game_kind: ["regular", "playoff"],
      game_status: ["scheduled", "live", "final"],
      penalty_shot_result: ["goal", "saved"],
      player_position: ["forward", "defense", "goalie"],
      playoff_round: ["qf1", "qf2", "qf3", "qf4", "sf1", "sf2", "final"],
      season_type: ["spring", "summer", "fall", "winter"],
      user_role: ["admin", "scorekeeper", "team_captain", "player"],
    },
  },
} as const

