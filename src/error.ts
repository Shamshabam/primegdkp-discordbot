export function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    console.error('Error details:', error.message);
  }
  return 'Something went wrong. Please try again.';
}
