import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { BrandMark } from "../components/BrandMark";
import { authEnabled, clearSession, handleCallback, login, logout } from "../lib/auth";

export function LoginPage() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand"><BrandMark /></div>
        <h1>兜导 · 短剧 Harness</h1>
        <p>请使用 Guli Identity 账户登录后访问素材工作台。</p>
        {error && <p className="auth-error" role="alert">{error}</p>}
        {authEnabled ? (
          <button
            className="primary-button auth-action"
            type="button"
            disabled={busy}
            onClick={() => { setBusy(true); login().catch((reason: unknown) => { setError(reason instanceof Error ? reason.message : "发起登录失败"); setBusy(false); }); }}
          >
            {busy ? "正在跳转…" : "使用 Guli Identity 登录"}
          </button>
        ) : (
          <Link className="primary-button auth-action" to="/">进入工作台</Link>
        )}
        <small>本地开发环境未配置鉴权时可直接进入。</small>
      </div>
    </div>
  );
}

export function AuthCallbackPage() {
  const navigate = useNavigate();
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    handleCallback()
      .then((redirect) => { if (active) navigate(redirect || "/", { replace: true }); })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "登录失败");
      });
    return () => { active = false; };
  }, [navigate]);

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand"><BrandMark /></div>
        <h1>{error ? "登录失败" : "正在完成登录…"}</h1>
        <p>{error || "正在与 Guli Identity 交换登录凭据，请稍候。"}</p>
        {error && (
          <div className="auth-actions">
            <button className="primary-button auth-action" type="button" onClick={() => navigate("/auth/login", { replace: true })}>返回重试</button>
            <button className="secondary-button auth-action" type="button" onClick={() => { clearSession(); navigate("/auth/login", { replace: true }); }}>清除会话</button>
          </div>
        )}
      </div>
    </div>
  );
}

export function LogoutCallbackPage() {
  const navigate = useNavigate();
  useEffect(() => { navigate("/auth/login", { replace: true }); }, [navigate]);
  return (
    <div className="auth-page">
      <div className="auth-card"><div className="auth-brand"><BrandMark /></div><h1>已退出登录</h1><p>正在返回登录页…</p></div>
    </div>
  );
}

export function logoutNow() {
  void logout();
}
