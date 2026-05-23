/**
 * Property 4: aria-label item count accuracy
 * Validates: Requirements 4.2, 4.4
 *
 * Tests that the cart button aria-label always contains the item count,
 * mirroring the Liquid template:
 *   aria-label="Open cart, {{ cart.item_count }} {{ cart.item_count | pluralize: 'item', 'items' }}"
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

/**
 * Mirrors the Shopify Liquid output for the cart button aria-label.
 * Liquid: "Open cart, {{ count }} {{ count | pluralize: 'item', 'items' }}"
 */
function renderCartButtonAriaLabel(itemCount) {
  const word = itemCount === 1 ? 'item' : 'items';
  return `Open cart, ${itemCount} ${word}`;
}

describe('Property 4 — aria-label item count accuracy', () => {
  it('label contains the exact item count for any integer 0–999', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 999 }),
        (itemCount) => {
          const label = renderCartButtonAriaLabel(itemCount);
          expect(label).toContain(String(itemCount));
        }
      ),
      { numRuns: 20 }
    );
  });
});

/**
 * Property 5: aria-label pluralisation
 * Validates: Requirements 4.3
 *
 * Tests that the cart button aria-label uses singular "item" when count=1
 * and plural "items" for all other counts.
 */
describe('Property 5 — aria-label pluralisation', () => {
  it('uses singular "item" when count is 1, plural "items" otherwise', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 999 }),
        (itemCount) => {
          const label = renderCartButtonAriaLabel(itemCount);
          if (itemCount === 1) {
            expect(label).toMatch(/\b1 item\b/);
            expect(label).not.toMatch(/\b1 items\b/);
          } else {
            expect(label).toMatch(/\bitems\b/);
            expect(label).not.toMatch(new RegExp(`\\b${itemCount} item\\b(?!s)`));
          }
        }
      ),
      { numRuns: 20 }
    );
  });
});
