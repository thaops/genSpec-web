"use client";

import { useEffect, useState } from "react";
import { adminApi } from "@/lib/admin-api";
import type { AuditLogRow } from "@/lib/types";
import { DataTable, type Column } from "@/components/admin/DataTable";
import { Pagination } from "@/components/admin/Pagination";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

export default function AdminAuditLogsPage() {
  const toast = useToast();
  const [items, setItems] = useState<AuditLogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [action, setAction] = useState("");
  const [actorId, setActorId] = useState("");
  const [loading, setLoading] = useState(true);
  const limit = 30;

  function load() {
    setLoading(true);
    adminApi
      .listAuditLogs({ action: action || undefined, actorId: actorId || undefined, page, limit })
      .then((res) => {
        setItems(res.items);
        setTotal(res.total);
      })
      .catch((err) => toast.error("Lỗi tải audit log", err.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const columns: Column<AuditLogRow>[] = [
    { key: "time", header: "Time", render: (r) => new Date(r.createdAt).toLocaleString("vi-VN") },
    { key: "actor", header: "Actor", render: (r) => r.actorEmail ?? r.actorId },
    { key: "action", header: "Action", render: (r) => <Badge tone="accent">{r.action}</Badge> },
    { key: "target", header: "Target", render: (r) => `${r.targetType}:${r.targetId}` },
    {
      key: "meta",
      header: "Meta",
      render: (r) => <span className="text-xs text-zinc-500">{r.meta ? JSON.stringify(r.meta) : "—"}</span>,
    },
  ];

  return (
    <div className="space-y-4 p-6">
      <h1 className="text-lg font-semibold text-zinc-100">Audit Log</h1>

      <div className="flex flex-wrap items-end gap-3">
        <div className="w-48">
          <Input placeholder="actorId…" value={actorId} onChange={(e) => setActorId(e.target.value)} />
        </div>
        <div className="w-56">
          <Input placeholder="action (user.status_change…)" value={action} onChange={(e) => setAction(e.target.value)} />
        </div>
        <Button
          variant="secondary"
          onClick={() => {
            setPage(1);
            load();
          }}
        >
          Lọc
        </Button>
      </div>

      <DataTable columns={columns} rows={items} rowKey={(r) => `${r.actorId}-${r.createdAt}-${r.targetId}`} loading={loading} />
      <Pagination page={page} limit={limit} total={total} onChange={setPage} />
    </div>
  );
}
