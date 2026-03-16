import type {
  CdnCorrelationArtifact,
  FetchProfileArtifact,
  LighthouseArtifact,
  MarkerArtifact,
  MarkerFinding,
  PlaywrightCaptureArtifact,
  RequestRecord,
} from '../types.js';

function countThirdPartyScripts(capture: PlaywrightCaptureArtifact): number {
  return capture.page.scripts.filter((item) => item.src && item.thirdParty).length;
}

function hasAnalyticsHost(url: string): boolean {
  const host = new URL(url).hostname;
  return [
    'google-analytics.com',
    'googletagmanager.com',
    'segment.com',
    'hotjar.com',
    'doubleclick.net',
    'facebook.net',
    'clarity.ms',
  ].some((needle) => host.includes(needle));
}

function push(markers: MarkerFinding[], marker: MarkerFinding | null): void {
  if (marker) markers.push(marker);
}

export function runMarkerDetector(input: {
  fetchProfile?: FetchProfileArtifact;
  capture: PlaywrightCaptureArtifact;
  requests: RequestRecord[];
  cdn?: CdnCorrelationArtifact;
  lighthouse?: LighthouseArtifact;
}): MarkerArtifact {
  const markers: MarkerFinding[] = [];
  const { capture, requests, fetchProfile, cdn, lighthouse } = input;
  const thirdPartyScriptCount = countThirdPartyScripts(capture);
  const analyticsRequests = requests.filter((request) => hasAnalyticsHost(request.url));

  const polyfillAsset = cdn?.assets.find((asset) => asset.likelyPackage === 'polyfill-service');
  push(
    markers,
    polyfillAsset
      ? {
          id: 'legacy-polyfill-delivery',
          title: 'Legacy polyfill delivery detected',
          category: 'supply-chain',
          severity: 'high',
          confidence: 0.84,
          evidence: [
            `Asset matched a polyfill-delivery pattern: ${polyfillAsset.assetUrl}`,
            'Polyfill services can serve different code paths based on browser traits.',
            'The asset executes before or during app bootstrap instead of being lockfile-controlled in the app bundle.',
          ],
          intent:
            'This can be harmless compatibility code, but it also creates a moving execution surface where different clients may receive different JavaScript.',
        }
      : null,
  );

  const tagManager = cdn?.assets.find((asset) => asset.likelyPackage === 'google-tag-manager');
  push(
    markers,
    tagManager && thirdPartyScriptCount >= 3
      ? {
          id: 'tag-manager-third-party-execution',
          title: 'Tag-manager-controlled third-party execution',
          category: 'execution-chain',
          severity: 'medium',
          confidence: 0.79,
          evidence: [
            `Tag manager asset loaded from ${tagManager.assetUrl}`,
            `${thirdPartyScriptCount} third-party scripts were present in DOM inventory or network capture.`,
            'Remote container configuration weakens direct attribution from first-party source to executed vendor code.',
          ],
          intent:
            'Usually marketing or analytics, but it makes provenance fuzzier and increases the chance that important behavior is controlled remotely.',
        }
      : null,
  );

  const unpinnedAssets = (cdn?.assets || []).filter((asset) => asset.thirdParty && !asset.version);
  push(
    markers,
    unpinnedAssets.length > 0
      ? {
          id: 'unpinned-third-party-assets',
          title: 'Unpinned third-party CDN assets',
          category: 'dependency',
          severity: 'medium',
          confidence: 0.74,
          evidence: [
            `${unpinnedAssets.length} third-party assets lacked an immutable version identifier in the URL.`,
            ...unpinnedAssets.slice(0, 2).map((asset) => asset.assetUrl),
          ],
          intent:
            'This usually means convenience loading rather than locked, reproducible delivery. That increases drift risk and makes incident review harder.',
        }
      : null,
  );

  const thirdPartyWithoutSri = capture.page.scripts.filter(
    (script) => script.src && script.thirdParty && !script.integrity,
  );
  push(
    markers,
    thirdPartyWithoutSri.length >= 2
      ? {
          id: 'missing-sri-third-party-scripts',
          title: 'Third-party scripts missing Subresource Integrity',
          category: 'supply-chain',
          severity: 'medium',
          confidence: 0.76,
          evidence: [
            `${thirdPartyWithoutSri.length} third-party script tags were found without an integrity attribute.`,
            ...thirdPartyWithoutSri.slice(0, 2).map((script) => script.src || 'inline'),
          ],
          intent:
            'Absent SRI does not prove anything malicious, but it removes one obvious tamper-detection layer for remote assets.',
        }
      : null,
  );

  push(
    markers,
    analyticsRequests.length >= 3
      ? {
          id: 'beacon-heavy-telemetry',
          title: 'Beacon-heavy telemetry on initial navigation',
          category: 'tracking',
          severity: 'low',
          confidence: 0.9,
          evidence: [
            `${analyticsRequests.length} analytics or marketing requests fired during the captured session.`,
            ...analyticsRequests.slice(0, 2).map((request) => request.url),
          ],
          intent:
            'Most likely standard telemetry, but it tells you the page begins collecting metadata immediately and has a non-trivial tracking posture.',
        }
      : null,
  );

  const csp = fetchProfile?.securityHeaders.contentSecurityPolicy || capture.page.metaCsp;
  push(
    markers,
    csp && /unsafe-inline|unsafe-eval|\*/i.test(csp)
      ? {
          id: 'broad-csp-script-surface',
          title: 'Broad script execution surface in CSP',
          category: 'browser-surface',
          severity: 'medium',
          confidence: 0.77,
          evidence: [
            'Content Security Policy contains permissive script controls.',
            csp.length > 220 ? `${csp.slice(0, 220)}…` : csp,
          ],
          intent:
            'A CSP with unsafe-inline, unsafe-eval, or very broad sources reduces the value of the policy as a script-execution boundary.',
        }
      : null,
  );

  push(
    markers,
    lighthouse?.runtimeError
      ? {
          id: 'lighthouse-runtime-error',
          title: 'Lighthouse reported a runtime error',
          category: 'runtime',
          severity: 'low',
          confidence: 0.68,
          evidence: [
            `${lighthouse.runtimeError.code}: ${lighthouse.runtimeError.message}`,
          ],
          intent:
            'This may simply reflect site complexity or blocking behavior, but it also means automated auditing hit something unstable.',
        }
      : null,
  );

  const lighthouseIssueTitles = new Set((lighthouse?.issues || []).map((item) => item.title));
  push(
    markers,
    lighthouseIssueTitles.has('Ensure CSP is effective against XSS attacks')
      ? {
          id: 'lighthouse-csp-warning',
          title: 'Lighthouse flagged weak CSP posture',
          category: 'browser-surface',
          severity: 'medium',
          confidence: 0.72,
          evidence: [
            'Lighthouse surfaced a CSP effectiveness warning.',
            'This corroborates the direct header inspection from the fetch and DOM capture stages.',
          ],
          intent:
            'Independent tooling also sees the script policy as weak, which makes the evidence chain stronger than a single heuristic.',
        }
      : null,
  );

  return { markers };
}
