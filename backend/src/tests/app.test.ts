import assert from "node:assert/strict";
import type { Server } from "node:http";
import { test } from "node:test";

import { createApp, type AppDependencies } from "../app.js";

async function startTestServer( dependencies: AppDependencies): Promise<{ server: Server; baseUrl: string; }> {
  const app = createApp(dependencies);

  const server = app.listen(0);

  await new Promise<void>((resolve) => {
    server.once("listening", resolve);
  });

  const address = server.address();

  if (!address || typeof address === "string") {
    throw new Error("Failed to determine test server address");
  }

  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
}

async function stopTestServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

test("GET /api/v1/health returns a healthy response", async () => {
  const { server, baseUrl } = await startTestServer({ isMongoReady: () => true, isRedisReady: () => true });

  try {
    const response = await fetch(`${baseUrl}/api/v1/health`);

    assert.equal(response.status, 200);

    const body = await response.json();

    assert.deepEqual(body, {
      success: true,
      message: "API is healthy",
    });

    assert.ok(response.headers.get("x-request-id"));
  } finally {
    await stopTestServer(server);
  }
});

test("GET /api/v1/ready returns 200 when all dependencies are ready", async () => {
    const { server, baseUrl } = await startTestServer({ isMongoReady: () => true, isRedisReady: () => true });

    try {
        const response = await fetch(`${baseUrl}/api/v1/ready`);

        assert.equal(response.status, 200);

        const body = await response.json();

        assert.deepEqual(body, {
        success: true,
        message: "API is ready",
        dependencies: {
            mongodb: true,
            redis: true,
        },
        });
    } finally {
        await stopTestServer(server);
    }
});

test("GET /api/v1/ready returns 503 when MongoDB is not ready", async () => {
    const { server, baseUrl } = await startTestServer({ isMongoReady: () => false, isRedisReady: () => true });

    try {
        const response = await fetch(`${baseUrl}/api/v1/ready`);

        assert.equal(response.status, 503);

        const body = await response.json();

        assert.deepEqual(body, {
        success: false,
        message: "API is not ready",
        dependencies: {
            mongodb: false,
            redis: true,
        },
        });
    } finally {
        await stopTestServer(server);
    }
});

test("GET /api/v1/ready returns 503 when Redis is not ready", async () => {
    const { server, baseUrl } = await startTestServer({ isMongoReady: () => true, isRedisReady: () => false });

    try {
        const response = await fetch(`${baseUrl}/api/v1/ready`);

        assert.equal(response.status, 503);

        const body = await response.json();

        assert.deepEqual(body, {
        success: false,
        message: "API is not ready",
        dependencies: {
            mongodb: true,
            redis: false,
        },
        });
    } finally {
        await stopTestServer(server);
    }
});