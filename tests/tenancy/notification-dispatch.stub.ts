export const sentEmails: Array<{ to: string; subject: string }> = [];
let beforeBillingReturn: (() => Promise<void>) | null = null;
export function setBeforeBillingReturn(callback: (() => Promise<void>) | null) { beforeBillingReturn = callback; }
export const unauthenticated = {
  admin: async (_shop: string) => ({ admin: {}, session: { shop: _shop } }),
};
export async function getBillingStatus() {
  if (beforeBillingReturn) await beforeBillingReturn();
  return {};
}
export function hasStarterAccess() { return true; }
export async function sendEmail(input: { to: string; subject: string }) {
  sentEmails.push({ to: input.to, subject: input.subject });
  return { id: `stub-${sentEmails.length}` };
}
