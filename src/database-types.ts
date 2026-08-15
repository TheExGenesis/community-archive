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
      [_ in never]: never
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
      archive_completion_notification_outbox: {
        Row: {
          account_id: string
          archive_at: string
          archive_upload_id: number
          archive_username: string | null
          attempt_count: number
          available_at: string
          created_at: string
          id: number
          last_error: string | null
          locked_at: string | null
          provider_message_id: string | null
          recipient_email: string
          sent_at: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id: string
          archive_at: string
          archive_upload_id: number
          archive_username?: string | null
          attempt_count?: number
          available_at?: string
          created_at?: string
          id?: never
          last_error?: string | null
          locked_at?: string | null
          provider_message_id?: string | null
          recipient_email: string
          sent_at?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string
          archive_at?: string
          archive_upload_id?: number
          archive_username?: string | null
          attempt_count?: number
          available_at?: string
          created_at?: string
          id?: never
          last_error?: string | null
          locked_at?: string | null
          provider_message_id?: string | null
          recipient_email?: string
          sent_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "archive_completion_notification_outbox_archive_upload_id_fkey"
            columns: ["archive_upload_id"]
            isOneToOne: true
            referencedRelation: "archive_upload"
            referencedColumns: ["id"]
          },
        ]
      }
      archive_completion_notification_preferences: {
        Row: {
          account_id: string
          created_at: string
          email: string
          enabled: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id: string
          created_at?: string
          email: string
          enabled?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string
          created_at?: string
          email?: string
          enabled?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      archive_completion_notification_worker_state: {
        Row: {
          last_claimed: number
          last_error: string | null
          last_failed: number
          last_finished_at: string | null
          last_sent: number
          last_started_at: string | null
          singleton: boolean
          updated_at: string
        }
        Insert: {
          last_claimed?: number
          last_error?: string | null
          last_failed?: number
          last_finished_at?: string | null
          last_sent?: number
          last_started_at?: string | null
          singleton?: boolean
          updated_at?: string
        }
        Update: {
          last_claimed?: number
          last_error?: string | null
          last_failed?: number
          last_finished_at?: string | null
          last_sent?: number
          last_started_at?: string | null
          singleton?: boolean
          updated_at?: string
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
          username: string | null
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
          username?: string | null
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
          username?: string | null
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
      digest_editions: {
        Row: {
          content: Json
          created_at: string
          created_by: string | null
          digest_date: string
          id: string
          issue_number: number
          published_at: string | null
          source_run_id: string
          status: string
          updated_at: string
          version: number
        }
        Insert: {
          content: Json
          created_at?: string
          created_by?: string | null
          digest_date: string
          id?: string
          issue_number?: never
          published_at?: string | null
          source_run_id: string
          status?: string
          updated_at?: string
          version: number
        }
        Update: {
          content?: Json
          created_at?: string
          created_by?: string | null
          digest_date?: string
          id?: string
          issue_number?: never
          published_at?: string | null
          source_run_id?: string
          status?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "digest_editions_source_run_id_fkey"
            columns: ["source_run_id"]
            isOneToOne: false
            referencedRelation: "digest_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      digest_prompt_versions: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          label: string
          model: string
          parameters: Json
          system_prompt: string
          user_prompt_template: string
          version: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          label: string
          model: string
          parameters?: Json
          system_prompt: string
          user_prompt_template: string
          version?: never
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string
          model?: string
          parameters?: Json
          system_prompt?: string
          user_prompt_template?: string
          version?: never
        }
        Relationships: []
      }
      digest_runs: {
        Row: {
          candidates: Json
          completed_at: string | null
          created_at: string
          created_by: string | null
          digest_date: string
          duration_ms: number | null
          error: string | null
          events: Json
          id: string
          input_tokens: number | null
          model: string | null
          model_request: Json | null
          output_tokens: number | null
          parent_run_id: string | null
          parsed_output: Json | null
          prompt_version_id: string
          raw_response: Json | null
          response_id: string | null
          revision_instruction: string | null
          started_at: string | null
          status: string
          total_tokens: number | null
          updated_at: string
          window_end: string
          window_start: string
          workflow_run_id: string | null
        }
        Insert: {
          candidates?: Json
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          digest_date: string
          duration_ms?: number | null
          error?: string | null
          events?: Json
          id?: string
          input_tokens?: number | null
          model?: string | null
          model_request?: Json | null
          output_tokens?: number | null
          parent_run_id?: string | null
          parsed_output?: Json | null
          prompt_version_id: string
          raw_response?: Json | null
          response_id?: string | null
          revision_instruction?: string | null
          started_at?: string | null
          status?: string
          total_tokens?: number | null
          updated_at?: string
          window_end: string
          window_start: string
          workflow_run_id?: string | null
        }
        Update: {
          candidates?: Json
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          digest_date?: string
          duration_ms?: number | null
          error?: string | null
          events?: Json
          id?: string
          input_tokens?: number | null
          model?: string | null
          model_request?: Json | null
          output_tokens?: number | null
          parent_run_id?: string | null
          parsed_output?: Json | null
          prompt_version_id?: string
          raw_response?: Json | null
          response_id?: string | null
          revision_instruction?: string | null
          started_at?: string | null
          status?: string
          total_tokens?: number | null
          updated_at?: string
          window_end?: string
          window_start?: string
          workflow_run_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "digest_runs_parent_run_id_fkey"
            columns: ["parent_run_id"]
            isOneToOne: false
            referencedRelation: "digest_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "digest_runs_prompt_version_id_fkey"
            columns: ["prompt_version_id"]
            isOneToOne: false
            referencedRelation: "digest_prompt_versions"
            referencedColumns: ["id"]
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
          explicit_optout: boolean | null
          id: string
          opt_out_reason: string | null
          opted_in: boolean
          opted_in_at: string | null
          opted_out_at: string | null
          terms_version: string
          twitter_user_id: string | null
          updated_at: string | null
          user_id: string | null
          username: string
        }
        Insert: {
          created_at?: string | null
          explicit_optout?: boolean | null
          id?: string
          opt_out_reason?: string | null
          opted_in?: boolean
          opted_in_at?: string | null
          opted_out_at?: string | null
          terms_version?: string
          twitter_user_id?: string | null
          updated_at?: string | null
          user_id?: string | null
          username: string
        }
        Update: {
          created_at?: string | null
          explicit_optout?: boolean | null
          id?: string
          opt_out_reason?: string | null
          opted_in?: boolean
          opted_in_at?: string | null
          opted_out_at?: string | null
          terms_version?: string
          twitter_user_id?: string | null
          updated_at?: string | null
          user_id?: string | null
          username?: string
        }
        Relationships: []
      }
      profile_curation: {
        Row: {
          account_id: string
          created_at: string
          is_featured: boolean
          is_hidden: boolean
          item_id: string
          position: number | null
          section: string
          updated_at: string
        }
        Insert: {
          account_id: string
          created_at?: string
          is_featured?: boolean
          is_hidden?: boolean
          item_id: string
          position?: number | null
          section: string
          updated_at?: string
        }
        Update: {
          account_id?: string
          created_at?: string
          is_featured?: boolean
          is_hidden?: boolean
          item_id?: string
          position?: number | null
          section?: string
          updated_at?: string
        }
        Relationships: []
      }
      profile_settings: {
        Row: {
          account_id: string
          created_at: string
          download_archive_visible: boolean
          updated_at: string
        }
        Insert: {
          account_id: string
          created_at?: string
          download_archive_visible?: boolean
          updated_at?: string
        }
        Update: {
          account_id?: string
          created_at?: string
          download_archive_visible?: boolean
          updated_at?: string
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
      tweet_link_previews: {
        Row: {
          canonical_url: string | null
          content_type: string | null
          created_at: string
          description: string | null
          expires_at: string
          fetched_at: string | null
          image_url: string | null
          normalized_url: string
          site_name: string | null
          status: string
          title: string | null
          updated_at: string
          url_hash: string
        }
        Insert: {
          canonical_url?: string | null
          content_type?: string | null
          created_at?: string
          description?: string | null
          expires_at?: string
          fetched_at?: string | null
          image_url?: string | null
          normalized_url: string
          site_name?: string | null
          status?: string
          title?: string | null
          updated_at?: string
          url_hash: string
        }
        Update: {
          canonical_url?: string | null
          content_type?: string | null
          created_at?: string
          description?: string | null
          expires_at?: string
          fetched_at?: string | null
          image_url?: string | null
          normalized_url?: string
          site_name?: string | null
          status?: string
          title?: string | null
          updated_at?: string
          url_hash?: string
        }
        Relationships: []
      }
      tweet_media: {
        Row: {
          archive_upload_id: number | null
          height: number | null
          media_id: number
          media_type: string
          media_url: string
          tweet_id: string
          updated_at: string | null
          width: number | null
        }
        Insert: {
          archive_upload_id?: number | null
          height?: number | null
          media_id: number
          media_type: string
          media_url: string
          tweet_id: string
          updated_at?: string | null
          width?: number | null
        }
        Update: {
          archive_upload_id?: number | null
          height?: number | null
          media_id?: number
          media_type?: string
          media_url?: string
          tweet_id?: string
          updated_at?: string | null
          width?: number | null
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
          retweet_count: number | null
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
          retweet_count?: number | null
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
          retweet_count?: number | null
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
      user_action_log: {
        Row: {
          account_id: string | null
          action_type: string
          created_at: string
          id: number
          metadata: Json | null
          notes: string | null
          user_id: string | null
        }
        Insert: {
          account_id?: string | null
          action_type: string
          created_at?: string
          id?: number
          metadata?: Json | null
          notes?: string | null
          user_id?: string | null
        }
        Update: {
          account_id?: string | null
          action_type?: string
          created_at?: string
          id?: number
          metadata?: Json | null
          notes?: string | null
          user_id?: string | null
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
      user_directory: {
        Row: {
          account_display_name: string | null
          account_id: string | null
          archive_at: string | null
          archive_uploaded_at: string | null
          avatar_media_url: string | null
          bio: string | null
          created_at: string | null
          directory_id: string | null
          has_archive: boolean | null
          is_opted_in: boolean | null
          joined_at: string | null
          location: string | null
          num_followers: number | null
          num_following: number | null
          num_likes: number | null
          num_tweets: number | null
          opted_in_at: string | null
          username: string | null
          website: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      admin_enqueue_delete_with_export: {
        Args: {
          p_account_id: string
          p_username: string
          p_reason?: string
          p_requested_by_user_id?: string
        }
        Returns: string
      }
      admin_list_blocked_scraping_users: {
        Args: {
          p_account_ids: string[]
        }
        Returns: string[]
      }
      admin_list_recent_delete_jobs: {
        Args: {
          p_limit?: number
        }
        Returns: {
          job_key: string
          status: string
          account_id: string
          username: string
          reason: string
          created_at: string
          updated_at: string
          error: string
        }[]
      }
      admin_set_scrape_block: {
        Args: {
          p_account_id: string
          p_blocked: boolean
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
      apply_public_rls_policies_not_private: {
        Args: {
          schema_name: string
          table_name: string
        }
        Returns: undefined
      }
      apply_readonly_rls_policies: {
        Args: {
          schema_name: string
          table_name: string
        }
        Returns: undefined
      }
      claim_archive_completion_notifications: {
        Args: {
          p_limit?: number
        }
        Returns: {
          id: number
          recipient_email: string
          account_id: string
          archive_username: string
          archive_at: string
        }[]
      }
      commit_temp_data: {
        Args: {
          p_suffix: string
        }
        Returns: undefined
      }
      community_archive_monitoring_completion_notifications: {
        Args: Record<PropertyKey, never>
        Returns: {
          ready_count: number
          processing_count: number
          dead_24h_count: number
          oldest_ready_seconds: number
          seconds_since_last_sent: number
          worker_last_started_timestamp_seconds: number
          worker_last_finished_timestamp_seconds: number
          worker_last_claimed: number
          worker_last_sent: number
          worker_last_failed: number
        }[]
      }
      compute_hourly_scraping_stats: {
        Args: {
          p_start_date: string
          p_end_date: string
        }
        Returns: {
          period_start: string
          period_end: string
          tweet_count: number
          unique_scrapers: number
        }[]
      }
      create_temp_tables: {
        Args: {
          p_suffix: string
        }
        Returns: undefined
      }
      delete_non_allowlist_streamed_tweet_batch: {
        Args: {
          p_limit?: number
        }
        Returns: {
          requested_tweets: number
          deleted_tweets: number
          deleted_conversations: number
          deleted_tweet_media: number
          deleted_user_mentions: number
          deleted_tweet_urls: number
          deleted_private_tweet_user: number
        }[]
      }
      delete_single_archive: {
        Args: {
          p_account_id: string
          p_archive_upload_id: number
        }
        Returns: undefined
      }
      delete_tweets: {
        Args: {
          p_tweet_ids: string[]
        }
        Returns: {
          deleted_tweets: number
          deleted_conversations: number
          deleted_tweet_media: number
          deleted_user_mentions: number
          deleted_tweet_urls: number
          deleted_private_tweet_user: number
        }[]
      }
      delete_user_archive: {
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
      finish_archive_completion_notification: {
        Args: {
          p_id: number
          p_provider_message_id?: string
          p_error?: string
        }
        Returns: undefined
      }
      finish_archive_completion_notification_run: {
        Args: {
          p_claimed: number
          p_sent: number
          p_failed: number
          p_error?: string
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
      get_hourly_scraping_stats: {
        Args: {
          p_hours_back?: number
        }
        Returns: {
          period_start: string
          period_end: string
          tweet_count: number
          unique_scrapers: number
        }[]
      }
      get_hourly_stats_simple: {
        Args: {
          p_hours_back?: number
        }
        Returns: {
          period_start: string
          tweet_count: number
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
      get_monthly_tweet_counts_fast: {
        Args: {
          p_account_id?: string
          p_start_date?: string
          p_end_date?: string
        }
        Returns: {
          month: string
          account_id: string
          tweet_count: number
          days_active: number
          avg_favorites: number
          avg_retweets: number
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
      get_non_allowlist_streamed_tweet_candidates: {
        Args: {
          p_limit?: number
        }
        Returns: {
          tweet_id: string
          account_id: string
          created_at: string
          reply_to_tweet_id: string
          is_quote: boolean
        }[]
      }
      get_scraper_counts_by_granularity: {
        Args: {
          start_date: string
          end_date: string
          granularity: string
        }
        Returns: {
          scraper_date: string
          unique_scrapers: number
        }[]
      }
      get_simple_streamed_tweet_counts: {
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
      get_streaming_stats: {
        Args: {
          p_start_date: string
          p_end_date: string
          p_granularity?: string
          p_streamed_only?: boolean
        }
        Returns: {
          period_start: string
          period_end: string
          tweet_count: number
          unique_scrapers: number
        }[]
      }
      get_streaming_stats_daily: {
        Args: {
          p_start_date: string
          p_end_date: string
        }
        Returns: {
          period_start: string
          period_end: string
          tweet_count: number
          unique_scrapers: number
        }[]
      }
      get_streaming_stats_daily_streamed_only: {
        Args: {
          p_start_date: string
          p_end_date: string
        }
        Returns: {
          period_start: string
          period_end: string
          tweet_count: number
          unique_scrapers: number
        }[]
      }
      get_streaming_stats_hourly: {
        Args: {
          p_start_date: string
          p_end_date: string
        }
        Returns: {
          period_start: string
          period_end: string
          tweet_count: number
          unique_scrapers: number
        }[]
      }
      get_streaming_stats_hourly_streamed_only: {
        Args: {
          p_start_date: string
          p_end_date: string
        }
        Returns: {
          period_start: string
          period_end: string
          tweet_count: number
          unique_scrapers: number
        }[]
      }
      get_streaming_stats_weekly: {
        Args: {
          p_start_date: string
          p_end_date: string
        }
        Returns: {
          period_start: string
          period_end: string
          tweet_count: number
          unique_scrapers: number
        }[]
      }
      get_streaming_stats_weekly_streamed_only: {
        Args: {
          p_start_date: string
          p_end_date: string
        }
        Returns: {
          period_start: string
          period_end: string
          tweet_count: number
          unique_scrapers: number
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
      get_trending_tweets: {
        Args: {
          hours_back?: number
          limit_count?: number
        }
        Returns: {
          tweet_id: string
          account_id: string
          full_text: string
          created_at: string
          favorite_count: number
          retweet_count: number
          engagement_score: number
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
      get_tweet_counts_by_granularity: {
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
      get_tweet_page_data: {
        Args: {
          p_tweet_id: string
        }
        Returns: Json
      }
      get_unique_scraper_count: {
        Args: {
          start_date: string
          end_date: string
        }
        Returns: number
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
      publish_digest_edition: {
        Args: {
          p_edition_id: string
        }
        Returns: {
          content: Json
          created_at: string
          created_by: string | null
          digest_date: string
          id: string
          issue_number: number
          published_at: string | null
          source_run_id: string
          status: string
          updated_at: string
          version: number
        }
      }
      refresh_global_activity_summary: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      search_tweets:
        | {
            Args: {
              search_query: string
              from_user?: string
              to_user?: string
              since_date?: string
              until_date?: string
              limit_?: number
              offset_?: number
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
              media: Json
            }[]
          }
        | {
            Args: {
              search_query: string
              limit_count?: number
              account_filter?: string
              date_from?: string
              date_to?: string
            }
            Returns: {
              tweet_id: string
              account_id: string
              full_text: string
              created_at: string
              favorite_count: number
              retweet_count: number
              relevance: number
            }[]
          }
      search_tweets_exact_phrase: {
        Args: {
          exact_phrase: string
          from_user?: string
          to_user?: string
          since_date?: string
          until_date?: string
          limit_?: number
          offset_?: number
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
          media: Json
        }[]
      }
      set_archive_completion_notification: {
        Args: {
          p_enabled: boolean
        }
        Returns: {
          enabled: boolean
          email: string
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

