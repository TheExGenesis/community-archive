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
    PostgrestVersion: "12.2.2 (db9da0b)"
  }
  dev: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      apply_dev_entities_rls_policies: {
        Args: { schema_name: string; table_name: string }
        Returns: undefined
      }
      apply_dev_liked_tweets_rls_policies: {
        Args: { schema_name: string; table_name: string }
        Returns: undefined
      }
      apply_dev_rls_policies: {
        Args: { schema_name: string; table_name: string }
        Returns: undefined
      }
      commit_temp_data: {
        Args: { p_suffix: string }
        Returns: undefined
      }
      create_temp_tables: {
        Args: { p_suffix: string }
        Returns: undefined
      }
      delete_all_archives: {
        Args: { p_account_id: string }
        Returns: undefined
      }
      drop_function_if_exists: {
        Args: { function_args: string[]; function_name: string }
        Returns: undefined
      }
      drop_temp_tables: {
        Args: { p_suffix: string }
        Returns: undefined
      }
      get_top_accounts_with_followers: {
        Args: { limit_count: number }
        Returns: {
          account_display_name: string
          account_id: string
          avatar_media_url: string
          bio: string
          created_at: string
          created_via: string
          follower_count: number
          header_media_url: string
          location: string
          username: string
          website: string
        }[]
      }
      insert_temp_account: {
        Args: { p_account: Json; p_suffix: string }
        Returns: undefined
      }
      insert_temp_archive_upload: {
        Args: { p_account_id: string; p_archive_at: string; p_suffix: string }
        Returns: number
      }
      insert_temp_followers: {
        Args: { p_account_id: string; p_followers: Json; p_suffix: string }
        Returns: undefined
      }
      insert_temp_following: {
        Args: { p_account_id: string; p_following: Json; p_suffix: string }
        Returns: undefined
      }
      insert_temp_likes: {
        Args: { p_account_id: string; p_likes: Json; p_suffix: string }
        Returns: undefined
      }
      insert_temp_profiles: {
        Args: { p_account_id: string; p_profile: Json; p_suffix: string }
        Returns: undefined
      }
      insert_temp_tweets: {
        Args: { p_suffix: string; p_tweets: Json }
        Returns: undefined
      }
      process_and_insert_tweet_entities: {
        Args: { p_suffix: string; p_tweets: Json }
        Returns: undefined
      }
      process_archive: {
        Args: { archive_data: Json }
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
      all_account: {
        Row: {
          account_display_name: string
          account_id: string
          created_at: string
          created_via: string
          num_followers: number | null
          num_following: number | null
          num_likes: number | null
          num_tweets: number | null
          updated_at: string | null
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
          updated_at?: string | null
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
          updated_at?: string | null
          username?: string
        }
        Relationships: []
      }
      all_profile: {
        Row: {
          account_id: string
          archive_upload_id: number | null
          avatar_media_url: string | null
          bio: string | null
          header_media_url: string | null
          location: string | null
          updated_at: string | null
          website: string | null
        }
        Insert: {
          account_id: string
          archive_upload_id?: number | null
          avatar_media_url?: string | null
          bio?: string | null
          header_media_url?: string | null
          location?: string | null
          updated_at?: string | null
          website?: string | null
        }
        Update: {
          account_id?: string
          archive_upload_id?: number | null
          avatar_media_url?: string | null
          bio?: string | null
          header_media_url?: string | null
          location?: string | null
          updated_at?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "all_profile_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: true
            referencedRelation: "account"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "all_profile_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: true
            referencedRelation: "account_activity_summary"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "all_profile_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: true
            referencedRelation: "all_account"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "all_profile_archive_upload_id_fkey"
            columns: ["archive_upload_id"]
            isOneToOne: false
            referencedRelation: "archive_upload"
            referencedColumns: ["id"]
          },
        ]
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
          {
            foreignKeyName: "archive_upload_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "all_account"
            referencedColumns: ["account_id"]
          },
        ]
      }
      conversations: {
        Row: {
          conversation_id: string | null
          tweet_id: string
        }
        Insert: {
          conversation_id?: string | null
          tweet_id: string
        }
        Update: {
          conversation_id?: string | null
          tweet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_tweet_id_fkey"
            columns: ["tweet_id"]
            isOneToOne: true
            referencedRelation: "enriched_tweets"
            referencedColumns: ["tweet_id"]
          },
          {
            foreignKeyName: "conversations_tweet_id_fkey"
            columns: ["tweet_id"]
            isOneToOne: true
            referencedRelation: "quote_tweets"
            referencedColumns: ["tweet_id"]
          },
          {
            foreignKeyName: "conversations_tweet_id_fkey"
            columns: ["tweet_id"]
            isOneToOne: true
            referencedRelation: "tweets"
            referencedColumns: ["tweet_id"]
          },
          {
            foreignKeyName: "conversations_tweet_id_fkey"
            columns: ["tweet_id"]
            isOneToOne: true
            referencedRelation: "tweets_w_conversation_id"
            referencedColumns: ["tweet_id"]
          },
        ]
      }
      followers: {
        Row: {
          account_id: string
          archive_upload_id: number | null
          follower_account_id: string
          id: number
          updated_at: string | null
        }
        Insert: {
          account_id: string
          archive_upload_id?: number | null
          follower_account_id: string
          id?: never
          updated_at?: string | null
        }
        Update: {
          account_id?: string
          archive_upload_id?: number | null
          follower_account_id?: string
          id?: never
          updated_at?: string | null
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
            foreignKeyName: "followers_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "all_account"
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
          archive_upload_id: number | null
          following_account_id: string
          id: number
          updated_at: string | null
        }
        Insert: {
          account_id: string
          archive_upload_id?: number | null
          following_account_id: string
          id?: never
          updated_at?: string | null
        }
        Update: {
          account_id?: string
          archive_upload_id?: number | null
          following_account_id?: string
          id?: never
          updated_at?: string | null
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
            foreignKeyName: "following_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "all_account"
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
          fts: unknown | null
          full_text: string
          tweet_id: string
        }
        Insert: {
          fts?: unknown | null
          full_text: string
          tweet_id: string
        }
        Update: {
          fts?: unknown | null
          full_text?: string
          tweet_id?: string
        }
        Relationships: []
      }
      likes: {
        Row: {
          account_id: string
          archive_upload_id: number | null
          id: number
          liked_tweet_id: string
          updated_at: string | null
        }
        Insert: {
          account_id: string
          archive_upload_id?: number | null
          id?: never
          liked_tweet_id: string
          updated_at?: string | null
        }
        Update: {
          account_id?: string
          archive_upload_id?: number | null
          id?: never
          liked_tweet_id?: string
          updated_at?: string | null
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
            foreignKeyName: "likes_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "all_account"
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
          updated_at?: string
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
      optin: {
        Row: {
          created_at: string | null
          id: string
          opted_in: boolean
          opted_in_at: string | null
          opted_out_at: string | null
          terms_version: string
          twitter_user_id: string | null
          updated_at: string | null
          user_id: string
          username: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          opted_in?: boolean
          opted_in_at?: string | null
          opted_out_at?: string | null
          terms_version?: string
          twitter_user_id?: string | null
          updated_at?: string | null
          user_id: string
          username: string
        }
        Update: {
          created_at?: string | null
          id?: string
          opted_in?: boolean
          opted_in_at?: string | null
          opted_out_at?: string | null
          terms_version?: string
          twitter_user_id?: string | null
          updated_at?: string | null
          user_id?: string
          username?: string
        }
        Relationships: []
      }
      scraper_count: {
        Row: {
          count: number | null
        }
        Insert: {
          count?: number | null
        }
        Update: {
          count?: number | null
        }
        Relationships: []
      }
      tweet_media: {
        Row: {
          archive_upload_id: number | null
          height: number
          media_id: number
          media_type: string
          media_url: string
          tweet_id: string
          updated_at: string | null
          width: number
        }
        Insert: {
          archive_upload_id?: number | null
          height: number
          media_id: number
          media_type: string
          media_url: string
          tweet_id: string
          updated_at?: string | null
          width: number
        }
        Update: {
          archive_upload_id?: number | null
          height?: number
          media_id?: number
          media_type?: string
          media_url?: string
          tweet_id?: string
          updated_at?: string | null
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
            referencedRelation: "enriched_tweets"
            referencedColumns: ["tweet_id"]
          },
          {
            foreignKeyName: "tweet_media_tweet_id_fkey"
            columns: ["tweet_id"]
            isOneToOne: false
            referencedRelation: "quote_tweets"
            referencedColumns: ["tweet_id"]
          },
          {
            foreignKeyName: "tweet_media_tweet_id_fkey"
            columns: ["tweet_id"]
            isOneToOne: false
            referencedRelation: "tweets"
            referencedColumns: ["tweet_id"]
          },
          {
            foreignKeyName: "tweet_media_tweet_id_fkey"
            columns: ["tweet_id"]
            isOneToOne: false
            referencedRelation: "tweets_w_conversation_id"
            referencedColumns: ["tweet_id"]
          },
        ]
      }
      tweet_urls: {
        Row: {
          display_url: string
          expanded_url: string | null
          id: number
          tweet_id: string
          updated_at: string | null
          url: string
        }
        Insert: {
          display_url: string
          expanded_url?: string | null
          id?: never
          tweet_id: string
          updated_at?: string | null
          url: string
        }
        Update: {
          display_url?: string
          expanded_url?: string | null
          id?: never
          tweet_id?: string
          updated_at?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "tweet_urls_tweet_id_fkey"
            columns: ["tweet_id"]
            isOneToOne: false
            referencedRelation: "enriched_tweets"
            referencedColumns: ["tweet_id"]
          },
          {
            foreignKeyName: "tweet_urls_tweet_id_fkey"
            columns: ["tweet_id"]
            isOneToOne: false
            referencedRelation: "quote_tweets"
            referencedColumns: ["tweet_id"]
          },
          {
            foreignKeyName: "tweet_urls_tweet_id_fkey"
            columns: ["tweet_id"]
            isOneToOne: false
            referencedRelation: "tweets"
            referencedColumns: ["tweet_id"]
          },
          {
            foreignKeyName: "tweet_urls_tweet_id_fkey"
            columns: ["tweet_id"]
            isOneToOne: false
            referencedRelation: "tweets_w_conversation_id"
            referencedColumns: ["tweet_id"]
          },
        ]
      }
      tweets: {
        Row: {
          account_id: string
          archive_upload_id: number | null
          created_at: string
          favorite_count: number
          fts: unknown | null
          full_text: string
          reply_to_tweet_id: string | null
          reply_to_user_id: string | null
          reply_to_username: string | null
          retweet_count: number
          tweet_id: string
          updated_at: string | null
        }
        Insert: {
          account_id: string
          archive_upload_id?: number | null
          created_at: string
          favorite_count: number
          fts?: unknown | null
          full_text: string
          reply_to_tweet_id?: string | null
          reply_to_user_id?: string | null
          reply_to_username?: string | null
          retweet_count: number
          tweet_id: string
          updated_at?: string | null
        }
        Update: {
          account_id?: string
          archive_upload_id?: number | null
          created_at?: string
          favorite_count?: number
          fts?: unknown | null
          full_text?: string
          reply_to_tweet_id?: string | null
          reply_to_user_id?: string | null
          reply_to_username?: string | null
          retweet_count?: number
          tweet_id?: string
          updated_at?: string | null
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
            foreignKeyName: "tweets_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "all_account"
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
          updated_at: string | null
        }
        Insert: {
          id?: never
          mentioned_user_id: string
          tweet_id: string
          updated_at?: string | null
        }
        Update: {
          id?: never
          mentioned_user_id?: string
          tweet_id?: string
          updated_at?: string | null
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
            referencedRelation: "enriched_tweets"
            referencedColumns: ["tweet_id"]
          },
          {
            foreignKeyName: "user_mentions_tweet_id_fkey"
            columns: ["tweet_id"]
            isOneToOne: false
            referencedRelation: "quote_tweets"
            referencedColumns: ["tweet_id"]
          },
          {
            foreignKeyName: "user_mentions_tweet_id_fkey"
            columns: ["tweet_id"]
            isOneToOne: false
            referencedRelation: "tweets"
            referencedColumns: ["tweet_id"]
          },
          {
            foreignKeyName: "user_mentions_tweet_id_fkey"
            columns: ["tweet_id"]
            isOneToOne: false
            referencedRelation: "tweets_w_conversation_id"
            referencedColumns: ["tweet_id"]
          },
        ]
      }
    }
    Views: {
      account: {
        Row: {
          account_display_name: string | null
          account_id: string | null
          created_at: string | null
          created_via: string | null
          num_followers: number | null
          num_following: number | null
          num_likes: number | null
          num_tweets: number | null
          username: string | null
        }
        Relationships: []
      }
      account_activity_summary: {
        Row: {
          account_id: string | null
          last_updated: string | null
          mentioned_accounts: Json | null
          most_favorited_tweets: Json | null
          most_retweeted_tweets: Json | null
          num_followers: number | null
          num_tweets: number | null
          top_engaged_tweets: Json | null
          total_likes: number | null
          total_mentions: number | null
          username: string | null
        }
        Relationships: []
      }
      enriched_tweets: {
        Row: {
          account_display_name: string | null
          account_id: string | null
          archive_upload_id: number | null
          avatar_media_url: string | null
          conversation_id: string | null
          created_at: string | null
          favorite_count: number | null
          full_text: string | null
          quoted_tweet_id: string | null
          reply_to_tweet_id: string | null
          reply_to_user_id: string | null
          reply_to_username: string | null
          retweet_count: number | null
          tweet_id: string | null
          username: string | null
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
            foreignKeyName: "tweets_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "all_account"
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
      global_activity_summary: {
        Row: {
          last_updated: string | null
          top_accounts_with_followers: Json | null
          top_mentioned_users: Json | null
          total_accounts: number | null
          total_likes: number | null
          total_tweets: number | null
          total_user_mentions: number | null
        }
        Relationships: []
      }
      global_monthly_tweet_counts: {
        Row: {
          active_accounts: number | null
          avg_tweets_per_account: number | null
          month: string | null
          total_tweets: number | null
        }
        Relationships: []
      }
      monthly_tweet_counts_mv: {
        Row: {
          account_id: string | null
          avg_favorites: number | null
          avg_retweets: number | null
          days_active: number | null
          max_favorites: number | null
          max_retweets: number | null
          month: string | null
          tweet_count: number | null
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
            foreignKeyName: "tweets_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "all_account"
            referencedColumns: ["account_id"]
          },
        ]
      }
      profile: {
        Row: {
          account_id: string | null
          archive_upload_id: number | null
          avatar_media_url: string | null
          bio: string | null
          header_media_url: string | null
          location: string | null
          website: string | null
        }
        Relationships: [
          {
            foreignKeyName: "all_profile_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: true
            referencedRelation: "account"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "all_profile_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: true
            referencedRelation: "account_activity_summary"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "all_profile_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: true
            referencedRelation: "all_account"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "all_profile_archive_upload_id_fkey"
            columns: ["archive_upload_id"]
            isOneToOne: false
            referencedRelation: "archive_upload"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_tweets: {
        Row: {
          quoted_tweet_id: string | null
          quoted_tweet_username: string | null
          tweet_id: string | null
        }
        Relationships: []
      }
      tweet_replies_view: {
        Row: {
          reply_to_tweet_id: string | null
          reply_to_user_id: string | null
        }
        Insert: {
          reply_to_tweet_id?: string | null
          reply_to_user_id?: string | null
        }
        Update: {
          reply_to_tweet_id?: string | null
          reply_to_user_id?: string | null
        }
        Relationships: []
      }
      tweets_w_conversation_id: {
        Row: {
          account_id: string | null
          archive_upload_id: number | null
          conversation_id: string | null
          created_at: string | null
          favorite_count: number | null
          fts: unknown | null
          full_text: string | null
          reply_to_tweet_id: string | null
          reply_to_user_id: string | null
          reply_to_username: string | null
          retweet_count: number | null
          tweet_id: string | null
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
            foreignKeyName: "tweets_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "all_account"
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
    }
    Functions: {
      apply_public_entities_rls_policies: {
        Args: { schema_name: string; table_name: string }
        Returns: undefined
      }
      apply_public_liked_tweets_rls_policies: {
        Args: { schema_name: string; table_name: string }
        Returns: undefined
      }
      apply_public_rls_policies: {
        Args: { schema_name: string; table_name: string }
        Returns: undefined
      }
      apply_public_rls_policies_not_private: {
        Args: { schema_name: string; table_name: string }
        Returns: undefined
      }
      apply_readonly_rls_policies: {
        Args: { schema_name: string; table_name: string }
        Returns: undefined
      }
      commit_temp_data: {
        Args: { p_suffix: string }
        Returns: undefined
      }
      compute_hourly_scraping_stats: {
        Args: { p_end_date: string; p_start_date: string }
        Returns: {
          period_end: string
          period_start: string
          tweet_count: number
          unique_scrapers: number
        }[]
      }
      create_temp_tables: {
        Args: { p_suffix: string }
        Returns: undefined
      }
      delete_tweets: {
        Args: { p_tweet_ids: string[] }
        Returns: {
          deleted_conversations: number
          deleted_private_tweet_user: number
          deleted_tweet_media: number
          deleted_tweet_urls: number
          deleted_tweets: number
          deleted_user_mentions: number
        }[]
      }
      delete_user_archive: {
        Args: { p_account_id: string }
        Returns: undefined
      }
      drop_all_policies: {
        Args: { schema_name: string; table_name: string }
        Returns: undefined
      }
      drop_temp_tables: {
        Args: { p_suffix: string }
        Returns: undefined
      }
      get_account_most_liked_tweets_archive_users: {
        Args: { limit_?: number; username_: string }
        Returns: {
          account_id: string
          archive_upload_id: number
          created_at: string
          favorite_count: number
          full_text: string
          num_likes: number
          reply_to_tweet_id: string
          reply_to_user_id: string
          reply_to_username: string
          retweet_count: number
          tweet_id: string
        }[]
      }
      get_account_most_mentioned_accounts: {
        Args: { limit_: number; username_: string }
        Returns: {
          mention_count: number
          name: string
          screen_name: string
          user_id: string
        }[]
      }
      get_account_most_replied_tweets_by_archive_users: {
        Args: { limit_: number; username_: string }
        Returns: {
          account_id: string
          archive_upload_id: number
          created_at: string
          favorite_count: number
          full_text: string
          num_replies: number
          reply_to_tweet_id: string
          reply_to_user_id: string
          reply_to_username: string
          retweet_count: number
          tweet_id: string
        }[]
      }
      get_account_top_favorite_count_tweets: {
        Args: { limit_: number; username_: string }
        Returns: {
          account_id: string
          archive_upload_id: number
          created_at: string
          favorite_count: number
          full_text: string
          reply_to_tweet_id: string
          reply_to_user_id: string
          reply_to_username: string
          retweet_count: number
          tweet_id: string
        }[]
      }
      get_account_top_retweet_count_tweets: {
        Args: { limit_: number; username_: string }
        Returns: {
          account_id: string
          archive_upload_id: number
          created_at: string
          favorite_count: number
          full_text: string
          reply_to_tweet_id: string
          reply_to_user_id: string
          reply_to_username: string
          retweet_count: number
          tweet_id: string
        }[]
      }
      get_hourly_scraping_stats: {
        Args: { p_hours_back?: number }
        Returns: {
          period_end: string
          period_start: string
          tweet_count: number
          unique_scrapers: number
        }[]
      }
      get_hourly_stats_simple: {
        Args: { p_hours_back?: number }
        Returns: {
          period_start: string
          tweet_count: number
        }[]
      }
      get_latest_tweets: {
        Args: { count: number; p_account_id?: string }
        Returns: {
          account_display_name: string
          account_id: string
          avatar_media_url: string
          created_at: string
          favorite_count: number
          full_text: string
          reply_to_tweet_id: string
          retweet_count: number
          tweet_id: string
          username: string
        }[]
      }
      get_main_thread: {
        Args: { p_conversation_id: string }
        Returns: {
          account_id: string
          conversation_id: string
          depth: number
          favorite_count: number
          max_depth: number
          reply_to_tweet_id: string
          retweet_count: number
          tweet_id: string
        }[]
      }
      get_monthly_tweet_counts: {
        Args: Record<PropertyKey, never>
        Returns: {
          month: string
          tweet_count: number
        }[]
      }
      get_monthly_tweet_counts_fast: {
        Args: {
          p_account_id?: string
          p_end_date?: string
          p_start_date?: string
        }
        Returns: {
          account_id: string
          avg_favorites: number
          avg_retweets: number
          days_active: number
          month: string
          tweet_count: number
        }[]
      }
      get_most_liked_tweets_by_username: {
        Args: { username_: string }
        Returns: {
          full_text: string
          num_likes: number
          tweet_id: string
        }[]
      }
      get_most_mentioned_accounts_by_username: {
        Args: { username_: string }
        Returns: {
          mention_count: number
          mentioned_user_id: string
          mentioned_username: string
        }[]
      }
      get_scraper_counts_by_granularity: {
        Args: { end_date: string; granularity: string; start_date: string }
        Returns: {
          scraper_date: string
          unique_scrapers: number
        }[]
      }
      get_simple_streamed_tweet_counts: {
        Args: { end_date: string; granularity: string; start_date: string }
        Returns: {
          tweet_count: number
          tweet_date: string
        }[]
      }
      get_streaming_stats: {
        Args: {
          p_end_date: string
          p_granularity?: string
          p_start_date: string
          p_streamed_only?: boolean
        }
        Returns: {
          period_end: string
          period_start: string
          tweet_count: number
          unique_scrapers: number
        }[]
      }
      get_streaming_stats_daily: {
        Args: { p_end_date: string; p_start_date: string }
        Returns: {
          period_end: string
          period_start: string
          tweet_count: number
          unique_scrapers: number
        }[]
      }
      get_streaming_stats_daily_streamed_only: {
        Args: { p_end_date: string; p_start_date: string }
        Returns: {
          period_end: string
          period_start: string
          tweet_count: number
          unique_scrapers: number
        }[]
      }
      get_streaming_stats_hourly: {
        Args: { p_end_date: string; p_start_date: string }
        Returns: {
          period_end: string
          period_start: string
          tweet_count: number
          unique_scrapers: number
        }[]
      }
      get_streaming_stats_hourly_streamed_only: {
        Args: { p_end_date: string; p_start_date: string }
        Returns: {
          period_end: string
          period_start: string
          tweet_count: number
          unique_scrapers: number
        }[]
      }
      get_streaming_stats_weekly: {
        Args: { p_end_date: string; p_start_date: string }
        Returns: {
          period_end: string
          period_start: string
          tweet_count: number
          unique_scrapers: number
        }[]
      }
      get_streaming_stats_weekly_streamed_only: {
        Args: { p_end_date: string; p_start_date: string }
        Returns: {
          period_end: string
          period_start: string
          tweet_count: number
          unique_scrapers: number
        }[]
      }
      get_top_accounts_with_followers: {
        Args: { limit_count: number }
        Returns: {
          account_display_name: string
          account_id: string
          avatar_media_url: string
          bio: string
          created_at: string
          created_via: string
          header_media_url: string
          location: string
          num_followers: number
          num_tweets: number
          username: string
          website: string
        }[]
      }
      get_top_liked_users: {
        Args: Record<PropertyKey, never>
        Returns: {
          full_text: string
          like_count: number
          reply_to_tweet_id: string
          reply_to_user_id: string
          reply_to_username: string
          tweet_id: string
        }[]
      }
      get_top_mentioned_users: {
        Args: { limit_: number }
        Returns: {
          mention_count: number
          name: string
          screen_name: string
          user_id: string
        }[]
      }
      get_top_retweeted_tweets_by_username: {
        Args: { limit_: number; username_: string }
        Returns: {
          account_id: string
          archive_upload_id: number
          created_at: string
          favorite_count: number
          full_text: string
          reply_to_tweet_id: string
          reply_to_user_id: string
          reply_to_username: string
          retweet_count: number
          tweet_id: string
        }[]
      }
      get_trending_tweets: {
        Args: { hours_back?: number; limit_count?: number }
        Returns: {
          account_id: string
          created_at: string
          engagement_score: number
          favorite_count: number
          full_text: string
          retweet_count: number
          tweet_id: string
        }[]
      }
      get_tweet_count_by_date: {
        Args:
          | { end_date: string; granularity: string; start_date: string }
          | { end_date: string; start_date: string }
        Returns: {
          tweet_count: number
          tweet_date: string
        }[]
      }
      get_tweet_counts_by_granularity: {
        Args: { end_date: string; granularity: string; start_date: string }
        Returns: {
          tweet_count: number
          tweet_date: string
        }[]
      }
      get_unique_scraper_count: {
        Args: { end_date: string; start_date: string }
        Returns: number
      }
      gtrgm_compress: {
        Args: { "": unknown }
        Returns: unknown
      }
      gtrgm_decompress: {
        Args: { "": unknown }
        Returns: unknown
      }
      gtrgm_in: {
        Args: { "": unknown }
        Returns: unknown
      }
      gtrgm_options: {
        Args: { "": unknown }
        Returns: undefined
      }
      gtrgm_out: {
        Args: { "": unknown }
        Returns: unknown
      }
      insert_temp_account: {
        Args: { p_account: Json; p_suffix: string }
        Returns: undefined
      }
      insert_temp_archive_upload: {
        Args: {
          p_account_id: string
          p_archive_at: string
          p_end_date: string
          p_keep_private: boolean
          p_start_date: string
          p_suffix: string
          p_upload_likes: boolean
        }
        Returns: number
      }
      insert_temp_followers: {
        Args: { p_account_id: string; p_followers: Json; p_suffix: string }
        Returns: undefined
      }
      insert_temp_following: {
        Args: { p_account_id: string; p_following: Json; p_suffix: string }
        Returns: undefined
      }
      insert_temp_likes: {
        Args: { p_account_id: string; p_likes: Json; p_suffix: string }
        Returns: undefined
      }
      insert_temp_profiles: {
        Args: { p_account_id: string; p_profile: Json; p_suffix: string }
        Returns: undefined
      }
      insert_temp_tweets: {
        Args: { p_suffix: string; p_tweets: Json }
        Returns: undefined
      }
      process_and_insert_tweet_entities: {
        Args: { p_suffix: string; p_tweets: Json }
        Returns: undefined
      }
      process_archive: {
        Args: { archive_data: Json }
        Returns: undefined
      }
      search_tweets: {
        Args:
          | {
              account_filter?: string
              date_from?: string
              date_to?: string
              limit_count?: number
              search_query: string
            }
          | {
              from_user?: string
              limit_?: number
              offset_?: number
              search_query: string
              since_date?: string
              to_user?: string
              until_date?: string
            }
        Returns: {
          account_display_name: string
          account_id: string
          archive_upload_id: number
          avatar_media_url: string
          created_at: string
          favorite_count: number
          full_text: string
          media: Json
          reply_to_tweet_id: string
          retweet_count: number
          tweet_id: string
          username: string
        }[]
      }
      set_limit: {
        Args: { "": number }
        Returns: number
      }
      show_limit: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      show_trgm: {
        Args: { "": string }
        Returns: string[]
      }
      update_foreign_keys: {
        Args: {
          new_table_name: string
          old_table_name: string
          schema_name: string
        }
        Returns: undefined
      }
      word_occurrences: {
        Args: {
          end_date?: string
          search_word: string
          start_date?: string
          user_ids?: string[]
        }
        Returns: {
          month: string
          word_count: number
        }[]
      }
    }
    Enums: {
      upload_phase_enum:
        | "uploading"
        | "ready_for_commit"
        | "committing"
        | "completed"
        | "failed"
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
  dev: {
    Enums: {},
  },
  public: {
    Enums: {
      upload_phase_enum: [
        "uploading",
        "ready_for_commit",
        "committing",
        "completed",
        "failed",
      ],
    },
  },
} as const
