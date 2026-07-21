import { describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import { MFA_REQUIRED_ERR_MSG, UNAUTHED_ERR_MSG } from "@shared/const";
import { decodeAalFromJwt, hasVerifiedFactor, requiresMfaStepUp } from "@shared/mfa";
import { protectedProcedure, router } from "./_core/trpc";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

const USER: AuthenticatedUser = {
  id: "00000000-0000-0000-0000-000000000001",
  email: "qi@dealership.com",
  name: "Qualified Individual",
  role: "user",
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
};

function ctx(overrides: Partial<TrpcContext>): TrpcContext {
  return {
    user: USER,
    aal: "aal1",
    hasVerifiedFactor: false,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
    ...overrides,
  };
}

// The same `protectedProcedure` that gates every real business procedure. Testing a
// trivial procedure through it exercises the actual MFA middleware without any DB.
const testRouter = router({
  ping: protectedProcedure.query(() => "ok"),
});

// --- The pure enforcement decision (imported unchanged by BOTH the Node and Deno
// runtimes, so this is the single source of truth for what each one enforces). ---
describe("requiresMfaStepUp (enrolled-only policy)", () => {
  it("blocks: enrolled factor + aal1 session -> must step up", () => {
    expect(requiresMfaStepUp({ aal: "aal1", hasVerifiedFactor: true })).toBe(true);
  });

  it("blocks: enrolled factor + unknown aal -> must step up", () => {
    expect(requiresMfaStepUp({ aal: null, hasVerifiedFactor: true })).toBe(true);
  });

  it("allows: enrolled factor + aal2 session", () => {
    expect(requiresMfaStepUp({ aal: "aal2", hasVerifiedFactor: true })).toBe(false);
  });

  it("allows: no enrolled factor stays usable at aal1", () => {
    expect(requiresMfaStepUp({ aal: "aal1", hasVerifiedFactor: false })).toBe(false);
  });
});

// --- The real Express `protectedProcedure` end-to-end. The Deno copy applies the
// identical `requiresMfaStepUp` decision (verified above), keeping both runtimes in sync. ---
describe("protectedProcedure MFA enforcement", () => {
  it("rejects an aal1 session when the user has a verified factor", async () => {
    const caller = testRouter.createCaller(ctx({ aal: "aal1", hasVerifiedFactor: true }));
    await expect(caller.ping()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      message: MFA_REQUIRED_ERR_MSG,
    });
  });

  it("allows an aal2 session with a verified factor", async () => {
    const caller = testRouter.createCaller(ctx({ aal: "aal2", hasVerifiedFactor: true }));
    await expect(caller.ping()).resolves.toBe("ok");
  });

  it("allows a user with no verified factor at aal1", async () => {
    const caller = testRouter.createCaller(ctx({ aal: "aal1", hasVerifiedFactor: false }));
    await expect(caller.ping()).resolves.toBe("ok");
  });

  it("still rejects an unauthenticated caller", async () => {
    const caller = testRouter.createCaller(ctx({ user: null }));
    await expect(caller.ping()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      message: UNAUTHED_ERR_MSG,
    });
  });

  it("surfaces MFA rejections as a TRPCError", async () => {
    const caller = testRouter.createCaller(ctx({ aal: "aal1", hasVerifiedFactor: true }));
    await expect(caller.ping()).rejects.toBeInstanceOf(TRPCError);
  });
});

describe("hasVerifiedFactor", () => {
  it("is true when any factor is verified", () => {
    expect(hasVerifiedFactor([{ status: "unverified" }, { status: "verified" }])).toBe(true);
  });

  it("is false for only-unverified, empty, or missing factor lists", () => {
    expect(hasVerifiedFactor([{ status: "unverified" }])).toBe(false);
    expect(hasVerifiedFactor([])).toBe(false);
    expect(hasVerifiedFactor(null)).toBe(false);
    expect(hasVerifiedFactor(undefined)).toBe(false);
  });
});

describe("decodeAalFromJwt", () => {
  const jwt = (claims: Record<string, unknown>) =>
    `${Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url")}.` +
    `${Buffer.from(JSON.stringify(claims)).toString("base64url")}.` +
    `signature-not-checked`;

  it("reads aal2 from a token", () => {
    expect(decodeAalFromJwt(jwt({ aal: "aal2", sub: "u" }))).toBe("aal2");
  });

  it("reads aal1 from a token", () => {
    expect(decodeAalFromJwt(jwt({ aal: "aal1" }))).toBe("aal1");
  });

  it("returns null for a missing/foreign aal claim", () => {
    expect(decodeAalFromJwt(jwt({ sub: "u" }))).toBeNull();
    expect(decodeAalFromJwt(jwt({ aal: "aal3" }))).toBeNull();
  });

  it("returns null for malformed input", () => {
    expect(decodeAalFromJwt(null)).toBeNull();
    expect(decodeAalFromJwt(undefined)).toBeNull();
    expect(decodeAalFromJwt("not-a-jwt")).toBeNull();
    expect(decodeAalFromJwt("only.two")).toBeNull();
  });
});
