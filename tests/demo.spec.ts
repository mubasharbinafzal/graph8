import { test, expect } from "@playwright/test";
test("complete demo with explicit approval, reload recovery, and Graph8 handoff", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      name: "A goal is all you need. Let AI find the way.",
    }),
  ).toBeVisible();
  await page.screenshot({
    path: `test-results/mission-${test.info().project.name}.png`,
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Generate AI plan" }).click();
  await expect(
    page.getByRole("heading", { name: "Your AI mission plan" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Start Mission", exact: true })
    .click();
  await expect(page.getByText("Your mission, in motion.")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Approve & book meeting" }),
  ).toBeVisible({ timeout: 30000 });
  await page.screenshot({
    path: `test-results/command-${test.info().project.name}.png`,
    fullPage: true,
    animations: "disabled",
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    ),
  ).toBe(false);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Approve & book meeting" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Lead Intelligence" }).click();
  await expect(
    page.getByRole("heading", { name: "Lumio", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("92", { exact: true })).toBeVisible();
  await expect(page.getByText("INTERESTED", { exact: true })).toBeVisible();
  await expect(page.getByText("“I'd like to see a demo”")).toBeVisible();
  await page.screenshot({
    path: `test-results/intelligence-${test.info().project.name}.png`,
    fullPage: true,
    animations: "disabled",
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    ),
  ).toBe(false);
  await page.getByRole("button", { name: "Approve & book meeting" }).click();
  await expect(
    page.getByRole("heading", { name: "From a goal to a real opportunity." }),
  ).toBeVisible();
  for (const number of ["128", "34", "1"])
    await expect(page.getByText(number, { exact: true }).first()).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Open in Graph8" }),
  ).toHaveAttribute("href", "https://app.graph8.com");
  await expect(
    page.getByText("DEMO RESULTS · SIMULATED ACTIONS"),
  ).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
  expect(errors).toEqual([]);
  await page.screenshot({
    path: `test-results/result-${test.info().project.name}.png`,
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Start a new mission" }).click();
  await expect(
    page.getByRole("button", { name: "Generate AI plan" }),
  ).toBeVisible();
});
test("API failure is recoverable and does not fabricate a plan", async ({
  page,
}) => {
  await page.goto("/");
  await page.route("**/ai/mission/plan", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ detail: "AI service temporarily unavailable." }),
    }),
  );
  await page.getByRole("button", { name: "Generate AI plan" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "AI service temporarily unavailable.",
  );
  await expect(
    page.getByRole("button", { name: "Start Mission", exact: true }),
  ).toHaveCount(0);
  await page.unroute("**/ai/mission/plan");
  await page.getByRole("button", { name: "Generate AI plan" }).click();
  await expect(
    page.getByRole("button", { name: "Start Mission", exact: true }),
  ).toBeVisible();
});
