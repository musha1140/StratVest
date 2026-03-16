export type RunStatus = 'queued' | 'running' | 'succeeded' | 'failed';
export type AgentStatus = 'queued' | 'running' | 'done' | 'skipped' | 'failed';
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';
export type Severity = 'low' | 'medium' | 'high' | 'critical';

export interface RunCreateRequest {
  targetUrl: string;
  sandbox?: Partial<SandboxConfig>;
}

export interface SandboxConfig {
  screenshot: boolean;
  devtoolsTrace: boolean;
  lighthouse: boolean;
  captureHeaders: boolean;
  timeoutMs: number;
  waitUntil: 'load' | 'domcontentloaded' | 'networkidle' | 'commit';
  headless: boolean;
}

export interface AgentState {
  id: string;
  name: string;
  status: AgentStatus;
  startedAt?: string;
  finishedAt?: string;
  notes?: string;
  error?: string;
}

export interface RunManifest {
  id: string;
  targetUrl: string;
  normalizedUrl: string;
  status: RunStatus;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  sandbox: SandboxConfig;
  error?: string;
  agents: AgentState[];
  artifacts: Record<string, string>;
  summary?: string[];
  score?: number;
  risk?: RiskLevel;
  finalUrl?: string;
}

export interface RedirectHop {
  from: string;
  to: string;
  status: number;
  location: string;
}

export interface HeaderBag {
  [key: string]: string;
}

export interface FetchProfileArtifact {
  initialUrl: string;
  finalUrl: string;
  finalStatus: number;
  redirects: RedirectHop[];
  headers: HeaderBag;
  contentType: string;
  securityHeaders: {
    contentSecurityPolicy?: string;
    strictTransportSecurity?: string;
    xFrameOptions?: string;
    xContentTypeOptions?: string;
    referrerPolicy?: string;
    permissionsPolicy?: string;
    crossOriginOpenerPolicy?: string;
    crossOriginEmbedderPolicy?: string;
    crossOriginResourcePolicy?: string;
  };
  robotsTxt?: {
    url: string;
    status: number;
    length: number;
    preview: string;
  };
}

export interface DomScriptRecord {
  src: string | null;
  type: string | null;
  integrity: string | null;
  crossOrigin: string | null;
  async: boolean;
  defer: boolean;
  module: boolean;
  nonce: string | null;
  inlineLength: number;
  thirdParty: boolean;
}

export interface DomLinkRecord {
  href: string | null;
  rel: string;
  as: string | null;
  integrity: string | null;
  crossOrigin: string | null;
  thirdParty: boolean;
}

export interface ConsoleRecord {
  type: string;
  text: string;
  location?: {
    url?: string;
    lineNumber?: number;
    columnNumber?: number;
  };
  timestamp: string;
}

export interface CdpNetworkEventRecord {
  requestId: string;
  url: string;
  method: string;
  type?: string;
  wallTime?: number;
  initiatorType?: string;
  initiatorUrl?: string;
  documentURL?: string;
  hasUserGesture?: boolean;
}

export interface RequestRecord {
  url: string;
  method: string;
  resourceType: string;
  isNavigationRequest: boolean;
  frameUrl?: string;
  fromServiceWorker: boolean;
  redirectedFrom?: string;
  requestHeaders?: HeaderBag;
  responseHeaders?: HeaderBag;
  status?: number;
  failure?: string;
  contentType?: string;
  requestSize?: {
    body: number;
    headers: number;
  };
  responseSize?: {
    body: number;
    headers: number;
  };
  timing?: {
    startTime: number;
    domainLookupStart: number;
    domainLookupEnd: number;
    connectStart: number;
    secureConnectionStart: number;
    connectEnd: number;
    requestStart: number;
    responseStart: number;
    responseEnd: number;
  };
  initiatorType?: string;
  initiatorUrl?: string;
  startedAt: string;
  finishedAt?: string;
}

export interface PageSnapshot {
  finalUrl: string;
  title: string;
  htmlArtifact: string;
  screenshotArtifact?: string;
  traceArtifact?: string;
  harArtifact?: string;
  metaCsp?: string;
  scripts: DomScriptRecord[];
  links: DomLinkRecord[];
  inlineScriptCount: number;
  serviceWorkerRegistrations: number;
  frameUrls: string[];
  cookies: Array<{
    name: string;
    domain: string;
    path: string;
    expires: number;
    httpOnly: boolean;
    secure: boolean;
    sameSite: string;
  }>;
  console: ConsoleRecord[];
}

export interface PlaywrightCaptureArtifact {
  page: PageSnapshot;
  requestsArtifact: string;
  cdpArtifact: string;
  requestCount: number;
  thirdPartyRequestCount: number;
  thirdPartyScriptCount: number;
  hosts: string[];
}

export interface PackageCorrelation {
  assetUrl: string;
  host: string;
  type: string;
  likelyPackage: string;
  version?: string;
  confidence: number;
  reason: string;
  issue?: string;
  thirdParty: boolean;
}

export interface CdnCorrelationArtifact {
  assets: PackageCorrelation[];
}

export interface MarkerFinding {
  id: string;
  title: string;
  category: string;
  severity: Severity;
  confidence: number;
  evidence: string[];
  intent: string;
}

export interface MarkerArtifact {
  markers: MarkerFinding[];
}

export interface LighthouseIssue {
  id: string;
  title: string;
  scoreDisplayMode: string;
  score: number | null;
  description?: string;
}

export interface LighthouseArtifact {
  finalDisplayedUrl: string;
  fetchTime: string;
  userAgent: string;
  runtimeError?: {
    code: string;
    message: string;
  };
  runWarnings: string[];
  categories: Record<string, number>;
  issues: LighthouseIssue[];
  jsonArtifact: string;
  htmlArtifact: string;
}

export interface IntentScoreArtifact {
  score: number;
  risk: RiskLevel;
  summary: string[];
}
