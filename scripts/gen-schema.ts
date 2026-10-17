// zod スキーマから JSON Schema とサンプルを data-template/ に書き出す（npm run schema）
import { writeFileSync } from 'node:fs';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { sampleTrip } from '../src/sample';
import { PlacesFileSchema } from '../src/types/place';
import { TripSchema } from '../src/types/trip';

const schema = zodToJsonSchema(TripSchema, { name: 'Trip', $refStrategy: 'none' });
writeFileSync('data-template/schema/trip.schema.json', JSON.stringify(schema, null, 2) + '\n');

writeFileSync(
  'data-template/schema/places.schema.json',
  JSON.stringify(zodToJsonSchema(PlacesFileSchema, { name: 'PlacesFile', $refStrategy: 'none' }), null, 2) + '\n',
);

const sample = { ...sampleTrip(), id: 'sample-kyoto' };
writeFileSync('data-template/trips/sample-kyoto.json', JSON.stringify(sample, null, 2) + '\n');
console.log('wrote data-template/schema/*.schema.json and trips/sample-kyoto.json');
