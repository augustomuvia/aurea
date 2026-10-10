import "server-only";
import { timingSafeEqual } from "node:crypto";

/** Autoriza chamadas do agendador: Authorization: Bearer <CRON_SECRET>. */
export function isCronAuthorized(authorization: string | null): boolean {
  const secret = process.env.CRON_SECRET ?? "";
  const given = authorization ?? "";
  const expected = `Bearer ${secret}`;
  return Boolean(secret) && given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}
