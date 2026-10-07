import { useCallback, useEffect, useRef, useState } from 'react';
import { AnalysisProgress } from './components/AnalysisProgress';
import { AnalyzeActions } from './components/AnalyzeActions';
import { activityDescription, activityStatus, Dashboard } from './components/Dashboard';
import type { DashboardActivity } from './components/Dashboard';
import { Footer } from './components/Footer';
import { Header } from './components/Header';
import { Icon } from './components/Icon';
import { ImageInput } from './components/ImageInput';
import { LandingPage } from './components/LandingPage';
import { ResultsPanel } from './components/ResultsPanel';
import { StageSection } from './components/StageSection';
import { ThemeToggle } from './components/ThemeToggle';
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
  landing: 'Welcome · PrivacyGuard',
  dashboard: 'Dashboard · PrivacyGuard',
  text: 'Text Analysis · PrivacyGuard',
  image: 'Image Analysis · PrivacyGuard',
  'text-results': 'Analysis Results · PrivacyGuard',
  'image-results': 'Image Analysis Results · PrivacyGuard',
  protected: 'Protected Copy · PrivacyGuard',
  rescan: 'Final Verdict · PrivacyGuard',
  history: 'History · PrivacyGuard',
};

export function App() {
  const [view, setView] = useState<AppView>('landing');
  const { theme, toggleTheme } = useTheme();
  const [mode, setMode] = useState<InputMode>('text');
  const [recentActivity, setRecentActivity] = useState<DashboardActivity[]>([]);
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
  const [protectedImageMimeType, setProtectedImageMimeType] = useState('image/png');
  const [protectedImagePreviewUrl, setProtectedImagePreviewUrl] = useState<string | null>(null);
  const [rescanState, setRescanState] = useState<'idle' | 'rescanning' | 'complete'>('idle');
  const [rescanRisk, setRescanRisk] = useState<DisplayRisk | null>(null);

  const findingsRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const clearImageTimer = useCallback(() => {
    // No-op, kept for compatibility
  }, []);

  const recordActivity = useCallback((
    inputMode: InputMode,
    findingCount: number,
    verdict: DisplayRisk['verdict'],
    charactersAnalyzed: number,
  ) => {
    const entry: DashboardActivity = {
      id: `${Date.now()}-${inputMode}-${Math.random().toString(36).slice(2)}`,
      type: inputMode,
      findingCount,
      at: new Date().toISOString(),
      status: verdict === 'SAFE_TO_SHARE' ? 'safe' : verdict === 'NOT_SAFE_TO_SHARE' ? 'attention' : 'review',
      charactersAnalyzed,
    };
    setRecentActivity((current) => [entry, ...current].slice(0, 20));
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

    const url = `data:${protectedImageMimeType};base64,${protectedImageBase64}`;
    setProtectedImagePreviewUrl(url);
  }, [protectedImageBase64, protectedImageMimeType]);

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
    setProtectedImageMimeType('image/png');
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
        recordActivity(
          'image',
          response.findings.length,
          response.risk.verdict,
          response.meta.image.charactersExtracted,
        );
        setAnalysisState('complete');
        setView('image-results');
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
      recordActivity('text', response.findings.length, response.risk.verdict, response.meta.charactersAnalyzed);
      setAnalysisState('complete');
      setView('text-results');
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;

      setAnalysisError(error instanceof Error ? error.message : 'The analysis could not be completed.');
      setAnalysisState('idle');
    } finally {
      abortRef.current = null;
    }
  }, [canAnalyze, clearImageTimer, mode, text, imageFile, recordActivity]);

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
        setProtectedImageMimeType(
          response.meta.format === 'jpeg' ? 'image/jpeg' : response.meta.format === 'webp' ? 'image/webp' : 'image/png',
        );
        setProtectionState('protected');
        setRescanState('idle');
        setRescanRisk(null);
        setView('protected');
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
      setView('protected');
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
        const extension = protectedImageMimeType === 'image/jpeg'
          ? 'jpg'
          : protectedImageMimeType === 'image/webp'
            ? 'webp'
            : 'png';
        const blob = new Blob([arrayBuffer], { type: protectedImageMimeType });
        const file = new File([blob], `protected.${extension}`, { type: protectedImageMimeType });

        const response = await rescanImage(file);
        setRescanRisk(toDisplayRisk(response.risk));
        setRescanState('complete');
        setView('rescan');
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
      setView('rescan');
    } catch (error) {
      setAnalysisError(error instanceof Error ? error.message : 'Rescan failed.');
      setRescanState('idle');
    }
  }, [mode, protectedText, protectedImageBase64, protectedImageMimeType]);

  const handleReset = () => {
    setText('');
    setImageFile(null);
    clearResults();
  };

  const handleNavigate = useCallback(
    (next: AppView) => {
      setView(next);
      if (next === 'text' || next === 'image') {
        setMode(next);
        clearResults();
      }
    },
    [clearResults],
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

  const inputStatus = (mode === 'text' ? hasText : hasImage) ? 'done' : 'pending';
  const activeSection =
    view === 'dashboard' || view === 'history'
      ? view
      : mode === 'image'
        ? 'image'
        : 'text';
  const isInputView = view === 'text' || view === 'image';
  const isResultsView = view === 'text-results' || view === 'image-results';
  const hasAnalysis = analysis !== null;

  if (view === 'landing') {
    return (
      <LandingPage
        theme={theme}
        onToggleTheme={toggleTheme}
        onGetStarted={() => handleNavigate('dashboard')}
      />
    );
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <button
          type="button"
          className="sidebar__brand"
          onClick={() => handleNavigate('dashboard')}
          aria-label="PrivacyGuard dashboard"
        >
          <span className="logo" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor">
              <path d="M12 3 5 6v5.5c0 4.4 2.9 8.3 7 9.5 4.1-1.2 7-5.1 7-9.5V6l-7-3Z" strokeWidth="1.7" strokeLinejoin="round" />
              <path d="m9.5 12.2 1.8 1.8 3.4-3.6" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <span className="sidebar__brand-name">PrivacyGuard</span>
        </button>

        <nav className="sidebar__nav" aria-label="Main navigation">
          <p className="sidebar__label">Workspace</p>
          {([
            ['dashboard', 'Dashboard', 'dashboard'],
            ['text', 'Text Analysis', 'text'],
            ['image', 'Image Analysis', 'image'],
            ['history', 'History', 'history'],
          ] as const).map(([destination, label, icon]) => (
            <button
              key={destination}
              type="button"
              className={`sidebar__link${activeSection === destination ? ' sidebar__link--active' : ''}`}
              aria-current={activeSection === destination ? 'page' : undefined}
              onClick={() => handleNavigate(destination)}
            >
              <span className="sidebar__link-icon"><Icon name={icon} size={18} /></span>
              {label}
            </button>
          ))}
        </nav>

        <div className="sidebar__bottom">
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
          <p className="sidebar__privacy">Scans are processed in memory, not saved.</p>
        </div>
      </aside>

      <div className="app__main">
        <Header view={view} />
        <main className="layout">
          {analysisError && (
            <p className="notice notice--warning" role="alert">
              {analysisError}
            </p>
          )}

          {view === 'dashboard' && <Dashboard onNavigate={handleNavigate} activity={recentActivity} />}

          {view === 'history' && (
            recentActivity.length > 0 ? (
              <section className="history-page">
                <div className="history-page__intro">
                  <h2>Recent scans</h2>
                  <p>
                    {recentActivity.length} {recentActivity.length === 1 ? 'scan' : 'scans'} from this session.
                    Only scan type, time, and result counts are kept in memory; your content is not saved.
                  </p>
                </div>
                <ul className="history-page__list">
                  {recentActivity.map((entry) => (
                    <li className="dashboard__activity-row" key={entry.id}>
                      <span className="dashboard__empty-icon"><Icon name={entry.type} size={18} /></span>
                      <span className="dashboard__activity-copy">
                        <strong>{entry.type === 'text' ? 'Text Analysis' : 'Image Analysis'}</strong>
                        <span>{activityDescription(entry)}</span>
                      </span>
                      <time className="dashboard__activity-time" dateTime={entry.at}>
                        {new Date(entry.at).toLocaleString()}
                      </time>
                      <span className={`dashboard__complete dashboard__complete--${entry.status}`}>
                        {activityStatus(entry.status)}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : (
              <section className="history-empty panel">
                <span className="history-empty__icon"><Icon name="history" size={23} /></span>
                <h2>No scans in this session yet</h2>
                <p>
                  Completed text and image scans will appear here. We keep only scan metadata in
                  memory; your content is never saved. This list clears when you reload or close the app.
                </p>
                <button type="button" className="button button--primary" onClick={() => handleNavigate('text')}>
                  Start a text analysis
                </button>
              </section>
            )
          )}

          {isInputView && (
            <>
              <div className="page-intro">
                <p className="hero__eyebrow">Step 1 of 5 · Analyze</p>
                <p className="page-intro__text">{INPUT_HINT[mode]}</p>
              </div>
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
              {analysisState === 'analyzing' && (
                <AnalysisProgress
                  done={progressStep}
                  label={mode === 'image' ? 'Extracting text and analyzing…' : 'Analyzing text…'}
                />
              )}
            </>
          )}

          {isResultsView && hasAnalysis && (
            <section className="flow-page" ref={findingsRef}>
              <div className="flow-page__head">
                <button type="button" className="back-link" onClick={() => handleNavigate(mode)}>
                  &larr; Back to {mode === 'image' ? 'image analysis' : 'text analysis'}
                </button>
                <p className="flow-page__step">Step 2 of 5 · Assess risk</p>
                <p className="flow-page__description">Review what was found and the recommended next step.</p>
              </div>
              <ResultsPanel
                screen="results"
                analysis={analysis}
                sourceLabel={sourceLabel}
                protectionState={protectionState}
                protectBusy={isProtecting}
                onProtect={() => void handleProtect()}
                rescanState={rescanState}
                rescanRisk={rescanRisk}
                onRescan={() => void handleRescan()}
                canRescan={protectionState === 'protected' && (protectedText !== null || protectedImageBase64 !== null)}
                protectedText={protectedText}
                protectedImagePreviewUrl={protectedImagePreviewUrl}
                mode={mode}
              />
              {mode === 'image' && analysis.findings.length > 0 && (
                <button type="button" className="button button--primary" onClick={() => void handleProtect()} disabled={isProtecting}>
                  {isProtecting ? 'Preparing protected image…' : 'View protected image'}
                </button>
              )}
            </section>
          )}

          {view === 'protected' && hasAnalysis && (
            <section className="flow-page">
              <div className="flow-page__head">
                <button type="button" className="back-link" onClick={() => setView(mode === 'image' ? 'image-results' : 'text-results')}>
                  &larr; Back to results
                </button>
                <p className="flow-page__step">Step 3 of 5 · Protect</p>
                <p className="flow-page__description">Review the protected version before scanning it again.</p>
              </div>
              <ResultsPanel
                screen="protected"
                analysis={analysis}
                sourceLabel={sourceLabel}
                protectionState={protectionState}
                protectBusy={isProtecting}
                onProtect={() => void handleProtect()}
                rescanState={rescanState}
                rescanRisk={rescanRisk}
                onRescan={() => void handleRescan()}
                canRescan={protectionState === 'protected' && (protectedText !== null || protectedImageBase64 !== null)}
                protectedText={protectedText}
                protectedImagePreviewUrl={protectedImagePreviewUrl}
                mode={mode}
              />
            </section>
          )}

          {view === 'rescan' && hasAnalysis && (
            <section className="flow-page">
              <div className="flow-page__head">
                <button type="button" className="back-link" onClick={() => setView('protected')}>
                  &larr; Back to protected copy
                </button>
                <p className="flow-page__step">Steps 4–5 · Rescan and final verdict</p>
                <p className="flow-page__description">The verdict below is based on the protected version.</p>
              </div>
              <ResultsPanel
                screen="rescan"
                analysis={analysis}
                sourceLabel={sourceLabel}
                protectionState={protectionState}
                protectBusy={isProtecting}
                onProtect={() => void handleProtect()}
                rescanState={rescanState}
                rescanRisk={rescanRisk}
                onRescan={() => void handleRescan()}
                canRescan={protectionState === 'protected' && (protectedText !== null || protectedImageBase64 !== null)}
                protectedText={protectedText}
                protectedImagePreviewUrl={protectedImagePreviewUrl}
                mode={mode}
              />
              {rescanState !== 'complete' && (
                <button type="button" className="button button--primary button--lg" onClick={() => void handleRescan()} disabled={rescanState === 'rescanning'}>
                  {rescanState === 'rescanning' ? 'Scanning…' : 'Scan protected version'}
                </button>
              )}
            </section>
          )}
        </main>
        <Footer />
      </div>
    </div>
  );
}
