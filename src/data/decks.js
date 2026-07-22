// Browse taxonomy shared by the UI and the seed migrations.
//
// This file used to also carry MOCK_DECKS: a ~1000-line offline catalog with
// full slide content, from before the Go API existed. The catalog is now
// backend-primary, and the only thing still reading that array was the login
// screen's blurred backdrop — which used each entry solely as a string to seed
// a random placeholder image. The seeds below replace it.

export const CATEGORIES = [
  { id: 'company-profile', title: 'Company Profiles' },
  { id: 'iconic', title: 'Iconic Pitch Decks' },
  { id: 'design', title: 'Design & Brand' },
  { id: 'engineering', title: 'Engineering & AI' },
  { id: 'strategy', title: 'Startup Strategy' },
  { id: 'keynotes', title: 'Talks & Keynotes' },
]

export const INDUSTRIES = [
  { id: 'tech', title: 'Technology', accent: '#00c6fb', secondary: '#005bea' },
  { id: 'finance', title: 'Finance & Fintech', accent: '#11998e', secondary: '#38ef7d' },
  { id: 'healthcare', title: 'Healthcare', accent: '#ff5f6d', secondary: '#ffc371' },
  { id: 'retail', title: 'Retail & E-commerce', accent: '#f7971e', secondary: '#ffd200' },
  { id: 'media', title: 'Media & Entertainment', accent: '#7f00ff', secondary: '#e100ff' },
  { id: 'mobility', title: 'Mobility & Travel', accent: '#fa709a', secondary: '#fee140' },
  { id: 'education', title: 'Education', accent: '#43e97b', secondary: '#38f9d7' },
  { id: 'enterprise', title: 'Enterprise SaaS', accent: '#4e4376', secondary: '#2b5876' },
  { id: 'fnb', title: 'Food & Beverage', accent: '#ff6b6b', secondary: '#feca57' },
  { id: 'manufacturing', title: 'Manufacturing', accent: '#6c5ce7', secondary: '#a29bfe' },
  { id: 'energy', title: 'Energy & Utilities', accent: '#fdcb6e', secondary: '#e17055' },
  { id: 'agriculture', title: 'Agriculture', accent: '#55efc4', secondary: '#00b894' },
  { id: 'logistics', title: 'Logistics & Supply', accent: '#74b9ff', secondary: '#0984e3' },
  { id: 'realestate', title: 'Construction & Real Estate', accent: '#a29bfe', secondary: '#6c5ce7' },
  { id: 'telecom', title: 'Telecommunications', accent: '#fd79a8', secondary: '#e84393' },
  { id: 'public', title: 'Government & Public Sector', accent: '#636e72', secondary: '#2d3436' },
]

// Seeds for the login screen's decorative "wall of decks". They only need to be
// stable and distinct — each one picks a deterministic placeholder image.
export const LOGIN_BACKDROP_SEEDS = [
  'apple', 'tesla', 'stripe', 'notion', 'airbnb', 'uber',
  'sequoia', 'figma', 'linear', 'vercel', 'spotify', 'netflix',
  'dropbox', 'buffer', 'intercom', 'mixpanel', 'front', 'crew',
  'wework', 'square', 'shopify', 'slack', 'zoom', 'canva',
]
