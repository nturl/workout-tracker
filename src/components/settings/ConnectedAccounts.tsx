"use client";

import { useState } from "react";
import {
  useOuraStatus,
  useOuraSync,
  useOuraDisconnect,
} from "@/hooks/useConnectedAccounts";

function AccountCard({
  name,
  icon,
  connected,
  loading,
  syncing,
  onConnect,
  onDisconnect,
  onSync,
}: {
  name: string;
  icon: string;
  connected: boolean;
  loading: boolean;
  syncing?: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  onSync?: () => void;
}) {
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="rounded-card p-4 bg-surface-elevated">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-lg">{icon}</span>
          <span className="text-sm font-semibold text-content-primary">{name}</span>
        </div>
        <span
          className="text-[12px] leading-[16px] font-semibold px-2 py-0.5 rounded-full"
          style={
            connected
              ? { background: "var(--accent-glow)", color: "var(--accent)" }
              : { background: "var(--bg-card)", color: "var(--text-muted)" }
          }>
          {loading ? "..." : connected ? "Connected" : "Not connected"}
        </span>
      </div>
      <div className="flex gap-2 mt-3">
        {connected ? (
          <>
            {onSync && (
              <button onClick={onSync} disabled={syncing}
                className="flex-1 h-11 rounded-button text-[13px] leading-[16px] font-medium pressable bg-surface-card text-content-primary border"
                style={{ borderColor: "var(--card-border)" }}>
                {syncing ? "Syncing..." : "Sync Today"}
              </button>
            )}
            {confirming ? (
              <button onClick={() => { onDisconnect(); setConfirming(false); }}
                className="flex-1 h-11 rounded-button text-[13px] leading-[16px] font-medium pressable bg-surface-card text-danger border"
                style={{ borderColor: "var(--danger)" }}>
                Confirm
              </button>
            ) : (
              <button onClick={() => setConfirming(true)}
                className="flex-1 h-11 rounded-button text-[13px] leading-[16px] font-medium pressable bg-surface-card text-content-muted border"
                style={{ borderColor: "var(--card-border)" }}>
                Disconnect
              </button>
            )}
          </>
        ) : (
          <button onClick={onConnect} disabled={loading}
            className="flex-1 h-11 rounded-button text-[13px] leading-[16px] font-medium pressable bg-accent text-accent-contrast disabled:opacity-50">
            Connect
          </button>
        )}
      </div>
    </div>
  );
}

export function ConnectedAccounts() {
  const ouraStatus = useOuraStatus();

  const ouraSync = useOuraSync();
  const ouraDisconnect = useOuraDisconnect();
  const handleOuraConnect = () => {
    window.location.href = "/api/oauth/oura/authorize";
  };

  return (
    <div>
      <p className="text-[12px] leading-[16px] font-semibold tracking-[0.08em] uppercase text-content-secondary mb-3">
        Connected Accounts
      </p>
      <div className="space-y-3">
        <AccountCard
          name="Oura Ring"
          icon="💍"
          connected={ouraStatus.data?.connected ?? false}
          loading={ouraStatus.isLoading}
          syncing={ouraSync.isPending}
          onConnect={handleOuraConnect}
          onDisconnect={() => ouraDisconnect.mutate()}
          onSync={() => ouraSync.mutate()}
        />
      </div>
    </div>
  );
}
