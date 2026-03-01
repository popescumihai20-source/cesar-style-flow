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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      articol_dictionary: {
        Row: {
          active: boolean
          code: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      barcode_config: {
        Row: {
          active_lengths: number[]
          created_at: string
          date_format: string
          format_version: string
          id: string
        }
        Insert: {
          active_lengths?: number[]
          created_at?: string
          date_format?: string
          format_version: string
          id?: string
        }
        Update: {
          active_lengths?: number[]
          created_at?: string
          date_format?: string
          format_version?: string
          id?: string
        }
        Relationships: []
      }
      bulina_commissions: {
        Row: {
          active: boolean
          color_name: string
          commission_value: number
          created_at: string
          hex_color: string
          id: string
        }
        Insert: {
          active?: boolean
          color_name: string
          commission_value?: number
          created_at?: string
          hex_color: string
          id?: string
        }
        Update: {
          active?: boolean
          color_name?: string
          commission_value?: number
          created_at?: string
          hex_color?: string
          id?: string
        }
        Relationships: []
      }
      color_dictionary: {
        Row: {
          active: boolean
          code: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      commission_logs: {
        Row: {
          amount: number
          bulina_id: string | null
          created_at: string
          employee_id: string
          id: string
          sale_id: string
        }
        Insert: {
          amount: number
          bulina_id?: string | null
          created_at?: string
          employee_id: string
          id?: string
          sale_id: string
        }
        Update: {
          amount?: number
          bulina_id?: string | null
          created_at?: string
          employee_id?: string
          id?: string
          sale_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "commission_logs_bulina_id_fkey"
            columns: ["bulina_id"]
            isOneToOne: false
            referencedRelation: "bulina_commissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_logs_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_logs_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          card_barcode: string | null
          created_at: string
          email: string | null
          id: string
          level: string
          name: string | null
          phone: string
          points: number
          updated_at: string
        }
        Insert: {
          card_barcode?: string | null
          created_at?: string
          email?: string | null
          id?: string
          level?: string
          name?: string | null
          phone: string
          points?: number
          updated_at?: string
        }
        Update: {
          card_barcode?: string | null
          created_at?: string
          email?: string | null
          id?: string
          level?: string
          name?: string | null
          phone?: string
          points?: number
          updated_at?: string
        }
        Relationships: []
      }
      devices: {
        Row: {
          active: boolean
          allowed_roles: Database["public"]["Enums"]["app_role"][]
          created_at: string
          device_code: string
          device_name: string
          id: string
        }
        Insert: {
          active?: boolean
          allowed_roles?: Database["public"]["Enums"]["app_role"][]
          created_at?: string
          device_code: string
          device_name: string
          id?: string
        }
        Update: {
          active?: boolean
          allowed_roles?: Database["public"]["Enums"]["app_role"][]
          created_at?: string
          device_code?: string
          device_name?: string
          id?: string
        }
        Relationships: []
      }
      employees: {
        Row: {
          active: boolean
          created_at: string
          employee_card_code: string
          id: string
          name: string
          pin_login: string
          removal_pin: string
          role: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          employee_card_code: string
          id?: string
          name: string
          pin_login: string
          removal_pin: string
          role?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          employee_card_code?: string
          id?: string
          name?: string
          pin_login?: string
          removal_pin?: string
          role?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      inventory_adjustments: {
        Row: {
          adjusted_by: string
          created_at: string
          difference: number
          id: string
          location: string
          new_quantity: number
          old_quantity: number
          product_id: string
          reason: string
          session_id: string
          variant_code: string | null
        }
        Insert: {
          adjusted_by: string
          created_at?: string
          difference: number
          id?: string
          location: string
          new_quantity: number
          old_quantity: number
          product_id: string
          reason: string
          session_id: string
          variant_code?: string | null
        }
        Update: {
          adjusted_by?: string
          created_at?: string
          difference?: number
          id?: string
          location?: string
          new_quantity?: number
          old_quantity?: number
          product_id?: string
          reason?: string
          session_id?: string
          variant_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_adjustments_adjusted_by_fkey"
            columns: ["adjusted_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_adjustments_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_adjustments_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "inventory_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_lines: {
        Row: {
          adjustment_reason: string | null
          counted_quantity: number
          created_at: string
          difference: number | null
          id: string
          product_id: string
          session_id: string
          system_quantity: number
          variant_code: string | null
        }
        Insert: {
          adjustment_reason?: string | null
          counted_quantity?: number
          created_at?: string
          difference?: number | null
          id?: string
          product_id: string
          session_id: string
          system_quantity?: number
          variant_code?: string | null
        }
        Update: {
          adjustment_reason?: string | null
          counted_quantity?: number
          created_at?: string
          difference?: number | null
          id?: string
          product_id?: string
          session_id?: string
          system_quantity?: number
          variant_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_lines_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "inventory_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_sessions: {
        Row: {
          created_at: string
          end_time: string | null
          id: string
          location: string
          notes: string | null
          start_time: string
          started_by: string
          status: string
        }
        Insert: {
          created_at?: string
          end_time?: string | null
          id?: string
          location: string
          notes?: string | null
          start_time?: string
          started_by: string
          status?: string
        }
        Update: {
          created_at?: string
          end_time?: string | null
          id?: string
          location?: string
          notes?: string | null
          start_time?: string
          started_by?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_sessions_started_by_fkey"
            columns: ["started_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      producator_dictionary: {
        Row: {
          active: boolean
          code: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      product_bulina: {
        Row: {
          assigned_at: string
          bulina_id: string
          id: string
          product_id: string
        }
        Insert: {
          assigned_at?: string
          bulina_id: string
          id?: string
          product_id: string
        }
        Update: {
          assigned_at?: string
          bulina_id?: string
          id?: string
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_bulina_bulina_id_fkey"
            columns: ["bulina_id"]
            isOneToOne: false
            referencedRelation: "bulina_commissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_bulina_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_variants: {
        Row: {
          created_at: string
          id: string
          image_override: string | null
          label: string
          product_id: string
          stock_variant: number
          variant_code: string
        }
        Insert: {
          created_at?: string
          id?: string
          image_override?: string | null
          label: string
          product_id: string
          stock_variant?: number
          variant_code: string
        }
        Update: {
          created_at?: string
          id?: string
          image_override?: string | null
          label?: string
          product_id?: string
          stock_variant?: number
          variant_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          active: boolean
          base_id: string
          brand: string | null
          category: string | null
          cost_price: number
          created_at: string
          full_barcode: string | null
          id: string
          images: string[] | null
          last_received_at: string | null
          name: string
          seasonal_tag: Database["public"]["Enums"]["seasonal_tag"]
          selling_price: number
          stock_depozit: number
          stock_general: number
          tags: string[] | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          base_id: string
          brand?: string | null
          category?: string | null
          cost_price?: number
          created_at?: string
          full_barcode?: string | null
          id?: string
          images?: string[] | null
          last_received_at?: string | null
          name: string
          seasonal_tag?: Database["public"]["Enums"]["seasonal_tag"]
          selling_price?: number
          stock_depozit?: number
          stock_general?: number
          tags?: string[] | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          base_id?: string
          brand?: string | null
          category?: string | null
          cost_price?: number
          created_at?: string
          full_barcode?: string | null
          id?: string
          images?: string[] | null
          last_received_at?: string | null
          name?: string
          seasonal_tag?: Database["public"]["Enums"]["seasonal_tag"]
          selling_price?: number
          stock_depozit?: number
          stock_general?: number
          tags?: string[] | null
          updated_at?: string
        }
        Relationships: []
      }
      sale_items: {
        Row: {
          created_at: string
          discount_percent: number
          id: string
          is_gift: boolean
          line_total: number
          product_id: string
          quantity: number
          sale_id: string
          unit_price: number
          variant_code: string | null
        }
        Insert: {
          created_at?: string
          discount_percent?: number
          id?: string
          is_gift?: boolean
          line_total: number
          product_id: string
          quantity?: number
          sale_id: string
          unit_price: number
          variant_code?: string | null
        }
        Update: {
          created_at?: string
          discount_percent?: number
          id?: string
          is_gift?: boolean
          line_total?: number
          product_id?: string
          quantity?: number
          sale_id?: string
          unit_price?: number
          variant_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sale_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_items_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      sales: {
        Row: {
          card_amount: number | null
          cash_amount: number | null
          cashier_employee_id: string | null
          created_at: string
          discount_total: number
          fiscal_receipt_number: string | null
          id: string
          internal_id: string
          payment_method: Database["public"]["Enums"]["payment_method"]
          status: Database["public"]["Enums"]["sale_status"]
          total: number
        }
        Insert: {
          card_amount?: number | null
          cash_amount?: number | null
          cashier_employee_id?: string | null
          created_at?: string
          discount_total?: number
          fiscal_receipt_number?: string | null
          id?: string
          internal_id: string
          payment_method?: Database["public"]["Enums"]["payment_method"]
          status?: Database["public"]["Enums"]["sale_status"]
          total?: number
        }
        Update: {
          card_amount?: number | null
          cash_amount?: number | null
          cashier_employee_id?: string | null
          created_at?: string
          discount_total?: number
          fiscal_receipt_number?: string | null
          id?: string
          internal_id?: string
          payment_method?: Database["public"]["Enums"]["payment_method"]
          status?: Database["public"]["Enums"]["sale_status"]
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "sales_cashier_employee_id_fkey"
            columns: ["cashier_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_receipt_items: {
        Row: {
          cost_price: number
          created_at: string
          id: string
          product_id: string
          quantity: number
          receipt_id: string
          variant_code: string | null
        }
        Insert: {
          cost_price?: number
          created_at?: string
          id?: string
          product_id: string
          quantity: number
          receipt_id: string
          variant_code?: string | null
        }
        Update: {
          cost_price?: number
          created_at?: string
          id?: string
          product_id?: string
          quantity?: number
          receipt_id?: string
          variant_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_receipt_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_receipt_items_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "stock_receipts"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_receipt_items_depozit: {
        Row: {
          cost_price: number
          created_at: string
          id: string
          product_id: string
          quantity: number
          receipt_id: string
          variant_code: string | null
        }
        Insert: {
          cost_price?: number
          created_at?: string
          id?: string
          product_id: string
          quantity: number
          receipt_id: string
          variant_code?: string | null
        }
        Update: {
          cost_price?: number
          created_at?: string
          id?: string
          product_id?: string
          quantity?: number
          receipt_id?: string
          variant_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_receipt_items_depozit_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_receipt_items_depozit_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "stock_receipts_depozit"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_receipts: {
        Row: {
          created_at: string
          employee_id: string | null
          id: string
          notes: string | null
        }
        Insert: {
          created_at?: string
          employee_id?: string | null
          id?: string
          notes?: string | null
        }
        Update: {
          created_at?: string
          employee_id?: string | null
          id?: string
          notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_receipts_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_receipts_depozit: {
        Row: {
          created_at: string
          employee_id: string | null
          id: string
          notes: string | null
        }
        Insert: {
          created_at?: string
          employee_id?: string | null
          id?: string
          notes?: string | null
        }
        Update: {
          created_at?: string
          employee_id?: string | null
          id?: string
          notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_receipts_depozit_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_removals: {
        Row: {
          created_at: string
          employee_id: string
          id: string
          product_id: string
          quantity: number
          reason: string | null
          variant_code: string | null
        }
        Insert: {
          created_at?: string
          employee_id: string
          id?: string
          product_id: string
          quantity: number
          reason?: string | null
          variant_code?: string | null
        }
        Update: {
          created_at?: string
          employee_id?: string
          id?: string
          product_id?: string
          quantity?: number
          reason?: string | null
          variant_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_removals_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_removals_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_removals_depozit: {
        Row: {
          created_at: string
          employee_id: string
          id: string
          product_id: string
          quantity: number
          reason: string | null
          variant_code: string | null
        }
        Insert: {
          created_at?: string
          employee_id: string
          id?: string
          product_id: string
          quantity: number
          reason?: string | null
          variant_code?: string | null
        }
        Update: {
          created_at?: string
          employee_id?: string
          id?: string
          product_id?: string
          quantity?: number
          reason?: string | null
          variant_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_removals_depozit_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_removals_depozit_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_transfers: {
        Row: {
          created_at: string
          direction: string
          employee_id: string | null
          id: string
          notes: string | null
          product_id: string
          quantity: number
          variant_code: string | null
        }
        Insert: {
          created_at?: string
          direction?: string
          employee_id?: string | null
          id?: string
          notes?: string | null
          product_id: string
          quantity: number
          variant_code?: string | null
        }
        Update: {
          created_at?: string
          direction?: string
          employee_id?: string | null
          id?: string
          notes?: string | null
          product_id?: string
          quantity?: number
          variant_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_transfers_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfers_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      system_settings: {
        Row: {
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      targets: {
        Row: {
          active: boolean
          created_at: string
          id: string
          period: string
          target_value: number
          type: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          period: string
          target_value: number
          type: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          period?: string
          target_value?: number
          type?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      generate_sale_internal_id: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "casier" | "depozit"
      payment_method: "numerar" | "card" | "mixt"
      sale_status: "pending_fiscal" | "fiscalizat" | "anulat"
      seasonal_tag: "permanent" | "iarna" | "vara" | "tranzitie"
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
  public: {
    Enums: {
      app_role: ["admin", "casier", "depozit"],
      payment_method: ["numerar", "card", "mixt"],
      sale_status: ["pending_fiscal", "fiscalizat", "anulat"],
      seasonal_tag: ["permanent", "iarna", "vara", "tranzitie"],
    },
  },
} as const
