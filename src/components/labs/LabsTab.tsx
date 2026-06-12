"use client";

import { useState, useRef, useCallback } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { useLabsDashboard, useLabTests, useExtractLabs, useDeleteLab, useHealthGoals } from "@/hooks/useBiomarkers";
import { staggerContainer, fadeUp } from "@/lib/motion";
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
          <h2 className="text-2xl font-black tracking-tight" style={{ color: "var(--text-primary)" }}>Labs</h2>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            {hasData
              ? `${dashboard.allMarkers.length} markers tracked`
              : "Import your first lab report"}
          </p>
        </div>
        <div className="flex gap-2">
          {hasData && (
            <button
              onClick={() => setView("history")}
              className="px-4 py-2 rounded-full text-xs font-bold transition-all hover:scale-105 active:scale-95"
              style={{ background: "var(--bg-elevated)", color: "var(--text-primary)" }}
            >
              History
            </button>
          )}
          <button
            onClick={() => setView("import")}
            className="px-4 py-2 rounded-full text-xs font-bold transition-all hover:scale-105 active:scale-95"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            + Import
          </button>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {view === "overview" && (
          <motion.div key="overview" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {!hasData && !dashboard.isLoading ? (
              <EmptyState onImport={() => setView("import")} />
            ) : hasData ? (
              <motion.div variants={staggerContainer} initial="initial" animate="animate" className="space-y-5">
                <HealthScoreCard
                  grade={dashboard.overallGrade}
                  totalMarkers={dashboard.allMarkers.length}
                  insights={dashboard.insights}
                  goalCount={goals.length}
                  onViewInsights={() => setView("insights")}
                  onViewProtocol={goals.length > 0 ? () => { setSelectedGoalIndex(0); setView("goals"); } : undefined}
                />

                {goals.length > 0 && (
                  <GoalSummaryCard
                    goals={goals}
                    onSelectGoal={(i) => { setSelectedGoalIndex(i); setView("goals"); }}
                  />
                )}

                <StatusBreakdownBar breakdown={dashboard.statusBreakdown} />

                <div>
                  <motion.h3
                    variants={fadeUp}
                    className="text-xs font-bold uppercase tracking-widest mb-3"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Body Systems
                  </motion.h3>

                  <motion.div variants={fadeUp} className="mb-3">
                    <BodySilhouette
                      categories={dashboard.categories}
                      highlightedCategory={hoveredCategory}
                    />
                  </motion.div>

                  <CategoryGradeCards
                    categories={dashboard.categories}
                    onSelect={(cat) => { setSelectedCategory(cat); setView("category"); }}
                    onHoverCategory={setHoveredCategory}
                  />
                </div>

                <motion.div variants={fadeUp}>
                  <h3 className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: "var(--text-muted)" }}>
                    All Markers
                  </h3>
                  <MarkerTable
                    markers={dashboard.allMarkers}
                    onSelect={(id) => setSelectedMarker(id)}
                    limit={15}
                  />
                </motion.div>
              </motion.div>
            ) : null}
          </motion.div>
        )}

        {view === "category" && selectedCategory && (() => {
          const catData = dashboard.categories.find((c) => c.category === selectedCategory);
          const catMarkers = dashboard.allMarkers.filter((s) => s.meta.category === selectedCategory);
          const catInsights = dashboard.insights?.insights?.filter(
            (i) => i.category.toLowerCase() === selectedCategory.toLowerCase()
              || i.category.toLowerCase() === catData?.label.toLowerCase()
          ) ?? [];
          return catData ? (
            <motion.div key="category" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
              <CategoryDetailView
                category={catData}
                markers={catMarkers}
                insights={catInsights}
                categorySummary={dashboard.insights?.categorySummaries?.[selectedCategory]}
                onBack={() => setView("overview")}
                onSelectMarker={(id) => setSelectedMarker(id)}
              />
            </motion.div>
          ) : null;
        })()}

        {view === "import" && (
          <motion.div key="import" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
            <button
              onClick={() => setView("overview")}
              className="text-xs font-semibold mb-4 flex items-center gap-1"
              style={{ color: "var(--accent)" }}
            >
              ← Back
            </button>
            <ImportView onComplete={() => setView("overview")} />
          </motion.div>
        )}

        {view === "history" && (
          <motion.div key="history" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
            <button
              onClick={() => setView("overview")}
              className="text-xs font-semibold mb-4 flex items-center gap-1"
              style={{ color: "var(--accent)" }}
            >
              ← Back
            </button>
            <LabHistory />
          </motion.div>
        )}

        {view === "insights" && (
          <motion.div key="insights" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
            <button
              onClick={() => setView("overview")}
              className="text-xs font-semibold mb-4 flex items-center gap-1"
              style={{ color: "var(--accent)" }}
            >
              ← Back
            </button>
            <h3 className="text-lg font-bold mb-4" style={{ color: "var(--text-primary)" }}>Health Intelligence</h3>
            <HealthInsights />
          </motion.div>
        )}

        {view === "goals" && goals.length > 0 && (
          <motion.div key="goals" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
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
          </motion.div>
        )}
      </AnimatePresence>

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
    <div className="rounded-2xl p-8 text-center" style={{ background: "var(--bg-card)", boxShadow: "var(--card-shadow)" }}>
      <div className="text-4xl mb-3">🧬</div>
      <h3 className="text-lg font-bold mb-1" style={{ color: "var(--text-primary)" }}>No lab data yet</h3>
      <p className="text-sm mb-4" style={{ color: "var(--text-muted)" }}>
        Take a photo of your lab report to get started. AI will extract and track your biomarkers automatically.
      </p>
      <button
        onClick={onImport}
        className="px-6 py-3 rounded-full text-sm font-bold transition-all hover:scale-105"
        style={{ background: "var(--accent)", color: "#fff" }}
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
      <h3 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>Import Lab Report</h3>

      <div
        onClick={() => fileRef.current?.click()}
        className="rounded-2xl border-2 border-dashed p-8 text-center cursor-pointer transition-all hover:scale-[1.01]"
        style={{ borderColor: "var(--border-active)", background: "var(--bg-card)" }}
      >
        {preview ? (
          preview.startsWith("data:application/pdf") ? (
            <div className="flex flex-col items-center gap-2">
              <div className="text-4xl">📄</div>
              <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>PDF uploaded</p>
            </div>
          ) : (
            <Image src={preview} alt="Lab report preview" width={640} height={192} unoptimized className="max-h-48 w-auto mx-auto rounded-lg object-contain" />
          )
        ) : (
          <>
            <div className="text-3xl mb-2">📸</div>
            <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Tap to take a photo or upload</p>
            <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>Supports images and PDFs</p>
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
          <label className="text-xs font-semibold block mb-1" style={{ color: "var(--text-muted)" }}>Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full rounded-xl px-3 py-2 text-sm"
            style={{ background: "var(--bg-input)", color: "var(--text-primary)", border: "1px solid var(--border-active)" }}
          />
        </div>
        <div>
          <label className="text-xs font-semibold block mb-1" style={{ color: "var(--text-muted)" }}>Lab (optional)</label>
          <input
            type="text"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder="e.g. Quest"
            className="w-full rounded-xl px-3 py-2 text-sm"
            style={{ background: "var(--bg-input)", color: "var(--text-primary)", border: "1px solid var(--border-active)" }}
          />
        </div>
      </div>

      <button
        onClick={handleExtract}
        disabled={!preview || extract.isPending}
        className="w-full py-3 rounded-full text-sm font-bold transition-all hover:scale-[1.02] disabled:opacity-50"
        style={{ background: "var(--accent)", color: "#fff" }}
      >
        {extract.isPending ? "Analyzing..." : "Extract Biomarkers"}
      </button>

      {extract.isError && (
        <p className="text-xs text-center" style={{ color: "#ef4444" }}>
          {extract.error.message}
        </p>
      )}

      {extract.isSuccess && extract.data && (
        <div className="rounded-xl p-4" style={{ background: "var(--bg-card)" }}>
          <p className="text-sm font-bold mb-1" style={{ color: "var(--text-primary)" }}>
            Extracted {extract.data.stats.matched} markers
          </p>
          {extract.data.stats.unmatched > 0 && (
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
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
      <h3 className="text-lg font-bold mb-3" style={{ color: "var(--text-primary)" }}>All Lab Tests</h3>
      {labs.isLoading && <p className="text-sm" style={{ color: "var(--text-muted)" }}>Loading...</p>}
      <div className="space-y-2">
        {labs.data?.map((lab) => (
          <div
            key={lab.id}
            className="rounded-xl p-4 flex items-center gap-3"
            style={{ background: "var(--bg-card)", boxShadow: "var(--shadow-sm)" }}
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>{lab.name}</p>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                {lab.source} - {lab.date} - {lab.markerCount} markers - {lab.importMethod}
              </p>
            </div>
            <button
              onClick={() => deleteLab.mutate(lab.id)}
              className="text-xs px-3 py-1 rounded-lg transition-all hover:scale-105"
              style={{ background: "var(--bg-elevated)", color: "var(--text-muted)" }}
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
