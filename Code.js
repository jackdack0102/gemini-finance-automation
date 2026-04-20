/**
 * AI AUTOMATION FOR FINANCIAL REPORTS - BATCH PROCESSING
 * Column A: URL Drive | Column B: Summary | Column C: Risk | Column D: Prediction
 */

const GEMINI_API_KEY = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
// Use the correct gemini-2.0-flash model ID that I scanned
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${GEMINI_API_KEY}`;


function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('🚀 AI Automation')
      .addItem('➡️ Run entire list (Column A)', 'runBatchAutomation')
      .addItem('🎯 Analyze selected cell', 'runAutomation')
      .addSeparator()
      .addSubMenu(ui.createMenu('📂 Drive Tools')
          .addItem('1. Convert PDF to Doc (OCR)', 'convertAllPdfInFolder')
          .addItem('2. Add Doc links to Column A', 'listAllDocLinksToSheet'))
      .addSeparator()
      .addToUi();
}

/**
 * SCAN ENTIRE COLUMN A AND PROCESS
 */
function runBatchAutomation() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getActiveSheet();
  const lastRow = sheet.getLastRow();
  
  if (lastRow < 2) {
    ss.toast("❌ No data to process (start from row 2).", "Error");
    return;
  }

  // Get data from A2 to the last row
  const rangeA = sheet.getRange(2, 1, lastRow - 1, 1);
  const urls = rangeA.getValues();
  
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i][0];
    const currentRow = i + 2; 
    
    if (!url || url.toString().trim() === "") continue;

    try {
      // Check if column B already has data, skip if it does (except for errors)
      const currentResult = sheet.getRange(currentRow, 2).getValue();
      if (currentResult && !currentResult.toString().includes("Error")) {
        console.log(`Row ${currentRow} already has data, skipping.`);
        continue;
      }

      ss.toast(`⏳ Processing row ${currentRow}/${lastRow}...`, "AI Batch Mode");
      
      const contentText = extractTextFromDrive(url);
      const aiResults = callGemini(contentText);
      
      const resultRange = sheet.getRange(currentRow, 2, 1, 3);
      resultRange.setValues([aiResults]);
      resultRange.setWrap(true).setVerticalAlignment("top");
      
      // Sleep a bit to avoid API overload
      Utilities.sleep(2000);

    } catch (e) {
      console.error(`Error row ${currentRow}: ` + e.toString());
      sheet.getRange(currentRow, 2).setValue("Error: " + e.toString());
    }
  }
  
  ss.toast("✅ Finished processing the entire list!", "Complete");
}

/**
 * KEEP SINGLE RUN FUNCTION FOR TESTING
 */
function runAutomation() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getActiveSheet();
  const activeCell = sheet.getActiveCell();
  const url = activeCell.getValue();
  const currentRow = activeCell.getRow();

  if (activeCell.getColumn() !== 1 || !url) {
    ss.toast("⚠️ Select a cell in column A!", "Error");
    return;
  }

  try {
    ss.toast(`⏳ Processing row ${currentRow}...`, "AI Status");
    const contentText = extractTextFromDrive(url);
    const aiResults = callGemini(contentText);
    const range = activeCell.offset(0, 1, 1, 3);
    range.setValues([aiResults]);
    range.setWrap(true).setVerticalAlignment("top");
    ss.toast("✅ Done!", "AI Status");
  } catch (e) {
    activeCell.offset(0, 1).setValue("Error: " + e.toString());
  }
}

/**
 * EXTRACT OCR (Drive API v2)
 */
function extractTextFromDrive(url) {
  const match = url.match(/[-\w]{25,}/);
  if (!match) throw new Error("Invalid Drive link.");
  const fileId = match[0];
  const file = DriveApp.getFileById(fileId);
  
  if (file.getMimeType() === "application/vnd.google-apps.document") {
    return DocumentApp.openById(fileId).getBody().getText().substring(0, 40000);
  }

  const blob = file.getBlob();
  try {
    const resource = { title: "temp_ocr_" + fileId, mimeType: "application/vnd.google-apps.document" };
    const tempDocFile = Drive.Files.insert(resource, blob, { ocr: true });
    const text = DocumentApp.openById(tempDocFile.id).getBody().getText();
    Drive.Files.remove(tempDocFile.id);
    return text.substring(0, 40000);
  } catch (err) {
    return blob.getDataAsString("UTF-8").substring(0, 40000);
  }
}

/**
 * CALL GEMINI WITH RETRY
 */
function callGemini(text) {
  const prompt = `You are a financial expert. Analyze the content and return JSON in English: {"summary": "...", "risk": "...", "prediction": "..."}. Use line breaks and bullet points (-) for each item. Content: ${text}`;
  const payload = { "contents": [{ "parts": [{ "text": prompt }] }] };
  const options = { "method": "post", "contentType": "application/json", "payload": JSON.stringify(payload), "muteHttpExceptions": true };

  let retry = 0;
  while (retry < 3) {
    const res = UrlFetchApp.fetch(GEMINI_URL, options);
    const json = JSON.parse(res.getContentText());

    if (json.candidates) {
      let raw = json.candidates[0].content.parts[0].text;
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) {
        const p = JSON.parse(match[0]);
        const clean = (s) => s ? s.replace(/\. /g, ".\n- ").trim() : "N/A";
        return [clean(p.summary), clean(p.risk), clean(p.prediction)];
      }
    }
    
    if (json.error && (json.error.code === 503 || json.error.code === 429)) {
      retry++;
      Utilities.sleep(4000 * retry);
      continue;
    }
    throw new Error(res.getContentText());
  }
}

/////// CONVERT PDF TO DOC
/**
 * AUTOMATICALLY CONVERT ALL PDF IN FOLDER TO GOOGLE DOCS (OCR)
 * Enter the ID of the Folder containing PDF here
 */
/**
 * AUTOMATICALLY CONVERT ALL PDF IN FOLDER TO GOOGLE DOCS (USE DRIVE v3)
 */
/**
 * AUTOMATICALLY CONVERT PDF TO DOC AND SAVE TO CORRECT FOLDER
 */
function convertAllPdfInFolder() {
  const folderId = "1ftPvAWdlN4BuWoGhl8Us3uUNG_C5Z_wy"; // Replace with your folder ID
  const folder = DriveApp.getFolderById(folderId);
  const files = folder.getFilesByType(MimeType.PDF);
  
  let count = 0;
  
  while (files.hasNext()) {
    const file = files.next();
    const fileName = file.getName().replace(".pdf", "");
    
    // Check if the Doc version already exists in this folder
    const existingDocs = folder.getFilesByName(fileName);
    if (existingDocs.hasNext()) {
      console.log(`Skipping: ${fileName} already has a Doc version.`);
      continue;
    }

    try {
      const blob = file.getBlob();
      
      // Configure Drive API v3 with PARENTS
      const resource = {
        name: fileName,
        mimeType: "application/vnd.google-apps.document",
        parents: [folderId] // FORCE IT INTO THE CORRECT FOLDER
      };
      
      // Call v3 create
      Drive.Files.create(resource, blob, { ocr: true });
      
      count++;
      console.log(`✅ Successfully converted and saved to folder: ${fileName}`);
    } catch (e) {
      console.error(`❌ Error with file ${fileName}: ` + e.toString());
    }
  }
  
  console.log(`🏁 Complete! Converted ${count} files to folder.`);
}

function listAllDocLinksToSheet() {
  const folderId = "1ftPvAWdlN4BuWoGhl8Us3uUNG_C5Z_wy";
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const folder = DriveApp.getFolderById(folderId);
  const docs = folder.getFilesByType(MimeType.GOOGLE_DOCS);
  
  let links = [];
  while (docs.hasNext()) {
    links.push([docs.next().getUrl()]);
  }
  
  if (links.length > 0) {
    // Write to column A, starting from row 3
    sheet.getRange(3, 1, links.length, 1).setValues(links);
    console.log(`Successfully added ${links.length} links to column A.`);
  }
}

//test triggered codebuild


