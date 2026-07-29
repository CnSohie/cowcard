const SYMBOLS: Record<string, string> = {
  CNY: "¥",
  USD: "$",
  EUR: "€",
  GBP: "£",
  JPY: "¥",
  CHF: "CHF",
  HKD: "HK$",
  TWD: "NT$",
  SGD: "S$",
};

let current = localStorage.getItem("ka.currency") || "CNY";

export function setCurrency(code?: string) {
  current = (code || "CNY").toUpperCase();
  localStorage.setItem("ka.currency", current);
}

export function currencyCode() {
  return current;
}

export function currencySymbol(code = current) {
  return SYMBOLS[code] ?? "¥";
}

export function money(value: string | number | null | undefined, code = current) {
  const symbol = currencySymbol(code);
  const v = value == null || value === "" ? "0.00" : String(value);
  return symbol.length > 1 ? `${symbol} ${v}` : `${symbol}${v}`;
}
