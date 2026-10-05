import { useCallback, useEffect, useRef, useState } from 'react';
import { AnalysisProgress } from './components/AnalysisProgress';
import { AnalyzeActions } from './components/AnalyzeActions';
import { Dashboard } from './components/Dashboard';
import { Footer } from './components/Footer';
import { Header } from './components/Header';
import { ImageInput } from './components/ImageInput';
import { ResultsPanel } from './components/ResultsPanel';
import { StageSection } from './components/StageSection';
import { TextInput } from './components/TextInput';
import { useTheme } from './hooks/useTheme';
import { analyzeText, analyzeImage, protectText, protectImage, rescanText, rescanImage } from './lib/api';
import { toDisplayFindings, toDisplayRisk } from './lib/findings';
import type { AnalysisState, AppView, InputMode, ProtectionState, TextAnalysis, DisplayRisk } from './lib/types';

const EMPTY_ANALYSIS: TextAnalysis | null = null;
const PROGRESS_TICK_MS = 320;

const INPUT_HINT: Record<InputMode, string> = {
  text: 'Paste the text you plan to share.',
  image: 'Upload an image to scan with OCR.',
};

const VIEW_TITLES: Record<AppView, string> = {
  dashboard: 'PrivacyGuard',
  text: 'Text Analysis · PrivacyGuard',
  image: 'Image Analysis · PrivacyGuard',
};

export function App() {
  const [view, setView] = useState<AppView>('dashboard');
  const { theme, toggleTheme } = useTheme();
  const mode: InputMode = view === 'image' ? 'image' : 'text';
  const [text, setText] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const [analysisState, setAnalysisState] = useState<AnalysisState>('idle');
  const [progressStep, setProgressStep] = useState(0);
  const [analysis, setAnalysis] = useState<TextAnalysis | null>(EMPTY_ANALYSIS);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [protectionState, setProtectionState] = useState<ProtectionState>('idle');
  const [isProtecting, setIsProtecting] = useState(false);
  const [protectedText, setProtectedText] = useState<string | null>(null);
  const [protectedImageBase64, setProtectedImageBase64] = useState<string | null>(null);
  const [protectedImagePreviewUrl, setProtectedImagePreviewUrl] = useState<string | null>(null);
  const [rescanState, setRescanState] = useState<'idle' | 'rescanning' | 'complete'>('idle');
  const [rescanRisk, setRescanRisk] = useState<DisplayRisk | null>(null);

  const findingsRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const clearImageTimer = useCallback(() => {
    // No-op, kept for compatibility
  }, []);

  // The preview URL is derived from the selected file and revoked on change or unmount.
  useEffect(() => {
    if (!imageFile) {
      setPreviewUrl(null);
      return;
    }

    const url = URL.createObjectURL(imageFile);
    setPreviewUrl(url);

    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  // Clean up protected image preview URL
  useEffect(() => {
    if (!protectedImageBase64) {
      setProtectedImagePreviewUrl(null);
      return;
    }

    const url = `data:image/png;base64,${protectedImageBase64}`;
    setProtectedImagePreviewUrl(url);
  }, [protectedImageBase64]);

  useEffect(
    () => () => {
      abortRef.current?.abort();
      if (protectedImagePreviewUrl) URL.revokeObjectURL(protectedImagePreviewUrl);
    },
    [],
  );

  // Walk the progress labels while a request is in flight.
  useEffect(() => {
    if (analysisState !== 'analyzing') return;

    setProgressStep(0);
    const timer = window.setInterval(() => {
      setProgressStep((current) => Math.min(current + 1, 3));
    }, PROGRESS_TICK_MS);

    return () => window.clearInterval(timer);
  }, [analysisState]);

  useEffect(() => {
    if (analysisState === 'complete') {
      findingsRef.current?.scrollIntoView({ block: 'nearest' });
    }
  }, [analysisState]);

  useEffect(() => {
    document.title = VIEW_TITLES[view];
  }, [view]);

  const hasText = text.trim().length > 0;
  const hasImage = imageFile !== null;
  const hasAnyInput = hasText || hasImage;

  const clearResults = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setAnalysis(EMPTY_ANALYSIS);
    setAnalysisError(null);
    setAnalysisState('idle');
    setProtectionState('idle');
    setProtectedText(null);
    setProtectedImageBase64(null);
    setProtectedImagePreviewUrl(null);
    setRescanState('idle');
    setRescanRisk(null);
    setProgressStep(0);
  }, []);

  const canAnalyze = analysisState === 'idle' && (mode === 'text' ? hasText : hasImage);

  const blockedHint =
    mode === 'text'
      ? hasText
        ? 'Sent to the PrivacyGuard API and processed in memory.'
        : 'Paste some text to enable analysis.'
      : hasImage
        ? 'Sent to the PrivacyGuard API for OCR and analysis.'
        : 'Choose an image to enable analysis.';

  const handleAnalyze = useCallback(async () => {
    if (!canAnalyze) return;

    setAnalysisState('analyzing');
    setAnalysis(EMPTY_ANALYSIS);
    setAnalysisError(null);
    setProtectionState('idle');

    if (mode === 'image') {
      if (!imageFile) return;

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const response = await analyzeImage(imageFile, controller.signal);
        const aiEnabled = response.meta.aiEnabled;
        const aiUsed = response.meta.aiStatus === 'available' && response.meta.aiAnalyzedCount > 0;

        setAnalysis({
          source: 'detector',
          findings: toDisplayFindings(response.findings, response.meta.image.charactersExtracted > 0 ? 'image' : ''),
          categoryCount: response.meta.categoryCount,
          categories: response.meta.categories,
          charactersAnalyzed: response.meta.charactersAnalyzed,
          engine: response.meta.engine,
          ai: {
            enabled: aiEnabled,
            provider: response.meta.aiProvider,
            status: response.meta.aiStatus,
            reason: response.meta.aiStatusReason,
            model: response.meta.aiModel,
            analyzedCount: response.meta.aiAnalyzedCount,
            contextTruncated: response.meta.aiContextTruncated,
            summary: response.meta.aiSummary,
            summarySource: aiUsed && response.meta.aiSummary ? 'ai' : 'deterministic',
          },
          summary: response.summary,
          risk: toDisplayRisk(response.risk),
        });
        setAnalysisState('complete');
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;

        setAnalysisError(error instanceof Error ? error.message : 'The analysis could not be completed.');
        setAnalysisState('idle');
      } finally {
        abortRef.current = null;
      }
      return;
    }

    // Text mode
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await analyzeText(text, controller.signal);
      const aiEnabled = response.meta.aiEnabled;
      const aiUsed = response.meta.aiStatus === 'available' && response.meta.aiAnalyzedCount > 0;

      setAnalysis({
        source: 'detector',
        findings: toDisplayFindings(response.findings, text),
        categoryCount: response.meta.categoryCount,
        categories: response.meta.categories,
        charactersAnalyzed: response.meta.charactersAnalyzed,
        engine: response.meta.engine,
        ai: {
          enabled: aiEnabled,
          provider: response.meta.aiProvider,
          status: response.meta.aiStatus,
          reason: response.meta.aiStatusReason,
          model: response.meta.aiModel,
          analyzedCount: response.meta.aiAnalyzedCount,
          contextTruncated: response.meta.aiContextTruncated,
          summary: response.meta.aiSummary,
          summarySource: aiUsed && response.meta.aiSummary ? 'ai' : 'deterministic',
        },
        summary: response.summary,
        risk: toDisplayRisk(response.risk),
      });
      setAnalysisState('complete');
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;

      setAnalysisError(error instanceof Error ? error.message : 'The analysis could not be completed.');
      setAnalysisState('idle');
    } finally {
      abortRef.current = null;
    }
  }, [canAnalyze, clearImageTimer, mode, text, imageFile]);

  const handleProtect = useCallback(async () => {
    setIsProtecting(true);

    if (mode === 'image') {
      if (!imageFile || !analysis) {
        setIsProtecting(false);
        return;
      }

      try {
        const response = await protectImage(imageFile);
        setProtectedImageBase64(response.protectedImageBase64);
        setProtectionState('protected');
        setRescanState('idle');
        setRescanRisk(null);
      } catch (error) {
        setAnalysisError(error instanceof Error ? error.message : 'Protection failed.');
      } finally {
        setIsProtecting(false);
      }
      return;
    }

    // Text mode
    if (!text || !analysis) {
      setIsProtecting(false);
      return;
    }

    try {
      const response = await protectText(text);
      setProtectedText(response.protectedText);
      setProtectionState('protected');
      setRescanState('idle');
      setRescanRisk(null);
    } catch (error) {
      setAnalysisError(error instanceof Error ? error.message : 'Protection failed.');
    } finally {
      setIsProtecting(false);
    }
  }, [mode, text, imageFile, analysis]);

  const handleRescan = useCallback(async () => {
    if (mode === 'image') {
      if (!protectedImageBase64) return;

      setRescanState('rescanning');
      try {
        // Create a File from the base64 for the rescan
        const byteString = atob(protectedImageBase64!);
        const arrayBuffer = new ArrayBuffer(byteString.length);
        const uint8Array = new Uint8Array(arrayBuffer);
        for (let i = 0; i < byteString.length; i++) {
          uint8Array[i] = byteString.charCodeAt(i);
        }
        const blob = new Blob([arrayBuffer], { type: 'image/png' });
        const file = new File([blob], 'protected.png', { type: 'image/png' });

        const response = await rescanImage(file);
        setRescanRisk(toDisplayRisk(response.risk));
        setRescanState('complete');
      } catch (error) {
        setAnalysisError(error instanceof Error ? error.message : 'Rescan failed.');
        setRescanState('idle');
      }
      return;
    }

    // Text mode
    if (!protectedText) return;

    setRescanState('rescanning');
    try {
      const response = await rescanText(protectedText);
      setRescanRisk(toDisplayRisk(response.risk));
      setRescanState('complete');
    } catch (error) {
      setAnalysisError(error instanceof Error ? error.message : 'Rescan failed.');
      setRescanState('idle');
    }
  }, [mode, protectedText, protectedImageBase64]);

  const handleReset = () => {
    setText('');
    setImageFile(null);
    clearResults();
  };

  // Switching between the text and image workflows invalidates the current
  // results, but moving to the dashboard and back keeps the analysis intact.
  const handleNavigate = useCallback(
    (next: AppView) => {
      if (next === view) return;
      setView(next);
      if (next !== 'dashboard' && next !== mode) clearResults();
    },
    [view, mode, clearResults],
  );

  const handleImageSelect = (file: File) => {
    setImageFile(file);
    clearResults();
  };

  const handleImageRemove = () => {
    setImageFile(null);
    clearResults();
  };

  const handleTextChange = (next: string) => {
    setText(next);
    if (analysisState !== 'idle' || analysis !== null) clearResults();
  };

  const sourceLabel = mode === 'text'
    ? `${text.length.toLocaleString()} characters of pasted text`
    : imageFile
      ? `Image: ${imageFile.name} (${(imageFile.size / 1024).toFixed(1)} KB)`
      : 'No input';

  const inputStatus = hasAnyInput ? 'done' : 'active';

  return (
    <div className="app">
      <Header
        view={view}
        theme={theme}
        onNavigate={handleNavigate}
        onToggleTheme={toggleTheme}
      />

      <main className="layout">
        {view === 'dashboard' ? (
          <Dashboard onNavigate={handleNavigate} />
        ) : (
          <>
            <h1 className="page-title">{view === 'image' ? 'Image Analysis' : 'Text Analysis'}</h1>

            <StageSection
              step={1}
              label="Step 1"
              title="Provide your content"
              description={INPUT_HINT[mode]}
              status={inputStatus}
            >

            <div className="input-area">
              {mode === 'text' ? (
                <TextInput
                  value={text}
                  onChange={handleTextChange}
                  onClear={() => handleTextChange('')}
                  disabled={analysisState === 'analyzing'}
                />
              ) : (
                <ImageInput
                  file={imageFile}
                  previewUrl={previewUrl}
                  onSelect={handleImageSelect}
                  onRemove={handleImageRemove}
                  disabled={analysisState === 'analyzing'}
                />
              )}
            </div>

            <AnalyzeActions
              canAnalyze={canAnalyze}
              busy={analysisState === 'analyzing'}
              onAnalyze={() => void handleAnalyze()}
              onReset={handleReset}
              blockedHint={blockedHint}
              hasAnyInput={hasAnyInput}
            />
          </StageSection>

          {analysisError ? (
            <p className="notice notice--warning" role="alert">
              {analysisError}
            </p>
          ) : analysisState === 'analyzing' ? (
            <AnalysisProgress done={progressStep} label={mode === 'image' ? 'Extracting text and analyzing…' : 'Analyzing text…'} />
          ) : analysis ? (
            <div ref={findingsRef}>
              <ResultsPanel
                analysis={analysis}
                sourceLabel={sourceLabel}
                protectionState={protectionState}
                protectBusy={isProtecting}
                onProtect={handleProtect}
                rescanState={rescanState}
                rescanRisk={rescanRisk}
                onRescan={handleRescan}
                canRescan={protectionState === 'protected' && (protectedText !== null || protectedImageBase64 !== null)}
                protectedText={protectedText}
                mode={mode}
              />
            </div>
          ) : (
            <p className="placeholder-note">Paste text or upload an image to get started.</p>
          )}
          </>
        )}
      </main>

      <Footer />
    </div>
  );
}
