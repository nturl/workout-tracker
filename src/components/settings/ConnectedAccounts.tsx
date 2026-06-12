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
    <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-elevated)" }}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-lg">{icon}</span>
          <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{name}</span>
        </div>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${connected ? "bg-green-500/20 text-green-500" : ""}`}
          style={!connected ? { background: "var(--bg-card)", color: "var(--text-muted)" } : undefined}>
          {loading ? "..." : connected ? "Connected" : "Not connected"}
        </span>
      </div>
      <div className="flex gap-2 mt-3">
        {connected ? (
          <>
            {onSync && (
              <button onClick={onSync} disabled={syncing}
                className="flex-1 py-2 rounded-lg text-xs font-semibold transition-all"
                style={{ background: "var(--bg-card)", color: "var(--text-primary)", border: "1px solid var(--border)" }}>
                {syncing ? "Syncing..." : "Sync Today"}
              </button>
            )}
            {confirming ? (
              <button onClick={() => { onDisconnect(); setConfirming(false); }}
                className="flex-1 py-2 rounded-lg text-xs font-semibold bg-red-500/20 text-red-500 transition-all">
                Confirm
              </button>
            ) : (
              <button onClick={() => setConfirming(true)}
                className="flex-1 py-2 rounded-lg text-xs font-semibold transition-all"
                style={{ background: "var(--bg-card)", color: "var(--text-muted)", border: "1px solid var(--border)" }}>
                Disconnect
              </button>
            )}
          </>
        ) : (
          <button onClick={onConnect} disabled={loading}
            className="flex-1 py-2 rounded-lg text-xs font-semibold transition-all"
            style={{ background: "var(--text-primary)", color: "var(--bg-primary)" }}>
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
      <p className="text-xs font-semibold tracking-wide mb-3" style={{ color: "var(--text-muted)" }}>
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
