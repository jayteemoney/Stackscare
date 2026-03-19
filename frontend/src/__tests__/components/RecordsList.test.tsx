/**
 * RecordsList component tests
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/lib/stacks", () => ({
  explorerAddressUrl: vi.fn((addr: string) => `https://explorer.hiro.so/address/${addr}?chain=testnet`),
  checkIsAuthorized: vi.fn(),
}));

vi.mock("@/hooks/useTxStatus", () => ({
  useTxStatus: vi.fn().mockReturnValue("idle"),
}));

vi.mock("@/components/TxBanner", () => ({
  TxBanner: ({ txId }: { txId: string }) => (
    <div data-testid="tx-banner" data-txid={txId} />
  ),
}));

vi.mock("react-hot-toast", () => ({
  default: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock("lucide-react", () => ({
  RefreshCw: () => <div data-testid="icon-refresh" />,
  ExternalLink: () => <div data-testid="icon-external" />,
  Shield: () => <div data-testid="icon-shield" />,
  ShieldCheck: () => <div data-testid="icon-shieldcheck" />,
  ShieldOff: () => <div data-testid="icon-shieldoff" />,
  Loader2: () => <div data-testid="icon-loader" />,
  ChevronDown: () => <div data-testid="icon-down" />,
  ChevronUp: () => <div data-testid="icon-up" />,
  AlertCircle: () => <div data-testid="icon-alert" />,
  FileX: () => <div data-testid="icon-filex" />,
}));

import { checkIsAuthorized } from "@/lib/stacks";
import toast from "react-hot-toast";
import { RecordsList } from "@/components/RecordsList";
import type { HealthRecord } from "@/types";

const mockCheckAuthorized = vi.mocked(checkIsAuthorized);
const mockToastError = vi.mocked(toast.error);
const mockToastSuccess = vi.mocked(toast.success);

const SAMPLE_RECORDS: HealthRecord[] = [
  {
    recordId: 1,
    owner: "ST1OWNER",
    ipfsHash: "QmHash1",
    recordType: "consultation",
    timestamp: 12345,
  },
  {
    recordId: 2,
    owner: "ST1OWNER",
    ipfsHash: "QmHash2",
    recordType: "lab_result",
    timestamp: 67890,
  },
];

const defaultProps = {
  address: "ST1OWNER",
  records: SAMPLE_RECORDS,
  isLoading: false,
  error: null,
  refresh: vi.fn(),
  grantAccess: vi.fn(),
  revokeAccess: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("RecordsList", () => {
  it("renders the records list header", () => {
    render(<RecordsList {...defaultProps} />);
    expect(screen.getByText("My Health Records")).toBeInTheDocument();
  });

  it("renders the correct record count badge", () => {
    render(<RecordsList {...defaultProps} />);
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("renders loading skeletons when isLoading is true", () => {
    render(<RecordsList {...defaultProps} isLoading={true} records={[]} />);
    const skeletons = document.querySelectorAll(".animate-pulse");
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it("renders error message when error is provided", () => {
    render(<RecordsList {...defaultProps} error="Contract not deployed" records={[]} />);
    expect(screen.getByText("Could not load records")).toBeInTheDocument();
    expect(screen.getByText("Contract not deployed")).toBeInTheDocument();
  });

  it("renders empty state when no records", () => {
    render(<RecordsList {...defaultProps} records={[]} />);
    expect(screen.getByText("No health records yet")).toBeInTheDocument();
  });

  it("renders record type labels for each record", () => {
    render(<RecordsList {...defaultProps} />);
    expect(screen.getByText("Consultation")).toBeInTheDocument();
    expect(screen.getByText("Lab Result")).toBeInTheDocument();
  });

  it("shows block height timestamps", () => {
    render(<RecordsList {...defaultProps} />);
    expect(screen.getByText("Block 12345")).toBeInTheDocument();
    expect(screen.getByText("Block 67890")).toBeInTheDocument();
  });

  it("shows record IDs", () => {
    render(<RecordsList {...defaultProps} />);
    expect(screen.getByText("#1")).toBeInTheDocument();
    expect(screen.getByText("#2")).toBeInTheDocument();
  });

  it("calls refresh when Refresh button is clicked", async () => {
    const refresh = vi.fn();
    render(<RecordsList {...defaultProps} refresh={refresh} />);
    await userEvent.click(screen.getByRole("button", { name: /Refresh/i }));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("calls refresh from error state", async () => {
    const refresh = vi.fn();
    render(<RecordsList {...defaultProps} error="Error" records={[]} refresh={refresh} />);
    await userEvent.click(screen.getByRole("button", { name: /Try again/i }));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  describe("RecordCard expansion", () => {
    it("expands to show IPFS hash and access management on click", async () => {
      render(<RecordsList {...defaultProps} />);
      // Click the first card's toggle button (the outer clickable button)
      const cardButtons = screen.getAllByRole("button", { name: /Consultation|Lab Result/i });
      await userEvent.click(cardButtons[0]);
      // After expansion, IPFS hash should be visible
      expect(screen.getByText("QmHash1")).toBeInTheDocument();
      expect(screen.getByText("Manage Doctor Access")).toBeInTheDocument();
    });

    it("collapses when clicked again", async () => {
      render(<RecordsList {...defaultProps} />);
      const cardBtn = screen.getAllByRole("button", { name: /Consultation/i })[0];
      await userEvent.click(cardBtn);
      expect(screen.getByText("QmHash1")).toBeInTheDocument();
      await userEvent.click(cardBtn);
      expect(screen.queryByText("QmHash1")).not.toBeInTheDocument();
    });

    it("shows Grant Access and Revoke Access buttons when expanded", async () => {
      render(<RecordsList {...defaultProps} />);
      const cardBtn = screen.getAllByRole("button", { name: /Consultation/i })[0];
      await userEvent.click(cardBtn);
      expect(screen.getByRole("button", { name: /Grant Access/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Revoke Access/i })).toBeInTheDocument();
    });

    it("shows error toast when grant is clicked without an address", async () => {
      render(<RecordsList {...defaultProps} />);
      const cardBtn = screen.getAllByRole("button", { name: /Consultation/i })[0];
      await userEvent.click(cardBtn);
      await userEvent.click(screen.getByRole("button", { name: /Grant Access/i }));
      expect(mockToastError).toHaveBeenCalledWith("Enter a Stacks address first");
    });

    it("calls grantAccess with address and record id", async () => {
      const grantAccess = vi.fn();
      render(<RecordsList {...defaultProps} grantAccess={grantAccess} />);
      const cardBtn = screen.getAllByRole("button", { name: /Consultation/i })[0];
      await userEvent.click(cardBtn);

      const input = screen.getByPlaceholderText(/Doctor's Stacks address/i);
      await userEvent.type(input, "ST1DOCTOR123");

      await userEvent.click(screen.getByRole("button", { name: /Grant Access/i }));
      expect(grantAccess).toHaveBeenCalledWith(
        1,
        "ST1DOCTOR123",
        expect.any(Function),
        expect.any(Function)
      );
    });

    it("calls revokeAccess with address and record id", async () => {
      const revokeAccess = vi.fn();
      render(<RecordsList {...defaultProps} revokeAccess={revokeAccess} />);
      const cardBtn = screen.getAllByRole("button", { name: /Consultation/i })[0];
      await userEvent.click(cardBtn);

      const input = screen.getByPlaceholderText(/Doctor's Stacks address/i);
      await userEvent.type(input, "ST1DOCTOR123");

      await userEvent.click(screen.getByRole("button", { name: /Revoke Access/i }));
      expect(revokeAccess).toHaveBeenCalledWith(
        1,
        "ST1DOCTOR123",
        expect.any(Function),
        expect.any(Function)
      );
    });

    it("calls checkIsAuthorized when Check button is clicked", async () => {
      mockCheckAuthorized.mockResolvedValueOnce(true);
      render(<RecordsList {...defaultProps} />);
      const cardBtn = screen.getAllByRole("button", { name: /Consultation/i })[0];
      await userEvent.click(cardBtn);

      const input = screen.getByPlaceholderText(/Doctor's Stacks address/i);
      await userEvent.type(input, "ST1DOCTOR123");
      await userEvent.click(screen.getByRole("button", { name: /^Check$/i }));

      await waitFor(() => {
        expect(mockCheckAuthorized).toHaveBeenCalledWith(1, "ST1DOCTOR123", "ST1OWNER");
      });
    });

    it("shows authorized badge after positive check", async () => {
      mockCheckAuthorized.mockResolvedValueOnce(true);
      render(<RecordsList {...defaultProps} />);
      const cardBtn = screen.getAllByRole("button", { name: /Consultation/i })[0];
      await userEvent.click(cardBtn);

      const input = screen.getByPlaceholderText(/Doctor's Stacks address/i);
      await userEvent.type(input, "ST1DOCTOR123");
      await userEvent.click(screen.getByRole("button", { name: /^Check$/i }));

      await waitFor(() => {
        expect(screen.getByText(/Access confirmed on-chain/i)).toBeInTheDocument();
      });
    });

    it("shows unauthorized badge after negative check", async () => {
      mockCheckAuthorized.mockResolvedValueOnce(false);
      render(<RecordsList {...defaultProps} />);
      const cardBtn = screen.getAllByRole("button", { name: /Consultation/i })[0];
      await userEvent.click(cardBtn);

      const input = screen.getByPlaceholderText(/Doctor's Stacks address/i);
      await userEvent.type(input, "ST1STRANGER");
      await userEvent.click(screen.getByRole("button", { name: /^Check$/i }));

      await waitFor(() => {
        expect(screen.getByText(/No on-chain access/i)).toBeInTheDocument();
      });
    });
  });
});
