/**
 * Test Concurrent Orders (Race Condition & Idempotency Verification)
 *
 * Runs concurrent requests against the NestJS API with the exact same Idempotency-Key
 * to verify that only ONE order is created and race conditions are handled safely.
 *
 * Usage:
 *   bun apps/api/scripts/test-race-condition.ts
 *   bun apps/api/scripts/test-race-condition.ts --concurrency 5
 */

import { parseArgs } from 'node:util';

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    concurrency: { type: 'string', default: '2' },
    url: { type: 'string', default: process.env.API_URL || 'http://localhost:4000' },
    origin: { type: 'string', default: process.env.APP_ORIGIN || 'http://localhost:3000' },
    email: { type: 'string', default: 'agent@example.com' },
    password: { type: 'string', default: 'AgentDemo123!' },
  },
});

const concurrency = Math.max(2, parseInt(values.concurrency ?? '2', 10) || 2);
const apiUrl = (values.url ?? 'http://localhost:4000').replace(/\/+$/, '');
const appOrigin = values.origin ?? 'http://localhost:3000';
const email = values.email ?? 'agent@example.com';
const password = values.password ?? 'AgentDemo123!';

async function run() {
  console.log('\n============================================================');
  console.log('🚀 Concurrent Orders & Idempotency Race Test');
  console.log('============================================================');
  console.log(`API URL:          ${apiUrl}`);
  console.log(`Origin:           ${appOrigin}`);
  console.log(`Parallel Reqs:    ${concurrency}`);
  console.log(`User:             ${email}`);

  // 1. Authenticate to get session cookie
  process.stdout.write('\n🔑 [1/3] Logging in to retrieve session cookie... ');
  let cookieHeader = '';
  try {
    const loginRes = await fetch(`${apiUrl}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: appOrigin,
      },
      body: JSON.stringify({ email, password }),
    });

    if (!loginRes.ok) {
      const errText = await loginRes.text();
      throw new Error(`Login failed (${loginRes.status}): ${errText}`);
    }

    const setCookie = loginRes.headers.get('set-cookie');
    if (!setCookie) {
      throw new Error('No Set-Cookie header returned by login endpoint');
    }

    // Extract cookie (e.g. orders_access=...)
    cookieHeader = setCookie.split(';')[0];
    console.log('✅ Success!');
  } catch (err: unknown) {
    console.log('❌ Failed');
    console.error(`\nError during login: ${err instanceof Error ? err.message : String(err)}`);
    console.error('Make sure the API server is running (e.g., bun start:prod or bun dev:api).');
    process.exit(1);
  }

  // 2. Prepare order payload and shared Idempotency-Key
  const sharedKey = `test-race-${crypto.randomUUID()}`;
  const payload = {
    customerName: 'Race Test Customer',
    customerEmail: 'race.test@example.com',
    items: [
      { description: 'Concurrent Item A', quantity: 2, unitPriceCents: 1500 },
      { description: 'Concurrent Item B', quantity: 1, unitPriceCents: 2000 },
    ],
    totalCents: 5000, // 2 * 1500 + 1 * 2000 = 5000
  };

  console.log('\n📦 [2/3] Order details prepared:');
  console.log(`   Shared Idempotency-Key: ${sharedKey}`);
  console.log('   Items: 2 items, Total: $50.00 (5000 cents)');

  // 3. Fire requests simultaneously
  console.log(`\n⚡ [3/3] Firing ${concurrency} parallel requests simultaneously...\n`);

  interface Result {
    index: number;
    status: number;
    durationMs: number;
    body: any;
    error?: string;
  }

  const sendOrder = async (index: number): Promise<Result> => {
    const start = performance.now();
    try {
      const res = await fetch(`${apiUrl}/api/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: appOrigin,
          'Idempotency-Key': sharedKey,
          Cookie: cookieHeader,
        },
        body: JSON.stringify(payload),
      });

      const durationMs = Math.round(performance.now() - start);
      let data: any;
      try {
        data = await res.json();
      } catch {
        data = await res.text();
      }

      return {
        index,
        status: res.status,
        durationMs,
        body: data,
      };
    } catch (err: unknown) {
      const durationMs = Math.round(performance.now() - start);
      return {
        index,
        status: 0,
        durationMs,
        body: null,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  };

  const results = await Promise.all(
    Array.from({ length: concurrency }, (_, i) => sendOrder(i + 1)),
  );

  // 4. Print results
  console.log('------------------------------------------------------------');
  for (const r of results) {
    if (r.error) {
      console.log(`  [Request ${r.index}] ❌ Network Error (${r.durationMs}ms): ${r.error}`);
    } else {
      const icon = r.status === 201 ? '✅' : '⚠️';
      const orderId = r.body?.id !== undefined ? `Order ID: #${r.body.id}` : 'No Order ID';
      console.log(
        `  [Request ${r.index}] ${icon} HTTP ${r.status} (${r.durationMs}ms) | ${orderId}`,
      );
    }
  }
  console.log('------------------------------------------------------------');

  // 5. Verification analysis
  const statuses = results.map((r) => r.status);
  const orderIds = results.map((r) => r.body?.id).filter((id) => id !== undefined);
  const all201 = statuses.every((s) => s === 201);
  const uniqueOrderIds = new Set(orderIds);

  if (all201 && uniqueOrderIds.size === 1) {
    const winnerId = orderIds[0];
    console.log('\n🎉 TEST PASSED!');
    console.log('- Both/all requests returned HTTP 201 Created.');
    console.log(`- All responses returned the EXACT SAME Order ID: #${winnerId}.`);
    console.log('- Idempotency verified: only 1 order was created in the database.');
    process.exit(0);
  } else if (uniqueOrderIds.size > 1) {
    console.error('\n🚨 RACE CONDITION DETECTED! TEST FAILED.');
    console.error(`Multiple distinct orders were created: [${Array.from(uniqueOrderIds).join(', ')}]`);
    process.exit(1);
  } else {
    console.error('\n❌ TEST FAILED.');
    console.error(`Unexpected statuses or responses: ${statuses.join(', ')}`);
    console.error('Response details:', JSON.stringify(results.map((r) => r.body), null, 2));
    process.exit(1);
  }
}

await run();
