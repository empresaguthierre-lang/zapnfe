"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const loginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(8).max(128),
});

export type LoginState = { error: string | null };

export async function loginAction(_state: LoginState, formData: FormData): Promise<LoginState> {
  const input = loginSchema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!input.success) return { error: "Informe um e-mail válido e uma senha com pelo menos 8 caracteres." };

  const supabase = await createClient().catch(() => null);
  if (!supabase) return { error: "Serviço de autenticação indisponível. Tente novamente mais tarde." };

  const { data, error } = await supabase.auth.signInWithPassword(input.data);
  if (error || !data.user) return { error: "E-mail ou senha inválidos." };

  const { data: membership, error: membershipError } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", data.user.id)
    .limit(1)
    .maybeSingle();

  if (membershipError || !membership) {
    await supabase.auth.signOut();
    return { error: "Esta conta ainda não possui acesso a uma empresa do ZapNFe." };
  }

  redirect("/pedidos");
}
