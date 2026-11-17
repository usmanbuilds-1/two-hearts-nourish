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
      meal_plans: {
        Row: {
          created_at: string
          eaten: boolean | null
          id: string
          meal_date: string
          member_id: string
          recipe_id: string
          servings: number
        }
        Insert: {
          created_at?: string
          eaten?: boolean | null
          id?: string
          meal_date: string
          member_id: string
          recipe_id: string
          servings?: number
        }
        Update: {
          created_at?: string
          eaten?: boolean | null
          id?: string
          meal_date?: string
          member_id?: string
          recipe_id?: string
          servings?: number
        }
        Relationships: [
          {
            foreignKeyName: "meal_plans_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_plans_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      meal_templates: {
        Row: {
          created_at: string
          id: string
          meals: Json
          member_id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          meals?: Json
          member_id: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          meals?: Json
          member_id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meal_templates_member_id_fkey"
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
          is_planned: boolean
          photo_url: string | null
          portion_percentage: number
          nominal_calories: number | null
          nominal_protein: number | null
          nominal_carbs: number | null
          nominal_fat: number | null
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
          is_planned?: boolean
          photo_url?: string | null
          portion_percentage?: number
          nominal_calories?: number | null
          nominal_protein?: number | null
          nominal_carbs?: number | null
          nominal_fat?: number | null
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
          is_planned?: boolean
          photo_url?: string | null
          portion_percentage?: number
          nominal_calories?: number | null
          nominal_protein?: number | null
          nominal_carbs?: number | null
          nominal_fat?: number | null
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
      member_recovery_keys: {
        Row: {
          id: string
          member_id: string
          token_hash: string
          created_at: string
          device_id: string | null
        }
        Insert: {
          id?: string
          member_id: string
          token_hash: string
          created_at?: string
          device_id?: string | null
        }
        Update: {
          id?: string
          member_id?: string
          token_hash?: string
          created_at?: string
          device_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "member_recovery_keys_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_usage_daily: {
        Row: { member_id: string; usage_date: string; scan_requests: number; text_requests: number; plan_requests: number; strong_scan_requests: number }
        Insert: { member_id: string; usage_date?: string; scan_requests?: number; text_requests?: number; plan_requests?: number; strong_scan_requests?: number }
        Update: { member_id?: string; usage_date?: string; scan_requests?: number; text_requests?: number; plan_requests?: number; strong_scan_requests?: number }
        Relationships: []
      }
      ai_usage_global: {
        Row: { usage_date: string; scan_requests: number; text_requests: number; plan_requests: number; strong_scan_requests: number }
        Insert: { usage_date?: string; scan_requests?: number; text_requests?: number; plan_requests?: number; strong_scan_requests?: number }
        Update: { usage_date?: string; scan_requests?: number; text_requests?: number; plan_requests?: number; strong_scan_requests?: number }
        Relationships: []
      }
      scan_events: {
        Row: { id:string; member_id:string; meal_id:string|null; image_fingerprint:string|null; context_fingerprint:string|null; scanner_version:string; prompt_version:string; model:string; route:string; status:string; input_tokens:number; output_tokens:number; thinking_tokens:number; total_tokens:number; latency_ms:number|null; estimated_cost_microusd:number; cache_hit:boolean; escalated:boolean; escalation_reason:string|null; grounding_sources:Json; confidence:number|null; created_at:string }
        Insert: { id?:string; member_id:string; meal_id?:string|null; image_fingerprint?:string|null; context_fingerprint?:string|null; scanner_version:string; prompt_version:string; model:string; route:string; status:string; input_tokens?:number; output_tokens?:number; thinking_tokens?:number; total_tokens?:number; latency_ms?:number|null; estimated_cost_microusd?:number; cache_hit?:boolean; escalated?:boolean; escalation_reason?:string|null; grounding_sources?:Json; confidence?:number|null; created_at?:string }
        Update: { id?:string; member_id?:string; meal_id?:string|null; image_fingerprint?:string|null; context_fingerprint?:string|null; scanner_version?:string; prompt_version?:string; model?:string; route?:string; status?:string; input_tokens?:number; output_tokens?:number; thinking_tokens?:number; total_tokens?:number; latency_ms?:number|null; estimated_cost_microusd?:number; cache_hit?:boolean; escalated?:boolean; escalation_reason?:string|null; grounding_sources?:Json; confidence?:number|null; created_at?:string }
        Relationships: []
      }
      scan_items: {
        Row: { id:string; scan_id:string; member_id:string; item_index:number; label:string; grams_estimate:number|null; grams_min:number|null; grams_max:number|null; calories:number|null; protein:number|null; carbs:number|null; fat:number|null; confidence:number|null; hidden_fat_risk:string|null; source_name:string|null; source_ref:string|null; created_at:string }
        Insert: { id?:string; scan_id:string; member_id:string; item_index:number; label:string; grams_estimate?:number|null; grams_min?:number|null; grams_max?:number|null; calories?:number|null; protein?:number|null; carbs?:number|null; fat?:number|null; confidence?:number|null; hidden_fat_risk?:string|null; source_name?:string|null; source_ref?:string|null; created_at?:string }
        Update: { id?:string; scan_id?:string; member_id?:string; item_index?:number; label?:string; grams_estimate?:number|null; grams_min?:number|null; grams_max?:number|null; calories?:number|null; protein?:number|null; carbs?:number|null; fat?:number|null; confidence?:number|null; hidden_fat_risk?:string|null; source_name?:string|null; source_ref?:string|null; created_at?:string }
        Relationships: []
      }
      scan_corrections: {
        Row: { id:string; scan_id:string; scan_item_id:string|null; member_id:string; correction_type:string; original:Json; corrected:Json; structured_context:Json; created_at:string }
        Insert: { id?:string; scan_id:string; scan_item_id?:string|null; member_id:string; correction_type:string; original:Json; corrected:Json; structured_context?:Json; created_at?:string }
        Update: { id?:string; scan_id?:string; scan_item_id?:string|null; member_id?:string; correction_type?:string; original?:Json; corrected?:Json; structured_context?:Json; created_at?:string }
        Relationships: []
      }
      member_scan_cache: {
        Row: { member_id:string; image_fingerprint:string; context_fingerprint:string; scanner_version:string; final_estimate:Json; expires_at:string; updated_at:string; created_at:string }
        Insert: { member_id:string; image_fingerprint:string; context_fingerprint?:string; scanner_version:string; final_estimate:Json; expires_at:string; updated_at?:string; created_at?:string }
        Update: { member_id?:string; image_fingerprint?:string; context_fingerprint?:string; scanner_version?:string; final_estimate?:Json; expires_at?:string; updated_at?:string; created_at?:string }
        Relationships: []
      }
      member_food_priors: {
        Row: { id:string; member_id:string; fingerprint:string; canonical_label:string; typical_grams:number|null; calories_per_100g:number|null; protein_per_100g:number|null; carbs_per_100g:number|null; fat_per_100g:number|null; preparation:string|null; structured_context:Json; confirmations:number; confidence:number; last_confirmed_at:string; created_at:string }
        Insert: { id?:string; member_id:string; fingerprint:string; canonical_label:string; typical_grams?:number|null; calories_per_100g?:number|null; protein_per_100g?:number|null; carbs_per_100g?:number|null; fat_per_100g?:number|null; preparation?:string|null; structured_context?:Json; confirmations?:number; confidence?:number; last_confirmed_at?:string; created_at?:string }
        Update: { id?:string; member_id?:string; fingerprint?:string; canonical_label?:string; typical_grams?:number|null; calories_per_100g?:number|null; protein_per_100g?:number|null; carbs_per_100g?:number|null; fat_per_100g?:number|null; preparation?:string|null; structured_context?:Json; confirmations?:number; confidence?:number; last_confirmed_at?:string; created_at?:string }
        Relationships: []
      }
      meal_components: {
        Row: { id:string; meal_id:string; member_id:string; position:number; label:string; grams:number|null; calories:number; protein:number; carbs:number; fat:number; source_name:string|null; source_ref:string|null; confidence:number|null; created_at:string }
        Insert: { id?:string; meal_id:string; member_id:string; position:number; label:string; grams?:number|null; calories:number; protein:number; carbs:number; fat:number; source_name?:string|null; source_ref?:string|null; confidence?:number|null; created_at?:string }
        Update: { id?:string; meal_id?:string; member_id?:string; position?:number; label?:string; grams?:number|null; calories?:number; protein?:number; carbs?:number; fat?:number; source_name?:string|null; source_ref?:string|null; confidence?:number|null; created_at?:string }
        Relationships: []
      }
      food_aliases: {
        Row: { id:string; alias:string; normalized_alias:string; canonical_label:string; cuisine:string|null; metadata:Json; created_at:string }
        Insert: { id?:string; alias:string; normalized_alias:string; canonical_label:string; cuisine?:string|null; metadata?:Json; created_at?:string }
        Update: { id?:string; alias?:string; normalized_alias?:string; canonical_label?:string; cuisine?:string|null; metadata?:Json; created_at?:string }
        Relationships: []
      }
      storage_cleanup_queue: {
        Row: { id:string; bucket:string; object_path:string; member_id:string; room_id:string; attempts:number; last_error:string|null; cleaned_at:string|null; created_at:string }
        Insert: { id?:string; bucket:string; object_path:string; member_id:string; room_id:string; attempts?:number; last_error?:string|null; cleaned_at?:string|null; created_at?:string }
        Update: { id?:string; bucket?:string; object_path?:string; member_id?:string; room_id?:string; attempts?:number; last_error?:string|null; cleaned_at?:string|null; created_at?:string }
        Relationships: []
      }
      member_devices: {
        Row: {
          auth_user_id: string
          created_at: string
          id: string
          member_id: string
          device_label: string | null
          last_seen_at: string | null
        }
        Insert: {
          auth_user_id: string
          created_at?: string
          id?: string
          member_id: string
          device_label?: string | null
          last_seen_at?: string | null
        }
        Update: {
          auth_user_id?: string
          created_at?: string
          id?: string
          member_id?: string
          device_label?: string | null
          last_seen_at?: string | null
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
      progress_notes: {
        Row: {
          created_at: string
          id: string
          member_id: string
          note_date: string
          text: string
        }
        Insert: {
          created_at?: string
          id?: string
          member_id: string
          note_date: string
          text: string
        }
        Update: {
          created_at?: string
          id?: string
          member_id?: string
          note_date?: string
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "progress_notes_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      recipes: {
        Row: {
          created_at: string
          id: string
          ingredients: Json
          member_id: string
          name: string
          servings: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          ingredients?: Json
          member_id: string
          name: string
          servings?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          ingredients?: Json
          member_id?: string
          name?: string
          servings?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipes_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
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
          invite_token_hash: string | null
          invite_expires_at: string | null
          shared_goal: string | null
          together_since: string | null
        }
        Insert: {
          couple_message?: string | null
          created_at?: string
          id?: string
          room_code: string
          invite_token_hash?: string | null
          invite_expires_at?: string | null
          shared_goal?: string | null
          together_since?: string | null
        }
        Update: {
          couple_message?: string | null
          created_at?: string
          id?: string
          room_code?: string
          invite_token_hash?: string | null
          invite_expires_at?: string | null
          shared_goal?: string | null
          together_since?: string | null
        }
        Relationships: []
      }
      weight_logs: {
        Row: {
          created_at: string
          id: string
          logged_date: string
          member_id: string
          weight_kg: number
        }
        Insert: {
          created_at?: string
          id?: string
          logged_date?: string
          member_id: string
          weight_kg: number
        }
        Update: {
          created_at?: string
          id?: string
          logged_date?: string
          member_id?: string
          weight_kg?: number
        }
        Relationships: [
          {
            foreignKeyName: "weight_logs_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      my_member_id: { Args: never; Returns: string }
      my_room_id: { Args: never; Returns: string }
      claim_ai_request: { Args: { p_member_id: string; p_mode: string; p_daily_cap: number }; Returns: boolean }
      claim_ai_request_v2: { Args: { p_member_id:string; p_mode:string; p_member_daily_cap:number; p_global_daily_cap:number }; Returns:boolean }
      consume_rejoin_link: {
        Args: { p_member_id:string; p_claim_hash:string; p_auth_user_id:string; p_device_label:string; p_new_recovery_hash:string };
        Returns:Json
      }
      create_room_with_owner: {
        Args: { p_room_code:string; p_auth_user_id:string; p_display_name:string; p_device_label:string; p_participant_hash:string; p_invite_hash:string; p_invite_expires_at:string };
        Returns:Json
      }
      join_room_with_invite: {
        Args: { p_room_code:string; p_auth_user_id:string; p_display_name:string; p_device_label:string; p_participant_hash:string; p_invite_hash:string };
        Returns:string
      }
      save_scanned_meal_v2: {
        Args: {
          p_member_id:string; p_room_id:string; p_meal_date:string; p_meal_type:string;
          p_food_name:string; p_serving_description:string; p_calories:number;
          p_protein:number; p_carbs:number; p_fat:number; p_ai_confidence:string|null;
          p_photo_url:string|null; p_components:Json; p_scan_id:string|null
        };
        Returns:string
      }
      room_activity_rollup: { Args: { p_room_id: string; p_today: string }; Returns: Json }
      record_member_food_prior: {
        Args: { p_member_id:string; p_fingerprint:string; p_canonical_label:string; p_typical_grams:number; p_calories_per_100g:number; p_protein_per_100g:number; p_carbs_per_100g:number; p_fat_per_100g:number; p_structured_context:Json };
        Returns:boolean
      }
      rebind_member_device: {
        Args: { p_member_id:string; p_device_id:string; p_new_auth_user_id:string; p_update_primary?:boolean };
        Returns: boolean
      }
      rotate_member_recovery_many: {
        Args: { p_actor_auth_user_id: string; p_replacement_hash: string; p_revoke_device_ids: string[] };
        Returns: number
      }
      rotate_member_recovery: {
        Args: { p_actor_auth_user_id: string; p_replacement_hash: string; p_revoke_device_id?: string | null };
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
