import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { mountMcpRoutes } from './mcp/router.js';
import { setAssets, type Env } from './data/filesystem.js';

const app = new Hono<{ Bindings: Env }>();

app.use('*', async (c, next) => {
  if (c.env?.ASSETS) {
    setAssets(c.env.ASSETS);
  }
  await next();
});

app.use(
  '*',
  cors({
    origin: '*',
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
  })
);

mountMcpRoutes(app);

export default app;
