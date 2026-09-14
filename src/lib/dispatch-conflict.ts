export function isSubmissionConflict(
	error: unknown,
): error is { status: number; submissionId?: string } {
	return (
		typeof error === 'object' &&
		error !== null &&
		'status' in error &&
		(error as { status: unknown }).status === 409
	);
}
