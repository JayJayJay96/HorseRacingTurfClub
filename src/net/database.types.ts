
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "room_players": {
                  Row: {
                    "id": string,"joined_at": string,"name": string,"ready": boolean,"room_id": string,"ticked": boolean,"uid": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "id"?: string,"joined_at"?: string,"name": string,"ready"?: boolean,"room_id": string,"ticked"?: boolean,"uid"?: string | null
                  }
                  Update: {
                    "id"?: string,"joined_at"?: string,"name"?: string,"ready"?: boolean,"room_id"?: string,"ticked"?: boolean,"uid"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "room_players_room_id_fkey"
      columns: ["room_id"]
isOneToOne: false
      referencedRelation: "rooms"
      referencedColumns: ["id"]
    }
                  ]
                },"rooms": {
                  Row: {
                    "code": string,"created_at": string,"host_uid": string,"id": string,"last_activity_at": string,"phase": string,"prize": string,"race_length": string
                  }
                  ComputedFields: never
                  Insert: {
                    "code": string,"created_at"?: string,"host_uid": string,"id"?: string,"last_activity_at"?: string,"phase"?: string,"prize"?: string,"race_length"?: string
                  }
                  Update: {
                    "code"?: string,"created_at"?: string,"host_uid"?: string,"id"?: string,"last_activity_at"?: string,"phase"?: string,"prize"?: string,"race_length"?: string
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "add_player":
{ Args: { "p_name": string,"p_room": string }; Returns: {
              "id": string,
"joined_at": string,
"name": string,
"ready": boolean,
"room_id": string,
"ticked": boolean,
"uid": string | null
            }
                          SetofOptions: {
        from: "*"
        to: "room_players"
        isOneToOne: true
        isSetofReturn: false
      } },
"cleanup_rooms":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"create_room":
{ Args: { "p_length"?: string,"p_prize"?: string }; Returns: {
              "code": string,
"created_at": string,
"host_uid": string,
"id": string,
"last_activity_at": string,
"phase": string,
"prize": string,
"race_length": string
            }
                          SetofOptions: {
        from: "*"
        to: "rooms"
        isOneToOne: true
        isSetofReturn: false
      } },
"join_room":
{ Args: { "p_code": string,"p_name": string }; Returns: {
              "id": string,
"joined_at": string,
"name": string,
"ready": boolean,
"room_id": string,
"ticked": boolean,
"uid": string | null
            }
                          SetofOptions: {
        from: "*"
        to: "room_players"
        isOneToOne: true
        isSetofReturn: false
      } },
"remove_player":
{ Args: { "p_player": string }; Returns: undefined
                           },
"set_phase":
{ Args: { "p_phase": string,"p_room": string }; Returns: {
              "code": string,
"created_at": string,
"host_uid": string,
"id": string,
"last_activity_at": string,
"phase": string,
"prize": string,
"race_length": string
            }
                          SetofOptions: {
        from: "*"
        to: "rooms"
        isOneToOne: true
        isSetofReturn: false
      } },
"set_ready":
{ Args: { "p_ready": boolean,"p_room": string }; Returns: undefined
                           },
"set_ticked":
{ Args: { "p_player": string,"p_ticked": boolean }; Returns: undefined
                           },
"update_room_settings":
{ Args: { "p_length": string,"p_prize": string,"p_room": string }; Returns: {
              "code": string,
"created_at": string,
"host_uid": string,
"id": string,
"last_activity_at": string,
"phase": string,
"prize": string,
"race_length": string
            }
                          SetofOptions: {
        from: "*"
        to: "rooms"
        isOneToOne: true
        isSetofReturn: false
      } }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            
          }
        }
} as const
