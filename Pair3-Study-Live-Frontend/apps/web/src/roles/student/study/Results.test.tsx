import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type { AttemptResultDto } from "@nihongo/shared";
import { Results } from "./Results";

const base: AttemptResultDto = {
  attemptId: "a",
  activityId: "q",
  activityType: "quiz",
  title: "Quiz",
  score: 80,
  correctCount: 4,
  total: 5,
  passed: true,
  passingScorePct: 60,
  bestScore: 80,
  attemptCount: 1,
  review: [
    { text: "「食べる」の意味は？", choices: ["to eat", "to drink", "to sleep", "to walk"], yourAnswer: 0, correctIndex: 0, correct: true, audioUrl: "https://x/a.mp3" },
    { text: "「飲む」の意味は？", choices: ["to eat", "to drink", "to sleep", "to walk"], yourAnswer: 0, correctIndex: 1, correct: false },
  ],
};

const renderResults = (r: AttemptResultDto) =>
  render(
    <MemoryRouter>
      <Results result={r} onRetry={() => undefined} backTo="/s/study" backLabel="Back to Self-Study" />
    </MemoryRouter>,
  );

describe("FR-3.6.4 results", () => {
  it("FR-3.6.4 a pass shows the hanamaru, the seal, and Passed; the score is announced", () => {
    const { container } = renderResults(base);
    expect(container.querySelector(".hanamaru-path")).not.toBeNull();
    expect(screen.getByText("Passed")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("You scored 4 out of 5, 80 percent. Passed.");
  });

  it("FR-3.6.4 below the passing score there's no hanamaru, only the passing-score line", () => {
    const { container } = renderResults({ ...base, passed: false, score: 40, correctCount: 2 });
    expect(container.querySelector(".hanamaru-path")).toBeNull();
    expect(screen.getByText("Passing score is 60%. Review the answers below, then try again.")).toBeInTheDocument();
  });

  it("§13 review marks are always paired with words; decision 7 answer audio appears here", () => {
    renderResults(base);
    expect(screen.getByText("Question 2: Incorrect")).toBeInTheDocument();
    expect(screen.getByText("Your answer:")).toBeInTheDocument();
    expect(screen.getByText("Correct answer:")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Play the answer to question 1" })).toBeInTheDocument();
  });
});
