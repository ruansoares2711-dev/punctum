export default async (req, res) => {
  try {
    // Importar dinamicamente o handler do servidor
    const { default: handler } = await import("../dist/server/index.js");

    if (typeof handler === "function") {
      // Se for uma função fetch padrão
      const request = new Request(`http://${req.headers.host}${req.url}`, {
        method: req.method,
        headers: req.headers,
        body: req.method !== "GET" && req.method !== "HEAD" ? req.body : undefined,
      });

      const response = await handler(request);

      res.status(response.status || 200);
      response.headers.forEach((value, key) => {
        res.setHeader(key, value);
      });

      const text = await response.text();
      res.end(text);
    } else if (handler && typeof handler.fetch === "function") {
      // Se for um objeto com método fetch (Cloudflare Worker style)
      const request = new Request(`http://${req.headers.host}${req.url}`, {
        method: req.method,
        headers: req.headers,
        body: req.method !== "GET" && req.method !== "HEAD" ? req.body : undefined,
      });

      const response = await handler.fetch(request);

      res.status(response.status || 200);
      response.headers.forEach((value, key) => {
        res.setHeader(key, value);
      });

      const text = await response.text();
      res.end(text);
    }
  } catch (error) {
    console.error("Handler error:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
