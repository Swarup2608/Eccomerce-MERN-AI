import assert from "node:assert/strict";
import {test} from "node:test";
import type {Server} from "http";

import app from "../app.js";

let server: Server;
let baseUrl: string;

test.before(async () => {
    server = app.listen(0);
    await new Promise<void>((resolve) => {
        server.once("listening", () => {
            const address = server.address();

            if(!address || typeof address === "string") {
                throw new Error("Failed to get server address");
            }
            baseUrl = `http://127.0.0.1:${address.port}`;
            resolve();
        });
    });
});

test.after(async()=>{
    await new Promise<void>((resolve,reject) => {
        server.close((error) => {
            if (error) {
                reject(error);
                return;
            } 
            resolve();
        });
    });
});

test("GET /api/v1/health returns a healthy response", async () => {
  const response = await fetch(`${baseUrl}/api/v1/health`);

  assert.equal(response.status, 200);

  const body = await response.json();

  assert.deepEqual(body, {
    success: true,
    message: "API is healthy",
  });

  assert.ok(response.headers.get("x-request-id"));
});