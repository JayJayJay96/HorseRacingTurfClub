export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: { extensions?: Json; operationName?: string; query?: string; variables?: Json };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      bets: {
        Row: {
          created_at: string;
          horse_id: string;
          id: string;
          kind: string;
          odds: number;
          payout: number | null;
          player_id: string;
          race_id: string;
          room_id: string;
          stake: number;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          horse_id: string;
          id?: string;
          kind: string;
          odds: number;
          payout?: number | null;
          player_id: string;
          race_id: string;
          room_id: string;
          stake: number;
        };
        Update: {
          created_at?: string;
          horse_id?: string;
          id?: string;
          kind?: string;
          odds?: number;
          payout?: number | null;
          player_id?: string;
          race_id?: string;
          room_id?: string;
          stake?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'bets_horse_id_fkey';
            columns: ['horse_id'];
            isOneToOne: false;
            referencedRelation: 'room_players';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'bets_player_id_fkey';
            columns: ['player_id'];
            isOneToOne: false;
            referencedRelation: 'room_players';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'bets_race_id_fkey';
            columns: ['race_id'];
            isOneToOne: false;
            referencedRelation: 'races';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'bets_room_id_fkey';
            columns: ['room_id'];
            isOneToOne: false;
            referencedRelation: 'rooms';
            referencedColumns: ['id'];
          },
        ];
      };
      coin_ledger: {
        Row: {
          amount: number;
          created_at: string;
          id: number;
          player_id: string;
          race_id: string | null;
          reason: string | null;
          room_id: string;
          type: string;
        };
        ComputedFields: never;
        Insert: {
          amount: number;
          created_at?: string;
          id?: never;
          player_id: string;
          race_id?: string | null;
          reason?: string | null;
          room_id: string;
          type: string;
        };
        Update: {
          amount?: number;
          created_at?: string;
          id?: never;
          player_id?: string;
          race_id?: string | null;
          reason?: string | null;
          room_id?: string;
          type?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'coin_ledger_player_id_fkey';
            columns: ['player_id'];
            isOneToOne: false;
            referencedRelation: 'room_players';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'coin_ledger_race_id_fkey';
            columns: ['race_id'];
            isOneToOne: false;
            referencedRelation: 'races';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'coin_ledger_room_id_fkey';
            columns: ['room_id'];
            isOneToOne: false;
            referencedRelation: 'rooms';
            referencedColumns: ['id'];
          },
        ];
      };
      purchases: {
        Row: {
          box: string;
          created_at: string;
          id: string;
          player_id: string;
          price: number;
          race_id: string;
          room_id: string;
        };
        ComputedFields: never;
        Insert: {
          box: string;
          created_at?: string;
          id?: string;
          player_id: string;
          price: number;
          race_id: string;
          room_id: string;
        };
        Update: {
          box?: string;
          created_at?: string;
          id?: string;
          player_id?: string;
          price?: number;
          race_id?: string;
          room_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'purchases_player_id_fkey';
            columns: ['player_id'];
            isOneToOne: false;
            referencedRelation: 'room_players';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'purchases_race_id_fkey';
            columns: ['race_id'];
            isOneToOne: false;
            referencedRelation: 'races';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'purchases_room_id_fkey';
            columns: ['room_id'];
            isOneToOne: false;
            referencedRelation: 'rooms';
            referencedColumns: ['id'];
          },
        ];
      };
      race_timelines: {
        Row: {
          race_id: string;
          room_id: string;
          timeline: NonNullable<Json>;
        };
        ComputedFields: never;
        Insert: {
          race_id: string;
          room_id: string;
          timeline: NonNullable<Json>;
        };
        Update: {
          race_id?: string;
          room_id?: string;
          timeline?: NonNullable<Json>;
        };
        Relationships: [
          {
            foreignKeyName: 'race_timelines_race_id_fkey';
            columns: ['race_id'];
            isOneToOne: true;
            referencedRelation: 'races';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'race_timelines_room_id_fkey';
            columns: ['room_id'];
            isOneToOne: false;
            referencedRelation: 'rooms';
            referencedColumns: ['id'];
          },
        ];
      };
      races: {
        Row: {
          created_at: string;
          ends_at: string | null;
          finish_order: string[] | null;
          horses: string[];
          id: string;
          length: string;
          odds: Json | null;
          prize: string;
          room_id: string;
          started_at: string | null;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          ends_at?: string | null;
          finish_order?: string[] | null;
          horses?: string[];
          id?: string;
          length: string;
          odds?: Json | null;
          prize?: string;
          room_id: string;
          started_at?: string | null;
        };
        Update: {
          created_at?: string;
          ends_at?: string | null;
          finish_order?: string[] | null;
          horses?: string[];
          id?: string;
          length?: string;
          odds?: Json | null;
          prize?: string;
          room_id?: string;
          started_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'races_room_id_fkey';
            columns: ['room_id'];
            isOneToOne: false;
            referencedRelation: 'rooms';
            referencedColumns: ['id'];
          },
        ];
      };
      room_players: {
        Row: {
          archived_at: string | null;
          coat: number | null;
          horse_name: string | null;
          id: string;
          joined_at: string;
          name: string;
          ready: boolean;
          room_id: string;
          silk: number | null;
          ticked: boolean;
          uid: string | null;
        };
        ComputedFields: never;
        Insert: {
          archived_at?: string | null;
          coat?: number | null;
          horse_name?: string | null;
          id?: string;
          joined_at?: string;
          name: string;
          ready?: boolean;
          room_id: string;
          silk?: number | null;
          ticked?: boolean;
          uid?: string | null;
        };
        Update: {
          archived_at?: string | null;
          coat?: number | null;
          horse_name?: string | null;
          id?: string;
          joined_at?: string;
          name?: string;
          ready?: boolean;
          room_id?: string;
          silk?: number | null;
          ticked?: boolean;
          uid?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'room_players_room_id_fkey';
            columns: ['room_id'];
            isOneToOne: false;
            referencedRelation: 'rooms';
            referencedColumns: ['id'];
          },
        ];
      };
      rooms: {
        Row: {
          code: string;
          created_at: string;
          host_uid: string | null;
          id: string;
          kind: string;
          last_activity_at: string;
          phase: string;
          prize: string;
          race_id: string | null;
          race_length: string;
        };
        ComputedFields: never;
        Insert: {
          code: string;
          created_at?: string;
          host_uid?: string | null;
          id?: string;
          kind?: string;
          last_activity_at?: string;
          phase?: string;
          prize?: string;
          race_id?: string | null;
          race_length?: string;
        };
        Update: {
          code?: string;
          created_at?: string;
          host_uid?: string | null;
          id?: string;
          kind?: string;
          last_activity_at?: string;
          phase?: string;
          prize?: string;
          race_id?: string | null;
          race_length?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'rooms_race_id_fkey';
            columns: ['race_id'];
            isOneToOne: false;
            referencedRelation: 'races';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      add_player: {
        Args: { p_name: string; p_room: string };
        Returns: {
          archived_at: string | null;
          coat: number | null;
          horse_name: string | null;
          id: string;
          joined_at: string;
          name: string;
          ready: boolean;
          room_id: string;
          silk: number | null;
          ticked: boolean;
          uid: string | null;
        };
        SetofOptions: {
          from: '*';
          to: 'room_players';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      admin_add_member: {
        Args: { p_name: string };
        Returns: {
          archived_at: string | null;
          coat: number | null;
          horse_name: string | null;
          id: string;
          joined_at: string;
          name: string;
          ready: boolean;
          room_id: string;
          silk: number | null;
          ticked: boolean;
          uid: string | null;
        };
        SetofOptions: {
          from: '*';
          to: 'room_players';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      admin_adjust: {
        Args: { p_amount: number; p_player: string; p_reason: string };
        Returns: undefined;
      };
      admin_archive: { Args: { p_player: string }; Returns: undefined };
      admin_claim_host: { Args: { p_uid: string }; Returns: undefined };
      admin_delete_race: { Args: { p_race: string }; Returns: undefined };
      admin_overview: { Args: Record<PropertyKey, never>; Returns: Json };
      admin_rename: {
        Args: { p_name: string; p_player: string };
        Returns: {
          archived_at: string | null;
          coat: number | null;
          horse_name: string | null;
          id: string;
          joined_at: string;
          name: string;
          ready: boolean;
          room_id: string;
          silk: number | null;
          ticked: boolean;
          uid: string | null;
        };
        SetofOptions: {
          from: '*';
          to: 'room_players';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      admin_reset_pin: { Args: { p_player: string }; Returns: undefined };
      buy_box: {
        Args: { p_box: string; p_room: string };
        Returns: {
          box: string;
          created_at: string;
          id: string;
          player_id: string;
          price: number;
          race_id: string;
          room_id: string;
        };
        SetofOptions: {
          from: '*';
          to: 'purchases';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      cancel_bet: { Args: { p_bet: string }; Returns: undefined };
      cleanup_rooms: { Args: Record<PropertyKey, never>; Returns: number };
      create_room: {
        Args: { p_length?: string; p_prize?: string };
        Returns: {
          code: string;
          created_at: string;
          host_uid: string | null;
          id: string;
          kind: string;
          last_activity_at: string;
          phase: string;
          prize: string;
          race_id: string | null;
          race_length: string;
        };
        SetofOptions: {
          from: '*';
          to: 'rooms';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      finish_race: {
        Args: { p_room: string };
        Returns: {
          code: string;
          created_at: string;
          host_uid: string | null;
          id: string;
          kind: string;
          last_activity_at: string;
          phase: string;
          prize: string;
          race_id: string | null;
          race_length: string;
        };
        SetofOptions: {
          from: '*';
          to: 'rooms';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      join_room: {
        Args: { p_code: string; p_name: string };
        Returns: {
          archived_at: string | null;
          coat: number | null;
          horse_name: string | null;
          id: string;
          joined_at: string;
          name: string;
          ready: boolean;
          room_id: string;
          silk: number | null;
          ticked: boolean;
          uid: string | null;
        };
        SetofOptions: {
          from: '*';
          to: 'room_players';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      lock_odds_begin: { Args: { p_room: string }; Returns: Json };
      lock_odds_finish: { Args: { p_odds: Json; p_race: string }; Returns: undefined };
      office_login: { Args: { p_pin: string; p_player: string }; Returns: Json };
      office_logout: { Args: { p_room: string }; Returns: undefined };
      office_roster: {
        Args: Record<PropertyKey, never>;
        Returns: {
          has_pin: boolean;
          id: string;
          name: string;
        }[];
      };
      place_bet: {
        Args: { p_horse: string; p_kind: string; p_room: string; p_stake: number };
        Returns: {
          created_at: string;
          horse_id: string;
          id: string;
          kind: string;
          odds: number;
          payout: number | null;
          player_id: string;
          race_id: string;
          room_id: string;
          stake: number;
        };
        SetofOptions: {
          from: '*';
          to: 'bets';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      remove_player: { Args: { p_player: string }; Returns: undefined };
      room_balances: {
        Args: { p_room: string };
        Returns: {
          balance: number;
          player_id: string;
        }[];
      };
      set_my_horse: {
        Args: { p_coat: number; p_horse_name: string; p_room: string; p_silk: number };
        Returns: {
          archived_at: string | null;
          coat: number | null;
          horse_name: string | null;
          id: string;
          joined_at: string;
          name: string;
          ready: boolean;
          room_id: string;
          silk: number | null;
          ticked: boolean;
          uid: string | null;
        };
        SetofOptions: {
          from: '*';
          to: 'room_players';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      set_phase: {
        Args: { p_phase: string; p_room: string };
        Returns: {
          code: string;
          created_at: string;
          host_uid: string | null;
          id: string;
          kind: string;
          last_activity_at: string;
          phase: string;
          prize: string;
          race_id: string | null;
          race_length: string;
        };
        SetofOptions: {
          from: '*';
          to: 'rooms';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      set_ready: { Args: { p_ready: boolean; p_room: string }; Returns: undefined };
      set_ticked: { Args: { p_player: string; p_ticked: boolean }; Returns: undefined };
      start_race_begin: { Args: { p_room: string }; Returns: Json };
      start_race_finish: {
        Args: { p_finish: string[]; p_race: string; p_seconds: number; p_timeline: Json };
        Returns: undefined;
      };
      update_room_settings: {
        Args: { p_length?: string; p_prize?: string; p_room: string };
        Returns: {
          code: string;
          created_at: string;
          host_uid: string | null;
          id: string;
          kind: string;
          last_activity_at: string;
          phase: string;
          prize: string;
          race_id: string | null;
          race_length: string;
        };
        SetofOptions: {
          from: '*';
          to: 'rooms';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema['CompositeTypes'] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const;
