// node --import ./tests/register.mjs --test tests/      (see package.json "test")
// Makes `import "…/public/js/firebase.js"` resolve to the in-memory fake, so the REAL admin / loader code can run in Node.
import { register } from "node:module";
register("./hooks.mjs", import.meta.url);
