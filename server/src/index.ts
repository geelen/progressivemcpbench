import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { mountMcpRoutes } from './mcp/router.js';

const app = new Hono();

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
