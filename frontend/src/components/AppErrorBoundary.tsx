import { Component, type ReactNode } from "react";

/**
 * 顶层渲染兜底:任何页面组件抛错时给出可恢复的提示,而不是整页白屏。
 * 切换路由会重置错误状态(见 App.tsx 的 key)。
 */
export default class AppErrorBoundary extends Component<{
  children: ReactNode;
  title?: string;
  hint?: string;
  retryLabel?: string;
}, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: unknown) {
    console.error("[ka] 页面渲染失败", error, info);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="mx-auto flex min-h-[60vh] w-full max-w-xl flex-col items-center justify-center gap-4 px-6 text-center" role="alert">
        <h1 className="text-2xl font-extrabold tracking-tight">{this.props.title ?? "页面加载失败"}</h1>
        <p className="text-sm leading-relaxed text-ink/55">
          {this.props.hint ?? "页面渲染时出错了。可以重试,或返回商店首页继续浏览。"}
        </p>
        <p className="max-w-full break-words rounded-2xl bg-ink/[0.04] px-4 py-2 text-[11px] leading-relaxed text-ink/45">
          {String(error?.message || error)}
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button type="button" className="btn-primary" onClick={() => { this.setState({ error: null }); window.location.reload(); }}>
            {this.props.retryLabel ?? "重新加载"}
          </button>
          <a className="btn-ghost" href="/">返回商店</a>
        </div>
      </div>
    );
  }
}
