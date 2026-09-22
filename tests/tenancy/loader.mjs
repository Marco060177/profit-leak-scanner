import path from "node:path";
import { pathToFileURL } from "node:url";

export async function resolve(specifier, context, nextResolve) {
  if (context.parentURL?.endsWith("/app/services/authenticated-shopify-context.server.ts")) {
    if (specifier === "~/shopify.server") {
      return { shortCircuit: true, url: pathToFileURL(path.join(process.cwd(), "tests/tenancy/authenticate.stub.ts")).href };
    }
    if (specifier === "~/connectors/shopify/shopify-tenant-resolver.server") {
      return { shortCircuit: true, url: pathToFileURL(path.join(process.cwd(), "tests/tenancy/tenant-resolver.spy.ts")).href };
    }
  }
  if (specifier.startsWith("~/")) {
    const absolutePath = path.join(process.cwd(), "app", `${specifier.slice(2)}.ts`);
    return { shortCircuit: true, url: pathToFileURL(absolutePath).href };
  }
  if (specifier.startsWith(".") && !/\.[cm]?[jt]s$/.test(specifier)) {
    const absolutePath = path.resolve(path.dirname(new URL(context.parentURL).pathname.replace(/^\/(.:)/, "$1")), `${specifier}.ts`);
    return { shortCircuit: true, url: pathToFileURL(absolutePath).href };
  }
  return nextResolve(specifier, context);
}
