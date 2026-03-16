import type {
  CdnCorrelationArtifact,
  PackageCorrelation,
  PlaywrightCaptureArtifact,
  RequestRecord,
} from '../types.js';

function parseThirdParty(assetUrl: string, pageUrl: string): boolean {
  try {
    return new URL(assetUrl).hostname !== new URL(pageUrl).hostname;
  } catch {
    return false;
  }
}

function extractPkgFromUrl(assetUrl: string): Omit<PackageCorrelation, 'assetUrl' | 'type' | 'thirdParty' | 'host'> | null {
  const url = new URL(assetUrl);
  const host = url.hostname;
  const pathname = url.pathname;

  if (host === 'cdn.jsdelivr.net') {
    const match = pathname.match(/^\/npm\/(\@?[^@/]+(?:\/[^@/]+)?)@([^/]+)/);
    if (match) {
      return {
        likelyPackage: match[1],
        version: match[2],
        confidence: 0.95,
        reason: 'Matched jsDelivr npm URL shape',
        issue: undefined,
      };
    }
  }

  if (host === 'unpkg.com') {
    const match = pathname.match(/^\/(\@?[^@/]+(?:\/[^@/]+)?)@([^/]+)/);
    if (match) {
      return {
        likelyPackage: match[1],
        version: match[2],
        confidence: 0.95,
        reason: 'Matched unpkg URL shape',
        issue: undefined,
      };
    }
  }

  if (host === 'cdnjs.cloudflare.com') {
    const match = pathname.match(/^\/ajax\/libs\/([^/]+)\/([^/]+)/);
    if (match) {
      return {
        likelyPackage: match[1],
        version: match[2],
        confidence: 0.94,
        reason: 'Matched cdnjs URL shape',
        issue: undefined,
      };
    }
  }

  if (host.includes('polyfill') || pathname.includes('polyfill')) {
    return {
      likelyPackage: 'polyfill-service',
      confidence: 0.9,
      reason: 'Polyfill delivery URL pattern',
      issue: 'Remote browser-targeted polyfill delivery can conceal different code paths by client characteristics.',
    };
  }

  if (host.includes('googletagmanager.com')) {
    return {
      likelyPackage: 'google-tag-manager',
      confidence: 0.98,
      reason: 'Known Google Tag Manager host',
      issue: 'Remote tag-manager execution weakens first-party provenance for downstream scripts.',
    };
  }

  if (host.includes('google-analytics.com') || pathname.includes('/gtag/js')) {
    return {
      likelyPackage: 'google-analytics / gtag',
      confidence: 0.98,
      reason: 'Known Google Analytics delivery pattern',
      issue: undefined,
    };
  }

  if (host.includes('hotjar.com')) {
    return {
      likelyPackage: 'hotjar',
      confidence: 0.98,
      reason: 'Known Hotjar delivery host',
      issue: undefined,
    };
  }

  if (host.includes('segment.com')) {
    return {
      likelyPackage: 'segment-analytics',
      confidence: 0.98,
      reason: 'Known Segment delivery host',
      issue: undefined,
    };
  }

  if (host.includes('facebook.net')) {
    return {
      likelyPackage: 'meta-pixel / facebook-sdk',
      confidence: 0.95,
      reason: 'Known Meta delivery host',
      issue: undefined,
    };
  }

  if (host.includes('stripe.com')) {
    return {
      likelyPackage: 'stripe-js',
      confidence: 0.95,
      reason: 'Known Stripe asset host',
      issue: undefined,
    };
  }

  if (/\.(min\.)?js($|\?)/.test(pathname)) {
    return {
      likelyPackage: 'manual-cdn-runtime-bundle',
      confidence: 0.55,
      reason: 'Third-party script file without package-identifying path',
      issue: 'Opaque runtime bundle served from CDN without a clear package identity.',
    };
  }

  return null;
}

export function runCdnCorrelation(
  capture: PlaywrightCaptureArtifact,
  requests: RequestRecord[],
): CdnCorrelationArtifact {
  const urls = new Set<string>();
  for (const request of requests) {
    if (request.resourceType === 'script' || request.resourceType === 'stylesheet') {
      urls.add(request.url);
    }
  }

  for (const script of capture.page.scripts) {
    if (script.src) urls.add(script.src);
  }

  const assets: PackageCorrelation[] = [];
  for (const assetUrl of urls) {
    const matched = extractPkgFromUrl(assetUrl);
    if (!matched) continue;

    const host = new URL(assetUrl).hostname;
    const type = requests.find((request) => request.url === assetUrl)?.resourceType || 'script';
    const thirdParty = parseThirdParty(assetUrl, capture.page.finalUrl);
    if (matched.likelyPackage === 'manual-cdn-runtime-bundle' && !thirdParty) {
      continue;
    }

    const issue =
      matched.issue ||
      (matched.version ? undefined : thirdParty ? 'Third-party asset is not version-pinned in its URL path.' : undefined);

    assets.push({
      assetUrl,
      host,
      type,
      thirdParty,
      likelyPackage: matched.likelyPackage,
      version: matched.version,
      confidence: matched.confidence,
      reason: matched.reason,
      issue,
    });
  }

  assets.sort((a, b) => b.confidence - a.confidence || a.assetUrl.localeCompare(b.assetUrl));
  return { assets };
}
