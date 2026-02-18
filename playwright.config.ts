import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
	testDir: "tests/browser",
	timeout: 30_000,
	retries: process.env.CI ? 2 : 0,
	workers: 1, // Serial — tests share port ranges; increase when worker-scoped fixtures land
	fullyParallel: false,
	forbidOnly: !!process.env.CI, // Prevent .only from being committed
	use: {
		headless: true,
		viewport: { width: 1280, height: 800 },
		// Debugging artifacts — only saved for failing tests (no disk waste on passing runs)
		trace: "retain-on-failure",
		screenshot: "only-on-failure",
		video: "retain-on-failure",
	},
	projects: [
		// Chromium always runs (fast feedback, primary target)
		{ name: "chromium", use: { ...devices["Desktop Chrome"] } },
		// Firefox + WebKit run in CI — on PRs use: npx playwright test --project=chromium
		// On main or full runs:   npx playwright test  (all 3)
		{ name: "firefox", use: { ...devices["Desktop Firefox"] } },
		{ name: "webkit", use: { ...devices["Desktop Safari"] } },
	],
	reporter: process.env.CI
		? [["dot"], ["json", { outputFile: "test-results/report.json" }]]
		: [["list"]],
	outputDir: "test-results",
});
