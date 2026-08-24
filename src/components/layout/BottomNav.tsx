"use client";

import { Icon, type IconName } from "@/components/ui/Icon";

export type TabId = "workouts" | "labs" | "recovery" | "settings";

interface Tab {
  id: TabId;
  label: string;
  icon: IconName;
}

const TABS: Tab[] = [
  { id: "workouts", label: "Workouts", icon: "dumbbell" },
  { id: "labs", label: "Labs", icon: "flask" },
  { id: "recovery", label: "Recovery", icon: "heart-pulse" },
  { id: "settings", label: "Settings", icon: "sliders" },
];

interface BottomNavProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
}

export function BottomNav({ activeTab, onTabChange }: BottomNavProps) {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 border-t"
      style={{
        background: "var(--glass-bg)",
        backdropFilter: "blur(20px) saturate(180%)",
        WebkitBackdropFilter: "blur(20px) saturate(180%)",
        borderColor: "var(--glass-border)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
      role="tablist"
      aria-label="Main navigation"
    >
      <div className="max-w-lg mx-auto flex justify-around items-center h-14 px-2">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              aria-label={tab.label}
              onClick={() => onTabChange(tab.id)}
              className="flex flex-col items-center justify-center flex-1 h-full relative pressable"
              style={{ WebkitTapHighlightColor: "transparent" }}
            >
              {isActive && (
                <span
                  className="absolute -top-px left-3 right-3 h-0.5 rounded-full anim-scale-in"
                  style={{ background: "var(--accent)", boxShadow: "0 0 8px var(--accent-glow)" }}
                  aria-hidden="true"
                />
              )}
              <span
                className="leading-none transition-transform duration-150"
                style={{
                  color: isActive ? "var(--accent)" : "var(--text-muted)",
                  transform: isActive ? "translateY(-1px) scale(1.12)" : "translateY(0) scale(1)",
                }}
              >
                <Icon name={tab.icon} size={21} strokeWidth={isActive ? 2.2 : 1.9} />
              </span>
              <span
                className="text-[10px] font-semibold mt-1 transition-colors"
                style={{ color: isActive ? "var(--accent)" : "var(--text-muted)" }}
              >
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
