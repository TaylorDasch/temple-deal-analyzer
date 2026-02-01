/**
 * RentCast API Wrapper - v4 with Price Per SqFt
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

// Cache for rental data by city
const rentalCache = {};

/**
 * Fetch active rental listings to build rent estimates
 */
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

/**
 * Build rent estimate data from actual rental listings
 * Returns both median by bedroom AND price per sqft
 */
function buildRentTable(rentals, cityName) {
  const rentsByBed = { 2: [], 3: [], 4: [], 5: [] };
  const pricePerSqft = [];
  
  for (const rental of rentals) {
    const beds = rental.bedrooms;
    const price = rental.price;
    const sqft = rental.squareFootage;
    
    if (beds >= 2 && beds <= 5 && price > 500 && price < 5000) {
      rentsByBed[beds].push(price);
      
      // Calculate price per sqft if we have sqft data
      if (sqft && sqft > 500) {
        pricePerSqft.push(price / sqft);
      }
    }
  }
  
  // Calculate median rent for each bedroom count
  const medians = {};
  for (const [beds, prices] of Object.entries(rentsByBed)) {
    if (prices.length > 0) {
      prices.sort((a, b) => a - b);
      const mid = Math.floor(prices.length / 2);
      medians[beds] = prices.length % 2 ? prices[mid] : Math.round((prices[mid - 1] + prices[mid]) / 2);
    }
  }
  
  // Calculate median price per sqft
  let medianPricePerSqft = null;
  if (pricePerSqft.length > 0) {
    pricePerSqft.sort((a, b) => a - b);
    const mid = Math.floor(pricePerSqft.length / 2);
    medianPricePerSqft = pricePerSqft.length % 2 
      ? pricePerSqft[mid] 
      : (pricePerSqft[mid - 1] + pricePerSqft[mid]) / 2;
    medianPricePerSqft = Math.round(medianPricePerSqft * 100) / 100; // Round to 2 decimals
  }
  
  console.log(`  📐 ${cityName} price/sqft: $${medianPricePerSqft || 'N/A'} (from ${pricePerSqft.length} rentals with sqft data)`);
  
  return { medians, pricePerSqft: medianPricePerSqft };
}

/**
 * Get rent estimate - prefer $/sqft, fallback to bedroom median
 */
function getRentEstimate(city, bedrooms, sqft, rentTable) {
  const beds = Math.min(Math.max(bedrooms || 3, 2), 5);
  
  // BEST: Use price per sqft if available
  if (rentTable.pricePerSqft && sqft && sqft > 500) {
    const estimate = Math.round(sqft * rentTable.pricePerSqft);
    // Sanity check - rent should be between $800 and $3500
    if (estimate >= 800 && estimate <= 3500) {
      return estimate;
    }
  }
  
  // FALLBACK: Use bedroom median with sqft adjustment
  let baseRent = rentTable.medians?.[beds];
  
  if (!baseRent) {
    const defaults = { 2: 1200, 3: 1550, 4: 1850, 5: 2100 };
    baseRent = defaults[beds];
  }
  
  // Adjust based on sqft
  const typicalSqft = { 2: 1100, 3: 1500, 4: 1900, 5: 2300 };
  if (sqft && sqft > 0) {
    const sqftRatio = sqft / typicalSqft[beds];
    baseRent = Math.round(baseRent * sqftRatio);
  }
  
  return Math.min(Math.max(baseRent, 800), 3500);
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
  
  // First, get rental listings to build rent estimates
  console.log(`\n📊 Building rent estimates from active rentals...`);
  for (const location of market.cities) {
    const rentals = await getRentalListings(location.city, location.state);
    const rentTable = buildRentTable(rentals, location.city);
    rentalCache[location.city] = rentTable;
    
    // Log bedroom medians
    const entries = Object.entries(rentTable.medians);
    if (entries.length > 0) {
      console.log(`  💰 ${location.city} medians: ${entries.map(([b, r]) => `${b}br=$${r}`).join(', ')}`);
    }
  }
  
  // Then get sale listings
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

/**
 * Enrich properties with rent estimates from rental comps
 */
async function enrichWithRentEstimates(properties, progressCallback) {
  console.log(`\n💰 Calculating rent estimates for ${properties.length} properties using $/sqft method...`);
  
  const enriched = [];
  let sqftMethodCount = 0;
  let fallbackCount = 0;
  
  for (let i = 0; i < properties.length; i++) {
    const property = properties[i];
    const rentTable = rentalCache[property.city] || { medians: {}, pricePerSqft: null };
    
    const usingSqftMethod = rentTable.pricePerSqft && property.squareFootage > 500;
    if (usingSqftMethod) {
      sqftMethodCount++;
    } else {
      fallbackCount++;
    }
    
    const rentEstimate = getRentEstimate(
      property.city,
      property.bedrooms,
      property.squareFootage,
      rentTable
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
  console.log(`  📐 Method breakdown: ${sqftMethodCount} using $/sqft, ${fallbackCount} using bedroom median`);
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
