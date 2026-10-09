const FAKE = new URL("./memory-firebase.mjs", import.meta.url).href;
export async function resolve(specifier, context, nextResolve) {
  const r = await nextResolve(specifier, context);
  if (r.url.endsWith("/public/js/firebase.js")) return { url: FAKE, shortCircuit: true };
  return r;
}
