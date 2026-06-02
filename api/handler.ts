import { createApp } from "@tanstack/react-start";
import { router } from "../src/router";
import type { VercelRequest, VercelResponse } from "@vercel/node";

const app = createApp({ router });

export default async (req: VercelRequest, res: VercelResponse) => {
  try {
    const response = await app.render({
      request: new Request(`http://${req.headers.host}${req.url}`, {
        method: req.method,
        headers: req.headers as Record<string, string>,
        body: req.method !== "GET" && req.method !== "HEAD" ? req.body : undefined,
      }),
    });

    res.statusCode = response.status;
    response.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });

    res.end(await response.text());
  } catch (error) {
    console.error(error);
    res.statusCode = 500;
    res.end("Internal Server Error");
  }
};
