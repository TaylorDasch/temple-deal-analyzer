/**
 * RentCast API Wrapper
 * 
 * Handles all interactions with the RentCast API including:
 * - Fetching active sale listings
 * - Getting rent estimates (AVM)
 * - Rate limiting to respect API limits
 */

const axios = require('axios');
const config = require('./config');

// Create axios instance with default config
const api = axios.create({
  baseURL: config.api.baseUrl,
  headers: {
    'Accept': 'application/json',
    'X-Api-Key': process.env.RENTCAST_API_KEY,
  },
});

// Delay helper for rate limiting
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Track API calls for logging
let apiCallCount = 0;

/**
 * Fetch active sale listings for a city
 */
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

    console.log(`  📡 Fetching listings for ${city}, ${state}...`);
    
    const response = await api.get('/listings/sale', { params });
    apiCallCount++;
    
    const listings = response.data || [];
    console.log(`  ✓ Found ${listings.length} listings in ${city}`);
    
    // Debug: Log first listing structure
    if (listings.length > 0) {
      console.log(`  📋 Sample listing fields: ${Object.keys(listings[0]).join(', ')}`);
    }
    
    await delay(config.api.requestDelay);
    
    return listings;
  } catch (error) {
    console.error(`  ✗ Error fetching ${city}: ${error.message}`);
    if (error.response) {
      console.error(`    Status: ${error.response.status}`);
    }
    return [];
  }
}

/**
 * Get rent estimate for a specific property using AVM
 */
async function getRentEstimate(address, bedrooms, bathrooms, squareFootage) {
  try {
    const params = {
      address,
      propertyType: 'Single Family',
      bedrooms: bedrooms || 3,
      bathrooms: bathrooms || 2,
      squareFootage: squareFootage || 1500,
    };

    const response = await api.get('/avm/rent', { params });
    apiCallCount++;
    
    await delay(config.api.requestDelay);
    
    return response.data;
  } catch (error) {
    // Log ALL errors for debugging
    console.error(`  ✗ Rent error for "${address}": ${error.message}`);
    if (error.response) {
      console.error(`    Status: ${error.response.status}, Data: ${JSON.stringify(error.response.data)}`);
    }
    return null;
  }
}

/**
 * Fetch listings for all cities in a market
 */
async function getListingsForMarket(market) {
  console.log(`\n🏘️  Fetching listings for ${market.name}...`);
  
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
  
  console.log(`  📊 Total for ${market.name}: ${allListings.length} listings`);
  return allListings;
}

/**
 * Build proper address string from listing data
 */
function buildAddress(property) {
  // RentCast listings use these field names
  const street = property.formattedAddress || property.addressLine1 || property.address;
  const city = property.city;
  const state = property.state;
  const zip = property.zipCode || property.zip;
  
  // If formattedAddress already contains full address, use it directly
  if (street && street.includes(',') && street.includes(state)) {
    return street;
  }
  
  // Otherwise build it
  return [street, city, state, zip].filter(Boolean).join(', ');
}

/**
 * Get rent estimates for multiple properties with rate limiting
 */
async function enrichWithRentEstimates(properties, progressCallback) {
  console.log(`\n💰 Fetching rent estimates for ${properties.length} properties...`);
  
  // Debug: Show first property structure
  if (properties.length > 0) {
    const first = properties[0];
    console.log(`  📋 First property keys: ${Object.keys(first).join(', ')}`);
    const addr = buildAddress(first);
    console.log(`  📋 First address to query: "${addr}"`);
  }
  
  const enriched = [];
  
  for (let i = 0; i < properties.length; i++) {
    const property = properties[i];
    const address = buildAddress(property);
    
    const rentData = await getRentEstimate(
      address,
      property.bedrooms,
      property.bathrooms,
      property.squareFootage
    );
    
    if (rentData && rentData.rent) {
      enriched.push({
        ...property,
        rentEstimate: rentData.rent,
        rentRangeLow: rentData.rentRangeLow,
        rentRangeHigh: rentData.rentRangeHigh,
      });
      console.log(`  ✓ Got rent $${rentData.rent} for ${address}`);
    }
    
    if ((i + 1) % 10 === 0) {
      console.log(`  ⏳ Processed ${i + 1}/${properties.length}...`);
    }
  }
  
  console.log(`  ✓ Got rent estimates for ${enriched.length} properties`);
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
  getRentEstimate,
  getListingsForMarket,
  enrichWithRentEstimates,
  getApiCallCount,
  resetApiCallCount,
};
