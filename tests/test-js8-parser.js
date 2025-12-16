#!/usr/bin/env node

/**
 * Standalone test script for JS8Call message parser
 *
 * Usage: node tests/test-js8-parser.js
 *
 * Tests the parseJS8Message() and isValidGrid() functions.
 * Uses only Node.js assert module (no external dependencies).
 */

var assert = require("assert");

// ============================================================================
// PARSER FUNCTIONS (must match gt.js implementation)
// ============================================================================

/**
 * Validates if a string is a valid Maidenhead grid square (4 characters)
 */
function isValidGrid(grid)
{
  if (!grid || typeof grid != "string" || grid.length != 4)
  {
    return false;
  }

  var letters = grid.substring(0, 2).toUpperCase();
  var numbers = grid.substring(2, 4);

  return /^[A-R]{2}$/.test(letters) && /^[0-9]{2}$/.test(numbers);
}

/**
 * Parse JS8Call message format
 */
function parseJS8Message(message)
{
  if (!message || typeof message != "string")
  {
    return null;
  }

  var msg = message.trim();

  var colonIndex = msg.indexOf(":");
  if (colonIndex == -1)
  {
    return null;
  }

  var sender = msg.substring(0, colonIndex).trim();

  if (sender.charAt(0) == "`")
  {
    sender = sender.substring(1);
  }

  if (sender.length == 0)
  {
    return null;
  }

  var content = msg.substring(colonIndex + 1).trim();
  if (content.length == 0)
  {
    return null;
  }

  var words = content.split(/\s+/);
  var lastWord = words[words.length - 1];

  var result = {
    callsign: sender,
    grid: "",
    dxCall: "",
    cq: false
  };

  // Heartbeat
  if (words[0] == "@HB" || words[0] == "@hb")
  {
    if (isValidGrid(lastWord))
    {
      result.grid = lastWord.toUpperCase();
    }
    return result;
  }

  // CQ/ALLCALL
  if (words[0] == "@ALLCALL" || words[0] == "@allcall")
  {
    result.cq = true;
    if (isValidGrid(lastWord))
    {
      result.grid = lastWord.toUpperCase();
    }
    return result;
  }

  // Directed or free text
  if (words.length >= 1 && words[0].length > 0)
  {
    var firstWord = words[0];
    if (/[A-Za-z]/.test(firstWord) && /[0-9]/.test(firstWord))
    {
      result.dxCall = firstWord;
    }
  }

  return result;
}

// ============================================================================
// TEST RUNNER
// ============================================================================

var passCount = 0;
var failCount = 0;

function test(testName, testFn)
{
  try
  {
    testFn();
    console.log("  ✓ " + testName);
    passCount++;
  }
  catch (err)
  {
    console.error("  ✗ " + testName);
    console.error("    Error: " + err.message);
    failCount++;
  }
}

function describe(groupName)
{
  console.log("\n" + groupName);
}

// ============================================================================
// TESTS: isValidGrid()
// ============================================================================

describe("isValidGrid() - Grid Validation");

test("accepts valid 4-char grid EM73", function()
{
  assert.strictEqual(isValidGrid("EM73"), true);
});

test("accepts valid 4-char grid with lowercase em73", function()
{
  assert.strictEqual(isValidGrid("em73"), true);
});

test("accepts valid grid at boundary AA00", function()
{
  assert.strictEqual(isValidGrid("AA00"), true);
});

test("accepts valid grid at boundary RR99", function()
{
  assert.strictEqual(isValidGrid("RR99"), true);
});

test("rejects grid with invalid letters (S outside A-R)", function()
{
  assert.strictEqual(isValidGrid("SA73"), false);
});

test("rejects grid with too few characters", function()
{
  assert.strictEqual(isValidGrid("EM7"), false);
});

test("rejects grid with too many characters (6-char)", function()
{
  assert.strictEqual(isValidGrid("EM73ab"), false);
});

test("rejects null grid", function()
{
  assert.strictEqual(isValidGrid(null), false);
});

test("rejects empty string", function()
{
  assert.strictEqual(isValidGrid(""), false);
});

// ============================================================================
// TESTS: parseJS8Message() - Heartbeat
// ============================================================================

describe("parseJS8Message() - Heartbeat Messages");

test("parses heartbeat with grid at end", function()
{
  var result = parseJS8Message("K1ABC: @HB HEARTBEAT EM73");
  assert.strictEqual(result.callsign, "K1ABC");
  assert.strictEqual(result.grid, "EM73");
  assert.strictEqual(result.cq, false);
});

test("parses heartbeat without grid", function()
{
  var result = parseJS8Message("K1ABC: @HB HEARTBEAT");
  assert.strictEqual(result.callsign, "K1ABC");
  assert.strictEqual(result.grid, "");
});

test("parses heartbeat with lowercase @hb", function()
{
  var result = parseJS8Message("K1ABC: @hb HEARTBEAT em73");
  assert.strictEqual(result.callsign, "K1ABC");
  assert.strictEqual(result.grid, "EM73");
});

test("parses heartbeat with compound callsign /P", function()
{
  var result = parseJS8Message("K1ABC/P: @HB HEARTBEAT EM73");
  assert.strictEqual(result.callsign, "K1ABC/P");
  assert.strictEqual(result.grid, "EM73");
});

test("parses heartbeat with backtick-prefixed callsign", function()
{
  var result = parseJS8Message("`K1ABC/P: @HB HEARTBEAT EM73");
  assert.strictEqual(result.callsign, "K1ABC/P");
  assert.strictEqual(result.grid, "EM73");
});

test("heartbeat only checks last word for grid", function()
{
  // If grid-like word is NOT last, should not extract it
  var result = parseJS8Message("K1ABC: @HB EM73 HEARTBEAT");
  assert.strictEqual(result.grid, ""); // HEARTBEAT is not a valid grid
});

// ============================================================================
// TESTS: parseJS8Message() - ALLCALL/CQ
// ============================================================================

describe("parseJS8Message() - ALLCALL/CQ Messages");

test("parses ALLCALL CQ with grid at end", function()
{
  var result = parseJS8Message("K1ABC: @ALLCALL CQ DX EM73");
  assert.strictEqual(result.callsign, "K1ABC");
  assert.strictEqual(result.grid, "EM73");
  assert.strictEqual(result.cq, true);
});

test("parses ALLCALL without grid", function()
{
  var result = parseJS8Message("K1ABC: @ALLCALL CQ DX");
  assert.strictEqual(result.callsign, "K1ABC");
  assert.strictEqual(result.grid, "");
  assert.strictEqual(result.cq, true);
});

test("parses lowercase @allcall", function()
{
  var result = parseJS8Message("K1ABC: @allcall CQ DX EM73");
  assert.strictEqual(result.cq, true);
  assert.strictEqual(result.grid, "EM73");
});

test("ALLCALL only checks last word for grid", function()
{
  var result = parseJS8Message("K1ABC: @ALLCALL EM73 CQ DX");
  assert.strictEqual(result.grid, ""); // DX is not a valid grid
  assert.strictEqual(result.cq, true);
});

// ============================================================================
// TESTS: parseJS8Message() - Directed Messages
// ============================================================================

describe("parseJS8Message() - Directed Messages");

test("parses directed message with callsign recipient", function()
{
  var result = parseJS8Message("K1ABC: N2DEF SNR -05");
  assert.strictEqual(result.callsign, "K1ABC");
  assert.strictEqual(result.dxCall, "N2DEF");
  assert.strictEqual(result.grid, ""); // No grid extraction for directed
});

test("parses directed message - does NOT extract grid", function()
{
  // Even if there's a grid-like word, we don't extract it from directed messages
  var result = parseJS8Message("K1ABC: N2DEF EM73");
  assert.strictEqual(result.callsign, "K1ABC");
  assert.strictEqual(result.dxCall, "N2DEF");
  assert.strictEqual(result.grid, ""); // Intentionally not extracted
});

test("parses directed ACK response", function()
{
  var result = parseJS8Message("N2DEF: K1ABC ACK +12");
  assert.strictEqual(result.callsign, "N2DEF");
  assert.strictEqual(result.dxCall, "K1ABC");
});

// ============================================================================
// TESTS: parseJS8Message() - Free Text
// ============================================================================

describe("parseJS8Message() - Free Text");

test("free text with no callsign-like first word", function()
{
  var result = parseJS8Message("K1ABC: HELLO WORLD");
  assert.strictEqual(result.callsign, "K1ABC");
  assert.strictEqual(result.dxCall, ""); // HELLO has no numbers
  assert.strictEqual(result.grid, "");
});

test("free text does NOT extract grid-like words", function()
{
  // This is the key safety feature - don't extract false positive grids
  var result = parseJS8Message("K1ABC: HELLO AB12 WORLD");
  assert.strictEqual(result.callsign, "K1ABC");
  assert.strictEqual(result.grid, ""); // AB12 not extracted (could be false positive)
});

test("free text with grid-like word at end still not extracted", function()
{
  var result = parseJS8Message("K1ABC: HELLO WORLD EM73");
  assert.strictEqual(result.callsign, "K1ABC");
  assert.strictEqual(result.grid, ""); // Not extracted from free text
});

// ============================================================================
// TESTS: parseJS8Message() - Edge Cases
// ============================================================================

describe("parseJS8Message() - Edge Cases");

test("returns null for message without colon", function()
{
  var result = parseJS8Message("K1ABC HEARTBEAT EM73");
  assert.strictEqual(result, null);
});

test("returns null for empty message", function()
{
  var result = parseJS8Message("");
  assert.strictEqual(result, null);
});

test("returns null for null input", function()
{
  var result = parseJS8Message(null);
  assert.strictEqual(result, null);
});

test("returns null for colon with no content after", function()
{
  var result = parseJS8Message("K1ABC:");
  assert.strictEqual(result, null);
});

test("returns null for colon with only whitespace after", function()
{
  var result = parseJS8Message("K1ABC:   ");
  assert.strictEqual(result, null);
});

test("handles message with extra whitespace", function()
{
  var result = parseJS8Message("  K1ABC  :  @HB  HEARTBEAT  EM73  ");
  assert.strictEqual(result.callsign, "K1ABC");
  assert.strictEqual(result.grid, "EM73");
});

// ============================================================================
// TESTS: Real-World Examples
// ============================================================================

describe("parseJS8Message() - Real-World Examples");

test("K4ABC heartbeat from Georgia", function()
{
  var result = parseJS8Message("K4ABC: @HB HEARTBEAT EM85");
  assert.strictEqual(result.callsign, "K4ABC");
  assert.strictEqual(result.grid, "EM85");
});

test("W7XYZ portable heartbeat", function()
{
  var result = parseJS8Message("W7XYZ/P: @HB HEARTBEAT DN07");
  assert.strictEqual(result.callsign, "W7XYZ/P");
  assert.strictEqual(result.grid, "DN07");
});

test("N0CALL maritime heartbeat (no grid)", function()
{
  var result = parseJS8Message("N0CALL/MM: @HB HEARTBEAT");
  assert.strictEqual(result.callsign, "N0CALL/MM");
  assert.strictEqual(result.grid, "");
});

test("K1ABC CQ contest", function()
{
  var result = parseJS8Message("K1ABC: @ALLCALL CQ CONTEST FN31");
  assert.strictEqual(result.callsign, "K1ABC");
  assert.strictEqual(result.grid, "FN31");
  assert.strictEqual(result.cq, true);
});

test("directed query message", function()
{
  var result = parseJS8Message("K1ABC: N2DEF ?");
  assert.strictEqual(result.callsign, "K1ABC");
  assert.strictEqual(result.dxCall, "N2DEF");
});

// ============================================================================
// TEST RESULTS
// ============================================================================

console.log("\n" + "=".repeat(70));
console.log("Test Results: " + passCount + " passed, " + failCount + " failed");
console.log("=".repeat(70) + "\n");

if (failCount > 0)
{
  process.exit(1);
}
else
{
  process.exit(0);
}
