import * as csstree from 'css-tree';
import type { SurfaceScope } from '../hooks/manifest';
import {
  isAllowedAtRule,
  isAllowedFontFaceDescriptor,
  isAllowedDeclarationUrl,
  isAllowedFontUrl,
  hasBlockedValuePattern,
  CHAT_SELECTOR_SCOPED_BLOCKS
} from './policy';

export type SanitizeIssue =
  | { kind: 'parse-fatal'; detail: string }
  | { kind: 'dropped-rule'; selector: string; reason: 'cross-surface' | 'escape-selector' | 'empty-after-policy' }
  | { kind: 'dropped-declaration'; selector: string; property: string; reason: 'blocked-property-scope' | 'blocked-value' | 'url-policy' }
  | { kind: 'dropped-at-rule'; atRule: string; reason: 'blocked' | 'url-policy' }
  | { kind: 'renamed-keyframes'; from: string; to: string }
  | { kind: 'note'; detail: string };

const STANDARD_ANIMATION_KEYWORDS = new Set([
  'linear',
  'ease',
  'ease-in',
  'ease-out',
  'ease-in-out',
  'step-start',
  'step-end',
  'steps',
  'cubic-bezier',
  'infinite',
  'normal',
  'reverse',
  'alternate',
  'alternate-reverse',
  'none',
  'forwards',
  'backwards',
  'both',
  'running',
  'paused',
  'initial',
  'inherit',
  'unset',
  'revert',
  'revert-layer'
]);

function getUrlString(urlNode: any): string {
  if (typeof urlNode.value === 'string') return urlNode.value;
  if (urlNode.value && typeof urlNode.value.value === 'string') return urlNode.value.value;
  return '';
}

export function sanitizeCss(
  raw: string,
  scope: SurfaceScope
): { css: string; report: SanitizeIssue[] } {
  if (!raw || !raw.trim()) {
    return { css: '', report: [] };
  }

  const report: SanitizeIssue[] = [];
  const parseErrors: Array<{ message: string }> = [];
  let ast: csstree.CssNode;

  try {
    ast = csstree.parse(raw, {
      onParseError: (err) => {
        parseErrors.push(err);
      }
    });
  } catch (err: any) {
    return {
      css: '',
      report: [{ kind: 'parse-fatal', detail: err?.message || 'Parse fatal error' }]
    };
  }

  if (parseErrors.length > 0) {
    return {
      css: '',
      report: [{ kind: 'parse-fatal', detail: parseErrors[0].message }]
    };
  }

  // 1. At-Rules Pass
  csstree.walk(ast, {
    visit: 'Atrule',
    enter(node, item, list) {
      const name = csstree.keyword(node.name).name.toLowerCase();
      if (!isAllowedAtRule(name)) {
        report.push({ kind: 'dropped-at-rule', atRule: '@' + node.name, reason: 'blocked' });
        if (list && item) list.remove(item);
        return;
      }

      if (name === 'font-face') {
        if (!node.block) {
          report.push({ kind: 'dropped-at-rule', atRule: '@font-face', reason: 'blocked' });
          if (list && item) list.remove(item);
          return;
        }

        // Check if src contains non-allowed URL
        let fontFaceDropped = false;
        csstree.walk(node.block, {
          visit: 'Declaration',
          enter(decl) {
            if (decl.property.toLowerCase() === 'src') {
              csstree.walk(decl.value, {
                visit: 'Url',
                enter(urlNode) {
                  const urlStr = getUrlString(urlNode);
                  if (!isAllowedFontUrl(urlStr)) {
                    fontFaceDropped = true;
                  }
                }
              });
            }
          }
        });

        if (fontFaceDropped) {
          report.push({ kind: 'dropped-at-rule', atRule: '@font-face', reason: 'url-policy' });
          if (list && item) list.remove(item);
          return;
        }

        // Check font-face declarations
        csstree.walk(node.block, {
          visit: 'Declaration',
          enter(decl, declItem, declList) {
            const prop = decl.property.toLowerCase();
            if (!isAllowedFontFaceDescriptor(prop)) {
              report.push({
                kind: 'dropped-declaration',
                selector: '@font-face',
                property: decl.property,
                reason: 'blocked-property-scope'
              });
              if (declList && declItem) declList.remove(declItem);
              return;
            }

            const valStr = csstree.generate(decl.value);
            if (hasBlockedValuePattern(valStr, decl.property)) {
              report.push({
                kind: 'dropped-declaration',
                selector: '@font-face',
                property: decl.property,
                reason: 'blocked-value'
              });
              if (declList && declItem) declList.remove(declItem);
            }
          }
        });
      }
    }
  });

  // 2. Keyframes Discovery & Renaming
  let keyframeOrder = 0;
  const keyframeRenames = new Map<string, string>();
  const encounteredKeyframes = new Set<string>();
  const alreadyRenamedPattern = new RegExp(`^ftkf-${scope}-\\d+-`);

  csstree.walk(ast, {
    visit: 'Atrule',
    enter(node) {
      if (csstree.keyword(node.name).name.toLowerCase() === 'keyframes') {
        if (!node.prelude) return;
        let origName = csstree.generate(node.prelude).trim();
        if (
          (origName.startsWith('"') && origName.endsWith('"')) ||
          (origName.startsWith("'") && origName.endsWith("'"))
        ) {
          origName = origName.slice(1, -1);
        }

        if (alreadyRenamedPattern.test(origName)) {
          keyframeRenames.set(origName, origName);
          return;
        }

        keyframeOrder++;
        const newName = `ftkf-${scope}-${keyframeOrder}-${origName}`;
        report.push({ kind: 'renamed-keyframes', from: origName, to: newName });

        if (encounteredKeyframes.has(origName)) {
          report.push({
            kind: 'note',
            detail: `Duplicate @keyframes "${origName}" renamed distinctly to "${newName}"`
          });
        } else {
          encounteredKeyframes.add(origName);
          keyframeRenames.set(origName, newName);
        }

        csstree.walk(node.prelude, (child) => {
          if (child.type === 'Identifier') {
            child.name = newName;
          } else if (child.type === 'String') {
            child.value = newName;
          }
        });
      }
    }
  });

  // 3. Animation reference rewrites
  csstree.walk(ast, {
    visit: 'Declaration',
    enter(node) {
      const prop = node.property.toLowerCase();
      if (prop === 'animation-name' || prop === 'animation') {
        csstree.walk(node.value, (child) => {
          if (child.type === 'Identifier') {
            const name = child.name;
            if (STANDARD_ANIMATION_KEYWORDS.has(name.toLowerCase())) return;
            if (alreadyRenamedPattern.test(name)) return;
            if (keyframeRenames.has(name)) {
              child.name = keyframeRenames.get(name)!;
            } else {
              report.push({
                kind: 'note',
                detail: `Unresolvable animation name "${name}" passed through unrenamed`
              });
            }
          }
        });
      }
    }
  });

  // 4. Selector Policy & Prefixing (Rules outside @keyframes)
  const surfaceAttrRegex = /\[\s*data-ft-surface\s*=\s*(?:["']?)([^"'\s\]]+)(?:["']?)\s*\]/i;
  const currentSurfaceRegex = new RegExp(`\\[\\s*data-ft-surface\\s*=\\s*["']?${scope}["']?\\s*\\]`, 'i');

  csstree.walk(ast, {
    visit: 'Rule',
    enter(ruleNode, item, list) {
      // If rule is inside @keyframes (e.g. from / to / 50%), skip selector prefixing
      let isKeyframeBlock = false;
      csstree.walk(ruleNode.prelude, (child) => {
        if (
          child.type === 'Percentage' ||
          (child.type === 'Identifier' && (child.name === 'from' || child.name === 'to'))
        ) {
          isKeyframeBlock = true;
        }
      });
      if (isKeyframeBlock || ruleNode.prelude.type !== 'SelectorList') {
        return;
      }

      const originalRuleSelector = csstree.generate(ruleNode.prelude);
      const validSelectors: csstree.CssNode[] = [];

      ruleNode.prelude.children.forEach((selectorNode: csstree.CssNode) => {
        const rawSel = csstree.generate(selectorNode).trim();

        // Check 1: Cross-surface
        const surfMatch = surfaceAttrRegex.exec(rawSel);
        if (surfMatch && surfMatch[1].toLowerCase() !== scope) {
          report.push({ kind: 'dropped-rule', selector: rawSel, reason: 'cross-surface' });
          return;
        }

        // Check 2: Escape-selector (html, body, :root)
        let hasEscape = false;
        csstree.walk(selectorNode, (sNode) => {
          if (
            sNode.type === 'TypeSelector' &&
            (sNode.name.toLowerCase() === 'html' || sNode.name.toLowerCase() === 'body')
          ) {
            hasEscape = true;
          }
          if (sNode.type === 'PseudoClassSelector' && sNode.name.toLowerCase() === 'root') {
            hasEscape = true;
          }
        });

        if (hasEscape) {
          report.push({ kind: 'dropped-rule', selector: rawSel, reason: 'escape-selector' });
          return;
        }

        // Check 3: Already scoped to current surface
        if (currentSurfaceRegex.test(rawSel)) {
          validSelectors.push(selectorNode);
          return;
        }

        // Check 4: Prefix with [data-ft-surface="<scope>"]
        try {
          const prefixed = csstree.parse(`[data-ft-surface="${scope}"] ${rawSel}`, {
            context: 'selector'
          });
          validSelectors.push(prefixed);
        } catch {
          report.push({ kind: 'dropped-rule', selector: rawSel, reason: 'escape-selector' });
        }
      });

      if (validSelectors.length === 0) {
        report.push({ kind: 'dropped-rule', selector: originalRuleSelector, reason: 'empty-after-policy' });
        if (list && item) list.remove(item);
      } else {
        ruleNode.prelude.children = new csstree.List<csstree.CssNode>().fromArray(validSelectors) as any;
      }
    }
  });

  // 5. Declaration Policy
  csstree.walk(ast, {
    visit: 'Rule',
    enter(ruleNode, ruleItem, ruleList) {
      let isKeyframeBlock = false;
      csstree.walk(ruleNode.prelude, (child) => {
        if (
          child.type === 'Percentage' ||
          (child.type === 'Identifier' && (child.name === 'from' || child.name === 'to'))
        ) {
          isKeyframeBlock = true;
        }
      });
      if (isKeyframeBlock) {
        return;
      }

      const selectorText = csstree.generate(ruleNode.prelude);

      csstree.walk(ruleNode.block, {
        visit: 'Declaration',
        enter(decl, declItem, declList) {
          const prop = decl.property.toLowerCase();
          const valStr = csstree.generate(decl.value);

          // 1. Global blocked values
          if (hasBlockedValuePattern(valStr, decl.property)) {
            report.push({
              kind: 'dropped-declaration',
              selector: selectorText,
              property: decl.property,
              reason: 'blocked-value'
            });
            if (declList && declItem) declList.remove(declItem);
            return;
          }

          // 2. URL policy in declaration values
          let hasForbiddenUrl = false;
          csstree.walk(decl.value, {
            visit: 'Url',
            enter(urlNode) {
              const u = getUrlString(urlNode);
              if (!isAllowedDeclarationUrl(u)) {
                hasForbiddenUrl = true;
              }
            }
          });

          if (hasForbiddenUrl) {
            report.push({
              kind: 'dropped-declaration',
              selector: selectorText,
              property: decl.property,
              reason: 'url-policy'
            });
            if (declList && declItem) declList.remove(declItem);
            return;
          }

          // 3. Scope-specific checks (chat-conservative)
          if (scope === 'chat') {
            const trimmedVal = valStr.trim().toLowerCase();

            // position: fixed or sticky
            if (
              prop === 'position' &&
              (trimmedVal === 'fixed' || trimmedVal === 'sticky' || /\b(fixed|sticky)\b/.test(trimmedVal))
            ) {
              report.push({
                kind: 'dropped-declaration',
                selector: selectorText,
                property: decl.property,
                reason: 'blocked-property-scope'
              });
              if (declList && declItem) declList.remove(declItem);
              return;
            }

            // z-index: integer <= 10 or auto
            if (prop === 'z-index') {
              let validZ = false;
              if (trimmedVal === 'auto') {
                validZ = true;
              } else if (/^-?\d+$/.test(trimmedVal)) {
                const z = Number.parseInt(trimmedVal, 10);
                if (z <= 10) validZ = true;
              }
              if (!validZ) {
                report.push({
                  kind: 'dropped-declaration',
                  selector: selectorText,
                  property: decl.property,
                  reason: 'blocked-property-scope'
                });
                if (declList && declItem) declList.remove(declItem);
                return;
              }
            }

            // scroll-behavior: blocked on any selector
            if (prop === 'scroll-behavior') {
              report.push({
                kind: 'dropped-declaration',
                selector: selectorText,
                property: decl.property,
                reason: 'blocked-property-scope'
              });
              if (declList && declItem) declList.remove(declItem);
              return;
            }

            // selector-scoped blocks
            const isScrollContainerSelector =
              selectorText.includes('ft-message-log') || selectorText.includes('ft-viewport');
            if (isScrollContainerSelector) {
              const blockedProps = CHAT_SELECTOR_SCOPED_BLOCKS.properties as readonly string[];
              if (
                blockedProps.includes(prop) ||
                prop.startsWith('scroll-margin') ||
                prop.startsWith('scroll-padding') ||
                prop.startsWith('overscroll-behavior')
              ) {
                report.push({
                  kind: 'dropped-declaration',
                  selector: selectorText,
                  property: decl.property,
                  reason: 'blocked-property-scope'
                });
                if (declList && declItem) declList.remove(declItem);
                return;
              }
            }
          }
        }
      });

      // Drop rule if block becomes empty
      if (ruleNode.block.children.isEmpty) {
        report.push({ kind: 'dropped-rule', selector: selectorText, reason: 'empty-after-policy' });
        if (ruleList && ruleItem) ruleList.remove(ruleItem);
      }
    }
  });

  // 6. Clean up empty at-rules (e.g. empty @media)
  csstree.walk(ast, {
    visit: 'Atrule',
    enter(atrule, item, list) {
      if (atrule.block && atrule.block.children.isEmpty) {
        if (list && item) list.remove(item);
      }
    }
  });

  // 7. Regeneration & Integrity Pass
  let generated = csstree.generate(ast);
  generated = generated.replace(/</g, '\\3c ');

  return {
    css: generated,
    report
  };
}
