export interface DrugKnowledge {
  id: string;
  brandName: string;
  genericName: string;
  drugClass: string;
  moa: string;
  uses: string[];
  adverseEffects: string[];
  pricePerTablet: number;
  costPricePerTablet: number;
  marginPercent: number;
  stockQty: number;
  aiRecommendation: string;
  manufacturer: string;
}

export const DRUG_DATABASE: DrugKnowledge[] = [
  {
    id: "DRUG-01",
    brandName: "Augmentin 625mg",
    genericName: "Amoxicillin + Clavulanic Acid",
    drugClass: "Penicillin Antibiotic & Beta-lactamase Inhibitor",
    moa: "Amoxicillin inhibits bacterial cell wall synthesis; Clavulanic acid inactivates bacterial beta-lactamases, preventing amoxicillin degradation.",
    uses: ["Lower Respiratory Tract Infections", "Otitis Media", "Sinusitis", "Skin & Soft Tissue Infections", "UTI"],
    adverseEffects: ["Diarrhea", "Nausea", "Vomiting", "Hepatic Dysfunction", "Skin Rash"],
    pricePerTablet: 22,
    costPricePerTablet: 15,
    marginPercent: 31.8,
    stockQty: 1400,
    aiRecommendation: "High demand broad-spectrum antibiotic. Keep 500+ tablets stock. Consider recommending generic Moxikind-CV for cost-sensitive patients.",
    manufacturer: "GlaxoSmithKline Pharmaceuticals",
  },
  {
    id: "DRUG-02",
    brandName: "Dolo 650mg",
    genericName: "Paracetamol 650mg",
    drugClass: "Analgesic & Antipyretic",
    moa: "Inhibits central prostaglandin synthesis by blocking COX enzymes and acts on hypothalamic heat-regulating center.",
    uses: ["Fever / Pyrexia", "Mild to Moderate Pain", "Post-Vaccination Fever", "Osteoarthritis Pain"],
    adverseEffects: ["Hepatotoxicity at high doses (>4g/day)", "Mild Gastrointestinal Upset", "Skin Reactions"],
    pricePerTablet: 2.5,
    costPricePerTablet: 1.2,
    marginPercent: 52.0,
    stockQty: 6750,
    aiRecommendation: "Top selling antipyretic in India with 52% gross margin. Fast-moving inventory item.",
    manufacturer: "Micro Labs Ltd",
  },
  {
    id: "DRUG-03",
    brandName: "Pan 40mg",
    genericName: "Pantoprazole Sodium 40mg",
    drugClass: "Proton Pump Inhibitor (PPI)",
    moa: "Suppresses gastric acid secretion by specific inhibition of the H+/K+-ATPase enzyme system at the secretory surface of gastric parietal cells.",
    uses: ["GERD", "Peptic Ulcer Disease", "NSAID-Induced Gastropathy", "Zollinger-Ellison Syndrome"],
    adverseEffects: ["Headache", "Abdominal Pain", "Diarrhea", "Vitamin B12 Deficiency (long-term)", "Hypomagnesemia"],
    pricePerTablet: 11,
    costPricePerTablet: 6.5,
    marginPercent: 40.9,
    stockQty: 3100,
    aiRecommendation: "Essential gastroprotective agent. Highly prescribed along with NSAIDs and antibiotics.",
    manufacturer: "Alkem Laboratories",
  },
  {
    id: "DRUG-04",
    brandName: "Amlokind 5mg",
    genericName: "Amlodipine Besylate 5mg",
    drugClass: "Dihydropyridine Calcium Channel Blocker",
    moa: "Inhibits calcium ion influx across vascular smooth muscle and cardiac muscle, causing peripheral vasodilation and decreased blood pressure.",
    uses: ["Essential Hypertension", "Chronic Stable Angina", "Vasospastic Angina"],
    adverseEffects: ["Peripheral Edema", "Flushing", "Dizziness", "Palpitations", "Gingival Hyperplasia"],
    pricePerTablet: 4,
    costPricePerTablet: 2.2,
    marginPercent: 45.0,
    stockQty: 2800,
    aiRecommendation: "First-line antihypertensive. Stable recurring demand. High patient adherence rate.",
    manufacturer: "Mankind Pharma",
  },
  {
    id: "DRUG-05",
    brandName: "Deriphyllin Retard 150mg",
    genericName: "Etofylline + Theophylline 150mg",
    drugClass: "Xanthine Bronchodilator",
    moa: "Relaxes bronchial smooth muscle and pulmonary blood vessels by inhibiting phosphodiesterase (PDE) and blocking adenosine receptors.",
    uses: ["Bronchial Asthma", "Chronic Obstructive Pulmonary Disease (COPD)", "Chronic Bronchitis"],
    adverseEffects: ["Nausea", "Insomnia", "Tremors", "Tachycardia", "Arrhythmia at toxic levels"],
    pricePerTablet: 3.5,
    costPricePerTablet: 2.1,
    marginPercent: 40.0,
    stockQty: 850,
    aiRecommendation: "Expiring within 60 days! Recommend fast-track prescription dispensing or distributor return.",
    manufacturer: "Zydus Healthcare",
  },
  {
    id: "DRUG-06",
    brandName: "Azithral 500mg",
    genericName: "Azithromycin 500mg",
    drugClass: "Macrolide Antibiotic",
    moa: "Binds to 50S ribosomal subunit of susceptible microorganisms, suppressing microbial protein synthesis.",
    uses: ["Community-Acquired Pneumonia", "Pharyngitis/Tonsillitis", "Skin Infections", "Typhoid Fever"],
    adverseEffects: ["Nausea", "Diarrhea", "QT Prolongation", "Abdominal Cramps", "Transient Hearing Loss"],
    pricePerTablet: 24,
    costPricePerTablet: 16,
    marginPercent: 33.3,
    stockQty: 520,
    aiRecommendation: "Popular 3-day antibiotic course. High seasonal variation during monsoon & winter.",
    manufacturer: "Alembic Pharmaceuticals",
  },
  {
    id: "DRUG-07",
    brandName: "Glycomet-GP 2/500",
    genericName: "Glimepiride 2mg + Metformin 500mg",
    drugClass: "Sulfonylurea & Biguanide Combination",
    moa: "Glimepiride stimulates insulin secretion from pancreatic beta cells; Metformin reduces hepatic glucose production and improves insulin sensitivity.",
    uses: ["Type 2 Diabetes Mellitus"],
    adverseEffects: ["Hypoglycemia", "Lactic Acidosis (rare)", "GI Disturbance", "Metallic Taste"],
    pricePerTablet: 8.5,
    costPricePerTablet: 4.8,
    marginPercent: 43.5,
    stockQty: 2100,
    aiRecommendation: "High-volume chronic care drug with steady monthly recurring sales.",
    manufacturer: "USV Ltd",
  },
];

export interface PMInsightItem {
  id: string;
  type: "low_stock" | "expiry" | "distributor" | "high_margin" | "replacement" | "dead_stock" | "profit_alert";
  title: string;
  description: string;
  impactBadge: string;
  actionText: string;
}

export const PM_AI_INSIGHTS: PMInsightItem[] = [
  {
    id: "INS-01",
    type: "low_stock",
    title: "Low Stock Prediction: Deriphyllin & Augmentin",
    description: "Based on current IPD bed occupancy (92%) and seasonal respiratory surge, Deriphyllin 150mg & Augmentin 625mg will stock out in 3 days.",
    impactBadge: "Stock-Out Risk",
    actionText: "Auto-Generate PO to Distributor",
  },
  {
    id: "INS-02",
    type: "expiry",
    title: "Expiry Alert: Deriphyllin Retard (Batch DER-1102)",
    description: "85 Sheets (850 Tablets) expiring on Oct 30, 2026. Value: ₹2,975. Recommend immediate return to Zydus Healthcare.",
    impactBadge: "Expiry Risk ₹2,975",
    actionText: "Initiate Distributor Return",
  },
  {
    id: "INS-03",
    type: "high_margin",
    title: "High Margin Opportunity: Dolo 650mg vs Paracetamol Generics",
    description: "Dolo 650 yields 52% gross margin. Recommend stocking Micro-Paracetamol 650 bulk pack for 58% margin.",
    impactBadge: "+6% Profit Boost",
    actionText: "View Profit Comparison",
  },
  {
    id: "INS-04",
    type: "replacement",
    title: "Generic Medicine Replacement Suggestion",
    description: "Augmentin 625mg (₹22/tab) can be substituted with Moxikind-CV 625mg (₹16/tab) with identical bioequivalence.",
    impactBadge: "Patient Savings ~27%",
    actionText: "Compare Molecules",
  },
  {
    id: "INS-05",
    type: "distributor",
    title: "Distributor Ranking: Micro Labs vs Mankind Pharma",
    description: "Micro Labs has 98% on-time fulfillment and 2% higher credit discount compared to regional distributors.",
    impactBadge: "Top Distributor #1",
    actionText: "View Distributor Analytics",
  },
  {
    id: "INS-06",
    type: "dead_stock",
    title: "Dead Stock Warning: Rare Specialized Antidotes",
    description: "3 items in cabinet 4 showing zero movement in 120 days. Capital tied up: ₹8,400.",
    impactBadge: "Dead Stock Clearance",
    actionText: "Clear Dead Stock",
  },
];

export interface PharmaUserRole {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: "Admin" | "Pharmacist" | "Other Staff";
  status: "Online" | "Offline" | "On Duty";
  lastActive: string;
}

export const INITIAL_PHARMA_USERS: PharmaUserRole[] = [
  {
    id: "USR-01",
    name: "Dr. Murali Praveen",
    email: "muralipraveen@hospital.org",
    phone: "+91 98480 12345",
    role: "Admin",
    status: "Online",
    lastActive: "Active Now",
  },
  {
    id: "USR-02",
    name: "Srinivas Rao, B.Pharm",
    email: "srinivas.pharmacy@hospital.org",
    phone: "+91 98765 43210",
    role: "Pharmacist",
    status: "Online",
    lastActive: "Active Now",
  },
  {
    id: "USR-03",
    name: "K. Swathi, D.Pharm",
    email: "swathi.pharma@hospital.org",
    phone: "+91 94401 22334",
    role: "Pharmacist",
    status: "On Duty",
    lastActive: "10 mins ago",
  },
  {
    id: "USR-04",
    name: "Ramesh Store Assistant",
    email: "ramesh.store@hospital.org",
    phone: "+91 91234 56789",
    role: "Other Staff",
    status: "Offline",
    lastActive: "2 hours ago",
  },
];
