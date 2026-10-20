import { expect, test } from "bun:test";
import { assertTestDatabase } from "./database.js";

const testUrl = "postgresql://staff:password@localhost/orders_test";
const developmentUrl = "postgresql://staff:password@localhost/orders";

test("refuses unsafe test targets before cleanup", () => {
  expect(() => assertTestDatabase(testUrl, developmentUrl, "orders_test", "test")).not.toThrow();
  for (const [target, dev, actual, mode] of [
    [testUrl, developmentUrl, "orders", "test"],
    [testUrl, developmentUrl, "orders_test", "development"],
    [developmentUrl, developmentUrl, "orders", "test"],
    [testUrl, testUrl.replace("localhost", "127.0.0.1"), "orders_test", "test"],
    [`${testUrl}?dbname=orders`, developmentUrl, "orders_test", "test"],
  ]) expect(() => assertTestDatabase(target, dev, actual, mode)).toThrow();
});
