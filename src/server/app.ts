import { Hono } from 'hono';
import { createParserConfig, errorResponse, parseModelScopeCommand, type ParserConfig } from './modelscopeParser';
import { parseCommandRequestSchema } from './modelscopeSchemas';

export function createParserApp(configOverrides: Partial<ParserConfig> = {}) {
  const app = new Hono();

  app.post('/api/parse-command', async (context) => {
    const config = createParserConfig(configOverrides);
    const startedAt = config.now();
    let requestBody: unknown;

    try {
      requestBody = await context.req.json();
    } catch {
      const response = errorResponse(
        config,
        startedAt,
        config.model,
        400,
        'invalid_request',
        'Request body must be valid JSON.',
      );
      return context.json(response.body, response.status);
    }

    const parsedRequest = parseCommandRequestSchema.safeParse(requestBody);

    if (!parsedRequest.success) {
      const response = errorResponse(
        config,
        startedAt,
        config.model,
        400,
        'invalid_request',
        'Request body must match { text: string }.',
        parsedRequest.error.flatten(),
      );
      return context.json(response.body, response.status);
    }

    const response = await parseModelScopeCommand(parsedRequest.data, config);
    return context.json(response.body, response.status);
  });

  return app;
}
