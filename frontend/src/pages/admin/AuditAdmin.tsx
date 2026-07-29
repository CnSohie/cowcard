import { useEffect, useState } from "react";
import { get } from "../../lib/api";

interface AuditRow { id: number; actor: string; action: string; resource: string; ip: string | null; detail: string | null; createdAt: string; }
interface Page<T> { items: T[]; total: number; size: number; }

export default function AuditAdmin() {
  const [page, setPage] = useState(0);
  const [data, setData] = useState<Page<AuditRow> | null>(null);

  useEffect(() => {
    get<Page<AuditRow>>("/admin/audit", { page, size: 50 }).then(setData).catch(() => void 0);
  }, [page]);

  const totalPages = data ? Math.ceil(data.total / data.size) : 0;

  return (
    <div className="animate-fade-up">
      <h1 className="mb-6 text-xl font-bold">审计日志</h1>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[700px]">
          <thead><tr>
            <th className="th">时间</th><th className="th">操作者</th><th className="th">动作</th>
            <th className="th">资源</th><th className="th">IP</th><th className="th">详情</th>
          </tr></thead>
          <tbody>
            {data?.items.map((r) => (
              <tr key={r.id} className="hover:bg-ink/[0.02]">
                <td className="td text-xs">{new Date(r.createdAt).toLocaleString()}</td>
                <td className="td">{r.actor}</td>
                <td className="td font-mono text-xs">{r.action}</td>
                <td className="td font-mono text-xs">{r.resource}</td>
                <td className="td text-xs">{r.ip ?? "—"}</td>
                <td className="td max-w-56 truncate font-mono text-[11px] text-ink/45">{r.detail ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="mt-4 flex items-center gap-2">
          <button className="btn-ghost !py-1.5 text-xs" disabled={page === 0} onClick={() => setPage(page - 1)}>上一页</button>
          <span className="text-xs text-ink/45">{page + 1} / {totalPages}</span>
          <button className="btn-ghost !py-1.5 text-xs" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>下一页</button>
        </div>
      )}
    </div>
  );
}
