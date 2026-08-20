import "server-only";
import { ApifyClient } from "apify-client";
import { prisma } from "@/lib/prisma";

type ApifyFailure = { statusCode?: unknown; status?: unknown; message?: unknown };

function failureDetails(error: unknown) {
  const value = error as ApifyFailure;
  const status = Number(value?.statusCode ?? value?.status ?? 0);
  const message = String(value?.message ?? "").toLowerCase();
  return { status, message };
}

function isQuotaFailure(error: unknown) {
  const { status, message } = failureDetails(error);
  return status === 402 || status === 429 || /quota|usage limit|rate limit|insufficient.*credit|credit.*exceed/.test(message);
}

function isInvalidTokenFailure(error: unknown) {
  const { status, message } = failureDetails(error);
  return status === 401 || (/token|authentication|authorization/.test(message) && /invalid|expired|revoked|unauthorized/.test(message));
}

export async function withApifyClient<T>(operation: (client: ApifyClient) => Promise<T>): Promise<T> {
  const tokens = await prisma.mst_apify_tokens.findMany({
    where: { is_active: true, quota_exceeded_at: null },
    orderBy: [{ last_used_at: "asc" }, { created_at: "asc" }],
    select: { id: true, token: true },
  });

  if (!tokens.length) throw new Error("No active Apify token with available quota was found in mst_apify_tokens");

  let lastTokenError: unknown;
  for (const entry of tokens) {
    try {
      const result = await operation(new ApifyClient({ token: entry.token }));
      await prisma.mst_apify_tokens.update({ where: { id: entry.id }, data: { last_used_at: new Date() } });
      return result;
    } catch (error) {
      if (isQuotaFailure(error)) {
        await prisma.mst_apify_tokens.update({ where: { id: entry.id }, data: { quota_exceeded_at: new Date() } });
        lastTokenError = error;
        continue;
      }
      if (isInvalidTokenFailure(error)) {
        await prisma.mst_apify_tokens.update({ where: { id: entry.id }, data: { is_active: false } });
        lastTokenError = error;
        continue;
      }
      throw error;
    }
  }

  throw new Error(lastTokenError ? "All active Apify tokens are expired, invalid, or have exceeded their quota" : "No usable Apify token was found");
}
