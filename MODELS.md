# SHASTRA AI — MODEL REGISTRY & ROUTING SPECIFICATION

## 1. Dynamic Model Registry

| Model Name | Provider | Parameters (Active / Total) | Context Window | Role / Capability |
|---|---|---|---|---|
| **bge-m3:latest** | Ollama Local (`127.0.0.1:11434`) | 567M / 567M Dense | 8,192 | Medical Embeddings & Hybrid Vector Search |
| **llama3.2:3b** | Ollama Local (`127.0.0.1:11434`) | 3.2B / 3.2B Dense | 128,000 | Fast Operations, Triage & CPOE Entity Resolution |
| **Kimi K3 (MoE)** | Moonshot Frontier | 104B Active / 2.8T Total | 200,000 | Complex Clinical Reasoning & Pathophysiology |
| **Gemini 2.0 / 3.7** | Google Frontier | Frontier Multi-modal | 1,000,000 | Long Context Medical Record Analysis & Vision |
| **Claude 3.7 Sonnet** | Anthropic Frontier | Frontier Hybrid | 200,000 | Deep Clinical Decision Support & Second Opinion |

## 2. Capability-Based Routing Rules

```
Fast Ops & CPOE Regex -------> Local Llama 3.2 (0-50ms latency)
Clinical Embeddings ----------> Local bge-m3 (Port 11434)
Complex Differentials --------> Frontier Cloud (Kimi/Claude/Gemini) + PubMed RAG
Medical Imaging --------------> Medical Vision Models
Voice STT / TTS --------------> Local Voicebox Suite
```
