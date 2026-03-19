import { render, screen } from "@testing-library/react";
import LandingPage from "../app/page";
import { expect, test, vi } from "vitest";

// Mock DynamicWalletConnect
vi.mock("@/components/DynamicWalletConnect", () => ({
    DynamicWalletConnect: () => <div data-testid="wallet-connect">Wallet Connect</div>,
}));

// Mock lucide-react
vi.mock("lucide-react", () => ({
    Shield: () => <div data-testid="icon-shield" />,
    Sparkles: () => <div data-testid="icon-sparkles" />,
    Lock: () => <div data-testid="icon-lock" />,
    ArrowRight: () => <div data-testid="icon-arrow" />,
    Zap: () => <div data-testid="icon-zap" />,
    FileText: () => <div data-testid="icon-file" />,
    UserCheck: () => <div data-testid="icon-user" />,
    Globe: () => <div data-testid="icon-globe" />,
    Cpu: () => <div data-testid="icon-cpu" />,
    Key: () => <div data-testid="icon-key" />,
}));

test("renders landing page", () => {
    const { container } = render(<LandingPage />);
    // console.log(container.innerHTML);
    expect(container).toBeDefined();
});

test("renders landing page with headline", () => {
    render(<LandingPage />);
    // The headline is present multiple times (e.g., in meta tags or hidden elements)
    expect(screen.getAllByText(/Own Your/i).length).toBeGreaterThan(0);
});
