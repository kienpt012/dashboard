import { json, urlencoded } from 'express';

export const IOC_HTTP_BODY_LIMIT = '6mb';

type MiddlewareHost = {
  use: (...args: any[]) => unknown;
};

/**
 * Dashboard Studio can legitimately submit a sizeable, validated JSON layout.
 * Keep the limit explicit and bounded instead of relying on Express' 100 KB
 * default or accepting unbounded request bodies.
 */
export function installHttpBodyParsers(app: MiddlewareHost) {
  app.use(json({ limit: IOC_HTTP_BODY_LIMIT }));
  app.use(urlencoded({ limit: IOC_HTTP_BODY_LIMIT, extended: true }));
}
