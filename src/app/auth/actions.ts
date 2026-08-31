"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function logoutAction() {
  const supabase = await createClient().catch(() => null);
  if (supabase) await supabase.auth.signOut();
  redirect("/login");
}
