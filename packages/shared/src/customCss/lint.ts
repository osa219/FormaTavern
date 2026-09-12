import * as csstree from 'css-tree';
import type { SurfaceScope } from '../hooks/manifest';
import { explainChatDrop } from './policy';
import { sanitizeCss, type SanitizeIssue } from './sanitizeCss';

export interface LintIssue {
  code: 'L1' | 'L2' | 'L3' | 'L4' | 'L5' | 'L6' | 'L7' | 'L8' | 'L9' | 'CHAT_NOTE';
  message: string;
  selector?: string;
  property?: string;
  atRule?: string;
}

export interface ChatRestrictionIssue {
  selector: string;
  property: string;
  message: string;
}

const LAYOUT_PROPERTIES = new Set([
  'width',
  'height',
  'top',
  'left',
  'right',
  'bottom',
  'margin',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'margin-inline',
  'margin-inline-start',
  'margin-inline-end',
  'margin-block',
  'margin-block-start',
  'margin-block-end',
  'padding',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'padding-inline',
  'padding-inline-start',
  'padding-inline-end',
  'padding-block',
  'padding-block-start',
  'padding-block-end',
  'filter',
  'backdrop-filter',
  'box-shadow'
]);

function isLayoutProperty(prop: string): boolean {
  const p = prop.toLowerCase();
  return (
    LAYOUT_PROPERTIES.has(p) ||
    p.startsWith('margin-') ||
    p.startsWith('padding-')
  );
}

export function lintSheet(raw: string, scope?: SurfaceScope): LintIssue[] {
  if (!raw || !raw.trim()) return [];

  let ast: csstree.CssNode;
  try {
    ast = csstree.parse(raw);
  } catch {
    return [];
  }

  const issues: LintIssue[] = [];

  // Track important declarations
  let importantCount = 0;

  // Track keyframes animating layout/paint or opacity/filter
  const keyframesAnimatingLayout = new Set<string>();
  const keyframesAnimatingFlashing = new Set<string>();

  // Track outline removals and focus replacements
  const outlineRemovedSelectors = new Set<string>();
  const focusSelectors = new Set<string>();

  // Track font-face families
  const fontFamilies = new Set<string>();

  // First pass: keyframes & font-face
  csstree.walk(ast, {
    visit: 'Atrule',
    enter(node) {
      const name = csstree.keyword(node.name).name.toLowerCase();

      if (name === 'keyframes' && node.block) {
        const kfName = node.prelude ? csstree.generate(node.prelude).trim() : 'anonymous';
        let animatesFlashing = false;

        csstree.walk(node.block, {
          visit: 'Declaration',
          enter(decl) {
            const prop = decl.property.toLowerCase();
            if (isLayoutProperty(prop)) {
              keyframesAnimatingLayout.add(kfName);
              issues.push({
                code: 'L1',
                message: 'prefer transform/opacity — compositor-only animation',
                property: decl.property,
                atRule: `@keyframes ${kfName}`
              });
            }
            if (prop === 'opacity' || prop === 'filter') {
              animatesFlashing = true;
            }
          }
        });

        if (animatesFlashing) {
          keyframesAnimatingFlashing.add(kfName);
        }
      }

      if (name === 'font-face' && node.block) {
        csstree.walk(node.block, {
          visit: 'Declaration',
          enter(decl) {
            if (decl.property.toLowerCase() === 'font-family') {
              const fam = csstree.generate(decl.value).trim().replace(/['"]/g, '');
              if (fontFamilies.has(fam)) {
                issues.push({
                  code: 'L9',
                  message: `author-facing note: duplicate @font-face family name "${fam}"`,
                  atRule: '@font-face',
                  property: 'font-family'
                });
              } else {
                fontFamilies.add(fam);
              }
            }
          }
        });
      }
    }
  });

  // Second pass: Rules and declarations
  let insideCoarseMedia = false;

  csstree.walk(ast, (node) => {
    if (node.type === 'Atrule' && node.name.toLowerCase() === 'media') {
      const query = node.prelude ? csstree.generate(node.prelude) : '';
      if (query.includes('pointer') && query.includes('coarse')) {
        insideCoarseMedia = true;
      }
    }

    if (node.type === 'Rule') {
      const selectorText = csstree.generate(node.prelude);

      // Track focus-visible selectors
      if (selectorText.includes(':focus-visible') || selectorText.includes(':focus')) {
        const baseSel = selectorText.replace(/:focus(?:-visible)?/g, '').trim();
        focusSelectors.add(baseSel);
      }

      let hasFixed = false;
      let hasInsetZero = false;
      let hasPointerEventsNone = false;

      csstree.walk(node.block, {
        visit: 'Declaration',
        enter(decl) {
          if (decl.important) {
            importantCount++;
          }

          const prop = decl.property.toLowerCase();
          const val = csstree.generate(decl.value).trim();

          // L2: transition on layout properties
          if (prop === 'transition' || prop === 'transition-property') {
            const valLower = val.toLowerCase();
            const transitionsAll = valLower === 'all' || /\ball\b/.test(valLower);
            const matchesLayout = [...LAYOUT_PROPERTIES].some((lp) =>
              new RegExp(`\\b${lp}\\b`, 'i').test(valLower)
            );
            if (transitionsAll || matchesLayout) {
              issues.push({
                code: 'L2',
                message: 'prefer transform/opacity — compositor-only transition',
                selector: selectorText,
                property: decl.property
              });
            }
          }

          // L3: outline removal
          if (prop === 'outline' || prop === 'outline-width') {
            if (val === 'none' || val === '0' || val === '0px') {
              outlineRemovedSelectors.add(selectorText);
            }
          }

          // L4: fixed position viewport cover
          if (prop === 'position' && val.toLowerCase() === 'fixed') {
            hasFixed = true;
          }
          if (prop === 'inset' && val === '0') {
            hasInsetZero = true;
          }
          if (prop === 'pointer-events' && val.toLowerCase() === 'none') {
            hasPointerEventsNone = true;
          }

          // L5: rapid animation photosensitivity check
          if (prop === 'animation' || prop === 'animation-duration') {
            const valLower = val.toLowerCase();
            // Check for duration < 0.5s (e.g. 0.1s, 0.2s, 0.3s, 0.4s, 100ms, 200ms, 300ms, 400ms)
            const durationMatch = /(\d+(?:\.\d+)?)(m?s)/.exec(valLower);
            let durationSeconds = 1;
            if (durationMatch) {
              const num = Number.parseFloat(durationMatch[1]);
              durationSeconds = durationMatch[2] === 'ms' ? num / 1000 : num;
            }

            const isInfiniteOrMany =
              valLower.includes('infinite') ||
              /\b([3-9]|\d{2,})\b/.test(valLower);

            if (durationSeconds < 0.5 && isInfiniteOrMany) {
              const referencesFlashing = [...keyframesAnimatingFlashing].some((k) =>
                valLower.includes(k.toLowerCase())
              );
              if (referencesFlashing || keyframesAnimatingFlashing.size > 0) {
                issues.push({
                  code: 'L5',
                  message:
                    'photosensitivity: rapid flashing animations can trigger seizures; increase duration >= 0.5s or reduce iterations',
                  selector: selectorText,
                  property: decl.property
                });
              }
            }
          }

          // L7: color transitions/animations on bubbles/turns
          const isBubbleOrTurn =
            selectorText.includes('ft-bubble') || selectorText.includes('ft-turn');
          if (isBubbleOrTurn) {
            if (prop === 'transition' || prop === 'transition-property' || prop === 'animation') {
              const valLower = val.toLowerCase();
              if (
                valLower.includes('color') ||
                valLower.includes('background') ||
                valLower.includes('border') ||
                valLower === 'all'
              ) {
                issues.push({
                  code: 'L7',
                  message:
                    'strobe risk with reactive bindings: avoid color transitions/animations on bubbles/turns',
                  selector: selectorText,
                  property: decl.property
                });
              }
            }
          }

          // L8: backdrop-filter or blur > 8px
          if (
            prop === 'backdrop-filter' ||
            (prop === 'filter' && val.includes('blur'))
          ) {
            if (!insideCoarseMedia) {
              const blurMatch = /blur\(\s*(\d+(?:\.\d+)?)\s*px\s*\)/i.exec(val);
              const blurPx = blurMatch ? Number.parseFloat(blurMatch[1]) : 10;
              if (blurPx > 8 || prop === 'backdrop-filter') {
                issues.push({
                  code: 'L8',
                  message:
                    'mobile GPU cost: blur effects on large areas are expensive on mobile devices',
                  selector: selectorText,
                  property: decl.property
                });
              }
            }
          }
        }
      });

      // Check L4 after rule declarations: fixed + viewport-covering without pointer-events: none
      if (scope !== 'chat' && hasFixed && hasInsetZero && !hasPointerEventsNone) {
        issues.push({
          code: 'L4',
          message:
            'decor layers should not intercept clicks: add pointer-events: none to viewport-covering fixed elements',
          selector: selectorText
        });
      }
    }
  });

  // Check L3 after pass: outline removed without :focus-visible
  outlineRemovedSelectors.forEach((sel) => {
    const cleanSel = sel.trim();
    if (!focusSelectors.has(cleanSel) && !focusSelectors.has(cleanSel.replace(/:focus-visible/g, ''))) {
      issues.push({
        code: 'L3',
        message: 'focus visibility: provide a :focus-visible replacement when removing outline',
        selector: sel,
        property: 'outline'
      });
    }
  });

  // L6: !important count > 20
  if (importantCount > 20) {
    issues.push({
      code: 'L6',
      message: 'hooks should make !important rare — report a gap if you need it'
    });
  }

  // Chat profile restrictions (when scope is chat)
  if (scope === 'chat') {
    const chatDrops = lintChatRestrictions(raw);
    for (const drop of chatDrops) {
      issues.push({
        code: 'CHAT_NOTE',
        message: drop.message,
        selector: drop.selector,
        property: drop.property
      });
    }
  }

  return issues;
}

export function lintChatRestrictions(raw: string): ChatRestrictionIssue[] {
  if (!raw || !raw.trim()) return [];
  const out = sanitizeCss(raw, 'chat');
  const drops = out.report.filter(
    (r): r is Extract<SanitizeIssue, { kind: 'dropped-declaration' }> =>
      r.kind === 'dropped-declaration' && r.reason === 'blocked-property-scope'
  );
  return drops.map((d) => ({
    selector: d.selector,
    property: d.property,
    message: explainChatDrop(d.property, d.selector)
  }));
}

