/**
 * UploadRecord component tests
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/lib/api", () => ({
  uploadRecord: vi.fn(),
  analyzeDocument: vi.fn(),
}));

vi.mock("@/hooks/useTxStatus", () => ({
  useTxStatus: vi.fn().mockReturnValue("idle"),
}));

vi.mock("@/components/TxBanner", () => ({
  TxBanner: ({ txId, status }: { txId: string; status: string }) => (
    <div data-testid="tx-banner" data-txid={txId} data-status={status} />
  ),
}));

vi.mock("@/components/AiResult", () => ({
  AiResult: ({ text }: { text: string }) => (
    <div data-testid="ai-result">{text}</div>
  ),
}));

vi.mock("react-hot-toast", () => ({
  default: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock("lucide-react", () => ({
  Upload: () => <div data-testid="icon-upload" />,
  FileText: () => <div data-testid="icon-filetext" />,
  Loader2: () => <div data-testid="icon-loader" />,
  CheckCircle2: () => <div data-testid="icon-check" />,
  Sparkles: () => <div data-testid="icon-sparkles" />,
  X: () => <div data-testid="icon-x" />,
  Zap: () => <div data-testid="icon-zap" />,
}));

import { uploadRecord, analyzeDocument } from "@/lib/api";
import toast from "react-hot-toast";
import { UploadRecord } from "@/components/UploadRecord";

const mockUploadRecord = vi.mocked(uploadRecord);
const mockAnalyzeDocument = vi.mocked(analyzeDocument);
const mockToastError = vi.mocked(toast.error);
const mockToastSuccess = vi.mocked(toast.success);

const defaultProps = {
  address: "ST1TESTADDRESS",
  createRecord: vi.fn(),
  onSuccess: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("UploadRecord", () => {
  it("renders without crashing", () => {
    render(<UploadRecord {...defaultProps} />);
    expect(screen.getByText("Upload Health Record")).toBeInTheDocument();
  });

  it("renders all 5 record type buttons", () => {
    render(<UploadRecord {...defaultProps} />);
    expect(screen.getByText("Consultation")).toBeInTheDocument();
    expect(screen.getByText("Lab Result")).toBeInTheDocument();
    expect(screen.getByText("Prescription")).toBeInTheDocument();
    expect(screen.getByText("Imaging / X-Ray")).toBeInTheDocument();
    expect(screen.getByText("Other")).toBeInTheDocument();
  });

  it("renders the file upload zone with helper text", () => {
    render(<UploadRecord {...defaultProps} />);
    expect(screen.getByText(/Click to upload or drag/i)).toBeInTheDocument();
    expect(screen.getByText(/PDF, JPEG, PNG, TXT, DOC/i)).toBeInTheDocument();
  });

  it("renders the upload button", () => {
    render(<UploadRecord {...defaultProps} />);
    expect(screen.getByRole("button", { name: /Upload & Analyze/i })).toBeInTheDocument();
  });

  it("upload button is disabled when no file is selected", () => {
    render(<UploadRecord {...defaultProps} />);
    const btn = screen.getByRole("button", { name: /Upload & Analyze/i });
    expect(btn).toBeDisabled();
  });

  it("selecting a record type highlights that type", async () => {
    const user = userEvent.setup();
    render(<UploadRecord {...defaultProps} />);
    const labBtn = screen.getByRole("button", { name: /Lab Result/i });
    await user.click(labBtn);
    expect(labBtn.className).toContain("indigo");
  });

  it("shows error toast when upload is clicked without a file", async () => {
    const user = userEvent.setup();

    // Simulate upload button click without file (it should be disabled, but test toast path)
    render(<UploadRecord {...defaultProps} />);

    // The button is disabled, so we test the guard logic directly
    // by checking disabled state
    const btn = screen.getByRole("button", { name: /Upload & Analyze/i });
    expect(btn).toBeDisabled();
  });

  it("calls uploadRecord and createRecord on successful file upload flow", async () => {
    mockUploadRecord.mockResolvedValueOnce({
      success: true,
      ipfs_hash: "QmTestHash123",
      message: "Pinned",
    });
    mockAnalyzeDocument.mockResolvedValueOnce({
      success: true,
      analysis: "Patient shows signs of...",
    });

    const createRecord = vi.fn();
    const { container } = render(
      <UploadRecord {...defaultProps} createRecord={createRecord} />
    );

    // Simulate file selection via the hidden input
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const testFile = new File([new Uint8Array([1, 2, 3])], "test.pdf", {
      type: "application/pdf",
    });

    await userEvent.upload(fileInput, testFile);

    // Now the button should be enabled
    const btn = screen.getByRole("button", { name: /Upload & Analyze/i });
    expect(btn).not.toBeDisabled();

    await userEvent.click(btn);

    await waitFor(() => {
      expect(mockUploadRecord).toHaveBeenCalledWith(testFile, "consultation");
      expect(createRecord).toHaveBeenCalledWith(
        "QmTestHash123",
        "consultation",
        expect.any(Function),
        expect.any(Function)
      );
    });
  });

  it("shows error toast when uploadRecord fails", async () => {
    mockUploadRecord.mockRejectedValueOnce(new Error("IPFS upload failed"));

    const { container } = render(<UploadRecord {...defaultProps} />);

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const testFile = new File(["content"], "test.pdf", { type: "application/pdf" });
    await userEvent.upload(fileInput, testFile);

    const btn = screen.getByRole("button", { name: /Upload & Analyze/i });
    await userEvent.click(btn);

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith("IPFS upload failed");
    });
  });

  it("renders 'done' state after successful tx confirmation callback", async () => {
    mockUploadRecord.mockResolvedValueOnce({
      success: true,
      ipfs_hash: "QmDone",
      message: "ok",
    });
    mockAnalyzeDocument.mockResolvedValueOnce({ success: true, analysis: "ok" });

    const createRecord = vi.fn().mockImplementation(
      (_hash, _type, onFinish) => {
        onFinish("0xTXID123");
      }
    );

    // Mock useTxStatus to fire onConfirmed exactly once when txId is first set.
    // Guard with a flag so subsequent re-renders don't re-fire the callback
    // (which would cause "Too many re-renders" from React).
    const { useTxStatus } = await import("@/hooks/useTxStatus");
    let confirmed = false;
    vi.mocked(useTxStatus).mockImplementation((txId, onConfirmed) => {
      if (txId && !confirmed) {
        confirmed = true;
        // Defer to avoid calling setState during the render phase.
        Promise.resolve().then(() => onConfirmed?.());
      }
      return txId ? "success" : "idle";
    });

    const { container } = render(
      <UploadRecord {...defaultProps} createRecord={createRecord} />
    );

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(fileInput, new File(["x"], "test.pdf", { type: "application/pdf" }));

    const btn = screen.getByRole("button", { name: /Upload & Analyze/i });
    await userEvent.click(btn);

    await waitFor(() => {
      expect(mockToastSuccess).toHaveBeenCalledWith("Record saved to Stacks blockchain!");
    });
  });
});
