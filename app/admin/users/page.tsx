"use client";

import { useEffect, useState } from "react";
import { adminApi } from "@/lib/admin-api";
import type { AdminUser, UserStatus } from "@/lib/types";
import { DataTable, type Column } from "@/components/admin/DataTable";
import { Pagination } from "@/components/admin/Pagination";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

const STATUS_TONE: Record<UserStatus, "emerald" | "amber" | "rose" | "zinc"> = {
  ACTIVE: "emerald",
  DISABLED: "amber",
  BANNED: "rose",
  PENDING_EMAIL: "zinc",
  DELETED: "zinc",
};

export default function AdminUsersPage() {
  const toast = useToast();
  const [items, setItems] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const limit = 20;

  function load() {
    setLoading(true);
    adminApi
      .listUsers({ email: email || undefined, role: role || undefined, status: status || undefined, page, limit })
      .then((res) => {
        setItems(res.items);
        setTotal(res.total);
      })
      .catch((err) => toast.error("Lỗi tải danh sách user", err.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  async function toggleStatus(u: AdminUser) {
    const next: UserStatus = u.status === "ACTIVE" ? "DISABLED" : "ACTIVE";
    try {
      await adminApi.updateUserStatus(u.id, next);
      toast.success(`Đã ${next === "ACTIVE" ? "kích hoạt" : "vô hiệu hoá"} ${u.email}`);
      load();
    } catch (err: any) {
      toast.error("Không cập nhật được", err.message);
    }
  }

  async function toggleRole(u: AdminUser) {
    const next = u.role === "admin" ? "user" : "admin";
    try {
      await adminApi.updateUserRole(u.id, next);
      toast.success(`Đã đổi role ${u.email} → ${next}`);
      load();
    } catch (err: any) {
      toast.error("Không đổi được role", err.message);
    }
  }

  const columns: Column<AdminUser>[] = [
    { key: "name", header: "Tên", render: (u) => <span className="font-medium text-zinc-200">{u.name}</span> },
    { key: "email", header: "Email", render: (u) => u.email },
    {
      key: "role",
      header: "Role",
      render: (u) => <Badge tone={u.role === "admin" ? "accent" : "zinc"}>{u.role}</Badge>,
    },
    {
      key: "status",
      header: "Status",
      render: (u) => <Badge tone={STATUS_TONE[u.status] ?? "zinc"}>{u.status}</Badge>,
    },
    {
      key: "lastLoginAt",
      header: "Last login",
      render: (u) => (u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString("vi-VN") : "—"),
    },
    {
      key: "actions",
      header: "",
      className: "text-right",
      render: (u) => (
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="outline" onClick={() => toggleRole(u)}>
            {u.role === "admin" ? "Bỏ admin" : "Cấp admin"}
          </Button>
          <Button size="sm" variant={u.status === "ACTIVE" ? "danger" : "secondary"} onClick={() => toggleStatus(u)}>
            {u.status === "ACTIVE" ? "Disable" : "Enable"}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4 p-6">
      <h1 className="text-lg font-semibold text-zinc-100">User Management</h1>

      <div className="flex flex-wrap items-end gap-3">
        <div className="w-64">
          <Input
            placeholder="Tìm theo email…"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (setPage(1), load())}
          />
        </div>
        <div className="w-40">
          <Select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            options={[{ value: "", label: "Mọi role" }, { value: "admin", label: "Admin" }, { value: "user", label: "User" }]}
          />
        </div>
        <div className="w-40">
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            options={[
              { value: "", label: "Mọi status" },
              { value: "ACTIVE", label: "ACTIVE" },
              { value: "DISABLED", label: "DISABLED" },
              { value: "BANNED", label: "BANNED" },
            ]}
          />
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

      <DataTable columns={columns} rows={items} rowKey={(u) => u.id} loading={loading} />
      <Pagination page={page} limit={limit} total={total} onChange={setPage} />
    </div>
  );
}
