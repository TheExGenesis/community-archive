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
      account: {
        Row: {
          account_display_name: string | null
          account_id: string | null
          archive_at: string | null
          created_at: string | null
          created_via: string | null
          id: number
          username: string | null
        }
        Insert: {
          account_display_name?: string | null
          account_id?: string | null
          archive_at?: string | null
          created_at?: string | null
          created_via?: string | null
          id?: never
          username?: string | null
        }
        Update: {
          account_display_name?: string | null
          account_id?: string | null
          archive_at?: string | null
          created_at?: string | null
          created_via?: string | null
          id?: never
          username?: string | null
        }
        Relationships: []
      }
      dev_account: {
        Row: {
          account_display_name: string | null
          account_id: string | null
          archive_at: string | null
          created_at: string | null
          created_via: string | null
          id: number
          username: string | null
        }
        Insert: {
          account_display_name?: string | null
          account_id?: string | null
          archive_at?: string | null
          created_at?: string | null
          created_via?: string | null
          id?: never
          username?: string | null
        }
        Update: {
          account_display_name?: string | null
          account_id?: string | null
          archive_at?: string | null
          created_at?: string | null
          created_via?: string | null
          id?: never
          username?: string | null
        }
        Relationships: []
      }
      dev_followers: {
        Row: {
          account_id: string | null
          follower_account_id: string | null
          id: number
        }
        Insert: {
          account_id?: string | null
          follower_account_id?: string | null
          id?: never
        }
        Update: {
          account_id?: string | null
          follower_account_id?: string | null
          id?: never
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
          id: number
        }
        Insert: {
          account_id?: string | null
          following_account_id?: string | null
          id?: never
        }
        Update: {
          account_id?: string | null
          following_account_id?: string | null
          id?: never
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
      dev_profile: {
        Row: {
          account_id: string | null
          archive_at: string | null
          avatar_media_url: string | null
          bio: string | null
          header_media_url: string | null
          id: number
          location: string | null
          website: string | null
        }
        Insert: {
          account_id?: string | null
          archive_at?: string | null
          avatar_media_url?: string | null
          bio?: string | null
          header_media_url?: string | null
          id?: never
          location?: string | null
          website?: string | null
        }
        Update: {
          account_id?: string | null
          archive_at?: string | null
          avatar_media_url?: string | null
          bio?: string | null
          header_media_url?: string | null
          id?: never
          location?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dev_profile_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: true
            referencedRelation: "dev_account"
            referencedColumns: ["account_id"]
          },
        ]
      }
      dev_profile_data: {
        Row: {
          avatar_media_url: string | null
          bio: string | null
          header_media_url: string | null
          id: number
          location: string | null
          website: string | null
        }
        Insert: {
          avatar_media_url?: string | null
          bio?: string | null
          header_media_url?: string | null
          id?: never
          location?: string | null
          website?: string | null
        }
        Update: {
          avatar_media_url?: string | null
          bio?: string | null
          header_media_url?: string | null
          id?: never
          location?: string | null
          website?: string | null
        }
        Relationships: []
      }
      dev_tweet_entities: {
        Row: {
          end_index: number | null
          entity_type: string | null
          entity_value: string | null
          id: number
          position_index: number | null
          start_index: number | null
          tweet_id: string | null
        }
        Insert: {
          end_index?: number | null
          entity_type?: string | null
          entity_value?: string | null
          id?: never
          position_index?: number | null
          start_index?: number | null
          tweet_id?: string | null
        }
        Update: {
          end_index?: number | null
          entity_type?: string | null
          entity_value?: string | null
          id?: never
          position_index?: number | null
          start_index?: number | null
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
          media_id: string
          media_type: string | null
          media_url: string | null
          tweet_id: string | null
          width: number | null
        }
        Insert: {
          height?: number | null
          media_id: string
          media_type?: string | null
          media_url?: string | null
          tweet_id?: string | null
          width?: number | null
        }
        Update: {
          height?: number | null
          media_id?: string
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
          id: number
          is_retweet: boolean | null
          reply_to_tweet_id: string | null
          reply_to_user_id: string | null
          reply_to_username: string | null
          retweet_count: number | null
          tweet_id: string | null
        }
        Insert: {
          account_id?: string | null
          created_at?: string | null
          favorite_count?: number | null
          full_text?: string | null
          id?: never
          is_retweet?: boolean | null
          reply_to_tweet_id?: string | null
          reply_to_user_id?: string | null
          reply_to_username?: string | null
          retweet_count?: number | null
          tweet_id?: string | null
        }
        Update: {
          account_id?: string | null
          created_at?: string | null
          favorite_count?: number | null
          full_text?: string | null
          id?: never
          is_retweet?: boolean | null
          reply_to_tweet_id?: string | null
          reply_to_user_id?: string | null
          reply_to_username?: string | null
          retweet_count?: number | null
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
      followers: {
        Row: {
          account_id: string | null
          follower_account_id: string | null
          id: number
        }
        Insert: {
          account_id?: string | null
          follower_account_id?: string | null
          id?: never
        }
        Update: {
          account_id?: string | null
          follower_account_id?: string | null
          id?: never
        }
        Relationships: [
          {
            foreignKeyName: "followers_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "account"
            referencedColumns: ["account_id"]
          },
        ]
      }
      following: {
        Row: {
          account_id: string | null
          following_account_id: string | null
          id: number
        }
        Insert: {
          account_id?: string | null
          following_account_id?: string | null
          id?: never
        }
        Update: {
          account_id?: string | null
          following_account_id?: string | null
          id?: never
        }
        Relationships: [
          {
            foreignKeyName: "following_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "account"
            referencedColumns: ["account_id"]
          },
        ]
      }
      profile: {
        Row: {
          account_id: string | null
          archive_at: string | null
          avatar_media_url: string | null
          bio: string | null
          header_media_url: string | null
          id: number
          location: string | null
          website: string | null
        }
        Insert: {
          account_id?: string | null
          archive_at?: string | null
          avatar_media_url?: string | null
          bio?: string | null
          header_media_url?: string | null
          id?: never
          location?: string | null
          website?: string | null
        }
        Update: {
          account_id?: string | null
          archive_at?: string | null
          avatar_media_url?: string | null
          bio?: string | null
          header_media_url?: string | null
          id?: never
          location?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profile_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: true
            referencedRelation: "account"
            referencedColumns: ["account_id"]
          },
        ]
      }
      tweet_entities: {
        Row: {
          end_index: number | null
          entity_type: string | null
          entity_value: string | null
          id: number
          position_index: number | null
          start_index: number | null
          tweet_id: string | null
        }
        Insert: {
          end_index?: number | null
          entity_type?: string | null
          entity_value?: string | null
          id?: never
          position_index?: number | null
          start_index?: number | null
          tweet_id?: string | null
        }
        Update: {
          end_index?: number | null
          entity_type?: string | null
          entity_value?: string | null
          id?: never
          position_index?: number | null
          start_index?: number | null
          tweet_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tweet_entities_tweet_id_fkey"
            columns: ["tweet_id"]
            isOneToOne: false
            referencedRelation: "tweets"
            referencedColumns: ["tweet_id"]
          },
        ]
      }
      tweet_media: {
        Row: {
          height: number | null
          media_id: string
          media_type: string | null
          media_url: string | null
          tweet_id: string | null
          width: number | null
        }
        Insert: {
          height?: number | null
          media_id: string
          media_type?: string | null
          media_url?: string | null
          tweet_id?: string | null
          width?: number | null
        }
        Update: {
          height?: number | null
          media_id?: string
          media_type?: string | null
          media_url?: string | null
          tweet_id?: string | null
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tweet_media_tweet_id_fkey"
            columns: ["tweet_id"]
            isOneToOne: false
            referencedRelation: "tweets"
            referencedColumns: ["tweet_id"]
          },
        ]
      }
      tweets: {
        Row: {
          account_id: string | null
          created_at: string | null
          favorite_count: number | null
          full_text: string | null
          id: number
          is_retweet: boolean | null
          reply_to_tweet_id: string | null
          reply_to_user_id: string | null
          reply_to_username: string | null
          retweet_count: number | null
          tweet_id: string | null
        }
        Insert: {
          account_id?: string | null
          created_at?: string | null
          favorite_count?: number | null
          full_text?: string | null
          id?: never
          is_retweet?: boolean | null
          reply_to_tweet_id?: string | null
          reply_to_user_id?: string | null
          reply_to_username?: string | null
          retweet_count?: number | null
          tweet_id?: string | null
        }
        Update: {
          account_id?: string | null
          created_at?: string | null
          favorite_count?: number | null
          full_text?: string | null
          id?: never
          is_retweet?: boolean | null
          reply_to_tweet_id?: string | null
          reply_to_user_id?: string | null
          reply_to_username?: string | null
          retweet_count?: number | null
          tweet_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tweets_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "account"
            referencedColumns: ["account_id"]
          },
        ]
      }
    }
    Views: {
      latest_dev_profile: {
        Row: {
          account_id: string | null
          archive_at: string | null
          avatar_media_url: string | null
          bio: string | null
          header_media_url: string | null
          id: number | null
          location: string | null
          website: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dev_profile_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: true
            referencedRelation: "dev_account"
            referencedColumns: ["account_id"]
          },
        ]
      }
      latest_profile: {
        Row: {
          account_id: string | null
          archive_at: string | null
          avatar_media_url: string | null
          bio: string | null
          header_media_url: string | null
          id: number | null
          location: string | null
          website: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profile_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: true
            referencedRelation: "account"
            referencedColumns: ["account_id"]
          },
        ]
      }
    }
    Functions: {
      apply_dev_rls_policies: {
        Args: {
          table_name: string
        }
        Returns: undefined
      }
      apply_dev_table_rls_policies: {
        Args: {
          table_name: string
        }
        Returns: undefined
      }
      apply_prod_rls_policies: {
        Args: {
          table_name: string
        }
        Returns: undefined
      }
      apply_rls_policies: {
        Args: {
          table_name: string
        }
        Returns: undefined
      }
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
