import type { z } from 'zod';

export type OpenAICompatibleCredential = { apiKey: string; url: string };

export type VercelAiGatewayPlusCredential = OpenAICompatibleCredential & {
	additionalHeaders?: Record<string, unknown> | string;
	additionalQuery?: Record<string, unknown> | string;
};

export type ZodObjectAny = z.ZodObject<any, any, any, any>;
