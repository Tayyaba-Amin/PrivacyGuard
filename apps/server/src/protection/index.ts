/**
 * Protection module: deterministic text redaction for detected sensitive spans.
 *
 * This module exports the public API for redacting text based on findings from
 * the deterministic detector. It never calls an AI model and the same input
 * always produces the same output.
 */

export * from './types.js';
export { protectText } from './redact.js';