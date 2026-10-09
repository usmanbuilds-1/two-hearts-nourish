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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      meal_favorites: {
        Row: {
          calories: number
          carbs: number
          created_at: string
          fat: number
          food_name: string
          id: string
          member_id: string
          protein: number
          serving_description: string | null
        }
        Insert: {
          calories: number
          carbs: number
          created_at?: string
          fat: number
          food_name: string
          id?: string
          member_id: string
          protein: number
          serving_description?: string | null
        }
        Update: {
          calories?: number
          carbs?: number
          created_at?: string
          fat?: number
          food_name?: string
          id?: string
          member_id?: string
          protein?: number
          serving_description?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meal_favorites_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      meals: {
        Row: {
          ai_confidence: string | null
          calories: number
          carbs: number
          created_at: string
          fat: number
          food_name: string
          id: string
          meal_date: string
          meal_type: string
          member_id: string
          protein: number
          room_id: string
          serving_description: string | null
          updated_at: string
        }
        Insert: {
          ai_confidence?: string | null
          calories: number
          carbs: number
          created_at?: string
          fat: number
          food_name: string
          id?: string
          meal_date: string
          meal_type?: string
          member_id: string
          protein: number
          room_id: string
          serving_description?: string | null
          updated_at?: string
        }
        Update: {
          ai_confidence?: string | null
          calories?: number
          carbs?: number
          created_at?: string
          fat?: number
          food_name?: string
          id?: string
          meal_date?: string
          meal_type?: string
          member_id?: string
          protein?: number
          room_id?: string
          serving_description?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meals_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meals_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      member_devices: {
        Row: {
          auth_user_id: string
          created_at: string
          id: string
          member_id: string
        }
        Insert: {
          auth_user_id: string
          created_at?: string
          id?: string
          member_id: string
        }
        Update: {
          auth_user_id?: string
          created_at?: string
          id?: string
          member_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_devices_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      members: {
        Row: {
          activity_level: string | null
          age: number | null
          auth_user_id: string | null
          body_goal: string | null
          created_at: string
          currency: string | null
          daily_calorie_target: number | null
          daily_carbs_target: number | null
          daily_fat_target: number | null
          daily_food_budget: number | null
          daily_protein_target: number | null
          display_name: string
          height_cm: number | null
          id: string
          link_code_expires_at: string | null
          link_code_hash: string | null
          locality: string | null
          participant_token_hash: string
          room_id: string
          seat: number
          sex: string | null
          weight_kg: number | null
        }
        Insert: {
          activity_level?: string | null
          age?: number | null
          auth_user_id?: string | null
          body_goal?: string | null
          created_at?: string
          currency?: string | null
          daily_calorie_target?: number | null
          daily_carbs_target?: number | null
          daily_fat_target?: number | null
          daily_food_budget?: number | null
          daily_protein_target?: number | null
          display_name: string
          height_cm?: number | null
          id?: string
          link_code_expires_at?: string | null
          link_code_hash?: string | null
          locality?: string | null
          participant_token_hash: string
          room_id: string
          seat: number
          sex?: string | null
          weight_kg?: number | null
        }
        Update: {
          activity_level?: string | null
          age?: number | null
          auth_user_id?: string | null
          body_goal?: string | null
          created_at?: string
          currency?: string | null
          daily_calorie_target?: number | null
          daily_carbs_target?: number | null
          daily_fat_target?: number | null
          daily_food_budget?: number | null
          daily_protein_target?: number | null
          display_name?: string
          height_cm?: number | null
          id?: string
          link_code_expires_at?: string | null
          link_code_hash?: string | null
          locality?: string | null
          participant_token_hash?: string
          room_id?: string
          seat?: number
          sex?: string | null
          weight_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "members_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      rooms: {
        Row: {
          couple_message: string | null
          created_at: string
          id: string
          room_code: string
          shared_goal: string | null
          together_since: string | null
        }
        Insert: {
          couple_message?: string | null
          created_at?: string
          id?: string
          room_code: string
          shared_goal?: string | null
          together_since?: string | null
        }
        Update: {
          couple_message?: string | null
          created_at?: string
          id?: string
          room_code?: string
          shared_goal?: string | null
          together_since?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      my_member_id: { Args: never; Returns: string }
      my_room_id: { Args: never; Returns: string }
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
    Enums: {},
  },
} as const
