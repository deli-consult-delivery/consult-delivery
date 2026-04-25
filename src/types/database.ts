export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      agent_actions: {
        Row: {
          agent_id: string
          id: string
          metadata: Json
          occurred_at: string
          related_id: string | null
          related_kind: string | null
          tenant_id: string
          text: string
        }
        Insert: {
          agent_id: string
          id?: string
          metadata?: Json
          occurred_at?: string
          related_id?: string | null
          related_kind?: string | null
          tenant_id: string
          text: string
        }
        Update: {
          agent_id?: string
          id?: string
          metadata?: Json
          occurred_at?: string
          related_id?: string | null
          related_kind?: string | null
          tenant_id?: string
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_actions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_actions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      agents: {
        Row: {
          color: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          letter: string
          name: string
          role: string
        }
        Insert: {
          color: string
          created_at?: string
          description?: string | null
          id: string
          is_active?: boolean
          letter: string
          name: string
          role: string
        }
        Update: {
          color?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          letter?: string
          name?: string
          role?: string
        }
        Relationships: []
      }
      conversations: {
        Row: {
          agent_id: string | null
          created_at: string
          customer_id: string | null
          id: string
          is_online: boolean
          last_message_at: string | null
          preview: string | null
          status: string
          tenant_id: string
          title: string | null
          type: string
          unread_count: number
          updated_at: string
        }
        Insert: {
          agent_id?: string | null
          created_at?: string
          customer_id?: string | null
          id?: string
          is_online?: boolean
          last_message_at?: string | null
          preview?: string | null
          status?: string
          tenant_id: string
          title?: string | null
          type: string
          unread_count?: number
          updated_at?: string
        }
        Update: {
          agent_id?: string | null
          created_at?: string
          customer_id?: string | null
          id?: string
          is_online?: boolean
          last_message_at?: string | null
          preview?: string | null
          status?: string
          tenant_id?: string
          title?: string | null
          type?: string
          unread_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          avatar: string | null
          created_at: string
          email: string | null
          id: string
          is_vip: boolean
          metadata: Json
          name: string
          phone: string | null
          tags: string[]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          avatar?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_vip?: boolean
          metadata?: Json
          name: string
          phone?: string | null
          tags?: string[]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          avatar?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_vip?: boolean
          metadata?: Json
          name?: string
          phone?: string | null
          tags?: string[]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_kpis: {
        Row: {
          created_at: string
          day: string
          inadimplencia_cents: number
          inadimplencia_clientes: number
          pedidos_count: number
          pedidos_delta_pct: number | null
          tarefas_count: number
          tarefas_urgentes: number
          tenant_id: string
          ticket_delta_pct: number | null
          ticket_medio_cents: number
          trend: Json
        }
        Insert: {
          created_at?: string
          day: string
          inadimplencia_cents?: number
          inadimplencia_clientes?: number
          pedidos_count?: number
          pedidos_delta_pct?: number | null
          tarefas_count?: number
          tarefas_urgentes?: number
          tenant_id: string
          ticket_delta_pct?: number | null
          ticket_medio_cents?: number
          trend?: Json
        }
        Update: {
          created_at?: string
          day?: string
          inadimplencia_cents?: number
          inadimplencia_clientes?: number
          pedidos_count?: number
          pedidos_delta_pct?: number | null
          tarefas_count?: number
          tarefas_urgentes?: number
          tenant_id?: string
          ticket_delta_pct?: number | null
          ticket_medio_cents?: number
          trend?: Json
        }
        Relationships: [
          {
            foreignKeyName: "daily_kpis_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      inadimplencia_messages: {
        Row: {
          body: string
          created_at: string
          from_kind: string
          id: string
          inadimplencia_id: string
          sent_at: string
          tenant_id: string
        }
        Insert: {
          body: string
          created_at?: string
          from_kind: string
          id?: string
          inadimplencia_id: string
          sent_at?: string
          tenant_id: string
        }
        Update: {
          body?: string
          created_at?: string
          from_kind?: string
          id?: string
          inadimplencia_id?: string
          sent_at?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inadimplencia_messages_inadimplencia_id_fkey"
            columns: ["inadimplencia_id"]
            isOneToOne: false
            referencedRelation: "inadimplencias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inadimplencia_messages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      inadimplencias: {
        Row: {
          amount_cents: number
          created_at: string
          customer_id: string
          days_late: number
          id: string
          last_action_at: string | null
          next_action: string | null
          order_id: string | null
          pay_probability: number | null
          sentiment_score: number | null
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          customer_id: string
          days_late?: number
          id?: string
          last_action_at?: string | null
          next_action?: string | null
          order_id?: string | null
          pay_probability?: number | null
          sentiment_score?: number | null
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          customer_id?: string
          days_late?: number
          id?: string
          last_action_at?: string | null
          next_action?: string | null
          order_id?: string | null
          pay_probability?: number | null
          sentiment_score?: number | null
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inadimplencias_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inadimplencias_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inadimplencias_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string
          conversation_id: string
          created_at: string
          direction: string
          id: string
          metadata: Json
          sender_agent_id: string | null
          sender_kind: string
          sender_user_id: string | null
          sent_at: string
          tenant_id: string
        }
        Insert: {
          body: string
          conversation_id: string
          created_at?: string
          direction: string
          id?: string
          metadata?: Json
          sender_agent_id?: string | null
          sender_kind: string
          sender_user_id?: string | null
          sent_at?: string
          tenant_id: string
        }
        Update: {
          body?: string
          conversation_id?: string
          created_at?: string
          direction?: string
          id?: string
          metadata?: Json
          sender_agent_id?: string | null
          sender_kind?: string
          sender_user_id?: string | null
          sent_at?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_agent_id_fkey"
            columns: ["sender_agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_user_id_fkey"
            columns: ["sender_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          channel: string
          created_at: string
          customer_id: string | null
          delivered_at: string | null
          external_ref: string | null
          id: string
          items_summary: string | null
          metadata: Json
          placed_at: string
          status: string
          tenant_id: string
          total_cents: number
          updated_at: string
        }
        Insert: {
          channel?: string
          created_at?: string
          customer_id?: string | null
          delivered_at?: string | null
          external_ref?: string | null
          id?: string
          items_summary?: string | null
          metadata?: Json
          placed_at?: string
          status?: string
          tenant_id: string
          total_cents?: number
          updated_at?: string
        }
        Update: {
          channel?: string
          created_at?: string
          customer_id?: string | null
          delivered_at?: string | null
          external_ref?: string | null
          id?: string
          items_summary?: string | null
          metadata?: Json
          placed_at?: string
          status?: string
          tenant_id?: string
          total_cents?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          is_super: boolean
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          is_super?: boolean
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          is_super?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      regua_cobranca: {
        Row: {
          channel: string
          created_at: string
          days: number[]
          id: string
          is_active: boolean
          name: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          channel?: string
          created_at?: string
          days?: number[]
          id?: string
          is_active?: boolean
          name: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          channel?: string
          created_at?: string
          days?: number[]
          id?: string
          is_active?: boolean
          name?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "regua_cobranca_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      task_comments: {
        Row: {
          author_id: string | null
          body: string
          created_at: string
          id: string
          task_id: string
          tenant_id: string
        }
        Insert: {
          author_id?: string | null
          body: string
          created_at?: string
          id?: string
          task_id: string
          tenant_id: string
        }
        Update: {
          author_id?: string | null
          body?: string
          created_at?: string
          id?: string
          task_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_comments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_comments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          agent_id: string | null
          assignee_id: string | null
          attachments_count: number
          checklist_done: number
          checklist_total: number
          col: string
          created_at: string
          created_by: string | null
          description: string | null
          due_at: string | null
          due_label: string | null
          id: string
          position: number
          priority: string
          tenant_id: string
          title: string
          updated_at: string
        }
        Insert: {
          agent_id?: string | null
          assignee_id?: string | null
          attachments_count?: number
          checklist_done?: number
          checklist_total?: number
          col?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_at?: string | null
          due_label?: string | null
          id?: string
          position?: number
          priority?: string
          tenant_id: string
          title: string
          updated_at?: string
        }
        Update: {
          agent_id?: string | null
          assignee_id?: string | null
          attachments_count?: number
          checklist_done?: number
          checklist_total?: number
          col?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_at?: string | null
          due_label?: string | null
          id?: string
          position?: number
          priority?: string
          tenant_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_agents: {
        Row: {
          agent_id: string
          config: Json
          created_at: string
          enabled: boolean
          tenant_id: string
          updated_at: string
        }
        Insert: {
          agent_id: string
          config?: Json
          created_at?: string
          enabled?: boolean
          tenant_id: string
          updated_at?: string
        }
        Update: {
          agent_id?: string
          config?: Json
          created_at?: string
          enabled?: boolean
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_agents_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_agents_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_members: {
        Row: {
          created_at: string
          role: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          role?: string
          tenant_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          role?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_members_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          color: string | null
          created_at: string
          emoji: string | null
          id: string
          metadata: Json
          name: string
          plan: string
          slug: string
          status: string
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          emoji?: string | null
          id?: string
          metadata?: Json
          name: string
          plan?: string
          slug: string
          status?: string
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          emoji?: string | null
          id?: string
          metadata?: Json
          name?: string
          plan?: string
          slug?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      v_chart_7d: {
        Row: {
          day: string | null
          pedidos_count: number | null
          tenant_id: string | null
        }
        Insert: {
          day?: string | null
          pedidos_count?: number | null
          tenant_id?: string | null
        }
        Update: {
          day?: string | null
          pedidos_count?: number | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "daily_kpis_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      v_dashboard_kpis: {
        Row: {
          day: string | null
          inadimplencia_cents: number | null
          inadimplencia_clientes: number | null
          pedidos_count: number | null
          pedidos_delta_pct: number | null
          tarefas_count: number | null
          tarefas_urgentes: number | null
          tenant_id: string | null
          ticket_delta_pct: number | null
          ticket_medio_cents: number | null
        }
        Insert: {
          day?: string | null
          inadimplencia_cents?: number | null
          inadimplencia_clientes?: number | null
          pedidos_count?: number | null
          pedidos_delta_pct?: number | null
          tarefas_count?: number | null
          tarefas_urgentes?: number | null
          tenant_id?: string | null
          ticket_delta_pct?: number | null
          ticket_medio_cents?: number | null
        }
        Update: {
          day?: string | null
          inadimplencia_cents?: number | null
          inadimplencia_clientes?: number | null
          pedidos_count?: number | null
          pedidos_delta_pct?: number | null
          tarefas_count?: number | null
          tarefas_urgentes?: number | null
          tenant_id?: string | null
          ticket_delta_pct?: number | null
          ticket_medio_cents?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "daily_kpis_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      is_admin_of: { Args: { _tenant: string }; Returns: boolean }
      is_member_of: { Args: { _tenant: string }; Returns: boolean }
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

export const Constants = {
  public: {
    Enums: {},
  },
} as const
