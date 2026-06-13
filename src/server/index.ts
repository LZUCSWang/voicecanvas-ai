import 'dotenv/config';
import { serve } from '@hono/node-server';
import { createParserApp } from './app';

const port = Number(process.env.PORT ?? 8787);

serve(
  {
    fetch: createParserApp().fetch,
    port,
  },
  (info) => {
    console.info(`[modelscope-parser] listening on http://localhost:${info.port}`);
  },
);
