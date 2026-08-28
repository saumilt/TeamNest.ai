import { render, screen } from "@testing-library/react";
import { Button } from "@/components/ui/button";

describe("Button", () => {
  it("renders its children as an accessible button", () => {
    render(<Button>Click me</Button>);
    expect(
      screen.getByRole("button", { name: /click me/i }),
    ).toBeInTheDocument();
  });

  it("reflects the disabled state", () => {
    render(<Button disabled>Nope</Button>);
    expect(screen.getByRole("button", { name: /nope/i })).toBeDisabled();
  });
});
