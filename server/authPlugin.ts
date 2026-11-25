import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin, PreviewServer, ViteDevServer } from "vite";

interface AuthPluginOptions {
  issuer?: string;
  userinfoUrl?: string;
}

function sendJson(response: ServerResponse, status: number, body: unknown) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(body));
}

/**
 * 对 /api/ 请求强制校验 Guli Identity 签发的 Bearer access token。
 * 使用 OIDC userinfo 端点（/me）校验：无论 token 是 JWT 还是 opaque 都通用。
 * 校验结果按 token 缓存在内存中（60 秒），避免每个请求都打鉴权服务。
 * 未配置环境变量时（本地开发）不启用鉴权。
 */
export function authPlugin(options: AuthPluginOptions = {}): Plugin {
  const issuer = options.issuer ?? process.env.GULI_IDENTITY_ISSUER ?? "";
  const userinfoUrl = options.userinfoUrl ?? process.env.GULI_IDENTITY_USERINFO_URL ?? "";
  const enabled = Boolean(issuer && userinfoUrl);

  const cache = new Map<string, { expires: number; ok: boolean }>();
  const CACHE_TTL = 60_000;

  async function verify(token: string): Promise<boolean> {
    const cached = cache.get(token);
    if (cached && cached.expires > Date.now()) return cached.ok;

    let ok = false;
    try {
      const response = await fetch(userinfoUrl, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(8_000),
      });
      ok = response.ok;
    } catch {
      ok = false;
    }
    cache.set(token, { expires: Date.now() + CACHE_TTL, ok });
    // 简单限制缓存体积，避免长期运行无限增长。
    if (cache.size > 5_000) {
      const now = Date.now();
      for (const [key, value] of cache) if (value.expires <= now) cache.delete(key);
    }
    return ok;
  }

  function attach(server: ViteDevServer | PreviewServer) {
    server.middlewares.use(async (request: IncomingMessage, response: ServerResponse, next) => {
      if (!enabled || !request.url?.startsWith("/api/")) {
        next();
        return;
      }

      const header = request.headers.authorization;
      const match = typeof header === "string" ? header.match(/^Bearer\s+(.+)$/i) : null;
      if (!match) {
        sendJson(response, 401, { error: "需要登录", code: "UNAUTHORIZED" });
        return;
      }

      if (await verify(match[1])) {
        next();
      } else {
        sendJson(response, 401, { error: "登录已过期或凭据无效", code: "INVALID_TOKEN" });
      }
    });
  }

  return {
    name: "guli-identity-auth",
    configureServer(server) {
      attach(server);
    },
    configurePreviewServer(server) {
      attach(server);
    },
  };
}
