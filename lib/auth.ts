"use client";

import { useEffect, useState, useCallback } from "react";
import type { User } from "./types";

const TOKEN_KEY = "genspec_token";
const USER_KEY = "genspec_user";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function getStoredUser(): User | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
}

export function setStoredUser(user: User) {
  window.localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearAuth() {
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(USER_KEY);
}

// Notify subscribers (same-tab) when auth changes.
const listeners = new Set<() => void>();
function emitAuthChange() {
  listeners.forEach((l) => l());
}

export function saveSession(token: string, user: User) {
  setToken(token);
  setStoredUser(user);
  emitAuthChange();
}

export function logout() {
  clearAuth();
  emitAuthChange();
}

export interface UseAuth {
  user: User | null;
  token: string | null;
  ready: boolean;
  isAuthenticated: boolean;
  signOut: () => void;
}

export function useAuth(): UseAuth {
  const [user, setUser] = useState<User | null>(null);
  const [token, setTok] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(() => {
    setUser(getStoredUser());
    setTok(getToken());
  }, []);

  useEffect(() => {
    const listener = () => refresh();
    // Initial hydrate from localStorage (client-only, runs once on mount).
    listener();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReady(true);
    listeners.add(listener);
    window.addEventListener("storage", listener);
    return () => {
      listeners.delete(listener);
      window.removeEventListener("storage", listener);
    };
  }, [refresh]);

  const signOut = useCallback(() => {
    logout();
  }, []);

  return {
    user,
    token,
    ready,
    isAuthenticated: !!token,
    signOut,
  };
}
