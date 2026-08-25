import { createHmac, timingSafeEqual } from "node:crypto";

export function hasValidMetaSignature(rawBody: string, signature: string | null, appSecret: string) {
  if (!signature?.startsWith("sha256=")) return false;
  const provided = Buffer.from(signature.slice(7), "hex");
  const expected = Buffer.from(createHmac("sha256", appSecret).update(rawBody).digest("hex"), "hex");
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}
