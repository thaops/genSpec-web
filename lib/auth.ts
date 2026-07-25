"use client";

import { useEffect, useState, useCallback } from "react";
import type { User } from "./types";

/**
 * Hai session ĐỘC LẬP, không dùng lẫn:
 * - `app`   — workspace client, token cấp ở `/auth/login`
 * - `admin` — admin portal, token cấp ở `/auth/admin/login`
 * Đăng nhập/đăng xuất bên này không ảnh hưởng bên kia.
 */
export type AuthScope = "app" | "admin";

const KEYS: Record<AuthScope, { token: string; user: string }> = {
  // Giữ nguyên key cũ của app → user đang đăng nhập không bị đăng xuất.
  app: { token: "genspec_token", user: "genspec_user" },
  admin: { token: "genspec_admin_token", user: "genspec_admin_user" },
};

export function getToken(scope: AuthScope = "app"): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(KEYS[scope].token);
}

export function setToken(token: string, scope: AuthScope = "app") {
  window.localStorage.setItem(KEYS[scope].token, token);
}

export function getStoredUser(scope: AuthScope = "app"): User | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(KEYS[scope].user);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
}

export function setStoredUser(user: User, scope: AuthScope = "app") {
  window.localStorage.setItem(KEYS[scope].user, JSON.stringify(user));
}

export function clearAuth(scope: AuthScope = "app") {
  window.localStorage.removeItem(KEYS[scope].token);
  window.localStorage.removeItem(KEYS[scope].user);
}

// Notify subscribers (same-tab) when auth changes — tách theo scope để
// login admin không ép app re-render và ngược lại.
const listeners: Record<AuthScope, Set<() => void>> = { app: new Set(), admin: new Set() };
function emitAuthChange(scope: AuthScope) {
  listeners[scope].forEach((l) => l());
}

export function saveSession(token: string, user: User, scope: AuthScope = "app") {
  setToken(token, scope);
  setStoredUser(user, scope);
  emitAuthChange(scope);
}

export function logout(scope: AuthScope = "app") {
  clearAuth(scope);
  emitAuthChange(scope);
}

export interface UseAuth {
  user: User | null;
  token: string | null;
  ready: boolean;
  isAuthenticated: boolean;
  signOut: () => void;
}

function useScopedAuth(scope: AuthScope): UseAuth {
  const [user, setUser] = useState<User | null>(null);
  const [token, setTok] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(() => {
    setUser(getStoredUser(scope));
    setTok(getToken(scope));
  }, [scope]);

  useEffect(() => {
    const listener = () => refresh();
    // Initial hydrate from localStorage (client-only, runs once on mount).
    listener();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReady(true);
    listeners[scope].add(listener);
    window.addEventListener("storage", listener);
    return () => {
      listeners[scope].delete(listener);
      window.removeEventListener("storage", listener);
    };
  }, [refresh, scope]);

  const signOut = useCallback(() => {
    logout(scope);
  }, [scope]);

  return {
    user,
    token,
    ready,
    isAuthenticated: !!token,
    signOut,
  };
}

/** Session workspace client. */
export function useAuth(): UseAuth {
  return useScopedAuth("app");
}

/** Session admin portal — hoàn toàn tách khỏi session client. */
export function useAdminAuth(): UseAuth {
  return useScopedAuth("admin");
}
