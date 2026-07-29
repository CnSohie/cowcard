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

let currentTheme: ThemeName = "mint";
let siteMode: ModeName = "auto";

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
  if (theme === "mint" || theme === "ocean" || theme === "violet" || theme === "cow") currentTheme = theme;
  if (mode === "light" || mode === "dark" || mode === "auto") siteMode = mode;
  paint();
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
