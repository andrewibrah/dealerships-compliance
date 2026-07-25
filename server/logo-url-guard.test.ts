import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): { ctx: TrpcContext } {
  const user: AuthenticatedUser = {
    id: "00000000-0000-0000-0000-000000000001",
    email: "sample@example.com",
    name: "Sample User",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  const ctx: TrpcContext = {
    user,
    aal: "aal2",
    hasVerifiedFactor: false,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
  return { ctx };
}

// The tenant-supplied logo URL (PRD #45) is rendered into an <img src>, so the scheme must be
// pinned to http(s) SERVER-side: z.string().url() alone accepts javascript:/data:/ftp: (the URL
// constructor parses them), and the client-side check is bypassable via a direct tRPC call.
// These assert rejection at input validation (BAD_REQUEST) — before any DB/resolver work — so a
// live DB is not needed. Mirrored schema lives in supabase/functions/_shared/routers.ts.
describe("dealership logoUrl rejects non-http(s) schemes", () => {
  const badUrls = [
    "javascript:alert(1)",
    "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=",
    "ftp://example.com/logo.png",
    "vbscript:msgbox(1)",
  ];

  for (const url of badUrls) {
    it(`rejects ${url.slice(0, 24)} on dealership.update`, async () => {
      const caller = appRouter.createCaller(createAuthContext().ctx);
      await expect(
        caller.dealership.update({ id: 1, logoUrl: url })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });
  }

  it("rejects a javascript: scheme on dealership.create", async () => {
    const caller = appRouter.createCaller(createAuthContext().ctx);
    await expect(
      caller.dealership.create({ name: "X", logoUrl: "javascript:alert(1)" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
