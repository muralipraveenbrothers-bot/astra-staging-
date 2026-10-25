import React, { useState } from "react";
import {
  Volume2,
  Play,
  Pause,
  Square,
  Sparkles,
  HeartPulse,
  Stethoscope,
  Apple,
  ShieldCheck,
  AlertTriangle,
  HelpCircle,
  Globe,
  Mic,
  Send,
  BookOpen,
  Activity,
  Flame,
  Droplet,
  Brain,
  MessageSquare,
  CheckCircle2,
  RefreshCw,
} from "lucide-react";
import { apiFetch, authHeaders } from "@/services/apiFetch";
import { speakHumanVoice, stopActiveSpeech, detectLanguageFromText } from "../../utils/audioAlerts";
import { useLanguage } from "../../context/LanguageContext";
import { ClinicalFormattedMessage } from "../Doctor/ClinicalFormattedMessage";

export type SupportedLanguage = "en" | "te" | "hi" | "ta";

interface DiseaseTopic {
  id: string;
  title: {
    en: string;
    te: string;
    hi: string;
    ta: string;
  };
  category: string;
  icon: any;
  pathophysiology: {
    en: string;
    te: string;
    hi: string;
    ta: string;
  };
  management: {
    en: string;
    te: string;
    hi: string;
    ta: string;
  };
  homeRemedies: {
    en: string;
    te: string;
    hi: string;
    ta: string;
  };
  foodHabits: {
    en: string;
    te: string;
    hi: string;
    ta: string;
  };
}

const DISEASE_LIBRARY: DiseaseTopic[] = [
  {
    id: "diabetes",
    title: {
      en: "Diabetes Mellitus (Type 2)",
      te: "మధుమేహం (షుగర్ వ్యాధి / టైప్ 2 ఫేజ్)",
      hi: "मधुमेह (शुगर / टाइप 2 डायबिटीज)",
      ta: "நீரிழிவு நோய் (சர்க்கரை நோய்)",
    },
    category: "Endocrine & Metabolic",
    icon: Droplet,
    pathophysiology: {
      en: "Type 2 Diabetes occurs when pancreas cells produce insufficient insulin or human body tissues become resistant to insulin action. Consequently, glucose cannot enter muscle and fat cells for energy and builds up dangerously in blood vessels, damaging nerve fibers, micro-capillaries in kidneys, retina, and coronary heart arteries over time.",
      te: "పాంక్రియాస్ (క్లోమ గ్రంథి) స్రవించే ఇన్సులిన్ హార్మోన్ లోపం లేదా శరీర కణాలు ఇన్సులిన్‌ను సరిగ్గా ఉపయోగించుకోలేకపోవడం వల్ల రక్తంలో గ్లూకోజ్ (షుగర్) స్థాయి విపరీతంగా పెరుగుతుంది. ఇది కళ్ళు, నరాలు, కిడ్నీలు మరియు గుండె ధమనులను దెబ్బతీస్తుంది.",
      hi: "जब अग्न्याशय (Pancreas) पर्याप्त इंसुलिन नहीं बनाता या शरीर की कोशिकाएं इंसुलिन का सही उपयोग नहीं कर पाती हैं, तो रक्त में ग्लूकोज का स्तर बढ़ जाता है। समय के साथ यह नसों, गुर्दों, आंखों और हृदय को नुकसान पहुंचाता है।",
      ta: "கணையம் போதுமான இன்சுலினை சுரக்காத போது அல்லது உடல் செல்கள் இன்சுலினை சரியாக பயன்படுத்தாத போது இரத்தத்தில் சர்க்கரை அளவு அதிகரிக்கிறது.",
    },
    management: {
      en: "Regular glycated hemoglobin (HbA1c) monitoring every 3 months (target < 7.0%). Standard clinical management involves Metformin therapy, DPP-4 inhibitors, SGLT2 inhibitors for renal protection, weight optimization, and daily physical activity (150 mins/week brisk walk).",
      te: "ప్రతి 3 నెలలకు ఒకసారి HbA1c పరీక్ష చేయించుకోవాలి (టార్గెట్ < 7.0%). వైద్యుల సూచన మేరకు మెట్‌ఫార్మిన్ (Metformin) లేదా ఇతర మందులు వాడాలి. రోజూ కనీసం 30-45 నిమిషాల వాకింగ్ చాలా అవసరం.",
      hi: "हर 3 महीने में HbA1c टेस्ट कराएं। डॉक्टर की सलाह से मेटफॉर्मिन दवा लें। रोजाना 30-45 मिनट तेज पैदल चलें और अपना वजन नियंत्रित रखें।",
      ta: "3 மாதத்திற்கு ஒருமுறை HbA1c பரிசோதனை செய்ய வேண்டும். தினமும் 30-45 நிமிடங்கள் நடைபயிற்சி மேற்கொள்வது அவசியம்.",
    },
    homeRemedies: {
      en: "1. Fenugreek seeds (మెంతులు / मेथी) soaked overnight in warm water consumed early morning lowers fasting glucose.\n2. Cinnamon powder (1/2 tsp) in warm water improves peripheral insulin sensitivity.\n3. Bitter gourd (కాకరకాయ) or Jamun seed powder (నేరేడు గింజల పొడి) taken before breakfast.",
      te: "1. రాత్రి నానబెట్టిన మెంతుల నీళ్ళు ఉదయాన్నే పరగడుపున తాగడం వల్ల ఫాస్టింగ్ షుగర్ తగ్గుతుంది.\n2. నేరేడు గింజల పొడి (1 టీస్పూన్) గోరువెచ్చని నీటిలో తీసుకోవడం చాలా మంచిది.\n3. దాల్చిన చెక్క పొడిని రోజూ కొద్దిగా ఆహారంలో చేర్చుకోవాలి.",
      hi: "1. रात भर भिगोया हुआ मेथी का पानी सुबह खाली पेट पिएं।\n2. जामुन की गुठली का पाउडर 1 चम्मच ताजे पानी के साथ लें।\n3. दालचीनी पाउडर का नियमित सेवन करें।",
      ta: "1. இரவில் ஊறவைத்த வெந்தயத் தண்ணீரை காலையில் குடிக்கவும்.\n2. நாவல் பழ கொடி பொடியை தினமும் எடுத்துக்கொள்ளவும்.",
    },
    foodHabits: {
      en: "WHAT TO EAT: Whole grains (ragi, jowar, brown rice), leafy greens (spinach, fenugreek), high-fiber pulses, guava, and almonds.\nSTRICTLY AVOID: White sugar, sweets, polished white rice, refined flour (maida), carbonated sodas, packaged fruit juices, and fried items.",
      te: "తీసుకోవాల్సిన ఆహారం: రాగులు, జొన్నలు, సామలు, కొర్రలు, పాలకూర, తోటకూర, పీచు పదార్థాలు ఎక్కువగా ఉండే కూరగాయలు, జామకాయ.\nమానవలసినవి: తెల్లటి అన్నం, మైదా, పంచదార, స్వీట్లు, కూల్ డ్రింక్స్, ప్యాకేజ్డ్ జ్యూస్‌లు మరియు నూనెలో వేయించిన పదార్థాలు.",
      hi: "क्या खाएं: रागी, ज्वार, ओट्स, हरी सब्जियां, अंकुरित अनाज, अमरूद और बादाम।\nक्या न खाएं: चीनी, मिठाइयां, मैदा, पॉलिश वाले चावल, कोल्ड ड्रिंक्स और समोसे-पकौड़े।",
      ta: "சாப்பிட வேண்டியவை: கேழ்வரகு, தினை, கீரைகள், நார்ச்சத்து உணவுகள்.\nதவிர்க்க வேண்டியவை: வெள்ளை சர்க்கரை, மைதா, பாலிஷ் அரிசி, பதப்படுத்தப்பட்ட பானங்கள்.",
    },
  },
  {
    id: "hypertension",
    title: {
      en: "Hypertension / High Blood Pressure",
      te: "అధిక రక్తపోటు (హై బిపి)",
      hi: "उच्च रक्तचाप (हाई ब्लड प्रेशर / बीपी)",
      ta: "உயர் இரத்த அழுத்தம் (ஹை பிபி)",
    },
    category: "Cardiovascular",
    icon: Activity,
    pathophysiology: {
      en: "Hypertension is caused by increased systemic vascular resistance in arterial walls due to vascular stiffening, excess sodium retention, sympathetic nerve overactivity, or endothelial dysfunction. Uncontrolled BP (>140/90 mmHg) exerts excessive strain on the left ventricle, predisposing to hemorrhagic stroke, kidney disease, and heart failure.",
      te: "రక్త నాళాలు గట్టిపడటం, అధిక ఉప్పు వినియోగం, మానసిక ఒత్తిడి వల్ల రక్తనాళాల గోడలపై రక్తం నెట్టే ఒత్తిడి (BP) ప్రమాదకరంగా పెరుగుతుంది. ఇది గుండెపోటు, బ్రెయిన్ స్ట్రోక్ (పక్షవాతం) మరియు కిడ్నీ వైఫల్యానికి ముఖ్య కారణం.",
      hi: "रक्तवाहिकाओं के सख्त होने, अत्यधिक नमक खाने और तनाव से धमनियों में दबाव बढ़ जाता है। अनियंत्रित बीपी (140/90 से अधिक) से हार्ट अटैक, ब्रेन स्ट्रोक और किडनी फेलियर का खतरा रहता है।",
      ta: "இரத்தக் குழாய்கள் இறுக்கமடைவதாலும் அதிக உப்பு உண்பதாலும் இரத்த அழுத்தம் அதிகரிக்கிறது. இது பக்கவாதம் மற்றும் மாரடைப்பிற்கு வழிவகுக்கும்.",
    },
    management: {
      en: "Daily BP monitoring log. Clinical regimen includes Telmisartan, Amlodipine, or ACE-inhibitors as prescribed. Mandatory dietary salt restriction (<3.75g sodium/day), smoking cessation, and weight management.",
      te: "రోజూ బిపి ట్రాక్ చేయాలి (సాధారణ స్థాయి: 120/80 mmHg). డాక్టర్ సూచించిన టెల్మిసార్టాన్ లేదా ఆమ్లోడిపైన్ మందులు క్రమం తప్పకుండా వాడాలి. రోజూ ఉప్పు పరిమాణం బాగా తగ్గించాలి.",
      hi: "नियमित बीपी की जांच कराएं। डॉक्टर द्वारा बताई गई बीपी की दवाएं (जैसे टेलमिसार्टन) समय पर लें। नमक का सेवन कम से कम करें।",
      ta: "இரத்த அழுத்தத்தை சீராக சோதிக்கவும். மருத்துவர் பரிந்துரைத்த மருந்துகளை தவறாமல் உட்கொள்ளவும். உப்பை குறைக்கவும்.",
    },
    homeRemedies: {
      en: "1. Fresh raw garlic clove (వెల్లుల్లి రసం) chewed morning relaxes blood vessels.\n2. Hibiscus tea (మందార పువ్వుల టీ) loaded with anthocyanins lowers systolic BP.\n3. Flaxseed powder (అవిసె గింజల పొడి / अलसी)rich in Omega-3.",
      te: "1. రోజూ పరగడుపున 1 పచ్చి వెల్లుల్లి రెబ్బ తినడం వల్ల రక్తనాళాలు సులభంగా విచ్చుకుంటాయి.\n2. ఎర్ర మందార పువ్వుల కషాయం టీ లాగా తాగడం బిపి తగ్గించడంలో అద్భుతంగా పనిచేస్తుంది.\n3. నానబెట్టిన అవిసె గింజలు రోజూ ఒక చెంచా తినాలి.",
      hi: "1. सुबह खाली पेट 1 कली कच्चा लहसुन चबाकर पानी पिएं।\n2. लाल गुड़हल (Hibiscus) के फूलों की चाय पिएं।\n3. अलसी के बीज (Flaxseeds) भुना हुआ 1 चम्मच खाएं।",
      ta: "1. தினமும் காலையில் பூண்டு பல் சாப்பிடவும்.\n2. செம்பருத்தி பூ டீ குடிப்பது இரத்த அழுத்தத்தை குறைக்கும்.",
    },
    foodHabits: {
      en: "WHAT TO EAT: DASH diet rich in potassium (potatoes, bananas, spinach, coconut water, pomegranates, curd).\nSTRICTLY AVOID: Pickles (ఊరగాయలు), papads, salted chips, processed canned meats, dry fish, fast foods, and alcohol.",
      te: "తీసుకోవాల్సిన ఆహారం: పొటాషియం ఎక్కువగా ఉండే అరటిపండ్లు, కొబ్బరిబోండం నీళ్ళు, పాలకూర, దానిమ్మపండ్లు, పె పెరుగు.\nమానవలసినవి: ఊరగాయలు (పచ్చళ్ళు), అప్పడాలు, ఉప్పు ఎక్కువగా ఉండే చిప్స్, ఎండుచేపలు, ఆల్కహాల్ మరియు పొగత్రాగడం.",
      hi: "क्या खाएं: केला, नारियल पानी, पालक, अनार, दही और पोटेशियम युक्त खाद्य पदार्थ।\nक्या न खाएं: अचार, पापड़, नमकीन चिप्स, डिब्बा बंद खाना, सूखी मछली और शराब।",
      ta: "சாப்பிட வேண்டியவை: இளநீர், வாழைப்பழம், கீரைகள், தயிர்.\nதவிர்க்க வேண்டியவை: ஊறுகாய், அப்பளம், அதிக உப்புள்ள தின்பண்டங்கள்.",
    },
  },
  {
    id: "acidity",
    title: {
      en: "Acidity, Gastritis & GERD",
      te: "అసిడిటీ, కడుపులో గ్యాస్ మంట (గ్యాస్ట్రిటిస్)",
      hi: "एसिडिटी, गैस और पेट में जलन (Gastritis)",
      ta: "அசிடிட்டி மற்றும் நெஞ்செரிச்சல்",
    },
    category: "Gastrointestinal",
    icon: Flame,
    pathophysiology: {
      en: "Gastritis is the inflammation of the stomach lining caused by hypersecretion of Hydrochloric Acid (HCl), H. pylori bacterial erosion, or prolonged NSAID painkiller use. GERD occurs when the lower esophageal sphincter (LES) fails to close tightly, allowing harsh gastric acid to reflux back into the esophagus, producing chest burning and sour regurgitation.",
      te: "జీర్ణాశయంలో హైడ్రోక్లోరిక్ యాసిడ్ ఎక్కువగా స్రవించడం, సమయానికి తిండి తినకపోవడం, మానసిక ఒత్తిడి లేదా నొప్పి బిళ్ళలు ఎక్కువ వాడటం వల్ల కడుపులో మంట, గ్యాస్ ఫార్మేషన్, ఛాతీలో మంట (నెమ్మదిగా పైకి తన్నడం) వస్తుంది.",
      hi: "पेट में अत्यधिक एसिड (Hydrochloric Acid) बनने या समय पर खाना न खाने से पेट की अंदरूनी परत में सूजन आ जाती है। इससे सीने में जलन, पेट में भारीपन और खट्टी डकारें आने लगती हैं।",
      ta: "இரைப்பையில் அமிலம் அதிகமாக சுரப்பதால் நெஞ்செரிச்சல் மற்றும் வயிற்று கோளாறுகள் ஏற்படுகின்றன.",
    },
    management: {
      en: "Clinical PPI therapy (Pantoprazole / Rabeprazole 40mg taken 30 mins before breakfast). Prokinetics like Levosulpiride or Domperidone if gastroparesis exists. Avoid sleeping within 2 hours of dinner and elevate bed head.",
      te: "ఉదయాన్నే పరగడుపున పాంటోప్రాజోల్ (Pantoprazole) టాబ్లెట్ వేసుకోవాలి. రాత్రి భోజనం చేసిన వెంటనే పడుకోకూడదు (కనీసం 2 గంటల వ్యవధి ఉండాలి). తల కింద ఎత్తైన దిండు పెట్టుకోవాలి.",
      hi: "सुबह खाली पेट पेंटोप्राजोल (Pantoprazole) गोली लें। रात के खाने के तुरंत बाद न सोएं (कम से कम 2 घंटे का अंतर रखें)।",
      ta: "காலையில் வெறும் வயிற்றில் பேன்டோபிரசோல் மாத்திரை எடுத்துக்கொள்ளலாம். சாப்பிட்ட உடனே படுக்க வேண்டாம்.",
    },
    homeRemedies: {
      en: "1. Carom seeds (వాము / अजवाइन) + Cumin (జీలకర్ర) boiled in water relieves trapping gas instantly.\n2. Cold milk (చల్లటి పాలు) or fresh coconut water neutralizes gastric acid.\n3. Tulsi leaves or Fennel seeds (సొంపు) chewed after meals.",
      te: "1. వాము మరియు జీలకర్ర గోరువెచ్చని నీటిలో మరిగించి తాగితే గ్యాస్, కడుపు ఉబ్బరం తక్షణమే తగ్గుతుంది.\n2. కాచని చల్లటి పాలు లేదా కొబ్బరిబోండం తాగడం వల్ల కడుపులో మంట తక్షణమే శాంతిస్తుంది.\n3. భోజనం తర్వాత ఒక చెంచా సొంపు నమలాలి.",
      hi: "1. अजवाइन और जीरा पानी में उबालकर पीने से गैस और पेट फूलना तुरंत ठीक होता है।\n2. ठंडा दूध या ताजा नारियल पानी पीने से एसिड शांत होता है।\n3. खाने के बाद 1 चम्मच सौंफ चबाएं।",
      ta: "1. ஓமம் மற்றும் சீரகத்தை தண்ணீரில் கொதிக்க வைத்து குடிக்கவும்.\n2. குளிர்ந்த பால் அல்லது இளநீர் குடிப்பது வயிற்று எரிச்சலை தணிக்கும்.",
    },
    foodHabits: {
      en: "WHAT TO EAT: Pomegranate, steamed rice, curd rice, bottle gourd (సొరకాయ), cucumber, and buttermilk with coriander.\nSTRICTLY AVOID: Extremely spicy chili powders, pickles, coffee, tea on empty stomach, cigarette smoking, citrus vinegar, and oily junk foods.",
      te: "తీసుకోవాల్సిన ఆహారం: పెరుగన్నం, సొరకాయ, బీరకాయ, కీరా దోసకాయ, మజ్జిగ, దానిమ్మ పండ్లు.\nమానవలసినవి: కారం ఎక్కువగా ఉండే వంటకాలు, మసాలాలు, పచ్చిమిర్చి, కాఫీ, టీ (పరగడుపున), ధూమపానం మరియు నూనె బజ్జీలు/సమోసాలు.",
      hi: "क्या खाएं: दही चावल, लौकी, तरोई, खीरा, ताजा छाछ और अनार।\nक्या न खाएं: अत्यधिक मिर्च-मसाले, चाय-कॉफी (खाली पेट), समोसा, शराब और सिगरेट।",
      ta: "சாப்பிட வேண்டியவை: தயிர் சாதம், சுரைக்காய், வெள்ளரிக்காய், மோர்.\nதவிர்க்க வேண்டியவை: அதிக காரம், டீ, காபி, எண்ணெயில் பொரித்த உணவுகள்.",
    },
  },
  {
    id: "thyroid",
    title: {
      en: "Thyroid Disorders (Hypothyroidism)",
      te: "థైరాయిడ్ సమస్యలు (హైపోథైరాయిడిజమ్)",
      hi: "थायरॉयड समस्या (हाइपोथायरॉयडिज्म)",
      ta: "தைராய்டு குறைபாடு",
    },
    category: "Endocrine",
    icon: Brain,
    pathophysiology: {
      en: "Hypothyroidism is characterized by deficient circulating thyroid hormones (T3/T4) due to autoimmune thyroiditis (Hashimoto's) or iodine deficiency. Low thyroid hormone impairs systemic basal metabolic rate (BMR), manifesting as fatigue, rapid weight gain, hair loss, cold intolerance, dry skin, constipation, and menstrual irregularities in females.",
      te: "గొంతు భాగంలో ఉండే థైరాయిడ్ గ్రంథి తగినంత థైరాక్సిన్ హార్మోన్‌ను ఉత్పత్తి చేయకపోవడం వల్ల శరీరంలో జీవక్రియల వేగం (Metabolism) బాగా మందగిస్తుంది. దీనివల్ల కారణం లేకుండా బరువు పెరగడం, తీవ్రమైన అలసట, జుట్టు రాలడం, కాళ్ళ వాపులు మరియు నెలసరి సమస్యలు వస్తాయి.",
      hi: "जब थायराइड ग्रंथि पर्याप्त थायरोक्सिन हार्मोन नहीं बनाती है, तो शरीर का मेटाबॉलिज्म धीमा हो जाता है। इससे बिना वजह वजन बढ़ना, बहुत ज्यादा थकान, बाल झड़ना और पैरों में सूजन आने लगती है।",
      ta: "தைராய்டு ஹார்மோன் சுரப்பு குறைவதால் உடல் எடை அதிகரிப்பு, சோர்வு மற்றும் முடி உதிர்தல் போன்ற பிரச்சனைகள் ஏற்படுகின்றன.",
    },
    management: {
      en: "Thyroid Stimulating Hormone (TSH) monitoring every 6-8 weeks. Synthetic Levothyroxine (Thyronorm/Eltroxin 25-100mcg) strictly taken daily early morning at 6:00 AM on a completely empty stomach with plain water. Wait at least 45 minutes before tea/breakfast.",
      te: "ఉదయాన్నే పరగడుపున 6 గంటలకు ఖాళీ కడుపుతో థైరోనామ్ (Thyronorm) టాబ్లెట్ వేసుకోవాలి. టాబ్లెట్ వేసుకున్న తర్వాత కనీసం 45 నిమిషాల వరకు కాఫీ, టీ లేదా తిండి తినకూడదు. ప్రతి 3 నెలలకు TSH పరీక్ష చేయించుకోవాలి.",
      hi: "सुबह खाली पेट सबसे पहले थायरोनॉर्म (Thyronorm) की गोली ताजे पानी से लें। गोली लेने के कम से कम 45 मिनट बाद तक चाय, कॉफी या नाश्ता न करें।",
      ta: "காலையில் வெறும் வயிற்றில் தைராய்டு மாத்திரையை தவறாமல் எடுத்துக்கொள்ளவும். 45 நிமிடங்கள் வரை உணவோ டீயோ அருந்த வேண்டாம்.",
    },
    homeRemedies: {
      en: "1. Coriander seeds (ధనియాల నీళ్ళు / धनिया पानी) boiled water taken morning regulates glandular activity.\n2. Brazil nuts or Pumpkin seeds rich in Selenium & Zinc.\n3. Regular neck rotation exercises & Pranayama (Ujjayi breathing).",
      te: "1. రోజూ రాత్రి నానబెట్టిన ధనియాల నీటిని ఉదయం మరిగించి తాగడం వల్ల థైరాయిడ్ గ్రంథి పనితీరు మెరుగుపడుతుంది.\n2. గుమ్మడి గింజలు మరియు నువ్వులు తీసుకోవడం మంచిది.\n3. రోజూ ఉజ్జాయి ప్రాణాయామం చేయడం వల్ల గొంతు భాగంలో హార్మోన్ల సమతుల్యత పెరుగుతుంది.",
      hi: "1. साबुत धनिया को पानी में उबालकर छानकर सुबह पिएं।\n2. कद्दू के बीज (Pumpkin seeds) और तिल खाएं।\n3. नियमित रूप से कपालभाति और उज्जायी प्राणायाम करें।",
      ta: "1. கொத்தமல்லி விதைகளை தண்ணீரில் கொதிக்க வைத்து குடிப்பது நல்லது.\n2. பிராணாயாமப் பயிற்சிகள் தைராய்டு சுரப்பை சீராக்கும்.",
    },
    foodHabits: {
      en: "WHAT TO EAT: Whole eggs, iodized salt, fish, brazil nuts, carrots, pumpkin, apples, and lentils.\nSTRICTLY AVOID (GOITROGENS): Raw cauliflower, cabbage, broccoli, raw kale, soya bean products, packaged refined flour, and processed sugar.",
      te: "తీసుకోవాల్సిన ఆహారం: గుడ్లు, అయోడైజ్డ్ ఉప్పు, చేపలు, క్యారెట్లు, గుమ్మడికాయ, ఆపిల్స్, పప్పు ధాన్యాలు.\nమానవలసినవి / ఉడకబెట్టకుండా తినకూడనివి: కాలిఫ్లవర్ (Cauliflower), క్యాబేజీ, బ్రోకోలీ, సోయాబీన్ మరియు మైదా పిండి పదార్థాలు.",
      hi: "क्या खाएं: आयोडीन युक्त नमक, अंडे, मछली, गाजर, कद्दू, दालें और सेब।\nक्या न खाएं (कच्चा न खाएं): फूलगोभी, पत्तागोभी, ब्रोकोली, सोयाबीन और ज्यादा मैदा।",
      ta: "சாப்பிட வேண்டியவை: முட்டை, மீன், கேரட், ஆப்பிள், பருப்பு வகைகள்.\nதவிர்க்க வேண்டியவை: முட்டைக்கோஸ், காலிஃபிளவர், சோயா பொருட்கள்.",
    },
  },
  {
    id: "fever_dengue",
    title: {
      en: "Viral Fever, Dengue & Typhoid Care",
      te: "వైరల్ జ్వరం, డెంగ్యూ & టైఫాయిడ్ జాగ్రత్తలు",
      hi: "वायरल बुखार, डेंगू और टाइफाइड देखभाल",
      ta: "டெங்கு மற்றும் வைரஸ் காய்ச்சல்",
    },
    category: "Infectious & General",
    icon: HeartPulse,
    pathophysiology: {
      en: "Dengue Flavivirus transmitted via Aedes aegypti mosquitoes triggers cytokine storm, vascular endothelial permeability, and bone marrow megakaryocyte suppression, causing rapid blood platelet drop and plasma leakage. Typhoid (Salmonella typhi) invades intestinal Peyer's patches causing sustained high fever, toxic apathy, and abdominal rose spots.",
      te: "ఈగలు మరియు దోమల వల్ల వ్యాపించే డెంగ్యూ వైరస్ రక్తంలో ప్లేట్‌లెట్స్ (Platelets) సంఖ్యను వేగంగా తగ్గిస్తుంది. దీనివల్ల తీవ్రమైన కీళ్ళ నొప్పులు, కళ్ళ వెనుక నొప్పి, చర్మంపై ఎర్రటి మచ్చలు మరియు రక్తస్రావ ప్రమాదం వస్తుంది.",
      hi: "डेंगू वायरस एडीज मच्छर के काटने से फैलता है जो शरीर में प्लेटलेट्स (Platelets) की संख्या तेजी से कम कर देता है। इससे जोड़ों में तेज दर्द, आंख के पीछे दर्द और खून बहने का खतरा रहता है।",
      ta: "டெங்கு வைரஸ் கொசுக்கள் மூலம் பரவி இரத்த தட்டுக்களின் (Platelets) எண்ணிக்கையை வேகமாக குறைக்கிறது.",
    },
    management: {
      en: "Oral Hydration Therapy (ORS, Tender Coconut Water 2-3 liters/day). Paracetamol 650mg TDS/QID for fever control. Complete Blood Count (CBC) daily to monitor Platelets and Hematocrit. STRICTLY AVOID NSAIDs (Ibuprofen / Diclofenac / Aspirin) as they induce severe internal gastrointestinal bleeding!",
      te: "ORal Rehydration Solution (ORS), కొబ్బరి నీళ్ళు, మజ్జిగ రోజుకు కనీసం 3 లీటర్లు తాగాలి. జ్వరానికి కేవలం పారాసిటమాల్ (Paracetamol) మాత్రమే వాడాలి. బ్రూఫెన్ (Ibuprofen) లేదా డైక్లోఫెనాక్ వంటి నొప్పి బిళ్ళలను డెంగ్యూలో ఎట్టిపరిస్థితుల్లోనూ వాడకూడదు!",
      hi: "खूब तरल पदार्थ पिएं (ORS, नारियल पानी, ताजा छाछ दिन में 3 लीटर)। बुखार के लिए केवल पैरासिटामोल (Paracetamol) लें। डेंगू में डिस्प्रिन या इबूप्रोफेन जैसी दर्द निवारक गोलियां भूलकर भी न लें!",
      ta: "நிறைய இளநீர் மற்றும் ORS குடிக்கவும். காய்ச்சலுக்கு பாராசிட்டமால் மட்டுமே எடுத்துக்கொள்ளவும். ஆஸ்பிரின்/இபுப்ரோஃபென் தவிர்க்கவும்.",
    },
    homeRemedies: {
      en: "1. Papaya leaf juice extract (బొప్పాయి ఆకుల రసం / पपीते के पत्ते का रस 25ml twice daily) boosts platelet megakaryocytes.\n2. Giloy (తిప్పతీగ / गिलोय) juice boosts innate white blood cell immunity.\n3. Goat milk or Pomegranate juice for bone marrow support.",
      te: "1. లేత బొప్పాయి ఆకుల రసం (25ml రోజుకు రెండుసార్లు) తాగడం వల్ల ప్లేట్‌లెట్స్ సంఖ్య వేగంగా పెరుగుతుంది.\n2. తిప్పతీగ (గర్భవతి లేదా అమృతవల్లి) కషాయం తాగడం వల్ల రోగనిరోధక శక్తి పెరుగుతుంది.\n3. దానిమ్మ రసం తీసుకోండి.",
      hi: "1. पपीते के ताजे पत्तों का रस (25ml दिन में दो बार) पीने से प्लेटलेट्स तेजी से बढ़ते हैं।\n2. गिलोय का काढ़ा पिएं जो इम्युनिटी बढ़ाता है।\n3. ताजा अनार का जूस पिएं।",
      ta: "1. பப்பாளி இலை சாறு குடிப்பது பிளேட்லெட்களை வேகமாக அதிகரிக்கும்.\n2. நிலவேம்பு குடிநீர் அருந்துவது காய்ச்சலை தணிக்கும்.",
    },
    foodHabits: {
      en: "WHAT TO EAT: Light digested foods (khichdi, sago kanji, vegetable soup, steamed apples, pomegranate, and boiled eggs).\nSTRICTLY AVOID: Heavy oily non-veg biryani, raw unwashed salads, cold ice creams, spicy sauces, and bakery biscuits.",
      te: "తీసుకోవాల్సిన ఆహారం: తేలికగా అరిగే జావ, సగ్గుబియ్యం కంజి, పెసరపప్పు కిచిడీ, వెజిటబుల్ సూప్, ఉడకబెట్టిన గుడ్డు, దానిమ్మపండ్లు.\nమానవలసినవి: బిర్యానీ, నూనె జంక్ ఫుడ్స్, మసాలాలు, పచ్చి కూరగాయల సలాడ్స్, కూల్ డ్రింక్స్ మరియు ఐస్ క్రీములు.",
      hi: "क्या खाएं: पतली मूंग दाल की खिचड़ी, साबूदाना कांजी, उबला अंडा, अनार, सूप और उबला हुआ पानी।\nक्या न खाएं: भारी बिर्याणी, तला हुआ खाना, ठंडा पानी, बाहर के कटे फल और जंक फूड।",
      ta: "சாப்பிட வேண்டியவை: கஞ்சி, கிச்சடி, காய்கறி சூப், வேகவைத்த முட்டை, மாதுளை.\nதவிர்க்க வேண்டியவை: பிரியாணி, எண்ணெயில் பொரித்த உணவுகள், குளிர்ந்த பானங்கள்.",
    },
  },
];

export const MultilingualHealthGuide: React.FC = () => {
  const { language, setLanguage, detectAndSetLanguage } = useLanguage();
  const selectedLang = language;
  const setSelectedLang = (lang: SupportedLanguage) => setLanguage(lang);
  const [selectedDisease, setSelectedDisease] = useState<DiseaseTopic>(DISEASE_LIBRARY[0]);
  const [activeTab, setActiveTab] = useState<"patho" | "mgmt" | "home" | "food">("patho");

  // Interactive AI Doctor Doubts Engine State
  const [patientDoubtQuery, setPatientDoubtQuery] = useState("");
  const [isAiConsulting, setIsAiConsulting] = useState(false);
  const [aiDoubtResponse, setAiDoubtResponse] = useState<string | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);

  // Pre-configured multi-lingual prompt pills
  const samplePills = {
    te: [
      "నాకు కడుపులో గ్యాస్ మరియు గుండెలో మంటగా ఉంది, ఏ ఆహారం తీసుకోవాలి?",
      "నాకు షుగర్ మరియు బిపి ఉంది, ఉదయాన్నే ఏమి తినాలి?",
      "మోకాళ్ళ నొప్పులకి ఏ ఇంటి చిట్కాలు పనిచేస్తాయి?",
      "డెంగ్యూ జ్వరంలో ప్లేట్‌లెట్స్ పెరగడానికి ఏమి చేయాలి?",
    ],
    hi: [
      "मुझे गैस और सीने में जलन है, खानपान में क्या ध्यान रखूं?",
      "मुझे शुगर है, सुबह खाली पेट क्या खाना चाहिए?",
      "घुटनों के दर्द के लिए कौन से घरेलू नुस्खे अच्छे हैं?",
      "डेंगू बुखार में प्लेटलेट्स बढ़ाने के लिए क्या करें?",
    ],
    en: [
      "What are the best home remedies for acidity and stomach gas?",
      "How to control high blood pressure naturally through salt restriction and diet?",
      "What foods should a diabetic strictly avoid in daily meals?",
      "How to naturally boost blood hemoglobin for anemia?",
    ],
    ta: [
      "அசிடிட்டி மற்றும் நெஞ்செரிச்சலுக்கு சிறந்த வீட்டு வைத்தியம் எது?",
      "சர்க்கரை நோயாளிகள் காலை உணவில் என்ன சாப்பிட வேண்டும்?",
    ],
  };

  // Speaker Broadcast for pre-configured topic section
  const handleBroadcastCurrentTopic = () => {
    if (isSpeaking) {
      stopActiveSpeech();
      setIsSpeaking(false);
      return;
    }

    let textToSpeak = "";
    if (activeTab === "patho") {
      textToSpeak = `${selectedDisease.title[selectedLang]}. ${selectedDisease.pathophysiology[selectedLang]}`;
    } else if (activeTab === "mgmt") {
      textToSpeak = `${selectedDisease.title[selectedLang]}. ${selectedDisease.management[selectedLang]}`;
    } else if (activeTab === "home") {
      textToSpeak = `${selectedDisease.title[selectedLang]}. ${selectedDisease.homeRemedies[selectedLang]}`;
    } else {
      textToSpeak = `${selectedDisease.title[selectedLang]}. ${selectedDisease.foodHabits[selectedLang]}`;
    }

    setIsSpeaking(true);
    speakHumanVoice(
      textToSpeak,
      () => setIsSpeaking(true),
      () => setIsSpeaking(false),
      () => setIsSpeaking(false),
      "empathetic",
      selectedLang,
      "female_voice_1"
    );
  };

  // Submit AI Doctor Doubt Consultation
  const handleConsultAiDoctor = async (queryToSubmit?: string) => {
    const query = queryToSubmit || patientDoubtQuery;
    if (!query.trim()) return;

    // Detect language script from query and update global language context
    detectAndSetLanguage(query);

    setIsAiConsulting(true);
    setAiDoubtResponse(null);

    try {
      const res = await apiFetch("/api/astra-clinical-ai", {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify({
          message: query,
          mode: "patient_education",
          activePlugin: "multilingual_health_guide",
          patientContext: {
            languagePreference: selectedLang,
            queryTopic: selectedDisease.id,
          },
        }),
      });

      const data = await res.json();
      if (data.reply) {
        setAiDoubtResponse(data.reply);
        // Automatically trigger native TTS playback in auto-detected language!
        const autoDetectedLang = detectLanguageFromText(data.reply);
        speakHumanVoice(
          data.reply,
          () => setIsSpeaking(true),
          () => setIsSpeaking(false),
          () => setIsSpeaking(false),
          "empathetic",
          autoDetectedLang,
          "female_voice_1"
        );
      } else {
        setAiDoubtResponse(
          "నమస్కారం! మీ సందేహానికి వైద్య సలహా సిద్ధమవుతోంది. దయచేసి వివరంగా వైద్యుడిని సంప్రదించండి."
        );
      }
    } catch (err) {
      console.error("AI Doctor Doubt Consultation Error:", err);
      setAiDoubtResponse(
        `Good day. Regarding "${query}": Please maintain strict hydration, consult a specialist physician, and follow prescribed dietary restrictions.`
      );
    } finally {
      setIsAiConsulting(false);
    }
  };

  return (
    <div className="space-y-6 font-sans">
      {/* Header Banner & Language Switcher */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-cyan-400 font-bold text-xs uppercase tracking-wider">
            <Globe className="w-4 h-4 text-cyan-400" /> Multilingual AI Hospital Reception & Health Broadcast
          </div>
          <h2 className="text-lg font-black text-white mt-1 flex items-center gap-2">
            <HeartPulse className="w-5 h-5 text-rose-500" />
            వ్యాధి విశ్లేషణ, వైద్య సలహాలు & ఇంటి చిట్కాలు (Disease Pathophysiology & Patient AI Doctor)
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Auto-detects language (తెలుగు / हिंदी / English) • Real-time Speaker Announcement • Home Remedies & Diet Advice
          </p>
        </div>

        {/* Language Selection Buttons */}
        <div className="flex items-center gap-1.5 bg-slate-950 p-1.5 rounded-xl border border-slate-800 shrink-0">
          <button
            onClick={() => setSelectedLang("te")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
              selectedLang === "te"
                ? "bg-cyan-600 text-white shadow"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            🇮🇳 తెలుగు (Telugu)
          </button>
          <button
            onClick={() => setSelectedLang("hi")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
              selectedLang === "hi"
                ? "bg-cyan-600 text-white shadow"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            🇮🇳 हिंदी (Hindi)
          </button>
          <button
            onClick={() => setSelectedLang("en")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
              selectedLang === "en"
                ? "bg-cyan-600 text-white shadow"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            🇬🇧 English
          </button>
          <button
            onClick={() => setSelectedLang("ta")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
              selectedLang === "ta"
                ? "bg-cyan-600 text-white shadow"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            🇮🇳 தமிழ் (Tamil)
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Common Disease Topics List */}
        <div className="lg:col-span-4 bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <h3 className="font-bold text-xs uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
              <BookOpen className="w-4 h-4 text-cyan-400" /> Select Disease Condition
            </h3>
            <span className="text-[10px] bg-cyan-950 text-cyan-300 border border-cyan-800 px-2 py-0.5 rounded-full font-mono">
              {DISEASE_LIBRARY.length} Master Topics
            </span>
          </div>

          <div className="space-y-2 max-h-[580px] overflow-y-auto pr-1">
            {DISEASE_LIBRARY.map((disease) => {
              const IconComp = disease.icon;
              const isSelected = selectedDisease.id === disease.id;
              return (
                <button
                  key={disease.id}
                  onClick={() => {
                    setSelectedDisease(disease);
                    if (isSpeaking) {
                      stopActiveSpeech();
                      setIsSpeaking(false);
                    }
                  }}
                  className={`w-full text-left p-3 rounded-xl border transition-all flex items-start gap-3 ${
                    isSelected
                      ? "bg-cyan-950/80 border-cyan-500 shadow-md shadow-cyan-950/50"
                      : "bg-slate-950 border-slate-800/80 hover:border-slate-700 hover:bg-slate-900/60"
                  }`}
                >
                  <div
                    className={`p-2 rounded-lg shrink-0 mt-0.5 ${
                      isSelected ? "bg-cyan-600 text-white" : "bg-slate-800 text-slate-400"
                    }`}
                  >
                    <IconComp className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold text-white truncate">
                      {disease.title[selectedLang]}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">{disease.category}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Column: Disease Detail View & Broadcast Audio + AI Doubt Engine */}
        <div className="lg:col-span-8 space-y-6">
          {/* Main Disease Display Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider bg-emerald-950 text-emerald-400 border border-emerald-800 px-2.5 py-1 rounded-md">
                  {selectedDisease.category}
                </span>
                <h3 className="text-base font-black text-white mt-2">
                  {selectedDisease.title[selectedLang]}
                </h3>
              </div>

              {/* Broadcast Audio Button */}
              <button
                onClick={handleBroadcastCurrentTopic}
                className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 shadow-lg transition-all ${
                  isSpeaking
                    ? "bg-rose-600 hover:bg-rose-500 text-white animate-pulse"
                    : "bg-cyan-600 hover:bg-cyan-500 text-white"
                }`}
              >
                {isSpeaking ? <Pause className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                <span>
                  {isSpeaking
                    ? "Stop Speaker Announcement"
                    : `Broadcast Announcement (${selectedLang.toUpperCase()})`}
                </span>
              </button>
            </div>

            {/* Content Tabs: Pathophysiology | Management | Home Remedies | Food Habits */}
            <div className="flex flex-wrap gap-2 border-b border-slate-800 pb-3">
              <button
                onClick={() => setActiveTab("patho")}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border ${
                  activeTab === "patho"
                    ? "bg-cyan-600 text-white border-cyan-400 shadow"
                    : "bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700"
                }`}
              >
                <Activity className="w-3.5 h-3.5" />
                🧬 Pathophysiology (వ్యాధి విధానం)
              </button>

              <button
                onClick={() => setActiveTab("mgmt")}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border ${
                  activeTab === "mgmt"
                    ? "bg-cyan-600 text-white border-cyan-400 shadow"
                    : "bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700"
                }`}
              >
                <Stethoscope className="w-3.5 h-3.5" />
                🩺 Medical Management (వైద్య చికిత్స)
              </button>

              <button
                onClick={() => setActiveTab("home")}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border ${
                  activeTab === "home"
                    ? "bg-emerald-600 text-white border-emerald-400 shadow"
                    : "bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700"
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                🌿 Home Remedies (ఇంటి చిట్కాలు)
              </button>

              <button
                onClick={() => setActiveTab("food")}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border ${
                  activeTab === "food"
                    ? "bg-purple-600 text-white border-purple-400 shadow"
                    : "bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700"
                }`}
              >
                <Apple className="w-3.5 h-3.5 text-lime-300" />
                🍎 Food Habits & Diet (ఆహార నియమాలు)
              </button>
            </div>

            {/* Display Box */}
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 text-sm text-slate-200 leading-relaxed whitespace-pre-wrap font-sans">
              {activeTab === "patho" && selectedDisease.pathophysiology[selectedLang]}
              {activeTab === "mgmt" && selectedDisease.management[selectedLang]}
              {activeTab === "home" && selectedDisease.homeRemedies[selectedLang]}
              {activeTab === "food" && selectedDisease.foodHabits[selectedLang]}
            </div>
          </div>

          {/* AI Doctor Interactive Doubts Engine (తెలుగు / हिंदी / English) */}
          <div className="bg-slate-900 border border-cyan-500/30 rounded-2xl p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-cyan-600/20 text-cyan-400">
                  <MessageSquare className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-white flex items-center gap-2">
                    AI Doctor Multilingual Doubt Engine
                    <span className="text-[10px] bg-cyan-950 text-cyan-300 border border-cyan-700 px-2 py-0.5 rounded-full font-mono">
                      Auto Detect Language
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400">
                    Ask doubts in Telugu (తెలుగు), Hindi (हिंदी), or English. AI Doctor responds in your exact language.
                  </p>
                </div>
              </div>
            </div>

            {/* Sample Query Pills */}
            <div className="space-y-1.5">
              <span className="text-[10px] uppercase font-bold text-slate-400">Quick Doubts Examples:</span>
              <div className="flex flex-wrap gap-2">
                {samplePills[selectedLang].map((pillText, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      setPatientDoubtQuery(pillText);
                      handleConsultAiDoctor(pillText);
                    }}
                    className="bg-slate-950 hover:bg-slate-800 border border-slate-800 hover:border-cyan-500/50 text-slate-300 hover:text-cyan-300 text-xs px-3 py-1.5 rounded-xl transition-all text-left"
                  >
                    💬 {pillText}
                  </button>
                ))}
              </div>
            </div>

            {/* Query Input Box */}
            <div className="flex gap-2">
              <input
                type="text"
                value={patientDoubtQuery}
                onChange={(e) => setPatientDoubtQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleConsultAiDoctor();
                }}
                placeholder={
                  selectedLang === "te"
                    ? "మీ ఆరోగ్య సందేహాన్ని తెలుగులో అడగండి (ఉదా: 'నాకు బిపి ఎక్కువగా ఉంది ఉప్పు తగ్గించాలా?')..."
                    : selectedLang === "hi"
                    ? "अपना स्वास्थ्य प्रश्न हिंदी में पूछें (उदा: 'मुझे एसिडिटी है, क्या खाऊं?')..."
                    : "Ask your medical query in English or Indian language..."
                }
                className="flex-1 bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded-xl px-4 py-3 text-xs text-white placeholder-slate-500 outline-none"
              />
              <button
                onClick={() => handleConsultAiDoctor()}
                disabled={isAiConsulting || !patientDoubtQuery.trim()}
                className="bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-bold px-5 py-3 rounded-xl text-xs flex items-center gap-2 cursor-pointer shadow-lg shrink-0"
              >
                {isAiConsulting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                <span>Ask AI Doctor</span>
              </button>
            </div>

            {/* AI Response Display Box */}
            {aiDoubtResponse && (
              <div className="mt-4 p-4 rounded-xl bg-slate-950 border border-emerald-500/40 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-emerald-400" /> AI Doctor Clinical Response & Guidance
                  </span>
                  <button
                    onClick={() => {
                      const lang = detectLanguageFromText(aiDoubtResponse);
                      speakHumanVoice(aiDoubtResponse, undefined, undefined, undefined, "empathetic", lang, "female_voice_1");
                    }}
                    className="text-[11px] bg-cyan-950 text-cyan-300 border border-cyan-800 px-2.5 py-1 rounded-lg flex items-center gap-1 font-bold hover:bg-cyan-900 transition-all"
                  >
                    <Volume2 className="w-3.5 h-3.5 text-cyan-400" /> Read Out Loud
                  </button>
                </div>

                <div className="text-xs text-slate-200">
                  <ClinicalFormattedMessage content={aiDoubtResponse} isAi={true} modelUsed="Astra Multilingual AI Doctor" />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
