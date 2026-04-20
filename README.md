This script automates financial document analysis directly inside Google Sheets.

Reads files from Google Drive (PDF/Docs)
Extracts text using OCR
Uses Gemini AI to generate:
Summary
Risk assessment
Predictions
Supports batch processing from a list of URLs

👉 Built for fast, scalable financial insights with minimal manual work.
⚙️ Flow
GitHub → CodeBuild → clasp push → GAS

🛠️ Setup
npm i -g @google/clasp
clasp login
terraform apply
git push origin main

⚠️ Notes
Keep auth token in AWS Secrets Manager
.clasp.json must have correct scriptId
Do not commit .clasprc.json
