/**
 * Temple/Belton Deal Analyzer - Main Entry Point
 * 
 * This script orchestrates the entire analysis process:
 * 1. Fetch listings from all markets
 * 2. Apply the funnel strategy to identify top deals
 * 3. Output JSON files for the frontend
 * 
 * Usage:
 *   RENTCAST_API_KEY=your_key node src/index.js
 * 
 * Or with GitHub Actions (API key stored in secrets)
 */

const fs = require('fs');
const path = require('path');
const config = require('./config');
const rentcast = require('./rentcast');
const analyze = require('./analyze');

// Verify API key is present
if (!process.env.RENTCAST_API_KEY) {
  console.error('❌ Error: RENTCAST_API_KEY environment variable is not set');
  console.error('   Run with: RENTCAST_API_KEY=your_key node src/index.js');
  process.exit(1);
}

/**
 * Process a single market through the full analysis pipeline
 */
async function processMarket(market) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🏠 Processing Market: ${market.name}`);
  console.log(`${'='.repeat(60)}`);
  
  try {
    // Stage 1: Fetch all listings for this market
    const rawListings = await rentcast.getListingsForMarket(market);
    
    if (rawListings.length === 0) {
      console.log(`⚠️  No listings found for ${market.name}`);
      return analyze.createMarketOutput([], market);
    }
    
    // Stage 2: Apply heuristic filter
    const filteredListings = analyze.applyHeuristicFilter(rawListings);
    
    if (filteredListings.length === 0) {
      console.log(`⚠️  No listings passed heuristic filter for ${market.name}`);
      return analyze.createMarketOutput([], market);
    }
    
    // Stage 3: Select top candidates for deep analysis
    const topCandidates = analyze.selectTopCandidates(filteredListings);
    
    // Stage 4: Get actual rent estimates (expensive API calls)
    const withRentEstimates = await rentcast.enrichWithRentEstimates(topCandidates);
    
    if (withRentEstimates.length === 0) {
      console.log(`⚠️  Could not get rent estimates for ${market.name}`);
      return analyze.createMarketOutput([], market);
    }
    
    // Stage 5: Calculate investment metrics
    const withMetrics = analyze.calculateInvestmentMetrics(withRentEstimates);
    
    // Stage 6: Rank and select top deals
    const topDeals = analyze.rankAndSelectTopDeals(withMetrics);
    
    // Create output
    return analyze.createMarketOutput(topDeals, market);
    
  } catch (error) {
    console.error(`❌ Error processing ${market.name}: ${error.message}`);
    return analyze.createMarketOutput([], market);
  }
}

/**
 * Write results to JSON file
 */
function writeOutput(data, filename) {
  const outputPath = path.join(config.output.directory, filename);
  
  // Ensure output directory exists
  if (!fs.existsSync(config.output.directory)) {
    fs.mkdirSync(config.output.directory, { recursive: true });
  }
  
  fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));
  console.log(`  ✓ Written to ${outputPath}`);
}

/**
 * Validate output before writing (don't overwrite with empty data)
 */
function validateOutput(data, existingPath) {
  // If new data is empty but existing file has data, don't overwrite
  if (data.deals.length === 0 && fs.existsSync(existingPath)) {
    const existing = JSON.parse(fs.readFileSync(existingPath, 'utf-8'));
    if (existing.deals && existing.deals.length > 0) {
      console.log(`  ⚠️  New data is empty but existing file has ${existing.deals.length} deals.`);
      console.log(`      Keeping existing data to prevent blank page.`);
      return existing;
    }
  }
  return data;
}

/**
 * Main execution
 */
async function main() {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║     Temple/Belton Investment Deal Analyzer                ║
║     Analyzing: ${config.markets.map(m => m.name).join(', ').padEnd(36)}║
╚════════════════════════════════════════════════════════════╝
`);

  const startTime = Date.now();
  rentcast.resetApiCallCount();
  
  const results = {};
  
  // Process each market
  for (const market of config.markets) {
    const output = await processMarket(market);
    results[market.id] = output;
    
    // Write to file
    const filename = config.output.files[market.id];
    const outputPath = path.join(config.output.directory, filename);
    const validatedOutput = validateOutput(output, outputPath);
    writeOutput(validatedOutput, filename);
  }
  
  // Summary
  const endTime = Date.now();
  const duration = ((endTime - startTime) / 1000).toFixed(1);
  const apiCalls = rentcast.getApiCallCount();
  
  console.log(`
╔════════════════════════════════════════════════════════════╗
║     Analysis Complete!                                     ║
╠════════════════════════════════════════════════════════════╣`);
  
  for (const market of config.markets) {
    const result = results[market.id];
    const deals = result.deals.length;
    const topYield = result.summary.topYield;
    console.log(`║  ${market.name.padEnd(20)} ${String(deals).padStart(2)} deals | Top: ${topYield}% yield`.padEnd(61) + '║');
  }
  
  console.log(`╠════════════════════════════════════════════════════════════╣
║  Duration: ${duration}s | API Calls: ${apiCalls}`.padEnd(61) + `║
╚════════════════════════════════════════════════════════════╝
`);

  // Log file locations
  console.log('📁 Output files:');
  for (const market of config.markets) {
    const filename = config.output.files[market.id];
    console.log(`   ./data/${filename}`);
  }
}

// Run
main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
