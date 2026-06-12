import { vi } from "vitest";

let mockUserId: string | null = "test-user-123";

export function setMockUserId(userId: string | null) {
  mockUserId = userId;
}

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(async () => ({ userId: mockUserId })),
}));
