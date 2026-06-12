import { describe, it, expect } from "vitest";
import { getOuraAuthUrl } from "@/lib/oura";

describe("oura", () => {
  it("generates correct auth URL", () => {
    process.env.OURA_CLIENT_ID = "test-client-id";
    process.env.NEXT_PUBLIC_APP_URL = "https://example.com";

    const url = getOuraAuthUrl("test-state-123");

    expect(url).toContain("https://cloud.ouraring.com/oauth/authorize");
    expect(url).toContain("client_id=test-client-id");
    expect(url).toContain("state=test-state-123");
    expect(url).toContain("redirect_uri=");
    expect(url).toContain("scope=daily+heartrate+sleep+personal");
    expect(url).toContain("response_type=code");
  });

  it("includes correct redirect URI", () => {
    process.env.OURA_CLIENT_ID = "test-client-id";
    process.env.NEXT_PUBLIC_APP_URL = "https://my-app.vercel.app";

    const url = getOuraAuthUrl("state");
    expect(url).toContain(encodeURIComponent("https://my-app.vercel.app/api/oauth/oura/callback"));
  });
});
