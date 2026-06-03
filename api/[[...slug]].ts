import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    // Import do handler gerado pelo TanStack Start
    const serverModule = await import("../dist/server/index.js");
    const serverHandler = serverModule.default;

    // Se for uma função, executar
    if (typeof serverHandler === "function") {
      return await serverHandler(req, res);
    }

    // Se for um objeto com method fetch, usar fetch
    if (serverHandler && typeof serverHandler.fetch === "function") {
      const request = new Request(`http://${req.headers.host}${req.url}`, {
        method: req.method,
        headers: req.headers as HeadersInit,
        body: ["GET", "HEAD"].includes(req.method) ? undefined : req.body,
      });

      const response = await serverHandler.fetch(request);
      res.status(response.status);

      response.headers.forEach((value, key) => {
        res.setHeader(key, value);
      });

      return res.end(await response.text());
    }

    res.status(500).end("Invalid server handler");
  } catch (error) {
    console.error("Handler error:", error);
    res.status(500).end("Internal Server Error");
  }
}
