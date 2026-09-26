import { fixture as lowerLayerFixture } from "./d2b.fixtures";
import { getCanonicalEconomicDatasetTx } from "../../app/core/canonical-economic-dataset.server";

export async function fixture() {
  const base = await lowerLayerFixture();
  const policy = await base.db.currencyPolicyVersion.create({ data: {
    version: "d2d-test-v1", checksum: "d2d-policy-checksum", exponentSourceVersion: "ISO-4217-test",
    roundingMode: "REJECT", toleranceAtoms: 0n, toleranceScale: 2, residualPolicy: "SEPARATE", activatedAt: new Date("2026-01-01T00:00:00Z"),
  } });
  const read = (overrides: Record<string, unknown> = {}) => base.db.$transaction((tx) => getCanonicalEconomicDatasetTx(tx, {
    tenant: base.tenant, scope: { kind: "CHANNEL" },
    economicWindow: { startInclusive: new Date("2026-01-01T00:00:00Z"), endExclusive: new Date("2026-02-01T00:00:00Z") },
    currencyPolicyVersionId: policy.id, ...overrides,
  }));
  return { ...base, policy, read };
}
