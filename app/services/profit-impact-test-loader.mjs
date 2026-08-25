import path from "node:path";
import { pathToFileURL } from "node:url";

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("~/")) {
    const absolutePath = path.join(process.cwd(), "app", `${specifier.slice(2)}.ts`);
    return {
      shortCircuit: true,
      url: pathToFileURL(absolutePath).href,
    };
  }
  return nextResolve(specifier, context);
}
