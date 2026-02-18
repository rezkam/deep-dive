import { describe, it, expect, vi, beforeEach } from "vitest";
import { getOAuthProvider } from "@mariozechner/pi-ai";
import type { AuthStorage } from "@mariozechner/pi-coding-agent";
import { AuthService } from "./auth-service.js";
import { ValidationError } from "./errors.js";
import type { CLILogger } from "./logger.js";

type Credential =
	| { type: "api_key"; key: string }
	| { type: "oauth"; accessToken?: string; refreshToken?: string; expires?: number };

function makeLogger(): CLILogger {
	return {
		error: vi.fn(),
		newline: vi.fn(),
		section: vi.fn(),
		hint: vi.fn(),
		success: vi.fn(),
		keyValue: vi.fn(),
		info: vi.fn(),
	} as unknown as CLILogger;
}

function makeStorage(initial: Record<string, Credential> = {}) {
	const data: Record<string, Credential> = { ...initial };

	const storage = {
		set: vi.fn((provider: string, credential: Credential) => {
			data[provider] = credential;
		}),
		get: vi.fn((provider: string) => data[provider]),
		remove: vi.fn((provider: string) => {
			delete data[provider];
		}),
		list: vi.fn(() => Object.keys(data)),
		login: vi.fn(async (_provider: string) => {}),
	} as unknown as AuthStorage;

	return { storage, data };
}

const NOOP_CALLBACKS = {
	onAuth: () => {},
	onPrompt: async () => "",
};

describe("AuthService OAuth provider mapping", () => {
	let logger: CLILogger;
	let storage: AuthStorage;
	let service: AuthService;

	beforeEach(() => {
		logger = makeLogger();
		storage = makeStorage().storage;
		service = new AuthService(storage, logger);
	});

	it.each([
		["anthropic", "anthropic"],
		["github-copilot", "github-copilot"],
		["google", "google-gemini-cli"],
		["google-gemini-cli", "google-gemini-cli"],
		["antigravity", "google-antigravity"],
		["google-antigravity", "google-antigravity"],
		["openai-codex", "openai-codex"],
	] as const)("maps '%s' to '%s'", async (inputProvider, canonicalProvider) => {
		// Guard against upstream dependency/provider ID drift.
		expect(getOAuthProvider(canonicalProvider)).toBeDefined();

		await service.oauthLogin(inputProvider, NOOP_CALLBACKS);

		expect(storage.login).toHaveBeenCalledWith(canonicalProvider, NOOP_CALLBACKS);
	});

	it("rejects unsupported OAuth provider", async () => {
		await expect(service.oauthLogin("openai", NOOP_CALLBACKS)).rejects.toBeInstanceOf(ValidationError);
		expect(storage.login).not.toHaveBeenCalled();
	});
});

describe("AuthService credential listing", () => {
	it("shows empty state when no credentials exist", () => {
		const logger = makeLogger();
		const { storage } = makeStorage();
		const service = new AuthService(storage, logger);

		service.listCredentials();

		expect(logger.info).toHaveBeenCalledWith("No credentials stored.");
	});

	it("shows OAuth-only providers in list", () => {
		const logger = makeLogger();
		const { storage } = makeStorage({
			"google-antigravity": {
				type: "oauth",
				accessToken: "token",
				refreshToken: "refresh",
				expires: Date.now() + 3600_000,
			},
			"openai-codex": {
				type: "oauth",
				accessToken: "token2",
				refreshToken: "refresh2",
				expires: Date.now() + 3600_000,
			},
		});
		const service = new AuthService(storage, logger);

		service.listCredentials();

		expect(logger.info).toHaveBeenCalledWith("  ✓ antigravity (OAuth Token)");
		expect(logger.info).toHaveBeenCalledWith("  ✓ openai-codex (OAuth Token)");
	});
});
