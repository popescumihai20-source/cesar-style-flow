
CREATE OR REPLACE FUNCTION public.get_admin_kpis()
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  SELECT json_build_object(
    'total_products', (SELECT COUNT(*) FROM products),
    'active_products', (SELECT COUNT(*) FROM products WHERE active = true),
    'low_stock_count', (SELECT COUNT(*) FROM products WHERE active = true AND stock_general > 0 AND stock_general <= 3),
    'zero_stock_count', (SELECT COUNT(*) FROM products WHERE active = true AND stock_general = 0),
    'sales_today_count', (SELECT COUNT(*) FROM sales WHERE created_at >= (CURRENT_DATE AT TIME ZONE 'Europe/Bucharest')::timestamptz AND status NOT IN ('anulat', 'returned')),
    'sales_today_total', (SELECT COALESCE(SUM(total), 0) FROM sales WHERE created_at >= (CURRENT_DATE AT TIME ZONE 'Europe/Bucharest')::timestamptz AND status NOT IN ('anulat', 'returned')),
    'sales_week_count', (SELECT COUNT(*) FROM sales WHERE created_at >= date_trunc('week', CURRENT_DATE)::timestamptz AND status NOT IN ('anulat', 'returned')),
    'sales_week_total', (SELECT COALESCE(SUM(total), 0) FROM sales WHERE created_at >= date_trunc('week', CURRENT_DATE)::timestamptz AND status NOT IN ('anulat', 'returned')),
    'sales_month_count', (SELECT COUNT(*) FROM sales WHERE created_at >= date_trunc('month', CURRENT_DATE)::timestamptz AND status NOT IN ('anulat', 'returned')),
    'sales_month_total', (SELECT COALESCE(SUM(total), 0) FROM sales WHERE created_at >= date_trunc('month', CURRENT_DATE)::timestamptz AND status NOT IN ('anulat', 'returned')),
    'pending_fiscal', (SELECT COUNT(*) FROM sales WHERE status = 'pending_fiscal')
  );
$$;
