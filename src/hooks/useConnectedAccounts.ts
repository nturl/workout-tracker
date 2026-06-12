"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

interface ConnectionStatus {
  connected: boolean;
  expired?: boolean;
}

function fetchWithCsrf(url: string, opts?: RequestInit) {
  return fetch(url, {
    ...opts,
    headers: {
      ...opts?.headers,
      "X-Requested-With": "fetch",
      "Content-Type": "application/json",
    },
  });
}

export function useOuraStatus() {
  return useQuery<ConnectionStatus>({
    queryKey: ["oura-status"],
    queryFn: async () => {
      const res = await fetch("/api/oura/status");
      if (!res.ok) throw new Error("Failed to fetch Oura status");
      return res.json();
    },
    staleTime: 60_000,
  });
}


export function useOuraSync() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await fetchWithCsrf("/api/oura/sync", { method: "POST" });
      if (!res.ok) throw new Error("Oura sync failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sync-data"] });
    },
  });
}

export function useOuraDisconnect() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await fetchWithCsrf("/api/oura/disconnect", { method: "POST" });
      if (!res.ok) throw new Error("Disconnect failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["oura-status"] });
    },
  });
}

