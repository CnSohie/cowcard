/**
 * 主题引擎:主题色系(mint/ocean/violet/cow)× 模式(light/dark/auto)。
 * 优先级:买家本地选择(localStorage) > 后台站点默认 > 系统偏好。
 */
export type ThemeName = "mint" | "ocean" | "violet" | "cow";
export type ModeName = "light" | "dark" | "auto";

export const THEMES: { value: ThemeName; label: string; swatch: string }[] = [
  { value: "mint", label: "薄荷绿", swatch: "#0F3D2E" },
  { value: "ocean", label: "海洋蓝", swatch: "#0D3360" },
  { value: "violet", label: "紫罗兰", swatch: "#4C2A8C" },
  { value: "cow", label: "CoW 奶牛牧场", swatch: "#16A9E0" },
];

const KEY_MODE = "ka.mode";
const KEY_THEME = "ka.site.theme";
const KEY_SITE_MODE = "ka.site.mode";

function storedTheme(): ThemeName {
  const value = localStorage.getItem(KEY_THEME);
  return value === "ocean" || value === "violet" || value === "cow" ? value : "mint";
}

function storedSiteMode(): ModeName {
  const value = localStorage.getItem(KEY_SITE_MODE);
  return value === "light" || value === "dark" ? value : "auto";
}

let currentTheme: ThemeName = storedTheme();
let siteMode: ModeName = storedSiteMode();

function systemPrefersDark(): boolean {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

function resolveDark(): boolean {
  const local = localStorage.getItem(KEY_MODE);
  if (local === "dark") return true;
  if (local === "light") return false;
  if (siteMode === "dark") return true;
  if (siteMode === "light") return false;
  return systemPrefersDark();
}

function paint() {
  const el = document.documentElement;
  el.dataset.theme = currentTheme;
  el.dataset.mode = resolveDark() ? "dark" : "light";
  el.style.colorScheme = el.dataset.mode;
}

/** 应用后台下发的站点默认(theme + mode),保留买家本地明暗选择。 */
export function applySiteTheme(theme?: string, mode?: string) {
  if (theme === "mint" || theme === "ocean" || theme === "violet" || theme === "cow") {
    currentTheme = theme;
    localStorage.setItem(KEY_THEME, theme);
  }
  if (mode === "light" || mode === "dark" || mode === "auto") {
    siteMode = mode;
    localStorage.setItem(KEY_SITE_MODE, mode);
  }
  paint();
}

/** 首次访问也先取得站点主题再挂载 React，避免默认主题内容闪现。 */
export async function bootstrapSiteTheme(timeoutMs = 1800): Promise<void> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch("/api/store/site", { signal: controller.signal });
    if (!response.ok) return;
    const body = await response.json() as { data?: { theme?: string; mode?: string } };
    applySiteTheme(body.data?.theme, body.data?.mode);
  } catch {
    // 离线或后端启动中时继续使用上次成功缓存的主题。
  } finally {
    window.clearTimeout(timeout);
  }
}

export function isDark(): boolean {
  return document.documentElement.dataset.mode === "dark";
}

/** 买家端明暗切换(持久化本地)。 */
export function toggleMode(): boolean {
  localStorage.setItem(KEY_MODE, isDark() ? "light" : "dark");
  paint();
  return isDark();
}

/** 管理端预览用:直接切主题(不落库,保存由站点设置负责)。 */
export function previewTheme(theme: ThemeName) {
  currentTheme = theme;
  paint();
}

// 首屏立即上色,避免闪烁;跟随系统变化
paint();
window.matchMedia?.("(prefers-color-scheme: dark)").addEventListener?.("change", paint);
