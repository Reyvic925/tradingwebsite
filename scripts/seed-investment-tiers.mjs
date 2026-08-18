// Script to seed initial investment tiers in Supabase
import supabase from '../api-handlers/db-client.js';

const tiers = [
  {
    name: 'Silver',
    tier_level: 1,
    percent_return: 350,
    duration_days: 7,
    min_investment: 500,
    max_investment: 4999,
    roi_min: 15,
    roi_max: 22,
    volatility_min: 5,
    volatility_max: 10,
    simulation_enabled: true,
  },
  {
    name: 'Gold',
    tier_level: 2,
    percent_return: 450,
    duration_days: 10,
    min_investment: 5000,
    max_investment: 19999,
    roi_min: 15,
    roi_max: 22,
    volatility_min: 5,
    volatility_max: 10,
    simulation_enabled: true,
  },
  {
    name: 'Platinum',
    tier_level: 3,
    percent_return: 550,
    duration_days: 15,
    min_investment: 20000,
    max_investment: 49999,
    roi_min: 15,
    roi_max: 22,
    volatility_min: 5,
    volatility_max: 10,
    simulation_enabled: true,
  },
  {
    name: 'Diamond',
    tier_level: 4,
    percent_return: 650,
    duration_days: 21,
    min_investment: 50000,
    max_investment: 1000000,
    roi_min: 15,
    roi_max: 22,
    volatility_min: 5,
    volatility_max: 10,
    simulation_enabled: true,
  },
];

async function seedTiers() {
  try {
    console.log('Seeding investment tiers...');

    for (const tier of tiers) {
      const { data: existing } = await supabase
        .from('investment_tiers')
        .select('*')
        .eq('name', tier.name)
        .limit(1);

      if (existing && existing.length > 0) {
        console.log(`Tier "${tier.name}" already exists, skipping...`);
        continue;
      }

      const { error } = await supabase.from('investment_tiers').insert(tier);
      if (error) {
        console.error(`Error seeding tier "${tier.name}":`, error);
      } else {
        console.log(`✓ Seeded tier: ${tier.name}`);
      }
    }

    console.log('Tier seeding complete!');
  } catch (err) {
    console.error('Seeding error:', err);
  }
}

seedTiers();
