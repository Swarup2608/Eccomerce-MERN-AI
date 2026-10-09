import assert from "node:assert/strict";
import type { Server } from "node:http";
import { test } from "node:test";

import {z} from "zod";

import { createApp, type AppDependencies } from "../app.js";
import { validate } from "../middleware/validate.js";

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

test("unknown routes return a standardized 404 error", async () => {
    const { server, baseUrl } = await startTestServer({ isMongoReady: () => true, isRedisReady: () => true });
    try {
        const response = await fetch(`${baseUrl}/api/v1/does-not-exist`);

        assert.equal(response.status, 404);

        const body = await response.json();

        assert.equal(body.success, false);
        assert.equal(body.error.code, "ROUTE_NOT_FOUND");
        assert.equal(
        body.error.message,
        "Route GET /api/v1/does-not-exist not found",
        );
        assert.ok(body.error.requestId);

        assert.ok(response.headers.get("x-request-id"));
    } finally {
        await stopTestServer(server);
    }
});

async function createValidationTestServer(): Promise<{ server: Server; baseUrl: string; }> {
  const app = createApp({  isMongoReady: () => true,  isRedisReady: () => true }, (app) => {
  app.post( "/test/body",
    validate(
        { 
            body: z.object({
                name: z.string().min(2),
            }),
        }
    ),
    (req, res) => {
      res.status(200).json({
        success: true,
        data: req.body,
      });
    },
  );

  app.get( "/test/params/:id", validate(
        {
        params: z.object({
            id: z.string().uuid(),
        }),
        }
    ),
    (req, res) => {
      res.status(200).json({
        success: true,
        data: req.params,
      });
    },
  );

  app.get( "/test/query", validate(
        {
        query: z.object({
            page: z.coerce.number().int().positive(),
        }),
        }
    ),
    (req, res) => {
      res.status(200).json({
        success: true,
        data: req.query,
      });
    },
  );
  });

   const server = app.listen(0);

  await new Promise<void>((resolve) => {
    server.once("listening", resolve);
  });

  const address = server.address();

  if (!address || typeof address === "string") {
    throw new Error("Failed to determine test server address");
  }

  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`,
  };
}

test("validation middleware accepts a valid request body", async () => {
  const { server, baseUrl } = await createValidationTestServer();

  try {
    const response = await fetch(`${baseUrl}/test/body`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "Swarup",
      }),
    });

    assert.equal(response.status, 200);

    const body = await response.json();

    assert.deepEqual(body, {
      success: true,
      data: {
        name: "Swarup",
      },
    });
  } finally {
    await stopTestServer(server);
  }
});

test("validation middleware rejects an invalid request body", async () => {
  const { server, baseUrl } = await createValidationTestServer();

  try {
    const response = await fetch(`${baseUrl}/test/body`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "A",
      }),
    });

    assert.equal(response.status, 400);

    const body = await response.json();

    assert.equal(body.success, false);
    assert.equal(body.error.code, "VALIDATION_ERROR");
    assert.equal(body.error.message, "Request body validation failed");
    assert.ok(body.error.requestId);
  } finally {
    await stopTestServer(server);
  }
});

test("validation middleware accepts and parses query parameters", async () => {
  const { server, baseUrl } = await createValidationTestServer();

  try {
    const response = await fetch(
      `${baseUrl}/test/query?page=2`,
    );

    assert.equal(response.status, 200);

    const body = await response.json();

    assert.deepEqual(body, {
      success: true,
      data: {
        page: 2,
      },
    });
  } finally {
    await stopTestServer(server);
  }
});

test("validation middleware rejects invalid query parameters", async () => {
  const { server, baseUrl } = await createValidationTestServer();

  try {
    const response = await fetch(
      `${baseUrl}/test/query?page=invalid`,
    );

    assert.equal(response.status, 400);

    const body = await response.json();

    assert.equal(body.success, false);
    assert.equal(body.error.code, "VALIDATION_ERROR");
    assert.equal(
      body.error.message,
      "Request query validation failed",
    );
    assert.ok(body.error.requestId);
  } finally {
    await stopTestServer(server);
  }
});

test("validation middleware accepts valid route parameters", async () => {
  const { server, baseUrl } = await createValidationTestServer();

  const id = "550e8400-e29b-41d4-a716-446655440000";

  try {
    const response = await fetch(
      `${baseUrl}/test/params/${id}`,
    );

    assert.equal(response.status, 200);

    const body = await response.json();

    assert.deepEqual(body, {
      success: true,
      data: {
        id,
      },
    });
  } finally {
    await stopTestServer(server);
  }
});


test("POST /api/v1/auth/verify-email rejects a missing token", async () => {
  const { server, baseUrl } = await startTestServer({
    isMongoReady: () => true,
    isRedisReady: () => true,
  });

  try {
    const response = await fetch(
      `${baseUrl}/api/v1/auth/verify-email`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      },
    );

    assert.equal(response.status, 400);

    const body = await response.json();

    assert.equal(body.success, false);
    assert.equal(body.error.code, "VALIDATION_ERROR");
    assert.equal(body.error.message, "Request body validation failed");
    assert.ok(body.error.requestId);
  } finally {
    await stopTestServer(server);
  }
});

test("POST /api/v1/auth/verify-email rejects an empty token", async () => {
  const { server, baseUrl } = await startTestServer({
    isMongoReady: () => true,
    isRedisReady: () => true,
  });

  try {
    const response = await fetch(
      `${baseUrl}/api/v1/auth/verify-email`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: "   " }),
      },
    );

    assert.equal(response.status, 400);

    const body = await response.json();

    assert.equal(body.success, false);
    assert.equal(body.error.code, "VALIDATION_ERROR");
  } finally {
    await stopTestServer(server);
  }
});

test("POST /api/v1/auth/verify-email rejects unexpected fields", async () => {
  const { server, baseUrl } = await startTestServer({
    isMongoReady: () => true,
    isRedisReady: () => true,
  });

  try {
    const response = await fetch(
      `${baseUrl}/api/v1/auth/verify-email`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: "some-token",
          email: "user@example.com",
        }),
      },
    );

    assert.equal(response.status, 400);

    const body = await response.json();

    assert.equal(body.success, false);
    assert.equal(body.error.code, "VALIDATION_ERROR");
  } finally {
    await stopTestServer(server);
  }
});
