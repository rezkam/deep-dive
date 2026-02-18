/**
 * Shared mock agent session for browser tests.
 *
 * Provides a canonical createMockSession() and related helpers used
 * across all browser test files. Single source of truth — update here
 * and all tests pick up the change automatically.
 */

import { handleEvent } from "../../../src/engine.js";
import type { AgentSessionEvent } from "@mariozechner/pi-coding-agent";
import { evAgentStart, evAgentEnd, evMessageStart, evTextDelta, evTextEnd, evMessageEnd } from "../../helpers/events.js";

export const MARKDOWN_SUFFIX =
	"\n\n[Respond in well-structured markdown. Use headings (##), bullet lists, fenced code blocks with language tags (```ts), tables, bold/italic for emphasis. Keep responses clear and organized.]";

export function createMockSession(modelOverride?: { id: string; provider: string }) {
	const subscribers: Array<(event: AgentSessionEvent) => void> = [];
	let aborted = false;
	const promptCalls: string[] = [];
	const currentModel = modelOverride ?? { id: "test-model", provider: "test" };

	return {
		subscribe(fn: (event: AgentSessionEvent) => void) {
			subscribers.push(fn);
			return () => {
				const idx = subscribers.indexOf(fn);
				if (idx >= 0) subscribers.splice(idx, 1);
			};
		},
		async prompt(text: string, _opts?: any) {
			promptCalls.push(text);
		},
		async abort() {
			aborted = true;
		},
		async setModel() {},
		_messages: [] as any[],
		get messages() { return this._messages; },
		get state() { return { messages: this._messages }; },
		get model() { return currentModel; },
		getSessionStats() {
			return {
				sessionFile: undefined as string | undefined,
				sessionId: "mock-session",
				userMessages: 0,
				assistantMessages: 0,
				toolCalls: 0,
				toolResults: 0,
				totalMessages: 0,
				tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
				cost: 0,
			};
		},
		_emit(event: AgentSessionEvent) { for (const fn of subscribers) fn(event); },
		_wasAborted: () => aborted,
		_resetAbort() { aborted = false; },
		_promptCalls: promptCalls,
	};
}

export type MockSession = ReturnType<typeof createMockSession>;

/** Push a user message into the mock session's message history. */
export function addUserMessage(session: MockSession, text: string) {
	session._messages.push({
		role: "user",
		content: [{ type: "text", text: text + MARKDOWN_SUFFIX }],
		timestamp: Date.now(),
	});
}

/** Push an assistant text message into the mock session's message history. */
export function addAssistantMessage(session: MockSession, text: string) {
	session._messages.push({
		role: "assistant",
		content: [{ type: "text", text }],
		usage: { input: 100, output: 50 },
		timestamp: Date.now(),
	});
}

/** Add the initial exploration messages (skipped by extractChatMessages). */
export function addExplorationMessages(session: MockSession) {
	session._messages.push({
		role: "user",
		content: [{ type: "text", text: "Explore the codebase..." }],
		timestamp: Date.now(),
	});
	session._messages.push({
		role: "assistant",
		content: [
			{ type: "toolCall", name: "bash", id: "tc1", arguments: { command: "find . -type f" } },
		],
		usage: { input: 500, output: 100 },
		timestamp: Date.now(),
	});
	session._messages.push({
		role: "toolResult",
		toolCallId: "tc1",
		toolName: "bash",
		content: [{ type: "text", text: "src/main.ts" }],
		timestamp: Date.now(),
	});
	session._messages.push({
		role: "assistant",
		content: [{ type: "text", text: "Document written." }],
		usage: { input: 1000, output: 200 },
		timestamp: Date.now(),
	});
}

/** Simulate a complete agent chat response with streaming events. */
export function simulateChatResponse(session: MockSession, userText: string, responseText: string) {
	addUserMessage(session, userText);

	handleEvent(evAgentStart());
	handleEvent(evMessageStart());

	const chunks = responseText.match(/.{1,20}/g) || [responseText];
	for (const chunk of chunks) {
		handleEvent(evTextDelta(chunk));
	}

	handleEvent(evTextEnd(responseText));
	handleEvent(evMessageEnd(responseText));

	addAssistantMessage(session, responseText);
	handleEvent(evAgentEnd());
}
