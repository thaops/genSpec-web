/**
 * Khoá hành vi: session client và session admin phải ĐỘC LẬP.
 * Test chạy ở môi trường node → tự dựng localStorage + window tối thiểu.
 */
import type { User } from "./types";

const store = new Map<string, string>();
const localStorageMock = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
};

(globalThis as unknown as { window: unknown }).window = {
  localStorage: localStorageMock,
  addEventListener: () => {},
  removeEventListener: () => {},
};

import {
  getToken,
  getStoredUser,
  saveSession,
  logout,
} from "./auth";

const CLIENT: User = {
  id: "u1",
  name: "QS",
  email: "qs@genspec.vn",
  role: "user",
} as User;

const ADMIN: User = {
  id: "u2",
  name: "Admin",
  email: "admin@genspec.vn",
  role: "admin",
} as User;

beforeEach(() => store.clear());

describe("2 namespace session tách biệt", () => {
  it("dùng key localStorage khác nhau", () => {
    saveSession("t-app", CLIENT, "app");
    saveSession("t-admin", ADMIN, "admin");
    expect([...store.keys()].sort()).toEqual([
      "genspec_admin_token",
      "genspec_admin_user",
      "genspec_token",
      "genspec_user",
    ]);
  });

  it("giữ nguyên key cũ cho app (user đang đăng nhập không bị đăng xuất)", () => {
    saveSession("t-app", CLIENT);
    expect(store.get("genspec_token")).toBe("t-app");
  });

  it("login admin KHÔNG ghi đè session client", () => {
    saveSession("t-app", CLIENT, "app");
    saveSession("t-admin", ADMIN, "admin");
    expect(getToken("app")).toBe("t-app");
    expect(getStoredUser("app")?.email).toBe(CLIENT.email);
  });

  it("logout admin KHÔNG đá session client", () => {
    saveSession("t-app", CLIENT, "app");
    saveSession("t-admin", ADMIN, "admin");
    logout("admin");
    expect(getToken("admin")).toBeNull();
    expect(getToken("app")).toBe("t-app");
  });

  it("logout client KHÔNG đá session admin", () => {
    saveSession("t-app", CLIENT, "app");
    saveSession("t-admin", ADMIN, "admin");
    logout("app");
    expect(getToken("app")).toBeNull();
    expect(getToken("admin")).toBe("t-admin");
  });

  it("có session client không đồng nghĩa có session admin", () => {
    saveSession("t-app", ADMIN, "app"); // account admin login ở cổng client
    expect(getToken("admin")).toBeNull();
    expect(getStoredUser("admin")).toBeNull();
  });
});
