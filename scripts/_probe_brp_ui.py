import xml.etree.ElementTree as ET
t = ET.parse(r'external/SlicerBoneReconstructionPlanner/BoneReconstructionPlanner/Resources/UI/BoneReconstructionPlanner.ui')
root = t.getroot()
def walk(elem, depth=0, inCollapsible=False):
    if elem.tag == 'collapsibleButton':
        txt = ''
        for ch in elem.iter():
            if ch.tag == 'string':
                txt = ch.text or ''
        print(f"COLLAPSIBLE_SECTION: {elem.attrib.get('name','')} | {txt}")
        inCollapsible = True
    if elem.tag == 'widget' and elem.attrib.get('class') == 'QPushButton':
        txt = ''
        for ch in elem.iter():
            if ch.tag == 'string':
                txt = ch.text or ''
        print(f"  BUTTON: {elem.attrib.get('name','')} | {txt}")
    if elem.tag == 'widget' and elem.attrib.get('class') == 'QComboBox':
        print(f"  COMBO: {elem.attrib.get('name','')}")
    if elem.tag == 'widget' and elem.attrib.get('class') == 'QRMLSubjectHierarchyComboBox':
        print(f"  SUBJCOMBO: {elem.attrib.get('name','')}")
    for c in list(elem):
        walk(c, depth+1)
walk(root)