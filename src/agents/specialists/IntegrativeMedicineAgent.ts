/**
 * ASTRA AI — INTEGRATIVE MEDICINE AGENT (P2-13)
 * ============================================================================
 * Level: HOD / SPECIALIST (INTEGRATIVE MEDICINE)
 * Purpose:
 *   ayurveda_hod  → prakriti analysis, herb–drug interaction safety
 *   naturopathy_hod → supervised hydrotherapy / fasting protocols
 *   dietetics_hod → local food habits, regional diet charts, food–drug timing
 *   seasonal_regimen_agent → Ritucharya (seasonal lifestyle)
 *
 * NO FAKE DATA RULE: all outputs are deterministic institutional knowledge
 * tables (Charaka/Sushruta-derived classical principles + modern nutrition
 * guidance). Herb–drug flags are SAFETY LAYER only — always over-rule by
 * the physician and the allopathic drug-safety agent.
 */

export type DietRegion = "south" | "north" | "east" | "west" | "tribal";
export type Prakriti = "VATA" | "PITTA" | "KAPHA";

export interface DietMeal {
  meal: string;
  items: string[];
  calories: number;
  proteinG: number;
}

export interface DietChart {
  patientName: string;
  region: DietRegion;
  condition: string;
  totalCalories: number;
  totalProteinG: number;
  meals: DietMeal[];
  medicationTimingGaps: string[];
  notes: string[];
}

export interface HerbDrugInteraction {
  herb: string;
  drug: string;
  severity: "HIGH" | "MODERATE" | "LOW" | "NONE";
  effect: string;
  recommendation: string;
}

export interface RitucharyaRegimen {
  season: string;
  months: string;
  diet: string[];
  lifestyle: string[];
  exercise: string[];
  precautions: string[];
}

// ── REGIONAL FOOD DATABASES ──────────────────────────────────────────────
const REGIONAL_FOODS: Record<DietRegion, {
  staples: string[]; proteins: string[]; fats: string[]; vegetables: string[]; fruits: string[];
}> = {
  south: {
    staples: ["Idli", "Dosa", "Ragi mudde", "Parboiled rice", "Sambar", "Chapati (jowar)"],
    proteins: ["Toor dal", "Moong dal", "Curd", "Egg", "Fish (when allowed)", "Groundnut"],
    fats: ["Coconut oil (moderate)", "Ghee (small)", "Groundnut oil"],
    vegetables: ["Drumstick", "Ridge gourd", "Bottle gourd", "Beans", "Leafy greens (palak, methi)"],
    fruits: ["Banana (ripe, small)", "Papaya", "Guava", "Musk melon", "Pomegranate"]
  },
  north: {
    staples: ["Whole wheat roti", "Bajra roti", "Millets", "Brown rice", "Dal", "Besan cheela"],
    proteins: ["Moong dal", "Chana dal", "Paneer (small)", "Curd", "Egg", "Rajma (small portion)"],
    fats: ["Mustard oil (small)", "Ghee (small)"],
    vegetables: ["Lauki", "Tinda", "Bhindi", "Cauliflower", "Spinach", "Carrot"],
    fruits: ["Apple", "Pear", "Pomegranate", "Seasonal melon"]
  },
  east: {
    staples: ["Steamed rice", "Ragi (powder)", "Whole wheat roti", "Dalma"],
    proteins: ["Moong dal", "Masoor dal", "Fish (small, freshwater)", "Egg", "Curd"],
    fats: ["Mustard oil (small)", "Ghee (small)"],
    vegetables: ["Pumpkin", "Bottle gourd", "Brinjal", "Pointed gourd", "Leafy greens"],
    fruits: ["Papaya", "Banana", "Orange", "Guava"]
  },
  west: {
    staples: ["Jowar bhakri", "Bajra bhakri", "Rice", "Dal", "Thepla (small)"],
    proteins: ["Toor dal", "Moong dal", "Curd", "Egg", "Peanuts", "Fish (coastal, small)"],
    fats: ["Groundnut oil (small)", "Ghee (small)", "Coconut (small)"],
    vegetables: ["Bottle gourd", "Ridge gourd", "Cluster beans", "Spinach", "Carrot", "Kakdi"],
    fruits: ["Chikoo (small)", "Papaya", "Orange", "Pomegranate", "Melon"]
  },
  tribal: {
    staples: ["Ragi", "Kodo millet", "Foxtail millet", "Little millet", "Jowar"],
    proteins: ["Horse gram", "Field beans", "Sesame", "Curd", "Egg (when available)"],
    fats: ["Sesame oil (small)", "Groundnut", "Ghee (small)"],
    vegetables: ["Wild leafy greens (fenugreek, amaranth)", "Pumpkin", "Yam (small)", "Cluster beans", "Bamboo shoot (small)"],
    fruits: ["Wild ber", "Jamun", "Guava", "Tamarind (small)"]
  }
};

const DIET_RULES: Record<string, {
  restrictions: string[]; fluids: string[]; snacks: string[]; notes: string[];
}> = {
  diabetes: {
    restrictions: ["No sugar, jaggery, sweets, fruit juices", "Limit rice to 1 small katori per meal", "Avoid refined flour (maida)", "No fried items"],
    fluids: ["Water 8–10 glasses", "Buttermilk (unsweetened)", "Green tea (unsweetened)", "No sweetened drinks"],
    snacks: ["Roasted chana", "Sprouts", "Ragi malt (unsweetened)", "1 small fruit with skin (avoid at night)"],
    notes: ["30–45 min walk after meals", "Test blood glucose before breakfast", "Meal timing fixed to medication schedule (see gaps)"]
  },
  hypertension: {
    restrictions: ["No added salt beyond 3–4 g/day total", "No pickles, papads, packaged snacks", "Limit coffee/tea to 2 cups", "No deep-fried food"],
    fluids: ["Water 8–10 glasses", "Coconut water (1 glass, not in CKD)", "Buttermilk"],
    snacks: ["Roasted seeds", "Fruit", "Ragi malt"],
    notes: ["Reduce stress; deep breathing 5 min, 3× daily", "Avoid night-time eating", "Monitor BP daily at same time"]
  },
  "ckd": {
    restrictions: ["Restrict potassium: no banana, coconut water, orange, potato", "Restrict phosphorus: no nuts, cola, paneer (large)", "Protein 0.6–0.8 g/kg/day per nephrologist", "No packaged foods (hidden sodium)"],
    fluids: ["Fluid limit per nephrology instruction (usually 1.5 L/day)", "No coconut water"],
    snacks: ["Apple (small)", "Guava (small)", "White rice kheer (small)"],
    notes: ["Serum K+ and creatinine to be rechecked weekly", "Dietitian + nephrology joint plan required"]
  },
  "heart disease": {
    restrictions: ["No ghee/oil > 3 tsp/day total", "No red meat, no egg yolk > 3/week", "No fried foods, no bakery items", "Salt < 4 g/day"],
    fluids: ["Water 8 glasses", "Green tea (unsweetened)"],
    snacks: ["Roasted chana", "Fruit", "Moong sprouts"],
    notes: ["Include omega-3: flaxseed, 1 tsp; fish 2×/week (small)", "Portion control; 70% satiety rule"]
  }
};

// ── HERB–DRUG INTERACTION DATABASE (SAFETY LAYER) ─────────────────────────
const HERB_DRUG_INTERACTIONS: HerbDrugInteraction[] = [
  { herb: "ashwagandha", drug: "metformin", severity: "MODERATE", effect: "May add to hypoglycemic effect — additive glucose lowering.", recommendation: "Monitor glucose; consider dose adjustment; never start both without glucose monitoring." },
  { herb: "ashwagandha", drug: "insulin", severity: "MODERATE", effect: "Possible additive hypoglycemia.", recommendation: "Monitor glucose closely; reduce insulin dose only on physician instruction." },
  { herb: "ashwagandha", drug: "levothyroxine", severity: "MODERATE", effect: "May increase thyroid hormone activity.", recommendation: "Monitor TSH 6 weeks after starting/stopping; separate doses by 2+ hours." },
  { herb: "ashwagandha", drug: "sedatives", severity: "LOW", effect: "Possible additive sedation with benzodiazepines/barbiturates.", recommendation: "Avoid combining; advise non-sedating alternatives." },
  { herb: "turmeric", drug: "warfarin", severity: "HIGH", effect: "Additive anticoagulant effect — INR elevation and bleeding risk.", recommendation: "AVOID combination. If used, INR monitoring weekly." },
  { herb: "turmeric", drug: "aspirin", severity: "MODERATE", effect: "Additive antiplatelet effect.", recommendation: "Avoid high-dose turmeric (>1 g/day curcumin) with antiplatelets." },
  { herb: "turmeric", drug: "clopidogrel", severity: "MODERATE", effect: "May reduce clopidogrel activation (CYP2C19) or add platelet inhibition.", recommendation: "Monitor for bleeding; prefer low-dose culinary turmeric only." },
  { herb: "ginger", drug: "warfarin", severity: "MODERATE", effect: "May prolong bleeding time.", recommendation: "Culinary use OK; concentrated ginger supplements not recommended." },
  { herb: "ginger", drug: "insulin", severity: "LOW", effect: "Possible mild glucose lowering.", recommendation: "Monitor glucose when starting ginger supplements." },
  { herb: "tulsi", drug: "warfarin", severity: "MODERATE", effect: "Possible anticoagulant effect (vitamin K antagonist interference).", recommendation: "Monitor INR; keep intake consistent if used." },
  { herb: "garlic", drug: "warfarin", severity: "HIGH", effect: "Additive anticoagulant effect.", recommendation: "AVOID garlic supplements on warfarin; culinary amounts are safer but monitor INR." },
  { herb: "garlic", drug: "antiplatelets", severity: "MODERATE", effect: "Additive antiplatelet effect.", recommendation: "Avoid garlic supplements with aspirin/clopidogrel." },
  { herb: "fenugreek", drug: "metformin", severity: "MODERATE", effect: "Additive glucose lowering and possible absorption delay.", recommendation: "Monitor glucose; separate intake from metformin by 1–2 h." },
  { herb: "amla", drug: "warfarin", severity: "MODERATE", effect: "Vitamin C content may alter INR.", recommendation: "Monitor INR if amla supplements used." },
  { herb: "brahmi", drug: "levothyroxine", severity: "LOW", effect: "Possible interaction with thyroid axis.", recommendation: "Monitor TSH if used long term." },
  { herb: "licorice", drug: "hydrochlorothiazide", severity: "HIGH", effect: "Hypokalemia potentiation and hypertension (pseudohyperaldosteronism).", recommendation: "AVOID licorice with diuretics, digoxin, and in hypertension." },
  { herb: "licorice", drug: "digoxin", severity: "HIGH", effect: "Hypokalemia increases digoxin toxicity.", recommendation: "AVOID combination; check K+ if any licorice intake." },
  { herb: "neem", drug: "hypoglycemics", severity: "MODERATE", effect: "May add to glucose lowering.", recommendation: "Monitor glucose; avoid unsupervised use." },
  { herb: "guggulu", drug: "statins", severity: "LOW", effect: "May affect lipid metabolism (direction variable).", recommendation: "Monitor lipids; keep statin dose per physician." }
];

// ── FOOD–DRUG TIMING GUIDANCE ─────────────────────────────────────────────
const FOOD_DRUG_TIMING: { drug: string; timing: string; foodType: string }[] = [
  { drug: "levothyroxine", timing: "Take 30–60 min BEFORE breakfast on empty stomach. Avoid calcium/iron within 4 h.", foodType: "any" },
  { drug: "iron", timing: "Take on empty stomach with vitamin C (orange/amla). AVOID calcium (milk, curd), tea, coffee within 2 h.", foodType: "milk-dairy" },
  { drug: "calcium", timing: "Take WITH food. AVOID iron and high-oxalate greens at the same time.", foodType: "any" },
  { drug: "metformin", timing: "Take WITH meals (after food) to reduce GI upset.", foodType: "any" },
  { drug: "statins", timing: "Take in the EVENING. AVOID grapefruit/grapefruit juice (CYP3A4).", foodType: "fruit" },
  { drug: "doxycycline", timing: "Take with full glass of water. AVOID dairy/curd within 2 h.", foodType: "milk-dairy" },
  { drug: "ciprofloxacin", timing: "AVOID dairy, calcium-fortified foods, iron within 2 h (chelation).", foodType: "milk-dairy" },
  { drug: "warfarin", timing: "Keep leafy greens (vitamin K) CONSISTENT daily — don't binge or skip.", foodType: "greens" },
  { drug: "aspirin", timing: "Take after food to reduce gastritis. AVOID concurrent alcohol.", foodType: "any" },
  { drug: "nisoldipine", timing: "AVOID grapefruit/grapefruit juice.", foodType: "fruit" },
  { drug: "azithromycin", timing: "Take 1 hour before or 2 hours after food.", foodType: "any" },
  { drug: "phenytoin", timing: "AVOID enteral feeds/folic acid at same time; separate by 2 h.", foodType: "any" },
  { drug: "thyroxine", timing: "Same as levothyroxine — 30–60 min before breakfast.", foodType: "any" },
  { drug: "prednisolone", timing: "Take WITH breakfast (morning dose) to mimic cortisol rhythm.", foodType: "any" },
  { drug: "fluoxetine", timing: "Take with food to reduce nausea. AVOID St John's Wort.", foodType: "any" },
  { drug: "spironolactone", timing: "Take with food. AVOID potassium-rich fruits (banana, orange) in excess.", foodType: "fruit" },
  { drug: "allopurinol", timing: "Take after food with water. Avoid purine-rich binges.", foodType: "any" },
  { drug: "esomeprazole", timing: "Take 30–60 min BEFORE breakfast.", foodType: "any" },
  { drug: "rifampicin", timing: "Take 1 hour before food on empty stomach.", foodType: "any" },
  { drug: "isosorbide", timing: "AVOID alcohol; take sublingual as directed.", foodType: "any" }
];

// ── RITUCHARYA (SEASONAL REGIMEN) ─────────────────────────────────────────
const RITUCHARYA: RitucharyaRegimen[] = [
  {
    season: "Vasanta (Spring)", months: "Mar–Apr",
    diet: ["Light, warm foods; barley, millets, moong dal", "Honey instead of sugar (not for infants)", "Bitter greens (methi, karuveppilai) — Kapha pacifying"],
    lifestyle: ["Early waking (before 6 AM)", "Dry massage (udvartana)", "Regular exercise to clear Kapha"],
    exercise: ["Brisk walking 45 min", "Yoga: surya namaskara, twists"],
    precautions: ["Spring allergies, pollen; avoid cold drinks and heavy sweets", "Dengue/flu season surveillance begins in monsoon, but keep immunity: sleep 7–8 h"]
  },
  {
    season: "Grishma (Summer)", months: "May–Jun",
    diet: ["Cooling foods: cucumber, watermelon, tender coconut", "Buttermilk with jeera; avoid heavy oils", "Increase fluids to 10–12 glasses"],
    lifestyle: ["Avoid midday sun (11 AM–3 PM)", "Cool baths; sandalwood application", "Daytime sleep avoided unless elderly/children"],
    exercise: ["Light swimming, evening walks after sunset"],
    precautions: ["Heat stroke, dehydration, gastroenteritis — ORS at hand", "Viral conjunctivitis spreads in summer — hand hygiene"]
  },
  {
    season: "Varsha (Monsoon)", months: "Jul–Aug",
    diet: ["Warm, easily digestible: khichdi, soups, ginger in cooking", "Avoid leafy greens raw (wash well); prefer cooked", "Boiled water only"],
    lifestyle: ["Avoid wet feet; dry clothing immediately", "Neem/sandal soap for skin infections"],
    exercise: ["Indoor yoga; avoid strenuous outdoor exertion"],
    precautions: ["DENGUE + MALARIA + LEPTOSPIROSIS season — drain stagnant water, full-sleeve clothing, repellent", "Gastro outbreaks — hand hygiene critical", "Fever + headache + retro-orbital pain → dengue testing"]
  },
  {
    season: "Sharad (Autumn)", months: "Sep–Oct",
    diet: ["Pitta season: bitter + astringent foods", "Rice, moong, ghee (small), pomegranate", "Avoid excess sour, salty, fried foods"],
    lifestyle: ["Moonlight walks; early dinner", "Abhyanga (oil massage) with cooling oils"],
    exercise: ["Moderate: walking, swimming"],
    precautions: ["Seasonal flu begins — influenza vaccination discussion", "Skin eruptions (Pitta) — avoid excess spice"]
  },
  {
    season: "Hemanta (Pre-Winter)", months: "Nov–Dec",
    diet: ["Warm, nourishing: millets, sesame, ghee", "Soups with pepper and ginger", "Increase protein slightly"],
    lifestyle: ["Sunbathing (morning) for vitamin D", "Warm clothing; avoid cold drafts"],
    exercise: ["Vigorous: brisk walking, cycling"],
    precautions: ["COPD/asthma exacerbations — inhaler technique review", "Hypothermia in elderly — keep room warm"]
  },
  {
    season: "Shishira (Winter)", months: "Jan–Feb",
    diet: ["Warm, high-energy: bajra, groundnut, ghee", "Tulsi-ginger tea", "Avoid cold water baths"],
    lifestyle: ["Massage with sesame oil", "Adequate sleep 7–8 h; waking before sunrise"],
    exercise: ["Active: jogging, indoor workouts"],
    precautions: ["Flu, pneumonia season — vaccination, hand hygiene", "Stroke/ACS peaks in winter mornings — avoid sudden exertion after waking"]
  }
];

export class IntegrativeMedicineAgent {
  public static readonly agentId = "integrative_medicine_agent";

  // ── PRAKRITI ANALYSIS ───────────────────────────────────────────────────
  /**
   * Deterministic questionnaire scoring. With no answers provided, returns a
   * PROVISIONAL constitution from the patient record and lists the questions.
   */
  public static analyzePrakriti(patient: any, answers?: Record<string, number>): any {
    const score = { VATA: 0, PITTA: 0, KAPHA: 0 };
    const usedAnswers = !!answers && Object.keys(answers).length >= 5;

    if (usedAnswers) {
      for (const [q, v] of Object.entries(answers)) {
        const k = q.toLowerCase();
        if (k.includes("build") || k.includes("frame")) { if (v >= 3) score.KAPHA += 2; else if (v <= 1) score.VATA += 2; else score.PITTA += 1; }
        else if (k.includes("weight")) { if (v >= 3) score.KAPHA += 2; else if (v <= 1) score.VATA += 1; }
        else if (k.includes("skin") || k.includes("hair")) { if (v >= 3) score.KAPHA += 1; else if (v === 2) score.PITTA += 2; else score.VATA += 1; }
        else if (k.includes("appetite")) { if (v >= 3) score.PITTA += 2; else if (v <= 1) score.VATA += 1; }
        else if (k.includes("temperature") || k.includes("cold")) { if (v >= 3) score.VATA += 2; else if (v === 2) score.KAPHA += 1; else score.PITTA += 2; }
        else if (k.includes("sleep")) { if (v >= 3) score.KAPHA += 2; else if (v === 2) score.VATA += 2; else score.PITTA += 1; }
        else if (k.includes("memory") || k.includes("mind")) { if (v >= 3) score.KAPHA += 1; else if (v === 2) score.PITTA += 1; else score.VATA += 2; }
      }
    } else {
      // PROVISIONAL from record — labeled clearly
      const d = (patient.diagnosis || "").toLowerCase();
      const age = patient.age || 0;
      if (has(d, "insomnia", "anxiety", "constipation", "dry")) score.VATA += 2;
      if (has(d, "gastritis", "acidity", "diarrhea", "inflammation", "fever")) score.PITTA += 2;
      if (has(d, "obesity", "diabetes", "edema", "sinusitis")) score.KAPHA += 2;
      if (age > 55) score.VATA += 1;
      if (patient.gender === "male") score.PITTA += 1; else score.KAPHA += 1;
    }

    const max = Math.max(score.VATA, score.PITTA, score.KAPHA);
    const constitution: Prakriti = score.VATA === max ? "VATA" : score.PITTA === max ? "PITTA" : "KAPHA";

    return {
      patientName: patient.name,
      constitution,
      scores: score,
      basis: usedAnswers
        ? "Questionnaire scoring (7 questions)"
        : "PROVISIONAL from patient record — full 7-question questionnaire recommended",
      dietaryAdvice: constitution === "VATA"
        ? ["Warm, cooked, moist foods; sesame oil; avoid cold and dry snacks", "Regular meal times; warm water sips through the day", "Abhyanga with warm sesame oil"]
        : constitution === "PITTA"
          ? ["Cooling foods: cucumber, tender coconut, buttermilk", "Avoid sour, spicy, salty excess; early dinner", "Pitta-pacifying: bitter greens, coriander, fennel tea"]
          : ["Light, warm, dry foods; millets over rice", "Avoid heavy dairy and sweets; honey in place of sugar", "Morning brisk walk; dry massage (udvartana)"],
      questionnaire: [
        "1. Build: thin (1) … heavy (5)",
        "2. Weight: easy to lose (1) … hard to lose (5)",
        "3. Skin/Hair: dry rough (1) … oily soft (5)",
        "4. Appetite: irregular (1) … strong (5)",
        "5. Cold tolerance: hates cold (1) … likes cold (5)",
        "6. Sleep: light broken (1) … deep heavy (5)",
        "7. Mind: restless (1) … calm steady (5)"
      ]
    };
  }

  // ── LOCAL DIET CHART ────────────────────────────────────────────────────
  public static generateDietChart(patient: any, region: DietRegion = "south", condition = "default", allergies?: string[]): DietChart {
    const r = REGIONAL_FOODS[region] || REGIONAL_FOODS.south;
    const rule = DIET_RULES[condition.toLowerCase()] || DIET_RULES.default || {
      restrictions: ["No fried foods at night", "Limit sugar and packaged snacks"],
      fluids: ["Water 8–10 glasses", "Buttermilk (if tolerated)"],
      snacks: ["Fruit (1 serving)", "Roasted chana"],
      notes: ["Balanced plate: ½ vegetables, ¼ protein, ¼ staple"]
    };
    const allergyNote = (allergies || []).filter(Boolean).map(a => `AVOID: ${a} — verify with nursing before serving`);

    const staple = r.staples[0] + " (1 small plate)";
    const meals: DietMeal[] = [
      { meal: "Breakfast (8:00 AM)", items: [r.staples[1] || "Idli (2)", "Sambar (1 bowl)", "1 boiled egg OR moong dal (small)"], calories: 350, proteinG: 14 },
      { meal: "Lunch (1:00 PM)", items: [staple, `${r.proteins[0]} (1 bowl)`, `${r.vegetables[0] || "seasonal greens"} sabzi (1 bowl)`, "Buttermilk (1 glass)"], calories: 520, proteinG: 18 },
      { meal: "Evening (4:30 PM)", items: [rule.snacks[0] || "Fruit (1 serving)", "Green tea/buttermilk"], calories: 150, proteinG: 3 },
      { meal: "Dinner (8:00 PM)", items: [r.staples[2] || "Roti (2)", `${r.proteins[1] || "Moong dal"} (1 bowl)`, `${r.vegetables[1] || "Bottle gourd"} (1 bowl)`], calories: 450, proteinG: 16 },
      { meal: "Bedtime (10:00 PM)", items: ["Warm milk (150 ml, low fat) OR water"], calories: 90, proteinG: 4 }
    ];

    return {
      patientName: patient.name,
      region,
      condition,
      totalCalories: meals.reduce((s, m) => s + m.calories, 0),
      totalProteinG: meals.reduce((s, m) => s + m.proteinG, 0),
      meals,
      medicationTimingGaps: [
        ...FOOD_DRUG_TIMING.filter(f => f.foodType === "milk-dairy").map(f => `${f.drug}: ${f.timing}`),
        "Separate herbals (ashwagandha/turmeric) from allopathic medicines by 2 hours"
      ].slice(0, 4),
      notes: [...rule.restrictions, ...rule.fluids.slice(0, 2), ...rule.notes, ...allergyNote]
    };
  }

  // ── HERB–DRUG INTERACTION CHECK ─────────────────────────────────────────
  public static checkHerbDrugInteraction(herb: string, drug: string): HerbDrugInteraction {
    const h = herb.toLowerCase();
    const d = drug.toLowerCase();
    const match = HERB_DRUG_INTERACTIONS.find(i => h.includes(i.herb) && d.includes(i.drug)) ||
      HERB_DRUG_INTERACTIONS.find(i => h.includes(i.herb) && (d.includes(i.drug.split(" ")[0])));
    if (!match) {
      return {
        herb,
        drug,
        severity: "NONE",
        effect: "No interaction recorded in the local herb–drug database for this pair.",
        recommendation: "Standard monitoring applies; check updated drug references and inform the physician."
      };
    }
    return { ...match, herb, drug };
  }

  // ── FOOD–DRUG TIMING ────────────────────────────────────────────────────
  public static checkFoodDrugTiming(drug: string): { drug: string; timing: string } {
    const d = drug.toLowerCase();
    const match = FOOD_DRUG_TIMING.find(f => d.includes(f.drug) || f.drug.includes(d)) ||
      FOOD_DRUG_TIMING.find(f => f.drug.split(" ")[0] === d.split(" ")[0]);
    return match
      ? { drug, timing: match.timing }
      : { drug, timing: "No specific food-timing rule in the local table. Take per physician instruction and hospital formulary." };
  }

  // ── RITUCHARYA ──────────────────────────────────────────────────────────
  public static suggestRitucharya(month?: number, location?: string): RitucharyaRegimen {
    const m = month ?? new Date().getMonth() + 1;
    const idx = m <= 2 ? 5 : m <= 4 ? 0 : m <= 6 ? 1 : m <= 8 ? 2 : m <= 10 ? 3 : 4;
    return RITUCHARYA[idx];
  }

  // ── NATUROPATHY PROTOCOL ────────────────────────────────────────────────
  public static suggestNaturopathy(condition: string, contraindications?: string[]): any {
    const c = condition.toLowerCase();
    const contra = (contraindications || []).map(x => x.toLowerCase());
    const blocked = (name: string) => contra.some(x => x.includes(name));

    if (has(c, "hypertension", "high blood pressure")) {
      return {
        condition,
        protocol: "Hydrotherapy + lifestyle (medically supervised)",
        components: [
          "Warm foot bath 10 min twice daily (avoids cold immersion in HTN)",
          "Slow breathing 5 min, 3× daily (autonomic regulation)",
          "Daily 30–45 min walking; sodium ≤ 4 g/day",
          "Progressive muscle relaxation before sleep"
        ],
        contraindications: ["Cold hydrotherapy (sudden vasoconstriction) — not recommended in uncontrolled HTN"],
        supervision: "Requires physician clearance; medications never withheld for naturopathy"
      };
    }
    if (has(c, "diabetes", "prediabetes")) {
      return {
        condition,
        protocol: "Diet + movement protocol (supervised)",
        components: [
          "Pre-meal 10 min walk (improves postprandial glucose)",
          "Ragi/finger-millet based breakfast rotation",
          "Fenugreek water (1 tsp soaked overnight) — monitor glucose",
          "Stress reduction: 5 min guided breathing after lunch"
        ],
        contraindications: blocked("hypoglycemia") ? ["Fasting therapy is CONTRAINDICATED — hypoglycemia risk"] : ["Supervised fasting ONLY with glucose monitoring and physician approval"],
        supervision: "Glucose log daily; never adjust insulin/OHAs without physician"
      };
    }
    if (has(c, "constipation", "irritable bowel", "ibs")) {
      return {
        condition,
        protocol: "Warmth + fiber + hydration",
        components: [
          "Warm water enema protocol ONLY under nursing supervision",
          "Isabgol (psyllium) 1 tsp with warm water at night",
          "Abdominal warm compress 15 min daily",
          "Ragi + cooked fruit breakfast for soluble fiber"
        ],
        contraindications: blocked("obstruction") ? ["Enema CONTRAINDICATED if obstruction suspected"] : [],
        supervision: "Rule out obstruction before any bowel therapy"
      };
    }
    return {
      condition,
      protocol: "General restorative protocol",
      components: [
        "Hydration: warm water sipping through the day",
        "Sunlight: 15 min morning exposure (before 9 AM)",
        "Mud therapy (abdominal) 20 min daily — under staff supervision",
        "Deep breathing 10 min twice daily"
      ],
      contraindications: [],
      supervision: "Adjunct only — continues all prescribed allopathic treatment"
    };
  }

  public static routeByKeyword(query: string, patient: any): { kind: string; result: any } {
    const q = query.toLowerCase();
    if (has(q, "prakriti", "constitution", "vata", "pitta", "kapha")) {
      const answers = this.extractPrakritiAnswers(query);
      return { kind: "PRAKRITI", result: this.analyzePrakriti(patient, answers) };
    }
    if (has(q, "diet", "diet chart", "meal plan", "food chart")) {
      const region: DietRegion = has(q, "north") ? "north" : has(q, "east") ? "east" : has(q, "west") ? "west" : has(q, "tribal") ? "tribal" : "south";
      const condition = has(q, "diabetes") ? "diabetes" : has(q, "hypertension", "blood pressure") ? "hypertension" : has(q, "ckd", "kidney") ? "ckd" : has(q, "heart") ? "heart disease" : "default";
      return { kind: "DIET_CHART", result: this.generateDietChart(patient, region, condition, patient.allergies) };
    }
    if (has(q, "herb", "interaction", "ashwagandha", "turmeric", "tulsi", "ginger", "garlic", "fenugreek", "brahmi", "amla", "licorice", "neem", "guggulu")) {
      const herbMatch = q.match(/\b(ashwagandha|turmeric|tulsi|ginger|garlic|fenugreek|brahmi|amla|licorice|neem|guggulu)\b/);
      const drugMatch = q.match(/\b(metformin|insulin|warfarin|aspirin|clopidogrel|levothyroxine|thyroxine|digoxin|statins|hydrochlorothiazide|sedatives)\b/);
      return {
        kind: "HERB_DRUG",
        result: this.checkHerbDrugInteraction(herbMatch?.[1] || "ashwagandha", drugMatch?.[1] || "metformin")
      };
    }
    if (has(q, "ritucharya", "season", "monsoon", "winter", "summer", "spring")) {
      const month = has(q, "monsoon", "july", "august") ? 7 : has(q, "winter", "january", "february", "december") ? 1 : has(q, "summer", "may", "june") ? 6 : has(q, "spring", "march", "april") ? 3 : new Date().getMonth() + 1;
      return { kind: "RITUCHARYA", result: this.suggestRitucharya(month) };
    }
    if (has(q, "naturopath", "hydrotherapy", "fasting", "mud therapy")) {
      const condition = q.replace(/naturopath|hydrotherapy|fasting|mud therapy|suggest|for|protocol/gi, "").trim() || "general";
      return { kind: "NATUROPATHY", result: this.suggestNaturopathy(condition, []) };
    }
    return { kind: "PRAKRITI", result: this.analyzePrakriti(patient) };
  }

  /** Parses "analyze prakriti (build=4, sleep=5)" style inline answers. */
  private static extractPrakritiAnswers(query: string): Record<string, number> | undefined {
    const pairs = query.match(/(build|weight|skin|hair|appetite|cold|temperature|sleep|memory|mind)\s*[=:]\s*([1-5])/gi);
    if (!pairs || pairs.length < 5) return undefined;
    const answers: Record<string, number> = {};
    for (const p of pairs) {
      const [k, v] = p.split(/[=:]\s*/);
      answers[k.toLowerCase()] = parseInt(v, 10);
    }
    return answers;
  }
}

const has = (s: string, ...keywords: string[]): boolean =>
  !!s && keywords.some(k => s.toLowerCase().includes(k));