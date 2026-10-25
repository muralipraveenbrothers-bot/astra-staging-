// ============================================================================
// ASTRA AI — MITRA Wellness Agent
// Patient/Attendant Communication & Wellness Interface
// Simplifies clinical language, generates patient education materials,
// discharge instructions, wellness plans, and family counseling support.
// ============================================================================

import type { AgentDefinition, AgentCapability, AgentStatus } from '../core/AgentDefinition';

// ─── Mitra Types ────────────────────────────────────────────────────────────
export enum ContentType {
  PATIENT_EDUCATION = 'patient_education',
  DISCHARGE_INSTRUCTIONS = 'discharge_instructions',
  MEDICATION_GUIDE = 'medication_guide',
  DIET_PLAN = 'diet_plan',
  EXERCISE_PLAN = 'exercise_plan',
  LIFESTYLE_ADVICE = 'lifestyle_advice',
  PREVENTIVE_SCREENING = 'preventive_screening',
  FAMILY_COUNSELING = 'family_counseling',
  FOLLOW_UP_PLAN = 'follow_up_plan',
  WELLNESS_REPORT = 'wellness_report',
}

export enum ReadabilityLevel {
  BASIC = 'basic',           // 5th grade level, very simple
  STANDARD = 'standard',     // 8th grade level, general public
  ADVANCED = 'advanced',     // College level, health-literate
  CLINICAL = 'clinical',     // Medical professional level
}

export interface MitraRequest {
  id: string;
  patientId: string;
  patientName: string;
  contentType: ContentType;
  clinicalInput: string;       // What the doctor said / clinical info
  targetAudience: 'patient' | 'family' | 'caregiver';
  readabilityLevel: ReadabilityLevel;
  language: string;            // en, te, hi, ta, kn
  customInstructions?: string;
}

export interface MitraResponse {
  requestId: string;
  contentType: ContentType;
  title: string;
  content: string;
  simplifiedExplanation: string;
  keyPoints: string[];
  actionItems: string[];
  warnings: string[];
  readabilityScore: number; // Flesch-Kincaid grade level
  language: string;
  generatedAt: Date;
  reviewRequired: boolean;
}

// ─── Medical Jargon Simplifier ──────────────────────────────────────────────
class MedicalJargonSimplifier {
  private simplificationMap: Map<string, string> = new Map([
    // Conditions
    ['hypertension', 'high blood pressure'],
    ['hypotension', 'low blood pressure'],
    ['tachycardia', 'fast heart rate'],
    ['bradycardia', 'slow heart rate'],
    ['dyspnea', 'difficulty breathing'],
    ['pyrexia', 'fever'],
    ['edema', 'swelling'],
    ['anemia', 'low blood count'],
    ['emesis', 'vomiting'],
    ['nausea', 'feeling of wanting to vomit'],
    ['cephalgia', 'headache'],
    ['myalgia', 'muscle pain'],
    ['arthralgia', 'joint pain'],
    ['syncope', 'fainting'],
    ['vertigo', 'dizziness with spinning sensation'],
    ['pruritus', 'itching'],
    ['erythema', 'redness of skin'],
    ['hematuria', 'blood in urine'],
    ['hemoptysis', 'coughing up blood'],
    ['epistaxis', 'nosebleed'],
    ['jaundice', 'yellowing of skin and eyes'],
    ['ascites', 'fluid build-up in the belly'],
    ['pneumonia', 'lung infection'],
    ['sepsis', 'severe blood infection'],
    ['thrombosis', 'blood clot'],
    ['embolism', 'blood clot that has moved'],

    // Procedures
    ['phlebotomy', 'blood draw'],
    ['catheterization', 'inserting a tube'],
    ['intubation', 'placing a breathing tube'],
    ['thoracentesis', 'draining fluid from chest'],
    ['paracentesis', 'draining fluid from belly'],
    ['lumbar puncture', 'spinal tap'],
    ['biopsy', 'taking a small tissue sample'],
    ['debridement', 'cleaning a wound'],

    // Labs
    ['hemoglobin', 'blood oxygen carrier level'],
    ['leukocytes', 'white blood cells (infection fighters)'],
    ['thrombocytes', 'platelets (blood clotting cells)'],
    ['creatinine', 'kidney function marker'],
    ['bilirubin', 'liver waste product level'],
    ['troponin', 'heart damage marker'],

    // Instructions
    ['NPO', 'nothing by mouth (no food or drink)'],
    ['PRN', 'as needed'],
    ['BID', 'twice a day'],
    ['TID', 'three times a day'],
    ['QID', 'four times a day'],
    ['QHS', 'at bedtime'],
    ['PO', 'by mouth'],
    ['IV', 'through a vein (intravenous)'],
    ['IM', 'injection into muscle'],
    ['SC', 'injection under skin'],
    ['stat', 'immediately'],
    ['ad lib', 'as desired/freely'],
  ]);

  simplify(text: string, level: ReadabilityLevel): string {
    if (level === ReadabilityLevel.CLINICAL) return text; // No simplification

    let result = text;
    for (const [medical, simple] of this.simplificationMap) {
      const regex = new RegExp(`\\b${medical}\\b`, 'gi');
      if (level === ReadabilityLevel.BASIC) {
        result = result.replace(regex, simple);
      } else {
        result = result.replace(regex, `${medical} (${simple})`);
      }
    }

    return result;
  }

  getSimplification(term: string): string | undefined {
    return this.simplificationMap.get(term.toLowerCase());
  }
}

// ─── Discharge Instruction Generator ────────────────────────────────────────
class DischargeInstructionGenerator {
  generate(patientName: string, diagnoses: string[], medications: string[], instructions: string[]): string {
    const sections = [
      `## Discharge Summary for ${patientName}`,
      `**Date:** ${new Date().toLocaleDateString('en-IN')}`,
      '',
      '### Your Diagnoses',
      ...diagnoses.map((d, i) => `${i + 1}. ${d}`),
      '',
      '### Your Medications',
      ...medications.map((m, i) => `${i + 1}. ${m}`),
      '',
      '### Important Instructions',
      ...instructions.map((inst, i) => `${i + 1}. ${inst}`),
      '',
      '### When to Seek Emergency Care',
      'Go to the nearest emergency room immediately if you experience:',
      '- Severe chest pain or difficulty breathing',
      '- High fever (above 103°F / 39.5°C) not responding to medication',
      '- Sudden weakness on one side of the body',
      '- Uncontrollable bleeding',
      '- Severe allergic reaction (swelling of face/throat, difficulty breathing)',
      '- Loss of consciousness',
      '',
      '### Follow-Up Appointment',
      'Please schedule a follow-up visit within 7 days of discharge.',
      '',
      '---',
      '*This document was generated by ASTRA AI (Mitra Wellness). Please consult your doctor for any questions.*',
    ];

    return sections.join('\n');
  }
}

// ─── Wellness Plan Generator ────────────────────────────────────────────────
class WellnessPlanGenerator {
  private dietPlans: Record<string, string[]> = {
    diabetes: [
      'Eat small, frequent meals (5-6 times a day)',
      'Choose whole grains over refined grains (brown rice, whole wheat roti)',
      'Include plenty of vegetables — especially green leafy vegetables',
      'Limit sweets, sugary drinks, and fruit juices',
      'Choose lean proteins (fish, chicken, dal, paneer)',
      'Avoid fried and processed foods',
      'Drink plenty of water — at least 8 glasses per day',
    ],
    hypertension: [
      'Reduce salt intake — less than 5g (1 teaspoon) per day',
      'Eat plenty of fruits and vegetables',
      'Choose whole grains and lean proteins',
      'Limit processed and packaged foods',
      'Reduce caffeine intake',
      'Include potassium-rich foods (bananas, sweet potatoes, spinach)',
      'Avoid excess alcohol',
    ],
    cardiac: [
      'Follow a heart-healthy diet (low saturated fat, low cholesterol)',
      'Eat omega-3 rich foods (fish, walnuts, flaxseed)',
      'Limit red meat — choose fish or chicken instead',
      'Use olive oil or mustard oil for cooking',
      'Eat plenty of fiber (oats, legumes, vegetables)',
      'Limit sodium to less than 1500mg per day',
      'Avoid trans fats and deep-fried foods',
    ],
    general: [
      'Eat a balanced diet with all food groups',
      'Include fresh fruits and vegetables daily',
      'Drink adequate water (2-3 liters per day)',
      'Avoid excessive sugar and processed foods',
      'Eat home-cooked meals as much as possible',
      'Maintain regular meal timings',
    ],
  };

  getDietPlan(condition: string): string[] {
    const key = Object.keys(this.dietPlans).find(k => condition.toLowerCase().includes(k));
    return this.dietPlans[key || 'general'];
  }

  getExercisePlan(condition: string, age: number): string[] {
    const exercises: string[] = [];

    if (age > 65) {
      exercises.push('Gentle walking — 15-20 minutes, twice daily');
      exercises.push('Chair exercises and stretching');
      exercises.push('Deep breathing exercises — 10 minutes daily');
      exercises.push('Balance exercises (with support)');
    } else if (condition.toLowerCase().includes('cardiac')) {
      exercises.push('Supervised walking — start with 10 minutes, gradually increase');
      exercises.push('Light stretching exercises');
      exercises.push('Avoid heavy lifting (no more than 5 kg) for 6 weeks');
      exercises.push('Cardiac rehabilitation program recommended');
    } else {
      exercises.push('Brisk walking — 30 minutes, 5 days a week');
      exercises.push('Light yoga or stretching — 15 minutes daily');
      exercises.push('Gradually increase activity level over 4-6 weeks');
      exercises.push('Avoid strenuous exercise until cleared by your doctor');
    }

    exercises.push('Stop immediately if you feel chest pain, severe breathlessness, or dizziness');
    return exercises;
  }
}

// ─── Mitra Wellness Agent ───────────────────────────────────────────────────
export class MitraWellnessAgent {
  private jargonSimplifier = new MedicalJargonSimplifier();
  private dischargeGenerator = new DischargeInstructionGenerator();
  private wellnessGenerator = new WellnessPlanGenerator();
  private contentLog: MitraResponse[] = [];

  // ── Agent Definition ──────────────────────────────────────────────────
  getAgentDefinition(): AgentDefinition {
    return {
      id: 'mitra-wellness',
      name: 'Mitra — Patient Wellness & Communication Agent',
      version: '3.0.0',
      description: 'Patient/attendant-facing agent that simplifies clinical language, generates education materials, discharge instructions, wellness plans, and counseling support.',
      category: 'communication',
      capabilities: [
        'patient_education',
        'jargon_simplification',
        'discharge_instructions',
        'wellness_planning',
        'medication_guidance',
        'family_counseling',
        'multilingual_support',
      ] as unknown as AgentCapability[],
      requiredPermissions: ['patient.read', 'clinical.read'],
      maxConcurrentExecutions: 20,
      timeoutMs: 15000,
      retryPolicy: { maxRetries: 1, backoffMs: 500 },
      status: 'active' as AgentStatus,
    };
  }

  // ── Main Processing ───────────────────────────────────────────────────
  async process(request: MitraRequest): Promise<MitraResponse> {
    switch (request.contentType) {
      case ContentType.PATIENT_EDUCATION:
        return this.generatePatientEducation(request);
      case ContentType.DISCHARGE_INSTRUCTIONS:
        return this.generateDischargeInstructions(request);
      case ContentType.MEDICATION_GUIDE:
        return this.generateMedicationGuide(request);
      case ContentType.DIET_PLAN:
        return this.generateDietPlan(request);
      case ContentType.EXERCISE_PLAN:
        return this.generateExercisePlan(request);
      case ContentType.FAMILY_COUNSELING:
        return this.generateFamilyCounseling(request);
      case ContentType.FOLLOW_UP_PLAN:
        return this.generateFollowUpPlan(request);
      default:
        return this.generateGenericContent(request);
    }
  }

  // ── Patient Education ──────────────────────────────────────────────────
  private async generatePatientEducation(request: MitraRequest): Promise<MitraResponse> {
    const simplified = this.jargonSimplifier.simplify(request.clinicalInput, request.readabilityLevel);

    const response: MitraResponse = {
      requestId: request.id,
      contentType: ContentType.PATIENT_EDUCATION,
      title: `Understanding Your Condition — ${request.patientName}`,
      content: simplified,
      simplifiedExplanation: simplified,
      keyPoints: this.extractKeyPoints(simplified),
      actionItems: [
        'Take all medications as prescribed',
        'Keep all follow-up appointments',
        'Monitor for warning signs listed below',
        'Contact your doctor if symptoms worsen',
      ],
      warnings: [],
      readabilityScore: this.calculateReadability(simplified),
      language: request.language,
      generatedAt: new Date(),
      reviewRequired: request.readabilityLevel === ReadabilityLevel.BASIC,
    };

    this.contentLog.push(response);
    return response;
  }

  // ── Discharge Instructions ──────────────────────────────────────────────
  private async generateDischargeInstructions(request: MitraRequest): Promise<MitraResponse> {
    const content = this.dischargeGenerator.generate(
      request.patientName,
      [request.clinicalInput],
      [], // medications parsed from clinical input
      ['Follow up with your doctor within 7 days']
    );

    const simplified = this.jargonSimplifier.simplify(content, request.readabilityLevel);

    const response: MitraResponse = {
      requestId: request.id,
      contentType: ContentType.DISCHARGE_INSTRUCTIONS,
      title: `Discharge Instructions — ${request.patientName}`,
      content: simplified,
      simplifiedExplanation: simplified,
      keyPoints: [
        'Take all prescribed medications on time',
        'Watch for warning signs',
        'Schedule your follow-up appointment',
        'Call the hospital helpline if you have questions',
      ],
      actionItems: [
        'Pick up medications from the pharmacy',
        'Schedule follow-up within 7 days',
        'Keep this document safe for reference',
      ],
      warnings: [
        'Seek emergency care immediately if symptoms worsen suddenly',
      ],
      readabilityScore: this.calculateReadability(simplified),
      language: request.language,
      generatedAt: new Date(),
      reviewRequired: true, // Discharge instructions always need review
    };

    this.contentLog.push(response);
    return response;
  }

  // ── Medication Guide ───────────────────────────────────────────────────
  private async generateMedicationGuide(request: MitraRequest): Promise<MitraResponse> {
    const simplified = this.jargonSimplifier.simplify(request.clinicalInput, request.readabilityLevel);

    return {
      requestId: request.id,
      contentType: ContentType.MEDICATION_GUIDE,
      title: `Medication Guide — ${request.patientName}`,
      content: simplified,
      simplifiedExplanation: simplified,
      keyPoints: [
        'Take medications at the same time every day',
        'Do not stop medications without consulting your doctor',
        'Store medications in a cool, dry place',
        'Keep a list of all your medications',
      ],
      actionItems: [
        'Set reminders for medication times',
        'Keep a medication diary',
      ],
      warnings: [
        'Report any side effects to your doctor immediately',
        'Do not share your medications with others',
      ],
      readabilityScore: this.calculateReadability(simplified),
      language: request.language,
      generatedAt: new Date(),
      reviewRequired: true,
    };
  }

  // ── Diet Plan ──────────────────────────────────────────────────────────
  private async generateDietPlan(request: MitraRequest): Promise<MitraResponse> {
    const dietAdvice = this.wellnessGenerator.getDietPlan(request.clinicalInput);

    return {
      requestId: request.id,
      contentType: ContentType.DIET_PLAN,
      title: `Diet Plan — ${request.patientName}`,
      content: dietAdvice.join('\n'),
      simplifiedExplanation: dietAdvice.join('\n'),
      keyPoints: dietAdvice.slice(0, 4),
      actionItems: dietAdvice,
      warnings: ['This is general dietary guidance. Consult a nutritionist for personalized advice.'],
      readabilityScore: 6,
      language: request.language,
      generatedAt: new Date(),
      reviewRequired: false,
    };
  }

  // ── Exercise Plan ──────────────────────────────────────────────────────
  private async generateExercisePlan(request: MitraRequest): Promise<MitraResponse> {
    const exerciseAdvice = this.wellnessGenerator.getExercisePlan(request.clinicalInput, 50);

    return {
      requestId: request.id,
      contentType: ContentType.EXERCISE_PLAN,
      title: `Exercise Plan — ${request.patientName}`,
      content: exerciseAdvice.join('\n'),
      simplifiedExplanation: exerciseAdvice.join('\n'),
      keyPoints: exerciseAdvice.slice(0, 3),
      actionItems: exerciseAdvice,
      warnings: ['Stop exercise and seek help if you feel chest pain, severe breathlessness, or dizziness.'],
      readabilityScore: 6,
      language: request.language,
      generatedAt: new Date(),
      reviewRequired: false,
    };
  }

  // ── Family Counseling ──────────────────────────────────────────────────
  private async generateFamilyCounseling(request: MitraRequest): Promise<MitraResponse> {
    const simplified = this.jargonSimplifier.simplify(request.clinicalInput, ReadabilityLevel.BASIC);

    return {
      requestId: request.id,
      contentType: ContentType.FAMILY_COUNSELING,
      title: `Family Guide — ${request.patientName}`,
      content: simplified,
      simplifiedExplanation: simplified,
      keyPoints: [
        'Your loved one needs your support during recovery',
        'Help them follow the medication schedule',
        'Watch for warning signs and report changes',
        'Encourage gentle activity as recommended by the doctor',
      ],
      actionItems: [
        'Prepare a comfortable recovery space at home',
        'Stock prescribed medications',
        'Learn basic care instructions',
        'Know when to call the doctor or go to the ER',
      ],
      warnings: [],
      readabilityScore: 5,
      language: request.language,
      generatedAt: new Date(),
      reviewRequired: false,
    };
  }

  // ── Follow-Up Plan ──────────────────────────────────────────────────────
  private async generateFollowUpPlan(request: MitraRequest): Promise<MitraResponse> {
    return {
      requestId: request.id,
      contentType: ContentType.FOLLOW_UP_PLAN,
      title: `Follow-Up Plan — ${request.patientName}`,
      content: `Follow-up for: ${request.clinicalInput}`,
      simplifiedExplanation: 'Your doctor wants to see you again to check on your progress.',
      keyPoints: [
        'Keep your follow-up appointment',
        'Bring all your medications to the appointment',
        'Write down any questions you have',
        'Bring a family member if possible',
      ],
      actionItems: [
        'Schedule appointment within 7 days',
        'Get recommended tests done before the visit',
        'Prepare a list of symptoms since discharge',
      ],
      warnings: [],
      readabilityScore: 5,
      language: request.language,
      generatedAt: new Date(),
      reviewRequired: false,
    };
  }

  // ── Generic Content ────────────────────────────────────────────────────
  private async generateGenericContent(request: MitraRequest): Promise<MitraResponse> {
    const simplified = this.jargonSimplifier.simplify(request.clinicalInput, request.readabilityLevel);

    return {
      requestId: request.id,
      contentType: request.contentType,
      title: `Health Information — ${request.patientName}`,
      content: simplified,
      simplifiedExplanation: simplified,
      keyPoints: this.extractKeyPoints(simplified),
      actionItems: [],
      warnings: [],
      readabilityScore: this.calculateReadability(simplified),
      language: request.language,
      generatedAt: new Date(),
      reviewRequired: false,
    };
  }

  // ── Utilities ──────────────────────────────────────────────────────────
  simplifyTerm(term: string): string {
    return this.jargonSimplifier.getSimplification(term) || term;
  }

  private extractKeyPoints(text: string): string[] {
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 10);
    return sentences.slice(0, 5).map(s => s.trim());
  }

  private calculateReadability(text: string): number {
    const words = text.split(/\s+/).length;
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0).length;
    const syllables = text.split(/\s+/).reduce((sum, word) => {
      return sum + Math.max(1, word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/i, '').match(/[aeiouy]{1,2}/gi)?.length || 1);
    }, 0);

    if (sentences === 0 || words === 0) return 0;

    // Flesch-Kincaid Grade Level
    const grade = 0.39 * (words / sentences) + 11.8 * (syllables / words) - 15.59;
    return Math.max(0, Math.round(grade * 10) / 10);
  }

  // ── Stats ──────────────────────────────────────────────────────────────
  getStats() {
    return {
      totalContentGenerated: this.contentLog.length,
      byType: Object.values(ContentType).map(type => ({
        type,
        count: this.contentLog.filter(c => c.contentType === type).length,
      })),
      avgReadabilityScore: this.contentLog.length > 0
        ? this.contentLog.reduce((sum, c) => sum + c.readabilityScore, 0) / this.contentLog.length
        : 0,
      reviewRequired: this.contentLog.filter(c => c.reviewRequired).length,
    };
  }
}

// ─── Singleton ──────────────────────────────────────────────────────────────
let mitraInstance: MitraWellnessAgent | null = null;

export function getMitraWellnessAgent(): MitraWellnessAgent {
  if (!mitraInstance) {
    mitraInstance = new MitraWellnessAgent();
  }
  return mitraInstance;
}
