/**
 * Authentication service for CLI commands.
 */

import type { AuthStorage } from "@mariozechner/pi-coding-agent";
import { CLILogger } from "./logger.js";
import { ValidationError, AuthenticationError } from "./errors.js";
import { ENV_VAR_MAP, AUTH_PATH, APP_CMD } from "../constants.js";

interface OAuthProvider {
	id: string;
	canonicalId: string;
	name: string;
	subscription: string;
}

const OAUTH_PROVIDERS: OAuthProvider[] = [
	{
		id: "anthropic",
		canonicalId: "anthropic",
		name: "Anthropic Claude",
		subscription: "Claude Pro/Max or Claude Team",
	},
	{
		id: "github-copilot",
		canonicalId: "github-copilot",
		name: "GitHub Copilot",
		subscription: "GitHub Copilot Individual, Business, or Enterprise",
	},
	{
		id: "google",
		canonicalId: "google-gemini-cli",
		name: "Google Gemini CLI",
		subscription: "Google Gemini CLI access (via gcloud)",
	},
	{
		id: "antigravity",
		canonicalId: "google-antigravity",
		name: "Google Cloud Antigravity",
		subscription: "Google Cloud Project with Antigravity API enabled",
	},
	{
		id: "openai-codex",
		canonicalId: "openai-codex",
		name: "OpenAI Codex",
		subscription: "ChatGPT Plus/Pro or ChatGPT Team (OAuth flow)",
	},
];

const OAUTH_CANONICAL_BY_INPUT: Record<string, string> = {};
const OAUTH_PRIMARY_BY_CANONICAL: Record<string, string> = {};
const OAUTH_IDS_BY_CANONICAL: Record<string, string[]> = {};

for (const provider of OAUTH_PROVIDERS) {
	OAUTH_CANONICAL_BY_INPUT[provider.id] = provider.canonicalId;
	OAUTH_CANONICAL_BY_INPUT[provider.canonicalId] = provider.canonicalId;

	if (!OAUTH_PRIMARY_BY_CANONICAL[provider.canonicalId]) {
		OAUTH_PRIMARY_BY_CANONICAL[provider.canonicalId] = provider.id;
	}

	const ids = new Set(OAUTH_IDS_BY_CANONICAL[provider.canonicalId] ?? []);
	ids.add(provider.id);
	ids.add(provider.canonicalId);
	OAUTH_IDS_BY_CANONICAL[provider.canonicalId] = [...ids];
}

const API_KEY_PROVIDERS = Object.keys(ENV_VAR_MAP);

function resolveOAuthProviderId(input: string): string | undefined {
	return OAUTH_CANONICAL_BY_INPUT[input];
}

function getPrimaryOAuthProviderId(canonicalId: string): string {
	return OAUTH_PRIMARY_BY_CANONICAL[canonicalId] ?? canonicalId;
}

export class AuthService {
	constructor(
		private readonly storage: AuthStorage,
		private readonly logger: CLILogger,
	) {}

	async setApiKey(provider: string, key: string): Promise<void> {
		if (!API_KEY_PROVIDERS.includes(provider)) {
			this.logger.error(`Unknown provider: ${provider}`);
			this.logger.newline();
			this.logger.section("Supported providers:");
			this.showApiKeyProviders();
			this.logger.newline();
			this.logger.hint(`Run '${APP_CMD} auth --help' for more info`);
			this.logger.newline();
			throw new ValidationError(`Unknown provider: ${provider}`);
		}

		this.storage.set(provider, { type: "api_key", key });

		this.logger.success(`API key stored for ${provider}`);
		this.logger.hint(`Saved to: ${AUTH_PATH}`);
		this.logger.newline();
	}

	async oauthLogin(
		provider: string,
		callbacks: {
			onAuth: (info: { url: string; instructions?: string }) => void;
			onPrompt: (prompt: { message: string; isPassword?: boolean }) => Promise<string>;
		},
	): Promise<void> {
		const canonicalProvider = resolveOAuthProviderId(provider);
		if (!canonicalProvider) {
			this.logger.error(`Provider '${provider}' does not support OAuth login`);
			this.logger.newline();
			this.logger.section("Supported OAuth providers:");
			this.showOAuthProviders();
			this.logger.newline();
			this.logger.hint(`For API key providers, use: ${APP_CMD} auth set <provider> <key>`);
			this.logger.newline();
			throw new ValidationError(`OAuth not supported for: ${provider}`);
		}

		try {
			await this.storage.login(canonicalProvider, callbacks);
			this.logger.success(`Successfully authenticated with ${getPrimaryOAuthProviderId(canonicalProvider)}`);
			this.logger.newline();
		} catch (error) {
			this.logger.error(`Login failed: ${error}`);
			this.logger.newline();
			throw new AuthenticationError(`OAuth login failed for ${provider}`, String(error));
		}
	}

	async removeCredentials(provider: string): Promise<void> {
		const canonicalProvider = resolveOAuthProviderId(provider);

		if (canonicalProvider) {
			const ids = OAUTH_IDS_BY_CANONICAL[canonicalProvider] ?? [provider];
			for (const id of ids) {
				this.storage.remove(id);
			}
			this.logger.success(`Credentials removed for ${getPrimaryOAuthProviderId(canonicalProvider)}`);
		} else {
			this.storage.remove(provider);
			this.logger.success(`Credentials removed for ${provider}`);
		}

		this.logger.newline();
	}

	listCredentials(): void {
		const stored = this.storage.list().sort();

		if (stored.length === 0) {
			this.logger.info("No credentials stored.");
			this.logger.hint(`Use '${APP_CMD} auth set <provider> <key>' or '${APP_CMD} auth login <provider>'`);
			this.logger.newline();
			return;
		}

		this.logger.section("Stored credentials:");
		this.logger.newline();

		const seen = new Set<string>();
		for (const provider of stored) {
			const cred = this.storage.get(provider);
			if (!cred) continue;

			const canonicalProvider = resolveOAuthProviderId(provider);
			const displayProvider = canonicalProvider
				? getPrimaryOAuthProviderId(canonicalProvider)
				: provider;
			if (seen.has(displayProvider)) continue;
			seen.add(displayProvider);

			const type = cred.type === "oauth" ? "OAuth Token" : "API Key";
			this.logger.info(`  ✓ ${displayProvider} (${type})`);
		}
		this.logger.newline();
	}

	private showApiKeyProviders(): void {
		const providers = [
			["anthropic", "Anthropic Claude API"],
			["openai", "OpenAI API"],
			["google", "Google AI Studio (Gemini)"],
			["groq", "Groq API"],
			["xai", "xAI (Grok)"],
			["openrouter", "OpenRouter"],
			["mistral", "Mistral AI"],
			["cerebras", "Cerebras Cloud"],
			["github-copilot", "GitHub Copilot"],
		];

		for (const [id, desc] of providers) {
			this.logger.keyValue(id, desc);
		}
	}

	private showOAuthProviders(): void {
		for (const info of OAUTH_PROVIDERS) {
			this.logger.info(`  ${info.id.padEnd(18)} → ${info.name}`);
			this.logger.info(`  ${" ".repeat(18)}   ${info.subscription}`);
			this.logger.newline();
		}
	}
}
