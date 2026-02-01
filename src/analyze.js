/**
 * Deal Analysis Module
 * 
 * Implements the "Funnel Strategy" for identifying top investment deals:
 * 1. Broad sweep - fetch all listings
 * 2. Heuristic filter - quick yield estimate to eliminate obvious non-deals
 * 3. Deep dive - get actual rent estimates for promising properties
 * 4. Final ranking - sort by yield and select top deals
 */

const config = require('./config');

/**
 * Calculate gross yield percentage
 * 
 * @param {number} annualRent - Annual rental income
 * @param {number} price - Purchase price
 * @returns {number} - Gross yield as percentage
 */
function calculateGrossYield(annualRent, price) {
  if (!price || price === 0) return 0;
  return ((annualRent / price) * 100);
}

/**
 * Calculate estimated monthly cash flow (simplified)
 * 
 * @param {number} monthlyRent - Monthly rental income
 * @param {number} price - Purchase price
 * @returns {number} - Estimated monthly cash flow
 */
function calculateMonthlyCashFlow(monthlyRent, price) {
  const annualTaxes = price * config.analysis.propertyTaxRate;
  const monthlyTaxes = annualTaxes / 12;
  const vacancyLoss = monthlyRent * config.analysis.vacancyRate;
  const managementCost = monthlyRent * config.analysis.managementFee;
  
  // Simplified NOI (not including mortgage - that depends on buyer's financing)
  const estimatedExpenses = monthlyTaxes + vacancyLoss + managementCost;
  return monthlyRent - estimatedExpenses;
}

/**
 * Stage 1: Apply heuristic filter to eliminate obvious non-deals
 * Uses $/sqft estimate before making expensive API calls
 * 
 * @param {Array} listings - Raw listings from API
 * @returns {Array} - Filtered listings that pass heuristic threshold
 */
function applyHeuristicFilter(listings) {
  console.log(`\n🔍 Stage 1: Applying heuristic filter to ${listings.length} listings...`);
  
  const filtered = listings.filter(listing => {
    // Skip if missing required data
    if (!listing.price || !listing.squareFootage) {
      return false;
    }
    
    // Estimate rent using $/sqft heuristic
    const estimatedMonthlyRent = listing.squareFootage * config.analysis.heuristicRentPerSqft;
    const estimatedAnnualRent = estimatedMonthlyRent * 12;
    const heuristicYield = calculateGrossYield(estimatedAnnualRent, listing.price);
    
    // Keep if yield exceeds minimum threshold
    return heuristicYield >= config.analysis.minYieldThreshold;
  });
  
  console.log(`  ✓ ${filtered.length} listings passed heuristic filter (${listings.length - filtered.length} eliminated)`);
  return filtered;
}

/**
 * Stage 2: Sort by heuristic yield and take top candidates for deep analysis
 * 
 * @param {Array} listings - Filtered listings
 * @returns {Array} - Top candidates for rent estimate lookup
 */
function selectTopCandidates(listings) {
  console.log(`\n🎯 Stage 2: Selecting top ${config.analysis.maxPropertiesToAnalyze} candidates for deep analysis...`);
  
  // Calculate heuristic yield for sorting
  const withHeuristicYield = listings.map(listing => {
    const estimatedMonthlyRent = listing.squareFootage * config.analysis.heuristicRentPerSqft;
    const heuristicYield = calculateGrossYield(estimatedMonthlyRent * 12, listing.price);
    return {
      ...listing,
      heuristicYield,
    };
  });
  
  // Sort by heuristic yield (highest first)
  withHeuristicYield.sort((a, b) => b.heuristicYield - a.heuristicYield);
  
  // Take top candidates
  const topCandidates = withHeuristicYield.slice(0, config.analysis.maxPropertiesToAnalyze);
  
  console.log(`  ✓ Selected ${topCandidates.length} candidates`);
  if (topCandidates.length > 0) {
    console.log(`  📈 Heuristic yield range: ${topCandidates[topCandidates.length - 1].heuristicYield.toFixed(1)}% - ${topCandidates[0].heuristicYield.toFixed(1)}%`);
  }
  
  return topCandidates;
}

/**
 * Stage 3: Calculate final metrics using actual rent estimates
 * 
 * @param {Array} listings - Listings with rent estimates
 * @returns {Array} - Listings with calculated investment metrics
 */
function calculateInvestmentMetrics(listings) {
  console.log(`\n📊 Stage 3: Calculating investment metrics...`);
  
  return listings.map(listing => {
    const monthlyRent = listing.rentEstimate;
    const annualRent = monthlyRent * 12;
    const grossYield = calculateGrossYield(annualRent, listing.price);
    const monthlyCashFlow = calculateMonthlyCashFlow(monthlyRent, listing.price);
    
    // Gross Rent Multiplier (lower is better)
    const grm = listing.price / annualRent;
    
    // Does it meet the 1% rule? (monthly rent >= 1% of price)
    const onePercentRule = monthlyRent >= (listing.price * 0.01);
    
    return {
      ...listing,
      grossYield: Math.round(grossYield * 10) / 10, // Round to 1 decimal
      monthlyCashFlow: Math.round(monthlyCashFlow),
      annualRent,
      grm: Math.round(grm * 10) / 10,
      meetsOnePercentRule: onePercentRule,
    };
  });
}

/**
 * Stage 4: Final ranking - sort by yield and select top deals
 * 
 * @param {Array} listings - Listings with investment metrics
 * @returns {Array} - Top deals sorted by yield
 */
function rankAndSelectTopDeals(listings) {
  console.log(`\n🏆 Stage 4: Ranking and selecting top ${config.analysis.topDealsCount} deals...`);
  
  // Sort by gross yield (highest first)
  const sorted = [...listings].sort((a, b) => b.grossYield - a.grossYield);
  
  // Take top deals
  const topDeals = sorted.slice(0, config.analysis.topDealsCount);
  
  if (topDeals.length > 0) {
    console.log(`  ✓ Top deal: ${topDeals[0].grossYield}% yield at ${formatCurrency(topDeals[0].price)}`);
    console.log(`  ✓ #${topDeals.length} deal: ${topDeals[topDeals.length - 1].grossYield}% yield at ${formatCurrency(topDeals[topDeals.length - 1].price)}`);
  }
  
  return topDeals;
}

/**
 * Format a listing for JSON output
 * 
 * @param {Object} listing - Full listing object
 * @param {number} rank - Rank position (1-10)
 * @returns {Object} - Cleaned listing for output
 */
function formatDealForOutput(listing, rank) {
  return {
    rank,
    id: listing.id || listing.listingId || `${listing.addressLine1}-${listing.zipCode}`,
    address: listing.formattedAddress || listing.addressLine1,
    city: listing.city,
    state: listing.state,
    zipCode: listing.zipCode,
    price: listing.price,
    bedrooms: listing.bedrooms,
    bathrooms: listing.bathrooms,
    squareFootage: listing.squareFootage,
    yearBuilt: listing.yearBuilt,
    propertyType: listing.propertyType,
    
    // Investment Metrics
    estMonthlyRent: listing.rentEstimate,
    estAnnualRent: listing.annualRent,
    grossYield: listing.grossYield,
    estMonthlyCashFlow: listing.monthlyCashFlow,
    grm: listing.grm,
    meetsOnePercentRule: listing.meetsOnePercentRule,
    
    // Rent estimate range
    rentRangeLow: listing.rentRangeLow,
    rentRangeHigh: listing.rentRangeHigh,
    
    // Listing info
    daysOnMarket: listing.daysOnMarket,
    listingDate: listing.listingDate,
    primaryPhoto: listing.primaryPhoto || listing.photos?.[0] || null,
    listingUrl: listing.listingUrl || null,
    
    // Market identifier
    marketId: listing.marketId,
    marketName: listing.marketName,
  };
}

/**
 * Create the final output object for a market
 * 
 * @param {Array} deals - Array of top deals
 * @param {Object} market - Market configuration
 * @returns {Object} - Output object with metadata
 */
function createMarketOutput(deals, market) {
  const formattedDeals = deals.map((deal, index) => formatDealForOutput(deal, index + 1));
  
  // Calculate summary stats
  const avgYield = deals.length > 0 
    ? Math.round((deals.reduce((sum, d) => sum + d.grossYield, 0) / deals.length) * 10) / 10
    : 0;
  
  const avgPrice = deals.length > 0
    ? Math.round(deals.reduce((sum, d) => sum + d.price, 0) / deals.length)
    : 0;
  
  const avgRent = deals.length > 0
    ? Math.round(deals.reduce((sum, d) => sum + d.rentEstimate, 0) / deals.length)
    : 0;

  return {
    market: {
      id: market.id,
      name: market.name,
    },
    lastUpdated: new Date().toISOString(),
    summary: {
      totalDeals: formattedDeals.length,
      avgGrossYield: avgYield,
      avgPrice: avgPrice,
      avgMonthlyRent: avgRent,
      topYield: formattedDeals.length > 0 ? formattedDeals[0].grossYield : 0,
      lowestPrice: formattedDeals.length > 0 ? Math.min(...formattedDeals.map(d => d.price)) : 0,
    },
    deals: formattedDeals,
  };
}

// Helper function
function formatCurrency(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

module.exports = {
  applyHeuristicFilter,
  selectTopCandidates,
  calculateInvestmentMetrics,
  rankAndSelectTopDeals,
  formatDealForOutput,
  createMarketOutput,
  calculateGrossYield,
};
