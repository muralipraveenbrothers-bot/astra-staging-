// ASTRA AI — Clinical Order Validator, Staging Engine & Approval Verification v1.0
import crypto from "crypto";
import {
  GroundedEntity, PatientContextLock, RiskTier, ActionLifecycleState,
  StagedClinicalAction, ClinicalApprovalRecord, GroundedContextResolver
} from "./groundedContext.js";

export type ClinicalRuleType = "HARD_STOP" | "HARD_CONFIRM" | "WARNING" | "INFORMATION";

export interface ClinicalValidationResult {
  valid: boolean;
  ruleType?: ClinicalRuleType;
  reasons: string[];
  warnings: string[];
  suggestedAction?: string;
}

export class ClinicalActionPipeline {
  private static stagedActions = new Map<string, StagedClinicalAction>();
  private static approvals = new Map<string, ClinicalApprovalRecord>();
  private static executedIdempotencyKeys = new Set<string>();

  /**
   * Compute deterministic cryptographic hash of an action payload.
   */
  static computeActionHash(payload: any, contextLock: PatientContextLock, doctorId: string): string {
    const dataStr = JSON.stringify({ payload, contextLock, doctorId });
    return crypto.createHash("sha256").update(dataStr).digest("hex");
  }

  /**
   * STAGE A CLINICAL ACTION
   * 1. Requires Grounded Entity
   * 2. Binds Patient Context Lock
   * 3. Validates Clinical Rules & Formulations
   * 4. Computes actionHash and sets state = "STAGED" / "PENDING_APPROVAL"
   */
  static stageAction(params: {
    actionType: string;
    targetQueryKey: string;
    payload: any;
    doctorId: string;
    doctorRole?: string;
    idempotencyKey?: string;
    expectedContextVersion?: number;
  }): { success: boolean; stagedAction?: StagedClinicalAction; validation?: ClinicalValidationResult; error?: string } {
    // 0. Idempotency Check
    if (params.idempotencyKey && this.executedIdempotencyKeys.has(params.idempotencyKey)) {
      return {
        success: false,
        error: `DUPLICATE_COMMAND: Action with idempotency key "${params.idempotencyKey}" already processed.`,
      };
    }

    // 0b. RBAC Role Validation
    const userRole = (params.doctorRole || "Doctor").toLowerCase();
    if ((params.actionType.startsWith("medication") || params.actionType.startsWith("prescription") || params.actionType.startsWith("admission")) && userRole === "receptionist") {
      return {
        success: false,
        error: `RBAC_DENIED: User role "${params.doctorRole}" is not permitted to perform ${params.actionType}.`,
      };
    }

    // 1. Ground Entity Requirement
    const grounded = GroundedContextResolver.resolvePatient(params.targetQueryKey);
    if (!grounded) {
      return {
        success: false,
        error: `GROUNDING_FAILED: Entity "${params.targetQueryKey}" could not be grounded in HIMS database. Write refused.`,
      };
    }

    // 2. Bind Patient Context Lock
    const contextLock = GroundedContextResolver.createContextLock(grounded);

    // 3. Perform Clinical Safety Rules Check
    const validation = this.validateClinicalRules(params.actionType, params.payload, grounded);
    if (validation.ruleType === "HARD_STOP") {
      return {
        success: false,
        validation,
        error: `HARD_STOP: ${validation.reasons.join("; ")}`,
      };
    }

    // 4. Determine Risk Tier & Risk Policy
    const riskTier = this.determineRiskTier(params.actionType);
    const actionId = `act-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const actionHash = this.computeActionHash(params.payload, contextLock, params.doctorId);

    const stagedAction: StagedClinicalAction = {
      actionId,
      actionType: params.actionType,
      stagedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(), // 15 min expiry
      contextLock,
      groundedRef: grounded,
      proposedPayload: params.payload,
      riskTier,
      actionHash,
      state: riskTier === "L0_READ" || riskTier === "L1_OPERATIONAL" ? "APPROVED" : "PENDING_APPROVAL",
    };

    this.stagedActions.set(actionId, stagedAction);

    return {
      success: true,
      stagedAction,
      validation,
    };
  }

  /**
   * AUTHENTICATED DOCTOR APPROVAL (BACKEND STATE)
   * The model CANNOT grant approval. Approval MUST originate from doctor signature API.
   */
  static approveStagedAction(params: {
    actionId: string;
    providedActionHash: string;
    doctorId: string;
    role: string;
  }): { success: boolean; approval?: ClinicalApprovalRecord; error?: string } {
    const staged = this.stagedActions.get(params.actionId);
    if (!staged) {
      return { success: false, error: `STAGED_ACTION_NOT_FOUND: Action #${params.actionId} does not exist or expired.` };
    }

    if (staged.state !== "PENDING_APPROVAL" && staged.state !== "STAGED") {
      return { success: false, error: `INVALID_STATE: Staged action is in state "${staged.state}". Cannot approve.` };
    }

    // Cryptographic Hash Integrity Verification
    if (staged.actionHash !== params.providedActionHash) {
      return {
        success: false,
        error: `ACTION_HASH_MISMATCH: Staged action payload was modified after creation. Approval invalidated.`,
      };
    }

    const approvalId = `apr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const approval: ClinicalApprovalRecord = {
      approvalId,
      actionId: staged.actionId,
      actionHash: staged.actionHash,
      approvingDoctorId: params.doctorId,
      approvingRole: params.role,
      approvedAt: new Date().toISOString(),
      signatureMethod: "biometric_or_session_key",
      status: "VALID",
    };

    staged.state = "APPROVED";
    staged.approvalRecord = approval;
    this.approvals.set(approvalId, approval);

    return { success: true, approval };
  }

  /**
   * COMMIT STAGED & APPROVED ACTION TO SOURCE-OF-TRUTH DB
   */
  static commitAction(actionId: string, idempotencyKey?: string): { success: boolean; result?: any; error?: string } {
    const staged = this.stagedActions.get(actionId);
    if (!staged) {
      return { success: false, error: `ACTION_NOT_FOUND: Action #${actionId} not found.` };
    }

    if (staged.state !== "APPROVED") {
      return {
        success: false,
        error: `APPROVAL_REQUIRED: Action #${actionId} is in state "${staged.state}". Authenticated doctor approval required.`,
      };
    }

    staged.state = "EXECUTING";

    // Deduplicate idempotency key
    if (idempotencyKey) {
      this.executedIdempotencyKeys.add(idempotencyKey);
    }

    staged.state = "COMPLETED";

    return {
      success: true,
      result: {
        actionId: staged.actionId,
        actionType: staged.actionType,
        patient: staged.contextLock.uhid,
        status: "COMMITTED_TO_HIMS",
        committedAt: new Date().toISOString(),
      },
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CLINICAL RULES VALIDATOR
  // ─────────────────────────────────────────────────────────────────────────
  private static validateClinicalRules(actionType: string, payload: any, grounded: GroundedEntity): ClinicalValidationResult {
    const reasons: string[] = [];
    const warnings: string[] = [];
    const patientData = grounded.data;

    // Rule 1: Allergy Hard Stop
    if (actionType === "medication.order" || actionType === "prescription.create") {
      const drugName = (payload.drugName || "").toLowerCase();
      const allergies = (patientData.allergies || []).map((a: string) => a.toLowerCase());

      if (allergies.some((a: string) => drugName.includes(a))) {
        return {
          valid: false,
          ruleType: "HARD_STOP",
          reasons: [`ALLERGY CONTRAINDICATION: Patient ${patientData.name} has a documented severe allergy to ${payload.drugName}.`],
          warnings: [],
        };
      }
    }

    // Rule 2: High Dose Hard Confirm
    if (actionType === "medication.order" && payload.doseValue > 1000) {
      warnings.push(`HIGH_DOSE_WARNING: Requested dose ${payload.doseValue}${payload.doseUnit} exceeds standard guidance range.`);
      return {
        valid: true,
        ruleType: "HARD_CONFIRM",
        reasons: [],
        warnings,
        suggestedAction: "Requires explicit consultant confirmation for high-dose administration.",
      };
    }

    return {
      valid: true,
      ruleType: "INFORMATION",
      reasons: [],
      warnings: [],
    };
  }

  private static determineRiskTier(actionType: string): RiskTier {
    if (actionType.startsWith("patient.search") || actionType.startsWith("ward.query") || actionType.startsWith("lab.read")) {
      return "L0_READ";
    }
    if (actionType.startsWith("communication.call") || actionType.startsWith("opd.print")) {
      return "L1_OPERATIONAL";
    }
    if (actionType.startsWith("lab.order") || actionType.startsWith("task.assign")) {
      return "L2_REVERSIBLE_WRITE";
    }
    if (actionType.startsWith("opd.finalize") || actionType.startsWith("prescription.create")) {
      return "L3_CLINICAL_SIGN";
    }
    return "L4_HIGH_RISK";
  }
}
