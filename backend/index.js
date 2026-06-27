'use strict';

/**
 * The Freedom Trail API — a single Lambda that routes all HTTP API requests.
 *
 * Uses only the AWS SDK v3, which is bundled into the Lambda Node.js 20
 * runtime, so this folder can be zipped and deployed with no `npm install`.
 *
 * Challenge types:
 *   honor   — guest taps to complete (toggle on/off).
 *   trivia  — guest submits an answer; matched server-side (answers never leave Lambda).
 *   peer    — guest requests a witness; a *different* guest verifies it.
 *
 * DynamoDB single-table layout (table name from env TABLE_NAME):
 *   Challenge:  PK = "CHALLENGE"   SK = <challengeId>   { title, description, points, order, type, history, answers? }
 *   Profile:    PK = "USER#<sub>"  SK = "PROFILE"       { displayName, email, createdAt }
 *   Completion: PK = "USER#<sub>"  SK = "COMP#<id>"     { challengeId, status, completedAt, ... }
 *
 * A pending peer completion also carries GSI1PK = "PENDING#<id>", GSI1SK = "USER#<sub>"
 * so it can be found via the GSI1 index; those attributes are removed on verify.
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  DeleteCommand,
  QueryCommand,
  ScanCommand,
  UpdateCommand,
} = require('@aws-sdk/lib-dynamodb');

const TABLE_NAME = process.env.TABLE_NAME;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------
const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization,content-type',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
};

function reply(statusCode, body) {
  return { statusCode, headers: CORS_HEADERS, body: JSON.stringify(body) };
}

function getClaims(event) {
  const claims =
    event &&
    event.requestContext &&
    event.requestContext.authorizer &&
    event.requestContext.authorizer.jwt &&
    event.requestContext.authorizer.jwt.claims;
  return claims || null;
}

const userKey = (sub) => `USER#${sub}`;

// Lenient answer matching: ignore case, surrounding space, and punctuation.
function normalizeAnswer(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

async function getChallenge(challengeId) {
  const res = await ddb.send(
    new GetCommand({ TableName: TABLE_NAME, Key: { PK: 'CHALLENGE', SK: challengeId } })
  );
  return res.Item || null;
}

// ----------------------------------------------------------------------------
// Profiles
// ----------------------------------------------------------------------------
async function getOrCreateProfile(claims) {
  const sub = claims.sub;
  const existing = await ddb.send(
    new GetCommand({ TableName: TABLE_NAME, Key: { PK: userKey(sub), SK: 'PROFILE' } })
  );
  if (existing.Item) return existing.Item;

  const email = claims.email || '';
  const fallbackName =
    claims.name || (email ? email.split('@')[0] : `Patriot-${sub.slice(0, 6)}`);
  const profile = {
    PK: userKey(sub),
    SK: 'PROFILE',
    displayName: fallbackName,
    email,
    createdAt: new Date().toISOString(),
  };
  await ddb.send(new PutCommand({ TableName: TABLE_NAME, Item: profile }));
  return profile;
}

// ----------------------------------------------------------------------------
// Route handlers
// ----------------------------------------------------------------------------

async function listChallenges() {
  const res = await ddb.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: { ':pk': 'CHALLENGE' },
    })
  );
  // IMPORTANT: never expose trivia `answers` to the client.
  const items = (res.Items || [])
    .map((c) => ({
      challengeId: c.SK,
      title: c.title,
      description: c.description,
      points: c.points,
      order: c.order,
      type: c.type || 'honor',
      history: c.history || null,
    }))
    .sort((a, b) => (a.order || 0) - (b.order || 0));
  return reply(200, { challenges: items });
}

async function getMe(claims) {
  const profile = await getOrCreateProfile(claims);
  return reply(200, {
    userId: claims.sub,
    displayName: profile.displayName,
    email: profile.email,
    createdAt: profile.createdAt,
  });
}

async function updateMe(claims, body) {
  const displayName = (body && typeof body.displayName === 'string' ? body.displayName : '').trim();
  if (!displayName) return reply(400, { message: 'displayName is required.' });
  if (displayName.length > 40) {
    return reply(400, { message: 'displayName must be 40 characters or fewer.' });
  }
  await getOrCreateProfile(claims);
  const res = await ddb.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { PK: userKey(claims.sub), SK: 'PROFILE' },
      UpdateExpression: 'SET displayName = :n',
      ExpressionAttributeValues: { ':n': displayName },
      ReturnValues: 'ALL_NEW',
    })
  );
  return reply(200, {
    userId: claims.sub,
    displayName: res.Attributes.displayName,
    email: res.Attributes.email,
  });
}

async function listMyCompletions(claims) {
  const res = await ddb.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: { ':pk': userKey(claims.sub), ':sk': 'COMP#' },
    })
  );
  const completed = (res.Items || []).map((i) => ({
    challengeId: i.challengeId,
    status: i.status || 'complete', // legacy items without status are complete
    completedAt: i.completedAt || null,
  }));
  return reply(200, { completed });
}

// Mark/submit a completion. Behaviour depends on challenge type.
async function completeChallenge(claims, challengeId, body) {
  if (!challengeId) return reply(400, { message: 'challengeId is required.' });
  const challenge = await getChallenge(challengeId);
  if (!challenge) return reply(404, { message: 'Unknown challenge.' });

  const type = challenge.type || 'honor';
  const now = new Date().toISOString();
  const key = { PK: userKey(claims.sub), SK: `COMP#${challengeId}` };

  if (type === 'trivia') {
    const submitted = normalizeAnswer(body && body.answer);
    if (!submitted) return reply(400, { message: 'Please enter an answer.' });
    const accepted = (challenge.answers || []).map(normalizeAnswer);
    const correct = accepted.includes(submitted);
    if (!correct) {
      return reply(200, { challengeId, status: 'incomplete', correct: false });
    }
    await ddb.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: { ...key, challengeId, status: 'complete', completedAt: now },
      })
    );
    return reply(200, { challengeId, status: 'complete', correct: true });
  }

  if (type === 'peer') {
    // Record a pending request that another guest must verify.
    const profile = await getOrCreateProfile(claims);
    await ddb.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          ...key,
          challengeId,
          status: 'pending',
          requestedAt: now,
          displayName: profile.displayName,
          GSI1PK: `PENDING#${challengeId}`,
          GSI1SK: userKey(claims.sub),
        },
      })
    );
    return reply(200, { challengeId, status: 'pending' });
  }

  // honor (default)
  await ddb.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: { ...key, challengeId, status: 'complete', completedAt: now },
    })
  );
  return reply(200, { challengeId, status: 'complete' });
}

async function unmarkComplete(claims, challengeId) {
  if (!challengeId) return reply(400, { message: 'challengeId is required.' });
  await ddb.send(new DeleteCommand({ TableName: TABLE_NAME, Key: { PK: userKey(claims.sub), SK: `COMP#${challengeId}` } }));
  return reply(200, { challengeId, status: 'incomplete' });
}

// List guests awaiting a witness for a peer challenge (excludes the caller).
async function listPending(claims, challengeId) {
  if (!challengeId) return reply(400, { message: 'challengeId is required.' });
  const res = await ddb.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1PK = :pk',
      ExpressionAttributeValues: { ':pk': `PENDING#${challengeId}` },
    })
  );
  const me = userKey(claims.sub);
  const pending = (res.Items || [])
    .filter((i) => i.GSI1SK !== me) // can't verify yourself
    .map((i) => ({
      userId: (i.GSI1SK || '').replace('USER#', ''),
      displayName: i.displayName || 'Anonymous Patriot',
      requestedAt: i.requestedAt || null,
    }));
  return reply(200, { pending });
}

// Confirm another guest's pending peer completion.
async function verifyCompletion(claims, challengeId, targetUserId) {
  if (!challengeId || !targetUserId) {
    return reply(400, { message: 'challengeId and userId are required.' });
  }
  if (targetUserId === claims.sub) {
    return reply(400, { message: 'You cannot verify your own challenge.' });
  }
  const now = new Date().toISOString();
  try {
    await ddb.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { PK: userKey(targetUserId), SK: `COMP#${challengeId}` },
        // Only verify items that are currently pending.
        ConditionExpression: '#s = :pending',
        UpdateExpression:
          'SET #s = :complete, completedAt = :now, verifiedBy = :by REMOVE GSI1PK, GSI1SK',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: {
          ':pending': 'pending',
          ':complete': 'complete',
          ':now': now,
          ':by': claims.sub,
        },
      })
    );
  } catch (err) {
    if (err.name === 'ConditionalCheckFailedException') {
      return reply(409, { message: 'That request is no longer pending verification.' });
    }
    throw err;
  }
  return reply(200, { challengeId, userId: targetUserId, status: 'complete' });
}

async function getLeaderboard() {
  const profiles = {};
  const points = {};
  const counts = {};
  const lastAt = {};
  const challengePoints = {};

  let lastKey;
  const allItems = [];
  do {
    const res = await ddb.send(new ScanCommand({ TableName: TABLE_NAME, ExclusiveStartKey: lastKey }));
    allItems.push(...(res.Items || []));
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);

  for (const item of allItems) {
    if (item.PK === 'CHALLENGE') challengePoints[item.SK] = item.points || 0;
  }
  for (const item of allItems) {
    if (typeof item.PK === 'string' && item.PK.startsWith('USER#')) {
      const sub = item.PK.slice('USER#'.length);
      if (item.SK === 'PROFILE') {
        profiles[sub] = item.displayName || 'Anonymous Patriot';
      } else if (typeof item.SK === 'string' && item.SK.startsWith('COMP#')) {
        // Only fully completed challenges count (pending peer requests do not).
        const status = item.status || 'complete';
        if (status !== 'complete') continue;
        const pts = challengePoints[item.challengeId] || 0;
        points[sub] = (points[sub] || 0) + pts;
        counts[sub] = (counts[sub] || 0) + 1;
        if (!lastAt[sub] || (item.completedAt || '') > lastAt[sub]) {
          lastAt[sub] = item.completedAt || '';
        }
      }
    }
  }

  const board = Object.keys(counts)
    .map((sub) => ({
      displayName: profiles[sub] || 'Anonymous Patriot',
      points: points[sub] || 0,
      completed: counts[sub] || 0,
      lastCompletedAt: lastAt[sub] || null,
    }))
    .sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      return (a.lastCompletedAt || '').localeCompare(b.lastCompletedAt || '');
    })
    .map((row, idx) => ({ rank: idx + 1, ...row }));

  return reply(200, { leaderboard: board });
}

// ----------------------------------------------------------------------------
// Router
// ----------------------------------------------------------------------------
exports.handler = async (event) => {
  try {
    const routeKey = event.routeKey || `${event.requestContext?.http?.method} ${event.rawPath}`;
    const method = event.requestContext?.http?.method;
    if (method === 'OPTIONS') return reply(204, {});

    let body = {};
    if (event.body) {
      try {
        body = JSON.parse(
          event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body
        );
      } catch {
        return reply(400, { message: 'Invalid JSON body.' });
      }
    }

    const params = event.pathParameters || {};

    // Public routes
    if (routeKey === 'GET /challenges') return await listChallenges();
    if (routeKey === 'GET /leaderboard') return await getLeaderboard();

    // Authenticated routes
    const claims = getClaims(event);
    if (!claims || !claims.sub) return reply(401, { message: 'Unauthorized.' });

    switch (routeKey) {
      case 'GET /me':
        return await getMe(claims);
      case 'PUT /me':
        return await updateMe(claims, body);
      case 'GET /me/completions':
        return await listMyCompletions(claims);
      case 'POST /me/completions/{challengeId}':
        return await completeChallenge(claims, params.challengeId, body);
      case 'DELETE /me/completions/{challengeId}':
        return await unmarkComplete(claims, params.challengeId);
      case 'GET /challenges/{challengeId}/pending':
        return await listPending(claims, params.challengeId);
      case 'POST /challenges/{challengeId}/verify/{userId}':
        return await verifyCompletion(claims, params.challengeId, params.userId);
      default:
        return reply(404, { message: `No route for ${routeKey}.` });
    }
  } catch (err) {
    console.error('Handler error:', err);
    return reply(500, { message: 'Internal server error.' });
  }
};
