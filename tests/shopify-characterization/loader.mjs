import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export async function resolve(specifier, context, nextResolve) {
  if (context.parentURL?.endsWith("/app/utils/margin.server.ts")) {
    if (specifier === "~/core/canonical-profit-result") {
      return {
        shortCircuit: true,
        url: pathToFileURL(path.join(process.cwd(), "tests/shopify-characterization/canonical-boundary.spy.ts")).href,
      };
    }
    if (specifier === "~/core/legacy-margin-projection") {
      return {
        shortCircuit: true,
        url: pathToFileURL(path.join(process.cwd(), "tests/shopify-characterization/legacy-projection.spy.ts")).href,
      };
    }
  }
  if (specifier === "~/utils/tax-profile.server") {
    return {
      shortCircuit: true,
      url: pathToFileURL(
        path.join(process.cwd(), "tests/shopify-characterization/tax-profile.stub.ts"),
      ).href,
    };
  }

  if (specifier.startsWith("~/")) {
    const absolutePath = path.join(process.cwd(), "app", `${specifier.slice(2)}.ts`);
    return { shortCircuit: true, url: pathToFileURL(absolutePath).href };
  }

  if (specifier.startsWith(".") && !/\.(?:[cm]?js|ts|json)$/.test(specifier)) {
    const parentPath = new URL(context.parentURL).pathname.replace(/^\/(.:)/, "$1");
    const absolutePath = path.resolve(path.dirname(parentPath), `${specifier}.ts`);
    if (fs.existsSync(absolutePath)) {
      return { shortCircuit: true, url: pathToFileURL(absolutePath).href };
    }
  }

  return nextResolve(specifier, context);
}
