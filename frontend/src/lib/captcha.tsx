import { useEffect, useId, useState } from "react";
import { get } from "./api";

export interface CaptchaPublicConfig {
  captchaEnabled?: string;
  captchaProvider?: string;
  captchaSiteKey?: string;
}

declare global {
  interface Window {
    turnstile?: { render: (el: HTMLElement, opts: Record<string, unknown>) => string; reset?: (id?: string) => void };
    grecaptcha?: { render: (el: HTMLElement, opts: Record<string, unknown>) => number; reset?: (id?: number) => void };
    hcaptcha?: { render: (el: HTMLElement, opts: Record<string, unknown>) => string; reset?: (id?: string) => void };
  }
}

let cfgPromise: Promise<CaptchaPublicConfig> | null = null;

function captchaConfig() {
  cfgPromise = cfgPromise ?? get<CaptchaPublicConfig>("/store/site").catch(() => ({}));
  return cfgPromise;
}

function scriptSrc(provider: string) {
  if (provider === "recaptcha" || provider === "google" || provider === "google_recaptcha") {
    return "https://www.google.com/recaptcha/api.js?render=explicit";
  }
  if (provider === "hcaptcha") return "https://js.hcaptcha.com/1/api.js?render=explicit";
  return "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
}

function ensureScript(provider: string) {
  const src = scriptSrc(provider);
  const existing = document.querySelector(`script[src="${src}"]`);
  if (existing) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("captcha script load failed"));
    document.head.appendChild(s);
  });
}

export function captchaHeaders(token?: string | null) {
  return token ? { "X-Captcha-Token": token } : undefined;
}

export function CaptchaBox({
  action,
  onToken,
  onEnabledChange,
  resetKey = 0,
}: {
  action: string;
  onToken: (token: string) => void;
  onEnabledChange?: (enabled: boolean) => void;
  resetKey?: number;
}) {
  const reactId = useId().replace(/:/g, "");
  const id = `captcha-${reactId}`;
  const [enabled, setEnabled] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    captchaConfig().then(async (cfg) => {
      const isEnabled = cfg.captchaEnabled === "1" || cfg.captchaEnabled === "true";
      const provider = (cfg.captchaProvider || "turnstile").toLowerCase();
      const siteKey = cfg.captchaSiteKey || "";
      if (cancelled) return;
      setEnabled(isEnabled);
      onEnabledChange?.(isEnabled);
      if (!isEnabled || !siteKey) return;
      try {
        await ensureScript(provider);
        if (cancelled) return;
        const el = document.getElementById(id);
        if (!el) return;
        el.innerHTML = "";
        const opts = {
          sitekey: siteKey,
          action,
          callback: (token: string) => onToken(token),
          "expired-callback": () => onToken(""),
          "error-callback": () => {
            onToken("");
            setError("人机验证加载失败,请刷新页面重试");
          },
        };
        if (provider === "recaptcha" || provider === "google" || provider === "google_recaptcha") {
          window.grecaptcha?.render(el, opts);
        } else if (provider === "hcaptcha") {
          window.hcaptcha?.render(el, opts);
        } else {
          window.turnstile?.render(el, { ...opts, theme: document.documentElement.dataset.mode === "dark" ? "dark" : "light" });
        }
      } catch {
        if (!cancelled) setError("人机验证加载失败,请检查网络后刷新页面");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [action, id, onEnabledChange, onToken, resetKey]);

  if (!enabled) return null;
  return (
    <div className="my-4 rounded-2xl border border-ink/[0.07] bg-surface px-4 py-3">
      <div id={id} className="min-h-[65px]" />
      {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
    </div>
  );
}
