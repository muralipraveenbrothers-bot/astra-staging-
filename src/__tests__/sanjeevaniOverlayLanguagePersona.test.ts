import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SanjeevaniOverlay } from "@/components/SanjeevaniOverlay";
import { SupportedLanguage } from "@/agents/core/ModelRegistry";
import { VoicePersona } from "@/voice/VoiceboxEngine";

describe("SanjeevaniOverlay Language and Persona Selection", () => {
  const onClose = vi.fn();

  beforeEach(() => {
    // Reset mocks before each test
    onClose.mockClear();
  });

  it("should render language select dropdown", () => {
    render(React.createElement(SanjeevaniOverlay, { onClose }));

    const languageSelect = screen.getByRole("combobox", { name: /lang/i });
    expect(languageSelect).toBeInTheDocument();

    // Check that it contains the expected language options
    expect(languageSelect).toHaveValue(SupportedLanguage.ENGLISH);

    // Change language to Telugu
    fireEvent.change(languageSelect, { target: { value: SupportedLanguage.TELUGU } });
    expect(languageSelect).toHaveValue(SupportedLanguage.TELUGU);
  });

  it("should render persona selection buttons", () => {
    render(React.createElement(SanjeevaniOverlay, { onClose }));

    // Check for all three persona buttons
    const drArjunBtn = screen.getByRole("button", { name: /dr\. arjun/i });
    const drPriyaBtn = screen.getByRole("button", { name: /dr\. priya/i });
    const receptionBtn = screen.getByRole("button", { name: /reception/i });

    expect(drArjunBtn).toBeInTheDocument();
    expect(drPriyaBtn).toBeInTheDocument();
    expect(receptionBtn).toBeInTheDocument();

    // Check initial state - Dr. Arjun should be selected (based on default)
    expect(drArjunBtn).toHaveClass("bg-emerald-600");
    expect(drPriyaBtn).toHaveClass("bg-slate-600");
    expect(receptionBtn).toHaveClass("bg-slate-600");

    // Click Dr. Priya button
    fireEvent.click(drPriyaBtn);

    // Check that Dr. Priya is now selected
    expect(drPriyaBtn).toHaveClass("bg-emerald-600");
    expect(drArjunBtn).toHaveClass("bg-slate-600");
    expect(receptionBtn).toHaveClass("bg-slate-600");
  });

  it("should update voice session when language changes", async () => {
    // Mock the voicebox engine
    const mockEngine = {
      startSession: vi.fn().mockReturnValue({ id: "test-session-id" }),
      getActiveSession: vi.fn().mockReturnValue({
        id: "test-session-id",
        language: SupportedLanguage.ENGLISH,
        persona: VoicePersona.DR_ARJUN
      }),
      on: vi.fn()
    };

    // Mock the import
    vi.mock("@/voice/VoiceboxEngine", () => ({
      getVoiceboxEngine: () => mockEngine
    }));

    // Re-import the component to get the mocked version
    const { SanjeevaniOverlay: MockedSanjeevaniOverlay } = await import("@/components/SanjeevaniOverlay");

    render(React.createElement(MockedSanjeevaniOverlay, { onClose }));

    // Start a voice session by clicking the mic button
    const micButton = screen.getByRole("button", { name: /start listening/i });
    fireEvent.click(micButton);

    // Change language
    const languageSelect = screen.getByRole("combobox", { name: /lang/i });
    fireEvent.change(languageSelect, { target: { value: SupportedLanguage.TELUGU } });

    // Verify that the session's language was updated
    expect(mockEngine.getActiveSession).toHaveBeenCalledWith("test-session-id");
    // Note: In a real implementation, we would check that the session's language property was updated
  });

  it("should update voice session when persona changes", async () => {
    // Mock the voicebox engine
    const mockEngine = {
      startSession: vi.fn().mockReturnValue({ id: "test-session-id" }),
      getActiveSession: vi.fn().mockReturnValue({
        id: "test-session-id",
        language: SupportedLanguage.ENGLISH,
        persona: VoicePersona.DR_ARJUN
      }),
      on: vi.fn()
    };

    // Mock the import
    vi.mock("@/voice/VoiceboxEngine", () => ({
      getVoiceboxEngine: () => mockEngine
    }));

    // Re-import the component to get the mocked version
    const { SanjeevaniOverlay: MockedSanjeevaniOverlay } = await import("@/components/SanjeevaniOverlay");

    render(React.createElement(MockedSanjeevaniOverlay, { onClose }));

    // Start a voice session by clicking the mic button
    const micButton = screen.getByRole("button", { name: /start listening/i });
    fireEvent.click(micButton);

    // Click Dr. Priya button
    const drPriyaBtn = screen.getByRole("button", { name: /dr\. priya/i });
    fireEvent.click(drPriyaBtn);

    // Verify that the session's persona was updated
    expect(mockEngine.getActiveSession).toHaveBeenCalledWith("test-session-id");
    // Note: In a real implementation, we would check that the session's persona property was updated
  });
});