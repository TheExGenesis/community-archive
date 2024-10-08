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
          account_display_name: string
          account_id: string
          created_at: string
          created_via: string
          username: string
        }
        Insert: {
          account_display_name: string
          account_id: string
          created_at: string
          created_via: string
          username: string
        }
        Update: {
          account_display_name?: string
          account_id?: string
          created_at?: string
          created_via?: string
          username?: string
        }
        Relationships: []
      }
      archive_upload: {
        Row: {
          account_id: string
          archive_at: string
          created_at: string | null
          id: number
        }
        Insert: {
          account_id: string
          archive_at: string
          created_at?: string | null
          id?: never
        }
        Update: {
          account_id?: string
          archive_at?: string
          created_at?: string | null
          id?: never
        }
        Relationships: [
          {
            foreignKeyName: "archive_upload_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "account"
            referencedColumns: ["account_id"]
          },
        ]
      }
      followers: {
        Row: {
          account_id: string
          archive_upload_id: number
          follower_account_id: string
          id: number
        }
        Insert: {
          account_id: string
          archive_upload_id: number
          follower_account_id: string
          id?: never
        }
        Update: {
          account_id?: string
          archive_upload_id?: number
          follower_account_id?: string
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
          {
            foreignKeyName: "followers_archive_upload_id_fkey"
            columns: ["archive_upload_id"]
            isOneToOne: false
            referencedRelation: "archive_upload"
            referencedColumns: ["id"]
          },
        ]
      }
      following: {
        Row: {
          account_id: string
          archive_upload_id: number
          following_account_id: string
          id: number
        }
        Insert: {
          account_id: string
          archive_upload_id: number
          following_account_id: string
          id?: never
        }
        Update: {
          account_id?: string
          archive_upload_id?: number
          following_account_id?: string
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
          {
            foreignKeyName: "following_archive_upload_id_fkey"
            columns: ["archive_upload_id"]
            isOneToOne: false
            referencedRelation: "archive_upload"
            referencedColumns: ["id"]
          },
        ]
      }
      liked_tweets: {
        Row: {
          full_text: string
          tweet_id: string
        }
        Insert: {
          full_text: string
          tweet_id: string
        }
        Update: {
          full_text?: string
          tweet_id?: string
        }
        Relationships: []
      }
      likes: {
        Row: {
          account_id: string
          archive_upload_id: number
          id: number
          liked_tweet_id: string
        }
        Insert: {
          account_id: string
          archive_upload_id: number
          id?: never
          liked_tweet_id: string
        }
        Update: {
          account_id?: string
          archive_upload_id?: number
          id?: never
          liked_tweet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "likes_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "account"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "likes_archive_upload_id_fkey"
            columns: ["archive_upload_id"]
            isOneToOne: false
            referencedRelation: "archive_upload"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "likes_liked_tweet_id_fkey"
            columns: ["liked_tweet_id"]
            isOneToOne: false
            referencedRelation: "liked_tweets"
            referencedColumns: ["tweet_id"]
          },
        ]
      }
      mentioned_users: {
        Row: {
          name: string
          screen_name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          name: string
          screen_name: string
          updated_at: string
          user_id: string
        }
        Update: {
          name?: string
          screen_name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profile: {
        Row: {
          account_id: string
          archive_upload_id: number
          avatar_media_url: string | null
          bio: string | null
          header_media_url: string | null
          id: number
          location: string | null
          website: string | null
        }
        Insert: {
          account_id: string
          archive_upload_id: number
          avatar_media_url?: string | null
          bio?: string | null
          header_media_url?: string | null
          id?: never
          location?: string | null
          website?: string | null
        }
        Update: {
          account_id?: string
          archive_upload_id?: number
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
            isOneToOne: false
            referencedRelation: "account"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "profile_archive_upload_id_fkey"
            columns: ["archive_upload_id"]
            isOneToOne: false
            referencedRelation: "archive_upload"
            referencedColumns: ["id"]
          },
        ]
      }
      tweet_media: {
        Row: {
          archive_upload_id: number
          height: number
          media_id: number
          media_type: string
          media_url: string
          tweet_id: string
          width: number
        }
        Insert: {
          archive_upload_id: number
          height: number
          media_id: number
          media_type: string
          media_url: string
          tweet_id: string
          width: number
        }
        Update: {
          archive_upload_id?: number
          height?: number
          media_id?: number
          media_type?: string
          media_url?: string
          tweet_id?: string
          width?: number
        }
        Relationships: [
          {
            foreignKeyName: "tweet_media_archive_upload_id_fkey"
            columns: ["archive_upload_id"]
            isOneToOne: false
            referencedRelation: "archive_upload"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tweet_media_tweet_id_fkey"
            columns: ["tweet_id"]
            isOneToOne: false
            referencedRelation: "tweets"
            referencedColumns: ["tweet_id"]
          },
        ]
      }
      tweet_urls: {
        Row: {
          display_url: string
          expanded_url: string
          id: number
          tweet_id: string
          url: string
        }
        Insert: {
          display_url: string
          expanded_url: string
          id?: never
          tweet_id: string
          url: string
        }
        Update: {
          display_url?: string
          expanded_url?: string
          id?: never
          tweet_id?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "tweet_urls_tweet_id_fkey"
            columns: ["tweet_id"]
            isOneToOne: false
            referencedRelation: "tweets"
            referencedColumns: ["tweet_id"]
          },
        ]
      }
      tweets: {
        Row: {
          account_id: string
          archive_upload_id: number
          created_at: string
          favorite_count: number
          fts: unknown | null
          full_text: string
          reply_to_tweet_id: string | null
          reply_to_user_id: string | null
          reply_to_username: string | null
          retweet_count: number
          tweet_id: string
        }
        Insert: {
          account_id: string
          archive_upload_id: number
          created_at: string
          favorite_count: number
          fts?: unknown | null
          full_text: string
          reply_to_tweet_id?: string | null
          reply_to_user_id?: string | null
          reply_to_username?: string | null
          retweet_count: number
          tweet_id: string
        }
        Update: {
          account_id?: string
          archive_upload_id?: number
          created_at?: string
          favorite_count?: number
          fts?: unknown | null
          full_text?: string
          reply_to_tweet_id?: string | null
          reply_to_user_id?: string | null
          reply_to_username?: string | null
          retweet_count?: number
          tweet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tweets_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "account"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "tweets_archive_upload_id_fkey"
            columns: ["archive_upload_id"]
            isOneToOne: false
            referencedRelation: "archive_upload"
            referencedColumns: ["id"]
          },
        ]
      }
      user_mentions: {
        Row: {
          id: number
          mentioned_user_id: string
          tweet_id: string
        }
        Insert: {
          id?: never
          mentioned_user_id: string
          tweet_id: string
        }
        Update: {
          id?: never
          mentioned_user_id?: string
          tweet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_mentions_mentioned_user_id_fkey"
            columns: ["mentioned_user_id"]
            isOneToOne: false
            referencedRelation: "mentioned_users"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "user_mentions_tweet_id_fkey"
            columns: ["tweet_id"]
            isOneToOne: false
            referencedRelation: "tweets"
            referencedColumns: ["tweet_id"]
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
      commit_temp_data: {
        Args: {
          p_suffix: string
        }
        Returns: undefined
      }
      create_temp_tables: {
        Args: {
          p_suffix: string
        }
        Returns: undefined
      }
      delete_all_archives: {
        Args: {
          p_account_id: string
        }
        Returns: undefined
      }
      drop_function_if_exists: {
        Args: {
          function_name: string
          function_args: string[]
        }
        Returns: undefined
      }
      drop_temp_tables: {
        Args: {
          p_suffix: string
        }
        Returns: undefined
      }
      get_top_accounts_with_followers: {
        Args: {
          limit_count: number
        }
        Returns: {
          account_id: string
          created_via: string
          username: string
          created_at: string
          account_display_name: string
          avatar_media_url: string
          bio: string
          website: string
          location: string
          header_media_url: string
          follower_count: number
        }[]
      }
      insert_temp_account: {
        Args: {
          p_account: Json
          p_suffix: string
        }
        Returns: undefined
      }
      insert_temp_archive_upload: {
        Args: {
          p_account_id: string
          p_archive_at: string
          p_suffix: string
        }
        Returns: number
      }
      insert_temp_followers: {
        Args: {
          p_followers: Json
          p_account_id: string
          p_suffix: string
        }
        Returns: undefined
      }
      insert_temp_following: {
        Args: {
          p_following: Json
          p_account_id: string
          p_suffix: string
        }
        Returns: undefined
      }
      insert_temp_likes: {
        Args: {
          p_likes: Json
          p_account_id: string
          p_suffix: string
        }
        Returns: undefined
      }
      insert_temp_profiles: {
        Args: {
          p_profile: Json
          p_account_id: string
          p_suffix: string
        }
        Returns: undefined
      }
      insert_temp_tweets: {
        Args: {
          p_tweets: Json
          p_suffix: string
        }
        Returns: undefined
      }
      process_and_insert_tweet_entities: {
        Args: {
          p_tweets: Json
          p_suffix: string
        }
        Returns: undefined
      }
      process_archive: {
        Args: {
          archive_data: Json
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
          operationName?: string
          query?: string
          variables?: Json
          extensions?: Json
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
      account: {
        Row: {
          account_display_name: string
          account_id: string
          created_at: string
          created_via: string
          num_followers: number | null
          num_following: number | null
          num_likes: number | null
          num_tweets: number | null
          username: string
        }
        Insert: {
          account_display_name: string
          account_id: string
          created_at: string
          created_via: string
          num_followers?: number | null
          num_following?: number | null
          num_likes?: number | null
          num_tweets?: number | null
          username: string
        }
        Update: {
          account_display_name?: string
          account_id?: string
          created_at?: string
          created_via?: string
          num_followers?: number | null
          num_following?: number | null
          num_likes?: number | null
          num_tweets?: number | null
          username?: string
        }
        Relationships: []
      }
      archive_upload: {
        Row: {
          account_id: string
          archive_at: string
          created_at: string | null
          end_date: string | null
          id: number
          keep_private: boolean | null
          start_date: string | null
          upload_likes: boolean | null
          upload_phase: Database["public"]["Enums"]["upload_phase_enum"] | null
        }
        Insert: {
          account_id: string
          archive_at: string
          created_at?: string | null
          end_date?: string | null
          id?: never
          keep_private?: boolean | null
          start_date?: string | null
          upload_likes?: boolean | null
          upload_phase?: Database["public"]["Enums"]["upload_phase_enum"] | null
        }
        Update: {
          account_id?: string
          archive_at?: string
          created_at?: string | null
          end_date?: string | null
          id?: never
          keep_private?: boolean | null
          start_date?: string | null
          upload_likes?: boolean | null
          upload_phase?: Database["public"]["Enums"]["upload_phase_enum"] | null
        }
        Relationships: [
          {
            foreignKeyName: "archive_upload_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "account"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "archive_upload_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "account_activity_summary"
            referencedColumns: ["account_id"]
          },
        ]
      }
      followers: {
        Row: {
          account_id: string
          archive_upload_id: number
          follower_account_id: string
          id: number
        }
        Insert: {
          account_id: string
          archive_upload_id: number
          follower_account_id: string
          id?: never
        }
        Update: {
          account_id?: string
          archive_upload_id?: number
          follower_account_id?: string
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
          {
            foreignKeyName: "followers_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "account_activity_summary"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "followers_archive_upload_id_fkey"
            columns: ["archive_upload_id"]
            isOneToOne: false
            referencedRelation: "archive_upload"
            referencedColumns: ["id"]
          },
        ]
      }
      following: {
        Row: {
          account_id: string
          archive_upload_id: number
          following_account_id: string
          id: number
        }
        Insert: {
          account_id: string
          archive_upload_id: number
          following_account_id: string
          id?: never
        }
        Update: {
          account_id?: string
          archive_upload_id?: number
          following_account_id?: string
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
          {
            foreignKeyName: "following_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "account_activity_summary"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "following_archive_upload_id_fkey"
            columns: ["archive_upload_id"]
            isOneToOne: false
            referencedRelation: "archive_upload"
            referencedColumns: ["id"]
          },
        ]
      }
      liked_tweets: {
        Row: {
          full_text: string
          tweet_id: string
        }
        Insert: {
          full_text: string
          tweet_id: string
        }
        Update: {
          full_text?: string
          tweet_id?: string
        }
        Relationships: []
      }
      likes: {
        Row: {
          account_id: string
          archive_upload_id: number
          id: number
          liked_tweet_id: string
        }
        Insert: {
          account_id: string
          archive_upload_id: number
          id?: never
          liked_tweet_id: string
        }
        Update: {
          account_id?: string
          archive_upload_id?: number
          id?: never
          liked_tweet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "likes_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "account"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "likes_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "account_activity_summary"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "likes_archive_upload_id_fkey"
            columns: ["archive_upload_id"]
            isOneToOne: false
            referencedRelation: "archive_upload"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "likes_liked_tweet_id_fkey"
            columns: ["liked_tweet_id"]
            isOneToOne: false
            referencedRelation: "liked_tweets"
            referencedColumns: ["tweet_id"]
          },
        ]
      }
      mentioned_users: {
        Row: {
          name: string
          screen_name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          name: string
          screen_name: string
          updated_at: string
          user_id: string
        }
        Update: {
          name?: string
          screen_name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profile: {
        Row: {
          account_id: string
          archive_upload_id: number
          avatar_media_url: string | null
          bio: string | null
          header_media_url: string | null
          id: number
          location: string | null
          website: string | null
        }
        Insert: {
          account_id: string
          archive_upload_id: number
          avatar_media_url?: string | null
          bio?: string | null
          header_media_url?: string | null
          id?: never
          location?: string | null
          website?: string | null
        }
        Update: {
          account_id?: string
          archive_upload_id?: number
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
            isOneToOne: false
            referencedRelation: "account"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "profile_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "account_activity_summary"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "profile_archive_upload_id_fkey"
            columns: ["archive_upload_id"]
            isOneToOne: false
            referencedRelation: "archive_upload"
            referencedColumns: ["id"]
          },
        ]
      }
      tweet_media: {
        Row: {
          archive_upload_id: number
          height: number
          media_id: number
          media_type: string
          media_url: string
          tweet_id: string
          width: number
        }
        Insert: {
          archive_upload_id: number
          height: number
          media_id: number
          media_type: string
          media_url: string
          tweet_id: string
          width: number
        }
        Update: {
          archive_upload_id?: number
          height?: number
          media_id?: number
          media_type?: string
          media_url?: string
          tweet_id?: string
          width?: number
        }
        Relationships: [
          {
            foreignKeyName: "tweet_media_archive_upload_id_fkey"
            columns: ["archive_upload_id"]
            isOneToOne: false
            referencedRelation: "archive_upload"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tweet_media_tweet_id_fkey"
            columns: ["tweet_id"]
            isOneToOne: false
            referencedRelation: "tweets"
            referencedColumns: ["tweet_id"]
          },
        ]
      }
      tweet_urls: {
        Row: {
          display_url: string
          expanded_url: string
          id: number
          tweet_id: string
          url: string
        }
        Insert: {
          display_url: string
          expanded_url: string
          id?: never
          tweet_id: string
          url: string
        }
        Update: {
          display_url?: string
          expanded_url?: string
          id?: never
          tweet_id?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "tweet_urls_tweet_id_fkey"
            columns: ["tweet_id"]
            isOneToOne: false
            referencedRelation: "tweets"
            referencedColumns: ["tweet_id"]
          },
        ]
      }
      tweets: {
        Row: {
          account_id: string
          archive_upload_id: number
          created_at: string
          favorite_count: number
          fts: unknown | null
          full_text: string
          reply_to_tweet_id: string | null
          reply_to_user_id: string | null
          reply_to_username: string | null
          retweet_count: number
          tweet_id: string
        }
        Insert: {
          account_id: string
          archive_upload_id: number
          created_at: string
          favorite_count: number
          fts?: unknown | null
          full_text: string
          reply_to_tweet_id?: string | null
          reply_to_user_id?: string | null
          reply_to_username?: string | null
          retweet_count: number
          tweet_id: string
        }
        Update: {
          account_id?: string
          archive_upload_id?: number
          created_at?: string
          favorite_count?: number
          fts?: unknown | null
          full_text?: string
          reply_to_tweet_id?: string | null
          reply_to_user_id?: string | null
          reply_to_username?: string | null
          retweet_count?: number
          tweet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tweets_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "account"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "tweets_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "account_activity_summary"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "tweets_archive_upload_id_fkey"
            columns: ["archive_upload_id"]
            isOneToOne: false
            referencedRelation: "archive_upload"
            referencedColumns: ["id"]
          },
        ]
      }
      user_mentions: {
        Row: {
          id: number
          mentioned_user_id: string
          tweet_id: string
        }
        Insert: {
          id?: never
          mentioned_user_id: string
          tweet_id: string
        }
        Update: {
          id?: never
          mentioned_user_id?: string
          tweet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_mentions_mentioned_user_id_fkey"
            columns: ["mentioned_user_id"]
            isOneToOne: false
            referencedRelation: "mentioned_users"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "user_mentions_tweet_id_fkey"
            columns: ["tweet_id"]
            isOneToOne: false
            referencedRelation: "tweets"
            referencedColumns: ["tweet_id"]
          },
        ]
      }
    }
    Views: {
      account_activity_summary: {
        Row: {
          account_id: string | null
          mentioned_accounts: Json | null
          most_favorited_tweets: Json | null
          most_liked_tweets_by_archive_users: Json | null
          most_replied_tweets_by_archive_users: Json | null
          most_retweeted_tweets: Json | null
          num_followers: number | null
          num_tweets: number | null
          total_likes: number | null
          total_mentions: number | null
          username: string | null
        }
        Relationships: []
      }
      global_activity_summary: {
        Row: {
          total_accounts: number | null
          total_likes: number | null
          total_tweets: number | null
          total_user_mentions: number | null
        }
        Relationships: []
      }
    }
    Functions: {
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
      apply_public_rls_policies_not_private: {
        Args: {
          schema_name: string
          table_name: string
        }
        Returns: undefined
      }
      commit_temp_data: {
        Args: {
          p_suffix: string
        }
        Returns: undefined
      }
      create_temp_tables: {
        Args: {
          p_suffix: string
        }
        Returns: undefined
      }
      delete_all_archives: {
        Args: {
          p_account_id: string
        }
        Returns: undefined
      }
      drop_all_policies: {
        Args: {
          schema_name: string
          table_name: string
        }
        Returns: undefined
      }
      drop_temp_tables: {
        Args: {
          p_suffix: string
        }
        Returns: undefined
      }
      get_account_most_liked_tweets_archive_users: {
        Args: {
          username_: string
          limit_?: number
        }
        Returns: {
          tweet_id: string
          account_id: string
          created_at: string
          full_text: string
          retweet_count: number
          favorite_count: number
          reply_to_tweet_id: string
          reply_to_user_id: string
          reply_to_username: string
          archive_upload_id: number
          num_likes: number
        }[]
      }
      get_account_most_mentioned_accounts: {
        Args: {
          username_: string
          limit_: number
        }
        Returns: {
          user_id: string
          name: string
          screen_name: string
          mention_count: number
        }[]
      }
      get_account_most_replied_tweets_by_archive_users: {
        Args: {
          username_: string
          limit_: number
        }
        Returns: {
          tweet_id: string
          account_id: string
          created_at: string
          full_text: string
          retweet_count: number
          favorite_count: number
          reply_to_tweet_id: string
          reply_to_user_id: string
          reply_to_username: string
          archive_upload_id: number
          num_replies: number
        }[]
      }
      get_account_top_favorite_count_tweets: {
        Args: {
          username_: string
          limit_: number
        }
        Returns: {
          tweet_id: string
          account_id: string
          created_at: string
          full_text: string
          retweet_count: number
          favorite_count: number
          reply_to_tweet_id: string
          reply_to_user_id: string
          reply_to_username: string
          archive_upload_id: number
        }[]
      }
      get_account_top_retweet_count_tweets: {
        Args: {
          username_: string
          limit_: number
        }
        Returns: {
          tweet_id: string
          account_id: string
          created_at: string
          full_text: string
          retweet_count: number
          favorite_count: number
          reply_to_tweet_id: string
          reply_to_user_id: string
          reply_to_username: string
          archive_upload_id: number
        }[]
      }
      get_latest_tweets: {
        Args: {
          count: number
          p_account_id?: string
        }
        Returns: {
          tweet_id: string
          account_id: string
          created_at: string
          full_text: string
          retweet_count: number
          favorite_count: number
          reply_to_tweet_id: string
          avatar_media_url: string
          username: string
          account_display_name: string
        }[]
      }
      get_top_accounts_with_followers: {
        Args: {
          limit_count: number
        }
        Returns: {
          account_id: string
          created_via: string
          username: string
          created_at: string
          account_display_name: string
          avatar_media_url: string
          bio: string
          website: string
          location: string
          header_media_url: string
          num_followers: number
          num_tweets: number
        }[]
      }
      get_top_mentioned_users: {
        Args: {
          limit_: number
        }
        Returns: {
          user_id: string
          name: string
          screen_name: string
          mention_count: number
        }[]
      }
      get_tweet_count_by_date:
        | {
            Args: {
              start_date: string
              end_date: string
            }
            Returns: {
              tweet_date: string
              tweet_count: number
            }[]
          }
        | {
            Args: {
              start_date: string
              end_date: string
              granularity: string
            }
            Returns: {
              tweet_date: string
              tweet_count: number
            }[]
          }
      gtrgm_compress: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      gtrgm_decompress: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      gtrgm_in: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      gtrgm_options: {
        Args: {
          "": unknown
        }
        Returns: undefined
      }
      gtrgm_out: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      insert_temp_account: {
        Args: {
          p_account: Json
          p_suffix: string
        }
        Returns: undefined
      }
      insert_temp_archive_upload: {
        Args: {
          p_account_id: string
          p_archive_at: string
          p_keep_private: boolean
          p_upload_likes: boolean
          p_start_date: string
          p_end_date: string
          p_suffix: string
        }
        Returns: number
      }
      insert_temp_followers: {
        Args: {
          p_followers: Json
          p_account_id: string
          p_suffix: string
        }
        Returns: undefined
      }
      insert_temp_following: {
        Args: {
          p_following: Json
          p_account_id: string
          p_suffix: string
        }
        Returns: undefined
      }
      insert_temp_likes: {
        Args: {
          p_likes: Json
          p_account_id: string
          p_suffix: string
        }
        Returns: undefined
      }
      insert_temp_profiles: {
        Args: {
          p_profile: Json
          p_account_id: string
          p_suffix: string
        }
        Returns: undefined
      }
      insert_temp_tweets: {
        Args: {
          p_tweets: Json
          p_suffix: string
        }
        Returns: undefined
      }
      pg_search_tweets: {
        Args: {
          search_query: string
          p_account_id?: string
        }
        Returns: {
          tweet_id: string
          account_id: string
          created_at: string
          full_text: string
          retweet_count: number
          favorite_count: number
          username: string
          account_display_name: string
          avatar_media_url: string
        }[]
      }
      pg_search_tweets_with_trigram: {
        Args: {
          search_query: string
          p_account_id?: string
        }
        Returns: {
          tweet_id: string
          account_id: string
          created_at: string
          full_text: string
          retweet_count: number
          favorite_count: number
          username: string
          account_display_name: string
          avatar_media_url: string
        }[]
      }
      process_and_insert_tweet_entities: {
        Args: {
          p_tweets: Json
          p_suffix: string
        }
        Returns: undefined
      }
      process_archive: {
        Args: {
          archive_data: Json
        }
        Returns: undefined
      }
      search_tweets: {
        Args: {
          search_query: string
          from_user?: string
          to_user?: string
          since_date?: string
          until_date?: string
          limit_?: number
        }
        Returns: {
          tweet_id: string
          account_id: string
          created_at: string
          full_text: string
          retweet_count: number
          favorite_count: number
          reply_to_tweet_id: string
          avatar_media_url: string
          archive_upload_id: number
          username: string
          account_display_name: string
        }[]
      }
      set_limit: {
        Args: {
          "": number
        }
        Returns: number
      }
      show_limit: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      show_trgm: {
        Args: {
          "": string
        }
        Returns: string[]
      }
    }
    Enums: {
      upload_phase_enum: "uploading" | "completed" | "failed"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  temp: {
    Tables: {
      account_1038586640: {
        Row: {
          account_display_name: string
          account_id: string
          created_at: string
          created_via: string
          num_followers: number | null
          num_following: number | null
          num_likes: number | null
          num_tweets: number | null
          username: string
        }
        Insert: {
          account_display_name: string
          account_id: string
          created_at: string
          created_via: string
          num_followers?: number | null
          num_following?: number | null
          num_likes?: number | null
          num_tweets?: number | null
          username: string
        }
        Update: {
          account_display_name?: string
          account_id?: string
          created_at?: string
          created_via?: string
          num_followers?: number | null
          num_following?: number | null
          num_likes?: number | null
          num_tweets?: number | null
          username?: string
        }
        Relationships: []
      }
      account_1378862677871751174: {
        Row: {
          account_display_name: string
          account_id: string
          created_at: string
          created_via: string
          num_followers: number | null
          num_following: number | null
          num_likes: number | null
          num_tweets: number | null
          username: string
        }
        Insert: {
          account_display_name: string
          account_id: string
          created_at: string
          created_via: string
          num_followers?: number | null
          num_following?: number | null
          num_likes?: number | null
          num_tweets?: number | null
          username: string
        }
        Update: {
          account_display_name?: string
          account_id?: string
          created_at?: string
          created_via?: string
          num_followers?: number | null
          num_following?: number | null
          num_likes?: number | null
          num_tweets?: number | null
          username?: string
        }
        Relationships: []
      }
      account_316970336: {
        Row: {
          account_display_name: string
          account_id: string
          created_at: string
          created_via: string
          num_followers: number | null
          num_following: number | null
          num_likes: number | null
          num_tweets: number | null
          username: string
        }
        Insert: {
          account_display_name: string
          account_id: string
          created_at: string
          created_via: string
          num_followers?: number | null
          num_following?: number | null
          num_likes?: number | null
          num_tweets?: number | null
          username: string
        }
        Update: {
          account_display_name?: string
          account_id?: string
          created_at?: string
          created_via?: string
          num_followers?: number | null
          num_following?: number | null
          num_likes?: number | null
          num_tweets?: number | null
          username?: string
        }
        Relationships: []
      }
      archive_upload_1038586640: {
        Row: {
          account_id: string
          archive_at: string
          created_at: string | null
          id: number
        }
        Insert: {
          account_id: string
          archive_at: string
          created_at?: string | null
          id?: never
        }
        Update: {
          account_id?: string
          archive_at?: string
          created_at?: string | null
          id?: never
        }
        Relationships: []
      }
      archive_upload_1378862677871751174: {
        Row: {
          account_id: string
          archive_at: string
          created_at: string | null
          id: number
        }
        Insert: {
          account_id: string
          archive_at: string
          created_at?: string | null
          id?: never
        }
        Update: {
          account_id?: string
          archive_at?: string
          created_at?: string | null
          id?: never
        }
        Relationships: []
      }
      archive_upload_316970336: {
        Row: {
          account_id: string
          archive_at: string
          created_at: string | null
          id: number
        }
        Insert: {
          account_id: string
          archive_at: string
          created_at?: string | null
          id?: never
        }
        Update: {
          account_id?: string
          archive_at?: string
          created_at?: string | null
          id?: never
        }
        Relationships: []
      }
      followers_1038586640: {
        Row: {
          account_id: string
          archive_upload_id: number
          follower_account_id: string
          id: number
        }
        Insert: {
          account_id: string
          archive_upload_id: number
          follower_account_id: string
          id?: never
        }
        Update: {
          account_id?: string
          archive_upload_id?: number
          follower_account_id?: string
          id?: never
        }
        Relationships: []
      }
      followers_1211134623285047297: {
        Row: {
          account_id: string
          archive_upload_id: number
          follower_account_id: string
          id: number
        }
        Insert: {
          account_id: string
          archive_upload_id: number
          follower_account_id: string
          id?: never
        }
        Update: {
          account_id?: string
          archive_upload_id?: number
          follower_account_id?: string
          id?: never
        }
        Relationships: []
      }
      followers_1378862677871751174: {
        Row: {
          account_id: string
          archive_upload_id: number
          follower_account_id: string
          id: number
        }
        Insert: {
          account_id: string
          archive_upload_id: number
          follower_account_id: string
          id?: never
        }
        Update: {
          account_id?: string
          archive_upload_id?: number
          follower_account_id?: string
          id?: never
        }
        Relationships: []
      }
      followers_316970336: {
        Row: {
          account_id: string
          archive_upload_id: number
          follower_account_id: string
          id: number
        }
        Insert: {
          account_id: string
          archive_upload_id: number
          follower_account_id: string
          id?: never
        }
        Update: {
          account_id?: string
          archive_upload_id?: number
          follower_account_id?: string
          id?: never
        }
        Relationships: []
      }
      following_1038586640: {
        Row: {
          account_id: string
          archive_upload_id: number
          following_account_id: string
          id: number
        }
        Insert: {
          account_id: string
          archive_upload_id: number
          following_account_id: string
          id?: never
        }
        Update: {
          account_id?: string
          archive_upload_id?: number
          following_account_id?: string
          id?: never
        }
        Relationships: []
      }
      following_1211134623285047297: {
        Row: {
          account_id: string
          archive_upload_id: number
          following_account_id: string
          id: number
        }
        Insert: {
          account_id: string
          archive_upload_id: number
          following_account_id: string
          id?: never
        }
        Update: {
          account_id?: string
          archive_upload_id?: number
          following_account_id?: string
          id?: never
        }
        Relationships: []
      }
      following_1378862677871751174: {
        Row: {
          account_id: string
          archive_upload_id: number
          following_account_id: string
          id: number
        }
        Insert: {
          account_id: string
          archive_upload_id: number
          following_account_id: string
          id?: never
        }
        Update: {
          account_id?: string
          archive_upload_id?: number
          following_account_id?: string
          id?: never
        }
        Relationships: []
      }
      following_316970336: {
        Row: {
          account_id: string
          archive_upload_id: number
          following_account_id: string
          id: number
        }
        Insert: {
          account_id: string
          archive_upload_id: number
          following_account_id: string
          id?: never
        }
        Update: {
          account_id?: string
          archive_upload_id?: number
          following_account_id?: string
          id?: never
        }
        Relationships: []
      }
      liked_tweets_1038586640: {
        Row: {
          full_text: string
          tweet_id: string
        }
        Insert: {
          full_text: string
          tweet_id: string
        }
        Update: {
          full_text?: string
          tweet_id?: string
        }
        Relationships: []
      }
      liked_tweets_1211134623285047297: {
        Row: {
          full_text: string
          tweet_id: string
        }
        Insert: {
          full_text: string
          tweet_id: string
        }
        Update: {
          full_text?: string
          tweet_id?: string
        }
        Relationships: []
      }
      liked_tweets_1378862677871751174: {
        Row: {
          full_text: string
          tweet_id: string
        }
        Insert: {
          full_text: string
          tweet_id: string
        }
        Update: {
          full_text?: string
          tweet_id?: string
        }
        Relationships: []
      }
      liked_tweets_316970336: {
        Row: {
          full_text: string
          tweet_id: string
        }
        Insert: {
          full_text: string
          tweet_id: string
        }
        Update: {
          full_text?: string
          tweet_id?: string
        }
        Relationships: []
      }
      likes_1038586640: {
        Row: {
          account_id: string
          archive_upload_id: number
          id: number
          liked_tweet_id: string
        }
        Insert: {
          account_id: string
          archive_upload_id: number
          id?: never
          liked_tweet_id: string
        }
        Update: {
          account_id?: string
          archive_upload_id?: number
          id?: never
          liked_tweet_id?: string
        }
        Relationships: []
      }
      likes_1211134623285047297: {
        Row: {
          account_id: string
          archive_upload_id: number
          id: number
          liked_tweet_id: string
        }
        Insert: {
          account_id: string
          archive_upload_id: number
          id?: never
          liked_tweet_id: string
        }
        Update: {
          account_id?: string
          archive_upload_id?: number
          id?: never
          liked_tweet_id?: string
        }
        Relationships: []
      }
      likes_1378862677871751174: {
        Row: {
          account_id: string
          archive_upload_id: number
          id: number
          liked_tweet_id: string
        }
        Insert: {
          account_id: string
          archive_upload_id: number
          id?: never
          liked_tweet_id: string
        }
        Update: {
          account_id?: string
          archive_upload_id?: number
          id?: never
          liked_tweet_id?: string
        }
        Relationships: []
      }
      likes_316970336: {
        Row: {
          account_id: string
          archive_upload_id: number
          id: number
          liked_tweet_id: string
        }
        Insert: {
          account_id: string
          archive_upload_id: number
          id?: never
          liked_tweet_id: string
        }
        Update: {
          account_id?: string
          archive_upload_id?: number
          id?: never
          liked_tweet_id?: string
        }
        Relationships: []
      }
      mentioned_users_1038586640: {
        Row: {
          name: string
          screen_name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          name: string
          screen_name: string
          updated_at: string
          user_id: string
        }
        Update: {
          name?: string
          screen_name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      mentioned_users_1211134623285047297: {
        Row: {
          name: string
          screen_name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          name: string
          screen_name: string
          updated_at: string
          user_id: string
        }
        Update: {
          name?: string
          screen_name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      mentioned_users_1378862677871751174: {
        Row: {
          name: string
          screen_name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          name: string
          screen_name: string
          updated_at: string
          user_id: string
        }
        Update: {
          name?: string
          screen_name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      mentioned_users_316970336: {
        Row: {
          name: string
          screen_name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          name: string
          screen_name: string
          updated_at: string
          user_id: string
        }
        Update: {
          name?: string
          screen_name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profile_1038586640: {
        Row: {
          account_id: string
          archive_upload_id: number
          avatar_media_url: string | null
          bio: string | null
          header_media_url: string | null
          id: number
          location: string | null
          website: string | null
        }
        Insert: {
          account_id: string
          archive_upload_id: number
          avatar_media_url?: string | null
          bio?: string | null
          header_media_url?: string | null
          id?: never
          location?: string | null
          website?: string | null
        }
        Update: {
          account_id?: string
          archive_upload_id?: number
          avatar_media_url?: string | null
          bio?: string | null
          header_media_url?: string | null
          id?: never
          location?: string | null
          website?: string | null
        }
        Relationships: []
      }
      profile_1211134623285047297: {
        Row: {
          account_id: string
          archive_upload_id: number
          avatar_media_url: string | null
          bio: string | null
          header_media_url: string | null
          id: number
          location: string | null
          website: string | null
        }
        Insert: {
          account_id: string
          archive_upload_id: number
          avatar_media_url?: string | null
          bio?: string | null
          header_media_url?: string | null
          id?: never
          location?: string | null
          website?: string | null
        }
        Update: {
          account_id?: string
          archive_upload_id?: number
          avatar_media_url?: string | null
          bio?: string | null
          header_media_url?: string | null
          id?: never
          location?: string | null
          website?: string | null
        }
        Relationships: []
      }
      profile_1378862677871751174: {
        Row: {
          account_id: string
          archive_upload_id: number
          avatar_media_url: string | null
          bio: string | null
          header_media_url: string | null
          id: number
          location: string | null
          website: string | null
        }
        Insert: {
          account_id: string
          archive_upload_id: number
          avatar_media_url?: string | null
          bio?: string | null
          header_media_url?: string | null
          id?: never
          location?: string | null
          website?: string | null
        }
        Update: {
          account_id?: string
          archive_upload_id?: number
          avatar_media_url?: string | null
          bio?: string | null
          header_media_url?: string | null
          id?: never
          location?: string | null
          website?: string | null
        }
        Relationships: []
      }
      profile_316970336: {
        Row: {
          account_id: string
          archive_upload_id: number
          avatar_media_url: string | null
          bio: string | null
          header_media_url: string | null
          id: number
          location: string | null
          website: string | null
        }
        Insert: {
          account_id: string
          archive_upload_id: number
          avatar_media_url?: string | null
          bio?: string | null
          header_media_url?: string | null
          id?: never
          location?: string | null
          website?: string | null
        }
        Update: {
          account_id?: string
          archive_upload_id?: number
          avatar_media_url?: string | null
          bio?: string | null
          header_media_url?: string | null
          id?: never
          location?: string | null
          website?: string | null
        }
        Relationships: []
      }
      tweet_media_1038586640: {
        Row: {
          archive_upload_id: number
          height: number
          media_id: number
          media_type: string
          media_url: string
          tweet_id: string
          width: number
        }
        Insert: {
          archive_upload_id: number
          height: number
          media_id: number
          media_type: string
          media_url: string
          tweet_id: string
          width: number
        }
        Update: {
          archive_upload_id?: number
          height?: number
          media_id?: number
          media_type?: string
          media_url?: string
          tweet_id?: string
          width?: number
        }
        Relationships: []
      }
      tweet_media_1211134623285047297: {
        Row: {
          archive_upload_id: number
          height: number
          media_id: number
          media_type: string
          media_url: string
          tweet_id: string
          width: number
        }
        Insert: {
          archive_upload_id: number
          height: number
          media_id: number
          media_type: string
          media_url: string
          tweet_id: string
          width: number
        }
        Update: {
          archive_upload_id?: number
          height?: number
          media_id?: number
          media_type?: string
          media_url?: string
          tweet_id?: string
          width?: number
        }
        Relationships: []
      }
      tweet_media_1378862677871751174: {
        Row: {
          archive_upload_id: number
          height: number
          media_id: number
          media_type: string
          media_url: string
          tweet_id: string
          width: number
        }
        Insert: {
          archive_upload_id: number
          height: number
          media_id: number
          media_type: string
          media_url: string
          tweet_id: string
          width: number
        }
        Update: {
          archive_upload_id?: number
          height?: number
          media_id?: number
          media_type?: string
          media_url?: string
          tweet_id?: string
          width?: number
        }
        Relationships: []
      }
      tweet_media_316970336: {
        Row: {
          archive_upload_id: number
          height: number
          media_id: number
          media_type: string
          media_url: string
          tweet_id: string
          width: number
        }
        Insert: {
          archive_upload_id: number
          height: number
          media_id: number
          media_type: string
          media_url: string
          tweet_id: string
          width: number
        }
        Update: {
          archive_upload_id?: number
          height?: number
          media_id?: number
          media_type?: string
          media_url?: string
          tweet_id?: string
          width?: number
        }
        Relationships: []
      }
      tweet_urls_1038586640: {
        Row: {
          display_url: string
          expanded_url: string
          id: number
          tweet_id: string
          url: string
        }
        Insert: {
          display_url: string
          expanded_url: string
          id?: never
          tweet_id: string
          url: string
        }
        Update: {
          display_url?: string
          expanded_url?: string
          id?: never
          tweet_id?: string
          url?: string
        }
        Relationships: []
      }
      tweet_urls_1211134623285047297: {
        Row: {
          display_url: string
          expanded_url: string
          id: number
          tweet_id: string
          url: string
        }
        Insert: {
          display_url: string
          expanded_url: string
          id?: never
          tweet_id: string
          url: string
        }
        Update: {
          display_url?: string
          expanded_url?: string
          id?: never
          tweet_id?: string
          url?: string
        }
        Relationships: []
      }
      tweet_urls_1378862677871751174: {
        Row: {
          display_url: string
          expanded_url: string
          id: number
          tweet_id: string
          url: string
        }
        Insert: {
          display_url: string
          expanded_url: string
          id?: never
          tweet_id: string
          url: string
        }
        Update: {
          display_url?: string
          expanded_url?: string
          id?: never
          tweet_id?: string
          url?: string
        }
        Relationships: []
      }
      tweet_urls_316970336: {
        Row: {
          display_url: string
          expanded_url: string
          id: number
          tweet_id: string
          url: string
        }
        Insert: {
          display_url: string
          expanded_url: string
          id?: never
          tweet_id: string
          url: string
        }
        Update: {
          display_url?: string
          expanded_url?: string
          id?: never
          tweet_id?: string
          url?: string
        }
        Relationships: []
      }
      tweets_1038586640: {
        Row: {
          account_id: string
          archive_upload_id: number
          created_at: string
          favorite_count: number
          fts: unknown | null
          full_text: string
          reply_to_tweet_id: string | null
          reply_to_user_id: string | null
          reply_to_username: string | null
          retweet_count: number
          tweet_id: string
        }
        Insert: {
          account_id: string
          archive_upload_id: number
          created_at: string
          favorite_count: number
          fts?: unknown | null
          full_text: string
          reply_to_tweet_id?: string | null
          reply_to_user_id?: string | null
          reply_to_username?: string | null
          retweet_count: number
          tweet_id: string
        }
        Update: {
          account_id?: string
          archive_upload_id?: number
          created_at?: string
          favorite_count?: number
          fts?: unknown | null
          full_text?: string
          reply_to_tweet_id?: string | null
          reply_to_user_id?: string | null
          reply_to_username?: string | null
          retweet_count?: number
          tweet_id?: string
        }
        Relationships: []
      }
      tweets_1211134623285047297: {
        Row: {
          account_id: string
          archive_upload_id: number
          created_at: string
          favorite_count: number
          fts: unknown | null
          full_text: string
          reply_to_tweet_id: string | null
          reply_to_user_id: string | null
          reply_to_username: string | null
          retweet_count: number
          tweet_id: string
        }
        Insert: {
          account_id: string
          archive_upload_id: number
          created_at: string
          favorite_count: number
          fts?: unknown | null
          full_text: string
          reply_to_tweet_id?: string | null
          reply_to_user_id?: string | null
          reply_to_username?: string | null
          retweet_count: number
          tweet_id: string
        }
        Update: {
          account_id?: string
          archive_upload_id?: number
          created_at?: string
          favorite_count?: number
          fts?: unknown | null
          full_text?: string
          reply_to_tweet_id?: string | null
          reply_to_user_id?: string | null
          reply_to_username?: string | null
          retweet_count?: number
          tweet_id?: string
        }
        Relationships: []
      }
      tweets_1378862677871751174: {
        Row: {
          account_id: string
          archive_upload_id: number
          created_at: string
          favorite_count: number
          fts: unknown | null
          full_text: string
          reply_to_tweet_id: string | null
          reply_to_user_id: string | null
          reply_to_username: string | null
          retweet_count: number
          tweet_id: string
        }
        Insert: {
          account_id: string
          archive_upload_id: number
          created_at: string
          favorite_count: number
          fts?: unknown | null
          full_text: string
          reply_to_tweet_id?: string | null
          reply_to_user_id?: string | null
          reply_to_username?: string | null
          retweet_count: number
          tweet_id: string
        }
        Update: {
          account_id?: string
          archive_upload_id?: number
          created_at?: string
          favorite_count?: number
          fts?: unknown | null
          full_text?: string
          reply_to_tweet_id?: string | null
          reply_to_user_id?: string | null
          reply_to_username?: string | null
          retweet_count?: number
          tweet_id?: string
        }
        Relationships: []
      }
      tweets_316970336: {
        Row: {
          account_id: string
          archive_upload_id: number
          created_at: string
          favorite_count: number
          fts: unknown | null
          full_text: string
          reply_to_tweet_id: string | null
          reply_to_user_id: string | null
          reply_to_username: string | null
          retweet_count: number
          tweet_id: string
        }
        Insert: {
          account_id: string
          archive_upload_id: number
          created_at: string
          favorite_count: number
          fts?: unknown | null
          full_text: string
          reply_to_tweet_id?: string | null
          reply_to_user_id?: string | null
          reply_to_username?: string | null
          retweet_count: number
          tweet_id: string
        }
        Update: {
          account_id?: string
          archive_upload_id?: number
          created_at?: string
          favorite_count?: number
          fts?: unknown | null
          full_text?: string
          reply_to_tweet_id?: string | null
          reply_to_user_id?: string | null
          reply_to_username?: string | null
          retweet_count?: number
          tweet_id?: string
        }
        Relationships: []
      }
      user_mentions_1038586640: {
        Row: {
          id: number
          mentioned_user_id: string
          tweet_id: string
        }
        Insert: {
          id?: never
          mentioned_user_id: string
          tweet_id: string
        }
        Update: {
          id?: never
          mentioned_user_id?: string
          tweet_id?: string
        }
        Relationships: []
      }
      user_mentions_1211134623285047297: {
        Row: {
          id: number
          mentioned_user_id: string
          tweet_id: string
        }
        Insert: {
          id?: never
          mentioned_user_id: string
          tweet_id: string
        }
        Update: {
          id?: never
          mentioned_user_id?: string
          tweet_id?: string
        }
        Relationships: []
      }
      user_mentions_1378862677871751174: {
        Row: {
          id: number
          mentioned_user_id: string
          tweet_id: string
        }
        Insert: {
          id?: never
          mentioned_user_id: string
          tweet_id: string
        }
        Update: {
          id?: never
          mentioned_user_id?: string
          tweet_id?: string
        }
        Relationships: []
      }
      user_mentions_316970336: {
        Row: {
          id: number
          mentioned_user_id: string
          tweet_id: string
        }
        Insert: {
          id?: never
          mentioned_user_id: string
          tweet_id: string
        }
        Update: {
          id?: never
          mentioned_user_id?: string
          tweet_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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

