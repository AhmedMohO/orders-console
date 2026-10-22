// Uses an existing global Playwright installation via NODE_PATH; installs nothing.
import { chromium, expect } from "playwright/test";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { openTestDatabase } from "../../../packages/db/test/database.ts";
import { sql } from "../../../packages/db/src/index.ts";
const fixture = JSON.parse(
  readFileSync(process.env.BROWSER_FIXTURE || ".phase6-fixture.log", "utf8"),
);
const origin = "http://localhost:2001";
const summary = (id, name, status = "pending") => ({
  id,
  creatorId: fixture.adminId,
  customerName: name,
  customerEmail: `${id}@example.com`,
  status,
  totalCents: 1250,
  createdAt: "2026-01-01T00:00:00.000Z",
});
const json = (route, body, status = 200) =>
  route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });

(async () => {
  const db = await openTestDatabase();
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    async function check(name, fn) {
      try {
        await fn();
      } catch (error) {
        await page.screenshot({
          path: "phase6-browser-failure.png",
          fullPage: true,
        });
        console.error(
          "FAILED " + name,
          await page.locator("main").allTextContents(),
        );
        throw error;
      }
      console.log("PASS " + name);
    }
    async function signInWithoutReload() {
      const marker = crypto.randomUUID();
      await page.evaluate((value) => {
        window.phase6DocumentMarker = value;
      }, marker);
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      await expect(
        page.getByRole("heading", { name: "Orders", exact: true }),
      ).toBeVisible();
      assert.equal(
        await page.evaluate(() => window.phase6DocumentMarker),
        marker,
        "Login must preserve the document",
      );
    }
    await page.goto(origin + "/login");
    await check("keyboard labels and native focus order", async () => {
      await page.getByLabel("Email", { exact: true }).focus();
      await page.keyboard.press("Tab");
      await expect(page.getByLabel("Password", { exact: true })).toBeFocused();
    });
    await check(
      "invalid login is rejected by Zod before any request",
      async () => {
        let requests = 0;
        await page.route("**/api/auth/login", (route) => {
          requests++;
          return route.continue();
        });
        await page.locator("form").evaluate((form) => {
          form.noValidate = true;
        });
        await page.getByLabel("Email").fill("invalid");
        await page.getByLabel("Password", { exact: true }).fill("pass");
        await page
          .getByRole("button", { name: "Sign in", exact: true })
          .click();
        await expect(page.locator("form").getByRole("alert")).toHaveText(
          "Enter a valid email.",
        );
        await expect(page.getByLabel("Email", { exact: true })).toHaveAttribute(
          "aria-invalid",
          "true",
        );
        await expect(
          page.getByLabel("Email", { exact: true }),
        ).toHaveAccessibleDescription("Enter a valid email.");
        await expect(page.getByLabel("Email", { exact: true })).toBeFocused();
        assert.equal(requests, 0);
        await page.locator("form").evaluate((form) => {
          form.noValidate = false;
        });
        await page.unroute("**/api/auth/login");
      },
    );
    await page.getByLabel("Email").fill(fixture.adminEmail);
    await page.getByLabel("Password", { exact: true }).fill(fixture.password);
    const bootstrapReads = [];
    const recordBootstrapRead = (request) => {
      const url = new URL(request.url());
      if (
        request.method() === "GET" &&
        (url.pathname === "/api/auth/me" || url.pathname === "/api/orders")
      )
        bootstrapReads.push(url.pathname);
    };
    page.on("request", recordBootstrapRead);
    await signInWithoutReload();

    await check(
      "server renders initial orders without duplicate browser reads",
      async () => {
        await expect(page.getByTestId("order-total")).toBeVisible();
        assert.deepEqual(bootstrapReads, []);
        page.off("request", recordBootstrapRead);
        const sessionCookies = (await context.cookies(origin + "/api")).filter(
          (cookie) => cookie.name === "orders_access",
        );
        assert.equal(sessionCookies.length, 1);
        assert.equal(sessionCookies[0].path, "/");
        const response = await context.request.get(origin + "/");
        assert.equal(response.status(), 200);
        assert.match(response.headers()["cache-control"], /private|no-store/);
        assert.match(await response.text(), /<tbody[\s\S]*?Browser Customer/);
      },
    );

    await check(
      "search waits one second after the last edit and displays EGP",
      async () => {
        await expect(page.getByRole("status")).toContainText(
          "orders on this page",
        );
        await expect(page.locator("tbody")).toContainText("EGP");
        await expect(page.getByTestId("order-total")).toContainText(
          "Total (EGP)",
        );
        const searches = [];
        await page.route("**/api/orders?**", async (route) => {
          const search = new URL(route.request().url()).searchParams.get(
            "search",
          );
          if (search) searches.push({ search, at: Date.now() });
          return route.continue();
        });
        await page.getByLabel("Search customers").fill("Browser");
        await page.waitForTimeout(500);
        assert.equal(searches.length, 0);
        await page.getByLabel("Search customers").fill("Browser Customer 01");
        const editedAt = Date.now();
        await page.waitForTimeout(800);
        assert.equal(searches.length, 0);
        await expect.poll(() => searches.length).toBe(1);
        assert.equal(searches[0].search, "Browser Customer 01");
        assert(searches[0].at - editedAt >= 950);
        await expect(page.getByRole("status")).toContainText(
          "1 orders on this page",
        );
        await page.unroute("**/api/orders?**");
        await page.getByLabel("Search customers").fill("");
        await expect(page.getByRole("status")).toContainText(
          "50 orders on this page",
        );
      },
    );

    await check("latest filter wins", async () => {
      await page.evaluate(() => {
        window.phase6Fetch = window.fetch;
        window.fetch = (input, options) =>
          window.phase6Fetch(
            input,
            String(input).startsWith("/api/orders")
              ? { ...options, signal: undefined }
              : options,
          );
      });
      const held = [];
      await page.route("**/api/orders?**", async (route) => {
        const status = new URL(route.request().url()).searchParams.get(
          "status",
        );
        if (status === "pending" || status === "processing") {
          held.push(route);
          return;
        }
        await json(route, {
          items: [summary(900003, "Latest completed", "completed")],
          nextCursor: null,
        });
      });
      await page.getByLabel("Status", { exact: true }).selectOption("pending");
      await expect.poll(() => held.length).toBe(1);
      await page
        .getByLabel("Status", { exact: true })
        .selectOption("processing");
      await expect.poll(() => held.length).toBe(2);
      await page
        .getByLabel("Status", { exact: true })
        .selectOption("completed");
      await expect(
        page.getByRole("cell", { name: "Latest completed", exact: true }),
      ).toBeVisible();
      await held[0]
        .fulfill({
          status: 503,
          contentType: "application/json",
          body: '{"message":"Obsolete failure"}',
        })
        .catch(() => {});
      await json(held[1], {
        items: [summary(900002, "Obsolete processing")],
        nextCursor: null,
      }).catch(() => {});
      await expect(page.getByText("Obsolete failure")).toHaveCount(0);
      await expect(page.getByText("Obsolete processing")).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "Refresh", exact: true }),
      ).toBeEnabled();
      await page.unroute("**/api/orders?**");
      await page.evaluate(() => {
        window.fetch = window.phase6Fetch;
      });
      await page.getByLabel("Status", { exact: true }).selectOption("");
    });

    async function fillOrder(name) {
      await page.getByLabel("Customer name").fill(name);
      await page
        .getByLabel("Customer email")
        .fill("browser-create@example.com");
      await page.getByLabel("Description 1").fill("Phone order item");
      await page.getByLabel("Quantity 1").fill("2");
      await page.getByLabel("Unit price 1").fill("6.25");
    }

    await check(
      "pagination and reset work for both sorts and directions",
      async () => {
        await page.getByLabel("Rows per page").selectOption("10");
        for (const sort of ["createdAt", "totalCents"])
          for (const direction of ["asc", "desc"]) {
            await page.getByLabel("Sort by").selectOption(sort);
            await page.getByLabel("Direction").selectOption(direction);
            await expect(
              page.getByRole("button", { name: "Refresh", exact: true }),
            ).toBeEnabled();
            const first = await page
              .locator("tbody tr td:first-child")
              .allTextContents();
            assert.equal(first.length, 10);
            await page
              .getByRole("button", { name: "Next", exact: true })
              .click();
            await expect(
              page.getByText("Page 2", { exact: true }),
            ).toBeVisible();
            const second = await page
              .locator("tbody tr td:first-child")
              .allTextContents();
            assert.equal(first.filter((id) => second.includes(id)).length, 0);
            await page
              .getByRole("button", { name: "Previous", exact: true })
              .click();
            await expect(
              page.getByText("Page 1", { exact: true }),
            ).toBeVisible();
            assert.deepEqual(
              await page.locator("tbody tr td:first-child").allTextContents(),
              first,
            );
          }
        await page.getByLabel("Direction").selectOption("desc");
        await page.getByLabel("Sort by").selectOption("createdAt");
        await page.getByLabel("Rows per page").selectOption("50");
        await expect(
          page.getByRole("button", { name: "Refresh", exact: true }),
        ).toBeEnabled();
        await page.getByRole("button", { name: "Next", exact: true }).click();
        await expect(page.getByText("Page 2", { exact: true })).toBeVisible();
        await page
          .getByLabel("Status", { exact: true })
          .selectOption("completed");
        await expect(
          page.getByRole("button", { name: "Refresh", exact: true }),
        ).toBeEnabled();
        await expect(
          page.getByRole("button", { name: "Previous", exact: true }),
        ).toBeDisabled();
        await expect(page.getByText("Page 1", { exact: true })).toBeVisible();
        await page.getByLabel("Status", { exact: true }).selectOption("");
        await expect(page.getByText("Page 1", { exact: true })).toBeVisible();
        await expect(
          page.getByRole("button", { name: "Previous", exact: true }),
        ).toBeDisabled();
        await expect(
          page.getByRole("cell", { name: "Browser Customer 61", exact: true }),
        ).toBeVisible();
        await expect(
          page.getByRole("button", { name: "Refresh", exact: true }),
        ).toBeEnabled();
      },
    );

    await check("late Next cannot advance a different filter", async () => {
      await expect(
        page.getByRole("button", { name: "Refresh", exact: true }),
      ).toBeEnabled();
      let held;
      await page.route("**/api/orders?**", (route) => {
        if (new URL(route.request().url()).searchParams.has("after"))
          held = route;
        else return route.continue();
      });
      await page.getByRole("button", { name: "Next", exact: true }).click();
      await expect.poll(() => Boolean(held)).toBe(true);
      await page
        .getByLabel("Status", { exact: true })
        .selectOption("completed");
      await expect(
        page.getByRole("button", { name: "Refresh", exact: true }),
      ).toBeEnabled();
      await json(held, {
        items: [summary(999998, "Obsolete next page")],
        nextCursor: null,
      }).catch(() => {});
      await expect(page.getByText("Page 1", { exact: true })).toBeVisible();
      await expect(
        page.getByRole("cell", { name: "Obsolete next page", exact: true }),
      ).toHaveCount(0);
      await page.unroute("**/api/orders?**");
      await page.getByLabel("Status", { exact: true }).selectOption("");
      await expect(
        page.getByRole("button", { name: "Refresh", exact: true }),
      ).toBeEnabled();
    });

    await check(
      "failed Next preserves the successful page and retries the same cursor",
      async () => {
        const first = await page
          .locator("tbody tr td:first-child")
          .allTextContents();
        const cursors = [];
        await page.route("**/api/orders?**", async (route) => {
          const after = new URL(route.request().url()).searchParams.get(
            "after",
          );
          if (!after) return route.continue();
          cursors.push(after);
          if (cursors.length === 1)
            return json(route, { message: "Temporary next-page failure" }, 503);
          return route.continue();
        });
        await page.getByRole("button", { name: "Next", exact: true }).click();
        await expect(
          page.getByText("Temporary next-page failure"),
        ).toBeVisible();
        assert.deepEqual(
          await page.locator("tbody tr td:first-child").allTextContents(),
          first,
        );
        await expect(
          page.getByRole("button", { name: "Previous", exact: true }),
        ).toBeDisabled();
        await page
          .getByRole("button", { name: "Retry list", exact: true })
          .click();
        await expect(page.getByText("Page 2", { exact: true })).toBeVisible();
        assert.equal(cursors[0], cursors[1]);
        await page.unroute("**/api/orders?**");
        await page
          .getByRole("button", { name: "Refresh", exact: true })
          .click();
        await expect(page.getByText("Page 1", { exact: true })).toBeVisible();
      },
    );
    await check(
      "deleted anchors and empty later pages preserve navigation",
      async () => {
        await expect(
          page.getByRole("button", { name: "Refresh", exact: true }),
        ).toBeEnabled();
        const ids = await page
          .locator("tbody tr td:first-child")
          .allTextContents();
        const anchorId = Number(ids.at(-1).replace("#", ""));
        assert.equal(
          (
            await context.request.delete(origin + "/api/orders/" + anchorId, {
              headers: { Origin: origin },
            })
          ).status(),
          204,
        );
        await page.getByRole("button", { name: "Next", exact: true }).click();
        await expect(page.getByText("Page 2", { exact: true })).toBeVisible();
        assert.equal(
          (
            await page.locator("tbody tr td:first-child").allTextContents()
          ).some((id) => ids.includes(id)),
          false,
        );
        await page
          .getByRole("button", { name: "Refresh", exact: true })
          .click();
        await expect(page.getByText("Page 1", { exact: true })).toBeVisible();
        await page.route("**/api/orders?**", (route) =>
          new URL(route.request().url()).searchParams.has("after")
            ? json(route, { items: [], nextCursor: null })
            : route.continue(),
        );
        await page.getByRole("button", { name: "Next", exact: true }).click();
        await expect(
          page.getByRole("heading", { name: "No orders found", exact: true }),
        ).toBeVisible();
        await expect(
          page.getByRole("button", { name: "Previous", exact: true }),
        ).toBeEnabled();
        await expect(
          page.getByRole("button", { name: "Refresh", exact: true }),
        ).toBeEnabled();
        await page
          .getByRole("button", { name: "Previous", exact: true })
          .click();
        await expect(
          page.getByRole("cell", { name: "Browser Customer 61", exact: true }),
        ).toBeVisible();
        await page.unroute("**/api/orders?**");
      },
    );

    await check(
      "item removal preserves remaining values and the live total",
      async () => {
        await fillOrder("Field array customer");
        await page
          .getByRole("button", { name: "Add item", exact: true })
          .click();
        await page.getByLabel("Description 2").fill("Second item");
        await page.getByLabel("Quantity 2").fill("3");
        await page.getByLabel("Unit price 2").fill("1.25");
        await expect(page.getByTestId("order-total")).toContainText("16.25");
        await page
          .getByRole("button", { name: "Remove item 1", exact: true })
          .click();
        await expect(page.getByLabel("Description 1")).toHaveValue(
          "Second item",
        );
        await expect(page.getByLabel("Quantity 1")).toHaveValue("3");
        await expect(page.getByLabel("Unit price 1")).toHaveValue("1.25");
        await expect(page.getByTestId("order-total")).toContainText("3.75");
        for (let count = 1; count < 5; count++)
          await page
            .getByRole("button", { name: "Add item", exact: true })
            .click();
        await expect(
          page.getByRole("button", { name: "Add item", exact: true }),
        ).toBeDisabled();
        for (let count = 5; count > 1; count--)
          await page
            .getByRole("button", { name: `Remove item ${count}`, exact: true })
            .click();
      },
    );

    await check("client rejects fractional cents before sending", async () => {
      let posts = 0;
      await page.route("**/api/orders", (route) => {
        if (route.request().method() === "POST") posts++;
        return route.continue();
      });
      await fillOrder("Invalid price customer");
      await page.getByLabel("Unit price 1").fill("1.005");
      await page
        .getByRole("button", { name: "Create order", exact: true })
        .click();
      await expect(
        page.getByText(
          "Price must be a number and with at most two decimal places.",
        ),
      ).toBeVisible();
      await expect(page.getByLabel("Unit price 1")).toHaveAccessibleDescription(
        "Price must be a number and with at most two decimal places.",
      );
      await expect(page.getByLabel("Unit price 1")).toBeFocused();
      assert.equal(posts, 0);
      await page.unroute("**/api/orders");
    });

    await check(
      "rejected create preserves confirmed rows and the editable draft",
      async () => {
        await page
          .getByRole("button", { name: "Refresh", exact: true })
          .click();
        await expect(
          page.getByRole("cell", { name: "Browser Customer 61", exact: true }),
        ).toBeVisible();
        let held;
        await page.route("**/api/orders", (route) => {
          if (route.request().method() === "POST") held = route;
          else return route.continue();
        });
        await fillOrder("Rejected customer");
        await page
          .getByRole("button", { name: "Create order", exact: true })
          .click();
        await expect(page.getByTestId("pending-attempt")).toContainText(
          "Saving order…",
        );
        await expect.poll(() => Boolean(held)).toBe(true);
        await expect(
          page.getByRole("cell", { name: "Rejected customer", exact: true }),
        ).toHaveCount(0);
        await json(held, { message: "Fixture validation rejection" }, 400);
        await expect(page.getByTestId("pending-attempt")).toHaveCount(0);
        await expect(page.getByLabel("Customer name")).toHaveValue(
          "Rejected customer",
        );
        await expect(
          page.getByRole("cell", { name: "Browser Customer 61", exact: true }),
        ).toBeVisible();
        await page.unroute("**/api/orders");
      },
    );

    await check(
      "creation waits for the server and a refreshed committed row appears only once",
      async () => {
        let held;
        await page.route("**/api/orders", (route) => {
          if (route.request().method() === "POST") held = route;
          else return route.continue();
        });
        await fillOrder("Server confirmed customer");
        const row = page.getByRole("cell", {
          name: "Server confirmed customer",
          exact: true,
        });
        await page
          .getByRole("button", { name: "Create order", exact: true })
          .click();
        await expect.poll(() => Boolean(held)).toBe(true);
        await expect(page.getByTestId("pending-attempt")).toContainText(
          "Saving order…",
        );
        await expect(row).toHaveCount(0);
        const response = await held.fetch();
        assert.equal(response.status(), 201);
        const committed = await response.json();
        // The list can observe the commit while the POST response is still withheld.
        await page
          .getByRole("button", { name: "Refresh", exact: true })
          .click();
        await expect(row).toHaveCount(1);
        await expect(page.getByTestId("pending-attempt")).toContainText(
          "Saving order…",
        );
        await held.fulfill({ response });
        await expect(page.getByTestId("pending-attempt")).toHaveCount(0);
        await expect(page.getByLabel("Customer name")).toHaveValue("");
        await expect(row).toHaveCount(1);
        await expect(page.getByText("Page 1", { exact: true })).toBeVisible();
        await page.unroute("**/api/orders");
        assert.equal(
          (
            await context.request.delete(
              origin + "/api/orders/" + committed.id,
              {
                headers: { Origin: origin },
              },
            )
          ).status(),
          204,
        );
        await page
          .getByRole("button", { name: "Refresh", exact: true })
          .click();
        await expect(row).toHaveCount(0);
      },
    );

    await check(
      "storage cleanup failure keeps a reachable recovery action",
      async () => {
        await page.evaluate(() => {
          window.phase6RemoveItem = Storage.prototype.removeItem;
          Storage.prototype.removeItem = function (key) {
            if (key.startsWith("orders.pending."))
              throw new Error("Storage blocked");
            return window.phase6RemoveItem.call(this, key);
          };
        });
        await page.route("**/api/orders", (route) =>
          route.request().method() === "POST"
            ? json(route, { message: "Fixture rejection" }, 400)
            : route.continue(),
        );
        await fillOrder("Storage cleanup customer");
        await page
          .getByRole("button", { name: "Create order", exact: true })
          .click();
        await expect(
          page.getByText(
            "The request was rejected, but local recovery could not be cleared. Retry after allowing session storage.",
          ),
        ).toBeVisible();
        await expect(
          page.getByRole("button", { name: "Retry submission", exact: true }),
        ).toBeVisible();
        await page.evaluate(() => {
          Storage.prototype.removeItem = window.phase6RemoveItem;
        });
        await page
          .getByRole("button", { name: "Retry submission", exact: true })
          .click();
        await expect(page.getByTestId("pending-attempt")).toHaveCount(0);
        await page.unroute("**/api/orders");
      },
    );

    await check(
      "double click and unknown outcome retry reuse the frozen operation",
      async () => {
        const attempts = [];
        let held;
        await page.route("**/api/orders", async (route) => {
          if (route.request().method() !== "POST") return route.continue();
          attempts.push({
            key: route.request().headers()["idempotency-key"],
            body: route.request().postDataJSON(),
          });
          held = route;
        });
        await fillOrder("Retry customer");
        await page
          .getByRole("button", { name: "Create order", exact: true })
          .evaluate((button) => {
            button.click();
            button.click();
          });
        await expect.poll(() => attempts.length).toBe(1);
        await expect(page.getByTestId("pending-attempt")).toBeVisible();
        await held.abort("failed");
        await expect(
          page.getByRole("button", { name: "Retry submission", exact: true }),
        ).toBeVisible();
        await page
          .getByLabel("Status", { exact: true })
          .selectOption("completed");
        await expect(page.getByTestId("pending-attempt")).toContainText(
          "Confirmation unknown",
        );
        await expect(page.getByLabel("Customer name")).toHaveValue(
          "Retry customer",
        );
        await page
          .getByRole("button", { name: "Retry submission", exact: true })
          .click();
        await expect.poll(() => attempts.length).toBe(2);
        assert.deepEqual(attempts[0], attempts[1]);
        const response = await held.fetch();
        await held.fulfill({ response });
        await expect(page.getByTestId("pending-attempt")).toHaveCount(0);
        await expect(page.getByLabel("Customer name")).toHaveValue("");
        await expect(page.getByLabel("Status", { exact: true })).toHaveValue(
          "completed",
        );
        await page.unroute("**/api/orders");
      },
    );

    await check(
      "rejected recovered submission restores an editable draft",
      async () => {
        let posts = 0;
        await page.route("**/api/orders", (route) => {
          if (route.request().method() !== "POST") return route.continue();
          return ++posts === 1
            ? route.abort("failed")
            : json(route, { message: "Recovered fixture rejection" }, 400);
        });
        await fillOrder("Recovered rejection customer");
        await page
          .getByRole("button", { name: "Create order", exact: true })
          .click();
        await expect(
          page.getByRole("button", { name: "Retry submission", exact: true }),
        ).toBeVisible();
        await page.reload();
        await page
          .getByRole("button", { name: "Retry submission", exact: true })
          .click();
        await expect(page.getByTestId("pending-attempt")).toHaveCount(0);
        await expect(page.getByLabel("Customer name")).toHaveValue(
          "Recovered rejection customer",
        );
        await expect(page.getByLabel("Description 1")).toHaveValue(
          "Phone order item",
        );
        await expect(page.getByLabel("Quantity 1")).toHaveValue("2");
        await expect(page.getByLabel("Unit price 1")).toHaveValue("6.25");
        await expect(page.getByLabel("Customer name")).toBeEnabled();
        await page.unroute("**/api/orders");
      },
    );

    await check("storage must succeed before sending a new order", async () => {
      let posts = 0;
      await page.route("**/api/orders", (route) => {
        if (route.request().method() === "POST") posts++;
        return route.continue();
      });
      await page.evaluate(() => {
        window.phase6SetItem = Storage.prototype.setItem;
        Storage.prototype.setItem = function (key, value) {
          if (key.startsWith("orders.pending."))
            throw new Error("Storage blocked");
          return window.phase6SetItem.call(this, key, value);
        };
      });
      await fillOrder("Not sent customer");
      await page
        .getByRole("button", { name: "Create order", exact: true })
        .click();
      await expect(
        page.getByText(
          "Recovery could not be saved. No request was sent. Allow session storage and retry.",
        ),
      ).toBeVisible();
      assert.equal(posts, 0);
      await expect(page.getByTestId("pending-attempt")).toHaveCount(0);
      await expect(page.getByLabel("Customer name")).toBeEnabled();
      await page.evaluate(() => {
        Storage.prototype.setItem = window.phase6SetItem;
      });
      await page.unroute("**/api/orders");
    });

    await check(
      "reload, logout retry and staff switch keep recovery isolated",
      async () => {
        let original;
        let committed;
        await page.route("**/api/orders", async (route) => {
          if (route.request().method() !== "POST") return route.continue();
          original = {
            key: route.request().headers()["idempotency-key"],
            body: route.request().postDataJSON(),
          };
          const response = await route.fetch();
          assert.equal(response.status(), 201);
          committed = await response.json();
          await route.abort("failed");
        });
        await fillOrder("Recovered phone customer");
        await page
          .getByRole("button", { name: "Create order", exact: true })
          .click();
        await expect(
          page.getByRole("button", { name: "Retry submission", exact: true }),
        ).toBeVisible();
        await page.unroute("**/api/orders");
        await page.reload();
        await expect(page.getByTestId("pending-attempt")).toContainText(
          "Confirmation unknown",
        );
        await expect(page.getByLabel("Customer name")).toHaveValue(
          "Recovered phone customer",
        );
        await page.route("**/api/auth/logout", (route) =>
          json(route, { message: "Temporary logout failure" }, 503),
        );
        await page
          .getByRole("button", { name: "Sign out", exact: true })
          .click();
        await expect(
          page.getByText("Sign out was not confirmed. Retry sign out."),
        ).toBeVisible();
        await expect(
          page.getByRole("heading", { name: "Orders", exact: true }),
        ).toBeVisible();
        await page.unroute("**/api/auth/logout");
        await page
          .getByRole("button", { name: "Sign out", exact: true })
          .click();
        await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
        await page
          .getByLabel("Email", { exact: true })
          .fill(fixture.agentEmail);
        await page
          .getByLabel("Password", { exact: true })
          .fill(fixture.password);
        await signInWithoutReload();
        await expect(page.getByTestId("pending-attempt")).toHaveCount(0);
        await expect(
          page.getByRole("button", { name: /^Delete order/ }),
        ).toHaveCount(0);
        await page
          .getByRole("button", { name: "Sign out", exact: true })
          .click();
        await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
        await page
          .getByLabel("Email", { exact: true })
          .fill(fixture.adminEmail);
        await page
          .getByLabel("Password", { exact: true })
          .fill(fixture.password);
        await signInWithoutReload();
        await expect(page.getByTestId("pending-attempt")).toContainText(
          "Confirmation unknown",
        );
        await expect(page.getByLabel("Customer name")).toHaveValue(
          "Recovered phone customer",
        );
        let retried;
        await page.route("**/api/orders", async (route) => {
          if (route.request().method() !== "POST") return route.continue();
          retried = {
            key: route.request().headers()["idempotency-key"],
            body: route.request().postDataJSON(),
          };
          return route.continue();
        });
        await page
          .getByRole("button", { name: "Retry submission", exact: true })
          .click();
        await expect(page.getByTestId("pending-attempt")).toHaveCount(0);
        assert.deepEqual(retried, original);
        const saved = await (
          await context.request.get(
            origin + "/api/orders?search=Recovered%20phone%20customer",
          )
        ).json();
        assert.equal(saved.items.length, 1);
        assert.equal(saved.items[0].id, committed.id);
        const {
          rows: [proof],
        } = await db.execute(sql`
          select response_body, response_status,
            (select count(*)::int from orders where creator_id = ${fixture.adminId}
              and customer_name = ${original.body.customerName}) as orders,
            (select count(*)::int from order_items where order_id = ${committed.id}) as items
          from idempotency_requests
          where creator_id = ${fixture.adminId} and key = ${original.key}`);
        assert.deepEqual(proof, {
          response_body: committed,
          response_status: 201,
          orders: 1,
          items: 1,
        });
        await page.unroute("**/api/orders");
      },
    );

    await page.getByLabel("Status", { exact: true }).selectOption("");
    await expect(
      page.getByRole("cell", { name: "Browser Customer 61", exact: true }),
    ).toBeVisible();
    await page.screenshot({ path: "phase6-desktop.png", fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: "phase6-mobile.png", fullPage: true });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
      true,
      "No mobile page overflow",
    );
    await page.setViewportSize({ width: 1440, height: 1000 });
    await check(
      "delete dialog supports keyboard cancellation and retryable 403/503 errors",
      async () => {
        const row = page.getByRole("row").filter({
          has: page.getByRole("cell", {
            name: "Browser Customer 61",
            exact: true,
          }),
        });
        const trigger = row.getByRole("button", { name: /^Delete order/ });
        await trigger.click();
        const dialog = page.getByRole("dialog");
        await expect(
          dialog.getByRole("button", { name: "Cancel", exact: true }),
        ).toBeFocused();
        await page.keyboard.press("Tab");
        await expect(
          dialog.getByRole("button", { name: "Delete order", exact: true }),
        ).toBeFocused();
        await page.keyboard.press("Escape");
        await expect(dialog).toHaveCount(0);
        await expect(trigger).toBeFocused();
        let attempts = 0;
        await page.route("**/api/orders/*", (route) =>
          route.request().method() === "DELETE"
            ? json(
                route,
                {
                  message:
                    ++attempts === 1
                      ? "Temporary delete failure"
                      : "Delete permission denied",
                },
                attempts === 1 ? 503 : 403,
              )
            : route.continue(),
        );
        await trigger.click();
        for (const message of [
          "Temporary delete failure",
          "Delete permission denied",
        ]) {
          await dialog
            .getByRole("button", { name: "Delete order", exact: true })
            .click();
          await expect(dialog.getByRole("alert")).toHaveText(message);
          await expect(row).toBeVisible();
        }
        await dialog
          .getByRole("button", { name: "Cancel", exact: true })
          .click();
        await page.unroute("**/api/orders/*");
      },
    );

    await check(
      "admin deletion refreshes the current query from its first page",
      async () => {
        await page.getByLabel("Search customers").fill("Browser Customer 61");
        const row = page.getByRole("row").filter({
          has: page.getByRole("cell", {
            name: "Browser Customer 61",
            exact: true,
          }),
        });
        await expect(row).toBeVisible();
        await row.getByRole("button", { name: /^Delete order/ }).click();
        await page
          .getByRole("dialog")
          .getByRole("button", { name: "Delete order", exact: true })
          .click();
        await expect(
          page.getByRole("heading", { name: "No orders found", exact: true }),
        ).toBeVisible();
        await expect(
          page.getByRole("button", { name: "Previous", exact: true }),
        ).toBeDisabled();
      },
    );
    await check("render failures show a recoverable error screen", async () => {
      await page.route("**/api/orders?**", (route) =>
        json(route, {
          items: [
            {
              ...summary(999998, "Invalid date customer"),
              createdAt: "invalid",
            },
          ],
          nextCursor: null,
        }),
      );
      await page.getByRole("button", { name: "Refresh", exact: true }).click();
      await expect(
        page.getByRole("heading", {
          name: "Unable to display this page",
          exact: true,
        }),
      ).toBeVisible();
      await expect(page.getByRole("main").getByRole("alert")).not.toContainText(
        "RangeError",
      );
      await page.unroute("**/api/orders?**");
      await page
        .getByRole("button", { name: "Try again", exact: true })
        .click();
      await expect(
        page.getByRole("heading", { name: "Orders", exact: true }),
      ).toBeVisible();
    });
    await check(
      "session revocation during submit preserves recovery for the same staff",
      async () => {
        let original;
        await page.route("**/api/orders", async (route) => {
          if (route.request().method() !== "POST") return route.continue();
          original = {
            key: route.request().headers()["idempotency-key"],
            body: route.request().postDataJSON(),
          };
          assert.equal(
            (
              await context.request.post(origin + "/api/auth/logout", {
                headers: { Origin: origin },
              })
            ).status(),
            204,
          );
          return route.continue();
        });
        await fillOrder("Session recovery customer");
        await page
          .getByRole("button", { name: "Create order", exact: true })
          .click();
        await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
        assert.deepEqual(
          await page.evaluate(
            (id) => JSON.parse(sessionStorage.getItem(`orders.pending.${id}`)),
            fixture.adminId,
          ),
          {
            staffId: fixture.adminId,
            key: original.key,
            input: original.body,
            state: "sending",
          },
        );
        await page.unroute("**/api/orders");
        await page
          .getByLabel("Email", { exact: true })
          .fill(fixture.adminEmail);
        await page
          .getByLabel("Password", { exact: true })
          .fill(fixture.password);
        await signInWithoutReload();
        await expect(page.getByTestId("pending-attempt")).toContainText(
          "Confirmation unknown",
        );
        let retried;
        await page.route("**/api/orders", (route) => {
          if (route.request().method() === "POST")
            retried = {
              key: route.request().headers()["idempotency-key"],
              body: route.request().postDataJSON(),
            };
          return route.continue();
        });
        await page
          .getByRole("button", { name: "Retry submission", exact: true })
          .click();
        await expect(page.getByTestId("pending-attempt")).toHaveCount(0);
        assert.deepEqual(retried, original);
        await expect(
          page.getByRole("cell", {
            name: "Session recovery customer",
            exact: true,
          }),
        ).toHaveCount(1);
        await page.unroute("**/api/orders");
      },
    );
    await check(
      "revoked session clears private data and ignores late responses",
      async () => {
        await page.evaluate(() => {
          window.phase6Fetch = window.fetch;
          window.fetch = (input, options) =>
            window.phase6Fetch(
              input,
              String(input).startsWith("/api/orders")
                ? { ...options, signal: undefined }
                : options,
            );
        });
        let held;
        await page.route("**/api/orders?**", (route) => {
          if (
            new URL(route.request().url()).searchParams.get("status") ===
            "pending"
          ) {
            held = route;
            return;
          }
          return route.continue();
        });
        await page
          .getByLabel("Status", { exact: true })
          .selectOption("pending");
        await expect.poll(() => Boolean(held)).toBe(true);
        assert.equal(
          (
            await context.request.post(origin + "/api/auth/logout", {
              headers: { Origin: origin },
            })
          ).status(),
          204,
        );
        await page
          .getByLabel("Status", { exact: true })
          .selectOption("completed");
        await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
        await json(held, {
          items: [summary(999999, "Late private customer")],
          nextCursor: null,
        }).catch(() => {});
        await expect(page.getByText("Late private customer")).toHaveCount(0);
        await expect(
          page.getByRole("heading", { name: "Orders", exact: true }),
        ).toHaveCount(0);
      },
    );
    assert.deepEqual(errors, [], "No uncaught browser errors");
  } finally {
    await browser?.close();
    await db.$client.end();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
