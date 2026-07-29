import { marked } from "marked";
import DOMPurify from "dompurify";

/** Markdown 渲染:marked 解析 + DOMPurify 消毒(防 XSS),外链新窗口打开。 */

marked.setOptions({ gfm: true, breaks: true });

DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node.tagName === "A") {
    node.setAttribute("target", "_blank");
    node.setAttribute("rel", "noopener noreferrer");
  }
});

export function renderMarkdown(md: string | null | undefined): string {
  if (!md) return "";
  const html = marked.parse(md, { async: false }) as string;
  return DOMPurify.sanitize(html, { FORBID_TAGS: ["style", "form", "input"], ADD_ATTR: ["target"] });
}
