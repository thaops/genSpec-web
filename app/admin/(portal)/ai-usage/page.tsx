"use client";

import { useEffect, useState } from "react";
import { adminApi } from "@/lib/admin-api";
import type { AiUsageRow } from "@/lib/types";
import { DataTable, type Column } from "@/components/admin/DataTable";
import { Pagination } from "@/components/admin/Pagination";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

export default function AdminAiUsagePage() {
  const toast = useToast();
  const [items, setItems] = useState<AiUsageRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [source, setSource] = useState("");
  const [model, setModel] = useState("");
  const [userId, setUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const limit = 30;

  function load() {
    setLoading(true);
    adminApi
      .listAiUsage({ source: source || undefined, model: model || undefined, userId: userId || undefined, page, limit })
      .then((res) => {
        setItems(res.items);
        setTotal(res.total);
      })
      .catch((err) => toast.error("Lỗi tải AI usage", err.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const columns: Column<AiUsageRow>[] = [
    { key: "time", header: "Time", render: (r) => new Date(r.createdAt).toLocaleString("vi-VN") },
    { key: "userId", header: "User", render: (r) => r.userId ?? "—" },
    { key: "source", header: "Source", render: (r) => <Badge tone="accent">{r.source}</Badge> },
    { key: "mode", header: "Mode", render: (r) => r.mode ?? "—" },
    { key: "model", header: "Model", render: (r) => <span className="text-xs">{r.model}</span> },
    { key: "tokens", header: "Tokens", render: (r) => `${r.inputTokens}/${r.outputTokens}` },
    { key: "latency", header: "Latency", render: (r) => `${(r.latencyMs / 1000).toFixed(1)}s` },
    { key: "cost", header: "Cost", render: (r) => `$${r.costUsd.toFixed(4)}` },
    {
      key: "status",
      header: "Status",
      render: (r) => <Badge tone={r.status === "success" ? "emerald" : "rose"}>{r.status}</Badge>,
    },
  ];

  return (
    <div className="space-y-4 p-6">
      <h1 className="text-lg font-semibold text-zinc-100">AI Usage</h1>

      <div className="flex flex-wrap items-end gap-3">
        <div className="w-48">
          <Input placeholder="userId…" value={userId} onChange={(e) => setUserId(e.target.value)} />
        </div>
        <div className="w-48">
          <Input placeholder="source (copilot, price_lookup…)" value={source} onChange={(e) => setSource(e.target.value)} />
        </div>
        <div className="w-48">
          <Input placeholder="model…" value={model} onChange={(e) => setModel(e.target.value)} />
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

      <DataTable columns={columns} rows={items} rowKey={(r) => r.requestId} loading={loading} />
      <Pagination page={page} limit={limit} total={total} onChange={setPage} />
    </div>
  );
}
