import path from "node:path";
import fs from "node:fs";
import { pathToFileURL } from "node:url";

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("~/")) {
    const absolutePath = path.join(process.cwd(), "app", `${specifier.slice(2)}.ts`);
    return {
      shortCircuit: true,
      url: pathToFileURL(absolutePath).href,
    };
  }
  if (
    specifier.startsWith(".") &&
    !/\.(?:[cm]?js|ts|json)$/.test(specifier)
  ) {
    const parentPath = new URL(context.parentURL).pathname.replace(/^\/(.:)/, "$1");
    const absolutePath = path.resolve(path.dirname(parentPath), `${specifier}.ts`);
    if (fs.existsSync(absolutePath)) {
      return { shortCircuit: true, url: pathToFileURL(absolutePath).href };
    }
  }
  return nextResolve(specifier, context);
}
