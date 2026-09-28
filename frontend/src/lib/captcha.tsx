import { useCallback, useEffect, useId, useRef, useState } from "react";
import { CheckCircle2, RefreshCw, ShieldCheck } from "lucide-react";
import { ApiError, get, post } from "./api";

export interface CaptchaPublicConfig {
  captchaEnabled?: string;
  captchaConfigured?: string;
  captchaProvider?: string;
  captchaSiteKey?: string;
  captchaScopes?: string;
}

interface BuiltinChallenge {
  challengeId: string;
  imageDataUrl: string;
  expiresInSeconds: number;
}

interface CaptchaApi {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string | number;
  reset?: (id?: string | number) => void;
  remove?: (id?: string | number) => void;
}

declare global {
  interface Window {
    turnstile?: CaptchaApi;
    grecaptcha?: CaptchaApi;
    hcaptcha?: CaptchaApi;
  }
}

let cfgPromise: Promise<CaptchaPublicConfig> | null = null;
const scriptPromises = new Map<string, Promise<void>>();

function captchaConfig() {
  cfgPromise = cfgPromise ?? get<CaptchaPublicConfig>("/store/site").catch(() => ({}));
  return cfgPromise;
}

/** 后台保存配置后清理公开配置缓存，使测试组件立即加载新服务商。 */
export function refreshCaptchaConfig() {
  cfgPromise = null;
}

function canonicalProvider(provider: string) {
  if (["recaptcha", "google", "google_recaptcha"].includes(provider)) return "recaptcha";
  if (provider === "hcaptcha") return "hcaptcha";
  if (["builtin", "self", "local"].includes(provider)) return "builtin";
  return "turnstile";
}

function providerApi(provider: string) {
  if (provider === "recaptcha") return window.grecaptcha;
  if (provider === "hcaptcha") return window.hcaptcha;
  return window.turnstile;
}

function scriptSrc(provider: string) {
  if (provider === "recaptcha") return "https://www.google.com/recaptcha/api.js?render=explicit";
  if (provider === "hcaptcha") return "https://js.hcaptcha.com/1/api.js?render=explicit";
  return "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
}

function waitForProvider(provider: string) {
  return new Promise<void>((resolve, reject) => {
    const started = Date.now();
    const check = () => {
      if (providerApi(provider)?.render) return resolve();
      if (Date.now() - started > 8000) return reject(new Error("captcha api unavailable"));
      window.setTimeout(check, 50);
    };
    check();
  });
}

function ensureScript(provider: string) {
  const src = scriptSrc(provider);
  const cached = scriptPromises.get(src);
  if (cached) return cached;
  const promise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    if (existing) {
      waitForProvider(provider).then(resolve, reject);
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.defer = true;
    script.onload = () => waitForProvider(provider).then(resolve, reject);
    script.onerror = () => reject(new Error("captcha script load failed"));
    document.head.appendChild(script);
  }).catch((error) => {
    scriptPromises.delete(src);
    throw error;
  });
  scriptPromises.set(src, promise);
  return promise;
}

export function captchaHeaders(token?: string | null) {
  return token ? { "X-Captcha-Token": token } : undefined;
}

export function CaptchaBox({
  action,
  onToken,
  onEnabledChange,
  resetKey = 0,
  force = false,
}: {
  action: string;
  onToken: (token: string) => void;
  onEnabledChange?: (enabled: boolean) => void;
  resetKey?: number;
  /** 仅用于后台配置测试，不受表单场景开关影响。 */
  force?: boolean;
}) {
  const reactId = useId().replace(/:/g, "");
  const id = `captcha-${reactId}`;
  const widgetId = useRef<string | number | null>(null);
  const widgetProvider = useRef("");
  const [enabled, setEnabled] = useState(false);
  const [provider, setProvider] = useState("");
  const [error, setError] = useState("");
  const [challenge, setChallenge] = useState<BuiltinChallenge | null>(null);
  const [answer, setAnswer] = useState("");
  const [checking, setChecking] = useState(false);
  const [verified, setVerified] = useState(false);

  const loadBuiltin = useCallback(async () => {
    setError("");
    setAnswer("");
    setVerified(false);
    onToken("");
    try {
      setChallenge(await get<BuiltinChallenge>("/store/captcha/challenge", { action }));
    } catch (e) {
      setChallenge(null);
      setError(e instanceof ApiError ? e.message : "验证码加载失败，请稍后重试");
    }
  }, [action, onToken]);

  useEffect(() => {
    let cancelled = false;
    setError("");
    setChallenge(null);
    setAnswer("");
    setVerified(false);
    onToken("");
    captchaConfig().then(async (cfg) => {
      const globallyEnabled = cfg.captchaEnabled === "1" || cfg.captchaEnabled === "true";
      const scopes = new Set((cfg.captchaScopes || "").split(",").map((x) => x.trim()).filter(Boolean));
      const isEnabled = globallyEnabled && (force || scopes.size === 0 || scopes.has(action));
      const selectedProvider = canonicalProvider((cfg.captchaProvider || "turnstile").toLowerCase());
      const siteKey = cfg.captchaSiteKey || "";
      if (cancelled) return;
      setEnabled(isEnabled);
      setProvider(selectedProvider);
      onEnabledChange?.(isEnabled);
      if (!isEnabled) return;
      if (selectedProvider === "builtin") {
        await loadBuiltin();
        return;
      }
      if (!siteKey) {
        setError("人机验证尚未完成配置，请联系管理员");
        return;
      }
      try {
        await ensureScript(selectedProvider);
        if (cancelled) return;
        const el = document.getElementById(id);
        const api = providerApi(selectedProvider);
        if (!el || !api) throw new Error("captcha unavailable");
        el.innerHTML = "";
        const opts = {
          sitekey: siteKey,
          action,
          theme: document.documentElement.dataset.mode === "dark" ? "dark" : "light",
          callback: (token: string) => {
            setError("");
            onToken(token);
          },
          "expired-callback": () => onToken(""),
          "error-callback": () => {
            onToken("");
            setError("人机验证失败，请刷新验证后重试");
          },
        };
        widgetId.current = api.render(el, opts);
        widgetProvider.current = selectedProvider;
      } catch {
        if (!cancelled) setError("人机验证加载失败，请检查网络或更换验证方式");
      }
    }).catch(() => {
      if (!cancelled) setError("无法读取人机验证配置，请刷新页面重试");
    });
    return () => {
      cancelled = true;
      const api = providerApi(widgetProvider.current);
      if (widgetId.current != null) {
        if (api?.remove) api.remove(widgetId.current);
        else api?.reset?.(widgetId.current);
      }
      widgetId.current = null;
      widgetProvider.current = "";
    };
  }, [action, force, id, loadBuiltin, onEnabledChange, onToken, resetKey]);

  async function verifyBuiltin() {
    if (!challenge || answer.trim().length < 4) {
      setError("请输入图片中的字符");
      return;
    }
    setChecking(true);
    setError("");
    try {
      const result = await post<{ token: string }>("/store/captcha/verify", {
        challengeId: challenge.challengeId,
        answer: answer.trim(),
        action,
      });
      onToken(result.token);
      setVerified(true);
    } catch (e) {
      const message = e instanceof ApiError ? e.message : "验证失败，请换一张重试";
      await loadBuiltin();
      setError(message);
    } finally {
      setChecking(false);
    }
  }

  if (!enabled) return null;
  if (provider === "builtin") {
    return (
      <div className="my-4 rounded-2xl border border-ink/[0.08] bg-surface p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <span className="flex items-center gap-1.5 text-xs font-bold text-ink/60"><ShieldCheck size={14} /> 安全验证</span>
          <button type="button" className="flex items-center gap-1 text-[11px] text-primary disabled:opacity-40"
            disabled={checking} onClick={() => void loadBuiltin()}>
            <RefreshCw size={12} /> 看不清，换一张
          </button>
        </div>
        {verified ? (
          <div className="flex min-h-[72px] items-center justify-center gap-2 rounded-xl bg-emerald-500/10 text-sm font-bold text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 size={17} /> 验证已完成
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-[minmax(0,240px)_1fr_auto] sm:items-center">
            {challenge
              ? <img src={challenge.imageDataUrl} alt="图形验证码" className="h-[72px] w-full rounded-xl border border-ink/[0.08] bg-white object-contain" />
              : <div className="h-[72px] animate-pulse rounded-xl bg-ink/[0.05]" />}
            <input className="input !py-3 font-mono uppercase tracking-[0.22em]" value={answer}
              maxLength={6} autoComplete="off" inputMode="text" placeholder="输入字符"
              onChange={(e) => setAnswer(e.target.value.replace(/[^0-9a-z]/gi, "").toUpperCase())}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void verifyBuiltin(); } }} />
            <button type="button" className="btn-primary !px-5 !py-3" disabled={checking || !challenge}
              onClick={() => void verifyBuiltin()}>{checking ? "验证中…" : "验证"}</button>
          </div>
        )}
        {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
        <p className="mt-2 text-[11px] text-ink/35">字符不区分大小写，验证结果仅本次提交有效。</p>
      </div>
    );
  }

  return (
    <div className="my-4 rounded-2xl border border-ink/[0.08] bg-surface px-4 py-3">
      <div id={id} className="min-h-[65px] overflow-hidden" />
      {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
    </div>
  );
}
