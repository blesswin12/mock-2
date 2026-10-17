# SAP CAP Practical Mock Exam 02: Sales & Customer Order Fulfillment

Welcome to **Practical Mock Exam 02** for the **SAP Certified Associate — Backend Developer (C_CPE)** certification.

## 📄 Exam Question Papers
- **Printable Vector PDF**: [`SAP_CAP_Practical_Mock_Exam_02.pdf`](file:///home/user/C_CPE/Mock-2/SAP_CAP_Practical_Mock_Exam_02.pdf)
- **Markdown Question Paper**: [`SAP_CAP_Practical_Mock_Exam_02.md`](file:///home/user/C_CPE/Mock-2/SAP_CAP_Practical_Mock_Exam_02.md)
- **Mock 1 vs Mock 2 Blueprint Guide**: [`MOCK_EXAM_ANALYSIS_AND_BLUEPRINT.md`](file:///home/user/C_CPE/Mock-2/MOCK_EXAM_ANALYSIS_AND_BLUEPRINT.md)

## 📁 Project Layout
```
Mock-2/
├── db/                                # Domain data models (schema.cds) and seed data
├── srv/                               # Service definitions (*.cds) and implementation logic (*.js)
├── app/                               # UI frontends / SAP Fiori Elements (optional)
├── SAP_CAP_Practical_Mock_Exam_02.pdf  # 3-Page Official Mock Exam PDF
├── SAP_CAP_Practical_Mock_Exam_02.md   # Complete Markdown Question Paper
├── MOCK_EXAM_ANALYSIS_AND_BLUEPRINT.md # Comparative Blueprint & Architecture Guide
└── package.json                       # Configured with dev SQLite + prod HANA/XSUAA
```

## 🚀 Recommended Workflow
1. Read the instructions in [`SAP_CAP_Practical_Mock_Exam_02.md`](file:///home/user/C_CPE/Mock-2/SAP_CAP_Practical_Mock_Exam_02.md).
2. Start by implementing **Task 1: Data Modeling** in `db/schema.cds`.
3. Verify syntax with `cds compile db/schema.cds --to sql`.
4. Run `cds watch` to launch your local server.
5. Work task-by-task through Tasks 2 to 8, testing both positive cases and negative edge cases.
