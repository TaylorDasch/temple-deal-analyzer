/**
 * Deal Analysis Module - v2 with SFH Size Filter
 */

const config = require('./config');

function calculateGrossYield(annualRent, price) {
  if (!price || price === 0) return 0;
  return ((annualRent / price) * 100);
}

function calculateMonthlyCashFlow(monthlyRent, price) {
  const annualTaxes = price * config.analysis.propertyTaxRate;
  const monthlyTaxes = annualTaxes / 12;
  const vacancyLoss = monthlyRent * config.analysis.vacancyRate;
  const managementCost = monthlyRent * config.analysis.managementFee;
  
  const estimatedExpenses = monthlyTaxes + vacancyLoss + managementCost;
  return monthlyRent - estimatedExpenses;
}

/**
 * Stage 1: Apply heuristic filter
 * - Removes properties missing key data
 * - Removes SFH over 2000 sqft (MFH allowed at any size)
 */
function applyHeuristicFilter(listings) {
  console.log(`\n🔍 Stage 1: Applying heuristic filter to ${listings.length} listings...`);
  
  let removedNoData = 0;
  let removedLargeSFH = 0;
  
  const filtered = listings.filter(listing => {
    // Skip if missing required data
    if (!listing.price || !listing.squareFootage) {
      removedNoData++;
      return false;
    }
    
    // Check if it's a Multi-Family property
    const isMFH = listing.propertyType && listing.propertyType.toLowerCase().includes('multi');
    
    // Filter out Single Family homes over 2000 sqft
    if (!isMFH && listing.squareFootage > 2000) {
      removedLargeSFH++;
      return false;
    }
    
    // Estimate rent using conservative heuristic
    let estimatedMonthlyRent;
    if (listing.squareFootage <= 1500) {
      estimatedMonthlyRent = listing.squareFootage * 1.03;
    } else {
      estimatedMonthlyRent = 1550 + (listing.squareFootage - 1500) * 0.90;
    }
    
    const estimatedAnnualRent = estimatedMonthlyRent * 12;
    const heuristicYield = calculateGrossYield(estimatedAnnualRent, listing.price);
    
    return heuristicYield >= config.analysis.minYieldThreshold;
  });
  
  console.log(`  ✓ ${filtered.length} listings passed filter`);
  console.log(`  📋 Removed: ${removedNoData} missing data, ${removedLargeSFH} large SFH (>2000 sqft)`);
  
  return filtered;
}

function selectTopCandidates(listings) {
  console.log(`\n🎯 Stage 2: Selecting top ${config.analysis.maxPropertiesToAnalyze} candidates...`);
  
  const withHeuristicYield = listings.map(listing => {
    let estimatedMonthlyRent;
    if (listing.squareFootage <= 1500) {
      estimatedMonthlyRent = listing.squareFootage * 1.03;
    } else {
      estimatedMonthlyRent = 1550 + (listing.squareFootage - 1500) * 0.90;
    }
    const heuristicYield = calculateGrossYield(estimatedMonthlyRent * 12, listing.price);
    return { ...listing, heuristicYield };
  });
  
  withHeuristicYield.sort((a, b) => b.heuristicYield - a.heuristicYield);
  
  const topCandidates = withHeuristicYield.slice(0, config.analysis.maxPropertiesToAnalyze);
  
  console.log(`  ✓ Selected ${topCandidates.length} candidates`);
  if (topCandidates.length > 0) {
    console.log(`  📈 Heuristic yield range: ${topCandidates[topCandidates.length - 1].heuristicYield.toFixed(1)}% - ${topCandidates[0].heuristicYield.toFixed(1)}%`);
  }
  
  return topCandidates;
}

function calculateInvestmentMetrics(listings) {
  console.log(`\n📊 Stage 3: Calculating investment metrics...`);
  
  return listings.map(listing => {
    const monthlyRent = listing.rentEstimate;
    const annualRent = monthlyRent * 12;
    const grossYield = calculateGrossYield(annualRent, listing.price);
    const monthlyCashFlow = calculateMonthlyCashFlow(monthlyRent, listing.price);
    
    const grm = listing.price / annualRent;
    const onePercentRule = monthlyRent >= (listing.price * 0.01);
    
    return {
      ...listing,
      grossYield: Math.round(grossYield * 10) / 10,
      monthlyCashFlow: Math.round(monthlyCashFlow),
      annualRent,
      grm: Math.round(grm * 10) / 10,
      meetsOnePercentRule: onePercentRule,
    };
  });
}

function rankAndSelectTopDeals(listings) {
  console.log(`\n🏆 Stage 4: Ranking and selecting top ${config.analysis.topDealsCount} deals...`);
  
  const sorted = [...listings].sort((a, b) => b.grossYield - a.grossYield);
  const topDeals = sorted.slice(0, config.analysis.topDealsCount);
  
  if (topDeals.length > 0) {
    console.log(`  ✓ Top deal: ${topDeals[0].grossYield}% yield at ${formatCurrency(topDeals[0].price)}`);
    console.log(`  ✓ #${topDeals.length} deal: ${topDeals[topDeals.length - 1].grossYield}% yield at ${formatCurrency(topDeals[topDeals.length - 1].price)}`);
  }
  
  return topDeals;
}

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
    
    estMonthlyRent: listing.rentEstimate,
    estAnnualRent: listing.annualRent,
    grossYield: listing.grossYield,
    estMonthlyCashFlow: listing.monthlyCashFlow,
    grm: listing.grm,
    meetsOnePercentRule: listing.meetsOnePercentRule,
    
    rentRangeLow: listing.rentRangeLow,
    rentRangeHigh: listing.rentRangeHigh,
    
    daysOnMarket: listing.daysOnMarket,
    listingDate: listing.listingDate,
    primaryPhoto: listing.primaryPhoto || listing.photos?.[0] || null,
    listingUrl: listing.listingUrl || null,
    
    marketId: listing.marketId,
    marketName: listing.marketName,
  };
}

function createMarketOutput(deals, market) {
  const formattedDeals = deals.map((deal, index) => formatDealForOutput(deal, index + 1));
  
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
