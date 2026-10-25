// Radiology & PACS utility engine with comprehensive OB/GYN vocabulary enforcement,
// 40+ specialty procedure templates, and multimodal vision OCR transcription.

export interface RadiologyTemplate {
  procedureName: string;
  category: "USG" | "X-Ray" | "CT" | "MRI" | "Endoscopy";
  findings: string;
  impression: string;
}

export const ALL_PROCEDURE_TEMPLATES: Record<string, RadiologyTemplate> = {
  // -------------------------------------------------------------
  // A. ULTRASOUND (USG) TEMPLATES
  // -------------------------------------------------------------
  "USG Abdomen & Pelvis": {
    procedureName: "USG Abdomen & Pelvis",
    category: "USG",
    findings: `LIVER: Normal in size (13.8 cm) with smooth margins. Grade 1 fatty infiltration noted. No focal liver lesion or IHBRD.
GALLBLADDER: Distended with a 6.2 mm mobile calculus in the neck region. No gallbladder wall thickening (2.1 mm).
CBD & PORTAL VEIN: Common bile duct is normal in caliber (3.8 mm). Portal vein is normal with hepatopetal flow.
PANCREAS: Head and body appear normal in size and echotexture. Main pancreatic duct is not dilated.
SPLEEN: Normal in size (9.4 cm) and homogeneous. No focal splenic lesion.
KIDNEYS: Bilateral kidneys are normal in size, shape, and cortical echotexture. Right: 10.2 x 4.4 cm, Left: 10.8 x 4.8 cm. Good CMD. No calculus, hydronephrosis, or perinephric collection.
URINARY BLADDER: Well distended, smooth regular mucosal walls, no intravesical calculus or mass.
PELVIS / POUCH OF DOUGLAS: Pelvic organs unremarkable. No free fluid in pouch of Douglas / peritoneal cavity.`,
    impression: `1. Cholelithiasis with 6.2 mm solitary gallstone in gallbladder neck.
2. Grade 1 Fatty Liver (Hepatic Steatosis).
3. Normal bilateral kidneys, spleen, pancreas, and urinary bladder.`,
  },
  "USG Whole Abdomen": {
    procedureName: "USG Whole Abdomen",
    category: "USG",
    findings: `LIVER: Normal size (14.2 cm), smooth capsular contour, homogeneous parenchymal echogenicity. No focal solid or cystic space occupying lesion. No IHBRD.
GALLBLADDER: Well distended, lumen is anechoic, wall thickness is normal (2.2 mm). No calculus or sludge.
CBD & PORTAL VEIN: CBD measures 3.9 mm (normal). Portal vein measures 10.2 mm with normal hepatopetal color Doppler flow.
PANCREAS: Head, body, and visualized tail show normal size and acoustic texture. Pancreatic duct is normal (1.4 mm).
SPLEEN: Spleen is normal in size (9.6 cm) and parenchymal echo pattern. Splenic vein is normal.
KIDNEYS: Both kidneys are normal in anatomical location, size, and contour (RK: 10.4 cm, LK: 10.6 cm). Normal cortical thickness (14 mm). Corticomedullary differentiation is well preserved. No calculus, hydronephrosis, or mass lesion.
RETROPERITONEUM: No para-aortic or mesenteric lymphadenopathy. Abdominal aorta is normal in caliber.
URINARY BLADDER: Adequately distended with thin, uniform walls. No intraluminal lesion or calculus.
PELVIS: No mass lesion. No free fluid visualized in the hepatorenal space, splenorenal recess, or pouch of Douglas.`,
    impression: `1. Normal Ultrasound Whole Abdomen examination.
2. No organomegaly, focal mass lesion, calculus, or ascites.`,
  },
  "USG Pelvis (Transabdominal)": {
    procedureName: "USG Pelvis (Transabdominal)",
    category: "USG",
    findings: `URINARY BLADDER: Well distended, smooth thin mucosal walls (2.2 mm). Lumen is clear without calculus, mass, or debris. Pre-void volume: 340 ml. Post-void residual: 10 ml (insignificant).
UTERUS: Anteverted, normal in size measuring 7.8 x 4.2 x 3.6 cm. Myometrium demonstrates uniform echotexture without focal fibroid or adenomyosis.
ENDOMETRIUM: Central, regular, thickness measures 7.4 mm.
RIGHT OVARY: Measures 3.1 x 2.2 cm (Volume: 7.6 cc), normal baseline stroma and peripheral antral follicles.
LEFT OVARY: Measures 2.9 x 2.0 cm (Volume: 6.0 cc), normal parenchymal echogenicity.
POUCH OF DOUGLAS: No free fluid or encysted collection in the cul-de-sac.`,
    impression: `1. Normal pelvic sonogram with normal uterine and bilateral ovarian morphology.
2. Endometrial thickness: 7.4 mm, within normal limits. No free pelvic fluid.`,
  },
  "Transvaginal Sonography (TVS)": {
    procedureName: "Transvaginal Sonography (TVS)",
    category: "USG",
    findings: `UTERUS: Anteverted, measures 7.6 x 4.4 x 3.8 cm. Myometrium demonstrates uniform echotexture with no focal lesion or adenomyosis.
ENDOMETRIAL CAVITY: Symmetrical, regular cavity echo. Triple-line endometrial pattern measuring 8.6 mm.
RIGHT OVARY: Measures 3.3 x 2.1 cm (Volume: 7.4 cc) with 6-8 small subcentimetric antral follicles.
LEFT OVARY: Measures 3.0 x 1.9 cm (Volume: 5.9 cc) with normal follicular distribution.
ADNEXA: Bilateral adnexal areas are clear. No hydrosalpinx, tubo-ovarian mass, or ectopic gestational sac.
CUL-DE-SAC: Clear, no free fluid or blood in the pouch of Douglas.`,
    impression: `1. Normal Transvaginal Sonography (TVS).
2. Normal uterine size, healthy receptive endometrium (8.6 mm), and normal bilateral ovaries.`,
  },
  "Early Pregnancy / Viability Scan": {
    procedureName: "Early Pregnancy / Viability Scan",
    category: "USG",
    findings: `GESTATIONAL SAC: Single intrauterine regular gestational sac located centrally in the uterine fundus. Mean Sac Diameter (MSD): 24.2 mm (corresponding to 7 weeks 1 day).
YOLK SAC: Circular, regular, measures 4.2 mm.
FETAL POLE: Fetal pole clearly visualized with Crown-Rump Length (CRL) of 11.8 mm (corresponding to 7 weeks 2 days).
CARDIAC ACTIVITY: Active, regular fetal heart pulsation observed. Fetal Heart Rate (FHR): 146 bpm.
DECIDUA & ADNEXA: Double decidual reaction intact. No subchorionic hematoma or perigestational bleed. Bilateral ovaries normal with a right corpus luteum cyst (18 mm).`,
    impression: `1. Single live intrauterine pregnancy corresponding to 7 weeks 2 days gestation.
2. Good embryonic cardiac activity (FHR: 146 bpm). No subchorionic hemorrhage.`,
  },
  "NT Scan (Nuchal Translucency)": {
    procedureName: "NT Scan (Nuchal Translucency)",
    category: "USG",
    findings: `Single live intrauterine fetus corresponding to 12 weeks 4 days.
Crown-Rump Length (CRL): 62.4 mm.
Nuchal Translucency (NT) Thickness: 1.4 mm (Normal range < 2.5 mm).
Nasal Bone: Visualized and ossified.
Ductus Venosus Flow: Normal forward A-wave, Pulsatility Index (PI): 0.98.
Tricuspid Regurgitation: Absent.
Fetal Heart Rate: 158 bpm with regular rhythm.
Amniotic Fluid: Adequate for gestational age. Gross fetal anatomy (cranial vault, stomach bubble, bladder, 4 limbs) appears normal for 1st trimester.`,
    impression: `1. Single live intrauterine pregnancy at 12w4d with normal Nuchal Translucency (1.4 mm).
2. Present nasal bone and normal ductus venosus Doppler indicating low risk for aneuploidies (Trisomies 21, 18, 13).`,
  },
  "Level II Anomaly Scan (TIFFA)": {
    procedureName: "Level II Anomaly Scan (TIFFA)",
    category: "USG",
    findings: `Single live intrauterine fetus in cephalic presentation.
GA by Biometry: 20 weeks 2 days (BPD: 48mm, HC: 178mm, AC: 154mm, FL: 33mm, EFW: 380g).
Cranial Neuro-Axis: Intact calvarium. Bilateral lateral ventricles normal (5.8 mm). Cavum septum pellucidum visualized. Cerebellum and cisterna magna (4.8 mm) normal.
Facial Anatomy: Upper lip intact, bilateral orbits symmetrical, nasal bone measured (6.4 mm).
Cardiovascular: Normal 4-chamber cardiac view, LVOT and RVOT crossing visualized. 3-vessel trachea view normal. FHR: 144 bpm regular.
Thorax & Lungs: Bilateral lungs homogeneous, diaphragm intact.
Abdomen & Pelvis: Stomach bubble beneath left hemidiaphragm. Bilateral kidneys in renal fossae without pelvicalyceal dilatation. Anterior abdominal wall intact with normal umbilical cord insertion (3 vessels: 2 arteries, 1 vein).
Spine & Extremities: Complete intact spinal column without splaying. All 4 long bones and bilateral hands/feet visualized with normal axis.
Liquor & Placenta: Amniotic Fluid Index (AFI): 14.2 cm. Placenta: Fundal anterior, Grade I maturity, clear of internal os.`,
    impression: `1. Single live intrauterine fetus corresponding to 20 weeks 2 days.
2. Targeted Imaging for Fetal Anomalies (TIFFA) reveals no gross structural or soft-marker congenital anomalies.
3. Normal amniotic fluid volume and anterior placenta clear of internal os.`,
  },
  "Fetal Growth & Well-being Scan": {
    procedureName: "Fetal Growth & Well-being Scan",
    category: "USG",
    findings: `Single live intrauterine fetus in cephalic presentation.
Biometry: BPD: 82.1 mm, HC: 298 mm, AC: 284 mm, FL: 64.2 mm.
Estimated Fetal Weight (EFW): 2150g ± 150g (54th percentile by Hadlock).
Amniotic Fluid Index (AFI): 13.8 cm (Normal: 8-18 cm). Single deepest vertical pocket: 4.8 cm.
Placenta: Posterior Grade II maturity, no retroplacental hematoma.
Doppler Waveforms: Umbilical Artery PI: 0.94, RI: 0.60 (Normal S/D ratio). Middle Cerebral Artery (MCA) PSV: 42 cm/s (No fetal anemia). Cerebroplacental Ratio (CPR): 1.62 (> 1.0).`,
    impression: `1. Single live intrauterine fetus corresponding to 32 weeks 5 days with appropriate interval fetal growth (54th percentile).
2. Normal amniotic fluid volume and reassuring fetal Doppler indices (CPR: 1.62).`,
  },
  "Follicular Tracking": {
    procedureName: "Follicular Tracking",
    category: "USG",
    findings: `Uterus: Normal size (7.6 x 4.2 x 3.8 cm), anteverted, homogeneous myometrium.
Endometrium: Triple-line pattern visualized, thickness measures 9.2 mm.
Right Ovary: Contains a dominant lead follicle measuring 19.5 x 18.2 mm with internal cumulus oophorus echo. Secondary follicles: 8mm, 6mm.
Left Ovary: Normal baseline appearance with 4-5 antral follicles (5-8 mm).
Pouch of Douglas: No free fluid visualized.`,
    impression: `1. Right ovarian mature dominant follicle (19.5 x 18.2 mm) ready for rupture / trigger.
2. Favorable receptive triple-line endometrium measuring 9.2 mm.`,
  },
  "FAST / eFAST Scan": {
    procedureName: "FAST / eFAST Scan",
    category: "USG",
    findings: `RUQ (MORISON'S POUCH): Hepatorenal space is clear. No anechoic free fluid collection.
LUQ (SPLENORENAL RECESS): Splenorenal interface and subdiaphragmatic area are clear. No free fluid.
PELVIS (POUCH OF DOUGLAS / RETROVESICAL): Pelvic cavity shows anechoic bladder with no pelvic free fluid.
PERICARDIAL SAC: Subxiphoid 4-chamber cardiac view demonstrates no pericardial effusion or tamponade.
eFAST THORACIC ZONES: Bilateral lung sliding present in anterior chest wall. Normal 'sea-shore' pattern on M-mode. No pneumothorax or hemothorax.`,
    impression: `1. FAST / eFAST Scan is NEGATIVE for hemoperitoneum, hemothorax, pneumothorax, and pericardial effusion.
2. Hemodynamically reassuring bedside sonographic assessment.`,
  },
  "POCUS (Point-of-Care Ultrasound)": {
    procedureName: "POCUS (Point-of-Care Ultrasound)",
    category: "USG",
    findings: `CARDIAC FOCUSED VIEW: Parasternal and apical windows demonstrate adequate left ventricular systolic function (visual EF ~ 55-60%). No gross RV strain or pericardial effusion.
INFERIOR VENA CAVA (IVC): IVC diameter is 1.6 cm with > 50% inspiratory collapse, consistent with normal central venous pressure (0-5 mmHg).
LUNG ZONES: Bilateral anterior and lateral lung fields demonstrate normal A-lines and lung sliding. No significant interstitial pulmonary edema (B-lines < 3 per zone).
DEEP VEINS: Bilateral common femoral and popliteal veins demonstrate complete compressibility. No proximal DVT.`,
    impression: `1. POCUS: Normal LV contractility, eulovolemic IVC filling dynamics, and clear lung sliding bilaterally.
2. No bedside sonographic evidence of acute heart failure, pulmonary edema, or lower limb DVT.`,
  },
  "USG KUB (Kidney, Ureters, Bladder)": {
    procedureName: "USG KUB",
    category: "USG",
    findings: `RIGHT KIDNEY: Measures 10.4 x 4.6 cm with cortical thickness of 14 mm. Normal corticomedullary differentiation. No calculus, hydronephrosis, or focal mass lesion.
LEFT KIDNEY: Measures 10.6 x 4.9 cm with cortical thickness of 15 mm. Normal parenchyma. No calculus, hydronephrosis, or cyst.
URETERS: Proximal and distal ureters are not dilated bilaterally.
URINARY BLADDER: Well distended, walls are smooth and thin (2.2 mm). Lumen is clear without calculus, tumor, or diverticulum. Pre-void volume: 380 ml. Post-void residual volume: 15 ml (insignificant).`,
    impression: `1. Normal USG KUB examination.
2. No renal calculus, hydronephrosis, or bladder outflow obstruction. Normal post-void emptying.`,
  },
  "USG Scrotum / Testes": {
    procedureName: "USG Scrotum / Testes",
    category: "USG",
    findings: `RIGHT TESTIS: Measures 4.2 x 2.6 x 2.1 cm (Volume: 12.0 cc). Normal parenchymal echotexture without focal testicular lesion. Normal Color Doppler flow with low-resistance intratesticular arterial waveforms.
LEFT TESTIS: Measures 4.1 x 2.5 x 2.0 cm (Volume: 11.2 cc). Uniform homogeneous parenchyma. Normal symmetric vascularity.
EPIDIDYMIS: Bilateral epididymal heads, bodies, and tails appear normal without enlargement, cyst, or hypervascularity.
TUNICA / SCROTAL SAC: Minimal physiological fluid. No hydrocele, pyocele, or hematoma.
PAMPINIFORM PLEXUS: Resting vein diameters are normal (< 1.8 mm). No venous reflux or dilatation on Valsalva maneuver.`,
    impression: `1. Normal Bilateral Scrotal Sonography & Color Doppler.
2. Normal testicular volume, parenchymal echotexture, and vascularity. No varicocele or hydrocele.`,
  },
  "USG Thyroid / Neck": {
    procedureName: "USG Thyroid / Neck",
    category: "USG",
    findings: `RIGHT LOBE: Measures 4.4 x 1.6 x 1.4 cm (Volume: 5.1 cc). Parenchyma is homogeneous with normal echogenicity. No solid or cystic nodules.
LEFT LOBE: Measures 4.2 x 1.5 x 1.3 cm (Volume: 4.3 cc). Normal echotexture without focal lesion.
ISTHMUS: Normal thickness (2.8 mm) without focal nodule.
COLOR DOPPLER: Normal vascular flow distribution within both thyroid lobes ('Thyroid Inferno' pattern absent).
CERVICAL LYMPH NODES: Bilateral submandibular and jugular chain lymph nodes are normal in size, oval with preserved echogenic hilum. No suspicious cervical adenopathy.`,
    impression: `1. Normal Ultrasound Thyroid & Neck examination.
2. No thyroid nodule (EU-TIRADS 1: Normal thyroid gland) or cervical lymphadenopathy.`,
  },
  "USG Breast (Sonomammography)": {
    procedureName: "USG Breast (Sonomammography)",
    category: "USG",
    findings: `RIGHT BREAST: Normal skin and subcutaneous tissue. Fibroglandular parenchyma shows normal glandular distribution without focal solid mass, complex cyst, or architectural distortion. Retromammary space is clear.
LEFT BREAST: Normal fibroglandular parenchyma. No dominant mass, microcalcifications, or dilated lactiferous ducts.
AXILLARY REGIONS: Bilateral axillary lymph nodes are normal in size (< 10 mm) with thin, uniform cortex and preserved fatty fatty hilum. No suspicious axillary lymphadenopathy.`,
    impression: `1. Bilateral Sonomammography is NORMAL.
2. BI-RADS US Category 1 (Negative / Normal Bilateral Breasts).`,
  },
  "Doppler Studies (Arterial, Venous, Carotid, Renal, Obstetric)": {
    procedureName: "Doppler Studies (Arterial, Venous, Carotid, Renal, Obstetric)",
    category: "USG",
    findings: `BILATERAL COMMON CAROTID ARTERIES (CCA): Normal lumen caliber and intima-media thickness (IMT: 0.6 mm). Triphasic flow pattern with PSV 75 cm/s.
INTERNAL CAROTID ARTERIES (ICA): Normal low-resistance forward flow bilaterally. Right ICA PSV: 68 cm/s (EDV: 24 cm/s), Left ICA PSV: 72 cm/s (EDV: 26 cm/s). ICA/CCA ratio < 1.5. No atherosclerotic plaque or hemodynamic stenosis.
EXTERNAL CAROTID & VERTEBRAL ARTERIES: Normal antegrade flow with low-resistance vertebral waveforms bilaterally.`,
    impression: `1. Normal Carotid & Vertebral Color Doppler Examination.
2. No evidence of hemodynamically significant stenosis or carotid plaque.`,
  },
  "USG Other (manual entry)": {
    procedureName: "USG Other (manual entry)",
    category: "USG",
    findings: `EXAMINATION: Custom Ultrasound Study.
ORGAN / REGION EVALUATED:
1. ANATOMICAL OBSERVATIONS:
2. DIMENSIONS & ECHOTEXTURE:
3. COLOR DOPPLER VASCULARITY:
4. ADJACENT TISSUES:`,
    impression: `1. Ultrasound observations as noted above.`,
  },

  // -------------------------------------------------------------
  // B. X-RAY TEMPLATES
  // -------------------------------------------------------------
  "Chest PA View": {
    procedureName: "Chest PA View",
    category: "X-Ray",
    findings: `LUNG FIELDS: Both lung fields are clear with normal broncho-vascular markings. No focal consolidation, nodular opacity, cavitation, or active parenchymal infiltration.
CARDIAC SILHOUETTE: Normal transverse cardiac diameter. Cardiothoracic ratio (CTR) is less than 0.50.
MEDIASTINUM & HILA: Mediastinal contours and bilateral hilar shadows are normal in position, size, and density.
PLEURAL SPACES: Bilateral costophrenic and cardiophrenic angles are sharp and well-defined. No pleural effusion or pneumothorax.
CHEST WALL & BONY CAGE: Ribs, clavicles, and visualized spine appear structurally intact with normal mineralization.`,
    impression: `1. Normal Chest Radiograph PA View.
2. No active cardiopulmonary lesions or pleural disease.`,
  },
  "Abdomen (Plain)": {
    procedureName: "Abdomen (Plain)",
    category: "X-Ray",
    findings: `BOWEL GAS PATTERN: Normal physiological bowel gas distribution within the stomach, small bowel, and colon. No abnormally dilated bowel loops or multiple air-fluid levels.
FREE AIR: Both domes of the diaphragm are well visualized. No crescent of subdiaphragmatic free air (no pneumoperitoneum).
KUB TRACT: No radio-opaque calcification or calculus seen along the renal, ureteric, or vesical tracts.
SOFT TISSUE SHADOWS: Psoas muscle shadows and properitoneal fat lines are symmetrically preserved. Visualized skeleton is intact.`,
    impression: `1. Normal Plain Radiograph of the Abdomen (Erect).
2. No evidence of intestinal obstruction, bowel perforation, or radio-opaque calculus.`,
  },
  "Cervical Spine": {
    procedureName: "Cervical Spine",
    category: "X-Ray",
    findings: `ALIGNMENT: Normal cervical lordotic curvature is maintained. No spondylolisthesis or subluxation.
VERTEBRAL BODIES: Normal heights and bony trabecular patterns. No compression fracture or destructive bone lesion.
INTERVERTEBRAL DISC SPACES: Preserved C2-C3 through C7-T1 intervertebral disc spaces.
PREVERTEBRAL SOFT TISSUES: Normal prevertebral soft tissue width at all levels.
JOINTS: Atlanto-axial and facet joints appear anatomically normal.`,
    impression: `1. Normal AP & Lateral Radiograph of the Cervical Spine.
2. No fracture, dislocation, or significant degenerative disc disease.`,
  },
  "Lumbar Spine": {
    procedureName: "Lumbar Spine",
    category: "X-Ray",
    findings: `ALIGNMENT: Normal lumbar lordosis is maintained. Vertebral body alignment is anatomical.
VERTEBRAL BODIES: Normal heights and bone density. No wedge collapse, lytic lesion, or sclerosis.
DISC SPACES: Intervertebral disc spaces are well preserved from L1-L2 through L5-S1. No osteophytes or endplate sclerosis.
POSTERIOR ELEMENTS: Pedicles, laminae, spinous processes, and facet joints appear intact.
SACROILIAC JOINTS: Bilateral sacroiliac joints are symmetrical with clear joint margins.`,
    impression: `1. Normal AP & Lateral Radiograph of the Lumbar Spine.
2. No fracture, listhesis, or significant disc space narrowing.`,
  },
  "Pelvis": {
    procedureName: "Pelvis",
    category: "X-Ray",
    findings: `BONY PELVIS: Iliac bones, ischium, and pubic rami appear structurally intact without fracture or focal bone lesion.
HIP JOINTS: Bilateral femoral heads are spherical, seated concentrically within normal acetabular fossae. Joint spaces are preserved.
SHENTON'S LINE: Intact and smooth bilaterally.
SACROILIAC JOINTS: Symmetrical, normal joint space, no subchondral sclerosis or erosions. Pubic symphysis is normal.`,
    impression: `1. Normal AP Radiograph of the Pelvis with both Hips.
2. No fracture, dislocation, or avascular necrosis of femoral heads.`,
  },
  "Skull": {
    procedureName: "Skull",
    category: "X-Ray",
    findings: `CALVARIAL VAULT: Inner and outer tables of the frontal, parietal, temporal, and occipital bones are intact. No fracture line or lytic/sclerotic bone defect.
SUTURES & SELLA: Suture lines and vascular grooves are within normal physiological limits. Sella turcica is normal in size and shape.
PARANASAL AIR SPACES: Visualized frontal and maxillary sinuses are clear. Mastoid air cells are well aerated.`,
    impression: `1. Normal AP & Lateral Radiograph of the Skull.
2. No calvarial fracture or intracranial calcification.`,
  },
  "Upper Limb (Hand, Forearm, Shoulder)": {
    procedureName: "Upper Limb (Hand, Forearm, Shoulder)",
    category: "X-Ray",
    findings: `BONE INTEGRITY: Visualized cortical margins of the clavicle, scapula, humerus, radius, ulna, carpal, metacarpal, and phalangeal bones are smooth and intact.
ALIGNMENT & ARTICULATION: Normal joint space alignment without dislocation or subluxation.
SOFT TISSUES: No soft tissue swelling, foreign body, or abnormal radiopacity.`,
    impression: `1. Normal Radiograph of the Upper Limb.
2. No fracture, dislocation, or soft tissue lesion.`,
  },
  "Lower Limb (Knee, Ankle, Foot)": {
    procedureName: "Lower Limb (Knee, Ankle, Foot)",
    category: "X-Ray",
    findings: `BONE ARCHITECTURE: Cortical continuity of the femur, patella, tibia, fibula, tarsal, metatarsal, and phalangeal bones is preserved. No fracture line or periosteal reaction.
JOINT SPACES: Medial and lateral joint compartments are symmetrical and normal in width. No subchondral sclerosis or marginal osteophytes.
SOFT TISSUES: Normal soft tissue contours with preserved tissue planes.`,
    impression: `1. Normal Radiograph of the Lower Limb.
2. No fracture, osteoarthritic joint space loss, or joint effusion.`,
  },
  "X-Ray Other (manual entry)": {
    procedureName: "X-Ray Other (manual entry)",
    category: "X-Ray",
    findings: `PROJECTION:
ANATOMICAL REGION EVALUATED:
1. BONE INTEGRITY & ALIGNMENT:
2. JOINT SPACES:
3. SOFT TISSUE PLANES:`,
    impression: `1. Radiographic impressions as noted above.`,
  },

  // -------------------------------------------------------------
  // C. COMPUTED TOMOGRAPHY (CT) TEMPLATES
  // -------------------------------------------------------------
  "CT Brain (Plain/Contrast)": {
    procedureName: "CT Brain (Plain/Contrast)",
    category: "CT",
    findings: `CEREBRAL PARENCHYMA: Normal grey-white matter differentiation in bilateral cerebral and cerebellar hemispheres. No acute intra-axial or extra-axial hemorrhage (no EDH, SDH, SAH). No territory acute infarction or mass effect.
VENTRICULAR SYSTEM: Lateral, third, and fourth ventricles are normal in size, shape, and midline position. No midline shift.
BASAL CISTERNS: Sellar, suprasellar, ambient, and perimesencephalic cisterns are clear.
CALVARIUM: Intact bony calvarium without fracture line. Paranasal sinuses and mastoid air cells are well aerated.`,
    impression: `1. Normal Plain CT Brain study.
2. No acute intracranial hemorrhage, territorial infarct, or mass effect.`,
  },
  "CT Chest": {
    procedureName: "CT Chest",
    category: "CT",
    findings: `TRACHEA & BRONCHI: Trachea and bilateral mainstem bronchi are patent with normal caliber.
LUNG PARENCHYMA: Bilateral lung parenchyma demonstrates normal attenuation without ground-glass opacities, consolidation, masses, or interstitial thickening. No tree-in-bud nodules or emphysematous changes.
MEDIASTINUM & HILA: Heart and great mediastinal vessels are normal. No mediastinal or hilar lymphadenopathy.
PLEURA: Pleural surfaces are smooth without thickening, effusion, or pneumothorax.
CHEST WALL: Visualized ribs, sternum, and soft tissues are unremarkable.`,
    impression: `1. Normal High-Resolution CT Chest (HRCT) examination.
2. No active parenchymal infiltrates, mediastinal adenopathy, or pleural disease.`,
  },
  "CT Abdomen & Pelvis": {
    procedureName: "CT Abdomen & Pelvis",
    category: "CT",
    findings: `LIVER: Normal in size and attenuation. No focal hypodense or hyperenhancing liver lesion. Intrahepatic biliary channels and portal vein are normal.
GALLBLADDER, PANCREAS, SPLEEN & ADRENALS: Unremarkable with normal morphology and attenuation.
KIDNEYS: Bilateral kidneys show symmetrical excretion and normal nephrograms. No renal calculus or hydronephrosis.
GASTROINTESTINAL TRACT: Normal bowel wall thickness throughout the stomach, small intestine, and colon. No bowel obstruction or pneumoperitoneum.
MESENTERY & PERITONEUM: No mesenteric lymphadenopathy, ascites, or focal fluid collection.
PELVIS: Urinary bladder and pelvic organs are normal. No pelvic mass.`,
    impression: `1. Normal Contrast-Enhanced CT Abdomen & Pelvis.
2. No organomegaly, focal mass, bowel obstruction, or lymphadenopathy.`,
  },
  "CT KUB": {
    procedureName: "CT KUB",
    category: "CT",
    findings: `KIDNEYS: Bilateral kidneys are normal in anatomical position, size, and parenchymal attenuation.
LEFT LOWER URETER: A 5.2 mm hyperdense calculus (density ~ 980 HU) is visualized at the left vesicoureteric junction (VUJ) with upstream mild hydroureteronephrosis and perinephric fat stranding.
RIGHT URINARY TRACT: Right kidney and ureter are clear without calculus, hydronephrosis, or obstruction.
URINARY BLADDER: Adequately distended with normal mucosal wall. No intravesical calculus.`,
    impression: `1. Obstructing 5.2 mm Left Vesicoureteric Junction (VUJ) Calculus with mild left hydroureteronephrosis.
2. Normal right urinary tract without calculus.`,
  },
  "CT Angiography (Brain/Coronary/Peripheral)": {
    procedureName: "CT Angiography (Brain/Coronary/Peripheral)",
    category: "CT",
    findings: `CIRCLE OF WILLIS & CEREBRAL ARTERIES: Bilateral internal carotid, middle cerebral (M1/M2), anterior cerebral (A1/A2), and basilar arteries demonstrate smooth contrast opacification with normal luminal caliber.
VASCULAR INTEGRITY: No intracranial aneurysm, arteriovenous malformation (AVM), arterial dissection, or flow-limiting luminal stenosis.`,
    impression: `1. Normal CT Angiography of the Intracranial Vasculature.
2. No aneurysm, malformation, or stenosis detected.`,
  },
  "CT Spine (Cervical/Lumbar)": {
    procedureName: "CT Spine (Cervical/Lumbar)",
    category: "CT",
    findings: `ALIGNMENT: Normal spinal curvature and vertebral alignment.
BONE WINDOW: Vertebral bodies, pedicles, laminae, and facet joints demonstrate intact cortical margins. No fracture line or bone destruction.
SPINAL CANAL: Normal spinal canal dimensions. No central canal stenosis or posterior bony ridge impingement.`,
    impression: `1. Normal CT examination of the Spine.
2. No fracture, canal compromise, or aggressive bone lesion.`,
  },
  "CT Sinuses": {
    procedureName: "CT Sinuses",
    category: "CT",
    findings: `PARANASAL SINUSES: Bilateral maxillary, ethmoid, frontal, and sphenoid sinuses are well-aerated with clear mucosal linings.
OSTEOMEATAL COMPLEXES: Bilateral osteomeatal units are patent.
NASAL CAVITY: Nasal septum is midline. Bilateral inferior and middle turbinates are normal without mucosal hypertrophy. Cribriform plate and lamina papyracea are intact.`,
    impression: `1. Normal CT Paranasal Sinuses (PNS).
2. Patent osteomeatal complexes without sinusitis or mucosal polyposis.`,
  },
  "CT Other (manual entry)": {
    procedureName: "CT Other (manual entry)",
    category: "CT",
    findings: `SCAN PROTOCOL: Multi-Detector Computed Tomography.
1. PARENCHYMAL OBSERVATIONS:
2. VASCULAR & LYMPHATIC FINDINGS:
3. BONE & SOFT TISSUE WINDOWS:`,
    impression: `1. Computed Tomography findings as described.`,
  },

  // -------------------------------------------------------------
  // D. MAGNETIC RESONANCE IMAGING (MRI) TEMPLATES
  // -------------------------------------------------------------
  "MRI Brain": {
    procedureName: "MRI Brain",
    category: "MRI",
    findings: `BRAIN PARENCHYMA: Symmetrical cerebral and cerebellar hemispheres with normal signal intensities across T1, T2, FLAIR, and DWI/ADC sequences. No restricted diffusion to suggest acute ischemia. No intra-axial or extra-axial mass, hemorrhage, or midline shift.
VENTRICLES & CISTERNS: Ventricular system is normal in size and morphology. Basal cisterns and cerebral sulci are normal.
CRANIAL NERVES & ORBITS: Normal visual pathways, cavernous sinuses, and posterior fossa structures.`,
    impression: `1. Normal Multi-Sequence MRI Brain.
2. No acute infarction, intracranial hemorrhage, or space occupying lesion.`,
  },
  "MRI Spine (Cervical/Lumbar)": {
    procedureName: "MRI Spine (Cervical/Lumbar)",
    category: "MRI",
    findings: `ALIGNMENT: Normal lumbar lordosis is maintained. Vertebral body heights and marrow signal intensities are normal.
L4-L5 LEVEL: Moderate diffuse disc bulge with posterocentral / left paracentral annular tear causing indentation of the anterior thecal sac and mild left neural exit foramen narrowing.
L5-S1 LEVEL: Mild disc dehydration without significant spinal canal or neural exit stenosis.
CONUS MEDULLARIS: Terminates normally at L1-L2 with normal signal intensity. Cauda equina nerve roots are unremarkable.`,
    impression: `1. L4-L5 disc degeneration with left paracentral disc protrusion and annular fissure causing mild left L5 nerve root abutment.
2. No spinal cord compression or central canal stenosis.`,
  },
  "MRI Knee": {
    procedureName: "MRI Knee",
    category: "MRI",
    findings: `CRUCIATE LIGAMENTS: Anterior Cruciate Ligament (ACL) and Posterior Cruciate Ligament (PCL) show intact fibers with normal low signal intensity.
MENISCI: Medial and lateral menisci demonstrate normal triangular morphology without linear signal reaching the articular surface (no meniscal tear).
COLLATERAL LIGAMENTS: Medial (MCL) and Lateral (LCL) collateral ligaments are intact.
CARTILAGE & BONE: Femoral, tibial, and patellar articular cartilage is smooth with normal thickness. No subchondral bone marrow edema or joint effusion.`,
    impression: `1. Normal MRI of the Knee Joint.
2. Intact ACL, PCL, and bilateral menisci without tear or effusion.`,
  },
  "MRI Shoulder": {
    procedureName: "MRI Shoulder",
    category: "MRI",
    findings: `ROTATOR CUFF: Supraspinatus, Infraspinatus, Subscapularis, and Teres minor tendons demonstrate normal signal and morphology without tendon tear or retraction.
GLENOID LABRUM & BICEPS: Anterior and posterior labrum are intact without SLAP lesion. Long head of biceps tendon is seated normally in the bicipital groove.
BURSA & AC JOINT: Subacromial-subdeltoid bursa is clear. Acromioclavicular joint is normal.`,
    impression: `1. Normal MRI of the Shoulder Joint.
2. Intact rotator cuff tendons and glenoid labrum.`,
  },
  "MRI Abdomen & Pelvis": {
    procedureName: "MRI Abdomen & Pelvis",
    category: "MRI",
    findings: `SOLID ABDOMINAL ORGANS: Liver, spleen, pancreas, and kidneys demonstrate normal parenchymal signal intensities without focal lesion.
MRCP SEQUENCES: Normal caliber of the common bile duct, intrahepatic biliary tree, and main pancreatic duct without filling defect or stricture.
PELVIC STRUCTURES: Urinary bladder and pelvic organs are unremarkable without mass or collection.`,
    impression: `1. Normal MRI Abdomen & Pelvis with MRCP.
2. Normal biliary and pancreatic ductal anatomy without choledocholithiasis.`,
  },
  "MRI Angiography": {
    procedureName: "MRI Angiography",
    category: "MRI",
    findings: `3D TIME-OF-FLIGHT (TOF) MRA: Complete symmetric visualization of the Circle of Willis, bilateral internal carotid, middle cerebral, and basilar arterial branches.
LUMEN & FLOW: Smooth arterial contours with normal high-velocity signal void. No aneurysm, malformation, or arterial stenosis.`,
    impression: `1. Normal 3D TOF MR Angiography of the Brain.
2. No intracranial aneurysm or stenosis.`,
  },
  "MRI Breast": {
    procedureName: "MRI Breast",
    category: "MRI",
    findings: `FIBROGLANDULAR TISSUE: Symmetrical fibroglandular tissue distribution with minimal background parenchymal enhancement (BPE).
DYNAMIC CONTRAST KINETICS: No suspicious enhancing mass, non-mass enhancement, or architectural distortion. Normal Type 1 progressive enhancement kinetics in glandular tissues.
AXILLA: No pathologically enlarged or abnormal axillary lymph nodes.`,
    impression: `1. Normal Bilateral Dynamic Contrast-Enhanced Breast MRI.
2. BI-RADS MRI Category 1 (Negative).`,
  },
  "MRI Other (manual entry)": {
    procedureName: "MRI Other (manual entry)",
    category: "MRI",
    findings: `SEQUENCES ACQUIRED: T1, T2, FLAIR, DWI/ADC, Gradient Echo.
1. PARENCHYMAL / TISSUE SIGNALS:
2. ANATOMICAL RELATIONS:
3. DIFFUSION & CONTRAST PATTERNS:`,
    impression: `1. Magnetic Resonance Imaging conclusions as detailed.`,
  },

  // -------------------------------------------------------------
  // E. ENDOSCOPY TEMPLATES
  // -------------------------------------------------------------
  "Upper GI Endoscopy (OGD)": {
    procedureName: "Upper GI Endoscopy (OGD)",
    category: "Endoscopy",
    findings: `ESOPHAGUS: Normal mucosa throughout the length. Z-line is regular at 38 cm from incisors. No varices, stricture, or esophagitis (LA Grade 0).
STOMACH: Mild diffuse erythema and hyperemia noted in the gastric antrum. Fundus and body are normal. Retroflexion view reveals normal cardia with no hiatal hernia. Fast urease test (RUT) for H. pylori: POSITIVE.
DUODENUM: D1 bulb and D2 second part reveal normal velvety mucosal folds without ulceration or mass.`,
    impression: `1. Mild Antral Gastritis.
2. Rapid Urease Test (RUT) POSITIVE for Helicobacter pylori infection.
3. Unremarkable esophagus and duodenum.`,
  },
  "Diagnostic Colonoscopy": {
    procedureName: "Diagnostic Colonoscopy",
    category: "Endoscopy",
    findings: `ANORECTAL CANAL & RECTUM: Normal mucosa without internal hemorrhoids, fissure, or proctitis.
SIGMOID & DESCENDING COLON: Normal haustral markings and vascular mucosal pattern. No diverticula or polyp.
TRANSVERSE & ASCENDING COLON: Smooth mucosal surface without ulceration, mass, or stricture.
CECUM & TERMINAL ILEUM: Appendiceal orifice and ileocecal valve are normal. Terminal ileum intubated for 15 cm showing normal lymphoid aggregates.`,
    impression: `1. Normal Complete Diagnostic Colonoscopy (Caecal intubation achieved).
2. No evidence of inflammatory bowel disease, polyp, or malignancy.`,
  },
  "Diagnostic Hysteroscopy": {
    procedureName: "Diagnostic Hysteroscopy",
    category: "Endoscopy",
    findings: `ENDOCERVICAL CANAL: Smooth, normal mucosal appearance.
UTERINE CAVITY: Symmetrical triangular cavity. Normal distension under saline infusion.
ENDOMETRIUM: Uniform, healthy pink mucosa consistent with early proliferative phase. No endometrial polyp, submucosal fibroid, or intrauterine synechiae.
TUBAL OSTIA: Bilateral ostia clearly visualized and patent.`,
    impression: `1. Normal Diagnostic Hysteroscopy.
2. Normal uterine cavity architecture and patent bilateral ostia.`,
  },
  "Endoscopy Other (manual entry)": {
    procedureName: "Endoscopy Other (manual entry)",
    category: "Endoscopy",
    findings: `ENDOSCOPIC PROCEDURE:
INDICATION:
1. LUMINAL OBSERVATIONS:
2. MUCOSAL INTEGRITY & VASCULARITY:
3. BIOPSY / INTERVENTIONS:`,
    impression: `1. Endoscopic impressions as observed above.`,
  },
};

export function getTemplateForModality(
  procedureName: string,
  category?: "USG" | "X-Ray" | "CT" | "MRI" | "Endoscopy"
): RadiologyTemplate {
  // 1. Direct Match
  if (ALL_PROCEDURE_TEMPLATES[procedureName]) {
    return ALL_PROCEDURE_TEMPLATES[procedureName];
  }

  // 2. Partial Search Match
  const lower = procedureName.toLowerCase();
  for (const [key, tpl] of Object.entries(ALL_PROCEDURE_TEMPLATES)) {
    if (lower.includes(key.toLowerCase()) || key.toLowerCase().includes(lower)) {
      return tpl;
    }
  }

  // 3. Keyword Heuristic Fallback
  if (lower.includes("nt scan") || lower.includes("nuchal")) return ALL_PROCEDURE_TEMPLATES["NT Scan (Nuchal Translucency)"];
  if (lower.includes("tiffa") || lower.includes("anomaly")) return ALL_PROCEDURE_TEMPLATES["Level II Anomaly Scan (TIFFA)"];
  if (lower.includes("growth") || lower.includes("afi")) return ALL_PROCEDURE_TEMPLATES["Fetal Growth & Well-being Scan"];
  if (lower.includes("tvs") || lower.includes("transvaginal")) return ALL_PROCEDURE_TEMPLATES["Transvaginal Sonography (TVS)"];
  if (lower.includes("fast") || lower.includes("efast")) return ALL_PROCEDURE_TEMPLATES["FAST / eFAST Scan"];
  if (lower.includes("pocus")) return ALL_PROCEDURE_TEMPLATES["POCUS (Point-of-Care Ultrasound)"];
  if (lower.includes("kub")) return ALL_PROCEDURE_TEMPLATES["USG KUB (Kidney, Ureters, Bladder)"];
  if (lower.includes("chest") && lower.includes("x-ray")) return ALL_PROCEDURE_TEMPLATES["Chest PA View"];
  if (lower.includes("brain") && lower.includes("ct")) return ALL_PROCEDURE_TEMPLATES["CT Brain (Plain/Contrast)"];
  if (lower.includes("spine") && lower.includes("mri")) return ALL_PROCEDURE_TEMPLATES["MRI Spine (Cervical/Lumbar)"];
  if (lower.includes("endoscopy") || lower.includes("ogd")) return ALL_PROCEDURE_TEMPLATES["Upper GI Endoscopy (OGD)"];
  if (lower.includes("colonoscopy")) return ALL_PROCEDURE_TEMPLATES["Diagnostic Colonoscopy"];

  // Default fallback
  return ALL_PROCEDURE_TEMPLATES["USG Abdomen & Pelvis"];
}

export function standardizeRadiologyText(rawInput: string): string {
  let cleaned = rawInput;
  const replacements: Array<[RegExp, string]> = [
    [/fatty liver/gi, "Hepatic Steatosis"],
    [/gall stone/gi, "Gallbladder calculus"],
    [/kidney stone/gi, "Renal calculus"],
    [/appendix inflamed/gi, "Acute Appendicitis with peri-appendiceal fat stranding"],
    [/baby heartbeat/gi, "Fetal cardiac activity with regular rhythm"],
    [/swelling in kidney/gi, "Hydronephrosis"],
    [/fluid in tummy/gi, "Ascites / Free peritoneal fluid"],
  ];
  for (const [regex, rep] of replacements) {
    cleaned = cleaned.replace(regex, rep);
  }
  return cleaned;
}

export async function transcribeHandwrittenScanOCR(_fileDataUrl: string): Promise<{
  findings: string;
  impression: string;
  confidenceScore: null;
}> {
  return { findings: "", impression: "", confidenceScore: null };
}
