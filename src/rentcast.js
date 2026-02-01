/**
 * RentCast API Wrapper - v6 Conservative Rent Estimates
 */

const axios = require('axios');
const config = require('./config');

const api = axios.create({
  baseURL: config.api.baseUrl,
  headers: {
    'Accept': 'application/json',
    'X-Api-Key': process.env.RENTCAST_API_KEY,
  },
});

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
let apiCallCount = 0;

const rentalCache = {};

async function getRentalListings(city, state) {
  try {
    const params = {
      city,
      state,
      status: 'Active',
      propertyType: 'Single Family|Multi-Family',
      limit: 500,
    };

    console.log(`  📡 Fetching rental listings for ${city}, ${state}...`);
    
    const response = await api.get('/listings/rental/long-term', { params });
    apiCallCount++;
    
    const listings = response.data || [];
    console.log(`  ✓ Found ${listings.length} rental listings in ${city}`);
    
    await delay(config.api.requestDelay);
    
    return listings;
  } catch (error) {
    console.error(`  ✗ Error fetching rentals for ${city}: ${error.message}`);
    return [];
  }
}

function buildRentTable(rentals, cityName) {
  const rentsByBed = { 2: [], 3: [], 4: [], 5: [] };
  const pricePerSqft = [];
  
  for (const rental of rentals) {
    const beds = rental.bedrooms;
    const price = rental.price;
    const sqft = rental.squareFootage;
    
    if (beds >= 2 && beds <= 5 && price > 500 && price < 5000) {
      rentsByBed[beds].push(price);
      
      if (sqft && sqft > 500) {
        pricePerSqft.push(price / sqft);
      }
    }
  }
  
  const medians = {};
  for (const [beds, prices] of Object.entries(rentsByBed)) {
    if (prices.length > 0) {
      prices.sort((a, b) => a - b);
      const mid = Math.floor(prices.length / 2);
      medians[beds] = prices.length % 2 
        ? prices[mid] 
        : Math.round((prices[mid - 1] + prices[mid]) / 2);
    }
  }
  
  let medianPricePerSqft = null;
  if (pricePerSqft.length > 0) {
    pricePerSqft.sort((a, b) => a - b);
    const mid = Math.floor(pricePerSqft.length / 2);
    medianPricePerSqft = pricePerSqft.length % 2 
      ? pricePerSqft[mid] 
      : (pricePerSqft[mid - 1] + pricePerSqft[mid]) / 2;
    medianPricePerSqft = Math.round(medianPricePerSqft * 100) / 100;
  }
  
  console.log(`  📐 ${cityName} price/sqft: $${medianPricePerSqft || 'N/A'} (from ${pricePerSqft.length} rentals)`);
  
  return { medians, pricePerSqft: medianPricePerSqft };
}

/**
 * Conservative rent estimate based on Taylor's local knowledge:
 * - 1500 sqft = $1,550/mo
 * - 2000 sqft = $2,000/mo
 * - 2500 sqft = $2,200/mo (MFH only)
 * - 3000 sqft = $2,500/mo (MFH only)
 */
function getRentEstimate(city, bedrooms, sqft, rentTable, propertyType) {
  const beds = Math.min(Math.max(bedrooms || 3, 2), 5);
  const isMFH = propertyType && propertyType.toLowerCase().includes('multi');
  
  if (sqft && sqft > 500) {
    let estimate;
    
    if (sqft <= 1500) {
      // Under 1500 sqft: ~$1.03/sqft
      estimate = Math.round(sqft * 1.03);
    } else if (sqft <= 2000) {
      // 1500-2000 sqft: $1,550 base + $0.90/sqft for overage
      estimate = 1550 + Math.round((sqft - 1500) * 0.90);
    } else if (isMFH && sqft <= 2500) {
      // 2000-2500 sqft (MFH only): $2,000 base + $0.40/sqft
      estimate = 2000 + Math.round((sqft - 2000) * 0.40);
    } else if (isMFH) {
      // 2500+ sqft (MFH only): $2,200 base + $0.60/sqft, cap at $2,800
      estimate = 2200 + Math.round((sqft - 2500) * 0.60);
      estimate = Math.min(estimate, 2800);
    } else {
      // SFH over 2000 sqft shouldn't reach here (filtered out), but fallback
      estimate = 2000;
    }
    
    // Sanity bounds
    estimate = Math.max(800, Math.min(estimate, 2800));
    return estimate;
  }
  
  // Fallback to bedroom median
  let baseRent = rentTable.medians?.[beds];
  
  if (!baseRent) {
    const defaults = { 2: 1200, 3: 1550, 4: 1850, 5: 2100 };
    baseRent = defaults[beds];
  }
  
  return Math.min(Math.max(baseRent, 800), 2400);
}

async function getListings(city, state) {
  try {
    const params = {
      city,
      state,
      status: config.filters.status,
      propertyType: config.filters.propertyTypes.join('|'),
      price: `${config.filters.minPrice}:${config.filters.maxPrice}`,
      bedrooms: `${config.filters.minBedrooms}:*`,
      limit: config.filters.limitPerCity,
    };

    console.log(`  📡 Fetching sale listings for ${city}, ${state}...`);
    
    const response = await api.get('/listings/sale', { params });
    apiCallCount++;
    
    const listings = response.data || [];
    console.log(`  ✓ Found ${listings.length} sale listings in ${city}`);
    
    await delay(config.api.requestDelay);
    
    return listings;
  } catch (error) {
    console.error(`  ✗ Error fetching ${city}: ${error.message}`);
    return [];
  }
}

async function getListingsForMarket(market) {
  console.log(`\n🏘️  Fetching data for ${market.name}...`);
  
  console.log(`\n📊 Building rent estimates from active rentals...`);
  for (const location of market.cities) {
    const rentals = await getRentalListings(location.city, location.state);
    const rentTable = buildRentTable(rentals, location.city);
    rentalCache[location.city] = rentTable;
    
    const entries = Object.entries(rentTable.medians);
    if (entries.length > 0) {
      console.log(`  💰 ${location.city} medians: ${entries.map(([b, r]) => `${b}br=$${r}`).join(', ')}`);
    }
  }
  
  let allListings = [];
  
  for (const location of market.cities) {
    const listings = await getListings(location.city, location.state);
    
    const enrichedListings = listings.map(listing => ({
      ...listing,
      marketId: market.id,
      marketName: market.name,
    }));
    
    allListings = allListings.concat(enrichedListings);
  }
  
  console.log(`  📊 Total sale listings for ${market.name}: ${allListings.length}`);
  return allListings;
}

async function enrichWithRentEstimates(properties, progressCallback) {
  console.log(`\n💰 Calculating rent estimates for ${properties.length} properties...`);
  console.log(`  ℹ️  Using conservative model: 1500sqft=$1550, 2000sqft=$2000`);
  
  const enriched = [];
  
  for (let i = 0; i < properties.length; i++) {
    const property = properties[i];
    const rentTable = rentalCache[property.city] || { medians: {}, pricePerSqft: null };
    
    const rentEstimate = getRentEstimate(
      property.city,
      property.bedrooms,
      property.squareFootage,
      rentTable,
      property.propertyType
    );
    
    enriched.push({
      ...property,
      rentEstimate: rentEstimate,
      rentRangeLow: Math.round(rentEstimate * 0.9),
      rentRangeHigh: Math.round(rentEstimate * 1.1),
    });
    
    if ((i + 1) % 10 === 0) {
      console.log(`  ⏳ Processed ${i + 1}/${properties.length}...`);
    }
  }
  
  console.log(`  ✓ Generated rent estimates for ${enriched.length} properties`);
  return enriched;
}

function getApiCallCount() {
  return apiCallCount;
}

function resetApiCallCount() {
  apiCallCount = 0;
}

module.exports = {
  getListings,
  getListingsForMarket,
  enrichWithRentEstimates,
  getApiCallCount,
  resetApiCallCount,
};
