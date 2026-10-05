/** How long the placeholder stages take to walk through. */
export const MOCK_ANALYSIS_MS = 1400;

/** Progress shown while a request is in flight. */
export const MOCK_STAGES = [
  'Reading the submitted content',
  'Scanning for sensitive patterns',
  'Checking credential and key patterns',
  'Preparing the findings',
] as const;

/**
 * Illustrative shape of the protected copy the protection engine will return.
 * The redaction engine is not implemented yet, so nothing here is produced by
 * real matching.
 */
export const MOCK_PROTECTED_SAMPLE = {
  summary: 'Placeholders would keep the sentence readable while removing the real values.',
  before: 'Contact me at jane.doe@example.com or +44 7700 900123, 221B Baker Street, London.',
  after: 'Contact me at [EMAIL_1] or [PHONE_1], [ADDRESS_1].\napiKey = [API_KEY_1]',
  note: 'Each placeholder maps back to exactly one detected span.',
} as const;