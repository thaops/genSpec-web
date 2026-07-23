"use client";

import { useEffect, useState } from "react";
import { adminApi } from "@/lib/admin-api";
import type { AdminDashboardSnapshot } from "@/lib/types";
import { StatCard } from "@/components/admin/StatCard";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { Spinner } from "@/components/ui/Button";
import { Users, FileSpreadsheet, PencilRuler, Cpu, DollarSign, Server } from "lucide-react";

function fmt(n: number | undefined) {
  return (n ?? 0).toLocaleString("vi-VN");
}

function fmtUsd(n: number | undefined) {
  return `$${(n ?? 0).toFixed(2)}`;
}

function fmtBytes(n: number | undefined) {
  if (!n) return "0 MB";
  const mb = n / (1024 * 1024);
  return mb > 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${mb.toFixed(1)} MB`;
}

export default function AdminDashboardPage() {
  const [data, setData] = useState<AdminDashboardSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    adminApi
      .dashboard()
      .then((d) => alive && setData(d))
      .catch((err) => alive && setError(err.message));
    return () => {
      alive = false;
    };
  }, []);

  if (error) {
    return <div className="p-6 text-sm text-rose-400">{error}</div>;
  }
  if (!data) {
    return (
      <div className="flex h-full items-center justify-center text-zinc-500">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-lg font-semibold text-zinc-100">Dashboard</h1>
        <p className="text-xs text-zinc-500">Cập nhật lúc {new Date(data.generatedAt).toLocaleTimeString("vi-VN")}</p>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
        <StatCard label="Tổng users" value={fmt(data.users.total)} icon={<Users className="h-4 w-4" />} />
        <StatCard label="Active hôm nay" value={fmt(data.users.activeToday)} icon={<Users className="h-4 w-4" />} />
        <StatCard label="Estimate hôm nay" value={fmt(data.estimatesToday)} icon={<FileSpreadsheet className="h-4 w-4" />} />
        <StatCard label="Drawing hôm nay" value={fmt(data.drawingsToday)} icon={<PencilRuler className="h-4 w-4" />} />
        <StatCard label="AI requests hôm nay" value={fmt(data.ai.totals.requests)} icon={<Cpu className="h-4 w-4" />} />
        <StatCard label="AI tokens hôm nay" value={fmt(data.ai.totals.totalTokens)} icon={<Cpu className="h-4 w-4" />} />
        <StatCard label="Chi phí AI hôm nay" value={fmtUsd(data.ai.totals.costUsd)} icon={<DollarSign className="h-4 w-4" />} />
        <StatCard
          label="Storage (Cloudinary)"
          value={data.storage ? fmtBytes(data.storage.storageBytes) : "—"}
          icon={<Server className="h-4 w-4" />}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title="AI theo source" subtitle="Hôm nay" />
          <CardBody>
            {data.ai.bySource.length === 0 ? (
              <p className="text-xs text-zinc-500">Chưa có dữ liệu</p>
            ) : (
              <ul className="space-y-2">
                {data.ai.bySource.map((s) => (
                  <li key={s.source} className="flex items-center justify-between text-sm">
                    <span className="text-zinc-300">{s.source}</span>
                    <span className="text-zinc-500">
                      {fmt(s.requests)} req · {fmtUsd(s.costUsd)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Top user AI" subtitle="Hôm nay" />
          <CardBody>
            {data.ai.topUsers.length === 0 ? (
              <p className="text-xs text-zinc-500">Chưa có dữ liệu</p>
            ) : (
              <ul className="space-y-2">
                {data.ai.topUsers.map((u) => (
                  <li key={u.userId} className="flex items-center justify-between text-sm">
                    <span className="truncate text-zinc-300">{u.userId}</span>
                    <span className="text-zinc-500">{fmtUsd(u.costUsd)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Queue / Crawl" subtitle="Trạng thái hiện tại" />
          <CardBody className="space-y-3">
            <div>
              <p className="mb-1 text-xs text-zinc-500">Drawing queue</p>
              {data.queue ? (
                <p className="text-sm text-zinc-300">
                  {fmt(data.queue.waiting)} chờ · {fmt(data.queue.active)} đang chạy · {fmt(data.queue.failed)} lỗi
                </p>
              ) : (
                <p className="text-xs text-zinc-600">Không có Redis/queue</p>
              )}
            </div>
            <div>
              <p className="mb-1 text-xs text-zinc-500">Crawl jobs</p>
              {Object.keys(data.crawl.byStatus).length === 0 ? (
                <p className="text-xs text-zinc-600">Chưa có crawl job</p>
              ) : (
                <p className="text-sm text-zinc-300">
                  {Object.entries(data.crawl.byStatus)
                    .map(([k, v]) => `${k}: ${v}`)
                    .join(" · ")}
                </p>
              )}
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
