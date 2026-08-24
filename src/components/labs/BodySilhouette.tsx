"use client";

import type { GradedCategory } from "@/hooks/useBiomarkers";
import type { BiomarkerCategory } from "@/types/biomarker";

/* ------------------------------------------------------------------ */
/*  Region -> category mapping                                        */
/* ------------------------------------------------------------------ */

type Region =
  | "brain"
  | "thyroid"
  | "heart"
  | "lungs"
  | "liver"
  | "kidneys"
  | "pancreas"
  | "reproductive"
  | "veins"
  | "bonesMarrow"
  | "lymph"
  | "wholeBody";

const CATEGORY_TO_REGION: Record<BiomarkerCategory, Region> = {
  thyroid: "thyroid",
  immune: "lymph",
  cardiac: "heart",
  lipids: "heart",
  coagulation: "veins",
  liver: "liver",
  inflammation: "lymph",
  kidney: "kidneys",
  electrolytes: "kidneys",
  minerals: "bonesMarrow",
  hormones: "reproductive",
  glucose: "pancreas",
  cbc: "bonesMarrow",
  iron: "veins",
  metabolic: "wholeBody",
  vitamins: "wholeBody",
  other: "wholeBody",
  tumor_markers: "wholeBody",
};

const REGION_LABEL: Record<Region, string> = {
  brain: "Brain",
  thyroid: "Thyroid",
  heart: "Heart",
  lungs: "Lungs",
  liver: "Liver",
  kidneys: "Kidneys",
  pancreas: "Pancreas",
  reproductive: "Endocrine",
  veins: "Vascular",
  bonesMarrow: "Marrow",
  lymph: "Lymphatic",
  wholeBody: "Systemic",
};

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

interface Props {
  categories: GradedCategory[];
  highlightedCategory: string | null;
}

export function BodySilhouette({ categories, highlightedCategory }: Props) {
  const categoryMap = new Map(categories.map((c) => [c.category, c]));
  const highlighted = highlightedCategory
    ? categoryMap.get(highlightedCategory as BiomarkerCategory)
    : null;
  const activeRegion: Region | null = highlighted
    ? CATEGORY_TO_REGION[highlighted.category]
    : null;

  const accent = highlighted?.grade.color ?? "var(--accent)";

  const isActive = (region: Region) => activeRegion === region;
  const organFill = (region: Region) => {
    if (isActive(region)) return accent;
    if (isActive("wholeBody") && region !== "wholeBody") return "var(--text-secondary)";
    return "var(--text-muted)";
  };
  const organOpacity = (region: Region) => {
    if (isActive(region)) return 0.85;
    if (isActive("wholeBody") && region !== "wholeBody") return 0.28;
    return 0.22;
  };
  const organStroke = (region: Region) => {
    if (isActive(region)) return accent;
    return "var(--text-muted)";
  };
  const organStrokeWidth = (region: Region) => (isActive(region) ? 1.6 : 0.8);

  return (
    <div className="flex flex-col items-center justify-center py-2">
      {/* Region highlight/selection animations run on CSS transitions
          (var(--dur-base)); the heartbeat + focus pulse are keyframes.
          The global prefers-reduced-motion rule neutralizes both. */}
      <style>{`
        .labs-body-shape {
          transition:
            fill var(--dur-base) var(--ease-out-quart),
            fill-opacity var(--dur-base) var(--ease-out-quart),
            stroke var(--dur-base) var(--ease-out-quart),
            stroke-opacity var(--dur-base) var(--ease-out-quart),
            stroke-width var(--dur-base) var(--ease-out-quart),
            opacity var(--dur-base) var(--ease-out-quart),
            r var(--dur-base) var(--ease-out-quart);
        }
        @keyframes labs-heart-beat {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.08); }
        }
        .labs-heart-beat {
          animation: labs-heart-beat 1.2s ease-in-out infinite;
          transform-box: fill-box;
          transform-origin: center;
        }
        @keyframes labs-region-pulse {
          0%, 100% { opacity: 0.8; transform: scale(0.8); }
          50% { opacity: 0; transform: scale(1.4); }
        }
        .labs-region-pulse {
          animation: labs-region-pulse 1.8s ease-in-out infinite;
          transform-box: fill-box;
          transform-origin: center;
        }
      `}</style>

      <svg
        viewBox="0 0 200 340"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ width: 200, height: 320, maxWidth: "100%" }}
        aria-hidden="true"
      >
        <defs>
          <radialGradient id="bodyShadow" cx="50%" cy="45%" r="55%">
            <stop offset="0%" stopColor="var(--text-muted)" stopOpacity="0.08" />
            <stop offset="100%" stopColor="var(--text-muted)" stopOpacity="0" />
          </radialGradient>
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Aura / whole body radial glow */}
        <ellipse
          className="labs-body-shape"
          cx={100}
          cy={170}
          rx={90}
          ry={160}
          fill="url(#bodyShadow)"
          style={{ opacity: isActive("wholeBody") ? 1 : 0.45 }}
        />

        {/* ---------- Body outline ---------- */}
        <path
          className="labs-body-shape"
          d={[
            // Head
            "M100 14 C84 14 72 28 72 46 C72 58 78 68 86 74 L86 82 L74 86",
            // Shoulders + arms (left)
            "L54 92 L42 102 L34 120 L28 152 L26 184 L30 188 L36 184 L42 158 L48 128 L54 112",
            // Left side torso -> hip -> leg
            "L56 160 L54 224 L50 292 L48 322 L66 322 L68 302 L74 240 L80 180 L92 186",
            // Center + right leg
            "L108 186 L120 180 L126 240 L132 302 L134 322 L152 322 L150 292 L146 224 L144 160 L146 112",
            // Right arm
            "L152 128 L158 158 L164 184 L170 188 L174 184 L172 152 L166 120 L158 102 L146 92",
            // Right shoulder back to neck
            "L126 86 L114 82 L114 74 C122 68 128 58 128 46 C128 28 116 14 100 14 Z",
          ].join(" ")}
          stroke="var(--text-muted)"
          strokeWidth="1.4"
          strokeLinejoin="round"
          strokeOpacity={0.55}
          fill="var(--text-muted)"
          fillOpacity={0.045}
        />

        {/* ---------- Skeletal spine hint ---------- */}
        <line
          x1="100"
          y1="84"
          x2="100"
          y2="218"
          stroke="var(--text-muted)"
          strokeWidth="0.6"
          strokeOpacity={0.22}
          strokeDasharray="2 3"
        />

        {/* ---------- Brain (head) ---------- */}
        <g
          className="labs-body-shape"
          style={{ opacity: isActive("brain") ? 1 : 0.4 }}
        >
          <path
            className="labs-body-shape"
            d="M86 42 Q86 30 100 26 Q114 30 114 42 Q114 52 108 58 Q104 62 100 62 Q96 62 92 58 Q86 52 86 42 Z"
            fill={organFill("brain")}
            fillOpacity={organOpacity("brain")}
            stroke={organStroke("brain")}
            strokeWidth={organStrokeWidth("brain")}
          />
          {/* brain folds */}
          <path
            className="labs-body-shape"
            d="M92 36 Q100 42 108 36 M90 46 Q100 52 110 46 M94 54 Q100 58 106 54"
            stroke={isActive("brain") ? accent : "var(--text-muted)"}
            strokeOpacity={isActive("brain") ? 0.6 : 0.3}
            strokeWidth="0.8"
            fill="none"
          />
        </g>

        {/* ---------- Thyroid (neck) ---------- */}
        <g
          className="labs-body-shape"
          style={{ opacity: isActive("thyroid") ? 1 : 0.4 }}
        >
          <path
            className="labs-body-shape"
            d="M92 80 Q96 74 100 74 Q104 74 108 80 Q108 86 104 88 Q100 90 100 86 Q100 90 96 88 Q92 86 92 80 Z"
            fill={organFill("thyroid")}
            fillOpacity={organOpacity("thyroid")}
            stroke={organStroke("thyroid")}
            strokeWidth={organStrokeWidth("thyroid")}
          />
        </g>

        {/* ---------- Heart (chest, left) ---------- */}
        <g
          className={
            isActive("heart")
              ? "labs-body-shape labs-heart-beat"
              : "labs-body-shape"
          }
          style={{ opacity: isActive("heart") ? 1 : 0.45 }}
        >
          <path
            className="labs-body-shape"
            d="M96 104 C92 100 84 100 84 108 C84 116 96 124 96 124 C96 124 108 116 108 108 C108 100 100 100 96 104 Z"
            fill={organFill("heart")}
            fillOpacity={organOpacity("heart")}
            stroke={organStroke("heart")}
            strokeWidth={organStrokeWidth("heart")}
          />
        </g>

        {/* ---------- Lungs (chest, both sides) ---------- */}
        <g
          className="labs-body-shape"
          style={{ opacity: isActive("lungs") ? 0.9 : 0.25 }}
        >
          <path
            className="labs-body-shape"
            d="M78 94 Q70 104 72 126 Q74 138 86 134 Q88 120 86 104 Q84 96 78 94 Z"
            fill={organFill("lungs")}
            fillOpacity={organOpacity("lungs")}
            stroke={organStroke("lungs")}
            strokeWidth={organStrokeWidth("lungs")}
          />
          <path
            className="labs-body-shape"
            d="M122 94 Q130 104 128 126 Q126 138 114 134 Q112 120 114 104 Q116 96 122 94 Z"
            fill={organFill("lungs")}
            fillOpacity={organOpacity("lungs")}
            stroke={organStroke("lungs")}
            strokeWidth={organStrokeWidth("lungs")}
          />
        </g>

        {/* ---------- Liver (upper right abdomen) ---------- */}
        <g
          className="labs-body-shape"
          style={{ opacity: isActive("liver") ? 1 : 0.4 }}
        >
          <path
            className="labs-body-shape"
            d="M100 132 L124 134 Q132 138 130 148 Q128 156 118 158 L102 156 Q98 150 100 132 Z"
            fill={organFill("liver")}
            fillOpacity={organOpacity("liver")}
            stroke={organStroke("liver")}
            strokeWidth={organStrokeWidth("liver")}
          />
        </g>

        {/* ---------- Pancreas (mid abdomen, cream-colored stripe) ---------- */}
        <g
          className="labs-body-shape"
          style={{ opacity: isActive("pancreas") ? 1 : 0.4 }}
        >
          <path
            className="labs-body-shape"
            d="M84 158 Q100 152 118 160 Q116 164 100 162 Q86 162 84 158 Z"
            fill={organFill("pancreas")}
            fillOpacity={organOpacity("pancreas")}
            stroke={organStroke("pancreas")}
            strokeWidth={organStrokeWidth("pancreas")}
          />
        </g>

        {/* ---------- Kidneys (mid-back, bean shapes) ---------- */}
        <g
          className="labs-body-shape"
          style={{ opacity: isActive("kidneys") ? 1 : 0.4 }}
        >
          <path
            className="labs-body-shape"
            d="M82 164 Q76 166 76 176 Q76 186 84 186 Q90 186 90 178 Q90 170 86 166 Q84 164 82 164 Z"
            fill={organFill("kidneys")}
            fillOpacity={organOpacity("kidneys")}
            stroke={organStroke("kidneys")}
            strokeWidth={organStrokeWidth("kidneys")}
          />
          <path
            className="labs-body-shape"
            d="M118 164 Q124 166 124 176 Q124 186 116 186 Q110 186 110 178 Q110 170 114 166 Q116 164 118 164 Z"
            fill={organFill("kidneys")}
            fillOpacity={organOpacity("kidneys")}
            stroke={organStroke("kidneys")}
            strokeWidth={organStrokeWidth("kidneys")}
          />
        </g>

        {/* ---------- Reproductive / endocrine (lower pelvis) ---------- */}
        <g
          className="labs-body-shape"
          style={{ opacity: isActive("reproductive") ? 1 : 0.4 }}
        >
          <ellipse
            className="labs-body-shape"
            cx={100}
            cy={202}
            rx={14}
            ry={9}
            fill={organFill("reproductive")}
            fillOpacity={organOpacity("reproductive")}
            stroke={organStroke("reproductive")}
            strokeWidth={organStrokeWidth("reproductive")}
          />
        </g>

        {/* ---------- Veins / vascular (arm paths) ---------- */}
        <g
          className="labs-body-shape"
          style={{ opacity: isActive("veins") ? 1 : 0.28 }}
        >
          <path
            className="labs-body-shape"
            d="M42 102 Q40 130 34 160 Q32 178 36 184"
            stroke={organStroke("veins")}
            strokeOpacity={isActive("veins") ? 0.9 : 0.35}
            strokeWidth={isActive("veins") ? 2 : 1}
            fill="none"
            strokeLinecap="round"
          />
          <path
            className="labs-body-shape"
            d="M158 102 Q160 130 166 160 Q168 178 164 184"
            stroke={organStroke("veins")}
            strokeOpacity={isActive("veins") ? 0.9 : 0.35}
            strokeWidth={isActive("veins") ? 2 : 1}
            fill="none"
            strokeLinecap="round"
          />
          {/* central aorta */}
          <path
            className="labs-body-shape"
            d="M100 118 L100 170"
            stroke={organStroke("veins")}
            strokeOpacity={isActive("veins") ? 0.85 : 0.2}
            strokeWidth={isActive("veins") ? 1.6 : 0.8}
            fill="none"
          />
        </g>

        {/* ---------- Bone marrow (long bone hints in legs) ---------- */}
        <g
          className="labs-body-shape"
          style={{ opacity: isActive("bonesMarrow") ? 1 : 0.3 }}
        >
          <path
            className="labs-body-shape"
            d="M78 196 L74 280 M122 196 L126 280"
            stroke={organStroke("bonesMarrow")}
            strokeOpacity={isActive("bonesMarrow") ? 0.9 : 0.35}
            strokeWidth={isActive("bonesMarrow") ? 2.4 : 1.2}
            fill="none"
            strokeLinecap="round"
          />
          {/* pelvis */}
          <path
            className="labs-body-shape"
            d="M82 196 Q100 214 118 196"
            stroke={organStroke("bonesMarrow")}
            strokeOpacity={isActive("bonesMarrow") ? 0.85 : 0.3}
            strokeWidth={isActive("bonesMarrow") ? 1.6 : 0.8}
            fill="none"
          />
        </g>

        {/* ---------- Lymph nodes ---------- */}
        <g
          className="labs-body-shape"
          style={{ opacity: isActive("lymph") ? 1 : 0.32 }}
        >
          {[
            { cx: 90, cy: 72 },
            { cx: 110, cy: 72 },
            { cx: 68, cy: 100 },
            { cx: 132, cy: 100 },
            { cx: 92, cy: 170 },
            { cx: 108, cy: 170 },
            { cx: 84, cy: 200 },
            { cx: 116, cy: 200 },
          ].map((p, i) => (
            <circle
              key={i}
              className="labs-body-shape"
              cx={p.cx}
              cy={p.cy}
              r={isActive("lymph") ? 2.2 : 1.6}
              fill={organFill("lymph")}
              fillOpacity={organOpacity("lymph")}
              stroke={organStroke("lymph")}
              strokeWidth="0.6"
            />
          ))}
        </g>

        {/* ---------- Active region pulse ring ---------- */}
        {activeRegion && activeRegion !== "wholeBody" && (
          <circle
            key={activeRegion}
            className="labs-region-pulse"
            cx={REGION_FOCUS[activeRegion].cx}
            cy={REGION_FOCUS[activeRegion].cy}
            r={REGION_FOCUS[activeRegion].r}
            fill="none"
            stroke={accent}
            strokeWidth="1.4"
            filter="url(#glow)"
          />
        )}
      </svg>

      {/* Region caption under the figure */}
      <div className="h-6 flex items-center justify-center mt-1">
        {highlighted ? (
          <div
            key={highlighted.category}
            className="anim-scale-in flex items-center gap-2"
          >
            <span
              className="inline-block w-1.5 h-1.5 rounded-full"
              style={{ background: highlighted.grade.color }}
            />
            <span
              className="text-[11px] font-bold uppercase tracking-widest"
              style={{ color: highlighted.grade.color }}
            >
              {REGION_LABEL[CATEGORY_TO_REGION[highlighted.category]]}
            </span>
            <span
              className="text-[11px] font-semibold"
              style={{ color: "var(--text-secondary)" }}
            >
              - {highlighted.label} - grade {highlighted.grade.letter}
            </span>
          </div>
        ) : (
          <span
            key="hint"
            className="anim-scale-in text-[11px] font-medium"
            style={{ color: "var(--text-muted)" }}
          >
            Tap a system below to see it on the body
          </span>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Focus coordinates (used for the pulse ring)                       */
/* ------------------------------------------------------------------ */

const REGION_FOCUS: Record<Exclude<Region, "wholeBody">, { cx: number; cy: number; r: number }> = {
  brain: { cx: 100, cy: 44, r: 20 },
  thyroid: { cx: 100, cy: 82, r: 10 },
  heart: { cx: 96, cy: 112, r: 14 },
  lungs: { cx: 100, cy: 114, r: 30 },
  liver: { cx: 116, cy: 146, r: 16 },
  pancreas: { cx: 100, cy: 160, r: 18 },
  kidneys: { cx: 100, cy: 176, r: 22 },
  reproductive: { cx: 100, cy: 202, r: 16 },
  veins: { cx: 100, cy: 150, r: 70 },
  bonesMarrow: { cx: 100, cy: 240, r: 40 },
  lymph: { cx: 100, cy: 150, r: 60 },
};
