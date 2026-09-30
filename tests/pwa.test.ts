import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";

const publicDir = fileURLToPath(new URL("../public/", import.meta.url));
const origin = "https://food.xedoc.ru";
const offlineFiles = [
  "/offline.html",
  "/offline.css",
  "/offline.js",
  "/icons/icon-192.png",
];

type RequestLike = { url: string; method: string; mode: string };
type WorkerEvent = {
  request?: RequestLike;
  waitUntil: (task: Promise<unknown>) => void;
  respondWith: (response: Promise<Response> | Response) => void;
};

function workerHarness() {
  const handlers = new Map<string, (event: WorkerEvent) => void>();
  const precached: string[][] = [];
  const opened: string[] = [];
  const deleted: string[] = [];
  const fetchRequests: RequestLike[] = [];
  const fetchOptions: (RequestInit | undefined)[] = [];
  const cacheWrites: unknown[][] = [];
  const offline = new Response("Offline fallback", {
    headers: { "Content-Type": "text/html" },
  });
  const cachedResponses = new Map<string, Response>([
    ["/offline.html", offline],
  ]);
  let names: string[] = [];
  let claimCalls = 0;
  let fetchImpl = async (
    _request: RequestLike,
    _options?: RequestInit,
  ): Promise<Response> =>
    new Response("Online response");
  const match = async (request: string | { url: string }) => {
    const url = typeof request === "string" ? request : request.url;
    return cachedResponses.get(new URL(url, origin).pathname);
  };
  const cache = {
    addAll: async (urls: string[]) => {
      precached.push(Array.from(urls));
    },
    match,
    put: async (...args: unknown[]) => {
      cacheWrites.push(args);
    },
  };
  runInNewContext(
    readFileSync(resolve(publicDir, "sw.js"), "utf8"),
    {
      URL,
      Response,
      fetch: async (request: RequestLike, options?: RequestInit) => {
        fetchRequests.push(request);
        fetchOptions.push(options);
        return fetchImpl(request, options);
      },
      caches: {
        open: async (name: string) => {
          opened.push(name);
          return cache;
        },
        keys: async () => names,
        delete: async (name: string) => {
          deleted.push(name);
          return true;
        },
        match,
      },
      self: {
        location: new URL("/sw.js", origin),
        clients: {
          claim: async () => {
            claimCalls += 1;
          },
        },
        addEventListener: (
          kind: string,
          handler: (event: WorkerEvent) => void,
        ) => handlers.set(kind, handler),
      },
    },
    { filename: "public/sw.js", timeout: 1000 },
  );
  async function dispatch(kind: string, request?: RequestLike) {
    const tasks: Promise<unknown>[] = [];
    let response: Promise<Response> | undefined;
    const handler = handlers.get(kind);
    assert.ok(handler, `Worker must register the ${kind} handler`);
    handler({
      request,
      waitUntil: (task) => tasks.push(Promise.resolve(task)),
      respondWith: (result) => {
        assert.equal(response, undefined, "respondWith must run once");
        response = Promise.resolve(result);
      },
    });
    await Promise.all(tasks);
    return { intercepted: response !== undefined, response: await response };
  }
  return {
    dispatch,
    precached,
    opened,
    deleted,
    fetchRequests,
    fetchOptions,
    cacheWrites,
    offline,
    cachedResponses,
    setFetch: (impl: typeof fetchImpl) => (fetchImpl = impl),
    setCacheNames: (value: string[]) => (names = value),
    get claimCalls() {
      return claimCalls;
    },
  };
}

function request(path: string, method = "GET", mode = "navigate") {
  return { url: new URL(path, origin).href, method, mode };
}

test("Android manifest references real square PNG icons and a maskable icon", () => {
  const manifest = JSON.parse(
    readFileSync(resolve(publicDir, "manifest.webmanifest"), "utf8"),
  );
  assert.equal(manifest.id, "/");
  assert.equal(manifest.scope, "/");
  assert.equal(manifest.start_url, "/");
  assert.equal(manifest.display, "standalone");
  assert.ok(manifest.name && manifest.short_name);
  const sizes = new Set<string>();
  let hasMaskable = false;
  for (const icon of manifest.icons) {
    assert.equal(icon.type, "image/png");
    assert.match(icon.src, /^\/icons\/[^/]+\.png$/);
    const path = resolve(publicDir, icon.src.slice(1));
    assert.ok(existsSync(path), `Missing icon: ${icon.src}`);
    const bytes = readFileSync(path);
    assert.deepEqual(
      bytes.subarray(0, 8),
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      `${icon.src} must contain PNG data`,
    );
    assert.equal(bytes.subarray(12, 16).toString("ascii"), "IHDR");
    const width = bytes.readUInt32BE(16);
    const height = bytes.readUInt32BE(20);
    assert.equal(width, height, "Launcher icons must be square");
    assert.equal(icon.sizes, `${width}x${height}`);
    sizes.add(icon.sizes);
    if ((icon.purpose ?? "any").split(" ").includes("maskable")) {
      assert.equal(icon.sizes, "512x512");
      hasMaskable = true;
    }
  }
  assert.ok(sizes.has("192x192"), "Android needs a 192px icon");
  assert.ok(sizes.has("512x512"), "Android needs a 512px icon");
  assert.ok(hasMaskable, "Android adaptive launchers need a maskable icon");
});

test("installation precaches only the public offline fallback and its assets", async () => {
  const worker = workerHarness();
  await worker.dispatch("install");
  assert.equal(worker.precached.length, 1);
  assert.deepEqual(worker.precached[0].sort(), [...offlineFiles].sort());
  for (const url of worker.precached[0]) {
    assert.ok(existsSync(resolve(publicDir, url.slice(1))), `${url} must exist`);
  }
  assert.equal(worker.fetchRequests.length, 0);
  assert.equal(worker.cacheWrites.length, 0);
});

test("API, writes, external navigation and ordinary assets bypass the worker", async () => {
  const worker = workerHarness();
  const requests = [
    request("/api"),
    request("/api/me"),
    request("/api/orders"),
    request("/api/orders", "POST"),
    request("/menu", "POST"),
    request("https://other.example/menu"),
    request("/assets/app.js", "GET", "same-origin"),
    request("/images/customer-photo.png", "GET", "no-cors"),
  ];
  for (const input of requests) {
    const result = await worker.dispatch("fetch", input);
    assert.equal(result.intercepted, false, `${input.method} ${input.url}`);
  }
  assert.equal(worker.fetchRequests.length, 0);
  assert.equal(worker.opened.length, 0);
  assert.equal(worker.cacheWrites.length, 0);
});

test("the offline screen's styles, script and icon remain available without a network", async () => {
  const worker = workerHarness();
  worker.setFetch(async () => {
    throw new TypeError("Network unavailable");
  });
  for (const path of offlineFiles) {
    const cached = new Response(`Cached ${path}`);
    worker.cachedResponses.set(path, cached);
    const result = await worker.dispatch(
      "fetch",
      request(path, "GET", "same-origin"),
    );
    assert.equal(result.intercepted, true);
    assert.equal(result.response, cached);
  }
  assert.equal(worker.fetchRequests.length, 0);
  assert.equal(worker.cacheWrites.length, 0);
});

test("online navigations preserve server responses without caching personal HTML", async () => {
  const worker = workerHarness();
  for (const status of [200, 401, 500]) {
    const online = new Response("Server response", { status });
    worker.setFetch(async () => online);
    const result = await worker.dispatch("fetch", request("/admin"));
    assert.equal(result.intercepted, true);
    assert.equal(result.response, online);
  }
  assert.equal(worker.fetchRequests.length, 3);
  for (const options of worker.fetchOptions) {
    assert.equal(
      options?.cache,
      "no-store",
      "Navigation must reach the network instead of reusing an HTTP-cached shell",
    );
  }
  assert.equal(worker.opened.length, 0);
  assert.equal(worker.cacheWrites.length, 0);
});

test("a failed navigation bypasses an HTTP-cached shell and gets the offline page", async () => {
  const worker = workerHarness();
  worker.setFetch(async (_request, options) => {
    if (options?.cache === "no-store") {
      throw new TypeError("Network unavailable");
    }
    return new Response("Stale React shell from the browser HTTP cache");
  });
  const result = await worker.dispatch("fetch", request("/menu/some-dish"));
  assert.equal(result.intercepted, true);
  assert.equal(result.response, worker.offline);
  assert.equal(worker.fetchRequests.length, 1);
  assert.equal(worker.fetchOptions[0]?.cache, "no-store");
  assert.equal(worker.cacheWrites.length, 0);
});

test("activation removes old owned caches and preserves current and foreign caches", async () => {
  const worker = workerHarness();
  await worker.dispatch("install");
  const currentCache = worker.opened[0];
  assert.ok(currentCache?.startsWith("sinchao-offline-"));
  worker.setCacheNames([
    currentCache,
    "sinchao-offline-old",
    "another-application-cache",
    "sinchao-api-cache",
  ]);
  await worker.dispatch("activate");
  assert.deepEqual(worker.deleted, ["sinchao-offline-old"]);
  assert.equal(worker.claimCalls, 1);
});
