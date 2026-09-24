import path from "node:path";
import { pathToFileURL } from "node:url";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";

export async function resolve(specifier, context, nextResolve) {
  if ((context.parentURL?.endsWith("/app/routes/webhooks.app.uninstalled.tsx") ||
    context.parentURL?.endsWith("/app/routes/webhooks.shop.redact.ts")) && specifier === "~/shopify.server") {
    return { shortCircuit: true, url: pathToFileURL(path.join(process.cwd(), "tests/tenancy/authenticate.stub.ts")).href };
  }
  if (context.parentURL?.endsWith("/app/services/authenticated-shopify-context.server.ts")) {
    if (specifier === "~/shopify.server") {
      return { shortCircuit: true, url: pathToFileURL(path.join(process.cwd(), "tests/tenancy/authenticate.stub.ts")).href };
    }
    if (specifier === "~/connectors/shopify/shopify-tenant-resolver.server") {
      return { shortCircuit: true, url: pathToFileURL(path.join(process.cwd(), "tests/tenancy/tenant-resolver.spy.ts")).href };
    }
  }
  if (context.parentURL?.endsWith("/app/services/authenticated-shopify-webhook-context.server.ts")) {
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

export async function load(url, context, nextLoad) {
  if (url.endsWith("/app/routes/webhooks.app.uninstalled.tsx")) {
    return {
      format: "module", shortCircuit: true,
      source: stripTypeScriptTypes(readFileSync(new URL(url), "utf8")),
    };
  }
  return nextLoad(url, context);
}
