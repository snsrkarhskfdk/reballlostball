try {
  await import("dotenv/config");
} catch (error) {
  if (error?.code !== "ERR_MODULE_NOT_FOUND") throw error;
}
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, isAbsolute, join, normalize, relative, resolve } from "node:path";
import { injectPublicConfig } from "./public-config.mjs";

const root = process.cwd();
const requestedPort = Number.parseInt(process.argv.at(-1), 10);
const startPort = Number.isFinite(requestedPort) ? requestedPort : 3000;
const configuredIndexHtml = injectPublicConfig(readFileSync(join(root, "index.html"), "utf8"));

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mp4": "video/mp4",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
};

function resolveRequestPath(url) {
  try {
    const pathname = decodeURIComponent(new URL(url, "http://localhost").pathname);
    const cleanPath = normalize(pathname).replace(/^(\.\.[/\\])+/, "");
    const target = resolve(
      root,
      pathname === "/" ? "index.html" : cleanPath.slice(1)
    );
    const rootRelative = relative(root, target);

    if (rootRelative.startsWith("..") || isAbsolute(rootRelative)) {
      return null;
    }

    if (existsSync(target) && statSync(target).isDirectory()) {
      return join(target, "index.html");
    }

    return target;
  } catch {
    return null;
  }
}

function createStaticServer() {
  return createServer((request, response) => {
    const target = resolveRequestPath(request.url ?? "/");

    if (!target || !existsSync(target)) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }

    const extension = extname(target);
    response.writeHead(200, {
      "Content-Type": mimeTypes[extension] ?? "application/octet-stream",
      "Cache-Control": "no-store",
    });
    if (target === join(root, "index.html")) {
      response.end(configuredIndexHtml);
      return;
    }
    const stream = createReadStream(target);
    stream.on("error", () => {
      if (!response.headersSent) {
        response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      }
      response.end("File read error");
    });
    stream.pipe(response);
  });
}

function listen(port) {
  const server = createStaticServer();

  server.on("error", (error) => {
    if (error.code === "EADDRINUSE" && port < startPort + 20) {
      listen(port + 1);
      return;
    }

    throw error;
  });

  server.listen(port, "127.0.0.1", () => {
    process.stdout.write(`Reball home dev server running at http://127.0.0.1:${port}\n`);
  });
}

listen(startPort);
