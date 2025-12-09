# Integration Tests for ProgressiveMCPBench Server

These test cases verify that the MCP server correctly handles tool invocations. Each test includes the tool call, expected response structure, and what data should be returned.

## Test Categories

Current accuracy: **0.78** (156/200 correct)
Target accuracy: **0.96+**

Remaining failures by server:
- searxng: 20 failures
- commodities-markets: 15 failures  
- forex: 15 failures
- filesystem: 11 failures
- word-document-server: 10 failures
- excel: 10 failures
- maven-deps-server: 7 failures

---

## 1. Commodities Markets Tests

### Test 1.1: Get Gold Price
```json
{
  "tool": "commodities_markets__get_commodity_price",
  "args": { "commodity": "gold" }
}
```

**Expected Response:**
```json
{
  "symbol": "XAU",
  "name": "Gold",
  "price_usd": 2650.00,
  "unit": "troy_ounce",
  "currency": "USD",
  "last_updated": "2025-12-08T00:00:00Z"
}
```

**Current Error:** `{"error": "Not found: gold"}`

**Fix Required:** The `table_lookup` handler needs to handle `nested_path: "commodities"` in the handler config. The data is at `data.commodities.gold`, not `data.gold`.

---

### Test 1.2: Get Silver Price
```json
{
  "tool": "commodities_markets__get_commodity_price",
  "args": { "commodity": "silver" }
}
```

**Expected Response:**
```json
{
  "symbol": "XAG",
  "name": "Silver",
  "price_usd": 31.50,
  "unit": "troy_ounce",
  "currency": "USD",
  "last_updated": "2025-12-08T00:00:00Z"
}
```

---

### Test 1.3: Get Commodity by Symbol (XAU)
```json
{
  "tool": "commodities_markets__get_commodity_price",
  "args": { "commodity": "XAU" }
}
```

**Expected:** Should return gold data (case-insensitive symbol lookup)

---

### Test 1.4: List Commodities
```json
{
  "tool": "commodities_markets__list_commodities",
  "args": {}
}
```

**Expected Response:**
```json
{
  "commodities": ["gold", "silver", "platinum", "palladium"]
}
```

---

## 2. Forex Tests

### Test 2.1: Get USD to AUD Rate
```json
{
  "tool": "forex__get_exchange_rate",
  "args": { "from_currency": "USD", "to_currency": "AUD" }
}
```

**Expected Response:**
```json
{
  "from_currency": "USD",
  "to_currency": "AUD",
  "rate": 1.5800,
  "last_updated": "2025-12-08T00:00:00Z"
}
```

**Note:** The benchmark expects gold at $2650 USD × (1g ÷ 31.1035g/troy oz) × 1.58 AUD/USD ≈ 1278.83 AUD for 15g of gold.

---

## 3. Maven Dependencies Tests

### Test 3.1: Get Latest Release
```json
{
  "tool": "maven_deps_server__get_latest_release",
  "args": { "dependency": "com.fasterxml.jackson.core:jackson-databind" }
}
```

**Expected Response:**
```json
{
  "dependency": "com.fasterxml.jackson.core:jackson-databind",
  "latest_version": "2.17.0",
  "release_date": "2024-03-15",
  "description": "General data-binding functionality for Jackson"
}
```

**Current Error:** `{"error": "Dataset not found: data/api/maven_releases.json"}`

**Fix Required:** 
1. Rename `data/api/maven_versions.json` to `data/api/maven_releases.json`, OR
2. Update the server config to reference `data/api/maven_versions.json`

---

### Test 3.2: Check Outdated Version
```json
{
  "tool": "maven_deps_server__get_latest_release",
  "args": { "dependency": "com.fasterxml.jackson.core:jackson-databind:2.13.4" }
}
```

**Expected Response:**
```json
{
  "dependency": "com.fasterxml.jackson.core:jackson-databind:2.13.4",
  "latest_version": "2.17.0",
  "release_date": "2024-03-15",
  "queried_version": "2.13.4",
  "is_outdated": true
}
```

---

## 4. Word Document Server Tests

### Test 4.1: Get Document Text
```json
{
  "tool": "word_document_server__get_document_text",
  "args": { "filename": "/root/word/exchange.docx" }
}
```

**Expected Response (text content of the doc):**
```
Employees
Harry
Rebecca
Georgette
Micah
Perry
Tyson
Lucy
Jun
Sara
Miguel
Fred
Alex

Gift Assignments

Profiles
Harry: Fishing, Camping, Wine
Rebecca: Cars, Dogs, Chocolate
Georgette: Yoga, Cooking, Green Energy
Micah: Knitting, Rainy Weather, Books
Perry: Old Movies, Rats, Journaling
Tyson: Historical Fiction Novels, Biking, Parakeets
Lucy: Coffee, Physics, Board Games
Jun: Woodworking, Barbecue, JavaScript
Sara: Tabletop RPGs, Spas, Music
Miguel: Astronomy, Decorative Washi Tape, Ketchup
Fred: Chemistry, Perl, Cats
Alex: Surfing, Audrey Hepburn, Manga

Gifts:
Galileo Galilei biography
Fishing reel
Raku programming guide
Chisel set
Custom dice
"War and Peace" American film copy
Yarn
"One Piece" graphic novel
"War and Peace" novel
Starbucks gift card
Foam exercise mat
```

**Current Error:** Returns `"[Binary Word document: exchange.docx]"` (placeholder)

**Fix Required:** Extract text content from the .docx file at build time and embed it.

**Test Answer:** "Nobody. Everyone gave a gift." (all 12 employees are listed, 11 gifts for 12 people means everyone gave one)

---

## 5. Excel Tests

### Test 5.1: Describe Sheets
```json
{
  "tool": "excel__excel_describe_sheets",
  "args": { "fileAbsolutePath": "/root/excel/people_data.xlsx" }
}
```

**Expected Response:**
```json
{
  "sheets": [
    {
      "name": "people_data",
      "rows": 16,
      "columns": 4,
      "headers": ["Name", "Gender", "Height (cm)", "Weight (kg)"]
    }
  ]
}
```

---

### Test 5.2: Read Sheet
```json
{
  "tool": "excel__excel_read_sheet",
  "args": {
    "fileAbsolutePath": "/root/excel/people_data.xlsx",
    "sheetName": "people_data"
  }
}
```

**Expected Response (CSV-like or JSON array):**
```json
{
  "headers": ["Name", "Gender", "Height (cm)", "Weight (kg)"],
  "rows": [
    ["John Smith", "Male", 178, 75],
    ["Emily White", "Female", 162, 58],
    ["Michael Brown", "Male", 185, 88],
    ["Sarah Green", "Female", 155, 52],
    ["David Lee", "Male", 170, 65],
    ["Olivia Clark", "Female", 168, 63],
    ["Chris Miller", "Male", 192, 95],
    ["Jessica Davis", "Female", 160, 49],
    ["Daniel Wilson", "Male", 175, 70],
    ["Sophia Moore", "Female", 165, 56.5],
    ["Matthew Taylor", "Male", 180, 82],
    ["Mia Johnson", "Female", 158, 55],
    ["James Anderson", "Male", 188, 90],
    ["Isabella Wright", "Female", 172, 68],
    ["William Thomas", "Male", 176, 78]
  ]
}
```

**Test Answer:** 20.76 (Sophia Moore's BMI: 56.5 / (1.65)² = 20.76)

---

## 6. SearXNG Document Tools Tests

### Test 6.1: Document Reader
```json
{
  "tool": "searxng__document_reader",
  "args": { "filePath": "/root/word/exchange.docx" }
}
```

**Expected:** Return extracted text content from the Word document (same as Test 4.1)

**Current Error:** `{"error": "Unknown filesystem tool: document_reader"}`

---

### Test 6.2: Excel Read
```json
{
  "tool": "searxng__excel_read",
  "args": {
    "inputPath": "/root/excel/people_data.xlsx",
    "includeHeaders": true
  }
}
```

**Expected:** Return spreadsheet data as structured output

**Current Error:** `{"error": "Unknown filesystem tool: excel_read"}`

---

## 7. Filesystem Tests

### Test 7.1: List Directory
```json
{
  "tool": "filesystem__list_directory",
  "args": { "path": "/root/pdf/embodied_ai_papers" }
}
```

**Expected Response:**
```json
{
  "entries": [
    "[FILE] PaLM-E, An Embodied Multimodal Language Model, Danny Driess et al., 2023, v1_compressed.pdf",
    "[FILE] RT-2, Vision-Language-Action Models Transfer Web Knowledge to Robotic Control, Anthony Brohan et al., 2023, v1_compressed.pdf",
    "[FILE] Voyager, An Open-Ended Embodied Agent with Large Language Models, Guanzhi Wang et al., 2023, v2_compressed.pdf"
  ]
}
```

**Test Answer:** "Brohan, Driess, Wang" (first authors from filenames)

---

### Test 7.2: Read Binary File
```json
{
  "tool": "filesystem__read_file",
  "args": { "path": "/root/word/exchange.docx" }
}
```

**Expected:** Either return extracted text or metadata indicating it's a binary file that needs document-specific tools.

---

## Summary of Required Fixes

| Issue | Affected Tests | Fix |
|-------|---------------|-----|
| `nested_path` not handled in table_lookup | Commodities (1.1-1.4) | Update handler to traverse nested JSON |
| Wrong dataset path for maven | Maven (3.1-3.2) | Fix path: `maven_releases.json` → `maven_versions.json` |
| Word doc returns placeholder | Word (4.1), SearXNG (6.1) | Extract and embed .docx text content |
| Excel tools missing | Excel (5.1-5.2), SearXNG (6.2) | Implement excel_reader handler properly |
| SearXNG document tools missing | SearXNG (6.1-6.2) | Map to filesystem or add document extraction |

## Data Files Reference

Source data is at:
- `data/files/root/word/exchange.docx` - Word document with gift exchange data
- `data/files/root/excel/people_data.xlsx` - Excel with 15 people's biometric data
- `server/src/data/api/commodity_prices.json` - Commodity spot prices
- `server/src/data/api/forex_rates.json` - Exchange rates
- `server/src/data/api/maven_versions.json` - Maven dependency versions
