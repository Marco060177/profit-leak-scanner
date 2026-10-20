import assert from "node:assert/strict";
import test from "node:test";

import { fetchShopifyMarginOrders } from "~/connectors/shopify/shopify-margin-source.server";

const edge = (id: string) => ({ node: { id } });
const response = (body: unknown) => ({ json: async () => body });
const throttled = (available: number, requested = 400) => ({
  errors: [{ message: "Throttled", extensions: { code: "THROTTLED" } }],
  extensions: {
    cost: {
      requestedQueryCost: requested,
      throttleStatus: { maximumAvailable: 1000, currentlyAvailable: available, restoreRate: 100 },
    },
  },
});

test("retries only THROTTLED using the calculated cost delay", async () => {
  const waits: number[] = [];
  const replies = [
    throttled(300),
    { data: { orders: { edges: [edge("one")], pageInfo: { hasNextPage: false, endCursor: null } } } },
  ];
  const admin = { graphql: async () => response(replies.shift()) };

  const result = await fetchShopifyMarginOrders(admin as never, "period", {
    sleep: async (milliseconds) => { waits.push(milliseconds); },
  });

  assert.deepEqual(result, [edge("one")]);
  assert.deepEqual(waits, [1250]);
});

test("stops after the bounded THROTTLED retry limit", async () => {
  let calls = 0;
  const admin = { graphql: async () => { calls += 1; return response(throttled(399, 400)); } };

  await assert.rejects(
    fetchShopifyMarginOrders(admin as never, "period", {
      maxAttempts: 3,
      sleep: async () => undefined,
    }),
    /throttle retry limit reached/,
  );
  assert.equal(calls, 3);
});

test("bounds retries for the SDK GraphqlQueryError shape used in production", async () => {
  let calls = 0;
  const sdkThrottleError = {
    body: {
      errors: {
        graphQLErrors: [{ message: "Throttled", extensions: { code: "THROTTLED" } }],
      },
      extensions: throttled(399, 400).extensions,
    },
  };
  const admin = {
    graphql: async () => {
      calls += 1;
      throw sdkThrottleError;
    },
  };

  await assert.rejects(
    fetchShopifyMarginOrders(admin as never, "period", {
      maxAttempts: 3,
      sleep: async () => undefined,
    }),
    (error) => error === sdkThrottleError,
  );
  assert.equal(calls, 3);
});

test("does not retry non-throttle GraphQL errors", async () => {
  let calls = 0;
  const admin = {
    graphql: async () => {
      calls += 1;
      return response({ errors: [{ message: "Forbidden", extensions: { code: "ACCESS_DENIED" } }] });
    },
  };

  await assert.rejects(fetchShopifyMarginOrders(admin as never, "period"), /Forbidden/);
  assert.equal(calls, 1);
});

test("does not retry a mixed throttle and non-throttle response", async () => {
  let calls = 0;
  const admin = {
    graphql: async () => {
      calls += 1;
      return response({
        errors: [
          { message: "Throttled", extensions: { code: "THROTTLED" } },
          { message: "Forbidden", extensions: { code: "ACCESS_DENIED" } },
        ],
      });
    },
  };

  await assert.rejects(fetchShopifyMarginOrders(admin as never, "period"), /Forbidden/);
  assert.equal(calls, 1);
});

test("retries SDK-thrown THROTTLED errors without retrying other failures", async () => {
  const waits: number[] = [];
  let calls = 0;
  const admin = {
    graphql: async () => {
      calls += 1;
      if (calls === 1) {
        throw {
          body: {
            errors: {
              graphQLErrors: [{ message: "Throttled", extensions: { code: "THROTTLED" } }],
            },
            extensions: throttled(350, 400).extensions,
          },
        };
      }
      return response({ data: { orders: { edges: [edge("one")], pageInfo: { hasNextPage: false } } } });
    },
  };

  const result = await fetchShopifyMarginOrders(admin as never, "period", {
    sleep: async (milliseconds) => { waits.push(milliseconds); },
  });
  assert.deepEqual(result, [edge("one")]);
  assert.deepEqual(waits, [750]);
});

test("preserves pagination order and does not duplicate results after a retry", async () => {
  const calls: Array<{ after: string | null }> = [];
  let firstPageAttempts = 0;
  const admin = {
    graphql: async (_document: string, input: { variables: { after: string | null } }) => {
      calls.push({ after: input.variables.after });
      if (input.variables.after === null && firstPageAttempts++ === 0) return response(throttled(0, 100));
      if (input.variables.after === null) {
        return response({ data: { orders: { edges: [edge("one")], pageInfo: { hasNextPage: true, endCursor: "next" } } } });
      }
      return response({ data: { orders: { edges: [edge("two")], pageInfo: { hasNextPage: false, endCursor: null } } } });
    },
  };

  const result = await fetchShopifyMarginOrders(admin as never, "period", { sleep: async () => undefined });
  assert.deepEqual(result, [edge("one"), edge("two")]);
  assert.deepEqual(calls, [{ after: null }, { after: null }, { after: "next" }]);
});

test("fails immediately when requested cost exceeds the shop maximum", async () => {
  let calls = 0;
  const admin = {
    graphql: async () => {
      calls += 1;
      return response({
        ...throttled(100, 1100),
        extensions: { cost: { ...throttled(100, 1100).extensions.cost, throttleStatus: { maximumAvailable: 1000, currentlyAvailable: 100, restoreRate: 100 } } },
      });
    },
  };
  await assert.rejects(fetchShopifyMarginOrders(admin as never, "period", { sleep: async () => undefined }), /retry limit reached/);
  assert.equal(calls, 1);
});
