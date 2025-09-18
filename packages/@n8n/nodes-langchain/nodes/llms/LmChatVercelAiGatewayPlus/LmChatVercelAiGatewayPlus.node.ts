import { ChatOpenAI, type ClientOptions } from '@langchain/openai';
import {
	NodeConnectionTypes,
	type INodeType,
	type INodeTypeDescription,
	type ISupplyDataFunctions,
	type SupplyData,
} from 'n8n-workflow';

import { getProxyAgent } from '@utils/httpProxyAgent';
import { getConnectionHintNoticeField } from '@utils/sharedFields';

import type { VercelAiGatewayPlusCredential } from '../../../types/types';
import { openAiFailedAttemptHandler } from '../../vendors/OpenAi/helpers/error-handling';
import { makeN8nLlmFailedAttemptHandler } from '../n8nLlmFailedAttemptHandler';
import { N8nLlmTracing } from '../N8nLlmTracing';

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

export class LmChatVercelAiGatewayPlus implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Vercel AI Gateway Plus Chat Model',
		name: 'lmChatVercelAiGatewayPlus',
		icon: { light: 'file:vercel.dark.svg', dark: 'file:vercel.svg' },
		group: ['transform'],
		version: [1],
		description:
			'Extended Vercel AI Gateway chat model with customizable headers and query parameters',
		defaults: {
			name: 'Vercel AI Gateway Plus Chat Model',
		},
		codex: {
			categories: ['AI'],
			subcategories: {
				AI: ['Language Models', 'Root Nodes'],
				'Language Models': ['Chat Models (Recommended)'],
			},
			resources: {
				primaryDocumentation: [
					{
						url: 'https://docs.n8n.io/integrations/builtin/cluster-nodes/sub-nodes/n8n-nodes-langchain.lmchatvercel/',
					},
				],
			},
		},

		inputs: [],

		outputs: [NodeConnectionTypes.AiLanguageModel],
		outputNames: ['Model'],
		credentials: [
			{
				name: 'vercelAiGatewayPlusApi',
				required: true,
			},
		],
		requestDefaults: {
			ignoreHttpStatusErrors: true,
			baseURL: '={{ $credentials?.url }}',
		},
		properties: [
			getConnectionHintNoticeField([NodeConnectionTypes.AiChain, NodeConnectionTypes.AiAgent]),
			{
				displayName:
					'If using JSON response format, you must include word "json" in the prompt in your chain or agent. Also, make sure to select latest models released post November 2023.',
				name: 'notice',
				type: 'notice',
				default: '',
				displayOptions: {
					show: {
						'/options.responseFormat': ['json_object'],
					},
				},
			},
			{
				displayName: 'Model',
				name: 'model',
				type: 'options',
				description: 'The model which will generate the completion',
				typeOptions: {
					loadOptions: {
						routing: {
							request: {
								method: 'GET',
								url: '/models',
							},
							output: {
								postReceive: [
									{
										type: 'rootProperty',
										properties: {
											property: 'data',
										},
									},
									{
										type: 'setKeyValue',
										properties: {
											name: '={{$responseItem.id}}',
											value: '={{$responseItem.id}}',
										},
									},
									{
										type: 'sort',
										properties: {
											key: 'name',
										},
									},
								],
							},
						},
					},
				},
				routing: {
					send: {
						type: 'body',
						property: 'model',
					},
				},
				default: 'openai/gpt-4o',
			},
			{
				displayName: 'User',
				name: 'user',
				type: 'string',
				default: '',
				description:
					'Identifier for the end user of your application to help with abuse monitoring and analytics',
			},
			{
				displayName: 'Options',
				name: 'options',
				placeholder: 'Add Option',
				description: 'Additional options to add',
				type: 'collection',
				default: {},
				options: [
					{
						displayName: 'Frequency Penalty',
						name: 'frequencyPenalty',
						default: 0,
						typeOptions: { maxValue: 2, minValue: -2, numberPrecision: 1 },
						description:
							"Positive values penalize new tokens based on their existing frequency in the text so far, decreasing the model's likelihood to repeat the same line verbatim",
						type: 'number',
					},
					{
						displayName: 'Maximum Number of Tokens',
						name: 'maxTokens',
						default: -1,
						description:
							'The maximum number of tokens to generate in the completion. Most models have a context length of 2048 tokens (except for the newest models, which support 32,768).',
						type: 'number',
						typeOptions: {
							maxValue: 32768,
						},
					},
					{
						displayName: 'Response Format',
						name: 'responseFormat',
						default: 'text',
						type: 'options',
						options: [
							{
								name: 'Text',
								value: 'text',
								description: 'Regular text response',
							},
							{
								name: 'JSON',
								value: 'json_object',
								description:
									'Enables JSON mode, which should guarantee the message the model generates is valid JSON',
							},
						],
					},
					{
						displayName: 'Presence Penalty',
						name: 'presencePenalty',
						default: 0,
						typeOptions: { maxValue: 2, minValue: -2, numberPrecision: 1 },
						description:
							"Positive values penalize new tokens based on whether they appear in the text so far, increasing the model's likelihood to talk about new topics",
						type: 'number',
					},
					{
						displayName: 'Sampling Temperature',
						name: 'temperature',
						default: 0.7,
						typeOptions: { maxValue: 2, minValue: 0, numberPrecision: 1 },
						description:
							'Controls randomness: Lowering results in less random completions. As the temperature approaches zero, the model will become deterministic and repetitive.',
						type: 'number',
					},
					{
						displayName: 'Timeout',
						name: 'timeout',
						default: 360000,
						description: 'Maximum amount of time a request is allowed to take in milliseconds',
						type: 'number',
					},
					{
						displayName: 'Max Retries',
						name: 'maxRetries',
						default: 2,
						description: 'Maximum number of retries to attempt',
						type: 'number',
					},
					{
						displayName: 'Top P',
						name: 'topP',
						default: 1,
						typeOptions: { maxValue: 1, minValue: 0, numberPrecision: 1 },
						description:
							'Controls diversity via nucleus sampling: 0.5 means half of all likelihood-weighted options are considered. We generally recommend altering this or temperature but not both.',
						type: 'number',
					},
				],
			},
		],
	};

	async supplyData(this: ISupplyDataFunctions, itemIndex: number): Promise<SupplyData> {
		const credentials =
			await this.getCredentials<VercelAiGatewayPlusCredential>('vercelAiGatewayPlusApi');

		const modelName = this.getNodeParameter('model', itemIndex) as string;

		const user = this.getNodeParameter('user', itemIndex, '') as string;

		const options = this.getNodeParameter('options', itemIndex, {}) as {
			frequencyPenalty?: number;
			maxTokens?: number;
			maxRetries: number;
			timeout: number;
			presencePenalty?: number;
			temperature?: number;
			topP?: number;
			responseFormat?: 'text' | 'json_object';
		};

		const baseURL = (credentials.url ?? '').replace(/\/+$/, '');

		const configuration: ClientOptions = {
			baseURL: baseURL || undefined,
			fetchOptions: baseURL
				? {
						dispatcher: getProxyAgent(baseURL),
					}
				: undefined,
			defaultHeaders: {
				'http-referer': 'https://n8n.io/',
				'x-title': 'n8n',
			},
		};

		const additionalHeaders = toRecord(credentials.additionalHeaders);
		if (additionalHeaders) {
			configuration.defaultHeaders = {
				...configuration.defaultHeaders,
				...additionalHeaders,
			};
		}

		const additionalQuery = toRecord(credentials.additionalQuery);
		if (additionalQuery) {
			configuration.defaultQuery = {
				...(configuration.defaultQuery ?? {}),
				...additionalQuery,
			};
		}

		const model = new ChatOpenAI({
			apiKey: credentials.apiKey,
			model: modelName,
			...options,
			timeout: options.timeout ?? 60000,
			maxRetries: options.maxRetries ?? 2,
			configuration,
			callbacks: [new N8nLlmTracing(this)],
			user: user || undefined,
			modelKwargs: options.responseFormat
				? {
						response_format: { type: options.responseFormat },
					}
				: undefined,
			onFailedAttempt: makeN8nLlmFailedAttemptHandler(this, openAiFailedAttemptHandler),
		});

		return {
			response: model,
		};
	}
}
