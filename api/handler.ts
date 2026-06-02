import { createServerEntry } from "@tanstack/react-start/server-entry";
import { router } from "../src/router";

export default createServerEntry({
  createRouter: () => router,
});
