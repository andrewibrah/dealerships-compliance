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

// The policy lifecycle (status / version / adoptedAt) must flow ONLY through policies.transition,
// so the legally-meaningful adoptedAt stays set-once and no backward/skip transition is reachable
// via the API. create/update use .strict() input, so a client-supplied lifecycle field is rejected
// at validation (code BAD_REQUEST) — BEFORE any DB/resolver work — which is what these assert. No
// live DB is needed: a valid input would reach the DB, but every input here is rejected first.
describe("policies.create/update lock out lifecycle fields", () => {
  it("policies.update rejects a client-supplied adoptedAt", async () => {
    const caller = appRouter.createCaller(createAuthContext().ctx);
    await expect(
      caller.policies.update({ id: 1, adoptedAt: new Date() } as never)
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("policies.update rejects a client-supplied status (no backward transition via update)", async () => {
    const caller = appRouter.createCaller(createAuthContext().ctx);
    await expect(
      caller.policies.update({ id: 1, status: "draft" } as never)
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("policies.create rejects a born-adopted policy (status + adoptedAt)", async () => {
    const caller = appRouter.createCaller(createAuthContext().ctx);
    await expect(
      caller.policies.create({
        policyType: "encryption",
        title: "X",
        status: "adopted",
        adoptedAt: new Date(),
      } as never)
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
