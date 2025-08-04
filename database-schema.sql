-- Supabase Database Schema for Idealista Property Data
-- Create this table in your Supabase dashboard or via SQL editor

CREATE TABLE houses (
  id SERIAL PRIMARY KEY,
  
  -- Idealista property identifiers
  property_code INTEGER UNIQUE NOT NULL,
  
  -- Basic property information
  address TEXT DEFAULT '',
  price INTEGER DEFAULT 0,
  operation VARCHAR(10) CHECK (operation IN ('sale', 'rent')) DEFAULT 'sale',
  property_type VARCHAR(20) DEFAULT '',
  
  -- Property details
  size INTEGER, -- Square meters
  rooms INTEGER,
  bathrooms INTEGER,
  floor VARCHAR(10),
  exterior BOOLEAN DEFAULT false,
  
  -- Location data
  latitude DECIMAL(10,8),
  longitude DECIMAL(11,8),
  municipality VARCHAR(100) DEFAULT '',
  district VARCHAR(100) DEFAULT '',
  neighborhood VARCHAR(100) DEFAULT '',
  province VARCHAR(100) DEFAULT '',
  
  -- Property status
  status VARCHAR(20) DEFAULT 'active',
  new_development BOOLEAN DEFAULT false,
  
  -- Scraping metadata
  scraped_at TIMESTAMP DEFAULT NOW(),
  url TEXT DEFAULT '',
  
  -- Indexes for better query performance
  CONSTRAINT unique_property_code UNIQUE (property_code)
);

-- Create indexes for commonly queried fields
CREATE INDEX idx_houses_municipality ON houses(municipality);
CREATE INDEX idx_houses_operation ON houses(operation);
CREATE INDEX idx_houses_property_type ON houses(property_type);
CREATE INDEX idx_houses_price ON houses(price);
CREATE INDEX idx_houses_scraped_at ON houses(scraped_at);
CREATE INDEX idx_houses_location ON houses(latitude, longitude);

-- Create a composite index for common search patterns  
CREATE INDEX idx_houses_search ON houses(municipality, operation, property_type, price);

-- Add Row Level Security (RLS) policies if needed
-- ALTER TABLE houses ENABLE ROW LEVEL SECURITY;

-- Example policy for authenticated users (uncomment if using authentication)
-- CREATE POLICY "Allow authenticated users to read houses" ON houses
--   FOR SELECT
--   TO authenticated
--   USING (true);

-- Example policy for service role (for API operations)
-- CREATE POLICY "Allow service role full access" ON houses
--   FOR ALL
--   TO service_role
--   USING (true);

-- Sample queries for testing:

-- Get all properties in Madrid for sale
-- SELECT * FROM houses 
-- WHERE municipality = 'Madrid' 
--   AND operation = 'sale' 
-- ORDER BY price ASC 
-- LIMIT 10;

-- Get property count by city
-- SELECT municipality, COUNT(*) as property_count
-- FROM houses 
-- GROUP BY municipality 
-- ORDER BY property_count DESC;

-- Get average price by property type in Barcelona
-- SELECT property_type, AVG(price) as avg_price, COUNT(*) as count
-- FROM houses 
-- WHERE municipality = 'Barcelona'
-- GROUP BY property_type
-- ORDER BY avg_price DESC;