import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const configurationSchema = z.object({
  url: z.url(),
  secretKey: z.string().min(1),
  email: z.email().transform((value) => value.trim().toLowerCase()),
  password: z.string().min(12).max(128),
  organizationName: z.string().trim().min(2).max(120),
  organizationSlug: z
    .string()
    .trim()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
});

function readConfiguration() {
  return configurationSchema.parse({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    secretKey: process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY,
    email: process.env.BOOTSTRAP_ADMIN_EMAIL,
    password: process.env.BOOTSTRAP_ADMIN_PASSWORD,
    organizationName: process.env.BOOTSTRAP_ORGANIZATION_NAME,
    organizationSlug: process.env.BOOTSTRAP_ORGANIZATION_SLUG,
  });
}

async function findUserByEmail(supabase, email) {
  const perPage = 100;

  for (let page = 1; page <= 100; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;

    const user = data.users.find((candidate) => candidate.email?.toLowerCase() === email);
    if (user) return user;
    if (data.users.length < perPage) return null;
  }

  throw new Error("Limite de busca de usuários excedido.");
}

async function ensureAdminUser(supabase, configuration) {
  const existingUser = await findUserByEmail(supabase, configuration.email);
  if (existingUser) return existingUser;

  const { data, error } = await supabase.auth.admin.createUser({
    email: configuration.email,
    password: configuration.password,
    email_confirm: true,
  });

  if (error) throw error;
  return data.user;
}

async function ensureOrganization(supabase, configuration) {
  const { data: existing, error: selectError } = await supabase
    .from("organizations")
    .select("id")
    .eq("slug", configuration.organizationSlug)
    .maybeSingle();

  if (selectError) throw selectError;
  if (existing) return existing;

  const { data, error } = await supabase
    .from("organizations")
    .insert({ name: configuration.organizationName, slug: configuration.organizationSlug })
    .select("id")
    .single();

  if (error) throw error;
  return data;
}

async function bootstrap() {
  const configuration = readConfiguration();
  const supabase = createClient(configuration.url, configuration.secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const user = await ensureAdminUser(supabase, configuration);
  const organization = await ensureOrganization(supabase, configuration);
  const { error } = await supabase.from("organization_members").upsert(
    { organization_id: organization.id, user_id: user.id, role: "admin" },
    { onConflict: "organization_id,user_id" },
  );

  if (error) throw error;
  console.log(`Administrador preparado para a organização ${configuration.organizationSlug}.`);
  console.log("Remova BOOTSTRAP_ADMIN_PASSWORD do .env.local antes de iniciar o aplicativo.");
}

bootstrap().catch((error) => {
  const message = error instanceof z.ZodError
    ? "Revise as variáveis BOOTSTRAP_* e as credenciais do Supabase no .env.local."
    : "O Supabase recusou o bootstrap. Confira a chave de serviço, o projeto vinculado e tente novamente.";

  console.error(`Bootstrap não concluído: ${message}`);
  process.exitCode = 1;
});
