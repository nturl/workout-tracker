import { describe, it, expect, beforeEach } from "vitest";
import "../mocks/clerk";
import { setMockUserId } from "../mocks/clerk";
import { GET } from "@/app/api/exercise-image/[name]/route";
import { NextRequest } from "next/server";

const req = () => new NextRequest("http://localhost:3000/api/exercise-image/x");
const call = (name: string) => GET(req(), { params: { name } });

describe("GET /api/exercise-image/[name]", () => {
  beforeEach(() => setMockUserId("test-user-123"));

  it("returns a JSON 401 when signed out (PT stills are not public)", async () => {
    setMockUserId(null);
    const res = await call("foam-roller-pec-stretch");
    expect(res.status).toBe(401);
  });

  it("serves a known still as a privately cached JPEG", async () => {
    const res = await call("foam-roller-pec-stretch");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect(res.headers.get("cache-control")).toContain("private");
  });

  it("rejects path traversal and unknown files with 404", async () => {
    expect((await call("../../../package.json")).status).toBe(404);
    expect((await call("nope")).status).toBe(404);
  });
});
