import { createServerFn } from "@tanstack/react-start";

// Import do entry point do servidor gerado pelo TanStack Start
const serverEntry = await import("../dist/server/index.js");

export default serverEntry.default;
