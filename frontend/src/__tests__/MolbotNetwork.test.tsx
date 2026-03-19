import { render } from "@testing-library/react";
import MolbotNetwork from "../components/MolbotNetwork";
import { expect, test, vi } from "vitest";

// Mock @/lib/api
vi.mock("@/lib/api", () => ({
    listMolbots: vi.fn(() => Promise.resolve({ agents: [], count: 0, network: "test" })),
    orchestrateAnalysis: vi.fn(),
}));

// Mock lucide-react
vi.mock("lucide-react", () => ({
    Bot: () => <div data-testid="icon-bot" />,
    ShieldCheck: () => <div data-testid="icon-shield" />,
    Zap: () => <div data-testid="icon-zap" />,
    Settings: () => <div data-testid="icon-settings" />,
    Activity: () => <div data-testid="icon-activity" />,
    ArrowRight: () => <div data-testid="icon-arrow" />,
    Coins: () => <div data-testid="icon-coins" />,
    FileSearch: () => <div data-testid="icon-file" />,
    CheckCircle2: () => <div data-testid="icon-check" />,
    Clock: () => <div data-testid="icon-clock" />,
    ExternalLink: () => <div data-testid="icon-link" />,
    ChevronRight: () => <div data-testid="icon-chevron" />,
}));

// Mock styled-jsx
vi.mock("styled-jsx/style", () => ({
    default: () => null
}));

test("renders molbot network", () => {
    const { container } = render(<MolbotNetwork />);
    expect(container).toBeDefined();
});
