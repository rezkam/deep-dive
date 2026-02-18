/**
 * Shared Playwright page helpers for browser tests.
 *
 * Single source of truth for DOM interactions, waits, and assertions
 * used across all browser test files.
 *
 * Uses Playwright locators (getByTestId, getByRole, getByPlaceholder)
 * instead of raw CSS IDs or page.evaluate() — gets auto-retry and
 * better failure messages for free.
 */

import type { Page } from "@playwright/test";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

/** Create a unique temp directory for a browser test run. */
export function makeTempDir(prefix = "storyof-browser"): string {
	const id = crypto.randomBytes(8).toString("hex");
	const dir = path.join(os.tmpdir(), `${prefix}-${id}`);
	fs.mkdirSync(dir, { recursive: true });
	return dir;
}

/** Authenticate the browser by entering the token if the auth screen is visible. */
export async function authenticate(page: Page, token: string) {
	const authScreen = page.getByTestId("auth-screen");
	const isVisible = await authScreen.isVisible();

	if (isVisible) {
		await page.getByTestId("auth-input").fill(token);
		await page.getByTestId("auth-submit").click();
	}

	// Wait for auth screen to disappear (WebSocket connected)
	await authScreen.waitFor({ state: "hidden", timeout: 5000 });

	// Wait for pill text to confirm connection established
	const pill = page.locator("#pillText");
	await pill.waitFor({ state: "visible", timeout: 5000 });
	await pill.filter({ hasNotText: "connecting…" }).waitFor({ timeout: 5000 });
}

/** Get all chat bubble texts from the page. */
export async function getChatBubbles(page: Page): Promise<Array<{ role: string; text: string }>> {
	const bubbles = page.locator("[data-testid='chat-message']");
	const count = await bubbles.count();
	const result: Array<{ role: string; text: string }> = [];
	for (let i = 0; i < count; i++) {
		const el = bubbles.nth(i);
		const role = (await el.getAttribute("data-role")) ?? "unknown";
		const text = ((await el.textContent()) ?? "").trim();
		result.push({ role, text });
	}
	return result;
}

/** Count chat bubbles on the page. */
export async function countBubbles(page: Page): Promise<number> {
	return page.locator("[data-testid='chat-message']").count();
}

/** Wait for a user bubble containing specific text. */
export async function waitForUserBubble(page: Page, text: string, timeout = 5000) {
	await page
		.locator("[data-testid='chat-message'][data-role='user']")
		.filter({ hasText: text })
		.waitFor({ state: "visible", timeout });
}

/** Wait for a completed (non-streaming) assistant bubble containing specific text. */
export async function waitForAssistantBubble(page: Page, text: string, timeout = 5000) {
	await page
		.locator("[data-testid='chat-message'][data-role='assistant']:not(.streaming)")
		.filter({ hasText: text })
		.waitFor({ state: "visible", timeout });
}

/** Wait for at least `min` chat bubbles to appear in the timeline. */
export async function waitForBubbles(page: Page, min = 1, timeoutMs = 5000): Promise<void> {
	await page.waitForFunction(
		(n: number) =>
			document.querySelectorAll("[data-testid='chat-message']").length >= n,
		min,
		{ timeout: timeoutMs },
	);
}

/** Wait for any assistant text bubble (including streaming) containing text. */
export async function waitForAssistantText(page: Page, text: string, timeout = 5000) {
	await page
		.locator("[data-testid='chat-message'][data-role='assistant']")
		.filter({ hasText: text })
		.waitFor({ state: "visible", timeout });
}

/** Wait for a thinking block (details element or element with thinking class) to appear. */
export async function waitForThinkingBlock(page: Page, timeout = 5000) {
	await page.locator("[class*=thinking], details").first().waitFor({ state: "visible", timeout });
}

/** Wait for a tool card for a specific tool name to appear. */
export async function waitForToolCard(page: Page, toolName: string, timeout = 5000) {
	await page
		.locator("[class*=tool-card], .shrink-0")
		.filter({ hasText: toolName })
		.first()
		.waitFor({ state: "visible", timeout });
}
