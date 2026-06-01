export type AdminAuditAction =
  | 'approve_parking'
  | 'reject_parking'
  | 'approve_driver'
  | 'reject_driver'
  | 'approve_document'
  | 'reject_document'
  | 'approve_identity'
  | 'reject_identity'
  | 'suspend_user'
  | 'unsuspend_user'
  | 'ban_user'
  | 'unban_user'
  | 'renew_document'
  | 'update_platform_fee'
  | 'approve_withdrawal'
  | 'reject_withdrawal'
  | 'bulk_approve_drivers'
  | 'bulk_reject_drivers'
  | 'bulk_message_drivers'
  | 'send_admin_message'
  | 'create_message_template'
  | 'investigate_dispute'
  | 'resolve_dispute';

export interface AdminAuditContext {
  adminId: string;
  ipAddress?: string;
}

export interface CreateAuditLogInput {
  action: AdminAuditAction;
  targetType?: string;
  targetId?: string;
  oldValue?: Record<string, unknown> | string | null;
  newValue?: Record<string, unknown> | string | null;
  reason?: string;
  notes?: string;
}
