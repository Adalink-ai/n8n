import type {
	ICredentialDataDecryptedObject,
	ICredentialTestRequest,
	ICredentialType,
	IHttpRequestOptions,
	INodeProperties,
} from 'n8n-workflow';

const toRecord = (value: unknown): Record<string, string> | undefined => {
	if (value === undefined || value === null) return undefined;

	let source: unknown = value;

	if (typeof value === 'string') {
		try {
			source = JSON.parse(value);
		} catch {
			return undefined;
		}
	}

	if (typeof source !== 'object' || source === null || Array.isArray(source)) return undefined;

	const entries = Object.entries(source as Record<string, unknown>).reduce<Record<string, string>>(
		(acc, [key, val]) => {
			if (val === undefined || val === null) return acc;

			acc[key] = typeof val === 'string' ? val : JSON.stringify(val);

			return acc;
		},
		{},
	);

	return Object.keys(entries).length > 0 ? entries : undefined;
};

export class VercelAiGatewayPlusApi implements ICredentialType {
	name = 'vercelAiGatewayPlusApi';

	displayName = 'Vercel AI Gateway Plus';

	documentationUrl = 'vercelaigateway';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key or OIDC Token',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			required: true,
			default: '',
			description: 'Your credentials for the Vercel AI Gateway',
		},
		{
			displayName: 'Base URL',
			name: 'url',
			type: 'string',
			required: true,
			default: 'https://ai-gateway.vercel.sh/v1',
			description: 'The base URL for your Vercel AI Gateway instance',
			placeholder: 'https://ai-gateway.vercel.sh/v1',
		},
		{
			displayName: 'Additional Headers',
			name: 'additionalHeaders',
			type: 'json',
			default: '',
			description:
				'Additional headers to include with every request as a JSON object, for example {"x-my-header": "value"}',
		},
		{
			displayName: 'Additional Query Parameters',
			name: 'additionalQuery',
			type: 'json',
			default: '',
			description:
				'Additional query parameters to include with every request as a JSON object, for example {"team": "blue"}',
		},
	];

	async authenticate(
		credentials: ICredentialDataDecryptedObject,
		requestOptions: IHttpRequestOptions,
	): Promise<IHttpRequestOptions> {
		if (typeof credentials.apiKey !== 'string' || credentials.apiKey === '') {
			throw new Error('API key is required for Vercel AI Gateway Plus.');
		}

		const apiKey = credentials.apiKey;

		const baseHeaders: Record<string, string> = {
			Authorization: `Bearer ${apiKey}`,
			'http-referer': 'https://n8n.io/',
			'x-title': 'n8n',
		};

		const additionalHeaders = await Promise.resolve(toRecord(credentials.additionalHeaders));

		requestOptions.headers = {
			...(requestOptions.headers ?? {}),
			...baseHeaders,
			...(additionalHeaders ?? {}),
		};

		const additionalQuery = await Promise.resolve(toRecord(credentials.additionalQuery));

		if (additionalQuery) {
			requestOptions.qs = {
				...(requestOptions.qs ?? {}),
				...additionalQuery,
			};
		}

		return requestOptions;
	}

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{ $credentials.url }}',
			url: '/chat/completions',
			method: 'POST',
			headers: {
				'http-referer': 'https://n8n.io/',
				'x-title': 'n8n',
			},
			body: {
				model: 'openai/gpt-4.1-nano',
				messages: [{ role: 'user', content: 'test' }],
				max_tokens: 1,
			},
		},
	};
}
