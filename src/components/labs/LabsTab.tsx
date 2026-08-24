"use client";

import { useState, useRef, useCallback } from "react";
import Image from "next/image";
import { useLabsDashboard, useLabTests, useExtractLabs, useDeleteLab, useHealthGoals } from "@/hooks/useBiomarkers";
import { HealthScoreCard } from "./HealthScoreCard";
import { StatusBreakdownBar } from "./StatusBreakdownBar";
import { CategoryGradeCards } from "./CategoryGradeCard";
import { MarkerTable } from "./MarkerTable";
import { CategoryDetailView } from "./CategoryDetailView";
import { MarkerDetailSheet } from "./MarkerDetailSheet";
import { HealthInsights } from "./HealthInsights";
import { GoalSummaryCard } from "./GoalSummaryCard";
import { GoalProtocolView } from "./GoalProtocolView";
import { BodySilhouette } from "./BodySilhouette";

import type { ChatContext } from "@/components/chat/ChatSheet";

type View = "overview" | "category" | "import" | "history" | "insights" | "goals";

interface LabsTabProps {
  onAskAI?: (context: ChatContext) => void;
}

export function LabsTab({ onAskAI }: LabsTabProps = {}) {
  const [view, setView] = useState<View>("overview");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedMarker, setSelectedMarker] = useState<string | null>(null);
  const [selectedGoalIndex, setSelectedGoalIndex] = useState(0);
  const [hoveredCategory, setHoveredCategory] = useState<string | null>(null);

  const dashboard = useLabsDashboard();
  const { data: goalsData } = useHealthGoals();
  useLabTests(); // keep the query subscription warm for child views

  const hasData = dashboard.allMarkers.length > 0;
  const goals = goalsData?.goals ?? [];

  return (
    <div className="max-w-lg mx-auto px-5 pt-5 pb-24">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="font-display text-[28px] leading-[34px] font-bold tracking-[-0.03em] text-content-primary">Labs</h2>
          <p className="text-xs font-medium text-content-muted">
            {hasData
              ? `${dashboard.allMarkers.length} markers tracked`
              : "Import your first lab report"}
          </p>
        </div>
        <div className="flex gap-2">
          {hasData && (
            <button
              onClick={() => setView("history")}
              className="pressable px-4 h-11 rounded-full text-[13px] font-medium bg-surface-elevated text-content-primary ring-1 ring-[var(--card-border)]"
            >
              History
            </button>
          )}
          <button
            onClick={() => setView("import")}
            className="pressable px-4 h-11 rounded-full text-[13px] font-medium bg-accent text-accent-contrast"
          >
            + Import
          </button>
        </div>
      </div>

      {view === "overview" && (
        <div>
          {!hasData && !dashboard.isLoading ? (
            <EmptyState onImport={() => setView("import")} />
          ) : hasData ? (
            <div className="anim-stagger space-y-6">
              <div className="anim-fade-up" style={{ "--stagger-i": 0 } as React.CSSProperties}>
                <HealthScoreCard
                  grade={dashboard.overallGrade}
                  totalMarkers={dashboard.allMarkers.length}
                  insights={dashboard.insights}
                  goalCount={goals.length}
                  onViewInsights={() => setView("insights")}
                  onViewProtocol={goals.length > 0 ? () => { setSelectedGoalIndex(0); setView("goals"); } : undefined}
                />
              </div>

              {goals.length > 0 && (
                <div className="anim-fade-up" style={{ "--stagger-i": 1 } as React.CSSProperties}>
                  <GoalSummaryCard
                    goals={goals}
                    onSelectGoal={(i) => { setSelectedGoalIndex(i); setView("goals"); }}
                  />
                </div>
              )}

              <div className="anim-fade-up" style={{ "--stagger-i": 2 } as React.CSSProperties}>
                <StatusBreakdownBar breakdown={dashboard.statusBreakdown} />
              </div>

              <div className="anim-fade-up" style={{ "--stagger-i": 3 } as React.CSSProperties}>
                <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-content-secondary mb-3">
                  Body Systems
                </h3>

                <div className="mb-3">
                  <BodySilhouette
                    categories={dashboard.categories}
                    highlightedCategory={hoveredCategory}
                  />
                </div>

                <CategoryGradeCards
                  categories={dashboard.categories}
                  onSelect={(cat) => { setSelectedCategory(cat); setView("category"); }}
                  onHoverCategory={setHoveredCategory}
                />
              </div>

              <div className="anim-fade-up" style={{ "--stagger-i": 4 } as React.CSSProperties}>
                <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-content-secondary mb-3">
                  All Markers
                </h3>
                <MarkerTable
                  markers={dashboard.allMarkers}
                  onSelect={(id) => setSelectedMarker(id)}
                  limit={15}
                />
              </div>
            </div>
          ) : null}
        </div>
      )}

      {view === "category" && selectedCategory && (() => {
        const catData = dashboard.categories.find((c) => c.category === selectedCategory);
        const catMarkers = dashboard.allMarkers.filter((s) => s.meta.category === selectedCategory);
        const catInsights = dashboard.insights?.insights?.filter(
          (i) => i.category.toLowerCase() === selectedCategory.toLowerCase()
            || i.category.toLowerCase() === catData?.label.toLowerCase()
        ) ?? [];
        return catData ? (
          <div className="anim-fade-up">
            <CategoryDetailView
              category={catData}
              markers={catMarkers}
              insights={catInsights}
              categorySummary={dashboard.insights?.categorySummaries?.[selectedCategory]}
              onBack={() => setView("overview")}
              onSelectMarker={(id) => setSelectedMarker(id)}
            />
          </div>
        ) : null;
      })()}

      {view === "import" && (
        <div className="anim-fade-up">
          <button
            onClick={() => setView("overview")}
            className="pressable text-[13px] font-semibold mb-4 flex items-center gap-1 text-accent"
          >
            ← Back
          </button>
          <ImportView onComplete={() => setView("overview")} />
        </div>
      )}

      {view === "history" && (
        <div className="anim-fade-up">
          <button
            onClick={() => setView("overview")}
            className="pressable text-[13px] font-semibold mb-4 flex items-center gap-1 text-accent"
          >
            ← Back
          </button>
          <LabHistory />
        </div>
      )}

      {view === "insights" && (
        <div className="anim-fade-up">
          <button
            onClick={() => setView("overview")}
            className="pressable text-[13px] font-semibold mb-4 flex items-center gap-1 text-accent"
          >
            ← Back
          </button>
          <h3 className="font-display text-xl font-bold tracking-[-0.02em] mb-4 text-content-primary">Health Intelligence</h3>
          <HealthInsights />
        </div>
      )}

      {view === "goals" && goals.length > 0 && (
        <div className="anim-fade-up">
          <GoalProtocolView
            goals={goals}
            initialIndex={selectedGoalIndex}
            allMarkers={dashboard.allMarkers}
            onBack={() => setView("overview")}
            onSelectMarker={(id) => setSelectedMarker(id)}
            onAskAI={onAskAI ? (question, goalContext) => {
              onAskAI({
                biomarkerId: "goal",
                name: goalContext.title,
                value: 0,
                unit: "",
                status: "attention",
                question,
                goalContext,
              });
            } : undefined}
          />
        </div>
      )}

      {/* Marker detail sheet overlay */}
      <MarkerDetailSheet
        biomarkerId={selectedMarker}
        onClose={() => setSelectedMarker(null)}
        onAskAI={onAskAI ? (question, id) => {
          const snapshot = dashboard.allMarkers.find((s) => s.biomarkerId === id);
          if (!snapshot) return;
          const { meta, latest } = snapshot;
          onAskAI({
            biomarkerId: id,
            name: meta.shortName ?? meta.name,
            value: latest.value,
            unit: latest.unit,
            status: latest.status,
            optimalRange: meta.optimal ? `${meta.optimal.low}-${meta.optimal.high}` : undefined,
            standardRange: `${meta.standard.low}-${meta.standard.high}`,
            question,
          });
          setSelectedMarker(null);
        } : undefined}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------


function EmptyState({ onImport }: { onImport: () => void }) {
  return (
    <div className="py-16 text-center">
      <div className="text-4xl mb-3 opacity-60">🧬</div>
      <h3 className="text-[17px] font-semibold tracking-[-0.01em] mb-1 text-content-primary">No lab data yet</h3>
      <p className="text-xs font-medium mb-6 max-w-xs mx-auto text-content-muted">
        Take a photo of your lab report to get started. AI will extract and track your biomarkers automatically.
      </p>
      <button
        onClick={onImport}
        className="pressable px-6 h-11 rounded-button text-[13px] font-medium bg-accent text-accent-contrast"
      >
        Import Lab Report
      </button>
    </div>
  );
}

function ImportView({ onComplete }: { onComplete: () => void }) {
  const extract = useExtractLabs();
  const fileRef = useRef<HTMLInputElement>(null);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [source, setSource] = useState("");
  const [preview, setPreview] = useState<string | null>(null);

  const handleFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  }, []);

  const handleExtract = useCallback(() => {
    if (!preview) return;
    extract.mutate(
      { imageDataUrl: preview, date, source: source || undefined },
      { onSuccess: () => onComplete() },
    );
  }, [preview, date, source, extract, onComplete]);

  return (
    <div className="space-y-4">
      <h3 className="font-display text-xl font-bold tracking-[-0.02em] text-content-primary">Import Lab Report</h3>

      <div
        onClick={() => fileRef.current?.click()}
        className="pressable rounded-card border-2 border-dashed border-active bg-surface-card p-8 text-center cursor-pointer"
      >
        {preview ? (
          preview.startsWith("data:application/pdf") ? (
            <div className="flex flex-col items-center gap-2">
              <div className="text-4xl">📄</div>
              <p className="text-sm font-semibold text-content-primary">PDF uploaded</p>
            </div>
          ) : (
            <Image src={preview} alt="Lab report preview" width={640} height={192} unoptimized className="max-h-48 w-auto mx-auto rounded-lg object-contain" />
          )
        ) : (
          <>
            <div className="text-3xl mb-2">📸</div>
            <p className="text-sm font-semibold text-content-primary">Tap to take a photo or upload</p>
            <p className="text-xs font-medium mt-1 text-content-muted">Supports images and PDFs</p>
          </>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*,application/pdf"
          onChange={handleFile}
          className="hidden"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium block mb-1 text-content-muted">Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="input-field w-full h-11 rounded-button px-3 text-sm bg-surface-input text-content-primary border border-active"
          />
        </div>
        <div>
          <label className="text-xs font-medium block mb-1 text-content-muted">Lab (optional)</label>
          <input
            type="text"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder="e.g. Quest"
            className="input-field w-full h-11 rounded-button px-3 text-sm bg-surface-input text-content-primary placeholder:text-content-muted border border-active"
          />
        </div>
      </div>

      <button
        onClick={handleExtract}
        disabled={!preview || extract.isPending}
        className="pressable w-full h-11 rounded-button text-[13px] font-medium bg-accent text-accent-contrast disabled:opacity-50"
      >
        {extract.isPending ? "Analyzing..." : "Extract Biomarkers"}
      </button>

      {extract.isError && (
        <p className="text-xs text-center text-danger">
          {extract.error.message}
        </p>
      )}

      {extract.isSuccess && extract.data && (
        <div className="glass-card rounded-card p-4">
          <p className="text-sm font-bold mb-1 text-content-primary">
            Extracted {extract.data.stats.matched} markers
          </p>
          {extract.data.stats.unmatched > 0 && (
            <p className="text-xs font-medium text-content-muted">
              {extract.data.stats.unmatched} unrecognized markers skipped
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function LabHistory() {
  const labs = useLabTests();
  const deleteLab = useDeleteLab();

  return (
    <div>
      <h3 className="font-display text-xl font-bold tracking-[-0.02em] mb-3 text-content-primary">All Lab Tests</h3>
      {labs.isLoading && <p className="text-sm text-content-muted">Loading...</p>}
      <div className="space-y-3">
        {labs.data?.map((lab) => (
          <div
            key={lab.id}
            className="glass-card rounded-card p-4 flex items-center gap-3"
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-content-primary">{lab.name}</p>
              <p className="text-xs font-medium text-content-muted">
                {lab.source} - {lab.date} - {lab.markerCount} markers - {lab.importMethod}
              </p>
            </div>
            <button
              onClick={() => deleteLab.mutate(lab.id)}
              className="pressable text-xs px-3 py-1 rounded-button bg-surface-elevated text-content-muted"
              disabled={deleteLab.isPending}
            >
              Delete
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
