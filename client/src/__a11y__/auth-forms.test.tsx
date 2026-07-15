// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

/**
 * WCAG 2.2 SC 3.3.1 Error Identification (A), 4.1.3 Status Messages (AA),
 * 1.3.5 Identify Input Purpose (AA), 3.3.8 Accessible Authentication (AA)
 * — finding A11Y-02.
 *
 * Sign-in and sign-up are the gate to the entire product. A screen-reader user
 * who submits a bad password must be told; every identity field must declare
 * its purpose so autofill and password managers work.
 */

// vi.mock factories are hoisted above module scope, so the fns must be too.
const { signInWithPassword, signUp } = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: { auth: { signInWithPassword, signUp } },
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ isAuthenticated: false, loading: false, user: null }),
}));

vi.mock("wouter", () => ({
  useLocation: () => ["/", vi.fn()],
}));

import Login from "@/pages/Login";
import Signup from "@/pages/Signup";

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("A11Y-02: auth forms", () => {
  describe("Login", () => {
    it("declares input purpose for autofill (1.3.5 / 3.3.8)", () => {
      render(<Login />);
      expect(screen.getByLabelText("Email")).toHaveProperty("autocomplete", "email");
      expect(screen.getByLabelText("Password")).toHaveProperty(
        "autocomplete",
        "current-password"
      );
    });

    it("announces a failed sign-in as a status message (3.3.1 / 4.1.3)", async () => {
      signInWithPassword.mockResolvedValue({
        error: { message: "Invalid login credentials" },
      });
      render(<Login />);

      fireEvent.change(screen.getByLabelText("Email"), {
        target: { value: "nobody@example.com" },
      });
      fireEvent.change(screen.getByLabelText("Password"), {
        target: { value: "wrongpassword" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Sign In" }));

      const alert = await screen.findByRole("alert");
      expect(alert.textContent).toContain("Invalid login credentials");
    });

    it("associates the error with the field that failed (3.3.1)", async () => {
      signInWithPassword.mockResolvedValue({
        error: { message: "Invalid login credentials" },
      });
      render(<Login />);

      fireEvent.change(screen.getByLabelText("Email"), {
        target: { value: "nobody@example.com" },
      });
      fireEvent.change(screen.getByLabelText("Password"), {
        target: { value: "wrongpassword" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Sign In" }));
      await screen.findByRole("alert");

      const password = screen.getByLabelText("Password");
      expect(password.getAttribute("aria-invalid")).toBe("true");
      const describedBy = password.getAttribute("aria-describedby");
      expect(describedBy).toBeTruthy();
      expect(document.getElementById(describedBy!)?.textContent).toContain(
        "Invalid login credentials"
      );
    });
  });

  describe("Signup", () => {
    it("declares input purpose for autofill (1.3.5 / 3.3.8)", () => {
      render(<Signup />);
      expect(screen.getByLabelText(/Name/)).toHaveProperty("autocomplete", "name");
      expect(screen.getByLabelText("Email")).toHaveProperty("autocomplete", "email");
      expect(screen.getByLabelText("Password")).toHaveProperty(
        "autocomplete",
        "new-password"
      );
    });

    it("announces a failed sign-up as a status message (3.3.1 / 4.1.3)", async () => {
      signUp.mockResolvedValue({
        error: { message: "User already registered" },
      });
      render(<Signup />);

      fireEvent.change(screen.getByLabelText("Email"), {
        target: { value: "taken@example.com" },
      });
      fireEvent.change(screen.getByLabelText("Password"), {
        target: { value: "password123" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Create Account" }));

      const alert = await screen.findByRole("alert");
      expect(alert.textContent).toContain("User already registered");
    });
  });
});
