// National scan grid for the Storm Chasing target picker. Major metros weighted
// toward the severe-weather corridor (Plains / Midwest / Dixie) but covering every
// region so the live scan can rank the best targets anywhere in the country.
export interface ChaseCity { name: string; state: string; lat: number; lon: number }

export const CHASE_CITIES: ChaseCity[] = [
  // Southern / Central Plains
  { name: "Amarillo", state: "TX", lat: 35.22, lon: -101.83 },
  { name: "Lubbock", state: "TX", lat: 33.58, lon: -101.86 },
  { name: "Midland", state: "TX", lat: 31.997, lon: -102.08 },
  { name: "Abilene", state: "TX", lat: 32.45, lon: -99.73 },
  { name: "Wichita Falls", state: "TX", lat: 33.91, lon: -98.49 },
  { name: "Dallas–Fort Worth", state: "TX", lat: 32.78, lon: -96.80 },
  { name: "San Angelo", state: "TX", lat: 31.46, lon: -100.44 },
  { name: "Austin", state: "TX", lat: 30.27, lon: -97.74 },
  { name: "San Antonio", state: "TX", lat: 29.42, lon: -98.49 },
  { name: "Houston", state: "TX", lat: 29.76, lon: -95.37 },
  { name: "Oklahoma City", state: "OK", lat: 35.47, lon: -97.52 },
  { name: "Tulsa", state: "OK", lat: 36.15, lon: -95.99 },
  { name: "Woodward", state: "OK", lat: 36.43, lon: -99.39 },
  { name: "Wichita", state: "KS", lat: 37.69, lon: -97.34 },
  { name: "Dodge City", state: "KS", lat: 37.75, lon: -100.02 },
  { name: "Topeka", state: "KS", lat: 39.05, lon: -95.69 },
  { name: "Goodland", state: "KS", lat: 39.35, lon: -101.71 },
  // Northern Plains
  { name: "Omaha", state: "NE", lat: 41.26, lon: -95.94 },
  { name: "North Platte", state: "NE", lat: 41.14, lon: -100.76 },
  { name: "Sioux Falls", state: "SD", lat: 43.55, lon: -96.70 },
  { name: "Rapid City", state: "SD", lat: 44.08, lon: -103.23 },
  { name: "Bismarck", state: "ND", lat: 46.81, lon: -100.78 },
  { name: "Fargo", state: "ND", lat: 46.88, lon: -96.79 },
  { name: "Cheyenne", state: "WY", lat: 41.14, lon: -104.82 },
  // Midwest
  { name: "Des Moines", state: "IA", lat: 41.59, lon: -93.62 },
  { name: "Kansas City", state: "MO", lat: 39.10, lon: -94.58 },
  { name: "St. Louis", state: "MO", lat: 38.63, lon: -90.20 },
  { name: "Springfield", state: "MO", lat: 37.21, lon: -93.29 },
  { name: "Minneapolis", state: "MN", lat: 44.98, lon: -93.27 },
  { name: "Chicago", state: "IL", lat: 41.88, lon: -87.63 },
  { name: "Peoria", state: "IL", lat: 40.69, lon: -89.59 },
  { name: "Indianapolis", state: "IN", lat: 39.77, lon: -86.16 },
  // Dixie / Southeast
  { name: "Little Rock", state: "AR", lat: 34.75, lon: -92.29 },
  { name: "Memphis", state: "TN", lat: 35.15, lon: -90.05 },
  { name: "Nashville", state: "TN", lat: 36.16, lon: -86.78 },
  { name: "Jackson", state: "MS", lat: 32.30, lon: -90.18 },
  { name: "Shreveport", state: "LA", lat: 32.53, lon: -93.75 },
  { name: "New Orleans", state: "LA", lat: 29.95, lon: -90.07 },
  { name: "Birmingham", state: "AL", lat: 33.52, lon: -86.81 },
  { name: "Huntsville", state: "AL", lat: 34.73, lon: -86.59 },
  { name: "Atlanta", state: "GA", lat: 33.75, lon: -84.39 },
  { name: "Tampa", state: "FL", lat: 27.95, lon: -82.46 },
  { name: "Orlando", state: "FL", lat: 28.54, lon: -81.38 },
  // East
  { name: "Raleigh", state: "NC", lat: 35.78, lon: -78.64 },
  { name: "Columbia", state: "SC", lat: 34.00, lon: -81.03 },
  { name: "Washington", state: "DC", lat: 38.90, lon: -77.04 },
  { name: "Pittsburgh", state: "PA", lat: 40.44, lon: -79.996 },
  { name: "Buffalo", state: "NY", lat: 42.89, lon: -78.88 },
  // West / Mountain
  { name: "Denver", state: "CO", lat: 39.74, lon: -104.99 },
  { name: "Pueblo", state: "CO", lat: 38.25, lon: -104.61 },
  { name: "Albuquerque", state: "NM", lat: 35.08, lon: -106.65 },
  { name: "Phoenix", state: "AZ", lat: 33.45, lon: -112.07 },
  { name: "Billings", state: "MT", lat: 45.79, lon: -108.50 },
  { name: "Boise", state: "ID", lat: 43.62, lon: -116.21 },
  // West Coast
  { name: "Sacramento", state: "CA", lat: 38.58, lon: -121.49 },
  { name: "Fresno", state: "CA", lat: 36.74, lon: -119.77 },
  { name: "Portland", state: "OR", lat: 45.52, lon: -122.68 },
  { name: "Seattle", state: "WA", lat: 47.61, lon: -122.33 },
];
