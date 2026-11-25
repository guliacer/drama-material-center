/**
 * Guli Identity OIDC 客户端（Authorization Code + S256 PKCE，公共客户端，无 Secret）。
 * 配置通过 VITE_GULI_* 环境变量注入；未配置时整个鉴权模块自动停用（本地开发免登录）。
 */

const ISSUER = import.meta.env.VITE_GULI_ISSUER as string | undefined;
const DISCOVERY_URL = import.meta.env.VITE_GULI_DISCOVERY_URL as string | undefined;
const CLIENT_ID = import.meta.env.VITE_GULI_CLIENT_ID as string | undefined;
const REDIRECT_URI = import.meta.env.VITE_GULI_REDIRECT_URI as string | undefined;
const POST_LOGOUT_URI = import.meta.env.VITE_GULI_POST_LOGOUT_URI as string | undefined;
const SCOPES = ((import.meta.env.VITE_GULI_SCOPES as string | undefined) ?? "openid email profile")
  .split(/\s+/)
  .filter(Boolean);

export const authEnabled = Boolean(ISSUER && DISCOVERY_URL && CLIENT_ID && REDIRECT_URI);

interface Discovery {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  end_session_endpoint?: string;
  jwks_uri: string;
  userinfo_endpoint?: string;
}

interface TokenResponse {
  access_token: string;
  id_token?: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
}

export interface AuthUser {
  sub: string;
  email?: string;
  name?: string;
  preferred_username?: string;
}

const STORAGE = {
  accessToken: "drama:access_token",
  refreshToken: "drama:refresh_token",
  idToken: "drama:id_token",
  expiresAt: "drama:expires_at",
  user: "drama:user",
  pendingVerifier: "drama:pkce_verifier",
  pendingState: "drama:pkce_state",
  pendingNonce: "drama:pkce_nonce",
  pendingRedirect: "drama:pending_redirect",
};

let discoveryCache: Discovery | null = null;

async function getDiscovery(): Promise<Discovery> {
  if (discoveryCache) return discoveryCache;
  const response = await fetch(DISCOVERY_URL!, { cache: "no-store" });
  if (!response.ok) throw new Error("无法读取 Guli Identity 配置。");
  const data = await response.json() as Discovery;
  if (data.issuer !== ISSUER) throw new Error("鉴权服务 issuer 不匹配，已拒绝登录。");
  discoveryCache = data;
  return data;
}

function base64url(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (const byte of view) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function randomValue(length = 32): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return base64url(bytes);
}

async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64url(digest);
}

export function getAccessToken(): string | null {
  return window.localStorage.getItem(STORAGE.accessToken);
}

export function getAuthUser(): AuthUser | null {
  const raw = window.localStorage.getItem(STORAGE.user);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

function isExpired(): boolean {
  const expiresAt = Number(window.localStorage.getItem(STORAGE.expiresAt) ?? 0);
  return !expiresAt || Date.now() >= expiresAt - 30_000;
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    const normalized = part.replaceAll("-", "+").replaceAll("_", "/");
    return JSON.parse(atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="))) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function login(): Promise<void> {
  if (!authEnabled) return;
  const discovery = await getDiscovery();
  const verifier = randomValue(43);
  const state = randomValue();
  const nonce = randomValue();
  const next = new URLSearchParams(window.location.search).get("next");
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";

  window.sessionStorage.setItem(STORAGE.pendingVerifier, verifier);
  window.sessionStorage.setItem(STORAGE.pendingState, state);
  window.sessionStorage.setItem(STORAGE.pendingNonce, nonce);
  window.sessionStorage.setItem(STORAGE.pendingRedirect, safeNext);

  const challenge = await pkceChallenge(verifier);
  const params = new URLSearchParams({
    client_id: CLIENT_ID!,
    redirect_uri: REDIRECT_URI!,
    response_type: "code",
    scope: SCOPES.join(" "),
    state,
    nonce,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  window.location.assign(`${discovery.authorization_endpoint}?${params.toString()}`);
}

function setTokenCookie(token: string, maxAgeSeconds: number) {
  const parts = [`drama_token=${encodeURIComponent(token)}`, "Path=/", "SameSite=Lax", `Max-Age=${Math.max(60, maxAgeSeconds)}`];
  if (window.location.protocol === "https:") parts.push("Secure");
  document.cookie = parts.join("; ");
}

function clearTokenCookie() {
  document.cookie = "drama_token=; Path=/; SameSite=Lax; Max-Age=0";
  if (window.location.protocol === "https:") document.cookie = "drama_token=; Path=/; SameSite=Lax; Max-Age=0; Secure";
}

async function storeTokens(tokens: TokenResponse) {
  window.localStorage.setItem(STORAGE.accessToken, tokens.access_token);
  if (tokens.refresh_token) window.localStorage.setItem(STORAGE.refreshToken, tokens.refresh_token);
  if (tokens.id_token) window.localStorage.setItem(STORAGE.idToken, tokens.id_token);
  const expiresIn = tokens.expires_in ?? 3600;
  window.localStorage.setItem(STORAGE.expiresAt, String(Date.now() + expiresIn * 1000));
  setTokenCookie(tokens.access_token, expiresIn);

  const payload = decodeJwtPayload(tokens.id_token ?? tokens.access_token);
  if (payload) {
    const user: AuthUser = {
      sub: String(payload.sub ?? ""),
      ...(typeof payload.email === "string" ? { email: payload.email } : {}),
      ...(typeof payload.name === "string" ? { name: payload.name } : {}),
      ...(typeof payload.preferred_username === "string" ? { preferred_username: payload.preferred_username } : {}),
    };
    window.localStorage.setItem(STORAGE.user, JSON.stringify(user));
  }
}

export async function handleCallback(): Promise<string> {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  const state = params.get("state");
  const expectedState = window.sessionStorage.getItem(STORAGE.pendingState);
  const verifier = window.sessionStorage.getItem(STORAGE.pendingVerifier);
  const nonce = window.sessionStorage.getItem(STORAGE.pendingNonce);
  const pendingRedirect = window.sessionStorage.getItem(STORAGE.pendingRedirect) ?? "/";

  if (!code || !state || state !== expectedState || !verifier) {
    throw new Error("登录回调参数无效，请重试。");
  }

  const discovery = await getDiscovery();
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: REDIRECT_URI!,
    client_id: CLIENT_ID!,
    code_verifier: verifier,
  });
  const response = await fetch(discovery.token_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) throw new Error("换取访问令牌失败，请重新登录。");
  const tokens = await response.json() as TokenResponse;

  if (nonce && tokens.id_token) {
    const payload = decodeJwtPayload(tokens.id_token);
    if (!payload || payload.nonce !== nonce) throw new Error("登录校验失败（nonce 不匹配）。");
  }

  await storeTokens(tokens);
  window.sessionStorage.removeItem(STORAGE.pendingVerifier);
  window.sessionStorage.removeItem(STORAGE.pendingState);
  window.sessionStorage.removeItem(STORAGE.pendingNonce);
  window.sessionStorage.removeItem(STORAGE.pendingRedirect);
  return pendingRedirect;
}

async function refreshToken(): Promise<boolean> {
  const refresh = window.localStorage.getItem(STORAGE.refreshToken);
  if (!refresh) return false;
  const discovery = await getDiscovery();
  const response = await fetch(discovery.token_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refresh,
      client_id: CLIENT_ID!,
    }),
  });
  if (!response.ok) return false;
  await storeTokens(await response.json() as TokenResponse);
  return true;
}

export async function ensureAccessToken(): Promise<string | null> {
  if (!authEnabled) return null;
  const token = getAccessToken();
  if (token && !isExpired()) return token;
  if (await refreshToken()) return getAccessToken();
  clearSession();
  throw new Error("SESSION_EXPIRED");
}

export function clearSession() {
  for (const key of Object.values(STORAGE)) {
    window.localStorage.removeItem(key);
    window.sessionStorage.removeItem(key);
  }
  clearTokenCookie();
}

export async function logout(): Promise<void> {
  const idToken = window.localStorage.getItem(STORAGE.idToken);
  clearSession();
  if (!authEnabled) {
    window.location.assign("/");
    return;
  }
  const discovery = await getDiscovery();
  if (!discovery.end_session_endpoint) {
    window.location.assign("/");
    return;
  }
  const params = new URLSearchParams({
    client_id: CLIENT_ID!,
    post_logout_redirect_uri: POST_LOGOUT_URI ?? `${window.location.origin}/auth/logout-callback`,
    state: randomValue(),
  });
  if (idToken) params.set("id_token_hint", idToken);
  window.location.assign(`${discovery.end_session_endpoint}?${params.toString()}`);
}
