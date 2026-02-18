import { describe, it, expect, beforeEach } from "vitest";
import { CostTracker } from "./cost-tracker.js";

describe("CostTracker", () => {
	let tracker: CostTracker;

	beforeEach(() => {
		tracker = new CostTracker();
	});

	// ── Model tracking ────────────────────────────────────────────────

	describe("model tracking", () => {
		it("defaults to 'unknown' model", () => {
			expect(tracker.getModel()).toBe("unknown");
		});

		it("setModel updates current model", () => {
			tracker.setModel("claude-opus-4-5");
			expect(tracker.getModel()).toBe("claude-opus-4-5");
		});

		it("recorded entries use the model at time of recording", () => {
			tracker.setModel("claude-sonnet-4-5");
			const entry = tracker.recordUsage({ input: 100, output: 50, cost: { total: 0.005 } });
			expect(entry.modelId).toBe("claude-sonnet-4-5");
		});

		it("model change does not affect previous entries", () => {
			tracker.setModel("model-a");
			tracker.recordUsage({ input: 100, output: 50, cost: { total: 0.001 } });

			tracker.setModel("model-b");
			tracker.recordUsage({ input: 200, output: 100, cost: { total: 0.002 } });

			const { requestCount } = tracker.getTotals();
			expect(requestCount).toBe(2);
		});
	});

	// ── recordUsage ───────────────────────────────────────────────────

	describe("recordUsage", () => {
		it("records all token fields", () => {
			const entry = tracker.recordUsage({
				input: 1000,
				output: 500,
				cacheRead: 2000,
				cacheWrite: 300,
				cost: { total: 0.042 },
			});

			expect(entry.usage.input).toBe(1000);
			expect(entry.usage.output).toBe(500);
			expect(entry.usage.cacheRead).toBe(2000);
			expect(entry.usage.cacheWrite).toBe(300);
			expect(entry.cost).toBe(0.042);
		});

		it("defaults missing fields to 0", () => {
			const entry = tracker.recordUsage({});

			expect(entry.usage.input).toBe(0);
			expect(entry.usage.output).toBe(0);
			expect(entry.usage.cacheRead).toBe(0);
			expect(entry.usage.cacheWrite).toBe(0);
			expect(entry.cost).toBe(0);
		});

		it("records timestamp close to now", () => {
			const before = Date.now();
			const entry = tracker.recordUsage({ input: 1 });
			const after = Date.now();

			expect(entry.timestamp).toBeGreaterThanOrEqual(before);
			expect(entry.timestamp).toBeLessThanOrEqual(after);
		});

		it("uses cost.total when provided", () => {
			const entry = tracker.recordUsage({ cost: { total: 1.234 } });
			expect(entry.cost).toBe(1.234);
		});

		it("defaults cost to 0 when cost.total is absent", () => {
			const entry = tracker.recordUsage({ input: 500 });
			expect(entry.cost).toBe(0);
		});
	});

	// ── getTotals ─────────────────────────────────────────────────────

	describe("getTotals", () => {
		it("returns zeros for empty tracker", () => {
			const totals = tracker.getTotals();

			expect(totals.usage.input).toBe(0);
			expect(totals.usage.output).toBe(0);
			expect(totals.usage.cacheRead).toBe(0);
			expect(totals.usage.cacheWrite).toBe(0);
			expect(totals.cost).toBe(0);
			expect(totals.requestCount).toBe(0);
		});

		it("sums multiple entries", () => {
			tracker.recordUsage({ input: 100, output: 50, cost: { total: 0.001 } });
			tracker.recordUsage({ input: 200, output: 100, cost: { total: 0.002 } });
			tracker.recordUsage({ input: 300, output: 150, cost: { total: 0.003 } });

			const totals = tracker.getTotals();

			expect(totals.usage.input).toBe(600);
			expect(totals.usage.output).toBe(300);
			expect(totals.cost).toBeCloseTo(0.006);
			expect(totals.requestCount).toBe(3);
		});

		it("sums cache tokens separately", () => {
			tracker.recordUsage({ cacheRead: 5000, cacheWrite: 1000 });
			tracker.recordUsage({ cacheRead: 3000, cacheWrite: 500 });

			const totals = tracker.getTotals();

			expect(totals.usage.cacheRead).toBe(8000);
			expect(totals.usage.cacheWrite).toBe(1500);
		});
	});

	// ── formatCost ────────────────────────────────────────────────────

	describe("formatCost", () => {
		it("formats zero as $0", () => {
			expect(CostTracker.formatCost(0)).toBe("$0");
		});

		it("formats sub-cent costs to 4 decimals", () => {
			expect(CostTracker.formatCost(0.0042)).toBe("$0.0042");
			expect(CostTracker.formatCost(0.001)).toBe("$0.0010");
		});

		it("formats sub-dollar costs to 3 decimals", () => {
			expect(CostTracker.formatCost(0.05)).toBe("$0.050");
			expect(CostTracker.formatCost(0.999)).toBe("$0.999");
		});

		it("formats dollar-plus costs to 2 decimals", () => {
			expect(CostTracker.formatCost(1.5)).toBe("$1.50");
			expect(CostTracker.formatCost(54.592)).toBe("$54.59");
		});
	});

	// ── formatStatusLine ──────────────────────────────────────────────

	describe("formatStatusLine", () => {
		const baseUsage = { input: 7200, output: 295000, cacheRead: 0, cacheWrite: 0 };

		it("includes input and output tokens", () => {
			const line = CostTracker.formatStatusLine(baseUsage, 0, "claude-opus-4-5");
			expect(line).toContain("↑7.2k");
			expect(line).toContain("↓295.0k");
		});

		it("omits cache fields when zero", () => {
			const line = CostTracker.formatStatusLine(baseUsage, 0, "some-model");
			expect(line).not.toContain("R");
			expect(line).not.toContain("W");
		});

		it("includes cache read/write when non-zero", () => {
			const usage = { input: 1000, output: 500, cacheRead: 80_000_000, cacheWrite: 3100 };
			const line = CostTracker.formatStatusLine(usage, 54.592, "model", "anthropic");
			expect(line).toContain("R80.0M");
			expect(line).toContain("W3.1k");
		});

		it("includes cost", () => {
			// 0.0123 >= 0.01 → 3 decimal places
			const line = CostTracker.formatStatusLine(baseUsage, 0.0123, "model");
			expect(line).toContain("$0.012");
		});

		it("includes model name", () => {
			const line = CostTracker.formatStatusLine(baseUsage, 0, "claude-sonnet-4-5");
			expect(line).toContain("claude-sonnet-4-5");
		});

		it("includes provider in parens when provided", () => {
			const line = CostTracker.formatStatusLine(baseUsage, 0, "gpt-4o", "openai");
			expect(line).toContain("(openai)");
		});

		it("omits provider parens when not provided", () => {
			const line = CostTracker.formatStatusLine(baseUsage, 0, "gpt-4o");
			expect(line).not.toContain("(");
		});
	});

	// ── token formatting (via formatStatusLine) ───────────────────────

	describe("token formatting", () => {
		const zeroCost = 0;
		const noCache = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

		it("formats small numbers as-is", () => {
			const usage = { ...noCache, input: 42 };
			expect(CostTracker.formatStatusLine(usage, zeroCost, "m")).toContain("↑42");
		});

		it("formats thousands with k suffix", () => {
			const usage = { ...noCache, input: 1500 };
			expect(CostTracker.formatStatusLine(usage, zeroCost, "m")).toContain("↑1.5k");
		});

		it("formats millions with M suffix", () => {
			const usage = { ...noCache, input: 2_500_000 };
			expect(CostTracker.formatStatusLine(usage, zeroCost, "m")).toContain("↑2.5M");
		});

		it("formats exactly 1000 as 1.0k", () => {
			const usage = { ...noCache, output: 1000 };
			expect(CostTracker.formatStatusLine(usage, zeroCost, "m")).toContain("↓1.0k");
		});
	});
});
