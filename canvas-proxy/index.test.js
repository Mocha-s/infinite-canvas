import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { createProxyServer } from "./index.js";

let server;
let origin;

before(async () => {
    server = createProxyServer();
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    origin = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
});

test("preflight allows Authorization and content headers requested by the browser", async () => {
    const response = await fetch(`${origin}/https://api.example/v1/videos`, {
        method: "OPTIONS",
        headers: {
            Origin: "http://localhost:3000",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "authorization,content-type",
        },
    });

    assert.equal(response.status, 204);
    assert.equal(response.headers.get("access-control-allow-origin"), "*");
    assert.equal(response.headers.get("access-control-allow-headers"), "authorization,content-type");
});
