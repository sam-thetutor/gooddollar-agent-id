import type { Hono } from "hono";
import {
  catalogProxyConfigured,
  proxyCatalogRequest,
} from "@goodagent/runtime";

export interface CatalogProxyRouteOptions {
  catalogUrl: string;
  catalogSecret: string;
  internalAuth: (c: { req: { header: (name: string) => string | undefined } }) => boolean;
}

export function registerCatalogProxyRoutes(
  app: Hono,
  opts: CatalogProxyRouteOptions,
): void {
  const ready = () => catalogProxyConfigured(opts.catalogUrl, opts.catalogSecret);

  app.get("/internal/catalog/fixtures", async (c) => {
    if (!opts.internalAuth(c)) return c.json({ error: "UNAUTHORIZED" }, 401);
    if (!ready()) {
      return c.json(
        { error: "CATALOG_UNAVAILABLE", message: "Kasuku catalog is not configured." },
        503,
      );
    }
    const result = await proxyCatalogRequest({
      catalogUrl: opts.catalogUrl,
      catalogSecret: opts.catalogSecret,
      path: "/fixtures",
      method: "GET",
      query: new URL(c.req.url).searchParams.toString(),
    });
    return c.json(result.body, result.status as 200);
  });

  app.post("/internal/catalog/recommend", async (c) => {
    if (!opts.internalAuth(c)) return c.json({ error: "UNAUTHORIZED" }, 401);
    if (!ready()) {
      return c.json(
        { error: "CATALOG_UNAVAILABLE", message: "Kasuku catalog is not configured." },
        503,
      );
    }
    const body = await c.req.json().catch(() => ({}));
    const result = await proxyCatalogRequest({
      catalogUrl: opts.catalogUrl,
      catalogSecret: opts.catalogSecret,
      path: "/recommend",
      method: "POST",
      body,
    });
    return c.json(result.body, result.status as 200);
  });

  app.post("/internal/catalog/build-slip", async (c) => {
    if (!opts.internalAuth(c)) return c.json({ error: "UNAUTHORIZED" }, 401);
    if (!ready()) {
      return c.json(
        { error: "CATALOG_UNAVAILABLE", message: "Kasuku catalog is not configured." },
        503,
      );
    }
    const body = await c.req.json().catch(() => ({}));
    const result = await proxyCatalogRequest({
      catalogUrl: opts.catalogUrl,
      catalogSecret: opts.catalogSecret,
      path: "/build-slip",
      method: "POST",
      body,
    });
    return c.json(result.body, result.status as 200);
  });

  app.get("/internal/catalog/bookmakers", async (c) => {
    if (!opts.internalAuth(c)) return c.json({ error: "UNAUTHORIZED" }, 401);
    if (!ready()) {
      return c.json(
        { error: "CATALOG_UNAVAILABLE", message: "Kasuku catalog is not configured." },
        503,
      );
    }
    const result = await proxyCatalogRequest({
      catalogUrl: opts.catalogUrl,
      catalogSecret: opts.catalogSecret,
      path: "/bookmakers",
      method: "GET",
    });
    return c.json(result.body, result.status as 200);
  });

  app.post("/internal/catalog/book", async (c) => {
    if (!opts.internalAuth(c)) return c.json({ error: "UNAUTHORIZED" }, 401);
    if (!ready()) {
      return c.json(
        { error: "CATALOG_UNAVAILABLE", message: "Kasuku catalog is not configured." },
        503,
      );
    }
    const body = await c.req.json().catch(() => ({}));
    const result = await proxyCatalogRequest({
      catalogUrl: opts.catalogUrl,
      catalogSecret: opts.catalogSecret,
      path: "/book",
      method: "POST",
      body,
    });
    return c.json(result.body, result.status as 200);
  });
}
