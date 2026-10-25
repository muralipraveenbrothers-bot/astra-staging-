type Status = "PENDING_REVIEW" | "REVISION_REQUESTED" | "SIGNED";
const reviews = new Map<string, { reviewId: string; status: Status; draftContent: string; signedBy?: string; comments: unknown[] }>();
export function submitForReview(input: { category: string; draftContent: string; generatedBy: string; patientId?: string; now?: Date }) {
  if (!input.draftContent.trim()) return { ok: false, errors: ["empty draft"] };
  const review = { reviewId: `REV-${Math.random().toString(36).slice(2)}`, status: "PENDING_REVIEW" as Status, draftContent: input.draftContent, comments: [] };
  reviews.set(review.reviewId, review);
  return { ok: true, review };
}
export function addComment(reviewId: string, comment: unknown) {
  const review = reviews.get(reviewId);
  if (!review) return { ok: false, errors: ["unknown review"] };
  if (review.status === "SIGNED") return { ok: false, errors: ["already signed"] };
  review.comments.push(comment);
  return { ok: true, review };
}
export function requestRevision(reviewId: string, _now?: Date) {
  const review = reviews.get(reviewId);
  if (!review) return { ok: false, errors: ["unknown review"] };
  review.status = "REVISION_REQUESTED";
  return { ok: true, review };
}
export function submitRevision(reviewId: string, content: string, _by: string, _now?: Date) {
  const review = reviews.get(reviewId);
  if (!review || !content.trim()) return { ok: false, errors: ["revision unavailable"] };
  review.draftContent = content;
  review.status = "PENDING_REVIEW";
  return { ok: true, review };
}
export function signDocument(reviewId: string, userId: string, _now?: Date) {
  const review = reviews.get(reviewId);
  if (!review) return { ok: false, errors: ["unknown review"] };
  review.status = "SIGNED";
  review.signedBy = userId;
  return { ok: true, review };
}
export function getReview(reviewId: string) {
  return reviews.get(reviewId);
}
