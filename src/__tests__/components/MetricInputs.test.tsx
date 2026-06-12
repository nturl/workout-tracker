// @vitest-environment happy-dom
import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MetricInput, TextMetricInput, SelectMetricInput } from "@/components/recovery/MetricInputs";

describe("MetricInput", () => {
  it("renders label and input with aria-label", () => {
    render(<MetricInput label="HRV" value={55} onChange={() => {}} unit="ms" />);
    expect(screen.getByText("HRV")).toBeTruthy();
    expect(screen.getByLabelText("HRV")).toBeTruthy();
  });

  it("renders with correct input type and value", () => {
    render(<MetricInput label="RHR" value={60} onChange={() => {}} />);
    const input = screen.getByLabelText("RHR") as HTMLInputElement;
    expect(input.type).toBe("number");
    expect(input.value).toBe("60");
  });

  it("renders unit when provided", () => {
    render(<MetricInput label="Heart Rate" value={65} onChange={() => {}} unit="bpm" />);
    expect(screen.getByText("bpm")).toBeTruthy();
  });

  it("renders empty string when value is undefined", () => {
    render(<MetricInput label="Score" value={undefined} onChange={() => {}} />);
    const input = screen.getByLabelText("Score") as HTMLInputElement;
    expect(input.value).toBe("");
  });
});

describe("TextMetricInput", () => {
  it("renders with correct attributes", () => {
    render(<TextMetricInput label="Notes" value="good sleep" onChange={() => {}} />);
    const input = screen.getByLabelText("Notes") as HTMLInputElement;
    expect(input.type).toBe("text");
    expect(input.value).toBe("good sleep");
  });

  it("renders placeholder when provided", () => {
    render(<TextMetricInput label="Duration" value={undefined} onChange={() => {}} placeholder="e.g. 7h 30m" />);
    const input = screen.getByLabelText("Duration") as HTMLInputElement;
    expect(input.placeholder).toBe("e.g. 7h 30m");
  });

  it("renders empty string when value is undefined", () => {
    render(<TextMetricInput label="Time" value={undefined} onChange={() => {}} />);
    const input = screen.getByLabelText("Time") as HTMLInputElement;
    expect(input.value).toBe("");
  });
});

describe("SelectMetricInput", () => {
  it("renders options", () => {
    const options = ["Low", "Medium", "High"];
    render(<SelectMetricInput label="Energy" value={undefined} onChange={() => {}} options={options} />);
    expect(screen.getByLabelText("Energy")).toBeTruthy();
    for (const opt of options) {
      expect(screen.getByText(opt)).toBeTruthy();
    }
  });

  it("renders the default empty option", () => {
    render(<SelectMetricInput label="Mood" value={undefined} onChange={() => {}} options={["Good", "Bad"]} />);
    // The default "-" option
    expect(screen.getByText("-")).toBeTruthy();
  });

  it("selects the correct value", () => {
    render(<SelectMetricInput label="Quality" value="High" onChange={() => {}} options={["Low", "High"]} />);
    const select = screen.getByLabelText("Quality") as HTMLSelectElement;
    expect(select.value).toBe("High");
  });
});
