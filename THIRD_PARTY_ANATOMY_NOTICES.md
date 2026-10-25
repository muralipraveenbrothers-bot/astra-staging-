# Third-Party Anatomy & Surgical Planning Notices

This document lists third-party projects integrated into or referenced by ASTRA Hospital OS for 3D anatomy visualization and orthopedic surgical planning.

---

## 1. Human Atlas

- **Source**: https://github.com/ashemag/human-atlas
- **License**: MIT License
- **Usage**: Primary detailed anatomy engine. Served as an isolated microfrontend at `/integrations/human-atlas/`.
- **Modifications**: None to source code. Built independently and served as static output.
- **Attribution**: Copyright (c) Human Atlas contributors. Full license text preserved in `external/human-atlas/LICENSE`.

## 2. BodyParts3D

- **Source**: https://pdbj.org/bodyparts3d/
- **License**: Creative Commons Attribution 4.0 International (CC BY 4.0)
- **Usage**: Anatomy data used by Human Atlas for 3D structure models.
- **Attribution**: BodyParts3D, © Database Program for Japan (DBPJ), licensed under CC BY 4.0.

## 3. Anatomy Explorer (Reference)

- **Source**: https://github.com/wchernandez/Anatomy-Explorer
- **License**: MIT License
- **Usage**: Reference for UX patterns (camera controls, layer controls, joint interaction, structure information panel).
- **Modifications**: Concepts only adapted — no direct code copied into ASTRA.
- **Attribution**: Copyright (c) Hernandez et al.

## 4. Z-Anatomy Assets

- **Source**: Z-Anatomy project (https://www.z-anatomy.com)
- **License**: Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0)
- **Files used** (stored in `public/`, originals kept; optimised copies in `public/models/anatomy/`):
  - `Skeleton.glb` → `public/models/anatomy/skeleton.glb` — 266 mesh nodes (bones, cartilage, teeth)
  - `Muscles.glb` → `public/models/anatomy/muscles.glb` — ~1 002 mesh nodes (muscles, tendons, ligaments)
  - `Vascular.glb` → `public/models/anatomy/vascular.glb` — 676 mesh nodes (heart, arteries, veins)
  - `Joints.glb` → `public/models/anatomy/joints.glb` — 409 mesh nodes (joint ligaments, capsules)
- **Modifications**: Optimised with `@gltf-transform` (dedup, prune, weld, simplify, quantize). Original node names preserved. No geometry added or relabelled.
- **Note**: Any derivative works that incorporate these model files must be distributed under CC BY-SA 4.0 (share-alike obligation).

## 5. SlicerBoneReconstructionPlanner

- **Source**: https://github.com/SlicerIGT/SlicerBoneReconstructionPlanner
- **License**: See project repository for license terms.
- **Usage**: 3D Slicer extension for mandibular reconstruction with vascularized fibula free flap. Integrated via local launch bridge architecture.
- **Regulatory Notice**: This tool is intended for surgical planning assistance only. It is NOT FDA approved. Clinician review required for all outputs.
- **Modifications**: None. Used as-is via Slicer's extension loading mechanism.

---

## Important License Notes

1. **MIT Licensed Code** (Human Atlas, Anatomy Explorer): Attribution required. License notices preserved.
2. **CC BY 4.0** (BodyParts3D): Attribution required.
3. **CC BY-SA 4.0** (Z-Anatomy): Attribution + Share-Alike required. Any derivative works must be distributed under the same license.
4. **SlicerBoneReconstructionPlanner**: Consult original repository for applicable license.

## Compliance

- All license files are preserved in their respective `external/` directories.
- No third-party code is merged into the ASTRA main bundle.
- Human Atlas is served as an isolated microfrontend to avoid package conflicts.
- Slicer integration uses process isolation (child_process.spawn) — no code linkage.

---

*Last updated: 2026-09-11*
