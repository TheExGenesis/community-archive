export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  dev: {
    Tables: {
      account: {
        Row: {
          account_display_name: string | null
          account_id: string
          created_at: string | null
          created_via: string | null
          username: string | null
        }
        Insert: {
          account_display_name?: string | null
          account_id: string
          created_at?: string | null
          created_via?: string | null
          username?: string | null
        }
        Update: {
          account_display_name?: string | null
          account_id?: string
          created_at?: string | null
          created_via?: string | null
          username?: string | null
        }
        Relationships: []
      }
      archive_upload: {
        Row: {
          account_id: string | null
          archive_at: string | null
          id: number
        }
        Insert: {
          account_id?: string | null
          archive_at?: string | null
          id?: never
        }
        Update: {
          account_id?: string | null
          archive_at?: string | null
          id?: never
        }
        Relationships: [
          {
            foreignKeyName: 'archive_upload_account_id_fkey'
            columns: ['account_id']
            isOneToOne: false
            referencedRelation: 'account'
            referencedColumns: ['account_id']
          },
        ]
      }
      followers: {
        Row: {
          account_id: string | null
          archive_upload_id: number | null
          follower_account_id: string | null
          id: number
        }
        Insert: {
          account_id?: string | null
          archive_upload_id?: number | null
          follower_account_id?: string | null
          id?: never
        }
        Update: {
          account_id?: string | null
          archive_upload_id?: number | null
          follower_account_id?: string | null
          id?: never
        }
        Relationships: [
          {
            foreignKeyName: 'followers_account_id_fkey'
            columns: ['account_id']
            isOneToOne: false
            referencedRelation: 'account'
            referencedColumns: ['account_id']
          },
          {
            foreignKeyName: 'followers_archive_upload_id_fkey'
            columns: ['archive_upload_id']
            isOneToOne: false
            referencedRelation: 'archive_upload'
            referencedColumns: ['id']
          },
        ]
      }
      following: {
        Row: {
          account_id: string | null
          archive_upload_id: number | null
          following_account_id: string | null
          id: number
        }
        Insert: {
          account_id?: string | null
          archive_upload_id?: number | null
          following_account_id?: string | null
          id?: never
        }
        Update: {
          account_id?: string | null
          archive_upload_id?: number | null
          following_account_id?: string | null
          id?: never
        }
        Relationships: [
          {
            foreignKeyName: 'following_account_id_fkey'
            columns: ['account_id']
            isOneToOne: false
            referencedRelation: 'account'
            referencedColumns: ['account_id']
          },
          {
            foreignKeyName: 'following_archive_upload_id_fkey'
            columns: ['archive_upload_id']
            isOneToOne: false
            referencedRelation: 'archive_upload'
            referencedColumns: ['id']
          },
        ]
      }
      liked_tweets: {
        Row: {
          full_text: string | null
          tweet_id: string
        }
        Insert: {
          full_text?: string | null
          tweet_id: string
        }
        Update: {
          full_text?: string | null
          tweet_id?: string
        }
        Relationships: []
      }
      likes: {
        Row: {
          account_id: string | null
          archive_upload_id: number | null
          id: number
          liked_tweet_id: string | null
        }
        Insert: {
          account_id?: string | null
          archive_upload_id?: number | null
          id?: never
          liked_tweet_id?: string | null
        }
        Update: {
          account_id?: string | null
          archive_upload_id?: number | null
          id?: never
          liked_tweet_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'likes_account_id_fkey'
            columns: ['account_id']
            isOneToOne: false
            referencedRelation: 'account'
            referencedColumns: ['account_id']
          },
          {
            foreignKeyName: 'likes_archive_upload_id_fkey'
            columns: ['archive_upload_id']
            isOneToOne: false
            referencedRelation: 'archive_upload'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'likes_liked_tweet_id_fkey'
            columns: ['liked_tweet_id']
            isOneToOne: false
            referencedRelation: 'liked_tweets'
            referencedColumns: ['tweet_id']
          },
        ]
      }
      mentioned_users: {
        Row: {
          name: string | null
          screen_name: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          name?: string | null
          screen_name?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          name?: string | null
          screen_name?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      profile: {
        Row: {
          account_id: string | null
          archive_upload_id: number | null
          avatar_media_url: string | null
          bio: string | null
          header_media_url: string | null
          id: number
          location: string | null
          website: string | null
        }
        Insert: {
          account_id?: string | null
          archive_upload_id?: number | null
          avatar_media_url?: string | null
          bio?: string | null
          header_media_url?: string | null
          id?: never
          location?: string | null
          website?: string | null
        }
        Update: {
          account_id?: string | null
          archive_upload_id?: number | null
          avatar_media_url?: string | null
          bio?: string | null
          header_media_url?: string | null
          id?: never
          location?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'profile_account_id_fkey'
            columns: ['account_id']
            isOneToOne: true
            referencedRelation: 'account'
            referencedColumns: ['account_id']
          },
          {
            foreignKeyName: 'profile_archive_upload_id_fkey'
            columns: ['archive_upload_id']
            isOneToOne: false
            referencedRelation: 'archive_upload'
            referencedColumns: ['id']
          },
        ]
      }
      tweet_media: {
        Row: {
          archive_upload_id: number | null
          height: number | null
          media_id: number
          media_type: string | null
          media_url: string | null
          tweet_id: string | null
          width: number | null
        }
        Insert: {
          archive_upload_id?: number | null
          height?: number | null
          media_id: number
          media_type?: string | null
          media_url?: string | null
          tweet_id?: string | null
          width?: number | null
        }
        Update: {
          archive_upload_id?: number | null
          height?: number | null
          media_id?: number
          media_type?: string | null
          media_url?: string | null
          tweet_id?: string | null
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: 'tweet_media_archive_upload_id_fkey'
            columns: ['archive_upload_id']
            isOneToOne: false
            referencedRelation: 'archive_upload'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'tweet_media_tweet_id_fkey'
            columns: ['tweet_id']
            isOneToOne: false
            referencedRelation: 'tweets'
            referencedColumns: ['tweet_id']
          },
        ]
      }
      tweet_urls: {
        Row: {
          display_url: string | null
          expanded_url: string | null
          id: number
          tweet_id: string | null
          url: string | null
        }
        Insert: {
          display_url?: string | null
          expanded_url?: string | null
          id?: never
          tweet_id?: string | null
          url?: string | null
        }
        Update: {
          display_url?: string | null
          expanded_url?: string | null
          id?: never
          tweet_id?: string | null
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'tweet_urls_tweet_id_fkey'
            columns: ['tweet_id']
            isOneToOne: false
            referencedRelation: 'tweets'
            referencedColumns: ['tweet_id']
          },
        ]
      }
      tweets: {
        Row: {
          account_id: string | null
          archive_upload_id: number | null
          created_at: string | null
          favorite_count: number | null
          fts: unknown | null
          full_text: string | null
          reply_to_tweet_id: string | null
          reply_to_user_id: string | null
          reply_to_username: string | null
          retweet_count: number | null
          tweet_id: string
        }
        Insert: {
          account_id?: string | null
          archive_upload_id?: number | null
          created_at?: string | null
          favorite_count?: number | null
          fts?: unknown | null
          full_text?: string | null
          reply_to_tweet_id?: string | null
          reply_to_user_id?: string | null
          reply_to_username?: string | null
          retweet_count?: number | null
          tweet_id: string
        }
        Update: {
          account_id?: string | null
          archive_upload_id?: number | null
          created_at?: string | null
          favorite_count?: number | null
          fts?: unknown | null
          full_text?: string | null
          reply_to_tweet_id?: string | null
          reply_to_user_id?: string | null
          reply_to_username?: string | null
          retweet_count?: number | null
          tweet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'tweets_account_id_fkey'
            columns: ['account_id']
            isOneToOne: false
            referencedRelation: 'account'
            referencedColumns: ['account_id']
          },
          {
            foreignKeyName: 'tweets_archive_upload_id_fkey'
            columns: ['archive_upload_id']
            isOneToOne: false
            referencedRelation: 'archive_upload'
            referencedColumns: ['id']
          },
        ]
      }
      user_mentions: {
        Row: {
          id: number
          mentioned_user_id: string | null
          tweet_id: string | null
        }
        Insert: {
          id?: never
          mentioned_user_id?: string | null
          tweet_id?: string | null
        }
        Update: {
          id?: never
          mentioned_user_id?: string | null
          tweet_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'user_mentions_mentioned_user_id_fkey'
            columns: ['mentioned_user_id']
            isOneToOne: false
            referencedRelation: 'mentioned_users'
            referencedColumns: ['user_id']
          },
          {
            foreignKeyName: 'user_mentions_tweet_id_fkey'
            columns: ['tweet_id']
            isOneToOne: false
            referencedRelation: 'tweets'
            referencedColumns: ['tweet_id']
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      apply_dev_entities_rls_policies: {
        Args: {
          schema_name: string
          table_name: string
        }
        Returns: undefined
      }
      apply_dev_liked_tweets_rls_policies: {
        Args: {
          schema_name: string
          table_name: string
        }
        Returns: undefined
      }
      apply_dev_rls_policies: {
        Args: {
          schema_name: string
          table_name: string
        }
        Returns: undefined
      }
      delete_all_archives: {
        Args: {
          p_account_id: string
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
  public: {
    Tables: {
      account: {
        Row: {
          account_display_name: string | null
          account_id: string
          created_at: string | null
          created_via: string | null
          username: string | null
        }
        Insert: {
          account_display_name?: string | null
          account_id: string
          created_at?: string | null
          created_via?: string | null
          username?: string | null
        }
        Update: {
          account_display_name?: string | null
          account_id?: string
          created_at?: string | null
          created_via?: string | null
          username?: string | null
        }
        Relationships: []
      }
      archive_upload: {
        Row: {
          account_id: string | null
          archive_at: string | null
          id: number
        }
        Insert: {
          account_id?: string | null
          archive_at?: string | null
          id?: never
        }
        Update: {
          account_id?: string | null
          archive_at?: string | null
          id?: never
        }
        Relationships: [
          {
            foreignKeyName: 'archive_upload_account_id_fkey'
            columns: ['account_id']
            isOneToOne: false
            referencedRelation: 'account'
            referencedColumns: ['account_id']
          },
        ]
      }
      followers: {
        Row: {
          account_id: string | null
          archive_upload_id: number | null
          follower_account_id: string | null
          id: number
        }
        Insert: {
          account_id?: string | null
          archive_upload_id?: number | null
          follower_account_id?: string | null
          id?: never
        }
        Update: {
          account_id?: string | null
          archive_upload_id?: number | null
          follower_account_id?: string | null
          id?: never
        }
        Relationships: [
          {
            foreignKeyName: 'followers_account_id_fkey'
            columns: ['account_id']
            isOneToOne: false
            referencedRelation: 'account'
            referencedColumns: ['account_id']
          },
          {
            foreignKeyName: 'followers_archive_upload_id_fkey'
            columns: ['archive_upload_id']
            isOneToOne: false
            referencedRelation: 'archive_upload'
            referencedColumns: ['id']
          },
        ]
      }
      following: {
        Row: {
          account_id: string | null
          archive_upload_id: number | null
          following_account_id: string | null
          id: number
        }
        Insert: {
          account_id?: string | null
          archive_upload_id?: number | null
          following_account_id?: string | null
          id?: never
        }
        Update: {
          account_id?: string | null
          archive_upload_id?: number | null
          following_account_id?: string | null
          id?: never
        }
        Relationships: [
          {
            foreignKeyName: 'following_account_id_fkey'
            columns: ['account_id']
            isOneToOne: false
            referencedRelation: 'account'
            referencedColumns: ['account_id']
          },
          {
            foreignKeyName: 'following_archive_upload_id_fkey'
            columns: ['archive_upload_id']
            isOneToOne: false
            referencedRelation: 'archive_upload'
            referencedColumns: ['id']
          },
        ]
      }
      liked_tweets: {
        Row: {
          full_text: string | null
          tweet_id: string
        }
        Insert: {
          full_text?: string | null
          tweet_id: string
        }
        Update: {
          full_text?: string | null
          tweet_id?: string
        }
        Relationships: []
      }
      likes: {
        Row: {
          account_id: string | null
          archive_upload_id: number | null
          id: number
          liked_tweet_id: string | null
        }
        Insert: {
          account_id?: string | null
          archive_upload_id?: number | null
          id?: never
          liked_tweet_id?: string | null
        }
        Update: {
          account_id?: string | null
          archive_upload_id?: number | null
          id?: never
          liked_tweet_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'likes_account_id_fkey'
            columns: ['account_id']
            isOneToOne: false
            referencedRelation: 'account'
            referencedColumns: ['account_id']
          },
          {
            foreignKeyName: 'likes_archive_upload_id_fkey'
            columns: ['archive_upload_id']
            isOneToOne: false
            referencedRelation: 'archive_upload'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'likes_liked_tweet_id_fkey'
            columns: ['liked_tweet_id']
            isOneToOne: false
            referencedRelation: 'liked_tweets'
            referencedColumns: ['tweet_id']
          },
        ]
      }
      mentioned_users: {
        Row: {
          name: string | null
          screen_name: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          name?: string | null
          screen_name?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          name?: string | null
          screen_name?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      profile: {
        Row: {
          account_id: string | null
          archive_upload_id: number | null
          avatar_media_url: string | null
          bio: string | null
          header_media_url: string | null
          id: number
          location: string | null
          website: string | null
        }
        Insert: {
          account_id?: string | null
          archive_upload_id?: number | null
          avatar_media_url?: string | null
          bio?: string | null
          header_media_url?: string | null
          id?: never
          location?: string | null
          website?: string | null
        }
        Update: {
          account_id?: string | null
          archive_upload_id?: number | null
          avatar_media_url?: string | null
          bio?: string | null
          header_media_url?: string | null
          id?: never
          location?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'profile_account_id_fkey'
            columns: ['account_id']
            isOneToOne: true
            referencedRelation: 'account'
            referencedColumns: ['account_id']
          },
          {
            foreignKeyName: 'profile_archive_upload_id_fkey'
            columns: ['archive_upload_id']
            isOneToOne: false
            referencedRelation: 'archive_upload'
            referencedColumns: ['id']
          },
        ]
      }
      tweet_media: {
        Row: {
          archive_upload_id: number | null
          height: number | null
          media_id: number
          media_type: string | null
          media_url: string | null
          tweet_id: string | null
          width: number | null
        }
        Insert: {
          archive_upload_id?: number | null
          height?: number | null
          media_id: number
          media_type?: string | null
          media_url?: string | null
          tweet_id?: string | null
          width?: number | null
        }
        Update: {
          archive_upload_id?: number | null
          height?: number | null
          media_id?: number
          media_type?: string | null
          media_url?: string | null
          tweet_id?: string | null
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: 'tweet_media_archive_upload_id_fkey'
            columns: ['archive_upload_id']
            isOneToOne: false
            referencedRelation: 'archive_upload'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'tweet_media_tweet_id_fkey'
            columns: ['tweet_id']
            isOneToOne: false
            referencedRelation: 'tweets'
            referencedColumns: ['tweet_id']
          },
        ]
      }
      tweet_urls: {
        Row: {
          display_url: string | null
          expanded_url: string | null
          id: number
          tweet_id: string | null
          url: string | null
        }
        Insert: {
          display_url?: string | null
          expanded_url?: string | null
          id?: never
          tweet_id?: string | null
          url?: string | null
        }
        Update: {
          display_url?: string | null
          expanded_url?: string | null
          id?: never
          tweet_id?: string | null
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'tweet_urls_tweet_id_fkey'
            columns: ['tweet_id']
            isOneToOne: false
            referencedRelation: 'tweets'
            referencedColumns: ['tweet_id']
          },
        ]
      }
      tweets: {
        Row: {
          account_id: string | null
          archive_upload_id: number | null
          created_at: string | null
          favorite_count: number | null
          fts: unknown | null
          full_text: string | null
          reply_to_tweet_id: string | null
          reply_to_user_id: string | null
          reply_to_username: string | null
          retweet_count: number | null
          tweet_id: string
        }
        Insert: {
          account_id?: string | null
          archive_upload_id?: number | null
          created_at?: string | null
          favorite_count?: number | null
          fts?: unknown | null
          full_text?: string | null
          reply_to_tweet_id?: string | null
          reply_to_user_id?: string | null
          reply_to_username?: string | null
          retweet_count?: number | null
          tweet_id: string
        }
        Update: {
          account_id?: string | null
          archive_upload_id?: number | null
          created_at?: string | null
          favorite_count?: number | null
          fts?: unknown | null
          full_text?: string | null
          reply_to_tweet_id?: string | null
          reply_to_user_id?: string | null
          reply_to_username?: string | null
          retweet_count?: number | null
          tweet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'tweets_account_id_fkey'
            columns: ['account_id']
            isOneToOne: false
            referencedRelation: 'account'
            referencedColumns: ['account_id']
          },
          {
            foreignKeyName: 'tweets_archive_upload_id_fkey'
            columns: ['archive_upload_id']
            isOneToOne: false
            referencedRelation: 'archive_upload'
            referencedColumns: ['id']
          },
        ]
      }
      user_mentions: {
        Row: {
          id: number
          mentioned_user_id: string | null
          tweet_id: string | null
        }
        Insert: {
          id?: never
          mentioned_user_id?: string | null
          tweet_id?: string | null
        }
        Update: {
          id?: never
          mentioned_user_id?: string | null
          tweet_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'user_mentions_mentioned_user_id_fkey'
            columns: ['mentioned_user_id']
            isOneToOne: false
            referencedRelation: 'mentioned_users'
            referencedColumns: ['user_id']
          },
          {
            foreignKeyName: 'user_mentions_tweet_id_fkey'
            columns: ['tweet_id']
            isOneToOne: false
            referencedRelation: 'tweets'
            referencedColumns: ['tweet_id']
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      apply_dev_entities_rls_policies: {
        Args: {
          table_name: string
        }
        Returns: undefined
      }
      apply_dev_rls_policies: {
        Args: {
          table_name: string
        }
        Returns: undefined
      }
      apply_public_entities_rls_policies: {
        Args: {
          schema_name: string
          table_name: string
        }
        Returns: undefined
      }
      apply_public_liked_tweets_rls_policies: {
        Args: {
          schema_name: string
          table_name: string
        }
        Returns: undefined
      }
      apply_public_rls_policies: {
        Args: {
          schema_name: string
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

type PublicSchema = Database[Extract<keyof Database, 'public'>]

export type Tables<
  PublicTableNameOrOptions extends
    | keyof (PublicSchema['Tables'] & PublicSchema['Views'])
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof (Database[PublicTableNameOrOptions['schema']]['Tables'] &
        Database[PublicTableNameOrOptions['schema']]['Views'])
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? (Database[PublicTableNameOrOptions['schema']]['Tables'] &
      Database[PublicTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : PublicTableNameOrOptions extends keyof (PublicSchema['Tables'] &
        PublicSchema['Views'])
    ? (PublicSchema['Tables'] &
        PublicSchema['Views'])[PublicTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  PublicTableNameOrOptions extends
    | keyof PublicSchema['Tables']
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions['schema']]['Tables']
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema['Tables']
    ? PublicSchema['Tables'][PublicTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  PublicTableNameOrOptions extends
    | keyof PublicSchema['Tables']
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions['schema']]['Tables']
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema['Tables']
    ? PublicSchema['Tables'][PublicTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  PublicEnumNameOrOptions extends
    | keyof PublicSchema['Enums']
    | { schema: keyof Database },
  EnumName extends PublicEnumNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicEnumNameOrOptions['schema']]['Enums']
    : never = never,
> = PublicEnumNameOrOptions extends { schema: keyof Database }
  ? Database[PublicEnumNameOrOptions['schema']]['Enums'][EnumName]
  : PublicEnumNameOrOptions extends keyof PublicSchema['Enums']
    ? PublicSchema['Enums'][PublicEnumNameOrOptions]
    : never
