import { chromium, type Request, type Response } from 'playwright';
import { config } from '../config.js';
import type {
  CdpNetworkEventRecord,
  ConsoleRecord,
  DomLinkRecord,
  DomScriptRecord,
  PlaywrightCaptureArtifact,
  RequestRecord,
  SandboxConfig,
} from '../types.js';
import type { RunStore } from '../store/run-store.js';

function isThirdPartyUrl(assetUrl: string, pageUrl: string): boolean {
  try {
    const asset = new URL(assetUrl);
    const page = new URL(pageUrl);
    return asset.hostname !== page.hostname;
  } catch {
    return false;
  }
}

function getFrameUrlSafe(request: Request): string | undefined {
  try {
    return request.frame().url();
  } catch {
    return undefined;
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

async function collectDomInventory(pageUrl: string, page: import('playwright').Page): Promise<{
  scripts: DomScriptRecord[];
  links: DomLinkRecord[];
  inlineScriptCount: number;
  metaCsp?: string;
  serviceWorkerRegistrations: number;
  frameUrls: string[];
}> {
  return page.evaluate((finalUrl: string) => {
    const pageOrigin = new URL(finalUrl).hostname;

    const scripts = Array.from(document.querySelectorAll('script')).map((node) => {
      const src = node.getAttribute('src');
      const absoluteSrc = src ? new URL(src, document.baseURI).toString() : null;
      const host = absoluteSrc ? new URL(absoluteSrc).hostname : null;
      const isThirdParty = host ? host !== pageOrigin : false;
      return {
        src: absoluteSrc,
        type: node.getAttribute('type'),
        integrity: node.getAttribute('integrity'),
        crossOrigin: node.getAttribute('crossorigin'),
        async: node.async,
        defer: node.defer,
        module: (node.getAttribute('type') || '').toLowerCase() === 'module',
        nonce: node.getAttribute('nonce'),
        inlineLength: src ? 0 : (node.textContent || '').length,
        thirdParty: isThirdParty,
      };
    });

    const links = Array.from(document.querySelectorAll('link')).map((node) => {
      const href = node.getAttribute('href');
      const absoluteHref = href ? new URL(href, document.baseURI).toString() : null;
      const host = absoluteHref ? new URL(absoluteHref).hostname : null;
      const isThirdParty = host ? host !== pageOrigin : false;
      return {
        href: absoluteHref,
        rel: node.getAttribute('rel') || '',
        as: node.getAttribute('as'),
        integrity: node.getAttribute('integrity'),
        crossOrigin: node.getAttribute('crossorigin'),
        thirdParty: isThirdParty,
      };
    });

    const metaCsp = document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute('content') || undefined;
    const inlineScriptCount = scripts.filter((item) => item.src === null).length;
    const frameUrls = Array.from(window.frames)
      .map((frame) => {
        try {
          return frame.location.href;
        } catch {
          return null;
        }
      })
      .filter((item): item is string => Boolean(item));

    return Promise.resolve(navigator.serviceWorker ? navigator.serviceWorker.getRegistrations().then((regs) => ({
      scripts,
      links,
      inlineScriptCount,
      metaCsp,
      serviceWorkerRegistrations: regs.length,
      frameUrls,
    })).catch(() => ({
      scripts,
      links,
      inlineScriptCount,
      metaCsp,
      serviceWorkerRegistrations: 0,
      frameUrls,
    })) : ({
      scripts,
      links,
      inlineScriptCount,
      metaCsp,
      serviceWorkerRegistrations: 0,
      frameUrls,
    }));
  }, pageUrl);
}

export async function runPlaywrightCapture(
  runId: string,
  runStore: RunStore,
  targetUrl: string,
  sandbox: SandboxConfig,
): Promise<PlaywrightCaptureArtifact> {
  const browser = await chromium.launch({
    headless: sandbox.headless,
  });

  const harPath = sandbox.devtoolsTrace ? runStore.artifactPath(runId, 'session.har') : undefined;
  const tracePath = sandbox.devtoolsTrace ? runStore.artifactPath(runId, 'trace.zip') : undefined;
  const screenshotPath = sandbox.screenshot ? runStore.artifactPath(runId, 'screenshot.png') : undefined;

  const context = await browser.newContext({
    ignoreHTTPSErrors: config.ignoreHttpsErrors,
    userAgent: config.userAgent,
    recordHar: harPath ? { path: harPath } : undefined,
  });

  if (sandbox.devtoolsTrace && tracePath) {
    await context.tracing.start({ screenshots: true, snapshots: true });
  }

  const page = await context.newPage();
  page.setDefaultNavigationTimeout(sandbox.timeoutMs);
  page.setDefaultTimeout(sandbox.timeoutMs);

  const requestRecords = new Map<Request, RequestRecord>();
  const consoleRecords: ConsoleRecord[] = [];
  const cdpNetworkEvents: CdpNetworkEventRecord[] = [];
  const cdpPending = new Map<string, CdpNetworkEventRecord[]>();

  page.on('console', (message) => {
    const location = message.location();
    consoleRecords.push({
      type: message.type(),
      text: message.text(),
      timestamp: nowIso(),
      location: {
        url: location.url || undefined,
        lineNumber: location.lineNumber || undefined,
        columnNumber: location.columnNumber || undefined,
      },
    });
  });

  page.on('request', async (request) => {
    const key = `${request.method()} ${request.url()}`;
    const candidates = cdpPending.get(key);
    const matched = candidates?.shift();

    if (candidates && candidates.length === 0) {
      cdpPending.delete(key);
    }

    let requestHeaders: Record<string, string> | undefined;
    if (sandbox.captureHeaders) {
      requestHeaders = await request.allHeaders();
    }

    requestRecords.set(request, {
      url: request.url(),
      method: request.method(),
      resourceType: request.resourceType(),
      isNavigationRequest: request.isNavigationRequest(),
      frameUrl: getFrameUrlSafe(request),
      fromServiceWorker: Boolean(request.serviceWorker()),
      redirectedFrom: request.redirectedFrom()?.url(),
      requestHeaders,
      initiatorType: matched?.initiatorType,
      initiatorUrl: matched?.initiatorUrl,
      startedAt: nowIso(),
    });
  });

  page.on('response', async (response: Response) => {
    const request = response.request();
    const existing = requestRecords.get(request);
    if (!existing) return;

    let responseHeaders: Record<string, string> | undefined;
    if (sandbox.captureHeaders) {
      responseHeaders = await response.allHeaders();
    }

    requestRecords.set(request, {
      ...existing,
      status: response.status(),
      responseHeaders,
      contentType: response.headers()['content-type'],
    });
  });

  page.on('requestfinished', async (request) => {
    const existing = requestRecords.get(request);
    if (!existing) return;

    const sizes = await request.sizes().catch(() => undefined);
    const timing = request.timing();

    requestRecords.set(request, {
      ...existing,
      finishedAt: nowIso(),
      requestSize: sizes
        ? {
            body: sizes.requestBodySize,
            headers: sizes.requestHeadersSize,
          }
        : undefined,
      responseSize: sizes
        ? {
            body: sizes.responseBodySize,
            headers: sizes.responseHeadersSize,
          }
        : undefined,
      timing: {
        startTime: timing.startTime,
        domainLookupStart: timing.domainLookupStart,
        domainLookupEnd: timing.domainLookupEnd,
        connectStart: timing.connectStart,
        secureConnectionStart: timing.secureConnectionStart,
        connectEnd: timing.connectEnd,
        requestStart: timing.requestStart,
        responseStart: timing.responseStart,
        responseEnd: timing.responseEnd,
      },
    });
  });

  page.on('requestfailed', async (request) => {
    const existing = requestRecords.get(request);
    if (!existing) return;
    requestRecords.set(request, {
      ...existing,
      finishedAt: nowIso(),
      failure: request.failure()?.errorText,
    });
  });

  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  cdp.on('Network.requestWillBeSent', (event: Record<string, unknown>) => {
    const requestBlock = (event.request as Record<string, unknown> | undefined) || {};
    const initiator = (event.initiator as Record<string, unknown> | undefined) || {};
    const stack = (initiator.stack as Record<string, unknown> | undefined) || {};
    const frames = (stack.callFrames as Array<Record<string, unknown>> | undefined) || [];

    const url = String(requestBlock.url || '');
    const method = String(requestBlock.method || 'GET');
    const initiatorUrl =
      (frames[0]?.url as string | undefined) ||
      (initiator.url as string | undefined) ||
      (event.documentURL as string | undefined);

    const normalized: CdpNetworkEventRecord = {
      requestId: String(event.requestId || ''),
      url,
      method,
      type: event.type ? String(event.type) : undefined,
      wallTime: typeof event.wallTime === 'number' ? event.wallTime : undefined,
      initiatorType: initiator.type ? String(initiator.type) : undefined,
      initiatorUrl,
      documentURL: event.documentURL ? String(event.documentURL) : undefined,
      hasUserGesture: Boolean(event.hasUserGesture),
    };

    cdpNetworkEvents.push(normalized);
    const key = `${method} ${url}`;
    const current = cdpPending.get(key) || [];
    current.push(normalized);
    cdpPending.set(key, current);
  });

  let gotoError: Error | undefined;
  try {
    await page.goto(targetUrl, {
      waitUntil: sandbox.waitUntil,
      timeout: sandbox.timeoutMs,
    });
    await page.waitForLoadState('load', { timeout: sandbox.timeoutMs }).catch(() => undefined);
    await page.waitForTimeout(1000);
  } catch (error) {
    gotoError = error as Error;
  }

  const finalUrl = page.url();
  const title = await page.title().catch(() => '');
  const html = await page.content().catch(() => '');
  await runStore.writeTextArtifact(runId, 'page.html', html);

  if (sandbox.screenshot && screenshotPath) {
    await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => undefined);
    await runStore.updateRun(runId, (current) => ({
      ...current,
      artifacts: {
        ...current.artifacts,
        'screenshot.png': 'screenshot.png',
      },
    }));
  }

  const domInventory = await collectDomInventory(finalUrl, page).catch(() => ({
    scripts: [],
    links: [],
    inlineScriptCount: 0,
    metaCsp: undefined,
    serviceWorkerRegistrations: 0,
    frameUrls: [],
  }));

  const cookies = await context.cookies().catch(() => []);
  const requestList = Array.from(requestRecords.values());
  const thirdPartyRequests = requestList.filter((item) => isThirdPartyUrl(item.url, finalUrl));
  const thirdPartyScriptCount = requestList.filter(
    (item) => item.resourceType === 'script' && isThirdPartyUrl(item.url, finalUrl),
  ).length;

  await runStore.writeArtifact(runId, 'requests.json', requestList);
  await runStore.writeArtifact(runId, 'cdp-network.json', cdpNetworkEvents);

  if (sandbox.devtoolsTrace && tracePath) {
    await context.tracing.stop({ path: tracePath }).catch(() => undefined);
    await runStore.updateRun(runId, (current) => ({
      ...current,
      artifacts: {
        ...current.artifacts,
        'trace.zip': 'trace.zip',
      },
    }));
  }

  await context.close();

  if (sandbox.devtoolsTrace && harPath) {
    await runStore.updateRun(runId, (current) => ({
      ...current,
      artifacts: {
        ...current.artifacts,
        'session.har': 'session.har',
      },
    }));
  }

  await browser.close();

  if (gotoError && requestList.length === 0) {
    throw gotoError;
  }

  return {
    page: {
      finalUrl,
      title,
      htmlArtifact: 'page.html',
      screenshotArtifact: sandbox.screenshot ? 'screenshot.png' : undefined,
      traceArtifact: sandbox.devtoolsTrace ? 'trace.zip' : undefined,
      harArtifact: sandbox.devtoolsTrace ? 'session.har' : undefined,
      metaCsp: domInventory.metaCsp,
      scripts: domInventory.scripts,
      links: domInventory.links,
      inlineScriptCount: domInventory.inlineScriptCount,
      serviceWorkerRegistrations: domInventory.serviceWorkerRegistrations,
      frameUrls: domInventory.frameUrls,
      cookies: cookies.map((cookie) => ({
        name: cookie.name,
        domain: cookie.domain,
        path: cookie.path,
        expires: cookie.expires,
        httpOnly: cookie.httpOnly,
        secure: cookie.secure,
        sameSite: cookie.sameSite,
      })),
      console: consoleRecords,
    },
    requestsArtifact: 'requests.json',
    cdpArtifact: 'cdp-network.json',
    requestCount: requestList.length,
    thirdPartyRequestCount: thirdPartyRequests.length,
    thirdPartyScriptCount,
    hosts: Array.from(new Set(requestList.map((item) => new URL(item.url).hostname))).sort(),
  };
}
