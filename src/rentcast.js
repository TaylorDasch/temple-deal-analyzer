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
 * 
 * @param {string} city - City name
 * @param {string} state - State abbreviation
 * @returns {Promise<Array>} - Array of listing objects
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
    
    // Respect rate limits
    await delay(config.api.requestDelay);
    
    return listings;
  } catch (error) {
    console.error(`  ✗ Error fetching ${city}: ${error.message}`);
    if (error.response) {
      console.error(`    Status: ${error.response.status}`);
      console.error(`    Data: ${JSON.stringify(error.response.data)}`);
    }
    return [];
  }
}

/**
 * Get rent estimate for a specific property using AVM
 * 
 * @param {string} address - Full property address
 * @param {number} bedrooms - Number of bedrooms
 * @param {number} bathrooms - Number of bathrooms
 * @param {number} squareFootage - Property square footage
 * @returns {Promise<Object|null>} - Rent estimate object or null
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
    
    // Respect rate limits
    await delay(config.api.requestDelay);
    
    return response.data;
  } catch (error) {
    // Don't log every error to avoid noise - some addresses may not have data
    if (error.response && error.response.status !== 404) {
      console.error(`  ✗ Rent estimate error for ${address}: ${error.message}`);
    }
    return null;
  }
}

/**
 * Fetch listings for all cities in a market
 * 
 * @param {Object} market - Market configuration object
 * @returns {Promise<Array>} - Combined array of all listings
 */
async function getListingsForMarket(market) {
  console.log(`\n🏘️  Fetching listings for ${market.name}...`);
  
  let allListings = [];
  
  for (const location of market.cities) {
    const listings = await getListings(location.city, location.state);
    
    // Add market identifier to each listing
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
 * Get rent estimates for multiple properties with rate limiting
 * 
 * @param {Array} properties - Array of property objects
 * @param {Function} progressCallback - Optional callback for progress updates
 * @returns {Promise<Array>} - Properties enriched with rent estimates
 */
async function enrichWithRentEstimates(properties, progressCallback) {
  console.log(`\n💰 Fetching rent estimates for ${properties.length} properties...`);
  
  const enriched = [];
  
  for (let i = 0; i < properties.length; i++) {
    const property = properties[i];
    
    // Build full address
    const address = [
      property.formattedAddress || property.addressLine1,
      property.city,
      property.state,
      property.zipCode
    ].filter(Boolean).join(', ');
    
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
    }
    
    // Progress update
    if (progressCallback) {
      progressCallback(i + 1, properties.length);
    } else if ((i + 1) % 10 === 0) {
      console.log(`  ⏳ Processed ${i + 1}/${properties.length}...`);
    }
  }
  
  console.log(`  ✓ Got rent estimates for ${enriched.length} properties`);
  return enriched;
}

/**
 * Get the total API call count (for logging/debugging)
 */
function getApiCallCount() {
  return apiCallCount;
}

/**
 * Reset API call counter
 */
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
