'use strict';

/**
 * Seeds the Freedom Trail challenges into DynamoDB.
 *
 * Usage:
 *   cd scripts && npm install
 *   TABLE_NAME=FreedomTrail AWS_REGION=us-east-1 node seed.js
 *
 * Uses your default AWS credentials (same as the AWS CLI / CDK).
 */

const fs = require('fs');
const path = require('path');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand } = require('@aws-sdk/lib-dynamodb');

const TABLE_NAME = process.env.TABLE_NAME || 'FreedomTrail';
const REGION = process.env.AWS_REGION || process.env.CDK_DEFAULT_REGION || 'us-east-1';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }), {
  marshallOptions: { removeUndefinedValues: true },
});

async function main() {
  const file = path.join(__dirname, '..', 'seed', 'challenges.json');
  const challenges = JSON.parse(fs.readFileSync(file, 'utf8'));

  console.log(`Seeding ${challenges.length} challenges into table "${TABLE_NAME}" (${REGION})...`);
  for (const c of challenges) {
    await ddb.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          PK: 'CHALLENGE',
          SK: c.challengeId,
          title: c.title,
          description: c.description,
          points: c.points,
          order: c.order,
          type: c.type || 'honor',
          history: c.history || null,
          // Trivia answers stay server-side and are never returned by the API.
          answers: Array.isArray(c.answers) ? c.answers : undefined,
        },
      })
    );
    console.log(`  - ${c.order}. ${c.title}`);
  }
  console.log('Done. The Freedom Trail is ready.');
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
