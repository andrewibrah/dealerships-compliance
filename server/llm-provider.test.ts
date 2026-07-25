import { describe, expect, it } from "vitest";
import {
  resolveLlm,
  callLlmText,
  OPENAI_CHAT_URL,
  OPENAI_MODEL,
  ANTHROPIC_MESSAGES_URL,
  ANTHROPIC_MODEL,
} from "@shared/llm-provider";

// Transport for the two DISPLAY-ONLY LLM surfaces. The guarantee under test: it returns a string
// or nothing, never throws, and never invents content — every failure mode yields '' so callers
// fall back to their deterministic text (the question / the template narrative).

function jsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => body,
  } as unknown as Response;
}

const openAiBody = { choices: [{ message: { content: " rephrased text " } }] };
const anthropicBody = { content: [{ type: "text", text: " narrated text " }] };

describe("resolveLlm", () => {
  it("prefers OpenAI when both keys are present (this deployment's configured key)", () => {
    const r = resolveLlm({ openaiApiKey: "sk-oai", anthropicApiKey: "sk-ant" });
    expect(r).toEqual({ provider: "openai", apiKey: "sk-oai", model: OPENAI_MODEL });
  });

  it("falls back to Anthropic when only that key is present", () => {
    const r = resolveLlm({ openaiApiKey: "", anthropicApiKey: "sk-ant" });
    expect(r).toEqual({ provider: "anthropic", apiKey: "sk-ant", model: ANTHROPIC_MODEL });
  });

  it("returns null when neither key is usable (whitespace/empty/undefined)", () => {
    expect(resolveLlm({})).toBeNull();
    expect(resolveLlm({ openaiApiKey: "   ", anthropicApiKey: "" })).toBeNull();
    expect(resolveLlm({ openaiApiKey: null, anthropicApiKey: undefined })).toBeNull();
  });
});

describe("callLlmText", () => {
  it("calls the OpenAI Chat Completions endpoint with the verified max_tokens field", async () => {
    let seenUrl = "";
    let seenBody: Record<string, unknown> = {};
    const fetchImpl = async (url: string, init: RequestInit) => {
      seenUrl = String(url);
      seenBody = JSON.parse(String(init.body));
      return jsonResponse(openAiBody);
    };
    const text = await callLlmText(
      { system: "sys", user: "usr", maxTokens: 128 },
      { credentials: { openaiApiKey: "sk-oai" }, fetchImpl: fetchImpl as unknown as typeof fetch },
    );
    expect(seenUrl).toBe(OPENAI_CHAT_URL);
    expect(seenBody.model).toBe(OPENAI_MODEL);
    // gpt-5* rejects `max_tokens`; the pinned model requires it. Guard against a silent swap.
    expect(seenBody.max_tokens).toBe(128);
    expect(seenBody).not.toHaveProperty("max_completion_tokens");
    expect(text).toBe("rephrased text"); // trimmed
  });

  it("calls the Anthropic endpoint when only that key is set", async () => {
    let seenUrl = "";
    const fetchImpl = async (url: string) => {
      seenUrl = String(url);
      return jsonResponse(anthropicBody);
    };
    const text = await callLlmText(
      { system: "sys", user: "usr", maxTokens: 128 },
      { credentials: { anthropicApiKey: "sk-ant" }, fetchImpl: fetchImpl as unknown as typeof fetch },
    );
    expect(seenUrl).toBe(ANTHROPIC_MESSAGES_URL);
    expect(text).toBe("narrated text");
  });

  it("makes NO network call and returns '' when no key is configured", async () => {
    let called = false;
    const fetchImpl = async () => {
      called = true;
      return jsonResponse(openAiBody);
    };
    const text = await callLlmText(
      { system: "s", user: "u", maxTokens: 10 },
      { credentials: {}, fetchImpl: fetchImpl as unknown as typeof fetch },
    );
    expect(called).toBe(false);
    expect(text).toBe("");
  });

  it("degrades instead of throwing when the caller passes a malformed input", async () => {
    // Regression: both LLM surfaces run inside user-facing paths (a tRPC query and PDF
    // generation). A malformed input must fall back to the deterministic text, never throw.
    const { narrateDomain } = await import("@shared/architecture-narrative");
    const { rephraseQuestion } = await import("@shared/interview-phrasing");

    const badNarrative = await narrateDomain(
      // `findings` deliberately omitted — the prompt builder reads .length on it.
      { domainTitle: "X", deterministicNarrative: "deterministic fallback" } as never,
      { openaiApiKey: "sk-oai" },
    );
    expect(badNarrative).toEqual({ text: "deterministic fallback" });

    const badQuestion = await rephraseQuestion(
      { questionText: "original question" } as never,
      { openaiApiKey: "sk-oai", fetchImpl: (() => {
        throw new Error("boom");
      }) as unknown as typeof fetch },
    );
    expect(badQuestion).toEqual({ text: "original question" });
  });

  it("returns '' on non-2xx, malformed body, and thrown errors (never throws)", async () => {
    const nonOk = async () => jsonResponse({}, false, 500);
    const malformed = async () => jsonResponse({ unexpected: true });
    const throws = async () => {
      throw new Error("network down");
    };
    for (const impl of [nonOk, malformed, throws]) {
      const text = await callLlmText(
        { system: "s", user: "u", maxTokens: 10 },
        { credentials: { openaiApiKey: "sk-oai" }, fetchImpl: impl as unknown as typeof fetch },
      );
      expect(text).toBe("");
    }
  });
});
