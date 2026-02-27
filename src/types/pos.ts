import { Database } from "@/integrations/supabase/types";

// Product from DB
export type Product = Database["public"]["Tables"]["products"]["Row"];
export type ProductVariant = Database["public"]["Tables"]["product_variants"]["Row"];
export type Employee = Database["public"]["Tables"]["employees"]["Row"];
export type Sale = Database["public"]["Tables"]["sales"]["Row"];
export type SaleItem = Database["public"]["Tables"]["sale_items"]["Row"];

// POS Cart item (client-side)
export interface CartItem {
  id: string; // temp client ID
  product: Product;
  variantCode: string | null;
  variantLabel: string | null;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  isGift: boolean;
  lineTotal: number;
}

export type POSMode = "public" | "casier";

export type PaymentMethod = "numerar" | "card" | "mixt";
