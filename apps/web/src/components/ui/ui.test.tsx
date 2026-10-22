import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { TextField } from "./Field";

describe("§13 accessibility: form errors are linked to their fields", () => {
  it("links the error message with aria-describedby", () => {
    render(<TextField label="Email" error="Enter a valid email address." hint="We never share it." />);
    const input = screen.getByLabelText(/Email/);
    expect(input).toHaveAttribute("aria-invalid", "true");
    const ids = input.getAttribute("aria-describedby")!.split(" ");
    const texts = ids.map((id) => document.getElementById(id)?.textContent);
    expect(texts).toContain("Enter a valid email address.");
    expect(texts).toContain("We never share it.");
  });
});
