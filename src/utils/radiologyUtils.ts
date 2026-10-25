// Radiology Reporting & Vocabulary Enforcement Utilities
export * from "@/lib/radiologyUtils";

// Section 8: OB/GYN Vocabulary Enforcement Mapping
export interface VocabularyRule {
  keywords: string[];
  masterMenuItem: string;
  enforcedVocabulary: string;
  defaultFindings: string;
  defaultImpression: string;
}

export const obgynVocabularyMap: VocabularyRule[] = [
  {
    keywords: ["nt scan", "12 week scan", "nuchal translucency", "nt thickness"],
    masterMenuItem: "NT Scan (Nuchal Translucency)",
    enforcedVocabulary: "Nuchal translucency thickness measured at 1.4 mm. Nasal bone is visualized. No structural marker variations detected.",
    defaultFindings: "FETAL BIOMETRY: CRL 62 mm corresponding to 12 Weeks 4 Days.\nNUCHAL TRANSLUCENCY (NT): Measured at 1.4 mm (within normal percentile).\nNASAL BONE: Present and ossified.\nDUCTUS VENOSUS: Anterograde a-wave observed.\nMATERNAL ADNEXA: Bilateral ovaries normal, no corpus luteum cysts >3cm.",
    defaultImpression: "1. Single live fetus corresponding to 12 Weeks 4 Days gestation.\n2. Low risk NT scan screening result. Nasal bone present."
  },
  {
    keywords: ["anomaly", "tiffa", "level 2", "level ii", "anomaly scan"],
    masterMenuItem: "Level II Anomaly Scan (TIFFA)",
    enforcedVocabulary: "Detailed structural evaluation of fetal cranium, face, spine, four-chamber heart view, abdominal organs, and all four extremities.",
    defaultFindings: "FETAL CARDIA: 4-chamber view clear, cardiac rate regular at 144 bpm.\nNEUROCRANIUM & SPINE: Lateral ventricles 5.8 mm, intact spine contours without spina bifida.\nFACE & NECK: Upper lip intact, normal ocular orbits.\nTHORAX & ABDOMEN: Stomach bubble identified in left upper quadrant, intact anterior abdominal wall, 3-vessel umbilical cord.\nLIMBS: All long bones (femur, humerus, radius/ulna, tibia/fibula) visualized with normal biometry.",
    defaultImpression: "Single live intrauterine fetus at 20 Weeks 2 Days.\nNo gross structural or congenital anomalies detected in current TIFFA scan."
  },
  {
    keywords: ["growth scan", "fluid check", "afi", "growth & well-being"],
    masterMenuItem: "Fetal Growth & Well-being Scan",
    enforcedVocabulary: "Fetal growth parameters calculated. Amniotic Fluid Index (AFI) measured at 14 cm. Estimated Fetal Weight (EFW) is 1850 grams.",
    defaultFindings: "FETAL BIOMETRY: BPD 82mm, HC 295mm, AC 278mm, FL 62mm.\nESTIMATED FETAL WEIGHT (EFW): 1850 grams (52nd percentile).\nAMNIOTIC FLUID INDEX (AFI): Four quadrant sum 14 cm (adequate volume).\nPLACENTA: Posterior, Grade II maturity, well clear of internal os.\nUMBILICAL ARTERY DOPPLER: RI 0.58, S/D ratio 2.4 (normal diastolic flow).",
    defaultImpression: "Single live fetus with normal growth velocity corresponding to 32 Weeks gestation.\nNormal umbilical artery Doppler waveforms and adequate amniotic fluid."
  },
  {
    keywords: ["follicle check", "day 12", "follicular tracking", "ovulation tracking"],
    masterMenuItem: "Follicular Tracking",
    enforcedVocabulary: "Serial transvaginal follicular monitoring. Right ovary shows a dominant follicle measuring 19.5 mm x 18.0 mm. Endometrial thickness is 9.2 mm.",
    defaultFindings: "RIGHT OVARY: Displays a dominant follicle measuring 19.5 mm x 18.0 mm with internal cumulus oophorus.\nLEFT OVARY: Contains multiple small antral follicles (<8 mm).\nENDOMETRIUM: Triple-line pattern measuring 9.2 mm thickness.\nDOUGLAS POUCH: Trace free fluid noted.",
    defaultImpression: "Mature dominant follicle in Right Ovary (~19.5 mm) with receptive triple-line endometrium (9.2 mm).\nCompatible with imminent ovulation."
  },
  {
    keywords: ["tvs", "scan internal", "transvaginal sonography", "transvaginal"],
    masterMenuItem: "Transvaginal Sonography (TVS)",
    enforcedVocabulary: "High-resolution transvaginal pelvic sonography reveals an anteverted uterus measuring 7.8 x 4.2 x 3.6 cm with homogenous myometrium.",
    defaultFindings: "UTERUS: Anteverted, normal shape, homogenous myometrial echotexture. No intramural fibroids.\nENDOMETRIUM: Central, regular, thickness 7.5 mm.\nBILATERAL OVARIES: Normal size and stroma. Right ovary 6.2 cc, Left ovary 5.8 cc.\nDOUGLAS POUCH: No free fluid or pelvic mass.",
    defaultImpression: "Normal transvaginal pelvic ultrasound study."
  },
  {
    keywords: ["baby flow", "doppler scan", "obstetric doppler", "umbilical doppler"],
    masterMenuItem: "Doppler Studies (Obstetric)",
    enforcedVocabulary: "Pulsatility Index (PI) and Resistance Index (RI) of the Umbilical Artery and Middle Cerebral Artery (MCA) are within normal baseline ranges.",
    defaultFindings: "UMBILICAL ARTERY DOPPLER: PI 0.88, RI 0.56. Positive end-diastolic velocity present.\nMIDDLE CEREBRAL ARTERY (MCA): PSV 38 cm/s (<1.5 MOM), PI 1.45.\nCPR (Cerebroplacental Ratio): 1.65 (normal >1.0, rules out brain-sparing reflex).\nMATERNAL UTERINE ARTERIES: Bilateral early diastolic notches absent.",
    defaultImpression: "Normal obstetric Doppler flows. No signs of placental insufficiency or fetal hypoxia."
  }
];

// Standardization Pipeline Helper
export function standardizeRadiologyText(rawInput: string): {
  masterMenuItem?: string;
  standardizedText: string;
  enforcedNotice?: string;
} {
  const lower = rawInput.toLowerCase();

  for (const rule of obgynVocabularyMap) {
    if (rule.keywords.some((kw) => lower.includes(kw))) {
      return {
        masterMenuItem: rule.masterMenuItem,
        standardizedText: `${rule.enforcedVocabulary}\n\n[Original Notes Restructured]: ${rawInput}`,
        enforcedNotice: `Auto-enforced OB/GYN medical vocabulary rule for ${rule.masterMenuItem}`
      };
    }
  }

  // General medical vocabulary cleanup
  let cleaned = rawInput
    .replace(/\b(no abnormality|normal scan|all good)\b/gi, "No focal gross structural abnormality detected.")
    .replace(/\b(gall stone|stone in gb)\b/gi, "solitary cholelithiasis (gallstone)")
    .replace(/\b(fatty liver)\b/gi, "diffuse hyperechoic liver parenchyma consistent with Hepatic Steatosis")
    .replace(/\b(fhr)\b/gi, "fetal cardiac activity (FHR)");

  return {
    standardizedText: cleaned
  };
}

// Template Loader for Template A (USG/Doppler) and Template B (CT/MRI/X-Ray)
export function getTemplateForModality(
  procedureName: string,
  category: "USG" | "X-Ray" | "CT" | "MRI" | "Endoscopy"
): { findings: string; impression: string; templateType: "Template A" | "Template B" } {
  // Check OB/GYN vocabulary rule first
  const ruleMatch = obgynVocabularyMap.find(r => r.masterMenuItem.toLowerCase() === procedureName.toLowerCase());
  if (ruleMatch) {
    return {
      findings: ruleMatch.defaultFindings,
      impression: ruleMatch.defaultImpression,
      templateType: "Template A"
    };
  }

  if (category === "USG") {
    if (procedureName.includes("KUB")) {
      return {
        templateType: "Template A",
        findings: "RIGHT KIDNEY: Normal size (10.8 cm), corticomedullary differentiation preserved. No renal calculus or hydronephrosis.\nLEFT KIDNEY: Normal size (11.0 cm), smooth cortical outline.\nURINARY BLADDER: Well filled with regular lumen, wall thickness 2.5 mm. Post-void residual volume is minimal (<15 cc).",
        impression: "Normal USG KUB evaluation. No urinary tract calculus or obstructive uropathy."
      };
    }
    return {
      templateType: "Template A",
      findings: "LIVER: Normal in size (14.2 cm) with smooth margins. Homogeneous parenchyma. No focal lesion.\nGALLBLADDER: Distended with normal wall thickness. No intraluminal calculi.\nPANCREAS & SPLEEN: Visualized parts appear unremarkable.\nKIDNEYS: Bilateral kidneys normal size, smooth contours, intact corticomedullary junction.",
      impression: "Unremarkable Ultrasound examination of Whole Abdomen."
    };
  }

  if (category === "X-Ray") {
    return {
      templateType: "Template B",
      findings: "CHEST PA VIEW:\n- LUNG FIELDS: Both lung fields are clear without focal parenchymal consolidation, collapse, or nodular opacity.\n- CARDIAC SILHOUETTE: Transverse cardiac diameter is within normal limits. Cardio-thoracic ratio <0.5.\n- HEAVY & HILAR CONTOURS: Hila normal in position and size.\n- CP ANGLES & DIAPHRAGM: Both costophrenic angles are sharp and diaphragmatic domes are smooth.",
      impression: "Normal Chest PA radiograph. No active cardiopulmonary lesion."
    };
  }

  if (category === "CT") {
    if (procedureName.includes("KUB")) {
      return {
        templateType: "Template B",
        findings: "CLINICAL INDICATIONS: Acute right flank pain.\n- RIGHT KIDNEY: Mild hydroureteronephrosis down to the lower third of right ureter.\n- LEFT KIDNEY: Normal size and attenuation. No calculus.\n- CALCULUS DETAIL: Dense radio-opaque calculus measuring 5.2 mm noted in lower right ureter, ~2 cm above vesicoureteric junction (VUJ).\n- BLADDER: Smooth wall, no intravesical calculus.",
        impression: "1. Solitary 5.2 mm lower right ureteric calculus causing mild upstream hydroureteronephrosis.\n2. Rest of KUB tract is clear."
      };
    }
    return {
      templateType: "Template B",
      findings: "CT BRAIN (PLAIN):\n- BRAIN PARENCHYMA: Normal grey-white matter differentiation in cerebrum and cerebellum. No acute parenchymal attenuation changes.\n- VENTRICULAR SYSTEM: Symmetrical ventricles without hydrocephalus.\n- EXTRA-AXIAL SPACES: Basal cisterns and sulci are within normal age limits. No subdural or epidural hematoma.\n- BONES: Intact calvarium and base of skull.",
      impression: "Unremarkable CT Brain. No acute intracranial hemorrhage, mass effect, or territorial infarct."
    };
  }

  if (category === "MRI") {
    return {
      templateType: "Template B",
      findings: "MRI LUMBAR SPINE:\n- L4-L5 DISC: Mild posterior diffuse disc bulge with shallow central annular tear, causing mild ventral epidural fat indentation.\n- L5-S1 DISC: Preserved disc height and normal signal on T2W sequences.\n- SPINAL CORD: Conus medullaris terminates normally at L1 level. Cauda equina nerve roots display normal alignment.",
      impression: "L4-L5 mild posterior disc bulge with central annular tear. No significant neural foraminal compromise."
    };
  }

  // Fallback
  return {
    templateType: "Template A",
    findings: "PROCEDURE: " + procedureName + "\nVisualized structures show normal morphological appearance and tissue signals.",
    impression: "No significant diagnostic abnormality identified in current evaluation."
  };
}

// Simulated Vision OCR Model for Handwritten Radiologist Notes
export async function transcribeHandwrittenScanOCR(_fileDataUrl: string): Promise<{
  findings: string;
  impression: string;
  confidenceScore: null;
}> {
  return { findings: "", impression: "", confidenceScore: null };
}
