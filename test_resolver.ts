import * as fs from 'fs';
import { CentralResolver } from './src/lib/CentralResolver';
import { classifyAstraIntent } from './src/components/CommandCenter/commandParser';

const testQueries = [
  'who are you',
  'show op list',
  'list of op patients',
  'show ip list',
  'list of ip patients',
  'how many patients',
  'show ICU patients',
  'open Rajesh',
  'show his CBC',
  'repeat CBC',
  'show pending lab',
  'order CBC for Rajesh',
  'show pending radiology',
  'order chest x-ray for Rajesh',
  'billing summary today',
  'OT status',
  'what changed in Rajesh',
  'differential diagnosis of fever',
  'search PubMed for dengue guidelines'
];

const mockPatient = { name: 'Rajesh Kumar', uhid: 'UHID-2026-8801', diagnosis: 'Dengue', complaints: 'Fever', vitals: { bp: '120/80', hr: 90, temp: 101, spo2: 98, rr: 18 } };
const mockContext = { selectedPatient: mockPatient as any, activeMode: 'Astra Copilot', activeModel: 'gemini-3.1-pro' };

async function runTests() {
  let output = '# COMMAND ROUTER DIAGNOSTIC\n\n| Input Query | Intent | Patient Bound | Route Response Prefix |\n|---|---|---|---|\n';
  
  for (const q of testQueries) {
    const intent = classifyAstraIntent(q);
    const res = await CentralResolver.resolveCommand(q, mockContext);
    
    // Check if the response contains patient-specific clinical text unexpectedly
    let isPatientBound = 'No';
    if (res.text.includes('Rajesh Kumar') && 
       !['PATIENT_QUERY', 'CLINICAL_REASONING', 'DIFFERENTIAL_DIAGNOSIS', 'LAB_ORDER', 'RADIOLOGY_ORDER', 'BLIND_SPOT_ANALYSIS', 'PATIENT_SUMMARY'].includes(intent) &&
       !q.toLowerCase().includes('rajesh') && !q.toLowerCase().includes('his')) {
       // Only bound if it's not a global command
       isPatientBound = 'Yes (Global List)';
    } else if (res.text.includes('Rajesh Kumar')) {
       isPatientBound = 'Yes (Expected)';
    }

    const prefix = res.text.substring(0, 50).replace(/\n/g, ' ');
    
    output += `| ${q} | ${intent} | ${isPatientBound} | ${prefix}... |\n`;
  }
  
  
  fs.writeFileSync('C:/Users/mural/.gemini/antigravity-ide/brain/52727fa8-f579-4964-9570-de92e6a4c4eb/COMMAND_ROUTER_DIAGNOSTIC.md', output);
  console.log('Diagnostic file created.');
}

runTests();



