/**
 * An error whose message is written for the person using the app: what went
 * wrong and how to fix it. Anything else that reaches the UI is treated as an
 * unexpected bug and shown with a generic message.
 */
export class UserFacingError extends Error {
  readonly details: readonly string[];

  constructor(message: string, details: readonly string[] = []) {
    super(message);
    this.name = 'UserFacingError';
    this.details = details;
  }
}
