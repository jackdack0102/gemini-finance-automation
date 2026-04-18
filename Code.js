/**
 * AI AUTOMATION FOR FINANCIAL REPORTS - BATCH PROCESSING
 * Cột A: URL Drive | Cột B: Tóm tắt | Cột C: Rủi ro | Cột D: Dự đoán
 */

const GEMINI_API_KEY = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
// Dùng đúng ID model gemini-2.0-flash mà m đã quét được
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${GEMINI_API_KEY}`;


function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('🚀 AI Automation')
      .addItem('➡️ Chạy toàn bộ danh sách (Cột A)', 'runBatchAutomation')
      .addItem('🎯 Phân tích ô đang chọn', 'runAutomation')
      .addSeparator()
      .addSubMenu(ui.createMenu('📂 Công cụ Drive')
          .addItem('1. Convert PDF sang Doc (OCR)', 'convertAllPdfInFolder')
          .addItem('2. Đổ link Doc vào cột A', 'listAllDocLinksToSheet'))
      .addSeparator()
      .addToUi();
}

/**
 * QUÉT TOÀN BỘ CỘT A VÀ XỬ LÝ
 */
function runBatchAutomation() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getActiveSheet();
  const lastRow = sheet.getLastRow();
  
  if (lastRow < 2) {
    ss.toast("❌ Không có dữ liệu để chạy (bắt đầu từ hàng 2).", "Lỗi");
    return;
  }

  // Lấy data từ A2 đến hàng cuối cùng
  const rangeA = sheet.getRange(2, 1, lastRow - 1, 1);
  const urls = rangeA.getValues();
  
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i][0];
    const currentRow = i + 2; 
    
    if (!url || url.toString().trim() === "") continue;

    try {
      // Kiểm tra nếu ô B đã có dữ liệu thì bỏ qua (trừ khi là lỗi)
      const currentResult = sheet.getRange(currentRow, 2).getValue();
      if (currentResult && !currentResult.toString().includes("Lỗi")) {
        console.log(`Hàng ${currentRow} đã có dữ liệu, bỏ qua.`);
        continue;
      }

      ss.toast(`⏳ Đang xử lý hàng ${currentRow}/${lastRow}...`, "AI Batch Mode");
      
      const contentText = extractTextFromDrive(url);
      const aiResults = callGemini(contentText);
      
      const resultRange = sheet.getRange(currentRow, 2, 1, 3);
      resultRange.setValues([aiResults]);
      resultRange.setWrap(true).setVerticalAlignment("top");
      
      // Nghỉ một chút để tránh overload API
      Utilities.sleep(2000);

    } catch (e) {
      console.error(`Lỗi hàng ${currentRow}: ` + e.toString());
      sheet.getRange(currentRow, 2).setValue("Lỗi: " + e.toString());
    }
  }
  
  ss.toast("✅ Đã xử lý xong toàn bộ danh sách!", "Hoàn tất");
}

/**
 * GIỮ LẠI HÀM CHẠY LẺ ĐỂ TEST
 */
function runAutomation() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getActiveSheet();
  const activeCell = sheet.getActiveCell();
  const url = activeCell.getValue();
  const currentRow = activeCell.getRow();

  if (activeCell.getColumn() !== 1 || !url) {
    ss.toast("⚠️ Chọn ô ở cột A!", "Lỗi");
    return;
  }

  try {
    ss.toast(`⏳ Đang xử lý hàng ${currentRow}...`, "AI Status");
    const contentText = extractTextFromDrive(url);
    const aiResults = callGemini(contentText);
    const range = activeCell.offset(0, 1, 1, 3);
    range.setValues([aiResults]);
    range.setWrap(true).setVerticalAlignment("top");
    ss.toast("✅ Xong!", "AI Status");
  } catch (e) {
    activeCell.offset(0, 1).setValue("Lỗi: " + e.toString());
  }
}

/**
 * TRÍCH XUẤT OCR (Drive API v2)
 */
function extractTextFromDrive(url) {
  const match = url.match(/[-\w]{25,}/);
  if (!match) throw new Error("Link Drive không chuẩn.");
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
 * GỌI GEMINI VỚI RETRY
 */
function callGemini(text) {
  const prompt = `Bạn là chuyên gia tài chính. Phân tích nội dung và trả về JSON tiếng Việt: {"summary": "...", "risk": "...", "prediction": "..."}. Xuống dòng và gạch đầu dòng (-) cho từng ý. Nội dung: ${text}`;
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
 * TỰ ĐỘNG CONVERT TOÀN BỘ PDF TRONG FOLDER SANG GOOGLE DOCS (OCR)
 * M nhập ID của Folder chứa PDF vào đây
 */
/**
 * TỰ ĐỘNG CONVERT TOÀN BỘ PDF TRONG FOLDER SANG GOOGLE DOCS (DÙNG DRIVE v3)
 */
/**
 * TỰ ĐỘNG CONVERT PDF SANG DOC VÀ LƯU VÀO ĐÚNG FOLDER
 */
function convertAllPdfInFolder() {
  const folderId = "1ftPvAWdlN4BuWoGhl8Us3uUNG_C5Z_wy"; // Thay ID của m vào
  const folder = DriveApp.getFolderById(folderId);
  const files = folder.getFilesByType(MimeType.PDF);
  
  let count = 0;
  
  while (files.hasNext()) {
    const file = files.next();
    const fileName = file.getName().replace(".pdf", "");
    
    // Kiểm tra xem bản Doc đã tồn tại trong folder này chưa
    const existingDocs = folder.getFilesByName(fileName);
    if (existingDocs.hasNext()) {
      console.log(`Bỏ qua: ${fileName} đã có bản Doc.`);
      continue;
    }

    try {
      const blob = file.getBlob();
      
      // Cấu hình Drive API v3 với PARENTS
      const resource = {
        name: fileName,
        mimeType: "application/vnd.google-apps.document",
        parents: [folderId] // ÉP NÓ VÀO ĐÚNG FOLDER NÀY
      };
      
      // Gọi v3 create
      Drive.Files.create(resource, blob, { ocr: true });
      
      count++;
      console.log(`✅ Đã convert và lưu vào folder: ${fileName}`);
    } catch (e) {
      console.error(`❌ Lỗi file ${fileName}: ` + e.toString());
    }
  }
  
  console.log(`🏁 Hoàn tất! Đã convert ${count} file vào folder.`);
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
    // Ghi vào cột A, bắt đầu từ hàng 3
    sheet.getRange(3, 1, links.length, 1).setValues(links);
    console.log(`Đã đổ ${links.length} link vào cột A.`);
  }
}




