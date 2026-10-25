import React, { createContext, useContext, useState, useEffect } from "react";
import { detectLanguageFromText } from "../utils/audioAlerts";

export type LanguageCode = "en" | "te" | "hi" | "ta";

export interface LanguageContextType {
  language: LanguageCode;
  setLanguage: (lang: LanguageCode) => void;
  detectAndSetLanguage: (text: string) => LanguageCode;
  t: (key: string, defaultEn?: string) => string;
}

// Common Medical & System Translation Dictionary preserving standard clinical terms
const DICTIONARY: Record<string, Record<LanguageCode, string>> = {
  // Departments & Titles
  clinical_command: {
    en: "Clinical Command",
    te: "క్లినికల్ కమాండ్ (వైద్య విభాగం)",
    hi: "क्लिनिकल कमान (डॉक्टर विभाग)",
    ta: "மருத்துவக் பிரிவு",
  },
  executive_analytics: {
    en: "Executive Analytics",
    te: "ఎగ్జిక్యూటివ్ అనలిటిక్స్ (సిఈఓ)",
    hi: "कार्यकारी विश्लेषण (सीईओ)",
    ta: "நிர்வாக பகுப்பாய்வு",
  },
  reception_print: {
    en: "Reception & Print Hub",
    te: "రిసెప్షన్ & ప్రింట్ హబ్",
    hi: "रिसेप्शन और प्रिंट हब",
    ta: "வரவேற்பு மையம்",
  },
  pharmacy: {
    en: "Pharmacy",
    te: "ఫార్మసీ (మందుల దుకాణం)",
    hi: "फार्मेसी (औषधालय)",
    ta: "மருந்தகம்",
  },
  radiology: {
    en: "Radiology & USG",
    te: "రేడియాలజీ & స్కానింగ్ (USG)",
    hi: "रेडियोलॉजी और स्कैनिंग (USG)",
    ta: "ரேடியோலஜி & ஸ்கேனிங்",
  },
  laboratory: {
    en: "Laboratory",
    te: "ల్యాబొరేటరీ (పరీక్షా కేంద్రం)",
    hi: "प्रयोगशाला (लैबोरेटरी)",
    ta: "ஆய்வகம்",
  },
  ward_ip: {
    en: "Ward & IP Beds",
    te: "వార్డ్ & ఇన్-పేషెంట్ బెడ్స్",
    hi: "वार्ड और आईपीडी बेड्स",
    ta: "வார்டு படுக்கைகள்",
  },

  // Common Clinical & AI Actions
  clinical_copilot: {
    en: "Astra Clinical Co-Pilot",
    te: "అస్త్ర వైద్య సహాయక AI (Co-Pilot)",
    hi: "अस्त्रा क्लिनिकल एआई सह-पायलट",
    ta: "அஸ்த்ரா மருத்துவ AI உதவி",
  },
  ask_ai_doctor: {
    en: "Ask AI Doctor / Doubts Engine",
    te: "వైద్య సందేహాల నివృత్తి AI",
    hi: "एआई डॉक्टर से प्रश्न पूछें",
    ta: "AI மருத்துவரிடம் கேளுங்கள்",
  },
  disease_guide: {
    en: "Disease Pathophysiology & Patient Education",
    te: "వ్యాధి విశ్లేషణ, వైద్య సలహాలు & ఇంటి చిట్కాలు",
    hi: "रोग विवरण, घरेलू नुस्खे और आहार गाइड",
    ta: "நோய் விவரங்கள் மற்றும் வீட்டு வைத்தியம்",
  },
  search_patient: {
    en: "Search patient name, UHID...",
    te: "పేషెంట్ పేరు లేదా UHID వెతకండి...",
    hi: "मरीज का नाम या UHID खोजें...",
    ta: "நோயாளி பெயர் அல்லது UHID தேடுக...",
  },
  home_remedies: {
    en: "Safe Home Remedies",
    te: "సురక్షితమైన ఇంటి చిట్కాలు",
    hi: "सुरक्षित घरेलू नुस्खे",
    ta: "பாதுகாப்பான வீட்டு வைத்தியம்",
  },
  food_habits: {
    en: "Food Habits & Diet Guide",
    te: "ఆహార నియమాలు & పథ్యం",
    hi: "खानपान गाइड और परहेज",
    ta: "உணவுப் பழக்கம் மற்றும் உணவு முறை",
  },
  pathophysiology: {
    en: "Disease Cause & Pathophysiology",
    te: "వ్యాధికి గల ముఖ్య కారణాలు (Pathophysiology)",
    hi: "रोग का कारण और विवरण (Pathophysiology)",
    ta: "நோயின் காரணம் மற்றும் இயக்கம்",
  },
  management_options: {
    en: "Medical Management & Treatments",
    te: "వైద్యుల చికిత్స విధానాలు (Medical Management)",
    hi: "चिकित्सा प्रबंधन और उपचार (Medical Management)",
    ta: "மருத்துவ சிகிச்சை முறைகள்",
  },
};

const LanguageContext = createContext<LanguageContextType>({
  language: "te",
  setLanguage: () => {},
  detectAndSetLanguage: () => "te",
  t: (key: string, defaultEn?: string) => defaultEn || key,
});

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<LanguageCode>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("astra_app_language") as LanguageCode;
      if (saved && ["en", "te", "hi", "ta"].includes(saved)) {
        return saved;
      }
    }
    return "te"; // Default to Telugu as primary regional setting, with toggle to Hindi / English / Tamil
  });

  const setLanguage = (lang: LanguageCode) => {
    setLanguageState(lang);
    if (typeof window !== "undefined") {
      localStorage.setItem("astra_app_language", lang);
    }
  };

  const detectAndSetLanguage = (text: string): LanguageCode => {
    const detected = detectLanguageFromText(text) as LanguageCode;
    if (detected && detected !== language) {
      setLanguage(detected);
    }
    return detected || language;
  };

  const t = (key: string, defaultEn?: string): string => {
    if (DICTIONARY[key] && DICTIONARY[key][language]) {
      return DICTIONARY[key][language];
    }
    return defaultEn || key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, detectAndSetLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => useContext(LanguageContext);
