import { createClient } from "@/lib/supabase/server";

export async function getOperationRestrictions(customerId: string, scope: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("customer_get_operation_restrictions", {
    p_customer_id: customerId,
    p_scope: scope
  });
  
  if (error) throw error;
  return data as {
    allowed: boolean;
    requires_approval: boolean;
    restrictions: Array<{
      id: string;
      module: string;
      severity: string;
      reason: string;
      created_at: string;
      created_by_name: string | null;
    }>;
  };
}

export async function getFiscalReadiness(orderId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fiscal_validate_order_readiness", {
    p_order_id: orderId
  });
  
  if (error) throw error;
  return data as {
    ready: boolean;
    errors: number;
    warnings: number;
    issues: Array<{
      code: string;
      severity: string;
      entity?: string;
      entity_id?: string;
      order_item_id?: string;
      message: string;
      action?: {
        label: string;
        href: string;
      }
    }>;
  };
}
