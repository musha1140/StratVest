import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  CheckCircle2,
  AlertTriangle,
  Scale,
  Info,
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf';
import pdfWorker from 'pdfjs-dist/build/pdf.worker?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

/*
 * StratVest Frontend
 *
 * This component powers the interactive inspection experience. Users can input
 * either a website URL or a link to a PDF file. The application fetches the
 * content, extracts text, classifies each sentence into evidentiary buckets,
 * and renders an infographic reminiscent of the Iraq AUMF audit. The goal is
 * to generalise the visual vocabulary for any document or URL.
 */

// Map granular classifications into the broader evidentiary buckets. These
// buckets power the bar charts and radial gauge.
function broadGroup(classification) {
  if (classification === 'Supported') return 'Supported';
  if (classification === 'Mixed') return 'Mixed';
  if (classification === 'Unsupported') return 'Unsupported';
  return 'Normative';
}

// Colour palette by bucket. These values mirror the palette used in the
// earlier Iraq audit. Each bucket defines background, text, border, fill and
// soft colours.
const groupColors = {
  Supported: {
    bg: 'bg-emerald-500/15',
    text: 'text-emerald-300',
    border: 'border-emerald-400/30',
    fill: '#34d399',
    soft: 'rgba(52, 211, 153, 0.18)',
  },
  Mixed: {
    bg: 'bg-amber-500/15',
    text: 'text-amber-300',
    border: 'border-amber-400/30',
    fill: '#fbbf24',
    soft: 'rgba(251, 191, 36, 0.18)',
  },
  Unsupported: {
    bg: 'bg-rose-500/15',
    text: 'text-rose-300',
    border: 'border-rose-400/30',
    fill: '#fb7185',
    soft: 'rgba(251, 113, 133, 0.18)',
  },
  Normative: {
    bg: 'bg-sky-500/15',
    text: 'text-sky-300',
    border: 'border-sky-400/30',
    fill: '#38bdf8',
    soft: 'rgba(56, 189, 248, 0.18)',
  },
};

// Associate each bucket with an icon. Lucide icons are used here instead of
// custom SVGs.
const iconByGroup = {
  Supported: CheckCircle2,
  Mixed: Info,
  Unsupported: AlertTriangle,
  Normative: Scale,
};

// Count values in an array keyed by the result of a function. This helper
// simplifies summarising lists of claims.
function countBy(arr, keyFn) {
  return arr.reduce((acc, item) => {
    const key = keyFn(item);
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

// Analyse plain text into a rich structure. Each sentence becomes a claim with
// a classification, notes and detected years. This is a naive heuristic-based
// classifier intended as a placeholder for more sophisticated NLP. It splits
// on sentence terminators and searches for keywords to assign categories.
function analyseText(rawText) {
  const sentences = rawText
    .replace(/\n+/g, ' ') // collapse newlines
    .split(/[.!?]\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const claims = [];
  const timeline = [];
  const yearRegex = /\b(19|20)\d{2}\b/g;
  for (const sentence of sentences) {
    let classification = 'Normative';
    const lower = sentence.toLowerCase();
    if (/(documented|widely documented|widely known|agreed|confirmed|well-known)/.test(lower)) {
      classification = 'Supported';
    } else if (/(false|unsupported|no evidence|unsubstantiated|unproven|hoax|fraudulent)/.test(lower)) {
      classification = 'Unsupported';
    } else if (/(misleading|partially|mixed)/.test(lower)) {
      classification = 'Mixed';
    }
    const years = Array.from(sentence.matchAll(yearRegex)).map((m) => m[0]);
    if (years.length > 0) {
      years.forEach((year) => {
        timeline.push({ year, label: sentence.slice(0, 50) + (sentence.length > 50 ? '...' : '') });
      });
    }
    claims.push({
      text: sentence,
      classification,
      notes: '',
    });
  }
  const summary = countBy(claims, (c) => c.classification);
  return { claims, timeline, summary };
}

// Fetch raw HTML via the backend view-source proxy. The backend ensures CORS
// limitations are avoided by performing the request server-side.
async function fetchHtml(url) {
  const res = await fetch(`/api/view-source?url=${encodeURIComponent(url)}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch HTML: ${res.statusText}`);
  }
  const data = await res.json();
  return data.html;
}

// Convert HTML into plain readable text. We strip script and style tags and
// remove markup to return the visible text. This uses the DOMParser API.
function htmlToText(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  // Remove script and style elements
  doc.querySelectorAll('script,style,noscript').forEach((el) => el.remove());
  return doc.body.textContent || '';
}

// Load a PDF from a URL and extract its textual content. This uses
// pdfjs-dist to fetch and parse the file client-side. For large documents
// this may take a few seconds.
async function loadPdf(url) {
  const loadingTask = pdfjsLib.getDocument({ url });
  const pdf = await loadingTask.promise;
  let text = '';
  const numPages = pdf.numPages;
  for (let i = 1; i <= numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const strings = content.items.map((item) => item.str);
    text += strings.join(' ') + '\n';
  }
  return text;
}

// Simple bar chart component. Accepts a list of items with key, label, value and
// colour. The activeKey allows highlighting a selected bar when used in
// conjunction with other visualisations.
function BarChart({ data, max, activeKey, onHover, title }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-2xl shadow-black/30">
      <div className="mb-4 text-sm uppercase tracking-[0.22em] text-zinc-400">{title}</div>
      <div className="space-y-3">
        {data.map((item) => {
          const percent = max ? (item.value / max) * 100 : 0;
          const active = activeKey === item.key;
          return (
            <button
              key={item.key}
              onMouseEnter={() => onHover?.(item.key)}
              onMouseLeave={() => onHover?.(null)}
              onClick={() => onHover?.(active ? null : item.key)}
              className={`w-full rounded-2xl border p-3 text-left transition ${
                active
                  ? 'border-white/25 bg-white/10'
                  : 'border-white/5 bg-black/10 hover:border-white/15 hover:bg-white/5'
              }`}
            >
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="text-sm text-zinc-200">{item.label}</span>
                <span className="text-sm font-semibold text-white">{item.value}</span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-white/5">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${percent}%` }}
                  transition={{ duration: 0.7, ease: 'easeOut' }}
                  className="h-full rounded-full"
                  style={{ backgroundColor: item.color }}
                />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Radial gauge summarising the proportion of supported claims. Visualised as
// a donut chart.
function RadialGauge({ supported, total }) {
  const ratio = total ? supported / total : 0;
  const radius = 56;
  const circumference = 2 * Math.PI * radius;
  const dash = circumference * ratio;
  return (
    <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-white/8 to-white/3 p-5 shadow-2xl shadow-black/30">
      <div className="mb-4 text-sm uppercase tracking-[0.22em] text-zinc-400">Reliability signal</div>
      <div className="flex items-center gap-6">
        <div className="relative h-36 w-36 shrink-0">
          <svg viewBox="0 0 140 140" className="h-full w-full -rotate-90">
            <circle cx="70" cy="70" r={radius} stroke="rgba(255,255,255,0.08)" strokeWidth="12" fill="none" />
            <circle
              cx="70"
              cy="70"
              r={radius}
              stroke={groupColors.Supported.fill}
              strokeWidth="12"
              fill="none"
              strokeLinecap="round"
              strokeDasharray={`${dash} ${circumference - dash}`}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className="text-3xl font-bold text-white">{Math.round(ratio * 100)}%</div>
            <div className="text-xs uppercase tracking-[0.18em] text-zinc-400">Supported</div>
          </div>
        </div>
        <div className="space-y-3 text-sm text-zinc-300">
          <div>
            <span className="font-semibold text-white">{supported} of {total}</span> claims land in the supported bucket.
          </div>
          <div>The distribution below shows how evidence is weighted across the document.</div>
        </div>
      </div>
    </div>
  );
}

// Timeline component that draws a horizontal timeline of detected years. Each
// event is rendered with a node and a label. Years are spaced evenly based on
// the order encountered rather than actual time intervals.
function Timeline({ events }) {
  if (!events || events.length === 0) return null;
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl shadow-black/30">
      <div className="mb-6 flex items-center gap-3">
        <Scale className="h-5 w-5 text-zinc-300" />
        <div className="text-sm uppercase tracking-[0.22em] text-zinc-400">Timeline</div>
      </div>
      <div className="relative overflow-x-auto pb-2">
        <div className="relative min-w-[700px] px-3 py-6">
          <div className="absolute left-0 right-0 top-1/2 h-px -translate-y-1/2 bg-gradient-to-r from-white/10 via-white/20 to-white/10" />
          <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${Math.max(events.length, 1)}, minmax(0, 1fr))` }}>
            {events.map((item, idx) => (
              <motion.div
                key={`${item.year}-${idx}`}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
                className="relative"
              >
                <div className="mx-auto mb-4 h-4 w-4 rounded-full border-4 border-zinc-950 bg-white shadow-[0_0_0_6px_rgba(255,255,255,0.04)]" />
                <div className="rounded-2xl border border-white/10 bg-zinc-950/80 p-4 text-center">
                  <div className="mb-2 text-sm font-bold text-white">{item.year}</div>
                  <div className="text-xs leading-5 text-zinc-300">{item.label}</div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// Claim card displays a single sentence with its classification. Cards are
// colour-coded to match their bucket and display an icon accordingly.
function ClaimCard({ claim }) {
  const group = broadGroup(claim.classification);
  const Icon = iconByGroup[group];
  const theme = groupColors[group];
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-3xl border p-4 transition-all ${theme.border} ${theme.bg}`}
    >
      <div className="mb-3 flex items-start justify-between gap-4">
          <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${theme.border} ${theme.text}`}>
            <Icon className="h-3.5 w-3.5" />
            {group}
          </div>
          <div className="text-xs uppercase tracking-[0.18em] text-zinc-400">{claim.classification}</div>
      </div>
      <div className="mb-3 text-base font-semibold leading-6 text-white">{claim.text}</div>
      {claim.notes && <div className="text-sm leading-6 text-zinc-300">{claim.notes}</div>}
    </motion.div>
  );
}

export default function App() {
  const [input, setInput] = useState('');
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Handler invoked when the user clicks the analyse button. Determines
  // whether the input points to a PDF or HTML resource and calls the
  // appropriate loader. Upon completion it runs the analysis and stores the
  // results in state.
  const handleAnalyse = async () => {
    setError('');
    if (!input) return;
    setLoading(true);
    try {
      let text;
      // naive check for PDF. Accept both .pdf extension and explicit type
      if (/\.pdf(\?|#|$)/i.test(input.trim())) {
        text = await loadPdf(input.trim());
      } else {
        const html = await fetchHtml(input.trim());
        text = htmlToText(html);
      }
      const result = analyseText(text);
      setAnalysis({ ...result, source: input.trim() });
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to analyse content');
      setAnalysis(null);
    } finally {
      setLoading(false);
    }
  };

  const summary = analysis?.summary || {};
  const totalClaims = useMemo(() => (analysis?.claims ? analysis.claims.length : 0), [analysis]);
  const supportedCount = summary.Supported || 0;
  const scoreData = useMemo(() => {
    return ['Supported', 'Mixed', 'Unsupported', 'Normative'].map((key) => ({
      key,
      label: key,
      value: summary[key] || 0,
      color: groupColors[key].fill,
    }));
  }, [summary]);

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.08),transparent_30%),radial-gradient(circle_at_top_right,rgba(244,63,94,0.08),transparent_28%),radial-gradient(circle_at_bottom,rgba(59,130,246,0.08),transparent_30%)]" />
      <div className="relative mx-auto max-w-7xl px-6 py-10 md:px-8 lg:px-10">
        <div className="mb-8">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.22em] text-zinc-400">
            StratVest Inspector
          </div>
          <h1 className="max-w-4xl text-4xl font-black tracking-tight text-white md:text-6xl">
            Analyse any document or site through a forensic lens.
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-zinc-300 md:text-lg">
            Paste a link to a web page or PDF and StratVest will extract its contents,
            categorise claims and visualise how evidence and argument stack up.
          </p>
        </div>
        <div className="mb-6 flex w-full flex-col items-start gap-3 sm:flex-row sm:items-end">
          <input
            type="text"
            className="w-full rounded-lg border border-white/10 bg-white/5 p-3 text-white placeholder-zinc-400 focus:border-white/20 focus:outline-none"
            placeholder="Enter a URL or PDF link..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          <button
            onClick={handleAnalyse}
            disabled={loading || !input}
            className="whitespace-nowrap rounded-lg bg-emerald-600 px-5 py-3 font-semibold text-white shadow hover:bg-emerald-500 disabled:opacity-50"
          >
            {loading ? 'Analysing...' : 'Run Analysis'}
          </button>
        </div>
        {error && (
          <div className="mb-6 rounded-lg border border-rose-400/20 bg-rose-500/10 p-4 text-rose-100">
            {error}
          </div>
        )}
        {analysis && (
          <>
            <div className="mb-6 grid gap-6 lg:grid-cols-[1fr_1fr_1.2fr]">
              <BarChart
                title="Executive scorecard"
                data={scoreData}
                max={Math.max(...scoreData.map((d) => d.value), 1)}
                activeKey={null}
                onHover={null}
              />
              <RadialGauge supported={supportedCount} total={totalClaims} />
              <Timeline events={analysis.timeline.slice(0, Math.min(analysis.timeline.length, 7))} />
            </div>
            <div className="mb-6">
              <h2 className="mb-4 text-xl font-bold text-white">Claims overview</h2>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {analysis.claims.map((claim, idx) => (
                  <ClaimCard key={idx} claim={claim} />
                ))}
              </div>
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl shadow-black/30">
              <h2 className="mb-4 text-xl font-bold text-white">Summary</h2>
              <p className="mb-3 text-sm leading-7 text-zinc-200">
                {supportedCount} out of {totalClaims} sentences were classified as supported claims. The remainder
                fall into mixed, unsupported or normative categories. This analysis uses simple heuristics and
                should not be considered definitive. Use StratVest as a first-pass investigation to guide more
                detailed review.
              </p>
              <p className="text-sm leading-7 text-zinc-200">
                Source analysed: <span className="text-emerald-300 underline break-all">{analysis.source}</span>
              </p>
            </div>
          </>
        )}
        {!analysis && !loading && (
          <div className="mt-16 text-zinc-400">
            Enter a URL or PDF link above to begin your analysis. StratVest will highlight
            time references, categorise sentences by evidentiary support, and visualise your document.
          </div>
        )}
      </div>
    </div>
  );
}