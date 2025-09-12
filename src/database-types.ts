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
  public: {
    Tables: {
      account_result: {
        Row: {
          errors: string[] | null
          processed: number | null
        }
        Insert: {
          errors?: string[] | null
          processed?: number | null
        }
        Update: {
          errors?: string[] | null
          processed?: number | null
        }
        Relationships: []
      }
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
      media_result: {
        Row: {
          errors: string[] | null
          processed: number | null
        }
        Insert: {
          errors?: string[] | null
          processed?: number | null
        }
        Update: {
          errors?: string[] | null
          processed?: number | null
        }
        Relationships: []
      }
      mention_result: {
        Row: {
          errors: string[] | null
          processed: number | null
        }
        Insert: {
          errors?: string[] | null
          processed?: number | null
        }
        Update: {
          errors?: string[] | null
          processed?: number | null
        }
        Relationships: []
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
      no_show: {
        Row: {
          created_at: string | null
          tweet_id: string | null
        }
        Insert: {
          created_at?: string | null
          tweet_id?: string | null
        }
        Update: {
          created_at?: string | null
          tweet_id?: string | null
        }
        Relationships: []
      }
      processed_records_history: {
        Row: {
          date: string
          processed_at: string | null
          record_count: number
          record_type: string
          user_id: string
        }
        Insert: {
          date: string
          processed_at?: string | null
          record_count: number
          record_type: string
          user_id: string
        }
        Update: {
          date?: string
          processed_at?: string | null
          record_count?: number
          record_type?: string
          user_id?: string
        }
        Relationships: []
      }
      profile_result: {
        Row: {
          errors: string[] | null
          processed: number | null
        }
        Insert: {
          errors?: string[] | null
          processed?: number | null
        }
        Update: {
          errors?: string[] | null
          processed?: number | null
        }
        Relationships: []
      }
      quote_tweets: {
        Row: {
          quoted_tweet_id: string
          tweet_id: string
        }
        Insert: {
          quoted_tweet_id: string
          tweet_id: string
        }
        Update: {
          quoted_tweet_id?: string
          tweet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_quote_tweets_tweet_id"
            columns: ["tweet_id"]
            isOneToOne: false
            referencedRelation: "enriched_tweets"
            referencedColumns: ["tweet_id"]
          },
          {
            foreignKeyName: "fk_quote_tweets_tweet_id"
            columns: ["tweet_id"]
            isOneToOne: false
            referencedRelation: "tweets"
            referencedColumns: ["tweet_id"]
          },
          {
            foreignKeyName: "fk_quote_tweets_tweet_id"
            columns: ["tweet_id"]
            isOneToOne: false
            referencedRelation: "tweets_w_conversation_id"
            referencedColumns: ["tweet_id"]
          },
        ]
      }
      remaining: {
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
      request_id: {
        Row: {
          value: string | null
        }
        Insert: {
          value?: string | null
        }
        Update: {
          value?: string | null
        }
        Relationships: []
      }
      retweets: {
        Row: {
          retweeted_tweet_id: string | null
          tweet_id: string
        }
        Insert: {
          retweeted_tweet_id?: string | null
          tweet_id: string
        }
        Update: {
          retweeted_tweet_id?: string | null
          tweet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_retweets_retweeted_tweet_id"
            columns: ["retweeted_tweet_id"]
            isOneToOne: false
            referencedRelation: "enriched_tweets"
            referencedColumns: ["tweet_id"]
          },
          {
            foreignKeyName: "fk_retweets_retweeted_tweet_id"
            columns: ["retweeted_tweet_id"]
            isOneToOne: false
            referencedRelation: "tweets"
            referencedColumns: ["tweet_id"]
          },
          {
            foreignKeyName: "fk_retweets_retweeted_tweet_id"
            columns: ["retweeted_tweet_id"]
            isOneToOne: false
            referencedRelation: "tweets_w_conversation_id"
            referencedColumns: ["tweet_id"]
          },
          {
            foreignKeyName: "fk_retweets_tweet_id"
            columns: ["tweet_id"]
            isOneToOne: true
            referencedRelation: "enriched_tweets"
            referencedColumns: ["tweet_id"]
          },
          {
            foreignKeyName: "fk_retweets_tweet_id"
            columns: ["tweet_id"]
            isOneToOne: true
            referencedRelation: "tweets"
            referencedColumns: ["tweet_id"]
          },
          {
            foreignKeyName: "fk_retweets_tweet_id"
            columns: ["tweet_id"]
            isOneToOne: true
            referencedRelation: "tweets_w_conversation_id"
            referencedColumns: ["tweet_id"]
          },
        ]
      }
      signal_boosts: {
        Row: {
          boosted_by: string
          created_at: string | null
          id: number
          tweet_id: string
        }
        Insert: {
          boosted_by: string
          created_at?: string | null
          id?: never
          tweet_id: string
        }
        Update: {
          boosted_by?: string
          created_at?: string | null
          id?: never
          tweet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "signal_boosts_boosted_by_fkey"
            columns: ["boosted_by"]
            isOneToOne: false
            referencedRelation: "account"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "signal_boosts_boosted_by_fkey"
            columns: ["boosted_by"]
            isOneToOne: false
            referencedRelation: "account_activity_summary"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "signal_boosts_boosted_by_fkey"
            columns: ["boosted_by"]
            isOneToOne: false
            referencedRelation: "all_account"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "signal_boosts_tweet_id_fkey"
            columns: ["tweet_id"]
            isOneToOne: false
            referencedRelation: "enriched_tweets"
            referencedColumns: ["tweet_id"]
          },
          {
            foreignKeyName: "signal_boosts_tweet_id_fkey"
            columns: ["tweet_id"]
            isOneToOne: false
            referencedRelation: "tweets"
            referencedColumns: ["tweet_id"]
          },
          {
            foreignKeyName: "signal_boosts_tweet_id_fkey"
            columns: ["tweet_id"]
            isOneToOne: false
            referencedRelation: "tweets_w_conversation_id"
            referencedColumns: ["tweet_id"]
          },
        ]
      }
      temporary_data: {
        Row: {
          data: Json
          id: number
          inserted: string | null
          item_id: string
          originator_id: string
          stored: boolean | null
          timestamp: string
          type: string
          user_id: string
        }
        Insert: {
          data: Json
          id?: never
          inserted?: string | null
          item_id: string
          originator_id: string
          stored?: boolean | null
          timestamp?: string
          type: string
          user_id?: string
        }
        Update: {
          data?: Json
          id?: never
          inserted?: string | null
          item_id?: string
          originator_id?: string
          stored?: boolean | null
          timestamp?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      temporary_data2: {
        Row: {
          data: Json
          id: number
          inserted: string | null
          item_id: string
          originator_id: string
          stored: boolean | null
          timestamp: string
          type: string
          user_id: string
        }
        Insert: {
          data: Json
          id?: never
          inserted?: string | null
          item_id: string
          originator_id: string
          stored?: boolean | null
          timestamp?: string
          type: string
          user_id?: string
        }
        Update: {
          data?: Json
          id?: never
          inserted?: string | null
          item_id?: string
          originator_id?: string
          stored?: boolean | null
          timestamp?: string
          type?: string
          user_id?: string
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
      tweet_result: {
        Row: {
          errors: string[] | null
          processed: number | null
        }
        Insert: {
          errors?: string[] | null
          processed?: number | null
        }
        Update: {
          errors?: string[] | null
          processed?: number | null
        }
        Relationships: []
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
      url_result: {
        Row: {
          errors: string[] | null
          processed: number | null
        }
        Insert: {
          errors?: string[] | null
          processed?: number | null
        }
        Update: {
          errors?: string[] | null
          processed?: number | null
        }
        Relationships: []
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
      temporary_data_stats: {
        Row: {
          newest_processed: string | null
          oldest_unprocessed: string | null
          processed_records: number | null
          total_records: number | null
          type: string | null
          unprocessed_records: number | null
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
      clear_import_error: {
        Args: {
          p_type: string
          p_originator_id: string
          p_item_id: string
        }
        Returns: boolean
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
      debug_profile_import: {
        Args: {
          process_cutoff_time?: string
        }
        Returns: {
          processed_count: number
          error_records: string[]
          debug_info: Json
        }[]
      }
      delete_all_archives: {
        Args: {
          p_account_id: string
        }
        Returns: undefined
      }
      delete_processed_temporary_data_records: {
        Args: Record<PropertyKey, never>
        Returns: number
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
      get_account_id_from_data: {
        Args: {
          data: Json
        }
        Returns: string
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
      get_boosted_tweets: {
        Args: {
          p_viewer_id: string
          p_limit?: number
        }
        Returns: {
          tweet_id: string
          account_id: string
          created_at: string
          full_text: string
          boost_score: number
          url: string
          boosted_by_following: number
          boosted_by_mutual: number
          username: string
          account_display_name: string
          avatar_media_url: string
        }[]
      }
      get_created_at_from_data: {
        Args: {
          data: Json
        }
        Returns: string
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
      get_main_thread: {
        Args: {
          p_conversation_id: string
        }
        Returns: {
          tweet_id: string
          conversation_id: string
          reply_to_tweet_id: string
          account_id: string
          depth: number
          max_depth: number
          favorite_count: number
          retweet_count: number
        }[]
      }
      get_monthly_tweet_counts: {
        Args: Record<PropertyKey, never>
        Returns: {
          month: string
          tweet_count: number
        }[]
      }
      get_most_liked_tweets_by_username: {
        Args: {
          username_: string
        }
        Returns: {
          tweet_id: string
          full_text: string
          num_likes: number
        }[]
      }
      get_most_mentioned_accounts_by_username: {
        Args: {
          username_: string
        }
        Returns: {
          mentioned_user_id: string
          mentioned_username: string
          mention_count: number
        }[]
      }
      get_signal_boost_score: {
        Args: {
          p_tweet_id: string
          p_viewer_id: string
        }
        Returns: number
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
      get_top_liked_users: {
        Args: Record<PropertyKey, never>
        Returns: {
          tweet_id: string
          full_text: string
          like_count: number
          reply_to_tweet_id: string
          reply_to_user_id: string
          reply_to_username: string
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
      get_top_retweeted_tweets_by_username: {
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
      get_user_interaction_stats: {
        Args: {
          user_id_1: string
          user_id_2: string
        }
        Returns: {
          total_interactions: number
          last_month_interactions: number
          last_week_interactions: number
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
          updated_at: string
          fts: unknown
          sender_username: string
          receiver_username: string
          interaction_type: string
        }[]
      }
      get_user_interactions: {
        Args: {
          user_id_1: string
          user_id_2: string
        }
        Returns: {
          tweet_id: string
          sender_id: string
          receiver_id: string
          created_at: string
          full_text: string
          favorite_count: number
          retweet_count: number
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
      process_import_account_record: {
        Args: {
          record_id: number
        }
        Returns: undefined
      }
      process_import_media_record: {
        Args: {
          record_id: number
        }
        Returns: undefined
      }
      process_import_mention_record: {
        Args: {
          record_id: number
        }
        Returns: undefined
      }
      process_import_profile_record: {
        Args: {
          record_id: number
        }
        Returns: undefined
      }
      process_import_tweet_record: {
        Args: {
          record_id: number
        }
        Returns: undefined
      }
      process_import_url_record: {
        Args: {
          record_id: number
        }
        Returns: undefined
      }
      process_temporary_data_batch_v2: {
        Args: {
          batch_size?: number
        }
        Returns: number
      }
      retry_import_errors_by_type: {
        Args: {
          p_type: string
        }
        Returns: number
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
      update_foreign_keys: {
        Args: {
          old_table_name: string
          new_table_name: string
          schema_name: string
        }
        Returns: undefined
      }
      word_occurrences: {
        Args: {
          search_word: string
          start_date?: string
          end_date?: string
          user_ids?: string[]
        }
        Returns: {
          month: string
          word_count: number
        }[]
      }
      word_occurrences2: {
        Args: {
          search_word: string
          start_date?: string
          end_date?: string
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
        | "completed"
        | "failed"
        | "ready_for_commit"
        | "committing"
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

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof PublicSchema["CompositeTypes"]
    | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof PublicSchema["CompositeTypes"]
    ? PublicSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

