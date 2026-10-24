export type EbayDeletionDiagnosticStage =
  | "APPLICATION_CONFIG"
  | "HMAC_CONFIG"
  | "BODY_VALIDATION"
  | "APPLICATION_TOKEN"
  | "PUBLIC_KEY_RETRIEVAL"
  | "SIGNATURE_VERIFICATION"
  | "INBOX_PERSISTENCE";

export type EbayDeletionDiagnosticCategory =
  | "CONFIGURATION_INVALID"
  | "REQUEST_INVALID"
  | "TRANSPORT_FAILURE"
  | "UPSTREAM_HTTP_ERROR"
  | "UPSTREAM_RESPONSE_INVALID"
  | "SIGNATURE_INVALID"
  | "IDEMPOTENCY_CONFLICT"
  | "PERSISTENCE_FAILURE"
  | "UNEXPECTED_FAILURE";

export type EbayDeletionDiagnostic = Readonly<{
  stage: EbayDeletionDiagnosticStage;
  category: EbayDeletionDiagnosticCategory;
  upstreamStatus?: number;
  durationMs: number;
}>;

export type EbayDeletionDiagnosticSink = (diagnostic: EbayDeletionDiagnostic) => void;

export const ebayDeletionDiagnosticSink: EbayDeletionDiagnosticSink = (diagnostic) => {
  const safe = {
    event: "EBAY_DELETION_NOTIFICATION_FAILED",
    stage: diagnostic.stage,
    category: diagnostic.category,
    ...(Number.isSafeInteger(diagnostic.upstreamStatus) && diagnostic.upstreamStatus! >= 100 &&
      diagnostic.upstreamStatus! <= 599 ? { upstreamStatus: diagnostic.upstreamStatus } : {}),
    durationMs: Math.max(0, Math.round(diagnostic.durationMs)),
  };
  console.error("[EBAY_DELETION_NOTIFICATION]", safe);
};

export const elapsedMilliseconds = (startedAt: number, now: () => number) =>
  Math.max(0, now() - startedAt);
