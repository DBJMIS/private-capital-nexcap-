/**
 * Notification hooks (stub — wire to email/push later).
 * File path: lib/workflow/notify-stub.ts
 */

// TODO: On approval request created → notify approver (assigned_to or role-based pool)
export async function notifyApprovalRequestCreated(_params: {
  tenantId: string;
  approvalId: string;
  approvalType: string;
}): Promise<void> {
  // TODO
}

// TODO: On approval decision → notify requester
export async function notifyApprovalDecision(_params: {
  tenantId: string;
  approvalId: string;
  decision: 'approved' | 'rejected';
}): Promise<void> {
  // TODO
}

// TODO: On task assigned → notify assignee
export async function notifyTaskAssigned(_params: { tenantId: string; taskId: string }): Promise<void> {
  // TODO
}

// TODO: On overdue task → notify assignee + their manager
export async function notifyTaskOverdue(_params: { tenantId: string; taskId: string }): Promise<void> {
  // TODO
}

export async function notifyFundManagerEvaluation(_params: {
  tenantId: string;
  applicationId: string;
  kind: 'under_review' | 'rejected' | 'accepted';
  message: string;
}): Promise<void> {
  // TODO: email fund manager (created_by on application)
}
