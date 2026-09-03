export async function resolveSecret(credentialsReference?: string): Promise<{ apiToken?: string; requestTimeoutMs?: number }> {
  if (!credentialsReference) return {};
  const token = process.env.FOCUS_NFE_API_TOKEN;
  if (token) return { apiToken: token, requestTimeoutMs: 25000 };
  return {};
}
