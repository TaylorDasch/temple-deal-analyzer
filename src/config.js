/**
 * Configuration for the Temple/Belton Deal Analyzer
 * 
 * Adjust these values based on your investment criteria
 */

module.exports = {
  // RentCast API Configuration
  api: {
    baseUrl: 'https://api.rentcast.io/v1',
    // API key will be loaded from environment variable
    requestDelay: 250, // ms between requests (to respect rate limits)
  },

  // Market Definitions
  // Each market will get its own "Top 10" list
  markets: [
    {
      id: 'temple-belton',
      name: 'Temple / Belton',
      cities: [
        { city: 'Temple', state: 'TX' },
        { city: 'Belton', state: 'TX' },
      ],
      // Zip codes for reference (API uses city names)
      zipCodes: ['76501', '76502', '76503', '76504', '76513'],
    },
    {
      id: 'harker-heights',
      name: 'Harker Heights',
      cities: [
        { city: 'Harker Heights', state: 'TX' },
      ],
      zipCodes: ['76548'],
    },
    {
      id: 'killeen',
      name: 'Killeen',
      cities: [
        { city: 'Killeen', state: 'TX' },
      ],
      zipCodes: ['76540', '76541', '76542', '76543', '76549'],
    },
  ],

  // Investment Criteria
  filters: {
    // Price range for investment properties
    minPrice: 100000,
    maxPrice: 450000,
    
    // Property types to include
    propertyTypes: ['Single Family', 'Multi-Family'],
    
    // Only active listings
    status: 'Active',
    
    // Minimum beds (typically 3+ for rentals)
    minBedrooms: 2,
    
    // Max listings to fetch per city
    limitPerCity: 500,
  },

  // Analysis Parameters
  analysis: {
    // Minimum gross yield to be considered a "deal"
    minYieldThreshold: 6.0,
    
    // Heuristic rent estimate ($/sqft) for pre-filtering
    // Used before calling the expensive AVM endpoint
    heuristicRentPerSqft: 1.00,
    
    // How many properties to get detailed rent estimates for
    // (This is the expensive API call)
    maxPropertiesToAnalyze: 50,
    
    // How many deals to include in final output
    topDealsCount: 10,
    
    // Texas property tax rate for cash flow estimates
    propertyTaxRate: 0.024, // 2.4%
    
    // Estimated vacancy rate
    vacancyRate: 0.08, // 8%
    
    // Property management fee
    managementFee: 0.10, // 10%
  },

  // Output Configuration
  output: {
    directory: './data',
    files: {
      'temple-belton': 'temple-belton-deals.json',
      'harker-heights': 'harker-heights-deals.json',
      'killeen': 'killeen-deals.json',
    },
  },
};
