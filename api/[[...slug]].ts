import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async (req: VercelRequest, res: VercelResponse) => {
  // Import dinâmico do servidor TanStack Start gerado
  const { default: handler } = await import("../dist/server/index.js");

  return handler(req, res);
};
