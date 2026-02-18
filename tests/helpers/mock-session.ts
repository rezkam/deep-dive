/**
 * Typed mock session factory for integration and unit tests.
 *
 * Provides a MockSession object that satisfies AgentSession structurally
 * without requiring an actual class instance (avoids `as any` casts).
 *
 * Usage:
 *   import { createMockSession, mockSessionFactory } from "../helpers/mock-session.js";
 *
 *   const { factory, session } = mockSessionFactory();
 *   handleEvent(evAgentStart());         // triggers subscribed listeners
 *   session._emit(evAgentEnd());          // directly fire an event
 *   expect(session._wasAborted()).toBe(false);
 *   expect(session._promptCalls).toHaveLength(1);
 */

import type { AgentSession, AgentSessionEvent } from "@mariozechner/pi-coding-agent";
import type { SessionFactory } from "../../src/engine.js";

// ── Public test interface ──────────────────────────────────────────────────

/**
 * A test-friendly mock session with extra inspection hooks.
 * Defined as a standalone interface (not an intersection with AgentSession)
 * to avoid `never` type when AgentSession private members are involved.
 */
export interface MockSession {
	// AgentSession public interface (subset used by the engine)
	subscribe(listener: (event: AgentSessionEvent) => void): () => void;
	prompt(text: string, opts?: unknown): Promise<void>;
	abort(): Promise<void>;
	setModel(model: unknown): Promise<void>;
	getActiveToolNames(): string[];
	getSessionStats(): {
		sessionFile: string | undefined;
		sessionId: string;
		userMessages: number;
		assistantMessages: number;
		toolCalls: number;
		inputTokens: number;
		outputTokens: number;
		totalCost: number;
	};
	aborted: boolean;
	messages: unknown[];
	state: { messages: unknown[] };

	// Test-control extras
	/** Fire an event to all subscribers — simulates real session events. */
	_emit(event: AgentSessionEvent): void;
	/** Returns true if abort() was called at least once. */
	_wasAborted(): boolean;
	/** All text strings passed to prompt() — for assertion. */
	_promptCalls: string[];
	/** Direct access to messages array — for pushing fake chat history. */
	_messages: unknown[];
}

// ── Factory ───────────────────────────────────────────────────────────────

/**
 * Creates a minimal mock AgentSession for tests.
 *
 * The mock is structurally compatible with AgentSession:
 * - subscribe() collects listeners; _emit() fires them
 * - prompt() records calls in _promptCalls; does not run any AI
 * - abort() sets aborted flag; _wasAborted() returns it
 * - setModel() is a no-op
 */
export function createMockSession(): MockSession {
	const subscribers: Array<(event: AgentSessionEvent) => void> = [];
	let aborted = false;
	const promptCalls: string[] = [];
	const messages: unknown[] = [];

	const session: MockSession = {
		// ── AgentSession interface ─────────────────────────────────────────
		subscribe(fn) {
			subscribers.push(fn);
			return () => {
				const idx = subscribers.indexOf(fn);
				if (idx >= 0) subscribers.splice(idx, 1);
			};
		},
		prompt: async (text: string) => {
			promptCalls.push(text);
		},
		abort: async () => { aborted = true; },
		setModel: async () => {},
		getActiveToolNames: () => [],
		getSessionStats: () => ({
			sessionFile: undefined,
			sessionId: "mock-session-id",
			userMessages: 0,
			assistantMessages: 0,
			toolCalls: 0,
			inputTokens: 0,
			outputTokens: 0,
			totalCost: 0,
		}),
		aborted: false,
		get messages() { return messages; },
		get state() { return { messages }; },

		// ── Test-control extras ────────────────────────────────────────────
		_emit(event: AgentSessionEvent) {
			for (const fn of subscribers) fn(event);
		},
		_wasAborted: () => aborted,
		_promptCalls: promptCalls,
		_messages: messages,
	};

	return session;
}

/**
 * Creates a SessionFactory that always returns the same mock session.
 * Useful for testing normal (non-crashing) engine lifecycle.
 *
 * @returns `{ factory, session }` — session is fully typed with test extras.
 */
export function mockSessionFactory(): {
	factory: SessionFactory;
	session: MockSession;
} {
	const session = createMockSession();
	const factory: SessionFactory = async () => session as unknown as AgentSession;
	return { factory, session };
}

/**
 * Creates a SessionFactory that fails N times then succeeds.
 * Useful for testing crash recovery and restart logic.
 *
 * @param opts.failCount - Number of times to throw before returning a session (default: 0)
 * @param opts.failError - Error message to throw (default: generic message)
 */
export function failingSessionFactory(opts: {
	failCount?: number;
	failError?: string;
} = {}): {
	factory: SessionFactory;
	readonly callCount: number;
	sessions: MockSession[];
} {
	let callCount = 0;
	const sessions: MockSession[] = [];

	const factory: SessionFactory = async () => {
		callCount++;
		if (opts.failCount !== undefined && opts.failCount > 0 && callCount <= opts.failCount) {
			throw new Error(opts.failError ?? `Session creation failed (attempt ${callCount})`);
		}
		const session = createMockSession();
		sessions.push(session);
		return session as unknown as AgentSession;
	};

	return {
		factory,
		get callCount() { return callCount; },
		sessions,
	};
}
