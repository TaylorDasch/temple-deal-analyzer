# Temple/Belton Investment Deal Analyzer

Automated system that finds the top 10 highest-yield investment properties in Central Texas markets and publishes them as JSON for display on your website.

## Markets Analyzed

- **Temple / Belton** - Combined market
- **Harker Heights** 
- **Killeen**

## How It Works

1. **Weekly Automation** - GitHub Actions runs every Sunday at 3:00 AM Central
2. **Fetch Listings** - Pulls active sale listings from RentCast API
3. **Funnel Strategy** - Filters using heuristic yield, then gets actual rent estimates
4. **Rank & Output** - Calculates gross yield, sorts, and outputs top 10 deals per market
5. **Auto-Commit** - Results are committed back to repo as JSON files
6. **Frontend Fetch** - Your website fetches the JSON from jsDelivr CDN

## Setup Instructions

### 1. Fork/Clone This Repository

```bash
git clone https://github.com/YOUR_USERNAME/temple-deal-analyzer.git
cd temple-deal-analyzer
npm install
```

### 2. Get Your RentCast API Key

1. Go to [app.rentcast.io/app/api](https://app.rentcast.io/app/api)
2. Select a billing plan (Scale plan recommended: $79/mo)
3. Click "Create API Key"
4. Copy the key

### 3. Add API Key to GitHub Secrets

1. Go to your GitHub repository
2. Click **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Name: `RENTCAST_API_KEY`
5. Value: Paste your API key
6. Click **Add secret**

### 4. Test Locally (Optional)

```bash
RENTCAST_API_KEY=your_key_here npm run analyze
```

### 5. Enable GitHub Actions

1. Go to the **Actions** tab in your repository
2. Click "I understand my workflows, go ahead and enable them"
3. The workflow will run automatically every Sunday, or you can trigger it manually

## Output Files

After running, you'll find these files in `/data/`:

- `temple-belton-deals.json`
- `harker-heights-deals.json`
- `killeen-deals.json`

Each file contains:
```json
{
  "market": { "id": "temple-belton", "name": "Temple / Belton" },
  "lastUpdated": "2025-02-01T08:00:00.000Z",
  "summary": {
    "totalDeals": 10,
    "avgGrossYield": 8.5,
    "avgPrice": 265000,
    "avgMonthlyRent": 1850,
    "topYield": 9.2,
    "lowestPrice": 185000
  },
  "deals": [
    {
      "rank": 1,
      "address": "1234 Mesa Ridge Dr",
      "city": "Temple",
      "price": 245000,
      "estMonthlyRent": 1950,
      "grossYield": 9.2,
      ...
    }
  ]
}
```

## Frontend Integration

Fetch the JSON files from jsDelivr CDN (replace with your GitHub username/repo):

```javascript
const response = await fetch(
  'https://cdn.jsdelivr.net/gh/YOUR_USERNAME/temple-deal-analyzer@main/data/temple-belton-deals.json'
);
const data = await response.json();
```

## Configuration

Edit `src/config.js` to adjust:

- Price range filters
- Minimum yield threshold
- Property types
- Tax rates
- Number of deals to output

## Costs

- **RentCast Scale Plan**: $79/month for 5,000 API requests
- **Estimated Usage**: ~600-800 requests per weekly run (3 markets)
- **GitHub Actions**: Free for public repos

## Troubleshooting

**"No listings found"**
- Check that city names match exactly what RentCast expects
- Verify your API key is valid

**"Could not get rent estimates"**
- Some addresses may not have rent data
- The system will continue with available data

**Action not running**
- Make sure Actions are enabled in your repo settings
- Check the Actions tab for error logs

## License

Private - For use by Taylor Dasch / EG Realty only.
