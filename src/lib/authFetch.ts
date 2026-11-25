/**
 * 全局 fetch 包装：所有发往同源 /api/ 的请求自动注入 Bearer token。
 * 在 main.tsx 启动时调用 installAuthFetch()，避免逐个修改业务请求代码。
 */
import { authEnabled, ensureAccessToken } from "./auth";

const originalFetch = window.fetch.bind(window);

async function authenticatedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  let url = "";
  if (typeof input === "string") url = input;
  else if (input instanceof URL) url = input.toString();
  else if ("url" in input) url = input.url;

  const isSameOriginApi = url.startsWith("/api/") || (url.startsWith("http") && new URL(url, window.location.origin).origin === window.location.origin && new URL(url, window.location.origin).pathname.startsWith("/api/"));

  if (!authEnabled || !isSameOriginApi) return originalFetch(input, init);

  const attach = async (token: string | null): Promise<RequestInit> => {
    const headers = new Headers(init?.headers);
    if (token) headers.set("Authorization", `Bearer ${token}`);
    return { ...init, headers };
  };

  let token: string | null;
  try {
    token = await ensureAccessToken();
  } catch {
    return originalFetch(input, init);
  }
  let response = await originalFetch(input, await attach(token));

  if (response.status === 401) {
    // 只对幂等请求（GET/HEAD）重试：POST 的 body（尤其 FormData）已被消费，
    // 重放会挂起或发出空请求体，导致"一直在导入中"卡死。
    const method = (init?.method ?? (typeof input !== "string" && "method" in input ? input.method : "GET")).toUpperCase();
    if (method === "GET" || method === "HEAD") {
      try {
        const refreshed = await ensureAccessToken();
        if (refreshed) response = await originalFetch(input, await attach(refreshed));
      } catch {
        // 刷新失败由调用方处理 401。
      }
    }
  }
  return response;
}

export function installAuthFetch() {
  if (authEnabled) window.fetch = authenticatedFetch as typeof window.fetch;
}
