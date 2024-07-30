export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      dev_account: {
        Row: {
          account_display_name: string | null
          account_id: string | null
          created_at: string | null
          created_via: string | null
          email: string | null
          id: string
          username: string | null
        }
        Insert: {
          account_display_name?: string | null
          account_id?: string | null
          created_at?: string | null
          created_via?: string | null
          email?: string | null
          id?: string
          username?: string | null
        }
        Update: {
          account_display_name?: string | null
          account_id?: string | null
          created_at?: string | null
          created_via?: string | null
          email?: string | null
          id?: string
          username?: string | null
        }
        Relationships: []
      }
      dev_followers: {
        Row: {
          account_id: string | null
          follower_account_id: string | null
          id: string
        }
        Insert: {
          account_id?: string | null
          follower_account_id?: string | null
          id?: string
        }
        Update: {
          account_id?: string | null
          follower_account_id?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dev_followers_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "dev_account"
            referencedColumns: ["account_id"]
          },
        ]
      }
      dev_following: {
        Row: {
          account_id: string | null
          following_account_id: string | null
          id: string
        }
        Insert: {
          account_id?: string | null
          following_account_id?: string | null
          id?: string
        }
        Update: {
          account_id?: string | null
          following_account_id?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dev_following_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "dev_account"
            referencedColumns: ["account_id"]
          },
        ]
      }
      dev_tweet_entities: {
        Row: {
          entity_type: string | null
          entity_value: string | null
          id: string
          tweet_id: string | null
        }
        Insert: {
          entity_type?: string | null
          entity_value?: string | null
          id?: string
          tweet_id?: string | null
        }
        Update: {
          entity_type?: string | null
          entity_value?: string | null
          id?: string
          tweet_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dev_tweet_entities_tweet_id_fkey"
            columns: ["tweet_id"]
            isOneToOne: false
            referencedRelation: "dev_tweets"
            referencedColumns: ["tweet_id"]
          },
        ]
      }
      dev_tweet_media: {
        Row: {
          height: number | null
          id: string
          media_type: string | null
          media_url: string | null
          tweet_id: string | null
          width: number | null
        }
        Insert: {
          height?: number | null
          id?: string
          media_type?: string | null
          media_url?: string | null
          tweet_id?: string | null
          width?: number | null
        }
        Update: {
          height?: number | null
          id?: string
          media_type?: string | null
          media_url?: string | null
          tweet_id?: string | null
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "dev_tweet_media_tweet_id_fkey"
            columns: ["tweet_id"]
            isOneToOne: false
            referencedRelation: "dev_tweets"
            referencedColumns: ["tweet_id"]
          },
        ]
      }
      dev_tweets: {
        Row: {
          account_id: string | null
          created_at: string | null
          favorite_count: number | null
          full_text: string | null
          id: string
          is_retweet: boolean | null
          lang: string | null
          possibly_sensitive: boolean | null
          reply_to_tweet_id: string | null
          reply_to_user_id: string | null
          reply_to_username: string | null
          retweet_count: number | null
          source: string | null
          tweet_id: string | null
        }
        Insert: {
          account_id?: string | null
          created_at?: string | null
          favorite_count?: number | null
          full_text?: string | null
          id?: string
          is_retweet?: boolean | null
          lang?: string | null
          possibly_sensitive?: boolean | null
          reply_to_tweet_id?: string | null
          reply_to_user_id?: string | null
          reply_to_username?: string | null
          retweet_count?: number | null
          source?: string | null
          tweet_id?: string | null
        }
        Update: {
          account_id?: string | null
          created_at?: string | null
          favorite_count?: number | null
          full_text?: string | null
          id?: string
          is_retweet?: boolean | null
          lang?: string | null
          possibly_sensitive?: boolean | null
          reply_to_tweet_id?: string | null
          reply_to_user_id?: string | null
          reply_to_username?: string | null
          retweet_count?: number | null
          source?: string | null
          tweet_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dev_tweets_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "dev_account"
            referencedColumns: ["account_id"]
          },
        ]
      }
      todos: {
        Row: {
          id: number
          task: string | null
        }
        Insert: {
          id?: number
          task?: string | null
        }
        Update: {
          id?: number
          task?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_public_tables: {
        Args: Record<PropertyKey, never>
        Returns: {
          table_name: string
        }[]
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

type PublicSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  PublicTableNameOrOptions extends
    | keyof (PublicSchema["Tables"] & PublicSchema["Views"])
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
        Database[PublicTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
      Database[PublicTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : PublicTableNameOrOptions extends keyof (PublicSchema["Tables"] &
        PublicSchema["Views"])
    ? (PublicSchema["Tables"] &
        PublicSchema["Views"])[PublicTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  PublicEnumNameOrOptions extends
    | keyof PublicSchema["Enums"]
    | { schema: keyof Database },
  EnumName extends PublicEnumNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = PublicEnumNameOrOptions extends { schema: keyof Database }
  ? Database[PublicEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : PublicEnumNameOrOptions extends keyof PublicSchema["Enums"]
    ? PublicSchema["Enums"][PublicEnumNameOrOptions]
    : never
