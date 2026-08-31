import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export const memberRoles = ["admin", "manager", "operator"] as const;
export type MemberRole = (typeof memberRoles)[number];

const claimsSchema = z.object({ sub: z.uuid(), email: z.string().email().optional() }).passthrough();
const roleSchema = z.enum(memberRoles);

export type OrganizationMember = {
  userId: string;
  email: string | null;
  organizationId: string;
  organizationName: string;
  role: MemberRole;
};

export type AuthorizationContext = {
  user: { id: string; email: string | null } | null;
  member: OrganizationMember | null;
};

function hasPublicSupabaseConfiguration() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}

export const getAuthorizationContext = cache(async (): Promise<AuthorizationContext> => {
  // A página institucional continua disponível em desenvolvimento mesmo antes
  // das variáveis públicas serem configuradas. As rotas privadas permanecem
  // bloqueadas pelo proxy e por requireOrganizationMember().
  if (!hasPublicSupabaseConfiguration()) return { user: null, member: null };

  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const claims = claimsSchema.safeParse(claimsData?.claims);

  if (claimsError || !claims.success) return { user: null, member: null };

  const user = { id: claims.data.sub, email: claims.data.email ?? null };
  const { data: membership, error: membershipError } = await supabase
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (membershipError) throw new Error("Não foi possível validar o vínculo do usuário.");
  if (!membership) return { user, member: null };

  const role = roleSchema.safeParse(membership.role);
  if (!role.success) return { user, member: null };

  const { data: organization, error: organizationError } = await supabase
    .from("organizations")
    .select("id, name, active")
    .eq("id", membership.organization_id)
    .eq("active", true)
    .maybeSingle();

  if (organizationError) throw new Error("Não foi possível validar a empresa do usuário.");
  if (!organization) return { user, member: null };

  return {
    user,
    member: {
      userId: user.id,
      email: user.email,
      organizationId: organization.id,
      organizationName: organization.name,
      role: role.data,
    },
  };
});

export async function requireOrganizationMember() {
  const context = await getAuthorizationContext();
  if (!context.user) redirect("/login");
  if (!context.member) redirect("/acesso-negado");
  return context.member;
}

export async function requireOrganizationRole(allowedRoles: readonly MemberRole[]) {
  const member = await requireOrganizationMember();
  if (!allowedRoles.includes(member.role)) redirect("/acesso-negado");
  return member;
}
