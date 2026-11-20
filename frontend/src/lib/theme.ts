import { applySiteIcon, loadSite } from "./site";

/**
 * 主题引擎:主题色系(gptibo/mint/ocean/violet/cow)× 模式(light/dark/auto)。
 * 优先级:买家本地选择(localStorage) > 后台站点默认 > 系统偏好。
 */
export type ThemeName = "gptibo" | "mint" | "ocean" | "violet" | "cow";
export type ModeName = "light" | "dark" | "auto";

export const THEMES: { value: ThemeName; label: string; swatch: string }[] = [
  { value: "gptibo", label: "极简蓝", swatch: "#0071E3" },
  { value: "mint", label: "薄荷绿", swatch: "#157347" },
  { value: "ocean", label: "海洋蓝", swatch: "#0066CC" },
  { value: "violet", label: "紫罗兰", swatch: "#6D4AFF" },
  { value: "cow", label: "晴空蓝", swatch: "#0284C7" },
];

const KEY_MODE = "ka.mode";
const KEY_THEME = "ka.site.theme";
const KEY_SITE_MODE = "ka.site.mode";

function isThemeName(value: string | null | undefined): value is ThemeName {
  return value === "gptibo" || value === "mint" || value === "ocean" || value === "violet" || value === "cow";
}

function storedTheme(): ThemeName {
  const value = localStorage.getItem(KEY_THEME);
  return isThemeName(value) ? value : "gptibo";
}

function storedSiteMode(): ModeName {
  const value = localStorage.getItem(KEY_SITE_MODE);
  return value === "light" || value === "dark" ? value : "auto";
}

let currentTheme: ThemeName = storedTheme();
let siteMode: ModeName = storedSiteMode();
let transitionTimer: number | undefined;

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

function paint(animate = false) {
  const el = document.documentElement;
  const dark = resolveDark();
  if (animate && !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
    el.classList.add("theme-transition");
    window.clearTimeout(transitionTimer);
    transitionTimer = window.setTimeout(() => el.classList.remove("theme-transition"), 280);
  }
  el.dataset.theme = currentTheme;
  el.dataset.mode = dark ? "dark" : "light";
  el.style.colorScheme = el.dataset.mode;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#080808" : "#fafafa");
}

/** 应用后台下发的站点默认(theme + mode),保留买家本地明暗选择。 */
export function applySiteTheme(theme?: string, mode?: string) {
  if (isThemeName(theme)) {
    currentTheme = theme;
    localStorage.setItem(KEY_THEME, theme);
  }
  if (mode === "light" || mode === "dark" || mode === "auto") {
    siteMode = mode;
    localStorage.setItem(KEY_SITE_MODE, mode);
  }
  paint();
}

/** 使用本地主题立即绘制，公开配置与页面共享请求，不阻塞首屏。 */
export async function bootstrapSiteTheme(): Promise<void> {
  try {
    const site = await loadSite();
    applySiteTheme(site.theme, site.mode);
    applySiteIcon(site.icon);
  } catch {
    // 离线时保留本地主题，商城提供独立的加载失败与重试状态。
  }
}

export function isDark(): boolean {
  return document.documentElement.dataset.mode === "dark";
}

/** 买家端明暗切换(持久化本地)。 */
export function toggleMode(): boolean {
  localStorage.setItem(KEY_MODE, isDark() ? "light" : "dark");
  paint(true);
  return isDark();
}

/** 管理端预览用:直接切主题(不落库,保存由站点设置负责)。 */
export function previewTheme(theme: ThemeName) {
  currentTheme = theme;
  paint(true);
}

// 首屏立即上色,避免闪烁;跟随系统变化
paint();
window.matchMedia?.("(prefers-color-scheme: dark)").addEventListener?.("change", () => paint());
